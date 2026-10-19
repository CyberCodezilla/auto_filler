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
    window.FormFlow.Scraper = { extractDataParams, getOptionLabel };
})();
