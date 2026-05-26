/**
 * Recipes hub page UI (Slice 7 phase 2).
 */
(function favoriteEatsRecipesPageModule(global) {
  if (!global) return;

  /** @type {object|null} */
  let deps = null;

  function registerFavoriteEatsRecipesPageDeps(nextDeps) {
    deps = nextDeps && typeof nextDeps === 'object' ? nextDeps : null;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error('favoriteEatsRecipesPage deps are not registered.');
    }
    return deps;
  }

/** Cuisine tags shown under one compound filter on the recipes list (label: region). */
const RECIPE_LIST_REGIONAL_TAG_LABELS = [
  'Asian',
  'Chinese',
  'Indian',
  'Italian',
  'Japanese',
  'Mexican & Latin',
  'Vietnamese',
];
const RECIPE_LIST_REGIONAL_KEYS = new Set(
  RECIPE_LIST_REGIONAL_TAG_LABELS.map((s) => s.toLowerCase()),
);
/** Meal tags shown under one compound filter on the recipes list (label: meal). */
const RECIPE_LIST_MEAL_TAG_LABELS = ['dinner', 'lunch', 'breakfast'];
const RECIPE_LIST_MEAL_KEYS = new Set(
  RECIPE_LIST_MEAL_TAG_LABELS.map((s) => s.toLowerCase()),
);
/** Recipes list filter chip id — not a real tag; shows recipes with no tags. */
const RECIPE_LIST_NO_TAG_FILTER_CHIP_ID = '__fe_recipe_no_tag__';
/** Recipes list filter chip id — planner picks only (plan quantity / stepper selection > 0). */
const RECIPE_LIST_SELECTED_FILTER_CHIP_ID = '__fe_recipe_selected__';

  async function loadRecipesPage() {
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
    ensureRecipeListServingsHeaderLabelMediaListener,
    ensureRecipeTagsSchemaInMain,
    ensureIngredientVariantTagsSchemaInMain,
    enableTopLevelListKeyboardNav,
    wireAppBarSearch,
    FAVORITE_EATS_JUST_LOGGED_IN_FROM_WELCOME_KEY,
    FAVORITE_EATS_WELCOME_IDENTITY_TOAST_DELAY_MS,
    isPlannerModeEnabled,
    favoriteEatsDataServiceIsSupabaseActive,
    primeShoppingPlanRecipeDetailCacheForRecipeTree,
    primeShoppingPlanRecipeDetailCacheFromPlanRecipeRoots,
    touchShoppingPlanRecipeSelectionsMaterialization,
    setShoppingPlanRecipeRootSelection,
    getShoppingPlanRecipeSelections,
    getShoppingPlan,
    persistShoppingPlan,
    runWithShoppingPlanMutationBatch,
    createEmptyShoppingPlan,
    cloneForUndo,
    clearShoppingPlanSelections,
    persistDbForCurrentRuntime,
    uiToast,
    uiConfirm,
    uiToastUndo,
    ensureAppBarTextActionPair,
    setSelectedRecipeNavigationSession,
    confirmRemoveFromPlanningList,
    isControlClickRemoveGesture,
    isControlPrimaryContextMenuGesture,
    registerFavoriteEatsRemotePlanUiRefreshHook,
    teardownFavoriteEatsShoppingPlanRealtime,
    setRecipeCatalogRealtimeUnsub,
    FAVORITE_EATS_PLANNER_MODE_EVENT,
    renderTopLevelEmptyState,
    setTopLevelEmptyStateLayoutMode,
    favoriteEatsHrefWithCurrentAdapter,
    favoriteEatsFormatRecipeTitleForDisplay,
  } = requireDeps();

  fePageLoadFoodIconBegin('recipes');
  const db = null;
  window.dbInstance = db;
  if (window.dataService) {
    window.dataService.useSupabase = true;
  }
  let prefetchedRecipeRows = null;
  let recipeRowsLoadedFromDataService = false;
  if (
    window.favoriteEatsRecipesScreen &&
    typeof window.favoriteEatsRecipesScreen.bootstrapRecipesHub === 'function'
  ) {
    const boot = await window.favoriteEatsRecipesScreen.bootstrapRecipesHub({
      shouldUseSupabase: favoriteEatsShouldUseSupabaseDataDoor(),
      includePlan: isPlannerModeEnabled(),
      shouldUseRemoteShoppingState: shouldUseRemoteShoppingState(),
      hydrateShoppingState: hydrateShoppingStateFromDataService,
      reportPrefetchFailure: favoriteEatsReportSupabasePrefetchFailure,
    });
    if (boot.hydrateFailed) {
      fePageLoadFoodIconFail();
      return;
    }
    if (boot.ok && Array.isArray(boot.recipeRows)) {
      prefetchedRecipeRows = boot.recipeRows;
      recipeRowsLoadedFromDataService = true;
    }
  }

  if (!recipeRowsLoadedFromDataService) {
    fePageLoadFoodIconFail();
    return;
  }

  initAppBar({
    mode: 'list',
    titleText: 'Recipes',
  });

  // App bar is injected async; wait before wiring menu/search/add.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();
  var enteredViaWelcome = false;
  try {
    enteredViaWelcome =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(FAVORITE_EATS_JUST_LOGGED_IN_FROM_WELCOME_KEY) ===
        '1';
  } catch (_) {}
  try {
    if (
      typeof window.favoriteEatsShowWelcomeLandingMonikerToast === 'function'
    ) {
      window.favoriteEatsShowWelcomeLandingMonikerToast();
    }
  } catch (_) {}
  try {
    const monikerArmOk = enteredViaWelcome;
    if (monikerArmOk) {
      if (
        typeof window.favoriteEatsSetCoPresenceAllowedAfterIdentityToast ===
        'function'
      ) {
        window.favoriteEatsSetCoPresenceAllowedAfterIdentityToast(
          FAVORITE_EATS_WELCOME_IDENTITY_TOAST_DELAY_MS,
        );
      }
    } else {
      window.favoriteEatsCoPresenceEarliestOkAtTs = 0;
      window.favoriteEatsCoPresenceLoginEventArmed = false;
    }
  } catch (_) {}

  const addBtnRecipes = document.getElementById('appBarAddBtn');
  const recipesActionBtn = addBtnRecipes;

  const list = document.getElementById('recipeList');
  if (!list) return;
  ensureRecipeListServingsHeaderLabelMediaListener();
  ensureRecipeTagsSchemaInMain(db);
  ensureIngredientVariantTagsSchemaInMain(db);
  list.innerHTML = '';

  window.dbInstance = db;

  // Keyboard selection + Enter activation for list rows.
  const listNav = enableTopLevelListKeyboardNav(list);
  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: (query) => {
      searchQuery = String(query || '').toLowerCase();
      rerenderFilteredRecipes();
    },
  });
  const recipeFilterChipRail =
    typeof window.mountTopFilterChipRail === 'function' && searchInput
      ? window.mountTopFilterChipRail({
          anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
          dockId: 'recipeFilterChipDock',
        })
      : null;

  const activeTagFilters = new Set();
  /** Compound filter menu to reopen after chip rerender (region / meal / more). */
  let reopenRecipeCompoundDropdownId = '';
  let searchQuery = '';
  let recipeRows = [];
  const listRowStepper = window.listRowStepper;
  const recipeSelectionKeys = new Set();
  let recipeRowEditingKey = '';
  const recipePlannerServingsUi = window.recipePlannerModeServings || {};
  const recipePlannerServingsChangedEventName =
    window.favoriteEatsRecipePlannerServings?.changeEventName ||
    window.favoriteEatsEventNames?.recipePlannerServingsChanged ||
    '';
  const isRecipePlannerSelectMode = () => isPlannerModeEnabled();
  const toPositiveServingsOrNull = (rawValue) => {
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  };
  const getRecipeQtyKey = (recipeId) => String(recipeId || '').trim();
  const isRecipeSelected = (recipeId) =>
    recipeSelectionKeys.has(getRecipeQtyKey(recipeId));
  const formatRecipeTitleForDisplay =
    window.favoriteEatsFormatRecipeTitleForDisplay ||
    favoriteEatsFormatRecipeTitleForDisplay;
  const getRecipeRowById = (recipeId) =>
    recipeRows.find((row) => Number(row?.id) === Number(recipeId)) || null;
  const primeRecipeRowServings = (recipeRow) => {
    if (!recipeRow) return;
    // Charter §F: per-key precedence. If the servings queue has an in-flight
    // value for this recipe, the queue's value is the authoritative local
    // intent — newer than anything cached in storage A (recipePlannerServingsMap)
    // or storage B (shoppingPlanCache). Apply it to the model FIRST so the
    // priming step below cannot clobber the user's most-recent tap when the
    // wholesale realtime hydrate carried a stale snapshot.
    const queue =
      typeof window !== 'undefined'
        ? window.favoriteEatsPlanRecipeServingsQueue
        : null;
    if (queue && typeof queue.getPendingOp === 'function') {
      const rid = Number(recipeRow.id);
      if (Number.isFinite(rid) && rid > 0) {
        const opLike = {
          surface: 'plan',
          entityKey: String(Math.trunc(rid)),
          field: 'servingsOverride',
        };
        const pending = queue.getPendingOp(opLike);
        const inFlight =
          typeof queue.getInFlightOp === 'function'
            ? queue.getInFlightOp(opLike)
            : null;
        const localIntent = pending || inFlight;
        if (
          localIntent &&
          typeof recipePlannerServingsUi.applyToModel === 'function'
        ) {
          const nextValue =
            localIntent.value == null ? null : Number(localIntent.value);
          recipePlannerServingsUi.applyToModel(recipeRow, nextValue, {
            persist: false,
          });
          return;
        }
      }
    }
    if (typeof window.recipePlannerModePrimeRecipe !== 'function') return;
    window.recipePlannerModePrimeRecipe(recipeRow);
  };
  const getRecipeRowBounds = (recipeRow) => {
    if (typeof recipePlannerServingsUi.getBounds === 'function') {
      return recipePlannerServingsUi.getBounds(recipeRow);
    }
    return null;
  };
  const getRecipeRowDisplayServings = (recipeRow) => {
    if (typeof recipePlannerServingsUi.getDisplayValue === 'function') {
      return recipePlannerServingsUi.getDisplayValue(recipeRow);
    }
    const bounds = getRecipeRowBounds(recipeRow);
    if (!bounds) return null;
    return bounds.baseDefault;
  };
  const formatRecipeRowServings = (rawValue) => {
    if (typeof recipePlannerServingsUi.formatDisplay === 'function') {
      return recipePlannerServingsUi.formatDisplay(rawValue);
    }
    return typeof window.formatShoppingQtyForDisplay === 'function'
      ? window.formatShoppingQtyForDisplay(rawValue)
      : String(rawValue == null ? '' : rawValue);
  };
  const initializeRecipeRowServings = (recipeRow) => {
    const bounds = getRecipeRowBounds(recipeRow);
    if (!bounds || typeof recipePlannerServingsUi.applyToModel !== 'function')
      return null;
    const initial =
      bounds.baseDefault != null && bounds.baseDefault > 0
        ? bounds.baseDefault
        : 1;
    return recipePlannerServingsUi.applyToModel(recipeRow, initial);
  };
  const dispatchRecipeRowServingsApplied = (recipeId, appliedValue) => {
    const rid = Number(recipeId);
    const next = Number(appliedValue);
    if (!Number.isFinite(rid) || rid <= 0) return;
    if (!Number.isFinite(next) || next <= 0) return;
    const queue = window.favoriteEatsPlanRecipeServingsQueue;
    if (queue && typeof queue.getKeyState === 'function') {
      const state = queue.getKeyState({
        surface: 'plan',
        entityKey: String(Math.trunc(rid)),
        field: 'servingsOverride',
      });
      if (state && Number(state.lastLocalValue) === next) return;
    }
    const api = window.favoriteEatsRecipePlannerServings;
    if (api && typeof api.dispatchChanged === 'function') {
      api.dispatchChanged(Math.trunc(rid), next);
    }
  };
  const syncRecipesActionButtonState = () => {
    if (!(recipesActionBtn instanceof HTMLButtonElement)) return;
    if (!isRecipePlannerSelectMode()) {
      recipesActionBtn.disabled = false;
      recipesActionBtn.removeAttribute('aria-disabled');
    } else {
      const disabled = recipeSelectionKeys.size === 0;
      recipesActionBtn.disabled = disabled;
      recipesActionBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
    try {
      if (
        typeof window.favoriteEatsSyncMonogramMenuExtraButtons === 'function'
      ) {
        window.favoriteEatsSyncMonogramMenuExtraButtons();
      }
    } catch (_) {}
  };
  const makeRecipeStepperDOM = () => {
    const { stepper, minusBtn, qtySpan, plusBtn } =
      listRowStepper.createStepperDOM({
        decreaseLabel: 'Decrease recipe quantity',
        increaseLabel: 'Increase recipe quantity',
      });
    const qtyBtn = document.createElement('button');
    qtyBtn.type = 'button';
    qtyBtn.className = 'shopping-stepper-qty shopping-stepper-qty-button';
    qtyBtn.setAttribute('aria-label', 'Edit servings');
    qtyBtn.textContent = qtySpan.textContent || '0';
    stepper.replaceChild(qtyBtn, qtySpan);
    return { stepper, minusBtn, qtyBtn, plusBtn };
  };
  let recipeRowStepperController = null;
  const syncRecipeRowSelectionState = (rowEl, recipeRow) => {
    if (!(rowEl instanceof HTMLElement) || !recipeRow) return;
    const recipeId = recipeRow.id;
    const enabled = isRecipePlannerSelectMode();
    const bounds = getRecipeRowBounds(recipeRow);
    const hasServings = !!bounds;
    const selected = isRecipeSelected(recipeId);
    const displayServings = getRecipeRowDisplayServings(recipeRow);
    const hasPositiveDisplayServings =
      Number.isFinite(Number(displayServings)) && Number(displayServings) > 0;
    const isActive =
      selected &&
      hasPositiveDisplayServings &&
      !!recipeRowStepperController?.isActive(getRecipeQtyKey(recipeId));
    const icon = rowEl.querySelector('.shopping-list-row-icon');
    const stepper = rowEl.querySelector('.shopping-list-row-stepper');
    const badge = rowEl.querySelector('.shopping-list-row-badge');
    const disabledIndicator = rowEl.querySelector(
      '.recipe-list-servings-disabled',
    );
    const qtyEl = stepper?.querySelector('.shopping-stepper-qty');
    const minusBtn = stepper?.querySelector('.shopping-stepper-btn');
    const minusIcon = minusBtn?.querySelector('.material-symbols-outlined');
    const formattedServings =
      displayServings == null ? '' : formatRecipeRowServings(displayServings);
    const shouldDeleteOnDecrease = !!(
      hasServings &&
      selected &&
      bounds?.canAdjust &&
      displayServings != null &&
      Math.abs(displayServings - bounds.min) < 1e-9
    );

    rowEl.dataset.recipeServingsAvailable = hasServings ? 'true' : 'false';
    rowEl.dataset.recipeSelected =
      enabled && selected && hasServings ? 'true' : 'false';
    rowEl.classList.toggle(
      'shopping-row-checked',
      enabled && selected && hasServings,
    );

    const servingsSlot = rowEl.querySelector('.recipe-list-servings-slot');
    if (servingsSlot) {
      servingsSlot.classList.toggle(
        'recipe-list-servings-slot--collapsed-hit',
        !!(enabled && hasServings && !isActive),
      );
    }

    if (qtyEl) qtyEl.textContent = formattedServings;
    if (badge) {
      listRowStepper.setShoppingListBadgeQtyLabel(badge, formattedServings);
    }
    if (minusBtn) {
      minusBtn.setAttribute(
        'aria-label',
        shouldDeleteOnDecrease
          ? 'Remove recipe selection'
          : 'Decrease servings',
      );
    }
    if (minusIcon)
      minusIcon.textContent = shouldDeleteOnDecrease ? 'delete' : 'remove';

    if (!enabled) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = 'none';
      if (badge) badge.style.display = 'none';
      if (disabledIndicator) disabledIndicator.style.display = 'none';
      return;
    }

    if (!hasServings) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = 'none';
      if (badge) badge.style.display = 'none';
      if (disabledIndicator) disabledIndicator.style.display = 'inline-flex';
      return;
    }

    if (disabledIndicator) disabledIndicator.style.display = 'none';
    if (isActive) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = 'inline-flex';
      if (badge) badge.style.display = 'none';
      return;
    }

    if (selected) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = 'none';
      if (badge) badge.style.display = 'inline-flex';
      return;
    }

    if (icon) icon.style.display = '';
    if (stepper) stepper.style.display = 'none';
    if (badge) badge.style.display = 'none';
  };
  const setRecipeSelected = async (
    recipeId,
    isSelected,
    { activate = false } = {},
  ) => {
    const recipeKey = getRecipeQtyKey(recipeId);
    const recipeRow = getRecipeRowById(recipeId);
    if (!recipeKey || !recipeRow) return;
    if (isSelected && favoriteEatsDataServiceIsSupabaseActive()) {
      try {
        await primeShoppingPlanRecipeDetailCacheForRecipeTree([recipeId]);
      } catch (primeErr) {
        console.warn(
          'primeShoppingPlanRecipeDetailCacheForRecipeTree failed:',
          primeErr,
        );
      }
    }
    const shouldUseNarrowRecipeQuantity =
      favoriteEatsDataServiceIsSupabaseActive() &&
      window.dataService &&
      typeof window.dataService.setPlanRecipeQuantity === 'function';
    setShoppingPlanRecipeRootSelection(
      {
        recipeId,
        title: recipeRow?.title || '',
        quantity: isSelected ? 1 : 0,
      },
      shouldUseNarrowRecipeQuantity ? { skipRemoteSave: true } : {},
    );
    if (shouldUseNarrowRecipeQuantity) {
      const displayServingsForRpc = isSelected
        ? toPositiveServingsOrNull(getRecipeRowDisplayServings(recipeRow))
        : null;
      void window.dataService
        .setPlanRecipeQuantity({
          recipeId,
          title: recipeRow?.title || '',
          quantity: isSelected ? 1 : 0,
          servingsOverride: displayServingsForRpc,
        })
        .catch((err) => {
          console.warn('setPlanRecipeQuantity failed:', err);
        });
    }
    hydrateRecipeSelectionsFromPlan();
    const displayServings = getRecipeRowDisplayServings(recipeRow);
    const hasPositiveDisplayServings =
      Number.isFinite(Number(displayServings)) && Number(displayServings) > 0;
    if (isSelected && activate && hasPositiveDisplayServings) {
      recipeRowStepperController?.activate(recipeKey);
    } else if (!isSelected && recipeRowStepperController?.isActive(recipeKey)) {
      recipeRowStepperController.collapseActive();
    }
    if (!isSelected && recipeRowEditingKey === recipeKey) {
      recipeRowEditingKey = '';
    }
    syncRecipesActionButtonState();
    rerenderFilteredRecipes();
  };
  const collapseRecipeSelectionUi = () => {
    const changed = !!recipeRowStepperController?.collapseAll?.();
    if (changed) rerenderFilteredRecipes();
  };
  const hydrateRecipeSelectionsFromPlan = () => {
    recipeSelectionKeys.clear();
    Object.values(getShoppingPlanRecipeSelections()).forEach((entry) => {
      const recipeId = Number(entry?.recipeId);
      const quantity = Math.max(0, Math.min(99, Number(entry?.quantity || 0)));
      if (!Number.isFinite(recipeId) || recipeId <= 0) return;
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      recipeSelectionKeys.add(getRecipeQtyKey(recipeId));
      // Do not rewrite plan recipe `quantity` (make-count) here. Remote hydrate
      // and other devices can legitimately have quantity > 1; downgrading to 1
      // was persisting stale local UI back to Supabase and breaking multi-device.
    });
  };
  const clearRecipePlannerUiState = () => {
    recipeSelectionKeys.clear();
    recipeRowEditingKey = '';
    try {
      recipeRowStepperController?.collapseAll?.();
    } catch (_) {}
  };

  const collectRecipesForAddAll = () => {
    const toAdd = [];
    if (!isRecipePlannerSelectMode()) return toAdd;
    recipeRows.forEach((row) => {
      if (!row) return;
      const recipeId = Number(row.id);
      if (!Number.isFinite(recipeId) || recipeId <= 0) return;
      if (!getRecipeRowBounds(row)) return;
      if (isRecipeSelected(recipeId)) return;
      toAdd.push(row);
    });
    return toAdd;
  };

  const applyRecipeAddAllSelections = async () => {
    const toAdd = collectRecipesForAddAll();
    if (!toAdd.length) return false;
    if (favoriteEatsDataServiceIsSupabaseActive()) {
      try {
        await primeShoppingPlanRecipeDetailCacheForRecipeTree(
          toAdd.map((row) => row.id),
        );
      } catch (primeErr) {
        console.warn(
          'primeShoppingPlanRecipeDetailCacheForRecipeTree failed:',
          primeErr,
        );
      }
    }
    runWithShoppingPlanMutationBatch(() => {
      toAdd.forEach((row) => {
        initializeRecipeRowServings(row);
        setShoppingPlanRecipeRootSelection({
          recipeId: row.id,
          title: row.title || '',
          quantity: 1,
        });
      });
    });
    hydrateRecipeSelectionsFromPlan();
    syncRecipesActionButtonState();
    rerenderFilteredRecipes();
    return true;
  };

  let recipesMonogramAddAllBtn = null;
  const syncRecipesMonogramAddAllButtonState = () => {
    if (!(recipesMonogramAddAllBtn instanceof HTMLButtonElement)) return;
    const shouldDisable =
      !isRecipePlannerSelectMode() || collectRecipesForAddAll().length === 0;
    recipesMonogramAddAllBtn.disabled = shouldDisable;
    recipesMonogramAddAllBtn.setAttribute(
      'aria-disabled',
      shouldDisable ? 'true' : 'false',
    );
  };
  const ensureRecipesMonogramAddAllButton = () => {
    if (!isRecipePlannerSelectMode()) return [];
    if (!(recipesMonogramAddAllBtn instanceof HTMLButtonElement)) {
      recipesMonogramAddAllBtn = document.createElement('button');
      recipesMonogramAddAllBtn.type = 'button';
      recipesMonogramAddAllBtn.id = 'appBarMonogramRecipesAddAllBtn';
      recipesMonogramAddAllBtn.className = 'bottom-nav-pill';
      recipesMonogramAddAllBtn.textContent = 'Add all';
      recipesMonogramAddAllBtn.addEventListener('click', async () => {
        if (recipesMonogramAddAllBtn.disabled) return;
        let ok = false;
        if (window.ui && typeof window.ui.dialog === 'function') {
          ok = !!(await window.ui.dialog({
            title: 'Add all',
            message:
              'Add every recipe in the catalog to your menu plan? Already added recipes will stay the same.',
            confirmText: 'Add all',
            cancelText: 'Cancel',
          }));
        } else {
          ok = await uiConfirm({
            title: 'Add all',
            message:
              'Add every recipe in the catalog to your menu plan? Already added recipes will stay the same.',
            confirmText: 'Add all',
            cancelText: 'Cancel',
          });
        }
        if (!ok) return;
        await applyRecipeAddAllSelections();
        syncRecipesMonogramAddAllButtonState();
      });
    }
    syncRecipesMonogramAddAllButtonState();
    return [recipesMonogramAddAllBtn];
  };
  const rebuildRecipesMonogramMenu = () => {
    try {
      if (typeof window.favoriteEatsRebuildMonogramAccountMenu === 'function') {
        window.favoriteEatsRebuildMonogramAccountMenu();
      }
    } catch (_) {}
  };
  window.favoriteEatsMonogramMenuExtraButtons =
    ensureRecipesMonogramAddAllButton;
  window.favoriteEatsSyncMonogramMenuExtraButtons =
    syncRecipesMonogramAddAllButtonState;
  rebuildRecipesMonogramMenu();

  const isRecipeFilterChipDropdownUiTarget = (target) => {
    const el =
      target instanceof Element
        ? target
        : target instanceof Text
          ? target.parentElement
          : null;
    if (!el) return false;
    return !!(
      el.closest('.list-filter-chip-dock') ||
      el.closest('.app-filter-chip-dropdown-panel') ||
      el.closest('.app-filter-chip-dropdown-backdrop')
    );
  };

  const isRecipeCompoundDropdownOpen = () =>
    !!recipeFilterChipRail?.trackEl?.querySelector(
      '.app-filter-chip-dropdown-wrap.is-open',
    );

  const renderTagFilterChips = (rows) => {
    const chipMountEl = recipeFilterChipRail?.trackEl;
    if (!chipMountEl) return;
    const reopenCompoundDropdown = isRecipeCompoundDropdownOpen();
    const persistedOpenId =
      typeof window.readOpenFilterChipCompoundDropdownId === 'function'
        ? window.readOpenFilterChipCompoundDropdownId(chipMountEl)
        : '';
    const reopenCompoundDropdownId = reopenCompoundDropdown
      ? reopenRecipeCompoundDropdownId || persistedOpenId
      : '';
    reopenRecipeCompoundDropdownId = '';
    const regionalSeen = new Set();
    const regionalKeysInOrder = [];
    const mealSeen = new Set();
    const mealKeysInOrder = [];
    const flatNames = [];
    const flatSeen = new Set();
    (rows || []).forEach((r) => {
      (Array.isArray(r.tags) ? r.tags : []).forEach((name) => {
        const key = String(name || '')
          .trim()
          .toLowerCase();
        if (!key) return;
        if (RECIPE_LIST_REGIONAL_KEYS.has(key)) {
          if (!regionalSeen.has(key)) {
            regionalSeen.add(key);
            regionalKeysInOrder.push(key);
          }
          return;
        }
        if (RECIPE_LIST_MEAL_KEYS.has(key)) {
          if (!mealSeen.has(key)) {
            mealSeen.add(key);
            mealKeysInOrder.push(key);
          }
          return;
        }
        if (flatSeen.has(key)) return;
        flatSeen.add(key);
        flatNames.push(String(name || '').trim());
      });
    });
    regionalKeysInOrder.sort((a, b) => {
      const ia = RECIPE_LIST_REGIONAL_TAG_LABELS.findIndex(
        (l) => l.toLowerCase() === a,
      );
      const ib = RECIPE_LIST_REGIONAL_TAG_LABELS.findIndex(
        (l) => l.toLowerCase() === b,
      );
      return ia - ib;
    });
    mealKeysInOrder.sort((a, b) => {
      const ia = RECIPE_LIST_MEAL_TAG_LABELS.findIndex(
        (l) => l.toLowerCase() === a,
      );
      const ib = RECIPE_LIST_MEAL_TAG_LABELS.findIndex(
        (l) => l.toLowerCase() === b,
      );
      return ia - ib;
    });
    flatNames.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    const regionalOptions = regionalKeysInOrder.map((key) => ({
      id: key,
      label:
        RECIPE_LIST_REGIONAL_TAG_LABELS.find((l) => l.toLowerCase() === key) ||
        key,
      disabled: false,
    }));
    const regionalSelectedIds = new Set(
      [...activeTagFilters].filter((k) => RECIPE_LIST_REGIONAL_KEYS.has(k)),
    );
    const leadingRegionalCompound =
      regionalOptions.length > 0
        ? [
            {
              id: 'recipe-regional',
              label: 'region',
              options: regionalOptions,
              selectedOptionIds: regionalSelectedIds,
              onToggleOption: (optionId) => {
                const k = String(optionId || '').toLowerCase();
                if (!k) return;
                if (activeTagFilters.has(k)) activeTagFilters.delete(k);
                else activeTagFilters.add(k);
                reopenRecipeCompoundDropdownId = 'recipe-regional';
                rerenderFilteredRecipes();
              },
              onClearSelection: () => {
                RECIPE_LIST_REGIONAL_KEYS.forEach((rk) => {
                  if (activeTagFilters.has(rk)) activeTagFilters.delete(rk);
                });
                rerenderFilteredRecipes();
              },
              clearAriaLabel: 'Clear regional filters',
            },
          ]
        : [];
    const mealOptions = mealKeysInOrder.map((key) => ({
      id: key,
      label:
        RECIPE_LIST_MEAL_TAG_LABELS.find((l) => l.toLowerCase() === key) ||
        key,
      disabled: false,
    }));
    const mealSelectedIds = new Set(
      [...activeTagFilters].filter((k) => RECIPE_LIST_MEAL_KEYS.has(k)),
    );
    const leadingMealCompound =
      mealOptions.length > 0
        ? [
            {
              id: 'recipe-meal',
              label: 'meal',
              options: mealOptions,
              selectedOptionIds: mealSelectedIds,
              onToggleOption: (optionId) => {
                const k = String(optionId || '').toLowerCase();
                if (!k) return;
                if (activeTagFilters.has(k)) activeTagFilters.delete(k);
                else activeTagFilters.add(k);
                reopenRecipeCompoundDropdownId = 'recipe-meal';
                rerenderFilteredRecipes();
              },
              onClearSelection: () => {
                RECIPE_LIST_MEAL_KEYS.forEach((mk) => {
                  if (activeTagFilters.has(mk)) activeTagFilters.delete(mk);
                });
                rerenderFilteredRecipes();
              },
              clearAriaLabel: 'Clear meal filters',
            },
          ]
        : [];
    const moreCompoundSelectedIds = new Set(
      [...activeTagFilters].filter(
        (id) => id === RECIPE_LIST_NO_TAG_FILTER_CHIP_ID,
      ),
    );
    const recipeMoreCompoundChips = [
      {
        id: 'recipe-more',
        label: 'more',
        options: [
          {
            id: RECIPE_LIST_NO_TAG_FILTER_CHIP_ID,
            label: 'no tag',
            disabled: false,
          },
        ],
        selectedOptionIds: moreCompoundSelectedIds,
        onToggleOption: (optionId) => {
          const k = String(optionId || '').toLowerCase();
          if (!k) return;
          if (activeTagFilters.has(k)) activeTagFilters.delete(k);
          else activeTagFilters.add(k);
          reopenRecipeCompoundDropdownId = 'recipe-more';
          rerenderFilteredRecipes();
        },
        onClearSelection: () => {
          activeTagFilters.delete(RECIPE_LIST_NO_TAG_FILTER_CHIP_ID);
          rerenderFilteredRecipes();
        },
        clearAriaLabel: 'Clear more filters',
      },
    ];
    window.renderFilterChipList({
      mountEl: chipMountEl,
      reopenCompoundDropdown,
      reopenCompoundDropdownId,
      leadingCompoundChips: [...leadingMealCompound, ...leadingRegionalCompound],
      chips: [
        ...(isRecipePlannerSelectMode()
          ? [
              {
                id: RECIPE_LIST_SELECTED_FILTER_CHIP_ID,
                label: 'selected',
                disabled: false,
              },
            ]
          : []),
        ...flatNames.map((name) => ({
          id: String(name || '').toLowerCase(),
          label: String(name || ''),
          disabled: false,
        })),
      ],
      compoundChips: recipeMoreCompoundChips,
      activeChipIds: activeTagFilters,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        if (!key) return;
        if (activeTagFilters.has(key)) activeTagFilters.delete(key);
        else activeTagFilters.add(key);
        rerenderFilteredRecipes();
      },
      chipClassName: 'app-filter-chip',
    });
  };

  const getFilteredRecipeRows = () => {
    const q = searchQuery;
    const recipeRowHasAnyTag = (row) => {
      const tags = Array.isArray(row?.tags) ? row.tags : [];
      return tags.some((t) => String(t || '').trim());
    };
    return recipeRows.filter((row) => {
      const titleText = row.title.toLowerCase();
      const tags = Array.isArray(row.tags) ? row.tags : [];
      const tagsInline = tags.join(' ').toLowerCase();
      const searchMatches =
        !q || titleText.includes(q) || tagsInline.includes(q);
      if (!searchMatches) return false;
      if (!activeTagFilters.size) return true;
      const rowKeys = new Set(
        tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean),
      );
      for (const k of activeTagFilters) {
        if (k === RECIPE_LIST_NO_TAG_FILTER_CHIP_ID) {
          if (recipeRowHasAnyTag(row)) return false;
        } else if (k === RECIPE_LIST_SELECTED_FILTER_CHIP_ID) {
          if (!isRecipePlannerSelectMode()) continue;
          if (!isRecipeSelected(row.id)) return false;
        } else if (!rowKeys.has(k)) {
          return false;
        }
      }
      return true;
    });
  };

  // 🔹 Helper to render a given set of recipes
  function renderRecipeList(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      renderTopLevelEmptyState(list, 'recipes');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    // Hide servings label row in planner mode.
    // if (isPlannerModeEnabled()) {
    //   const headerLi = document.createElement('li');
    //   headerLi.className = 'recipe-list-servings-header';
    //   headerLi.setAttribute('aria-hidden', 'true');
    //   const headerSpacer = document.createElement('span');
    //   headerSpacer.className =
    //     'shopping-list-row-label recipe-list-servings-header-spacer';
    //   headerSpacer.textContent = '';
    //   const headerSlot = document.createElement('span');
    //   headerSlot.className = 'recipe-list-servings-slot';
    //   const headerLabel = document.createElement('span');
    //   headerLabel.className = 'recipe-list-servings-header-label';
    //   syncRecipeListServingsHeaderLabelText(headerLabel);
    //   headerSlot.appendChild(headerLabel);
    //   headerLi.appendChild(headerSpacer);
    //   headerLi.appendChild(headerSlot);
    //   list.appendChild(headerLi);
    // }

    const plannerSelectMode = isRecipePlannerSelectMode();
    items.forEach((row) => {
      const id = row.id;
      const title = row.title;
      const li = document.createElement('li');
      const titleSpan = document.createElement('span');
      titleSpan.className = 'shopping-list-row-label';
      const titleHit = document.createElement('span');
      titleHit.className = 'recipe-list-title-hit';
      titleHit.textContent = formatRecipeTitleForDisplay(title);
      titleSpan.appendChild(titleHit);
      li.appendChild(titleSpan);
      if (!plannerSelectMode) {
        titleSpan.style.fontSize = 'var(--text-bucket-list-primary)';
        li.addEventListener('click', (event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            void deleteRecipeWithConfirm(db, id, title);
            return;
          }
          setSelectedRecipeNavigationSession(id, title);
          window.location.href =
            favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
        });
        li.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          void deleteRecipeWithConfirm(db, id, title);
        });
        window.favoriteEatsBindLongPressRemove?.(li, () => {
          void deleteRecipeWithConfirm(db, id, title);
        });
        list.appendChild(li);
        return;
      }

      primeRecipeRowServings(row);
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined shopping-list-row-icon';
      icon.textContent = 'add_box';
      icon.setAttribute('aria-hidden', 'true');
      const { stepper, minusBtn, qtyBtn, plusBtn } = makeRecipeStepperDOM();
      const badge = document.createElement('span');
      badge.className = 'shopping-list-row-badge';
      badge.style.display = 'none';
      const disabledIndicator = document.createElement('span');
      disabledIndicator.className =
        'material-symbols-outlined recipe-list-servings-disabled';
      disabledIndicator.textContent = 'add_box';
      disabledIndicator.setAttribute('aria-hidden', 'true');
      const slot = document.createElement('span');
      slot.className = 'recipe-list-servings-slot';
      slot.appendChild(icon);
      slot.appendChild(stepper);
      slot.appendChild(badge);
      slot.appendChild(disabledIndicator);
      li.appendChild(slot);
      const recipeKey = getRecipeQtyKey(id);
      li.dataset.recipeRowStepperKey = recipeKey;
      syncRecipeRowSelectionState(li, row);

      const consumeRowStepperEvent = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      const startInlineServingsEdit = () => {
        if (!isRecipePlannerSelectMode() || !isRecipeSelected(id)) return;
        if (recipeRowEditingKey === recipeKey) return;
        recipeRowEditingKey = recipeKey;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'shopping-stepper-qty shopping-stepper-qty-input';
        input.inputMode = 'decimal';
        input.setAttribute('aria-label', 'Servings value');
        const fallbackValue = getRecipeRowDisplayServings(row);
        input.value =
          fallbackValue == null
            ? ''
            : Number.isInteger(fallbackValue)
              ? String(fallbackValue)
              : String(fallbackValue);
        stepper.replaceChild(input, qtyBtn);
        input.focus();
        input.select();

        let cancelled = false;
        const finishEdit = (shouldCommit) => {
          if (recipeRowEditingKey === recipeKey) {
            recipeRowEditingKey = '';
          }
          if (
            shouldCommit &&
            typeof recipePlannerServingsUi.commitInputValue === 'function'
          ) {
            recipePlannerServingsUi.commitInputValue(row, input.value, {
              fallbackValue,
            });
          }
          rerenderFilteredRecipes();
        };

        input.addEventListener('click', consumeRowStepperEvent);
        input.addEventListener('pointerdown', (event) =>
          event.stopPropagation(),
        );
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            consumeRowStepperEvent(event);
            input.blur();
          } else if (event.key === 'Escape') {
            consumeRowStepperEvent(event);
            cancelled = true;
            finishEdit(false);
          }
        });
        input.addEventListener('blur', () => {
          if (cancelled) return;
          finishEdit(true);
        });
      };

      slot.addEventListener('click', (event) => {
        if (!isRecipePlannerSelectMode()) return;
        if (!getRecipeRowBounds(row)) return;
        if (disabledIndicator.contains(event.target)) return;

        const isStepperVisible = stepper.style.display === 'inline-flex';
        if (isStepperVisible && stepper.contains(event.target)) return;

        const selectedNow = isRecipeSelected(id);
        const stepperActive = !!recipeRowStepperController?.isActive(recipeKey);
        if (isStepperVisible && stepperActive) {
          consumeRowStepperEvent(event);
          return;
        }

        consumeRowStepperEvent(event);

        if (!selectedNow) {
          initializeRecipeRowServings(row);
          void setRecipeSelected(id, true, { activate: true });
        } else {
          const displayServings = getRecipeRowDisplayServings(row);
          if (
            Number.isFinite(Number(displayServings)) &&
            Number(displayServings) > 0
          ) {
            recipeRowStepperController?.activate(recipeKey);
          }
          rerenderFilteredRecipes();
        }
      });
      slot.addEventListener('pointerdown', (event) => {
        if (!isRecipePlannerSelectMode()) return;
        if (!getRecipeRowBounds(row)) return;
        if (disabledIndicator.contains(event.target)) return;
        if (
          stepper.style.display === 'inline-flex' &&
          stepper.contains(event.target)
        )
          return;
        event.stopPropagation();
      });
      disabledIndicator.addEventListener('click', consumeRowStepperEvent);
      disabledIndicator.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      stepper.addEventListener('click', (event) => event.stopPropagation());
      stepper.addEventListener('pointerdown', (event) =>
        event.stopPropagation(),
      );
      qtyBtn.addEventListener('click', (event) => {
        consumeRowStepperEvent(event);
        startInlineServingsEdit();
      });

      minusBtn.addEventListener('click', (event) => {
        consumeRowStepperEvent(event);
        if (!isRecipePlannerSelectMode()) return;
        if (!isRecipeSelected(id)) {
          if (recipeRowStepperController?.isActive(recipeKey)) {
            recipeRowStepperController.collapseActive();
            syncOneRecipeRow(id);
          }
          return;
        }
        const bounds = getRecipeRowBounds(row);
        const displayServings = getRecipeRowDisplayServings(row);
        if (!bounds || displayServings == null) return;
        if (bounds.canAdjust && Math.abs(displayServings - bounds.min) < 1e-9) {
          void setRecipeSelected(id, false);
          return;
        }
        const nextValue =
          typeof recipePlannerServingsUi.getNextValue === 'function'
            ? recipePlannerServingsUi.getNextValue(row, -1)
            : null;
        if (
          nextValue == null ||
          typeof recipePlannerServingsUi.applyToModel !== 'function'
        )
          return;
        const appliedValue = recipePlannerServingsUi.applyToModel(row, nextValue);
        dispatchRecipeRowServingsApplied(id, appliedValue);
        syncOneRecipeRow(id);
      });

      plusBtn.addEventListener('click', (event) => {
        consumeRowStepperEvent(event);
        if (!isRecipePlannerSelectMode() || !isRecipeSelected(id)) return;
        const nextValue =
          typeof recipePlannerServingsUi.getNextValue === 'function'
            ? recipePlannerServingsUi.getNextValue(row, 1)
            : null;
        if (
          nextValue == null ||
          typeof recipePlannerServingsUi.applyToModel !== 'function'
        )
          return;
        const appliedValue = recipePlannerServingsUi.applyToModel(row, nextValue);
        dispatchRecipeRowServingsApplied(id, appliedValue);
        syncOneRecipeRow(id);
      });

      const bounds = getRecipeRowBounds(row);
      const displayServings = getRecipeRowDisplayServings(row);
      const atOrAboveMax =
        bounds &&
        displayServings != null &&
        displayServings >= bounds.max - 1e-9;
      minusBtn.disabled =
        !bounds || displayServings == null || !bounds.canAdjust;
      plusBtn.disabled =
        !bounds || displayServings == null || !bounds.canAdjust || atOrAboveMax;

      // Row-level hit target: open recipe from padding, label, gaps — not the servings column.
      const promptRemoveRecipeFromPlanningList = () => {
        if (!isRecipeSelected(id)) return;
        void (async () => {
          const ok = await confirmRemoveFromPlanningList(title);
          if (!ok) return;
          await setRecipeSelected(id, false);
        })();
      };
      li.addEventListener('click', (event) => {
        if (slot.contains(event.target)) return;
        if (isPlannerModeEnabled() && isControlClickRemoveGesture(event)) {
          event.preventDefault();
          event.stopPropagation();
          promptRemoveRecipeFromPlanningList();
          return;
        }
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          void deleteRecipeWithConfirm(db, id, title);
          return;
        }

        collapseRecipeSelectionUi();
        setSelectedRecipeNavigationSession(id, title);
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
      });

      // Right-click / two-finger click → delete dialog as well (editor layout only).
      li.addEventListener('contextmenu', (event) => {
        if (isPlannerModeEnabled()) {
          if (isControlPrimaryContextMenuGesture(event)) {
            event.preventDefault();
            event.stopPropagation();
            promptRemoveRecipeFromPlanningList();
          }
          return;
        }
        event.preventDefault();
        void deleteRecipeWithConfirm(db, id, title);
      });

      window.favoriteEatsBindLongPressRemove?.(
        li,
        () => {
          if (isPlannerModeEnabled()) {
            promptRemoveRecipeFromPlanningList();
            return;
          }
          void deleteRecipeWithConfirm(db, id, title);
        },
        {
          shouldIgnore: (event) => {
            const target = event.target;
            return target instanceof Element && slot.contains(target);
          },
        },
      );

      list.appendChild(li);
    });

    // Keep selection valid after rerender (search/filter changes).
    listNav?.syncAfterRender?.();
  }

  const syncAllVisibleRecipeRowStates = () => {
    list.querySelectorAll('li[data-recipe-row-stepper-key]').forEach((row) => {
      const recipeKey = String(row.dataset.recipeRowStepperKey || '');
      if (!recipeKey) return;
      const recipeRow = getRecipeRowById(Number(recipeKey));
      if (recipeRow) {
        primeRecipeRowServings(recipeRow);
        syncRecipeRowSelectionState(row, recipeRow);
      }
    });
  };
  // Per-row in-place update — used by the +/- handlers so a stepper tap does
  // not trigger a full rerenderFilteredRecipes() / DOM rebuild. Avoids the
  // "many clicks ignored" problem under spam: the row element survives across
  // taps, so its event handlers stay attached.
  const syncOneRecipeRow = (recipeId) => {
    const rid = Number(recipeId);
    if (!Number.isFinite(rid) || rid <= 0) return;
    const key = String(Math.trunc(rid));
    const rowEl = list.querySelector(
      `li[data-recipe-row-stepper-key="${CSS && CSS.escape ? CSS.escape(key) : key}"]`,
    );
    if (!(rowEl instanceof HTMLElement)) return;
    const recipeRow = getRecipeRowById(rid);
    if (recipeRow) syncRecipeRowSelectionState(rowEl, recipeRow);
  };
  const rerenderFilteredRecipes = () => {
    const filtered = getFilteredRecipeRows();
    if (!isRecipeCompoundDropdownOpen()) {
      renderTagFilterChips(recipeRows);
    }
    recipeFilterChipRail?.sync?.();
    renderRecipeList(filtered);
  };
  const refreshRecipeSelectionUi = ({ fullRerender = true } = {}) => {
    if (!fullRerender && isRecipePlannerSelectMode()) {
      const activeKey = recipeRowStepperController?.getActiveKey?.() || '';
      if (activeKey) {
        recipeRowStepperController.activate(activeKey);
      }
      syncAllVisibleRecipeRowStates();
      syncRecipesActionButtonState();
      recipeFilterChipRail?.sync?.();
      return;
    }
    rerenderFilteredRecipes();
  };

  recipeRowStepperController = listRowStepper.createController({
    listEl: list,
    isEnabled: isRecipePlannerSelectMode,
    collapseExpanded: () => {
      if (!recipeRowEditingKey) return false;
      recipeRowEditingKey = '';
      return true;
    },
    idleCollapseMs: 3500,
    onIdleCollapse: rerenderFilteredRecipes,
    shouldPauseIdleCollapse: () =>
      !!list.querySelector('.shopping-stepper-qty-input') ||
      isRecipeCompoundDropdownOpen(),
    idleResetActivity: (target, activeKey) => {
      if (!(target instanceof Element)) return false;
      const row = target.closest('li');
      if (!row || !list.contains(row)) return false;
      return String(row.dataset.recipeRowStepperKey || '') === activeKey;
    },
  });
  recipeRowStepperController.bindAutoDismiss({
    shouldIgnoreTarget: isRecipeFilterChipDropdownUiTarget,
    onDismissed: rerenderFilteredRecipes,
  });
  window.addEventListener('pageshow', collapseRecipeSelectionUi);
  if (recipePlannerServingsChangedEventName) {
    window.addEventListener(recipePlannerServingsChangedEventName, () => {
      rerenderFilteredRecipes();
    });
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== window.favoriteEatsStorageKeys?.recipePlannerServings)
      return;
    rerenderFilteredRecipes();
  });

  // Read recipes via the data service door (see js/data/contracts/listRecipes.md).
  if (!recipeRowsLoadedFromDataService) {
    try {
      recipeRows = await window.dataService.listRecipes();
    } catch (err) {
      console.error('dataService.listRecipes failed:', err);
      recipeRows = [];
    }
  } else {
    recipeRows = Array.isArray(prefetchedRecipeRows)
      ? prefetchedRecipeRows
      : [];
  }
  if (isRecipePlannerSelectMode()) {
    hydrateRecipeSelectionsFromPlan();
  } else {
    clearRecipePlannerUiState();
  }
  syncRecipesActionButtonState();
  rerenderFilteredRecipes();
  fePageLoadFoodIconFinish();

  if (isRecipePlannerSelectMode()) {
    void (async () => {
      if (favoriteEatsShouldUseSupabaseDataDoor()) {
        try {
          await primeShoppingPlanRecipeDetailCacheFromPlanRecipeRoots();
          touchShoppingPlanRecipeSelectionsMaterialization();
        } catch (primeErr) {
          console.warn(
            'Recipes page: shopping-plan recipe cache prime/rematerialize failed:',
            primeErr,
          );
        }
      }
      if (!isRecipePlannerSelectMode()) return;
      hydrateRecipeSelectionsFromPlan();
      syncRecipesActionButtonState();
      rerenderFilteredRecipes();
    })();
  }

  // --- Recipes action button stub ---

  async function openCreateRecipeDialog(db) {
    if (!window.ui) return;
    if (!window.dataService?.useSupabase && !db) return;
    const vals = await window.ui.form({
      title: 'New Recipe',
      fields: [
        {
          key: 'title',
          label: 'Title',
          value: '',
          required: true,
          normalize: (v) => (v || '').trim(),
        },
      ],
      confirmText: 'Create',
      cancelText: 'Cancel',
      validate: (v) => {
        if (!v.title || !v.title.trim()) return 'Title is required.';
        return '';
      },
    });
    if (!vals) return;

    const title = vals.title;
    let newId = null;
    try {
      const created = await window.dataService.createRecipe({ title });
      newId = created?.id;
    } catch (err) {
      console.error('❌ Failed to create recipe:', err);
      window.ui.toast({ message: 'Failed to create recipe. See console.' });
      return;
    }

    if (!window.dataService.useSupabase) {
      // Persist SQLite so editor + list can see the new recipe.
      try {
        await persistDbForCurrentRuntime(db, {
          failureMessage: 'Failed to save database after creating recipe.',
        });
      } catch (err) {
        console.error('❌ Failed to persist DB after creating recipe:', err);
        window.ui.toast({
          message: 'Failed to save database after creating recipe.',
        });
        return;
      }
    }

    if (newId != null) {
      setSelectedRecipeNavigationSession(newId, '');
      sessionStorage.setItem('selectedRecipeIsNew', '1');
      window.location.href =
        favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
    }
  }

  async function deleteRecipeWithConfirm(db, recipeId, title) {
    if (recipeId == null || !window.ui) return;
    if (!window.dataService?.useSupabase && !db) return;
    const ok = await window.ui.confirm({
      title: 'Delete Recipe',
      message: `Delete "${title}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;

    try {
      await window.dataService.deleteRecipe({ id: recipeId });
    } catch (err) {
      console.error('❌ Failed to delete recipe:', err);
      window.ui.toast({ message: 'Failed to delete recipe. See console.' });
      return;
    }

    if (!window.dataService.useSupabase) {
      try {
        await persistDbForCurrentRuntime(db, {
          failureMessage: 'Failed to save database after deleting recipe.',
        });
      } catch (err) {
        console.error('❌ Failed to persist DB after deleting recipe:', err);
        window.ui.toast({
          message: 'Failed to save database after deleting recipe.',
        });
        return;
      }
    }

    recipeRows = recipeRows.filter((r) => Number(r.id) !== Number(recipeId));
    rerenderFilteredRecipes();
  }

  const onRecipesActionClick = async () => {
    const barAction = recipesActionBtn?.dataset?.recipeListBarAction;
    const treatAsAdd =
      barAction === 'add' ||
      (barAction !== 'reset' && !isRecipePlannerSelectMode());
    if (treatAsAdd) {
      void openCreateRecipeDialog(db);
      return;
    }
    if (!recipeSelectionKeys.size) {
      uiToast('No recipe selections to clear.');
      return;
    }
    const confirmed = await uiConfirm({
      title: 'Clear list',
      message:
        'Are you sure you want to clear all recipes from your menu plan? This will completely remove linked items from your item selections and your shopping list.',
      confirmText: 'Clear list',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    const previousPlan = cloneForUndo(getShoppingPlan(), () =>
      createEmptyShoppingPlan(),
    );
    const previousRecipeSelections = new Set(recipeSelectionKeys);
    const restoreClearedRecipes = () => {
      persistShoppingPlan(previousPlan);
      recipeSelectionKeys.clear();
      previousRecipeSelections.forEach((key) => {
        recipeSelectionKeys.add(key);
      });
      recipeRowEditingKey = '';
      recipeRowStepperController?.collapseAll?.();
      syncRecipesActionButtonState();
      rerenderFilteredRecipes();
    };
    runWithShoppingPlanMutationBatch(() => {
      clearShoppingPlanSelections({
        clearRecipes: true,
        allowEmptyPlanRemoteSave: true,
      });
    });
    recipeSelectionKeys.clear();
    recipeRowEditingKey = '';
    recipeRowStepperController?.collapseAll?.();
    syncRecipesActionButtonState();
    rerenderFilteredRecipes();
    uiToastUndo('Recipe selections cleared.', restoreClearedRecipes);
  };
  const syncRecipesAppBarActionChrome = () => {
    if (!recipesActionBtn) return;
    if (isRecipePlannerSelectMode()) {
      recipesActionBtn.dataset.recipeListBarAction = 'reset';
      ensureAppBarTextActionPair(recipesActionBtn, 'Clear list', 'cancel');
    } else {
      recipesActionBtn.dataset.recipeListBarAction = 'add';
      ensureAppBarTextActionPair(recipesActionBtn, 'Add', 'add');
    }
    syncRecipesActionButtonState();
  };
  if (recipesActionBtn) {
    syncRecipesAppBarActionChrome();
    recipesActionBtn.addEventListener('click', onRecipesActionClick);
    window.addEventListener(FAVORITE_EATS_PLANNER_MODE_EVENT, () => {
      if (!document.body.classList.contains('recipes-page')) return;
      recipeRowEditingKey = '';
      recipeRowStepperController?.collapseAll?.();
      syncRecipesAppBarActionChrome();
      rebuildRecipesMonogramMenu();
      if (isRecipePlannerSelectMode()) {
        rerenderFilteredRecipes();
        void (async () => {
          if (
            shouldUseRemoteShoppingState() &&
            typeof hydrateShoppingStateFromDataService === 'function'
          ) {
            try {
              await hydrateShoppingStateFromDataService();
            } catch (err) {
              console.warn('Recipes page: planner state hydrate failed:', err);
              return;
            }
          }
          hydrateRecipeSelectionsFromPlan();
          if (favoriteEatsShouldUseSupabaseDataDoor()) {
            try {
              await primeShoppingPlanRecipeDetailCacheFromPlanRecipeRoots();
              touchShoppingPlanRecipeSelectionsMaterialization();
            } catch (primeErr) {
              console.warn(
                'Recipes page: shopping-plan recipe cache prime/rematerialize failed:',
                primeErr,
              );
            }
          }
          if (!isRecipePlannerSelectMode()) return;
          hydrateRecipeSelectionsFromPlan();
          syncRecipesActionButtonState();
          rerenderFilteredRecipes();
        })();
      } else {
        activeTagFilters.delete(RECIPE_LIST_SELECTED_FILTER_CHIP_ID);
        clearRecipePlannerUiState();
        rerenderFilteredRecipes();
      }
    });
  }

  // Charter §G: after a wholesale hydrate, override any recipes with a
  // pending servings-override op in the singleton queue back to the queue's
  // pending value. Unrelated rows take the authoritative server value as
  // usual; only the in-burst row is preserved.
  const mergePendingRecipeServingsIntoLocalCache = () => {
    const queue = window.favoriteEatsPlanRecipeServingsQueue;
    if (!queue || typeof queue.peekPendingKeys !== 'function') return;
    const ring = window.favoriteEatsRecipePlannerServings;
    if (!ring || typeof ring.setStoredValue !== 'function') return;
    // Iterate the queue's active keys directly so an in-flight servings
    // change on a recipe survives even if the wholesale hydrate did not
    // include that recipe (e.g. add-to-plan + change-servings burst).
    const activeKeys = new Set(queue.peekPendingKeys());
    if (typeof queue.peekInFlightKeys === 'function') {
      queue.peekInFlightKeys().forEach((key) => activeKeys.add(key));
    }
    activeKeys.forEach((compoundKey) => {
      const parts = String(compoundKey).split(':');
      if (
        parts.length < 3 ||
        parts[0] !== 'plan' ||
        parts[parts.length - 1] !== 'servingsOverride'
      ) {
        return;
      }
      const entityKey = parts.slice(1, -1).join(':');
      const opLike = {
        surface: 'plan',
        entityKey,
        field: 'servingsOverride',
      };
      const pending = queue.getPendingOp(opLike);
      const inFlight =
        typeof queue.getInFlightOp === 'function'
          ? queue.getInFlightOp(opLike)
          : null;
      const localIntent = pending || inFlight;
      if (!localIntent) return;
      const rid = Number(entityKey);
      if (!Number.isFinite(rid) || rid <= 0) return;
      const row = getRecipeRowById(rid);
      if (!row) return;
      try {
        ring.setStoredValue(
          row,
          localIntent.value == null ? null : Number(localIntent.value),
          { fallbackRecipeId: rid },
        );
      } catch (_) {}
    });
  };

  registerFavoriteEatsRemotePlanUiRefreshHook(() => {
    if (!isRecipePlannerSelectMode()) return;
    if (recipeRowEditingKey) return;
    if (list.querySelector('.shopping-stepper-qty-input')) return;
    hydrateRecipeSelectionsFromPlan();
    mergePendingRecipeServingsIntoLocalCache();
    refreshRecipeSelectionUi({ fullRerender: false });
  });

  let recipeCatalogRealtimeDebounce = null;
  const scheduleRecipeCatalogListRefresh = () => {
    if (recipeCatalogRealtimeDebounce) {
      clearTimeout(recipeCatalogRealtimeDebounce);
    }
    recipeCatalogRealtimeDebounce = setTimeout(() => {
      recipeCatalogRealtimeDebounce = null;
      void (async () => {
        try {
          window.dataService.useSupabase = true;
          const next = await window.dataService.listRecipes();
          recipeRows = Array.isArray(next) ? next : [];
          const validKeys = new Set(
            recipeRows.map((r) => getRecipeQtyKey(r?.id)),
          );
          for (const key of [...recipeSelectionKeys]) {
            if (!validKeys.has(key)) recipeSelectionKeys.delete(key);
          }
          rerenderFilteredRecipes();
        } catch (err) {
          console.warn('Recipe list refresh (catalog realtime) failed:', err);
        }
      })();
    }, 320);
  };

  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    typeof window.dataService.subscribeRecipeCatalogChanges === 'function'
  ) {
    try {
      window.dataService.useSupabase = true;
      setRecipeCatalogRealtimeUnsub(
        window.dataService.subscribeRecipeCatalogChanges({
          onChange: (payload) => {
            scheduleRecipeCatalogListRefresh();
            void payload;
          },
        }),
      );
    } catch (err) {
      console.warn('subscribeRecipeCatalogChanges failed:', err);
    }
  }

  window.addEventListener(
    'pagehide',
    () => {
      if (recipeCatalogRealtimeDebounce) {
        clearTimeout(recipeCatalogRealtimeDebounce);
        recipeCatalogRealtimeDebounce = null;
      }
      delete window.favoriteEatsMonogramMenuExtraButtons;
      delete window.favoriteEatsSyncMonogramMenuExtraButtons;
      teardownFavoriteEatsShoppingPlanRealtime();
    },
    { once: true },
  );
}

  global.favoriteEatsRecipesPage = {
    registerFavoriteEatsRecipesPageDeps,
    loadRecipesPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
