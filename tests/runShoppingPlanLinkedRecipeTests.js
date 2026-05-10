#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function createLocalStorageMock(seed = {}) {
  const store = new Map(
    Object.entries(seed).map(([key, value]) => [String(key), String(value)])
  );
  return {
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function loadShoppingPlanFunctions({ recipes = {}, servingsOverrides = {} } = {}) {
  const source = fs.readFileSync(mainPath, 'utf8');
  const snippet = extractSnippet(
    source,
    '// --- Shopping plan helpers (tests extract this block) ---',
    'function detectPageIdFromBody() {'
  );

  const localStorage = createLocalStorageMock({
    'favoriteEats:test:recipe-planner-servings': JSON.stringify(servingsOverrides),
  });

  const context = {
    console,
    localStorage,
    favoriteEatsShouldUseSupabaseDataDoor() {
      return false;
    },
    favoriteEatsDataServiceIsSupabaseActive() {
      return false;
    },
    parseNumericQuantityValue(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    normalizeShoppingListUnit(unit) {
      return String(unit || '').trim().toLowerCase();
    },
    convertShoppingListQuantityToMeasuredBase() {
      return null;
    },
    formatShoppingListDisplayDetailText({ buckets = [] } = {}) {
      return buckets
        .map((bucket) => {
          if (bucket?.kind === 'measured') return String(bucket.baseQuantity || 0);
          return String(bucket?.quantity || 0);
        })
        .join(' + ');
    },
    formatShoppingListDisplayRow({ label = '', buckets = [] } = {}) {
      return `${label} (${context.formatShoppingListDisplayDetailText({ buckets })})`;
    },
    getShoppingListIngredientLabel(name, variantName = '') {
      return variantName ? `${variantName} ${name}` : String(name || '').trim();
    },
    getVisibleIngredientNamePool() {
      return ['onion', 'garlic', 'salt', 'pepper'];
    },
    orderShoppingListSelectedStoreIds() {
      return [];
    },
    getShoppingListAssignmentCandidates() {
      return [];
    },
    buildGroupedShoppingListRows(items) {
      return Array.isArray(items) ? items : [];
    },
    window: {
      favoriteEatsStorageKeys: {
        recipePlannerServings: 'favoriteEats:test:recipe-planner-servings',
      },
      normalizeActionableQuantity(value) {
        return value;
      },
      bridge: {
        loadRecipeFromDB(_db, recipeId) {
          const recipe = recipes[String(Math.trunc(Number(recipeId)))];
          if (!recipe) throw new Error(`Unknown recipe ${recipeId}`);
          return clone(recipe);
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(snippet, context, {
    filename: 'main.shopping-plan-linked-recipe-tests.js',
  });

  return context;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertJsonEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`
  );
}

function rowMap(rows) {
  return new Map(
    (Array.isArray(rows) ? rows : [])
      .filter((row) => String(row?.rowType || '').trim().toLowerCase() !== 'section')
      .map((row) => [String(row?.key || ''), row])
      .filter(([key]) => key)
  );
}

function sortedEntries(map, select) {
  return Array.from(map.values())
    .sort((a, b) => String(a?.key || '').localeCompare(String(b?.key || '')))
    .map(select);
}

function runNestedLinkedRecipeTest() {
  const recipes = {
    1: {
      id: 1,
      title: 'Root',
      servings: { default: 4 },
      sections: [
        {
          ingredients: [
            { name: 'onion', quantity: 1 },
            { isRecipe: true, linkedRecipeId: 2, quantity: 3 },
          ],
        },
      ],
    },
    2: {
      id: 2,
      title: 'Sauce',
      servings: { default: 2 },
      sections: [
        {
          ingredients: [
            { name: 'garlic', quantity: 1 },
            { isRecipe: true, linkedRecipeId: 3, quantity: 2 },
          ],
        },
      ],
    },
    3: {
      id: 3,
      title: 'Stock',
      servings: { default: 5 },
      sections: [
        {
          ingredients: [
            { name: 'salt', quantity: 0.5 },
            { isRecipe: true, linkedRecipeId: 4, quantity: 2 },
          ],
        },
      ],
    },
    4: {
      id: 4,
      title: 'Spice Mix',
      servings: { default: 1 },
      sections: [
        {
          ingredients: [{ name: 'pepper', quantity: 1 }],
        },
      ],
    },
  };

  const context = loadShoppingPlanFunctions({
    recipes,
    servingsOverrides: {
      1: 8,
      2: 4,
      3: 10,
    },
  });

  context.setShoppingPlanRecipeSelection({
    recipeId: 1,
    title: 'Root',
    quantity: 2,
  });

  const derivedRows = rowMap(context.getRecipeDerivedShoppingPlanRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(derivedRows, (row) => [row.key, row.quantity]),
    [
      ['garlic', 24],
      ['onion', 4],
      ['salt', 48],
    ],
    'derived rows should include linked recipe ingredients through depth two and stop before depth three'
  );
  assert(!derivedRows.has('pepper'), 'derived rows should exclude linked recipes beyond depth two');

  const selectionRows = rowMap(context.getShoppingPlanSelectionRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(selectionRows, (row) => [
      row.key,
      row.detailText,
      (Array.isArray(row.contributionRows) ? row.contributionRows : []).map((entry) => ({
        title: entry.title,
        detailText: entry.detailText,
      })),
    ]),
    [
      ['garlic', '24', [{ title: 'Sauce', detailText: '24' }]],
      ['onion', '4', [{ title: 'Root', detailText: '4' }]],
      ['salt', '48', [{ title: 'Stock', detailText: '48' }]],
    ],
    'selection rows should attribute nested ingredient contributions to the recipe where each ingredient lives'
  );
  assert(!selectionRows.has('pepper'), 'selection rows should exclude linked recipes beyond depth two');
}

function runCycleGuardTest() {
  const recipes = {
    10: {
      id: 10,
      title: 'Cycle Root',
      servings: { default: 2 },
      sections: [
        {
          ingredients: [
            { name: 'shallot', quantity: 1 },
            { isRecipe: true, linkedRecipeId: 11, quantity: 2 },
          ],
        },
      ],
    },
    11: {
      id: 11,
      title: 'Loop Child',
      servings: { default: 1 },
      sections: [
        {
          ingredients: [
            { name: 'thyme', quantity: 1 },
            { isRecipe: true, linkedRecipeId: 10, quantity: 3 },
          ],
        },
      ],
    },
  };

  const context = loadShoppingPlanFunctions({ recipes });
  context.setShoppingPlanRecipeSelection({
    recipeId: 10,
    title: 'Cycle Root',
    quantity: 1,
  });

  const derivedRows = rowMap(context.getRecipeDerivedShoppingPlanRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(derivedRows, (row) => [row.key, row.quantity]),
    [
      ['shallot', 1],
      ['thyme', 2],
    ],
    'cycle guard should prevent revisiting ancestor recipes through linked recipe chains'
  );
}

function runHiddenAlternateIngredientSelectionTest() {
  const recipes = {
    21: {
      id: 21,
      title: 'Alternate Root',
      servings: { default: 1 },
      sections: [
        {
          ingredients: [
            { name: 'onion', quantity: 1 },
            { name: 'bar', quantity: 2, isAlt: true },
          ],
        },
      ],
    },
  };

  const context = loadShoppingPlanFunctions({ recipes });
  context.setShoppingPlanRecipeSelection({
    recipeId: 21,
    title: 'Alternate Root',
    quantity: 1,
  });

  const derivedRows = rowMap(context.getRecipeDerivedShoppingPlanRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(derivedRows, (row) => [row.key, row.quantity]),
    [
      ['bar', 2],
      ['onion', 1],
    ],
    'derived rows should keep alternate ingredients even when not in the browse pool'
  );

  const selectionRows = rowMap(context.getShoppingPlanSelectionRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(selectionRows, (row) => [row.key, row.detailText]),
    [
      ['bar', '2'],
      ['onion', '1'],
    ],
    'selection rows should include recipe-sourced alternate ingredients even when hidden from the browse pool'
  );
}

function run() {
  runNestedLinkedRecipeTest();
  runCycleGuardTest();
  runHiddenAlternateIngredientSelectionTest();
  console.log('Shopping plan linked recipe tests passed.');
}

run();
