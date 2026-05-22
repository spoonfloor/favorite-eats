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
    teardownFavoriteEatsShoppingPlanRealtime,
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
    runFavoriteEatsRemoteShoppingPlanRefresh,
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
    confirmShoppingListRowRemove,
    confirmShoppingListRowRestore,
    confirmShoppingListRestoreAll,
    readShoppingListViewModeFromSession,
    persistShoppingListViewMode,
    readShoppingListKeepCompletedInPlaceFromSession,
    persistShoppingListKeepCompletedInPlace,
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
  const pendingCheckTimers = new Map();
  const pendingCheckedRowIds = new Set();
  const collapsedShoppingListSections = new Set();
  const expandedShoppingListContributionRows = new Set();
  const CHECK_MOVE_DELAY_MS = 260;
  let shoppingListViewMode = readShoppingListViewModeFromSession();
  let shoppingListKeepCompletedInPlace =
    readShoppingListKeepCompletedInPlaceFromSession();
  let shoppingListFilterChipRail = null;

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
    beginShoppingListRowDataRpc();
    void window.dataService
      .setShoppingListRowChecked({
        rowId,
        checked: !!rpc.checked,
      })
      .then(async (result) => {
        if (!result || result.ok !== false) return;
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
    beginShoppingListRowDataRpc();
    void window.dataService
      .setShoppingListRowText({
        rowId,
        text,
      })
      .then(async (result) => {
        if (!result || result.ok !== false) return;
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
    } = {},
  ) => {
    const currentRows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    const rowIndex = currentRows.findIndex(
      (row) => String(row?.id || '') === String(rowId || ''),
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
      shoppingListDoc = persistShoppingListDoc(
        {
          ...shoppingListDoc,
          rows: nextRows,
        },
        { skipRemoteSave: true },
      );
      flushShoppingListCheckedToSupabase(listCheckedRpc, {
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
            void runFavoriteEatsRemoteShoppingPlanRefresh();
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
          void runFavoriteEatsRemoteShoppingPlanRefresh();
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
            void runFavoriteEatsRemoteShoppingPlanRefresh();
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
          void runFavoriteEatsRemoteShoppingPlanRefresh();
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
        await awaitPersistShoppingStateToDataService({
          shoppingListDoc,
        });
        shoppingListDoc = getAuthoritativeShoppingListDoc();
      }
      clearShoppingListRowEditSession();
      renderChecklistWithHomeLocationRefresh();
    } finally {
      resolvingSourceConflicts = false;
    }
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
          id: 'shopping-list-sort-by',
          label: 'sort by',
          selectionMode: 'single',
          options: [
            { id: 'stores', label: 'store aisle' },
            { id: 'home', label: 'home location' },
          ],
          selectedOptionIds: new Set([
            shoppingListViewMode === 'home' ? 'home' : 'stores',
          ]),
          onToggleOption: (optionId) => {
            const nextMode = optionId === 'home' ? 'home' : 'stores';
            if (nextMode === shoppingListViewMode) return;
            shoppingListViewMode = nextMode;
            persistShoppingListViewMode(nextMode);
            collapsedShoppingListSections.clear();
            rerenderShoppingListFilterChips();
            renderChecklist();
          },
        },
        {
          id: 'shopping-list-completed-placement',
          label: 'checked item style',
          selectionMode: 'single',
          options: [
            { id: 'in-place', label: 'in place' },
            { id: 'grouped', label: 'grouped' },
          ],
          selectedOptionIds: new Set([
            shoppingListKeepCompletedInPlace ? 'in-place' : 'grouped',
          ]),
          onToggleOption: (optionId) => {
            const next = optionId === 'in-place';
            if (next === shoppingListKeepCompletedInPlace) return;
            shoppingListKeepCompletedInPlace = next;
            persistShoppingListKeepCompletedInPlace(next);
            collapsedShoppingListSections.clear();
            rerenderShoppingListFilterChips();
            renderChecklist();
          },
        },
      ],
      chipClassName: 'app-filter-chip',
    });
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
    shoppingListDoc = persistShoppingListDoc(
      { ...shoppingListDoc, rows: nextRows },
      remote ? { skipRemoteSave: true } : {},
    );
    if (remote) {
      await awaitPersistShoppingStateToDataService({ shoppingListDoc });
      shoppingListDoc = getAuthoritativeShoppingListDoc();
    }
    renderChecklistWithHomeLocationRefresh();
    uiToastUndo('All items restored.', () => {
      shoppingListDoc = persistShoppingListDoc(
        previousDoc,
        remote ? { skipRemoteSave: true } : {},
      );
      if (remote) {
        void (async () => {
          await awaitPersistShoppingStateToDataService({ shoppingListDoc });
          shoppingListDoc = getAuthoritativeShoppingListDoc();
          renderChecklistWithHomeLocationRefresh();
        })();
        return;
      }
      renderChecklistWithHomeLocationRefresh();
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
      const durableRowIdForRpc =
        String(row?.sourceKey || '').trim() || String(row?.id || '').trim();
      const isPendingChecked = pendingCheckedRowIds.has(String(row?.id || ''));
      li.classList.toggle(
        'shopping-list-doc-item--checked',
        !!row?.checked || isPendingChecked,
      );
      const sourceKey = String(row?.sourceKey || '').trim();
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
      checkbox.setAttribute(
        'aria-label',
        row?.checked || isPendingChecked ? 'Include item' : 'Exclude item',
      );
      checkbox.setAttribute(
        'aria-pressed',
        row?.checked || isPendingChecked ? 'true' : 'false',
      );
      const checkboxIcon = document.createElement('span');
      checkboxIcon.className = 'material-symbols-outlined';
      checkboxIcon.setAttribute('aria-hidden', 'true');
      checkboxIcon.textContent =
        row?.checked || isPendingChecked
          ? 'check_box'
          : 'check_box_outline_blank';
      checkbox.appendChild(checkboxIcon);
      checkbox.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const outcome = await resolveShoppingListDirtyRowEdits({
          message:
            'Changes to this item must be saved before it can be marked complete. Save your changes?',
        });
        if (outcome === 'cancelled') return;
        const useCheckedRpc =
          durableRowIdForRpc &&
          shouldUseRemoteShoppingState() &&
          typeof window.dataService?.setShoppingListRowChecked === 'function';
        updateRow(
          row.id,
          (draft) => {
            draft.checked = !draft.checked;
          },
          {
            message: row?.checked ? 'Item included.' : 'Item completed.',
            listCheckedRpc: useCheckedRpc
              ? {
                  rowId: durableRowIdForRpc,
                  checked: !row?.checked,
                }
              : null,
          },
        );
      });

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
      const rowIsListRemoved = !!row?.listRemoved;
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
        const dirtyOutcome = await resolveShoppingListDirtyRowEdits({
          message:
            'Changes to this item must be saved before it can be removed or restored. Save your changes?',
        });
        if (dirtyOutcome === 'cancelled') return;
        if (rowIsListRemoved) {
          const ok = await confirmShoppingListRowRestore(rowRemoveRestoreLabel);
          if (!ok) return;
          updateRow(
            row.id,
            (draft) => {
              applyShoppingListRowListRestore(draft);
            },
            {
              message: 'Item restored.',
              undoMessage: 'Restore undone.',
            },
          );
          return;
        }
        const ok = await confirmShoppingListRowRemove(rowRemoveRestoreLabel);
        if (!ok) return;
        updateRow(
          row.id,
          (draft) => {
            applyShoppingListRowListRemove(draft);
          },
          {
            message: 'Item removed.',
            undoMessage: 'Remove undone.',
          },
        );
      };
      li.addEventListener('click', handleRowRemoveRestoreGesture);
      li.addEventListener('contextmenu', handleRowRemoveRestoreGesture);

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
      title: 'Discard changes?',
      message:
        'This will remove all your edits and reset your shopping list to the quantities on your Recipes and Items lists.',
      confirmText: 'Discard',
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
      await awaitPersistShoppingStateToDataService({
        shoppingListDoc,
      });
      shoppingListDoc = getAuthoritativeShoppingListDoc();
    }
    clearShoppingListRowEditSession();
    collapsedShoppingListSections.clear();
    await refreshShoppingListHomeLocationCache();
    renderChecklist();
    uiToastUndo('Changes discarded.', () => {
      shoppingListDoc = persistShoppingListDoc(
        previousDoc,
        remote ? { skipRemoteSave: true } : {},
      );
      if (remote) {
        void (async () => {
          await awaitPersistShoppingStateToDataService({
            shoppingListDoc,
          });
          shoppingListDoc = getAuthoritativeShoppingListDoc();
          clearShoppingListRowEditSession();
          collapsedShoppingListSections.clear();
          await refreshShoppingListHomeLocationCache();
          renderChecklist();
          syncShoppingListResetButtonState();
          syncShoppingListUncheckAllButtonState();
        })();
        return;
      }
      clearShoppingListRowEditSession();
      collapsedShoppingListSections.clear();
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
    shoppingListDoc = persistShoppingListDoc(
      { ...shoppingListDoc, rows: nextRows },
      remote ? { skipRemoteSave: true } : {},
    );
    if (remote) {
      await awaitPersistShoppingStateToDataService({
        shoppingListDoc,
      });
      shoppingListDoc = getAuthoritativeShoppingListDoc();
    }
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
          await awaitPersistShoppingStateToDataService({
            shoppingListDoc,
          });
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
      shoppingListMonogramResetBtn.textContent = 'Discard changes';
      shoppingListMonogramResetBtn.addEventListener('click', () => {
        void handleShoppingListReset();
      });
    } else {
      shoppingListMonogramResetBtn.textContent = 'Discard changes';
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
  renderChecklist();
  fePageLoadFoodIconFinish();
  syncShoppingListCopyButtonState();
  syncShoppingListEditActionButtonsState();
  syncShoppingListExportButtonState();
  void resolvePendingSourceConflicts();

  registerFavoriteEatsRemotePlanUiRefreshHook(async () => {
    if (editingRowId || shoppingListRowDraftStorageHasAny()) return;
    if (getShoppingListRowDataRpcInFlight() > 0) return;
    let nextPlanRows;
    let nextRecipeSummaries;
    try {
      const maintainPlanRows = getFavoriteEatsInvalidationMaintainOut()?.planRows;
      nextPlanRows = Array.isArray(maintainPlanRows)
        ? maintainPlanRows
        : await getShoppingPlanSelectionRowsViaDataService({ db });
      nextRecipeSummaries =
        await getShoppingListSelectedRecipeSummaryRowsViaDataService({ db });
    } catch (err) {
      console.warn('shopping list plan refetch (realtime) failed:', err);
      return;
    }
    generatedPlanRows = nextPlanRows;
    selectedRecipeSummaryRows = nextRecipeSummaries;
    const authoritativeShoppingListDocForRealtime =
      getAuthoritativeShoppingListDoc();
    const sync = mergeShoppingListDocWithGenerated(
      authoritativeShoppingListDocForRealtime,
      getGeneratedShoppingListDoc(),
    );
    const mergedRealtimeNormalized = normalizeShoppingListDoc(sync.doc);
    const authoritativeRealtimeNormalized =
      authoritativeShoppingListDocForRealtime
        ? normalizeShoppingListDoc(authoritativeShoppingListDocForRealtime)
        : null;
    const skipRealtimeShoppingListRemoteSave =
      shouldUseRemoteShoppingState() &&
      authoritativeRealtimeNormalized &&
      Array.isArray(sync.conflicts) &&
      sync.conflicts.length === 0 &&
      JSON.stringify(mergedRealtimeNormalized) ===
        JSON.stringify(authoritativeRealtimeNormalized);
    shoppingListDoc = persistShoppingListDoc(sync.doc, {
      skipRemoteSave: skipRealtimeShoppingListRemoteSave,
    });
    pendingSourceConflicts = Array.isArray(sync.conflicts)
      ? sync.conflicts.slice()
      : [];
    clearShoppingListRowEditSession();
    shoppingListHomeLocationCache = { signature: '', map: null };
    await refreshShoppingListHomeLocationCache();
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
