// SQLite adapter for the data service.
//
// Implements contracts in js/data/contracts/. Reads from a sql.js Database.
// Created via createSqliteAdapter(db). The same adapter shape is implemented
// by supabaseAdapter.js (eventually); both must satisfy the same contracts.
//
// Contract: js/data/contracts/listRecipes.md

(function initSqliteAdapter(global) {
  if (!global) return;

  function toPositiveOrNull(rawValue) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function makeRecipeRow(idRaw, titleRaw, sdRaw, smRaw, sxRaw) {
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) return null;
    const def = toPositiveOrNull(sdRaw);
    return {
      id,
      title: titleRaw == null ? '' : String(titleRaw),
      tags: [],
      servingsDefault: def,
      servings: {
        default: def,
        min: toPositiveOrNull(smRaw),
        max: toPositiveOrNull(sxRaw),
      },
    };
  }

  async function listRecipes(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listRecipes: SQLite database is not available.');
    }

    const recipesQ = db.exec(
      `SELECT ID, title, servings_default, servings_min, servings_max
       FROM recipes
       ORDER BY title COLLATE NOCASE;`,
    );
    const rows = recipesQ.length ? recipesQ[0].values : [];
    const out = rows
      .map(([id, title, sd, sm, sx]) => makeRecipeRow(id, title, sd, sm, sx))
      .filter((row) => row != null);

    if (!out.length) return out;

    const byRecipeId = new Map();
    out.forEach((row) => byRecipeId.set(row.id, row));

    let tagsQ = [];
    try {
      tagsQ = db.exec(
        `SELECT m.recipe_id, t.name
         FROM recipe_tag_map m
         JOIN tags t ON t.id = m.tag_id
         WHERE COALESCE(t.is_hidden, 0) = 0
         ORDER BY m.recipe_id,
                  COALESCE(m.sort_order, 999999),
                  m.id,
                  t.name COLLATE NOCASE;`,
      );
    } catch (_) {
      // Legacy DBs may not have these tables; tags simply stay empty.
      tagsQ = [];
    }

    if (tagsQ.length) {
      tagsQ[0].values.forEach(([recipeIdRaw, tagNameRaw]) => {
        const recipeId = Number(recipeIdRaw);
        const row = byRecipeId.get(recipeId);
        if (!row) return;
        const trimmed = String(tagNameRaw == null ? '' : tagNameRaw).trim();
        if (!trimmed) return;
        const lower = trimmed.toLowerCase();
        if (row.tags.some((existing) => existing.toLowerCase() === lower)) return;
        row.tags.push(trimmed);
      });
    }

    return out;
  }

  function createSqliteAdapter(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('createSqliteAdapter requires a sql.js Database instance.');
    }
    return {
      listRecipes: () => listRecipes(db),
    };
  }

  global.createSqliteAdapter = createSqliteAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
