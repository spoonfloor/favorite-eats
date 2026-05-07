// The data service "door".
//
// This is the ONLY entry point UI code may use to read/write app data.
// UI code calls window.dataService.<method>() — the door dispatches to the
// correct active adapter. UI does not import
// adapters directly.
//
// Architecture note: docs/supabase-architecture.md.
//
// Adapter selection:
//   - Supabase only.

(function initDataService(global) {
  if (!global) return;

  let supabaseAdapter = null;
  let supabaseConfig = {};

  function configureSupabase(opts = {}) {
    supabaseConfig = { ...supabaseConfig, ...opts };
    supabaseAdapter = null;
  }

  function getSupabaseAdapter() {
    if (supabaseAdapter) return supabaseAdapter;
    if (typeof global.createSupabaseAdapter !== 'function') {
      throw new Error(
        'Supabase adapter is not loaded. Make sure ' +
          'js/data/adapters/supabaseAdapter.js loads before js/data/index.js.',
      );
    }
    supabaseAdapter = global.createSupabaseAdapter(supabaseConfig);
    return supabaseAdapter;
  }

  global.dataService = {
    useSupabase: true,
    configureSupabase,
    get activeAdapter() {
      return 'supabase';
    },
    createRecipe: (request) => getSupabaseAdapter().createRecipe(request),
    deleteRecipe: (request) => getSupabaseAdapter().deleteRecipe(request),
    createSize: (request) => getSupabaseAdapter().createSize(request),
    createTag: (request) => getSupabaseAdapter().createTag(request),
    deleteTag: (request) => getSupabaseAdapter().deleteTag(request),
    editTag: (request) => getSupabaseAdapter().editTag(request),
    createUnit: (request) => getSupabaseAdapter().createUnit(request),
    editUnit: (request) => getSupabaseAdapter().editUnit(request),
    removeUnit: (request) => getSupabaseAdapter().removeUnit(request),
    countRecipesUsingUnit: (request) =>
      getSupabaseAdapter().countRecipesUsingUnit(request),
    listRecipesUsingUnit: (request) =>
      getSupabaseAdapter().listRecipesUsingUnit(request),
    editSize: (request) => getSupabaseAdapter().editSize(request),
    removeSize: (request) => getSupabaseAdapter().removeSize(request),
    countRecipesUsingSize: (request) =>
      getSupabaseAdapter().countRecipesUsingSize(request),
    listRecipesUsingSize: (request) =>
      getSupabaseAdapter().listRecipesUsingSize(request),
    createStore: (request) => getSupabaseAdapter().createStore(request),
    deleteStore: (request) => getSupabaseAdapter().deleteStore(request),
    editStore: (request) => getSupabaseAdapter().editStore(request),
    saveStoreLayout: (request) => getSupabaseAdapter().saveStoreLayout(request),
    saveRecipe: (request) => getSupabaseAdapter().saveRecipe(request),
    buildRecipeEditorPreflightHelpers: () =>
      getSupabaseAdapter().buildRecipeEditorPreflightHelpers(),
    loadShoppingState: () => getSupabaseAdapter().loadShoppingState(),
    saveShoppingState: (request) => getSupabaseAdapter().saveShoppingState(request),
    setShoppingListRowChecked: (request) =>
      getSupabaseAdapter().setShoppingListRowChecked(request),
    setShoppingListRowText: (request) =>
      getSupabaseAdapter().setShoppingListRowText(request),
    appendManualShoppingListRow: (request) =>
      getSupabaseAdapter().appendManualShoppingListRow(request),
    subscribePlanChanges: (handlers) =>
      getSupabaseAdapter().subscribePlanChanges(handlers),
    subscribeListChanges: (handlers) =>
      getSupabaseAdapter().subscribeListChanges(handlers),
    subscribeRecipeCatalogChanges: (handlers) =>
      getSupabaseAdapter().subscribeRecipeCatalogChanges(handlers),
    subscribeCatalogReferenceChanges: (handlers) =>
      getSupabaseAdapter().subscribeCatalogReferenceChanges(handlers),
    subscribeRecipePresence: (handlers) =>
      getSupabaseAdapter().subscribeRecipePresence(handlers),
    subscribeAppActivityPresence: (handlers) =>
      getSupabaseAdapter().subscribeAppActivityPresence(handlers),
    listRecipes: () => getSupabaseAdapter().listRecipes(),
    loadRecipeDetail: (recipeId) => getSupabaseAdapter().loadRecipeDetail(recipeId),
    loadTagUsage: (tagId) => getSupabaseAdapter().loadTagUsage(tagId),
    loadTypeaheadPools: (options) => getSupabaseAdapter().loadTypeaheadPools(options),
    listTags: () => getSupabaseAdapter().listTags(),
    listUnits: () => getSupabaseAdapter().listUnits(),
    listSizes: () => getSupabaseAdapter().listSizes(),
    listStores: () => getSupabaseAdapter().listStores(),
    loadStoreDetail: (request) => getSupabaseAdapter().loadStoreDetail(request),
    lookupShoppingItemByName: (request) =>
      getSupabaseAdapter().lookupShoppingItemByName(request),
    findOrCreateShoppingItem: (request) =>
      getSupabaseAdapter().findOrCreateShoppingItem(request),
    pruneOrphanedIngredientSynonyms: () =>
      getSupabaseAdapter().pruneOrphanedIngredientSynonyms(),
    ensureIngredientBaseVariants: () =>
      getSupabaseAdapter().ensureIngredientBaseVariants(),
    saveShoppingCatalogItem: (request) =>
      getSupabaseAdapter().saveShoppingCatalogItem(request),
    lookupIngredientNameByLemma: (request) =>
      getSupabaseAdapter().lookupIngredientNameByLemma(request),
    listIngredientTagNames: () =>
      getSupabaseAdapter().listIngredientTagNames(),
    listShoppingItems: () => getSupabaseAdapter().listShoppingItems(),
    loadShoppingItemDetail: (request) =>
      getSupabaseAdapter().loadShoppingItemDetail(request),
    deleteShoppingItem: (request) =>
      getSupabaseAdapter().deleteShoppingItem(request),
    listShoppingItemRecipeUsage: (itemName) =>
      getSupabaseAdapter().listShoppingItemRecipeUsage(itemName),
    loadShoppingItemVariantUsage: (request) =>
      getSupabaseAdapter().loadShoppingItemVariantUsage(request),
    listShoppingListHomeLocations: (sourceKeys) =>
      getSupabaseAdapter().listShoppingListHomeLocations(sourceKeys),
    isIngredientVariantDeprecated: (request) =>
      getSupabaseAdapter().isIngredientVariantDeprecated(request),
    listShoppingPlanRecipeItems: (selectedRecipes) =>
      getSupabaseAdapter().listShoppingPlanRecipeItems(selectedRecipes),
    listShoppingListAssignments: (request) =>
      getSupabaseAdapter().listShoppingListAssignments(request),
    listShoppingListRecipeSummaries: (selectedRecipes) =>
      getSupabaseAdapter().listShoppingListRecipeSummaries(selectedRecipes),
    listShoppingListPlanRows: (request) =>
      getSupabaseAdapter().listShoppingListPlanRows(request),
    resolveCanonicalIngredientForShoppingReconcile: (request) =>
      getSupabaseAdapter().resolveCanonicalIngredientForShoppingReconcile(request),
    resolveIngredientForStaleShoppingAggregateKey: (request) =>
      getSupabaseAdapter().resolveIngredientForStaleShoppingAggregateKey(request),
    listIngredientVariantsWithIngredientsByIds: (request) =>
      getSupabaseAdapter().listIngredientVariantsWithIngredientsByIds(request),
    listIngredientVariantsByIngredientIds: (request) =>
      getSupabaseAdapter().listIngredientVariantsByIngredientIds(request),
    resolvePersistedShoppingPlanItemKey: (request) =>
      getSupabaseAdapter().resolvePersistedShoppingPlanItemKey(request),
  };
})(typeof window !== 'undefined' ? window : globalThis);
