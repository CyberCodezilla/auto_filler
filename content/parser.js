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
  function getBigrams(str) {
    const s = str.trim();
    const bigrams = new Map();
    if (s.length < 2) {
      if (s.length === 1) {
        bigrams.set(s, 1);
      }
      return bigrams;
    }
    for (let i = 0; i < s.length - 1; i++) {
      const bigram = s.substring(i, i + 2);
      const count = bigrams.get(bigram) || 0;
      bigrams.set(bigram, count + 1);
    }
    return bigrams;
  }

  /**
   * Computes Sorensen-Dice coefficient between two strings.
   * Returns a float between 0.0 and 1.0.
   */
  function diceCoefficient(str1, str2) {
    const s1 = normalize(str1);
    const s2 = normalize(str2);

    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) {
      return s1 === s2 ? 1.0 : 0.0;
    }

    const bigrams1 = getBigrams(s1);
    const bigrams2 = getBigrams(s2);

    let intersectionSize = 0;
    for (const [bigram, count1] of bigrams1.entries()) {
      if (bigrams2.has(bigram)) {
        intersectionSize += Math.min(count1, bigrams2.get(bigram));
      }
    }

    let totalBigrams = (s1.length - 1) + (s2.length - 1);
    return (2.0 * intersectionSize) / totalBigrams;
  }

  /**
   * 3-Tier Waterfall Matching Engine
   * Evaluates user input against a candidate option label.
   *
   * Tier 1: Exact Normalized Match (100% / 1.0)
   * Tier 2: Substring Inclusion (>= 92%)
   * Tier 3: Fuzzy Bigram Similarity (Dice's Coefficient >= 0.80 hard threshold)
   */
  function evaluateMatch(userAnswer, candidateText) {
    const normUser = normalize(userAnswer);
    const normCandidate = normalize(candidateText);

    if (!normUser || !normCandidate) {
      return { score: 0, tier: 'NONE', reason: 'Empty string' };
    }

    // Tier 1: Exact Normalized Match
    if (normUser === normCandidate) {
      return { score: 1.0, tier: 'EXACT', reason: 'Normalized exact match' };
    }

    // Compact check (handles spacing variations in numbers/units like "2.4 GHz" vs "2.4GHz")
    const compactUser = normalizeCompact(userAnswer);
    const compactCandidate = normalizeCompact(candidateText);
    if (compactUser === compactCandidate) {
      return { score: 1.0, tier: 'EXACT', reason: 'Compact exact match' };
    }

    // Clean any leading markers on candidate as well (e.g. "b) 2.4 GHz" -> "2.4 GHz")
    const cleanCand = normalize(cleanLine(candidateText));
    if (normUser === cleanCand || compactUser === normalizeCompact(cleanLine(candidateText))) {
      return { score: 1.0, tier: 'EXACT', reason: 'Marker-stripped exact match' };
    }

    // Tier 2: Substring Inclusion
    // Handles cases like candidate: "RSSI (Received Signal Strength Indicator)" vs input: "RSSI"
    // or candidate: "Transferring an ongoing connection..." vs input containing core phrase
    const minLength = Math.min(normUser.length, cleanCand.length);
    const maxLength = Math.max(normUser.length, cleanCand.length);

    if (minLength >= 2) {
      const candidateContainsUser = cleanCand.includes(normUser) || normCandidate.includes(normUser);
      const userContainsCandidate = normUser.includes(cleanCand) || normUser.includes(normCandidate);

      if (candidateContainsUser || userContainsCandidate) {
        // High confidence substring match
        const inclusionRatio = minLength / maxLength;
        // Substring score scaled between 0.92 and 0.98 based on relative coverage
        const subScore = Math.max(0.92, Math.min(0.98, 0.90 + (inclusionRatio * 0.08)));
        return {
          score: subScore,
          tier: 'SUBSTRING',
          reason: candidateContainsUser ? 'Option contains answer' : 'Answer contains option'
        };
      }
    }

    // Tier 3: Fuzzy Similarity (Sorensen-Dice)
    const diceScore = Math.max(
      diceCoefficient(normUser, normCandidate),
      diceCoefficient(normUser, cleanCand)
    );

    // Hard threshold at 0.80 - anything lower is strictly marked UNMATCHED (Zero-Hallucination)
    if (diceScore >= 0.80) {
      return {
        score: Math.round(diceScore * 100) / 100,
        tier: 'FUZZY',
        reason: `Dice bigram similarity: ${(diceScore * 100).toFixed(1)}%`
      };
    }

    return {
      score: 0,
      tier: 'NONE',
      reason: `Below threshold (score: ${(diceScore * 100).toFixed(1)}% < 80%)`
    };
  }

  /**
   * Finds the best matching option from a list of options for a given answer.
   */
  function findBestOptionMatch(userAnswer, options) {
    if (!options || options.length === 0) return null;

    let bestMatch = null;
    let highestScore = 0;

    for (const opt of options) {
      const evaluation = evaluateMatch(userAnswer, opt.text);
      if (evaluation.score > highestScore) {
        highestScore = evaluation.score;
        bestMatch = {
          option: opt,
          score: evaluation.score,
          tier: evaluation.tier,
          reason: evaluation.reason
        };
      }
    }

    // Must be at least 0.80 to be accepted
    if (highestScore >= 0.80) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Splits an answer into multiple items if it contains delimiters (e.g. comma, semicolon).
   * Useful for checkbox multi-selects.
   */
  function splitMultiAnswer(answerStr) {
    if (!answerStr) return [];
    if (answerStr.includes(';') || answerStr.includes(',')) {
      const delimiter = answerStr.includes(';') ? ';' : ',';
      return answerStr
        .split(delimiter)
        .map(s => cleanLine(s))
        .filter(s => s.length > 0);
    }
    return [cleanLine(answerStr)];
  }

  window.FormFlow.Parser = {
    cleanLine,
    parseInputLines,
    normalize,
    normalizeCompact,
    diceCoefficient,
    evaluateMatch,
    findBestOptionMatch,
    splitMultiAnswer
  };
})();
