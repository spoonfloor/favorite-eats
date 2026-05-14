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
const mainPath = path.join(projectRoot, 'js', 'main.js');
const adapterPath = path.join(projectRoot, 'js', 'data', 'adapters', 'supabaseAdapter.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function makeJsonResponse(rows) {
  return {
    ok: true,
    status: 200,
    async json() {
      return rows;
    },
    async text() {
      return JSON.stringify(rows);
    },
  };
}

function createFetchMock() {
  const ingredientRows = [
    { id: 1, name: 'bar', is_deprecated: 0, is_hidden: 0, is_food: 1 },
    { id: 2, name: 'beef', is_deprecated: 0, is_hidden: 0, is_food: 1 },
  ];
  const recipeIngredientRows = [
    {
      id: 10,
      section_id: null,
      sort_order: 1,
      quantity: 1,
      unit: 'cup',
      ingredients: { id: 1, name: 'bar', ingredient_variants: [] },
    },
    {
      id: 11,
      section_id: null,
      sort_order: 2,
      quantity: 1,
      unit: 'lb',
      ingredients: { id: 2, name: 'beef', ingredient_variants: [] },
    },
  ];

  return async function fetchMock(url) {
    const parsed = new URL(url);
    const pathWithQuery = `${parsed.pathname.replace(/^\/rest\/v1\//, '')}${parsed.search}`;

    if (pathWithQuery.startsWith('ingredients?select=id,name,variant')) {
      return makeJsonResponse(ingredientRows);
    }
    if (pathWithQuery.startsWith('ingredient_variants?select=')) {
      return makeJsonResponse([]);
    }
    if (pathWithQuery.startsWith('tags?select=')) {
      return makeJsonResponse([]);
    }
    if (pathWithQuery.startsWith('ingredient_variant_tag_map?select=')) {
      return makeJsonResponse([]);
    }
    if (pathWithQuery.startsWith('recipe_ingredient_map?recipe_id=eq.1&select=')) {
      return makeJsonResponse(recipeIngredientRows);
    }
    if (pathWithQuery.startsWith('recipes?select=') && pathWithQuery.includes('id=eq.1')) {
      return makeJsonResponse([
        {
          id: 1,
          title: 'Foo',
          summary: '',
          servings_default: 1,
          servings_min: null,
          servings_max: null,
        },
      ]);
    }

    return makeJsonResponse([]);
  };
}

function createContext() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const ingredientDisplaySource = fs.readFileSync(ingredientDisplayPath, 'utf8');
  const unitQuantityFormatSource = fs.readFileSync(unitQuantityFormatPath, 'utf8');
  const quantityDisplayPolicySource = fs.readFileSync(quantityDisplayPolicyPath, 'utf8');
  const mainSource = fs.readFileSync(mainPath, 'utf8');
  const adapterSource = fs.readFileSync(adapterPath, 'utf8');

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
    URL,
    localStorage: null,
    sessionStorage: null,
    formatShoppingPlanQuantity(quantity) {
      const numeric = Number(quantity);
      if (!Number.isFinite(numeric) || numeric <= 0) return '';
      return String(Number(numeric.toFixed(2)));
    },
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(decimalSnippet, context, { filename: 'utils.decimal-display.js' });
  vm.runInContext(grammarSnippet, context, { filename: 'utils.ingredient-grammar.js' });
  vm.runInContext(ingredientDisplaySource, context, { filename: 'ingredientDisplay.js' });
  vm.runInContext(unitQuantityFormatSource, context, { filename: 'unitQuantityFormat.js' });
  vm.runInContext(quantityDisplayPolicySource, context, {
    filename: 'quantityDisplayPolicy.js',
  });
  vm.runInContext(shoppingListSnippet, context, {
    filename: 'main.shopping-list-amount-helpers.js',
  });
  vm.runInContext(adapterSource, context, { filename: 'supabaseAdapter.js' });

  if (typeof context.createSupabaseAdapter !== 'function') {
    throw new Error('Supabase adapter factory was not attached.');
  }
  return context;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

async function run() {
  const context = createContext();
  const adapter = context.createSupabaseAdapter({
    url: 'https://example.test',
    anonKey: 'anon',
    fetchImpl: createFetchMock(),
  });

  const rows = await adapter.listShoppingListPlanRows({
    selectedRecipes: [{ recipeId: 1, title: 'Foo', quantity: 1 }],
  });
  const byName = new Map(rows.map((row) => [row.name, row]));

  assertEqual(byName.get('bar')?.text, 'bar (1 cup)', 'Supabase path keeps 1 cup as 1 cup');
  assertEqual(byName.get('beef')?.text, 'beef (1 lb)', 'Supabase path keeps 1 lb as 1 lb');

  console.log('Supabase shopping list plan row tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
