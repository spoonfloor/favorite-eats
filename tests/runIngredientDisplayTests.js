#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');
const ingredientDisplayPath = path.join(projectRoot, 'js', 'ingredientDisplay.js');
const unitQuantityFormatPath = path.join(projectRoot, 'js', 'unitQuantityFormat.js');
const quantityDisplayPolicyPath = path.join(projectRoot, 'js', 'quantityDisplayPolicy.js');

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
  const quantityDisplayPolicySource = fs.readFileSync(quantityDisplayPolicyPath, 'utf8');

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

  const context = {
    window: {},
    console,
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
  vm.runInContext(quantityDisplayPolicySource, context, { filename: 'quantityDisplayPolicy.js' });

  const helpers = context.window.ingredientDisplay;
  if (!helpers) throw new Error('Ingredient display helpers were not attached to window.');
  return { helpers, win: context.window };
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function run() {
  const { helpers, win } = loadHelpers();

  const inlineCases = [
    {
      label: 'variant ordering uses canonical name display',
      input: { quantity: 0.75, unit: 'lb', name: 'chuck', variant: 'Impossible' },
      expected: '¾ lb Impossible chuck',
    },
    {
      label: 'structured quantities format with unicode fraction output',
      input: { quantityMin: 0.75, quantityMax: 0.75, unit: 'lb', name: 'chuck', variant: 'Impossible' },
      expected: '¾ lb Impossible chuck',
    },
    {
      label: 'free-text quantity is preserved while canonical name ordering remains',
      input: { quantity: 'about 1/2', unit: 'cup', name: 'stock', variant: 'chicken' },
      expected: 'about ½ cup chicken stock',
    },
    {
      label: 'parenthetical note and optional tag are appended once',
      input: {
        quantity: 1,
        unit: 'cup',
        name: 'parsley',
        parentheticalNote: 'packed',
        isOptional: true,
      },
      expected: '1 cup parsley (packed, optional)',
    },
    {
      label: 'substitutes reuse the shared formatter',
      input: {
        quantity: 1,
        unit: 'lb',
        name: 'beef',
        substitutes: [{ quantity: 0.75, unit: 'lb', name: 'chuck', variant: 'Impossible' }],
      },
      expected: '1 lb beef or ¾ lb Impossible chuck',
    },
    {
      label: 'unit fallback pluralization handles bunch correctly',
      input: { quantity: 2, unit: 'bunch', name: 'scallion' },
      expected: '2 bunches scallion',
    },
    {
      label: 'sub-1 quantity keeps unit singular',
      input: { quantity: 0.25, unit: 'bunch', name: 'cilantro' },
      expected: '¼ bunch cilantro',
    },
    {
      label: 'linked recipe title is never ingredient-pluralized for qty > 1',
      input: {
        isRecipe: true,
        linkedRecipeId: 42,
        linkedRecipeTitle: 'bar',
        recipeText: 'bar',
        name: 'bar',
        lemma: 'bar',
        quantity: 2,
      },
      expected: '2 bar',
    },
  ];

  inlineCases.forEach((testCase) => {
    const actual = helpers.formatIngredientText(testCase.input);
    assertEqual(actual, testCase.expected, testCase.label);
  });

  win.unitsDisplayMap = {
    snaptest: {
      code: 'snaptest',
      abbrev: 'snaptest',
      name_singular: 'snaptest',
      name_plural: 'snaptests',
      category: 'small',
      quantityRoundingPreset: 'custom',
      quantityRoundingStepDenominator: 4,
      quantityRoundingMode: 'nearest',
    },
  };

  assertEqual(
    helpers.formatIngredientText({
      quantity: 1.111,
      unit: 'snaptest',
      name: 'salt',
    }),
    '1 snaptest salt',
    'cooking intent snaps custom unit to nearest quarter (1.111 → 1)',
  );
  assertEqual(
    helpers.formatIngredientText(
      {
        quantity: 1.111,
        unit: 'snaptest',
        name: 'salt',
      },
      { intent: 'shopping' },
    ),
    '1¼ snaptests salt',
    'shopping intent uses ceil snap and plural unit for snapped amount > 1',
  );

  win.unitsDisplayMap = {};

  win.unitsDisplayMap = {
    sysct: {
      code: 'sysct',
      abbrev: 'ct',
      name_singular: 'count',
      name_plural: 'counts',
      category: 'count',
      quantityRoundingPreset: 'system_measured',
      quantityRoundingStepDenominator: null,
      quantityRoundingMode: null,
    },
  };
  assertEqual(
    helpers.formatIngredientText({ quantity: 1.4, unit: 'sysct', name: 'item' }),
    '1 ct item',
    'non-measured system_measured snaps like whole-number step',
  );
  assertEqual(
    helpers.formatIngredientText({ quantity: 1.6, unit: 'sysct', name: 'item' }),
    '2 cts item',
    'non-measured system_measured plural unit when quantity > 1',
  );
  win.unitsDisplayMap = {};

  const needLineCases = [
    {
      label: 'you will need uses shared canonical quantity and name',
      input: { quantity: 0.75, unit: 'lb', name: 'chuck', variant: 'Impossible' },
      expected: 'Impossible chuck (¾ lb)',
    },
    {
      label: 'you will need optional text stays inside parentheses',
      input: { quantity: 1, unit: 'clove', name: 'garlic', isOptional: true },
      expected: 'garlic (1 clove, optional)',
    },
  ];

  needLineCases.forEach((testCase) => {
    const actual = helpers.formatNeedLineText(testCase.input);
    assertEqual(actual, testCase.expected, testCase.label);
  });

  const parts = helpers.getIngredientDisplayParts({
    quantity: 0.75,
    unit: 'lb',
    name: 'chuck',
    variant: 'Impossible',
    prepNotes: 'thawed',
  });

  assertEqual(parts.leadText, '¾ lb', 'display parts expose canonical lead text');
  assertEqual(parts.nameText, 'Impossible chuck', 'display parts expose canonical name text');
  assertEqual(parts.text, '¾ lb Impossible chuck, thawed', 'display parts expose canonical full text');
  assertEqual(helpers.getUnitDisplay('bunch', 2), 'bunches', 'unit display pluralizes bunch correctly');
  assertEqual(helpers.getUnitDisplay('bunch', 0.25), 'bunch', 'unit display keeps bunch singular for sub-1 quantity');

  console.log('Ingredient display tests passed.');
}

run();
