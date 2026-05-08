#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');
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
  const mainSource = fs.readFileSync(mainPath, 'utf8');

  const grammarSnippet = extractSnippet(
    utilsSource,
    'function normalizeIngredientSingularSpelling(',
    '/**\n * Make a span element editable'
  );
  const shoppingItemLabelSnippet = extractSnippet(
    mainSource,
    '// --- Shopping item label helpers (tests extract this block) ---',
    '// --- End shopping item label helpers ---'
  );

  const context = {
    console,
    window: {},
  };

  vm.createContext(context);
  vm.runInContext(grammarSnippet, context, { filename: 'utils.ingredient-grammar.js' });
  context.window.getIngredientNounDisplay = context.getIngredientNounDisplay;

  vm.runInContext(shoppingItemLabelSnippet, context, {
    filename: 'main.shopping-item-label-helpers.js',
  });

  const helpers = context.window.__shoppingItemLabelHelpers;
  if (!helpers) throw new Error('Shopping item label helpers were not attached to window.');
  return helpers;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function run() {
  const helpers = loadHelpers();

  assertEqual(
    helpers.getShoppingItemDisplayName({
      name: 'ale',
      singularIfUnspecified: false,
    }),
    'ales',
    'non-singular-if-unspecified shopping items render plural labels',
  );

  assertEqual(
    helpers.getShoppingItemDisplayName({
      name: 'beer',
      lemma: 'ale',
      singularIfUnspecified: false,
    }),
    'beers',
    'shopping item labels preserve typed display names when lemma differs',
  );

  assertEqual(
    helpers.getShoppingItemDisplayName({
      name: 'rice',
      singularIfUnspecified: false,
      isMassNoun: true,
    }),
    'rice',
    'mass nouns stay singular in shopping item labels',
  );

  console.log('Shopping item label tests passed.');
}

run();
