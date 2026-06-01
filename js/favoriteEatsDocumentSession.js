/**
 * favoriteEatsDocumentSession — coordinated model + derived-view paints.
 *
 * Patient zero: recipe editor (`kind: 'recipe'`). Other document kinds can adopt
 * the same contract without changing this module's shape.
 */
(function favoriteEatsDocumentSessionModule(global) {
  if (!global) return;

  const SURFACE_INGREDIENTS = 'ingredients';
  const SURFACE_YOU_WILL_NEED = 'youWillNeed';
  const SURFACE_INSTRUCTIONS = 'instructions';
  const SURFACE_FULL_PAGE = 'fullPage';

  /** @type {object|null} */
  let activeRecipeSession = null;
  const activeSessionsByKind = new Map();

  /** @type {Array<{ ingredientId: number, variantName: string, ingredientName?: string }>} */
  let pendingCatalogVariantPurges = [];

  function normalizeVariantKey(variantName) {
    return String(variantName || '').trim().toLowerCase();
  }

  function stashCatalogVariantPurgedPatch(patch) {
    const ingredientId = Math.trunc(Number(patch && patch.ingredientId));
    const variantName = String(patch && patch.variantName || '').trim();
    if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !variantName) {
      return;
    }
    pendingCatalogVariantPurges.push({
      ingredientId,
      variantName,
      ingredientName:
        patch && typeof patch.ingredientName === 'string'
          ? patch.ingredientName.trim()
          : '',
    });
    if (pendingCatalogVariantPurges.length > 32) {
      pendingCatalogVariantPurges = pendingCatalogVariantPurges.slice(-32);
    }
  }

  function consumePendingCatalogVariantPurges() {
    const out = pendingCatalogVariantPurges.slice();
    pendingCatalogVariantPurges = [];
    return out;
  }

  function createDocumentSession(options = {}) {
    const kind = String(options.kind || '').trim();
    const getModel =
      typeof options.getModel === 'function' ? options.getModel : () => null;
    const setModel =
      typeof options.setModel === 'function' ? options.setModel : null;
    const defaultSurface =
      typeof options.defaultSurface === 'string'
        ? options.defaultSurface
        : SURFACE_FULL_PAGE;
    const paintSurfaces =
      typeof options.paintSurfaces === 'function'
        ? options.paintSurfaces
        : null;
    const shouldReplacePendingOnCommit =
      typeof options.shouldReplacePendingOnCommit === 'function'
        ? options.shouldReplacePendingOnCommit
        : () => false;
    const notePaintedSurfaces =
      typeof options.notePaintedSurfaces === 'function'
        ? options.notePaintedSurfaces
        : null;
    const onCommitComplete =
      typeof options.onCommitComplete === 'function'
        ? options.onCommitComplete
        : null;

    let deferPaintDepth = 0;
    /** @type {Set<string>} */
    let pendingSurfaces = new Set();
    let paintScheduled = false;
    let paintGeneration = 0;

    const session = {
      kind,
      getModel,
      setModel,
      isPaintDeferred() {
        return deferPaintDepth > 0;
      },
      beginDeferPaint() {
        deferPaintDepth += 1;
      },
      endDeferPaint() {
        deferPaintDepth = Math.max(0, deferPaintDepth - 1);
      },
      abortDeferPaint() {
        deferPaintDepth = 0;
        pendingSurfaces.clear();
        paintScheduled = false;
      },
      schedulePaint(surfaces) {
        const list = Array.isArray(surfaces) ? surfaces : [surfaces];
        list.forEach((s) => {
          if (s) pendingSurfaces.add(String(s));
        });
        if (typeof global.fePaintProbeLog === 'function') {
          global.fePaintProbeLog('schedulePaint', {
            surfaces: list.map(String),
            deferred: deferPaintDepth > 0,
            pending: [...pendingSurfaces],
          });
        }
        if (deferPaintDepth > 0) return;
        queuePaint();
      },
      async commitPaint(opts = {}) {
        const reason = typeof opts.reason === 'string' ? opts.reason : '';
        const requestedSurfaces = Array.isArray(opts.surfaces)
          ? opts.surfaces
          : opts.surfaces === undefined
            ? null
            : [defaultSurface];
        const surfaces =
          requestedSurfaces === null ? [defaultSurface] : requestedSurfaces;
        const replacePending = !!shouldReplacePendingOnCommit(reason, session);
        const pendingBefore = replacePending ? [] : [...pendingSurfaces];

        if (replacePending) {
          pendingSurfaces.clear();
          deferPaintDepth = 0;
          paintScheduled = false;
          if (!surfaces.length) {
            if (onCommitComplete) onCommitComplete(reason, session);
            if (typeof global.fePaintProbeLog === 'function') {
              global.fePaintProbeLog('commitPaint:noop', { reason });
            }
            return;
          }
          surfaces.forEach((s) => {
            if (s) pendingSurfaces.add(String(s));
          });
        } else {
          surfaces.forEach((s) => {
            if (s) pendingSurfaces.add(String(s));
          });
        }

        if (typeof global.fePaintProbeLog === 'function') {
          global.fePaintProbeLog('commitPaint:enter', {
            reason,
            requestedSurfaces: surfaces.map(String),
            pendingBefore,
            pendingAfter: [...pendingSurfaces],
          });
        }
        deferPaintDepth = 0;
        paintScheduled = false;
        if (!pendingSurfaces.size) {
          pendingSurfaces.clear();
          if (typeof global.fePaintProbeLog === 'function') {
            global.fePaintProbeLog('commitPaint:noop', { reason });
          }
          return;
        }
        await runPaint(pendingSurfaces);
        pendingSurfaces.clear();
        if (onCommitComplete) onCommitComplete(reason, session);
        if (typeof global.fePaintProbeLog === 'function') {
          global.fePaintProbeLog('commitPaint:done', { reason });
        }
      },
      destroy() {
        if (kind && activeSessionsByKind.get(kind) === session) {
          activeSessionsByKind.delete(kind);
        }
      },
    };

    function queuePaint() {
      if (paintScheduled) return;
      paintScheduled = true;
      const run = () => {
        paintScheduled = false;
        if (deferPaintDepth > 0) return;
        const surfaces = new Set(pendingSurfaces);
        pendingSurfaces.clear();
        if (!surfaces.size) return;
        void runPaint(surfaces);
      };
      try {
        if (typeof global.requestAnimationFrame === 'function') {
          global.requestAnimationFrame(run);
        } else {
          global.setTimeout(run, 0);
        }
      } catch (_) {
        global.setTimeout(run, 0);
      }
    }

    async function runPaint(surfaces) {
      const gen = (paintGeneration += 1);

      if (typeof global.fePaintProbeLog === 'function') {
        global.fePaintProbeLog('runPaint:start', {
          gen,
          kind,
          surfaces: [...surfaces],
        });
      }

      if (gen !== paintGeneration) return;
      let branch = '';
      if (paintSurfaces) {
        branch =
          (await paintSurfaces({
            session,
            surfaces,
            isCurrent: () => gen === paintGeneration,
          })) || '';
      }
      if (gen !== paintGeneration) return;

      if (notePaintedSurfaces) {
        notePaintedSurfaces({ session, surfaces });
      }

      if (typeof global.fePaintProbeLog === 'function') {
        global.fePaintProbeLog('runPaint:done', {
          gen,
          kind,
          surfaces: [...surfaces],
          branch,
        });
      }
    }

    if (kind && activeSessionsByKind.has(kind)) {
      try {
        activeSessionsByKind.get(kind).destroy();
      } catch (_) {}
    }
    if (kind) activeSessionsByKind.set(kind, session);
    return session;
  }

  function noteRecipePaintedDisplayKeys(session, getModel, surfaces) {
    const model = getModel();
    if (!model) return;
    const painted = surfaces;
    const updateIng =
      !painted ||
      painted.has(SURFACE_FULL_PAGE) ||
      painted.has(SURFACE_INGREDIENTS);
    const updateYwn =
      !painted ||
      painted.has(SURFACE_FULL_PAGE) ||
      painted.has(SURFACE_YOU_WILL_NEED);
    if (
      updateIng &&
      typeof global.recipeEditorIngredientListDisplayKey === 'function'
    ) {
      session._lastPaintedIngredientDisplayKey =
        global.recipeEditorIngredientListDisplayKey(model);
    }
    if (updateYwn && typeof global.recipeEditorYwnContentKey === 'function') {
      session._lastPaintedYwnContentKey =
        global.recipeEditorYwnContentKey(model);
    }
  }

  async function paintRecipeSessionSurfaces(session, surfaces, isCurrent) {
    const wantsFull = surfaces.has(SURFACE_FULL_PAGE);
    const wantsIngredients =
      wantsFull || surfaces.has(SURFACE_INGREDIENTS);
    const wantsYwn = wantsFull || surfaces.has(SURFACE_YOU_WILL_NEED);
    const wantsInstructions =
      wantsFull || surfaces.has(SURFACE_INSTRUCTIONS);

    if (wantsFull && typeof global.renderRecipe === 'function') {
      const model = session.getModel();
      if (model) {
        global.renderRecipe(model, { syncDerivedSurfaces: true });
      }
      if (!isCurrent()) return 'fullPage';
      if (
        wantsYwn &&
        typeof global.recipeEditorRerenderYouWillNeedFromModelAsync ===
          'function'
      ) {
        await global.recipeEditorRerenderYouWillNeedFromModelAsync();
      }
      return 'fullPage';
    }

    if (
      wantsInstructions &&
      !wantsFull &&
      typeof global.renderRecipe === 'function'
    ) {
      const model = session.getModel();
      if (model) {
        global.renderRecipe(model, { resyncInstructions: true });
      }
    }

    if (
      wantsIngredients &&
      typeof global.recipeEditorRerenderIngredientsFromModel === 'function'
    ) {
      global.recipeEditorRerenderIngredientsFromModel({
        syncYouWillNeed: false,
        skipDocumentSessionQueue: true,
      });
    }

    if (!isCurrent()) return 'partial';

    if (wantsYwn) {
      if (
        typeof global.recipeEditorRerenderYouWillNeedFromModelAsync ===
        'function'
      ) {
        await global.recipeEditorRerenderYouWillNeedFromModelAsync();
      } else if (
        typeof global.recipeEditorRerenderYouWillNeedFromModel === 'function'
      ) {
        global.recipeEditorRerenderYouWillNeedFromModel();
      }
    }

    return 'partial';
  }

  function createRecipeSession(options = {}) {
    const recipeId = Math.trunc(Number(options.recipeId));
    const getModel =
      typeof options.getModel === 'function' ? options.getModel : () => null;
    const setModel =
      typeof options.setModel === 'function' ? options.setModel : null;

    let session = null;
    session = createDocumentSession({
      kind: 'recipe',
      getModel,
      setModel,
      defaultSurface: SURFACE_FULL_PAGE,
      shouldReplacePendingOnCommit: (reason) => reason === 'save',
      onCommitComplete: (reason) => {
        if (reason === 'save' && session) {
          session.markSaveCommitPaintComplete();
        }
      },
      notePaintedSurfaces: ({ surfaces }) => {
        noteRecipePaintedDisplayKeys(session, getModel, surfaces);
      },
      paintSurfaces: ({ surfaces, isCurrent }) =>
        paintRecipeSessionSurfaces(session, surfaces, isCurrent),
    });

    Object.assign(session, {
      recipeId,
      _lastPaintedIngredientDisplayKey: '',
      _lastPaintedYwnContentKey: '',
      _saveOwnedCatalogReloadPending: false,
      markSaveCommitPaintComplete() {
        session._saveOwnedCatalogReloadPending = true;
      },
      consumeSaveOwnedCatalogReload() {
        const pending = session._saveOwnedCatalogReloadPending;
        session._saveOwnedCatalogReloadPending = false;
        return pending;
      },
      notePaintedDisplayKeys(opts = {}) {
        noteRecipePaintedDisplayKeys(session, getModel, opts.surfaces);
      },
      applyCatalogVariantPurgedPatch(patch, matchContext = {}) {
        const model = getModel();
        if (!model || !Array.isArray(model.sections)) return false;

        const ingredientId = Math.trunc(Number(patch && patch.ingredientId));
        const variantKey = normalizeVariantKey(patch && patch.variantName);
        if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !variantKey) {
          return false;
        }

        const ingredientNameHint = String(
          patch && patch.ingredientName ? patch.ingredientName : '',
        )
          .trim()
          .toLowerCase();

        const getVisibleCanonicalId =
          typeof matchContext.getVisibleCanonicalId === 'function'
            ? matchContext.getVisibleCanonicalId
            : null;

        const rowMatchesIngredient = (row) => {
          if (!row || row.rowType === 'heading' || row.isPlaceholder) return false;
          const variant = normalizeVariantKey(row.variant);
          if (variant !== variantKey) return false;
          if (ingredientNameHint) {
            const rowName = String(row.name || '')
              .trim()
              .toLowerCase();
            if (rowName === ingredientNameHint) return true;
          }
          if (getVisibleCanonicalId) {
            const canonicalId = Number(getVisibleCanonicalId(row.name));
            if (
              Number.isFinite(canonicalId) &&
              canonicalId > 0 &&
              canonicalId === ingredientId
            ) {
              return true;
            }
          }
          return false;
        };

        let changed = false;
        model.sections.forEach((sec) => {
          const rows = Array.isArray(sec?.ingredients) ? sec.ingredients : [];
          rows.forEach((row) => {
            if (!rowMatchesIngredient(row)) return;
            if (String(row.variant || '').trim() !== '') {
              row.variant = '';
              changed = true;
            }
            if (row.variantDeprecated) {
              row.variantDeprecated = false;
              changed = true;
            }
          });
          rows.forEach((row) => {
            if (!row || !Array.isArray(row.substitutes)) return;
            row.substitutes.forEach((sub) => {
              if (!sub) return;
              if (normalizeVariantKey(sub.variant) !== variantKey) return;
              if (ingredientNameHint) {
                const subName = String(sub.name || row.name || '')
                  .trim()
                  .toLowerCase();
                if (subName && subName !== ingredientNameHint) return;
              }
              if (String(sub.variant || '').trim() !== '') {
                sub.variant = '';
                changed = true;
              }
            });
          });
        });

        return changed;
      },
    });

    const destroyDocumentSession = session.destroy;
    session.destroy = () => {
      try {
        destroyDocumentSession.call(session);
      } catch (_) {}
      if (activeRecipeSession === session) {
        activeRecipeSession = null;
      }
    };
    activeRecipeSession = session;
    return session;
  }

  function getActiveRecipeSession() {
    return activeRecipeSession;
  }

  function getActiveSession(kind) {
    const key = String(kind || '').trim();
    return key ? activeSessionsByKind.get(key) || null : null;
  }

  global.favoriteEatsDocumentSession = {
    SURFACE_INGREDIENTS,
    SURFACE_YOU_WILL_NEED,
    SURFACE_INSTRUCTIONS,
    SURFACE_FULL_PAGE,
    createSession: createDocumentSession,
    createRecipeSession,
    getActiveSession,
    getActiveRecipeSession,
    stashCatalogVariantPurgedPatch,
    consumePendingCatalogVariantPurges,
  };
})(typeof window !== 'undefined' ? window : globalThis);
