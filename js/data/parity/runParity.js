// Browser-based parity runner for the data service contracts.
//
// One file per capability under js/data/fixtures/<capability>.json. Each
// fixture has an `input` describing the rows that exist in the data source
// and an `expected` describing the canonical adapter output (or null).
//
// For every fixture the runner runs BOTH adapters:
//
//   - SQLite path: seed an in-memory sql.js DB with the fixture's input,
//     call the SQLite adapter, deep-compare to `expected`.
//   - Supabase path: build a mock fetch that returns the fixture data in
//     the shape PostgREST would return, inject into the Supabase adapter,
//     deep-compare to `expected`.
//
// Both adapters MUST produce `expected` for every fixture. Any divergence
// is a parity failure and blocks cutover.

(function bootParityRunner(global) {
  const SQL_WASM_BASE = '../../';
  const FAKE_SUPABASE_URL = 'https://parity.test.invalid';
  const FAKE_SUPABASE_ANON_KEY = 'parity-fake-key';

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a == null || b == null) return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (typeof a === 'object') {
      const aKeys = Object.keys(a).sort();
      const bKeys = Object.keys(b).sort();
      if (aKeys.length !== bKeys.length) return false;
      for (let i = 0; i < aKeys.length; i++) {
        if (aKeys[i] !== bKeys[i]) return false;
        if (!deepEqual(a[aKeys[i]], b[aKeys[i]])) return false;
      }
      return true;
    }
    return false;
  }

  function pretty(json) {
    try {
      return JSON.stringify(json, null, 2);
    } catch (_) {
      return String(json);
    }
  }

  function makeMockFetch(rowsResolver) {
    // rowsResolver(url) returns the array of rows the mock should respond
    // with for that URL. Lets a single capability fan out to multiple
    // PostgREST queries (e.g. recipe + tags + steps + ingredients) by
    // pattern-matching the URL.
    return async function mockFetch(url, init = {}) {
      const auth = init && init.headers ? init.headers.Authorization : '';
      const apikey = init && init.headers ? init.headers.apikey : '';
      const method = String(init?.method || 'GET').toUpperCase();
      const profile =
        method === 'GET'
          ? init?.headers?.['Accept-Profile']
          : init?.headers?.['Content-Profile'] || init?.headers?.['Accept-Profile'];
      if (!String(url).startsWith(FAKE_SUPABASE_URL)) {
        throw new Error(`mockFetch: unexpected URL host: ${url}`);
      }
      if (!auth || !apikey) {
        throw new Error('mockFetch: missing Authorization or apikey headers.');
      }
      if (profile !== 'catalog') {
        throw new Error(
          `mockFetch: expected Accept-Profile=catalog, got "${profile}".`,
        );
      }
      const rows = rowsResolver(String(url), init);
      return {
        ok: true,
        status: method === 'POST' ? 201 : 200,
        json: async () => rows,
        text: async () => JSON.stringify(rows),
      };
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listRecipes
  // -------------------------------------------------------------------------

  const listRecipesCapability = {
    name: 'listRecipes',
    fixturesUrl: '../fixtures/listRecipes.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE recipes (
          ID INTEGER PRIMARY KEY,
          title TEXT,
          servings_default REAL,
          servings_min REAL,
          servings_max REAL
        );
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          name TEXT,
          is_hidden INTEGER
        );
        CREATE TABLE recipe_tag_map (
          id INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          tag_id INTEGER,
          sort_order REAL
        );
      `);
    },

    seedFixture(db, input) {
      const recipes = Array.isArray(input?.recipes) ? input.recipes : [];
      const tags = Array.isArray(input?.tags) ? input.tags : [];
      const tagMap = Array.isArray(input?.recipe_tag_map)
        ? input.recipe_tag_map
        : [];

      recipes.forEach((r) => {
        db.run(
          'INSERT INTO recipes (ID, title, servings_default, servings_min, servings_max) VALUES (?, ?, ?, ?, ?);',
          [r.ID, r.title, r.servings_default, r.servings_min, r.servings_max],
        );
      });
      tags.forEach((t) => {
        db.run('INSERT INTO tags (id, name, is_hidden) VALUES (?, ?, ?);', [
          t.id,
          t.name,
          t.is_hidden,
        ]);
      });
      tagMap.forEach((m) => {
        db.run(
          'INSERT INTO recipe_tag_map (id, recipe_id, tag_id, sort_order) VALUES (?, ?, ?, ?);',
          [m.id, m.recipe_id, m.tag_id, m.sort_order],
        );
      });
    },

    async runSqlite(db /*, fixture */) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listRecipes();
    },

    async runSupabase(fixture) {
      const rows = listRecipesFixtureToPostgrest(fixture.input);
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(() => rows),
      });
      return adapter.listRecipes();
    },
  };

  function listRecipesFixtureToPostgrest(input) {
    const recipes = Array.isArray(input?.recipes) ? input.recipes : [];
    const tags = Array.isArray(input?.tags) ? input.tags : [];
    const tagMap = Array.isArray(input?.recipe_tag_map)
      ? input.recipe_tag_map
      : [];

    const tagById = new Map();
    tags.forEach((t) => tagById.set(t.id, t));

    const mapsByRecipe = new Map();
    tagMap.forEach((m) => {
      if (!mapsByRecipe.has(m.recipe_id)) mapsByRecipe.set(m.recipe_id, []);
      const tag = tagById.get(m.tag_id);
      mapsByRecipe.get(m.recipe_id).push({
        id: m.id,
        sort_order: m.sort_order,
        tags: tag
          ? { name: tag.name, is_hidden: !!Number(tag.is_hidden) }
          : null,
      });
    });

    return recipes.map((r) => ({
      id: r.ID,
      title: r.title,
      servings_default: r.servings_default,
      servings_min: r.servings_min,
      servings_max: r.servings_max,
      recipe_tag_map: mapsByRecipe.get(r.ID) || [],
    }));
  }

  // -------------------------------------------------------------------------
  // Capability: createRecipe
  // -------------------------------------------------------------------------

  const createRecipeCapability = {
    name: 'createRecipe',
    fixturesUrl: '../fixtures/createRecipe.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE recipes (
          ID INTEGER PRIMARY KEY,
          title TEXT,
          servings_default REAL,
          servings_min REAL,
          servings_max REAL
        );
      `);
    },

    seedFixture(db, input) {
      const recipes = Array.isArray(input?.recipes) ? input.recipes : [];
      recipes.forEach((r) => {
        db.run(
          'INSERT INTO recipes (ID, title, servings_default, servings_min, servings_max) VALUES (?, ?, ?, ?, ?);',
          [r.ID, r.title, r.servings_default, r.servings_min, r.servings_max],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      const actual = await adapter.createRecipe(fixture.input?.request);
      verifyCreatedRecipeRow(db, actual.id, fixture.input?.request?.title);
      return actual;
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildCreateRecipeMock(fixture)),
      });
      return adapter.createRecipe(fixture.input?.request);
    },
  };

  function verifyCreatedRecipeRow(db, id, rawTitle) {
    const title = String(rawTitle == null ? '' : rawTitle).trim();
    const q = db.exec(
      'SELECT title, servings_min, servings_max FROM recipes WHERE ID = ?;',
      [id],
    );
    if (!q.length || !q[0].values.length) {
      throw new Error('createRecipe parity: created SQLite row was not found.');
    }
    const [storedTitle, servingsMin, servingsMax] = q[0].values[0];
    if (storedTitle !== title || Number(servingsMin) !== 0.5 || Number(servingsMax) !== 99) {
      throw new Error('createRecipe parity: SQLite row did not match the contract.');
    }
  }

  function buildCreateRecipeMock(fixture) {
    const expectedId = fixture.input?.supabaseAssignedId;
    const expectedTitle = String(fixture.input?.request?.title ?? '').trim();
    return function resolveRows(url, init) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];
      if (table !== 'recipes') {
        throw new Error(`buildCreateRecipeMock: unmatched table "${table}".`);
      }
      if (String(init?.method || '').toUpperCase() !== 'POST') {
        throw new Error('buildCreateRecipeMock: expected POST.');
      }
      let body;
      try {
        body = JSON.parse(String(init?.body || '{}'));
      } catch (err) {
        throw new Error(`buildCreateRecipeMock: invalid JSON body: ${err.message || err}`);
      }
      if (
        body.title !== expectedTitle ||
        Number(body.servings_min) !== 0.5 ||
        Number(body.servings_max) !== 99
      ) {
        throw new Error('buildCreateRecipeMock: insert body did not match the contract.');
      }
      return [{ id: expectedId }];
    };
  }

  // -------------------------------------------------------------------------
  // Capability: deleteRecipe
  // -------------------------------------------------------------------------

  const deleteRecipeCapability = {
    name: 'deleteRecipe',
    fixturesUrl: '../fixtures/deleteRecipe.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE recipes (
          ID INTEGER PRIMARY KEY,
          title TEXT
        );
        CREATE TABLE recipe_tag_map (
          id INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          tag_id INTEGER
        );
        CREATE TABLE recipe_steps (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER
        );
        CREATE TABLE recipe_sections (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER
        );
        CREATE TABLE recipe_ingredient_map (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          linked_recipe_id INTEGER,
          subrecipe_id INTEGER
        );
        CREATE TABLE recipe_ingredient_substitutes (
          id INTEGER PRIMARY KEY,
          recipe_ingredient_id INTEGER
        );
        CREATE TABLE recipe_ingredient_headings (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      seedDeleteRecipeRows(db, input || {});
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      const actual = await adapter.deleteRecipe(fixture.input?.request);
      verifyDeleteRecipeSqliteState(db, fixture.expectedState);
      return actual;
    },

    async runSupabase(fixture) {
      const mock = buildDeleteRecipeMock(fixture);
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(mock.resolveRows),
      });
      const actual = await adapter.deleteRecipe(fixture.input?.request);
      mock.verify();
      return actual;
    },
  };

  function deleteRecipeList(input, key) {
    return Array.isArray(input?.[key]) ? input[key] : [];
  }

  function seedDeleteRecipeRows(db, input) {
    deleteRecipeList(input, 'recipes').forEach((row) => {
      db.run('INSERT INTO recipes (ID, title) VALUES (?, ?);', [
        row.ID,
        row.title,
      ]);
    });
    deleteRecipeList(input, 'recipe_tag_map').forEach((row) => {
      db.run('INSERT INTO recipe_tag_map (id, recipe_id, tag_id) VALUES (?, ?, ?);', [
        row.id,
        row.recipe_id,
        row.tag_id,
      ]);
    });
    deleteRecipeList(input, 'recipe_steps').forEach((row) => {
      db.run('INSERT INTO recipe_steps (ID, recipe_id) VALUES (?, ?);', [
        row.ID,
        row.recipe_id,
      ]);
    });
    deleteRecipeList(input, 'recipe_sections').forEach((row) => {
      db.run('INSERT INTO recipe_sections (ID, recipe_id) VALUES (?, ?);', [
        row.ID,
        row.recipe_id,
      ]);
    });
    deleteRecipeList(input, 'recipe_ingredient_map').forEach((row) => {
      db.run(
        `INSERT INTO recipe_ingredient_map
         (ID, recipe_id, linked_recipe_id, subrecipe_id)
         VALUES (?, ?, ?, ?);`,
        [row.ID, row.recipe_id, row.linked_recipe_id, row.subrecipe_id],
      );
    });
    deleteRecipeList(input, 'recipe_ingredient_substitutes').forEach((row) => {
      db.run(
        'INSERT INTO recipe_ingredient_substitutes (id, recipe_ingredient_id) VALUES (?, ?);',
        [row.id, row.recipe_ingredient_id],
      );
    });
    deleteRecipeList(input, 'recipe_ingredient_headings').forEach((row) => {
      db.run('INSERT INTO recipe_ingredient_headings (ID, recipe_id) VALUES (?, ?);', [
        row.ID,
        row.recipe_id,
      ]);
    });
  }

  function readDeleteRecipeStateFromSqlite(db) {
    const read = (table, columns, orderColumn) => {
      const q = db.exec(
        `SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${orderColumn};`,
      );
      const rows = q.length && Array.isArray(q[0].values) ? q[0].values : [];
      return rows.map((values) => {
        const out = {};
        columns.forEach((column, index) => {
          out[column] = values[index];
        });
        return out;
      });
    };
    return {
      recipes: read('recipes', ['ID', 'title'], 'ID'),
      recipe_tag_map: read('recipe_tag_map', ['id', 'recipe_id', 'tag_id'], 'id'),
      recipe_steps: read('recipe_steps', ['ID', 'recipe_id'], 'ID'),
      recipe_sections: read('recipe_sections', ['ID', 'recipe_id'], 'ID'),
      recipe_ingredient_map: read(
        'recipe_ingredient_map',
        ['ID', 'recipe_id', 'linked_recipe_id', 'subrecipe_id'],
        'ID',
      ),
      recipe_ingredient_substitutes: read(
        'recipe_ingredient_substitutes',
        ['id', 'recipe_ingredient_id'],
        'id',
      ),
      recipe_ingredient_headings: read(
        'recipe_ingredient_headings',
        ['ID', 'recipe_id'],
        'ID',
      ),
    };
  }

  function verifyDeleteRecipeSqliteState(db, expectedState) {
    const actualState = readDeleteRecipeStateFromSqlite(db);
    if (!deepEqual(actualState, expectedState || {})) {
      throw new Error(
        `deleteRecipe parity: SQLite state mismatch.\nexpected ${pretty(
          expectedState,
        )}\nactual ${pretty(actualState)}`,
      );
    }
  }

  function cloneDeleteRecipeState(input) {
    return {
      recipes: deleteRecipeList(input, 'recipes').map((row) => ({ ...row })),
      recipe_tag_map: deleteRecipeList(input, 'recipe_tag_map').map((row) => ({ ...row })),
      recipe_steps: deleteRecipeList(input, 'recipe_steps').map((row) => ({ ...row })),
      recipe_sections: deleteRecipeList(input, 'recipe_sections').map((row) => ({ ...row })),
      recipe_ingredient_map: deleteRecipeList(input, 'recipe_ingredient_map').map((row) => ({ ...row })),
      recipe_ingredient_substitutes: deleteRecipeList(
        input,
        'recipe_ingredient_substitutes',
      ).map((row) => ({ ...row })),
      recipe_ingredient_headings: deleteRecipeList(
        input,
        'recipe_ingredient_headings',
      ).map((row) => ({ ...row })),
    };
  }

  function applyDeleteRecipeToState(state, id) {
    const ownedIngredientIds = new Set(
      state.recipe_ingredient_map
        .filter((row) => Number(row.recipe_id) === id)
        .map((row) => Number(row.ID)),
    );
    state.recipe_ingredient_substitutes = state.recipe_ingredient_substitutes.filter(
      (row) => !ownedIngredientIds.has(Number(row.recipe_ingredient_id)),
    );
    state.recipe_ingredient_headings = state.recipe_ingredient_headings.filter(
      (row) => Number(row.recipe_id) !== id,
    );
    state.recipe_steps = state.recipe_steps.filter(
      (row) => Number(row.recipe_id) !== id,
    );
    state.recipe_sections = state.recipe_sections.filter(
      (row) => Number(row.recipe_id) !== id,
    );
    state.recipe_ingredient_map = state.recipe_ingredient_map
      .filter((row) => Number(row.recipe_id) !== id)
      .map((row) => ({
        ...row,
        linked_recipe_id:
          Number(row.linked_recipe_id) === id ? null : row.linked_recipe_id,
        subrecipe_id: Number(row.subrecipe_id) === id ? null : row.subrecipe_id,
      }));
    state.recipe_tag_map = state.recipe_tag_map.filter(
      (row) => Number(row.recipe_id) !== id,
    );
    state.recipes = state.recipes.filter((row) => Number(row.ID) !== id);
  }

  function buildDeleteRecipeMock(fixture) {
    const state = cloneDeleteRecipeState(fixture.input || {});
    const expectedState = fixture.expectedState || {};
    return {
      resolveRows(url, init) {
        const path = String(url).split('/rest/v1/')[1] || '';
        const table = path.split('?')[0];
        if (table !== 'recipes') {
          throw new Error(`buildDeleteRecipeMock: unmatched table "${table}".`);
        }
        if (String(init?.method || '').toUpperCase() !== 'DELETE') {
          throw new Error('buildDeleteRecipeMock: expected DELETE.');
        }
        const id = Number(getEqFilter(url, 'id'));
        if (!Number.isFinite(id) || id <= 0) {
          throw new Error('buildDeleteRecipeMock: expected positive id filter.');
        }
        applyDeleteRecipeToState(state, id);
        return [];
      },
      verify() {
        if (!deepEqual(state, expectedState)) {
          throw new Error(
            `deleteRecipe parity: Supabase state mismatch.\nexpected ${pretty(
              expectedState,
            )}\nactual ${pretty(state)}`,
          );
        }
      },
    };
  }

  // -------------------------------------------------------------------------
  // Capability: loadRecipeDetail
  // -------------------------------------------------------------------------

  const loadRecipeDetailCapability = {
    name: 'loadRecipeDetail',
    fixturesUrl: '../fixtures/loadRecipeDetail.json',

    setupSchema(db) {
      // Modern schema only — no legacy fallback columns. bridge.loadRecipeFromDB
      // detects which columns exist and skips the rest.
      db.run(`
        CREATE TABLE recipes (
          ID INTEGER PRIMARY KEY,
          title TEXT,
          servings_default REAL,
          servings_min REAL,
          servings_max REAL
        );
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          name TEXT,
          is_hidden INTEGER,
          sort_order INTEGER
        );
        CREATE TABLE recipe_tag_map (
          id INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          tag_id INTEGER,
          sort_order REAL
        );
        CREATE TABLE recipe_steps (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          step_number INTEGER,
          instructions TEXT,
          type TEXT
        );
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT,
          variant TEXT,
          size TEXT,
          parenthetical_note TEXT,
          lemma TEXT,
          plural_by_default INTEGER,
          is_mass_noun INTEGER,
          plural_override TEXT,
          is_deprecated INTEGER
        );
        CREATE TABLE ingredient_variants (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          variant TEXT,
          home_location TEXT,
          is_deprecated INTEGER
        );
        CREATE TABLE recipe_ingredient_map (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          ingredient_id INTEGER,
          section_id INTEGER,
          sort_order REAL,
          quantity TEXT,
          quantity_min REAL,
          quantity_max REAL,
          quantity_is_approx INTEGER,
          unit TEXT,
          variant TEXT,
          size TEXT,
          prep_notes TEXT,
          is_optional INTEGER,
          parenthetical_note TEXT,
          is_recipe INTEGER,
          linked_recipe_id INTEGER,
          recipe_text TEXT,
          is_alt INTEGER,
          display_name TEXT
        );
        CREATE TABLE recipe_ingredient_headings (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          section_id INTEGER,
          sort_order REAL,
          text TEXT
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('recipes').forEach((r) => {
        db.run(
          'INSERT INTO recipes (ID, title, servings_default, servings_min, servings_max) VALUES (?, ?, ?, ?, ?);',
          [r.ID, r.title, r.servings_default, r.servings_min, r.servings_max],
        );
      });
      list('tags').forEach((t) => {
        db.run(
          'INSERT INTO tags (id, name, is_hidden, sort_order) VALUES (?, ?, ?, ?);',
          [t.id, t.name, t.is_hidden, t.sort_order ?? null],
        );
      });
      list('recipe_tag_map').forEach((m) => {
        db.run(
          'INSERT INTO recipe_tag_map (id, recipe_id, tag_id, sort_order) VALUES (?, ?, ?, ?);',
          [m.id, m.recipe_id, m.tag_id, m.sort_order],
        );
      });
      list('recipe_steps').forEach((s) => {
        db.run(
          'INSERT INTO recipe_steps (ID, recipe_id, step_number, instructions, type) VALUES (?, ?, ?, ?, ?);',
          [s.ID, s.recipe_id, s.step_number, s.instructions, s.type],
        );
      });
      list('ingredients').forEach((i) => {
        db.run(
          `INSERT INTO ingredients
           (ID, name, variant, size, parenthetical_note, lemma,
            plural_by_default, is_mass_noun, plural_override, is_deprecated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            i.ID,
            i.name,
            i.variant,
            i.size,
            i.parenthetical_note,
            i.lemma,
            i.plural_by_default,
            i.is_mass_noun,
            i.plural_override,
            i.is_deprecated,
          ],
        );
      });
      list('ingredient_variants').forEach((v) => {
        db.run(
          `INSERT INTO ingredient_variants
           (id, ingredient_id, variant, home_location, is_deprecated)
           VALUES (?, ?, ?, ?, ?);`,
          [
            v.id,
            v.ingredient_id,
            v.variant,
            v.home_location,
            v.is_deprecated,
          ],
        );
      });
      list('recipe_ingredient_map').forEach((rim) => {
        db.run(
          `INSERT INTO recipe_ingredient_map
           (ID, recipe_id, ingredient_id, section_id, sort_order,
            quantity, quantity_min, quantity_max, quantity_is_approx,
            unit, variant, size, prep_notes, is_optional, parenthetical_note,
            is_recipe, linked_recipe_id, recipe_text, is_alt, display_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            rim.ID,
            rim.recipe_id,
            rim.ingredient_id,
            rim.section_id,
            rim.sort_order,
            rim.quantity,
            rim.quantity_min,
            rim.quantity_max,
            rim.quantity_is_approx,
            rim.unit,
            rim.variant,
            rim.size,
            rim.prep_notes,
            rim.is_optional,
            rim.parenthetical_note,
            rim.is_recipe,
            rim.linked_recipe_id,
            rim.recipe_text,
            rim.is_alt,
            rim.display_name,
          ],
        );
      });
      list('recipe_ingredient_headings').forEach((h) => {
        db.run(
          `INSERT INTO recipe_ingredient_headings
           (ID, recipe_id, section_id, sort_order, text)
           VALUES (?, ?, ?, ?, ?);`,
          [h.ID, h.recipe_id, h.section_id, h.sort_order, h.text],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.loadRecipeDetail(fixture.recipeId);
    },

    async runSupabase(fixture) {
      if (typeof global.createSupabaseAdapter !== 'function') {
        throw new Error('Supabase adapter not loaded.');
      }
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildLoadRecipeDetailMock(fixture)),
      });
      if (typeof adapter.loadRecipeDetail !== 'function') {
        throw new Error('Supabase adapter is missing loadRecipeDetail.');
      }
      return adapter.loadRecipeDetail(fixture.recipeId);
    },
  };

  // Builds the URL → rows resolver for loadRecipeDetail's PostgREST queries.
  // The Supabase adapter issues five reads, each scoped by recipe_id eq the
  // requested recipeId. The mock pattern-matches the URL's table name and
  // returns rows shaped like what PostgREST would respond with.
  function buildLoadRecipeDetailMock(fixture) {
    const input = fixture.input || {};
    const recipeId = Number(fixture.recipeId);

    const allRecipes = Array.isArray(input.recipes) ? input.recipes : [];
    const allTags = Array.isArray(input.tags) ? input.tags : [];
    const allTagMap = Array.isArray(input.recipe_tag_map)
      ? input.recipe_tag_map
      : [];
    const allSteps = Array.isArray(input.recipe_steps)
      ? input.recipe_steps
      : [];
    const allIngredients = Array.isArray(input.ingredients)
      ? input.ingredients
      : [];
    const allVariants = Array.isArray(input.ingredient_variants)
      ? input.ingredient_variants
      : [];
    const allRim = Array.isArray(input.recipe_ingredient_map)
      ? input.recipe_ingredient_map
      : [];
    const allHeadings = Array.isArray(input.recipe_ingredient_headings)
      ? input.recipe_ingredient_headings
      : [];

    const recipesById = new Map();
    allRecipes.forEach((r) => recipesById.set(r.ID, r));
    const tagsById = new Map();
    allTags.forEach((t) => tagsById.set(t.id, t));
    const variantsByIngredientId = new Map();
    allVariants.forEach((v) => {
      if (!variantsByIngredientId.has(v.ingredient_id)) {
        variantsByIngredientId.set(v.ingredient_id, []);
      }
      variantsByIngredientId.get(v.ingredient_id).push(v);
    });
    const ingredientsById = new Map();
    allIngredients.forEach((i) => ingredientsById.set(i.ID, i));

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'recipes') {
        // The adapter queries `recipes?id=eq.{id}&...&limit=1` first, then
        // also embeds a linked_recipe lookup on the rim query. Only the
        // standalone /rest/v1/recipes call lands here; the embedded
        // linked_recipe is delivered as part of the rim row below.
        const r = recipesById.get(recipeId);
        if (!r) return [];
        return [
          {
            id: r.ID,
            title: r.title,
            servings_default: r.servings_default,
            servings_min: r.servings_min,
            servings_max: r.servings_max,
          },
        ];
      }

      if (table === 'recipe_tag_map') {
        return allTagMap
          .filter((m) => m.recipe_id === recipeId)
          .map((m) => {
            const tag = tagsById.get(m.tag_id);
            return {
              id: m.id,
              sort_order: m.sort_order,
              tags: tag
                ? { name: tag.name, is_hidden: !!Number(tag.is_hidden) }
                : null,
            };
          });
      }

      if (table === 'recipe_steps') {
        return allSteps
          .filter((s) => s.recipe_id === recipeId)
          .map((s) => ({
            id: s.ID,
            step_number: s.step_number,
            instructions: s.instructions,
            type: s.type,
          }));
      }

      if (table === 'recipe_ingredient_headings') {
        return allHeadings
          .filter((h) => h.recipe_id === recipeId)
          .map((h) => ({
            id: h.ID,
            section_id: h.section_id,
            sort_order: h.sort_order,
            heading_text: h.text,
          }));
      }

      if (table === 'recipe_ingredient_map') {
        return allRim
          .filter((r) => r.recipe_id === recipeId)
          .map((r) => {
            const ing = ingredientsById.get(r.ingredient_id) || null;
            const linkedRec = recipesById.get(r.linked_recipe_id) || null;
            const variants = ing
              ? variantsByIngredientId.get(ing.ID) || []
              : [];
            return {
              id: r.ID,
              section_id: r.section_id,
              sort_order: r.sort_order,
              quantity: r.quantity,
              quantity_min: r.quantity_min,
              quantity_max: r.quantity_max,
              quantity_is_approx: r.quantity_is_approx,
              unit: r.unit,
              variant: r.variant,
              size: r.size,
              prep_notes: r.prep_notes,
              is_optional: r.is_optional,
              parenthetical_note: r.parenthetical_note,
              is_recipe: r.is_recipe,
              linked_recipe_id: r.linked_recipe_id,
              recipe_text: r.recipe_text,
              is_alt: r.is_alt,
              display_name: r.display_name,
              ingredients: ing
                ? {
                    id: ing.ID,
                    name: ing.name,
                    variant: ing.variant,
                    size: ing.size,
                    parenthetical_note: ing.parenthetical_note,
                    lemma: ing.lemma,
                    plural_by_default: ing.plural_by_default,
                    is_mass_noun: ing.is_mass_noun,
                    plural_override: ing.plural_override,
                    is_deprecated: ing.is_deprecated,
                    ingredient_variants: variants.map((v) => ({
                      id: v.id,
                      variant: v.variant,
                      home_location: v.home_location,
                      is_deprecated: v.is_deprecated,
                    })),
                  }
                : null,
              linked_recipe: linkedRec ? { title: linkedRec.title } : null,
            };
          });
      }

      throw new Error(`buildLoadRecipeDetailMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: loadTypeaheadPools
  // -------------------------------------------------------------------------

  const loadTypeaheadPoolsCapability = {
    name: 'loadTypeaheadPools',
    fixturesUrl: '../fixtures/loadTypeaheadPools.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT,
          is_deprecated INTEGER,
          hide_from_shopping_list INTEGER,
          is_hidden INTEGER
        );
        CREATE TABLE ingredient_synonyms (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          synonym TEXT
        );
        CREATE TABLE ingredient_variants (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          variant TEXT,
          sort_order INTEGER,
          is_deprecated INTEGER
        );
        CREATE TABLE units (
          code TEXT PRIMARY KEY,
          sort_order INTEGER,
          is_removed INTEGER
        );
        CREATE TABLE sizes (
          id INTEGER PRIMARY KEY,
          name TEXT,
          sort_order INTEGER,
          is_removed INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('ingredients').forEach((i) => {
        db.run(
          `INSERT INTO ingredients
           (ID, name, is_deprecated, hide_from_shopping_list, is_hidden)
           VALUES (?, ?, ?, ?, ?);`,
          [
            i.ID,
            i.name,
            i.is_deprecated,
            i.hide_from_shopping_list,
            i.is_hidden,
          ],
        );
      });
      list('ingredient_synonyms').forEach((s) => {
        db.run(
          'INSERT INTO ingredient_synonyms (id, ingredient_id, synonym) VALUES (?, ?, ?);',
          [s.id, s.ingredient_id, s.synonym],
        );
      });
      list('ingredient_variants').forEach((v) => {
        db.run(
          `INSERT INTO ingredient_variants
           (id, ingredient_id, variant, sort_order, is_deprecated)
           VALUES (?, ?, ?, ?, ?);`,
          [v.id, v.ingredient_id, v.variant, v.sort_order, v.is_deprecated],
        );
      });
      list('units').forEach((u) => {
        db.run(
          'INSERT INTO units (code, sort_order, is_removed) VALUES (?, ?, ?);',
          [u.code, u.sort_order, u.is_removed],
        );
      });
      list('sizes').forEach((s) => {
        db.run(
          'INSERT INTO sizes (id, name, sort_order, is_removed) VALUES (?, ?, ?, ?);',
          [s.id, s.name, s.sort_order, s.is_removed],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.loadTypeaheadPools({
        ingredientName: fixture.ingredientName,
      });
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildLoadTypeaheadPoolsMock(fixture)),
      });
      return adapter.loadTypeaheadPools({
        ingredientName: fixture.ingredientName,
      });
    },
  };

  function buildLoadTypeaheadPoolsMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'ingredients') {
        return list('ingredients').map((row) => ({
          id: row.ID,
          name: row.name,
          is_deprecated: row.is_deprecated,
          hide_from_shopping_list: row.hide_from_shopping_list,
          is_hidden: row.is_hidden,
        }));
      }
      if (table === 'ingredient_synonyms') {
        return list('ingredient_synonyms').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          synonym: row.synonym,
        }));
      }
      if (table === 'ingredient_variants') {
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
          sort_order: row.sort_order,
          is_deprecated: row.is_deprecated,
        }));
      }
      if (table === 'units') {
        return list('units').map((row) => ({
          code: row.code,
          sort_order: row.sort_order,
          is_removed: row.is_removed,
        }));
      }
      if (table === 'sizes') {
        return list('sizes').map((row) => ({
          id: row.id,
          name: row.name,
          sort_order: row.sort_order,
          is_removed: row.is_removed,
        }));
      }

      throw new Error(`buildLoadTypeaheadPoolsMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listTags
  // -------------------------------------------------------------------------

  const listTagsCapability = {
    name: 'listTags',
    fixturesUrl: '../fixtures/listTags.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          name TEXT,
          is_hidden INTEGER,
          sort_order INTEGER,
          intended_use TEXT
        );
        CREATE TABLE recipe_tag_map (
          id INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          tag_id INTEGER,
          sort_order INTEGER
        );
        CREATE TABLE ingredient_variant_tag_map (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          tag_id INTEGER,
          sort_order INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('tags').forEach((t) => {
        db.run(
          `INSERT INTO tags
           (id, name, is_hidden, sort_order, intended_use)
           VALUES (?, ?, ?, ?, ?);`,
          [t.id, t.name, t.is_hidden, t.sort_order, t.intended_use],
        );
      });
      list('recipe_tag_map').forEach((m) => {
        db.run(
          `INSERT INTO recipe_tag_map
           (id, recipe_id, tag_id, sort_order)
           VALUES (?, ?, ?, ?);`,
          [m.id, m.recipe_id, m.tag_id, m.sort_order],
        );
      });
      list('ingredient_variant_tag_map').forEach((m) => {
        db.run(
          `INSERT INTO ingredient_variant_tag_map
           (id, ingredient_variant_id, tag_id, sort_order)
           VALUES (?, ?, ?, ?);`,
          [m.id, m.ingredient_variant_id, m.tag_id, m.sort_order],
        );
      });
    },

    async runSqlite(db /*, fixture */) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listTags();
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListTagsMock(fixture)),
      });
      return adapter.listTags();
    },
  };

  function buildListTagsMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'tags') {
        return list('tags').map((row) => ({
          id: row.id,
          name: row.name,
          is_hidden: row.is_hidden,
          sort_order: row.sort_order,
          intended_use: row.intended_use,
        }));
      }
      if (table === 'recipe_tag_map') {
        return list('recipe_tag_map').map((row) => ({
          id: row.id,
          tag_id: row.tag_id,
        }));
      }
      if (table === 'ingredient_variant_tag_map') {
        return list('ingredient_variant_tag_map').map((row) => ({
          id: row.id,
          tag_id: row.tag_id,
        }));
      }

      throw new Error(`buildListTagsMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: createTag
  // -------------------------------------------------------------------------

  const createTagCapability = {
    name: 'createTag',
    fixturesUrl: '../fixtures/createTag.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE,
          is_hidden INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER,
          intended_use TEXT NOT NULL DEFAULT 'recipes'
        );
        CREATE UNIQUE INDEX idx_tags_name_nocase
        ON tags(name COLLATE NOCASE);
      `);
    },

    seedFixture(db, input) {
      const tags = Array.isArray(input?.tags) ? input.tags : [];
      tags.forEach((t) => {
        db.run(
          `INSERT INTO tags
           (id, name, is_hidden, sort_order, intended_use)
           VALUES (?, ?, ?, ?, ?);`,
          [t.id, t.name, t.is_hidden, t.sort_order, t.intended_use],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      const actual = await adapter.createTag(fixture.input?.request);
      verifyCreatedTagRow(db, actual.id, fixture);
      return actual;
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildCreateTagMock(fixture)),
      });
      return adapter.createTag(fixture.input?.request);
    },
  };

  function cleanTagName(rawName) {
    return String(rawName == null ? '' : rawName).trim().slice(0, 48).trim();
  }

  function normalizeTagIntendedUse(rawUse) {
    return String(rawUse == null ? '' : rawUse).trim().toLowerCase() ===
      'ingredients'
      ? 'ingredients'
      : 'recipes';
  }

  function nextTagSort(input) {
    const tags = Array.isArray(input?.tags) ? input.tags : [];
    return (
      tags.reduce((max, row) => {
        const n = Number(row?.sort_order);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0) + 1
    );
  }

  function verifyCreatedTagRow(db, id, fixture) {
    const expectedName = cleanTagName(fixture.input?.request?.name);
    const expectedUse = normalizeTagIntendedUse(
      fixture.input?.request?.intendedUse ?? fixture.input?.request?.useFor,
    );
    const expectedSort = nextTagSort(fixture.input || {});
    const q = db.exec(
      'SELECT name, sort_order, intended_use, is_hidden FROM tags WHERE id = ?;',
      [id],
    );
    if (!q.length || !q[0].values.length) {
      throw new Error('createTag parity: created SQLite row was not found.');
    }
    const [storedName, sortOrder, intendedUse, isHidden] = q[0].values[0];
    if (
      storedName !== expectedName ||
      Number(sortOrder) !== expectedSort ||
      normalizeTagIntendedUse(intendedUse) !== expectedUse ||
      Number(isHidden) !== 0
    ) {
      throw new Error('createTag parity: SQLite row did not match the contract.');
    }
  }

  function buildCreateTagMock(fixture) {
    const expectedId = fixture.input?.supabaseAssignedId;
    const expectedName = cleanTagName(fixture.input?.request?.name);
    const expectedUse = normalizeTagIntendedUse(
      fixture.input?.request?.intendedUse ?? fixture.input?.request?.useFor,
    );
    const expectedSort = nextTagSort(fixture.input || {});
    let sawRead = false;
    return function resolveRows(url, init) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];
      if (table !== 'tags') {
        throw new Error(`buildCreateTagMock: unmatched table "${table}".`);
      }
      const method = String(init?.method || 'GET').toUpperCase();
      if (method === 'GET') {
        sawRead = true;
        const tags = Array.isArray(fixture.input?.tags) ? fixture.input.tags : [];
        return tags.map((row) => ({ sort_order: row.sort_order }));
      }
      if (method !== 'POST') {
        throw new Error(`buildCreateTagMock: unexpected method "${method}".`);
      }
      if (!sawRead) {
        throw new Error('buildCreateTagMock: expected sort-order read before insert.');
      }
      let body;
      try {
        body = JSON.parse(String(init?.body || '{}'));
      } catch (err) {
        throw new Error(`buildCreateTagMock: invalid JSON body: ${err.message || err}`);
      }
      if (
        body.name !== expectedName ||
        Number(body.sort_order) !== expectedSort ||
        normalizeTagIntendedUse(body.intended_use) !== expectedUse ||
        Number(body.is_hidden) !== 0
      ) {
        throw new Error('buildCreateTagMock: insert body did not match the contract.');
      }
      return [{ id: expectedId }];
    };
  }

  // -------------------------------------------------------------------------
  // Capability: deleteTag
  // -------------------------------------------------------------------------

  const deleteTagCapability = {
    name: 'deleteTag',
    fixturesUrl: '../fixtures/deleteTag.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE
        );
        CREATE TABLE recipe_tag_map (
          id INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          tag_id INTEGER
        );
        CREATE TABLE ingredient_variant_tag_map (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          tag_id INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      seedDeleteTagRows(db, input || {});
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      const actual = await adapter.deleteTag(fixture.input?.request);
      verifyDeleteTagSqliteState(db, fixture.expectedState);
      return actual;
    },

    async runSupabase(fixture) {
      const mock = buildDeleteTagMock(fixture);
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(mock.resolveRows),
      });
      const actual = await adapter.deleteTag(fixture.input?.request);
      mock.verify();
      return actual;
    },
  };

  function deleteTagList(input, key) {
    return Array.isArray(input?.[key]) ? input[key] : [];
  }

  function seedDeleteTagRows(db, input) {
    deleteTagList(input, 'tags').forEach((row) => {
      db.run('INSERT INTO tags (id, name) VALUES (?, ?);', [row.id, row.name]);
    });
    deleteTagList(input, 'recipe_tag_map').forEach((row) => {
      db.run('INSERT INTO recipe_tag_map (id, recipe_id, tag_id) VALUES (?, ?, ?);', [
        row.id,
        row.recipe_id,
        row.tag_id,
      ]);
    });
    deleteTagList(input, 'ingredient_variant_tag_map').forEach((row) => {
      db.run(
        `INSERT INTO ingredient_variant_tag_map
         (id, ingredient_variant_id, tag_id)
         VALUES (?, ?, ?);`,
        [row.id, row.ingredient_variant_id, row.tag_id],
      );
    });
  }

  function readDeleteTagStateFromSqlite(db) {
    const read = (table, columns, orderColumn) => {
      const q = db.exec(
        `SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${orderColumn};`,
      );
      const rows = q.length && Array.isArray(q[0].values) ? q[0].values : [];
      return rows.map((values) => {
        const out = {};
        columns.forEach((column, index) => {
          out[column] = values[index];
        });
        return out;
      });
    };
    return {
      tags: read('tags', ['id', 'name'], 'id'),
      recipe_tag_map: read('recipe_tag_map', ['id', 'recipe_id', 'tag_id'], 'id'),
      ingredient_variant_tag_map: read(
        'ingredient_variant_tag_map',
        ['id', 'ingredient_variant_id', 'tag_id'],
        'id',
      ),
    };
  }

  function verifyDeleteTagSqliteState(db, expectedState) {
    const actualState = readDeleteTagStateFromSqlite(db);
    if (!deepEqual(actualState, expectedState || {})) {
      throw new Error(
        `deleteTag parity: SQLite state mismatch.\nexpected ${pretty(
          expectedState,
        )}\nactual ${pretty(actualState)}`,
      );
    }
  }

  function cloneDeleteTagState(input) {
    return {
      tags: deleteTagList(input, 'tags').map((row) => ({ ...row })),
      recipe_tag_map: deleteTagList(input, 'recipe_tag_map').map((row) => ({
        ...row,
      })),
      ingredient_variant_tag_map: deleteTagList(
        input,
        'ingredient_variant_tag_map',
      ).map((row) => ({ ...row })),
    };
  }

  function applyDeleteTagToState(state, id) {
    state.recipe_tag_map = state.recipe_tag_map.filter(
      (row) => Number(row.tag_id) !== id,
    );
    state.ingredient_variant_tag_map = state.ingredient_variant_tag_map.filter(
      (row) => Number(row.tag_id) !== id,
    );
    state.tags = state.tags.filter((row) => Number(row.id) !== id);
  }

  function buildDeleteTagMock(fixture) {
    const state = cloneDeleteTagState(fixture.input || {});
    const expectedState = fixture.expectedState || {};
    const expectedId = Number(fixture.input?.request?.id ?? fixture.input?.request?.tagId);
    const seenTables = new Set();
    return {
      resolveRows(url, init) {
        const path = String(url).split('/rest/v1/')[1] || '';
        const table = path.split('?')[0];
        if (
          table !== 'recipe_tag_map' &&
          table !== 'ingredient_variant_tag_map' &&
          table !== 'tags'
        ) {
          throw new Error(`buildDeleteTagMock: unmatched table "${table}".`);
        }
        if (String(init?.method || '').toUpperCase() !== 'DELETE') {
          throw new Error('buildDeleteTagMock: expected DELETE.');
        }
        const column = table === 'tags' ? 'id' : 'tag_id';
        const id = Number(getEqFilter(url, column));
        if (!Number.isFinite(id) || id <= 0) {
          throw new Error('buildDeleteTagMock: expected positive id filter.');
        }
        if (id !== expectedId) {
          throw new Error('buildDeleteTagMock: deleted the wrong tag id.');
        }
        seenTables.add(table);
        if (table === 'recipe_tag_map') {
          state.recipe_tag_map = state.recipe_tag_map.filter(
            (row) => Number(row.tag_id) !== id,
          );
        } else if (table === 'ingredient_variant_tag_map') {
          state.ingredient_variant_tag_map = state.ingredient_variant_tag_map.filter(
            (row) => Number(row.tag_id) !== id,
          );
        } else {
          state.tags = state.tags.filter((row) => Number(row.id) !== id);
        }
        return [];
      },
      verify() {
        ['recipe_tag_map', 'ingredient_variant_tag_map', 'tags'].forEach((table) => {
          if (!seenTables.has(table)) {
            throw new Error(`deleteTag parity: Supabase did not delete ${table}.`);
          }
        });
        const expectedByCascade = cloneDeleteTagState(fixture.input || {});
        applyDeleteTagToState(expectedByCascade, expectedId);
        if (
          !deepEqual(state, expectedState) ||
          !deepEqual(expectedByCascade, expectedState)
        ) {
          throw new Error(
            `deleteTag parity: Supabase state mismatch.\nexpected ${pretty(
              expectedState,
            )}\nactual ${pretty(state)}`,
          );
        }
      },
    };
  }

  // -------------------------------------------------------------------------
  // Capability: loadTagUsage
  // -------------------------------------------------------------------------

  const loadTagUsageCapability = {
    name: 'loadTagUsage',
    fixturesUrl: '../fixtures/loadTagUsage.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          name TEXT,
          intended_use TEXT
        );
        CREATE TABLE recipes (
          ID INTEGER PRIMARY KEY,
          title TEXT
        );
        CREATE TABLE recipe_tag_map (
          id INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          tag_id INTEGER
        );
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT
        );
        CREATE TABLE ingredient_variants (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          variant TEXT
        );
        CREATE TABLE ingredient_variant_tag_map (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          tag_id INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('tags').forEach((t) => {
        db.run('INSERT INTO tags (id, name, intended_use) VALUES (?, ?, ?);', [
          t.id,
          t.name,
          t.intended_use,
        ]);
      });
      list('recipes').forEach((r) => {
        db.run('INSERT INTO recipes (ID, title) VALUES (?, ?);', [
          r.ID,
          r.title,
        ]);
      });
      list('recipe_tag_map').forEach((m) => {
        db.run(
          'INSERT INTO recipe_tag_map (id, recipe_id, tag_id) VALUES (?, ?, ?);',
          [m.id, m.recipe_id, m.tag_id],
        );
      });
      list('ingredients').forEach((i) => {
        db.run('INSERT INTO ingredients (ID, name) VALUES (?, ?);', [
          i.ID,
          i.name,
        ]);
      });
      list('ingredient_variants').forEach((v) => {
        db.run(
          'INSERT INTO ingredient_variants (id, ingredient_id, variant) VALUES (?, ?, ?);',
          [v.id, v.ingredient_id, v.variant],
        );
      });
      list('ingredient_variant_tag_map').forEach((m) => {
        db.run(
          `INSERT INTO ingredient_variant_tag_map
           (id, ingredient_variant_id, tag_id)
           VALUES (?, ?, ?);`,
          [m.id, m.ingredient_variant_id, m.tag_id],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.loadTagUsage(fixture.input?.tagId);
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildLoadTagUsageMock(fixture)),
      });
      return adapter.loadTagUsage(fixture.input?.tagId);
    },
  };

  function getEqFilter(url, columnName) {
    const match = String(url).match(
      new RegExp(`[?&]${columnName}=eq\\.([^&]+)`),
    );
    if (!match) return null;
    const value = Number(decodeURIComponent(match[1]));
    return Number.isFinite(value) ? value : null;
  }

  function getInFilter(url, columnName) {
    const match = String(url).match(
      new RegExp(`[?&]${columnName}=in\\.\\(([^)]*)\\)`),
    );
    if (!match) return null;
    return new Set(
      decodeURIComponent(match[1])
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value)),
    );
  }

  function buildLoadTagUsageMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'tags') {
        const idFilter = getEqFilter(url, 'id');
        return list('tags')
          .filter((row) => idFilter == null || Number(row.id) === idFilter)
          .map((row) => ({
            id: row.id,
            intended_use: row.intended_use,
          }));
      }

      if (table === 'recipe_tag_map') {
        const tagFilter = getEqFilter(url, 'tag_id');
        return list('recipe_tag_map')
          .filter((row) => tagFilter == null || Number(row.tag_id) === tagFilter)
          .map((row) => ({
            id: row.id,
            recipe_id: row.recipe_id,
          }));
      }

      if (table === 'recipes') {
        const idFilter = getInFilter(url, 'id');
        return list('recipes')
          .filter((row) => !idFilter || idFilter.has(Number(row.ID)))
          .map((row) => ({
            id: row.ID,
            title: row.title,
          }));
      }

      if (table === 'ingredient_variant_tag_map') {
        const tagFilter = getEqFilter(url, 'tag_id');
        return list('ingredient_variant_tag_map')
          .filter((row) => tagFilter == null || Number(row.tag_id) === tagFilter)
          .map((row) => ({
            id: row.id,
            ingredient_variant_id: row.ingredient_variant_id,
          }));
      }

      if (table === 'ingredient_variants') {
        const idFilter = getInFilter(url, 'id');
        return list('ingredient_variants')
          .filter((row) => !idFilter || idFilter.has(Number(row.id)))
          .map((row) => ({
            id: row.id,
            ingredient_id: row.ingredient_id,
            variant: row.variant,
          }));
      }

      if (table === 'ingredients') {
        const idFilter = getInFilter(url, 'id');
        return list('ingredients')
          .filter((row) => !idFilter || idFilter.has(Number(row.ID)))
          .map((row) => ({
            id: row.ID,
            name: row.name,
          }));
      }

      throw new Error(`buildLoadTagUsageMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listUnits
  // -------------------------------------------------------------------------

  const listUnitsCapability = {
    name: 'listUnits',
    fixturesUrl: '../fixtures/listUnits.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE units (
          code TEXT,
          name_singular TEXT,
          name_plural TEXT,
          category TEXT,
          sort_order INTEGER,
          is_hidden INTEGER,
          is_removed INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const units = Array.isArray(input?.units) ? input.units : [];
      units.forEach((u) => {
        db.run(
          `INSERT INTO units
           (code, name_singular, name_plural, category, sort_order, is_hidden, is_removed)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            u.code,
            u.name_singular,
            u.name_plural,
            u.category,
            u.sort_order,
            u.is_hidden,
            u.is_removed,
          ],
        );
      });
    },

    async runSqlite(db /*, fixture */) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listUnits();
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListUnitsMock(fixture)),
      });
      return adapter.listUnits();
    },
  };

  function buildListUnitsMock(fixture) {
    const input = fixture.input || {};
    const units = Array.isArray(input.units) ? input.units : [];

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'units') {
        return units.map((row) => ({
          code: row.code,
          name_singular: row.name_singular,
          name_plural: row.name_plural,
          category: row.category,
          sort_order: row.sort_order,
          is_hidden: row.is_hidden,
          is_removed: row.is_removed,
        }));
      }

      throw new Error(`buildListUnitsMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listSizes
  // -------------------------------------------------------------------------

  const listSizesCapability = {
    name: 'listSizes',
    fixturesUrl: '../fixtures/listSizes.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE sizes (
          id INTEGER PRIMARY KEY,
          name TEXT,
          sort_order INTEGER,
          is_hidden INTEGER,
          is_removed INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const sizes = Array.isArray(input?.sizes) ? input.sizes : [];
      sizes.forEach((s) => {
        db.run(
          `INSERT INTO sizes
           (id, name, sort_order, is_hidden, is_removed)
           VALUES (?, ?, ?, ?, ?);`,
          [s.id, s.name, s.sort_order, s.is_hidden, s.is_removed],
        );
      });
    },

    async runSqlite(db /*, fixture */) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listSizes();
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListSizesMock(fixture)),
      });
      return adapter.listSizes();
    },
  };

  function buildListSizesMock(fixture) {
    const input = fixture.input || {};
    const sizes = Array.isArray(input.sizes) ? input.sizes : [];

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'sizes') {
        return sizes.map((row) => ({
          id: row.id,
          name: row.name,
          sort_order: row.sort_order,
          is_hidden: row.is_hidden,
          is_removed: row.is_removed,
        }));
      }

      throw new Error(`buildListSizesMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: createSize
  // -------------------------------------------------------------------------

  const createSizeCapability = {
    name: 'createSize',
    fixturesUrl: '../fixtures/createSize.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE sizes (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE,
          sort_order INTEGER,
          is_hidden INTEGER NOT NULL DEFAULT 0,
          is_removed INTEGER NOT NULL DEFAULT 0
        );
        CREATE UNIQUE INDEX idx_sizes_name_nocase
        ON sizes(name COLLATE NOCASE);
      `);
    },

    seedFixture(db, input) {
      const sizes = Array.isArray(input?.sizes) ? input.sizes : [];
      sizes.forEach((s) => {
        db.run(
          `INSERT INTO sizes
           (id, name, sort_order, is_hidden, is_removed)
           VALUES (?, ?, ?, ?, ?);`,
          [s.id, s.name, s.sort_order, s.is_hidden, s.is_removed],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      const actual = await adapter.createSize(fixture.input?.request);
      verifyCreatedSizeRow(db, actual.id, fixture);
      return actual;
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildCreateSizeMock(fixture)),
      });
      return adapter.createSize(fixture.input?.request);
    },
  };

  function cleanSizeName(rawName) {
    return String(rawName == null ? '' : rawName)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 64)
      .trim();
  }

  function nextSizeSort(input) {
    const sizes = Array.isArray(input?.sizes) ? input.sizes : [];
    return (
      sizes.reduce((max, row) => {
        const n = Number(row?.sort_order);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0) + 1
    );
  }

  function verifyCreatedSizeRow(db, id, fixture) {
    const expectedName = cleanSizeName(fixture.input?.request?.name);
    const expectedSort = nextSizeSort(fixture.input || {});
    const q = db.exec(
      'SELECT name, sort_order, is_hidden, is_removed FROM sizes WHERE id = ?;',
      [id],
    );
    if (!q.length || !q[0].values.length) {
      throw new Error('createSize parity: created SQLite row was not found.');
    }
    const [storedName, sortOrder, isHidden, isRemoved] = q[0].values[0];
    if (
      storedName !== expectedName ||
      Number(sortOrder) !== expectedSort ||
      Number(isHidden) !== 0 ||
      Number(isRemoved) !== 0
    ) {
      throw new Error('createSize parity: SQLite row did not match the contract.');
    }
  }

  function buildCreateSizeMock(fixture) {
    const expectedId = fixture.input?.supabaseAssignedId;
    const expectedName = cleanSizeName(fixture.input?.request?.name);
    const expectedSort = nextSizeSort(fixture.input || {});
    let sawRead = false;
    return function resolveRows(url, init) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];
      if (table !== 'sizes') {
        throw new Error(`buildCreateSizeMock: unmatched table "${table}".`);
      }
      const method = String(init?.method || 'GET').toUpperCase();
      if (method === 'GET') {
        sawRead = true;
        const sizes = Array.isArray(fixture.input?.sizes) ? fixture.input.sizes : [];
        return sizes.map((row) => ({ sort_order: row.sort_order }));
      }
      if (method !== 'POST') {
        throw new Error(`buildCreateSizeMock: unexpected method "${method}".`);
      }
      if (!sawRead) {
        throw new Error('buildCreateSizeMock: expected sort-order read before insert.');
      }
      let body;
      try {
        body = JSON.parse(String(init?.body || '{}'));
      } catch (err) {
        throw new Error(`buildCreateSizeMock: invalid JSON body: ${err.message || err}`);
      }
      if (
        body.name !== expectedName ||
        Number(body.sort_order) !== expectedSort ||
        Number(body.is_hidden) !== 0 ||
        Number(body.is_removed) !== 0
      ) {
        throw new Error('buildCreateSizeMock: insert body did not match the contract.');
      }
      return [{ id: expectedId }];
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listStores
  // -------------------------------------------------------------------------

  const listStoresCapability = {
    name: 'listStores',
    fixturesUrl: '../fixtures/listStores.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE stores (
          ID INTEGER PRIMARY KEY,
          chain_name TEXT,
          location_name TEXT
        );
      `);
    },

    seedFixture(db, input) {
      const stores = Array.isArray(input?.stores) ? input.stores : [];
      stores.forEach((s) => {
        db.run(
          `INSERT INTO stores
           (ID, chain_name, location_name)
           VALUES (?, ?, ?);`,
          [s.ID, s.chain_name, s.location_name],
        );
      });
    },

    async runSqlite(db /*, fixture */) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listStores();
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListStoresMock(fixture)),
      });
      return adapter.listStores();
    },
  };

  function buildListStoresMock(fixture) {
    const input = fixture.input || {};
    const stores = Array.isArray(input.stores) ? input.stores : [];

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'stores') {
        return stores.map((row) => ({
          id: row.ID,
          chain_name: row.chain_name,
          location_name: row.location_name,
        }));
      }

      throw new Error(`buildListStoresMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: loadStoreDetail
  // -------------------------------------------------------------------------

  const loadStoreDetailCapability = {
    name: 'loadStoreDetail',
    fixturesUrl: '../fixtures/loadStoreDetail.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE stores (
          ID INTEGER PRIMARY KEY,
          chain_name TEXT,
          location_name TEXT
        );
        CREATE TABLE store_locations (
          ID INTEGER PRIMARY KEY,
          store_id INTEGER,
          name TEXT,
          sort_order INTEGER
        );
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT,
          is_deprecated INTEGER,
          hide_from_shopping_list INTEGER
        );
        CREATE TABLE ingredient_variants (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          variant TEXT,
          sort_order INTEGER,
          is_deprecated INTEGER
        );
        CREATE TABLE ingredient_store_location (
          ID INTEGER PRIMARY KEY,
          store_location_id INTEGER,
          ingredient_id INTEGER
        );
        CREATE TABLE ingredient_variant_store_location (
          id INTEGER PRIMARY KEY,
          store_location_id INTEGER,
          ingredient_variant_id INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('stores').forEach((row) => {
        db.run(
          'INSERT INTO stores (ID, chain_name, location_name) VALUES (?, ?, ?);',
          [row.ID, row.chain_name, row.location_name],
        );
      });
      list('store_locations').forEach((row) => {
        db.run(
          'INSERT INTO store_locations (ID, store_id, name, sort_order) VALUES (?, ?, ?, ?);',
          [row.ID, row.store_id, row.name, row.sort_order],
        );
      });
      list('ingredients').forEach((row) => {
        db.run(
          `INSERT INTO ingredients
           (ID, name, is_deprecated, hide_from_shopping_list)
           VALUES (?, ?, ?, ?);`,
          [
            row.ID,
            row.name,
            row.is_deprecated || 0,
            row.hide_from_shopping_list || 0,
          ],
        );
      });
      list('ingredient_variants').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_variants
           (id, ingredient_id, variant, sort_order, is_deprecated)
           VALUES (?, ?, ?, ?, ?);`,
          [
            row.id,
            row.ingredient_id,
            row.variant,
            row.sort_order,
            row.is_deprecated || 0,
          ],
        );
      });
      list('ingredient_store_location').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_store_location
           (ID, store_location_id, ingredient_id)
           VALUES (?, ?, ?);`,
          [row.ID, row.store_location_id, row.ingredient_id],
        );
      });
      list('ingredient_variant_store_location').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_variant_store_location
           (id, store_location_id, ingredient_variant_id)
           VALUES (?, ?, ?);`,
          [row.id, row.store_location_id, row.ingredient_variant_id],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.loadStoreDetail(fixture.input?.request || {});
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildLoadStoreDetailMock(fixture)),
      });
      return adapter.loadStoreDetail(fixture.input?.request || {});
    },
  };

  function buildLoadStoreDetailMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input[key]) ? input[key] : []);

    function eqNumber(url, field) {
      const match = String(url).match(new RegExp(`[?&]${field}=eq\\.([^&]+)`));
      if (!match) return null;
      const n = Number(decodeURIComponent(match[1]));
      return Number.isFinite(n) ? n : null;
    }

    function inNumberSet(url, field) {
      const match = String(url).match(new RegExp(`[?&]${field}=in\\.\\(([^)]*)\\)`));
      if (!match) return null;
      const set = new Set();
      String(match[1] || '')
        .split(',')
        .forEach((part) => {
          const n = Number(decodeURIComponent(part));
          if (Number.isFinite(n)) set.add(n);
        });
      return set;
    }

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'stores') {
        const id = eqNumber(url, 'id');
        return list('stores')
          .filter((row) => id == null || Number(row.ID) === id)
          .map((row) => ({
            id: row.ID,
            chain_name: row.chain_name,
            location_name: row.location_name,
          }));
      }

      if (table === 'store_locations') {
        const storeId = eqNumber(url, 'store_id');
        return list('store_locations')
          .filter((row) => storeId == null || Number(row.store_id) === storeId)
          .map((row) => ({
            id: row.ID,
            store_id: row.store_id,
            name: row.name,
            sort_order: row.sort_order,
          }));
      }

      if (table === 'ingredients') {
        return list('ingredients').map((row) => ({
          id: row.ID,
          name: row.name,
          is_deprecated: row.is_deprecated || 0,
          hide_from_shopping_list: row.hide_from_shopping_list || 0,
        }));
      }

      if (table === 'ingredient_variants') {
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
          sort_order: row.sort_order,
          is_deprecated: row.is_deprecated || 0,
        }));
      }

      if (table === 'ingredient_store_location') {
        const aisleIds = inNumberSet(url, 'store_location_id');
        return list('ingredient_store_location')
          .filter((row) => !aisleIds || aisleIds.has(Number(row.store_location_id)))
          .map((row) => ({
            id: row.ID,
            store_location_id: row.store_location_id,
            ingredient_id: row.ingredient_id,
          }));
      }

      if (table === 'ingredient_variant_store_location') {
        const aisleIds = inNumberSet(url, 'store_location_id');
        return list('ingredient_variant_store_location')
          .filter((row) => !aisleIds || aisleIds.has(Number(row.store_location_id)))
          .map((row) => ({
            id: row.id,
            store_location_id: row.store_location_id,
            ingredient_variant_id: row.ingredient_variant_id,
          }));
      }

      throw new Error(`buildLoadStoreDetailMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: lookupShoppingItemByName
  // -------------------------------------------------------------------------

  const lookupShoppingItemByNameCapability = {
    name: 'lookupShoppingItemByName',
    fixturesUrl: '../fixtures/lookupShoppingItemByName.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT
        );
        CREATE TABLE ingredient_synonyms (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          synonym TEXT
        );
      `);
    },

    seedFixture(db, input) {
      const ingredients = Array.isArray(input?.ingredients)
        ? input.ingredients
        : [];
      const synonyms = Array.isArray(input?.ingredient_synonyms)
        ? input.ingredient_synonyms
        : [];

      ingredients.forEach((row) => {
        db.run('INSERT INTO ingredients (ID, name) VALUES (?, ?);', [
          row.ID,
          row.name,
        ]);
      });
      synonyms.forEach((row) => {
        db.run(
          `INSERT INTO ingredient_synonyms (id, ingredient_id, synonym)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_id, row.synonym],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.lookupShoppingItemByName(fixture.input?.request || {});
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildLookupShoppingItemByNameMock(fixture)),
      });
      return adapter.lookupShoppingItemByName(fixture.input?.request || {});
    },
  };

  function buildLookupShoppingItemByNameMock(fixture) {
    const input = fixture.input || {};
    const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
    const synonyms = Array.isArray(input.ingredient_synonyms)
      ? input.ingredient_synonyms
      : [];

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'ingredients') {
        return ingredients.map((row) => ({
          id: row.ID,
          name: row.name,
        }));
      }

      if (table === 'ingredient_synonyms') {
        return synonyms.map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          synonym: row.synonym,
        }));
      }

      throw new Error(
        `buildLookupShoppingItemByNameMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: lookupIngredientNameByLemma
  // -------------------------------------------------------------------------

  const lookupIngredientNameByLemmaCapability = {
    name: 'lookupIngredientNameByLemma',
    fixturesUrl: '../fixtures/lookupIngredientNameByLemma.json',

    setupSchema(db, input = {}) {
      const withLemma = input?.schema?.lemmaColumn !== false;
      const cols = ['ID INTEGER PRIMARY KEY', 'name TEXT'];
      if (withLemma) cols.push('lemma TEXT');
      db.run(`CREATE TABLE ingredients (${cols.join(', ')});`);
    },

    seedFixture(db, input) {
      const withLemma = input?.schema?.lemmaColumn !== false;
      const list = Array.isArray(input?.ingredients) ? input.ingredients : [];
      list.forEach((row) => {
        if (withLemma) {
          db.run('INSERT INTO ingredients (ID, name, lemma) VALUES (?, ?, ?);', [
            row.ID,
            row.name,
            row.lemma ?? null,
          ]);
        } else {
          db.run('INSERT INTO ingredients (ID, name) VALUES (?, ?);', [
            row.ID,
            row.name,
          ]);
        }
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.lookupIngredientNameByLemma(fixture.input?.request || {});
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildLookupIngredientNameByLemmaMock(fixture)),
      });
      return adapter.lookupIngredientNameByLemma(fixture.input?.request || {});
    },
  };

  function buildLookupIngredientNameByLemmaMock(fixture) {
    const input = fixture.input || {};
    const list = Array.isArray(input.ingredients) ? input.ingredients : [];

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'ingredients') {
        return list.map((row) => {
          const out = { id: row.ID, name: row.name };
          if (Object.prototype.hasOwnProperty.call(row, 'lemma')) {
            out.lemma = row.lemma;
          }
          return out;
        });
      }

      throw new Error(
        `buildLookupIngredientNameByLemmaMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listIngredientTagNames
  // -------------------------------------------------------------------------

  const listIngredientTagNamesCapability = {
    name: 'listIngredientTagNames',
    fixturesUrl: '../fixtures/listIngredientTagNames.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          name TEXT,
          is_hidden INTEGER,
          sort_order INTEGER,
          intended_use TEXT
        );
        CREATE TABLE ingredient_variant_tag_map (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          tag_id INTEGER,
          sort_order INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('tags').forEach((t) => {
        db.run(
          `INSERT INTO tags
           (id, name, is_hidden, sort_order, intended_use)
           VALUES (?, ?, ?, ?, ?);`,
          [
            t.id,
            t.name,
            t.is_hidden ?? 0,
            t.sort_order ?? 0,
            t.intended_use,
          ],
        );
      });
      list('ingredient_variant_tag_map').forEach((m) => {
        db.run(
          `INSERT INTO ingredient_variant_tag_map
           (id, ingredient_variant_id, tag_id, sort_order)
           VALUES (?, ?, ?, ?);`,
          [
            m.id,
            m.ingredient_variant_id,
            m.tag_id,
            m.sort_order ?? 0,
          ],
        );
      });
    },

    async runSqlite(db /*, fixture */) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listIngredientTagNames();
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(
          buildListIngredientTagNamesMock(fixture),
        ),
      });
      return adapter.listIngredientTagNames();
    },
  };

  function buildListIngredientTagNamesMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'tags') {
        return list('tags').map((row) => ({
          id: row.id,
          name: row.name,
          is_hidden: row.is_hidden,
          intended_use: row.intended_use,
        }));
      }
      if (table === 'ingredient_variant_tag_map') {
        return list('ingredient_variant_tag_map').map((row) => ({
          id: row.id,
          tag_id: row.tag_id,
        }));
      }

      throw new Error(
        `buildListIngredientTagNamesMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listShoppingItems
  // -------------------------------------------------------------------------

  const listShoppingItemsCapability = {
    name: 'listShoppingItems',
    fixturesUrl: '../fixtures/listShoppingItems.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT,
          variant TEXT,
          hide_from_shopping_list INTEGER,
          is_deprecated INTEGER,
          is_hidden INTEGER,
          is_food INTEGER,
          lemma TEXT,
          plural_by_default INTEGER,
          is_mass_noun INTEGER,
          plural_override TEXT
        );
        CREATE TABLE ingredient_variants (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          variant TEXT,
          sort_order INTEGER,
          home_location TEXT,
          is_deprecated INTEGER
        );
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          name TEXT,
          is_hidden INTEGER,
          sort_order INTEGER,
          intended_use TEXT
        );
        CREATE TABLE ingredient_variant_tag_map (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          tag_id INTEGER,
          sort_order INTEGER
        );
        CREATE TABLE recipe_ingredient_map (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          ingredient_id INTEGER
        );
        CREATE TABLE recipe_ingredient_substitutes (
          id INTEGER PRIMARY KEY,
          recipe_ingredient_id INTEGER,
          ingredient_id INTEGER
        );
        CREATE TABLE ingredient_store_location (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          store_location_id INTEGER
        );
        CREATE TABLE ingredient_variant_store_location (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          store_location_id INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('ingredients').forEach((row) => {
        db.run(
          `INSERT INTO ingredients
           (ID, name, variant, hide_from_shopping_list, is_deprecated, is_hidden,
            is_food, lemma, plural_by_default, is_mass_noun, plural_override)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            row.ID,
            row.name,
            row.variant ?? null,
            row.hide_from_shopping_list ?? 0,
            row.is_deprecated ?? 0,
            row.is_hidden ?? 0,
            row.is_food ?? 1,
            row.lemma ?? '',
            row.plural_by_default ?? 0,
            row.is_mass_noun ?? 0,
            row.plural_override ?? '',
          ],
        );
      });
      list('ingredient_variants').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_variants
           (id, ingredient_id, variant, sort_order, home_location, is_deprecated)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [
            row.id,
            row.ingredient_id,
            row.variant,
            row.sort_order ?? 999999,
            row.home_location ?? 'none',
            row.is_deprecated ?? 0,
          ],
        );
      });
      list('tags').forEach((row) => {
        db.run(
          `INSERT INTO tags
           (id, name, is_hidden, sort_order, intended_use)
           VALUES (?, ?, ?, ?, ?);`,
          [
            row.id,
            row.name,
            row.is_hidden ?? 0,
            row.sort_order ?? 0,
            row.intended_use ?? 'ingredients',
          ],
        );
      });
      list('ingredient_variant_tag_map').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_variant_tag_map
           (id, ingredient_variant_id, tag_id, sort_order)
           VALUES (?, ?, ?, ?);`,
          [
            row.id,
            row.ingredient_variant_id,
            row.tag_id,
            row.sort_order ?? 0,
          ],
        );
      });
      list('recipe_ingredient_map').forEach((row) => {
        db.run(
          `INSERT INTO recipe_ingredient_map
           (ID, recipe_id, ingredient_id)
           VALUES (?, ?, ?);`,
          [row.ID, row.recipe_id, row.ingredient_id],
        );
      });
      list('recipe_ingredient_substitutes').forEach((row) => {
        db.run(
          `INSERT INTO recipe_ingredient_substitutes
           (id, recipe_ingredient_id, ingredient_id)
           VALUES (?, ?, ?);`,
          [row.id, row.recipe_ingredient_id, row.ingredient_id],
        );
      });
      list('ingredient_store_location').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_store_location
           (id, ingredient_id, store_location_id)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_id, row.store_location_id],
        );
      });
      list('ingredient_variant_store_location').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_variant_store_location
           (id, ingredient_variant_id, store_location_id)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_variant_id, row.store_location_id],
        );
      });
    },

    async runSqlite(db /*, fixture */) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listShoppingItems();
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListShoppingItemsMock(fixture)),
      });
      return adapter.listShoppingItems();
    },
  };

  function buildListShoppingItemsMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'ingredients') {
        return list('ingredients').map((row) => ({
          id: row.ID,
          name: row.name,
          variant: row.variant,
          hide_from_shopping_list: row.hide_from_shopping_list,
          is_deprecated: row.is_deprecated,
          is_hidden: row.is_hidden,
          is_food: row.is_food,
          lemma: row.lemma,
          plural_by_default: row.plural_by_default,
          is_mass_noun: row.is_mass_noun,
          plural_override: row.plural_override,
        }));
      }
      if (table === 'ingredient_variants') {
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
          sort_order: row.sort_order,
          home_location: row.home_location,
          is_deprecated: row.is_deprecated,
        }));
      }
      if (table === 'tags') {
        return list('tags').map((row) => ({
          id: row.id,
          name: row.name,
          is_hidden: row.is_hidden,
        }));
      }
      if (table === 'ingredient_variant_tag_map') {
        return list('ingredient_variant_tag_map').map((row) => ({
          id: row.id,
          ingredient_variant_id: row.ingredient_variant_id,
          tag_id: row.tag_id,
        }));
      }
      if (table === 'recipe_ingredient_map') {
        return list('recipe_ingredient_map').map((row) => ({
          id: row.ID,
          recipe_id: row.recipe_id,
          ingredient_id: row.ingredient_id,
        }));
      }
      if (table === 'recipe_ingredient_substitutes') {
        return list('recipe_ingredient_substitutes').map((row) => ({
          id: row.id,
          recipe_ingredient_id: row.recipe_ingredient_id,
          ingredient_id: row.ingredient_id,
        }));
      }
      if (table === 'ingredient_store_location') {
        return list('ingredient_store_location').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          store_location_id: row.store_location_id,
        }));
      }
      if (table === 'ingredient_variant_store_location') {
        return list('ingredient_variant_store_location').map((row) => ({
          id: row.id,
          ingredient_variant_id: row.ingredient_variant_id,
          store_location_id: row.store_location_id,
        }));
      }

      throw new Error(`buildListShoppingItemsMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: loadShoppingItemDetail
  // -------------------------------------------------------------------------

  const loadShoppingItemDetailCapability = {
    name: 'loadShoppingItemDetail',
    fixturesUrl: '../fixtures/loadShoppingItemDetail.json',

    setupSchema(db, input = {}) {
      const schema = input?.schema || {};
      const flag = (key, fallback = true) =>
        Object.prototype.hasOwnProperty.call(schema, key)
          ? schema[key] !== false
          : fallback;
      const ingredientColumns = [
        'ID INTEGER PRIMARY KEY',
        'name TEXT',
        flag('variant', true) ? 'variant TEXT' : null,
        flag('size', true) ? 'size TEXT' : null,
        flag('hideFromShoppingList', true) ? 'hide_from_shopping_list INTEGER' : null,
        flag('isDeprecated', true) ? 'is_deprecated INTEGER' : null,
        flag('isHidden', true) ? 'is_hidden INTEGER' : null,
        flag('isFood', true) ? 'is_food INTEGER' : null,
        flag('pluralOverride', true) ? 'plural_override TEXT' : null,
        flag('pluralByDefault', true) ? 'plural_by_default INTEGER' : null,
        flag('isMassNoun', true) ? 'is_mass_noun INTEGER' : null,
        flag('lemma', true) ? 'lemma TEXT' : null,
      ].filter(Boolean);
      db.run(`CREATE TABLE ingredients (${ingredientColumns.join(', ')});`);
      if (flag('ingredientVariants', true)) {
        db.run(`
          CREATE TABLE ingredient_variants (
            id INTEGER PRIMARY KEY,
            ingredient_id INTEGER,
            variant TEXT,
            sort_order INTEGER,
            home_location TEXT,
            is_deprecated INTEGER
          );
        `);
      }
      if (flag('ingredientSizes', true)) {
        db.run(`
          CREATE TABLE ingredient_sizes (
            id INTEGER PRIMARY KEY,
            ingredient_id INTEGER,
            size TEXT,
            sort_order INTEGER
          );
        `);
      }
      db.run(`
        CREATE TABLE ingredient_synonyms (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          synonym TEXT
        );
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          name TEXT,
          is_hidden INTEGER
        );
        CREATE TABLE ingredient_variant_tag_map (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          tag_id INTEGER,
          sort_order INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const schema = input?.schema || {};
      const flag = (key, fallback = true) =>
        Object.prototype.hasOwnProperty.call(schema, key)
          ? schema[key] !== false
          : fallback;
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);
      const ingredientColumns = [
        ['ID', (row) => row.ID],
        ['name', (row) => row.name],
        flag('variant', true) ? ['variant', (row) => row.variant ?? null] : null,
        flag('size', true) ? ['size', (row) => row.size ?? null] : null,
        flag('hideFromShoppingList', true)
          ? ['hide_from_shopping_list', (row) => row.hide_from_shopping_list ?? 0]
          : null,
        flag('isDeprecated', true)
          ? ['is_deprecated', (row) => row.is_deprecated ?? 0]
          : null,
        flag('isHidden', true) ? ['is_hidden', (row) => row.is_hidden ?? 0] : null,
        flag('isFood', true) ? ['is_food', (row) => row.is_food ?? 1] : null,
        flag('pluralOverride', true)
          ? ['plural_override', (row) => row.plural_override ?? '']
          : null,
        flag('pluralByDefault', true)
          ? ['plural_by_default', (row) => row.plural_by_default ?? 0]
          : null,
        flag('isMassNoun', true)
          ? ['is_mass_noun', (row) => row.is_mass_noun ?? 0]
          : null,
        flag('lemma', true) ? ['lemma', (row) => row.lemma ?? null] : null,
      ].filter(Boolean);
      list('ingredients').forEach((row) => {
        db.run(
          `INSERT INTO ingredients (${ingredientColumns
            .map(([column]) => column)
            .join(', ')}) VALUES (${ingredientColumns.map(() => '?').join(', ')});`,
          ingredientColumns.map(([, getter]) => getter(row)),
        );
      });
      if (flag('ingredientVariants', true)) {
        list('ingredient_variants').forEach((row) => {
          db.run(
            `INSERT INTO ingredient_variants
             (id, ingredient_id, variant, sort_order, home_location, is_deprecated)
             VALUES (?, ?, ?, ?, ?, ?);`,
            [
              row.id,
              row.ingredient_id,
              row.variant,
              row.sort_order ?? 999999,
              row.home_location ?? 'none',
              row.is_deprecated ?? 0,
            ],
          );
        });
      }
      if (flag('ingredientSizes', true)) {
        list('ingredient_sizes').forEach((row) => {
          db.run(
            `INSERT INTO ingredient_sizes
             (id, ingredient_id, size, sort_order)
             VALUES (?, ?, ?, ?);`,
            [row.id, row.ingredient_id, row.size, row.sort_order ?? 999999],
          );
        });
      }
      list('ingredient_synonyms').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_synonyms
           (id, ingredient_id, synonym)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_id, row.synonym],
        );
      });
      list('tags').forEach((row) => {
        db.run('INSERT INTO tags (id, name, is_hidden) VALUES (?, ?, ?);', [
          row.id,
          row.name,
          row.is_hidden ?? 0,
        ]);
      });
      list('ingredient_variant_tag_map').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_variant_tag_map
           (id, ingredient_variant_id, tag_id, sort_order)
           VALUES (?, ?, ?, ?);`,
          [
            row.id,
            row.ingredient_variant_id,
            row.tag_id,
            row.sort_order ?? 999999,
          ],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.loadShoppingItemDetail(fixture.input?.request);
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildLoadShoppingItemDetailMock(fixture)),
      });
      return adapter.loadShoppingItemDetail(fixture.input?.request);
    },
  };

  function buildLoadShoppingItemDetailMock(fixture) {
    const input = fixture.input || {};
    const schema = input?.schema || {};
    const flag = (key, fallback = true) =>
      Object.prototype.hasOwnProperty.call(schema, key)
        ? schema[key] !== false
        : fallback;
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'ingredients') {
        return list('ingredients').map((row) => {
          const out = { id: row.ID, name: row.name };
          if (flag('variant', true)) out.variant = row.variant;
          if (flag('size', true)) out.size = row.size;
          if (flag('hideFromShoppingList', true)) {
            out.hide_from_shopping_list = row.hide_from_shopping_list;
          }
          if (flag('isDeprecated', true)) out.is_deprecated = row.is_deprecated;
          if (flag('isHidden', true)) out.is_hidden = row.is_hidden;
          if (flag('isFood', true)) out.is_food = row.is_food;
          if (flag('pluralOverride', true)) {
            out.plural_override = row.plural_override;
          }
          if (flag('pluralByDefault', true)) {
            out.plural_by_default = row.plural_by_default;
          }
          if (flag('isMassNoun', true)) out.is_mass_noun = row.is_mass_noun;
          if (flag('lemma', true)) out.lemma = row.lemma;
          return out;
        });
      }
      if (table === 'ingredient_variants') {
        if (!flag('ingredientVariants', true)) return [];
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
          sort_order: row.sort_order,
          home_location: row.home_location,
          is_deprecated: row.is_deprecated,
        }));
      }
      if (table === 'tags') {
        return list('tags').map((row) => ({
          id: row.id,
          name: row.name,
          is_hidden: row.is_hidden,
        }));
      }
      if (table === 'ingredient_variant_tag_map') {
        return list('ingredient_variant_tag_map').map((row) => ({
          id: row.id,
          ingredient_variant_id: row.ingredient_variant_id,
          tag_id: row.tag_id,
          sort_order: row.sort_order,
        }));
      }
      if (table === 'ingredient_sizes') {
        if (!flag('ingredientSizes', true)) return [];
        return list('ingredient_sizes').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          size: row.size,
          sort_order: row.sort_order,
        }));
      }
      if (table === 'ingredient_synonyms') {
        return list('ingredient_synonyms').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          synonym: row.synonym,
        }));
      }

      throw new Error(`buildLoadShoppingItemDetailMock: unmatched table "${table}".`);
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listShoppingItemRecipeUsage
  // -------------------------------------------------------------------------

  const listShoppingItemRecipeUsageCapability = {
    name: 'listShoppingItemRecipeUsage',
    fixturesUrl: '../fixtures/listShoppingItemRecipeUsage.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE recipes (
          ID INTEGER PRIMARY KEY,
          title TEXT
        );
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT,
          variant TEXT
        );
        CREATE TABLE recipe_ingredient_map (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          ingredient_id INTEGER
        );
        CREATE TABLE recipe_ingredient_substitutes (
          id INTEGER PRIMARY KEY,
          recipe_ingredient_id INTEGER,
          ingredient_id INTEGER
        );
        CREATE TABLE ingredient_synonyms (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          synonym TEXT
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('recipes').forEach((row) => {
        db.run('INSERT INTO recipes (ID, title) VALUES (?, ?);', [
          row.ID,
          row.title,
        ]);
      });
      list('ingredients').forEach((row) => {
        db.run('INSERT INTO ingredients (ID, name, variant) VALUES (?, ?, ?);', [
          row.ID,
          row.name,
          row.variant,
        ]);
      });
      list('recipe_ingredient_map').forEach((row) => {
        db.run(
          `INSERT INTO recipe_ingredient_map
           (ID, recipe_id, ingredient_id)
           VALUES (?, ?, ?);`,
          [row.ID, row.recipe_id, row.ingredient_id],
        );
      });
      list('recipe_ingredient_substitutes').forEach((row) => {
        db.run(
          `INSERT INTO recipe_ingredient_substitutes
           (id, recipe_ingredient_id, ingredient_id)
           VALUES (?, ?, ?);`,
          [row.id, row.recipe_ingredient_id, row.ingredient_id],
        );
      });
      list('ingredient_synonyms').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_synonyms
           (id, ingredient_id, synonym)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_id, row.synonym],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listShoppingItemRecipeUsage(fixture.input?.itemName);
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListShoppingItemRecipeUsageMock(fixture)),
      });
      return adapter.listShoppingItemRecipeUsage(fixture.input?.itemName);
    },
  };

  function getListShoppingItemRecipeUsageInFilter(url, columnName) {
    const match = String(url).match(
      new RegExp(`[?&]${columnName}=in\\.\\(([^)]*)\\)`),
    );
    if (!match) return null;
    return new Set(
      decodeURIComponent(match[1])
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value)),
    );
  }

  function buildListShoppingItemRecipeUsageMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'ingredients') {
        return list('ingredients').map((row) => ({
          id: row.ID,
          name: row.name,
          variant: row.variant,
        }));
      }
      if (table === 'recipe_ingredient_map') {
        return list('recipe_ingredient_map').map((row) => ({
          id: row.ID,
          recipe_id: row.recipe_id,
          ingredient_id: row.ingredient_id,
        }));
      }
      if (table === 'recipe_ingredient_substitutes') {
        return list('recipe_ingredient_substitutes').map((row) => ({
          id: row.id,
          recipe_ingredient_id: row.recipe_ingredient_id,
          ingredient_id: row.ingredient_id,
        }));
      }
      if (table === 'recipes') {
        const idFilter = getListShoppingItemRecipeUsageInFilter(url, 'id');
        return list('recipes')
          .filter((row) => !idFilter || idFilter.has(Number(row.ID)))
          .map((row) => ({
            id: row.ID,
            title: row.title,
          }));
      }

      throw new Error(
        `buildListShoppingItemRecipeUsageMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: loadShoppingItemVariantUsage
  // -------------------------------------------------------------------------

  const loadShoppingItemVariantUsageCapability = {
    name: 'loadShoppingItemVariantUsage',
    fixturesUrl: '../fixtures/loadShoppingItemVariantUsage.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE recipes (
          ID INTEGER PRIMARY KEY,
          title TEXT
        );
        CREATE TABLE recipe_ingredient_map (
          ID INTEGER PRIMARY KEY,
          recipe_id INTEGER,
          ingredient_id INTEGER,
          variant TEXT
        );
        CREATE TABLE recipe_ingredient_substitutes (
          id INTEGER PRIMARY KEY,
          recipe_ingredient_id INTEGER,
          ingredient_id INTEGER,
          variant TEXT
        );
        CREATE TABLE ingredient_variants (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          variant TEXT
        );
        CREATE TABLE ingredient_variant_store_location (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          store_location_id INTEGER
        );
        CREATE TABLE ingredient_store_location (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          store_location_id INTEGER
        );
        CREATE TABLE store_locations (
          ID INTEGER PRIMARY KEY,
          store_id INTEGER,
          name TEXT,
          sort_order INTEGER
        );
        CREATE TABLE stores (
          ID INTEGER PRIMARY KEY,
          chain_name TEXT,
          location_name TEXT
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('recipes').forEach((row) => {
        db.run('INSERT INTO recipes (ID, title) VALUES (?, ?);', [
          row.ID,
          row.title,
        ]);
      });
      list('recipe_ingredient_map').forEach((row) => {
        db.run(
          `INSERT INTO recipe_ingredient_map
           (ID, recipe_id, ingredient_id, variant)
           VALUES (?, ?, ?, ?);`,
          [row.ID, row.recipe_id, row.ingredient_id, row.variant],
        );
      });
      list('recipe_ingredient_substitutes').forEach((row) => {
        db.run(
          `INSERT INTO recipe_ingredient_substitutes
           (id, recipe_ingredient_id, ingredient_id, variant)
           VALUES (?, ?, ?, ?);`,
          [row.id, row.recipe_ingredient_id, row.ingredient_id, row.variant],
        );
      });
      list('ingredient_variants').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_variants
           (id, ingredient_id, variant)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_id, row.variant],
        );
      });
      list('ingredient_variant_store_location').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_variant_store_location
           (id, ingredient_variant_id, store_location_id)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_variant_id, row.store_location_id],
        );
      });
      list('ingredient_store_location').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_store_location
           (id, ingredient_id, store_location_id)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_id, row.store_location_id],
        );
      });
      list('store_locations').forEach((row) => {
        db.run(
          `INSERT INTO store_locations
           (ID, store_id, name, sort_order)
           VALUES (?, ?, ?, ?);`,
          [row.ID, row.store_id, row.name, row.sort_order],
        );
      });
      list('stores').forEach((row) => {
        db.run(
          `INSERT INTO stores
           (ID, chain_name, location_name)
           VALUES (?, ?, ?);`,
          [row.ID, row.chain_name, row.location_name],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.loadShoppingItemVariantUsage(fixture.input?.request);
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildLoadShoppingItemVariantUsageMock(fixture)),
      });
      return adapter.loadShoppingItemVariantUsage(fixture.input?.request);
    },
  };

  function buildLoadShoppingItemVariantUsageMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'recipe_ingredient_map') {
        return list('recipe_ingredient_map').map((row) => ({
          id: row.ID,
          recipe_id: row.recipe_id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
        }));
      }
      if (table === 'recipe_ingredient_substitutes') {
        return list('recipe_ingredient_substitutes').map((row) => ({
          id: row.id,
          recipe_ingredient_id: row.recipe_ingredient_id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
        }));
      }
      if (table === 'ingredient_variants') {
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
        }));
      }
      if (table === 'recipes') {
        const idFilter = getListShoppingItemRecipeUsageInFilter(url, 'id');
        return list('recipes')
          .filter((row) => !idFilter || idFilter.has(Number(row.ID)))
          .map((row) => ({
            id: row.ID,
            title: row.title,
          }));
      }
      if (table === 'ingredient_variant_store_location') {
        return list('ingredient_variant_store_location').map((row) => ({
          id: row.id,
          ingredient_variant_id: row.ingredient_variant_id,
          store_location_id: row.store_location_id,
        }));
      }
      if (table === 'store_locations') {
        return list('store_locations').map((row) => ({
          id: row.ID,
          store_id: row.store_id,
          name: row.name,
          sort_order: row.sort_order,
        }));
      }
      if (table === 'stores') {
        return list('stores').map((row) => ({
          id: row.ID,
          chain_name: row.chain_name,
          location_name: row.location_name,
        }));
      }

      throw new Error(
        `buildLoadShoppingItemVariantUsageMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listShoppingListHomeLocations
  // -------------------------------------------------------------------------

  const listShoppingListHomeLocationsCapability = {
    name: 'listShoppingListHomeLocations',
    fixturesUrl: '../fixtures/listShoppingListHomeLocations.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT
        );
        CREATE TABLE ingredient_variants (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          variant TEXT,
          sort_order INTEGER,
          home_location TEXT
        );
        CREATE TABLE ingredient_synonyms (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          synonym TEXT
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('ingredients').forEach((row) => {
        db.run('INSERT INTO ingredients (ID, name) VALUES (?, ?);', [
          row.ID,
          row.name,
        ]);
      });
      list('ingredient_variants').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_variants
           (id, ingredient_id, variant, sort_order, home_location)
           VALUES (?, ?, ?, ?, ?);`,
          [
            row.id,
            row.ingredient_id,
            row.variant,
            row.sort_order,
            row.home_location,
          ],
        );
      });
      list('ingredient_synonyms').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_synonyms
           (id, ingredient_id, synonym)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_id, row.synonym],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listShoppingListHomeLocations(fixture.input?.sourceKeys);
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListShoppingListHomeLocationsMock(fixture)),
      });
      return adapter.listShoppingListHomeLocations(fixture.input?.sourceKeys);
    },
  };

  function buildListShoppingListHomeLocationsMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'ingredients') {
        return list('ingredients').map((row) => ({
          id: row.ID,
          name: row.name,
        }));
      }
      if (table === 'ingredient_variants') {
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
          sort_order: row.sort_order,
          home_location: row.home_location,
        }));
      }

      throw new Error(
        `buildListShoppingListHomeLocationsMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: isIngredientVariantDeprecated
  // -------------------------------------------------------------------------

  const isIngredientVariantDeprecatedCapability = {
    name: 'isIngredientVariantDeprecated',
    fixturesUrl: '../fixtures/isIngredientVariantDeprecated.json',

    setupSchema(db, input) {
      const schema = input?.schema || {};
      const ingredientsHasIsDeprecated =
        schema.ingredientsHasIsDeprecated !== false;
      const variantHasIsDeprecated = schema.variantHasIsDeprecated !== false;
      db.run(`
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT
          ${ingredientsHasIsDeprecated ? ', is_deprecated INTEGER' : ''}
          , hide_from_shopping_list INTEGER
        );
        CREATE TABLE ingredient_synonyms (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          synonym TEXT
        );
        CREATE TABLE ingredient_variants (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          variant TEXT
          ${variantHasIsDeprecated ? ', is_deprecated INTEGER' : ''}
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);
      const schema = input?.schema || {};
      const ingredientsHasIsDeprecated =
        schema.ingredientsHasIsDeprecated !== false;
      const variantHasIsDeprecated = schema.variantHasIsDeprecated !== false;

      list('ingredients').forEach((row) => {
        const cols = ['ID', 'name'];
        const values = [row.ID, row.name];
        if (ingredientsHasIsDeprecated) {
          cols.push('is_deprecated');
          values.push(row.is_deprecated);
        }
        cols.push('hide_from_shopping_list');
        values.push(row.hide_from_shopping_list);
        db.run(
          `INSERT INTO ingredients (${cols.join(', ')}) VALUES (${cols
            .map(() => '?')
            .join(', ')});`,
          values,
        );
      });
      list('ingredient_synonyms').forEach((row) => {
        db.run(
          `INSERT INTO ingredient_synonyms (id, ingredient_id, synonym)
           VALUES (?, ?, ?);`,
          [row.id, row.ingredient_id, row.synonym],
        );
      });
      list('ingredient_variants').forEach((row) => {
        const cols = ['id', 'ingredient_id', 'variant'];
        const values = [row.id, row.ingredient_id, row.variant];
        if (variantHasIsDeprecated) {
          cols.push('is_deprecated');
          values.push(row.is_deprecated);
        }
        db.run(
          `INSERT INTO ingredient_variants (${cols.join(', ')}) VALUES (${cols
            .map(() => '?')
            .join(', ')});`,
          values,
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.isIngredientVariantDeprecated({
        ingredientName: fixture.input?.ingredientName,
        variantText: fixture.input?.variantText,
      });
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildIsIngredientVariantDeprecatedMock(fixture)),
      });
      return adapter.isIngredientVariantDeprecated({
        ingredientName: fixture.input?.ingredientName,
        variantText: fixture.input?.variantText,
      });
    },
  };

  function buildIsIngredientVariantDeprecatedMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);
    const ingredientsHasIsDeprecated =
      input?.schema?.ingredientsHasIsDeprecated !== false;

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'ingredients') {
        return list('ingredients').map((row) => {
          const out = {
            id: row.ID,
            name: row.name,
            hide_from_shopping_list: row.hide_from_shopping_list,
          };
          if (ingredientsHasIsDeprecated) out.is_deprecated = row.is_deprecated;
          return out;
        });
      }
      if (table === 'ingredient_synonyms') {
        return list('ingredient_synonyms').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          synonym: row.synonym,
        }));
      }
      if (table === 'ingredient_variants') {
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
          is_deprecated: row.is_deprecated,
        }));
      }

      throw new Error(
        `buildIsIngredientVariantDeprecatedMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listShoppingPlanRecipeItems
  // -------------------------------------------------------------------------

  const listShoppingPlanRecipeItemsCapability = {
    name: 'listShoppingPlanRecipeItems',
    fixturesUrl: '../fixtures/listShoppingPlanRecipeItems.json',

    setupSchema(db) {
      loadRecipeDetailCapability.setupSchema(db);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('recipes').forEach((r) => {
        db.run(
          'INSERT INTO recipes (ID, title, servings_default, servings_min, servings_max) VALUES (?, ?, ?, ?, ?);',
          [
            r.ID,
            r.title,
            r.servings_default ?? null,
            r.servings_min ?? null,
            r.servings_max ?? null,
          ],
        );
      });
      list('ingredients').forEach((i) => {
        db.run(
          `INSERT INTO ingredients
           (ID, name, variant, size, parenthetical_note, lemma,
            plural_by_default, is_mass_noun, plural_override, is_deprecated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            i.ID,
            i.name,
            i.variant ?? null,
            i.size ?? null,
            i.parenthetical_note ?? null,
            i.lemma ?? null,
            i.plural_by_default ?? 0,
            i.is_mass_noun ?? 0,
            i.plural_override ?? null,
            i.is_deprecated ?? 0,
          ],
        );
      });
      list('ingredient_variants').forEach((v) => {
        db.run(
          `INSERT INTO ingredient_variants
           (id, ingredient_id, variant, home_location, is_deprecated)
           VALUES (?, ?, ?, ?, ?);`,
          [
            v.id,
            v.ingredient_id,
            v.variant,
            v.home_location ?? null,
            v.is_deprecated ?? 0,
          ],
        );
      });
      list('recipe_ingredient_map').forEach((rim) => {
        db.run(
          `INSERT INTO recipe_ingredient_map
           (ID, recipe_id, ingredient_id, section_id, sort_order,
            quantity, quantity_min, quantity_max, quantity_is_approx,
            unit, variant, size, prep_notes, is_optional, parenthetical_note,
            is_recipe, linked_recipe_id, recipe_text, is_alt, display_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            rim.ID,
            rim.recipe_id,
            rim.ingredient_id,
            rim.section_id ?? null,
            rim.sort_order ?? null,
            rim.quantity ?? null,
            rim.quantity_min ?? null,
            rim.quantity_max ?? null,
            rim.quantity_is_approx ?? 0,
            rim.unit ?? null,
            rim.variant ?? null,
            rim.size ?? null,
            rim.prep_notes ?? null,
            rim.is_optional ?? 0,
            rim.parenthetical_note ?? null,
            rim.is_recipe ?? 0,
            rim.linked_recipe_id ?? null,
            rim.recipe_text ?? null,
            rim.is_alt ?? 0,
            rim.display_name ?? null,
          ],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listShoppingPlanRecipeItems(fixture.selectedRecipes);
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListShoppingPlanRecipeItemsMock(fixture)),
      });
      return adapter.listShoppingPlanRecipeItems(fixture.selectedRecipes);
    },
  };

  function buildListShoppingPlanRecipeItemsMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);
    const recipesById = new Map();
    list('recipes').forEach((row) => recipesById.set(row.ID, row));
    const ingredientsById = new Map();
    list('ingredients').forEach((row) => ingredientsById.set(row.ID, row));
    const variantsByIngredientId = new Map();
    list('ingredient_variants').forEach((row) => {
      if (!variantsByIngredientId.has(row.ingredient_id)) {
        variantsByIngredientId.set(row.ingredient_id, []);
      }
      variantsByIngredientId.get(row.ingredient_id).push(row);
    });
    const parseRecipeId = (url) => {
      const match = String(url).match(/[?&]recipe_id=eq\.([0-9]+)/);
      if (match) return Number(match[1]);
      const idMatch = String(url).match(/[?&]id=eq\.([0-9]+)/);
      return idMatch ? Number(idMatch[1]) : null;
    };

    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];

      if (table === 'ingredients') {
        return list('ingredients').map((row) => ({
          id: row.ID,
          name: row.name,
        }));
      }
      if (table === 'ingredient_variants') {
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
        }));
      }
      const recipeId = parseRecipeId(url);
      if (table === 'recipes') {
        const row = recipesById.get(recipeId);
        if (!row) return [];
        return [
          {
            id: row.ID,
            title: row.title,
            servings_default: row.servings_default,
            servings_min: row.servings_min,
            servings_max: row.servings_max,
          },
        ];
      }
      if (table === 'recipe_tag_map') return [];
      if (table === 'recipe_steps') return [];
      if (table === 'recipe_ingredient_headings') return [];
      if (table === 'recipe_ingredient_map') {
        return list('recipe_ingredient_map')
          .filter((row) => row.recipe_id === recipeId)
          .map((row) => {
            const ingredient = ingredientsById.get(row.ingredient_id) || null;
            const linkedRecipe = recipesById.get(row.linked_recipe_id) || null;
            const variants = ingredient
              ? variantsByIngredientId.get(ingredient.ID) || []
              : [];
            return {
              id: row.ID,
              section_id: row.section_id ?? null,
              sort_order: row.sort_order ?? null,
              quantity: row.quantity ?? null,
              quantity_min: row.quantity_min ?? null,
              quantity_max: row.quantity_max ?? null,
              quantity_is_approx: row.quantity_is_approx ?? 0,
              unit: row.unit ?? null,
              variant: row.variant ?? null,
              size: row.size ?? null,
              prep_notes: row.prep_notes ?? null,
              is_optional: row.is_optional ?? 0,
              parenthetical_note: row.parenthetical_note ?? null,
              is_recipe: row.is_recipe ?? 0,
              linked_recipe_id: row.linked_recipe_id ?? null,
              recipe_text: row.recipe_text ?? null,
              is_alt: row.is_alt ?? 0,
              display_name: row.display_name ?? null,
              ingredients: ingredient
                ? {
                    id: ingredient.ID,
                    name: ingredient.name,
                    variant: ingredient.variant,
                    size: ingredient.size,
                    parenthetical_note: ingredient.parenthetical_note,
                    lemma: ingredient.lemma,
                    plural_by_default: ingredient.plural_by_default,
                    is_mass_noun: ingredient.is_mass_noun,
                    plural_override: ingredient.plural_override,
                    is_deprecated: ingredient.is_deprecated,
                    ingredient_variants: variants.map((variant) => ({
                      id: variant.id,
                      variant: variant.variant,
                      home_location: variant.home_location,
                      is_deprecated: variant.is_deprecated,
                    })),
                  }
                : null,
              linked_recipe: linkedRecipe ? { title: linkedRecipe.title } : null,
            };
          });
      }

      throw new Error(
        `buildListShoppingPlanRecipeItemsMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listShoppingListAssignments
  // -------------------------------------------------------------------------

  const listShoppingListAssignmentsCapability = {
    name: 'listShoppingListAssignments',
    fixturesUrl: '../fixtures/listShoppingListAssignments.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE stores (
          ID INTEGER PRIMARY KEY,
          chain_name TEXT,
          location_name TEXT
        );
        CREATE TABLE store_locations (
          ID INTEGER PRIMARY KEY,
          store_id INTEGER,
          name TEXT,
          sort_order INTEGER
        );
        CREATE TABLE ingredients (
          ID INTEGER PRIMARY KEY,
          name TEXT
        );
        CREATE TABLE ingredient_variants (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          variant TEXT,
          sort_order INTEGER
        );
        CREATE TABLE ingredient_store_location (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          store_location_id INTEGER
        );
        CREATE TABLE ingredient_variant_store_location (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          store_location_id INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);
      list('stores').forEach((row) => {
        db.run(
          'INSERT INTO stores (ID, chain_name, location_name) VALUES (?, ?, ?);',
          [row.id, row.chain_name ?? null, row.location_name ?? null],
        );
      });
      list('store_locations').forEach((row) => {
        db.run(
          'INSERT INTO store_locations (ID, store_id, name, sort_order) VALUES (?, ?, ?, ?);',
          [row.id, row.store_id, row.name ?? null, row.sort_order ?? null],
        );
      });
      list('ingredients').forEach((row) => {
        db.run('INSERT INTO ingredients (ID, name) VALUES (?, ?);', [
          row.id,
          row.name,
        ]);
      });
      list('ingredient_variants').forEach((row) => {
        db.run(
          'INSERT INTO ingredient_variants (id, ingredient_id, variant, sort_order) VALUES (?, ?, ?, ?);',
          [row.id, row.ingredient_id, row.variant, row.sort_order ?? null],
        );
      });
      list('ingredient_store_location').forEach((row) => {
        db.run(
          'INSERT INTO ingredient_store_location (id, ingredient_id, store_location_id) VALUES (?, ?, ?);',
          [row.id, row.ingredient_id, row.store_location_id],
        );
      });
      list('ingredient_variant_store_location').forEach((row) => {
        db.run(
          'INSERT INTO ingredient_variant_store_location (id, ingredient_variant_id, store_location_id) VALUES (?, ?, ?);',
          [row.id, row.ingredient_variant_id, row.store_location_id],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listShoppingListAssignments(fixture.input?.request);
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListShoppingListAssignmentsMock(fixture)),
      });
      return adapter.listShoppingListAssignments(fixture.input?.request);
    },
  };

  function buildListShoppingListAssignmentsMock(fixture) {
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);
    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];
      if (table === 'stores') {
        return list('stores').map((row) => ({
          id: row.id,
          chain_name: row.chain_name,
          location_name: row.location_name,
        }));
      }
      if (table === 'store_locations') {
        return list('store_locations').map((row) => ({
          id: row.id,
          store_id: row.store_id,
          name: row.name,
          sort_order: row.sort_order,
        }));
      }
      if (table === 'ingredients') {
        return list('ingredients').map((row) => ({
          id: row.id,
          name: row.name,
        }));
      }
      if (table === 'ingredient_variants') {
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
          sort_order: row.sort_order,
        }));
      }
      if (table === 'ingredient_store_location') {
        return list('ingredient_store_location').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          store_location_id: row.store_location_id,
        }));
      }
      if (table === 'ingredient_variant_store_location') {
        return list('ingredient_variant_store_location').map((row) => ({
          id: row.id,
          ingredient_variant_id: row.ingredient_variant_id,
          store_location_id: row.store_location_id,
        }));
      }
      throw new Error(
        `buildListShoppingListAssignmentsMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listShoppingListRecipeSummaries
  // -------------------------------------------------------------------------

  const listShoppingListRecipeSummariesCapability = {
    name: 'listShoppingListRecipeSummaries',
    fixturesUrl: '../fixtures/listShoppingListRecipeSummaries.json',

    setupSchema(db) {
      db.run(`
        CREATE TABLE recipes (
          ID INTEGER PRIMARY KEY,
          title TEXT,
          servings_default REAL
        );
      `);
    },

    seedFixture(db, input) {
      const recipes = Array.isArray(input?.recipes) ? input.recipes : [];
      recipes.forEach((row) => {
        db.run(
          'INSERT INTO recipes (ID, title, servings_default) VALUES (?, ?, ?);',
          [row.ID, row.title ?? null, row.servings_default ?? null],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listShoppingListRecipeSummaries(
        fixture.input?.selectedRecipes,
      );
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListShoppingListRecipeSummariesMock(fixture)),
      });
      return adapter.listShoppingListRecipeSummaries(
        fixture.input?.selectedRecipes,
      );
    },
  };

  function buildListShoppingListRecipeSummariesMock(fixture) {
    const input = fixture.input || {};
    const recipes = Array.isArray(input?.recipes) ? input.recipes : [];
    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];
      if (table === 'recipes') {
        return recipes.map((row) => ({
          id: row.ID,
          title: row.title,
          servings_default: row.servings_default,
        }));
      }
      throw new Error(
        `buildListShoppingListRecipeSummariesMock: unmatched table "${table}".`,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Capability: listShoppingListPlanRows
  // -------------------------------------------------------------------------

  const listShoppingListPlanRowsCapability = {
    name: 'listShoppingListPlanRows',
    fixturesUrl: '../fixtures/listShoppingListPlanRows.json',

    setupSchema(db) {
      loadRecipeDetailCapability.setupSchema(db);
      db.run(`
        ALTER TABLE ingredients ADD COLUMN is_hidden INTEGER;
        ALTER TABLE ingredients ADD COLUMN is_food INTEGER;
        ALTER TABLE ingredient_variants ADD COLUMN sort_order INTEGER;
      `);
      db.run(`
        CREATE TABLE ingredient_store_location (
          id INTEGER PRIMARY KEY,
          ingredient_id INTEGER,
          store_location_id INTEGER
        );
        CREATE TABLE ingredient_variant_store_location (
          id INTEGER PRIMARY KEY,
          ingredient_variant_id INTEGER,
          store_location_id INTEGER
        );
      `);
    },

    seedFixture(db, input) {
      const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);

      list('recipes').forEach((r) => {
        db.run(
          'INSERT INTO recipes (ID, title, servings_default, servings_min, servings_max) VALUES (?, ?, ?, ?, ?);',
          [
            r.ID,
            r.title,
            r.servings_default ?? null,
            r.servings_min ?? null,
            r.servings_max ?? null,
          ],
        );
      });
      list('ingredients').forEach((i) => {
        db.run(
          `INSERT INTO ingredients
           (ID, name, variant, size, parenthetical_note, lemma,
            plural_by_default, is_mass_noun, plural_override, is_deprecated,
            is_hidden, is_food)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            i.ID,
            i.name,
            i.variant ?? null,
            i.size ?? null,
            i.parenthetical_note ?? null,
            i.lemma ?? null,
            i.plural_by_default ?? 0,
            i.is_mass_noun ?? 0,
            i.plural_override ?? null,
            i.is_deprecated ?? 0,
            i.is_hidden ?? 0,
            i.is_food ?? 1,
          ],
        );
      });
      list('ingredient_variants').forEach((v) => {
        db.run(
          `INSERT INTO ingredient_variants
           (id, ingredient_id, variant, home_location, is_deprecated)
           VALUES (?, ?, ?, ?, ?);`,
          [
            v.id,
            v.ingredient_id,
            v.variant,
            v.home_location ?? null,
            v.is_deprecated ?? 0,
          ],
        );
      });
      list('recipe_ingredient_map').forEach((rim) => {
        db.run(
          `INSERT INTO recipe_ingredient_map
           (ID, recipe_id, ingredient_id, section_id, sort_order,
            quantity, quantity_min, quantity_max, quantity_is_approx,
            unit, variant, size, prep_notes, is_optional, parenthetical_note,
            is_recipe, linked_recipe_id, recipe_text, is_alt, display_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            rim.ID,
            rim.recipe_id,
            rim.ingredient_id ?? null,
            rim.section_id ?? null,
            rim.sort_order ?? null,
            rim.quantity ?? null,
            rim.quantity_min ?? null,
            rim.quantity_max ?? null,
            rim.quantity_is_approx ?? 0,
            rim.unit ?? null,
            rim.variant ?? null,
            rim.size ?? null,
            rim.prep_notes ?? null,
            rim.is_optional ?? 0,
            rim.parenthetical_note ?? null,
            rim.is_recipe ?? 0,
            rim.linked_recipe_id ?? null,
            rim.recipe_text ?? null,
            rim.is_alt ?? 0,
            rim.display_name ?? null,
          ],
        );
      });
    },

    async runSqlite(db, fixture) {
      const adapter = global.createSqliteAdapter(db);
      return adapter.listShoppingListPlanRows({
        selectedItems: fixture.input?.selectedItems,
        selectedRecipes: fixture.input?.selectedRecipes,
      });
    },

    async runSupabase(fixture) {
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildListShoppingListPlanRowsMock(fixture)),
      });
      return adapter.listShoppingListPlanRows({
        selectedItems: fixture.input?.selectedItems,
        selectedRecipes: fixture.input?.selectedRecipes,
      });
    },
  };

  function buildListShoppingListPlanRowsMock(fixture) {
    const baseResolver = buildListShoppingPlanRecipeItemsMock(fixture);
    const input = fixture.input || {};
    const list = (key) => (Array.isArray(input?.[key]) ? input[key] : []);
    return function resolveRows(url) {
      const path = String(url).split('/rest/v1/')[1] || '';
      const table = path.split('?')[0];
      if (table === 'ingredients') {
        return list('ingredients').map((row) => ({
          id: row.ID,
          name: row.name,
          variant: row.variant,
          hide_from_shopping_list: row.hide_from_shopping_list,
          is_deprecated: row.is_deprecated,
          is_hidden: row.is_hidden,
          is_food: row.is_food,
          lemma: row.lemma,
          plural_by_default: row.plural_by_default,
          is_mass_noun: row.is_mass_noun,
          plural_override: row.plural_override,
          size: row.size,
          parenthetical_note: row.parenthetical_note,
        }));
      }
      if (table === 'ingredient_variants') {
        return list('ingredient_variants').map((row) => ({
          id: row.id,
          ingredient_id: row.ingredient_id,
          variant: row.variant,
          sort_order: row.sort_order,
          home_location: row.home_location,
          is_deprecated: row.is_deprecated,
        }));
      }
      if (table === 'tags') return [];
      if (table === 'ingredient_variant_tag_map') return [];
      if (table === 'recipe_ingredient_substitutes') return [];
      if (table === 'ingredient_store_location') return [];
      if (table === 'ingredient_variant_store_location') return [];
      return baseResolver(url);
    };
  }

  // -------------------------------------------------------------------------
  // Runner
  // -------------------------------------------------------------------------

  const CAPABILITIES = [
    listRecipesCapability,
    createRecipeCapability,
    deleteRecipeCapability,
    loadRecipeDetailCapability,
    loadTypeaheadPoolsCapability,
    listTagsCapability,
    createTagCapability,
    deleteTagCapability,
    loadTagUsageCapability,
    listUnitsCapability,
    listSizesCapability,
    createSizeCapability,
    listStoresCapability,
    loadStoreDetailCapability,
    lookupShoppingItemByNameCapability,
    lookupIngredientNameByLemmaCapability,
    listIngredientTagNamesCapability,
    listShoppingItemsCapability,
    loadShoppingItemDetailCapability,
    listShoppingItemRecipeUsageCapability,
    loadShoppingItemVariantUsageCapability,
    listShoppingPlanRecipeItemsCapability,
    listShoppingListAssignmentsCapability,
    listShoppingListRecipeSummariesCapability,
    listShoppingListPlanRowsCapability,
    listShoppingListHomeLocationsCapability,
    isIngredientVariantDeprecatedCapability,
  ];

  async function runOneFixture(SQL, capability, fixture) {
    let sqliteResult;
    try {
      const db = new SQL.Database();
      try {
        capability.setupSchema(db, fixture.input);
        capability.seedFixture(db, fixture.input);
        const actual = await capability.runSqlite(db, fixture);
        sqliteResult = { ok: deepEqual(actual, fixture.expected), actual };
      } finally {
        try {
          db.close();
        } catch (_) {}
      }
    } catch (err) {
      sqliteResult = {
        ok: false,
        threw: true,
        actual: null,
        err: err && err.message ? err.message : String(err),
      };
    }

    let supabaseResult;
    try {
      const actual = await capability.runSupabase(fixture);
      supabaseResult = { ok: deepEqual(actual, fixture.expected), actual };
    } catch (err) {
      supabaseResult = {
        ok: false,
        threw: true,
        actual: null,
        err: err && err.message ? err.message : String(err),
      };
    }

    return { sqliteResult, supabaseResult };
  }

  function logFixtureResult(log, capability, fixture, sqliteResult, supabaseResult) {
    const sqliteTag = sqliteResult.ok ? 'sqlite \u2713' : 'sqlite \u2717';
    const supabaseTag = supabaseResult.ok
      ? 'supabase \u2713'
      : 'supabase \u2717';
    const allOk = sqliteResult.ok && supabaseResult.ok;
    const cls = allOk ? 'pass' : 'fail';
    log(
      `${allOk ? 'PASS' : 'FAIL'}  ${capability.name}/${fixture.name}  [${sqliteTag}] [${supabaseTag}]`,
      cls,
    );

    const dumpFail = (label, result) => {
      if (result.threw) {
        log(`  ${label} threw: ${result.err}`);
        return;
      }
      log(`  ${label} expected:`);
      log(
        pretty(fixture.expected)
          .split('\n')
          .map((l) => '    ' + l)
          .join('\n'),
      );
      log(`  ${label} actual:`);
      log(
        pretty(result.actual)
          .split('\n')
          .map((l) => '    ' + l)
          .join('\n'),
      );
    };

    if (!sqliteResult.ok) dumpFail('sqlite', sqliteResult);
    if (!supabaseResult.ok) dumpFail('supabase', supabaseResult);
  }

  async function loadFixtures(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Could not load fixtures (${res.status}): ${url}`);
    }
    const doc = await res.json();
    return Array.isArray(doc?.fixtures) ? doc.fixtures : [];
  }

  async function run() {
    const out = document.getElementById('results');
    if (!out) return;
    out.textContent = '';

    const log = (line, cls) => {
      if (cls) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = line + '\n';
        out.appendChild(span);
      } else {
        out.appendChild(document.createTextNode(line + '\n'));
      }
    };

    log('Loading SQL.js…');
    const SQL = await global.initSqlJs({
      locateFile: (file) => SQL_WASM_BASE + file,
    });

    let totalSqlitePassed = 0;
    let totalSqliteFailed = 0;
    let totalSupabasePassed = 0;
    let totalSupabaseFailed = 0;
    let totalFixtures = 0;

    for (const capability of CAPABILITIES) {
      log('');
      log(`Capability: ${capability.name}`);
      let fixtures;
      try {
        fixtures = await loadFixtures(capability.fixturesUrl);
      } catch (err) {
        log(`  ERROR loading fixtures: ${err.message || err}`, 'fail');
        continue;
      }
      log(`  ${fixtures.length} fixtures × 2 adapters`);
      log('');

      for (const fixture of fixtures) {
        totalFixtures++;
        const { sqliteResult, supabaseResult } = await runOneFixture(
          SQL,
          capability,
          fixture,
        );
        if (sqliteResult.ok) totalSqlitePassed++;
        else totalSqliteFailed++;
        if (supabaseResult.ok) totalSupabasePassed++;
        else totalSupabaseFailed++;
        logFixtureResult(log, capability, fixture, sqliteResult, supabaseResult);
      }
    }

    log('');
    const allOk = totalSqliteFailed === 0 && totalSupabaseFailed === 0;
    log(
      `TOTAL: ${totalFixtures} fixtures · sqlite ${totalSqlitePassed}/${totalFixtures} · supabase ${totalSupabasePassed}/${totalFixtures}`,
      allOk ? 'pass summary' : 'fail summary',
    );
  }

  function start() {
    const out = () => document.getElementById('results');
    if (typeof global.initSqlJs !== 'function') {
      const el = out();
      if (el) {
        el.textContent =
          'ERROR: SQL.js did not load. Make sure ../../sql-wasm.js exists and the page is served via http (not file://).';
      }
      return;
    }
    if (typeof global.createSqliteAdapter !== 'function') {
      const el = out();
      if (el) {
        el.textContent =
          'ERROR: createSqliteAdapter is not defined. Make sure ../adapters/sqliteAdapter.js loaded before runParity.js.';
      }
      return;
    }
    if (typeof global.createSupabaseAdapter !== 'function') {
      const el = out();
      if (el) {
        el.textContent =
          'ERROR: createSupabaseAdapter is not defined. Make sure ../adapters/supabaseAdapter.js loaded before runParity.js.';
      }
      return;
    }
    if (!global.bridge || typeof global.bridge.loadRecipeFromDB !== 'function') {
      const el = out();
      if (el) {
        el.textContent =
          'ERROR: window.bridge.loadRecipeFromDB is not defined. Make sure ../../bridge.js loaded before runParity.js.';
      }
      return;
    }
    run().catch((err) => {
      const el = out();
      if (el) {
        el.textContent =
          'ERROR: ' + (err && err.message ? err.message : String(err));
      }
      // eslint-disable-next-line no-console
      console.error(err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
