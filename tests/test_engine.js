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


console.log('Parser tests complete.');
