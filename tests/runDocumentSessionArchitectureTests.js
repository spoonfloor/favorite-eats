#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const session = fs.readFileSync(
  path.join(projectRoot, 'js/favoriteEatsDocumentSession.js'),
  'utf8',
);
const recipeEditor = fs.readFileSync(
  path.join(projectRoot, 'js/recipeEditor.js'),
  'utf8',
);
const recipeEditorPage = fs.readFileSync(
  path.join(projectRoot, 'js/screens/recipeEditorPage.js'),
  'utf8',
);
const ingredientRenderer = fs.readFileSync(
  path.join(projectRoot, 'js/ingredientRenderer.js'),
  'utf8',
);
const main = fs.readFileSync(path.join(projectRoot, 'js/main.js'), 'utf8');
const paintProbe = fs.readFileSync(
  path.join(projectRoot, 'js/fePaintProbeLog.js'),
  'utf8',
);
const html = fs.readFileSync(path.join(projectRoot, 'recipeEditor.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), `${message}: missing ${JSON.stringify(needle)}`);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), `${message}: still has ${JSON.stringify(needle)}`);
}

assertIncludes(session, 'createRecipeSession', 'document session exposes recipe factory');
assertIncludes(session, 'createSession: createDocumentSession', 'document session exposes generic session factory');
assertIncludes(session, 'getActiveSession', 'document session exposes generic active session lookup');
assertIncludes(session, 'paintSurfaces', 'generic session delegates host surface paints');
assertIncludes(session, 'notePaintedSurfaces', 'generic session lets hosts record painted model keys');
assertIncludes(session, 'beginDeferPaint', 'document session supports deferred paint');
assertIncludes(session, 'commitPaint', 'document session supports commit paint');
assertIncludes(session, 'applyCatalogVariantPurgedPatch', 'document session supports catalog purge patch');
assertIncludes(session, 'stashCatalogVariantPurgedPatch', 'document session stashes pending purges');
assertIncludes(session, 'createRecipesBrowseSession', 'document session exposes recipes browse factory');
assertIncludes(session, 'surfacesForRecipesBrowseInvalidation', 'document session exposes browse invalidation policy');
assertIncludes(session, 'SURFACE_MEMBERSHIP', 'document session exposes membership surface');
assertIncludes(session, 'invalidateRecipesBrowse', 'document session exposes recipes browse invalidation');

const recipesHtml = fs.readFileSync(path.join(projectRoot, 'recipes.html'), 'utf8');
const recipesPage = fs.readFileSync(
  path.join(projectRoot, 'js/screens/recipesPage.js'),
  'utf8',
);
assertIncludes(recipesHtml, 'favoriteEatsDocumentSession.js', 'recipes page loads document session module');
assertIncludes(recipesPage, 'createRecipesBrowseSession', 'recipes page creates browse document session');
assertIncludes(recipesPage, 'invalidateRecipesBrowseUi', 'recipes page invalidates browse session on read-model change');

assertIncludes(recipeEditor, 'skipDocumentSessionQueue', 'ingredients rerender can bypass session queue');
assertIncludes(recipeEditor, 'syncYouWillNeed', 'ingredients rerender can skip YWN tail');
assertIncludes(session, 'markSaveCommitPaintComplete', 'document session marks save-owned catalog reload');
assertIncludes(main, 'skipSaveOwned', 'catalog reload skips paint after save commit');
assertIncludes(session, 'SURFACE_INSTRUCTIONS', 'document session supports instructions-only paint');
assertIncludes(recipeEditor, 'recipeEditorStepDisplayKey', 'step display key ignores persisted row ids');
assertIncludes(recipeEditor, 'resyncInstructions', 'renderRecipe can resync instructions without full-page wipe');

assertIncludes(recipeEditor, 'requiresIngredientsRerender', 'ingredient commit paints insert rails only');
assertIncludes(recipeEditor, 'recipeEditorApplyPersistedBindingFields', 'save merges persisted binding fields in place');
assertExcludes(
  recipeEditor,
  "String(row.rimId ?? '')",
  'ingredient display key excludes rimId binding',
);

assertIncludes(recipeEditorPage, 'recipeEditorEstablishCleanBaseline', 'load baseline avoids second renderRecipe');

assertIncludes(recipeEditorPage, 'fePageLoadFoodIconFinish', 'recipe editor finishes load affordance');
assertIncludes(recipeEditorPage, 'createRecipeSession', 'recipe editor page creates document session');
assert(
  recipeEditorPage.indexOf('fePageLoadFoodIconFinish') <
    recipeEditorPage.indexOf('refreshFavoriteEatsCatalogMetricFlags'),
  'catalog metric refresh must not block first paint',
);
assertIncludes(recipeEditorPage, 'beginDeferPaint', 'save defers paints through document session');
assertIncludes(recipeEditorPage, 'commitPaint', 'save commits one paint through document session');
assertIncludes(recipeEditorPage, 'recipeEditorCommitSurfacesAfterSave', 'save paints only changed surfaces');
assertIncludes(recipeEditor, 'recipeEditorCommitSurfacesAfterSave', 'save surface selection lives in recipe editor');
assertIncludes(recipeEditor, 'recipeEditorDisplayProjection', 'recipe editor exposes display projection');
assertIncludes(
  recipeEditor,
  'liveModelReplaced',
  'save repaints ingredients when live model was replaced',
);
assertIncludes(
  recipeEditor,
  'recipeEditorFindIngredientRowContext',
  'recipe editor exposes ingredient row context resolver',
);
assertIncludes(
  ingredientRenderer,
  'resolveIngredientDeleteContext',
  'ingredient delete resolves live model row context',
);
assertIncludes(
  ingredientRenderer,
  'recipeEditorFindIngredientRowContext',
  'ingredient delete uses canonical row context resolver',
);
assertIncludes(
  recipeEditor,
  'recipeEditorClearIngredientEditorUiState',
  'ingredient rerender clears stale editor UI state',
);
assertIncludes(
  recipeEditor,
  '_ctaTeardown',
  'ingredient CTAs rewire after each rerender',
);
assertIncludes(
  recipeEditor,
  "document.getElementById('ingredientsSection')",
  'ingredient CTA handler resolves live ingredients section',
);
assertIncludes(
  recipeEditor,
  'ensureIngredientCtaRevealedForAction',
  'ingredient CTA reveals hidden hint before action',
);
assertIncludes(
  recipeEditor,
  'showPersistentHeaderCta',
  'empty ingredient list uses persistent header CTA',
);
assertIncludes(
  recipeEditor,
  'ensureRecipeHasEditableSection(recipe)',
  'partial ingredients paint preserves editable empty section',
);
assertIncludes(
  ingredientRenderer,
  "div.classList.contains('ingredient-add-cta')",
  'ingredient add CTA is not a delete target',
);
assertIncludes(
  recipeEditor,
  'beforeProjection.youWillNeed !== afterProjection.youWillNeed',
  'save YWN paint gated on display projection diff',
);
assertExcludes(
  recipeEditor,
  'recipeEditorYwnContentKey(live)',
  'save surface selection does not compare live vs after for YWN',
);
assertExcludes(
  recipeEditor,
  'if (recipeEditorNeedsFullPageRebindAfterSave(before, after)) {\n    return [ds.SURFACE_FULL_PAGE];\n  }',
  'save commit does not route routine saves through needsFullPageRebind',
);
assertIncludes(recipeEditor, 'save:commitSurfaces', 'save logs commit-time surface decision');
assertIncludes(recipeEditor, 'ywn:skip', 'YWN painter skips when projection unchanged');
assertIncludes(recipeEditor, 'cardConnected', 'YWN skip requires connected host');
assertIncludes(recipeEditor, '_lastPaintedYwnContentKey = \'\'', 'full-page shell wipe clears YWN paint baseline');
assertIncludes(
  recipeEditor,
  'Save defer: only queue ingredients DOM',
  'deferred save preflight does not queue YWN',
);
assertIncludes(
  ingredientRenderer,
  'recipeEditorAfterIngredientEditCommit(sectionRef',
  'paste commit uses session ingredient edit hook',
);
assertExcludes(
  ingredientRenderer,
  'setTimeout(() => {\n              try {\n                window.recipeEditorRerenderIngredientsFromModel',
  'paste commit does not use deferred setTimeout ingredients rerender',
);
assertIncludes(recipeEditorPage, 'recipeEditorPrepareRecipeForSave', 'save prepares model before display baseline');
assert(
  recipeEditorPage.indexOf('recipeEditorPrepareRecipeForSave') <
    recipeEditorPage.indexOf('recipeModelBeforeSave = window.recipeData'),
  'display baseline captured after prepareRecipeForSave',
);
assertIncludes(recipeEditor, 'recipeEditorModelsDisplayEquivalent', 'catalog reload can skip display-equivalent model');
assertIncludes(main, 'recipeEditorModelsDisplayEquivalent', 'catalog reload skips equivalent open recipe');
assertExcludes(recipeEditorPage, '_recipeEditorLastSuccessfulSaveAt', 'save does not use post-save paint debounce');

assertIncludes(ingredientRenderer, 'enrichRecipeIngredientRowFromCatalog', 'commit enriches rows from catalog');
assertIncludes(ingredientRenderer, 'locationAtHome', 'commit sets locationAtHome from catalog');
assertIncludes(
  ingredientRenderer,
  'resolveLocationAtHomeFromShoppingItemDetail',
  'location resolution mirrors shopping item detail',
);
assertExcludes(
  ingredientRenderer,
  '_pendingIngredientHintClientId = insertedClientId',
  'insert commit does not schedule duplicate hint rerender',
);

assertExcludes(recipeEditor, 'preservedYouWillNeedCard', 'full-page paint does not preserve YWN card patch');

assertIncludes(session, 'syncDerivedSurfaces', 'full-page paint syncs derived surfaces');
assertIncludes(recipeEditor, 'syncDerivedSurfaces', 'renderRecipe supports sync derived surfaces');

assertIncludes(main, 'commitOpenRecipeEditorDocumentPaint', 'catalog refresh uses document session paint');
assertIncludes(main, 'tryApplyOpenRecipeEditorCatalogPatches', 'catalog refresh applies variant purge patches');
assertIncludes(main, 'catalogVariantPurged', 'catalog refresh carries variant purge payload');
assertIncludes(
  main,
  'favorite-eats-catalog-surfaces-refresh',
  'catalog surfaces cross-tab channel has stable name',
);
assertIncludes(
  main,
  'installFavoriteEatsCatalogSurfacesCrossTabRefresh()',
  'app boot installs catalog surfaces cross-tab refresh',
);
assertIncludes(
  main,
  'tryMergeOpenRecipeEditorCatalogIngredientFieldsFromServer',
  'dirty open recipe can merge catalog ingredient fields from server',
);
assertIncludes(
  main,
  'bypassRecipeDetailCache: true',
  'open recipe catalog refresh bypasses stale recipe detail cache',
);
assertIncludes(
  main,
  'FAVORITE_EATS_CATALOG_SURFACES_STORAGE_KEY',
  'catalog surfaces cross-tab also uses localStorage signal',
);
assertIncludes(
  recipeEditor,
  'recipeEditorApplyPersistedCatalogIngredientFields',
  'recipe editor merges persisted catalog ingredient variant fields',
);
assertIncludes(main, 'catalog-reload', 'clean catalog refresh commits full-page paint');
assertIncludes(main, 'catalog-grammar', 'grammar fallback commits document session paint');
assertExcludes(main, '_recipeEditorLastSuccessfulSaveAt', 'catalog reload does not use post-save debounce');

assertIncludes(html, 'favoriteEatsDocumentSession.js', 'recipe editor loads document session module');
assertIncludes(paintProbe, 'isProbeEnabled', 'paint probe logging is opt-in');
assertIncludes(paintProbe, '__fePaintProbeEnabled', 'paint probe can be explicitly enabled');
assertIncludes(paintProbe, 'fePaintProbe', 'paint probe can be enabled from URL');

async function assertRuntimeBehavior() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    URLSearchParams,
    location: { search: '' },
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(session, context);

  const ds = context.favoriteEatsDocumentSession;
  assert(ds && typeof ds.createSession === 'function', 'runtime exposes generic session factory');
  assert(
    ds && typeof ds.createRecipeSession === 'function',
    'runtime exposes recipe session factory',
  );

  let genericPaints = 0;
  const genericSession = ds.createSession({
    kind: 'architecture-smoke',
    defaultSurface: 'body',
    getModel: () => ({ id: 'generic' }),
    paintSurfaces: ({ surfaces }) => {
      assert(surfaces.has('body'), 'generic session paints requested host surface');
      genericPaints += 1;
      return 'generic';
    },
  });
  assert(
    ds.getActiveSession('architecture-smoke') === genericSession,
    'generic session can be looked up by kind',
  );
  await genericSession.commitPaint({ reason: 'smoke' });
  assert(genericPaints === 1, 'generic session commits one paint');
  genericSession.destroy();

  let recipeFullPaints = 0;
  let recipeYwnPaints = 0;
  context.renderRecipe = (_model, options) => {
    assert(
      options && options.syncDerivedSurfaces === true,
      'recipe full paint syncs derived surfaces',
    );
    recipeFullPaints += 1;
  };
  context.recipeEditorRerenderYouWillNeedFromModelAsync = async () => {
    recipeYwnPaints += 1;
  };
  const recipeSession = ds.createRecipeSession({
    recipeId: 1,
    getModel: () => ({ id: 1, sections: [] }),
  });
  await recipeSession.commitPaint({
    surfaces: [ds.SURFACE_FULL_PAGE],
    reason: 'save',
  });
  assert(recipeFullPaints === 1, 'recipe wrapper commits full-page paint');
  assert(recipeYwnPaints === 1, 'recipe wrapper commits derived YWN paint');
  assert(
    recipeSession.consumeSaveOwnedCatalogReload() === true,
    'recipe wrapper keeps save-owned catalog reload marker',
  );
  recipeSession.destroy();

  const browseSurfaces = ds.surfacesForRecipesBrowseInvalidation(
    ds.RECIPES_BROWSE_REASON_PLAN_SELECTION_CHANGED,
    { plannerSelectMode: true },
  );
  assert(
    browseSurfaces.includes(ds.SURFACE_MEMBERSHIP),
    'planner plan selection schedules membership paint',
  );
  assert(
    browseSurfaces.includes(ds.SURFACE_VISIBLE_ROWS),
    'planner plan selection schedules visible row paint',
  );
  const servingsOnly = ds.surfacesForRecipesBrowseInvalidation(
    ds.RECIPES_BROWSE_REASON_SERVINGS_DISPLAY_CHANGED,
    { plannerSelectMode: true },
  );
  assert(
    !servingsOnly.includes(ds.SURFACE_MEMBERSHIP),
    'servings display change does not rebuild list membership',
  );

  let membershipPaints = 0;
  const browseSession = ds.createRecipesBrowseSession({
    getContext: () => ({ plannerSelectMode: true }),
    paintMembership: () => {
      membershipPaints += 1;
    },
    paintVisibleRows: () => {},
    paintActionChrome: () => {},
    paintFilterChrome: () => {},
  });
  ds.invalidateRecipesBrowse(
    browseSession,
    ds.RECIPES_BROWSE_REASON_PLAN_SELECTION_CHANGED,
    { plannerSelectMode: true },
  );
  await new Promise((resolve) => {
    if (typeof context.requestAnimationFrame === 'function') {
      context.requestAnimationFrame(() => {
        context.requestAnimationFrame(resolve);
      });
    } else {
      setTimeout(resolve, 0);
    }
  });
  assert(membershipPaints >= 1, 'browse invalidation schedules membership paint');
  browseSession.destroy();
}

assertRuntimeBehavior()
  .then(() => {
    console.log('Document session architecture tests passed.');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
