/**
 * FormFlow - Matching Engine
 * Supports Mode 1 (Sequential) and Mode 2 (Smart Shuffle / Global Option Pool).
 */

(function () {
  'use strict';

  window.FormFlow = window.FormFlow || {};

  const Parser = window.FormFlow.Parser;

  /**
   * Plans the autofill actions according to Mode 1 (Sequential Mapping)
   * If skipFilledQuestions is true, questions already answered by the user are skipped
   * without consuming answer lines.
   */
  function matchSequential(questions, userAnswers, allowGlobalFallback = false, skipFilledQuestions = true) {
    const results = new Array(questions.length);
    const unmatchedAnswers = [];
    const matchedQuestionIndices = new Set();
    let answerIndex = 0;

    // Step 1: Pre-populate skipped questions if skipFilledQuestions is enabled
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (skipFilledQuestions && q.isAlreadyFilled) {
        results[i] = {
          questionIndex: q.index !== undefined ? q.index : i,
          questionId: q.id,
          questionTitle: q.title,
          questionType: q.type,
          userAnswer: q.currentValue || '',
          matchedValue: q.currentValue || '',
          targetElements: [],
          score: 1.0,
          tier: 'NONE',
          status: 'SKIPPED_PREFILLED',
          reason: 'Skipped: Field already filled by user'
        };
        matchedQuestionIndices.add(i);
      }
    }

    // Step 2: Map user answers sequentially across remaining active questions
    for (let i = 0; i < questions.length; i++) {
      if (results[i]) continue; // Already handled (e.g. pre-filled)

      const q = questions[i];
      const answer = answerIndex < userAnswers.length ? userAnswers[answerIndex++] : null;

      if (!answer) {
        results[i] = {
          questionIndex: q.index !== undefined ? q.index : i,
          questionId: q.id,
          questionTitle: q.title,
          questionType: q.type,
          userAnswer: '',
          matchedValue: null,
          targetElements: [],
          score: 0,
          tier: 'NONE',
          status: 'SKIPPED',
          reason: 'No user answer provided for this question position'
        };
        continue;
      }

      const matchRes = matchSingleQuestion(q, answer);
      if (matchRes.status === 'UNMATCHED' && allowGlobalFallback) {
        unmatchedAnswers.push({ answerIndex: answerIndex - 1, answer, questionIndex: i });
        results[i] = matchRes;
      } else {
        if (matchRes.status !== 'UNMATCHED') {
          matchedQuestionIndices.add(i);
        }
        results[i] = matchRes;
      }
    }

    // Optional global fallback for unmatched choice answers if enabled
    if (allowGlobalFallback && unmatchedAnswers.length > 0) {
      unmatchedAnswers.forEach(({ answer, questionIndex }) => {
        // Find unfilled, unmatched choice questions
        for (let j = 0; j < questions.length; j++) {
          if (matchedQuestionIndices.has(j)) continue;
          const candidateQ = questions[j];
          if (skipFilledQuestions && candidateQ.isAlreadyFilled) continue;

          if (candidateQ.type === 'radio' || candidateQ.type === 'dropdown' || candidateQ.type === 'checkbox') {
            const fallbackMatch = matchSingleQuestion(candidateQ, answer);
            if (fallbackMatch.score >= 0.85) {
              matchedQuestionIndices.add(j);
              results[j] = fallbackMatch;
              break;
            }
          }
        }
      });
    }

    return results;
  }

  /**
   * Matches a single question against a given answer string
   */
  function matchSingleQuestion(q, answer) {
    // 1. Text Inputs (Short answer, Paragraph)
    if (q.type === 'text' || q.type === 'textarea') {
      return {
        questionIndex: q.index,
        questionId: q.id,
        questionTitle: q.title,
        questionType: q.type,
        userAnswer: answer,
        matchedValue: answer,
        targetElements: [q.inputElement],
        score: 1.0,
        tier: 'TEXT',
        status: 'EXACT',
        reason: 'Direct text input'
      };
    }

    // 2. Radio (Multiple Choice)
    if (q.type === 'radio') {
      const match = Parser.findBestOptionMatch(answer, q.options);
      if (match) {
        return {
          questionIndex: q.index,
          questionId: q.id,
          questionTitle: q.title,
          questionType: q.type,
          userAnswer: answer,
          matchedValue: match.option.text,
          targetElements: [match.option.element],
          score: match.score,
          tier: match.tier,
          status: match.score === 1.0 ? 'EXACT' : 'FUZZY',
          reason: match.reason
        };
      } else {
        return {
          questionIndex: q.index,
          questionId: q.id,
          questionTitle: q.title,
          questionType: q.type,
          userAnswer: answer,
          matchedValue: null,
          targetElements: [],
          score: 0,
          tier: 'NONE',
          status: 'UNMATCHED',
          reason: 'No option matched above 0.80 similarity threshold'
        };
      }
    }

        return { score: 0, status: 'UNMATCHED' };
  }
  window.FormFlow.Matcher = { matchSingleQuestion };
})();
