#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const cookingVolumeLadderPath = path.join(projectRoot, 'js', 'cookingVolumeLadder.js');
const quantityDisplayPolicyPath = path.join(projectRoot, 'js', 'quantityDisplayPolicy.js');

const ML_PER_TSP = 4.92892159375;
const ML_PER_TBSP = 14.78676478125;
const ML_PER_CUP = 236.5882365;
const ML_PER_GAL = 3785.411784;

function loadPolicy() {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(cookingVolumeLadderPath, 'utf8'), context, {
    filename: 'cookingVolumeLadder.js',
  });
  vm.runInContext(fs.readFileSync(quantityDisplayPolicyPath, 'utf8'), context, {
    filename: 'quantityDisplayPolicy.js',
  });
  const pol = context.window.favoriteEatsQuantityDisplayPolicy;
  const ladder = context.window.favoriteEatsCookingVolumeLadder;
  if (!pol || !ladder) throw new Error('policy or ladder not loaded');
  return { pol, ladder };
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}: expected ${e} but got ${a}`);
  }
}

function mlFromTsp(t) {
  return t * ML_PER_TSP;
}
function mlFromTbsp(b) {
  return b * ML_PER_TBSP;
}
function mlFromCup(c) {
  return c * ML_PER_CUP;
}
function mlFromGal(g) {
  return g * ML_PER_GAL;
}

function run() {
  const { pol } = loadPolicy();

  const cooking = (ml, sourceUnit) =>
    pol.getMeasuredDisplayFromBase('volume', ml, 'cooking', sourceUnit);

  assertDeepEqual(
    cooking(mlFromTsp(0.1)),
    { family: 'volume', quantity: 0.125, unit: 'tsp' },
    'below ⅛ tsp → ceil to ⅛ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(0.2)),
    { family: 'volume', quantity: 0.25, unit: 'tsp' },
    '0.2 tsp → nearest ¼ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(0.25)),
    { family: 'volume', quantity: 0.25, unit: 'tsp' },
    '¼ tsp stays ¼ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(0.5)),
    { family: 'volume', quantity: 0.5, unit: 'tsp' },
    '½ tsp stays ½ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(2.5)),
    { family: 'volume', quantity: 2.5, unit: 'tsp' },
    '2½ tsp → nearest ½ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(4), 'tsp'),
    { family: 'volume', quantity: 4, unit: 'tsp' },
    '4 tsp → nearest ½-tsp step',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(1.5), 'tbsp'),
    { family: 'volume', quantity: 1.5, unit: 'tbsp' },
    '1½ tbsp → nearest ½ tbsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(3.75)),
    {
      family: 'volume',
      quantity: 3.5,
      unit: 'tsp',
      displayLabel: '1 tbsp + ½ tsp',
    },
    '3.75 tsp → compound',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(1.25)),
    {
      family: 'volume',
      quantity: 3.5,
      unit: 'tsp',
      displayLabel: '1 tbsp + ½ tsp',
    },
    '1.25 tbsp → compound',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(2.25)),
    { family: 'volume', quantity: 2.5, unit: 'tbsp' },
    '2.25 tbsp → nearest ½ tbsp',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(3.5)),
    { family: 'volume', quantity: 3.5, unit: 'tbsp' },
    '3.5 tbsp → nearest ½ tbsp',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(10 + 2 / 3), 'tbsp'),
    { family: 'volume', quantity: Number((2 / 3).toFixed(6)), unit: 'cup' },
    '10⅔ tbsp → nearest cup (⅔)',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(10.67), 'tbsp'),
    { family: 'volume', quantity: Number((2 / 3).toFixed(6)), unit: 'cup' },
    '10.67 tbsp → nearest cup (⅔)',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(16.01), 'tbsp'),
    { family: 'volume', quantity: 1, unit: 'cup' },
    '16.01 tbsp → nearest 1 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(0.55), 'cup'),
    { family: 'volume', quantity: 0.5, unit: 'cup' },
    '0.55 cup → nearest ½ cup (not ⅔)',
  );
  assertDeepEqual(
    cooking(mlFromCup(0.65), 'cup'),
    { family: 'volume', quantity: Number((2 / 3).toFixed(6)), unit: 'cup' },
    '0.65 cup → nearest ⅔ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(0.5), 'cup'),
    { family: 'volume', quantity: 0.5, unit: 'cup' },
    '½ cup stays ½ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1.05), 'cup'),
    { family: 'volume', quantity: 1, unit: 'cup' },
    '1.05 cup → nearest 1 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1), 'cup'),
    { family: 'volume', quantity: 1, unit: 'cup' },
    'exactly 1 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1.1), 'cup'),
    { family: 'volume', quantity: 1, unit: 'cup' },
    '1.1 cup → nearest 1 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1.4), 'cup'),
    { family: 'volume', quantity: Number((1 + 1 / 3).toFixed(6)), unit: 'cup' },
    '1.4 cup → nearest 1⅓ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(4.1), 'cup'),
    { family: 'volume', quantity: 4, unit: 'cup' },
    '4.1 cup → nearest whole cup (4)',
  );
  assertDeepEqual(
    cooking(mlFromCup(8), 'cup'),
    { family: 'volume', quantity: 8, unit: 'cup' },
    '8 cups stays 8 cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(8.1), 'cup'),
    { family: 'volume', quantity: 8, unit: 'cup' },
    '8.1 cup → nearest whole cup (8)',
  );
  assertDeepEqual(
    cooking(mlFromCup(10), 'cup'),
    { family: 'volume', quantity: 10, unit: 'cup' },
    '10 cups stays 10 cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(16), 'cup'),
    { family: 'volume', quantity: 1, unit: 'gal' },
    '16 cups → 1 gal',
  );
  assertDeepEqual(
    cooking(mlFromGal(1.2)),
    { family: 'volume', quantity: 1, unit: 'gal' },
    '1.2 gal → nearest 1 gal',
  );
  assertDeepEqual(
    cooking(mlFromGal(1.6)),
    { family: 'volume', quantity: 1.5, unit: 'gal' },
    '1.6 gal → nearest ½ gal (1½)',
  );
  assertDeepEqual(
    cooking(950),
    { family: 'volume', quantity: 4, unit: 'cup' },
    '950 ml → 4 cups',
  );

  console.log('runCookingVolumeLadderTests: all passed');
}

run();
