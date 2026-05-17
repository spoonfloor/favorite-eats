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
  const { pol, ladder } = loadPolicy();

  const cooking = (ml, sourceUnit) =>
    pol.getMeasuredDisplayFromBase('volume', ml, 'cooking', sourceUnit);

  assertDeepEqual(
    cooking(mlFromTsp(0.1)),
    { family: 'volume', quantity: 0.125, unit: 'tsp' },
    '0.1 tsp → ⅛ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(0.2)),
    { family: 'volume', quantity: 0.125, unit: 'tsp' },
    '(⅛, ¼) tsp → ⅛ tsp',
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
    { family: 'volume', quantity: 1, unit: 'tbsp' },
    '2½ tsp → 1 tbsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(4), 'tsp'),
    {
      family: 'volume',
      quantity: 3.5,
      unit: 'tsp',
      displayLabel: '1 tbsp + ½ tsp',
    },
    '4 tsp → compound label',
  );
  assertDeepEqual(
    ladder.getMeasuredDisplayFromMl(mlFromTbsp(1.5), 'tbsp'),
    {
      family: 'volume',
      quantity: 3.5,
      unit: 'tsp',
      displayLabel: '1 tbsp + ½ tsp',
    },
    '1½ tbsp uses tbsp table not tsp overlap',
  );
  assertDeepEqual(
    cooking(mlFromTsp(3.75)),
    {
      family: 'volume',
      quantity: 3.5,
      unit: 'tsp',
      displayLabel: '1 tbsp + ½ tsp',
    },
    '3.75 tsp → 1 tbsp + ½ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(1.25)),
    {
      family: 'volume',
      quantity: 3.5,
      unit: 'tsp',
      displayLabel: '1 tbsp + ½ tsp',
    },
    '1.25 tbsp band → compound',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(2.25)),
    { family: 'volume', quantity: 2.5, unit: 'tbsp' },
    '2.25 tbsp → 2½ tbsp',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(3.5)),
    { family: 'volume', quantity: 0.25, unit: 'cup' },
    '3.5 tbsp → ¼ cup',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(10 + 2 / 3), 'tbsp'),
    { family: 'volume', quantity: Number((2 / 3).toFixed(6)), unit: 'cup' },
    'exactly 10⅔ tbsp → ⅔ cup (inclusive hi on (8, 10⅔])',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(10.67), 'tbsp'),
    { family: 'volume', quantity: 0.75, unit: 'cup' },
    '10.67 tbsp (> 10⅔) → ¾ cup on (10⅔, 12]',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(16.01), 'tbsp'),
    { family: 'volume', quantity: 1, unit: 'cup' },
    '16.01 tbsp stays on tbsp ladder → 1 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(0.5)),
    { family: 'volume', quantity: 0.5, unit: 'cup' },
    '½ cup (8 tbsp) via tbsp band → ½ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1.05)),
    { family: 'volume', quantity: 1.25, unit: 'cup' },
    'above 1 cup uses cup table: (1, 1¼] → 1¼ cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(1)),
    { family: 'volume', quantity: 1, unit: 'cup' },
    'exactly 1 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1.1)),
    { family: 'volume', quantity: 1.25, unit: 'cup' },
    '(1, 1¼] → 1¼ cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(1.4)),
    { family: 'volume', quantity: 1.5, unit: 'cup' },
    '(1¼, 1½] → 1½ cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(4.1)),
    { family: 'volume', quantity: 4, unit: 'cup' },
    '(4, 4¼] → 4 cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(8)),
    { family: 'volume', quantity: 8, unit: 'cup' },
    '(7¾, 8] → 8 cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(8.1)),
    { family: 'volume', quantity: 8, unit: 'cup' },
    '(8, 8¼] → 8 cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(10)),
    { family: 'volume', quantity: 10, unit: 'cup' },
    '10 cups stays cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(16)),
    { family: 'volume', quantity: 1, unit: 'gal' },
    '16 cups → 1 gal',
  );
  assertDeepEqual(
    cooking(mlFromGal(1.2)),
    { family: 'volume', quantity: 1, unit: 'gal' },
    '(1, 1½] gal → 1 gal',
  );
  assertDeepEqual(
    cooking(mlFromGal(1.6)),
    { family: 'volume', quantity: 2, unit: 'gal' },
    '(1½, 2] gal → 2 gal',
  );
  assertDeepEqual(
    cooking(950),
    { family: 'volume', quantity: 4, unit: 'cup' },
    '950 ml → 4 cups',
  );

  console.log('runCookingVolumeLadderTests: all passed');
}

run();
