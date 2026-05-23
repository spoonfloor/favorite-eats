/**
 * Recipe editor page UI (Slice 7 phase 2).
 */
(function favoriteEatsRecipeEditorPageModule(global) {
  if (!global) return;

  /** @type {object|null} */
  let deps = null;

  function registerFavoriteEatsRecipeEditorPageDeps(nextDeps) {
    deps = nextDeps && typeof nextDeps === 'object' ? nextDeps : null;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error('favoriteEatsRecipeEditorPage deps are not registered.');
    }
    return deps;
  }

  async function loadRecipeEditorPage() {
  const {
    fePageLoadFoodIconBegin,
    fePageLoadFoodIconFail,
    fePageLoadFoodIconFinish,
    favoriteEatsFormatRecipeTitleForDisplay,
    uiToast,
    favoriteEatsHrefWithCurrentAdapter,
    openFavoriteEatsDbForCurrentRuntime,
    shouldUseRemoteShoppingState,
    hydrateShoppingStateFromDataService,
    ensureIngredientLemmaMaintenanceInMain,
    isPlannerModeEnabled,
    ensureRecipeTagsSchemaInMain,
    ensureIngredientVariantTagsSchemaInMain,
    ensureSizesSchemaInMain,
    ensureUnitsSchemaInMain,
    favoriteEatsShouldUseSupabaseDataDoor,
    initAppBar,
    resolveUnknownIngredientNames,
    resolveUnknownIngredientVariants,
    resolveUnknownUnitCodes,
    resolveUnknownSizeNames,
    resolveUnknownTagNames,
    normalizeRecipeTagDraftList,
    persistBinaryArrayInMain,
    refreshFavoriteEatsCatalogMetricFlags,
    hydrateRecipeIngredientMetricFlags,
    setAppBarTextActionLabel,
  } = requireDeps();
  fePageLoadFoodIconBegin('recipe-editor');
  const formatRecipeTitleForDisplay =
    global.favoriteEatsFormatRecipeTitleForDisplay ||
    favoriteEatsFormatRecipeTitleForDisplay;
  const recipeId = sessionStorage.getItem('selectedRecipeId');
  const isNewRecipe = sessionStorage.getItem('selectedRecipeIsNew') === '1';
  const shouldUseSupabaseAdapter = favoriteEatsShouldUseSupabaseDataDoor();
  const isRecipePlannerMode = isPlannerModeEnabled();

  if (!recipeId) {
    fePageLoadFoodIconFail();
    uiToast('No recipe selected.');
    window.location.href = favoriteEatsHrefWithCurrentAdapter('recipes.html');
    return;
  }

  let db;
  if (!shouldUseSupabaseAdapter) {
    try {
      db = await openFavoriteEatsDbForCurrentRuntime();
    } catch (err) {
      fePageLoadFoodIconFail();
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = favoriteEatsHrefWithCurrentAdapter('index.html');
      return;
    }
  }

  window.dbInstance = db || null;
  // UI reads and writes through the Supabase data service door.
  if (window.dataService) {
    if (db && typeof window.dataService.setSqliteDb === 'function') {
      window.dataService.setSqliteDb(db);
    }
    if (shouldUseSupabaseAdapter) {
      window.dataService.useSupabase = true;
      console.info('[dataService] using Supabase adapter');
    }
  }
  if (
    typeof window.refreshIngredientPasteParserUnitRegistry === 'function'
  ) {
    try {
      await window.refreshIngredientPasteParserUnitRegistry();
    } catch (_) {}
  }
  if (isRecipePlannerMode && shouldUseRemoteShoppingState()) {
    try {
      await hydrateShoppingStateFromDataService();
    } catch (hydrateErr) {
      console.warn(
        'Recipe editor: could not load plan/list from server:',
        hydrateErr,
      );
    }
  }
  if (db) {
    await ensureIngredientLemmaMaintenanceInMain(db);
  } else if (shouldUseSupabaseAdapter && window.dataService) {
    await ensureIngredientLemmaMaintenanceInMain(null);
  }
  window.recipeId = recipeId;
  if (db) {
    ensureRecipeTagsSchemaInMain(db);
    ensureIngredientVariantTagsSchemaInMain(db);
    ensureSizesSchemaInMain(db);
    ensureUnitsSchemaInMain(db);
  }

  // Notes are recipe-level (stored on recipe_ingredient_map), not shopping-item-level.
  // Ensure the DB has the right column and backfill once for legacy DBs.
  try {
    if (
      window.bridge &&
      typeof bridge.ensureRecipeIngredientMapParentheticalNoteSchema ===
        'function'
    ) {
      if (db) bridge.ensureRecipeIngredientMapParentheticalNoteSchema(db);
    }
  } catch (_) {}

  // Read recipe via the data service door (see js/data/contracts/loadRecipeDetail.md).
  let recipe;
  if (
    shouldUseSupabaseAdapter &&
    window.favoriteEatsRecipeEditorScreen &&
    typeof window.favoriteEatsRecipeEditorScreen.bootstrapRecipeEditorHub ===
      'function'
  ) {
    const boot =
      await window.favoriteEatsRecipeEditorScreen.bootstrapRecipeEditorHub(
        recipeId,
        { shouldUseSupabase: true },
      );
    if (!boot.ok && boot.error) {
      console.error('dataService.loadRecipeDetail failed:', boot.error);
      fePageLoadFoodIconFail();
      uiToast('Failed to load recipe.');
      window.location.href = favoriteEatsHrefWithCurrentAdapter('recipes.html');
      return;
    }
    recipe = boot.recipe;
  } else {
    try {
      recipe = await window.dataService.loadRecipeDetail(recipeId);
    } catch (err) {
      console.error('dataService.loadRecipeDetail failed:', err);
      fePageLoadFoodIconFail();
      uiToast('Failed to load recipe.');
      window.location.href = favoriteEatsHrefWithCurrentAdapter('recipes.html');
      return;
    }
  }

  if (!recipe) {
    fePageLoadFoodIconFail();
    uiToast('Recipe not found.');
    window.location.href = favoriteEatsHrefWithCurrentAdapter('recipes.html');
    return;
  }
  try {
    sessionStorage.removeItem('selectedRecipeTitle');
  } catch (_) {}
  // Compatibility shim for existing UI

  if (
    !recipe.servingsDefault &&
    recipe.servings &&
    recipe.servings.default != null
  ) {
    recipe.servingsDefault = recipe.servings.default;
  }

  // Decide when to seed placeholder rows:
  // - brand-new recipes (fresh from "Add")
  // - OR recipes that currently have no steps and no ingredients at all
  const hasAnySteps =
    (Array.isArray(recipe.sections) &&
      recipe.sections.some(
        (section) => Array.isArray(section.steps) && section.steps.length > 0,
      )) ||
    (Array.isArray(recipe.steps) && recipe.steps.length > 0);

  const hasAnyIngredients =
    Array.isArray(recipe.sections) &&
    recipe.sections.some(
      (section) =>
        Array.isArray(section.ingredients) && section.ingredients.length > 0,
    );

  // 🔍 Decide seeding separately for steps vs ingredients.
  // - Steps placeholder any time there are zero steps so the editor can
  //   recover from missing-instruction recipes without user action.
  // - Ingredient placeholder any time there are zero ingredients, even if steps exist
  //   (e.g., user edited title + saved but never added ingredients).
  const shouldSeedStepPlaceholder =
    !isRecipePlannerMode && (isNewRecipe || !hasAnySteps);

  const shouldSeedIngredientPlaceholder =
    !isRecipePlannerMode && !hasAnyIngredients;

  if (shouldSeedStepPlaceholder || shouldSeedIngredientPlaceholder) {
    if (isNewRecipe) {
      // One-shot flag: once we've initialized a brand-new recipe,
      // we don't treat it as "new" again on future opens.
      sessionStorage.removeItem('selectedRecipeIsNew');
    }

    if (!Array.isArray(recipe.sections) || recipe.sections.length === 0) {
      recipe.sections = [
        {
          ID: null,
          id: null,
          name: '',
          steps: [],
          ingredients: [],
        },
      ];
    }

    const firstSection = recipe.sections[0];

    // Ensure at least one placeholder step when a recipe has no steps at all.
    if (
      shouldSeedStepPlaceholder &&
      (!Array.isArray(firstSection.steps) || firstSection.steps.length === 0)
    ) {
      const tempId = `tmp-step-${Date.now()}`;
      firstSection.steps = [
        {
          ID: null,
          id: tempId,
          section_id: firstSection.ID ?? firstSection.id ?? null,
          step_number: 1,
          instructions: '',
          type: 'step',
        },
      ];
    }

    // Allow empty ingredient arrays; UI provides an add CTA instead of data placeholders.
  }

  if (
    isRecipePlannerMode &&
    typeof window.recipePlannerModePrimeRecipe === 'function'
  ) {
    window.recipePlannerModePrimeRecipe(recipe);
  }

  // --- On load/return: keep ingredient order as loaded ---
  try {
    if (typeof window.recipeEditorSortIngredientsOnLoad === 'function') {
      window.recipeEditorSortIngredientsOnLoad(recipe);
    }
  } catch (err) {
    console.warn('⚠️ Ingredient load-order normalization failed:', err);
  }

  const titleEl = document.getElementById('recipeTitle');
  if (titleEl) titleEl.textContent = formatRecipeTitleForDisplay(recipe.title);

  const canSaveRecipe =
    !isRecipePlannerMode &&
    (!!db ||
      (window.dataService && window.dataService.activeAdapter === 'supabase'));

  // Shared app bar for recipe editor
  initAppBar({
    mode: 'editor',
    titleText: formatRecipeTitleForDisplay(recipe.title),
    showCancel: true,
    showSave: canSaveRecipe,
    cancelText: isRecipePlannerMode ? 'Reset servings' : 'Cancel',
    onBack: () => {
      const goRecipes = () => {
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('recipes.html');
      };
      if (
        !isRecipePlannerMode &&
        typeof window.recipeEditorAttemptExit === 'function'
      ) {
        void window.recipeEditorAttemptExit({
          reason: 'back',
          onClean: goRecipes,
          onDiscard: goRecipes,
          onSaveSuccess: goRecipes,
        });
        return;
      }
      goRecipes();
    },
    onCancel: () => {
      if (isRecipePlannerMode) {
        if (typeof window.recipePlannerModeResetServings === 'function') {
          window.recipePlannerModeResetServings(window.recipeData || recipe);
        }
        return;
      }
      if (typeof revertChanges === 'function') {
        revertChanges();
      }
    },
    onSave: (window.recipeEditorSave = async () => {
      // Recipe editor SoT: the live model (`window.recipeData.title`).
      // The app-bar title is a view; it may lag if the user edited the in-page title.
      const modelTitle = (window.recipeData?.title || '').trim();
      const el = document.getElementById('appBarTitle');
      const next = (modelTitle || el?.textContent || '').trim();
      if (!next) return;

      // Keep in-memory model + visible title in sync
      recipe.title = next;
      if (window.recipeData) window.recipeData.title = next;
      if (el) el.textContent = formatRecipeTitleForDisplay(next);
      const titleEl = document.getElementById('recipeTitle');
      if (titleEl) titleEl.textContent = formatRecipeTitleForDisplay(next);

      if (typeof window.recipeEditorFlushPendingEditorsForSave === 'function') {
        try {
          await window.recipeEditorFlushPendingEditorsForSave();
        } catch (flushErr) {
          console.warn(
            'recipeEditorFlushPendingEditorsForSave failed:',
            flushErr,
          );
        }
      }

      // Real save path (DB + persist-to-disk/localStorage), reusing existing helpers
      try {
        try {
          const db = window.dbInstance;
          const recipeModel = window.recipeData;
          if (recipeModel && Array.isArray(recipeModel.sections)) {
            let ingHelpers = null;
            let unitHelpers = null;
            let tagHelpers = null;
            let sizeHelpers = null;
            let variantHelpers = null;

            if (
              favoriteEatsShouldUseSupabaseDataDoor() &&
              window.dataService &&
              typeof window.dataService.buildRecipeEditorPreflightHelpers ===
                'function'
            ) {
              try {
                window.dataService.useSupabase = true;
                const bundle =
                  await window.dataService.buildRecipeEditorPreflightHelpers();
                ingHelpers = bundle.ingredient;
                unitHelpers = bundle.unit;
                tagHelpers = bundle.tag;
                sizeHelpers = bundle.size;
                variantHelpers = bundle.variant;
              } catch (preflightErr) {
                console.error(
                  'buildRecipeEditorPreflightHelpers failed:',
                  preflightErr,
                );
              }
            }

            if (
              ingHelpers &&
              unitHelpers &&
              tagHelpers &&
              sizeHelpers &&
              variantHelpers
            ) {
              const { getVisibleCanonicalId, anyIngredientNamed } = ingHelpers;
              const { anySelectableUnitCoded } = unitHelpers;
              const { anyVisibleTagNamed } = tagHelpers;
              const { anySelectableSizeNamed } = sizeHelpers;
              const {
                hasVariantTable: hasIngredientVariantTable,
                getIngredientNameById,
                anyVariantForIngredient,
                ensureVariantForIngredient,
              } = variantHelpers;
              const unknownUnique = [];
              const seenUnknown = new Set();
              recipeModel.sections.forEach((sec) => {
                const rows = Array.isArray(sec?.ingredients)
                  ? sec.ingredients
                  : [];
                rows.forEach((row) => {
                  if (!row || row.isPlaceholder || row.rowType === 'heading')
                    return;
                  const linkedRecipeId = Number(row.linkedRecipeId);
                  const currentRecipeId = Number(recipeModel.id);
                  const isLinkedSubrecipe =
                    !!row.isRecipe &&
                    Number.isFinite(linkedRecipeId) &&
                    linkedRecipeId > 0 &&
                    (!Number.isFinite(currentRecipeId) ||
                      linkedRecipeId !== currentRecipeId);
                  if (isLinkedSubrecipe) return;
                  const rawName = String(row.name || '').trim();
                  if (!rawName) return;
                  if (getVisibleCanonicalId(rawName)) return;
                  if (anyIngredientNamed(rawName)) return;
                  const key = rawName.toLowerCase();
                  if (seenUnknown.has(key)) return;
                  seenUnknown.add(key);
                  unknownUnique.push(rawName);
                });
              });

              if (unknownUnique.length) {
                const resolved = await resolveUnknownIngredientNames({
                  db,
                  names: unknownUnique,
                  title: `New ingredients (${unknownUnique.length})`,
                  message:
                    unknownUnique.length === 1
                      ? 'This ingredient is not in your database. Edit, match it to an existing ingredient, or save it as a new one.'
                      : 'These ingredients are not in your database. Edit, match them to existing ingredients, or save them as new ones.',
                });
                if (!resolved) {
                  uiToast('Save cancelled.');
                  return;
                }
                const replacementMap = resolved.map;
                recipeModel.sections.forEach((sec) => {
                  const rows = Array.isArray(sec?.ingredients)
                    ? sec.ingredients
                    : [];
                  rows.forEach((row) => {
                    if (!row || row.isPlaceholder || row.rowType === 'heading')
                      return;
                    const key = String(row.name || '')
                      .trim()
                      .toLowerCase();
                    if (!key) return;
                    const nextName = replacementMap.get(key);
                    if (nextName) row.name = nextName;
                  });
                });
                if (
                  typeof window.recipeEditorRerenderIngredientsFromModel ===
                  'function'
                ) {
                  window.recipeEditorRerenderIngredientsFromModel();
                }
              }

              if (hasIngredientVariantTable) {
                const unknownVariantUnique = [];
                const seenUnknownVariants = new Set();
                recipeModel.sections.forEach((sec) => {
                  const rows = Array.isArray(sec?.ingredients)
                    ? sec.ingredients
                    : [];
                  rows.forEach((row) => {
                    if (!row || row.isPlaceholder || row.rowType === 'heading')
                      return;
                    const linkedRecipeId = Number(row.linkedRecipeId);
                    const currentRecipeId = Number(recipeModel.id);
                    const isLinkedSubrecipe =
                      !!row.isRecipe &&
                      Number.isFinite(linkedRecipeId) &&
                      linkedRecipeId > 0 &&
                      (!Number.isFinite(currentRecipeId) ||
                        linkedRecipeId !== currentRecipeId);
                    if (isLinkedSubrecipe) return;
                    const rawName = String(row.name || '').trim();
                    const rawVariant = String(row.variant || '').trim();
                    if (!rawName || !rawVariant) return;
                    const ingredientId = Number(getVisibleCanonicalId(rawName));
                    if (!Number.isFinite(ingredientId) || ingredientId <= 0)
                      return;
                    if (anyVariantForIngredient(ingredientId, rawVariant))
                      return;
                    const key = `${ingredientId}::${rawVariant.toLowerCase()}`;
                    if (seenUnknownVariants.has(key)) return;
                    seenUnknownVariants.add(key);
                    unknownVariantUnique.push({
                      ingredientId,
                      ingredientName:
                        getIngredientNameById(ingredientId) || rawName,
                      variant: rawVariant,
                    });
                  });
                });
                if (unknownVariantUnique.length) {
                  const resolvedVariants =
                    await resolveUnknownIngredientVariants({
                      db,
                      variantLookup: variantHelpers,
                      entries: unknownVariantUnique,
                    });
                  if (!resolvedVariants) {
                    uiToast('Save cancelled.');
                    return;
                  }
                  const variantReplacementMap = resolvedVariants.map;
                  recipeModel.sections.forEach((sec) => {
                    const rows = Array.isArray(sec?.ingredients)
                      ? sec.ingredients
                      : [];
                    rows.forEach((row) => {
                      if (
                        !row ||
                        row.isPlaceholder ||
                        row.rowType === 'heading'
                      )
                        return;
                      const rawName = String(row.name || '').trim();
                      const rawVariant = String(row.variant || '').trim();
                      if (!rawName || !rawVariant) return;
                      const ingredientId = Number(
                        getVisibleCanonicalId(rawName),
                      );
                      if (!Number.isFinite(ingredientId) || ingredientId <= 0)
                        return;
                      const key = `${ingredientId}::${rawVariant.toLowerCase()}`;
                      const nextVariant = String(
                        variantReplacementMap.get(key) || '',
                      ).trim();
                      if (nextVariant) row.variant = nextVariant;
                    });
                  });
                  if (
                    typeof window.recipeEditorRerenderIngredientsFromModel ===
                    'function'
                  ) {
                    window.recipeEditorRerenderIngredientsFromModel();
                  }
                }

                const ensuredVariantKeys = new Set();
                for (const sec of recipeModel.sections) {
                  const rows = Array.isArray(sec?.ingredients)
                    ? sec.ingredients
                    : [];
                  for (const row of rows) {
                    if (!row || row.isPlaceholder || row.rowType === 'heading')
                      continue;
                    const rawName = String(row.name || '').trim();
                    const rawVariant = String(row.variant || '').trim();
                    if (!rawName || !rawVariant) continue;
                    const ingredientId = Number(getVisibleCanonicalId(rawName));
                    if (!Number.isFinite(ingredientId) || ingredientId <= 0)
                      continue;
                    const key = `${ingredientId}::${rawVariant.toLowerCase()}`;
                    if (ensuredVariantKeys.has(key)) continue;
                    ensuredVariantKeys.add(key);
                    if (!anyVariantForIngredient(ingredientId, rawVariant)) {
                      await Promise.resolve(
                        ensureVariantForIngredient(ingredientId, rawVariant),
                      );
                    }
                  }
                }
              }

              const unknownUnitUnique = [];
              const seenUnknownUnits = new Set();
              recipeModel.sections.forEach((sec) => {
                const rows = Array.isArray(sec?.ingredients)
                  ? sec.ingredients
                  : [];
                rows.forEach((row) => {
                  if (!row || row.isPlaceholder || row.rowType === 'heading')
                    return;
                  const rawUnit = String(row.unit || '').trim();
                  if (!rawUnit) return;
                  const key = rawUnit.toLowerCase();
                  if (seenUnknownUnits.has(key)) return;
                  seenUnknownUnits.add(key);
                  if (anySelectableUnitCoded(rawUnit)) return;
                  unknownUnitUnique.push(rawUnit);
                });
              });
              if (unknownUnitUnique.length) {
                const resolvedUnits = await resolveUnknownUnitCodes({
                  db,
                  units: unknownUnitUnique,
                  title: `New units (${unknownUnitUnique.length})`,
                  message:
                    unknownUnitUnique.length === 1
                      ? 'This unit is not in your database. Edit, match it to an existing unit, or save it as a new one.'
                      : 'These units are not in your database. Edit, match them to existing units, or save them as new ones.',
                });
                if (!resolvedUnits) {
                  uiToast('Save cancelled.');
                  return;
                }
                const replacementMap = resolvedUnits.map;
                recipeModel.sections.forEach((sec) => {
                  const rows = Array.isArray(sec?.ingredients)
                    ? sec.ingredients
                    : [];
                  rows.forEach((row) => {
                    if (!row || row.isPlaceholder || row.rowType === 'heading')
                      return;
                    const key = String(row.unit || '')
                      .trim()
                      .toLowerCase();
                    if (!key) return;
                    const nextUnit = replacementMap.get(key);
                    if (nextUnit) row.unit = nextUnit;
                  });
                });
                if (
                  typeof window.recipeEditorRerenderIngredientsFromModel ===
                  'function'
                ) {
                  window.recipeEditorRerenderIngredientsFromModel();
                }
              }

              const unknownSizeUnique = [];
              const seenUnknownSizes = new Set();
              recipeModel.sections.forEach((sec) => {
                const rows = Array.isArray(sec?.ingredients)
                  ? sec.ingredients
                  : [];
                rows.forEach((row) => {
                  if (!row || row.isPlaceholder || row.rowType === 'heading')
                    return;
                  const rawSize = String(row.size || '').trim();
                  if (!rawSize) return;
                  const key = rawSize.toLowerCase();
                  if (seenUnknownSizes.has(key)) return;
                  seenUnknownSizes.add(key);
                  if (anySelectableSizeNamed(rawSize)) return;
                  unknownSizeUnique.push(rawSize);
                });
              });
              if (unknownSizeUnique.length) {
                const resolvedSizes = await resolveUnknownSizeNames({
                  db,
                  sizes: unknownSizeUnique,
                  title: `New sizes (${unknownSizeUnique.length})`,
                  message:
                    unknownSizeUnique.length === 1
                      ? 'This size is not in your database. Edit, match it to an existing size, or save it as a new one.'
                      : 'These sizes are not in your database. Edit, match them to existing sizes, or save them as new ones.',
                });
                if (!resolvedSizes) {
                  uiToast('Save cancelled.');
                  return;
                }
                const replacementMap = resolvedSizes.map;
                recipeModel.sections.forEach((sec) => {
                  const rows = Array.isArray(sec?.ingredients)
                    ? sec.ingredients
                    : [];
                  rows.forEach((row) => {
                    if (!row || row.isPlaceholder || row.rowType === 'heading')
                      return;
                    const key = String(row.size || '')
                      .trim()
                      .toLowerCase();
                    if (key) {
                      const nextSize = replacementMap.get(key);
                      if (nextSize) row.size = nextSize;
                    }
                    if (!Array.isArray(row.substitutes)) return;
                    row.substitutes.forEach((sub) => {
                      if (!sub) return;
                      const subKey = String(sub.size || '')
                        .trim()
                        .toLowerCase();
                      if (!subKey) return;
                      const nextSubSize = replacementMap.get(subKey);
                      if (nextSubSize) sub.size = nextSubSize;
                    });
                  });
                });
                if (
                  typeof window.recipeEditorRerenderIngredientsFromModel ===
                  'function'
                ) {
                  window.recipeEditorRerenderIngredientsFromModel();
                }
              }

              const normalizedDraftTags = normalizeRecipeTagDraftList(
                recipeModel.tags,
              );
              const unknownTagUnique = [];
              const seenUnknownTags = new Set();
              normalizedDraftTags.forEach((tag) => {
                const key = String(tag || '')
                  .trim()
                  .toLowerCase();
                if (!key || seenUnknownTags.has(key)) return;
                seenUnknownTags.add(key);
                if (anyVisibleTagNamed(tag)) return;
                unknownTagUnique.push(tag);
              });
              if (unknownTagUnique.length) {
                const resolvedTags = await resolveUnknownTagNames({
                  db,
                  tags: unknownTagUnique,
                  title: `New tags (${unknownTagUnique.length})`,
                  message:
                    unknownTagUnique.length === 1
                      ? 'This tag is not in your database. Edit, match it to an existing tag, or save it as a new one.'
                      : 'These tags are not in your database. Edit, match them to existing tags, or save them as new ones.',
                });
                if (!resolvedTags) {
                  uiToast('Save cancelled.');
                  return;
                }
                const replacementMap = resolvedTags.map;
                recipeModel.tags = normalizeRecipeTagDraftList(
                  normalizedDraftTags.map((tag) => {
                    const key = String(tag || '')
                      .trim()
                      .toLowerCase();
                    return replacementMap.get(key) || tag;
                  }),
                );
              } else {
                recipeModel.tags = normalizedDraftTags;
              }
            }
          }
        } catch (unknownErr) {
          console.warn('Unknown-item resolution skipped:', unknownErr);
        }

        if (typeof window.recipeEditorPrepareRecipeForSave === 'function') {
          window.recipeEditorPrepareRecipeForSave(window.recipeData);
        }

        let refreshed = null;
        if (
          window.dataService &&
          typeof window.dataService.saveRecipe === 'function'
        ) {
          refreshed = await window.dataService.saveRecipe({
            recipe: window.recipeData,
          });
        } else {
          throw new Error(
            'Save failed: dataService.saveRecipe is not available.',
          );
        }

        const savedThroughSupabase =
          window.dataService && window.dataService.activeAdapter === 'supabase';

        if (!savedThroughSupabase) {
          if (!window.dbInstance) throw new Error('No active database found');
          const binaryArray = window.dbInstance.export();
          await persistBinaryArrayInMain(binaryArray, {
            overwriteOnly: false,
            failureMessage: 'Save failed — check console for details.',
          });
        }

        // Refresh Cancel baseline after a successful save.
        if (
          !refreshed &&
          window.bridge &&
          typeof bridge.loadRecipeFromDB === 'function'
        ) {
          refreshed = bridge.loadRecipeFromDB(
            window.dbInstance,
            window.recipeId,
          );
        }
        if (refreshed) {
          window.originalRecipeSnapshot = JSON.parse(JSON.stringify(refreshed));
          window.recipeData = JSON.parse(JSON.stringify(refreshed));
          if (
            !isRecipePlannerMode &&
            typeof renderRecipe === 'function' &&
            window.recipeData
          ) {
            // After first save on new recipes, step ids can shift from tmp-* to persisted ids.
            // Re-render once so inline step handlers bind against the refreshed model ids.
            renderRecipe(window.recipeData);
          }
          if (
            !isRecipePlannerMode &&
            typeof window.recipeEditorRerenderIngredientsFromModel === 'function'
          ) {
            window.recipeEditorRerenderIngredientsFromModel();
          }
        }

        // Reset editor UI state after save
        if (typeof window.recipeEditorResetDirty === 'function') {
          window.recipeEditorResetDirty();
        } else {
          const appCancel = document.getElementById('appBarCancelBtn');
          if (appCancel) appCancel.disabled = true;
          if (typeof disableSave === 'function') disableSave();
        }
        if (typeof clearSelectedStep === 'function') clearSelectedStep();
      } catch (err) {
        console.error('❌ Save failed:', err);
        uiToast('Save failed — check console for details.');
        throw err;
      }
    }),
  });

  window.recipePlannerModeSyncAppBar = () => {
    const cancelBtn = document.getElementById('appBarCancelBtn');
    if (!cancelBtn) return;
    if (!isRecipePlannerMode) {
      setAppBarTextActionLabel(cancelBtn, 'Cancel');
      cancelBtn.classList.remove('app-bar-cancel--reset-servings');
      const dirty =
        typeof window.recipeEditorGetIsDirty === 'function'
          ? window.recipeEditorGetIsDirty()
          : false;
      cancelBtn.disabled = !dirty;
      return;
    }
    setAppBarTextActionLabel(cancelBtn, 'Reset servings');
    cancelBtn.classList.add('app-bar-cancel--reset-servings');
    cancelBtn.disabled =
      typeof window.recipePlannerModeCanResetServings === 'function'
        ? !window.recipePlannerModeCanResetServings(window.recipeData || recipe)
        : true;
  };
  window.recipePlannerModeSyncAppBar();
  if (isRecipePlannerMode) {
    const recipePlannerServingsChangedEventName =
      window.favoriteEatsRecipePlannerServings?.changeEventName ||
      window.favoriteEatsEventNames?.recipePlannerServingsChanged ||
      '';
    if (!window._recipePlannerModeStorageSyncBound) {
      window._recipePlannerModeStorageSyncBound = true;
      const syncFromStorage = (event) => {
        const changedRecipeId = Number(event?.detail?.recipeId);
        if (
          Number.isFinite(changedRecipeId) &&
          changedRecipeId > 0 &&
          Number(window.recipeData?.id) !== changedRecipeId
        ) {
          return;
        }
        if (typeof window.recipePlannerModeSyncFromStorage === 'function') {
          window.recipePlannerModeSyncFromStorage();
        }
      };
      if (recipePlannerServingsChangedEventName) {
        window.addEventListener(
          recipePlannerServingsChangedEventName,
          syncFromStorage,
        );
      }
      window.addEventListener('storage', (event) => {
        if (event.key !== window.favoriteEatsStorageKeys?.recipePlannerServings)
          return;
        syncFromStorage();
      });
    }
  }

  try {
    if (typeof refreshFavoriteEatsCatalogMetricFlags === 'function') {
      await refreshFavoriteEatsCatalogMetricFlags();
    }
    if (typeof hydrateRecipeIngredientMetricFlags === 'function') {
      hydrateRecipeIngredientMetricFlags(recipe);
    }
  } catch (metricFlagsErr) {
    console.warn('Recipe editor: catalog metric flags hydrate failed:', metricFlagsErr);
  }

  renderRecipe(recipe);

  // ✅ One-time reset after first render
  if (!isRecipePlannerMode && typeof revertChanges === 'function') {
    revertChanges();
  }

  // --- Always scroll editor to top on load ---
  try {
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch (_) {
    window.scrollTo(0, 0);
  }

  fePageLoadFoodIconFinish();
}

  global.favoriteEatsRecipeEditorPage = {
    registerFavoriteEatsRecipeEditorPageDeps,
    loadRecipeEditorPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
