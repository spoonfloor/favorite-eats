#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');

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

function loadGrammarHelpers() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const grammarSnippet = extractSnippet(
    utilsSource,
    'function normalizeIngredientSingularSpelling(',
    '/**\n * Make a span element editable',
  );

  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(grammarSnippet, context, { filename: 'utils.ingredient-grammar.js' });
  return context.window;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    );
  }
}

function run() {
  const win = loadGrammarHelpers();
  const {
    getShoppingCatalogItemDisplayName,
    buildShoppingCatalogLabelIndex,
    buildShoppingCatalogTypeaheadNamePool,
    resolveShoppingCatalogItemByLabel,
  } = win;

  if (typeof getShoppingCatalogItemDisplayName !== 'function') {
    throw new Error('getShoppingCatalogItemDisplayName missing');
  }

  assertEqual(
    getShoppingCatalogItemDisplayName({
      name: 'tomato',
      lemma: 'tomato',
      singularIfUnspecified: false,
      isMassNoun: false,
      pluralOverride: '',
    }),
    'tomatoes',
    'countable item pluralizes for list-style display',
  );

  assertEqual(
    getShoppingCatalogItemDisplayName({
      name: 'rice',
      lemma: 'rice',
      singularIfUnspecified: false,
      isMassNoun: true,
      pluralOverride: '',
    }),
    'rice',
    'mass noun stays singular',
  );

  assertEqual(
    getShoppingCatalogItemDisplayName({
      name: 'flour',
      lemma: 'flour',
      singularIfUnspecified: true,
      isMassNoun: false,
      pluralOverride: '',
    }),
    'flour',
    'singularIfUnspecified keeps singular without qty',
  );

  assertEqual(
    getShoppingCatalogItemDisplayName({
      name: 'fish',
      lemma: 'fish',
      singularIfUnspecified: false,
      isMassNoun: false,
      pluralOverride: 'fish',
    }),
    'fish',
    'plural override is honored',
  );

  const catalogByName = new Map();
  const tomatoItem = {
    name: 'tomato',
    baseKey: 'tomato',
    lemma: 'tomato',
    singularIfUnspecified: false,
    isMassNoun: false,
    pluralOverride: '',
  };
  catalogByName.set('tomato', tomatoItem);
  const labelIndex = buildShoppingCatalogLabelIndex(catalogByName);

  assertEqual(
    resolveShoppingCatalogItemByLabel(catalogByName, labelIndex, 'tomatoes'),
    tomatoItem,
    'typed plural resolves to catalog row',
  );

  assertEqual(
    resolveShoppingCatalogItemByLabel(catalogByName, labelIndex, 'Tomatoes'),
    tomatoItem,
    'typed plural resolves case-insensitively',
  );

  if (typeof buildShoppingCatalogTypeaheadNamePool !== 'function') {
    throw new Error('buildShoppingCatalogTypeaheadNamePool missing');
  }

  const peaItem = {
    name: 'pea',
    baseKey: 'pea',
    lemma: 'pea',
    singularIfUnspecified: false,
    isMassNoun: false,
    pluralOverride: '',
  };
  const flourItem = {
    name: 'flour',
    baseKey: 'flour',
    lemma: 'flour',
    singularIfUnspecified: true,
    isMassNoun: false,
    pluralOverride: '',
  };
  const typeaheadCatalog = new Map([
    ['pea', peaItem],
    ['flour', flourItem],
    ['tomato', tomatoItem],
  ]);
  assertEqual(
    JSON.stringify(buildShoppingCatalogTypeaheadNamePool(typeaheadCatalog)),
    JSON.stringify(['flour', 'peas', 'tomatoes']),
    'type-along name pool uses entity pluralization settings',
  );

  const typeaheadLabelIndex = buildShoppingCatalogLabelIndex(typeaheadCatalog);
  assertEqual(
    JSON.stringify(
      buildShoppingCatalogTypeaheadNamePool(
        typeaheadCatalog,
        typeaheadLabelIndex,
        ['pea', 'tomato', 'milk'],
      ),
    ),
    JSON.stringify(['flour', 'milk', 'peas', 'tomatoes']),
    'type-along pool pluralizes raw ingredient names via catalog metadata',
  );

  console.log('runStoreAislePluralizationTests: all passed');
}

run();
