#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');

function extractNormalizeFn(utilsSource) {
  const startMarker = '// --- normalizeTemperatureTokensInText (tests extract between markers) ---';
  const endMarker = '// --- end normalizeTemperatureTokensInText ---';
  const start = utilsSource.indexOf(startMarker);
  const end = utilsSource.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not extract normalizeTemperatureTokensInText from utils.js.');
  }
  return utilsSource.slice(start, end + endMarker.length);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

function run() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const snippet = extractNormalizeFn(utilsSource);

  const context = { console };
  vm.createContext(context);
  vm.runInContext(snippet, context, { filename: 'normalizeTemperatureTokensInText.js' });

  const norm = context.normalizeTemperatureTokensInText;
  if (typeof norm !== 'function') {
    throw new Error('normalizeTemperatureTokensInText was not defined in extracted snippet.');
  }

  assertEqual(norm('375 degrees Fahrenheit'), '375°F', 'spelled-out Fahrenheit');
  assertEqual(norm('180 degrees Celsius'), '180°C', 'spelled-out Celsius');
  assertEqual(norm('400 degrees F'), '400°F', 'degrees F');
  assertEqual(norm('Preheat to 350 ° f'), 'Preheat to 350°F', 'mixed case unit with spaces');
  assertEqual(norm('375°F'), '375°F', 'idempotent compact');
  assertEqual(norm('350-375°F'), '350-375°F', 'range before compact trailing temp');
  assertEqual(norm('Bake at 400° F for 10 min'), 'Bake at 400°F for 10 min', 'legacy space before F');

  console.log('normalizeTemperatureTokensInText tests passed.');
}

run();
