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
   * Auto-fill student profile on initial form load if option is enabled
   */
  function checkAndAutoFillProfile() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(['studentProfile', 'autoFillProfileOnLoad'], res => {
      if (!res || !res.autoFillProfileOnLoad || !res.studentProfile) return;

      const profile = res.studentProfile;
      const hasAnyValue = Object.values(profile).some(val => typeof val === 'string' && val.trim().length > 0);
      if (!hasAnyValue) return;

      // Give Google Forms a moment to hydrate dynamic DOM
      setTimeout(async () => {
        try {
          const questions = window.FormFlow.Scraper.scrapeFormQuestions();
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
        const questions = window.FormFlow.Scraper.scrapeFormQuestions();
        const prefilledCount = questions.filter(q => q.isAlreadyFilled).length;
        const unfilledCount = questions.filter(q => !q.isAlreadyFilled).length;

        const identityCount = questions.filter(q => {
          if (window.FormFlow.Identity) {
            return window.FormFlow.Identity.classifyIdentityQuestion(q).isIdentity;
          }
          return q.isIdentityField;
        }).length;

        sendResponse({
          success: true,
          isForm: questions.length > 0,
          questionCount: questions.length,
          prefilledCount,
          unfilledCount,
          identityCount,
          questions: questions.map(q => ({
            id: q.id,
            index: q.index,
            title: q.title,
            type: q.type,
            optionCount: q.options ? q.options.length : 0,
            isRequired: q.isRequired,
            isAlreadyFilled: q.isAlreadyFilled,
            currentValue: q.currentValue,
            isIdentityField: window.FormFlow.Identity
              ? window.FormFlow.Identity.classifyIdentityQuestion(q).isIdentity
              : q.isIdentityField
          }))
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message,
          isForm: false,
          questionCount: 0,
          prefilledCount: 0,
          unfilledCount: 0,
          identityCount: 0
        });
      }
      return true;
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

          const questions = window.FormFlow.Scraper.scrapeFormQuestions();
          if (questions.length === 0) {
            sendResponse({
              success: false,
              error: 'No active Google Form question containers detected on this page.'
            });
            return;
          }

          // Retrieve student profile for Pass 1 resolution
          let profile = request.studentProfile;
          if (!profile) {
            const stored = await getStoredProfile();
            profile = stored.studentProfile || null;
          }

          let matchPlan;
          if (mode === 'smart_shuffle') {
            matchPlan = window.FormFlow.Matcher.matchSmartShuffle(questions, userAnswers, skipFilledQuestions, profile);
          } else {
            // Sequential mapping with 2-pass profile identity resolution
            matchPlan = window.FormFlow.Matcher.matchSequential(questions, userAnswers, true, skipFilledQuestions, profile);
          }

          const executionResult = await window.FormFlow.Filler.executeAutofill(questions, matchPlan);

          sendResponse({
            success: true,
            mode,
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

    if (action === 'UNDO_FILL') {
      try {
        const preserveProfile = request.preserveProfile !== undefined ? request.preserveProfile : true;
        const undoRes = window.FormFlow.Filler.undoAutofill(preserveProfile);
        sendResponse(undoRes);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (action === 'SCROLL_TO_QUESTION') {
      const { questionId } = request;
      const ok = window.FormFlow.Filler.scrollToQuestion(questionId);
      sendResponse({ success: ok });
      return true;
    }

    return false;
  });
})();
