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
    return async function mockFetch(url, init) {
      const auth = init && init.headers ? init.headers.Authorization : '';
      const apikey = init && init.headers ? init.headers.apikey : '';
      const profile =
        init && init.headers ? init.headers['Accept-Profile'] : '';
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
      const rows = rowsResolver(String(url));
      return {
        ok: true,
        status: 200,
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
      // Supabase adapter for loadRecipeDetail will be added next.
      if (typeof global.createSupabaseAdapter !== 'function') {
        throw new Error('Supabase adapter not loaded.');
      }
      const adapter = global.createSupabaseAdapter({
        url: FAKE_SUPABASE_URL,
        anonKey: FAKE_SUPABASE_ANON_KEY,
        fetchImpl: makeMockFetch(buildLoadRecipeDetailMock(fixture)),
      });
      if (typeof adapter.loadRecipeDetail !== 'function') {
        throw new Error('Supabase adapter is missing loadRecipeDetail (not yet implemented).');
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
  // Runner
  // -------------------------------------------------------------------------

  const CAPABILITIES = [listRecipesCapability, loadRecipeDetailCapability];

  async function runOneFixture(SQL, capability, fixture) {
    let sqliteResult;
    try {
      const db = new SQL.Database();
      try {
        capability.setupSchema(db);
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
