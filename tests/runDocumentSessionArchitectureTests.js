#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

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
assertIncludes(session, 'beginDeferPaint', 'document session supports deferred paint');
assertIncludes(session, 'commitPaint', 'document session supports commit paint');
assertIncludes(session, 'applyCatalogVariantPurgedPatch', 'document session supports catalog purge patch');
assertIncludes(session, 'stashCatalogVariantPurgedPatch', 'document session stashes pending purges');

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
assertIncludes(main, 'catalog-reload', 'clean catalog refresh commits full-page paint');
assertIncludes(main, 'catalog-grammar', 'grammar fallback commits document session paint');
assertExcludes(main, '_recipeEditorLastSuccessfulSaveAt', 'catalog reload does not use post-save debounce');

assertIncludes(html, 'favoriteEatsDocumentSession.js', 'recipe editor loads document session module');

console.log('Document session architecture tests passed.');
