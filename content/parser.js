/**
 * FormFlow - Parser Utility
 */
(function() {
  'use strict';
  window.FormFlow = window.FormFlow || {};
  const LIST_MARKER_REGEX = /^(\d+[\.\)]\s*)+/;
  function cleanLine(rawLine) {
    return rawLine ? rawLine.trim().replace(LIST_MARKER_REGEX, '').trim() : '';
  }
  window.FormFlow.Parser = { cleanLine };
})();
