/**
 * Session-persisted shopping-plan recipe detail payloads (forShoppingPlan shape).
 * Survives MPA navigation so hub revisits skip loadRecipeDetail fan-out.
 */
(function favoriteEatsPlanRecipeCacheModule(global) {
  if (!global) return;

  const STORAGE_KEY = 'favoriteEats:planRecipeDetail:v1';
  const MAX_ENTRIES = 40;

  /** @type {Map<number, object>} */
  const memory = new Map();
  let restored = false;

  function restoreOnce() {
    if (restored) return;
    restored = true;
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const entries = parsed.entries;
      if (!entries || typeof entries !== 'object') return;
      Object.keys(entries).forEach((key) => {
        const id = Math.trunc(Number(key));
        const recipe = entries[key];
        if (!Number.isFinite(id) || id <= 0 || !recipe) return;
        if (!Array.isArray(recipe.sections)) return;
        memory.set(id, recipe);
      });
    } catch (_) {}
  }

  function persist() {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const entries = Object.create(null);
      memory.forEach((recipe, id) => {
        entries[String(id)] = recipe;
      });
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ entries, savedAt: Date.now() }),
      );
    } catch (_) {}
  }

  function peek(recipeId) {
    restoreOnce();
    const id = Math.trunc(Number(recipeId));
    if (!Number.isFinite(id) || id <= 0) return null;
    const recipe = memory.get(id);
    return recipe && Array.isArray(recipe.sections) ? recipe : null;
  }

  function stash(recipeId, recipe) {
    const id = Math.trunc(Number(recipeId));
    if (!Number.isFinite(id) || id <= 0 || !recipe) return;
    if (!Array.isArray(recipe.sections)) return;
    restoreOnce();
    memory.set(id, recipe);
    while (memory.size > MAX_ENTRIES) {
      const firstKey = memory.keys().next().value;
      if (firstKey == null) break;
      memory.delete(firstKey);
    }
    persist();
  }

  function clearAll() {
    memory.clear();
    restored = true;
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function remove(recipeId) {
    restoreOnce();
    const id = Math.trunc(Number(recipeId));
    if (!Number.isFinite(id) || id <= 0) return;
    if (!memory.delete(id)) return;
    persist();
  }

  global.favoriteEatsPlanRecipeCache = {
    peek,
    stash,
    remove,
    clearAll,
  };
})(typeof window !== 'undefined' ? window : globalThis);
