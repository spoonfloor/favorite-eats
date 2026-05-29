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
  const SURFACE_FULL_PAGE = 'fullPage';

  /** @type {object|null} */
  let activeRecipeSession = null;

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

  function createRecipeSession(options = {}) {
    const recipeId = Math.trunc(Number(options.recipeId));
    const getModel =
      typeof options.getModel === 'function' ? options.getModel : () => null;
    const setModel =
      typeof options.setModel === 'function' ? options.setModel : null;

    let deferPaintDepth = 0;
    /** @type {Set<string>} */
    let pendingSurfaces = new Set();
    let paintScheduled = false;
    let paintGeneration = 0;

    const session = {
      kind: 'recipe',
      recipeId,
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
        if (deferPaintDepth > 0) return;
        queuePaint();
      },
      async commitPaint(opts = {}) {
        const surfaces = Array.isArray(opts.surfaces)
          ? opts.surfaces
          : [SURFACE_FULL_PAGE];
        surfaces.forEach((s) => {
          if (s) pendingSurfaces.add(String(s));
        });
        deferPaintDepth = 0;
        paintScheduled = false;
        await runPaint(pendingSurfaces);
        pendingSurfaces.clear();
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
      destroy() {
        if (activeRecipeSession === session) {
          activeRecipeSession = null;
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
      const wantsFull = surfaces.has(SURFACE_FULL_PAGE);
      const wantsIngredients =
        wantsFull || surfaces.has(SURFACE_INGREDIENTS);
      const wantsYwn = wantsFull || surfaces.has(SURFACE_YOU_WILL_NEED);

      if (gen !== paintGeneration) return;

      if (wantsFull && typeof global.renderRecipe === 'function') {
        const model = getModel();
        if (model) {
          global.renderRecipe(model);
        }
        return;
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

      if (gen !== paintGeneration) return;

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
    }

    if (activeRecipeSession) {
      try {
        activeRecipeSession.destroy();
      } catch (_) {}
    }
    activeRecipeSession = session;
    return session;
  }

  function getActiveRecipeSession() {
    return activeRecipeSession;
  }

  global.favoriteEatsDocumentSession = {
    SURFACE_INGREDIENTS,
    SURFACE_YOU_WILL_NEED,
    SURFACE_FULL_PAGE,
    createRecipeSession,
    getActiveRecipeSession,
    stashCatalogVariantPurgedPatch,
    consumePendingCatalogVariantPurges,
  };
})(typeof window !== 'undefined' ? window : globalThis);
