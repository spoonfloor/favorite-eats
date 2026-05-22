/**
 * Recipes hub screen loader (Slice 4 + 7 bootstrap).
 */
(function favoriteEatsRecipesScreenModule(global) {
  if (!global) return;

  const hub = global.favoriteEatsHubBootstrap;

  async function fetchRecipesScreenPayload() {
    if (
      !global.dataService ||
      typeof global.dataService.loadRecipesScreen !== 'function'
    ) {
      throw new Error('dataService.loadRecipesScreen is not available.');
    }
    global.dataService.useSupabase = true;

    let probeRevisions = null;
    if (typeof global.dataService.getShoppingRevisions === 'function') {
      try {
        probeRevisions = await global.dataService.getShoppingRevisions();
      } catch (err) {
        console.warn('Recipes screen: revision probe failed:', err);
      }
    }

    const catalogToken = probeRevisions?.catalogUpdatedAt || null;
    const cache = global.favoriteEatsCatalogCache;
    if (
      catalogToken &&
      cache &&
      typeof cache.readRecipesListCache === 'function'
    ) {
      const cached = cache.readRecipesListCache(catalogToken);
      if (cached && Array.isArray(cached.recipes)) {
        return {
          fromCache: true,
          revisions: probeRevisions,
          recipes: cached.recipes,
        };
      }
    }

    let planUpdatedAt = null;
    const store = global.favoriteEatsStore;
    if (store && typeof store.getSnapshot === 'function') {
      const snapshot = store.getSnapshot();
      if (snapshot?.revisions?.planUpdatedAt) {
        planUpdatedAt = snapshot.revisions.planUpdatedAt;
      }
    }

    const payload = await global.dataService.loadRecipesScreen(
      planUpdatedAt ? { planUpdatedAt } : {},
    );
    if (
      cache &&
      typeof cache.writeRecipesListCache === 'function' &&
      payload?.revisions?.catalogUpdatedAt &&
      Array.isArray(payload.recipes)
    ) {
      cache.writeRecipesListCache(
        payload.revisions.catalogUpdatedAt,
        payload.recipes,
      );
    }
    return payload;
  }

  async function bootstrapRecipesHub(options = {}) {
    const shouldUseSupabase = hub
      ? hub.shouldUseSupabaseHub(options)
      : !!global.dataService;
    const apply = global.favoriteEatsScreenApply;
    if (global.dataService) {
      global.dataService.useSupabase = true;
    }

    if (
      shouldUseSupabase &&
      typeof fetchRecipesScreenPayload === 'function' &&
      apply &&
      typeof apply.applyRecipesScreenPayload === 'function'
    ) {
      try {
        const screenPayload = await fetchRecipesScreenPayload();
        const applied = await apply.applyRecipesScreenPayload(screenPayload);
        if (applied && Array.isArray(applied.recipes)) {
          return { ok: true, recipeRows: applied.recipes, fromScreen: true };
        }
      } catch (screenErr) {
        console.warn(
          'Recipes page: screen load failed; falling back to legacy fetch:',
          screenErr,
        );
      }
    }

    if (
      shouldUseSupabase &&
      global.dataService &&
      typeof global.dataService.listRecipes === 'function'
    ) {
      try {
        const recipeRows = await global.dataService.listRecipes();
        if (options.shouldUseRemoteShoppingState && options.hydrateShoppingState) {
          try {
            await options.hydrateShoppingState();
          } catch (hydrateErr) {
            console.warn(
              'Recipes page: could not load plan/list from server:',
              hydrateErr,
            );
            return { ok: false, hydrateFailed: true };
          }
        }
        return { ok: true, recipeRows, fromScreen: false };
      } catch (err) {
        if (typeof options.reportPrefetchFailure === 'function') {
          options.reportPrefetchFailure('listRecipes', err);
        }
        return { ok: false, error: err };
      }
    }

    return { ok: false };
  }

  global.favoriteEatsRecipesScreen = {
    fetchRecipesScreenPayload,
    bootstrapRecipesHub,
  };
})(typeof window !== 'undefined' ? window : globalThis);
