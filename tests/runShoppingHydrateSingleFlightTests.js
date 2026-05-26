#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');
const recipesScreenSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'screens', 'recipes.js'),
  'utf8',
);
const screenApplySource = fs.readFileSync(
  path.join(projectRoot, 'js', 'favoriteEatsScreenApply.js'),
  'utf8',
);

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

function createHarness({
  deferredLoad = false,
  storeRevisionsMatch = false,
  storeSnapshot = null,
} = {}) {
  const source = fs.readFileSync(mainPath, 'utf8');
  const fastPathSnippet = extractBefore(
    source,
    'function shouldUseShoppingStoreRevisionProbeFastPath(probeRevisions, snapshot)',
    '\nasync function persistShoppingHydrateRemoteStateToMain',
  );
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
      return !!storeRevisionsMatch;
    },
    hasAuthoritativeSnapshot() {
      return true;
    },
    getSnapshot() {
      return (
        storeSnapshot || {
          plan: { version: 1, itemSelections: {}, recipeSelections: {} },
          listDoc: null,
          revisions: {},
        }
      );
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
function shoppingPlanHasContentSelections(plan) {
  return !!(
    plan &&
    (
      Object.keys(plan.itemSelections || {}).length ||
      Object.keys(plan.recipeSelections || {}).length ||
      Object.keys(plan.recipeSelectionRoots || {}).length
    )
  );
}
function shoppingListDocHasPersistedRows(doc) {
  return !!(doc && Array.isArray(doc.rows) && doc.rows.length);
}
${fastPathSnippet}
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
  assert(
    recipesScreenSource.includes('function shoppingPlanHasContentSelections') &&
      recipesScreenSource.includes('hasUsableCachedPlan') &&
      recipesScreenSource.includes('(!includePlan || hasUsableCachedPlan)') &&
      recipesScreenSource.includes(
        'if (hasUsableCachedPlan && snapshot?.revisions?.planUpdatedAt)',
      ),
    'Recipes screen cache should not skip plan payload when the cached store plan has no content.',
  );

  assert(
    screenApplySource.includes('function shoppingPlanHasContentSelections') &&
      screenApplySource.includes('screenPayload.fromCache || screenPayload.planUnchanged') &&
      screenApplySource.includes(
        'shoppingPlanHasContentSelections(snapshot.plan)',
      ),
    'Recipes screen apply should not mark an empty cached plan authoritative for a matching revision.',
  );

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

  {
    const { context } = createHarness({
      storeRevisionsMatch: true,
      storeSnapshot: {
        plan: {
          version: 1,
          itemSelections: {},
          recipeSelections: {},
          recipeSelectionRoots: {},
        },
        listDoc: { version: 3, rows: [{ id: 'milk', text: 'milk' }] },
        revisions: {
          planUpdatedAt: '2026-05-22T00:00:00.000Z',
          listSessionUpdatedAt: '2026-05-22T00:00:01.000Z',
        },
      },
    });
    await context.__hydrate();
    assert(
      context.loadCalls() === 1,
      'Hydrate should not trust a matching revision probe when the stored plan has no content.',
    );
    assert(context.persistCalls() === 1, 'Hydrate should apply the loaded remote state.');
  }

  console.log('Shopping hydrate single-flight tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
