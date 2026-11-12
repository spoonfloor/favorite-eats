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

  // Degree glyph or word followed by the spelled-out unit
  assertEqual(norm('350° Fahrenheit'), '350°F', 'degree sign then Fahrenheit');
  assertEqual(norm('180 ° celsius'), '180°C', 'degree sign then lowercase celsius');
  assertEqual(norm('350 Fahrenheit'), '350°F', 'number then Fahrenheit, no marker');
  // Abbreviated degree word
  assertEqual(norm('350 deg F'), '350°F', 'deg F');
  assertEqual(norm('350 deg. F'), '350°F', 'deg. F');
  assertEqual(norm('350deg F'), '350°F', 'deg glued to number');
  // Degree look-alike glyphs
  assertEqual(norm('350º F'), '350°F', 'ordinal indicator º');
  assertEqual(norm('350˚F'), '350°F', 'ring above ˚');
  // Bare unit letter after a 3-digit number
  assertEqual(norm('Bake at 350 F.'), 'Bake at 350°F.', 'bare F with space');
  assertEqual(norm('180C'), '180°C', 'bare C glued');
  assertEqual(norm('350 F/180 C'), '350°F/180°C', 'paired bare units');
  assertEqual(norm('350-375 F'), '350-375°F', 'range with bare F');
  // Left alone
  assertEqual(norm('2 C flour'), '2 C flour', 'cups abbreviation untouched');
  assertEqual(norm('a 3 F pan'), 'a 3 F pan', 'short number + F untouched');
  assertEqual(norm('1350 F'), '1350 F', '4-digit bare F untouched');
  assertEqual(norm('350 Fries'), '350 Fries', 'F starting a word untouched');
  assertEqual(norm('350°'), '350°', 'degree sign without unit untouched');
  assertEqual(norm('350 degrees for 20 min'), '350 degrees for 20 min', 'degrees without unit untouched');
  assertEqual(norm('350 F and 180C'), '350°F and 180°C', 'two temps in one line');
  assertEqual(norm(norm('350º F, 180 deg C')), '350°F, 180°C', 'idempotent after extension');

  console.log('normalizeTemperatureTokensInText tests passed.');
}

run();
