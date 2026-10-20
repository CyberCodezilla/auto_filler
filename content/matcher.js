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

    // 3. Checkboxes (Multi-select)
    if (q.type === 'checkbox') {
      const subAnswers = Parser.splitMultiAnswer(answer);
      const matchedOptions = [];
      const targetEls = [];
      let totalScore = 0;

      for (const subAns of subAnswers) {
        const match = Parser.findBestOptionMatch(subAns, q.options);
        if (match) {
          matchedOptions.push(match.option.text);
          targetEls.push(match.option.element);
          totalScore += match.score;
        }
      }

      if (matchedOptions.length > 0) {
        const avgScore = totalScore / matchedOptions.length;
        return {
          questionIndex: q.index,
          questionId: q.id,
          questionTitle: q.title,
          questionType: q.type,
          userAnswer: answer,
          matchedValue: matchedOptions.join(', '),
          targetElements: targetEls,
          score: Math.round(avgScore * 100) / 100,
          tier: avgScore === 1.0 ? 'EXACT' : 'FUZZY',
          status: avgScore === 1.0 ? 'EXACT' : 'FUZZY',
          reason: `Matched ${matchedOptions.length} of ${subAnswers.length} checkbox options`
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
          reason: 'No checkbox options matched'
        };
      }
    }

    // 4. Dropdown (listbox)
    if (q.type === 'dropdown') {
      const match = Parser.findBestOptionMatch(answer, q.options);
      if (match) {
        return {
          questionIndex: q.index,
          questionId: q.id,
          questionTitle: q.title,
          questionType: q.type,
          userAnswer: answer,
          matchedValue: match.option.text,
          targetElements: match.option.element ? [match.option.element] : [],
          dropdownTrigger: q.listbox,
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
          dropdownTrigger: q.listbox,
          score: 0,
          tier: 'NONE',
          status: 'UNMATCHED',
          reason: 'No dropdown option matched above 0.80 threshold'
        };
      }
    }

    // 5. Grid / Linear Scale
    if (q.type === 'grid') {
      // Find matching number or label in the scale row
      let matchedRadio = null;
      for (const row of q.options) {
        for (const radio of (row.radios || [])) {
          const evalRes = Parser.evaluateMatch(answer, radio.text);
          if (evalRes.score >= 0.80) {
            matchedRadio = radio.element;
            break;
          }
        }
        if (matchedRadio) break;
      }

      if (matchedRadio) {
        return {
          questionIndex: q.index,
          questionId: q.id,
          questionTitle: q.title,
          questionType: q.type,
          userAnswer: answer,
          matchedValue: answer,
          targetElements: [matchedRadio],
          score: 1.0,
          tier: 'EXACT',
          status: 'EXACT',
          reason: 'Scale radio matched'
        };
      }
    }

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
      reason: 'Unknown question format'
    };
  }

  /**
   * Plans autofill actions according to Mode 2 (Global Option-Pool / Smart Shuffle)
   * Designed for randomized questions. Skips pre-filled fields when skipFilledQuestions is true.
   */
  function matchSmartShuffle(questions, userAnswers, skipFilledQuestions = true) {
    const results = new Array(questions.length);
    const usedAnswerIndices = new Set();
    const resolvedQuestionIndices = new Set();

    // Step 0: Pre-populate skipped questions if skipFilledQuestions is enabled
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
        resolvedQuestionIndices.add(i);
      }
    }

    // Step 1: Pair active choice questions against all candidate answers
    const candidateMatches = [];

    questions.forEach((q, qIdx) => {
      if (resolvedQuestionIndices.has(qIdx)) return;

      if (q.type === 'radio' || q.type === 'checkbox' || q.type === 'dropdown') {
        userAnswers.forEach((ans, aIdx) => {
          const matchRes = matchSingleQuestion(q, ans);
          if (matchRes.score >= 0.80) {
            candidateMatches.push({
              questionIndex: qIdx,
              answerIndex: aIdx,
              result: matchRes,
              score: matchRes.score
            });
          }
        });
      }
    });

    // Sort candidate matches by score descending (exact matches first)
    candidateMatches.sort((a, b) => b.score - a.score);

    // Greedily lock in top unique pairs
    candidateMatches.forEach(item => {
      if (!resolvedQuestionIndices.has(item.questionIndex) && !usedAnswerIndices.has(item.answerIndex)) {
        resolvedQuestionIndices.add(item.questionIndex);
        usedAnswerIndices.add(item.answerIndex);
        results[item.questionIndex] = item.result;
      }
    });

    // Step 2: Remaining unused answers map sequentially to open text fields and remaining questions
    const remainingAnswers = [];
    userAnswers.forEach((ans, aIdx) => {
      if (!usedAnswerIndices.has(aIdx)) {
        remainingAnswers.push(ans);
      }
    });

    let remAnsIdx = 0;
    questions.forEach((q, qIdx) => {
      if (!results[qIdx]) {
        if (remAnsIdx < remainingAnswers.length) {
          const ans = remainingAnswers[remAnsIdx++];
          results[qIdx] = matchSingleQuestion(q, ans);
        } else {
          results[qIdx] = {
            questionIndex: q.index !== undefined ? q.index : qIdx,
            questionId: q.id,
            questionTitle: q.title,
            questionType: q.type,
            userAnswer: '',
            matchedValue: null,
            targetElements: [],
            score: 0,
            tier: 'NONE',
            status: 'SKIPPED',
            reason: 'No remaining answer for this question'
          };
        }
      }
    });

    return results;
  }

  window.FormFlow.Matcher = {
    matchSequential,
    matchSmartShuffle,
    matchSingleQuestion
  };
})();
