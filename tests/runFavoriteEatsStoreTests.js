#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const storePath = path.join(projectRoot, 'js', 'favoriteEatsStore.js');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    );
  }
}

function assertTruthy(value, message) {
  if (!value) throw new Error(message);
}

function run() {
  const storeSource = fs.readFileSync(storePath, 'utf8');
  const context = { window: {}, console, sessionStorage: createSessionStorage() };
  vm.createContext(context);
  vm.runInContext(storeSource, context, { filename: 'favoriteEatsStore.js' });

  const store = context.window.favoriteEatsStore;
  if (!store) throw new Error('favoriteEatsStore missing');

  store.__resetForTests();

  assertEqual(
    store.compareRevisionPair(
      { planUpdatedAt: null, listSessionUpdatedAt: null },
      { planUpdatedAt: '2026-05-01T00:00:00.000Z', listSessionUpdatedAt: null },
    ),
    'seed',
    'empty local revisions seed from remote',
  );

  store.applyRemote({
    plan: { version: 1, itemSelections: {}, recipeSelections: {}, storeOrder: [], selectedStoreIds: [] },
    listDoc: { version: 3, rows: [] },
    revisions: {
      planUpdatedAt: '2026-05-01T00:00:00.000Z',
      listSessionUpdatedAt: '2026-05-01T00:00:01.000Z',
    },
    guards: {},
  });

  const older = store.applyRemote({
    plan: { version: 1, itemSelections: { a: { key: 'a' } }, recipeSelections: {}, storeOrder: [], selectedStoreIds: [] },
    revisions: {
      planUpdatedAt: '2026-04-30T00:00:00.000Z',
      listSessionUpdatedAt: '2026-04-30T00:00:01.000Z',
    },
    guards: {},
  });
  assertEqual(older.outcome, 'rejected_older', 'reject older revision payload');

  const equal = store.applyRemote({
    plan: { version: 1, itemSelections: { b: { key: 'b' } }, recipeSelections: {}, storeOrder: [], selectedStoreIds: [] },
    revisions: {
      planUpdatedAt: '2026-05-01T00:00:00.000Z',
      listSessionUpdatedAt: '2026-05-01T00:00:01.000Z',
    },
    guards: {},
  });
  assertEqual(equal.outcome, 'skipped_equal', 'equal revision does not clobber snapshot');

  const blocked = store.applyRemote(
    {
      plan: { version: 1, itemSelections: {}, recipeSelections: {}, storeOrder: [], selectedStoreIds: [] },
      revisions: {
        planUpdatedAt: '2026-05-02T00:00:00.000Z',
        listSessionUpdatedAt: '2026-05-02T00:00:01.000Z',
      },
      guards: {
        applyGenerationAtFetchStart: 1,
        currentApplyGeneration: 2,
        mutationEpochAtFetch: 0,
        currentMutationEpoch: 0,
        currentRowRpcInFlight: 0,
        currentPlanSaveInFlight: 0,
      },
    },
    { force: true },
  );
  assertEqual(blocked.outcome, 'blocked', 'apply generation mismatch blocks apply');
  assertEqual(blocked.reason, 'apply_generation', 'blocked reason is apply_generation');

  store.__resetForTests();
  store.applyRemote({
    plan: { version: 1, itemSelections: {}, recipeSelections: {}, storeOrder: [], selectedStoreIds: [] },
    revisions: {
      planUpdatedAt: '2026-05-02T00:00:00.000Z',
      listSessionUpdatedAt: '2026-05-02T00:00:01.000Z',
    },
    guards: {},
  });
  const seeded = store.applyRemote({
    revisions: { planUpdatedAt: null, listSessionUpdatedAt: null },
    guards: {},
  });
  assertEqual(seeded.outcome, 'rejected_older', 'null remote revision never beats local');

  store.__resetForTests();
  const nullSeed = store.applyRemote({
    plan: { version: 1, itemSelections: {}, recipeSelections: {}, storeOrder: [], selectedStoreIds: [] },
    revisions: { planUpdatedAt: '2026-05-03T00:00:00.000Z', listSessionUpdatedAt: null },
    guards: {},
  });
  assertEqual(nullSeed.outcome, 'applied', 'null local accepts first remote seed');

  store.__resetForTests();
  store.applyRemote({
    plan: { version: 1, itemSelections: { x: { key: 'x' } }, recipeSelections: {}, storeOrder: [], selectedStoreIds: [] },
    revisions: { planUpdatedAt: '2026-05-04T00:00:00.000Z', listSessionUpdatedAt: null },
    guards: {},
  });
  const echo = store.applyRemote(
    {
      plan: { version: 1, itemSelections: { y: { key: 'y' } }, recipeSelections: {}, storeOrder: [], selectedStoreIds: [] },
      revisions: { planUpdatedAt: '2026-05-04T00:00:00.000Z', listSessionUpdatedAt: null },
      guards: {},
    },
    { postWriteEcho: true },
  );
  assertEqual(echo.outcome, 'applied', 'post-write echo applies at equal revision');
  assertTruthy(
    echo.snapshot.plan.itemSelections.y,
    'post-write echo updates authoritative plan',
  );

  store.__resetForTests();
  store.applyRemote({
    plan: { version: 1, itemSelections: {}, recipeSelections: {}, storeOrder: [], selectedStoreIds: [] },
    revisions: { planUpdatedAt: '2026-05-05T00:00:00.000Z', listSessionUpdatedAt: null },
    guards: {},
  });
  assertTruthy(context.sessionStorage.getItem('favoriteEats:store:v1'), 'persist after apply');

  context.window.favoriteEatsStore = undefined;
  vm.runInContext(storeSource, context, { filename: 'favoriteEatsStore-restore.js' });
  const restored = context.window.favoriteEatsStore;
  assertTruthy(restored.hasAuthoritativeSnapshot(), 'sessionStorage restore on init');

  console.log('favoriteEatsStore tests passed.');
}

function createSessionStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

run();
