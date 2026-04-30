// The data service "door".
//
// This is the ONLY entry point UI code may use to read/write app data.
// UI code calls window.dataService.<method>() — the door dispatches to the
// correct adapter (SQLite today, Supabase eventually). UI does not import
// adapters directly.
//
// Methods are added one capability at a time per the migration plan in
// docs/supabase-migration-plan-plain.md.
//
// Adapter selection:
//   - Web default: Supabase for migrated reads unless `?adapter=sqlite`.
//   - Electron default: SQLite unless `?adapter=supabase` (local DB remains primary).
//   - window.dataService.useSupabase toggles the active adapter at runtime.
// The flag can still be flipped in DevTools for ad-hoc testing.

(function initDataService(global) {
  if (!global) return;

  function computeInitialUseSupabase() {
    try {
      const params = new URLSearchParams(global.location?.search || '');
      const a = (params.get('adapter') || '').toLowerCase();
      if (a === 'sqlite') return false;
      if (global.electronAPI) return a === 'supabase';
      return true;
    } catch (_) {
      return true;
    }
  }

  const adapters = {
    sqlite: null,
    supabase: null,
  };

  let supabaseConfig = {};

  function setSqliteDb(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('setSqliteDb requires a sql.js Database instance.');
    }
    if (typeof global.createSqliteAdapter !== 'function') {
      throw new Error(
        'setSqliteDb: createSqliteAdapter is not loaded. Make sure ' +
          'js/data/adapters/sqliteAdapter.js loads before js/data/index.js.',
      );
    }
    adapters.sqlite = global.createSqliteAdapter(db);
  }

  function configureSupabase(opts = {}) {
    supabaseConfig = { ...supabaseConfig, ...opts };
    adapters.supabase = null;
  }

  function getSupabaseAdapter() {
    if (adapters.supabase) return adapters.supabase;
    if (typeof global.createSupabaseAdapter !== 'function') {
      throw new Error(
        'Supabase adapter is not loaded. Make sure ' +
          'js/data/adapters/supabaseAdapter.js loads before js/data/index.js.',
      );
    }
    adapters.supabase = global.createSupabaseAdapter(supabaseConfig);
    return adapters.supabase;
  }

  function getSqliteAdapter() {
    if (adapters.sqlite) return adapters.sqlite;
    throw new Error(
      'SQLite adapter is not initialized. Call window.dataService.setSqliteDb(db) ' +
        'after the database is ready.',
    );
  }

  function getActiveAdapter() {
    return global.dataService && global.dataService.useSupabase
      ? getSupabaseAdapter()
      : getSqliteAdapter();
  }

  global.dataService = {
    useSupabase: computeInitialUseSupabase(),
    setSqliteDb,
    configureSupabase,
    get activeAdapter() {
      return this.useSupabase ? 'supabase' : 'sqlite';
    },
    createRecipe: (request) => getActiveAdapter().createRecipe(request),
    deleteRecipe: (request) => getActiveAdapter().deleteRecipe(request),
    createSize: (request) => getActiveAdapter().createSize(request),
    createTag: (request) => getActiveAdapter().createTag(request),
    deleteTag: (request) => getActiveAdapter().deleteTag(request),
    editTag: (request) => getActiveAdapter().editTag(request),
    createUnit: (request) => getActiveAdapter().createUnit(request),
    editUnit: (request) => getActiveAdapter().editUnit(request),
    removeUnit: (request) => getActiveAdapter().removeUnit(request),
    editSize: (request) => getActiveAdapter().editSize(request),
    removeSize: (request) => getActiveAdapter().removeSize(request),
    createStore: (request) => getActiveAdapter().createStore(request),
    deleteStore: (request) => getActiveAdapter().deleteStore(request),
    editStore: (request) => getActiveAdapter().editStore(request),
    listRecipes: () => getActiveAdapter().listRecipes(),
    loadRecipeDetail: (recipeId) => getActiveAdapter().loadRecipeDetail(recipeId),
    loadTagUsage: (tagId) => getActiveAdapter().loadTagUsage(tagId),
    loadTypeaheadPools: (options) => getActiveAdapter().loadTypeaheadPools(options),
    listTags: () => getActiveAdapter().listTags(),
    listUnits: () => getActiveAdapter().listUnits(),
    listSizes: () => getActiveAdapter().listSizes(),
    listStores: () => getActiveAdapter().listStores(),
    loadStoreDetail: (request) => getActiveAdapter().loadStoreDetail(request),
    lookupShoppingItemByName: (request) =>
      getActiveAdapter().lookupShoppingItemByName(request),
    lookupIngredientNameByLemma: (request) =>
      getActiveAdapter().lookupIngredientNameByLemma(request),
    listIngredientTagNames: () =>
      getActiveAdapter().listIngredientTagNames(),
    listShoppingItems: () => getActiveAdapter().listShoppingItems(),
    loadShoppingItemDetail: (request) =>
      getActiveAdapter().loadShoppingItemDetail(request),
    listShoppingItemRecipeUsage: (itemName) =>
      getActiveAdapter().listShoppingItemRecipeUsage(itemName),
    loadShoppingItemVariantUsage: (request) =>
      getActiveAdapter().loadShoppingItemVariantUsage(request),
    listShoppingListHomeLocations: (sourceKeys) =>
      getActiveAdapter().listShoppingListHomeLocations(sourceKeys),
    isIngredientVariantDeprecated: (request) =>
      getActiveAdapter().isIngredientVariantDeprecated(request),
    listShoppingPlanRecipeItems: (selectedRecipes) =>
      getActiveAdapter().listShoppingPlanRecipeItems(selectedRecipes),
    listShoppingListAssignments: (request) =>
      getActiveAdapter().listShoppingListAssignments(request),
    listShoppingListRecipeSummaries: (selectedRecipes) =>
      getActiveAdapter().listShoppingListRecipeSummaries(selectedRecipes),
    listShoppingListPlanRows: (request) =>
      getActiveAdapter().listShoppingListPlanRows(request),
  };
})(typeof window !== 'undefined' ? window : globalThis);
