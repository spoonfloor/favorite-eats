// SQLite adapter for the data service.
//
// Implements contracts in js/data/contracts/. Reads from a sql.js Database.
// Created via createSqliteAdapter(db). The same adapter shape is implemented
// by supabaseAdapter.js; both must satisfy the same contracts.
//
// Contracts:
//   - js/data/contracts/listRecipes.md
//   - js/data/contracts/loadRecipeDetail.md
//   - js/data/contracts/loadTypeaheadPools.md
//   - js/data/contracts/listTags.md
//   - js/data/contracts/listUnits.md
//   - js/data/contracts/listSizes.md
//   - js/data/contracts/listStores.md
//   - js/data/contracts/loadStoreDetail.md
//   - js/data/contracts/lookupShoppingItemByName.md
//   - js/data/contracts/lookupIngredientNameByLemma.md
//   - js/data/contracts/listIngredientTagNames.md
//   - js/data/contracts/listShoppingItems.md
//   - js/data/contracts/loadShoppingItemDetail.md
//   - js/data/contracts/listShoppingItemRecipeUsage.md
//   - js/data/contracts/loadShoppingItemVariantUsage.md
//   - js/data/contracts/listShoppingPlanRecipeItems.md
//   - js/data/contracts/listShoppingListAssignments.md
//   - js/data/contracts/listShoppingListRecipeSummaries.md
//   - js/data/contracts/listShoppingListPlanRows.md
//   - js/data/contracts/listShoppingListHomeLocations.md
//   - js/data/contracts/isIngredientVariantDeprecated.md
//   - js/data/contracts/loadTagUsage.md
//
// loadRecipeDetail wraps the existing window.bridge.loadRecipeFromDB and
// post-normalizes its output to match the contract. window.bridge must be
// loaded (js/bridge.js) before this adapter is used for that method.

(function initSqliteAdapter(global) {
  if (!global) return;

  function trimStr(v) {
    return String(v == null ? '' : v).trim();
  }

  function asciiNocaseFold(s) {
    return String(s == null ? '' : s).replace(/[A-Z]/g, (c) => c.toLowerCase());
  }

  function compareAsciiNocaseString(a, b) {
    const la = asciiNocaseFold(a);
    const lb = asciiNocaseFold(b);
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  function toPositiveOrNull(rawValue) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function columnFromExec(result, colIdx) {
    if (!Array.isArray(result) || result.length === 0) return [];
    const vals = result[0]?.values;
    if (!Array.isArray(vals)) return [];
    return vals
      .map((row) => (Array.isArray(row) ? row[colIdx] : null))
      .map(trimStr)
      .filter((v) => v.length > 0);
  }

  function tableHasColumn(db, tableName, colName) {
    try {
      const result = db.exec(`PRAGMA table_info(${tableName});`);
      const rows =
        Array.isArray(result) && result.length > 0 && Array.isArray(result[0].values)
          ? result[0].values
          : [];
      return rows.some(
        (row) =>
          Array.isArray(row) &&
          String(row[1] || '').toLowerCase() === String(colName || '').toLowerCase(),
      );
    } catch (_) {
      return false;
    }
  }

  function tableExists(db, tableName) {
    try {
      const result = db.exec(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`,
        [tableName],
      );
      return !!(
        Array.isArray(result) &&
        result.length > 0 &&
        Array.isArray(result[0].values) &&
        result[0].values.length
      );
    } catch (_) {
      return false;
    }
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

  // ---- loadTypeaheadPools --------------------------------------------------
  //
  // Contract: js/data/contracts/loadTypeaheadPools.md

  function normalizeSizeSortLabel(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[_/]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function getNamedSizeRank(value) {
    const label = normalizeSizeSortLabel(value).replace(/\s*-\s*/g, '-');
    if (!label) return null;
    const rankMap = new Map([
      ['extra-small', 10],
      ['x-small', 10],
      ['xsmall', 10],
      ['xs', 10],
      ['small', 20],
      ['sm', 20],
      ['medium', 30],
      ['med', 30],
      ['regular', 30],
      ['large', 40],
      ['lg', 40],
      ['extra-large', 50],
      ['x-large', 50],
      ['xlarge', 50],
      ['xl', 50],
      ['jumbo', 60],
      ['family-size', 70],
      ['family size', 70],
    ]);
    return rankMap.has(label) ? rankMap.get(label) : null;
  }

  function getNumericSizeSortMeta(value) {
    const label = normalizeSizeSortLabel(value);
    if (!label) return null;
    const match = label.match(
      /^(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|g|gram|grams|kg|kilogram|kilograms|lb|lbs|pound|pounds|ml|milliliter|milliliters|l|liter|liters)$/,
    );
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount)) return null;
    const weightUnits = {
      oz: 28.3495,
      ounce: 28.3495,
      ounces: 28.3495,
      g: 1,
      gram: 1,
      grams: 1,
      kg: 1000,
      kilogram: 1000,
      kilograms: 1000,
      lb: 453.592,
      lbs: 453.592,
      pound: 453.592,
      pounds: 453.592,
    };
    if (Object.prototype.hasOwnProperty.call(weightUnits, unit)) {
      return { group: 1, rank: amount * weightUnits[unit], label };
    }
    const volumeUnits = {
      ml: 1,
      milliliter: 1,
      milliliters: 1,
      l: 1000,
      liter: 1000,
      liters: 1000,
    };
    if (Object.prototype.hasOwnProperty.call(volumeUnits, unit)) {
      return { group: 2, rank: amount * volumeUnits[unit], label };
    }
    return null;
  }

  function getSizeSortMeta(value) {
    const label = normalizeSizeSortLabel(
      value && typeof value === 'object' ? value.name : value,
    );
    const namedRank = getNamedSizeRank(label);
    if (namedRank != null) return { group: 0, rank: namedRank, label };
    const numericMeta = getNumericSizeSortMeta(label);
    if (numericMeta) return numericMeta;
    return { group: 3, rank: Number.POSITIVE_INFINITY, label };
  }

  function getSizeSortOrderValue(value) {
    if (!value || typeof value !== 'object') return null;
    const n = Number(value.sortOrder ?? value.sort_order);
    return Number.isFinite(n) ? n : null;
  }

  function compareSizeDisplayValues(a, b) {
    const metaA = getSizeSortMeta(a);
    const metaB = getSizeSortMeta(b);
    if (metaA.group !== metaB.group) return metaA.group - metaB.group;
    if (metaA.rank !== metaB.rank) return metaA.rank - metaB.rank;
    if (metaA.group === 3) {
      const sortA = getSizeSortOrderValue(a);
      const sortB = getSizeSortOrderValue(b);
      if (sortA != null && sortB != null && sortA !== sortB) return sortA - sortB;
    }
    const labelCompare = metaA.label.localeCompare(metaB.label, undefined, {
      sensitivity: 'base',
    });
    if (labelCompare !== 0) return labelCompare;
    const sortA = getSizeSortOrderValue(a);
    const sortB = getSizeSortOrderValue(b);
    if (sortA != null && sortB != null && sortA !== sortB) return sortA - sortB;
    return 0;
  }

  function sortSizeRows(rows) {
    return (Array.isArray(rows) ? rows.slice() : []).sort(compareSizeDisplayValues);
  }

  async function loadTypeaheadPools(db, options = {}) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('loadTypeaheadPools: SQLite database is not available.');
    }

    const hasIngredientDeprecated = tableHasColumn(
      db,
      'ingredients',
      'is_deprecated',
    );
    const hasIngredientHidden = tableHasColumn(db, 'ingredients', 'is_hidden');
    const hasIngredientHideLegacy = tableHasColumn(
      db,
      'ingredients',
      'hide_from_shopping_list',
    );
    const ingredientWhere = [
      `name IS NOT NULL`,
      `trim(name) != ''`,
      hasIngredientDeprecated ? `COALESCE(is_deprecated, 0) = 0` : '',
      hasIngredientHidden ? `COALESCE(is_hidden, 0) = 0` : '',
      !hasIngredientDeprecated && hasIngredientHideLegacy
        ? `COALESCE(hide_from_shopping_list, 0) = 0`
        : '',
    ].filter(Boolean);

    const ingredientNames = columnFromExec(
      db.exec(
        `SELECT DISTINCT name
         FROM ingredients
         WHERE ${ingredientWhere.join(' AND ')}
         ORDER BY name COLLATE NOCASE;`,
      ),
      0,
    );

    const unitCodes = columnFromExec(
      db.exec(
        `SELECT DISTINCT code
         FROM units
         WHERE code IS NOT NULL
           AND trim(code) != ''
           AND COALESCE(is_removed, 0) = 0
         ORDER BY COALESCE(sort_order, 999999) ASC,
                  code COLLATE NOCASE;`,
      ),
      0,
    );

    const sizeQ = db.exec(
      `SELECT DISTINCT name, sort_order
       FROM sizes
       WHERE name IS NOT NULL
         AND trim(name) != ''
         AND COALESCE(is_removed, 0) = 0
       ORDER BY COALESCE(sort_order, 999999) ASC,
                name COLLATE NOCASE;`,
    );
    const sizeValues =
      Array.isArray(sizeQ) && sizeQ.length > 0 && Array.isArray(sizeQ[0].values)
        ? sizeQ[0].values
        : [];
    const sizeNames = sortSizeRows(
      sizeValues
        .map((row) => ({
          name: trimStr(Array.isArray(row) ? row[0] : ''),
          sortOrder: Array.isArray(row) ? row[1] : null,
        }))
        .filter((row) => row.name.length > 0),
    ).map((row) => row.name);

    const ingredientName = trimStr(options?.ingredientName);
    let variantNames = [];
    if (ingredientName) {
      const ingredientAliasWhere = [
        hasIngredientDeprecated ? `AND COALESCE(i.is_deprecated, 0) = 0` : '',
        hasIngredientHidden ? `AND COALESCE(i.is_hidden, 0) = 0` : '',
        !hasIngredientDeprecated && hasIngredientHideLegacy
          ? `AND COALESCE(i.hide_from_shopping_list, 0) = 0`
          : '',
      ].filter(Boolean);
      const canonicalIds = [];
      const seenIds = new Set();
      const pushIds = (result) => {
        const rows =
          Array.isArray(result) &&
          result.length > 0 &&
          Array.isArray(result[0].values)
            ? result[0].values
            : [];
        rows.forEach((row) => {
          const id = Number(Array.isArray(row) ? row[0] : null);
          if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) return;
          seenIds.add(id);
          canonicalIds.push(id);
        });
      };
      pushIds(
        db.exec(
          `SELECT i.ID
           FROM ingredients i
           WHERE lower(trim(i.name)) = lower(trim(?))
             ${ingredientAliasWhere.join('\n             ')}
           ORDER BY i.ID ASC;`,
          [ingredientName],
        ),
      );
      if (tableExists(db, 'ingredient_synonyms')) {
        pushIds(
          db.exec(
            `SELECT i.ID
             FROM ingredient_synonyms s
             JOIN ingredients i ON i.ID = s.ingredient_id
             WHERE lower(trim(s.synonym)) = lower(trim(?))
               ${ingredientAliasWhere.join('\n               ')}
             ORDER BY i.ID ASC;`,
            [ingredientName],
          ),
        );
      }
      if (canonicalIds.length && tableExists(db, 'ingredient_variants')) {
        const placeholders = canonicalIds.map(() => '?').join(', ');
        variantNames = columnFromExec(
          db.exec(
            `SELECT DISTINCT v.variant
             FROM ingredient_variants v
             WHERE v.ingredient_id IN (${placeholders})
               AND v.variant IS NOT NULL
               AND trim(v.variant) != ''
               AND lower(trim(v.variant)) != 'default'
               AND COALESCE(v.is_deprecated, 0) = 0
             ORDER BY v.variant COLLATE NOCASE;`,
            canonicalIds,
          ),
          0,
        );
      }
    }

    return { ingredientNames, unitCodes, sizeNames, variantNames };
  }

  // ---- listTags ------------------------------------------------------------
  //
  // Contract: js/data/contracts/listTags.md

  function normalizeIntendedUse(rawValue) {
    return trimStr(rawValue).toLowerCase() === 'ingredients'
      ? 'ingredients'
      : 'recipes';
  }

  function toTagSortOrder(rawValue) {
    if (rawValue == null || rawValue === '') return 999999;
    const n = Number(rawValue);
    return Number.isFinite(n) ? n : 999999;
  }

  async function listTags(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listTags: SQLite database is not available.');
    }

    const q = db.exec(`
      SELECT t.id,
             t.name,
             COALESCE(t.sort_order, 999999) AS sort_order,
             COALESCE(NULLIF(lower(trim(t.intended_use)), ''), 'recipes') AS intended_use,
             EXISTS(
               SELECT 1
               FROM recipe_tag_map rtm
               WHERE rtm.tag_id = t.id
             ) AS has_recipe_usage,
             EXISTS(
               SELECT 1
               FROM ingredient_variant_tag_map ivtm
               WHERE ivtm.tag_id = t.id
             ) AS has_ingredient_usage
      FROM tags t
      WHERE COALESCE(t.is_hidden, 0) = 0
      ORDER BY sort_order, t.name COLLATE NOCASE;
    `);
    const rows =
      Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
        ? q[0].values
        : [];
    return rows.map(
      ([
        id,
        name,
        sortOrder,
        intendedUse,
        hasRecipeUsage,
        hasIngredientUsage,
      ]) => ({
        id: Number(id),
        name: name == null ? '' : String(name),
        sortOrder: toTagSortOrder(sortOrder),
        intendedUse: normalizeIntendedUse(intendedUse),
        hasRecipeUsage: Number(hasRecipeUsage) === 1,
        hasIngredientUsage: Number(hasIngredientUsage) === 1,
      }),
    );
  }

  // ---- createTag -----------------------------------------------------------
  //
  // Contract: js/data/contracts/createTag.md

  async function createTag(db, request = {}) {
    if (!db || typeof db.exec !== 'function' || typeof db.run !== 'function') {
      throw new Error('createTag: SQLite database is not available.');
    }
    const name = trimStr(request?.name).slice(0, 48).trim();
    if (!name) {
      throw new Error('createTag: name is required.');
    }
    const intendedUse = normalizeIntendedUse(request?.intendedUse ?? request?.useFor);
    const maxQ = db.exec('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags;');
    const nextSort =
      maxQ.length && maxQ[0].values.length ? Number(maxQ[0].values[0][0]) || 1 : 1;

    db.run(
      'INSERT INTO tags (name, sort_order, intended_use, is_hidden) VALUES (?, ?, ?, 0);',
      [name, nextSort, intendedUse],
    );
    const idQ = db.exec('SELECT last_insert_rowid();');
    const newId =
      idQ.length && idQ[0].values.length ? Number(idQ[0].values[0][0]) : null;
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createTag: SQLite did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- deleteTag -----------------------------------------------------------
  //
  // Contract: js/data/contracts/deleteTag.md

  async function deleteTag(db, request = {}) {
    if (!db || typeof db.run !== 'function') {
      throw new Error('deleteTag: SQLite database is not available.');
    }
    const id = Number(request?.id ?? request?.tagId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('deleteTag: valid tag id is required.');
    }
    const tagId = Math.trunc(id);
    db.run('DELETE FROM recipe_tag_map WHERE tag_id = ?;', [tagId]);
    db.run('DELETE FROM ingredient_variant_tag_map WHERE tag_id = ?;', [tagId]);
    db.run('DELETE FROM tags WHERE id = ?;', [tagId]);
    return { id: tagId };
  }

  // ---- editTag -------------------------------------------------------------
  //
  // Contract: js/data/contracts/editTag.md

  async function editTag(db, request = {}) {
    if (!db || typeof db.run !== 'function') {
      throw new Error('editTag: SQLite database is not available.');
    }
    const id = Number(request?.id ?? request?.tagId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('editTag: valid tag id is required.');
    }
    const name = trimStr(request?.name).slice(0, 48).trim();
    if (!name) {
      throw new Error('editTag: name is required.');
    }
    const tagId = Math.trunc(id);
    db.run('UPDATE tags SET name = ? WHERE id = ?;', [name, tagId]);
    return { id: tagId };
  }

  // ---- loadTagUsage --------------------------------------------------------
  //
  // Contract: js/data/contracts/loadTagUsage.md

  const TAG_USAGE_SIZE_VARIANT_TOKENS = new Set([
    'small',
    'medium',
    'large',
    'extra-small',
    'extra small',
    'x-small',
    'x small',
    'extra-large',
    'extra large',
    'x-large',
    'x large',
    'xlarge',
    'jumbo',
    'mini',
  ]);

  function emptyTagUsage(mode = 'recipes') {
    return {
      mode: mode === 'ingredients' ? 'ingredients' : 'recipes',
      recipes: [],
      ingredients: [],
    };
  }

  function normalizeTagUsageVariant(rawVariant) {
    const variant = trimStr(rawVariant);
    return variant.toLowerCase() === 'default' ? '' : variant;
  }

  function isTagUsageSizeVariant(rawVariant) {
    const normalized = trimStr(rawVariant).toLowerCase();
    return normalized ? TAG_USAGE_SIZE_VARIANT_TOKENS.has(normalized) : false;
  }

  function makeTagUsageIngredientLabel(name, variantName) {
    const cleanName = trimStr(name);
    const cleanVariant = normalizeTagUsageVariant(variantName);
    const labelVariant =
      cleanVariant && !isTagUsageSizeVariant(cleanVariant) ? cleanVariant : '';
    return [labelVariant, cleanName].filter(Boolean).join(' ').trim();
  }

  async function loadTagUsage(db, tagId) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('loadTagUsage: SQLite database is not available.');
    }
    const id = Number(tagId);
    if (!Number.isFinite(id) || id <= 0) return emptyTagUsage();

    const tagQ = db.exec(
      `SELECT COALESCE(NULLIF(lower(trim(intended_use)), ''), 'recipes') AS intended_use
       FROM tags
       WHERE id = ?
       LIMIT 1;`,
      [Math.trunc(id)],
    );
    const tagRows =
      Array.isArray(tagQ) && tagQ.length > 0 && Array.isArray(tagQ[0].values)
        ? tagQ[0].values
        : [];
    if (!tagRows.length) return emptyTagUsage();

    const mode = normalizeIntendedUse(tagRows[0]?.[0]);
    if (mode !== 'ingredients') {
      const recipeQ = db.exec(
        `SELECT DISTINCT r.ID, r.title
         FROM recipe_tag_map m
         JOIN recipes r ON r.ID = m.recipe_id
         WHERE m.tag_id = ?
         ORDER BY r.title COLLATE NOCASE;`,
        [Math.trunc(id)],
      );
      const recipeRows =
        Array.isArray(recipeQ) &&
        recipeQ.length > 0 &&
        Array.isArray(recipeQ[0].values)
          ? recipeQ[0].values
          : [];
      return {
        mode: 'recipes',
        recipes: recipeRows.map(([recipeId, title]) => ({
          id: Number(recipeId),
          title: title == null ? '' : String(title),
        })),
        ingredients: [],
      };
    }

    const ingredientQ = db.exec(
      `SELECT DISTINCT iv.id,
              i.ID,
              i.name,
              iv.variant
       FROM ingredient_variant_tag_map ivtm
       JOIN ingredient_variants iv ON iv.id = ivtm.ingredient_variant_id
       JOIN ingredients i ON i.ID = iv.ingredient_id
       WHERE ivtm.tag_id = ?
       ORDER BY i.name COLLATE NOCASE,
                lower(trim(COALESCE(iv.variant, ''))) COLLATE NOCASE;`,
      [Math.trunc(id)],
    );
    const ingredientRows =
      Array.isArray(ingredientQ) &&
      ingredientQ.length > 0 &&
      Array.isArray(ingredientQ[0].values)
        ? ingredientQ[0].values
        : [];
    return {
      mode: 'ingredients',
      recipes: [],
      ingredients: ingredientRows.map(([, ingredientId, name, variant]) => {
        const ingredientName = trimStr(name);
        const variantName = normalizeTagUsageVariant(variant);
        return {
          ingredientId: Number(ingredientId),
          ingredientName,
          variantName,
          label: makeTagUsageIngredientLabel(ingredientName, variantName),
        };
      }),
    };
  }

  // ---- listUnits -----------------------------------------------------------
  //
  // Contract: js/data/contracts/listUnits.md

  function toNullableNumber(rawValue) {
    if (rawValue == null || rawValue === '') return null;
    const n = Number(rawValue);
    return Number.isFinite(n) ? n : null;
  }

  async function listUnits(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listUnits: SQLite database is not available.');
    }

    const result = db.exec(`
      SELECT
        code,
        name_singular,
        name_plural,
        category,
        sort_order,
        COALESCE(is_hidden, 0) AS is_hidden,
        COALESCE(is_removed, 0) AS is_removed
      FROM units
      ORDER BY sort_order ASC, code COLLATE NOCASE;
    `);
    const rows =
      Array.isArray(result) &&
      result.length > 0 &&
      Array.isArray(result[0].values)
        ? result[0].values
        : [];
    return rows.map(
      ([
        code,
        nameSingular,
        namePlural,
        category,
        sortOrder,
        isHidden,
        isRemoved,
      ]) => ({
        code: code == null ? '' : String(code),
        nameSingular: nameSingular == null ? '' : String(nameSingular),
        namePlural: namePlural == null ? '' : String(namePlural),
        category: category == null ? '' : String(category),
        sortOrder: toNullableNumber(sortOrder),
        isHidden: Number(isHidden || 0) === 1,
        isRemoved: Number(isRemoved || 0) === 1,
      }),
    );
  }

  // ---- editUnit ------------------------------------------------------------
  //
  // Contract: js/data/contracts/editUnit.md

  async function editUnit(db, request = {}) {
    if (!db || typeof db.run !== 'function') {
      throw new Error('editUnit: SQLite database is not available.');
    }
    const oldCode = trimStr(request?.oldCode ?? request?.old_code).toLowerCase();
    const code = trimStr(request?.code ?? request?.unitCode).toLowerCase();
    if (!oldCode) {
      throw new Error('editUnit: old unit code is required.');
    }
    if (!code) {
      throw new Error('editUnit: unit code is required.');
    }
    const nameSingular = trimStr(
      request?.nameSingular ?? request?.name_singular,
    );
    const namePlural = trimStr(request?.namePlural ?? request?.name_plural);
    const toWriteFlag = (value) => {
      if (value === true) return 1;
      if (value === false || value == null) return 0;
      const n = Number(value);
      return Number.isFinite(n) && n !== 0 ? 1 : 0;
    };
    const isHidden = toWriteFlag(request?.isHidden ?? request?.is_hidden);
    const isRemoved = toWriteFlag(request?.isRemoved ?? request?.is_removed);

    if (code !== oldCode) {
      if (tableHasColumn(db, 'recipe_ingredient_map', 'unit')) {
        db.run('UPDATE recipe_ingredient_map SET unit = ? WHERE unit = ?;', [
          code,
          oldCode,
        ]);
      }
      if (tableHasColumn(db, 'recipe_ingredient_substitutes', 'unit')) {
        db.run(
          'UPDATE recipe_ingredient_substitutes SET unit = ? WHERE unit = ?;',
          [code, oldCode],
        );
      }
    }

    db.run(
      'UPDATE units SET code = ?, name_singular = ?, name_plural = ?, is_hidden = ?, is_removed = ? WHERE code = ?;',
      [code, nameSingular, namePlural, isHidden, isRemoved, oldCode],
    );
    return { code };
  }

  // ---- removeUnit ----------------------------------------------------------
  //
  // Contract: js/data/contracts/removeUnit.md

  async function removeUnit(db, request = {}) {
    if (!db || typeof db.run !== 'function') {
      throw new Error('removeUnit: SQLite database is not available.');
    }
    const code = trimStr(request?.code ?? request?.unitCode);
    if (!code) {
      throw new Error('removeUnit: unit code is required.');
    }
    const action = trimStr(request?.action).toLowerCase();
    if (action !== 'remove' && action !== 'delete') {
      throw new Error('removeUnit: action must be remove or delete.');
    }
    if (action === 'remove') {
      db.run('UPDATE units SET is_removed = 1 WHERE code = ?;', [code]);
    } else {
      db.run('DELETE FROM units WHERE code = ?;', [code]);
    }
    return { code };
  }

  // ---- listSizes -----------------------------------------------------------
  //
  // Contract: js/data/contracts/listSizes.md

  async function listSizes(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listSizes: SQLite database is not available.');
    }

    const q = db.exec(`
      SELECT
        id,
        name,
        COALESCE(sort_order, 999999) AS sort_order,
        COALESCE(is_hidden, 0) AS is_hidden,
        COALESCE(is_removed, 0) AS is_removed
      FROM sizes
      ORDER BY sort_order, name COLLATE NOCASE;
    `);
    const rows =
      Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
        ? q[0].values
        : [];
    return sortSizeRows(
      rows.map(([id, name, sortOrder, isHidden, isRemoved]) => ({
        id: Number(id),
        name: name == null ? '' : String(name),
        sortOrder: toTagSortOrder(sortOrder),
        isHidden: Number(isHidden || 0) === 1,
        isRemoved: Number(isRemoved || 0) === 1,
      })),
    );
  }

  // ---- createSize ----------------------------------------------------------
  //
  // Contract: js/data/contracts/createSize.md

  async function createSize(db, request = {}) {
    if (!db || typeof db.exec !== 'function' || typeof db.run !== 'function') {
      throw new Error('createSize: SQLite database is not available.');
    }
    const name = trimStr(request?.name)
      .replace(/\s+/g, ' ')
      .slice(0, 64)
      .trim();
    if (!name) {
      throw new Error('createSize: name is required.');
    }

    const maxQ = db.exec('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM sizes;');
    const nextSort =
      maxQ.length && maxQ[0].values.length ? Number(maxQ[0].values[0][0]) || 1 : 1;

    db.run(
      'INSERT INTO sizes (name, sort_order, is_hidden, is_removed) VALUES (?, ?, 0, 0);',
      [name, nextSort],
    );
    const idQ = db.exec('SELECT last_insert_rowid();');
    const newId =
      idQ.length && idQ[0].values.length ? Number(idQ[0].values[0][0]) : null;
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createSize: SQLite did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- editSize ------------------------------------------------------------
  //
  // Contract: js/data/contracts/editSize.md

  async function editSize(db, request = {}) {
    if (!db || typeof db.run !== 'function') {
      throw new Error('editSize: SQLite database is not available.');
    }
    const id = Number(request?.id ?? request?.sizeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('editSize: valid size id is required.');
    }
    const name = trimStr(request?.name)
      .replace(/\s+/g, ' ')
      .slice(0, 64)
      .trim();
    if (!name) {
      throw new Error('editSize: name is required.');
    }
    const sizeId = Math.trunc(id);
    const toWriteFlag = (value) => {
      if (value === true) return 1;
      if (value === false || value == null) return 0;
      const n = Number(value);
      return Number.isFinite(n) && n !== 0 ? 1 : 0;
    };
    const isHidden = toWriteFlag(request?.isHidden ?? request?.is_hidden);
    const isRemoved = toWriteFlag(request?.isRemoved ?? request?.is_removed);
    db.run('UPDATE sizes SET name = ?, is_hidden = ?, is_removed = ? WHERE id = ?;', [
      name,
      isHidden,
      isRemoved,
      sizeId,
    ]);

    const oldName = trimStr(request?.oldName).replace(/\s+/g, ' ').trim();
    if (oldName && oldName.toLowerCase() !== name.toLowerCase()) {
      if (tableHasColumn(db, 'ingredients', 'size')) {
        db.run(
          `UPDATE ingredients
           SET size = ?
           WHERE lower(trim(size)) = lower(trim(?));`,
          [name, oldName],
        );
      }
      if (tableHasColumn(db, 'ingredient_sizes', 'size')) {
        db.run(
          `UPDATE ingredient_sizes
           SET size = ?
           WHERE lower(trim(size)) = lower(trim(?));`,
          [name, oldName],
        );
      }
      if (tableHasColumn(db, 'recipe_ingredient_substitutes', 'size')) {
        db.run(
          `UPDATE recipe_ingredient_substitutes
           SET size = ?
           WHERE lower(trim(size)) = lower(trim(?));`,
          [name, oldName],
        );
      }
    }
    return { id: sizeId };
  }

  // ---- removeSize ----------------------------------------------------------
  //
  // Contract: js/data/contracts/removeSize.md

  async function removeSize(db, request = {}) {
    if (!db || typeof db.run !== 'function') {
      throw new Error('removeSize: SQLite database is not available.');
    }
    const id = Number(request?.id ?? request?.sizeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('removeSize: valid size id is required.');
    }
    const action = trimStr(request?.action).toLowerCase();
    if (action !== 'remove' && action !== 'delete') {
      throw new Error('removeSize: action must be remove or delete.');
    }
    const sizeId = Math.trunc(id);
    if (action === 'remove') {
      db.run('UPDATE sizes SET is_removed = 1 WHERE id = ?;', [sizeId]);
    } else {
      db.run('DELETE FROM sizes WHERE id = ?;', [sizeId]);
    }
    return { id: sizeId };
  }

  // ---- listStores ----------------------------------------------------------
  //
  // Contract: js/data/contracts/listStores.md

  async function listStores(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listStores: SQLite database is not available.');
    }

    const q = db.exec(`
      SELECT ID, chain_name, location_name
      FROM stores
      ORDER BY chain_name COLLATE NOCASE, location_name COLLATE NOCASE;
    `);
    const rows =
      Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
        ? q[0].values
        : [];
    return rows.map(([id, chain, location]) => ({
      id: Number(id),
      chain: chain == null ? '' : String(chain),
      location: location == null ? '' : String(location),
    }));
  }

  // ---- loadStoreDetail -----------------------------------------------------
  //
  // Contract: js/data/contracts/loadStoreDetail.md

  function normalizeStoreItemKey(value) {
    return trimStr(value).toLowerCase();
  }

  function isSupportedStoreVariantName(value) {
    const v = trimStr(value);
    if (!v) return false;
    if (/[()]/.test(v)) return false;
    if (v.toLowerCase() === 'default') return false;
    return /[a-z0-9]/i.test(v);
  }

  function sortByNullableSortThenId(a, b) {
    const aSort = Number(a.sortOrder);
    const bSort = Number(b.sortOrder);
    const aRank = Number.isFinite(aSort) ? aSort : Number.POSITIVE_INFINITY;
    const bRank = Number.isFinite(bSort) ? bSort : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  }

  function buildStoreIngredientCatalog(db) {
    const byName = new Map();
    const byId = new Map();
    const hasVariantTable = tableExists(db, 'ingredient_variants');
    const hasVariantDepCol =
      hasVariantTable && tableHasColumn(db, 'ingredient_variants', 'is_deprecated');

    if (tableExists(db, 'ingredients')) {
      const q = db.exec(`
        SELECT ID, name
        FROM ingredients
        WHERE name IS NOT NULL
          AND trim(name) != ''
          AND COALESCE(is_deprecated, 0) = 0
          AND COALESCE(hide_from_shopping_list, 0) = 0
        ORDER BY name COLLATE NOCASE, ID ASC;
      `);
      rowsFromExec(q).forEach(([id, name]) => {
        const cleanName = name == null ? '' : String(name);
        const key = normalizeStoreItemKey(cleanName);
        const numericId = Number(id);
        if (!key || byName.has(key) || !Number.isFinite(numericId)) return;
        const item = {
          ingredientId: numericId,
          name: cleanName,
          baseKey: key,
          variants: [],
        };
        byName.set(key, item);
        byId.set(numericId, item);
      });
    }

    if (hasVariantTable) {
      const depSelect = hasVariantDepCol ? ', COALESCE(is_deprecated, 0)' : ', 0';
      const q = db.exec(`
        SELECT ingredient_id, id, variant, COALESCE(sort_order, 999999)${depSelect}
        FROM ingredient_variants
        WHERE variant IS NOT NULL
          AND trim(variant) != ''
        ORDER BY ingredient_id ASC, COALESCE(sort_order, 999999) ASC, id ASC;
      `);
      rowsFromExec(q).forEach((row) => {
        const ingredientId = Number(row[0]);
        const variantId = Number(row[1]);
        const variantName = row[2] == null ? '' : String(row[2]);
        const isDeprecated = boolFromDb(row[4]);
        if (
          !Number.isFinite(ingredientId) ||
          !Number.isFinite(variantId) ||
          !isSupportedStoreVariantName(variantName)
        )
          return;
        const item = byId.get(ingredientId);
        if (!item) return;
        const variantKey = normalizeStoreItemKey(variantName);
        if (item.variants.some((v) => normalizeStoreItemKey(v.name) === variantKey)) {
          return;
        }
        item.variants.push({
          id: variantId,
          name: variantName,
          isDeprecated,
        });
      });
    }

    return { byName, byId, items: Array.from(byName.values()) };
  }

  function storeKnownVariantsForCatalogItem(item) {
    return item && Array.isArray(item.variants)
      ? item.variants.map((v) => ({
          id: Number(v.id),
          name: v.name == null ? '' : String(v.name),
          isDeprecated: boolFromDb(v.isDeprecated),
        }))
      : [];
  }

  function makeStoreAisleItemSpec(ingredient, ingredientId = null) {
    if (!ingredient) return null;
    const numericIngredientId = Number(ingredientId ?? ingredient.ingredientId);
    return {
      baseName: ingredient.name == null ? '' : String(ingredient.name),
      baseKey: ingredient.baseKey || normalizeStoreItemKey(ingredient.name),
      ingredientId: Number.isFinite(numericIngredientId) ? numericIngredientId : null,
      selectedVariants: [],
      knownVariants: storeKnownVariantsForCatalogItem(ingredient),
    };
  }

  async function loadStoreDetail(db, request = {}) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('loadStoreDetail: SQLite database is not available.');
    }

    const storeId = Number(request?.storeId);
    if (!Number.isFinite(storeId) || storeId <= 0) return null;

    const storeRows = rowsFromExec(
      db.exec('SELECT ID, chain_name, location_name FROM stores WHERE ID = ?;', [
        storeId,
      ]),
    );
    if (!storeRows.length) return null;

    const [id, chain, location] = storeRows[0];
    const detail = {
      id: Number(id),
      chain: chain == null ? '' : String(chain),
      location: location == null ? '' : String(location),
      aisles: [],
      ingredientCatalog: [],
      hasVariantAisleTable: tableExists(db, 'ingredient_variant_store_location'),
    };

    const catalog = buildStoreIngredientCatalog(db);
    detail.ingredientCatalog = catalog.items.map((item) => ({
      ingredientId: item.ingredientId,
      name: item.name,
      baseKey: item.baseKey,
      variants: storeKnownVariantsForCatalogItem(item),
    }));

    if (!tableExists(db, 'store_locations')) return detail;

    const aisleRows = rowsFromExec(
      db.exec(
        `SELECT ID, name, COALESCE(sort_order, 999999) AS sort_order
         FROM store_locations
         WHERE store_id = ?
         ORDER BY COALESCE(sort_order, 999999), ID;`,
        [storeId],
      ),
    ).map(([aisleId, name, sortOrder]) => ({
      id: Number(aisleId),
      name: name == null ? '' : String(name),
      sortOrder,
      itemSpecs: [],
    }));
    aisleRows.sort(sortByNullableSortThenId);
    detail.aisles = aisleRows.map(({ id: aisleId, name, itemSpecs }) => ({
      id: aisleId,
      name,
      itemSpecs,
    }));

    const aisleById = new Map(detail.aisles.map((aisle) => [aisle.id, aisle]));
    const aisleIds = detail.aisles.map((aisle) => aisle.id);
    if (!aisleIds.length) return detail;
    const placeholders = aisleIds.map(() => '?').join(',');

    if (tableExists(db, 'ingredient_store_location')) {
      const q = db.exec(
        `SELECT isl.store_location_id, i.ID, i.name
         FROM ingredient_store_location isl
         JOIN ingredients i ON i.ID = isl.ingredient_id
         WHERE isl.store_location_id IN (${placeholders})
           AND COALESCE(i.is_deprecated, 0) = 0
           AND COALESCE(i.hide_from_shopping_list, 0) = 0
         ORDER BY isl.ID ASC;`,
        aisleIds,
      );
      rowsFromExec(q).forEach(([aisleIdRaw, ingredientIdRaw, ingredientName]) => {
        const aisle = aisleById.get(Number(aisleIdRaw));
        const key = normalizeStoreItemKey(ingredientName);
        if (!aisle || !key || aisle.itemSpecs.some((spec) => spec.baseKey === key)) {
          return;
        }
        const catalogItem = catalog.byName.get(key) || {
          ingredientId: Number(ingredientIdRaw),
          name: ingredientName == null ? '' : String(ingredientName),
          baseKey: key,
          variants: [],
        };
        const spec = makeStoreAisleItemSpec(catalogItem, ingredientIdRaw);
        if (spec) aisle.itemSpecs.push(spec);
      });
    }

    if (detail.hasVariantAisleTable && tableExists(db, 'ingredient_variants')) {
      const q = db.exec(
        `SELECT ivsl.store_location_id, i.ID, i.name, v.id, v.variant
         FROM ingredient_variant_store_location ivsl
         JOIN ingredient_variants v ON v.id = ivsl.ingredient_variant_id
         JOIN ingredients i ON i.ID = v.ingredient_id
         WHERE ivsl.store_location_id IN (${placeholders})
           AND COALESCE(i.is_deprecated, 0) = 0
           AND COALESCE(i.hide_from_shopping_list, 0) = 0
         ORDER BY ivsl.id ASC, COALESCE(v.sort_order, 999999) ASC, v.id ASC;`,
        aisleIds,
      );
      rowsFromExec(q).forEach(
        ([aisleIdRaw, ingredientIdRaw, ingredientName, , variantName]) => {
          const aisle = aisleById.get(Number(aisleIdRaw));
          const key = normalizeStoreItemKey(ingredientName);
          if (!aisle || !key || !isSupportedStoreVariantName(variantName)) return;
          let spec = aisle.itemSpecs.find((item) => item.baseKey === key);
          if (!spec) {
            const catalogItem = catalog.byName.get(key) || {
              ingredientId: Number(ingredientIdRaw),
              name: ingredientName == null ? '' : String(ingredientName),
              baseKey: key,
              variants: [],
            };
            spec = makeStoreAisleItemSpec(catalogItem, ingredientIdRaw);
            if (!spec) return;
            aisle.itemSpecs.push(spec);
          }
          const variantKey = normalizeStoreItemKey(variantName);
          if (
            !spec.selectedVariants.some(
              (name) => normalizeStoreItemKey(name) === variantKey,
            )
          ) {
            spec.selectedVariants.push(variantName == null ? '' : String(variantName));
          }
        },
      );
    }

    return detail;
  }

  // ---- lookupShoppingItemByName --------------------------------------------
  //
  // Contract: js/data/contracts/lookupShoppingItemByName.md

  async function lookupShoppingItemByName(db, request = {}) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('lookupShoppingItemByName: SQLite database is not available.');
    }

    const name = trimStr(request?.name);
    if (!name) return null;

    const directRows = rowsFromExec(
      db.exec(
        `SELECT ID, name
         FROM ingredients
         WHERE lower(trim(name)) = lower(trim(?))
         ORDER BY ID
         LIMIT 1;`,
        [name],
      ),
    );
    if (directRows.length) {
      const [id, matchedName] = directRows[0];
      const itemId = Number(id);
      if (Number.isFinite(itemId) && itemId > 0) {
        return {
          id: itemId,
          name: matchedName == null ? name : String(matchedName),
        };
      }
    }

    if (!tableExists(db, 'ingredient_synonyms')) return null;

    const synonymRows = rowsFromExec(
      db.exec(
        `SELECT i.ID, i.name
         FROM ingredient_synonyms s
         JOIN ingredients i ON i.ID = s.ingredient_id
         WHERE lower(trim(s.synonym)) = lower(trim(?))
         ORDER BY i.ID
         LIMIT 1;`,
        [name],
      ),
    );
    if (!synonymRows.length) return null;

    const [id, matchedName] = synonymRows[0];
    const itemId = Number(id);
    if (!Number.isFinite(itemId) || itemId <= 0) return null;
    return {
      id: itemId,
      name: matchedName == null ? name : String(matchedName),
    };
  }

  // ---- lookupIngredientNameByLemma -----------------------------------------
  //
  // Contract: js/data/contracts/lookupIngredientNameByLemma.md

  async function lookupIngredientNameByLemma(db, request = {}) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error(
        'lookupIngredientNameByLemma: SQLite database is not available.',
      );
    }
    const lemma = trimStr(request?.lemma);
    if (!lemma) return null;
    if (!tableHasColumn(db, 'ingredients', 'lemma')) return null;

    const rows = rowsFromExec(
      db.exec(
        `SELECT name
         FROM ingredients
         WHERE lower(trim(lemma)) = lower(trim(?))
         ORDER BY ID
         LIMIT 1;`,
        [lemma],
      ),
    );
    if (!rows.length) return null;
    const cell = rows[0][0];
    const n = cell == null ? '' : String(cell).trim();
    return n || null;
  }

  // ---- listIngredientTagNames ----------------------------------------------
  //
  // Contract: js/data/contracts/listIngredientTagNames.md

  async function listIngredientTagNames(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listIngredientTagNames: SQLite database is not available.');
    }

    const mapClause = tableExists(db, 'ingredient_variant_tag_map')
      ? `EXISTS(
          SELECT 1
          FROM ingredient_variant_tag_map ivtm
          WHERE ivtm.tag_id = t.id
        )`
      : `0`;

    const q = db.exec(`
      SELECT DISTINCT t.name
      FROM tags t
      WHERE t.name IS NOT NULL
        AND trim(t.name) != ''
        AND COALESCE(t.is_hidden, 0) = 0
        AND (
          COALESCE(NULLIF(lower(trim(t.intended_use)), ''), 'recipes') = 'ingredients'
          OR (${mapClause})
        )
      ORDER BY t.name COLLATE NOCASE;
    `);

    const rows =
      Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
        ? q[0].values
        : [];
    return rows
      .map((row) => (Array.isArray(row) ? row[0] : null))
      .map((v) => String(v == null ? '' : v).trim())
      .filter((v) => v.length > 0);
  }

  // ---- listShoppingItems ---------------------------------------------------
  //
  // Contract: js/data/contracts/listShoppingItems.md

  function normalizeShoppingHomeLocation(raw) {
    const value = trimStr(raw);
    return value || 'none';
  }

  const SHOPPING_LIST_HOME_LOCATION_IDS = new Set([
    'fridge',
    'freezer',
    'above fridge',
    'pantry',
    'cereal cabinet',
    'spices',
    'fruit stand',
    'coffee bar',
    'none',
  ]);

  const SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP = '\u0000';

  function normalizeShoppingListHomeLocation(raw) {
    const value = trimStr(raw).toLowerCase();
    if (!value || value === 'measures') return 'none';
    return SHOPPING_LIST_HOME_LOCATION_IDS.has(value) ? value : 'none';
  }

  function normalizeShoppingListSourceKeys(rawSourceKeys) {
    const out = [];
    const seen = new Set();
    (Array.isArray(rawSourceKeys) ? rawSourceKeys : []).forEach((rawKey) => {
      const key = trimStr(rawKey).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    return out;
  }

  function splitShoppingListSourceKey(sourceKey) {
    const key = trimStr(sourceKey).toLowerCase();
    const sepIndex = key.indexOf(SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP);
    if (sepIndex === -1) return { baseKey: key, variantKey: '' };
    return {
      baseKey: key.slice(0, sepIndex),
      variantKey: key.slice(sepIndex + SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP.length),
    };
  }

  // ---- isIngredientVariantDeprecated --------------------------------------
  //
  // Contract: js/data/contracts/isIngredientVariantDeprecated.md

  async function isIngredientVariantDeprecated(db, request) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error(
        'isIngredientVariantDeprecated: SQLite database is not available.',
      );
    }
    const ingredientName = trimStr(request?.ingredientName);
    const variantText = trimStr(request?.variantText);
    if (!ingredientName || !variantText) return false;
    if (variantText.toLowerCase() === 'default') return false;
    if (!tableExists(db, 'ingredient_variants')) return false;
    if (!tableHasColumn(db, 'ingredient_variants', 'is_deprecated')) return false;

    const hasIngredientDeprecated = tableHasColumn(
      db,
      'ingredients',
      'is_deprecated',
    );
    const hasLegacyHide = tableHasColumn(
      db,
      'ingredients',
      'hide_from_shopping_list',
    );
    const visibilityClause = hasIngredientDeprecated
      ? `AND COALESCE(i.is_deprecated, 0) = 0`
      : hasLegacyHide
        ? `AND COALESCE(i.hide_from_shopping_list, 0) = 0`
        : ``;
    const canonicalIds = [];
    const seen = new Set();
    const pushIds = (result) => {
      const rows =
        Array.isArray(result) &&
        result.length > 0 &&
        Array.isArray(result[0].values)
          ? result[0].values
          : [];
      rows.forEach((row) => {
        const id = Number(Array.isArray(row) ? row[0] : NaN);
        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
        seen.add(id);
        canonicalIds.push(id);
      });
    };

    pushIds(
      db.exec(
        `SELECT i.ID
           FROM ingredients i
          WHERE lower(trim(i.name)) = lower(trim(?))
            ${visibilityClause}
          ORDER BY i.ID ASC;`,
        [ingredientName],
      ),
    );
    if (tableExists(db, 'ingredient_synonyms')) {
      pushIds(
        db.exec(
          `SELECT i.ID
             FROM ingredient_synonyms s
             JOIN ingredients i ON i.ID = s.ingredient_id
            WHERE lower(trim(s.synonym)) = lower(trim(?))
              ${visibilityClause}
            ORDER BY i.ID ASC;`,
          [ingredientName],
        ),
      );
    }

    if (!canonicalIds.length) return false;
    const placeholders = canonicalIds.map(() => '?').join(',');
    const result = db.exec(
      `SELECT 1
         FROM ingredient_variants
        WHERE ingredient_id IN (${placeholders})
          AND lower(trim(variant)) = lower(trim(?))
          AND COALESCE(is_deprecated, 0) = 1
        LIMIT 1;`,
      [...canonicalIds, variantText],
    );
    return !!(
      Array.isArray(result) &&
      result.length > 0 &&
      Array.isArray(result[0].values) &&
      result[0].values.length
    );
  }

  function makeEmptyShoppingItem(row) {
    return {
      id: Number(row.id),
      name: row.name == null ? '' : String(row.name),
      variants: [],
      variantIdByName: {},
      removedVariants: [],
      locationAtHome: 'none',
      variantHomeLocations: [],
      isFood: true,
      isHidden: false,
      isRemoved: false,
      lemma: '',
      pluralByDefault: false,
      isMassNoun: false,
      pluralOverride: '',
      tags: [],
      recipeUseCount: 0,
      aisleUseCount: 0,
      _hiddenFlags: [],
      _removedFlags: [],
      _foodFlags: [],
      _lemmas: [],
      _pluralByDefaultFlags: [],
      _isMassNounFlags: [],
      _pluralOverrides: [],
      _homeLocations: [],
      _variantSeen: new Set(),
      _removedVariantSet: new Set(),
    };
  }

  function finalizeShoppingItem(item) {
    item.id = Number.isFinite(Number(item.id)) ? Number(item.id) : null;
    item.locationAtHome =
      item._homeLocations.find((value) => normalizeShoppingHomeLocation(value) !== 'none') ||
      'none';
    item.locationAtHome = normalizeShoppingHomeLocation(item.locationAtHome);
    item.isHidden = item._hiddenFlags.length ? item._hiddenFlags.every(Boolean) : false;
    item.isRemoved = item._removedFlags.length ? item._removedFlags.every(Boolean) : false;
    item.isFood = item._foodFlags.length ? item._foodFlags.some(Boolean) : true;
    item.lemma = trimStr(item._lemmas.find((value) => trimStr(value)) || '');
    item.pluralByDefault = item._pluralByDefaultFlags.some(Boolean);
    item.isMassNoun = item._isMassNounFlags.some(Boolean);
    item.pluralOverride = trimStr(
      item._pluralOverrides.find((value) => trimStr(value)) || '',
    );
    item.variantHomeLocations = item.variantHomeLocations.map((entry) => ({
      variant: entry.variant,
      homeLocation:
        normalizeShoppingHomeLocation(entry.homeLocation) === 'none' &&
        item.locationAtHome !== 'none'
          ? item.locationAtHome
          : normalizeShoppingHomeLocation(entry.homeLocation),
    }));
    item.removedVariants = item.variants.filter((variant) =>
      item._removedVariantSet.has(trimStr(variant).toLowerCase()),
    );
    delete item._hiddenFlags;
    delete item._removedFlags;
    delete item._foodFlags;
    delete item._lemmas;
    delete item._pluralByDefaultFlags;
    delete item._isMassNounFlags;
    delete item._pluralOverrides;
    delete item._homeLocations;
    delete item._variantSeen;
    delete item._removedVariantSet;
    return item;
  }

  async function listShoppingItems(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listShoppingItems: SQLite database is not available.');
    }

    const hasVariants = tableExists(db, 'ingredient_variants');
    const hasIngredientDeprecated = tableHasColumn(db, 'ingredients', 'is_deprecated');
    const hasLegacyHide = tableHasColumn(db, 'ingredients', 'hide_from_shopping_list');
    const hasIngredientHidden = tableHasColumn(db, 'ingredients', 'is_hidden');
    const hasIsFood = tableHasColumn(db, 'ingredients', 'is_food');
    const hasLemma = tableHasColumn(db, 'ingredients', 'lemma');
    const hasPluralDefault = tableHasColumn(db, 'ingredients', 'plural_by_default');
    const hasMassNoun = tableHasColumn(db, 'ingredients', 'is_mass_noun');
    const hasPluralOverride = tableHasColumn(db, 'ingredients', 'plural_override');
    const hasVariantHome = hasVariants && tableHasColumn(db, 'ingredient_variants', 'home_location');
    const hasVariantDeprecated =
      hasVariants && tableHasColumn(db, 'ingredient_variants', 'is_deprecated');

    const ingredientQ = db.exec(`
      SELECT
        ID,
        name,
        ${tableHasColumn(db, 'ingredients', 'variant') ? 'variant' : "''"} AS variant,
        ${hasIngredientDeprecated ? 'COALESCE(is_deprecated, 0)' : hasLegacyHide ? 'COALESCE(hide_from_shopping_list, 0)' : '0'} AS is_removed,
        ${hasIngredientHidden ? 'COALESCE(is_hidden, 0)' : '0'} AS is_hidden,
        ${hasIsFood ? 'COALESCE(is_food, 1)' : '1'} AS is_food,
        ${hasLemma ? "COALESCE(lemma, '')" : "''"} AS lemma,
        ${hasPluralDefault ? 'COALESCE(plural_by_default, 0)' : '0'} AS plural_by_default,
        ${hasMassNoun ? 'COALESCE(is_mass_noun, 0)' : '0'} AS is_mass_noun,
        ${hasPluralOverride ? "COALESCE(plural_override, '')" : "''"} AS plural_override
      FROM ingredients
      ORDER BY name COLLATE NOCASE, ID ASC;
    `);
    const ingredientRows =
      Array.isArray(ingredientQ) &&
      ingredientQ.length > 0 &&
      Array.isArray(ingredientQ[0].values)
        ? ingredientQ[0].values
        : [];

    const variantsByIngredientId = new Map();
    if (hasVariants) {
      const variantQ = db.exec(`
        SELECT
          id,
          ingredient_id,
          variant,
          COALESCE(sort_order, 999999) AS sort_order,
          ${hasVariantHome ? "COALESCE(home_location, 'none')" : "'none'"} AS home_location,
          ${hasVariantDeprecated ? 'COALESCE(is_deprecated, 0)' : '0'} AS is_removed
        FROM ingredient_variants
        ORDER BY ingredient_id ASC, sort_order ASC, id ASC;
      `);
      const variantRows =
        Array.isArray(variantQ) &&
        variantQ.length > 0 &&
        Array.isArray(variantQ[0].values)
          ? variantQ[0].values
          : [];
      variantRows.forEach(([id, ingredientId, variant, sortOrder, homeLocation, isRemoved]) => {
        const iid = Number(ingredientId);
        if (!Number.isFinite(iid) || iid <= 0) return;
        if (!variantsByIngredientId.has(iid)) variantsByIngredientId.set(iid, []);
        variantsByIngredientId.get(iid).push({
          id: Number(id),
          variant: variant == null ? '' : String(variant),
          sortOrder: Number(sortOrder),
          homeLocation: normalizeShoppingHomeLocation(homeLocation),
          isRemoved: Number(isRemoved || 0) === 1,
        });
      });
    }

    const groups = new Map();
    const ingredientNameById = new Map();

    ingredientRows.forEach(
      ([
        id,
        name,
        legacyVariant,
        isRemoved,
        isHidden,
        isFood,
        lemma,
        pluralByDefault,
        isMassNoun,
        pluralOverride,
      ]) => {
        const key = trimStr(name).toLowerCase();
        if (!key) return;
        const rowId = Number(id);
        ingredientNameById.set(rowId, key);
        if (!groups.has(key)) {
          groups.set(
            key,
            makeEmptyShoppingItem({
              id: rowId,
              name,
            }),
          );
        }
        const item = groups.get(key);
        if (Number.isFinite(rowId)) item.id = Math.max(Number(item.id) || 0, rowId);
        item._removedFlags.push(Number(isRemoved || 0) === 1);
        item._hiddenFlags.push(Number(isHidden || 0) === 1);
        item._foodFlags.push(Number(isFood ?? 1) === 1);
        item._lemmas.push(lemma);
        item._pluralByDefaultFlags.push(Number(pluralByDefault || 0) === 1);
        item._isMassNounFlags.push(Number(isMassNoun || 0) === 1);
        item._pluralOverrides.push(pluralOverride);

        const variants = variantsByIngredientId.get(rowId) || [];
        const baseVariant = variants.find(
          (v) => trimStr(v.variant).toLowerCase() === 'default',
        );
        item._homeLocations.push(baseVariant ? baseVariant.homeLocation : 'none');

        const variantsToUse = variants.length
          ? variants
          : legacyVariant
            ? [
                {
                  id: null,
                  variant: legacyVariant,
                  homeLocation: 'none',
                  isRemoved: false,
                },
              ]
            : [];
        variantsToUse.forEach((variantRow) => {
          const variantName = trimStr(variantRow.variant);
          const variantKey = variantName.toLowerCase();
          if (!variantName || variantKey === 'default') return;
          if (item._variantSeen.has(variantKey)) {
            if (variantRow.isRemoved) item._removedVariantSet.add(variantKey);
            return;
          }
          item._variantSeen.add(variantKey);
          item.variants.push(variantName);
          if (Number.isFinite(Number(variantRow.id)) && Number(variantRow.id) > 0) {
            item.variantIdByName[variantKey] = Number(variantRow.id);
          }
          if (variantRow.isRemoved) item._removedVariantSet.add(variantKey);
          item.variantHomeLocations.push({
            variant: variantName,
            homeLocation: normalizeShoppingHomeLocation(variantRow.homeLocation),
          });
        });
      },
    );

    if (tableExists(db, 'tags') && tableExists(db, 'ingredient_variant_tag_map') && hasVariants) {
      try {
        const tagQ = db.exec(`
          SELECT lower(trim(i.name)) AS name_key,
                 t.name AS tag_name
          FROM ingredient_variants iv
          JOIN ingredients i ON i.ID = iv.ingredient_id
          JOIN ingredient_variant_tag_map ivtm ON ivtm.ingredient_variant_id = iv.id
          JOIN tags t ON t.id = ivtm.tag_id
          WHERE COALESCE(t.is_hidden, 0) = 0;
        `);
        const rows =
          Array.isArray(tagQ) && tagQ.length > 0 && Array.isArray(tagQ[0].values)
            ? tagQ[0].values
            : [];
        const tagsByKey = new Map();
        rows.forEach(([nameKey, tagName]) => {
          const key = trimStr(nameKey).toLowerCase();
          const tag = trimStr(tagName);
          if (!key || !tag) return;
          if (!tagsByKey.has(key)) tagsByKey.set(key, new Map());
          const lower = tag.toLowerCase();
          if (!tagsByKey.get(key).has(lower)) tagsByKey.get(key).set(lower, tag);
        });
        tagsByKey.forEach((tagMap, key) => {
          const item = groups.get(key);
          if (!item) return;
          item.tags = Array.from(tagMap.values()).sort(compareAsciiNocaseString);
        });
      } catch (_) {}
    }

    try {
      if (tableExists(db, 'recipe_ingredient_map')) {
        const recipeParts = [
          `SELECT lower(trim(i.name)) AS name_key, rim.recipe_id
           FROM recipe_ingredient_map rim
           JOIN ingredients i ON i.ID = rim.ingredient_id`,
        ];
        if (tableExists(db, 'recipe_ingredient_substitutes')) {
          recipeParts.push(`
            SELECT lower(trim(i.name)) AS name_key, rim.recipe_id
            FROM recipe_ingredient_substitutes ris
            JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
            JOIN ingredients i ON i.ID = ris.ingredient_id
          `);
        }
        const recipeQ = db.exec(`
          SELECT name_key, COUNT(DISTINCT recipe_id)
          FROM (${recipeParts.join('\nUNION ALL\n')}) refs
          GROUP BY name_key;
        `);
        const rows =
          Array.isArray(recipeQ) && recipeQ.length > 0 && Array.isArray(recipeQ[0].values)
            ? recipeQ[0].values
            : [];
        rows.forEach(([nameKey, count]) => {
          const item = groups.get(trimStr(nameKey).toLowerCase());
          if (item) item.recipeUseCount = Number(count) || 0;
        });
      }
    } catch (_) {}

    try {
      const aisleParts = [];
      if (tableExists(db, 'ingredient_store_location')) {
        aisleParts.push(`
          SELECT lower(trim(i.name)) AS name_key, isl.store_location_id AS aisle_id
          FROM ingredient_store_location isl
          JOIN ingredients i ON i.ID = isl.ingredient_id
        `);
      }
      if (tableExists(db, 'ingredient_variant_store_location') && hasVariants) {
        aisleParts.push(`
          SELECT lower(trim(i.name)) AS name_key, ivsl.store_location_id AS aisle_id
          FROM ingredient_variant_store_location ivsl
          JOIN ingredient_variants v ON v.id = ivsl.ingredient_variant_id
          JOIN ingredients i ON i.ID = v.ingredient_id
        `);
      }
      if (aisleParts.length) {
        const aisleQ = db.exec(`
          SELECT name_key, COUNT(DISTINCT aisle_id)
          FROM (${aisleParts.join('\nUNION ALL\n')}) refs
          GROUP BY name_key;
        `);
        const rows =
          Array.isArray(aisleQ) && aisleQ.length > 0 && Array.isArray(aisleQ[0].values)
            ? aisleQ[0].values
            : [];
        rows.forEach(([nameKey, count]) => {
          const item = groups.get(trimStr(nameKey).toLowerCase());
          if (item) item.aisleUseCount = Number(count) || 0;
        });
      }
    } catch (_) {}

    return Array.from(groups.values())
      .map(finalizeShoppingItem)
      .sort((a, b) => compareAsciiNocaseString(a.name, b.name));
  }

  // ---- loadShoppingItemDetail ---------------------------------------------
  //
  // Contract: js/data/contracts/loadShoppingItemDetail.md

  function rowsFromExec(result) {
    return Array.isArray(result) &&
      result.length > 0 &&
      Array.isArray(result[0].values)
      ? result[0].values
      : [];
  }

  function boolFromDb(value) {
    return Number(value || 0) !== 0;
  }

  function isBaseVariantName(value) {
    const key = trimStr(value).toLowerCase();
    return !key || key === 'default';
  }

  function dedupeTextInOrder(values) {
    const out = [];
    const seen = new Set();
    (Array.isArray(values) ? values : []).forEach((value) => {
      const text = trimStr(value);
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  }

  function loadShoppingItemDetailTagsByVariantId(db, variantIds) {
    const ids = (Array.isArray(variantIds) ? variantIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const byVariantId = new Map(ids.map((id) => [id, []]));
    if (!ids.length) return byVariantId;
    if (
      !tableExists(db, 'tags') ||
      !tableExists(db, 'ingredient_variant_tag_map')
    ) {
      return byVariantId;
    }
    const hasSort = tableHasColumn(db, 'ingredient_variant_tag_map', 'sort_order');
    const placeholders = ids.map(() => '?').join(',');
    const rows = rowsFromExec(
      db.exec(
        `SELECT ivtm.ingredient_variant_id,
                t.name,
                ${hasSort ? 'COALESCE(ivtm.sort_order, 999999)' : '999999'} AS sort_order,
                ivtm.id
           FROM ingredient_variant_tag_map ivtm
           JOIN tags t ON t.id = ivtm.tag_id
          WHERE ivtm.ingredient_variant_id IN (${placeholders})
            AND COALESCE(t.is_hidden, 0) = 0
            AND trim(COALESCE(t.name, '')) != ''
          ORDER BY ivtm.ingredient_variant_id ASC,
                   sort_order ASC,
                   ivtm.id ASC,
                   t.name COLLATE NOCASE ASC;`,
        ids,
      ),
    );
    const seenByVariant = new Map();
    rows.forEach(([variantIdRaw, tagName]) => {
      const variantId = Number(variantIdRaw);
      const tag = trimStr(tagName);
      if (!Number.isFinite(variantId) || !tag || !byVariantId.has(variantId)) {
        return;
      }
      if (!seenByVariant.has(variantId)) seenByVariant.set(variantId, new Set());
      const key = tag.toLowerCase();
      if (seenByVariant.get(variantId).has(key)) return;
      seenByVariant.get(variantId).add(key);
      byVariantId.get(variantId).push(tag);
    });
    return byVariantId;
  }

  function collectShoppingItemDetailTextRows(db, tableName, columnName, targetIds) {
    if (!tableExists(db, tableName)) return [];
    const out = [];
    targetIds.forEach((ingredientId) => {
      const hasSort = tableHasColumn(db, tableName, 'sort_order');
      const rows = rowsFromExec(
        db.exec(
          `SELECT ${columnName}
             FROM ${tableName}
            WHERE ingredient_id = ?
            ORDER BY ${hasSort ? 'COALESCE(sort_order, 999999)' : 'id'} ASC,
                     id ASC;`,
          [ingredientId],
        ),
      );
      rows.forEach((row) => out.push(Array.isArray(row) ? row[0] : ''));
    });
    return dedupeTextInOrder(out);
  }

  function makeShoppingItemDetailBaseRow({
    homeLocation = 'none',
    tags = [],
    variantId = null,
    isDeprecated = false,
  } = {}) {
    return {
      isBase: true,
      value: '',
      homeLocation: normalizeShoppingListHomeLocation(homeLocation),
      tags: Array.isArray(tags) ? tags : [],
      variantId:
        Number.isFinite(Number(variantId)) && Number(variantId) > 0
          ? Number(variantId)
          : null,
      isDeprecated: !!isDeprecated,
    };
  }

  async function loadShoppingItemDetail(db, request = {}) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('loadShoppingItemDetail: SQLite database is not available.');
    }
    const ingredientId = Math.trunc(Number(request?.ingredientId));
    if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;

    const hasVariantColumn = tableHasColumn(db, 'ingredients', 'variant');
    const hasSizeColumn = tableHasColumn(db, 'ingredients', 'size');
    const hasIngredientDeprecated = tableHasColumn(db, 'ingredients', 'is_deprecated');
    const hasLegacyHide = tableHasColumn(db, 'ingredients', 'hide_from_shopping_list');
    const hasIngredientHidden = tableHasColumn(db, 'ingredients', 'is_hidden');
    const hasIsFood = tableHasColumn(db, 'ingredients', 'is_food');
    const hasPluralOverride = tableHasColumn(db, 'ingredients', 'plural_override');
    const hasPluralDefault = tableHasColumn(db, 'ingredients', 'plural_by_default');
    const hasMassNoun = tableHasColumn(db, 'ingredients', 'is_mass_noun');
    const hasLemma = tableHasColumn(db, 'ingredients', 'lemma');

    const ingredientRows = rowsFromExec(
      db.exec(
        `SELECT ID,
                name,
                ${hasVariantColumn ? "COALESCE(variant, '')" : "''"} AS variant,
                ${hasSizeColumn ? "COALESCE(size, '')" : "''"} AS size,
                ${
                  hasIngredientDeprecated
                    ? 'COALESCE(is_deprecated, 0)'
                    : hasLegacyHide
                      ? 'COALESCE(hide_from_shopping_list, 0)'
                      : '0'
                } AS is_removed,
                ${hasIngredientHidden ? 'COALESCE(is_hidden, 0)' : '0'} AS is_hidden,
                ${hasIsFood ? 'COALESCE(is_food, 1)' : '1'} AS is_food,
                ${hasPluralOverride ? "COALESCE(plural_override, '')" : "''"} AS plural_override,
                ${hasPluralDefault ? 'COALESCE(plural_by_default, 0)' : '0'} AS plural_by_default,
                ${hasMassNoun ? 'COALESCE(is_mass_noun, 0)' : '0'} AS is_mass_noun,
                ${hasLemma ? "COALESCE(lemma, '')" : "''"} AS lemma
           FROM ingredients
          WHERE ID = ?
          LIMIT 1;`,
        [ingredientId],
      ),
    );
    if (!ingredientRows.length) return null;

    const requested = ingredientRows[0];
    const name = requested[1] == null ? '' : String(requested[1]);
    const targetIds = [];
    const seenTargetIds = new Set();
    const pushTargetId = (rawId) => {
      const id = Number(rawId);
      if (!Number.isFinite(id) || id <= 0 || seenTargetIds.has(id)) return;
      seenTargetIds.add(id);
      targetIds.push(id);
    };
    pushTargetId(ingredientId);
    const itemName = trimStr(request?.itemName);
    if (itemName) {
      rowsFromExec(
        db.exec(
          `SELECT ID
             FROM ingredients
            WHERE lower(name) = lower(?)
            ORDER BY ID ASC;`,
          [itemName],
        ),
      ).forEach((row) => pushTargetId(Array.isArray(row) ? row[0] : null));
    }

    const hasVariants = tableExists(db, 'ingredient_variants');
    const hasVariantSort =
      hasVariants && tableHasColumn(db, 'ingredient_variants', 'sort_order');
    const hasVariantHome =
      hasVariants && tableHasColumn(db, 'ingredient_variants', 'home_location');
    const hasVariantDeprecated =
      hasVariants && tableHasColumn(db, 'ingredient_variants', 'is_deprecated');
    const rawVariantRows = [];
    if (hasVariants && targetIds.length) {
      const placeholders = targetIds.map(() => '?').join(',');
      rowsFromExec(
        db.exec(
          `SELECT id,
                  ingredient_id,
                  COALESCE(variant, '') AS variant,
                  ${hasVariantSort ? 'COALESCE(sort_order, 999999)' : '999999'} AS sort_order,
                  ${hasVariantHome ? "COALESCE(home_location, 'none')" : "'none'"} AS home_location,
                  ${hasVariantDeprecated ? 'COALESCE(is_deprecated, 0)' : '0'} AS is_deprecated
             FROM ingredient_variants
            WHERE ingredient_id IN (${placeholders})
            ORDER BY sort_order ASC, id ASC;`,
          targetIds,
        ),
      ).forEach(([id, iid, variant, sortOrder, homeLocation, isDeprecated]) => {
        rawVariantRows.push({
          id: Number(id),
          ingredientId: Number(iid),
          variant: trimStr(variant),
          sortOrder: Number(sortOrder),
          homeLocation: normalizeShoppingListHomeLocation(homeLocation),
          isDeprecated: boolFromDb(isDeprecated),
        });
      });
    }

    const tagsByVariantId = loadShoppingItemDetailTagsByVariantId(
      db,
      rawVariantRows.map((row) => row.id),
    );
    const firstBaseVariant = rawVariantRows.find((row) =>
      isBaseVariantName(row.variant),
    );
    const baseRow = makeShoppingItemDetailBaseRow({
      homeLocation: firstBaseVariant?.homeLocation || 'none',
      tags: firstBaseVariant ? tagsByVariantId.get(firstBaseVariant.id) || [] : [],
      variantId: firstBaseVariant?.id || null,
      isDeprecated: !!firstBaseVariant?.isDeprecated,
    });

    const variantRows = [baseRow];
    const seenVariants = new Set();
    rawVariantRows.forEach((row) => {
      const value = trimStr(row.variant);
      const key = value.toLowerCase();
      if (!value || isBaseVariantName(value) || seenVariants.has(key)) return;
      seenVariants.add(key);
      variantRows.push({
        isBase: false,
        value,
        homeLocation: normalizeShoppingListHomeLocation(row.homeLocation),
        tags: tagsByVariantId.get(row.id) || [],
        variantId: Number.isFinite(row.id) && row.id > 0 ? row.id : null,
        isDeprecated: !!row.isDeprecated,
      });
    });

    if (!hasVariants && hasVariantColumn) {
      const legacyVariants = [];
      targetIds.forEach((id) => {
        rowsFromExec(
          db.exec(
            `SELECT COALESCE(variant, '')
               FROM ingredients
              WHERE ID = ?;`,
            [id],
          ),
        ).forEach((row) => legacyVariants.push(Array.isArray(row) ? row[0] : ''));
      });
      dedupeTextInOrder(legacyVariants).forEach((value) => {
        const key = value.toLowerCase();
        if (isBaseVariantName(value) || seenVariants.has(key)) return;
        seenVariants.add(key);
        variantRows.push({
          isBase: false,
          value,
          homeLocation: 'none',
          tags: [],
          variantId: null,
          isDeprecated: false,
        });
      });
    }

    const sizeNames = tableExists(db, 'ingredient_sizes')
      ? collectShoppingItemDetailTextRows(
          db,
          'ingredient_sizes',
          'COALESCE(size, \'\')',
          targetIds,
        )
      : hasSizeColumn
        ? dedupeTextInOrder(
            targetIds.flatMap((id) =>
              rowsFromExec(
                db.exec(
                  `SELECT COALESCE(size, '')
                     FROM ingredients
                    WHERE ID = ?;`,
                  [id],
                ),
              ).map((row) => (Array.isArray(row) ? row[0] : '')),
            ),
          )
        : [];
    const synonymNames = collectShoppingItemDetailTextRows(
      db,
      'ingredient_synonyms',
      'COALESCE(synonym, \'\')',
      targetIds,
    );
    const visibility = {
      showPluralOverride: hasPluralOverride,
      showPluralByDefault: hasPluralDefault,
      showIsMassNoun: hasMassNoun,
      showAnyOverrides: hasPluralOverride || hasPluralDefault || hasMassNoun,
      showHiddenToggle: hasIngredientHidden,
    };

    return {
      id: ingredientId,
      name,
      lemma: trimStr(requested[10]),
      variantRows,
      synonymsText: synonymNames.join('\n'),
      sizesText: sizeNames.join('\n'),
      homeLocation: baseRow.homeLocation,
      isFood: boolFromDb(requested[6]),
      isRemoved: boolFromDb(requested[4]),
      isHidden: boolFromDb(requested[5]),
      pluralOverride: trimStr(requested[7]),
      pluralByDefault: boolFromDb(requested[8]),
      isMassNoun: boolFromDb(requested[9]),
      visibility,
    };
  }

  // ---- listShoppingItemRecipeUsage ----------------------------------------
  //
  // Contract: js/data/contracts/listShoppingItemRecipeUsage.md

  async function listShoppingItemRecipeUsage(db, itemName) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error(
        'listShoppingItemRecipeUsage: SQLite database is not available.',
      );
    }
    const name = trimStr(itemName);
    if (!name) return [];

    const q = db.exec(
      `SELECT DISTINCT r.ID AS recipe_id, COALESCE(r.title, '') AS recipe_title
       FROM recipes r
       JOIN (
         SELECT rim.recipe_id AS rid
         FROM recipe_ingredient_map rim
         JOIN ingredients i ON i.ID = rim.ingredient_id
         WHERE lower(i.name) = lower(?)
         UNION
         SELECT rim.recipe_id AS rid
         FROM recipe_ingredient_substitutes ris
         JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
         JOIN ingredients i2 ON i2.ID = ris.ingredient_id
         WHERE lower(i2.name) = lower(?)
       ) refs ON refs.rid = r.ID
       ORDER BY r.title COLLATE NOCASE;`,
      [name, name],
    );
    const rows =
      Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
        ? q[0].values
        : [];
    return rows
      .map(([id, title]) => ({
        id: Number(id),
        title: trimStr(title),
      }))
      .filter((row) => Number.isFinite(row.id) && row.id > 0);
  }

  // ---- listShoppingListHomeLocations --------------------------------------
  //
  // Contract: js/data/contracts/listShoppingListHomeLocations.md

  async function listShoppingListHomeLocations(db, sourceKeys) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error(
        'listShoppingListHomeLocations: SQLite database is not available.',
      );
    }
    const keys = normalizeShoppingListSourceKeys(sourceKeys);
    const out = Object.fromEntries(keys.map((key) => [key, 'none']));
    if (!keys.length) return out;

    const baseKeys = [
      ...new Set(keys.map((key) => splitShoppingListSourceKey(key).baseKey).filter(Boolean)),
    ];
    if (!baseKeys.length) return out;

    const placeholders = baseKeys.map(() => '?').join(',');
    const q = db.exec(
      `SELECT i.ID,
              lower(trim(i.name)) AS name_key,
              COALESCE(iv.variant, '') AS variant_name,
              COALESCE(iv.home_location, 'none') AS home_location,
              COALESCE(iv.sort_order, 999999) AS sort_order,
              COALESCE(iv.id, 999999) AS variant_id
       FROM ingredients i
       LEFT JOIN ingredient_variants iv ON iv.ingredient_id = i.ID
       WHERE lower(trim(i.name)) IN (${placeholders})
       ORDER BY i.ID ASC,
                COALESCE(iv.sort_order, 999999) ASC,
                COALESCE(iv.id, 999999) ASC;`,
      baseKeys,
    );
    const rows =
      Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
        ? q[0].values
        : [];
    const baseLocations = new Map();
    const variantLocations = new Map();
    rows.forEach(([, nameKeyRaw, variantRaw, locationRaw]) => {
      const nameKey = trimStr(nameKeyRaw).toLowerCase();
      if (!nameKey) return;
      const variantKey = trimStr(variantRaw).toLowerCase();
      const location = normalizeShoppingListHomeLocation(locationRaw);
      if (!variantKey || variantKey === 'default') {
        if (!baseLocations.has(nameKey)) baseLocations.set(nameKey, location);
        return;
      }
      const sourceKey = `${nameKey}${SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP}${variantKey}`;
      if (!variantLocations.has(sourceKey)) variantLocations.set(sourceKey, location);
    });

    keys.forEach((sourceKey) => {
      const { baseKey, variantKey } = splitShoppingListSourceKey(sourceKey);
      const baseLocation = normalizeShoppingListHomeLocation(baseLocations.get(baseKey));
      if (!variantKey) {
        out[sourceKey] = baseLocation;
        return;
      }
      const variantLocation = normalizeShoppingListHomeLocation(
        variantLocations.get(sourceKey),
      );
      out[sourceKey] = variantLocation === 'none' ? baseLocation : variantLocation;
    });
    return out;
  }

  // ---- loadShoppingItemVariantUsage ---------------------------------------
  //
  // Contract: js/data/contracts/loadShoppingItemVariantUsage.md

  function emptyVariantUsage() {
    return { recipes: [], aislePlacements: [] };
  }

  async function loadShoppingItemVariantUsage(db, request = {}) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error(
        'loadShoppingItemVariantUsage: SQLite database is not available.',
      );
    }
    const ingredientId = Math.trunc(Number(request?.ingredientId));
    const variantName = trimStr(request?.variantName);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !variantName) {
      return emptyVariantUsage();
    }

    const recipeQ = db.exec(
      `SELECT DISTINCT r.ID AS recipe_id, COALESCE(r.title, '') AS recipe_title
       FROM recipes r
       JOIN (
         SELECT rim.recipe_id AS rid
         FROM recipe_ingredient_map rim
         WHERE rim.ingredient_id = ?
           AND lower(trim(COALESCE(rim.variant, ''))) = lower(trim(?))
         UNION
         SELECT rim.recipe_id AS rid
         FROM recipe_ingredient_substitutes ris
         JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
         WHERE ris.ingredient_id = ?
           AND lower(trim(COALESCE(ris.variant, ''))) = lower(trim(?))
       ) refs ON refs.rid = r.ID
       ORDER BY r.title COLLATE NOCASE;`,
      [ingredientId, variantName, ingredientId, variantName],
    );
    const recipeRows =
      Array.isArray(recipeQ) &&
      recipeQ.length > 0 &&
      Array.isArray(recipeQ[0].values)
        ? recipeQ[0].values
        : [];
    const recipes = recipeRows
      .map(([id, title]) => ({
        id: Number(id),
        title: trimStr(title),
      }))
      .filter((row) => Number.isFinite(row.id) && row.id > 0);

    let aislePlacements = [];
    if (
      tableExists(db, 'ingredient_variant_store_location') &&
      tableExists(db, 'ingredient_variants') &&
      tableExists(db, 'store_locations') &&
      tableExists(db, 'stores')
    ) {
      const aisleQ = db.exec(
        `SELECT DISTINCT
           s.ID AS store_id,
           COALESCE(s.chain_name, '') AS chain_name,
           COALESCE(s.location_name, '') AS location_name,
           sl.ID AS aisle_id,
           COALESCE(sl.name, '') AS aisle_name
         FROM ingredient_variant_store_location ivsl
         JOIN ingredient_variants iv ON iv.id = ivsl.ingredient_variant_id
         JOIN store_locations sl ON sl.ID = ivsl.store_location_id
         JOIN stores s ON s.ID = sl.store_id
         WHERE iv.ingredient_id = ?
           AND lower(trim(iv.variant)) = lower(trim(?))
         ORDER BY COALESCE(s.chain_name, '') COLLATE NOCASE,
                  COALESCE(s.location_name, '') COLLATE NOCASE,
                  COALESCE(sl.sort_order, 999999),
                  sl.ID;`,
        [ingredientId, variantName],
      );
      const aisleRows =
        Array.isArray(aisleQ) &&
        aisleQ.length > 0 &&
        Array.isArray(aisleQ[0].values)
          ? aisleQ[0].values
          : [];
      aislePlacements = aisleRows
        .map(([storeIdRaw, chainName, locationName, aisleIdRaw, aisleName]) => {
          const storeId = Number(storeIdRaw);
          const aisleId = Number(aisleIdRaw);
          if (!Number.isFinite(storeId) || storeId <= 0) return null;
          if (!Number.isFinite(aisleId) || aisleId <= 0) return null;
          return {
            storeId,
            chainName: trimStr(chainName),
            locationName: trimStr(locationName),
            aisleId,
            aisleName: trimStr(aisleName),
          };
        })
        .filter(Boolean);
    }

    return { recipes, aislePlacements };
  }

  // ---- listShoppingPlanRecipeItems ----------------------------------------
  //
  // Contract: js/data/contracts/listShoppingPlanRecipeItems.md

  const SHOPPING_PLAN_KEY_SEP = '\u0000';
  const SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX = 'iv:';
  const SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH = 2;
  const RESERVED_VARIANT_NAMES = new Set(['default', 'base', 'any']);

  function shoppingPlanAggregateKey(name, variantName = '') {
    const normalizedName = trimStr(name).toLowerCase();
    const normalizedVariant = trimStr(variantName).toLowerCase();
    if (!normalizedName) return '';
    if (!normalizedVariant || normalizedVariant === 'default') return normalizedName;
    return `${normalizedName}${SHOPPING_PLAN_KEY_SEP}${normalizedVariant}`;
  }

  function shoppingPlanLabel(name, variantName = '') {
    const n = trimStr(name);
    const v = trimStr(variantName);
    if (!n) return '';
    if (!v || v.toLowerCase() === 'default') return n;
    return `${n} (${v})`;
  }

  function parseShoppingPlanQuantity(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
    if (typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)) {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  }

  function getRecipeIngredientShoppingQuantity(line) {
    const max = Number(line?.quantityMax);
    if (Number.isFinite(max) && max > 0) return max;
    const min = Number(line?.quantityMin);
    if (Number.isFinite(min) && min > 0) return min;
    return parseShoppingPlanQuantity(line?.quantity);
  }

  function normalizeShoppingPlanSelections(rawSelections) {
    const source = Array.isArray(rawSelections)
      ? rawSelections
      : rawSelections && typeof rawSelections === 'object'
        ? Object.values(rawSelections)
        : [];
    return source
      .map((entry) => ({
        recipeId: Math.trunc(Number(entry?.recipeId)),
        quantity: Number(entry?.quantity || 0),
        servings: Number(entry?.servings),
      }))
      .filter(
        (entry) =>
          Number.isFinite(entry.recipeId) &&
          entry.recipeId > 0 &&
          Number.isFinite(entry.quantity) &&
          entry.quantity > 0,
      );
  }

  function resolveShoppingPlanItemKey(db, name, variantName) {
    const rawName = trimStr(name);
    const rawVariant = trimStr(variantName);
    if (!rawName) return '';
    if (!tableExists(db, 'ingredient_variants')) {
      return shoppingPlanAggregateKey(rawName, rawVariant);
    }

    let ingredient = null;
    try {
      const q = db.exec(
        `SELECT ID, name
         FROM ingredients
         WHERE lower(trim(name)) = lower(trim(?))
         ORDER BY ID ASC
         LIMIT 1;`,
        [rawName],
      );
      if (q.length && q[0].values && q[0].values.length) {
        const [id, canonicalName] = q[0].values[0];
        ingredient = {
          id: Number(id),
          name: canonicalName == null ? rawName : String(canonicalName),
        };
      }
    } catch (_) {}
    if (!ingredient || !Number.isFinite(ingredient.id) || ingredient.id <= 0) {
      return shoppingPlanAggregateKey(rawName, rawVariant);
    }

    const variantKey = rawVariant.toLowerCase();
    if (!variantKey || RESERVED_VARIANT_NAMES.has(variantKey)) {
      return shoppingPlanAggregateKey(ingredient.name, '');
    }

    try {
      const q = db.exec(
        `SELECT id
         FROM ingredient_variants
         WHERE ingredient_id = ?
           AND lower(trim(variant)) = lower(trim(?))
         ORDER BY id ASC
         LIMIT 1;`,
        [ingredient.id, rawVariant],
      );
      if (q.length && q[0].values && q[0].values.length) {
        const variantId = Number(q[0].values[0][0]);
        if (Number.isFinite(variantId) && variantId > 0) {
          return `${SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX}${Math.trunc(variantId)}`;
        }
      }
    } catch (_) {}

    return shoppingPlanAggregateKey(ingredient.name, rawVariant);
  }

  async function listShoppingPlanRecipeItems(db, selectedRecipes = []) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listShoppingPlanRecipeItems: SQLite database is not available.');
    }

    const aggregate = new Map();
    const selections = normalizeShoppingPlanSelections(selectedRecipes);
    const recipeCache = new Map();
    const loadRecipe = async (recipeId) => {
      const id = Math.trunc(Number(recipeId));
      if (!Number.isFinite(id) || id <= 0) return null;
      if (!recipeCache.has(id)) {
        recipeCache.set(id, await loadRecipeDetail(db, id));
      }
      return recipeCache.get(id);
    };

    async function walkRecipe(recipe, context, visit) {
      if (!recipe || !Array.isArray(recipe.sections)) return;
      const normalizedRecipeId = Math.trunc(Number(context.recipeId));
      const normalizedMultiplier = Number(context.multiplier);
      const normalizedDepth = Math.max(0, Math.trunc(Number(context.depth) || 0));
      if (!Number.isFinite(normalizedMultiplier) || normalizedMultiplier <= 0) return;

      const ancestors = context.ancestors instanceof Set ? new Set(context.ancestors) : new Set();
      if (Number.isFinite(normalizedRecipeId) && normalizedRecipeId > 0) {
        ancestors.add(normalizedRecipeId);
      }

      const defaultServings = Number(recipe?.servings?.default ?? recipe?.servingsDefault);
      const selectedServings = Number(context.servings);
      const servingsMultiplier =
        Number.isFinite(defaultServings) &&
        defaultServings > 0 &&
        Number.isFinite(selectedServings) &&
        selectedServings > 0
          ? selectedServings / defaultServings
          : 1;

      for (const section of recipe.sections) {
        const ingredients = Array.isArray(section?.ingredients)
          ? section.ingredients
          : [];
        for (const line of ingredients) {
          if (!line || line.rowType === 'heading') continue;
          const linkedRecipeId = Math.trunc(Number(line.linkedRecipeId));
          if (line.isRecipe) {
            if (
              !Number.isFinite(linkedRecipeId) ||
              linkedRecipeId <= 0 ||
              normalizedDepth >= SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH ||
              ancestors.has(linkedRecipeId)
            ) {
              continue;
            }
            const linkedRecipe = await loadRecipe(linkedRecipeId);
            if (!linkedRecipe || !Array.isArray(linkedRecipe.sections)) continue;
            const linkQty = getRecipeIngredientShoppingQuantity(line);
            const multiplier =
              Number.isFinite(linkQty) && linkQty > 0 ? linkQty : 1;
            await walkRecipe(
              linkedRecipe,
              {
                recipeId: linkedRecipeId,
                multiplier: normalizedMultiplier * servingsMultiplier * multiplier,
                depth: normalizedDepth + 1,
                ancestors,
                servings: null,
              },
              visit,
            );
            continue;
          }
          visit(line, {
            multiplier: normalizedMultiplier,
            servingsMultiplier,
          });
        }
      }
    }

    for (const selection of selections) {
      const recipe = await loadRecipe(selection.recipeId);
      if (!recipe || !Array.isArray(recipe.sections)) continue;
      await walkRecipe(
        recipe,
        {
          recipeId: selection.recipeId,
          multiplier: selection.quantity,
          depth: 0,
          ancestors: new Set(),
          servings: selection.servings,
        },
        (line, { multiplier, servingsMultiplier }) => {
          const name = trimStr(line?.name);
          if (!name) return;
          const variantName = trimStr(line?.variant);
          const key = resolveShoppingPlanItemKey(db, name, variantName);
          if (!key) return;
          const ingredientQty = getRecipeIngredientShoppingQuantity(line);
          if (!Number.isFinite(ingredientQty) || ingredientQty <= 0) return;
          const quantity = Number(
            (ingredientQty * servingsMultiplier * multiplier).toFixed(4),
          );
          if (!Number.isFinite(quantity) || quantity <= 0) return;
          const existing = aggregate.get(key);
          if (existing) {
            existing.quantity = Number((existing.quantity + quantity).toFixed(4));
            return;
          }
          aggregate.set(key, {
            key,
            name,
            variantName,
            label: shoppingPlanLabel(name, variantName),
            quantity,
          });
        },
      );
    }

    return Array.from(aggregate.values());
  }

  // ---- listShoppingListAssignments ----------------------------------------
  //
  // Contract: js/data/contracts/listShoppingListAssignments.md

  const SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME = 'default';

  function normalizeAssignmentStoreIds(storeOrder, selectedStoreIds) {
    const selectedSet = new Set();
    (Array.isArray(selectedStoreIds) ? selectedStoreIds : []).forEach((rawId) => {
      const storeId = Math.trunc(Number(rawId));
      if (Number.isFinite(storeId) && storeId > 0) selectedSet.add(storeId);
    });
    const ordered = [];
    (Array.isArray(storeOrder) ? storeOrder : []).forEach((rawId) => {
      const storeId = Math.trunc(Number(rawId));
      if (!selectedSet.has(storeId)) return;
      ordered.push(storeId);
      selectedSet.delete(storeId);
    });
    (Array.isArray(selectedStoreIds) ? selectedStoreIds : []).forEach((rawId) => {
      const storeId = Math.trunc(Number(rawId));
      if (!selectedSet.has(storeId)) return;
      ordered.push(storeId);
      selectedSet.delete(storeId);
    });
    return ordered;
  }

  function normalizeAssignmentItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((item) => ({
        key: trimStr(item?.key),
        name: trimStr(item?.name),
        variantName: trimStr(item?.variantName),
      }))
      .filter((item) => item.key && item.name);
  }

  function assignmentVariantKey(name, variantName = '') {
    const nameKey = trimStr(name).toLowerCase();
    const variantKey = trimStr(variantName).toLowerCase();
    if (!nameKey) return '';
    if (!variantKey || variantKey === SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME) {
      return nameKey;
    }
    return `${nameKey}${SHOPPING_PLAN_KEY_SEP}${variantKey}`;
  }

  function compareAssignmentCandidates(a, b) {
    const ar = Number.isFinite(Number(a?.variantRank)) ? Number(a.variantRank) : -1;
    const br = Number.isFinite(Number(b?.variantRank)) ? Number(b.variantRank) : -1;
    if (ar !== br) return ar - br;
    const as = Number.isFinite(Number(a?.aisleSortOrder))
      ? Number(a.aisleSortOrder)
      : 999999;
    const bs = Number.isFinite(Number(b?.aisleSortOrder))
      ? Number(b.aisleSortOrder)
      : 999999;
    if (as !== bs) return as - bs;
    const ai = Math.trunc(Number(a?.aisleId));
    const bi = Math.trunc(Number(b?.aisleId));
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
    return compareAsciiNocaseString(a?.aisleLabel || '', b?.aisleLabel || '');
  }

  function mergeAssignmentCandidates(...candidateLists) {
    const merged = [];
    const seen = new Map();
    candidateLists.forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((candidate) => {
        const storeId = Math.trunc(Number(candidate?.storeId));
        const aisleId = Math.trunc(Number(candidate?.aisleId));
        const aisleLabel = trimStr(candidate?.aisleLabel);
        if (!Number.isFinite(storeId) || !Number.isFinite(aisleId)) return;
        const dedupeKey =
          storeId > 0 && aisleId > 0
            ? `${storeId}:${aisleId}`
            : `${storeId}:${aisleId}:${aisleLabel.toLowerCase()}`;
        if (seen.has(dedupeKey)) {
          const existingIndex = seen.get(dedupeKey);
          if (compareAssignmentCandidates(candidate, merged[existingIndex]) < 0) {
            merged[existingIndex] = candidate;
          }
          return;
        }
        seen.set(dedupeKey, merged.length);
        merged.push(candidate);
      });
    });
    return merged.sort(compareAssignmentCandidates);
  }

  function chooseAssignmentCandidates(row, maps) {
    const nameKey = trimStr(row?.name).toLowerCase();
    const variantName = trimStr(row?.variantName);
    const exactKey = variantName ? assignmentVariantKey(row.name, variantName) : '';
    const exact = exactKey ? maps.variantAssignmentMap.get(exactKey) || [] : [];
    if (exact.length) return mergeAssignmentCandidates(exact);
    const base = nameKey ? maps.baseAssignmentMap.get(nameKey) || [] : [];
    if (!variantName && base.length) return mergeAssignmentCandidates(base);
    if (!variantName && nameKey) {
      const ordered = [];
      (maps.variantOrderMap.get(nameKey) || []).forEach((variantKey, variantRank) => {
        const assignmentKey = assignmentVariantKey(nameKey, variantKey);
        (maps.variantAssignmentMap.get(assignmentKey) || []).forEach((candidate) => {
          ordered.push({ ...candidate, variantRank });
        });
      });
      const mergedOrdered = mergeAssignmentCandidates(ordered);
      if (mergedOrdered.length) return mergedOrdered;
    }
    const anyVariant = nameKey ? maps.variantAnyAssignmentMap.get(nameKey) || [] : [];
    return mergeAssignmentCandidates(base, anyVariant);
  }

  function pushAssignment(map, key, candidate) {
    const normalizedKey = trimStr(key).toLowerCase();
    if (!normalizedKey) return;
    if (!map.has(normalizedKey)) map.set(normalizedKey, []);
    map.get(normalizedKey).push(candidate);
  }

  async function listShoppingListAssignments(db, request = {}) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listShoppingListAssignments: SQLite database is not available.');
    }

    const orderedStoreIds = normalizeAssignmentStoreIds(
      request?.storeOrder,
      request?.selectedStoreIds,
    );
    const items = normalizeAssignmentItems(request?.items);
    const assignmentsByKey = {};
    items.forEach((item) => {
      assignmentsByKey[item.key] = [];
    });
    if (!orderedStoreIds.length) {
      return { selectedStores: [], assignmentsByKey };
    }
    if (!tableExists(db, 'stores') || !tableExists(db, 'store_locations')) {
      throw new Error('listShoppingListAssignments: store tables are not available.');
    }

    const storePh = orderedStoreIds.map(() => '?').join(',');
    const storeQ = db.exec(
      `SELECT ID, chain_name, location_name
       FROM stores
       WHERE ID IN (${storePh});`,
      orderedStoreIds,
    );
    const storeRows =
      Array.isArray(storeQ) && storeQ.length && Array.isArray(storeQ[0].values)
        ? storeQ[0].values
        : [];
    const storeMeta = new Map();
    storeRows.forEach(([id, chain, location]) => {
      const storeId = Math.trunc(Number(id));
      if (!Number.isFinite(storeId) || storeId <= 0) return;
      const chainName = trimStr(chain);
      const locationName = trimStr(location);
      storeMeta.set(storeId, {
        id: storeId,
        label: locationName ? `${chainName} (${locationName})` : chainName || `Store ${storeId}`,
      });
    });
    const selectedStores = orderedStoreIds
      .map((storeId) => storeMeta.get(storeId))
      .filter(Boolean);
    const effectiveStoreIds = selectedStores.map((store) => store.id);
    if (!items.length) return { selectedStores, assignmentsByKey };
    if (!effectiveStoreIds.length) return { selectedStores, assignmentsByKey };

    const uniqueNameKeys = [
      ...new Set(items.map((item) => trimStr(item.name).toLowerCase()).filter(Boolean)),
    ];
    if (!uniqueNameKeys.length) return { selectedStores, assignmentsByKey };

    const effectiveStorePh = effectiveStoreIds.map(() => '?').join(',');
    const namePh = uniqueNameKeys.map(() => '?').join(',');
    const maps = {
      baseAssignmentMap: new Map(),
      variantAssignmentMap: new Map(),
      variantAnyAssignmentMap: new Map(),
      variantOrderMap: new Map(),
    };

    if (tableExists(db, 'ingredient_store_location')) {
      const baseQ = db.exec(
        `SELECT DISTINCT
           lower(trim(i.name)) AS name_key,
           sl.store_id,
           sl.ID AS aisle_id,
           COALESCE(sl.name, '') AS aisle_name,
           COALESCE(sl.sort_order, 999999) AS aisle_sort_order
         FROM ingredient_store_location isl
         JOIN ingredients i ON i.ID = isl.ingredient_id
         JOIN store_locations sl ON sl.ID = isl.store_location_id
         WHERE sl.store_id IN (${effectiveStorePh})
           AND lower(trim(i.name)) IN (${namePh});`,
        [...effectiveStoreIds, ...uniqueNameKeys],
      );
      const rows =
        Array.isArray(baseQ) && baseQ.length && Array.isArray(baseQ[0].values)
          ? baseQ[0].values
          : [];
      rows.forEach(([nameKey, storeIdRaw, aisleIdRaw, aisleName, aisleSortOrder]) => {
        const storeId = Math.trunc(Number(storeIdRaw));
        const aisleId = Math.trunc(Number(aisleIdRaw));
        if (!Number.isFinite(storeId) || !Number.isFinite(aisleId)) return;
        pushAssignment(maps.baseAssignmentMap, nameKey, {
          storeId,
          aisleId,
          aisleLabel: trimStr(aisleName) || `Aisle ${aisleId}`,
          aisleSortOrder: Number.isFinite(Number(aisleSortOrder))
            ? Number(aisleSortOrder)
            : 999999,
        });
      });
    }

    if (
      tableExists(db, 'ingredient_variants') &&
      tableExists(db, 'ingredient_variant_store_location')
    ) {
      const variantOrderQ = db.exec(
        `SELECT lower(trim(i.name)) AS name_key,
                lower(trim(v.variant)) AS variant_key
         FROM ingredient_variants v
         JOIN ingredients i ON i.ID = v.ingredient_id
         WHERE lower(trim(i.name)) IN (${namePh})
           AND lower(trim(COALESCE(v.variant, ''))) <> ?
         ORDER BY
           lower(trim(i.name)) ASC,
           COALESCE(v.sort_order, 999999) ASC,
           COALESCE(v.id, 999999) ASC;`,
        [...uniqueNameKeys, SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME],
      );
      const variantOrderRows =
        Array.isArray(variantOrderQ) &&
        variantOrderQ.length &&
        Array.isArray(variantOrderQ[0].values)
          ? variantOrderQ[0].values
          : [];
      variantOrderRows.forEach(([nameKey, variantKey]) => {
        const n = trimStr(nameKey).toLowerCase();
        const v = trimStr(variantKey).toLowerCase();
        if (!n || !v) return;
        if (!maps.variantOrderMap.has(n)) maps.variantOrderMap.set(n, []);
        maps.variantOrderMap.get(n).push(v);
      });

      const variantQ = db.exec(
        `SELECT DISTINCT
           lower(trim(i.name)) AS name_key,
           lower(trim(v.variant)) AS variant_key,
           sl.store_id,
           sl.ID AS aisle_id,
           COALESCE(sl.name, '') AS aisle_name,
           COALESCE(sl.sort_order, 999999) AS aisle_sort_order
         FROM ingredient_variant_store_location ivsl
         JOIN ingredient_variants v ON v.id = ivsl.ingredient_variant_id
         JOIN ingredients i ON i.ID = v.ingredient_id
         JOIN store_locations sl ON sl.ID = ivsl.store_location_id
         WHERE sl.store_id IN (${effectiveStorePh})
           AND lower(trim(i.name)) IN (${namePh})
           AND lower(trim(COALESCE(v.variant, ''))) <> ?;`,
        [
          ...effectiveStoreIds,
          ...uniqueNameKeys,
          SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME,
        ],
      );
      const variantRows =
        Array.isArray(variantQ) && variantQ.length && Array.isArray(variantQ[0].values)
          ? variantQ[0].values
          : [];
      variantRows.forEach(
        ([nameKey, variantKey, storeIdRaw, aisleIdRaw, aisleName, aisleSortOrder]) => {
          const n = trimStr(nameKey).toLowerCase();
          const v = trimStr(variantKey).toLowerCase();
          const storeId = Math.trunc(Number(storeIdRaw));
          const aisleId = Math.trunc(Number(aisleIdRaw));
          if (!n || !v || !Number.isFinite(storeId) || !Number.isFinite(aisleId)) {
            return;
          }
          const candidate = {
            storeId,
            aisleId,
            aisleLabel: trimStr(aisleName) || `Aisle ${aisleId}`,
            aisleSortOrder: Number.isFinite(Number(aisleSortOrder))
              ? Number(aisleSortOrder)
              : 999999,
          };
          pushAssignment(maps.variantAnyAssignmentMap, n, candidate);
          const assignmentKey = assignmentVariantKey(n, v);
          if (assignmentKey) {
            if (!maps.variantAssignmentMap.has(assignmentKey)) {
              maps.variantAssignmentMap.set(assignmentKey, []);
            }
            maps.variantAssignmentMap.get(assignmentKey).push(candidate);
          }
        },
      );
    }

    items.forEach((item) => {
      assignmentsByKey[item.key] = chooseAssignmentCandidates(item, maps);
    });

    return { selectedStores, assignmentsByKey };
  }

  // ---- listShoppingListRecipeSummaries ------------------------------------
  //
  // Contract: js/data/contracts/listShoppingListRecipeSummaries.md

  function normalizeShoppingListRecipeSummarySelections(selectedRecipes) {
    const source = Array.isArray(selectedRecipes)
      ? selectedRecipes
      : selectedRecipes && typeof selectedRecipes === 'object'
        ? Object.values(selectedRecipes)
        : [];
    return source
      .map((entry) => ({
        recipeId: Math.trunc(Number(entry?.recipeId)),
        title: trimStr(entry?.title),
        servings: Number(entry?.servings),
      }))
      .filter((entry) => Number.isFinite(entry.recipeId) && entry.recipeId > 0);
  }

  function formatShoppingListRecipeSummaryServings(rawValue) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    const text = Number.isInteger(numeric)
      ? String(numeric)
      : String(Number(numeric.toFixed(2)));
    return text ? `${text} svg` : '';
  }

  async function listShoppingListRecipeSummaries(db, selectedRecipes = []) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error(
        'listShoppingListRecipeSummaries: SQLite database is not available.',
      );
    }

    const selections = normalizeShoppingListRecipeSummarySelections(selectedRecipes);
    if (!selections.length) return [];

    const recipeQ = db.exec(
      `SELECT ID, title, servings_default
       FROM recipes;`,
    );
    const recipeRows =
      Array.isArray(recipeQ) && recipeQ.length && Array.isArray(recipeQ[0].values)
        ? recipeQ[0].values
        : [];
    const recipesById = new Map();
    recipeRows.forEach(([id, title, servingsDefault]) => {
      const recipeId = Math.trunc(Number(id));
      if (!Number.isFinite(recipeId) || recipeId <= 0) return;
      recipesById.set(recipeId, {
        title: trimStr(title),
        servingsDefault: Number(servingsDefault),
      });
    });

    return selections
      .map((selection) => {
        const recipe = recipesById.get(selection.recipeId) || null;
        const selectedServings = Number(selection.servings);
        const defaultServings = Number(recipe?.servingsDefault);
        const servingsValue =
          Number.isFinite(selectedServings) && selectedServings > 0
            ? selectedServings
            : Number.isFinite(defaultServings) && defaultServings > 0
              ? defaultServings
              : null;
        return {
          recipeId: selection.recipeId,
          title:
            selection.title ||
            trimStr(recipe?.title) ||
            `Recipe ${selection.recipeId}`,
          servingsText: formatShoppingListRecipeSummaryServings(servingsValue),
        };
      })
      .sort((a, b) => {
        const titleDelta = compareAsciiNocaseString(a?.title || '', b?.title || '');
        if (titleDelta !== 0) return titleDelta;
        return Number(a?.recipeId || 0) - Number(b?.recipeId || 0);
      });
  }

  // ---- listShoppingListPlanRows -------------------------------------------
  //
  // Contract: js/data/contracts/listShoppingListPlanRows.md

  const SHOPPING_LIST_MEASURED_UNIT_META = Object.freeze({
    tsp: { family: 'volume', factor: 1 / 48 },
    tbsp: { family: 'volume', factor: 1 / 16 },
    cup: { family: 'volume', factor: 1 },
    'fl oz': { family: 'volume', factor: 1 / 8 },
    pt: { family: 'volume', factor: 2 },
    qt: { family: 'volume', factor: 4 },
    gal: { family: 'volume', factor: 16 },
    ml: { family: 'volume', factor: 0.00422675 },
    l: { family: 'volume', factor: 4.22675 },
    oz: { family: 'mass', factor: 1 },
    lb: { family: 'mass', factor: 16 },
    g: { family: 'mass', factor: 0.035274 },
    kg: { family: 'mass', factor: 35.274 },
  });

  const SHOPPING_LIST_UNIT_ALIASES = Object.freeze({
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    c: 'cup',
    cups: 'cup',
    ounce: 'oz',
    ounces: 'oz',
    pound: 'lb',
    pounds: 'lb',
  });

  function normalizePlanRowsUnit(unitText) {
    const raw = trimStr(unitText).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
    if (!raw) return '';
    if (Object.prototype.hasOwnProperty.call(SHOPPING_LIST_UNIT_ALIASES, raw)) {
      return SHOPPING_LIST_UNIT_ALIASES[raw];
    }
    if (raw.endsWith('ies') && raw.length > 3) return `${raw.slice(0, -3)}y`;
    if (/(ches|shes|xes|zes|ses)$/.test(raw)) return raw.slice(0, -2);
    if (raw.endsWith('s') && !raw.endsWith('ss')) return raw.slice(0, -1);
    return raw;
  }

  function formatPlanRowsQuantity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    return Number.isInteger(numeric)
      ? String(numeric)
      : String(Number(numeric.toFixed(2)));
  }

  function planRowsAggregateKey(name, variantName = '') {
    const nameKey = trimStr(name).toLowerCase();
    const variantKey = trimStr(variantName).toLowerCase();
    if (!nameKey) return '';
    if (!variantKey || variantKey === 'default') return nameKey;
    return `${nameKey}${SHOPPING_PLAN_KEY_SEP}${variantKey}`;
  }

  function planRowsLabel(name, variantName = '') {
    const n = trimStr(name);
    const v = trimStr(variantName);
    if (!n) return '';
    if (!v || v.toLowerCase() === 'default') return n;
    return `${v} ${n}`.trim();
  }

  function planRowsRecipeQuantity(line) {
    const max = Number(line?.quantityMax);
    if (Number.isFinite(max) && max > 0) return max;
    const min = Number(line?.quantityMin);
    if (Number.isFinite(min) && min > 0) return min;
    return parseShoppingPlanQuantity(line?.quantity);
  }

  function makePlanRowsBucket({ quantity, unit = '', size = '', kind = '' }) {
    const q = Number(quantity);
    if (kind === 'unspecified') {
      return { key: 'unspecified', kind: 'unspecified', quantity: 1 };
    }
    if (!Number.isFinite(q) || q <= 0) return null;
    const normalizedUnit = normalizePlanRowsUnit(unit);
    const normalizedSize = trimStr(size);
    if (kind === 'selected') {
      return { key: 'selected', kind: 'selected', quantity: q };
    }
    const measuredMeta = SHOPPING_LIST_MEASURED_UNIT_META[normalizedUnit];
    if (measuredMeta) {
      return {
        key: `measured:${measuredMeta.family}`,
        kind: 'measured',
        family: measuredMeta.family,
        baseQuantity: Number((q * measuredMeta.factor).toFixed(6)),
      };
    }
    if (normalizedUnit || normalizedSize) {
      return {
        key: `exact:${normalizedUnit}|${normalizedSize.toLowerCase()}`,
        kind: 'exact',
        quantity: q,
        unit: normalizedUnit,
        size: normalizedSize,
      };
    }
    return { key: 'count', kind: 'count', quantity: q };
  }

  function addPlanRowsBucket(target, bucket) {
    if (!target || !bucket || !bucket.key) return;
    if (!target.buckets.has(bucket.key)) {
      target.bucketOrder.push(bucket.key);
      target.buckets.set(bucket.key, { ...bucket });
      return;
    }
    const existing = target.buckets.get(bucket.key);
    if (!existing) return;
    if (bucket.kind === 'measured') {
      existing.baseQuantity = Number(
        (Number(existing.baseQuantity || 0) + Number(bucket.baseQuantity || 0)).toFixed(6),
      );
      return;
    }
    existing.quantity = Number(
      (Number(existing.quantity || 0) + Number(bucket.quantity || 0)).toFixed(4),
    );
  }

  function planRowsBucketSortPriority(bucket) {
    if (!bucket || typeof bucket !== 'object') return 99;
    if (bucket.kind === 'unspecified') return 0;
    if (bucket.kind === 'selected' || bucket.kind === 'count') return 1;
    return 2;
  }

  function planRowsMeasuredDisplay(family, baseQuantity) {
    const numeric = Number(baseQuantity);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (family === 'mass') {
      const unit = numeric >= 16 ? 'lb' : 'oz';
      return { quantity: numeric / SHOPPING_LIST_MEASURED_UNIT_META[unit].factor, unit };
    }
    if (family === 'volume') {
      const cups = numeric;
      let unit = 'tsp';
      if (cups >= 16) unit = 'gal';
      else if (cups >= 4) unit = 'qt';
      else if (cups >= 1) unit = 'cup';
      else if (numeric / SHOPPING_LIST_MEASURED_UNIT_META.tbsp.factor >= 1) {
        unit = 'tbsp';
      }
      return { quantity: numeric / SHOPPING_LIST_MEASURED_UNIT_META[unit].factor, unit };
    }
    return null;
  }

  function formatPlanRowsBucket(bucket) {
    if (!bucket) return '';
    if (bucket.kind === 'unspecified') return 'some';
    if (bucket.kind === 'measured') {
      const display = planRowsMeasuredDisplay(bucket.family, bucket.baseQuantity);
      if (!display) return '';
      return [formatPlanRowsQuantity(display.quantity), display.unit].filter(Boolean).join(' ');
    }
    const quantityText = formatPlanRowsQuantity(bucket.quantity);
    if (!quantityText) return '';
    if (bucket.kind === 'exact') {
      return [quantityText, bucket.size, bucket.unit].filter(Boolean).join(' ');
    }
    return quantityText;
  }

  function formatPlanRowsDetailText(buckets) {
    return (Array.isArray(buckets) ? buckets : [])
      .filter(Boolean)
      .slice()
      .sort((a, b) => planRowsBucketSortPriority(a) - planRowsBucketSortPriority(b))
      .map(formatPlanRowsBucket)
      .filter(Boolean)
      .join(' + ');
  }

  function planRowsSourceSortValue(buckets) {
    return (Array.isArray(buckets) ? buckets : []).reduce((sum, bucket) => {
      if (bucket?.kind === 'measured') {
        return sum + Math.max(0, Number(bucket.baseQuantity || 0));
      }
      return sum + Math.max(0, Number(bucket?.quantity || 0));
    }, 0);
  }

  function ensurePlanRowsSource(row, source) {
    const sourceType = trimStr(source?.sourceType) || 'recipe';
    const recipeId = Math.trunc(Number(source?.recipeId));
    const sourceKey =
      sourceType === 'manual'
        ? 'manual:selected'
        : `recipe:${Number.isFinite(recipeId) && recipeId > 0 ? recipeId : 0}`;
    if (!row.sources.has(sourceKey)) {
      row.sourceOrder.push(sourceKey);
      row.sources.set(sourceKey, {
        sourceType,
        sourceKey,
        recipeId: sourceType === 'recipe' && Number.isFinite(recipeId) && recipeId > 0 ? recipeId : null,
        title: trimStr(source?.title) || (sourceType === 'manual' ? 'Directly added' : 'Recipe'),
        buckets: new Map(),
        bucketOrder: [],
      });
    }
    return row.sources.get(sourceKey);
  }

  function ensurePlanRowsRow(rowsByKey, { name, variantName, variantIsRemoved }) {
    const resolvedName = trimStr(name);
    const resolvedVariant = trimStr(variantName);
    const key = planRowsAggregateKey(resolvedName, resolvedVariant);
    if (!key) return null;
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        key,
        name: resolvedName,
        variantName: resolvedVariant,
        variantIsRemoved: !!variantIsRemoved,
        label: planRowsLabel(resolvedName, resolvedVariant),
        buckets: new Map(),
        bucketOrder: [],
        sources: new Map(),
        sourceOrder: [],
      });
    }
    const row = rowsByKey.get(key);
    row.variantIsRemoved = row.variantIsRemoved || !!variantIsRemoved;
    return row;
  }

  function finalizePlanRowsRow(row) {
    const buckets = row.bucketOrder.map((key) => row.buckets.get(key)).filter(Boolean);
    const detailText = formatPlanRowsDetailText(buckets);
    const text = detailText ? `${row.label} (${detailText})` : row.label;
    if (!trimStr(text)) return null;
    const contributionRows = row.sourceOrder
      .map((key) => row.sources.get(key))
      .filter(Boolean)
      .map((source) => {
        const sourceBuckets = source.bucketOrder
          .map((key) => source.buckets.get(key))
          .filter(Boolean);
        const sourceDetail = formatPlanRowsDetailText(sourceBuckets);
        if (!sourceDetail) return null;
        return {
          sourceType: source.sourceType,
          sourceKey: source.sourceKey,
          recipeId: source.recipeId,
          title: source.title,
          detailText: sourceDetail,
          sortValue: Number(planRowsSourceSortValue(sourceBuckets).toFixed(6)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.sourceType !== b.sourceType) return a.sourceType === 'recipe' ? -1 : 1;
        const sortDelta = Number(b.sortValue || 0) - Number(a.sortValue || 0);
        if (Math.abs(sortDelta) > 1e-9) return sortDelta;
        return compareAsciiNocaseString(a.title || '', b.title || '');
      });
    return {
      key: row.key,
      name: row.name,
      variantName: row.variantName,
      variantIsRemoved: !!row.variantIsRemoved,
      label: row.label,
      detailText,
      text,
      contributionRows,
    };
  }

  function normalizePlanRowsSelectedItems(selectedItems) {
    const source = Array.isArray(selectedItems)
      ? selectedItems
      : selectedItems && typeof selectedItems === 'object'
        ? Object.values(selectedItems)
        : [];
    return source
      .map((entry) => ({
        name: trimStr(entry?.name),
        variantName: trimStr(entry?.variantName),
        quantity: Number(entry?.quantity),
      }))
      .filter((entry) => entry.name && Number.isFinite(entry.quantity) && entry.quantity > 0);
  }

  async function listShoppingListPlanRows(db, request = {}) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('listShoppingListPlanRows: SQLite database is not available.');
    }
    const selectedItems = normalizePlanRowsSelectedItems(request?.selectedItems);
    const selectedRecipes = normalizeShoppingPlanSelections(request?.selectedRecipes);
    if (!selectedItems.length && !selectedRecipes.length) return [];

    const rowsByKey = new Map();
    const itemRows = await listShoppingItems(db);
    const visibleItems = new Map();
    itemRows.forEach((item) => {
      const key = trimStr(item?.name).toLowerCase();
      if (!key || item.isHidden || item.isRemoved) return;
      visibleItems.set(key, item);
    });

    selectedItems.forEach((entry) => {
      const visible = visibleItems.get(entry.name.toLowerCase());
      if (!visible) return;
      const variantKey = entry.variantName.toLowerCase();
      const row = ensurePlanRowsRow(rowsByKey, {
        name: entry.name,
        variantName: entry.variantName,
        variantIsRemoved:
          !!variantKey &&
          Array.isArray(visible.removedVariants) &&
          visible.removedVariants.some((v) => trimStr(v).toLowerCase() === variantKey),
      });
      if (!row) return;
      const bucket = makePlanRowsBucket({
        kind: 'selected',
        quantity: entry.quantity,
      });
      addPlanRowsBucket(row, bucket);
      const source = ensurePlanRowsSource(row, {
        sourceType: 'manual',
        title: 'Directly added',
      });
      addPlanRowsBucket(source, bucket);
    });

    const recipeCache = new Map();
    const loadRecipe = async (recipeId) => {
      const id = Math.trunc(Number(recipeId));
      if (!Number.isFinite(id) || id <= 0) return null;
      if (!recipeCache.has(id)) recipeCache.set(id, await loadRecipeDetail(db, id));
      return recipeCache.get(id);
    };

    async function walkRecipe(recipe, context) {
      if (!recipe || !Array.isArray(recipe.sections)) return;
      const recipeId = Math.trunc(Number(context.recipeId));
      const multiplier = Number(context.multiplier);
      const depth = Math.max(0, Math.trunc(Number(context.depth) || 0));
      if (!Number.isFinite(multiplier) || multiplier <= 0) return;
      const ancestors = context.ancestors instanceof Set ? new Set(context.ancestors) : new Set();
      if (Number.isFinite(recipeId) && recipeId > 0) ancestors.add(recipeId);
      const defaultServings = Number(recipe?.servings?.default ?? recipe?.servingsDefault);
      const selectedServings = Number(context.servings);
      const servingsMultiplier =
        Number.isFinite(defaultServings) &&
        defaultServings > 0 &&
        Number.isFinite(selectedServings) &&
        selectedServings > 0
          ? selectedServings / defaultServings
          : 1;

      for (const section of recipe.sections) {
        const ingredients = Array.isArray(section?.ingredients) ? section.ingredients : [];
        for (const line of ingredients) {
          if (!line || line.rowType === 'heading') continue;
          const linkedRecipeId = Math.trunc(Number(line.linkedRecipeId));
          if (line.isRecipe) {
            if (
              !Number.isFinite(linkedRecipeId) ||
              linkedRecipeId <= 0 ||
              depth >= SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH ||
              ancestors.has(linkedRecipeId)
            ) {
              continue;
            }
            const linkedRecipe = await loadRecipe(linkedRecipeId);
            if (!linkedRecipe || !Array.isArray(linkedRecipe.sections)) continue;
            const linkQty = planRowsRecipeQuantity(line);
            await walkRecipe(linkedRecipe, {
              recipeId: linkedRecipeId,
              title: trimStr(linkedRecipe.title) || trimStr(line.linkedRecipeTitle) || `Recipe ${linkedRecipeId}`,
              multiplier:
                multiplier *
                servingsMultiplier *
                (Number.isFinite(linkQty) && linkQty > 0 ? linkQty : 1),
              depth: depth + 1,
              ancestors,
              servings: null,
            });
            continue;
          }

          const name = trimStr(line.name);
          if (!name) continue;
          const variantName = trimStr(line.variant);
          const variantKey = variantName.toLowerCase();
          const visible = visibleItems.get(name.toLowerCase());
          const row = ensurePlanRowsRow(rowsByKey, {
            name,
            variantName,
            variantIsRemoved:
              !!variantKey &&
              (line.variantDeprecated ||
                (visible &&
                  Array.isArray(visible.removedVariants) &&
                  visible.removedVariants.some(
                    (v) => trimStr(v).toLowerCase() === variantKey,
                  ))),
          });
          if (!row) continue;
          const qty = planRowsRecipeQuantity(line);
          const bucket =
            Number.isFinite(qty) && qty > 0
              ? makePlanRowsBucket({
                  quantity: Number((qty * servingsMultiplier * multiplier).toFixed(4)),
                  unit: line.unit || '',
                  size: line.size || '',
                })
              : makePlanRowsBucket({ kind: 'unspecified' });
          addPlanRowsBucket(row, bucket);
          const source = ensurePlanRowsSource(row, {
            sourceType: 'recipe',
            recipeId,
            title: trimStr(context.title) || trimStr(recipe.title) || `Recipe ${recipeId}`,
          });
          addPlanRowsBucket(source, bucket);
        }
      }
    }

    for (const selection of selectedRecipes) {
      const recipe = await loadRecipe(selection.recipeId);
      if (!recipe || !Array.isArray(recipe.sections)) continue;
      await walkRecipe(recipe, {
        recipeId: selection.recipeId,
        title: trimStr(selection.title) || trimStr(recipe.title) || `Recipe ${selection.recipeId}`,
        multiplier: selection.quantity,
        depth: 0,
        ancestors: new Set(),
        servings: selection.servings,
      });
    }

    return Array.from(rowsByKey.values()).map(finalizePlanRowsRow).filter(Boolean);
  }

  // ---- createRecipe --------------------------------------------------------
  //
  // Contract: js/data/contracts/createRecipe.md

  async function createRecipe(db, request = {}) {
    if (!db || typeof db.exec !== 'function' || typeof db.run !== 'function') {
      throw new Error('createRecipe: SQLite database is not available.');
    }
    const title = trimStr(request?.title);
    if (!title) {
      throw new Error('createRecipe: title is required.');
    }

    db.run(
      'INSERT INTO recipes (title, servings_min, servings_max) VALUES (?, ?, ?);',
      [title, 0.5, 99],
    );
    const idQ = db.exec('SELECT last_insert_rowid();');
    const newId =
      idQ.length && idQ[0].values.length ? Number(idQ[0].values[0][0]) : null;
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createRecipe: SQLite did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- deleteRecipe --------------------------------------------------------
  //
  // Contract: js/data/contracts/deleteRecipe.md

  async function deleteRecipe(db, request = {}) {
    if (!db || typeof db.exec !== 'function' || typeof db.run !== 'function') {
      throw new Error('deleteRecipe: SQLite database is not available.');
    }
    const id = Number(request?.id ?? request?.recipeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('deleteRecipe: valid recipe id is required.');
    }

    if (tableExists(db, 'recipe_ingredient_substitutes')) {
      db.run(
        `DELETE FROM recipe_ingredient_substitutes
         WHERE recipe_ingredient_id IN (
           SELECT ID FROM recipe_ingredient_map WHERE recipe_id = ?
         );`,
        [id],
      );
    }
    if (tableExists(db, 'recipe_ingredient_headings')) {
      db.run('DELETE FROM recipe_ingredient_headings WHERE recipe_id = ?;', [id]);
    }
    if (tableExists(db, 'recipe_steps')) {
      db.run('DELETE FROM recipe_steps WHERE recipe_id = ?;', [id]);
    }
    if (tableExists(db, 'recipe_sections')) {
      db.run('DELETE FROM recipe_sections WHERE recipe_id = ?;', [id]);
    }
    if (tableExists(db, 'recipe_ingredient_map')) {
      try {
        db.run(
          'UPDATE recipe_ingredient_map SET linked_recipe_id = NULL WHERE linked_recipe_id = ?;',
          [id],
        );
      } catch (_) {}
      try {
        db.run(
          'UPDATE recipe_ingredient_map SET subrecipe_id = NULL WHERE subrecipe_id = ?;',
          [id],
        );
      } catch (_) {}
      db.run('DELETE FROM recipe_ingredient_map WHERE recipe_id = ?;', [id]);
    }
    if (tableExists(db, 'recipe_tag_map')) {
      db.run('DELETE FROM recipe_tag_map WHERE recipe_id = ?;', [id]);
    }
    db.run('DELETE FROM recipes WHERE ID = ?;', [id]);

    return { id };
  }

  function createSqliteAdapter(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('createSqliteAdapter requires a sql.js Database instance.');
    }
    return {
      createRecipe: (request) => createRecipe(db, request),
      deleteRecipe: (request) => deleteRecipe(db, request),
      createSize: (request) => createSize(db, request),
      createTag: (request) => createTag(db, request),
      deleteTag: (request) => deleteTag(db, request),
      editTag: (request) => editTag(db, request),
      editSize: (request) => editSize(db, request),
      removeSize: (request) => removeSize(db, request),
      listRecipes: () => listRecipes(db),
      loadRecipeDetail: (recipeId) => loadRecipeDetail(db, recipeId),
      loadTagUsage: (tagId) => loadTagUsage(db, tagId),
      loadTypeaheadPools: (options) => loadTypeaheadPools(db, options),
      listTags: () => listTags(db),
      listUnits: () => listUnits(db),
      editUnit: (request) => editUnit(db, request),
      removeUnit: (request) => removeUnit(db, request),
      listSizes: () => listSizes(db),
      listStores: () => listStores(db),
      loadStoreDetail: (request) => loadStoreDetail(db, request),
      lookupShoppingItemByName: (request) => lookupShoppingItemByName(db, request),
      lookupIngredientNameByLemma: (request) =>
        lookupIngredientNameByLemma(db, request),
      listIngredientTagNames: () => listIngredientTagNames(db),
      listShoppingItems: () => listShoppingItems(db),
      loadShoppingItemDetail: (request) => loadShoppingItemDetail(db, request),
      listShoppingItemRecipeUsage: (itemName) =>
        listShoppingItemRecipeUsage(db, itemName),
      listShoppingListHomeLocations: (sourceKeys) =>
        listShoppingListHomeLocations(db, sourceKeys),
      isIngredientVariantDeprecated: (request) =>
        isIngredientVariantDeprecated(db, request),
      loadShoppingItemVariantUsage: (request) =>
        loadShoppingItemVariantUsage(db, request),
      listShoppingPlanRecipeItems: (selectedRecipes) =>
        listShoppingPlanRecipeItems(db, selectedRecipes),
      listShoppingListAssignments: (request) =>
        listShoppingListAssignments(db, request),
      listShoppingListRecipeSummaries: (selectedRecipes) =>
        listShoppingListRecipeSummaries(db, selectedRecipes),
      listShoppingListPlanRows: (request) => listShoppingListPlanRows(db, request),
    };
  }

  global.createSqliteAdapter = createSqliteAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
