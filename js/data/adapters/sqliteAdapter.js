// SQLite adapter for the data service.
//
// Implements contracts in js/data/contracts/. Reads from a sql.js Database.
// Created via createSqliteAdapter(db). The same adapter shape is implemented
// by supabaseAdapter.js; both must satisfy the same contracts.
//
// Contracts:
//   - js/data/contracts/listRecipes.md
//   - js/data/contracts/loadRecipeDetail.md
//
// loadRecipeDetail wraps the existing window.bridge.loadRecipeFromDB and
// post-normalizes its output to match the contract. window.bridge must be
// loaded (js/bridge.js) before this adapter is used for that method.

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

  // ---- loadRecipeDetail ----------------------------------------------------
  //
  // Contract: js/data/contracts/loadRecipeDetail.md
  //
  // We delegate the heavy SQL to bridge.loadRecipeFromDB (which already
  // handles legacy schema variations) and apply the small set of contract
  // normalizations bridge does NOT do: title null→"", servings coerced to
  // positive-or-null, and tag list deduped case-insensitively.

  function dedupeTagsCaseInsensitive(rawTags) {
    const out = [];
    const seen = new Set();
    (Array.isArray(rawTags) ? rawTags : []).forEach((rawTag) => {
      const trimmed = String(rawTag == null ? '' : rawTag).trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(trimmed);
    });
    return out;
  }

  function normalizeRecipeDetail(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = Number(raw.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    const servings = raw.servings || {};
    return {
      id,
      title: raw.title == null ? '' : String(raw.title),
      servings: {
        default: toPositiveOrNull(servings.default),
        min: toPositiveOrNull(servings.min),
        max: toPositiveOrNull(servings.max),
      },
      tags: dedupeTagsCaseInsensitive(raw.tags),
      sections: Array.isArray(raw.sections) ? raw.sections : [],
    };
  }

  async function loadRecipeDetail(db, recipeId) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('loadRecipeDetail: SQLite database is not available.');
    }
    const id = Number(recipeId);
    if (!Number.isFinite(id) || id <= 0) return null;
    if (
      !global.bridge ||
      typeof global.bridge.loadRecipeFromDB !== 'function'
    ) {
      throw new Error(
        'loadRecipeDetail: window.bridge.loadRecipeFromDB is not loaded. ' +
          'Make sure js/bridge.js loads before js/data/adapters/sqliteAdapter.js.',
      );
    }
    const raw = global.bridge.loadRecipeFromDB(db, id);
    if (raw == null) return null;
    return normalizeRecipeDetail(raw);
  }

  function createSqliteAdapter(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('createSqliteAdapter requires a sql.js Database instance.');
    }
    return {
      listRecipes: () => listRecipes(db),
      loadRecipeDetail: (recipeId) => loadRecipeDetail(db, recipeId),
    };
  }

  global.createSqliteAdapter = createSqliteAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
