/**
 * Shopping List hub page UI (Slice 7 phase 2).
 */
(function favoriteEatsShoppingListPageModule(global) {
  if (!global) return;

  /** @type {object|null} */
  let deps = null;

  function registerFavoriteEatsShoppingListPageDeps(nextDeps) {
    deps = nextDeps && typeof nextDeps === 'object' ? nextDeps : null;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error('favoriteEatsShoppingListPage deps are not registered.');
    }
    return deps;
  }

  async function loadShoppingListPage() {
  const {
    fePageLoadFoodIconBegin,
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
    favoriteEatsHrefWithCurrentAdapter,
    getTopLevelPageOrder,
    cloneForUndo,
    uiToast,
    uiConfirm,
    uiToastUndo,
    isControlClickRemoveGesture,
    isControlPrimaryContextMenuGesture,
    setSelectedRecipeNavigationSession,
    registerFavoriteEatsRemotePlanUiRefreshHook,
    registerFavoriteEatsRemoteListUiRefreshHook,
    registerFavoriteEatsRemoteListPatchHook,
    teardownFavoriteEatsShoppingPlanRealtime,
    ensureFavoriteEatsShoppingPlanRealtimeSubscription,
    ensureFavoriteEatsShoppingListRealtimeSubscription,
    renderTopLevelEmptyState,
    setTopLevelEmptyStateLayoutMode,
    createSectionToggleButton,
    normalizeShoppingHomeLocationId,
    getShoppingPlanSelectionRowsViaDataService,
    getShoppingListSelectedRecipeSummaryRowsViaDataService,
    buildShoppingListDocFromPlanRows,
    getAuthoritativeShoppingListDoc,
    normalizeShoppingListDoc,
    persistShoppingListDoc,
    mergeShoppingListDocWithGenerated,
    resolveShoppingListDocConflict,
    applyShoppingListDiscardQuantityChanges,
    isShoppingListDiscardChangesNoOp,
    awaitPersistShoppingStateToDataService,
    persistShoppingListBulkOperationToDataService,
    shoppingListSourcedRowsPayloadFromDoc,
    runFavoriteEatsRemoteListRefresh,
    beginShoppingListRowDataRpc,
    endShoppingListRowDataRpc,
    getShoppingListRowDataRpcInFlight,
    getShoppingListChecklistDisplayRows,
    filterShoppingListChecklistRowsForCollapse,
    getShoppingListPlanRowResolvedLabel,
    splitShoppingListRowTextToLabelAndDetail,
    joinShoppingListLabelAndDetail,
    shoppingListRowAmountDetailDivergedFromSource,
    applyShoppingListRowListRemove,
    applyShoppingListRowListRestore,
    isShoppingListRowListRemoved,
    buildShoppingListRowPlacementRpcPayload,
    confirmShoppingListRowRemove,
    confirmShoppingListRowRestore,
    confirmShoppingListRestoreAll,
    readShoppingListViewModeFromSession,
    persistShoppingListViewMode,
    readShoppingListKeepCompletedInPlaceFromSession,
    persistShoppingListKeepCompletedInPlace,
    readShoppingListGroupItemVariantsFromSession,
    persistShoppingListGroupItemVariants,
    readShoppingListCheckboxActionFromSession,
    persistShoppingListCheckboxActionFromSession,
    readShoppingListCollapsedSectionsFromSession,
    persistShoppingListCollapsedSections,
    buildShoppingListExportPayload,
    formatShoppingListPlainTextFromViewState,
    formatShoppingListHtmlFromViewState,
    getFavoriteEatsInvalidationMaintainOut,
    FAVORITE_EATS_PLANNER_MODE_EVENT,
  } = requireDeps();
  const list = document.getElementById('shoppingListOutput');
  // Web-only: row Cancel/Save live in the app bar (not a strip below the list).
  const shoppingListAppBarChrome = true;
  const shoppingListExportEnabled = false;

  if (list) fePageLoadFoodIconBegin('shopping-list');

  initAppBar({
    mode: 'list',
    titleText: 'Shopping List',
    showSearch: true,
    showAdd: false,
  });

  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();
  window.addEventListener(FAVORITE_EATS_PLANNER_MODE_EVENT, () => {
    if (!getTopLevelPageOrder().includes('shopping-list')) return;
    try {
      window.location.reload();
    } catch (_) {}
  });

  if (!list) return;

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');

  /** Supabase-backed doors run without opening a local database. */
  const db = null;
  window.dbInstance = db;
  if (window.dataService) {
    try {
      window.dataService.useSupabase = true;
    } catch (_) {}
  }

  let prefetchedRecipeSummaryRows = null;
  if (shouldUseRemoteShoppingState()) {
    ensureFavoriteEatsShoppingPlanRealtimeSubscription();
    ensureFavoriteEatsShoppingListRealtimeSubscription();
    if (
      window.favoriteEatsShoppingListScreen &&
      typeof window.favoriteEatsShoppingListScreen.bootstrapShoppingListHub ===
        'function'
    ) {
      const boot =
        await window.favoriteEatsShoppingListScreen.bootstrapShoppingListHub({
          shouldUseRemoteShoppingState: true,
          hydrateShoppingState: hydrateShoppingStateFromDataService,
        });
      if (boot.ok) {
        prefetchedRecipeSummaryRows = Array.isArray(boot.recipeSummaries)
          ? boot.recipeSummaries
          : [];
      }
    } else {
      try {
        await hydrateShoppingStateFromDataService();
      } catch (hydrateErr) {
        console.warn(
          'Shopping list page: could not load plan/list from server:',
          hydrateErr,
        );
      }
    }
  }

  let shoppingListPrefetchedFromDataService = false;
  let prefetchedPlanRows = null;
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listShoppingListPlanRows === 'function'
  ) {
    try {
      prefetchedPlanRows = await getShoppingPlanSelectionRowsViaDataService({});
      shoppingListPrefetchedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure(
        'shopping list plan prefetch',
        err,
      );
      prefetchedPlanRows = null;
      shoppingListPrefetchedFromDataService = false;
    }
  }

  const listNav = enableTopLevelListKeyboardNav(list, {
    excludeRow: (li) =>
      li.classList.contains('shopping-list-doc-contribution-group'),
  });
  let generatedPlanRows;
  let selectedRecipeSummaryRows;
  if (shoppingListPrefetchedFromDataService) {
    generatedPlanRows = prefetchedPlanRows;
    selectedRecipeSummaryRows =
      prefetchedRecipeSummaryRows != null
        ? prefetchedRecipeSummaryRows
        : await getShoppingListSelectedRecipeSummaryRowsViaDataService({ db });
  } else {
    generatedPlanRows = await getShoppingPlanSelectionRowsViaDataService({
      db,
    });
    selectedRecipeSummaryRows =
      await getShoppingListSelectedRecipeSummaryRowsViaDataService({ db });
  }
  const getGeneratedShoppingListDoc = () =>
    buildShoppingListDocFromPlanRows(generatedPlanRows);
  const authoritativeShoppingListDoc = getAuthoritativeShoppingListDoc();
  const initialShoppingListSync = mergeShoppingListDocWithGenerated(
    authoritativeShoppingListDoc,
    getGeneratedShoppingListDoc(),
  );
  const mergedShoppingListDocNormalized = normalizeShoppingListDoc(
    initialShoppingListSync.doc,
  );
  const authoritativeShoppingListNormalized = authoritativeShoppingListDoc
    ? normalizeShoppingListDoc(authoritativeShoppingListDoc)
    : null;
  const skipInitialShoppingListRemoteSave =
    shouldUseRemoteShoppingState() &&
    authoritativeShoppingListNormalized &&
    Array.isArray(initialShoppingListSync.conflicts) &&
    initialShoppingListSync.conflicts.length === 0 &&
    JSON.stringify(mergedShoppingListDocNormalized) ===
      JSON.stringify(authoritativeShoppingListNormalized);
  const pageWrapper =
    list.closest('.page-wrapper') instanceof HTMLElement
      ? list.closest('.page-wrapper')
      : null;

  let controls = null;
  if (!shoppingListAppBarChrome) {
    controls = document.getElementById('shoppingListControls');
    if (!(controls instanceof HTMLElement) && pageWrapper) {
      controls = document.createElement('div');
      controls.id = 'shoppingListControls';
      controls.className = 'shopping-list-controls';
      pageWrapper.insertBefore(controls, list);
    }
  }

  let shoppingListDoc = persistShoppingListDoc(initialShoppingListSync.doc, {
    skipRemoteSave: skipInitialShoppingListRemoteSave,
  });
  let pendingSourceConflicts = Array.isArray(initialShoppingListSync.conflicts)
    ? initialShoppingListSync.conflicts.slice()
    : [];
  let editingRowId = '';
  let editingRowMode = '';
  /**
   * Per-row in-memory drafts when an editor blurs without Save (key = row id).
   * Mirrors list override cells: editing another row must not discard prior drafts.
   */
  let shoppingListRowDraftByRowId = new Map();
  const normalizeShoppingListLocalDraftKey = (rowId) => String(rowId || '');
  const getShoppingListRowDraftForId = (rowId) =>
    shoppingListRowDraftByRowId.get(normalizeShoppingListLocalDraftKey(rowId)) ??
    null;
  const setShoppingListRowDraftForId = (rowId, draft) => {
    const key = normalizeShoppingListLocalDraftKey(rowId);
    if (!draft) {
      shoppingListRowDraftByRowId.delete(key);
      return;
    }
    shoppingListRowDraftByRowId.set(key, draft);
  };
  const clearShoppingListRowDraftStorage = () => {
    shoppingListRowDraftByRowId.clear();
  };
  const shoppingListRowDraftStorageHasAny = () =>
    shoppingListRowDraftByRowId.size > 0;
  const clearShoppingListRowEditing = () => {
    editingRowId = '';
    editingRowMode = '';
  };
  const clearShoppingListRowEditSession = () => {
    clearShoppingListRowEditing();
    clearShoppingListRowDraftStorage();
  };
  let exportBtn = null;
  let webCopyBtn = null;
  let webExportBtn = null;
  const syncShoppingListDocRemote = async (doc, bulkOperation, bulkOptions = {}) => {
    const remote = shouldUseRemoteShoppingState();
    shoppingListDoc = persistShoppingListDoc(
      doc,
      remote ? { skipRemoteSave: true } : {},
    );
    if (!remote) return shoppingListDoc;
    await persistShoppingListBulkOperationToDataService(bulkOperation, {
      fallbackDoc: shoppingListDoc,
      ...bulkOptions,
    });
    shoppingListDoc = mergePendingCheckboxOpsIntoDoc(
      getAuthoritativeShoppingListDoc(),
      'list bulk sync authoritative refresh',
    );
    return shoppingListDoc;
  };

  const syncShoppingListSourcedDocRemote = async (doc) =>
    syncShoppingListDocRemote(doc, 'syncSourcedRows', {
      request: {
        sourcedRows: shoppingListSourcedRowsPayloadFromDoc(doc),
      },
    });
  let resetBtn = null;
  let webResetBtn = null;
  let webUncheckAllBtn = null;
  let webCancelEditBtn = null;
  let webSaveEditBtn = null;
  let controlsCopyBtn = null;
  let controlsCancelEditBtn = null;
  let controlsSaveEditBtn = null;
  let resolvingSourceConflicts = false;
  let exportingShoppingList = false;
  let shoppingListInputClientSeq = 0;
  const pendingCheckTimers = new Map();
  const pendingCheckedRowIds = new Set();
  const collapsedShoppingListSections = new Set();
  const restoreCollapsedShoppingListSections = () => {
    collapsedShoppingListSections.clear();
    readShoppingListCollapsedSectionsFromSession().forEach((key) => {
      collapsedShoppingListSections.add(key);
    });
  };
  const persistCollapsedShoppingListSections = () => {
    persistShoppingListCollapsedSections(collapsedShoppingListSections);
  };
  const resetCollapsedShoppingListSections = () => {
    restoreCollapsedShoppingListSections();
  };
  restoreCollapsedShoppingListSections();
  const expandedShoppingListContributionRows = new Set();
  const CHECK_MOVE_DELAY_MS = 260;
  let shoppingListViewMode = readShoppingListViewModeFromSession();
  let shoppingListKeepCompletedInPlace =
    readShoppingListKeepCompletedInPlaceFromSession();
  let shoppingListGroupItemVariants =
    readShoppingListGroupItemVariantsFromSession();
  let shoppingListCheckboxAction =
    readShoppingListCheckboxActionFromSession() === 'remove'
      ? 'remove'
      : 'complete';
  let shoppingListFilterChipRail = null;
  let reopenShoppingListCompoundDropdownId = '';

  const isShoppingListResetNoOp = (nextDoc) => {
    const generatedDoc = nextDoc || getGeneratedShoppingListDoc();
    return isShoppingListDiscardChangesNoOp(shoppingListDoc, generatedDoc);
  };

  const isShoppingListUncheckAllNoOp = (nextDoc) => {
    if (pendingCheckedRowIds.size > 0) return false;
    const rows = normalizeShoppingListDoc(nextDoc || shoppingListDoc).rows;
    return !rows.some((row) => !!row?.checked);
  };

  const syncShoppingListUncheckAllButtonState = (nextDoc) => {
    const shouldDisable = isShoppingListUncheckAllNoOp(nextDoc);
    const syncBtn = (btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.disabled = shouldDisable;
      btn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    };
    syncBtn(webUncheckAllBtn);
  };

  const syncShoppingListResetButtonState = (nextDoc) => {
    const shouldDisable = isShoppingListResetNoOp(nextDoc);
    const syncBtn = (btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.disabled = shouldDisable;
      btn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    };
    syncBtn(resetBtn);
    syncBtn(webResetBtn);
  };

  /** Read-only plan refetch for Discard baseline; does not merge list doc. */
  const refreshShoppingListGeneratedBaseline = async () => {
    try {
      const nextPlanRows = await getShoppingPlanSelectionRowsViaDataService({
        db,
      });
      generatedPlanRows = nextPlanRows;
      selectedRecipeSummaryRows =
        await getShoppingListSelectedRecipeSummaryRowsViaDataService({ db });
      return getGeneratedShoppingListDoc();
    } catch (err) {
      console.warn(
        'shopping list generated baseline refetch (list refresh) failed:',
        err,
      );
      return null;
    }
  };

  const syncShoppingListExportButtonState = () => {
    if (!shoppingListExportEnabled) return;
    const hasItems =
      buildShoppingListExportPayload(shoppingListDoc?.rows).stores.length > 0;
    const isAvailable = false;
    const shouldDisable = !hasItems || !isAvailable || exportingShoppingList;
    const syncBtn = (btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.disabled = shouldDisable;
      btn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
      btn.textContent = exportingShoppingList ? 'Exporting...' : 'Export';
    };
    syncBtn(exportBtn);
    syncBtn(webExportBtn);
  };

  const cancelPendingCheck = (rowId) => {
    const normalizedId = String(rowId || '');
    const timerId = pendingCheckTimers.get(normalizedId);
    if (timerId) window.clearTimeout(timerId);
    pendingCheckTimers.delete(normalizedId);
    pendingCheckedRowIds.delete(normalizedId);
  };
  const cancelAllPendingChecks = () => {
    Array.from(pendingCheckTimers.keys()).forEach((rowId) => {
      cancelPendingCheck(rowId);
    });
  };

  const SHOPPING_LIST_CHECKBOX_SYNC_LOG_PREFIX =
    '[favorite-eats-shopping-list-checkbox]';
  const shoppingListCheckboxSyncInstanceId = (() => {
    try {
      const next =
        Number(global.__favoriteEatsShoppingListCheckboxSyncInstanceSeq || 0) + 1;
      global.__favoriteEatsShoppingListCheckboxSyncInstanceSeq = next;
      global.__favoriteEatsShoppingListCheckboxSyncActiveInstanceId = next;
      return next;
    } catch (_) {
      return Date.now();
    }
  })();
  const isActiveShoppingListCheckboxSyncInstance = () => {
    try {
      return (
        global.__favoriteEatsShoppingListCheckboxSyncActiveInstanceId ===
        shoppingListCheckboxSyncInstanceId
      );
    } catch (_) {
      return true;
    }
  };
  let shoppingListPlanUiRefreshSeq = 0;
  const logShoppingListCheckboxSync = (label, detail = {}) => {
    try {
      if (global.favoriteEatsInputSyncDebugToConsole === false) return;
      console.info(SHOPPING_LIST_CHECKBOX_SYNC_LOG_PREFIX, label, {
        instanceId: shoppingListCheckboxSyncInstanceId,
        ...detail,
      });
    } catch (_) {}
  };
  const logShoppingListCheckboxDeviation = (label, detail = {}) => {
    try {
      console.warn(
        SHOPPING_LIST_CHECKBOX_SYNC_LOG_PREFIX,
        'architecture deviation',
        {
          label,
          instanceId: shoppingListCheckboxSyncInstanceId,
          ...detail,
        },
      );
    } catch (_) {}
  };

  const flushShoppingListCheckedToSupabase = (rpc, options = {}) => {
    if (
      !rpc ||
      typeof window.dataService?.setShoppingListRowChecked !== 'function'
    ) {
      return;
    }
    const rowId = String(rpc.rowId || '').trim();
    if (!rowId) return;
    const onFailure =
      options && typeof options.onFailure === 'function'
        ? options.onFailure
        : null;
    const runFailure = () => {
      if (onFailure) onFailure();
    };
    const store = window.favoriteEatsStore;
    logShoppingListCheckboxDeviation('legacy direct checkbox rpc path used', {
      rowId,
      checked: !!rpc.checked,
    });
    if (store && typeof store.beginPendingRowOp === 'function') {
      store.beginPendingRowOp(rowId, {
        kind: 'checked',
        checked: !!rpc.checked,
      });
    }
    beginShoppingListRowDataRpc();
    let checkboxRpcSucceeded = false;
    void window.dataService
      .setShoppingListRowChecked({
        rowId,
        checked: !!rpc.checked,
      })
      .then(async (result) => {
        if (!result || result.ok !== false) {
          checkboxRpcSucceeded = true;
          return;
        }
        const reason = String(result.reason || '').trim();
        const checkboxRpcBootstrapReasons = new Set([
          'no_active_session',
          'no_plan_document',
          'row_not_found',
        ]);
        const canBootstrapListFromDoc =
          checkboxRpcBootstrapReasons.has(reason) &&
          shouldUseRemoteShoppingState() &&
          shoppingListDoc &&
          Array.isArray(shoppingListDoc.rows) &&
          shoppingListDoc.rows.length > 0;
        if (canBootstrapListFromDoc) {
          const remoteState = await awaitPersistShoppingStateToDataService({
            shoppingListDoc: normalizeShoppingListDoc(shoppingListDoc),
          });
          if (remoteState) {
            checkboxRpcSucceeded = true;
            shoppingListDoc = getAuthoritativeShoppingListDoc();
            renderChecklistWithHomeLocationRefresh();
            return;
          }
        }
        runFailure();
      })
      .catch((err) => {
        console.warn('setShoppingListRowChecked failed:', err);
        runFailure();
      })
      .finally(() => {
        endShoppingListRowDataRpc();
        if (checkboxRpcSucceeded && store && typeof store.scheduleEndPendingRowOp === 'function') {
          store.scheduleEndPendingRowOp(rowId);
        } else if (store && typeof store.endPendingRowOp === 'function') {
          store.endPendingRowOp(rowId);
        }
      });
  };

  const flushShoppingListTextToSupabase = (rpc, options = {}) => {
    if (
      !rpc ||
      typeof window.dataService?.setShoppingListRowText !== 'function'
    ) {
      return;
    }
    const rowId = String(rpc.rowId || '').trim();
    if (!rowId) return;
    const text = rpc.text != null ? String(rpc.text) : '';
    const onFailure =
      options && typeof options.onFailure === 'function'
        ? options.onFailure
        : null;
    const runFailure = () => {
      if (onFailure) onFailure();
    };
    const store = window.favoriteEatsStore;
    if (store && typeof store.beginPendingRowOp === 'function') {
      store.beginPendingRowOp(rowId, {
        kind: 'text',
        text,
      });
    }
    beginShoppingListRowDataRpc();
    let textRpcSucceeded = false;
    void window.dataService
      .setShoppingListRowText({
        rowId,
        text,
      })
      .then(async (result) => {
        if (!result || result.ok !== false) {
          textRpcSucceeded = true;
          return;
        }
        const reason = String(result.reason || '').trim();
        const textRpcBootstrapReasons = new Set([
          'no_active_session',
          'no_plan_document',
          'row_not_found',
        ]);
        const canBootstrapListFromDoc =
          textRpcBootstrapReasons.has(reason) &&
          shouldUseRemoteShoppingState() &&
          shoppingListDoc &&
          Array.isArray(shoppingListDoc.rows) &&
          shoppingListDoc.rows.length > 0;
        if (canBootstrapListFromDoc) {
          const remoteState = await awaitPersistShoppingStateToDataService({
            shoppingListDoc: normalizeShoppingListDoc(shoppingListDoc),
          });
          if (remoteState) {
            textRpcSucceeded = true;
            shoppingListDoc = getAuthoritativeShoppingListDoc();
            renderChecklistWithHomeLocationRefresh();
            return;
          }
        }
        runFailure();
      })
      .catch((err) => {
        console.warn('setShoppingListRowText failed:', err);
        runFailure();
      })
      .finally(() => {
        endShoppingListRowDataRpc();
        if (textRpcSucceeded && store && typeof store.scheduleEndPendingRowOp === 'function') {
          store.scheduleEndPendingRowOp(rowId);
        } else if (store && typeof store.endPendingRowOp === 'function') {
          store.endPendingRowOp(rowId);
        }
      });
  };

  const flushShoppingListRemovedToSupabase = (rpc, options = {}) => {
    if (
      !rpc ||
      typeof window.dataService?.setShoppingListRowRemoved !== 'function'
    ) {
      return;
    }
    const rowId = String(rpc.rowId || '').trim();
    if (!rowId) return;
    const removed = !!rpc.removed;
    const onFailure =
      options && typeof options.onFailure === 'function'
        ? options.onFailure
        : null;
    const runFailure = () => {
      if (onFailure) onFailure();
    };
    const store = window.favoriteEatsStore;
    if (store && typeof store.beginPendingRowOp === 'function') {
      store.beginPendingRowOp(rowId, {
        kind: 'removed',
        removed,
      });
    }
    beginShoppingListRowDataRpc();
    let removedRpcSucceeded = false;
    void window.dataService
      .setShoppingListRowRemoved({
        rowId,
        removed,
      })
      .then((result) => {
        if (!result || result.ok !== false) {
          removedRpcSucceeded = true;
          return;
        }
        runFailure();
      })
      .catch((err) => {
        console.warn('setShoppingListRowRemoved failed:', err);
        runFailure();
      })
      .finally(() => {
        endShoppingListRowDataRpc();
        if (removedRpcSucceeded && store && typeof store.scheduleEndPendingRowOp === 'function') {
          store.scheduleEndPendingRowOp(rowId);
        } else if (store && typeof store.endPendingRowOp === 'function') {
          store.endPendingRowOp(rowId);
        }
      });
  };

  const flushShoppingListPlacementToSupabase = (rpc, options = {}) => {
    if (
      !rpc ||
      typeof window.dataService?.setShoppingListRowPlacement !== 'function'
    ) {
      return;
    }
    const rowId = String(rpc.rowId || '').trim();
    if (!rowId) return;
    const onFailure =
      options && typeof options.onFailure === 'function'
        ? options.onFailure
        : null;
    const runFailure = () => {
      if (onFailure) onFailure();
    };
    const store = window.favoriteEatsStore;
    if (store && typeof store.beginPendingRowOp === 'function') {
      store.beginPendingRowOp(rowId, {
        kind: 'placement',
        storeId: rpc.storeId ?? null,
        storeLabel: rpc.storeLabel != null ? String(rpc.storeLabel) : '',
        bucketLabel: rpc.bucketLabel != null ? String(rpc.bucketLabel) : '',
        aisleId: rpc.aisleId ?? null,
        aisleSortOrder: rpc.aisleSortOrder ?? null,
        order: rpc.order ?? null,
      });
    }
    beginShoppingListRowDataRpc();
    let placementRpcSucceeded = false;
    void window.dataService
      .setShoppingListRowPlacement({
        rowId,
        storeId: rpc.storeId ?? null,
        storeLabel: rpc.storeLabel != null ? String(rpc.storeLabel) : '',
        bucketLabel: rpc.bucketLabel != null ? String(rpc.bucketLabel) : '',
        aisleId: rpc.aisleId ?? null,
        aisleSortOrder: rpc.aisleSortOrder ?? null,
        order: rpc.order ?? null,
      })
      .then((result) => {
        if (!result || result.ok !== false) {
          placementRpcSucceeded = true;
          return;
        }
        runFailure();
      })
      .catch((err) => {
        console.warn('setShoppingListRowPlacement failed:', err);
        runFailure();
      })
      .finally(() => {
        endShoppingListRowDataRpc();
        if (
          placementRpcSucceeded &&
          store &&
          typeof store.scheduleEndPendingRowOp === 'function'
        ) {
          store.scheduleEndPendingRowOp(rowId);
        } else if (store && typeof store.endPendingRowOp === 'function') {
          store.endPendingRowOp(rowId);
        }
      });
  };

  const findShoppingListRowIndex = (rows, id, sourceKeyHint = '') => {
    const listRows = Array.isArray(rows) ? rows : [];
    const sk = String(sourceKeyHint || '').trim();
    const idStr = String(id || '');
    let idx = listRows.findIndex((row) => String(row?.id || '') === idStr);
    if (idx !== -1) return idx;
    if (!sk) return -1;
    return listRows.findIndex(
      (row) => String(row?.sourceKey || '').trim() === sk,
    );
  };

  const updateRow = (
    rowId,
    mutator,
    {
      message = '',
      undoMessage = '',
      listCheckedRpc = null,
      listTextRpc = null,
      listRemovedRpc = null,
      listPlacementRpc = null,
      sourceKeyHint = '',
    } = {},
  ) => {
    const currentRows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    const rowIndex = findShoppingListRowIndex(
      currentRows,
      rowId,
      sourceKeyHint,
    );
    if (rowIndex === -1) return;
    const previousRow = cloneForUndo(
      currentRows[rowIndex],
      () => currentRows[rowIndex],
    );
    const nextRowDraft = cloneForUndo(
      currentRows[rowIndex],
      () => currentRows[rowIndex],
    );
    if (!nextRowDraft || typeof mutator !== 'function') return;
    mutator(nextRowDraft);
    const nextText = String(nextRowDraft.text || '').trim();
    if (!nextText) return;
    nextRowDraft.text = nextText;
    if (String(nextRowDraft.sourceKey || '').trim()) {
      const sourceText = String(nextRowDraft.sourceText || '').trim();
      nextRowDraft.userEdited = !!sourceText && nextText !== sourceText;
    }
    const nextRows = currentRows.slice();
    nextRows[rowIndex] = nextRowDraft;
    const hasCheckedRpc =
      !!listCheckedRpc &&
      typeof listCheckedRpc === 'object' &&
      String(listCheckedRpc.rowId || '').trim();
    const hasTextRpc =
      !!listTextRpc &&
      typeof listTextRpc === 'object' &&
      String(listTextRpc.rowId || '').trim();
    const hasRemovedRpc =
      !!listRemovedRpc &&
      typeof listRemovedRpc === 'object' &&
      String(listRemovedRpc.rowId || '').trim();
    const hasPlacementRpc =
      !!listPlacementRpc &&
      typeof listPlacementRpc === 'object' &&
      String(listPlacementRpc.rowId || '').trim();

    const attachUndoToast = () => {
      if (!message && !undoMessage) return;
      uiToastUndo(message || undoMessage, () => {
        const restoreRows = Array.isArray(shoppingListDoc?.rows)
          ? shoppingListDoc.rows.slice()
          : [];
        const restoreIndex = findShoppingListRowIndex(
          restoreRows,
          rowId,
          previousRow?.sourceKey,
        );
        if (restoreIndex === -1) return;
        restoreRows[restoreIndex] = previousRow;
        if (hasCheckedRpc && listCheckedRpc) {
          shoppingListDoc = persistShoppingListDoc(
            {
              ...shoppingListDoc,
              rows: restoreRows,
            },
            { skipRemoteSave: true },
          );
          flushShoppingListCheckedToSupabase({
            rowId: listCheckedRpc.rowId,
            checked: !!previousRow.checked,
          });
        } else if (hasTextRpc && listTextRpc) {
          shoppingListDoc = persistShoppingListDoc(
            {
              ...shoppingListDoc,
              rows: restoreRows,
            },
            { skipRemoteSave: true },
          );
          flushShoppingListTextToSupabase({
            rowId: listTextRpc.rowId,
            text: String(previousRow?.text ?? ''),
          });
        } else if (hasRemovedRpc && listRemovedRpc) {
          shoppingListDoc = persistShoppingListDoc(
            {
              ...shoppingListDoc,
              rows: restoreRows,
            },
            { skipRemoteSave: true },
          );
          flushShoppingListRemovedToSupabase({
            rowId: listRemovedRpc.rowId,
            removed: isShoppingListRowListRemoved(previousRow),
          });
        } else if (hasPlacementRpc && listPlacementRpc) {
          shoppingListDoc = persistShoppingListDoc(
            {
              ...shoppingListDoc,
              rows: restoreRows,
            },
            { skipRemoteSave: true },
          );
          const undoPlacementRpc = buildShoppingListRowPlacementRpcPayload(
            previousRow,
            listPlacementRpc.rowId,
          );
          if (undoPlacementRpc) {
            flushShoppingListPlacementToSupabase(undoPlacementRpc);
          }
        } else {
          shoppingListDoc = persistShoppingListDoc({
            ...shoppingListDoc,
            rows: restoreRows,
          });
        }
        clearShoppingListRowEditSession();
        renderChecklistWithHomeLocationRefresh();
      });
    };

    if (hasCheckedRpc) {
      const checkedRpcPayload = {
        rowId: String(listCheckedRpc.rowId || '').trim(),
        checked: !!nextRowDraft.checked,
      };
      shoppingListDoc = persistShoppingListDoc(
        {
          ...shoppingListDoc,
          rows: nextRows,
        },
        { skipRemoteSave: true },
      );
      flushShoppingListCheckedToSupabase(checkedRpcPayload, {
        onFailure: () => {
          const failedRows = Array.isArray(shoppingListDoc?.rows)
            ? shoppingListDoc.rows.slice()
            : [];
          const failedIndex = findShoppingListRowIndex(
            failedRows,
            rowId,
            previousRow?.sourceKey,
          );
          if (failedIndex === -1) {
            void runFavoriteEatsRemoteListRefresh();
            return;
          }
          failedRows[failedIndex] = previousRow;
          shoppingListDoc = persistShoppingListDoc(
            {
              ...shoppingListDoc,
              rows: failedRows,
            },
            { skipRemoteSave: true },
          );
          renderChecklistWithHomeLocationRefresh();
          uiToast('Could not save check state.');
          void runFavoriteEatsRemoteListRefresh();
        },
      });
      renderChecklistWithHomeLocationRefresh();
      attachUndoToast();
      return;
    }

    if (hasTextRpc) {
      shoppingListDoc = persistShoppingListDoc(
        {
          ...shoppingListDoc,
          rows: nextRows,
        },
        { skipRemoteSave: true },
      );
      flushShoppingListTextToSupabase(listTextRpc, {
        onFailure: () => {
          const failedRows = Array.isArray(shoppingListDoc?.rows)
            ? shoppingListDoc.rows.slice()
            : [];
          const failedIndex = findShoppingListRowIndex(
            failedRows,
            rowId,
            previousRow?.sourceKey,
          );
          if (failedIndex === -1) {
            void runFavoriteEatsRemoteListRefresh();
            return;
          }
          failedRows[failedIndex] = previousRow;
          shoppingListDoc = persistShoppingListDoc(
            {
              ...shoppingListDoc,
              rows: failedRows,
            },
            { skipRemoteSave: true },
          );
          renderChecklistWithHomeLocationRefresh();
          uiToast('Could not save row text.');
          void runFavoriteEatsRemoteListRefresh();
        },
      });
      renderChecklistWithHomeLocationRefresh();
      attachUndoToast();
      return;
    }

    if (hasRemovedRpc) {
      const removedRpcPayload = {
        rowId: String(listRemovedRpc.rowId || '').trim(),
        removed: isShoppingListRowListRemoved(nextRowDraft),
      };
      shoppingListDoc = persistShoppingListDoc(
        {
          ...shoppingListDoc,
          rows: nextRows,
        },
        { skipRemoteSave: true },
      );
      flushShoppingListRemovedToSupabase(removedRpcPayload, {
        onFailure: () => {
          const failedRows = Array.isArray(shoppingListDoc?.rows)
            ? shoppingListDoc.rows.slice()
            : [];
          const failedIndex = findShoppingListRowIndex(
            failedRows,
            rowId,
            previousRow?.sourceKey,
          );
          if (failedIndex === -1) {
            void runFavoriteEatsRemoteListRefresh();
            return;
          }
          failedRows[failedIndex] = previousRow;
          shoppingListDoc = persistShoppingListDoc(
            {
              ...shoppingListDoc,
              rows: failedRows,
            },
            { skipRemoteSave: true },
          );
          renderChecklistWithHomeLocationRefresh();
          uiToast('Could not save remove state.');
          void runFavoriteEatsRemoteListRefresh();
        },
      });
      renderChecklistWithHomeLocationRefresh();
      attachUndoToast();
      return;
    }

    if (hasPlacementRpc) {
      const placementRpcPayload = buildShoppingListRowPlacementRpcPayload(
        nextRowDraft,
        listPlacementRpc.rowId,
      );
      if (!placementRpcPayload) return;
      shoppingListDoc = persistShoppingListDoc(
        {
          ...shoppingListDoc,
          rows: nextRows,
        },
        { skipRemoteSave: true },
      );
      flushShoppingListPlacementToSupabase(placementRpcPayload, {
        onFailure: () => {
          const failedRows = Array.isArray(shoppingListDoc?.rows)
            ? shoppingListDoc.rows.slice()
            : [];
          const failedIndex = findShoppingListRowIndex(
            failedRows,
            rowId,
            previousRow?.sourceKey,
          );
          if (failedIndex === -1) {
            void runFavoriteEatsRemoteListRefresh();
            return;
          }
          failedRows[failedIndex] = previousRow;
          shoppingListDoc = persistShoppingListDoc(
            {
              ...shoppingListDoc,
              rows: failedRows,
            },
            { skipRemoteSave: true },
          );
          renderChecklistWithHomeLocationRefresh();
          uiToast('Could not save row placement.');
          void runFavoriteEatsRemoteListRefresh();
        },
      });
      renderChecklistWithHomeLocationRefresh();
      attachUndoToast();
      return;
    }

    if (
      shouldUseRemoteShoppingState() &&
      window.dataService &&
      typeof window.dataService.loadShoppingState === 'function'
    ) {
      shoppingListDoc = persistShoppingListDoc(
        {
          ...shoppingListDoc,
          rows: nextRows,
        },
        { skipRemoteSave: true },
      );
      renderChecklistWithHomeLocationRefresh();
      void (async () => {
        try {
          await hydrateShoppingStateFromDataService();
          let planRowsForMerge = generatedPlanRows;
          try {
            planRowsForMerge = await getShoppingPlanSelectionRowsViaDataService(
              {
                db,
              },
            );
            generatedPlanRows = planRowsForMerge;
            selectedRecipeSummaryRows =
              await getShoppingListSelectedRecipeSummaryRowsViaDataService({
                db,
              });
          } catch (planErr) {
            console.warn(
              'Shopping list row save: plan refetch after hydrate failed:',
              planErr,
            );
          }
          const sync = mergeShoppingListDocWithGenerated(
            getAuthoritativeShoppingListDoc(),
            buildShoppingListDocFromPlanRows(planRowsForMerge),
          );
          const baseDoc = normalizeShoppingListDoc(sync.doc);
          const rows = baseDoc.rows.slice();
          const matchIdx = findShoppingListRowIndex(
            rows,
            rowId,
            nextRowDraft.sourceKey,
          );
          if (matchIdx === -1) {
            shoppingListDoc = persistShoppingListDoc({
              ...shoppingListDoc,
              rows: nextRows,
            });
          } else {
            const applyDraft = cloneForUndo(
              rows[matchIdx],
              () => rows[matchIdx],
            );
            if (!applyDraft || typeof mutator !== 'function') {
              shoppingListDoc = persistShoppingListDoc({
                ...shoppingListDoc,
                rows: nextRows,
              });
            } else {
              mutator(applyDraft);
              const mergedText = String(applyDraft.text || '').trim();
              if (!mergedText) {
                renderChecklistWithHomeLocationRefresh();
                return;
              }
              applyDraft.text = mergedText;
              if (String(applyDraft.sourceKey || '').trim()) {
                const st = String(applyDraft.sourceText || '').trim();
                applyDraft.userEdited = !!st && mergedText !== st;
              }
              const mergedRows = rows.slice();
              mergedRows[matchIdx] = applyDraft;
              shoppingListDoc = persistShoppingListDoc({
                ...baseDoc,
                rows: mergedRows,
              });
            }
          }
        } catch (err) {
          console.warn('Shopping list row save (server-first) failed:', err);
          shoppingListDoc = persistShoppingListDoc({
            ...shoppingListDoc,
            rows: nextRows,
          });
        }
        renderChecklistWithHomeLocationRefresh();
        attachUndoToast();
      })();
      return;
    }

    shoppingListDoc = persistShoppingListDoc({
      ...shoppingListDoc,
      rows: nextRows,
    });
    renderChecklistWithHomeLocationRefresh();
    attachUndoToast();
  };

  function getShoppingListRowBeingEdited() {
    if (!editingRowId) return null;
    const rows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    return (
      rows.find((r) => String(r?.id || '') === String(editingRowId)) || null
    );
  }

  function getPlanRowForShoppingListRow(row) {
    const sourceKey = String(row?.sourceKey || '').trim();
    if (!sourceKey) return null;
    const planRowsByKey = new Map(
      generatedPlanRows
        .filter((planRow) => String(planRow?.key || '').trim())
        .map((planRow) => [String(planRow.key || '').trim(), planRow]),
    );
    return planRowsByKey.get(sourceKey) || null;
  }

  function findShoppingListDocRowById(rowId) {
    const rows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    const idStr = String(rowId || '');
    return rows.find((r) => String(r?.id || '') === idStr) || null;
  }

  function buildJoinedShoppingListAmountCommitText(row, planRow, detailRaw) {
    const resolvedPlanLabel = getShoppingListPlanRowResolvedLabel(planRow);
    let nextDetail = String(detailRaw ?? '').trim();
    if (!nextDetail) {
      const fromSource = splitShoppingListRowTextToLabelAndDetail(
        String(row?.sourceText || '').trim(),
      ).detail;
      const planRowDetail = String(planRow?.detailText || '').trim();
      const canonical = String(planRowDetail || fromSource || '').trim();
      if (canonical) nextDetail = canonical;
    }
    return joinShoppingListLabelAndDetail(resolvedPlanLabel, nextDetail);
  }

  function getShoppingListEditInputs() {
    if (!(list instanceof HTMLElement)) {
      return { amount: null, line: null };
    }
    return {
      amount: list.querySelector('input.shopping-list-doc-input--amount'),
      line: list.querySelector(
        'input.shopping-list-doc-input:not(.shopping-list-doc-input--amount)',
      ),
    };
  }

  function buildActiveShoppingListEditCommitPayload() {
    if (!editingRowId || !editingRowMode) return null;
    const row = getShoppingListRowBeingEdited();
    if (!row) return null;
    const planRow = getPlanRowForShoppingListRow(row);
    const rowDraft = getShoppingListRowDraftForId(row?.id);
    const rowDisplayTextForLayout = rowDraft
      ? String(rowDraft.nextText || '').trim()
      : String(row?.text || '').trim();
    const rowTextParsed = splitShoppingListRowTextToLabelAndDetail(
      rowDisplayTextForLayout,
    );
    const planRowDetail = String(planRow?.detailText || '').trim();
    const useSplitPlanLayout =
      !!planRow &&
      (planRowDetail || rowTextParsed.detail) &&
      !(row?.userEdited && !rowTextParsed.detail && planRowDetail);

    const durableRowIdForRpc =
      String(row?.sourceKey || '').trim() || String(row?.id || '').trim();
    const useShoppingListTextRpc = !!(
      durableRowIdForRpc &&
      shouldUseRemoteShoppingState() &&
      typeof window.dataService?.setShoppingListRowText === 'function'
    );

    const inputs = getShoppingListEditInputs();

    if (editingRowMode === 'amount') {
      if (!useSplitPlanLayout) return null;
      const input = inputs.amount;
      if (!(input instanceof HTMLInputElement)) return null;
      const nextText = buildJoinedShoppingListAmountCommitText(
        row,
        planRow,
        input.value,
      );
      return {
        row,
        nextText,
        durableRowIdForRpc,
        useShoppingListTextRpc,
      };
    }

    if (editingRowMode === 'line') {
      const input = inputs.line;
      if (!(input instanceof HTMLInputElement)) return null;
      const nextText = String(input.value || '').trim();
      return {
        row,
        nextText,
        durableRowIdForRpc,
        useShoppingListTextRpc,
      };
    }

    return null;
  }

  function collectShoppingListEditCommitPayloads() {
    const payloads = [];
    const seenRowIds = new Set();

    const active = buildActiveShoppingListEditCommitPayload();
    if (active && active.row) {
      payloads.push(active);
      seenRowIds.add(String(active.row.id));
    }

    for (const [draftKey, draft] of shoppingListRowDraftByRowId.entries()) {
      if (seenRowIds.has(draftKey)) continue;
      const row = findShoppingListDocRowById(draftKey);
      if (!row) continue;
      const nextText = String(draft?.nextText || '').trim();
      if (!nextText) continue;
      const durableRowIdForRpc =
        String(row?.sourceKey || '').trim() || String(row?.id || '').trim();
      const useShoppingListTextRpc = !!(
        durableRowIdForRpc &&
        shouldUseRemoteShoppingState() &&
        typeof window.dataService?.setShoppingListRowText === 'function'
      );
      payloads.push({
        row,
        nextText,
        durableRowIdForRpc,
        useShoppingListTextRpc,
      });
    }

    return payloads;
  }

  function canCommitShoppingListEdit() {
    return collectShoppingListEditCommitPayloads().some((payload) => {
      const trimmed = String(payload.nextText || '').trim();
      return trimmed && trimmed !== String(payload.row?.text || '').trim();
    });
  }

  let shoppingListDirtyRowEditResolutionPromise = null;
  function shoppingListHasDirtyRowEdits() {
    return canCommitShoppingListEdit();
  }

  async function resolveShoppingListDirtyRowEdits(options = {}) {
    if (!shoppingListHasDirtyRowEdits()) return 'clean';
    if (shoppingListDirtyRowEditResolutionPromise) {
      return shoppingListDirtyRowEditResolutionPromise;
    }
    const promptMessage =
      options && typeof options.message === 'string' && options.message.trim()
        ? options.message.trim()
        : 'Save changes before continuing?';

    shoppingListDirtyRowEditResolutionPromise = (async () => {
      if (window.ui && typeof window.ui.dialogThreeChoice === 'function') {
        const choice = await window.ui.dialogThreeChoice({
          title: 'Unsaved shopping list changes',
          message: promptMessage,
          fixText: 'Cancel',
          discardText: 'Discard',
          createText: 'Save',
          dismissChoice: 'fix',
        });
        if (choice === 'create') {
          commitShoppingListRowEdit();
          return 'saved';
        }
        if (choice === 'discard') {
          cancelShoppingListRowEdit();
          return 'discarded';
        }
        return 'cancelled';
      }

      const discard = await uiConfirm({
        title: 'Unsaved shopping list changes',
        message: promptMessage,
        confirmText: 'Discard',
        cancelText: 'Cancel',
        danger: true,
      });
      if (!discard) return 'cancelled';
      cancelShoppingListRowEdit();
      return 'discarded';
    })();

    try {
      return await shoppingListDirtyRowEditResolutionPromise;
    } finally {
      shoppingListDirtyRowEditResolutionPromise = null;
    }
  }

  async function attemptShoppingListRowEditCancelFromUser() {
    const outcome = await resolveShoppingListDirtyRowEdits();
    if (outcome === 'cancelled') return false;
    if (outcome === 'clean') {
      cancelShoppingListRowEdit();
    }
    return true;
  }

  async function guardShoppingListNavigation(navigate) {
    const outcome = await resolveShoppingListDirtyRowEdits();
    if (outcome === 'cancelled') return false;
    if (typeof navigate === 'function') navigate();
    return true;
  }

  const shoppingListRowEditNavigateGuard = async () => {
    const outcome = await resolveShoppingListDirtyRowEdits();
    return outcome !== 'cancelled';
  };
  window.favoriteEatsShoppingListRowEditNavigateGuard =
    shoppingListRowEditNavigateGuard;

  const handleShoppingListBeforeUnload = (event) => {
    if (!shoppingListHasDirtyRowEdits()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', handleShoppingListBeforeUnload);

  function syncShoppingListEditActionButtonsState() {
    const hasOpenRowSession =
      !!editingRowId || shoppingListRowDraftStorageHasAny();
    const saveEnabled = canCommitShoppingListEdit();
    const syncPair = (cancelBtn, saveBtn) => {
      if (cancelBtn instanceof HTMLButtonElement) {
        cancelBtn.disabled = !hasOpenRowSession;
        cancelBtn.setAttribute(
          'aria-disabled',
          !hasOpenRowSession ? 'true' : 'false',
        );
      }
      if (saveBtn instanceof HTMLButtonElement) {
        saveBtn.disabled = !saveEnabled;
        saveBtn.setAttribute('aria-disabled', !saveEnabled ? 'true' : 'false');
      }
    };
    syncPair(webCancelEditBtn, webSaveEditBtn);
    syncPair(controlsCancelEditBtn, controlsSaveEditBtn);
  }

  function cancelShoppingListRowEdit() {
    clearShoppingListRowEditSession();
    renderChecklist();
  }

  function commitShoppingListRowEdit() {
    const payloads = collectShoppingListEditCommitPayloads();
    const toApply = payloads.filter((payload) => {
      const trimmed = String(payload.nextText || '').trim();
      return trimmed && trimmed !== String(payload.row?.text || '').trim();
    });
    if (!toApply.length) {
      clearShoppingListRowEditSession();
      renderChecklist();
      return;
    }
    const snapshots = toApply.map((p) => ({
      rowId: p.row.id,
      nextText: String(p.nextText).trim(),
      useShoppingListTextRpc: p.useShoppingListTextRpc,
      durableRowIdForRpc: p.durableRowIdForRpc,
    }));
    clearShoppingListRowEditSession();
    const total = snapshots.length;
    snapshots.forEach((snap, idx) => {
      const isLast = idx === total - 1;
      updateRow(
        snap.rowId,
        (draft) => {
          draft.text = snap.nextText;
        },
        {
          message: isLast
            ? total > 1
              ? `${total} rows updated.`
              : 'Row updated.'
            : '',
          listTextRpc: snap.useShoppingListTextRpc
            ? {
                rowId: snap.durableRowIdForRpc,
                text: snap.nextText,
              }
            : null,
        },
      );
    });
  }

  const buildShoppingListConflictDialog = (conflicts) => {
    const list = Array.isArray(conflicts) ? conflicts.filter(Boolean) : [];
    const count = list.length;
    const singular = count === 1;
    const title = `Review changes (${count})`;
    const body = singular
      ? 'An item you edited has been updated.'
      : 'Some items you edited have been updated.';
    const previewLimit = 3;
    const previewLines = [];
    list.slice(0, previewLimit).forEach((conflict, index) => {
      const currentText =
        String(conflict?.currentText || '').trim() || '(empty)';
      const nextGeneratedText = String(
        conflict?.nextGeneratedText || '',
      ).trim();
      const nextGeneratedDisplayText = String(
        conflict?.nextGeneratedDisplayText || nextGeneratedText,
      ).trim();
      const updateText =
        nextGeneratedDisplayText ||
        (String(conflict?.kind || '').trim() === 'remove'
          ? '(removed from shopping plan)'
          : '(empty)');
      previewLines.push(`Edit:    ${currentText}`);
      previewLines.push(`Update:  ${updateText}`);
      if (index < Math.min(previewLimit, count) - 1) previewLines.push('');
    });
    if (count > previewLimit) {
      previewLines.push('');
      previewLines.push(`+ ${count - previewLimit} more updates`);
    }
    return {
      title,
      message: [body, '', ...previewLines].join('\n').trim(),
      confirmText: singular ? 'Use update' : 'Use updates',
      cancelText: 'Keep my edits',
    };
  };

  const resolvePendingSourceConflicts = async () => {
    if (resolvingSourceConflicts) return;
    if (!pendingSourceConflicts.length) return;
    const dirtyOutcome = await resolveShoppingListDirtyRowEdits();
    if (dirtyOutcome === 'cancelled') return;
    resolvingSourceConflicts = true;
    try {
      if (shouldUseRemoteShoppingState() && window.dataService) {
        try {
          await hydrateShoppingStateFromDataService();
          const planRowsFresh =
            await getShoppingPlanSelectionRowsViaDataService({
              db,
            });
          generatedPlanRows = planRowsFresh;
          selectedRecipeSummaryRows =
            await getShoppingListSelectedRecipeSummaryRowsViaDataService({
              db,
            });
          const sync = mergeShoppingListDocWithGenerated(
            getAuthoritativeShoppingListDoc(),
            buildShoppingListDocFromPlanRows(planRowsFresh),
          );
          shoppingListDoc = persistShoppingListDoc(sync.doc, {
            skipRemoteSave: true,
          });
          pendingSourceConflicts = Array.isArray(sync.conflicts)
            ? sync.conflicts.slice()
            : [];
        } catch (err) {
          console.warn(
            'resolvePendingSourceConflicts: server refresh failed:',
            err,
          );
        }
      }
      if (!pendingSourceConflicts.length) {
        renderChecklistWithHomeLocationRefresh();
        return;
      }
      const conflictsToResolve = pendingSourceConflicts.filter((conflict) => {
        if (!conflict || typeof conflict !== 'object') return false;
        return Array.isArray(shoppingListDoc?.rows)
          ? shoppingListDoc.rows.some(
              (row) => String(row?.id || '') === String(conflict?.rowId || ''),
            )
          : false;
      });
      pendingSourceConflicts = [];
      if (!conflictsToResolve.length) {
        renderChecklistWithHomeLocationRefresh();
        return;
      }
      const dialog = buildShoppingListConflictDialog(conflictsToResolve);
      const useUpdate = await uiConfirm(dialog);
      const remote = shouldUseRemoteShoppingState();
      let nextDoc = shoppingListDoc;
      conflictsToResolve.forEach((conflict) => {
        nextDoc = resolveShoppingListDocConflict(
          nextDoc,
          conflict,
          useUpdate ? 'replace' : 'keep',
        );
      });
      shoppingListDoc = persistShoppingListDoc(
        nextDoc,
        remote ? { skipRemoteSave: true } : {},
      );
      if (remote) {
        await syncShoppingListSourcedDocRemote(shoppingListDoc);
      }
      clearShoppingListRowEditSession();
      renderChecklistWithHomeLocationRefresh();
    } finally {
      resolvingSourceConflicts = false;
    }
  };

  const renderShoppingListLocationStylePanelFooter = (panel) => {
    const host = document.createElement('div');
    host.className = 'app-filter-chip-dropdown-panel-footer';

    const labelText = 'group item variants';
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
    input.checked = !!shoppingListGroupItemVariants;
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('change', () => {
      shoppingListGroupItemVariants = !!input.checked;
      persistShoppingListGroupItemVariants(shoppingListGroupItemVariants);
      reopenShoppingListCompoundDropdownId = 'shopping-list-location-style';
      rerenderShoppingListFilterChips();
      renderChecklist();
    });
    const switchKnob = document.createElement('span');
    switchKnob.className = 'bottom-nav-editor-switch-knob';
    switchTrack.appendChild(input);
    switchTrack.appendChild(switchKnob);
    editorLabel.appendChild(editorTitle);
    editorLabel.appendChild(switchTrack);
    host.appendChild(editorLabel);
    panel.appendChild(host);
  };

  const rerenderShoppingListFilterChips = () => {
    const chipMountEl = shoppingListFilterChipRail?.trackEl;
    if (!(chipMountEl instanceof HTMLElement)) return;
    if (typeof window.renderFilterChipList !== 'function') return;
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips: [],
      compoundChips: [
        {
          id: 'shopping-list-location-style',
          label: 'item grouping',
          selectionMode: 'single',
          renderPanelFooter: renderShoppingListLocationStylePanelFooter,
          options: [
            { id: 'stores', label: 'by store aisle' },
            { id: 'home', label: 'by home location' },
          ],
          selectedOptionIds: new Set([
            shoppingListViewMode === 'home' ? 'home' : 'stores',
          ]),
          onToggleOption: (optionId) => {
            const nextMode = optionId === 'home' ? 'home' : 'stores';
            if (nextMode === shoppingListViewMode) return;
            shoppingListViewMode = nextMode;
            persistShoppingListViewMode(nextMode);
            resetCollapsedShoppingListSections();
            reopenShoppingListCompoundDropdownId = 'shopping-list-location-style';
            rerenderShoppingListFilterChips();
            renderChecklist();
          },
        },
        {
          id: 'shopping-list-completed-placement',
          label: 'checked item style',
          selectionMode: 'single',
          options: [
            { id: 'in-place', label: 'inline' },
            { id: 'grouped', label: 'grouped at bottom' },
          ],
          selectedOptionIds: new Set([
            shoppingListKeepCompletedInPlace ? 'in-place' : 'grouped',
          ]),
          onToggleOption: (optionId) => {
            const next = optionId === 'in-place';
            if (next === shoppingListKeepCompletedInPlace) return;
            shoppingListKeepCompletedInPlace = next;
            persistShoppingListKeepCompletedInPlace(next);
            resetCollapsedShoppingListSections();
            reopenShoppingListCompoundDropdownId =
              'shopping-list-completed-placement';
            rerenderShoppingListFilterChips();
            renderChecklist();
          },
        },
        {
          id: 'shopping-list-checkbox-action',
          label: 'checkbox action',
          selectionMode: 'single',
          options: [
            { id: 'complete', label: 'complete' },
            { id: 'remove', label: 'remove' },
          ],
          selectedOptionIds: new Set([
            shoppingListCheckboxAction === 'remove' ? 'remove' : 'complete',
          ]),
          onToggleOption: (optionId) => {
            const next =
              String(optionId || '')
                .trim()
                .toLowerCase() === 'remove'
                ? 'remove'
                : 'complete';
            if (next === shoppingListCheckboxAction) return;
            shoppingListCheckboxAction = next;
            persistShoppingListCheckboxActionFromSession(next);
            reopenShoppingListCompoundDropdownId = 'shopping-list-checkbox-action';
            rerenderShoppingListFilterChips();
            renderChecklist();
          },
        },
      ],
      reopenCompoundDropdown: !!reopenShoppingListCompoundDropdownId,
      reopenCompoundDropdownId: reopenShoppingListCompoundDropdownId,
      chipClassName: 'app-filter-chip',
    });
    reopenShoppingListCompoundDropdownId = '';
  };

  const mountShoppingListFilterChips = () => {
    if (!(searchInput instanceof HTMLInputElement)) return;
    if (typeof window.mountTopFilterChipRail !== 'function') return;
    shoppingListFilterChipRail = window.mountTopFilterChipRail({
      anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
      dockId: 'shoppingListFilterChipDock',
    });
    rerenderShoppingListFilterChips();
    shoppingListFilterChipRail?.sync?.();
  };

  let shoppingListHomeLocationCache = { signature: '', map: null };

  const getShoppingListSourceKeys = () => {
    const normalizedRows = normalizeShoppingListDoc(shoppingListDoc).rows;
    return Array.from(
      new Set(
        normalizedRows
          .map((row) =>
            String(row?.sourceKey || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );
  };

  const getShoppingListHomeLocationSignature = () =>
    JSON.stringify(getShoppingListSourceKeys());

  const isShoppingListHomeLocationCacheFresh = () =>
    shoppingListHomeLocationCache.map instanceof Map &&
    shoppingListHomeLocationCache.signature ===
      getShoppingListHomeLocationSignature();

  const refreshShoppingListHomeLocationCache = async () => {
    const sourceKeys = getShoppingListSourceKeys();
    const signature = getShoppingListHomeLocationSignature();
    if (
      shoppingListHomeLocationCache.map instanceof Map &&
      shoppingListHomeLocationCache.signature === signature
    ) {
      return shoppingListHomeLocationCache.map;
    }
    if (
      !window.dataService ||
      typeof window.dataService.listShoppingListHomeLocations !== 'function'
    ) {
      shoppingListHomeLocationCache = { signature: '', map: null };
      return null;
    }
    try {
      const rows =
        await window.dataService.listShoppingListHomeLocations(sourceKeys);
      const nextMap = new Map();
      sourceKeys.forEach((sourceKey) => {
        nextMap.set(
          sourceKey,
          normalizeShoppingHomeLocationId(rows?.[sourceKey]),
        );
      });
      shoppingListHomeLocationCache = { signature, map: nextMap };
      return nextMap;
    } catch (err) {
      console.error('dataService.listShoppingListHomeLocations failed:', err);
      shoppingListHomeLocationCache = { signature: '', map: null };
      return null;
    }
  };

  const renderChecklistWithHomeLocationRefresh = () => {
    if (isShoppingListHomeLocationCacheFresh()) {
      renderChecklist();
      return;
    }
    void refreshShoppingListHomeLocationCache().then(() => {
      renderChecklist();
    });
  };

  const getShoppingListCheckboxUiState = (
    row,
    { checked = false, isPendingChecked = false } = {},
  ) => {
    if (shoppingListCheckboxAction === 'remove') {
      const rowIsListRemoved =
        isShoppingListRowListRemoved(row) || !!row?.listRemoved;
      return {
        icon: rowIsListRemoved ? 'restore_from_trash' : 'delete',
        ariaLabel: rowIsListRemoved ? 'Restore item' : 'Remove item',
        ariaPressed: false,
        deleteAction: !rowIsListRemoved,
      };
    }
    const isChecked = !!checked || !!isPendingChecked;
    return {
      icon: isChecked ? 'check_box' : 'check_box_outline_blank',
      ariaLabel: isChecked ? 'Include item' : 'Exclude item',
      ariaPressed: isChecked,
      deleteAction: false,
    };
  };

  const applyShoppingListCheckboxUiToButton = (checkbox, checkboxUi) => {
    if (!(checkbox instanceof HTMLButtonElement)) return;
    checkbox.classList.toggle(
      'shopping-list-doc-checkbox--delete-action',
      !!checkboxUi.deleteAction,
    );
    checkbox.setAttribute(
      'aria-pressed',
      checkboxUi.ariaPressed ? 'true' : 'false',
    );
    checkbox.setAttribute('aria-label', checkboxUi.ariaLabel);
    const icon = checkbox.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.textContent = checkboxUi.icon;
    }
  };

  const syncShoppingListCheckboxDom = (rowId, sourceKeyHint, checked) => {
    const rows = Array.from(
      list.querySelectorAll('li[data-shopping-list-row-id]'),
    );
    const sourceKey = String(sourceKeyHint || '').trim();
    const id = String(rowId || '').trim();
    const li = rows.find((candidate) => {
      if (sourceKey) {
        return (
          String(candidate.dataset.shoppingListSourceKey || '').trim() ===
          sourceKey
        );
      }
      return String(candidate.dataset.shoppingListRowId || '').trim() === id;
    });
    if (!li) return false;
    li.classList.toggle('shopping-list-doc-item--checked', !!checked);
    const checkbox = li.querySelector('.shopping-list-doc-checkbox');
    if (checkbox instanceof HTMLButtonElement) {
      const docRows = Array.isArray(shoppingListDoc?.rows)
        ? shoppingListDoc.rows
        : [];
      const docIndex = findShoppingListRowIndex(docRows, id, sourceKey);
      const row = docIndex >= 0 ? docRows[docIndex] : null;
      const checkboxUi = getShoppingListCheckboxUiState(row, { checked });
      applyShoppingListCheckboxUiToButton(checkbox, checkboxUi);
    }
    // Targeted DOM updates must keep the contribution-group sibling in sync
    // with the parent's checked state. Otherwise a cross-device echo that
    // toggles `checked` leaves the group's `--parent-checked` class stale
    // (group rendered earlier with the previous checked state). Symptom: the
    // parent checkbox is unchecked while the contribution rows still show the
    // gray "parent is checked" fade. Refresh rectifies because the full
    // render re-derives the class from the latest row.checked. Find the
    // group by data-attribute (set at render time) and fall back to the
    // immediate next sibling for backwards-compatible markup.
    const parentDomKey = sourceKey || id;
    let group = null;
    if (parentDomKey) {
      group = list.querySelector(
        `li.shopping-list-doc-contribution-group[data-shopping-list-contribution-parent-key="${
          (typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(parentDomKey)
            : parentDomKey.replace(/"/g, '\\"'))
        }"]`,
      );
    }
    if (!(group instanceof HTMLElement)) {
      const sibling = li.nextElementSibling;
      if (
        sibling instanceof HTMLElement &&
        sibling.classList.contains('shopping-list-doc-contribution-group')
      ) {
        group = sibling;
      }
    }
    if (group instanceof HTMLElement) {
      group.classList.toggle(
        'shopping-list-doc-contribution-group--parent-checked',
        !!checked,
      );
    }
    return true;
  };

  const syncShoppingListCheckboxVisuals = (rowId, sourceKeyHint, checked) => {
    if (!shoppingListKeepCompletedInPlace) {
      // Grouped checked-item style changes row membership/order, so the
      // existing li cannot be patched in place.
      renderChecklistWithHomeLocationRefresh();
      return true;
    }
    return syncShoppingListCheckboxDom(rowId, sourceKeyHint, checked);
  };

  // Charter §F / §G: when a wholesale doc replacement is unavoidable
  // (post-bulk-RPC, plan refetch, etc.), overlay any row that has pending or
  // in-flight checkbox intent with the queue's local value. Protection is
  // per-key, not a global "row RPC is busy" refresh gate.
  const mergePendingCheckboxOpsIntoDoc = (doc, sourceLabel = 'unspecified') => {
    if (!doc) return doc;
    if (
      !shoppingListCheckboxInputQueue ||
      typeof shoppingListCheckboxInputQueue.getPendingOp !== 'function' ||
      typeof shoppingListCheckboxInputQueue.getKeyState !== 'function'
    ) {
      logShoppingListCheckboxDeviation('protected wholesale merge unavailable', {
        hasQueue: !!shoppingListCheckboxInputQueue,
        source: sourceLabel,
      });
      return doc;
    }
    const rows = Array.isArray(doc.rows) ? doc.rows : [];
    if (!rows.length) return doc;
    let changed = false;
    const nextRows = rows.map((row) => {
      const sourceKey = String(row?.sourceKey || '').trim();
      const rowId = String(row?.id || '').trim();
      const entityKey = sourceKey || rowId;
      if (!entityKey) return row;
      const pending = shoppingListCheckboxInputQueue.getPendingOp({
        surface: 'list',
        entityKey,
        field: 'checked',
      });
      const queueState = shoppingListCheckboxInputQueue.getKeyState({
        surface: 'list',
        entityKey,
        field: 'checked',
      });
      const hasLocalIntent = !!(pending || queueState?.inFlight);
      if (!hasLocalIntent || !queueState?.hasLocalValue) return row;
      if (!!row?.checked === !!queueState.lastLocalValue) return row;
      changed = true;
      return {
        ...row,
        checked: !!queueState.lastLocalValue,
      };
    });
    if (changed) {
      logShoppingListCheckboxSync('protected wholesale merge preserved local rows', {
        source: sourceLabel,
        rowCount: nextRows.length,
      });
    } else {
      logShoppingListCheckboxSync('protected wholesale merge checked rows', {
        source: sourceLabel,
        rowCount: nextRows.length,
      });
    }
    return changed ? { ...doc, rows: nextRows } : doc;
  };

  const applyShoppingListCheckboxLocal = (op) => {
    if (!op || op.surface !== 'list' || op.field !== 'checked') return;
    const rowId = String(op.rowId || op.entityKey || '').trim();
    const sourceKeyHint = String(op.sourceKey || '').trim();
    const checked = !!op.value;
    const currentRows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    const rowIndex = findShoppingListRowIndex(
      currentRows,
      rowId,
      sourceKeyHint,
    );
    if (rowIndex === -1) {
      logShoppingListCheckboxDeviation('local apply row missing', {
        rowId,
        sourceKey: sourceKeyHint,
        entityKey: op.entityKey,
      });
      return;
    }
    const nextRows = currentRows.slice();
    const nextRow = cloneForUndo(
      currentRows[rowIndex],
      () => currentRows[rowIndex],
    );
    if (!nextRow) return;
    nextRow.checked = checked;
    nextRows[rowIndex] = nextRow;
    shoppingListDoc = persistShoppingListDoc(
      {
        ...shoppingListDoc,
        rows: nextRows,
      },
      shouldUseRemoteShoppingState() ? { skipRemoteSave: true } : {},
    );
    syncShoppingListCheckboxVisuals(rowId, sourceKeyHint, checked);
    syncShoppingListResetButtonState();
    syncShoppingListUncheckAllButtonState();
    syncShoppingListCopyButtonState();
    syncShoppingListEditActionButtonsState();
    logShoppingListCheckboxSync('local applied', {
      rowId,
      sourceKey: sourceKeyHint,
      entityKey: op.entityKey,
      checked,
    });
  };

  const applyShoppingListCheckboxRemotePatch = (payload) => {
    if (!payload || typeof payload !== 'object') return false;
    if (String(payload.schema || '') !== 'list') return false;
    const table = String(payload.table || '');
    if (table !== 'row_overrides' && table !== 'manual_rows') return false;
    if (String(payload.eventType || '').toUpperCase() === 'DELETE') {
      return false;
    }
    const rowData = payload.new && typeof payload.new === 'object'
      ? payload.new
      : null;
    if (!rowData || !Object.prototype.hasOwnProperty.call(rowData, 'checked')) {
      return false;
    }
    const sourceKey = String(rowData.source_key || '').trim();
    const rowId = String(rowData.id || rowData.row_id || '').trim();
    const patchKey = sourceKey || rowId;
    if (!patchKey) return false;
    const checked = !!rowData.checked;
    const updatedAt = rowData.updated_at || null;
    if (!updatedAt) {
      logShoppingListCheckboxDeviation('child patch missing updated_at', {
        table,
        patchKey,
        checked,
      });
    }
    // Charter §F: per-key skip rule. Drop this echo if there's a pending local
    // op, if updated_at is older than what we already accepted, or if the value
    // already matches the rendered local value (no-op patch).
    const opLike = { surface: 'list', entityKey: patchKey, field: 'checked' };
    const queueState =
      shoppingListCheckboxInputQueue &&
      typeof shoppingListCheckboxInputQueue.getKeyState === 'function'
        ? shoppingListCheckboxInputQueue.getKeyState(opLike)
        : null;
    if (
      shoppingListCheckboxInputQueue &&
      typeof shoppingListCheckboxInputQueue.shouldSkipEcho === 'function' &&
      shoppingListCheckboxInputQueue.shouldSkipEcho(opLike, {
        updated_at: updatedAt,
        value: checked,
      })
    ) {
      logShoppingListCheckboxSync('child patch skipped', {
        table,
        patchKey,
        checked,
        updated_at: updatedAt,
        pending: !!queueState?.pending,
        inFlight: !!queueState?.inFlight,
        lastAppliedServerUpdatedAt:
          queueState?.lastAppliedServerUpdatedAt || null,
        lastLocalValue: queueState?.hasLocalValue
          ? queueState.lastLocalValue
          : null,
      });
      return true;
    }
    const currentRows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    const rowIndex = findShoppingListRowIndex(currentRows, rowId || patchKey, sourceKey);
    if (rowIndex === -1) {
      logShoppingListCheckboxDeviation('child patch row missing', {
        table,
        rowId,
        sourceKey,
        patchKey,
        checked,
        updated_at: updatedAt,
      });
      return false;
    }
    const nextRows = currentRows.slice();
    const nextRow = cloneForUndo(
      currentRows[rowIndex],
      () => currentRows[rowIndex],
    );
    if (!nextRow) return false;
    nextRow.checked = checked;
    nextRows[rowIndex] = nextRow;
    shoppingListDoc = persistShoppingListDoc(
      {
        ...shoppingListDoc,
        rows: nextRows,
      },
      { skipRemoteSave: true },
    );
    syncShoppingListCheckboxVisuals(
      nextRow.id || rowId || patchKey,
      sourceKey,
      checked,
    );
    syncShoppingListResetButtonState();
    syncShoppingListUncheckAllButtonState();
    syncShoppingListCopyButtonState();
    syncShoppingListEditActionButtonsState();
    if (
      shoppingListCheckboxInputQueue &&
      typeof shoppingListCheckboxInputQueue.recordEchoApplied === 'function'
    ) {
      shoppingListCheckboxInputQueue.recordEchoApplied(opLike, {
        updated_at: updatedAt,
        value: checked,
      });
    }
    logShoppingListCheckboxSync('child patch applied', {
      table,
      rowId: nextRow.id || rowId || patchKey,
      sourceKey,
      patchKey,
      checked,
      updated_at: updatedAt,
      pending: !!queueState?.pending,
      inFlight: !!queueState?.inFlight,
      lastAppliedServerUpdatedAt:
        queueState?.lastAppliedServerUpdatedAt || null,
      lastLocalValue: queueState?.hasLocalValue
        ? queueState.lastLocalValue
        : null,
    });
    return true;
  };

  const shoppingListCheckboxInputQueue =
    window.favoriteEatsInputSync &&
    typeof window.favoriteEatsInputSync.createCoalescedOpQueue === 'function'
      ? window.favoriteEatsInputSync.createCoalescedOpQueue({
          flushDelayMs: 120,
          // Spammable-input charter §H: pending ops survive a forced reload.
          // The ring is drained on next page boot and replayed through the
          // narrow RPC before any local input is allowed to land on those keys.
          storageKey: 'favoriteEatsInputSync:list:v1',
          storage:
            typeof window !== 'undefined' && window.localStorage
              ? window.localStorage
              : null,
          onLocalApply: (op) => {
            applyShoppingListCheckboxLocal(op);
            const store = window.favoriteEatsStore;
            if (
              store &&
              typeof store.beginPendingRowOp === 'function' &&
              op?.field === 'checked'
            ) {
              store.beginPendingRowOp(op.entityKey, {
                kind: 'checked',
                checked: !!op.value,
              });
            }
          },
          onFlushStart: (op) => {
            if (op?.field === 'checked' && op.useCheckedRpc) {
              logShoppingListCheckboxSync('flush started', {
                entityKey: op.entityKey,
                rowId: op.rowId,
                sourceKey: op.sourceKey,
                checked: !!op.value,
              });
              beginShoppingListRowDataRpc();
              const store = window.favoriteEatsStore;
              if (store && typeof store.beginPendingRowOp === 'function') {
                store.beginPendingRowOp(op.entityKey, {
                  kind: 'checked',
                  checked: !!op.value,
                });
              }
            }
          },
          // Charter §D: flushOp returns its RPC result so the queue can extract
          // `updated_at` and bump per-key lastAppliedServerUpdatedAt. The
          // resulting timestamp lets shouldSkipEcho() drop same-device fanout
          // and stale realtime payloads without a time-window ledger.
          flushOp: async (op) => {
            if (!op || op.surface !== 'list' || op.field !== 'checked') return null;
            if (!op.useCheckedRpc) return null;
            const rowId = String(op.entityKey || '').trim();
            if (!rowId) return null;
            const result = await window.dataService.setShoppingListRowChecked({
              rowId,
              checked: !!op.value,
            });
            logShoppingListCheckboxSync('rpc returned', {
              rowId,
              checked: !!op.value,
              ok: result?.ok !== false,
              updated_at: result?.updated_at || result?.updatedAt || null,
              reason: result?.reason || null,
            });
            if (!result || result.ok !== false) return result;
            const reason = String(result.reason || '').trim();
            const bootstrapReasons = new Set([
              'no_active_session',
              'no_plan_document',
              'row_not_found',
            ]);
            const canBootstrapListFromDoc =
              bootstrapReasons.has(reason) &&
              shouldUseRemoteShoppingState() &&
              shoppingListDoc &&
              Array.isArray(shoppingListDoc.rows) &&
              shoppingListDoc.rows.length > 0;
            if (canBootstrapListFromDoc) {
              const remoteState = await awaitPersistShoppingStateToDataService({
                shoppingListDoc: normalizeShoppingListDoc(shoppingListDoc),
              });
              if (remoteState) {
                logShoppingListCheckboxDeviation('bootstrap whole-state save used', {
                  rowId,
                  reason,
                });
                return { ok: true, updated_at: null };
              }
            }
            throw new Error(reason || 'set_shopping_list_row_checked failed');
          },
          onFlushSuccess: (op, result) => {
            if (op?.field === 'checked' && op.useCheckedRpc) {
              endShoppingListRowDataRpc();
            }
            const updatedAt =
              result && typeof result === 'object'
                ? result.updated_at || result.updatedAt || null
                : null;
            logShoppingListCheckboxSync('ack', {
              entityKey: op?.entityKey || null,
              rowId: op?.rowId || null,
              sourceKey: op?.sourceKey || null,
              checked: !!op?.value,
              updated_at: updatedAt,
            });
            if (op?.field === 'checked' && op.useCheckedRpc && !updatedAt) {
              logShoppingListCheckboxDeviation('ack missing updated_at', {
                entityKey: op?.entityKey || null,
                rowId: op?.rowId || null,
                sourceKey: op?.sourceKey || null,
              });
            }
            const hasNewerPending =
              shoppingListCheckboxInputQueue &&
              typeof shoppingListCheckboxInputQueue.hasPending === 'function' &&
              shoppingListCheckboxInputQueue.hasPending(op);
            const store = window.favoriteEatsStore;
            if (
              !hasNewerPending &&
              store &&
              typeof store.scheduleEndPendingRowOp === 'function' &&
              op?.entityKey
            ) {
              store.scheduleEndPendingRowOp(op.entityKey);
            }
          },
          onFlushFailure: (op, err) => {
            if (op?.field === 'checked' && op.useCheckedRpc) {
              endShoppingListRowDataRpc();
            }
            logShoppingListCheckboxDeviation('flush failed', {
              entityKey: op?.entityKey || null,
              rowId: op?.rowId || null,
              sourceKey: op?.sourceKey || null,
              checked: !!op?.value,
              message: err?.message || String(err || ''),
            });
            const hasNewerPending =
              shoppingListCheckboxInputQueue &&
              typeof shoppingListCheckboxInputQueue.hasPending === 'function' &&
              shoppingListCheckboxInputQueue.hasPending(op);
            const store = window.favoriteEatsStore;
            if (
              !hasNewerPending &&
              store &&
              typeof store.endPendingRowOp === 'function' &&
              op?.entityKey
            ) {
              store.endPendingRowOp(op.entityKey);
            }
            if (
              !hasNewerPending &&
              op &&
              Object.prototype.hasOwnProperty.call(op, 'previousChecked')
            ) {
              applyShoppingListCheckboxLocal({
                ...op,
                value: !!op.previousChecked,
              });
              uiToast('Could not save check state.');
            }
            console.warn('setShoppingListRowChecked failed:', err);
            if (!hasNewerPending) {
              void runFavoriteEatsRemoteListRefresh();
            }
          },
        })
      : null;
  try {
    if (shoppingListCheckboxInputQueue) {
      window.favoriteEatsShoppingListCheckboxInputQueue =
        shoppingListCheckboxInputQueue;
    }
  } catch (_) {
    // ignore
  }

  const getShoppingListHomeLocationMap = () => {
    const sourceKeys = getShoppingListSourceKeys();
    const signature = JSON.stringify(sourceKeys);
    if (
      shoppingListHomeLocationCache.map instanceof Map &&
      shoppingListHomeLocationCache.signature === signature
    ) {
      return new Map(shoppingListHomeLocationCache.map);
    }
    const nextMap = new Map(sourceKeys.map((sourceKey) => [sourceKey, 'none']));
    return nextMap;
  };

  const getShoppingListChecklistViewState = () => {
    const searchQuery = String(searchInput?.value || '').trim();
    const isSearchActive = !!searchQuery;
    const displayRows = getShoppingListChecklistDisplayRows(
      shoppingListDoc?.rows || [],
      {
        mode: shoppingListViewMode,
        searchQuery,
        homeLocationBySourceKey: getShoppingListHomeLocationMap(),
        keepCompletedInPlace: shoppingListKeepCompletedInPlace,
        groupItemVariants: shoppingListGroupItemVariants,
      },
    );
    const visibleRows = isSearchActive
      ? displayRows
      : filterShoppingListChecklistRowsForCollapse(
          displayRows,
          collapsedShoppingListSections,
        );
    const selectedRecipes = isSearchActive ? [] : selectedRecipeSummaryRows;
    const recipesSectionKey = 'sl-recipes';
    const recipesExpanded =
      !!selectedRecipes.length &&
      !collapsedShoppingListSections.has(recipesSectionKey);
    return {
      searchQuery,
      isSearchActive,
      displayRows,
      visibleRows,
      selectedRecipes,
      recipesExpanded,
    };
  };

  const syncShoppingListCopyButtonState = () => {
    const { displayRows, selectedRecipes, isSearchActive } =
      getShoppingListChecklistViewState();
    const shouldDisable = !String(
      formatShoppingListPlainTextFromViewState(displayRows, {
        selectedRecipes,
        recipesExpanded: !!selectedRecipes.length && !isSearchActive,
      }) || '',
    ).trim();
    const syncBtn = (btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.disabled = shouldDisable;
      btn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    };
    syncBtn(webCopyBtn);
    syncBtn(controlsCopyBtn);
  };

  if (searchInput instanceof HTMLInputElement) {
    wireAppBarSearch(searchInput, {
      clearBtn,
      onQueryChange: () => {
        renderChecklist();
      },
      normalizeQuery: (value) => String(value || '').trim(),
    });
  }

  const restoreAllListRemovedRows = async () => {
    const dirtyOutcome = await resolveShoppingListDirtyRowEdits({
      message:
        'Changes to an item must be saved before restoring removed items. Save your changes?',
    });
    if (dirtyOutcome === 'cancelled') return;
    const currentRows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    if (!currentRows.some(isShoppingListRowListRemoved)) return;
    const ok = await confirmShoppingListRestoreAll();
    if (!ok) return;
    const previousDoc = cloneForUndo(
      shoppingListDoc,
      createEmptyShoppingListDoc,
    );
    const nextRows = currentRows.map((row) => {
      if (!isShoppingListRowListRemoved(row)) return row;
      const nextRow = cloneForUndo(row, () => row);
      if (!nextRow) return row;
      applyShoppingListRowListRestore(nextRow);
      return nextRow;
    });
    const remote = shouldUseRemoteShoppingState();
    await syncShoppingListDocRemote(
      { ...shoppingListDoc, rows: nextRows },
      'restoreRemoved',
    );
    renderChecklistWithHomeLocationRefresh();
    uiToastUndo('All items restored.', () => {
      shoppingListDoc = persistShoppingListDoc(
        previousDoc,
        remote ? { skipRemoteSave: true } : {},
      );
      if (remote) {
        void (async () => {
          await syncShoppingListSourcedDocRemote(shoppingListDoc);
          shoppingListDoc = getAuthoritativeShoppingListDoc();
          renderChecklistWithHomeLocationRefresh();
        })();
        return;
      }
      renderChecklistWithHomeLocationRefresh();
    });
  };

  const getShoppingListRowRemoveRestoreLabel = (row) => {
    const rowDraftForDisplay = getShoppingListRowDraftForId(row?.id);
    return rowDraftForDisplay
      ? String(rowDraftForDisplay.nextText || '').trim()
      : String(row?.text || '').trim();
  };

  const performShoppingListRowRemoveRestore = async ({
    row,
    rowLabel,
    skipConfirm = false,
  }) => {
    if (!row) return false;
    const dirtyOutcome = await resolveShoppingListDirtyRowEdits({
      message:
        'Changes to this item must be saved before it can be removed or restored. Save your changes?',
    });
    if (dirtyOutcome === 'cancelled') return false;
    const durableRowIdForRemoveRpc =
      String(row?.sourceKey || '').trim() || String(row?.id || '').trim();
    if (
      durableRowIdForRemoveRpc &&
      window.favoriteEatsStore &&
      typeof window.favoriteEatsStore.hasPendingRowOp === 'function' &&
      window.favoriteEatsStore.hasPendingRowOp(durableRowIdForRemoveRpc)
    ) {
      return false;
    }
    const useRemovedRpc =
      durableRowIdForRemoveRpc &&
      shouldUseRemoteShoppingState() &&
      typeof window.dataService?.setShoppingListRowRemoved === 'function';
    const rowIsListRemoved = isShoppingListRowListRemoved(row);
    if (rowIsListRemoved) {
      if (!skipConfirm) {
        const ok = await confirmShoppingListRowRestore(rowLabel);
        if (!ok) return false;
      }
      updateRow(
        row.id,
        (draft) => {
          applyShoppingListRowListRestore(draft);
        },
        {
          message: 'Item restored.',
          undoMessage: 'Restore undone.',
          sourceKeyHint: String(row?.sourceKey || '').trim(),
          listRemovedRpc: useRemovedRpc
            ? {
                rowId: durableRowIdForRemoveRpc,
              }
            : null,
        },
      );
      return true;
    }
    if (!skipConfirm) {
      const ok = await confirmShoppingListRowRemove(rowLabel);
      if (!ok) return false;
    }
    updateRow(
      row.id,
      (draft) => {
        applyShoppingListRowListRemove(draft);
      },
      {
        message: 'Item removed.',
        undoMessage: 'Remove undone.',
        sourceKeyHint: String(row?.sourceKey || '').trim(),
        listRemovedRpc: useRemovedRpc
          ? {
              rowId: durableRowIdForRemoveRpc,
            }
          : null,
      },
    );
    return true;
  };

  const handleShoppingListDocCheckboxClick = async (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.shopping-list-doc-checkbox--placeholder')) return;
    const checkbox = event.target.closest('.shopping-list-doc-checkbox');
    if (!checkbox) return;
    const li = checkbox.closest('li[data-shopping-list-row-id]');
    if (!li) return;
    event.preventDefault();
    event.stopPropagation();
    const rowId = String(li.dataset.shoppingListRowId || '').trim();
    const sourceKeyHint = String(li.dataset.shoppingListSourceKey || '').trim();
    const durableRowIdForRpc = sourceKeyHint || rowId;
    const docRows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    const docIndex = findShoppingListRowIndex(docRows, rowId, sourceKeyHint);
    const row = docIndex >= 0 ? docRows[docIndex] : null;
    if (!row) return;
    if (shoppingListCheckboxAction === 'remove') {
      await performShoppingListRowRemoveRestore({
        row,
        rowLabel: getShoppingListRowRemoveRestoreLabel(row),
        skipConfirm: true,
      });
      return;
    }
    if (shoppingListHasDirtyRowEdits()) {
      const outcome = await resolveShoppingListDirtyRowEdits({
        message:
          'Changes to this item must be saved before it can be marked complete. Save your changes?',
      });
      if (outcome === 'cancelled') return;
    }
    const useCheckedRpc =
      durableRowIdForRpc &&
      shouldUseRemoteShoppingState() &&
      typeof window.dataService?.setShoppingListRowChecked === 'function';
    if (shoppingListCheckboxInputQueue) {
      const nextChecked = !row.checked;
      logShoppingListCheckboxSync('enqueue requested', {
        rowId: row.id,
        sourceKey: sourceKeyHint,
        entityKey: durableRowIdForRpc || row.id,
        checked: nextChecked,
        useCheckedRpc: !!useCheckedRpc,
      });
      const enqueued = shoppingListCheckboxInputQueue.enqueue({
        surface: 'list',
        entityKey: durableRowIdForRpc || row.id,
        rowId: row.id,
        sourceKey: sourceKeyHint,
        field: 'checked',
        value: nextChecked,
        previousChecked: !!row.checked,
        useCheckedRpc: !!useCheckedRpc,
        clientSeq: (shoppingListInputClientSeq += 1),
      });
      if (enqueued) {
        uiToastUndo(row.checked ? 'Item included.' : 'Item completed.', () => {
          logShoppingListCheckboxSync('undo enqueue requested', {
            rowId: row.id,
            sourceKey: sourceKeyHint,
            entityKey: durableRowIdForRpc || row.id,
            checked: !!row.checked,
            useCheckedRpc: !!useCheckedRpc,
          });
          shoppingListCheckboxInputQueue.enqueue({
            surface: 'list',
            entityKey: durableRowIdForRpc || row.id,
            rowId: row.id,
            sourceKey: sourceKeyHint,
            field: 'checked',
            value: !!row.checked,
            previousChecked: nextChecked,
            useCheckedRpc: !!useCheckedRpc,
            clientSeq: (shoppingListInputClientSeq += 1),
          });
        });
        return;
      }
    }
    logShoppingListCheckboxDeviation('queue unavailable fallback checkbox path', {
      rowId: row.id,
      sourceKey: sourceKeyHint,
      useCheckedRpc: !!useCheckedRpc,
    });
    updateRow(
      row.id,
      (draft) => {
        draft.checked = !draft.checked;
      },
      {
        message: row.checked ? 'Item included.' : 'Item completed.',
        sourceKeyHint,
        listCheckedRpc: useCheckedRpc
          ? {
              rowId: durableRowIdForRpc,
            }
          : null,
      },
    );
  };

  const ensureShoppingListCheckboxDelegation = () => {
    if (!list || list.dataset.shoppingListCheckboxDelegated === '1') return;
    list.dataset.shoppingListCheckboxDelegated = '1';
    list.addEventListener('click', (event) => {
      void handleShoppingListDocCheckboxClick(event);
    });
  };

  const renderChecklist = () => {
    /** Set when the row editor mounts; focused at end of this render (same turn as tap → iOS keyboard). */
    let shoppingListEditFocusInput = null;
    const {
      isSearchActive,
      displayRows,
      visibleRows,
      selectedRecipes,
      recipesExpanded,
    } = getShoppingListChecklistViewState();
    const planRowsByKey = new Map(
      generatedPlanRows
        .filter((row) => String(row?.key || '').trim())
        .map((row) => [String(row.key || '').trim(), row]),
    );
    const shoppingNavKeys =
      window.favoriteEatsSessionKeys &&
      typeof window.favoriteEatsSessionKeys === 'object'
        ? window.favoriteEatsSessionKeys
        : {
            shoppingNavTargetId: 'favoriteEats:shopping-nav-target-id',
            shoppingNavTargetName: 'favoriteEats:shopping-nav-target-name',
          };
    list.innerHTML = '';

    if (!displayRows.length && !selectedRecipes.length) {
      if (isSearchActive) {
        renderTopLevelEmptyState(list, 'searchNoMatch');
      } else {
        renderTopLevelEmptyState(list, 'shoppingList');
      }
      listNav?.syncAfterRender?.();
      syncShoppingListResetButtonState();
      syncShoppingListUncheckAllButtonState();
      syncShoppingListCopyButtonState();
      syncShoppingListEditActionButtonsState();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    if (selectedRecipes.length) {
      const recipesSectionKey = 'sl-recipes';
      const recipeSection = document.createElement('li');
      recipeSection.className =
        'list-section-label shopping-list-section--recipes';
      const toggleBtn = createSectionToggleButton({
        label: 'RECIPES',
        expanded: recipesExpanded,
        onToggle: () => {
          if (collapsedShoppingListSections.has(recipesSectionKey)) {
            collapsedShoppingListSections.delete(recipesSectionKey);
          } else {
            collapsedShoppingListSections.add(recipesSectionKey);
          }
          persistCollapsedShoppingListSections();
          renderChecklist();
        },
      });
      recipeSection.appendChild(toggleBtn);
      list.appendChild(recipeSection);
      if (recipesExpanded) {
        selectedRecipes.forEach((recipe) => {
          const li = document.createElement('li');
          li.className =
            'shopping-list-doc-item shopping-list-doc-item--recipe-summary';
          const headline = document.createElement('div');
          headline.className =
            'shopping-list-doc-headline shopping-list-doc-headline--recipe-summary';
          const recipeLink = document.createElement('a');
          recipeLink.href =
            favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
          recipeLink.className =
            'shopping-list-doc-contribution-link shopping-list-doc-recipe-summary-link';
          recipeLink.textContent = String(recipe.title || '').trim();
          recipeLink.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void guardShoppingListNavigation(() => {
              if (typeof window.openRecipe === 'function') {
                window.openRecipe(recipe.recipeId, recipe.title);
                return;
              }
              setSelectedRecipeNavigationSession(recipe.recipeId, recipe.title);
              window.location.href =
                favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
            });
          });
          headline.classList.add('list-row-headline--split');
          recipeLink.classList.add('list-row-primary');
          headline.appendChild(recipeLink);
          if (recipe.servingsText) {
            const tail = document.createElement('span');
            tail.className = 'shopping-list-doc-tail';
            tail.appendChild(document.createTextNode('\u00a0'));
            const detail = document.createElement('span');
            detail.className =
              'shopping-list-doc-contribution-detail list-row-detail';
            detail.textContent = `(${recipe.servingsText})`;
            tail.appendChild(detail);
            headline.appendChild(tail);
          }
          li.appendChild(headline);
          list.appendChild(li);
        });
      }
    }

    visibleRows.forEach((row) => {
      const li = document.createElement('li');
      if (row?.rowType === 'section') {
        li.className =
          `list-section-label ${String(row?.className || '').trim()}`.trim();
        const sectionToggleKey = String(row?.sectionCollapseKey || '').trim();
        const isCollapsible =
          !isSearchActive && !!row.collapsible && !!sectionToggleKey;
        if (isCollapsible && row?.showRestoreAll) {
          const isExpanded =
            !collapsedShoppingListSections.has(sectionToggleKey);
          const headerRow = document.createElement('div');
          headerRow.className = 'shopping-list-section-header-row';
          const toggleBtn = createSectionToggleButton({
            label: row.text || row.label || '',
            expanded: isExpanded,
            onToggle: () => {
              if (collapsedShoppingListSections.has(sectionToggleKey)) {
                collapsedShoppingListSections.delete(sectionToggleKey);
              } else {
                collapsedShoppingListSections.add(sectionToggleKey);
              }
              persistCollapsedShoppingListSections();
              renderChecklist();
            },
          });
          headerRow.appendChild(toggleBtn);
          const restoreAllBtn = document.createElement('button');
          restoreAllBtn.type = 'button';
          restoreAllBtn.className =
            'recipe-editor-manage-link shopping-list-restore-all-link';
          restoreAllBtn.textContent = 'Restore all';
          restoreAllBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void restoreAllListRemovedRows();
          });
          headerRow.appendChild(restoreAllBtn);
          li.appendChild(headerRow);
        } else if (isCollapsible) {
          const isCompleted = String(row?.className || '').includes(
            'shopping-list-section--completed',
          );
          const isExpanded =
            !collapsedShoppingListSections.has(sectionToggleKey);
          const toggleBtn = createSectionToggleButton({
            label: row.text || row.label || '',
            expanded: isExpanded,
            completed: isCompleted,
            onToggle: () => {
              if (collapsedShoppingListSections.has(sectionToggleKey)) {
                collapsedShoppingListSections.delete(sectionToggleKey);
              } else {
                collapsedShoppingListSections.add(sectionToggleKey);
              }
              persistCollapsedShoppingListSections();
              renderChecklist();
            },
          });
          li.appendChild(toggleBtn);
        } else {
          li.textContent = String(row.text || row.label || '').trim();
        }
        list.appendChild(li);
        return;
      }

      li.className = String(row?.className || '').trim();
      li.dataset.shoppingListRowId = String(row?.id || '');
      const sourceKey = String(row?.sourceKey || '').trim();
      if (sourceKey) {
        li.dataset.shoppingListSourceKey = sourceKey;
      }
      const durableRowIdForRpc = sourceKey || String(row?.id || '').trim();
      const isPendingChecked = pendingCheckedRowIds.has(String(row?.id || ''));
      li.classList.toggle(
        'shopping-list-doc-item--checked',
        !!row?.checked || isPendingChecked,
      );
      const planRow = sourceKey ? planRowsByKey.get(sourceKey) || null : null;
      const contributionRows = Array.isArray(planRow?.contributionRows)
        ? planRow.contributionRows.filter(Boolean)
        : [];
      const hasRecipeContributions = contributionRows.some(
        (entry) => String(entry?.sourceType || '') === 'recipe',
      );
      const supportsExpansion =
        !!sourceKey && !!planRow && hasRecipeContributions;
      const isExpanded =
        supportsExpansion &&
        expandedShoppingListContributionRows.has(sourceKey);
      const toggleContributionExpansion = () => {
        if (!supportsExpansion) return false;
        if (expandedShoppingListContributionRows.has(sourceKey)) {
          expandedShoppingListContributionRows.delete(sourceKey);
        } else {
          expandedShoppingListContributionRows.add(sourceKey);
        }
        renderChecklist();
        return true;
      };

      const checkbox = document.createElement('button');
      checkbox.type = 'button';
      checkbox.className = 'shopping-list-doc-checkbox';
      const checkboxUi = getShoppingListCheckboxUiState(row, {
        checked: !!row?.checked,
        isPendingChecked,
      });
      const checkboxIcon = document.createElement('span');
      checkboxIcon.className = 'material-symbols-outlined';
      checkboxIcon.setAttribute('aria-hidden', 'true');
      checkbox.appendChild(checkboxIcon);
      applyShoppingListCheckboxUiToButton(checkbox, checkboxUi);

      const textWrap = document.createElement('div');
      textWrap.className = 'shopping-list-doc-text-wrap';

      const rowDraftForDisplay = getShoppingListRowDraftForId(row?.id);
      const rowDisplayText = rowDraftForDisplay
        ? String(rowDraftForDisplay.nextText || '').trim()
        : String(row?.text || '').trim();
      const rowTextParsed =
        splitShoppingListRowTextToLabelAndDetail(rowDisplayText);
      const useShoppingListTextRpc =
        durableRowIdForRpc &&
        shouldUseRemoteShoppingState() &&
        typeof window.dataService?.setShoppingListRowText === 'function';
      const planRowDetail = String(planRow?.detailText || '').trim();
      const useSplitPlanLayout =
        !!planRow &&
        (planRowDetail || rowTextParsed.detail) &&
        !(row?.userEdited && !rowTextParsed.detail && planRowDetail);

      const buildPlanIngredientLink = (headlineEl) => {
        const ingredientLink = document.createElement('a');
        ingredientLink.href = 'shopping.html';
        ingredientLink.className = 'shopping-list-doc-link';
        if (planRow?.variantIsDeprecated) {
          ingredientLink.classList.add(
            'shopping-list-doc-link--variant-deprecated',
          );
        }
        ingredientLink.textContent =
          String(planRow?.label || '').trim() || String(row?.text || '').trim();
        ingredientLink.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            sessionStorage.removeItem(shoppingNavKeys.shoppingNavTargetId);
            sessionStorage.setItem(
              shoppingNavKeys.shoppingNavTargetName,
              String(planRow?.name || '').trim() ||
                String(planRow?.label || '').trim(),
            );
          } catch (_) {}
          void guardShoppingListNavigation(() => {
            window.location.href =
              favoriteEatsHrefWithCurrentAdapter('shopping.html');
          });
        });
        headlineEl.appendChild(ingredientLink);
        return ingredientLink;
      };

      const createShoppingListDocExpansionToggleButton = () => {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className =
          'shopping-list-doc-expand shopping-list-section-toggle';
        toggleBtn.setAttribute(
          'aria-label',
          isExpanded ? 'Collapse recipe details' : 'Expand recipe details',
        );
        toggleBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        const icon = document.createElement('span');
        icon.className =
          'material-symbols-outlined shopping-list-section-toggle__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'expand_more';
        toggleBtn.appendChild(icon);
        toggleBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleContributionExpansion();
        });
        return toggleBtn;
      };

      const appendTailExpansionButton = (getTail) => {
        if (!supportsExpansion) return;
        const tailEl = getTail();
        if (tailEl.childNodes.length > 1) {
          tailEl.appendChild(document.createTextNode('\u00a0'));
        }
        tailEl.appendChild(createShoppingListDocExpansionToggleButton());
      };

      if (
        editingRowId === row.id &&
        useSplitPlanLayout &&
        editingRowMode === 'amount'
      ) {
        const resolvedPlanLabel = getShoppingListPlanRowResolvedLabel(planRow);
        const displayDetailForEdit = rowTextParsed.detail || planRowDetail;
        const headline = document.createElement('div');
        headline.className = 'shopping-list-doc-headline';
        buildPlanIngredientLink(headline);
        let tail = null;
        const getTail = () => {
          if (tail) return tail;
          tail = document.createElement('span');
          tail.className = 'shopping-list-doc-tail';
          tail.appendChild(document.createTextNode('\u00a0'));
          headline.appendChild(tail);
          return tail;
        };
        const amtInput = document.createElement('input');
        amtInput.type = 'text';
        amtInput.className =
          'shopping-list-doc-input shopping-list-doc-input--amount';
        amtInput.setAttribute('aria-label', 'Amount');
        amtInput.value = String(displayDetailForEdit || '');

        const applyShoppingListAmountInputWidth = () => {
          const len = String(amtInput.value || '').length;
          const cols = Math.min(32, Math.max(2, len + 1));
          amtInput.setAttribute('size', String(cols));
        };
        applyShoppingListAmountInputWidth();
        amtInput.addEventListener('input', () => {
          applyShoppingListAmountInputWidth();
          syncShoppingListEditActionButtonsState();
        });

        const amountSkin = document.createElement('span');
        amountSkin.className = 'shopping-list-doc-amount-skin';
        const parenOpen = document.createElement('span');
        parenOpen.className = 'shopping-list-doc-amount-paren';
        parenOpen.setAttribute('aria-hidden', 'true');
        parenOpen.textContent = '(';
        const parenClose = document.createElement('span');
        parenClose.className = 'shopping-list-doc-amount-paren';
        parenClose.setAttribute('aria-hidden', 'true');
        parenClose.textContent = ')';
        amountSkin.appendChild(parenOpen);
        amountSkin.appendChild(amtInput);
        amountSkin.appendChild(parenClose);
        getTail().appendChild(amountSkin);
        appendTailExpansionButton(getTail);
        const finishAmountEditing = (mode) => {
          if (editingRowId !== row.id) return;
          if (mode === 'cancel') {
            void attemptShoppingListRowEditCancelFromUser();
            return;
          }
          commitShoppingListRowEdit();
        };
        amountSkin.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.target !== amtInput) {
            try {
              amtInput.focus();
            } catch (_) {}
          }
        });
        amtInput.addEventListener('click', (event) => event.stopPropagation());
        amtInput.addEventListener('keydown', (event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            finishAmountEditing('commit');
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            finishAmountEditing('cancel');
          }
        });
        const onAmountBlur = () => {
          if (editingRowId !== row.id || editingRowMode !== 'amount') return;
          const nextText = buildJoinedShoppingListAmountCommitText(
            row,
            planRow,
            amtInput.value,
          );
          const committed = String(row.text || '').trim();
          if (nextText === committed) {
            setShoppingListRowDraftForId(row.id, null);
          } else {
            setShoppingListRowDraftForId(row.id, {
              mode: 'amount',
              nextText,
            });
          }
          clearShoppingListRowEditing();
          renderChecklist();
          syncShoppingListEditActionButtonsState();
        };
        amtInput.addEventListener('blur', onAmountBlur);
        shoppingListEditFocusInput = amtInput;
        textWrap.appendChild(headline);
      } else if (
        editingRowId === row.id &&
        (!useSplitPlanLayout || editingRowMode === 'line')
      ) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'shopping-list-doc-input';
        input.value = rowDisplayText;
        const finishLineEditing = (mode) => {
          if (editingRowId !== row.id) return;
          if (mode === 'cancel') {
            void attemptShoppingListRowEditCancelFromUser();
            return;
          }
          commitShoppingListRowEdit();
        };
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('input', () => {
          syncShoppingListEditActionButtonsState();
        });
        input.addEventListener('keydown', (event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            finishLineEditing('commit');
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            finishLineEditing('cancel');
          }
        });
        const onLineBlur = () => {
          if (editingRowId !== row.id || editingRowMode !== 'line') return;
          const nextText = String(input.value || '').trim();
          if (!nextText) {
            setShoppingListRowDraftForId(row.id, null);
            clearShoppingListRowEditing();
            renderChecklist();
            syncShoppingListEditActionButtonsState();
            return;
          }
          const committed = String(row.text || '').trim();
          if (nextText === committed) {
            setShoppingListRowDraftForId(row.id, null);
          } else {
            setShoppingListRowDraftForId(row.id, {
              mode: 'line',
              nextText,
            });
          }
          clearShoppingListRowEditing();
          renderChecklist();
          syncShoppingListEditActionButtonsState();
        };
        input.addEventListener('blur', onLineBlur);
        shoppingListEditFocusInput = input;
        textWrap.appendChild(input);
      } else {
        const headline = document.createElement('div');
        headline.className = 'shopping-list-doc-headline';
        let tail = null;

        const getTail = () => {
          if (tail) return tail;
          tail = document.createElement('span');
          tail.className = 'shopping-list-doc-tail';
          tail.appendChild(document.createTextNode('\u00a0'));
          headline.appendChild(tail);
          return tail;
        };

        if (useSplitPlanLayout) {
          headline.classList.add('list-row-headline--split');
          const ingredientLink = buildPlanIngredientLink(headline);
          ingredientLink.classList.add('list-row-primary');
          const innerDetail = rowTextParsed.detail || planRowDetail;
          const amountBtn = document.createElement('button');
          amountBtn.type = 'button';
          const amountDiverged = shoppingListRowAmountDetailDivergedFromSource({
            ...row,
            text: rowDisplayText,
          });
          amountBtn.className = [
            'shopping-list-doc-text',
            'shopping-list-doc-text--amount',
            'list-row-detail',
            amountDiverged ? 'shopping-list-doc-text--amount-diverged' : '',
          ]
            .filter(Boolean)
            .join(' ');
          amountBtn.textContent = `(${innerDetail})`;
          amountBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            editingRowId = row.id;
            editingRowMode = 'amount';
            renderChecklist();
          });
          getTail().appendChild(amountBtn);
        } else {
          const textBtn = document.createElement('button');
          textBtn.type = 'button';
          textBtn.className = [
            'shopping-list-doc-text',
            planRow?.variantIsDeprecated
              ? 'shopping-list-doc-text--variant-deprecated'
              : '',
          ]
            .filter(Boolean)
            .join(' ');
          textBtn.textContent = rowDisplayText;
          textBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            editingRowId = row.id;
            editingRowMode = 'line';
            renderChecklist();
          });
          headline.appendChild(textBtn);
        }

        if (useSplitPlanLayout) {
          appendTailExpansionButton(getTail);
        } else if (supportsExpansion) {
          const textBtnTail = document.createElement('span');
          textBtnTail.className = 'shopping-list-doc-tail';
          textBtnTail.appendChild(document.createTextNode('\u00a0'));
          headline.appendChild(textBtnTail);
          textBtnTail.appendChild(createShoppingListDocExpansionToggleButton());
        }

        textWrap.appendChild(headline);
      }

      li.appendChild(checkbox);
      li.appendChild(textWrap);

      const rowRemoveRestoreLabel = rowDisplayText;
      const handleRowRemoveRestoreGesture = async (event) => {
        if (
          !isControlClickRemoveGesture(event) &&
          !isControlPrimaryContextMenuGesture(event)
        ) {
          return;
        }
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.shopping-list-doc-checkbox')) return;
        if (target.closest('.shopping-list-doc-link')) return;
        if (target.closest('.shopping-list-doc-amount-skin')) return;
        if (target.closest('.shopping-list-doc-input')) return;
        if (
          target.closest(
            '.shopping-list-doc-text:not(.shopping-list-doc-text--amount)',
          )
        ) {
          return;
        }
        if (target.closest('.shopping-list-doc-expand')) return;
        event.preventDefault();
        event.stopPropagation();
        await performShoppingListRowRemoveRestore({
          row,
          rowLabel: rowRemoveRestoreLabel,
          skipConfirm: false,
        });
      };
      li.addEventListener('click', handleRowRemoveRestoreGesture);
      li.addEventListener('contextmenu', handleRowRemoveRestoreGesture);

      window.favoriteEatsBindLongPressRemove?.(
        li,
        (event) => {
          void handleRowRemoveRestoreGesture({
            type: 'click',
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            button: 0,
            target: event.target,
            preventDefault() {},
            stopPropagation() {},
          });
        },
        {
          shouldIgnore: (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return true;
            if (target.closest('.shopping-list-doc-checkbox')) return true;
            if (target.closest('.shopping-list-doc-link')) return true;
            if (target.closest('.shopping-list-doc-amount-skin')) return true;
            if (target.closest('.shopping-list-doc-input')) return true;
            if (
              target.closest(
                '.shopping-list-doc-text:not(.shopping-list-doc-text--amount)',
              )
            ) {
              return true;
            }
            if (target.closest('.shopping-list-doc-expand')) return true;
            return false;
          },
        },
      );

      if (supportsExpansion) {
        li.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest('.shopping-list-doc-link')) return;
          if (target.closest('.shopping-list-doc-amount-skin')) return;
          if (
            target.closest(
              '.shopping-list-doc-text:not(.shopping-list-doc-text--amount)',
            )
          ) {
            return;
          }
          if (target.closest('.shopping-list-doc-input')) return;
          if (target.closest('.shopping-list-doc-checkbox')) return;
          event.preventDefault();
          event.stopPropagation();
          toggleContributionExpansion();
        });
      }
      list.appendChild(li);

      if (isExpanded && contributionRows.length > 0) {
        const createContributionCheckboxPlaceholder = () => {
          const placeholder = document.createElement('span');
          placeholder.className =
            'shopping-list-doc-checkbox shopping-list-doc-checkbox--placeholder';
          placeholder.setAttribute('aria-hidden', 'true');
          const placeholderIcon = document.createElement('span');
          placeholderIcon.className = 'material-symbols-outlined';
          placeholderIcon.setAttribute('aria-hidden', 'true');
          placeholderIcon.textContent = 'check_box_outline_blank';
          placeholder.appendChild(placeholderIcon);
          return placeholder;
        };
        const hasRecipeContributionRows = contributionRows.some(
          (entry) => String(entry?.sourceType || '') === 'recipe',
        );

        const groupLi = document.createElement('li');
        groupLi.className = 'shopping-list-doc-contribution-group';
        // Tag the group with its parent's stable key so targeted DOM updates
        // (e.g. syncShoppingListCheckboxDom on a realtime echo) can locate
        // and toggle the `--parent-checked` modifier without re-rendering.
        const groupParentKey = sourceKey || String(row?.id || '').trim();
        if (groupParentKey) {
          groupLi.dataset.shoppingListContributionParentKey = groupParentKey;
        }
        if (row?.checked || isPendingChecked) {
          groupLi.classList.add(
            'shopping-list-doc-contribution-group--parent-checked',
          );
        }

        const stack = document.createElement('div');
        stack.className = 'shopping-list-doc-contribution-stack';

        if (hasRecipeContributionRows) {
          const contextRow = document.createElement('div');
          contextRow.className = 'shopping-list-doc-contribution-context-row';
          contextRow.appendChild(createContributionCheckboxPlaceholder());
          const contextTextWrap = document.createElement('div');
          contextTextWrap.className = 'shopping-list-doc-text-wrap';
          const contextHeadline = document.createElement('div');
          contextHeadline.className =
            'shopping-list-doc-headline shopping-list-doc-headline--contribution-context';
          const contextText = document.createElement('span');
          contextText.className =
            'shopping-list-doc-contribution-context-label';
          contextText.textContent = 'Recipes';
          contextHeadline.appendChild(contextText);
          contextTextWrap.appendChild(contextHeadline);
          contextRow.appendChild(contextTextWrap);
          stack.appendChild(contextRow);
        }

        const sublist = document.createElement('ul');
        sublist.className = 'shopping-list-doc-contribution-sublist';

        contributionRows.forEach((entry, contributionIndex) => {
          const childLi = document.createElement('li');
          childLi.className =
            'shopping-list-doc-item shopping-list-doc-item--contribution';
          if (contributionIndex === contributionRows.length - 1) {
            childLi.classList.add('shopping-list-doc-item--contribution-last');
          }
          childLi.appendChild(createContributionCheckboxPlaceholder());
          const textWrapChild = document.createElement('div');
          textWrapChild.className = 'shopping-list-doc-text-wrap';
          const headlineChild = document.createElement('div');
          headlineChild.className =
            'shopping-list-doc-headline shopping-list-doc-headline--contribution';

          if (String(entry?.sourceType || '') === 'recipe') {
            const recipeLink = document.createElement('a');
            recipeLink.href =
              favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
            recipeLink.className = 'shopping-list-doc-contribution-link';
            recipeLink.textContent =
              String(entry?.title || '').trim() || 'Recipe';
            recipeLink.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              void guardShoppingListNavigation(() => {
                if (typeof window.openRecipe === 'function') {
                  window.openRecipe(entry.recipeId, entry.title);
                  return;
                }
                setSelectedRecipeNavigationSession(entry.recipeId, entry.title);
                window.location.href =
                  favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
              });
            });
            headlineChild.appendChild(recipeLink);
          } else {
            const label = document.createElement('span');
            label.className = 'shopping-list-doc-contribution-label';
            label.textContent =
              String(entry?.title || '').trim() || 'Directly added';
            headlineChild.appendChild(label);
          }

          headlineChild.appendChild(document.createTextNode(' '));
          const detail = document.createElement('span');
          detail.className = 'shopping-list-doc-contribution-detail';
          detail.textContent = `(${String(entry?.detailText || '').trim()})`;
          headlineChild.appendChild(detail);

          textWrapChild.appendChild(headlineChild);
          childLi.appendChild(textWrapChild);
          sublist.appendChild(childLi);
        });

        stack.appendChild(sublist);
        groupLi.appendChild(stack);
        list.appendChild(groupLi);
      }
    });

    listNav?.syncAfterRender?.();

    if (shoppingListEditFocusInput instanceof HTMLInputElement) {
      try {
        shoppingListEditFocusInput.focus();
        shoppingListEditFocusInput.select();
      } catch (_) {}
    }
    syncShoppingListResetButtonState();
    syncShoppingListUncheckAllButtonState();
    syncShoppingListCopyButtonState();
    syncShoppingListEditActionButtonsState();
    shoppingListFilterChipRail?.sync?.();
  };

  const handleShoppingListReset = async () => {
    const dirtyOutcome = await resolveShoppingListDirtyRowEdits();
    if (dirtyOutcome === 'cancelled') return;
    const previousDoc = cloneForUndo(
      shoppingListDoc,
      createEmptyShoppingListDoc,
    );
    let generatedDoc = getGeneratedShoppingListDoc();
    if (shouldUseRemoteShoppingState() && window.dataService) {
      try {
        await hydrateShoppingStateFromDataService();
        const planRowsFresh = await getShoppingPlanSelectionRowsViaDataService({
          db,
        });
        generatedPlanRows = planRowsFresh;
        selectedRecipeSummaryRows =
          await getShoppingListSelectedRecipeSummaryRowsViaDataService({
            db,
          });
        generatedDoc = buildShoppingListDocFromPlanRows(planRowsFresh);
      } catch (err) {
        console.warn('Shopping list reset: server refresh failed:', err);
        generatedDoc = getGeneratedShoppingListDoc();
      }
    }
    if (isShoppingListDiscardChangesNoOp(shoppingListDoc, generatedDoc)) {
      syncShoppingListResetButtonState(generatedDoc);
      return;
    }
    const confirmed = await uiConfirm({
      title: 'Reset amounts',
      message:
        'This will reset all item amounts and remove your edits from the shopping list.',
      confirmText: 'Reset',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    const nextDoc = applyShoppingListDiscardQuantityChanges(
      shoppingListDoc,
      generatedDoc,
    );
    const remote = shouldUseRemoteShoppingState();
    shoppingListDoc = persistShoppingListDoc(
      nextDoc,
      remote ? { skipRemoteSave: true } : {},
    );
    if (remote) {
      await syncShoppingListSourcedDocRemote(shoppingListDoc);
    }
    clearShoppingListRowEditSession();
    resetCollapsedShoppingListSections();
    await refreshShoppingListHomeLocationCache();
    renderChecklist();
    uiToastUndo('Changes discarded.', () => {
      shoppingListDoc = persistShoppingListDoc(
        previousDoc,
        remote ? { skipRemoteSave: true } : {},
      );
      if (remote) {
        void (async () => {
          await syncShoppingListSourcedDocRemote(shoppingListDoc);
          shoppingListDoc = getAuthoritativeShoppingListDoc();
          clearShoppingListRowEditSession();
          resetCollapsedShoppingListSections();
          await refreshShoppingListHomeLocationCache();
          renderChecklist();
          syncShoppingListResetButtonState();
          syncShoppingListUncheckAllButtonState();
        })();
        return;
      }
      clearShoppingListRowEditSession();
      resetCollapsedShoppingListSections();
      void refreshShoppingListHomeLocationCache().then(() => {
        renderChecklist();
        syncShoppingListResetButtonState();
        syncShoppingListUncheckAllButtonState();
      });
    });
  };

  const handleShoppingListUncheckAll = async () => {
    const dirtyOutcome = await resolveShoppingListDirtyRowEdits();
    if (dirtyOutcome === 'cancelled') return;
    if (isShoppingListUncheckAllNoOp()) {
      syncShoppingListUncheckAllButtonState();
      return;
    }
    const previousDoc = cloneForUndo(
      shoppingListDoc,
      createEmptyShoppingListDoc,
    );
    cancelAllPendingChecks();
    const currentRows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    const nextRows = currentRows.map((row) =>
      row?.checked ? { ...row, checked: false } : row,
    );
    const remote = shouldUseRemoteShoppingState();
    await syncShoppingListDocRemote(
      { ...shoppingListDoc, rows: nextRows },
      'uncheckAll',
    );
    renderChecklist();
    syncShoppingListUncheckAllButtonState();
    uiToastUndo('All items unchecked.', () => {
      cancelAllPendingChecks();
      shoppingListDoc = persistShoppingListDoc(
        previousDoc,
        remote ? { skipRemoteSave: true } : {},
      );
      if (remote) {
        void (async () => {
          await syncShoppingListSourcedDocRemote(shoppingListDoc);
          shoppingListDoc = getAuthoritativeShoppingListDoc();
          renderChecklist();
          syncShoppingListUncheckAllButtonState();
        })();
        return;
      }
      renderChecklist();
      syncShoppingListUncheckAllButtonState();
    });
  };

  const handleShoppingListCopy = async () => {
    const { displayRows, selectedRecipes, isSearchActive } =
      getShoppingListChecklistViewState();
    const copyOptions = {
      selectedRecipes,
      recipesExpanded: !!selectedRecipes.length && !isSearchActive,
    };
    const plainText = formatShoppingListPlainTextFromViewState(
      displayRows,
      copyOptions,
    );
    const htmlText = formatShoppingListHtmlFromViewState(
      displayRows,
      copyOptions,
    );
    if (!String(plainText || '').trim()) {
      syncShoppingListCopyButtonState();
      uiToast('Nothing to copy.');
      return;
    }
    const canWritePlainText =
      typeof navigator?.clipboard?.writeText === 'function';
    const canWriteRich =
      typeof navigator?.clipboard?.write === 'function' &&
      typeof ClipboardItem === 'function' &&
      typeof Blob === 'function';
    if (!canWritePlainText && !canWriteRich) {
      uiToast('Clipboard is unavailable on this device.');
      return;
    }
    try {
      if (canWriteRich) {
        const item = new ClipboardItem({
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
          'text/html': new Blob([htmlText], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
      } else if (canWritePlainText) {
        await navigator.clipboard.writeText(plainText);
      }
      uiToast('Shopping list copied.');
    } catch (err) {
      if (canWritePlainText) {
        try {
          await navigator.clipboard.writeText(plainText);
          uiToast('Shopping list copied.');
          return;
        } catch (fallbackErr) {
          console.error('❌ Failed to copy shopping list:', err);
          console.error(
            '❌ Failed plain text clipboard fallback:',
            fallbackErr,
          );
        }
      } else {
        console.error('❌ Failed to copy shopping list:', err);
      }
      uiToast('Could not copy shopping list.');
    }
  };

  let shoppingListMonogramResetBtn = null;
  let shoppingListMonogramUncheckAllBtn = null;
  let shoppingListMonogramCopyBtn = null;
  const ensureShoppingListMonogramActionButtons = () => {
    if (!(shoppingListMonogramResetBtn instanceof HTMLButtonElement)) {
      shoppingListMonogramResetBtn = document.createElement('button');
      shoppingListMonogramResetBtn.type = 'button';
      shoppingListMonogramResetBtn.id = 'appBarMonogramShoppingListResetBtn';
      shoppingListMonogramResetBtn.className = 'bottom-nav-pill';
      shoppingListMonogramResetBtn.textContent = 'Reset amounts';
      shoppingListMonogramResetBtn.addEventListener('click', () => {
        void handleShoppingListReset();
      });
    } else {
      shoppingListMonogramResetBtn.textContent = 'Reset amounts';
    }
    if (!(shoppingListMonogramUncheckAllBtn instanceof HTMLButtonElement)) {
      shoppingListMonogramUncheckAllBtn = document.createElement('button');
      shoppingListMonogramUncheckAllBtn.type = 'button';
      shoppingListMonogramUncheckAllBtn.id =
        'appBarMonogramShoppingListUncheckAllBtn';
      shoppingListMonogramUncheckAllBtn.className = 'bottom-nav-pill';
      shoppingListMonogramUncheckAllBtn.textContent = 'Uncheck all';
      shoppingListMonogramUncheckAllBtn.addEventListener('click', () => {
        void handleShoppingListUncheckAll();
      });
    }
    if (!(shoppingListMonogramCopyBtn instanceof HTMLButtonElement)) {
      shoppingListMonogramCopyBtn = document.createElement('button');
      shoppingListMonogramCopyBtn.type = 'button';
      shoppingListMonogramCopyBtn.id = 'appBarMonogramShoppingListCopyBtn';
      shoppingListMonogramCopyBtn.className = 'bottom-nav-pill';
      shoppingListMonogramCopyBtn.textContent = 'Copy';
      shoppingListMonogramCopyBtn.addEventListener('click', () => {
        void handleShoppingListCopy();
      });
    }
    return [
      shoppingListMonogramResetBtn,
      shoppingListMonogramUncheckAllBtn,
      shoppingListMonogramCopyBtn,
    ];
  };

  const shoppingListMonogramButtons = ensureShoppingListMonogramActionButtons();
  webResetBtn = shoppingListMonogramButtons[0];
  resetBtn = shoppingListMonogramButtons[0];
  webUncheckAllBtn = shoppingListMonogramButtons[1];
  webCopyBtn = shoppingListMonogramButtons[2];
  controlsCopyBtn = shoppingListMonogramButtons[2];

  window.favoriteEatsMonogramMenuExtraButtons =
    ensureShoppingListMonogramActionButtons;

  window.favoriteEatsSyncShoppingListMonogramActions = () => {
    syncShoppingListCopyButtonState();
    syncShoppingListResetButtonState();
    syncShoppingListUncheckAllButtonState();
  };

  try {
    if (typeof window.favoriteEatsRebuildMonogramAccountMenu === 'function') {
      window.favoriteEatsRebuildMonogramAccountMenu();
    }
  } catch (_) {}

  if (shoppingListAppBarChrome) {
    const addBtn = document.getElementById('appBarAddBtn');
    if (addBtn instanceof HTMLButtonElement) {
      const actions = addBtn.parentElement;
      if (actions instanceof HTMLElement) {
        const staleWebCopyBtn = document.getElementById('appBarCopyBtn');
        if (staleWebCopyBtn instanceof HTMLElement) {
          staleWebCopyBtn.remove();
        }
      }

      const editActionsParent = addBtn.parentElement;
      if (editActionsParent instanceof HTMLElement) {
        const existingCancelBtn = document.getElementById(
          'appBarShoppingListCancelBtn',
        );
        if (existingCancelBtn instanceof HTMLButtonElement) {
          webCancelEditBtn = existingCancelBtn;
        } else {
          webCancelEditBtn = document.createElement('button');
          webCancelEditBtn.type = 'button';
          webCancelEditBtn.id = 'appBarShoppingListCancelBtn';
          webCancelEditBtn.className = 'button-filled';
          addBtn.after(webCancelEditBtn);
        }
        ensureAppBarTextActionPair(webCancelEditBtn, 'Cancel', 'cancel');
        if (!webCancelEditBtn.dataset.shoppingListBarWired) {
          webCancelEditBtn.dataset.shoppingListBarWired = '1';
          webCancelEditBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
          });
          webCancelEditBtn.addEventListener('click', () => {
            void attemptShoppingListRowEditCancelFromUser();
          });
        }

        const existingSaveBtn = document.getElementById(
          'appBarShoppingListSaveBtn',
        );
        if (existingSaveBtn instanceof HTMLButtonElement) {
          webSaveEditBtn = existingSaveBtn;
        } else {
          webSaveEditBtn = document.createElement('button');
          webSaveEditBtn.type = 'button';
          webSaveEditBtn.id = 'appBarShoppingListSaveBtn';
          webSaveEditBtn.className = 'button-filled';
          webCancelEditBtn.after(webSaveEditBtn);
        }
        ensureAppBarTextActionPair(webSaveEditBtn, 'Save', 'check_circle');
        if (!webSaveEditBtn.dataset.shoppingListBarWired) {
          webSaveEditBtn.dataset.shoppingListBarWired = '1';
          webSaveEditBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
          });
          webSaveEditBtn.addEventListener('click', () => {
            commitShoppingListRowEdit();
          });
        }
      }
    }
  }

  await refreshShoppingListHomeLocationCache();
  mountShoppingListFilterChips();
  ensureShoppingListCheckboxDelegation();
  renderChecklist();
  fePageLoadFoodIconFinish();
  syncShoppingListCopyButtonState();
  syncShoppingListEditActionButtonsState();
  syncShoppingListExportButtonState();
  void resolvePendingSourceConflicts();
  // Charter §H boot replay: any pending checkbox ops left in the durable
  // ring from a prior session (pagehide / crash / forced reload) are
  // replayed through the narrow RPC. We deliberately bypass the queue's
  // onLocalApply because the canonical doc is already hydrated; the RPC's
  // realtime fanout will reconcile any divergence per-key.
  void (async function drainShoppingListCheckboxDurable() {
    if (
      !shoppingListCheckboxInputQueue ||
      typeof shoppingListCheckboxInputQueue.drainDurable !== 'function'
    ) {
      return;
    }
    const ops = shoppingListCheckboxInputQueue.drainDurable();
    if (!Array.isArray(ops) || ops.length === 0) return;
    logShoppingListCheckboxSync('durable replay found', {
      count: ops.length,
    });
    if (!shouldUseRemoteShoppingState()) return;
    if (!window.dataService || typeof window.dataService.setShoppingListRowChecked !== 'function') {
      return;
    }
    for (const op of ops) {
      if (!op || op.surface !== 'list' || op.field !== 'checked') continue;
      const rowId = String(op.entityKey || '').trim();
      if (!rowId) continue;
      try {
        logShoppingListCheckboxSync('durable replay sent', {
          rowId,
          checked: !!op.value,
        });
        const result = await window.dataService.setShoppingListRowChecked({
          rowId,
          checked: !!op.value,
        });
        const updatedAt =
          result && typeof result === 'object'
            ? result.updated_at || result.updatedAt || null
            : null;
        if (updatedAt && typeof shoppingListCheckboxInputQueue.recordEchoApplied === 'function') {
          shoppingListCheckboxInputQueue.recordEchoApplied(
            { surface: 'list', entityKey: rowId, field: 'checked' },
            { updated_at: updatedAt, value: !!op.value },
          );
        }
        if (!updatedAt) {
          logShoppingListCheckboxDeviation('durable replay ack missing updated_at', {
            rowId,
            checked: !!op.value,
          });
        }
      } catch (err) {
        console.warn('shopping list checkbox durable replay failed:', err);
        logShoppingListCheckboxDeviation('durable replay failed', {
          rowId,
          checked: !!op.value,
          message: err?.message || String(err || ''),
        });
      }
    }
  })();

  registerFavoriteEatsRemoteListPatchHook((payload) => {
    if (!isActiveShoppingListCheckboxSyncInstance()) {
      logShoppingListCheckboxDeviation('stale patch hook ignored', {
        table: payload?.table || null,
        activeInstanceId:
          global.__favoriteEatsShoppingListCheckboxSyncActiveInstanceId || null,
      });
      return false;
    }
    if (editingRowId || shoppingListRowDraftStorageHasAny()) {
      logShoppingListCheckboxDeviation('patch hook deferred by row edit', {
        table: payload?.table || null,
      });
      return false;
    }
    return applyShoppingListCheckboxRemotePatch(payload);
  });

  registerFavoriteEatsRemoteListUiRefreshHook(async () => {
    if (!isActiveShoppingListCheckboxSyncInstance()) {
      logShoppingListCheckboxDeviation('stale list refresh hook ignored', {
        activeInstanceId:
          global.__favoriteEatsShoppingListCheckboxSyncActiveInstanceId || null,
      });
      return;
    }
    if (editingRowId || shoppingListRowDraftStorageHasAny()) return;
    // Charter §G: per-key skip is built into mergePendingCheckboxOpsIntoDoc.
    // Any row with pending/in-flight checkbox intent keeps the queue's local
    // value; all other rows take the authoritative server value.
    shoppingListDoc = mergePendingCheckboxOpsIntoDoc(
      getAuthoritativeShoppingListDoc(),
      'list ui refresh hook',
    );
    renderChecklistWithHomeLocationRefresh();
    syncShoppingListResetButtonState();
    syncShoppingListUncheckAllButtonState();
    syncShoppingListCopyButtonState();
    syncShoppingListEditActionButtonsState();
    syncShoppingListExportButtonState();
  });

  registerFavoriteEatsRemotePlanUiRefreshHook(async () => {
    const refreshSeq = (shoppingListPlanUiRefreshSeq += 1);
    const requestSeqAtStart =
      Number(global.__favoriteEatsRemotePlanUiRefreshRequestSeq || 0) || 0;
    const isLatestPlanUiRefresh = () =>
      refreshSeq === shoppingListPlanUiRefreshSeq &&
      requestSeqAtStart ===
        (Number(global.__favoriteEatsRemotePlanUiRefreshRequestSeq || 0) || 0);
    if (!isActiveShoppingListCheckboxSyncInstance()) {
      logShoppingListCheckboxDeviation('stale plan refresh hook ignored', {
        activeInstanceId:
          global.__favoriteEatsShoppingListCheckboxSyncActiveInstanceId || null,
      });
      return;
    }
    if (editingRowId || shoppingListRowDraftStorageHasAny()) return;
    // Charter §G: per-key skip lives in mergePendingCheckboxOpsIntoDoc below.
    let nextPlanRows;
    let nextRecipeSummaries;
    try {
      const maintainPlanRows = getFavoriteEatsInvalidationMaintainOut()?.planRows;
      const nextPlanRowsPromise = Array.isArray(maintainPlanRows)
        ? Promise.resolve(maintainPlanRows)
        : getShoppingPlanSelectionRowsViaDataService({ db });
      const nextRecipeSummariesPromise =
        getShoppingListSelectedRecipeSummaryRowsViaDataService({ db });

      nextRecipeSummaries = await nextRecipeSummariesPromise;
      if (!isLatestPlanUiRefresh()) {
        logShoppingListCheckboxDeviation('stale recipe summary refresh ignored', {
          refreshSeq,
          latestRefreshSeq: shoppingListPlanUiRefreshSeq,
        });
        return;
      }
      if (editingRowId || shoppingListRowDraftStorageHasAny()) return;
      selectedRecipeSummaryRows = nextRecipeSummaries;
      renderChecklistWithHomeLocationRefresh();

      nextPlanRows = await nextPlanRowsPromise;
    } catch (err) {
      console.warn('shopping list plan refetch (realtime) failed:', err);
      return;
    }
    if (!isLatestPlanUiRefresh()) {
      logShoppingListCheckboxDeviation('stale plan refresh apply ignored', {
        refreshSeq,
        latestRefreshSeq: shoppingListPlanUiRefreshSeq,
      });
      return;
    }
    if (editingRowId || shoppingListRowDraftStorageHasAny()) return;
    generatedPlanRows = nextPlanRows;
    selectedRecipeSummaryRows = nextRecipeSummaries;
    const storeSnap =
      window.favoriteEatsStore &&
      typeof window.favoriteEatsStore.getSnapshot === 'function'
        ? window.favoriteEatsStore.getSnapshot()
        : null;
    const authoritativeShoppingListDocForRealtime = storeSnap?.listDoc
      ? normalizeShoppingListDoc(storeSnap.listDoc)
      : getAuthoritativeShoppingListDoc();
    const sync = mergeShoppingListDocWithGenerated(
      authoritativeShoppingListDocForRealtime,
      getGeneratedShoppingListDoc(),
    );
    shoppingListDoc = persistShoppingListDoc(
      mergePendingCheckboxOpsIntoDoc(sync.doc, 'plan ui refresh hook'),
      {
        skipRemoteSave: shouldUseRemoteShoppingState(),
      },
    );
    pendingSourceConflicts = Array.isArray(sync.conflicts)
      ? sync.conflicts.slice()
      : [];
    clearShoppingListRowEditSession();
    shoppingListHomeLocationCache = { signature: '', map: null };
    await refreshShoppingListHomeLocationCache();
    if (!isLatestPlanUiRefresh()) {
      logShoppingListCheckboxDeviation('stale plan refresh render ignored', {
        refreshSeq,
        latestRefreshSeq: shoppingListPlanUiRefreshSeq,
      });
      return;
    }
    renderChecklistWithHomeLocationRefresh();
    syncShoppingListResetButtonState();
    syncShoppingListUncheckAllButtonState();
    syncShoppingListCopyButtonState();
    syncShoppingListEditActionButtonsState();
    syncShoppingListExportButtonState();
    void resolvePendingSourceConflicts();
  });
  window.addEventListener(
    'pagehide',
    () => {
      // Charter §H: best-effort in-page flush. Anything still pending is
      // already mirrored to the durable ring (storageKey on the queue) and
      // will be replayed on next boot via drainShoppingListCheckboxDurable().
      if (
        shoppingListCheckboxInputQueue &&
        typeof shoppingListCheckboxInputQueue.flushAll === 'function'
      ) {
        void shoppingListCheckboxInputQueue.flushAll();
      }
      window.removeEventListener('beforeunload', handleShoppingListBeforeUnload);
      if (
        window.favoriteEatsShoppingListRowEditNavigateGuard ===
        shoppingListRowEditNavigateGuard
      ) {
        window.favoriteEatsShoppingListRowEditNavigateGuard = null;
      }
      teardownFavoriteEatsShoppingPlanRealtime();
    },
    { once: true },
  );
}

  global.favoriteEatsShoppingListPage = {
    registerFavoriteEatsShoppingListPageDeps,
    loadShoppingListPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
