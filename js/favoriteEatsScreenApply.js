/**
 * Screen RPC apply helpers (Slice 7). Registered from main.js after hydrate helpers exist.
 */
(function favoriteEatsScreenApplyModule(global) {
  if (!global) return;

  /** @type {object|null} */
  let deps = null;

  function registerFavoriteEatsScreenApplyDeps(nextDeps) {
    deps = nextDeps && typeof nextDeps === 'object' ? nextDeps : null;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error('favoriteEatsScreenApply deps are not registered.');
    }
    return deps;
  }

  function seedItemsCatalogForPlanRecipeWalk(items) {
    if (
      !Array.isArray(items) ||
      !global.dataService ||
      typeof global.dataService.seedListShoppingPlanRecipeItemsCatalog !==
        'function'
    ) {
      return;
    }
    global.dataService.seedListShoppingPlanRecipeItemsCatalog(items);
  }

  async function applyRecipesScreenPayload(screenPayload, options = {}) {
    if (!screenPayload || typeof screenPayload !== 'object') return null;
    const d = requireDeps();
    const includePlan = options.includePlan !== false;
    const revisions =
      screenPayload.revisions && typeof screenPayload.revisions === 'object'
        ? screenPayload.revisions
        : {};
    const store = global.favoriteEatsStore;
    if (!includePlan) {
      return screenPayload;
    }
    if (screenPayload.fromCache || screenPayload.planUnchanged) {
      if (store && typeof store.getSnapshot === 'function') {
        d.syncMainCachesFromFavoriteEatsStoreSnapshot(store.getSnapshot());
      }
      d.markShoppingStateSnapshotLoaded();
      d.markFavoriteEatsRemoteShoppingAuthorityEstablished();
      return screenPayload;
    }
    const state = {
      plan: screenPayload.plan,
      shoppingListDoc: screenPayload.shoppingListDoc,
    };
    let applyResult = { outcome: 'applied' };
    if (store && typeof store.applyRemote === 'function') {
      applyResult = store.applyRemote(
        {
          plan: state.plan,
          listDoc: state.shoppingListDoc,
          revisions,
          guards: {},
        },
        { force: true },
      );
    }
    if (applyResult.outcome === 'rejected_older') {
      return null;
    }
    if (applyResult.outcome === 'skipped_equal') {
      d.syncMainCachesFromFavoriteEatsStoreSnapshot(store.getSnapshot());
      d.markShoppingStateSnapshotLoaded();
      d.markFavoriteEatsRemoteShoppingAuthorityEstablished();
      return screenPayload;
    }
    await d.persistShoppingHydrateRemoteStateToMain(state, false);
    d.markFavoriteEatsRemoteShoppingAuthorityEstablished();
    return screenPayload;
  }

  async function applyItemsScreenPayload(screenPayload, options = {}) {
    if (!screenPayload || typeof screenPayload !== 'object') return null;
    const d = requireDeps();
    const includePlan = options.includePlan !== false;
    if (screenPayload.fromCache) {
      const store = global.favoriteEatsStore;
      if (includePlan && store && typeof store.getSnapshot === 'function') {
        d.syncMainCachesFromFavoriteEatsStoreSnapshot(store.getSnapshot());
        d.markShoppingStateSnapshotLoaded();
        d.markFavoriteEatsRemoteShoppingAuthorityEstablished();
      }
      if (Array.isArray(screenPayload.items)) {
        seedItemsCatalogForPlanRecipeWalk(screenPayload.items);
      }
      return screenPayload;
    }
    if (!includePlan) {
      if (Array.isArray(screenPayload.items)) {
        seedItemsCatalogForPlanRecipeWalk(screenPayload.items);
      }
      return screenPayload;
    }
    const state = {
      plan: screenPayload.plan,
      shoppingListDoc: screenPayload.shoppingListDoc,
    };
    const revisions =
      screenPayload.revisions && typeof screenPayload.revisions === 'object'
        ? screenPayload.revisions
        : {};
    const store = global.favoriteEatsStore;
    let applyResult = { outcome: 'applied' };
    if (store && typeof store.applyRemote === 'function') {
      applyResult = store.applyRemote(
        {
          plan: state.plan,
          listDoc: state.shoppingListDoc,
          revisions,
          guards: {},
        },
        { force: true },
      );
    }
    if (applyResult.outcome === 'rejected_older') {
      return null;
    }
    if (applyResult.outcome === 'skipped_equal') {
      d.syncMainCachesFromFavoriteEatsStoreSnapshot(store.getSnapshot());
      d.markShoppingStateSnapshotLoaded();
      d.markFavoriteEatsRemoteShoppingAuthorityEstablished();
      if (Array.isArray(screenPayload.items)) {
        seedItemsCatalogForPlanRecipeWalk(screenPayload.items);
      }
      return screenPayload;
    }
    await d.persistShoppingHydrateRemoteStateToMain(state, false);
    d.markFavoriteEatsRemoteShoppingAuthorityEstablished();
    if (Array.isArray(screenPayload.items)) {
      seedItemsCatalogForPlanRecipeWalk(screenPayload.items);
    }
    return screenPayload;
  }

  async function applyShoppingListScreenPayload(screenPayload) {
    if (!screenPayload || typeof screenPayload !== 'object') return null;
    const d = requireDeps();
    const state = {
      plan: screenPayload.plan,
      shoppingListDoc: screenPayload.shoppingListDoc,
    };
    const revisions =
      screenPayload.revisions && typeof screenPayload.revisions === 'object'
        ? screenPayload.revisions
        : {};
    const store = global.favoriteEatsStore;
    let applyResult = { outcome: 'applied' };
    if (store && typeof store.applyRemote === 'function') {
      applyResult = store.applyRemote(
        {
          plan: state.plan,
          listDoc: state.shoppingListDoc,
          revisions,
          guards: {},
        },
        { force: true },
      );
    }
    if (applyResult.outcome === 'rejected_older') {
      return null;
    }
    if (applyResult.outcome === 'skipped_equal') {
      d.syncMainCachesFromFavoriteEatsStoreSnapshot(store.getSnapshot());
      d.markShoppingStateSnapshotLoaded();
      d.markFavoriteEatsRemoteShoppingAuthorityEstablished();
      return screenPayload;
    }
    await d.persistShoppingHydrateRemoteStateToMain(state, false);
    d.markFavoriteEatsRemoteShoppingAuthorityEstablished();
    return screenPayload;
  }

  global.favoriteEatsScreenApply = {
    registerFavoriteEatsScreenApplyDeps,
    applyRecipesScreenPayload,
    applyItemsScreenPayload,
    applyShoppingListScreenPayload,
    seedItemsCatalogForPlanRecipeWalk,
  };
})(typeof window !== 'undefined' ? window : globalThis);
