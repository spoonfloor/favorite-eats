/**
 * Items (shopping catalog) hub page UI (Slice 7 phase 2).
 */
(function favoriteEatsItemsPageModule(global) {
  if (!global) return;

  /** @type {object|null} */
  let deps = null;

  function registerFavoriteEatsItemsPageDeps(nextDeps) {
    deps = nextDeps && typeof nextDeps === 'object' ? nextDeps : null;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error('favoriteEatsItemsPage deps are not registered.');
    }
    return deps;
  }

  async function loadShoppingPage() {
  const {
    fePageLoadFoodIconBegin,
    fePageLoadFoodIconFail,
    fePageLoadFoodIconFinish,
    favoriteEatsShouldUseSupabaseDataDoor,
    shouldUseRemoteShoppingState,
    hydrateShoppingStateFromDataService,
    favoriteEatsReportSupabasePrefetchFailure,
    initAppBar,
    initBottomNav,
    waitForAppBarReady,
    enableTopLevelListKeyboardNav,
    wireAppBarSearch,
    ensureAppBarTextActionPair,
    isPlannerModeEnabled,
    favoriteEatsDataServiceIsSupabaseActive,
    favoriteEatsHrefWithCurrentAdapter,
    getShoppingPlan,
    getShoppingPlanItemSelections,
    getShoppingPlanRecipeSelections,
    getShoppingPlanSelectionRows,
    getShoppingPlanSelectionRowsViaDataService,
    setShoppingPlanItemSelection,
    persistShoppingPlan,
    createEmptyShoppingPlan,
    cloneForUndo,
    clearShoppingPlanSelections,
    persistDbForCurrentRuntime,
    uiToast,
    uiConfirm,
    uiToastUndo,
    confirmRemoveFromPlanningList,
    isControlClickRemoveGesture,
    isControlPrimaryContextMenuGesture,
    registerFavoriteEatsRemotePlanUiRefreshHook,
    registerFavoriteEatsCatalogReferenceUiRefreshHook,
    teardownFavoriteEatsShoppingPlanRealtime,
    renderTopLevelEmptyState,
    setTopLevelEmptyStateLayoutMode,
    applySplitListRowLabelPair,
    createSectionToggleButton,
    createShoppingBrowsePlannerDocHeadline,
    deriveIngredientLemmaInMain,
    formatShoppingBrowseItemLabel,
    formatShoppingBrowsePlannerAmountButtonText,
    formatShoppingBrowsePlannerRemoveLabel,
    formatShoppingBrowsePlannerStepperQtyLabel,
    formatShoppingListDisplayDetailText,
    formatShoppingListTailDetailText,
    getRecipeDerivedShoppingPlanRows,
    getRecipePlannerServingsStoredValue,
    getShoppingBrowseLocationIds,
    getShoppingBrowsePlannerBadgeContent,
    getUnitSizeRemovalAction,
    getVisibleIngredientTagNamePool,
    isIngredientBaseVariantName,
    makeIngredientVariantShoppingPlanKey,
    normalizeShoppingHomeLocationId,
    resolveBrowseIvKeyForPlanRow,
    resolvePersistedShoppingItemKeyForDb,
    resolveShoppingBrowsePlanRowAggregateKey,
    shouldShoppingBrowsePlannerStepperShowTailIcon,
    getShoppingPlanRemoteSaveInFlight,
    SHOPPING_SCROLL_RESTORE_SESSION_KEY,
    FAVORITE_EATS_PLANNER_MODE_EVENT,
    SHOPPING_FILTER_CHIPS_SESSION_KEY_LEGACY,
    SHOPPING_FILTER_CHIPS_SESSION_KEY_PREFIX,
    SHOPPING_ITEMS_SORT_MODE_AZ,
    SHOPPING_ITEMS_SORT_MODE_LOCATION,
    SHOPPING_ITEMS_SORT_SESSION_KEY,
    SHOPPING_PLAN_KEY_SEP,
    SHOPPING_TAG_FILTER_PREFIX,
    ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY,
  } = requireDeps();
  fePageLoadFoodIconBegin('shopping');
  const list = document.getElementById('shoppingList');

  initAppBar({
    mode: 'list',
    titleText: 'Items',
  });

  // App bar is injected async; wait before wiring menu/search/add.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: () => {
      applyShoppingFilters();
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');
  if (addBtn instanceof HTMLButtonElement) {
    if (isPlannerModeEnabled()) {
      ensureAppBarTextActionPair(addBtn, 'Reset', 'cancel');
    } else {
      ensureAppBarTextActionPair(addBtn, 'Add', 'add');
    }
  }
  const listRowStepper = window.listRowStepper;

  if (!list) return;

  // Keyboard selection + Enter activation for list rows.
  const listNav = enableTopLevelListKeyboardNav(list);
  const rememberShoppingScrollForReload = () => {
    try {
      const y = Number(window.scrollY || window.pageYOffset || 0);
      sessionStorage.setItem(SHOPPING_SCROLL_RESTORE_SESSION_KEY, String(y));
    } catch (_) {}
  };
  const restoreShoppingScrollAfterReload = () => {
    let targetY = null;
    try {
      const raw = sessionStorage.getItem(SHOPPING_SCROLL_RESTORE_SESSION_KEY);
      sessionStorage.removeItem(SHOPPING_SCROLL_RESTORE_SESSION_KEY);
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) targetY = parsed;
    } catch (_) {}
    if (targetY === null) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.scrollTo({ top: targetY, behavior: 'auto' });
        } catch (_) {
          window.scrollTo(0, targetY);
        }
      });
    });
  };
  const consumeShoppingNavTarget = () => {
    try {
      const rawId = sessionStorage.getItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetId,
      );
      const rawName = sessionStorage.getItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetName,
      );
      sessionStorage.removeItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetId,
      );
      sessionStorage.removeItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetName,
      );
      const targetId = Number(rawId);
      const targetName = String(rawName || '')
        .trim()
        .toLowerCase();
      if ((!Number.isFinite(targetId) || targetId <= 0) && !targetName) {
        return null;
      }
      return {
        id:
          Number.isFinite(targetId) && targetId > 0
            ? Math.trunc(targetId)
            : null,
        name: targetName || '',
      };
    } catch (_) {
      return null;
    }
  };
  const shoppingNavTargetCleanupTimers = new WeakMap();
  const pulseShoppingNavTargetRow = (row) => {
    if (!(row instanceof HTMLElement)) return;
    const existingTimer = shoppingNavTargetCleanupTimers.get(row);
    if (existingTimer) window.clearTimeout(existingTimer);
    const cleanup = () => {
      row.classList.remove('shopping-nav-target');
      shoppingNavTargetCleanupTimers.delete(row);
    };
    row.classList.remove('shopping-nav-target');
    void row.offsetWidth;
    row.classList.add('shopping-nav-target');
    row.addEventListener('animationend', cleanup, { once: true });
    const timeoutId = window.setTimeout(cleanup, 1400);
    shoppingNavTargetCleanupTimers.set(row, timeoutId);
  };
  const scrollToShoppingNavTarget = (target) => {
    if (!target) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const row = Array.from(list.querySelectorAll('li')).find((li) => {
            const itemId = Number(li.dataset.shoppingItemId || '');
            if (
              Number.isFinite(itemId) &&
              itemId > 0 &&
              Number.isFinite(target.id) &&
              itemId === target.id
            ) {
              return true;
            }
            const key = String(
              li.dataset.shoppingStepperKey ||
                li.dataset.variantParentKey ||
                '',
            )
              .trim()
              .toLowerCase();
            if (!key) return false;
            if (target.name && key === target.name) return true;
            return false;
          });
          if (!(row instanceof HTMLElement)) return;
          row.scrollIntoView({ block: 'center', behavior: 'auto' });
          pulseShoppingNavTargetRow(row);
        } catch (_) {}
      });
    });
  };
  const pendingShoppingNavTarget = consumeShoppingNavTarget();

  const getShoppingEditorHref = () => 'shoppingEditor.html';

  let shoppingRows = [];
  /** Tag filter dropdown options for Items page (ids use {@link SHOPPING_TAG_FILTER_PREFIX}). */
  let shoppingTagChipOptionDefs = [];
  let shoppingRowsLoadedFromDataService = false;
  const dataServiceShoppingItemToPageRow = (item) => {
    const removedVariants = Array.isArray(item?.removedVariants)
      ? item.removedVariants
      : [];
    return {
      ...item,
      variants: Array.isArray(item?.variants) ? item.variants : [],
      variantIdByName:
        item?.variantIdByName && typeof item.variantIdByName === 'object'
          ? item.variantIdByName
          : null,
      variantDeprecatedSet: new Set(
        removedVariants
          .map((name) =>
            String(name || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
      isDeprecated: !!item?.isRemoved,
      tags: Array.isArray(item?.tags) ? item.tags : [],
      recipeUseCount: Number(item?.recipeUseCount || 0),
      aisleUseCount: Number(item?.aisleUseCount || 0),
    };
  };

  if (
    window.favoriteEatsItemsScreen &&
    typeof window.favoriteEatsItemsScreen.bootstrapItemsHub === 'function'
  ) {
    const boot = await window.favoriteEatsItemsScreen.bootstrapItemsHub({
      shouldUseSupabase: favoriteEatsShouldUseSupabaseDataDoor(),
      shouldUseRemoteShoppingState: shouldUseRemoteShoppingState(),
      hydrateShoppingState: hydrateShoppingStateFromDataService,
      reportPrefetchFailure: favoriteEatsReportSupabasePrefetchFailure,
      mapItemRow: dataServiceShoppingItemToPageRow,
    });
    if (boot.ok && Array.isArray(boot.itemRows)) {
      shoppingRows = boot.itemRows;
      shoppingRowsLoadedFromDataService = true;
    } else if (Array.isArray(boot.itemRows)) {
      shoppingRows = boot.itemRows;
    }
  }

  if (!shoppingRowsLoadedFromDataService) {
    try {
      if (list?.dataset) list.dataset.fePerfItemsReady = '0';
    } catch (_) {}
    fePageLoadFoodIconFail();
    return;
  }
  const db = null;
  window.dbInstance = db;
  window.dataService.useSupabase = true;

  // Catalog Items page always loads via screen RPC or listShoppingItems above.
  // ingredient_variants resolution is unused (db stays null).
  const hasVariantTable = false;

  const rebuildShoppingTagChipOptionDefsFromRows = async () => {
    const seen = new Map();
    shoppingRows.forEach((item) => {
      (Array.isArray(item.tags) ? item.tags : []).forEach((raw) => {
        const label = String(raw || '').trim();
        if (!label) return;
        const key = label.toLowerCase();
        if (!seen.has(key)) seen.set(key, label);
      });
    });
    let pool = [];
    try {
      pool = await getVisibleIngredientTagNamePool();
    } catch (err) {
      console.warn('listIngredientTagNames pool unavailable:', err);
    }
    (Array.isArray(pool) ? pool : []).forEach((label) => {
      const normalizedLabel = String(label || '').trim();
      const key = normalizedLabel.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.set(key, normalizedLabel);
    });
    const pairs = Array.from(seen.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }),
    );
    shoppingTagChipOptionDefs = pairs.map(([lower, label]) => ({
      id: `${SHOPPING_TAG_FILTER_PREFIX}${lower}`,
      label,
    }));
  };

  await rebuildShoppingTagChipOptionDefsFromRows();

  const getSharedHomeLocationDefs = () => {
    if (typeof window.getHomeLocationDefs === 'function') {
      return window.getHomeLocationDefs();
    }
    return [
      { id: 'fridge', label: 'fridge' },
      { id: 'freezer', label: 'freezer' },
      { id: 'above fridge', label: 'above fridge' },
      { id: 'cereal cabinet', label: 'cereal cabinet' },
      { id: 'pantry', label: 'pantry' },
      { id: 'spices', label: 'spices' },
      { id: 'fruit stand', label: 'fruit stand' },
      { id: 'coffee bar', label: 'coffee bar' },
      { id: 'none', label: 'no location' },
    ];
  };
  const shoppingLocationChipDefs = getSharedHomeLocationDefs();
  const shoppingFilterChipDefsWeb = [
    { id: 'selected', label: 'selected', kind: 'flag' },
  ];
  const shoppingFilterChipDefsEditor = [
    { id: 'food', label: 'food', kind: 'flag' },
    { id: 'not food', label: 'not food', kind: 'flag' },
  ];
  const shoppingMoreChipOptionDefs = [
    { id: 'no recipe', label: 'no recipe' },
    { id: 'no aisle', label: 'no aisle' },
    { id: 'has variant(s)', label: 'has variant(s)' },
    { id: 'hidden', label: 'hidden' },
    { id: 'removed', label: 'removed' },
  ];
  const activeFilterChips = new Set();
  const selectedShoppingNames = new Set();
  const shoppingQuantities = new Map();
  const shoppingRecipeQuantities = new Map();
  const shoppingSelectionMeta = new Map();
  let shoppingChipCounts = new Map();
  let filterChipRail = null;
  let suppressLocationDropdownReopen = false;
  let reopenShoppingCompoundDropdownId = '';
  let shoppingItemsSortMode = SHOPPING_ITEMS_SORT_MODE_AZ;
  const collapsedItemsBrowseHomeSections = new Set();
  const restoreShoppingItemsSortMode = () => {
    if (!isPlannerModeEnabled()) {
      shoppingItemsSortMode = SHOPPING_ITEMS_SORT_MODE_AZ;
      return;
    }
    try {
      const raw = sessionStorage.getItem(SHOPPING_ITEMS_SORT_SESSION_KEY);
      const key = String(raw || '')
        .trim()
        .toLowerCase();
      shoppingItemsSortMode =
        key === SHOPPING_ITEMS_SORT_MODE_LOCATION
          ? SHOPPING_ITEMS_SORT_MODE_LOCATION
          : SHOPPING_ITEMS_SORT_MODE_AZ;
    } catch (_) {
      shoppingItemsSortMode = SHOPPING_ITEMS_SORT_MODE_AZ;
    }
  };
  const persistShoppingItemsSortMode = () => {
    if (!isPlannerModeEnabled()) return;
    try {
      sessionStorage.setItem(
        SHOPPING_ITEMS_SORT_SESSION_KEY,
        shoppingItemsSortMode,
      );
    } catch (_) {}
  };
  const restoreItemsBrowseHomeCollapsed = () => {
    collapsedItemsBrowseHomeSections.clear();
    if (!isPlannerModeEnabled()) return;
    try {
      const raw = sessionStorage.getItem(
        ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY,
      );
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach((id) => {
        const k = String(id || '').trim();
        if (k) collapsedItemsBrowseHomeSections.add(k);
      });
    } catch (_) {}
  };
  const persistItemsBrowseHomeCollapsed = () => {
    if (!isPlannerModeEnabled()) return;
    try {
      sessionStorage.setItem(
        ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY,
        JSON.stringify(Array.from(collapsedItemsBrowseHomeSections)),
      );
    } catch (_) {}
  };
  restoreShoppingItemsSortMode();
  restoreItemsBrowseHomeCollapsed();
  const syncShoppingActionButtonState = () => {
    if (!(addBtn instanceof HTMLButtonElement)) return;
    if (!isShoppingPlannerSelectMode()) {
      addBtn.disabled = false;
      addBtn.removeAttribute('aria-disabled');
      return;
    }
    const disabled =
      Object.keys(getShoppingPlanItemSelections()).length === 0 &&
      Object.keys(getShoppingPlanRecipeSelections()).length === 0;
    addBtn.disabled = disabled;
    addBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  };

  const getShoppingSelectionKey = (rawName) =>
    String(rawName || '')
      .trim()
      .toLowerCase();
  const isShoppingPlannerSelectMode = () => isPlannerModeEnabled();
  const getShoppingFilterChipMode = () =>
    isShoppingPlannerSelectMode() ? 'planner' : 'editor';
  const getShoppingFilterChipStorageKey = (
    mode = getShoppingFilterChipMode(),
  ) => `${SHOPPING_FILTER_CHIPS_SESSION_KEY_PREFIX}:${mode}`;
  // On macOS, Ctrl+primary click can emit a contextmenu event.
  // Planner remove uses isControlPrimaryContextMenuGesture (module scope).
  const getActiveShoppingFilterChipDefs = () =>
    getShoppingFilterChipMode() === 'planner'
      ? shoppingFilterChipDefsWeb
      : shoppingFilterChipDefsEditor;
  const SHOPPING_QTY_EPSILON = 1e-9;
  const getDirectShoppingQty = (key) => shoppingQuantities.get(key) || 0;
  const getRecipeShoppingQty = (key) => shoppingRecipeQuantities.get(key) || 0;
  const getShoppingQty = (key) =>
    Math.max(0, getDirectShoppingQty(key) + getRecipeShoppingQty(key));
  const hasPositiveShoppingQty = (qty) =>
    Number.isFinite(Number(qty)) && Number(qty) > SHOPPING_QTY_EPSILON;
  const getNextShoppingStepQty = (currentQty, delta) => {
    if (
      window.listRowStepper &&
      typeof window.listRowStepper.getNextStepQty === 'function'
    ) {
      return window.listRowStepper.getNextStepQty(currentQty, delta, {
        min: 0,
        max: 99,
        epsilon: SHOPPING_QTY_EPSILON,
      });
    }
    const numeric = Number(currentQty);
    if (!Number.isFinite(numeric)) return delta > 0 ? 1 : 0;
    return Math.max(0, numeric + Number(delta || 0));
  };
  const parseShoppingQtyInputValue = (rawValue) => {
    const raw = String(rawValue == null ? '' : rawValue).trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(99, Math.round(numeric)));
  };
  const setShoppingQty = (key, qty, meta = null) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const nextMeta =
      meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    const itemName = String(nextMeta.itemName || nextMeta.name || '').trim();
    const variantName = String(nextMeta.variantName || '').trim();
    const metaIv = Number(nextMeta.ingredientVariantId);
    const ingredientVariantIdFromMeta =
      Number.isFinite(metaIv) && metaIv > 0 ? Math.trunc(metaIv) : null;
    if (itemName || variantName || !shoppingSelectionMeta.has(normalizedKey)) {
      shoppingSelectionMeta.set(normalizedKey, { itemName, variantName });
    }
    const recipeQty = getRecipeShoppingQty(normalizedKey);
    const desiredQty = Math.max(0, Number(qty || 0));
    if (!Number.isFinite(desiredQty)) return;
    const directQty = Number((desiredQty - recipeQty).toFixed(4));
    if (Math.abs(directQty) < SHOPPING_QTY_EPSILON) {
      shoppingQuantities.delete(normalizedKey);
      selectedShoppingNames.delete(normalizedKey);
      shoppingSelectionMeta.delete(normalizedKey);
      setShoppingPlanItemSelection({ key: normalizedKey, quantity: 0 });
    } else {
      shoppingQuantities.set(normalizedKey, directQty);
      selectedShoppingNames.add(normalizedKey);
      const persistedMeta = shoppingSelectionMeta.get(normalizedKey) || {};
      setShoppingPlanItemSelection({
        key: normalizedKey,
        name: persistedMeta.itemName || itemName || normalizedKey,
        variantName: persistedMeta.variantName || variantName,
        quantity: directQty,
        ingredientVariantId: ingredientVariantIdFromMeta,
      });
    }
    syncShoppingActionButtonState();
  };
  const hydrateShoppingSelectionsFromPlan = () => {
    shoppingQuantities.clear();
    selectedShoppingNames.clear();
    shoppingSelectionMeta.clear();
    const storedSelections = getShoppingPlanItemSelections();
    Object.keys(storedSelections).forEach((rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key) return;
      const entry = storedSelections[rawKey];
      const quantity = Number(entry?.quantity);
      if (
        !Number.isFinite(quantity) ||
        Math.abs(quantity) < SHOPPING_QTY_EPSILON
      )
        return;
      shoppingQuantities.set(key, quantity);
      selectedShoppingNames.add(key);
      const rawIv = Number(entry?.ingredientVariantId);
      const ingredientVariantId =
        Number.isFinite(rawIv) && rawIv > 0 ? Math.trunc(rawIv) : null;
      shoppingSelectionMeta.set(key, {
        itemName: String(entry?.name || '').trim(),
        variantName: String(entry?.variantName || '').trim(),
        ...(ingredientVariantId ? { ingredientVariantId } : {}),
      });
    });
  };
  try {
    await hydrateRecipeDerivedShoppingSelections();
  } catch (recipeHydrateErr) {
    console.warn(
      'Items page: hydrateRecipeDerivedShoppingSelections failed:',
      recipeHydrateErr,
    );
  }
  hydrateShoppingSelectionsFromPlan();

  const getVariantQtyKey = (itemName, variantName) => {
    const base = getShoppingSelectionKey(itemName);
    const v = String(variantName || '')
      .trim()
      .toLowerCase();
    // Align with getShoppingPlanAggregateKey / adapter shoppingPlanAggregateKey:
    // base variant is the plain lowercased name, not `name\x1edefault`.
    if (isIngredientBaseVariantName(v)) return base;
    return `${base}${SHOPPING_PLAN_KEY_SEP}${v}`;
  };
  const resolveBrowseIngredientVariantId = (browseItem, rawVariantName) => {
    if (!browseItem || typeof browseItem !== 'object') return null;
    const v = String(rawVariantName || '')
      .trim()
      .toLowerCase();
    if (!v || v === 'default') {
      const n = Number(browseItem.defaultVariantId);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    const map = browseItem.variantIdByName;
    if (!map || typeof map !== 'object') return null;
    const vid = Number(map[v]);
    return Number.isFinite(vid) && vid > 0 ? Math.trunc(vid) : null;
  };

  const getBrowseVariantPlanKey = (itemName, rawVariantName, browseItem) => {
    const v = String(rawVariantName || '').trim();
    if (!v || v === 'default') {
      const defVid = resolveBrowseIngredientVariantId(browseItem, 'default');
      if (Number.isFinite(defVid) && defVid > 0) {
        return makeIngredientVariantShoppingPlanKey(defVid);
      }
      return getVariantQtyKey(itemName, v || 'default');
    }
    if (browseItem && browseItem.variantIdByName) {
      const vid = browseItem.variantIdByName[v.toLowerCase()];
      if (Number.isFinite(vid) && vid > 0) {
        return makeIngredientVariantShoppingPlanKey(vid);
      }
    }
    if (hasVariantTable) {
      const resolved = resolvePersistedShoppingItemKeyForDb(db, itemName, v);
      if (resolved) return resolved;
    }
    return getVariantQtyKey(itemName, v);
  };
  const getShoppingItemVariantAwareKey = (itemName, variantName = '') => {
    const itemKey = getShoppingSelectionKey(itemName);
    if (!itemKey) return '';
    const match = shoppingRows.find(
      (it) => getShoppingSelectionKey(it?.name) === itemKey,
    );
    const hasVariants =
      !!match && Array.isArray(match.variants) && match.variants.length > 0;
    // Even when an ingredient has no non-default variants, recipe-derived rows
    // are keyed by `iv:{defaultVariantId}` (see listShoppingPlanRecipeItems).
    // Prefer that stable id key whenever it is known so simple-row reads/writes
    // line up with hydrateRecipeDerivedShoppingSelections.
    if (!hasVariants) {
      const defVid = resolveBrowseIngredientVariantId(match, 'default');
      if (Number.isFinite(defVid) && defVid > 0) {
        return makeIngredientVariantShoppingPlanKey(defVid);
      }
      return itemKey;
    }
    return getBrowseVariantPlanKey(
      itemName,
      String(variantName || '').trim() || 'default',
      match,
    );
  };
  const getRecipeSelectionsForDataService = () =>
    Object.values(getShoppingPlanRecipeSelections()).map((entry) => {
      const recipeId = Number(entry?.recipeId);
      const servings = getRecipePlannerServingsStoredValue(recipeId);
      return {
        ...entry,
        servings,
      };
    });
  const hydrateRecipeDerivedShoppingSelections = async () => {
    shoppingRecipeQuantities.clear();
    let recipeRows = [];
    const useDataDoor =
      favoriteEatsShouldUseSupabaseDataDoor() && window.dataService;
    if (useDataDoor) {
      window.dataService.useSupabase = true;
    }
    if (
      window.dataService &&
      typeof window.dataService.listShoppingPlanRecipeItems === 'function'
    ) {
      try {
        recipeRows = await window.dataService.listShoppingPlanRecipeItems(
          getRecipeSelectionsForDataService(),
        );
      } catch (err) {
        if (useDataDoor) {
          favoriteEatsReportSupabasePrefetchFailure(
            'listShoppingPlanRecipeItems',
            err,
          );
          throw err;
        }
        console.error('dataService.listShoppingPlanRecipeItems failed:', err);
        recipeRows = getRecipeDerivedShoppingPlanRows({ db });
      }
    } else {
      if (useDataDoor) {
        const err = new Error(
          'dataService.listShoppingPlanRecipeItems is not available.',
        );
        favoriteEatsReportSupabasePrefetchFailure(
          'listShoppingPlanRecipeItems',
          err,
        );
        throw err;
      }
      recipeRows = getRecipeDerivedShoppingPlanRows({ db });
    }
    recipeRows.forEach((entry) => {
      const label = String(entry?.label || '').trim();
      const quantity = Number(entry?.quantity || 0);
      if (!label || !Number.isFinite(quantity) || quantity <= 0) return;
      const baseName = String(entry?.name || '').trim();
      const variantName = String(entry?.variantName || '').trim();
      const fromPlan = String(entry?.key || '').trim();
      const key =
        fromPlan || getShoppingItemVariantAwareKey(baseName, variantName);
      if (!key) return;
      shoppingRecipeQuantities.set(
        key,
        (shoppingRecipeQuantities.get(key) || 0) + quantity,
      );
    });
  };
  const shoppingBrowsePlanRowsByKey = new Map();
  const refreshShoppingBrowsePlanRowsIndex = async () => {
    shoppingBrowsePlanRowsByKey.clear();
    try {
      const rows =
        favoriteEatsShouldUseSupabaseDataDoor() && window.dataService
          ? await getShoppingPlanSelectionRowsViaDataService({ db })
          : getShoppingPlanSelectionRows({ db });
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = String(row?.key || '').trim();
        if (!key) return;
        shoppingBrowsePlanRowsByKey.set(key, row);
        const ivKey = resolveBrowseIvKeyForPlanRow(row, shoppingRows);
        if (ivKey) shoppingBrowsePlanRowsByKey.set(ivKey, row);
      });
    } catch (err) {
      console.warn('Items browse plan row index failed:', err);
    }
  };
  await refreshShoppingBrowsePlanRowsIndex();

  const runDeferredRecipeDerivedHydrate = async () => {
    try {
      await hydrateRecipeDerivedShoppingSelections();
      syncShoppingActionButtonState();
      applyShoppingFilters();
    } catch (recipeHydrateErr) {
      console.warn(
        'Items page: hydrateRecipeDerivedShoppingSelections failed:',
        recipeHydrateErr,
      );
    }
  };
  syncShoppingActionButtonState();

  const getBrowsePlanRow = (planKey) => {
    const key = String(planKey || '').trim();
    if (!key) return null;
    const direct = shoppingBrowsePlanRowsByKey.get(key);
    if (direct) return direct;
    const aggregateKey = resolveShoppingBrowsePlanRowAggregateKey(
      key,
      shoppingRows,
    );
    if (aggregateKey && aggregateKey !== key) {
      return shoppingBrowsePlanRowsByKey.get(aggregateKey) || null;
    }
    return null;
  };
  const getBrowseDisplayBucketsForKey = (planKey) => {
    const row = getBrowsePlanRow(planKey);
    const tails = (Array.isArray(row?.buckets) ? row.buckets : []).filter(
      (bucket) => bucket && bucket.kind !== 'selected',
    );
    const direct = getDirectShoppingQty(planKey);
    if (direct > SHOPPING_QTY_EPSILON) {
      return [
        { key: 'selected', kind: 'selected', quantity: direct },
        ...tails.map((bucket) => ({ ...bucket })),
      ];
    }
    return tails.map((bucket) => ({ ...bucket }));
  };
  const getBrowseAmountDetailText = (planKey) => {
    const row = getBrowsePlanRow(planKey);
    return formatShoppingListDisplayDetailText({
      variantName: row?.variantName || '',
      buckets: getBrowseDisplayBucketsForKey(planKey),
      useMetric: !!row?.useMetric,
    });
  };
  const browsePlanRowHasRecipeTail = (planKey) =>
    !!String(
      formatShoppingListTailDetailText({
        variantName: getBrowsePlanRow(planKey)?.variantName || '',
        buckets: Array.isArray(getBrowsePlanRow(planKey)?.buckets)
          ? getBrowsePlanRow(planKey).buckets
          : [],
        useMetric: !!getBrowsePlanRow(planKey)?.useMetric,
      }) || '',
    ).trim();
  const setShoppingQtyFromDirectDelta = (key, delta, meta = null) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const direct = getDirectShoppingQty(normalizedKey);
    const recipe = getRecipeShoppingQty(normalizedKey);
    const nextDirect = getNextShoppingStepQty(direct, delta);
    setShoppingQty(normalizedKey, nextDirect + recipe, meta);
  };
  const setShoppingQtyFromDirectValue = (key, nextDirect, meta = null) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const recipe = getRecipeShoppingQty(normalizedKey);
    const numericDirect = Math.max(0, Number(nextDirect || 0));
    setShoppingQty(
      normalizedKey,
      Number.isFinite(numericDirect) ? numericDirect + recipe : recipe,
      meta,
    );
  };

  const getItemTotalQty = (itemName, variants, browseItem) => {
    let total = getShoppingQty(
      getBrowseVariantPlanKey(itemName, 'default', browseItem),
    );
    (variants || []).forEach((v) => {
      total += getShoppingQty(getBrowseVariantPlanKey(itemName, v, browseItem));
    });
    return total;
  };
  const getItemDirectTotalQty = (itemName, variants, browseItem) => {
    let total = getDirectShoppingQty(
      getBrowseVariantPlanKey(itemName, 'default', browseItem),
    );
    (variants || []).forEach((v) => {
      total += getDirectShoppingQty(
        getBrowseVariantPlanKey(itemName, v, browseItem),
      );
    });
    return total;
  };
  const itemBrowseGroupHasRecipeTail = (itemName, variants, browseItem) => {
    if (
      browsePlanRowHasRecipeTail(
        getBrowseVariantPlanKey(itemName, 'default', browseItem),
      )
    ) {
      return true;
    }
    return (variants || []).some((v) =>
      browsePlanRowHasRecipeTail(
        getBrowseVariantPlanKey(itemName, v, browseItem),
      ),
    );
  };
  const getVariantQtyMap = (itemName, variants, browseItem) => {
    const m = new Map();
    m.set(
      'default',
      getDirectShoppingQty(
        getBrowseVariantPlanKey(itemName, 'default', browseItem),
      ),
    );
    (variants || []).forEach((v) => {
      m.set(
        v,
        getDirectShoppingQty(getBrowseVariantPlanKey(itemName, v, browseItem)),
      );
    });
    return m;
  };
  const hasAnyVariantSelection = (itemName, variants) =>
    hasPositiveShoppingQty(getItemTotalQty(itemName, variants));
  function getItemRecipeQty(itemName, variants, browseItem) {
    let total = getRecipeShoppingQty(
      getBrowseVariantPlanKey(itemName, 'default', browseItem),
    );
    (variants || []).forEach((v) => {
      total += getRecipeShoppingQty(
        getBrowseVariantPlanKey(itemName, v, browseItem),
      );
    });
    return total;
  }
  function getShoppingRowDirectQty(item) {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return 0;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    return variants.length > 0
      ? getItemDirectTotalQty(itemName, variants, item)
      : getDirectShoppingQty(
          getShoppingItemVariantAwareKey(itemName) ||
            getShoppingSelectionKey(itemName),
        );
  }
  function getShoppingRowTotalQty(item) {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return 0;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    return variants.length > 0
      ? getItemTotalQty(itemName, variants, item)
      : getShoppingQty(
          getShoppingItemVariantAwareKey(itemName) ||
            getShoppingSelectionKey(itemName),
        );
  }
  function getShoppingRowRecipeQty(item) {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return 0;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    return variants.length > 0
      ? getItemRecipeQty(itemName, variants, item)
      : getRecipeShoppingQty(
          getShoppingItemVariantAwareKey(itemName) ||
            getShoppingSelectionKey(itemName),
        );
  }

  const expandedVariantItems = new Set();
  const syncVariantParentByKey = new Map();
  let syncVariantChildVisuals = () => {};
  const syncAllVisibleVariantChildSteppers = () => {
    list.querySelectorAll('li.shopping-variant-child').forEach((row) => {
      const varKey = String(row.dataset.variantQtyKey || '');
      if (varKey) syncVariantChildVisuals(row, varKey);
    });
  };
  const collapseExpandedVariantRows = () => {
    let changed = false;
    if (shoppingRowStepperController.collapseActive()) {
      changed = true;
      syncAllVisibleVariantChildSteppers();
    }
    if (!expandedVariantItems.size) return changed;
    changed = true;
    expandedVariantItems.clear();
    list.querySelectorAll('li.shopping-variant-parent').forEach((parentLi) => {
      parentLi.dataset.expanded = 'false';
    });
    list.querySelectorAll('li.shopping-variant-child').forEach((row) => {
      row.style.display = 'none';
    });
    syncVariantParentByKey.forEach((syncFn) => {
      try {
        syncFn();
      } catch (_) {}
    });
    return changed;
  };
  const shoppingRowStepperController = listRowStepper.createController({
    listEl: list,
    isEnabled: isShoppingPlannerSelectMode,
    collapseExpanded: collapseExpandedVariantRows,
  });
  /** Bumped on planner qty / stepper focus; remote hydrate must not overwrite in-flight edits. */
  let shoppingBrowsePlannerEditSeq = 0;
  const bumpShoppingBrowsePlannerEdit = () => {
    shoppingBrowsePlannerEditSeq += 1;
  };
  const buildBrowsePlannerRowStepperOptions = (
    directQty,
    hasTail,
    isActive,
    decreaseClearsSelection,
  ) => ({
    enabled: isShoppingPlannerSelectMode(),
    qty: directQty,
    qtyMax: 9999,
    isActive,
    selectedDatasetKey: 'shoppingSelected',
    showAsSelected: hasPositiveShoppingQty(directQty) || hasTail,
    badgeContent: getShoppingBrowsePlannerBadgeContent(directQty, {
      hasAmountTail: hasTail,
    }),
    stepperShowTailIcon: shouldShoppingBrowsePlannerStepperShowTailIcon(
      directQty,
      { hasAmountTail: hasTail },
    ),
    shoppingDecreaseClearsSelection: decreaseClearsSelection,
    formatQtyLabel: (qty) =>
      formatShoppingBrowsePlannerStepperQtyLabel(qty, {
        hasAmountTail: hasTail,
      }),
  });
  const canResetBrowsePlannerDirectRow = (planKey) => {
    const key = String(planKey || '').trim();
    if (!key) return false;
    return hasPositiveShoppingQty(getDirectShoppingQty(key));
  };
  const syncBrowsePlannerRowAmountButton = (rowEl, planKey) => {
    const amountBtn = rowEl.querySelector(
      'button.shopping-list-doc-text--amount',
    );
    if (!(amountBtn instanceof HTMLButtonElement)) return;
    const detail = getBrowseAmountDetailText(planKey);
    const amountText = formatShoppingBrowsePlannerAmountButtonText(detail);
    amountBtn.textContent = amountText;
    amountBtn.style.display = amountText ? '' : 'none';
  };
  const syncShoppingRowVisuals = (rowEl, itemName) => {
    // Variant-aware key so simple rows whose ingredient has an `iv:{defaultId}`
    // entry (recipe-derived selections) read the same bucket they were written to.
    const selectionKey =
      getShoppingItemVariantAwareKey(itemName) ||
      getShoppingSelectionKey(itemName);
    const directQty = getDirectShoppingQty(selectionKey);
    const hasTail = browsePlanRowHasRecipeTail(selectionKey);
    const nextAfterDecrease = getNextShoppingStepQty(directQty, -1);
    const shoppingDecreaseClearsSelection =
      hasPositiveShoppingQty(directQty) &&
      !hasPositiveShoppingQty(nextAfterDecrease);
    listRowStepper.syncRowVisuals(
      rowEl,
      buildBrowsePlannerRowStepperOptions(
        directQty,
        hasTail,
        shoppingRowStepperController.isActive(selectionKey),
        shoppingDecreaseClearsSelection,
      ),
    );
    syncBrowsePlannerRowAmountButton(rowEl, selectionKey);
  };
  const syncShoppingRowSelectionState = (rowEl, itemName) => {
    syncShoppingRowVisuals(rowEl, itemName);
  };
  const syncAllVisibleShoppingRowStates = () => {
    list.querySelectorAll('li[data-shopping-stepper-key]').forEach((row) => {
      const itemName = String(row.dataset.shoppingStepperKey || '');
      if (itemName) syncShoppingRowSelectionState(row, itemName);
    });
  };
  shoppingRowStepperController.bindAutoDismiss({
    shouldIgnoreTarget: () =>
      !!list.querySelector('.shopping-stepper-qty-input'),
    onDismissed: () => {
      syncAllVisibleShoppingRowStates();
      syncAllVisibleVariantChildSteppers();
    },
  });
  const toggleShoppingRowSelectionState = (rowEl, itemName) => {
    const key =
      getShoppingItemVariantAwareKey(itemName) ||
      getShoppingSelectionKey(itemName);
    if (!key) return;
    bumpShoppingBrowsePlannerEdit();
    const direct = getDirectShoppingQty(key);
    setShoppingQtyFromDirectValue(key, direct > 0 ? 0 : 1, { itemName });
    refreshShoppingSelectionUi({
      activeKey: key,
      fullRerender: false,
    });
  };
  const incrementShoppingQty = (rowEl, itemName, delta) => {
    const key =
      getShoppingItemVariantAwareKey(itemName) ||
      getShoppingSelectionKey(itemName);
    if (!key) return;
    bumpShoppingBrowsePlannerEdit();
    const direct = getDirectShoppingQty(key);
    const nextDirect = getNextShoppingStepQty(direct, delta);
    setShoppingQtyFromDirectValue(key, nextDirect, { itemName });
    if (
      !hasPositiveShoppingQty(nextDirect) &&
      shoppingRowStepperController.isActive(key)
    ) {
      shoppingRowStepperController.collapseActive();
    }
    refreshShoppingSelectionUi({
      activeKey: hasPositiveShoppingQty(nextDirect) ? key : '',
      fullRerender: false,
    });
  };
  const attachShoppingQtyManualEdit = ({
    qtyEl,
    getQty,
    commitQty,
    onAfterCommit,
  }) => {
    if (!(qtyEl instanceof HTMLElement)) return;
    let inputEl = null;
    let isEditing = false;

    const rerender = () => {
      if (typeof onAfterCommit === 'function') onAfterCommit();
    };
    const onBlur = () => finishEditing('commit');
    const onKeyDown = (event) => {
      if (!event) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        finishEditing('commit');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finishEditing('cancel');
        return;
      }
      event.stopPropagation();
    };
    const finishEditing = (mode) => {
      if (!isEditing) return;
      const currentInput = inputEl;
      inputEl = null;
      isEditing = false;
      if (currentInput) {
        currentInput.removeEventListener('blur', onBlur);
        currentInput.removeEventListener('keydown', onKeyDown);
      }
      if (mode === 'commit') {
        const nextQty = parseShoppingQtyInputValue(currentInput?.value);
        if (nextQty != null) {
          commitQty(nextQty);
          rerender();
          return;
        }
      }
      rerender();
    };
    const stopPropagation = (event) => {
      if (!event) return;
      event.preventDefault();
      event.stopPropagation();
    };

    qtyEl.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    qtyEl.addEventListener('dblclick', (event) => {
      if (!isShoppingPlannerSelectMode()) return;
      stopPropagation(event);
      if (isEditing) return;
      isEditing = true;
      const currentQty = Number(getQty());
      const initialValue = Number.isFinite(currentQty)
        ? String(Math.max(0, Math.min(99, Math.round(currentQty))))
        : '0';
      qtyEl.textContent = '';
      inputEl = document.createElement('input');
      inputEl.type = 'number';
      inputEl.className = 'shopping-stepper-qty-input';
      inputEl.min = '0';
      inputEl.max = '99';
      inputEl.step = '1';
      inputEl.inputMode = 'numeric';
      inputEl.value = initialValue;
      inputEl.addEventListener('click', (e) => e.stopPropagation());
      inputEl.addEventListener('mousedown', (e) => e.stopPropagation());
      inputEl.addEventListener('dblclick', (e) => e.stopPropagation());
      inputEl.addEventListener('blur', onBlur);
      inputEl.addEventListener('keydown', onKeyDown);
      qtyEl.appendChild(inputEl);
      try {
        inputEl.focus();
        inputEl.select();
      } catch (_) {}
    });
  };

  const persistShoppingChipState = () => {
    try {
      sessionStorage.setItem(
        getShoppingFilterChipStorageKey(),
        JSON.stringify(Array.from(activeFilterChips)),
      );
    } catch (_) {}
  };

  const restoreShoppingChipState = () => {
    try {
      const storageKey = getShoppingFilterChipStorageKey();
      let raw = sessionStorage.getItem(storageKey);
      let shouldPersistMigratedState = false;
      if (!raw) {
        raw = sessionStorage.getItem(SHOPPING_FILTER_CHIPS_SESSION_KEY_LEGACY);
        shouldPersistMigratedState = !!raw;
      }
      if (!raw && getShoppingFilterChipMode() === 'planner') {
        raw = sessionStorage.getItem(
          `${SHOPPING_FILTER_CHIPS_SESSION_KEY_PREFIX}:web`,
        );
        shouldPersistMigratedState = !!raw;
      }
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const knownIds = new Set(
        getActiveShoppingFilterChipDefs().map((c) => String(c.id)),
      );
      if (getShoppingFilterChipMode() === 'planner') {
        knownIds.add('not food');
      }
      shoppingLocationChipDefs.forEach((locationDef) => {
        const locationId = String(locationDef?.id || '')
          .trim()
          .toLowerCase();
        if (locationId) knownIds.add(locationId);
      });
      shoppingMoreChipOptionDefs.forEach((optionDef) => {
        const optionId = String(optionDef?.id || '')
          .trim()
          .toLowerCase();
        if (optionId) knownIds.add(optionId);
      });
      shoppingTagChipOptionDefs.forEach((def) => {
        const tid = String(def?.id || '')
          .trim()
          .toLowerCase();
        if (tid) knownIds.add(tid);
      });
      parsed.forEach((chipId) => {
        const id = String(chipId || '')
          .trim()
          .toLowerCase();
        // Back-compat: old "hidden" chip represented deprecated/removed.
        if (id === 'hidden' && knownIds.has('removed')) {
          activeFilterChips.add('removed');
          return;
        }
        if (knownIds.has(id)) activeFilterChips.add(id);
      });
      if (getShoppingFilterChipMode() === 'planner') {
        if (activeFilterChips.delete('food')) {
          shouldPersistMigratedState = true;
        }
        if (activeFilterChips.delete('for recipes')) {
          shouldPersistMigratedState = true;
        }
      } else if (
        activeFilterChips.has('food') &&
        activeFilterChips.has('not food')
      ) {
        activeFilterChips.delete('not food');
        shouldPersistMigratedState = true;
      }
      if (shouldPersistMigratedState) {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(activeFilterChips)),
        );
      }
    } catch (_) {}
  };

  const normalizeLocationForChip = (raw) =>
    normalizeShoppingHomeLocationId(raw);
  const getShoppingRowLocationIdsForBrowse = (item) =>
    getShoppingBrowseLocationIds(item).map((locationId) =>
      normalizeLocationForChip(locationId),
    );

  const recomputeShoppingChipCounts = () => {
    const counts = new Map();
    getActiveShoppingFilterChipDefs().forEach((c) => counts.set(c.id, 0));
    if (!counts.has('food')) counts.set('food', 0);
    if (!counts.has('not food')) counts.set('not food', 0);
    shoppingMoreChipOptionDefs.forEach((optionDef) => {
      const optionId = String(optionDef?.id || '')
        .trim()
        .toLowerCase();
      if (optionId) counts.set(optionId, 0);
    });
    shoppingTagChipOptionDefs.forEach((def) => {
      const tid = String(def?.id || '')
        .trim()
        .toLowerCase();
      if (tid) counts.set(tid, 0);
    });
    shoppingRows.forEach((item) => {
      if (hasPositiveShoppingQty(getShoppingRowDirectQty(item))) {
        counts.set('selected', (counts.get('selected') || 0) + 1);
      }
      if (hasPositiveShoppingQty(getShoppingRowRecipeQty(item))) {
        counts.set('for recipes', (counts.get('for recipes') || 0) + 1);
      }
      if (item && item.isDeprecated) {
        counts.set('removed', (counts.get('removed') || 0) + 1);
      }
      if (item && item.isHidden) {
        counts.set('hidden', (counts.get('hidden') || 0) + 1);
      }
      if (item && item.isFood === true) {
        counts.set('food', (counts.get('food') || 0) + 1);
      }
      if (item && item.isFood === false) {
        counts.set('not food', (counts.get('not food') || 0) + 1);
      }
      getShoppingRowLocationIdsForBrowse(item).forEach((locId) => {
        counts.set(locId, (counts.get(locId) || 0) + 1);
      });
      if (Number(item?.recipeUseCount || 0) <= 0) {
        counts.set('no recipe', (counts.get('no recipe') || 0) + 1);
      }
      if (Number(item?.aisleUseCount || 0) <= 0) {
        counts.set('no aisle', (counts.get('no aisle') || 0) + 1);
      }
      if (Array.isArray(item?.variants) && item.variants.length > 0) {
        counts.set('has variant(s)', (counts.get('has variant(s)') || 0) + 1);
      }
      const tagSeen = new Set();
      (Array.isArray(item.tags) ? item.tags : []).forEach((raw) => {
        const key = String(raw || '')
          .trim()
          .toLowerCase();
        if (!key) return;
        const chipId = `${SHOPPING_TAG_FILTER_PREFIX}${key}`;
        if (tagSeen.has(chipId)) return;
        tagSeen.add(chipId);
        counts.set(chipId, (counts.get(chipId) || 0) + 1);
      });
    });
    shoppingChipCounts = counts;
  };

  const pruneInactiveShoppingChipState = () => {
    let changed = false;
    Array.from(activeFilterChips).forEach((chipId) => {
      const count = Number(shoppingChipCounts.get(chipId) || 0);
      if (count <= 0) {
        activeFilterChips.delete(chipId);
        changed = true;
      }
    });
    if (changed) persistShoppingChipState();
  };

  const getActiveShoppingLocationFilterIds = (chipIds = activeFilterChips) =>
    shoppingLocationChipDefs
      .map((c) =>
        String(c?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((id) => id && chipIds.has(id));

  const getActiveShoppingTagKeysFromChipIds = (chipIds = activeFilterChips) =>
    Array.from(chipIds)
      .map((id) =>
        String(id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((id) => id.startsWith(SHOPPING_TAG_FILTER_PREFIX))
      .map((id) => id.slice(SHOPPING_TAG_FILTER_PREFIX.length));

  const buildShoppingRowFilterMatcher = ({
    chipIds = activeFilterChips,
    forcedLocationIds = null,
    forcedTagKeys = null,
  } = {}) => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const foodOnly = chipIds.has('food');
    const selectedOnly = chipIds.has('selected');
    const recipeOnly = chipIds.has('for recipes');
    const removedOnly = chipIds.has('removed');
    const hiddenOnly = chipIds.has('hidden');
    const notFoodOnly = chipIds.has('not food');
    const noRecipeOnly = chipIds.has('no recipe');
    const noAisleOnly = chipIds.has('no aisle');
    const hasVariantsOnly = chipIds.has('has variant(s)');
    const activeLocationIds = Array.isArray(forcedLocationIds)
      ? forcedLocationIds
      : getActiveShoppingLocationFilterIds(chipIds);
    const activeTagKeys = Array.isArray(forcedTagKeys)
      ? forcedTagKeys
          .map((k) =>
            String(k || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
      : getActiveShoppingTagKeysFromChipIds(chipIds);
    return (item) => {
      const name = String(item?.name || '').toLowerCase();
      const variants = Array.isArray(item?.variants) ? item.variants : [];
      const matchesSearch =
        !query ||
        name.includes(query) ||
        variants.some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(query),
        );
      const matchesRemoved = removedOnly
        ? item?.isDeprecated === true
        : item?.isDeprecated !== true;
      const matchesHidden = hiddenOnly
        ? item?.isHidden === true
        : item?.isHidden !== true;
      const matchesFood = foodOnly
        ? item?.isFood === true
        : notFoodOnly
          ? item?.isFood === false
          : true;
      const matchesLocation =
        activeLocationIds.length === 0 ||
        getShoppingRowLocationIdsForBrowse(item).some((locationId) =>
          activeLocationIds.includes(locationId),
        );
      const matchesNoRecipe = noRecipeOnly
        ? Number(item?.recipeUseCount || 0) <= 0
        : true;
      const matchesNoAisle = noAisleOnly
        ? Number(item?.aisleUseCount || 0) <= 0
        : true;
      const matchesHasVariants = hasVariantsOnly
        ? variants.length > 0
        : true;
      const matchesSelected = selectedOnly
        ? hasPositiveShoppingQty(getShoppingRowDirectQty(item))
        : true;
      const matchesRecipeSelections = recipeOnly
        ? hasPositiveShoppingQty(getShoppingRowRecipeQty(item))
        : true;
      const matchesTags =
        activeTagKeys.length === 0 ||
        (Array.isArray(item.tags) &&
          activeTagKeys.some((tk) =>
            item.tags.some(
              (t) =>
                String(t || '')
                  .trim()
                  .toLowerCase() === tk,
            ),
          ));
      return (
        matchesSearch &&
        matchesRemoved &&
        matchesHidden &&
        matchesFood &&
        matchesLocation &&
        matchesNoRecipe &&
        matchesNoAisle &&
        matchesHasVariants &&
        matchesSelected &&
        matchesRecipeSelections &&
        matchesTags
      );
    };
  };

  const isShoppingLocationOptionUnavailable = (rawLocationId) => {
    const locationId = String(rawLocationId || '')
      .trim()
      .toLowerCase();
    if (!locationId) return true;
    // Keep selected options enabled so users can always unselect them.
    if (activeFilterChips.has(locationId)) return false;
    const rowMatchesFilters = buildShoppingRowFilterMatcher({
      chipIds: activeFilterChips,
      forcedLocationIds: [locationId],
    });
    return !shoppingRows.some((item) => rowMatchesFilters(item));
  };

  const isShoppingTagOptionUnavailable = (rawChipId) => {
    const id = String(rawChipId || '')
      .trim()
      .toLowerCase();
    if (!id.startsWith(SHOPPING_TAG_FILTER_PREFIX)) return true;
    const keyOnly = id.slice(SHOPPING_TAG_FILTER_PREFIX.length);
    if (!keyOnly) return true;
    if (activeFilterChips.has(id)) return false;
    const rowMatchesFilters = buildShoppingRowFilterMatcher({
      chipIds: activeFilterChips,
      forcedTagKeys: [keyOnly],
    });
    return !shoppingRows.some((item) => rowMatchesFilters(item));
  };

  const renderShoppingMoreFoodPanelHeader = isShoppingPlannerSelectMode()
    ? (panel) => {
        const host = document.createElement('div');
        host.className = 'app-filter-chip-dropdown-panel-header';
        const labelText = 'not food';
        const editorLabel = document.createElement('label');
        editorLabel.className = 'bottom-nav-editor-toggle';
        const editorTitle = document.createElement('span');
        editorTitle.textContent = labelText;
        const switchTrack = document.createElement('span');
        switchTrack.className = 'bottom-nav-editor-switch-track';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'bottom-nav-editor-switch-input';
        input.setAttribute('aria-label', labelText);
        input.checked = activeFilterChips.has('not food');
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('change', () => {
          if (input.checked) {
            activeFilterChips.add('not food');
            activeFilterChips.delete('food');
          } else {
            activeFilterChips.delete('not food');
          }
          reopenShoppingCompoundDropdownId = 'shopping-more-filters';
          persistShoppingChipState();
          rerenderShoppingFilterChips();
          applyShoppingFilters();
        });
        const switchKnob = document.createElement('span');
        switchKnob.className = 'bottom-nav-editor-switch-knob';
        switchTrack.appendChild(input);
        switchTrack.appendChild(switchKnob);
        editorLabel.appendChild(editorTitle);
        editorLabel.appendChild(switchTrack);
        host.appendChild(editorLabel);
        panel.appendChild(host);
      }
    : null;

  const rerenderShoppingFilterChips = () => {
    const chipMountEl = filterChipRail?.trackEl;
    if (!chipMountEl) return;
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    const reopenCompoundDropdown =
      !suppressLocationDropdownReopen &&
      chipMountEl.querySelector('.app-filter-chip-dropdown-wrap.is-open') !=
        null;
    const reopenCompoundDropdownId = reopenCompoundDropdown
      ? reopenShoppingCompoundDropdownId
      : '';
    suppressLocationDropdownReopen = false;
    reopenShoppingCompoundDropdownId = '';
    const chips = getActiveShoppingFilterChipDefs()
      .filter((chipDef) => chipDef?.kind !== 'location')
      .map((chipDef) => {
        const chipId = String(chipDef?.id || '').toLowerCase();
        const count = Number(shoppingChipCounts.get(chipId) || 0);
        return {
          id: chipId,
          label: chipDef?.label || chipId,
          disabled: count <= 0,
        };
      });
    const locationSelectedIds = shoppingLocationChipDefs
      .map((locationDef) =>
        String(locationDef?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((locationId) => locationId && activeFilterChips.has(locationId));
    const moreSelectedIds = shoppingMoreChipOptionDefs
      .map((optionDef) =>
        String(optionDef?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((optionId) => optionId && activeFilterChips.has(optionId));
    const tagSelectedIds = shoppingTagChipOptionDefs
      .map((def) =>
        String(def?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((tid) => tid && activeFilterChips.has(tid));
    const sortOrderCompoundChip = isShoppingPlannerSelectMode()
      ? [
          {
            id: 'shopping-sort-order',
            label: 'sort by',
            selectionMode: 'single',
            options: [
              { id: SHOPPING_ITEMS_SORT_MODE_AZ, label: 'A–Z' },
              { id: SHOPPING_ITEMS_SORT_MODE_LOCATION, label: 'location' },
            ],
            selectedOptionIds: new Set([
              shoppingItemsSortMode === SHOPPING_ITEMS_SORT_MODE_LOCATION
                ? SHOPPING_ITEMS_SORT_MODE_LOCATION
                : SHOPPING_ITEMS_SORT_MODE_AZ,
            ]),
            onToggleOption: (optionId) => {
              const key = String(optionId || '')
                .trim()
                .toLowerCase();
              if (
                key !== SHOPPING_ITEMS_SORT_MODE_AZ &&
                key !== SHOPPING_ITEMS_SORT_MODE_LOCATION
              )
                return;
              if (key === shoppingItemsSortMode) return;
              shoppingItemsSortMode = key;
              persistShoppingItemsSortMode();
              reopenShoppingCompoundDropdownId = 'shopping-sort-order';
              rerenderShoppingFilterChips();
              applyShoppingFilters();
            },
          },
        ]
      : [];
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips,
      reopenCompoundDropdown,
      reopenCompoundDropdownId,
      leadingCompoundChips: sortOrderCompoundChip,
      compoundInsertIndex: isShoppingPlannerSelectMode()
        ? 1
        : getShoppingFilterChipMode() === 'editor'
          ? 3
          : 4,
      compoundChips: [
        {
          id: 'home-locations',
          label: 'location',
          options: shoppingLocationChipDefs.map((locationDef) => {
            const locationId = String(locationDef?.id || '')
              .trim()
              .toLowerCase();
            return {
              id: locationId,
              label: String(locationDef?.label || locationId),
              disabled: isShoppingLocationOptionUnavailable(locationId),
            };
          }),
          selectedOptionIds: locationSelectedIds,
          onToggleOption: (locationId) => {
            const key = String(locationId || '').toLowerCase();
            if (!key) return;
            if (
              !activeFilterChips.has(key) &&
              isShoppingLocationOptionUnavailable(key)
            )
              return;
            if (activeFilterChips.has(key)) {
              activeFilterChips.delete(key);
            } else {
              activeFilterChips.add(key);
            }
            reopenShoppingCompoundDropdownId = 'home-locations';
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          onClearSelection: () => {
            suppressLocationDropdownReopen = true;
            reopenShoppingCompoundDropdownId = '';
            shoppingLocationChipDefs.forEach((locationDef) => {
              const id = String(locationDef?.id || '')
                .trim()
                .toLowerCase();
              if (id) activeFilterChips.delete(id);
            });
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          clearAriaLabel: 'Clear location filters',
        },
        {
          id: 'shopping-item-tags',
          label: 'tags',
          disabled: shoppingTagChipOptionDefs.length === 0,
          options: shoppingTagChipOptionDefs.map((def) => {
            const optionId = String(def?.id || '')
              .trim()
              .toLowerCase();
            return {
              id: optionId,
              label: String(def?.label || optionId),
              disabled: isShoppingTagOptionUnavailable(optionId),
            };
          }),
          selectedOptionIds: tagSelectedIds,
          onToggleOption: (optionId) => {
            const key = String(optionId || '').toLowerCase();
            if (!key.startsWith(SHOPPING_TAG_FILTER_PREFIX)) return;
            if (
              !activeFilterChips.has(key) &&
              isShoppingTagOptionUnavailable(key)
            )
              return;
            if (activeFilterChips.has(key)) {
              activeFilterChips.delete(key);
            } else {
              activeFilterChips.add(key);
            }
            reopenShoppingCompoundDropdownId = 'shopping-item-tags';
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          onClearSelection: () => {
            suppressLocationDropdownReopen = true;
            reopenShoppingCompoundDropdownId = '';
            shoppingTagChipOptionDefs.forEach((def) => {
              const tid = String(def?.id || '')
                .trim()
                .toLowerCase();
              if (tid) activeFilterChips.delete(tid);
            });
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          clearAriaLabel: 'Clear tag filters',
        },
        {
          id: 'shopping-more-filters',
          label: 'more',
          ...(renderShoppingMoreFoodPanelHeader
            ? {
                pillActive:
                  moreSelectedIds.length > 0 ||
                  activeFilterChips.has('not food'),
                renderPanelHeader: renderShoppingMoreFoodPanelHeader,
              }
            : {}),
          options: shoppingMoreChipOptionDefs.map((optionDef) => {
            const optionId = String(optionDef?.id || '')
              .trim()
              .toLowerCase();
            const count = Number(shoppingChipCounts.get(optionId) || 0);
            return {
              id: optionId,
              label: String(optionDef?.label || optionId),
              disabled: count <= 0,
            };
          }),
          selectedOptionIds: moreSelectedIds,
          onToggleOption: (optionId) => {
            const key = String(optionId || '').toLowerCase();
            if (!key) return;
            const count = Number(shoppingChipCounts.get(key) || 0);
            if (count <= 0) return;
            if (activeFilterChips.has(key)) {
              activeFilterChips.delete(key);
            } else {
              activeFilterChips.add(key);
            }
            reopenShoppingCompoundDropdownId = 'shopping-more-filters';
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          onClearSelection: () => {
            suppressLocationDropdownReopen = true;
            reopenShoppingCompoundDropdownId = '';
            shoppingMoreChipOptionDefs.forEach((optionDef) => {
              const optionId = String(optionDef?.id || '')
                .trim()
                .toLowerCase();
              if (optionId) activeFilterChips.delete(optionId);
            });
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          clearAriaLabel: 'Clear more filters',
        },
      ],
      activeChipIds: activeFilterChips,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        if (!key) return;
        const count = Number(shoppingChipCounts.get(key) || 0);
        if (count <= 0) return;
        const isSelectedFamilyChip = key === 'selected';
        const isFoodFamilyChip = key === 'food' || key === 'not food';
        if (activeFilterChips.has(key)) {
          activeFilterChips.delete(key);
        } else {
          if (isSelectedFamilyChip) {
            activeFilterChips.delete('selected');
          }
          if (isFoodFamilyChip) {
            activeFilterChips.delete('food');
            activeFilterChips.delete('not food');
          }
          activeFilterChips.add(key);
        }
        persistShoppingChipState();
        rerenderShoppingFilterChips();
        applyShoppingFilters();
      },
      chipClassName: 'app-filter-chip',
    });
    filterChipRail?.sync?.();
  };
  const refreshShoppingFilterUi = () => {
    recomputeShoppingChipCounts();
    pruneInactiveShoppingChipState();
    rerenderShoppingFilterChips();
  };
  const refreshShoppingSelectionUi = ({
    activeKey = '',
    fullRerender = true,
  } = {}) => {
    const normalizedActiveKey = String(activeKey || '').trim();
    if (fullRerender) {
      void refreshShoppingBrowsePlanRowsIndex();
    }
    if (!fullRerender && isShoppingPlannerSelectMode()) {
      recomputeShoppingChipCounts();
      filterChipRail?.sync?.();
      if (normalizedActiveKey) {
        shoppingRowStepperController.activate(normalizedActiveKey);
      }
      syncAllVisibleShoppingRowStates();
      list.querySelectorAll('li.shopping-variant-child').forEach((row) => {
        const varKey = String(row.dataset.variantQtyKey || '');
        if (varKey) syncVariantChildVisuals(row, varKey);
      });
      syncVariantParentByKey.forEach((syncFn) => {
        try {
          syncFn();
        } catch (_) {}
      });
      syncShoppingActionButtonState();
      return;
    }
    refreshShoppingFilterUi();
    applyShoppingFilters();
    if (normalizedActiveKey) {
      shoppingRowStepperController.activate(normalizedActiveKey);
    }
    syncAllVisibleShoppingRowStates();
  };
  const focusShoppingPlannerRow = (key) => {
    const normalized = String(key || '').trim();
    if (!normalized) return;
    bumpShoppingBrowsePlannerEdit();
    if (shoppingRowStepperController.isActive(normalized)) {
      shoppingRowStepperController.collapseActive();
    } else {
      shoppingRowStepperController.activate(normalized);
    }
    refreshShoppingSelectionUi({
      activeKey: shoppingRowStepperController.getActiveKey?.() || '',
      fullRerender: false,
    });
  };
  const focusChildVariantStepper = (varKey) => {
    const normalized = String(varKey || '').trim();
    if (!normalized) return;
    bumpShoppingBrowsePlannerEdit();
    if (shoppingRowStepperController.isActive(normalized)) {
      shoppingRowStepperController.collapseActive();
    } else {
      shoppingRowStepperController.activate(normalized);
    }
    syncAllVisibleVariantChildSteppers();
    syncAllVisibleShoppingRowStates();
  };

  window.__favoriteEatsApplyShoppingBrowseSelectionKeyMap = (remaps) => {
    if (!Array.isArray(remaps) || remaps.length === 0) return;
    remaps.forEach(({ oldKey, newKey, itemName, variantName }) => {
      const okOld = String(oldKey || '').trim();
      const okNew = String(newKey || '').trim();
      if (!okOld || !okNew) return;
      if (okOld === okNew) {
        const cur = shoppingSelectionMeta.get(okNew) || {};
        shoppingSelectionMeta.set(okNew, {
          itemName: String(
            itemName != null ? itemName : cur.itemName || '',
          ).trim(),
          variantName: String(
            variantName != null ? variantName : cur.variantName || '',
          ).trim(),
          ...(cur.ingredientVariantId
            ? { ingredientVariantId: cur.ingredientVariantId }
            : {}),
        });
        return;
      }
      if (shoppingQuantities.has(okOld)) {
        const dq = Number(shoppingQuantities.get(okOld) || 0);
        const prevNew = Number(shoppingQuantities.get(okNew) || 0);
        shoppingQuantities.delete(okOld);
        const combined = Number((prevNew + dq).toFixed(4));
        if (Math.abs(combined) > SHOPPING_QTY_EPSILON) {
          shoppingQuantities.set(okNew, combined);
        }
      }
      const metaOld = shoppingSelectionMeta.get(okOld);
      shoppingSelectionMeta.delete(okOld);
      const existingNew = shoppingSelectionMeta.get(okNew) || {};
      const mergedIv =
        metaOld?.ingredientVariantId ?? existingNew?.ingredientVariantId;
      shoppingSelectionMeta.set(okNew, {
        itemName: String(
          itemName != null
            ? itemName
            : metaOld?.itemName || existingNew.itemName || '',
        ).trim(),
        variantName: String(
          variantName != null
            ? variantName
            : metaOld?.variantName || existingNew.variantName || '',
        ).trim(),
        ...(mergedIv ? { ingredientVariantId: mergedIv } : {}),
      });
      if (selectedShoppingNames.has(okOld)) {
        selectedShoppingNames.delete(okOld);
        selectedShoppingNames.add(okNew);
      }
    });
    collapseExpandedVariantRows();
    shoppingRowStepperController?.collapseAll?.();
    refreshShoppingSelectionUi();
    syncShoppingActionButtonState();
  };

  window.__favoriteEatsPruneShoppingBrowseSelectionKeys = (keys) => {
    if (!Array.isArray(keys) || keys.length === 0) return;
    keys.forEach((rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key) return;
      shoppingQuantities.delete(key);
      shoppingSelectionMeta.delete(key);
      selectedShoppingNames.delete(key);
      if (shoppingRowStepperController.isActive(key)) {
        shoppingRowStepperController.collapseActive();
      }
    });
    collapseExpandedVariantRows();
    shoppingRowStepperController?.collapseAll?.();
    refreshShoppingSelectionUi();
    syncShoppingActionButtonState();
  };

  const mountShoppingFilterChips = () => {
    if (!searchInput) return;
    if (typeof window.mountTopFilterChipRail !== 'function') return;
    filterChipRail = window.mountTopFilterChipRail({
      anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
      dockId: 'shoppingFilterChipDock',
    });

    refreshShoppingFilterUi();
    filterChipRail?.sync?.();
  };

  const getFilteredShoppingRows = () => {
    const rowMatchesFilters = buildShoppingRowFilterMatcher({
      chipIds: activeFilterChips,
    });
    const filtered = shoppingRows.filter((item) => rowMatchesFilters(item));
    filtered.sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', undefined, {
        sensitivity: 'base',
      }),
    );
    return filtered;
  };

  const applyShoppingFilters = () => {
    renderShoppingList(getFilteredShoppingRows());
  };

  async function getRecipesUsingShoppingNameViaDataService(name) {
    const n = (name || '').trim();
    if (!n) return [];
    if (
      window.dataService &&
      typeof window.dataService.listShoppingItemRecipeUsage === 'function'
    ) {
      try {
        window.dataService.useSupabase = true;
        const rows = await window.dataService.listShoppingItemRecipeUsage(n);
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error('dataService.listShoppingItemRecipeUsage failed:', err);
        if (favoriteEatsDataServiceIsSupabaseActive()) return [];
      }
    }
    return [];
  }

  async function removeShoppingName(name) {
    const n = (name || '').trim();
    if (!n) return false;

    const recipes = await getRecipesUsingShoppingNameViaDataService(n);
    const usedCount = recipes.length;

    if (getUnitSizeRemovalAction(usedCount) === 'remove') {
      const usageLine =
        usedCount === 1
          ? 'This item is used in this recipe:'
          : 'This item is used in these recipes:';
      const details = document.createElement('div');
      details.className = 'shopping-remove-dialog-details';

      const linksWrap = document.createElement('div');
      linksWrap.className = 'shopping-remove-dialog-links';
      recipes.forEach((recipe) => {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'shopping-remove-dialog-link';
        a.textContent = recipe.title || `Recipe ${recipe.id}`;
        a.addEventListener('click', (event) => {
          event.preventDefault();
          if (typeof window.openRecipe === 'function') {
            window.openRecipe(recipe.id, recipe.title);
          }
        });
        linksWrap.appendChild(a);
      });
      if (recipes.length) details.appendChild(linksWrap);

      const note = document.createElement('div');
      note.className = 'shopping-remove-dialog-note';
      note.textContent = `Removing it will hide it from the Shopping Items list but will not delete it. To delete '${n}' permenantly, first remove it from the recipes that use it.`;
      details.appendChild(note);

      let ok = false;
      if (window.ui && typeof window.ui.dialog === 'function') {
        const res = await window.ui.dialog({
          title: 'Remove item',
          message: `Remove '${n}'? ${usageLine}`,
          messageNode: details,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
        ok = !!res;
      } else {
        ok = await uiConfirm({
          title: 'Remove item',
          message: `Remove '${n}'? ${usageLine}\n\nRemoving it will hide it from the Shopping Items list but will not delete it. To delete '${n}' permenantly, first remove it from the recipes that use it.`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
      }
      if (!ok) return false;

      try {
        await window.dataService.deleteShoppingItem({
          name: n,
          action: 'remove',
        });
      } catch (err) {
        console.error('❌ Failed to deprecate shopping item:', err);
        uiToast('Failed to remove item. See console for details.');
        return false;
      }
    } else {
      const ok = await uiConfirm({
        title: 'Delete Shopping Item',
        message: `Delete '${n}' permanently?\n\nIt isn't used in any recipes. This will permanently delete it from the database.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true,
      });
      if (!ok) return false;

      try {
        await window.dataService.deleteShoppingItem({
          name: n,
          action: 'delete',
        });
      } catch (err) {
        console.error('❌ Failed to delete shopping item:', err);
        uiToast('Failed to delete item. See console for details.');
        return false;
      }
    }

    // Persist DB after remove/hide.
    try {
      await persistDbForCurrentRuntime(db, {
        failureMessage: 'Failed to save database after removing shopping item.',
      });
    } catch (err) {
      console.error(
        '❌ Failed to persist DB after removing shopping item:',
        err,
      );
      uiToast('Failed to save database after removing shopping item.');
      return false;
    }

    return true;
  }

  // --- Shopping item label helpers (tests extract this block) ---
  function getShoppingItemDisplayName(item) {
    const fallbackName = String(item?.name || '').trim();
    if (!fallbackName) return '';
    if (typeof window?.getShoppingCatalogItemDisplayName === 'function') {
      return (
        String(window.getShoppingCatalogItemDisplayName(item) || '').trim() ||
        fallbackName
      );
    }
    if (typeof window?.getIngredientNounDisplay !== 'function')
      return fallbackName;

    const displayName = window.getIngredientNounDisplay({
      name: fallbackName,
      lemma: String(item?.lemma || '').trim(),
      singularIfUnspecified: !!item?.singularIfUnspecified,
      isMassNoun: !!item?.isMassNoun,
      pluralOverride: String(item?.pluralOverride || '').trim(),
      usePluralOverride: !!item?.usePluralOverride,
    });

    return String(displayName || '').trim() || fallbackName;
  }

  if (typeof window !== 'undefined') {
    window.__shoppingItemLabelHelpers = {
      getShoppingItemDisplayName,
    };
  }
  // --- End shopping item label helpers ---

  function renderShoppingList(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    syncVariantParentByKey.clear();
    if (!items.length) {
      renderTopLevelEmptyState(list, 'shoppingItems');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    const makeTextMeasurer = (el) => {
      try {
        const cs = window.getComputedStyle ? getComputedStyle(el) : null;
        const fontStyle = cs ? cs.fontStyle : 'normal';
        const fontVariant = cs ? cs.fontVariant : 'normal';
        const fontWeight = cs ? cs.fontWeight : '400';
        const fontSize = cs ? cs.fontSize : '16px';
        const fontFamily = cs ? cs.fontFamily : 'sans-serif';
        const font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.font = font;
        return (s) => {
          try {
            return ctx.measureText(String(s || '')).width || 0;
          } catch (_) {
            return 0;
          }
        };
      } catch (_) {
        return null;
      }
    };

    const truncateToFitPx = (s, maxPx, measure) => {
      const str = String(s || '');
      if (!measure) return str;
      if (maxPx <= 0) return '';
      if (measure(str) <= maxPx) return str;

      // Ensure we can at least show an ellipsis when needed.
      const ell = '…';
      if (measure(ell) > maxPx) return '';

      let lo = 0;
      let hi = str.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const candidate = str.slice(0, Math.max(0, mid - 1)) + ell;
        if (measure(candidate) <= maxPx) lo = mid;
        else hi = mid - 1;
      }
      return str.slice(0, Math.max(0, lo - 1)) + ell;
    };

    const buildLineToFit = (li, baseName, variants, variantQtyMap) => {
      const vs = Array.isArray(variants)
        ? variants.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      if (vs.length === 0) return baseName;

      const anySelected =
        isShoppingPlannerSelectMode() &&
        variantQtyMap &&
        Array.from(variantQtyMap.values()).some((q) => q > 0);

      // Collapsed planner parent: variant names only in (…); totals live on the badge.
      // If any variant is selected: "any" first when default > 0, then other selected
      // variants, then zero-count variant names at the end.
      // If nothing selected: just variant names in DB order, no "any".
      let parts = [];
      if (anySelected) {
        const defaultQty = (variantQtyMap && variantQtyMap.get('default')) || 0;
        if (defaultQty > 0) parts.push('any');
        const counted = [];
        const uncounted = [];
        vs.forEach((v) => {
          const q = (variantQtyMap && variantQtyMap.get(v)) || 0;
          if (q > 0) counted.push(v);
          else uncounted.push(v);
        });
        parts = parts.concat(counted, uncounted);
      } else {
        parts = vs.slice();
      }

      const cs = window.getComputedStyle ? getComputedStyle(li) : null;
      const padL = cs ? parseFloat(cs.paddingLeft) : 0;
      const padR = cs ? parseFloat(cs.paddingRight) : 0;
      const trailingChromeReserve = isShoppingPlannerSelectMode() ? 48 : 0;
      const maxPx = Math.max(
        0,
        li.clientWidth - (padL || 0) - (padR || 0) - trailingChromeReserve,
      );
      const measure = makeTextMeasurer(li);
      if (!measure || maxPx <= 0) return `${baseName} (${parts[0]})`;

      const prefix = `${baseName} (`;
      const close = `)`;
      const prefixW = measure(prefix);
      const closeW = measure(close);

      const full = `${baseName} (${parts.join(', ')})`;
      if (measure(full) <= maxPx) return full;

      if (parts.length <= 3) {
        const room = Math.max(0, maxPx - prefixW - closeW);
        const inside = truncateToFitPx(parts.join(', '), room, measure);
        return `${prefix}${inside}${close}`;
      }

      for (let visibleCount = 3; visibleCount >= 1; visibleCount--) {
        const remaining = parts.length - visibleCount;
        const suffix = `, + ${remaining} more`;
        const suffixW = measure(suffix);
        const roomForNames = Math.max(0, maxPx - prefixW - suffixW - closeW);

        if (roomForNames <= 0) continue;

        const names = parts.slice(0, visibleCount).join(', ');
        if (measure(names) <= roomForNames) {
          return `${prefix}${names}${suffix}${close}`;
        }
      }

      const remaining = parts.length - 1;
      const suffix = `, + ${remaining} more`;
      const suffixW = measure(suffix);
      const roomForFirst = Math.max(0, maxPx - prefixW - suffixW - closeW);
      const first = truncateToFitPx(parts[0], roomForFirst, measure) || '…';
      return `${prefix}${first}${suffix}${close}`;
    };

    const makeStepperDOM = () => {
      return listRowStepper.createStepperDOM();
    };

    syncVariantChildVisuals = (childLi, varKey) => {
      const directQty = getDirectShoppingQty(varKey);
      const hasTail = browsePlanRowHasRecipeTail(varKey);
      const nextAfterDecrease = getNextShoppingStepQty(directQty, -1);
      const shoppingDecreaseClearsSelection =
        hasPositiveShoppingQty(directQty) &&
        !hasPositiveShoppingQty(nextAfterDecrease);
      listRowStepper.syncRowVisuals(
        childLi,
        buildBrowsePlannerRowStepperOptions(
          directQty,
          hasTail,
          shoppingRowStepperController.isActive(varKey),
          shoppingDecreaseClearsSelection,
        ),
      );
      syncBrowsePlannerRowAmountButton(childLi, varKey);
    };

    const getShoppingBrowseDisplayName = (item) =>
      formatShoppingBrowseItemLabel(getShoppingItemDisplayName(item), item, {
        searchQuery: searchInput?.value || '',
        locationIds: getActiveShoppingLocationFilterIds(),
      });

    const appendShoppingBrowseRowsForItem = (item) => {
      const li = document.createElement('li');
      const baseName = String(item?.name || '').trim();
      const baseDisplayName = getShoppingItemDisplayName(item);
      const displayName = getShoppingBrowseDisplayName(item);
      const hasVariantDisplayHint = displayName !== baseDisplayName;
      const hasVariants =
        Array.isArray(item.variants) && item.variants.length > 0;
      const plannerSelectMode = isShoppingPlannerSelectMode();
      if (Number.isFinite(Number(item?.id)) && Number(item.id) > 0) {
        li.dataset.shoppingItemId = String(Math.trunc(Number(item.id)));
      }

      // ── Expandable variant row (web select mode only) ──
      if (hasVariants && plannerSelectMode) {
        li.classList.add(
          'shopping-variant-parent',
          'shopping-list-group-item',
          'shopping-list-doc-item',
        );
        const itemKey = getShoppingSelectionKey(baseName);
        li.dataset.variantParentKey = itemKey;
        const isExpanded = expandedVariantItems.has(itemKey);
        li.dataset.expanded = isExpanded ? 'true' : 'false';

        const textWrap = document.createElement('div');
        textWrap.className = 'shopping-list-doc-text-wrap';

        const headline = document.createElement('div');
        headline.className =
          'shopping-list-doc-headline list-row-headline--split';

        const nameLink = document.createElement('a');
        nameLink.href = getShoppingEditorHref();
        nameLink.className = 'shopping-list-doc-link list-row-primary';
        if (
          item.variantDeprecatedSet instanceof Set &&
          item.variantDeprecatedSet.size > 0
        ) {
          nameLink.classList.add('shopping-list-doc-link--variant-deprecated');
        }
        nameLink.textContent = baseDisplayName;

        const tail = document.createElement('span');
        tail.className = 'shopping-list-doc-tail';
        tail.appendChild(document.createTextNode('\u00a0'));

        const amountBtn = document.createElement('button');
        amountBtn.type = 'button';
        amountBtn.className =
          'shopping-list-doc-text shopping-list-doc-text--amount list-row-detail';
        amountBtn.setAttribute('aria-label', 'Variant summary');
        amountBtn.textContent = '';

        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className =
          'shopping-list-doc-expand shopping-list-section-toggle';
        expandBtn.setAttribute(
          'aria-label',
          isExpanded ? 'Collapse variant details' : 'Expand variant details',
        );
        expandBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        const expandIcon = document.createElement('span');
        expandIcon.className =
          'material-symbols-outlined shopping-list-section-toggle__icon';
        expandIcon.setAttribute('aria-hidden', 'true');
        expandIcon.textContent = 'expand_more';
        expandBtn.appendChild(expandIcon);

        tail.appendChild(amountBtn);
        tail.appendChild(document.createTextNode('\u00a0'));
        tail.appendChild(expandBtn);

        headline.appendChild(nameLink);
        headline.appendChild(tail);
        textWrap.appendChild(headline);

        const badge = document.createElement('span');
        badge.className = 'shopping-list-row-badge';
        // Keep the badge slot mounted to avoid parent-row layout shifts when
        // quantities transition between zero/non-zero while expanded.
        badge.style.display = 'inline-flex';
        badge.style.visibility = 'hidden';

        const childRows = [];
        const allVariantNames = ['default', ...item.variants];

        li.appendChild(textWrap);
        li.appendChild(badge);

        const applyFoldedHeadlineFromFullLine = (fullLine) => {
          applySplitListRowLabelPair(
            nameLink,
            amountBtn,
            fullLine,
            baseDisplayName,
          );
        };

        // Parent visuals: expand control; badge with total when collapsed with count > 0;
        // no badge while expanded. Defined before child row creation so incrementVariant can reference it.
        const syncParentVisuals = () => {
          const directTotal = getItemDirectTotalQty(
            baseName,
            item.variants,
            item,
          );
          const totalQty = getItemTotalQty(baseName, item.variants, item);
          const groupHasTail = itemBrowseGroupHasRecipeTail(
            baseName,
            item.variants,
            item,
          );
          const expanded = li.dataset.expanded === 'true';
          const hasQty =
            totalQty > 0 || (groupHasTail && isShoppingPlannerSelectMode());
          li.classList.toggle('shopping-row-checked', hasQty);
          const badgeLabel = getShoppingBrowsePlannerBadgeContent(directTotal, {
            hasAmountTail: groupHasTail,
          });

          expandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          expandBtn.setAttribute(
            'aria-label',
            expanded ? 'Collapse variant details' : 'Expand variant details',
          );

          if (expanded) {
            headline.classList.remove('list-row-headline--split');
            nameLink.textContent = baseDisplayName;
            amountBtn.textContent = '';
            amountBtn.style.display = 'none';
            listRowStepper.setShoppingListBadgeQtyLabel(badge, '');
            badge.style.visibility = 'hidden';
          } else {
            if (badgeLabel) {
              listRowStepper.setShoppingListBadgeContent(badge, badgeLabel);
              badge.style.visibility = 'visible';
            } else {
              listRowStepper.setShoppingListBadgeQtyLabel(badge, '');
              badge.style.visibility = 'hidden';
            }
            requestAnimationFrame(() => {
              try {
                if (hasVariantDisplayHint) {
                  applyFoldedHeadlineFromFullLine(displayName);
                  return;
                }
                const qtyMap = getVariantQtyMap(baseName, item.variants, item);
                const nextText = buildLineToFit(
                  li,
                  baseDisplayName,
                  item.variants,
                  qtyMap,
                );
                applyFoldedHeadlineFromFullLine(nextText);
              } catch (_) {}
            });
          }
        };
        syncVariantParentByKey.set(itemKey, syncParentVisuals);

        const clearVariantChildStepperExpansion = () => {
          const activeNow = shoppingRowStepperController.getActiveKey?.() || '';
          const childKeys = allVariantNames.map((variantName) =>
            getBrowseVariantPlanKey(baseName, variantName, item),
          );
          if (activeNow && childKeys.includes(activeNow)) {
            shoppingRowStepperController.collapseActive();
          }
          childRows.forEach((row) => {
            const varKey = String(row.dataset.variantQtyKey || '');
            if (varKey) syncVariantChildVisuals(row, varKey);
          });
        };
        const toggleExpansion = () => {
          if (shoppingRowStepperController.collapseActive()) {
            syncAllVisibleShoppingRowStates();
          }
          const wasExpanded = expandedVariantItems.has(itemKey);
          if (wasExpanded) {
            expandedVariantItems.delete(itemKey);
            li.dataset.expanded = 'false';
            clearVariantChildStepperExpansion();
            childRows.forEach((r) => (r.style.display = 'none'));
          } else {
            collapseExpandedVariantRows();
            expandedVariantItems.add(itemKey);
            li.dataset.expanded = 'true';
            childRows.forEach((r) => (r.style.display = ''));
          }
          syncParentVisuals();
        };

        allVariantNames.forEach((variantName) => {
          const childLi = document.createElement('li');
          childLi.classList.add('shopping-variant-child');
          childLi.style.display = isExpanded ? '' : 'none';

          const variantLabelText =
            variantName === 'default' ? 'any' : variantName;
          const vdk = String(variantName || '')
            .trim()
            .toLowerCase();
          const { textWrap: childTextWrap } = createShoppingBrowsePlannerDocHeadline({
              labelText: variantLabelText,
              labelDeprecated:
                item.variantDeprecatedSet instanceof Set &&
                vdk &&
                item.variantDeprecatedSet.has(vdk),
              amountAriaLabel: 'Variant recipe amount',
            });

          const childIcon = document.createElement('span');
          childIcon.className =
            'material-symbols-outlined shopping-list-row-icon';
          childIcon.textContent = 'add_box';
          childIcon.setAttribute('aria-hidden', 'true');

          const {
            stepper: childStepper,
            minusBtn,
            plusBtn,
            qtySpan,
          } = makeStepperDOM();

          const childBadge = document.createElement('span');
          childBadge.className = 'shopping-list-row-badge';
          childBadge.style.display = 'none';

          childLi.appendChild(childTextWrap);
          childLi.appendChild(childIcon);
          childLi.appendChild(childStepper);
          childLi.appendChild(childBadge);

          const varKey = getBrowseVariantPlanKey(baseName, variantName, item);
          childLi.dataset.variantQtyKey = varKey;
          syncVariantChildVisuals(childLi, varKey);

          const incrementVariant = (delta) => {
            bumpShoppingBrowsePlannerEdit();
            setShoppingQtyFromDirectDelta(varKey, delta, {
              itemName: baseName,
              variantName: variantName === 'default' ? 'default' : variantName,
              ingredientVariantId: resolveBrowseIngredientVariantId(
                item,
                variantName,
              ),
            });
            const nextDirect = getDirectShoppingQty(varKey);
            if (
              !hasPositiveShoppingQty(nextDirect) &&
              shoppingRowStepperController.isActive(varKey)
            ) {
              shoppingRowStepperController.collapseActive();
            }
            refreshShoppingSelectionUi({
              activeKey: shoppingRowStepperController.getActiveKey?.() || '',
              fullRerender: false,
            });
          };
          attachShoppingQtyManualEdit({
            qtyEl: qtySpan,
            getQty: () => getDirectShoppingQty(varKey),
            commitQty: (nextDirect) =>
              setShoppingQtyFromDirectValue(varKey, nextDirect, {
                itemName: baseName,
                variantName,
                ingredientVariantId: resolveBrowseIngredientVariantId(
                  item,
                  variantName,
                ),
              }),
            onAfterCommit: () =>
              refreshShoppingSelectionUi({
                activeKey: varKey,
                fullRerender: false,
              }),
          });

          childBadge.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!isShoppingPlannerSelectMode()) return;
            focusChildVariantStepper(varKey);
          });

          childIcon.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const direct = getDirectShoppingQty(varKey);
            const hasTail = browsePlanRowHasRecipeTail(varKey);
            shoppingRowStepperController.activate(varKey);
            if (hasTail && !hasPositiveShoppingQty(direct)) {
              refreshShoppingSelectionUi({
                activeKey: varKey,
                fullRerender: false,
              });
              return;
            }
            incrementVariant(1);
          });
          minusBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (
              isShoppingPlannerSelectMode() &&
              getDirectShoppingQty(varKey) <= 0
            ) {
              if (shoppingRowStepperController.isActive(varKey)) {
                shoppingRowStepperController.collapseActive();
              }
              syncVariantChildVisuals(childLi, varKey);
              syncParentVisuals();
              return;
            }
            incrementVariant(-1);
          });
          plusBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            shoppingRowStepperController.activate(varKey);
            incrementVariant(1);
          });

          const removeLabel = formatShoppingBrowsePlannerRemoveLabel(
            displayName,
            variantName,
          );
          const promptRemoveVariantFromPlanningList = () => {
            if (!canResetBrowsePlannerDirectRow(varKey)) return;
            void (async () => {
              const ok = await confirmRemoveFromPlanningList(removeLabel);
              if (!ok) return;
              bumpShoppingBrowsePlannerEdit();
              setShoppingQtyFromDirectValue(varKey, 0, {
                itemName: baseName,
                variantName:
                  variantName === 'default' ? 'default' : variantName,
                ingredientVariantId: resolveBrowseIngredientVariantId(
                  item,
                  variantName,
                ),
              });
              if (shoppingRowStepperController.isActive(varKey)) {
                shoppingRowStepperController.collapseActive();
              }
              refreshShoppingSelectionUi({
                activeKey: '',
                fullRerender: false,
              });
              syncVariantChildVisuals(childLi, varKey);
              syncParentVisuals();
            })();
          };

          childLi.addEventListener(
            'click',
            (event) => {
              if (!isShoppingPlannerSelectMode()) return;
              if (!isControlClickRemoveGesture(event)) return;
              event.preventDefault();
              event.stopPropagation();
              promptRemoveVariantFromPlanningList();
            },
            true,
          );

          childLi.addEventListener('click', (event) => {
            if (!isShoppingPlannerSelectMode()) return;
            if (isControlClickRemoveGesture(event)) return;
            event.preventDefault();
            event.stopPropagation();
            focusChildVariantStepper(varKey);
            syncParentVisuals();
          });

          childLi.addEventListener('contextmenu', (event) => {
            if (!isShoppingPlannerSelectMode()) return;
            if (isControlPrimaryContextMenuGesture(event)) {
              event.preventDefault();
              event.stopPropagation();
              promptRemoveVariantFromPlanningList();
            }
          });

          childRows.push(childLi);
        });

        const clearAllVariantQuantities = () => {
          allVariantNames.forEach((variantName) => {
            const vk = getBrowseVariantPlanKey(baseName, variantName, item);
            setShoppingQtyFromDirectValue(vk, 0, {
              itemName: baseName,
              variantName: variantName === 'default' ? 'default' : variantName,
              ingredientVariantId: resolveBrowseIngredientVariantId(
                item,
                variantName,
              ),
            });
          });
          if (shoppingRowStepperController.collapseActive()) {
            syncAllVisibleVariantChildSteppers();
          }
          childRows.forEach((row) => {
            const varKey = String(row.dataset.variantQtyKey || '');
            if (varKey) syncVariantChildVisuals(row, varKey);
          });
          refreshShoppingSelectionUi({ fullRerender: false });
        };

        expandBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleExpansion();
        });

        amountBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });

        nameLink.addEventListener('click', (event) => {
          if (isShoppingPlannerSelectMode()) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          sessionStorage.setItem('selectedShoppingItemId', String(item.id));
          sessionStorage.setItem('selectedShoppingItemName', item.name || '');
          sessionStorage.removeItem('selectedShoppingItemIsNew');
          rememberShoppingScrollForReload();
          window.location.href = getShoppingEditorHref();
        });

        const promptRemoveVariantParentFromPlanningList = () => {
          const directTotal = getItemDirectTotalQty(
            baseName,
            item.variants,
            item,
          );
          if (!hasPositiveShoppingQty(directTotal)) return;
          void (async () => {
            const ok = await confirmRemoveFromPlanningList(displayName);
            if (!ok) return;
            clearAllVariantQuantities();
          })();
        };

        li.addEventListener('click', (event) => {
          const plannerSelectMode = isShoppingPlannerSelectMode();
          if (plannerSelectMode && isControlClickRemoveGesture(event)) {
            event.preventDefault();
            event.stopPropagation();
            promptRemoveVariantParentFromPlanningList();
            return;
          }
          const wantsRemove = event.ctrlKey || event.metaKey;
          if (wantsRemove && !plannerSelectMode) {
            event.preventDefault();
            event.stopPropagation();
            void (async () => {
              const ok = await removeShoppingName(item.name || '');
              if (!ok) return;
              rememberShoppingScrollForReload();
              window.location.reload();
            })();
            return;
          }
          if (plannerSelectMode) {
            toggleExpansion();
            return;
          }
          sessionStorage.setItem('selectedShoppingItemId', String(item.id));
          sessionStorage.setItem('selectedShoppingItemName', item.name || '');
          sessionStorage.removeItem('selectedShoppingItemIsNew');
          rememberShoppingScrollForReload();
          window.location.href = getShoppingEditorHref();
        });

        badge.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isShoppingPlannerSelectMode()) return;
          if (event.shiftKey) {
            clearAllVariantQuantities();
            return;
          }
          toggleExpansion();
        });

        li.addEventListener('contextmenu', (event) => {
          if (isShoppingPlannerSelectMode()) {
            if (isControlPrimaryContextMenuGesture(event)) {
              event.preventDefault();
              event.stopPropagation();
              promptRemoveVariantParentFromPlanningList();
              return;
            }
            event.preventDefault();
            li.classList.toggle('shopping-row-flagged');
            return;
          }
          event.preventDefault();
          void (async () => {
            const ok = await removeShoppingName(item.name || '');
            if (!ok) return;
            rememberShoppingScrollForReload();
            window.location.reload();
          })();
        });

        list.appendChild(li);
        childRows.forEach((child) => list.appendChild(child));
        syncParentVisuals();
        li.title = `${displayName}\n\nAll variants: ${item.variants.join(', ')}`;

        return; // next item
      }

      // ── Simple row (no variants, or non-web-mode) ──
      const {
        textWrap: simpleTextWrap,
        label: simpleLabel,
        amountBtn: simpleAmountBtn,
      } = createShoppingBrowsePlannerDocHeadline({
        labelText: displayName,
        amountAriaLabel: 'Recipe amount',
      });
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined shopping-list-row-icon';
      icon.textContent = 'add_box';
      icon.setAttribute('aria-hidden', 'true');

      const { stepper, minusBtn, plusBtn, qtySpan } = makeStepperDOM();

      const badge = document.createElement('span');
      badge.className = 'shopping-list-row-badge';
      badge.style.display = 'none';
      li.dataset.shoppingStepperKey = baseName;
      li.classList.add('shopping-browse-planner-row');
      let splitRowPrimary = null;
      let splitRowDetail = null;
      li.appendChild(simpleTextWrap);
      if (hasVariants && !isShoppingPlannerSelectMode()) {
        splitRowPrimary = simpleLabel;
        splitRowDetail = simpleAmountBtn;
      }
      li.appendChild(icon);
      li.appendChild(stepper);
      li.appendChild(badge);
      syncShoppingRowSelectionState(li, baseName);
      const simpleRowKey = () =>
        getShoppingItemVariantAwareKey(baseName) ||
        getShoppingSelectionKey(baseName);
      attachShoppingQtyManualEdit({
        qtyEl: qtySpan,
        getQty: () => getDirectShoppingQty(simpleRowKey()),
        commitQty: (nextDirect) =>
          setShoppingQtyFromDirectValue(simpleRowKey(), nextDirect, {
            itemName: baseName,
          }),
        onAfterCommit: () =>
          refreshShoppingSelectionUi({
            activeKey: simpleRowKey(),
            fullRerender: false,
          }),
      });

      icon.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isShoppingPlannerSelectMode()) return;
        const key = simpleRowKey();
        const direct = getDirectShoppingQty(key);
        const hasTail = browsePlanRowHasRecipeTail(key);
        if (hasTail && !hasPositiveShoppingQty(direct)) {
          bumpShoppingBrowsePlannerEdit();
          shoppingRowStepperController.activate(key);
          refreshShoppingSelectionUi({
            activeKey: key,
            fullRerender: false,
          });
          return;
        }
        incrementShoppingQty(li, baseName, 1);
      });

      badge.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isShoppingPlannerSelectMode()) return;
        bumpShoppingBrowsePlannerEdit();
        shoppingRowStepperController.activate(simpleRowKey());
        refreshShoppingSelectionUi({
          activeKey: simpleRowKey(),
          fullRerender: false,
        });
      });

      minusBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (
          isShoppingPlannerSelectMode() &&
          getDirectShoppingQty(simpleRowKey()) <= 0
        ) {
          if (shoppingRowStepperController.isActive(simpleRowKey())) {
            shoppingRowStepperController.collapseActive();
            syncAllVisibleShoppingRowStates();
          }
          return;
        }
        incrementShoppingQty(li, baseName, -1);
      });

      plusBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        incrementShoppingQty(li, baseName, 1);
      });

      const promptRemoveSimpleRowFromPlanningList = () => {
        const key = simpleRowKey();
        if (!canResetBrowsePlannerDirectRow(key)) return;
        void (async () => {
          const ok = await confirmRemoveFromPlanningList(displayName);
          if (!ok) return;
          bumpShoppingBrowsePlannerEdit();
          setShoppingQtyFromDirectValue(key, 0, { itemName: baseName });
          if (shoppingRowStepperController.isActive(key)) {
            shoppingRowStepperController.collapseActive();
          }
          refreshShoppingSelectionUi({
            activeKey: '',
            fullRerender: false,
          });
        })();
      };

      li.addEventListener('click', (event) => {
        const plannerSelectMode = isShoppingPlannerSelectMode();
        if (plannerSelectMode && isControlClickRemoveGesture(event)) {
          event.preventDefault();
          event.stopPropagation();
          promptRemoveSimpleRowFromPlanningList();
          return;
        }
        const wantsRemove = event.ctrlKey || event.metaKey;
        if (wantsRemove && !plannerSelectMode) {
          event.preventDefault();
          event.stopPropagation();
          void (async () => {
            const ok = await removeShoppingName(item.name || '');
            if (!ok) return;
            rememberShoppingScrollForReload();
            window.location.reload();
          })();
          return;
        }

        if (plannerSelectMode) {
          const hadExpandedVariants = collapseExpandedVariantRows();
          // If this click only served to collapse an expanded variant group,
          // do not also auto-expand a simple-row stepper at qty 0.
          if (hadExpandedVariants) return;
          focusShoppingPlannerRow(simpleRowKey());
          return;
        }

        sessionStorage.setItem('selectedShoppingItemId', String(item.id));
        sessionStorage.setItem('selectedShoppingItemName', item.name || '');
        sessionStorage.removeItem('selectedShoppingItemIsNew');
        rememberShoppingScrollForReload();
        window.location.href = getShoppingEditorHref();
      });

      li.addEventListener('contextmenu', (event) => {
        if (isShoppingPlannerSelectMode()) {
          if (isControlPrimaryContextMenuGesture(event)) {
            event.preventDefault();
            event.stopPropagation();
            promptRemoveSimpleRowFromPlanningList();
            return;
          }
          event.preventDefault();
          li.classList.toggle('shopping-row-flagged');
          return;
        }
        event.preventDefault();
        void (async () => {
          const ok = await removeShoppingName(item.name || '');
          if (!ok) return;
          rememberShoppingScrollForReload();
          window.location.reload();
        })();
      });

      list.appendChild(li);

      if (hasVariants && splitRowPrimary && splitRowDetail) {
        try {
          requestAnimationFrame(() => {
            try {
              const nextText = hasVariantDisplayHint
                ? displayName
                : buildLineToFit(
                    li,
                    baseDisplayName,
                    item.variants,
                    isShoppingPlannerSelectMode()
                      ? getVariantQtyMap(baseName, item.variants, item)
                      : null,
                  );
              applySplitListRowLabelPair(
                splitRowPrimary,
                splitRowDetail,
                nextText,
                baseDisplayName,
              );
              li.title = `${displayName}\n\nAll variants: ${item.variants.join(', ')}`;
            } catch (_) {}
          });
        } catch (_) {}
      }
    };

    const sortIsLocation =
      isShoppingPlannerSelectMode() &&
      shoppingItemsSortMode === SHOPPING_ITEMS_SORT_MODE_LOCATION;
    const searchActiveForSections = !!(searchInput?.value || '').trim();

    if (!sortIsLocation) {
      items.forEach(appendShoppingBrowseRowsForItem);
    } else {
      const bucketOrderIds = shoppingLocationChipDefs.map((def) =>
        String(def?.id || '')
          .trim()
          .toLowerCase(),
      );
      const bucketLists = new Map();
      bucketOrderIds.forEach((id) => bucketLists.set(id, []));
      const primaryBucketForItem = (browseItem) => {
        const ids = getShoppingRowLocationIdsForBrowse(browseItem);
        const idSet = new Set(ids);
        for (let i = 0; i < bucketOrderIds.length; i++) {
          const bid = bucketOrderIds[i];
          if (idSet.has(bid)) return bid;
        }
        return 'none';
      };
      items.forEach((browseItem) => {
        const b = primaryBucketForItem(browseItem);
        if (!bucketLists.has(b)) bucketLists.set(b, []);
        bucketLists.get(b).push(browseItem);
      });
      bucketLists.forEach((arr) => {
        arr.sort((a, b) =>
          (a?.name || '').localeCompare(b?.name || '', undefined, {
            sensitivity: 'base',
          }),
        );
      });
      bucketOrderIds.forEach((bucketId) => {
        const rowItems = bucketLists.get(bucketId) || [];
        if (!rowItems.length) return;
        const def = shoppingLocationChipDefs.find(
          (d) =>
            String(d?.id || '')
              .trim()
              .toLowerCase() === bucketId,
        );
        const headerRaw = String(def?.label || bucketId || '').trim();
        const headerText = headerRaw.toUpperCase();
        const sectionKey = itemsBrowseHomeCollapseKey(bucketId);
        const sectionLi = document.createElement('li');
        sectionLi.className =
          'list-section-label shopping-list-section--store'.trim();
        const isCollapsible = !searchActiveForSections;
        if (isCollapsible) {
          const isExpanded = !collapsedItemsBrowseHomeSections.has(sectionKey);
          const toggleBtn = createSectionToggleButton({
            label: headerText,
            expanded: isExpanded,
            completed: false,
            onToggle: () => {
              if (collapsedItemsBrowseHomeSections.has(sectionKey)) {
                collapsedItemsBrowseHomeSections.delete(sectionKey);
              } else {
                collapsedItemsBrowseHomeSections.add(sectionKey);
              }
              persistItemsBrowseHomeCollapsed();
              applyShoppingFilters();
            },
          });
          sectionLi.appendChild(toggleBtn);
        } else {
          sectionLi.textContent = headerText;
        }
        list.appendChild(sectionLi);
        if (
          !isCollapsible ||
          !collapsedItemsBrowseHomeSections.has(sectionKey)
        ) {
          rowItems.forEach(appendShoppingBrowseRowsForItem);
        }
      });
    }

    // Keep selection valid after rerender (search/filter changes).
    listNav?.syncAfterRender?.();
  }

  restoreShoppingChipState();
  mountShoppingFilterChips();
  // Initial render
  applyShoppingFilters();
  fePageLoadFoodIconFinish();
  try {
    if (list?.dataset) list.dataset.fePerfItemsReady = '1';
  } catch (_) {}
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => void runDeferredRecipeDerivedHydrate(), {
      timeout: 2000,
    });
  } else {
    setTimeout(() => void runDeferredRecipeDerivedHydrate(), 0);
  }

  const unregisterCatalogShoppingItems =
    registerFavoriteEatsCatalogReferenceUiRefreshHook(async () => {
      try {
        window.dataService.useSupabase = true;
        const rows = await window.dataService.listShoppingItems();
        shoppingRows = (Array.isArray(rows) ? rows : []).map(
          dataServiceShoppingItemToPageRow,
        );
        await rebuildShoppingTagChipOptionDefsFromRows();
        refreshShoppingFilterUi();
        applyShoppingFilters();
        hydrateShoppingSelectionsFromPlan();
        refreshShoppingSelectionUi();
        syncShoppingActionButtonState();
      } catch (err) {
        console.warn('catalog reference refresh (shopping items) failed:', err);
      }
    });
  window.addEventListener('pagehide', unregisterCatalogShoppingItems, {
    once: true,
  });

  restoreShoppingScrollAfterReload();
  scrollToShoppingNavTarget(pendingShoppingNavTarget);

  // Recipes-style Add: popup → Cancel does nothing → Create inserts + opens editor
  async function openCreateShoppingItemDialog() {
    if (!window.ui) {
      uiToast('UI not ready yet.');
      return;
    }

    const name = await window.ui.prompt({
      title: 'New Shopping Item',
      label: 'Name',
      value: '',
      placeholder: '',
      confirmText: 'Create',
      cancelText: 'Cancel',
      required: true,
      normalize: (v) => (v || '').trim(),
    });
    if (!name) return;

    let newId = null;
    try {
      if (
        !window.dataService ||
        typeof window.dataService.findOrCreateShoppingItem !== 'function'
      ) {
        throw new Error(
          'dataService.findOrCreateShoppingItem is not available.',
        );
      }
      const result = await window.dataService.findOrCreateShoppingItem({
        name,
        lemma: deriveIngredientLemmaInMain(name),
      });
      newId = result?.id != null ? Number(result.id) : null;
      if (newId == null || !Number.isFinite(newId) || newId <= 0) {
        throw new Error('findOrCreateShoppingItem returned no id.');
      }
    } catch (err) {
      console.error('❌ Failed to create shopping item:', err);
      uiToast('Failed to create shopping item. See console.');
      return;
    }

    try {
      await persistDbForCurrentRuntime(db, {
        failureMessage: 'Failed to save database after creating shopping item.',
      });
    } catch (err) {
      console.error(
        '❌ Failed to persist DB after creating shopping item:',
        err,
      );
      uiToast('Failed to save database after creating shopping item.');
      return;
    }

    if (newId != null) {
      sessionStorage.setItem('selectedShoppingItemId', String(newId));
      sessionStorage.setItem('selectedShoppingItemName', name);
      sessionStorage.setItem('selectedShoppingItemIsNew', '1');
      window.location.href = favoriteEatsHrefWithCurrentAdapter(
        'shoppingEditor.html',
      );
    }
  }

  const onShoppingActionClick = async () => {
    if (isShoppingPlannerSelectMode()) {
      const hasItemSelections =
        Object.keys(getShoppingPlanItemSelections()).length > 0;
      const hasRecipeSelections =
        Object.keys(getShoppingPlanRecipeSelections()).length > 0;
      if (!hasItemSelections && !hasRecipeSelections) {
        uiToast('No shopping selections to clear.');
        return;
      }
      const confirmed = await uiConfirm({
        title: 'Reset items',
        message:
          'Are you sure you want to reset your item selections? This will completely clear your shopping list.',
        confirmText: 'Reset',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;
      const previousPlan = cloneForUndo(getShoppingPlan(), () =>
        createEmptyShoppingPlan(),
      );
      const previousShoppingQuantities = new Map(shoppingQuantities);
      const previousShoppingRecipeQuantities = new Map(
        shoppingRecipeQuantities,
      );
      const previousSelectedShoppingNames = new Set(selectedShoppingNames);
      const previousShoppingSelectionMeta = new Map(
        Array.from(shoppingSelectionMeta.entries(), ([key, value]) => [
          key,
          cloneForUndo(value, () => value),
        ]),
      );
      const restoreClearedSelections = () => {
        persistShoppingPlan(previousPlan);
        shoppingQuantities.clear();
        previousShoppingQuantities.forEach((qty, key) => {
          shoppingQuantities.set(key, qty);
        });
        shoppingRecipeQuantities.clear();
        previousShoppingRecipeQuantities.forEach((qty, key) => {
          shoppingRecipeQuantities.set(key, qty);
        });
        selectedShoppingNames.clear();
        previousSelectedShoppingNames.forEach((name) => {
          selectedShoppingNames.add(name);
        });
        shoppingSelectionMeta.clear();
        previousShoppingSelectionMeta.forEach((meta, key) => {
          shoppingSelectionMeta.set(
            key,
            cloneForUndo(meta, () => meta),
          );
        });
        collapseExpandedVariantRows();
        shoppingRowStepperController?.collapseAll?.();
        refreshShoppingSelectionUi();
        syncShoppingActionButtonState();
      };
      clearShoppingPlanSelections({ clearItems: true, clearRecipes: true });
      shoppingQuantities.clear();
      shoppingRecipeQuantities.clear();
      selectedShoppingNames.clear();
      shoppingSelectionMeta.clear();
      collapseExpandedVariantRows();
      shoppingRowStepperController?.collapseAll?.();
      refreshShoppingSelectionUi();
      syncShoppingActionButtonState();
      uiToastUndo('All shopping selections cleared.', restoreClearedSelections);
    } else {
      void openCreateShoppingItemDialog();
    }
  };
  const syncShoppingAppBarActionChrome = () => {
    if (!addBtn) return;
    if (isShoppingPlannerSelectMode()) {
      ensureAppBarTextActionPair(addBtn, 'Reset', 'cancel');
    } else {
      ensureAppBarTextActionPair(addBtn, 'Add', 'add');
    }
    syncShoppingActionButtonState();
  };
  if (addBtn) {
    syncShoppingAppBarActionChrome();
    addBtn.addEventListener('click', onShoppingActionClick);
    window.addEventListener(FAVORITE_EATS_PLANNER_MODE_EVENT, () => {
      if (!document.body.classList.contains('shopping-page')) return;
      syncShoppingAppBarActionChrome();
      shoppingRowStepperController?.collapseAll?.();
      refreshShoppingSelectionUi();
    });
  }

  registerFavoriteEatsRemotePlanUiRefreshHook(async () => {
    if (list.querySelector('.shopping-stepper-qty-input')) return;
    const editSeqAtStart = shoppingBrowsePlannerEditSeq;
    const planSaveInFlight = getShoppingPlanRemoteSaveInFlight() > 0;
    const userEditedDuringHydrate =
      editSeqAtStart !== shoppingBrowsePlannerEditSeq;
    if (!planSaveInFlight && !userEditedDuringHydrate) {
      hydrateShoppingSelectionsFromPlan();
    }
    try {
      await hydrateRecipeDerivedShoppingSelections();
    } catch (err) {
      console.warn(
        'hydrateRecipeDerivedShoppingSelections (realtime) failed:',
        err,
      );
      return;
    }
    const activeKeyNow = shoppingRowStepperController?.getActiveKey?.() || '';
    refreshShoppingSelectionUi({
      activeKey: activeKeyNow,
      fullRerender: false,
    });
    syncShoppingActionButtonState();
  });
  window.addEventListener(
    'pagehide',
    () => {
      teardownFavoriteEatsShoppingPlanRealtime();
    },
    { once: true },
  );
}

  global.favoriteEatsItemsPage = {
    registerFavoriteEatsItemsPageDeps,
    loadShoppingPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
