#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');
const kitPath = path.join(projectRoot, 'js', 'favoriteEatsAmountKit.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between markers.`);
  }
  return source.slice(start, end);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    );
  }
}

function run() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const kitSource = fs.readFileSync(kitPath, 'utf8');

  const decimalSnippet = extractSnippet(
    utilsSource,
    'function decimalToFractionDisplay(',
    'function showUndoToastGlobal('
  );
  const parseSnippet = extractSnippet(
    utilsSource,
    'function parseNumericQuantityValue(q)',
    'function getIngredientGrammarBase('
  );

  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(decimalSnippet, context, { filename: 'utils.decimal-display.js' });
  context.window.decimalToFractionDisplay = context.decimalToFractionDisplay;
  vm.runInContext(parseSnippet, context, { filename: 'utils.parse-qty.js' });
  context.window.parseNumericQuantityValue = context.parseNumericQuantityValue;
  vm.runInContext(kitSource, context, { filename: 'favoriteEatsAmountKit.js' });

  const kit = context.window.favoriteEatsAmountKit;
  if (!kit) throw new Error('favoriteEatsAmountKit missing');

  assertEqual(kit.parseToPositiveNumber('1/4'), 0.25, 'parse simple fraction');
  assertEqual(kit.parseToPositiveNumber('0.25'), 0.25, 'parse decimal string');
  assertEqual(kit.formatScalarForStep(0.25, 4), '\u00bc', 'format ¼ without unitQuantityFormat (cilantro-class)');

  const context2 = { window: {}, console };
  vm.createContext(context2);
  vm.runInContext(decimalSnippet, context2, { filename: 'utils.decimal-display.js' });
  context2.window.decimalToFractionDisplay = context2.decimalToFractionDisplay;
  vm.runInContext(parseSnippet, context2, { filename: 'utils.parse-qty.js' });
  context2.window.parseNumericQuantityValue = context2.parseNumericQuantityValue;
  const unitPath = path.join(projectRoot, 'js', 'unitQuantityFormat.js');
  vm.runInContext(fs.readFileSync(unitPath, 'utf8'), context2, {
    filename: 'unitQuantityFormat.js',
  });
  vm.runInContext(kitSource, context2, { filename: 'favoriteEatsAmountKit.js' });
  const kit2 = context2.window.favoriteEatsAmountKit;
  assertEqual(kit2.formatScalarForStep(0.25, 4), '\u00bc', 'format with unitQuantityFormat loaded');

  console.log('favoriteEatsAmountKit tests passed.');
}

run();
