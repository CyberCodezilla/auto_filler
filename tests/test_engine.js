/**
 * FormFlow - Engine Unit & Integration Verification Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock window and FormFlow namespace
global.window = {};
require('../content/parser.js');
const Parser = global.window.FormFlow.Parser;

console.log('=== RUNNING FORMFLOW TEST SUITE ===\n');

// 1. List marker stripping tests
console.log('Test 1: List marker stripping');
assert.strictEqual(Parser.cleanLine('1. Radio frequency band'), 'Radio frequency band');
assert.strictEqual(Parser.cleanLine('A) 2.4 GHz'), '2.4 GHz');
assert.strictEqual(Parser.cleanLine('3 - Increased spectrum efficiency'), 'Increased spectrum efficiency');
assert.strictEqual(Parser.cleanLine('• Bluetooth'), 'Bluetooth');
assert.strictEqual(Parser.cleanLine('  10. Transferring an ongoing connection...  '), 'Transferring an ongoing connection...');
console.log('✔ List marker stripping passed.\n');

// 2. Normalization tests
console.log('Test 2: Normalization');
assert.strictEqual(Parser.normalize(' Radio  frequency   band! '), 'radio frequency band');
assert.strictEqual(Parser.normalizeCompact('2.4 GHz'), '2.4ghz');
assert.strictEqual(Parser.normalizeCompact('2.4GHz'), '2.4ghz');
console.log('✔ Normalization passed.\n');

// 3. Sorensen-Dice Bigram Similarity tests
console.log('Test 3: Sorensen-Dice similarity');
const exactDice = Parser.diceCoefficient('Bluetooth', 'bluetooth');
assert.strictEqual(exactDice, 1.0);

const typoDice = Parser.diceCoefficient('Bluetooth', 'Bluetoth');
assert.ok(typoDice >= 0.80, `Expected typo score >= 0.80, got ${typoDice}`);

const completelyDifferent = Parser.diceCoefficient('Bluetooth', 'Microwave oven');
assert.ok(completelyDifferent < 0.40, `Expected low score, got ${completelyDifferent}`);
console.log('✔ Sorensen-Dice similarity passed.\n');

// 4. Waterfall Matching Tests
console.log('Test 4: 3-Tier Waterfall Matching');

// Exact
const t1 = Parser.evaluateMatch('Radio frequency band', 'Radio frequency band');
assert.strictEqual(t1.tier, 'EXACT');
assert.strictEqual(t1.score, 1.0);

// Compact / Unit spacing
const t1_compact = Parser.evaluateMatch('2.4 GHz', '2.4GHz');
assert.strictEqual(t1_compact.tier, 'EXACT');

// Option with letter prefix
const t1_prefix = Parser.evaluateMatch('2.4 GHz', 'b) 2.4 GHz');
assert.strictEqual(t1_prefix.tier, 'EXACT');

// Substring inclusion (RSSI vs RSSI (Received Signal Strength Indicator))
const t2 = Parser.evaluateMatch('RSSI', 'RSSI (Received Signal Strength Indicator)');
assert.strictEqual(t2.tier, 'SUBSTRING');
assert.ok(t2.score >= 0.90);

// Hard threshold rejection (No Hallucination)
const rejected = Parser.evaluateMatch('Quantum Computing', 'Radio frequency band');
assert.strictEqual(rejected.tier, 'NONE');
assert.strictEqual(rejected.score, 0);
console.log('✔ 3-Tier Waterfall matching passed.\n');

// 5. Verification against the exact 10 PRD Questions
console.log('Test 5: Verification of all 10 PRD Example Answers');

const PRD_QUESTIONS = [
  {
    title: 'What frequency band is being analyzed?',
    type: 'radio',
    options: [{ text: 'Baseband' }, { text: 'Radio frequency band' }, { text: 'Optical band' }]
  },
  {
    title: 'What is the primary function of the carrier signal?',
    type: 'radio',
    options: [{ text: 'To encode binary bits' }, { text: 'To carry the signal from transmitter to receiver' }]
  },
  {
    title: 'What is the key advantage of digital modulation?',
    type: 'radio',
    options: [{ text: 'Higher delay' }, { text: 'Increased spectrum efficiency' }]
  },
  {
    title: 'Network name',
    type: 'text'
  },
  {
    title: 'How does signal power behave as distance increases?',
    type: 'radio',
    options: [{ text: 'Increases' }, { text: 'It generally decreases' }]
  },
  {
    title: 'Which standard Wi-Fi frequency is most susceptible to microwave interference?',
    type: 'radio',
    options: [{ text: 'a) 5.0 GHz' }, { text: 'b) 2.4 GHz' }, { text: 'c) 60 GHz' }]
  },
  {
    title: 'Which protocol operates in the 2.4 GHz ISM band?',
    type: 'radio',
    options: [{ text: 'Zigbee' }, { text: 'Bluetooth' }, { text: 'LTE Band 20' }]
  },
  {
    title: 'Define attenuation in telecommunications:',
    type: 'radio',
    options: [{ text: 'Amplification' }, { text: 'Reduction in signal power during propagation' }]
  },
  {
    title: 'Which metric represents Received Signal Strength Indicator?',
    type: 'radio',
    options: [{ text: 'SNR' }, { text: 'RSSI (Received Signal Strength Indicator)' }, { text: 'BER' }]
  },
  {
    title: 'What is the definition of cellular handover?',
    type: 'radio',
    options: [{ text: 'Modulating carrier' }, { text: 'Transferring an ongoing connection from one cell to another' }]
  }
];

const PRD_INPUTS = [
  'Radio frequency band',
  'To carry the signal from transmitter to receiver',
  'Increased spectrum efficiency',
  'Network name',
  'It generally decreases',
  '2.4 GHz',
  'Bluetooth',
  'Reduction in signal power during propagation',
  'RSSI',
  'Transferring an ongoing connection from one cell to another'
];

require('../content/matcher.js');
const Matcher = global.window.FormFlow.Matcher;

const questionsFormatted = PRD_QUESTIONS.map((q, idx) => ({
  id: `q-${idx}`,
  index: idx,
  title: q.title,
  type: q.type,
  options: q.options || [],
  inputElement: q.type === 'text' ? { value: '' } : null,
  container: {}
}));

const plan = Matcher.matchSequential(questionsFormatted, PRD_INPUTS);

assert.strictEqual(plan.length, 10);
let filled = 0;
plan.forEach((item, idx) => {
  assert.ok(item.status === 'EXACT' || item.status === 'FUZZY', `Q${idx+1} failed with status ${item.status}`);
  filled++;
  console.log(`Q${idx + 1} [${item.status} - ${(item.score * 100).toFixed(0)}%] "${item.userAnswer}" -> Matched: "${item.matchedValue}"`);
});

assert.strictEqual(filled, 10, 'All 10 questions must be filled successfully!');

console.log('\n✔ Sequential Mode 1 passed 10/10.\n');

// 6. Verification of Mode 2 (Smart Shuffle / Shuffled Questions)
console.log('Test 6: Verification of Mode 2 (Smart Shuffle / Randomized Questions)');

// Reverse the questions to simulate shuffled Google Form
const shuffledQuestions = [...questionsFormatted].reverse();

const shufflePlan = Matcher.matchSmartShuffle(shuffledQuestions, PRD_INPUTS);
let shuffleFilled = 0;
shufflePlan.forEach((item, idx) => {
  if (item && (item.status === 'EXACT' || item.status === 'FUZZY')) {
    shuffleFilled++;
  }
});

console.log(`Smart Shuffle filled ${shuffleFilled} / ${shuffledQuestions.length} randomized questions.`);
assert.strictEqual(shuffleFilled, 10, 'Smart Shuffle must resolve all 10 randomized questions!');
console.log('✔ Mode 2 Smart Shuffle passed.\n');

// 7. Verification of Pre-Filled Question & Identity Field Skipping
console.log('Test 7: Verification of Pre-Filled Question & Identity Field Skipping (Name, Email, Roll No)');

const identityFields = [
  {
    id: 'id-name',
    index: 0,
    title: 'Full Name',
    type: 'text',
    isAlreadyFilled: true,
    currentValue: 'Alex Chen',
    isIdentityField: true,
    inputElement: { value: 'Alex Chen' }
  },
  {
    id: 'id-email',
    index: 1,
    title: 'Email Address',
    type: 'text',
    isAlreadyFilled: true,
    currentValue: 'alex.chen@university.edu',
    isIdentityField: true,
    inputElement: { value: 'alex.chen@university.edu' }
  },
  {
    id: 'id-roll',
    index: 2,
    title: 'Roll Number',
    type: 'text',
    isAlreadyFilled: true,
    currentValue: '2026-CS-042',
    isIdentityField: true,
    inputElement: { value: '2026-CS-042' }
  }
];

// Combine 3 pre-filled identity questions + 10 quiz questions (total 13 questions)
const fullExamQuestions = [
  ...identityFields,
  ...questionsFormatted.map((q, idx) => ({
    ...q,
    id: `quiz-q-${idx}`,
    index: idx + 3
  }))
];

assert.strictEqual(fullExamQuestions.length, 13);

// Run Sequential Matching with skipFilledQuestions = true
const prefilledPlan = Matcher.matchSequential(fullExamQuestions, PRD_INPUTS, true, true);

assert.strictEqual(prefilledPlan.length, 13);

// Verify Q0, Q1, Q2 are skipped and untouched
assert.strictEqual(prefilledPlan[0].status, 'SKIPPED_PREFILLED');
assert.strictEqual(prefilledPlan[0].matchedValue, 'Alex Chen');
assert.strictEqual(prefilledPlan[1].status, 'SKIPPED_PREFILLED');
assert.strictEqual(prefilledPlan[1].matchedValue, 'alex.chen@university.edu');
assert.strictEqual(prefilledPlan[2].status, 'SKIPPED_PREFILLED');
assert.strictEqual(prefilledPlan[2].matchedValue, '2026-CS-042');

console.log('  ✔ Q1 [Full Name]: Skipped (Preserved "Alex Chen")');
console.log('  ✔ Q2 [Email Address]: Skipped (Preserved "alex.chen@university.edu")');
console.log('  ✔ Q3 [Roll Number]: Skipped (Preserved "2026-CS-042")');

// Verify Answer[0] landed on Quiz Q1 (index 3)
assert.strictEqual(prefilledPlan[3].userAnswer, 'Radio frequency band');
assert.strictEqual(prefilledPlan[3].status, 'EXACT');
console.log('  ✔ Answer[0] landed accurately on Quiz Q1 ("Radio frequency band")');

// Verify all 10 quiz questions are filled with 100% accuracy
let quizFilled = 0;
for (let i = 3; i < 13; i++) {
  const item = prefilledPlan[i];
  assert.ok(item.status === 'EXACT' || item.status === 'FUZZY', `Quiz Q${i-2} failed with status ${item.status}`);
  quizFilled++;
}

assert.strictEqual(quizFilled, 10, 'All 10 quiz questions must be filled accurately!');
console.log(`  ✔ All 10 quiz questions filled: ${quizFilled} / 10 (100% accuracy)`);

console.log('\n========================================================================');
console.log('🎉 ALL TESTS PASSED: SEQUENTIAL, SHUFFLE & PRE-FILLED IDENTITY SKIPPING!');
console.log('========================================================================\n');
