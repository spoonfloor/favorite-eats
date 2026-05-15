#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');
const ingredientDisplayPath = path.join(projectRoot, 'js', 'ingredientDisplay.js');
const unitQuantityFormatPath = path.join(projectRoot, 'js', 'unitQuantityFormat.js');
const favoriteEatsAmountKitPath = path.join(projectRoot, 'js', 'favoriteEatsAmountKit.js');
const quantityDisplayPolicyPath = path.join(projectRoot, 'js', 'quantityDisplayPolicy.js');
const mainPath = path.join(projectRoot, 'js', 'main.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function loadHelpers() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const ingredientDisplaySource = fs.readFileSync(ingredientDisplayPath, 'utf8');
  const unitQuantityFormatSource = fs.readFileSync(unitQuantityFormatPath, 'utf8');
  const favoriteEatsAmountKitSource = fs.readFileSync(favoriteEatsAmountKitPath, 'utf8');
  const quantityDisplayPolicySource = fs.readFileSync(quantityDisplayPolicyPath, 'utf8');
  const mainSource = fs.readFileSync(mainPath, 'utf8');

  const decimalSnippet = extractSnippet(
    utilsSource,
    'function decimalToFractionDisplay(',
    'function showUndoToastGlobal('
  );
  const grammarSnippet = extractSnippet(
    utilsSource,
    'function normalizeIngredientSingularSpelling(',
    '/**\n * Make a span element editable'
  );
  const shoppingListSnippet = extractSnippet(
    mainSource,
    '// --- Shopping list amount helpers (tests extract this block) ---',
    '// --- End shopping list amount helpers ---'
  );

  const context = {
    console,
    window: {},
    getShoppingPlanSelectionLabel(entry) {
      if (!entry || typeof entry !== 'object') return '';
      const name = String(entry.name || '').trim();
      const variantName = String(entry.variantName || '').trim();
      if (!name) return '';
      if (!variantName || variantName.toLowerCase() === 'default') return name;
      return `${name} (${variantName})`;
    },
    formatShoppingPlanQuantity(quantity) {
      const numeric = Number(quantity);
      if (!Number.isFinite(numeric) || numeric <= 0) return '';
      return String(Number(numeric.toFixed(2)));
    },
  };

  vm.createContext(context);
  vm.runInContext(decimalSnippet, context, { filename: 'utils.decimal-display.js' });
  vm.runInContext(grammarSnippet, context, { filename: 'utils.ingredient-grammar.js' });

  if (typeof context.decimalToFractionDisplay === 'function') {
    context.window.decimalToFractionDisplay = context.decimalToFractionDisplay;
  }
  if (typeof context.parseNumericQuantityValue === 'function') {
    context.window.parseNumericQuantityValue = context.parseNumericQuantityValue;
  }
  if (typeof context.pluralizeEnglishNoun === 'function') {
    context.window.pluralizeEnglishNoun = context.pluralizeEnglishNoun;
  }

  vm.runInContext(ingredientDisplaySource, context, { filename: 'ingredientDisplay.js' });
  vm.runInContext(unitQuantityFormatSource, context, { filename: 'unitQuantityFormat.js' });
  vm.runInContext(favoriteEatsAmountKitSource, context, { filename: 'favoriteEatsAmountKit.js' });
  vm.runInContext(quantityDisplayPolicySource, context, {
    filename: 'quantityDisplayPolicy.js',
  });
  vm.runInContext(shoppingListSnippet, context, {
    filename: 'main.shopping-list-amount-helpers.js',
  });

  const helpers = context.window.__shoppingListAmountHelpers;
  if (!helpers) throw new Error('Shopping list amount helpers were not attached to window.');
  return helpers;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson} but got ${actualJson}`);
  }
}

function run() {
  const helpers = loadHelpers();

  assertEqual(helpers.normalizeShoppingListUnit('Fluid Ounces'), 'fl oz', 'fluid ounces normalize');
  assertEqual(helpers.normalizeShoppingListUnit('cans'), 'can', 'plural package units singularize');

  const massBase = helpers.convertShoppingListQuantityToMeasuredBase(20, 'oz');
  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase(massBase.family, massBase.baseQuantity),
    {
      family: 'mass',
      quantity: 1.25,
      unit: 'lb',
    },
    '20 oz converts to 1.25 lb display bucket'
  );

  const gallonBase = helpers.convertShoppingListQuantityToMeasuredBase(1, 'gallon');
  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase(gallonBase.family, gallonBase.baseQuantity),
    {
      family: 'volume',
      quantity: 1,
      unit: 'gal',
    },
    '1 gallon remains 1 gal'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 55),
    {
      family: 'volume',
      quantity: 0.25,
      unit: 'cup',
    },
    '55 ml rounds up to 1/4 cup in the fixed volume ladder'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 950),
    {
      family: 'volume',
      quantity: 4.5,
      unit: 'cup',
    },
    '950 ml rounds up to 4.5 cups (no pint/quart labels)'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 1900),
    {
      family: 'volume',
      quantity: 8.5,
      unit: 'cup',
    },
    '1900 ml (~8 cups) stays on cup ladder with ½-cup ceil below 16 cups'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 10 * 236.5882365),
    {
      family: 'volume',
      quantity: 10,
      unit: 'cup',
    },
    '10 cups equivalent stays 10 cups (not blunt 1 gal)'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 16 * 236.5882365),
    {
      family: 'volume',
      quantity: 1,
      unit: 'gal',
    },
    '16 cups equivalent switches to 1 gal'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 17 * 236.5882365),
    {
      family: 'volume',
      quantity: 1.5,
      unit: 'gal',
    },
    '17 cups equivalent ceils to next ½ gallon'
  );

  assertDeepEqual(
    helpers.getMeasuredDisplayFromBase('volume', 950, 'cooking'),
    {
      family: 'volume',
      quantity: 4,
      unit: 'cup',
    },
    '950 ml cooking ladder rounds to whole cups (vs shopping 4.5 cup ceil)'
  );

  assertDeepEqual(
    helpers.getMeasuredDisplayFromBase('volume', 950),
    helpers.getMeasuredDisplayFromBase('volume', 950, 'cooking'),
    'default measured display intent is cooking'
  );

  assertDeepEqual(
    helpers.getMeasuredDisplayFromBase('mass', 300, 'cooking'),
    {
      family: 'mass',
      quantity: 11,
      unit: 'oz',
    },
    '300 g cooking sub-lb uses nearest whole oz'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [
        {
          key: 'measured:mass',
          kind: 'measured',
          family: 'mass',
          baseQuantity: massBase.baseQuantity,
        },
      ],
    }),
    'foo (1¼ lb)',
    'single measured mass bucket renders with name-first display'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [{ key: 'selected', kind: 'selected', quantity: 2.5 }],
    }),
    'foo (2½)',
    'mixed quantities compact to unicode glyph output'
  );

  assertEqual(
    helpers.formatShoppingListDisplayDetailText({
      variantName: 'large',
      buckets: [{ key: 'count', kind: 'count', quantity: 2, unit: '', size: '' }],
    }),
    '2 large',
    'detail formatter keeps size variants in the amount text'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [{ key: 'unspecified', kind: 'unspecified', quantity: 3 }],
    }),
    'foo (some)',
    'unspecified recipe buckets render as some instead of a batch count'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [
        { key: 'unspecified', kind: 'unspecified', quantity: 1 },
        { key: 'exact:pinch|', kind: 'exact', quantity: 1, unit: 'pinch', size: '' },
        { key: 'exact:carton|', kind: 'exact', quantity: 1, unit: 'carton', size: '' },
        {
          key: 'measured:volume',
          kind: 'measured',
          family: 'volume',
          baseQuantity: gallonBase.baseQuantity,
        },
      ],
    }),
    'foo (some + 1 pinch + 1 carton + 1 gal)',
    'mixed bucket lines render some first before measured or packaged amounts'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'apples',
      buckets: [
        { key: 'count', kind: 'count', quantity: 12, unit: '', size: '' },
        { key: 'unspecified', kind: 'unspecified', quantity: 1 },
      ],
    }),
    'apples (some + 12)',
    'unspecified recipe lines stay literal while compatible numeric amounts remain summed'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'ginger',
      variantName: 'large',
      buckets: [{ key: 'unspecified', kind: 'unspecified', quantity: 1 }],
    }),
    'ginger (some large)',
    'size variants still appear alongside some for unspecified quantities'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [{ key: 'selected', kind: 'selected', quantity: 2 }],
    }),
    'foo (2)',
    'manual selection rows use parenthetical count display'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'ginger',
      variantName: 'pickled',
      buckets: [{ key: 'selected', kind: 'selected', quantity: 1 }],
    }),
    'pickled ginger (1)',
    'non-size variants stay in the ingredient name'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'ginger',
      variantName: 'large',
      buckets: [{ key: 'selected', kind: 'selected', quantity: 1 }],
    }),
    'ginger (1 large)',
    'size variants move into the amount text instead of the name'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'beans',
      variantName: 'cannellini',
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 1 },
        { key: 'exact:can|', kind: 'exact', quantity: 2, unit: 'can', size: '' },
      ],
    }),
    'cannellini beans (1 + 2 can)',
    'variant products stay on one line with packaging in the amount'
  );

  console.log('Shopping list amount tests passed.');
}

run();
