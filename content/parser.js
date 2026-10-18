/**
 * FormFlow - Parser & String Normalization Utility
 * Deterministic, zero-hallucination string matching engine.
 */

(function () {
  'use strict';

  window.FormFlow = window.FormFlow || {};

  // List markers: numbered/lettered with dot+space ("1. "), parens/colons ("1) ", "A: "), or bullets ("- ", "• ")
  // Strictly preserves decimals like "2.4 GHz"
  const LIST_MARKER_REGEX = /^(?:(?:\d+|[a-zA-Z])\.(?:\s+|$)|(?:\d+|[a-zA-Z])[\)\:\-]\s*|(?:\d+|[a-zA-Z])\s+[-–—]\s*|[-*•\u2022\u25E6\u2043\u2219]\s+)+/;

  /**
   * Cleans a raw answer line by stripping leading bullets, numbers, and excess whitespace.
   */
  function cleanLine(rawLine) {
    if (!rawLine) return '';
    let cleaned = rawLine.trim();
    // Strip leading list indicators e.g. "1. ", "A) ", "3 - ", "• ", "- "
    cleaned = cleaned.replace(LIST_MARKER_REGEX, '').trim();
    return cleaned;
  }

  /**
   * Parses raw multiline text input into an array of clean answer strings.
   */
  function parseInputLines(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    return rawText
      .split(/\r?\n/)
      .map(line => cleanLine(line))
      .filter(line => line.length > 0);
  }

  /**
   * Normalizes a string for deterministic comparison:
   * - Lowercases
   * - Normalizes unicode quotes and hyphens
   * - Strips non-alphanumeric punctuation except periods and hyphens
   * - Collapses multiple whitespace to single space
   */
    window.FormFlow.Parser = { cleanLine, parseInputLines };
})();
