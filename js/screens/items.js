/**
 * Items (shopping catalog) screen loader (Slice 4 + 7 bootstrap).
 */
(function favoriteEatsItemsScreenModule(global) {
  if (!global) return;

  const hub = global.favoriteEatsHubBootstrap;

  async function fetchItemsScreenPayload() {
    if (
      !global.dataService ||
      typeof global.dataService.loadItemsScreen !== 'function'
    ) {
      throw new Error('dataService.loadItemsScreen is not available.');
    }
    global.dataService.useSupabase = true;

    let probeRevisions = null;
    if (typeof global.dataService.getShoppingRevisions === 'function') {
      try {
        probeRevisions = await global.dataService.getShoppingRevisions();
      } catch (err) {
        console.warn('Items screen: revision probe failed:', err);
      }
    }

    const catalogToken = probeRevisions?.catalogUpdatedAt || null;
    const cache = global.favoriteEatsCatalogCache;
    if (
      catalogToken &&
      cache &&
      typeof cache.readItemsCache === 'function'
    ) {
      const cached = await cache.readItemsCache(catalogToken);
      if (cached && Array.isArray(cached.items)) {
        return {
          fromCache: true,
          revisions: probeRevisions,
          items: cached.items,
          catalogBundle: cached.catalogBundle,
        };
      }
    }

    const payload = await global.dataService.loadItemsScreen();
    if (
      cache &&
      typeof cache.writeItemsCache === 'function' &&
      payload?.revisions?.catalogUpdatedAt &&
      Array.isArray(payload.items)
    ) {
      void cache.writeItemsCache(
        payload.revisions.catalogUpdatedAt,
        payload.items,
        payload.catalogBundle,
      );
    }
    return payload;
  }

  async function bootstrapItemsHub(options = {}) {
    const shouldUseSupabase = hub
      ? hub.shouldUseSupabaseHub(options)
      : !!global.dataService;
    const apply = global.favoriteEatsScreenApply;
    const mapItemRow =
      typeof options.mapItemRow === 'function' ? options.mapItemRow : (x) => x;

    if (global.dataService) {
      global.dataService.useSupabase = true;
    }

    if (
      shouldUseSupabase &&
      typeof fetchItemsScreenPayload === 'function' &&
      apply &&
      typeof apply.applyItemsScreenPayload === 'function'
    ) {
      try {
        const screenPayload = await fetchItemsScreenPayload();
        const applied = await apply.applyItemsScreenPayload(screenPayload);
        if (applied && Array.isArray(applied.items)) {
          return {
            ok: true,
            itemRows: applied.items.map(mapItemRow),
            fromScreen: true,
          };
        }
      } catch (screenErr) {
        console.warn(
          'Items page: screen load failed; falling back to listShoppingItems:',
          screenErr,
        );
      }
    }

    if (
      shouldUseSupabase &&
      global.dataService &&
      typeof global.dataService.listShoppingItems === 'function'
    ) {
      try {
        const rows = await global.dataService.listShoppingItems();
        const itemRows = (Array.isArray(rows) ? rows : []).map(mapItemRow);
        if (options.shouldUseRemoteShoppingState && options.hydrateShoppingState) {
          try {
            await options.hydrateShoppingState();
          } catch (hydrateErr) {
            console.warn(
              'Items page: could not load plan/list from server:',
              hydrateErr,
            );
          }
        }
        return { ok: true, itemRows, fromScreen: false };
      } catch (err) {
        if (typeof options.reportPrefetchFailure === 'function') {
          options.reportPrefetchFailure('listShoppingItems', err);
        }
        return { ok: false, error: err, itemRows: [] };
      }
    }

    return { ok: false, itemRows: [] };
  }

  global.favoriteEatsItemsScreen = {
    fetchItemsScreenPayload,
    bootstrapItemsHub,
  };
})(typeof window !== 'undefined' ? window : globalThis);
