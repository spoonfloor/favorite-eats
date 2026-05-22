#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractBefore(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `Could not extract snippet between ${startMarker} and ${endMarker}.`,
    );
  }
  return source.slice(start, end);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createHarness({ deferredLoad = false } = {}) {
  const source = fs.readFileSync(mainPath, 'utf8');
  const hydrateSnippet = extractBefore(
    source,
    'async function hydrateShoppingStateFromDataService(options = {})',
    '\nfunction registerFavoriteEatsRemoteListUiRefreshHook',
  );
  let probeCalls = 0;
  let loadCalls = 0;
  let persistCalls = 0;
  const deferred = deferredLoad ? createDeferred() : null;
  const context = {
    console,
    window: {},
    probeCalls: () => probeCalls,
    loadCalls: () => loadCalls,
    persistCalls: () => persistCalls,
    recordPersist: () => {
      persistCalls += 1;
    },
  };
  context.window = context;
  context.window.dataService = {
    useSupabase: false,
    async getShoppingRevisions() {
      probeCalls += 1;
      return {
        planUpdatedAt: '2026-05-22T00:00:00.000Z',
        listSessionUpdatedAt: `2026-05-22T00:00:0${probeCalls}.000Z`,
      };
    },
    async loadShoppingState() {
      loadCalls += 1;
      if (deferred) await deferred.promise;
      return {
        plan: { version: 1, itemSelections: {}, recipeSelections: {} },
        shoppingListDoc: {
          version: 3,
          rows: [{ id: 'milk', sourceKey: 'milk', text: 'milk' }],
        },
      };
    },
  };
  context.window.favoriteEatsStore = {
    revisionsMatchProbe() {
      return false;
    },
    hasAuthoritativeSnapshot() {
      return true;
    },
    applyRemote() {
      return { outcome: 'applied' };
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `
var shoppingStateHydrationPromise = null;
var shoppingStateSnapshotLoaded = false;
var shoppingStateRemoteApplyGeneration = 0;
var shoppingListRowMutationEpoch = 0;
var shoppingListRowDataRpcInFlight = 0;
var shoppingPlanRemoteSaveInFlight = 0;
async function awaitShoppingListRowDataRpcDrain() {}
function buildShoppingHydrateApplyGuards() { return {}; }
function applyShoppingHydrateThroughStore() { return window.favoriteEatsStore.applyRemote(); }
function syncMainCachesFromFavoriteEatsStoreSnapshot() {}
function markFavoriteEatsRemoteShoppingAuthorityEstablished() {}
function scheduleShoppingHydrateStaleRetryCoalesced() {}
async function persistShoppingHydrateRemoteStateToMain() {
  recordPersist();
  return true;
}
${hydrateSnippet}
this.__hydrate = hydrateShoppingStateFromDataService;
`,
    context,
    { filename: 'main.hydrate-single-flight.js' },
  );
  return { context, deferred };
}

async function run() {
  {
    const { context } = createHarness();
    await context.__hydrate();
    await context.__hydrate();
    assert(
      context.probeCalls() === 2,
      'Sequential hydrates should run a fresh revision probe after success.',
    );
    assert(
      context.loadCalls() === 2,
      'Sequential hydrates should not reuse a settled load_shopping_state promise.',
    );
    assert(context.persistCalls() === 2, 'Sequential hydrates should apply twice.');
  }

  {
    const { context, deferred } = createHarness({ deferredLoad: true });
    const first = context.__hydrate();
    const second = context.__hydrate();
    await new Promise((resolve) => setImmediate(resolve));
    assert(
      context.probeCalls() === 1,
      `Concurrent hydrates should share the in-flight revision probe; got ${context.probeCalls()}.`,
    );
    assert(
      context.loadCalls() === 1,
      `Concurrent hydrates should share the in-flight load_shopping_state call; got ${context.loadCalls()}.`,
    );
    deferred.resolve();
    await Promise.all([first, second]);
    assert(context.persistCalls() === 1, 'Concurrent hydrates should apply once.');
  }

  console.log('Shopping hydrate single-flight tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
