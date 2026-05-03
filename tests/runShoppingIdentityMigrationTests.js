#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');
const PLAN_KEY = 'favoriteEats:shopping-plan:v1';
const SEP = '\x1e';

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
    Object.entries(seed).map(([key, value]) => [String(key), String(value)]),
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

function makePlan(itemSelections) {
  return {
    version: 1,
    itemSelections,
    recipeSelections: {},
    storeOrder: [],
    selectedStoreIds: [],
  };
}

function loadMigration(plan) {
  const source = fs.readFileSync(mainPath, 'utf8');
  const snippet = extractSnippet(
    source,
    'const SHOPPING_PLAN_LEGACY_KEY_SEP',
    'function patchShoppingListDocForRewrittenSelectionKeys',
  );
  const localStorage = createLocalStorageMock({
    [PLAN_KEY]: JSON.stringify(plan),
  });
  const context = {
    console,
    localStorage,
    window: {},
    favoriteEatsDataServiceIsSupabaseActive: () => false,
    INGREDIENT_BASE_VARIANT_NAME: 'default',
    normalizeNamedIngredientVariant: (value) => String(value || '').trim(),
    getShoppingPlanItemSelections: () =>
      plan && plan.itemSelections && typeof plan.itemSelections === 'object'
        ? plan.itemSelections
        : {},
  };
  vm.createContext(context);
  vm.runInContext(
    `${snippet}\nthis.__collectShoppingIdentityMigration = collectShoppingPlanEntriesToRewriteForIngredientIdentity;`,
    context,
    { filename: 'main.shopping-identity-migration.js' },
  );
  if (typeof context.__collectShoppingIdentityMigration !== 'function') {
    throw new Error('Shopping identity migration helper was not loaded.');
  }
  return context.__collectShoppingIdentityMigration;
}

function assertJsonEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}

function runCase({
  label,
  itemSelections,
  oldDisplayName,
  newDisplayName,
  prevNamedRows,
  nextNamedRows,
  expectedExtract,
}) {
  const collect = loadMigration(makePlan(itemSelections));
  const result = collect({
    db: null,
    oldDisplayName,
    newDisplayName,
    prevNamedRows,
    nextNamedRows,
    hasVariantTable: true,
  });
  assertJsonEqual(result.extract, expectedExtract, label);
}

function run() {
  runCase({
    label: 'base-name rename should rewrite aggregate selection keys',
    itemSelections: {
      [`000${SEP}aaa`]: {
        key: `000${SEP}aaa`,
        name: '000',
        variantName: 'aaa',
        quantity: 1,
      },
    },
    oldDisplayName: '000',
    newDisplayName: '111',
    prevNamedRows: [{ value: 'aaa' }],
    nextNamedRows: [{ value: 'aaa' }],
    expectedExtract: [
      {
        oldKey: `000${SEP}aaa`,
        newKey: `111${SEP}aaa`,
        name: '111',
        variantName: 'aaa',
      },
    ],
  });

  runCase({
    label: 'variant rename should rewrite aggregate selection keys',
    itemSelections: {
      [`000${SEP}aaa`]: {
        key: `000${SEP}aaa`,
        name: '000',
        variantName: 'aaa',
        quantity: 1,
      },
    },
    oldDisplayName: '000',
    newDisplayName: '000',
    prevNamedRows: [{ value: 'aaa', variantId: 101 }],
    nextNamedRows: [{ value: 'bbb', variantId: 101 }],
    expectedExtract: [
      {
        oldKey: `000${SEP}aaa`,
        newKey: `000${SEP}bbb`,
        name: '000',
        variantName: 'bbb',
      },
    ],
  });

  runCase({
    label: 'base and variant rename should rewrite aggregate selection keys',
    itemSelections: {
      [`000${SEP}aaa`]: {
        key: `000${SEP}aaa`,
        name: '000',
        variantName: 'aaa',
        quantity: 1,
      },
    },
    oldDisplayName: '000',
    newDisplayName: '111',
    prevNamedRows: [{ value: 'aaa', variantId: 101 }],
    nextNamedRows: [{ value: 'bbb', variantId: 101 }],
    expectedExtract: [
      {
        oldKey: `000${SEP}aaa`,
        newKey: `111${SEP}bbb`,
        name: '111',
        variantName: 'bbb',
      },
    ],
  });

  runCase({
    label: 'variant rename should recover iv selections when Supabase recreated ids',
    itemSelections: {
      'iv:101': {
        key: 'iv:101',
        name: '000',
        variantName: 'aaa',
        quantity: 1,
        ingredientVariantId: 101,
      },
    },
    oldDisplayName: '000',
    newDisplayName: '000',
    prevNamedRows: [{ value: 'aaa', variantId: 101 }],
    nextNamedRows: [{ value: 'bbb' }],
    expectedExtract: [
      {
        oldKey: 'iv:101',
        newKey: `000${SEP}bbb`,
        name: '000',
        variantName: 'bbb',
      },
    ],
  });
}

try {
  run();
  console.log('Shopping identity migration tests passed.');
} catch (err) {
  console.error(err);
  process.exit(1);
}
