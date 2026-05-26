#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');
const amountModelPath = path.join(projectRoot, 'js', 'recipeIngredientAmountModel.js');

function assertEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function createQuantityHelpers() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const amountModelSource = fs.readFileSync(amountModelPath, 'utf8');
  const parseSnippet = utilsSource.slice(
    utilsSource.indexOf('function parseNumericQuantityValue('),
    utilsSource.indexOf('function isNumericQuantity('),
  );

  const context = { console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(parseSnippet, context, { filename: 'utils.parseNumericQuantityValue.js' });
  vm.runInContext(amountModelSource, context, { filename: 'recipeIngredientAmountModel.js' });
  return context.favoriteEatsRecipeIngredientAmountModel;
}

function runReadTests(model) {
  const { toShoppingQuantity } = model;

  assertEqual(
    toShoppingQuantity({ quantity: '2', quantityMin: 1, quantityMax: 1 }),
    2,
    'scalar edit with stale equal min/max prefers quantity text',
  );
  assertEqual(
    toShoppingQuantity({ quantity: '1', quantityMin: 2, quantityMax: 2 }),
    1,
    'scalar quantity wins over stale equal min/max endpoints',
  );
  assertEqual(
    toShoppingQuantity({ quantity: '1', quantityMin: 1, quantityMax: 2 }),
    1,
    'plain scalar quantity collapses stale range endpoints',
  );
  assertEqual(
    toShoppingQuantity({ quantity: '1-2', quantityMin: 1, quantityMax: 2, quantityIsApprox: true }),
    2,
    'true range still uses max endpoint',
  );
  assertEqual(
    toShoppingQuantity({ quantity: '', quantityMin: 1, quantityMax: 1 }),
    1,
    'range-only equal endpoints fall back to min/max',
  );
  assertEqual(
    toShoppingQuantity({ quantity: 'a pinch', quantityMin: null, quantityMax: null }),
    null,
    'text amounts do not invent shopping quantities',
  );
}

function runSaveTests(model) {
  const { toDbPayload } = model;

  assertEqual(
    toDbPayload({ quantity: 2, quantityMin: 1, quantityMax: 1 }),
    { quantity: '2', quantity_min: 2, quantity_max: 2, quantity_is_approx: false },
    'scalar save syncs stale min/max to quantity',
  );
  assertEqual(
    toDbPayload({ quantity: 1, quantityMin: 1, quantityMax: 2, quantityIsApprox: false }),
    { quantity: '1', quantity_min: 1, quantity_max: 1, quantity_is_approx: false },
    'plain scalar save collapses stale range endpoints',
  );
  assertEqual(
    toDbPayload({ quantity: '1-3', quantityMin: 1, quantityMax: 3, quantityIsApprox: true }),
    { quantity: '1-3', quantity_min: 1, quantity_max: 3, quantity_is_approx: true },
    'range save keeps distinct endpoints',
  );
  assertEqual(
    toDbPayload({ quantity: 0, quantityMin: 1, quantityMax: 2, quantityIsApprox: true }),
    { quantity: '', quantity_min: 1, quantity_max: 2, quantity_is_approx: true },
    'non-positive text does not become a scalar but keeps explicit range endpoints',
  );
}

function run() {
  const model = createQuantityHelpers();
  runReadTests(model);
  runSaveTests(model);
  console.log('Recipe ingredient shopping quantity tests passed.');
}

run();
