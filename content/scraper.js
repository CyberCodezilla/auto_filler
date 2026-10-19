/**
 * FormFlow - Google Forms DOM Scraper
 * Identifies question blocks, parses data-params metadata, and categorizes input elements.
 */

(function () {
  'use strict';

  window.FormFlow = window.FormFlow || {};

  /**
   * Attempts to parse Google Forms hidden [data-params] attribute
   */
  function extractDataParams(container) {
    const elWithParams = container.querySelector('[data-params]') || (container.hasAttribute('data-params') ? container : null);
    if (!elWithParams) return null;

    try {
      let raw = elWithParams.getAttribute('data-params');
      if (!raw) return null;
      if (raw.startsWith('%.@.')) {
        raw = raw.substring(4);
      }
      const parsed = JSON.parse(raw);
      // parsed typically contains [id, title, description, typeId, [options...]]
      return parsed;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extracts clean text from an option element (Radio, Checkbox, Dropdown option)
   */
  function getOptionLabel(el) {
    if (!el) return '';

    // Check data-value attribute first
    const dataVal = el.getAttribute('data-value');
    if (dataVal && dataVal.trim().length > 0 && dataVal !== '__other_option__') {
      return dataVal.trim();
    }

    // Check aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim().length > 0) {
      return ariaLabel.trim();
    }

    // Check for standard Google Forms label spans
    const labelSpan = el.querySelector('.aDTYNe, .docssharedWizToggleLabeledLabelText, .O5aex, .Y2Zypf, span');
    if (labelSpan && labelSpan.innerText && labelSpan.innerText.trim().length > 0) {
      return labelSpan.innerText.trim();
    }

    // Fallback to parent or closest label
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.innerText && parentLabel.innerText.trim().length > 0) {
      return parentLabel.innerText.trim();
    }

    return (el.innerText || '').trim();
  }

  /**
   * Scrapes all Google Form questions present on the page.
   */
  function scrapeFormQuestions() {
    // Standard Google Forms wraps each question in div[role="listitem"]
    let containers = Array.from(document.querySelectorAll('div[role="listitem"]'));

    // Fallback: If no role="listitem" (e.g. non-standard forms or modified templates), check for known form card classes
    if (containers.length === 0) {
      containers = Array.from(document.querySelectorAll('.freebirdFormviewerComponentsQuestionBaseRoot, .Qr7Oae, .geS5n'));
    }

    const questions = [];

    containers.forEach((container, index) => {
      // Ensure container has relative positioning for badge injection
      if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }

      // Assign an ID for easy jump-to-element
      const qId = `formflow-question-${index}`;
      container.setAttribute('data-formflow-id', qId);

      // 1. Scrape Title
      const heading = container.querySelector('[role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle, .M7eMe, .RveJvd');
      let title = heading ? heading.innerText.trim() : '';

      // Fallback title from data-params if heading is empty
      const dataParams = extractDataParams(container);
      if (!title && Array.isArray(dataParams) && typeof dataParams[1] === 'string') {
        title = dataParams[1].trim();
      }

      // Clean title: remove trailing asterisk and whitespace
      title = title.replace(/\s*\*\s*$/, '').trim();
      if (!title) {
        title = `Question ${index + 1}`;
      }

      // Check required status
      const isRequired = !!(container.querySelector('.freebirdFormviewerComponentsQuestionBaseRequiredAsterisk, [aria-label*="required" i]') || heading?.innerText.includes('*'));

      // 2. Identify input type and extract elements
      const radios = Array.from(container.querySelectorAll('div[role="radio"]'));
      const checkboxes = Array.from(container.querySelectorAll('div[role="checkbox"]'));
      const listbox = container.querySelector('div[role="listbox"]');
      const textarea = container.querySelector('textarea');
      const textInput = container.querySelector(
        'input[type="text"], input[type="email"], input[type="number"], input[type="tel"], input[type="url"], input:not([type])'
      );
      const radioGroups = Array.from(container.querySelectorAll('div[role="radiogroup"], tr[role="row"]'));

      let type = 'unknown';
      let options = [];
      let inputElement = null;

      if (radios.length > 0 && radioGroups.length <= 1) {
        // Standard Multiple Choice
        type = 'radio';
        options = radios.map(radioEl => ({
          text: getOptionLabel(radioEl),
          element: radioEl,
          isChecked: radioEl.getAttribute('aria-checked') === 'true'
        })).filter(opt => opt.text.length > 0);
      } else if (checkboxes.length > 0 && radioGroups.length <= 1) {
        // Checkboxes (Multi-select)
        type = 'checkbox';
        options = checkboxes.map(cbEl => ({
          text: getOptionLabel(cbEl),
          element: cbEl,
          isChecked: cbEl.getAttribute('aria-checked') === 'true'
        })).filter(opt => opt.text.length > 0);
            } else if (textInput) { type = 'text'; inputElement = textInput; }
      if (type !== 'unknown') questions.push({ id: qId, index, title, type, options, inputElement, container });
    });
    return questions;
  }
  window.FormFlow.Scraper = { extractDataParams, getOptionLabel, scrapeFormQuestions };
})();
