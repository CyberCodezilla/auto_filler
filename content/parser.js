/**
 * FormFlow - Parser Utility
 */
(function() {
  'use strict';
  window.FormFlow = window.FormFlow || {};
  function cleanLine(rawLine) {
    return rawLine ? rawLine.trim() : '';
  }
  window.FormFlow.Parser = { cleanLine };
})();
