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
    window.FormFlow.Filler = { fillTextInput, clickChoiceElement, fillDropdown };
})();
