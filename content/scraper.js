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
    window.FormFlow.Scraper = { extractDataParams };
})();
