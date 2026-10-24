/**
 * FormFlow - Content Script Main Coordinator
 * Manages runtime message dispatching between the extension popup and active Google Form,
 * orchestrating the 2-pass execution pipeline and profile auto-fill on page load.
 */

(function () {
  'use strict';

  // Ensure FormFlow namespace
  window.FormFlow = window.FormFlow || {};

  console.log('[FormFlow] Content script initialized on:', window.location.href);

  /**
   * Helper to fetch student profile from chrome.storage.local
   */
  async function getStoredProfile() {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['studentProfile', 'autoFillProfileOnLoad'], res => {
          resolve(res || {});
        });
      } else {
        resolve({});
      }
    });
  }

  /**
   * Helper to scrape active questions using either NPTEL or Google Forms scraper
   */
  function scrapeActiveQuestions() {
    if (window.FormFlow.NptelScraper && window.FormFlow.NptelScraper.isNptelPage()) {
      const nptelQs = window.FormFlow.NptelScraper.scrapeNptelQuestions();
      if (nptelQs && nptelQs.length > 0) {
        return { questions: nptelQs, isNptel: true };
      }
    }
    if (window.FormFlow.Scraper) {
      const formQs = window.FormFlow.Scraper.scrapeFormQuestions();
      return { questions: formQs || [], isNptel: false };
    }
    return { questions: [], isNptel: false };
  }

  /**
   * Auto-fill student profile on initial form load if option is enabled (Google Forms only)
   */
  function checkAndAutoFillProfile() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

    // Do not run on NPTEL pages
    if (window.FormFlow.NptelScraper && window.FormFlow.NptelScraper.isNptelPage()) return;

    chrome.storage.local.get(['studentProfile', 'autoFillProfileOnLoad'], res => {
      if (!res || !res.autoFillProfileOnLoad || !res.studentProfile) return;

      const profile = res.studentProfile;
      const hasAnyValue = Object.values(profile).some(val => typeof val === 'string' && val.trim().length > 0);
      if (!hasAnyValue) return;

      // Give Google Forms a moment to hydrate dynamic DOM
      setTimeout(async () => {
        try {
          const questions = window.FormFlow.Scraper ? window.FormFlow.Scraper.scrapeFormQuestions() : [];
          if (!questions || questions.length === 0) return;

          // Check if any question is already answered
          const plan = window.FormFlow.Matcher.matchProfileOnly(questions, profile);
          const hasMatches = plan.some(item => item.status === 'PROFILE_FILLED');

          if (hasMatches) {
            console.log('[FormFlow] Automatically applying Student Profile on form load...');
            await window.FormFlow.Filler.executeAutofill(questions, plan);
          }
        } catch (e) {
          console.warn('[FormFlow] Auto-fill profile on load skipped:', e.message);
        }
      }, 700);
    });
  }

  // Trigger on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndAutoFillProfile);
  } else {
    checkAndAutoFillProfile();
  }

  // -------------------------------------------------------------------------
  // Runtime Message Listeners
  // -------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action } = request;

    if (action === 'GET_FORM_INFO' || action === 'PING') {
      try {
        const { questions, isNptel } = scrapeActiveQuestions();
        const prefilledCount = questions.filter(q => q.isAlreadyFilled).length;
        const unfilledCount = questions.filter(q => !q.isAlreadyFilled).length;

        const identityCount = isNptel ? 0 : questions.filter(q => {
          if (window.FormFlow.Identity) {
            return window.FormFlow.Identity.classifyIdentityQuestion(q).isIdentity;
          }
          return q.isIdentityField;
        }).length;

        let nptelMenu = null;
        if (isNptel && window.FormFlow.NptelScraper && window.FormFlow.NptelScraper.scanNptelMenu) {
          try {
            nptelMenu = window.FormFlow.NptelScraper.scanNptelMenu();
          } catch (e) {}
        }

        sendResponse({
          success: true,
          isForm: questions.length > 0,
          isNptel: !!isNptel,
          questionCount: questions.length,
          prefilledCount,
          unfilledCount,
          identityCount,
          nptelMenu,
          questions: questions.map(q => ({
            id: q.id,
            index: q.index,
            title: q.title,
            type: q.type,
            optionCount: q.options ? q.options.length : 0,
            isRequired: q.isRequired,
            isAlreadyFilled: q.isAlreadyFilled,
            currentValue: q.currentValue,
            isNptel: !!q.isNptel,
            isIdentityField: isNptel ? false : (window.FormFlow.Identity
              ? window.FormFlow.Identity.classifyIdentityQuestion(q).isIdentity
              : q.isIdentityField)
          }))
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message,
          isForm: false,
          isNptel: false,
          questionCount: 0,
          prefilledCount: 0,
          unfilledCount: 0,
          identityCount: 0,
          nptelMenu: null
        });
      }
      return false;
    }

    if (action === 'SCAN_NPTEL_MENU') {
      try {
        if (window.FormFlow.NptelScraper && window.FormFlow.NptelScraper.scanNptelMenu) {
          const menuInfo = window.FormFlow.NptelScraper.scanNptelMenu();
          sendResponse({ success: true, ...menuInfo });
        } else {
          sendResponse({ success: false, error: 'NPTEL scraper not available' });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }

    if (action === 'FILL_PROFILE_ONLY') {
      (async () => {
        try {
          let profile = request.studentProfile;
          if (!profile) {
            const stored = await getStoredProfile();
            profile = stored.studentProfile || {};
          }

          const questions = window.FormFlow.Scraper.scrapeFormQuestions();
          if (questions.length === 0) {
            sendResponse({
              success: false,
              error: 'No active Google Form questions detected on this page.'
            });
            return;
          }

          const matchPlan = window.FormFlow.Matcher.matchProfileOnly(questions, profile);
          const executionResult = await window.FormFlow.Filler.executeAutofill(questions, matchPlan);

          sendResponse({
            success: true,
            isProfileOnly: true,
            ...executionResult
          });
        } catch (err) {
          console.error('[FormFlow] Profile fill error:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();

      return true;
    }

    if (action === 'FILL_FORM') {
      const { rawAnswers, mode, skipFilledQuestions = true } = request;

      (async () => {
        try {
          const userAnswers = window.FormFlow.Parser.parseInputLines(rawAnswers);
          if (userAnswers.length === 0) {
            sendResponse({
              success: false,
              error: 'No valid answers detected. Please paste at least one line.'
            });
            return;
          }

          const { questions, isNptel } = scrapeActiveQuestions();
          if (questions.length === 0) {
            sendResponse({
              success: false,
              error: 'No active assessment question containers detected on this page.'
            });
            return;
          }

          // Retrieve student profile for Pass 1 resolution (ignored if on NPTEL)
          let profile = request.studentProfile;
          if (!isNptel) {
            const hasProfileValues = profile && Object.values(profile).some(v => typeof v === 'string' && v.trim().length > 0);
            if (!hasProfileValues) {
              const stored = await getStoredProfile();
              profile = stored.studentProfile || null;
            } else {
              const stored = await getStoredProfile();
              if (stored && stored.studentProfile) {
                profile = { ...stored.studentProfile, ...profile };
              }
            }
          } else {
            profile = null;
          }

          let matchPlan;
          if (mode === 'smart_shuffle') {
            matchPlan = window.FormFlow.Matcher.matchSmartShuffle(questions, userAnswers, skipFilledQuestions, profile);
          } else {
            // Sequential mapping with 2-pass profile identity resolution (or direct 1:1 on NPTEL)
            matchPlan = window.FormFlow.Matcher.matchSequential(questions, userAnswers, true, skipFilledQuestions, profile);
          }

          const executionResult = await window.FormFlow.Filler.executeAutofill(questions, matchPlan);

          sendResponse({
            success: true,
            mode,
            isNptel,
            skipFilledQuestions,
            parsedAnswersCount: userAnswers.length,
            ...executionResult
          });
        } catch (err) {
          console.error('[FormFlow] Autofill error:', err);
          sendResponse({
            success: false,
            error: err.message || 'An error occurred during autofill execution'
          });
        }
      })();

      return true;
    }

    if (action === 'EXPORT_PDF') {
      (async () => {
        try {
          if (!window.FormFlow.PdfExporter) {
            throw new Error('FormFlow PDF Exporter module not loaded.');
          }
          const highlightSelected = request.highlightSelected !== undefined ? request.highlightSelected : true;
          const result = await window.FormFlow.PdfExporter.exportQuizToPdf({
            highlightSelected
          });
          sendResponse({ success: true, ...result });
        } catch (err) {
          console.error('[FormFlow] PDF export error:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (action === 'UNDO_FILL') {
      try {
        const preserveProfile = request.preserveProfile !== undefined ? request.preserveProfile : true;
        const undoRes = window.FormFlow.Filler.undoAutofill(preserveProfile);
        sendResponse(undoRes);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return false;
    }

    if (action === 'SCROLL_TO_QUESTION') {
      const { questionId } = request;
      const ok = window.FormFlow.Filler.scrollToQuestion(questionId);
      sendResponse({ success: ok });
      return false;
    }

    return false;
  });
})();
