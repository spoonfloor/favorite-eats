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
  return source.slice(start, end + endMarker.length);
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

function loadHelpers(localStorageSeed = {}) {
  const source = fs.readFileSync(mainPath, 'utf8');
  const snippet = extractSnippet(
    source,
    '// --- Shopping plan helpers (tests extract this block) ---',
    '// --- End shopping plan helpers ---'
  );
  const localStorage = createLocalStorageMock(localStorageSeed);
  const context = {
    console,
    localStorage,
    favoriteEatsDataServiceIsSupabaseActive: () => false,
    window: {},
  };
  vm.createContext(context);
  vm.runInContext(snippet, context, { filename: 'main.shopping-plan-helpers.js' });
  const helpers = context.window.__shoppingPlanHelpers;
  if (!helpers) throw new Error('Shopping plan helpers were not attached to window.');
  return { helpers, localStorage };
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

function run() {
  const { helpers } = loadHelpers();
  assertJsonEqual(
    helpers.createEmptyShoppingPlan(),
    {
      version: 1,
      itemSelections: {},
      recipeSelections: {},
      storeOrder: [],
      selectedStoreIds: [],
    },
    'empty shopping plan should include store order and selected stores'
  );

  assertJsonEqual(
    helpers.normalizeShoppingPlanStoreIdList([7, '2', 7, 0, -3, 'x', 4.9, null, 2]),
    [7, 2, 4],
    'store id list normalization should keep unique positive integer store ids'
  );

  assertJsonEqual(
    helpers.normalizeShoppingPlan({
      itemSelections: {},
      recipeSelections: {},
      storeOrder: ['9', 4, 'bad', 4, 1],
      selectedStoreIds: ['5', 9, 5, 0, 'nope'],
    }).storeOrder,
    [9, 4, 1],
    'shopping plan normalization should preserve normalized store order'
  );
  assertJsonEqual(
    helpers.normalizeShoppingPlan({
      itemSelections: {},
      recipeSelections: {},
      storeOrder: ['9', 4, 'bad', 4, 1],
      selectedStoreIds: ['5', 9, 5, 0, 'nope'],
    }).selectedStoreIds,
    [5, 9],
    'shopping plan normalization should preserve normalized selected store ids'
  );

  const {
    helpers: persistedHelpers,
    localStorage: persistedStorage,
  } = loadHelpers();
  persistedHelpers.setShoppingPlanStoreOrder(['12', 5, 12, 0, 'bad', 3]);
  assertJsonEqual(
    persistedHelpers.getShoppingPlanStoreOrder(),
    [12, 5, 3],
    'setShoppingPlanStoreOrder should return normalized persisted order'
  );
  assertJsonEqual(
    JSON.parse(persistedStorage.getItem('favoriteEats:shopping-plan:v1')),
    {
      version: 1,
      itemSelections: {},
      recipeSelections: {},
      storeOrder: [12, 5, 3],
      selectedStoreIds: [],
    },
    'persisted shopping plan should include storeOrder'
  );

  persistedHelpers.setShoppingPlanSelectedStoreIds(['11', 2, 11, -1, 'bad', 6]);
  assertJsonEqual(
    persistedHelpers.getShoppingPlanSelectedStoreIds(),
    [11, 2, 6],
    'setShoppingPlanSelectedStoreIds should return normalized persisted ids'
  );
  assertJsonEqual(
    JSON.parse(persistedStorage.getItem('favoriteEats:shopping-plan:v1')),
    {
      version: 1,
      itemSelections: {},
      recipeSelections: {},
      storeOrder: [12, 5, 3],
      selectedStoreIds: [11, 2, 6],
    },
    'persisted shopping plan should include selectedStoreIds'
  );

  const seeded = loadHelpers({
    'favoriteEats:shopping-plan:v1': JSON.stringify({
      version: 1,
      itemSelections: {},
      recipeSelections: {},
      storeOrder: [8, '2', 8, -1, 'oops'],
      selectedStoreIds: ['4', 4, 3, null, 'bad'],
    }),
  });
  assertJsonEqual(
    seeded.helpers.getShoppingPlanStoreOrder(),
    [8, 2],
    'loading stored shopping plan should scrub invalid storeOrder entries'
  );
  assertJsonEqual(
    seeded.helpers.getShoppingPlanSelectedStoreIds(),
    [4, 3],
    'loading stored shopping plan should scrub invalid selectedStoreIds entries'
  );

  console.log('Shopping plan store order tests passed.');
}

run();
