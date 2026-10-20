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
    window.FormFlow.Filler = { fillTextInput };
})();
