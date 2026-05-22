#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end + endMarker.length);
}

function loadHelpers() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const grammarStart = utilsSource.indexOf(
    'function normalizeIngredientSingularSpelling(',
  );
  const grammarEnd = utilsSource.indexOf(
    '/**\n * Make a span element editable',
    grammarStart,
  );
  if (grammarStart === -1 || grammarEnd === -1 || grammarEnd <= grammarStart) {
    throw new Error('Could not extract ingredient grammar helpers from utils.js.');
  }
  const grammarSnippet = utilsSource.slice(grammarStart, grammarEnd);
  const source = fs.readFileSync(mainPath, 'utf8');
  const snippet = extractSnippet(
    source,
    '// --- Shopping browse labeling helpers (tests extract this block) ---',
    '// --- End shopping browse labeling helpers ---',
  );
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(grammarSnippet, context, {
    filename: 'utils.ingredient-grammar.js',
  });
  vm.runInContext(snippet, context, {
    filename: 'main.shopping-browse-labeling-helpers.js',
  });
  const helpers = context.window.__shoppingBrowseLabelHelpers;
  if (!helpers) throw new Error('Shopping browse labeling helpers were not attached to window.');
  return helpers;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual:   ${actual}`);
  }
}

function assertJsonEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}

function run() {
  const helpers = loadHelpers();

  const item = {
    name: 'Milk',
    locationAtHome: 'fridge',
    variantHomeLocations: [
      { variant: 'skim', homeLocation: 'fridge' },
      { variant: 'oat', homeLocation: 'pantry' },
      { variant: 'chocolate', homeLocation: 'freezer' },
    ],
  };

  assertEqual(
    helpers.formatShoppingBrowseItemLabel('Milk', item, {}),
    'Milk',
    'items with no active search or location filter should keep the plain label',
  );

  assertEqual(
    helpers.formatShoppingBrowseItemLabel('Milk', item, { searchQuery: 'mil' }),
    'Milk',
    'base-name search matches should keep the plain item label',
  );

  assertEqual(
    helpers.formatShoppingBrowseItemLabel('Milk', item, { searchQuery: 'oa' }),
    'Milk (oat)',
    'single variant search matches should show item plus variant',
  );

  assertEqual(
    helpers.formatShoppingBrowseItemLabel('Milk', item, { searchQuery: 'k' }),
    'Milk',
    'multiple matching variants should fall back to the plain item label',
  );

  const fooItem = {
    name: 'foo',
    lemma: 'foo',
    singularIfUnspecified: false,
    isMassNoun: false,
    pluralOverride: '',
  };
  assertEqual(
    helpers.getShoppingBrowseMatchInfo(fooItem, { searchQuery: 'foos' })
      .baseMatched,
    true,
    'plural search needles should match singular catalog rows',
  );
  assertEqual(
    helpers.formatShoppingBrowseItemLabel('foos', fooItem, {
      searchQuery: 'foos',
    }),
    'foos',
    'plural search matches should keep the list display label',
  );

  assertEqual(
    helpers.formatShoppingBrowseItemLabel('Milk', item, { locationIds: ['fridge'] }),
    'Milk',
    'location filters should keep the plain item label when the base row matches',
  );

  assertEqual(
    helpers.formatShoppingBrowseItemLabel('Milk', item, { locationIds: ['pantry'] }),
    'Milk (oat)',
    'location filters should show item plus variant when only one named variant matches',
  );

  assertEqual(
    helpers.formatShoppingBrowseItemLabel('Milk', item, {
      searchQuery: 'choc',
      locationIds: ['freezer'],
    }),
    'Milk (chocolate)',
    'combined search and location filters should keep the specific matching variant label',
  );

  assertJsonEqual(
    helpers.getShoppingBrowseLocationIds(item),
    ['fridge', 'pantry', 'freezer'],
    'browse location ids should include base and variant home locations once each',
  );

  const inheritHomeItem = {
    name: 'Milk',
    locationAtHome: 'fridge',
    variantHomeLocations: [{ variant: 'oat', homeLocation: 'none' }],
  };

  assertEqual(
    helpers.formatShoppingBrowseItemLabel('Milk', inheritHomeItem, {
      searchQuery: 'oa',
      locationIds: ['fridge'],
    }),
    'Milk (oat)',
    'named variants without their own home location should inherit the base item home for filters',
  );

  assertJsonEqual(
    helpers.getShoppingBrowseLocationIds(inheritHomeItem),
    ['fridge'],
    'inherited variant homes should not add duplicate location ids',
  );

  assertEqual(
    helpers.formatShoppingBrowsePlannerRemoveLabel('basil', 'default'),
    'basil',
    'base/default variant remove label should omit parentheses',
  );
  assertEqual(
    helpers.formatShoppingBrowsePlannerRemoveLabel('basil', 'any'),
    'basil',
    'any variant remove label should omit parentheses',
  );
  assertEqual(
    helpers.formatShoppingBrowsePlannerRemoveLabel('basil', 'dried'),
    'dried basil',
    'named variant remove label should reverse order without parentheses',
  );
  assertEqual(
    helpers.formatShoppingBrowsePlannerRemoveLabel('basil', 'fresh'),
    'fresh basil',
    'named variant remove label should read naturally',
  );
}

run();
