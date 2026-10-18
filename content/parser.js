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
  function normalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\w\s.\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Compact normalized form without any whitespace (useful for units e.g. "2.4 ghz" vs "2.4ghz")
   */
  function normalizeCompact(str) {
    return normalize(str).replace(/\s+/g, '');
  }

  /**
   * Generates character bigrams for Sorensen-Dice coefficient calculation.
   */
    window.FormFlow.Parser = { cleanLine, parseInputLines, normalize, normalizeCompact };
})();
