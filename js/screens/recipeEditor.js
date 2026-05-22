/**
 * Recipe editor screen loader (Slice 5 + 7 bootstrap).
 */
(function favoriteEatsRecipeEditorScreenModule(global) {
  if (!global) return;

  async function fetchRecipeEditorPayload(recipeId) {
    if (
      !global.dataService ||
      typeof global.dataService.loadRecipeEditorScreen !== 'function'
    ) {
      throw new Error('dataService.loadRecipeEditorScreen is not available.');
    }
    global.dataService.useSupabase = true;
    return global.dataService.loadRecipeEditorScreen(recipeId);
  }

  async function bootstrapRecipeEditorHub(recipeId, options = {}) {
    const shouldUseSupabase =
      options.shouldUseSupabase !== false && !!global.dataService;

    if (
      shouldUseSupabase &&
      typeof fetchRecipeEditorPayload === 'function'
    ) {
      try {
        const recipe = await fetchRecipeEditorPayload(recipeId);
        if (recipe) {
          return { ok: true, recipe, fromScreen: true };
        }
      } catch (screenErr) {
        console.warn(
          'Recipe editor: screen load failed; falling back to loadRecipeDetail:',
          screenErr,
        );
      }
    }

    if (
      shouldUseSupabase &&
      global.dataService &&
      typeof global.dataService.loadRecipeDetail === 'function'
    ) {
      try {
        const recipe = await global.dataService.loadRecipeDetail(recipeId);
        return { ok: !!recipe, recipe: recipe || null, fromScreen: false };
      } catch (err) {
        return { ok: false, error: err };
      }
    }

    return { ok: false };
  }

  global.favoriteEatsRecipeEditorScreen = {
    fetchRecipeEditorPayload,
    bootstrapRecipeEditorHub,
  };
})(typeof window !== 'undefined' ? window : globalThis);
