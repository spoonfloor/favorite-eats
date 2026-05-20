#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `Could not extract snippet between ${startMarker} and ${endMarker}.`,
    );
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

function assertNoDecimalTail(label, message) {
  if (/\.\d{2,}/.test(String(label))) {
    throw new Error(`${message}: label still looks decimal: ${JSON.stringify(label)}`);
  }
}

function loadFormatShoppingQtyForDisplay() {
  const utilsSource = fs.readFileSync(
    path.join(projectRoot, 'js', 'utils.js'),
    'utf8',
  );
  const decimalSnippet = extractSnippet(
    utilsSource,
    'function decimalToFractionDisplay(',
    'function showUndoToastGlobal(',
  );
  const formatSnippet = extractSnippet(
    utilsSource,
    'function formatShoppingQtyForDisplay(',
    'function getActionableQuantityFractionPolicy(',
  );

  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(decimalSnippet, context, { filename: 'utils.decimal-display.js' });
  context.window.decimalToFractionDisplay = context.decimalToFractionDisplay;
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'unitQuantityFormat.js'), 'utf8'),
    context,
    { filename: 'unitQuantityFormat.js' },
  );
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'quantityDisplayPolicy.js'), 'utf8'),
    context,
    { filename: 'quantityDisplayPolicy.js' },
  );
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'favoriteEatsAmountKit.js'), 'utf8'),
    context,
    { filename: 'favoriteEatsAmountKit.js' },
  );
  vm.runInContext(formatSnippet, context, {
    filename: 'utils.formatShoppingQtyForDisplay.js',
  });
  return context.formatShoppingQtyForDisplay;
}

function run() {
  const formatShoppingQtyForDisplay = loadFormatShoppingQtyForDisplay();
  if (typeof formatShoppingQtyForDisplay !== 'function') {
    throw new Error('formatShoppingQtyForDisplay missing');
  }

  assertEqual(formatShoppingQtyForDisplay(0), '0', 'zero qty');
  assertEqual(formatShoppingQtyForDisplay(1.3333), '1⅓', '4dp third → glyph');
  assertEqual(formatShoppingQtyForDisplay(8.8333), '8¾', 'large 4dp sum → fine grid');
  assertEqual(formatShoppingQtyForDisplay(0.75), '¾', 'exact quarter');
  assertEqual(formatShoppingQtyForDisplay(2.75), '2¾', 'mixed whole + quarter');

  assertNoDecimalTail(formatShoppingQtyForDisplay(1.3333), 'cucumber-class qty');
  assertNoDecimalTail(formatShoppingQtyForDisplay(8.8333), 'lettuce-class qty');

  console.log('Shopping qty display tests passed.');
}

run();
