/**
 * FormFlow - Content Script Main Coordinator
 * Manages runtime message dispatching between the extension popup and active Google Form.
 */

(function () {
  'use strict';

  // Ensure FormFlow namespace
  window.FormFlow = window.FormFlow || {};

  console.log('[FormFlow] Content script initialized on:', window.location.href);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action } = request;

    if (action === 'GET_FORM_INFO' || action === 'PING') {
      try {
        const questions = window.FormFlow.Scraper.scrapeFormQuestions();
        const prefilledCount = questions.filter(q => q.isAlreadyFilled).length;
        const unfilledCount = questions.filter(q => !q.isAlreadyFilled).length;
        const identityCount = questions.filter(q => q.isIdentityField).length;

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
            isIdentityField: q.isIdentityField
          }))
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message,
          isForm: false,
          questionCount: 0,
          prefilledCount: 0,
          unfilledCount: 0
        });
      }
      return true; // Keep message channel open for async response
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

          let matchPlan;
          if (mode === 'smart_shuffle') {
            matchPlan = window.FormFlow.Matcher.matchSmartShuffle(questions, userAnswers, skipFilledQuestions);
          } else {
            // Sequential with automatic fallback and pre-filled skip enabled
            matchPlan = window.FormFlow.Matcher.matchSequential(questions, userAnswers, true, skipFilledQuestions);
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

      return true; // Asynchronous sendResponse
    }

    if (action === 'UNDO_FILL') {
      try {
        const undoRes = window.FormFlow.Filler.undoAutofill();
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
