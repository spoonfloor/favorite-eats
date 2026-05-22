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
    throw new Error(
      `Could not extract snippet between ${startMarker} and ${endMarker}.`,
    );
  }
  return source.slice(start, end + endMarker.length);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const minimalPlanHelpers = `
function createEmptyShoppingPlan() {
  return {
    version: 1,
    itemSelections: {},
    recipeSelections: {},
    recipeSelectionRoots: {},
    storeOrder: [],
    selectedStoreIds: [],
  };
}
function normalizeShoppingPlanStoreOrder(raw) {
  return Array.isArray(raw) ? raw : [];
}
function normalizeShoppingPlanSelectedStoreIds(raw) {
  return Array.isArray(raw) ? raw : [];
}
function normalizeShoppingPlan(raw) {
  const plan = raw && typeof raw === 'object' ? raw : createEmptyShoppingPlan();
  return {
    version: 1,
    itemSelections:
      plan.itemSelections && typeof plan.itemSelections === 'object'
        ? plan.itemSelections
        : {},
    recipeSelections:
      plan.recipeSelections && typeof plan.recipeSelections === 'object'
        ? plan.recipeSelections
        : {},
    recipeSelectionRoots:
      plan.recipeSelectionRoots && typeof plan.recipeSelectionRoots === 'object'
        ? plan.recipeSelectionRoots
        : {},
    storeOrder: normalizeShoppingPlanStoreOrder(plan.storeOrder),
    selectedStoreIds: normalizeShoppingPlanSelectedStoreIds(plan.selectedStoreIds),
  };
}
`;

function loadGuardHarness(overrides = {}) {
  const source = fs.readFileSync(mainPath, 'utf8');
  const guardSnippet = extractSnippet(
    source,
    '// --- Shopping state save guard helpers (tests extract this block) ---',
    '// --- End shopping state save guard helpers ---',
  );
  const selectionStart = source.indexOf('function shoppingPlanHasSelections(plan) {');
  const selectionEnd = source.indexOf(
    'function shouldUseRemoteShoppingState()',
    selectionStart,
  );
  if (selectionStart === -1 || selectionEnd === -1) {
    throw new Error('Could not extract shoppingPlanHasSelections snippet.');
  }
  const selectionSnippet = source.slice(selectionStart, selectionEnd);

  const hydrateCalls = [];
  const toasts = [];

  const context = {
    console,
    window: {},
    uiToast: (msg) => {
      toasts.push(String(msg || ''));
    },
    scheduleFavoriteEatsRemoteShoppingPlanHydrate: (opts) => {
      hydrateCalls.push(opts || {});
    },
    getShoppingListDocFromStoreOrState: (state) =>
      state && state.shoppingListDoc ? state.shoppingListDoc : { rows: [] },
    normalizeShoppingListDoc: (doc) => ({
      version: 1,
      rows: Array.isArray(doc?.rows) ? doc.rows : [],
    }),
    favoriteEatsDataServiceIsSupabaseActive: () => true,
    ...overrides,
  };

  context.window = context;
  context.window.favoriteEatsStore = overrides.favoriteEatsStore || null;
  context.window.dataService = overrides.dataService || {
    useSupabase: true,
    saveShoppingState: async () => ({}),
    loadShoppingState: async () => ({
      plan: createEmptyShoppingPlan(),
      shoppingListDoc: { rows: [] },
    }),
  };

  vm.createContext(context);
  vm.runInContext(
    `
var shoppingStateSnapshotLoaded = false;
var favoriteEatsRemoteShoppingAuthorityEstablished = false;
function isFavoriteEatsRemoteShoppingAuthorityEstablished() {
  return !!favoriteEatsRemoteShoppingAuthorityEstablished;
}
function shouldUseRemoteShoppingState() {
  return (
    favoriteEatsDataServiceIsSupabaseActive() &&
    window.dataService &&
    typeof window.dataService.saveShoppingState === 'function'
  );
}
${minimalPlanHelpers}
${selectionSnippet}
${guardSnippet}
this.__guards = window.__shoppingStateSaveGuardHelpers;
this.__state = {
  setSnapshotLoaded(value) { shoppingStateSnapshotLoaded = !!value; },
  setAuthorityEstablished(value) {
    favoriteEatsRemoteShoppingAuthorityEstablished = !!value;
  },
};
`,
    context,
    { filename: 'main.shopping-state-save-guards.js' },
  );

  const guards = context.__guards;
  if (!guards) {
    throw new Error('Shopping state save guard helpers were not loaded.');
  }
  return { guards, context, hydrateCalls, toasts, state: context.__state };
}

function makePlanWithItem() {
  return {
    version: 1,
    itemSelections: {
      'iv:1': {
        key: 'iv:1',
        name: 'Milk',
        variantName: 'default',
        quantity: 1,
      },
    },
    recipeSelections: {},
    recipeSelectionRoots: {},
    storeOrder: [],
    selectedStoreIds: [],
  };
}

async function run() {
  {
    const { guards, state } = loadGuardHarness();
    state.setSnapshotLoaded(false);
    state.setAuthorityEstablished(false);
    const blocked = guards.assertHydratedBeforePlanWrite();
    assert(!blocked.allowed, 'Unhydrated remote tab should block plan writes.');
    assert(
      blocked.reason === 'plan_not_hydrated',
      'Unhydrated block should name plan_not_hydrated.',
    );
  }

  {
    const { guards, state } = loadGuardHarness();
    state.setSnapshotLoaded(true);
    const allowed = guards.assertHydratedBeforePlanWrite();
    assert(allowed.allowed, 'Hydrated snapshot should allow plan writes.');
  }

  {
    const { guards, state, hydrateCalls } = loadGuardHarness({
      dataService: {
        useSupabase: true,
        saveShoppingState: async () => ({}),
        async loadShoppingState() {
          return { plan: makePlanWithItem(), shoppingListDoc: { rows: [] } };
        },
      },
    });
    state.setSnapshotLoaded(true);
    const blocked = await guards.assertSafePlanSnapshotBeforeRemoteSave(
      createEmptyShoppingPlan(),
    );
    assert(
      !blocked.allowed,
      'Empty local plan should not overwrite non-empty server plan.',
    );
    assert(
      blocked.reason === 'empty_plan_would_overwrite_server',
      'Empty overwrite block should name empty_plan_would_overwrite_server.',
    );
    assert(hydrateCalls.length === 1, 'Blocked empty plan save should force hydrate.');
  }

  {
    const { guards, state } = loadGuardHarness({
      dataService: {
        useSupabase: true,
        saveShoppingState: async () => ({}),
        async loadShoppingState() {
          return { plan: makePlanWithItem(), shoppingListDoc: { rows: [] } };
        },
      },
    });
    state.setSnapshotLoaded(true);
    const allowed = await guards.assertSafePlanSnapshotBeforeRemoteSave(
      createEmptyShoppingPlan(),
      { allowEmptyPlanRemoteSave: true },
    );
    assert(
      allowed.allowed,
      'Intentional empty plan save should pass when allowEmptyPlanRemoteSave is set.',
    );
  }

  {
    const { guards, state, hydrateCalls } = loadGuardHarness({
      dataService: {
        useSupabase: true,
        saveShoppingState: async () => ({}),
        async loadShoppingState() {
          return {
            plan: createEmptyShoppingPlan(),
            shoppingListDoc: {
              rows: [{ id: 'r1', text: 'Milk', sourceKey: 'iv:1' }],
            },
          };
        },
      },
    });
    state.setSnapshotLoaded(true);
    const blocked = await guards.assertSafeListSnapshotBeforeRemoteSave({
      rows: [],
    });
    assert(
      !blocked.allowed,
      'Empty local list should not overwrite non-empty server list.',
    );
    assert(
      blocked.reason === 'empty_list_would_overwrite_server',
      'Empty list overwrite block should name empty_list_would_overwrite_server.',
    );
    assert(hydrateCalls.length === 1, 'Blocked empty list save should force hydrate.');
  }

  console.log('Shopping state save guard tests passed.');
}

function createEmptyShoppingPlan() {
  return {
    version: 1,
    itemSelections: {},
    recipeSelections: {},
    recipeSelectionRoots: {},
    storeOrder: [],
    selectedStoreIds: [],
  };
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
