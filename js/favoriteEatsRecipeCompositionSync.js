/**
 * Catalog recipe composition sync — module-scoped refresh for recipe-derived plan display.
 *
 * Recipe-derived Items quantities are read-model data keyed on catalog composition
 * (recipe ingredients, links, servings). When composition changes, bump the read model
 * and run composition hooks. This path must not wholesale-replace plan selections.
 *
 * See docs/spammable-input-charter.md — migrated stepper fields stay on plan Realtime;
 * derived tails refresh here only.
 */
(function favoriteEatsRecipeCompositionSyncModule(global) {
  if (!global) return;

  /** Tables whose rows define how selected recipes expand into shopping ingredients. */
  const COMPOSITION_TABLES = new Set([
    'recipe_ingredient_map',
    'recipe_ingredient_substitutes',
    'recipe_subrecipe_links',
    'recipe_ingredient_headings',
    'recipes',
  ]);

  /** @type {Array<(payload?: object) => Promise<void> | void>} */
  const compositionUiRefreshHooks = [];
  let compositionRefreshDebounceTimer = null;
  let pendingCompositionRefresh = false;
  let compositionRefreshSeq = 0;

  function isCompositionTable(tableName) {
    const table = String(tableName || '').trim();
    return table.length > 0 && COMPOSITION_TABLES.has(table);
  }

  function registerFavoriteEatsCatalogCompositionUiRefreshHook(fn) {
    if (typeof fn !== 'function') return () => {};
    compositionUiRefreshHooks.push(fn);
    return () => {
      const idx = compositionUiRefreshHooks.indexOf(fn);
      if (idx >= 0) compositionUiRefreshHooks.splice(idx, 1);
    };
  }

  async function runFavoriteEatsCatalogCompositionRefresh(options = {}) {
    const source =
      options && typeof options.source === 'string' && options.source
        ? options.source
        : 'catalog composition refresh';
    const refreshSeq = (compositionRefreshSeq += 1);
    const isLatest = () => refreshSeq === compositionRefreshSeq;

    if (
      global.dataService &&
      typeof global.dataService.bumpRecipeCompositionReadModel === 'function'
    ) {
      try {
        global.dataService.useSupabase = true;
        global.dataService.bumpRecipeCompositionReadModel();
      } catch (err) {
        console.warn('bumpRecipeCompositionReadModel failed:', err);
      }
    }

    const hooks = compositionUiRefreshHooks.slice();
    for (let i = 0; i < hooks.length; i += 1) {
      if (!isLatest()) return;
      try {
        await hooks[i]({ source, isLatest });
      } catch (err) {
        console.warn('catalog composition UI refresh hook failed:', err);
      }
    }
  }

  function scheduleFavoriteEatsCatalogCompositionRefresh(options = {}) {
    pendingCompositionRefresh = true;
    if (compositionRefreshDebounceTimer) {
      clearTimeout(compositionRefreshDebounceTimer);
    }
    compositionRefreshDebounceTimer = setTimeout(() => {
      compositionRefreshDebounceTimer = null;
      if (!pendingCompositionRefresh) return;
      pendingCompositionRefresh = false;
      void runFavoriteEatsCatalogCompositionRefresh(options);
    }, 320);
  }

  function notifyCatalogReferenceRealtimePayload(payload) {
    if (isCompositionTable(payload && payload.table)) {
      scheduleFavoriteEatsCatalogCompositionRefresh({
        source: `catalog composition realtime:${String(payload.table || '')}`,
      });
    }
  }

  global.favoriteEatsRecipeCompositionSync = {
    COMPOSITION_TABLES,
    isCompositionTable,
    registerFavoriteEatsCatalogCompositionUiRefreshHook,
    runFavoriteEatsCatalogCompositionRefresh,
    scheduleFavoriteEatsCatalogCompositionRefresh,
    notifyCatalogReferenceRealtimePayload,
  };
})(typeof window !== 'undefined' ? window : globalThis);
