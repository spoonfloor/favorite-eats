async function formatRecipe(_db, recipeId) {
  const id = Number(recipeId);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (
    !window.dataService ||
    typeof window.dataService.loadRecipeDetail !== 'function'
  ) {
    return null;
  }
  return window.dataService.loadRecipeDetail(id);
}

window.formatRecipe = formatRecipe;
