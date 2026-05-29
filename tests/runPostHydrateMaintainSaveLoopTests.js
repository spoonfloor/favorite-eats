#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');
const mainSource = fs.readFileSync(mainPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `Could not extract snippet between ${startMarker} and ${endMarker}.`,
    );
  }
  return source.slice(start, end);
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

async function run() {
  assert(
    mainSource.includes('function shoppingPlanPersistOptionsFromMaintain(options = {})'),
    'main.js should map post-hydrate maintain to skipRemoteSave plan writes.',
  );
  assert(
    /maintainShoppingPlanStorageWithDb\(\s*null,\s*\{\s*skipRemotePlanSave:\s*true\s*\}/.test(
      mainSource,
    ),
    'Remote plan refresh should run maintain without remote plan saves.',
  );
  assert(
    mainSource.includes('skipRemoteSave: true') &&
      mainSource.includes(
        'Shopping plan orphan prune after catalog variant delete failed',
      ),
    'Variant delete prune should stay local until the forced hydrate finishes.',
  );

  const helperSnippet = extractFunction(
    mainSource,
    'function shoppingPlanPersistOptionsFromMaintain(options = {})',
    '\nasync function reconcileShoppingPlanItemSelectionKeysWithDataService',
  );
  const maintainSnippet = extractFunction(
    mainSource,
    'async function maintainShoppingPlanStorageWithDb(db, options = {})',
    '\nasync function migrateShoppingIdentityAfterIngredientEditorSave({',
  );

  const remoteSaveCalls = [];
  const reconcileCalls = [];

  const context = {
    console,
    window: { dataService: { useSupabase: true } },
    favoriteEatsShouldUseSupabaseDataDoor: () => true,
    shouldUseRemoteShoppingState: () => true,
    getShoppingPlan: () => createEmptyShoppingPlan(),
    syncRecipePlannerServingsLocalCacheFromShoppingPlan: () => {},
    healShoppingListDocWithGeneratedFromPlan: async () => ({ planRows: null }),
    async reconcileShoppingPlanItemSelectionKeysWithDataService(
      planPersistOptions = {},
    ) {
      reconcileCalls.push(planPersistOptions);
      if (!planPersistOptions.skipRemoteSave) {
        remoteSaveCalls.push('reconcile');
      }
    },
    async pruneOrphanShoppingItemSelectionsWithDataService(
      planPersistOptions = {},
    ) {
      if (!planPersistOptions.skipRemoteSave) {
        remoteSaveCalls.push('prune');
      }
    },
  };
  context.window = context.window;

  vm.createContext(context);
  vm.runInContext(
    `
${helperSnippet}
${maintainSnippet}
this.__runMaintainHarness = maintainShoppingPlanStorageWithDb;
`,
    context,
    { filename: 'main.post-hydrate-maintain.js' },
  );

  reconcileCalls.length = 0;
  remoteSaveCalls.length = 0;
  await context.__runMaintainHarness(null, { skipRemotePlanSave: true });
  assert(
    reconcileCalls.length === 1 &&
      reconcileCalls[0].skipRemoteSave === true,
    'Post-hydrate maintain should pass skipRemoteSave through to reconcile.',
  );
  assert(
    remoteSaveCalls.length === 0,
    'Post-hydrate maintain must not trigger remote plan saves from reconcile/prune.',
  );

  reconcileCalls.length = 0;
  remoteSaveCalls.length = 0;
  await context.__runMaintainHarness(null, {});
  assert(
    reconcileCalls.length === 1 && !reconcileCalls[0].skipRemoteSave,
    'Default maintain should allow remote plan saves from reconcile.',
  );
  assert(
    remoteSaveCalls.length === 2,
    'Default maintain should still run remote reconcile/prune saves when requested.',
  );

  console.log('Post-hydrate maintain save loop tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
