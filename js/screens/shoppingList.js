/**
 * Shopping List screen loader (Slice 2 + 7 bootstrap).
 */
(function favoriteEatsShoppingListScreenModule(global) {
  if (!global) return;

  async function fetchShoppingListScreenPayload() {
    if (
      !global.dataService ||
      typeof global.dataService.loadShoppingListScreen !== 'function'
    ) {
      throw new Error('dataService.loadShoppingListScreen is not available.');
    }
    global.dataService.useSupabase = true;
    return global.dataService.loadShoppingListScreen();
  }

  async function bootstrapShoppingListHub(options = {}) {
    const apply = global.favoriteEatsScreenApply;
    if (!options.shouldUseRemoteShoppingState) {
      return { ok: true, recipeSummaries: [] };
    }
    if (global.dataService) {
      global.dataService.useSupabase = true;
    }

    const hydrate =
      typeof options.hydrateShoppingState === 'function'
        ? options.hydrateShoppingState
        : null;

    if (
      typeof fetchShoppingListScreenPayload === 'function' &&
      apply &&
      typeof apply.applyShoppingListScreenPayload === 'function'
    ) {
      try {
        const screenPayload = await fetchShoppingListScreenPayload();
        const applied = await apply.applyShoppingListScreenPayload(screenPayload);
        if (applied) {
          return {
            ok: true,
            recipeSummaries: Array.isArray(applied.recipeSummaries)
              ? applied.recipeSummaries
              : [],
            fromScreen: true,
          };
        }
      } catch (screenErr) {
        console.warn(
          'Shopping list page: screen load failed; falling back to hydrate:',
          screenErr,
        );
      }
    }

    if (hydrate) {
      try {
        await hydrate();
        return { ok: true, recipeSummaries: [], fromScreen: false };
      } catch (hydrateErr) {
        console.warn(
          'Shopping list page: could not load plan/list from server:',
          hydrateErr,
        );
        return { ok: false, hydrateFailed: true };
      }
    }

    return { ok: true, recipeSummaries: [] };
  }

  global.favoriteEatsShoppingListScreen = {
    fetchShoppingListScreenPayload,
    bootstrapShoppingListHub,
  };
})(typeof window !== 'undefined' ? window : globalThis);
