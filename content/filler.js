/**
 * FormFlow - Synthetic Event Dispatcher & DOM Filler
 * Interacts with Google Forms' Wiz/Closure architecture, injects visual badges, and manages undo state.
 */

(function () {
  'use strict';

  window.FormFlow = window.FormFlow || {};

  // Store history snapshot for 1-click Undo
  let lastExecutionSnapshot = null;

  /**
   * Helper to sleep asynchronously
   */
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Dispatches input events using native prototype setters for bulletproof Wiz/Closure state registration
   */
  function fillTextInput(input, text) {
    if (!input) return;

    input.focus();

    // Use native prototype setter to bypass React/Closure internal value trackers
    const prototype = Object.getPrototypeOf(input);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter) {
      prototypeValueSetter.call(input, text);
    } else {
      input.value = text;
    }

    // Dispatch synthetic events
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    input.blur();
  }

  /**
   * Clicks a radio or checkbox element safely
   */
  function clickChoiceElement(el) {
    if (!el) return;

    el.focus();
    el.click();

    // Additional synthetic events to ensure listeners fire
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Handles opening a Google Form dropdown menu, locating the target option, and selecting it
   */
  async function fillDropdown(trigger, targetValue, targetElement) {
    if (!trigger) return false;

    // If we already have the element and it's visible, click it directly
    if (targetElement && targetElement.offsetParent !== null) {
      targetElement.click();
      return true;
    }

    // Step 1: Click the listbox container to trigger the dropdown popup menu
    trigger.click();
    await wait(200);

    // Step 2: Google Forms attaches the options menu into a portal or directly under body/listbox
    const openOptions = Array.from(document.querySelectorAll('div[role="option"]'));
    const cleanTarget = (targetValue || '').trim().toLowerCase();

    // Try finding option by data-value or text
    let targetOption = openOptions.find(opt => {
      const val = (opt.getAttribute('data-value') || '').trim().toLowerCase();
      const txt = (opt.innerText || '').trim().toLowerCase();
      return val === cleanTarget || txt === cleanTarget || txt.includes(cleanTarget);
    });

    if (targetOption) {
      targetOption.click();
      await wait(100);
      return true;
    } else {
      // Close dropdown by pressing Escape or clicking trigger
      trigger.click();
      return false;
    }
  }

  /**
   * Injects or updates an in-page visual indicator pill badge on the question card
   */
  function injectVisualIndicator(container, matchResult) {
    if (!container) return;

    // Remove any existing badge
    const existingBadge = container.querySelector('.formflow-pill');
    if (existingBadge) {
      existingBadge.remove();
    }

    const badge = document.createElement('div');
    badge.className = 'formflow-pill';

    if (matchResult.status === 'EXACT') {
      badge.classList.add('formflow-pill-exact');
      badge.innerHTML = `
        <svg class="formflow-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
        </svg>
        <span>Filled (Exact)</span>
      `;
      badge.title = `Matched: "${matchResult.matchedValue}"`;
    } else if (matchResult.status === 'FUZZY') {
      badge.classList.add('formflow-pill-fuzzy');
      const pct = Math.round(matchResult.score * 100);
      badge.innerHTML = `
        <svg class="formflow-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2.5 7.75A.75.75 0 013.25 7h9.5a.75.75 0 010 1.5h-9.5A.75.75 0 012.5 7.75zm0-3A.75.75 0 013.25 4h9.5a.75.75 0 010 1.5h-9.5A.75.75 0 012.5 4.75zm0 6A.75.75 0 013.25 10h9.5a.75.75 0 010 1.5h-9.5a.75.75 0 01-.75-.75z"/>
        </svg>
        <span>Filled (${pct}% Match)</span>
      `;
      badge.title = `Matched: "${matchResult.matchedValue}" (${pct}% confidence)`;
    } else if (matchResult.status === 'PROFILE_FILLED') {
      badge.classList.add('formflow-pill-profile');
      badge.innerHTML = `
        <svg class="formflow-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm2-3a2 2 0 11-4 0 2 2 0 014 0zm4 8c0-2.21-3.58-4-6-4s-6 1.79-6 4v1h12v-1zm-1.07 0H3.07C3.59 11.83 5.76 11 8 11s4.41.83 4.93 2z"/>
        </svg>
        <span>👤 Profile Filled</span>
      `;
      badge.title = `Auto-filled from Student Profile: "${matchResult.matchedValue}"`;
    } else if (matchResult.status === 'SKIPPED_PREFILLED') {
      badge.classList.add('formflow-pill-prefilled');
      badge.innerHTML = `
        <svg class="formflow-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M12.78 4.22a.75.75 0 00-1.06 0L8.25 7.69V2.75a.75.75 0 00-1.5 0v6.5c0 .414.336.75.75.75h6.5a.75.75 0 000-1.5H9.06l3.72-3.72a.75.75 0 000-1.06z"/>
        </svg>
        <span>↷ Skipped (Pre-filled)</span>
      `;
      badge.title = `Field was already answered: "${matchResult.matchedValue || matchResult.userAnswer}". Preserved by FormFlow.`;
    } else if (matchResult.status === 'UNMATCHED') {
      badge.classList.add('formflow-pill-unmatched');
      badge.innerHTML = `
        <svg class="formflow-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
        </svg>
        <span>Action Needed</span>
      `;
      badge.title = `No answer matched with sufficient confidence. Manual input required.`;
    } else {
      badge.classList.add('formflow-pill-skipped');
      badge.innerHTML = `<span>— Skipped</span>`;
      badge.title = `No answer supplied for this field`;
    }

    container.appendChild(badge);
  }

  /**
   * Executes the autofill plan across all questions on the page
   */
  async function executeAutofill(questions, matchPlan) {
    const snapshot = {
      timestamp: Date.now(),
      textInputs: [],
      choiceInputs: []
    };

    const auditLog = [];

    for (let i = 0; i < matchPlan.length; i++) {
      const planItem = matchPlan[i];
      const q = questions[planItem.questionIndex];
      if (!q) continue;

      let fillSuccess = false;

      // DO NOT TOUCH PRE-FILLED QUESTIONS
      if (planItem.status === 'SKIPPED_PREFILLED') {
        fillSuccess = false;
        // Do not alter or record into snapshot
      }

      // 1. Text Inputs
      else if (q.type === 'text' || q.type === 'textarea') {
        if (q.inputElement && planItem.userAnswer) {
          snapshot.textInputs.push({
            element: q.inputElement,
            previousValue: q.inputElement.value,
            isProfileField: !!planItem.isProfileField
          });

          fillTextInput(q.inputElement, planItem.userAnswer);
          fillSuccess = true;
        }
      }

      // 2. Choice Inputs (Radio / Checkbox)
      else if (q.type === 'radio' || q.type === 'checkbox' || q.type === 'grid') {
        if (planItem.targetElements && planItem.targetElements.length > 0) {
          for (const el of planItem.targetElements) {
            const wasChecked = el.getAttribute('aria-checked') === 'true';
            snapshot.choiceInputs.push({
              element: el,
              previousState: wasChecked,
              isProfileField: !!planItem.isProfileField
            });

            if (!wasChecked) {
              clickChoiceElement(el);
            }
          }
          fillSuccess = true;
        }
      }

      // 3. Dropdown (listbox)
      else if (q.type === 'dropdown') {
        if (planItem.status !== 'UNMATCHED' && planItem.status !== 'SKIPPED' && planItem.status !== 'SKIPPED_PREFILLED') {
          const success = await fillDropdown(
            planItem.dropdownTrigger || q.listbox,
            planItem.matchedValue,
            planItem.targetElements?.[0]
          );
          fillSuccess = success;
        }
      }

      // Inject visual pill badge into question header
      injectVisualIndicator(q.container, planItem);

      auditLog.push({
        index: i + 1,
        questionId: q.id,
        title: q.title,
        type: q.type,
        userAnswer: planItem.userAnswer,
        matchedValue: planItem.matchedValue,
        status: planItem.status,
        tier: planItem.tier,
        score: planItem.score,
        reason: planItem.reason,
        applied: fillSuccess,
        isProfileField: !!planItem.isProfileField
      });
    }

    lastExecutionSnapshot = snapshot;

    return {
      auditLog,
      totalQuestions: questions.length,
      filledCount: auditLog.filter(item => item.status === 'EXACT' || item.status === 'FUZZY' || item.status === 'PROFILE_FILLED').length,
      profileCount: auditLog.filter(item => item.status === 'PROFILE_FILLED').length,
      exactCount: auditLog.filter(item => item.status === 'EXACT').length,
      fuzzyCount: auditLog.filter(item => item.status === 'FUZZY').length,
      unmatchedCount: auditLog.filter(item => item.status === 'UNMATCHED').length,
      skippedCount: auditLog.filter(item => item.status === 'SKIPPED').length,
      prefilledCount: auditLog.filter(item => item.status === 'SKIPPED_PREFILLED').length
    };
  }

  /**
   * Reverts changes from the last autofill execution.
   * If preserveProfile is true (default), student profile fields are kept intact.
   */
  function undoAutofill(preserveProfile = true) {
    if (!lastExecutionSnapshot) {
      return { success: false, message: 'No autofill execution to undo' };
    }

    // 1. Revert text inputs
    lastExecutionSnapshot.textInputs.forEach(item => {
      if (item.element) {
        if (preserveProfile && item.isProfileField) return;
        fillTextInput(item.element, item.previousValue || '');
      }
    });

    // 2. Revert radio/checkbox selections
    lastExecutionSnapshot.choiceInputs.forEach(item => {
      if (item.element) {
        if (preserveProfile && item.isProfileField) return;
        const currentlyChecked = item.element.getAttribute('aria-checked') === 'true';
        if (currentlyChecked !== item.previousState) {
          clickChoiceElement(item.element);
        }
      }
    });

    // 3. Remove injected badges (preserve profile badges if preserveProfile is true)
    document.querySelectorAll('.formflow-pill').forEach(pill => {
      if (preserveProfile && pill.classList.contains('formflow-pill-profile')) return;
      pill.remove();
    });

    if (!preserveProfile) {
      lastExecutionSnapshot = null;
    }
    return { success: true, message: 'Autofilled inputs and badges reverted' };
  }

  /**
   * Smoothly scrolls to a specific question on the form and flashes a highlight outline
   */
  function scrollToQuestion(questionId) {
    const target = document.querySelector(`[data-formflow-id="${questionId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('formflow-active-highlight');
      setTimeout(() => {
        target.classList.remove('formflow-active-highlight');
      }, 2200);
      return true;
    }
    return false;
  }

  window.FormFlow.Filler = {
    fillTextInput,
    clickChoiceElement,
    fillDropdown,
    injectVisualIndicator,
    executeAutofill,
    undoAutofill,
    scrollToQuestion
  };
})();
