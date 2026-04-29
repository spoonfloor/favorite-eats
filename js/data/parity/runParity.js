// Browser-based parity runner for the listRecipes capability.
//
// For each fixture in js/data/fixtures/listRecipes.json:
//   1. Run the SQLite adapter:
//      - Create an in-memory SQLite DB.
//      - Seed `recipes`, `tags`, `recipe_tag_map` tables from `fixture.input`.
//      - Call sqliteAdapter.listRecipes() and deep-compare to `fixture.expected`.
//   2. Run the Supabase adapter:
//      - Build a mock fetch that returns the fixture data in the same shape
//        PostgREST would return for the adapter's `select=...` query.
//      - Call supabaseAdapter.listRecipes() with the mock fetch injected.
//      - Deep-compare to `fixture.expected`.
//
// Both adapters MUST produce the same `expected` for every fixture. Any
// divergence is a parity failure and blocks the cutover.
//
// Output renders into <pre id="results">. Open the host page in a browser
// served via http (not file://) — the SQL.js wasm fetch and JSON fetch both
// require it.

(function bootParityRunner(global) {
  const SQL_WASM_BASE = '../../';
  const FIXTURES_URL = '../fixtures/listRecipes.json';
  const FAKE_SUPABASE_URL = 'https://parity.test.invalid';
  const FAKE_SUPABASE_ANON_KEY = 'parity-fake-key';

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

  // ---- SQLite path ----------------------------------------------------------

  function setupSchema(db) {
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
  }

  function seedSqlite(db, input) {
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
  }

  async function runSqliteFixture(SQL, fixture) {
    const db = new SQL.Database();
    try {
      setupSchema(db);
      seedSqlite(db, fixture.input);
      const adapter = global.createSqliteAdapter(db);
      const actual = await adapter.listRecipes();
      return { ok: deepEqual(actual, fixture.expected), actual };
    } finally {
      try {
        db.close();
      } catch (_) {}
    }
  }

  // ---- Supabase path --------------------------------------------------------

  // Convert the fixture input (flat rows shaped like the SQLite tables) into
  // the nested response shape PostgREST returns for the adapter's query:
  //   recipes?select=id,title,servings_default,servings_min,servings_max,
  //                  recipe_tag_map(id,sort_order,tags(name,is_hidden))
  // The adapter re-sorts client-side, so the order this mock returns rows in
  // does not affect adapter correctness.
  function fixtureToPostgrestRows(input) {
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

  function makeMockFetch(rows) {
    return async function mockFetch(url, init) {
      const auth = init && init.headers ? init.headers.Authorization : '';
      const apikey = init && init.headers ? init.headers.apikey : '';
      const profile =
        init && init.headers ? init.headers['Accept-Profile'] : '';
      // Sanity-check the adapter is wiring credentials & schema header. If
      // any of these fail, the adapter is calling Supabase wrong.
      if (!String(url).startsWith(FAKE_SUPABASE_URL)) {
        throw new Error(`mockFetch: unexpected URL: ${url}`);
      }
      if (!auth || !apikey) {
        throw new Error('mockFetch: missing Authorization or apikey headers.');
      }
      if (profile !== 'catalog') {
        throw new Error(
          `mockFetch: expected Accept-Profile=catalog, got "${profile}".`,
        );
      }
      return {
        ok: true,
        status: 200,
        json: async () => rows,
        text: async () => JSON.stringify(rows),
      };
    };
  }

  async function runSupabaseFixture(fixture) {
    const rows = fixtureToPostgrestRows(fixture.input);
    const adapter = global.createSupabaseAdapter({
      url: FAKE_SUPABASE_URL,
      anonKey: FAKE_SUPABASE_ANON_KEY,
      fetchImpl: makeMockFetch(rows),
    });
    const actual = await adapter.listRecipes();
    return { ok: deepEqual(actual, fixture.expected), actual };
  }

  // ---- Reporter -------------------------------------------------------------

  function pretty(json) {
    try {
      return JSON.stringify(json, null, 2);
    } catch (_) {
      return String(json);
    }
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

    log('Loading fixtures…');
    const fixturesRes = await fetch(FIXTURES_URL, { cache: 'no-store' });
    if (!fixturesRes.ok) {
      throw new Error(
        `Could not load fixtures (${fixturesRes.status}): ${FIXTURES_URL}`,
      );
    }
    const fixturesDoc = await fixturesRes.json();
    const fixtures = Array.isArray(fixturesDoc?.fixtures)
      ? fixturesDoc.fixtures
      : [];

    log(`Running ${fixtures.length} fixtures × 2 adapters.`);
    log('');

    let sqlitePassed = 0;
    let sqliteFailed = 0;
    let supabasePassed = 0;
    let supabaseFailed = 0;

    for (const fixture of fixtures) {
      let sqliteResult;
      try {
        sqliteResult = await runSqliteFixture(SQL, fixture);
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
        supabaseResult = await runSupabaseFixture(fixture);
      } catch (err) {
        supabaseResult = {
          ok: false,
          threw: true,
          actual: null,
          err: err && err.message ? err.message : String(err),
        };
      }

      const sqliteTag = sqliteResult.ok ? 'sqlite \u2713' : 'sqlite \u2717';
      const supabaseTag = supabaseResult.ok
        ? 'supabase \u2713'
        : 'supabase \u2717';
      const lineCls =
        sqliteResult.ok && supabaseResult.ok ? 'pass' : 'fail';
      log(
        `${sqliteResult.ok && supabaseResult.ok ? 'PASS' : 'FAIL'}  ${fixture.name}  [${sqliteTag}] [${supabaseTag}]`,
        lineCls,
      );

      if (sqliteResult.ok) sqlitePassed++;
      else {
        sqliteFailed++;
        if (sqliteResult.threw) {
          log('  sqlite threw: ' + sqliteResult.err);
        } else {
          log('  sqlite expected:');
          log(
            pretty(fixture.expected)
              .split('\n')
              .map((l) => '    ' + l)
              .join('\n'),
          );
          log('  sqlite actual:');
          log(
            pretty(sqliteResult.actual)
              .split('\n')
              .map((l) => '    ' + l)
              .join('\n'),
          );
        }
      }

      if (supabaseResult.ok) supabasePassed++;
      else {
        supabaseFailed++;
        if (supabaseResult.threw) {
          log('  supabase threw: ' + supabaseResult.err);
        } else {
          log('  supabase expected:');
          log(
            pretty(fixture.expected)
              .split('\n')
              .map((l) => '    ' + l)
              .join('\n'),
          );
          log('  supabase actual:');
          log(
            pretty(supabaseResult.actual)
              .split('\n')
              .map((l) => '    ' + l)
              .join('\n'),
          );
        }
      }
    }

    log('');
    const allOk = sqliteFailed === 0 && supabaseFailed === 0;
    log(
      `TOTAL: sqlite ${sqlitePassed}/${fixtures.length}, supabase ${supabasePassed}/${fixtures.length}`,
      allOk ? 'pass summary' : 'fail summary',
    );
  }

  function start() {
    if (typeof global.initSqlJs !== 'function') {
      const out = document.getElementById('results');
      if (out) {
        out.textContent =
          'ERROR: SQL.js did not load. Make sure ../../sql-wasm.js exists and the page is served via http (not file://).';
      }
      return;
    }
    if (typeof global.createSqliteAdapter !== 'function') {
      const out = document.getElementById('results');
      if (out) {
        out.textContent =
          'ERROR: createSqliteAdapter is not defined. Make sure ../adapters/sqliteAdapter.js loaded before runParity.js.';
      }
      return;
    }
    if (typeof global.createSupabaseAdapter !== 'function') {
      const out = document.getElementById('results');
      if (out) {
        out.textContent =
          'ERROR: createSupabaseAdapter is not defined. Make sure ../adapters/supabaseAdapter.js loaded before runParity.js.';
      }
      return;
    }
    run().catch((err) => {
      const out = document.getElementById('results');
      if (out) {
        out.textContent =
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
