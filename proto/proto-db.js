(function () {
  const SQL_CDN_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0';
  let sqlInitPromise = null;

  function getTableColumns(db, tableName) {
    try {
      const result = db.exec(`PRAGMA table_info(${tableName});`);
      if (!result.length) return [];
      return result[0].values.map((row) => String(row[1] || '').trim());
    } catch (_) {
      return [];
    }
  }

  function canUseBrowserFilePicker() {
    return true;
  }

  async function ensureSqlModule() {
    if (window.SQL) return window.SQL;
    if (!sqlInitPromise) {
      if (typeof initSqlJs !== 'function') {
        throw new Error('sql.js runtime is unavailable');
      }
      sqlInitPromise = initSqlJs({
        locateFile: (file) => `${SQL_CDN_BASE}/${file}`,
      }).then((SQL) => {
        window.SQL = SQL;
        return SQL;
      });
    }
    return sqlInitPromise;
  }

  async function readDbBytes() {
    try {
      const stored = localStorage.getItem('favoriteEatsDb');
      if (stored) return new Uint8Array(JSON.parse(stored));
    } catch (err) {
      console.warn('Proto DB load from localStorage failed:', err);
    }

    const cache = window.favoriteEatsSqliteBlobCache;
    if (cache && typeof cache.read === 'function') {
      try {
        const fromIdb = await cache.read();
        if (fromIdb instanceof Uint8Array && fromIdb.length) return fromIdb;
      } catch (err) {
        console.warn('Proto DB load from IndexedDB failed:', err);
      }
    }

    return null;
  }

  async function storeBrowserDbFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const cache = window.favoriteEatsSqliteBlobCache;
    try {
      localStorage.setItem('favoriteEatsDb', JSON.stringify(Array.from(bytes)));
      if (cache && typeof cache.write === 'function') {
        try {
          await cache.write(bytes);
        } catch (err) {
          console.warn('Proto DB IndexedDB mirror failed:', err);
        }
      }
    } catch (err) {
      if (cache && typeof cache.write === 'function') {
        await cache.write(bytes);
      } else {
        throw err;
      }
    }
    return bytes;
  }

  async function withDb(callback) {
    const SQL = await ensureSqlModule();
    const bytes = await readDbBytes();
    if (!bytes || !bytes.length) return { ok: false, reason: 'db-unavailable' };

    const db = new SQL.Database(bytes);
    try {
      return await callback(db);
    } finally {
      if (typeof db.close === 'function') db.close();
    }
  }

  async function loadRecipeTitles() {
    try {
      return await withDb((db) => {
        const result = db.exec(
          'SELECT ID, title FROM recipes ORDER BY title COLLATE NOCASE;'
        );
        if (!result.length) {
          return { ok: true, reason: 'empty', rows: [] };
        }

        const rows = result[0].values
          .map(([id, title]) => ({
            id: Number(id),
            title: String(title || '').trim(),
          }))
          .filter((row) => row.title);

        return {
          ok: true,
          reason: rows.length ? 'ok' : 'empty',
          rows,
        };
      });
    } catch (err) {
      console.warn('Proto recipe query failed:', err);
      return {
        ok: false,
        reason: 'query-failed',
        rows: [],
      };
    }
  }

  function toPositiveNumberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function buildIngredientLine(row) {
    const parts = [];
    const quantity = String(
      row.quantityDisplay != null ? row.quantityDisplay : row.quantity || ''
    ).trim();
    const unit = String(row.unit || '').trim();
    const name = String(row.name || '').trim();
    const variant = String(row.variant || '').trim();
    const parenthetical = String(row.parentheticalNote || '').trim();
    const prep = String(row.prepNotes || '').trim();

    if (quantity) parts.push(quantity);
    if (unit) parts.push(unit);
    if (name) parts.push(name);
    if (variant) parts.push(variant);

    let line = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (parenthetical) line += ` (${parenthetical})`;
    if (prep) line += line ? `, ${prep}` : prep;
    return line || name || 'Untitled ingredient';
  }

  async function loadRecipeDetail(recipeId) {
    const normalizedId = Number(recipeId);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
      return { ok: false, reason: 'invalid-recipe-id' };
    }

    try {
      return await withDb((db) => {
        const recipeQ = db.exec(
          `SELECT ID, title, servings_default, servings_min, servings_max
           FROM recipes WHERE ID=${normalizedId};`
        );
        if (!recipeQ.length || !recipeQ[0].values.length) {
          return { ok: false, reason: 'not-found' };
        }

        const [[id, title, servingsDefault, servingsMin, servingsMax]] =
          recipeQ[0].values;
        const ingredientsQ = db.exec(
          `
          SELECT rim.quantity,
                 rim.quantity_min,
                 rim.quantity_max,
                 COALESCE(rim.quantity_is_approx, 0) AS quantity_is_approx,
                 rim.unit,
                 COALESCE(
                   CASE
                     WHEN rim.display_name IS NOT NULL AND TRIM(rim.display_name) <> ''
                       THEN rim.display_name
                     ELSE i.name
                   END,
                   ''
                 ) AS name,
                 COALESCE(
                   CASE
                     WHEN rim.variant IS NULL THEN i.variant
                     ELSE rim.variant
                   END,
                   ''
                 ) AS variant,
                 COALESCE(rim.parenthetical_note, i.parenthetical_note, '') AS parenthetical_note,
                 COALESCE(rim.prep_notes, '') AS prep_notes
          FROM recipe_ingredient_map rim
          LEFT JOIN ingredients i ON i.ID = rim.ingredient_id
          WHERE rim.recipe_id=${normalizedId}
          ORDER BY COALESCE(rim.sort_order, 999999), rim.ID;
          `
        );

        const ingredientLines = ingredientsQ.length
          ? ingredientsQ[0].values
              .map(
                ([
                  quantity,
                  quantityMin,
                  quantityMax,
                  quantityIsApprox,
                  unit,
                  name,
                  variant,
                  parentheticalNote,
                  prepNotes,
                ]) => {
                  const ingredient = {
                    quantity: String(quantity || '').trim(),
                    quantityMin: toPositiveNumberOrNull(quantityMin),
                    quantityMax: toPositiveNumberOrNull(quantityMax),
                    quantityIsApprox: Number(quantityIsApprox) === 1,
                    unit: String(unit || '').trim(),
                    name: String(name || '').trim(),
                    variant: String(variant || '').trim(),
                    parentheticalNote: String(parentheticalNote || '').trim(),
                    prepNotes: String(prepNotes || '').trim(),
                  };

                  return {
                    ...ingredient,
                    displayText: buildIngredientLine(ingredient),
                  };
                }
              )
              .filter((ingredient) => ingredient.displayText)
          : [];

        const stepCols = getTableColumns(db, 'recipe_steps').map((col) => col.toLowerCase());
        const hasType = stepCols.includes('type');
        const stepsQ = db.exec(
          `
          SELECT step_number, instructions${hasType ? ', type' : ''}
          FROM recipe_steps
          WHERE recipe_id=${normalizedId}
          ORDER BY step_number;
          `
        );

        const instructionLines = stepsQ.length
          ? stepsQ[0].values
              .map((row) => {
                const stepNumber = Array.isArray(row) ? row[0] : null;
                const instructions = Array.isArray(row) ? row[1] : '';
                const rawType = hasType && Array.isArray(row) ? row[2] : 'step';
                const text = String(instructions || '').trim();
                if (!text) return null;
                return {
                  stepNumber:
                    stepNumber == null || stepNumber === '' ? null : Number(stepNumber),
                  text,
                  type: String(rawType || '').trim() === 'heading' ? 'heading' : 'step',
                };
              })
              .filter(Boolean)
          : [];

        return {
          ok: true,
          reason: 'ok',
          recipe: {
            id: Number(id),
            title: String(title || '').trim() || 'Untitled',
            servingsDefault:
              servingsDefault == null || servingsDefault === ''
                ? null
                : Number(servingsDefault),
            servingsMin:
              servingsMin == null || servingsMin === '' ? null : Number(servingsMin),
            servingsMax:
              servingsMax == null || servingsMax === '' ? null : Number(servingsMax),
            ingredients: ingredientLines,
            instructions: instructionLines,
          },
        };
      });
    } catch (err) {
      console.warn('Proto recipe detail query failed:', err);
      return { ok: false, reason: 'query-failed' };
    }
  }

  window.protoDb = {
    buildIngredientLine,
    canUseBrowserFilePicker,
    storeBrowserDbFile,
    loadRecipeTitles,
    loadRecipeDetail,
  };
})();
