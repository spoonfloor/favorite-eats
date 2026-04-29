// Browser-based parity runner for the listRecipes capability.
//
// For each fixture in js/data/fixtures/listRecipes.json:
//   1. Create an in-memory SQLite DB.
//   2. Seed `recipes`, `tags`, `recipe_tag_map` tables from `fixture.input`.
//   3. Call the SQLite adapter's listRecipes().
//   4. Deep-compare the result against `fixture.expected`.
//
// Output renders into <pre id="results"> on the host page. Open the host
// page in a browser served via http (not file://).

(function bootParityRunner(global) {
  const SQL_WASM_BASE = '../../';
  const FIXTURES_URL = '../fixtures/listRecipes.json';

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

  function seedFixture(db, input) {
    const recipes = Array.isArray(input?.recipes) ? input.recipes : [];
    const tags = Array.isArray(input?.tags) ? input.tags : [];
    const tagMap = Array.isArray(input?.recipe_tag_map) ? input.recipe_tag_map : [];

    recipes.forEach((r) => {
      db.run(
        'INSERT INTO recipes (ID, title, servings_default, servings_min, servings_max) VALUES (?, ?, ?, ?, ?);',
        [r.ID, r.title, r.servings_default, r.servings_min, r.servings_max],
      );
    });
    tags.forEach((t) => {
      db.run(
        'INSERT INTO tags (id, name, is_hidden) VALUES (?, ?, ?);',
        [t.id, t.name, t.is_hidden],
      );
    });
    tagMap.forEach((m) => {
      db.run(
        'INSERT INTO recipe_tag_map (id, recipe_id, tag_id, sort_order) VALUES (?, ?, ?, ?);',
        [m.id, m.recipe_id, m.tag_id, m.sort_order],
      );
    });
  }

  function pretty(json) {
    try {
      return JSON.stringify(json, null, 2);
    } catch (_) {
      return String(json);
    }
  }

  async function runOne(SQL, fixture) {
    const db = new SQL.Database();
    try {
      setupSchema(db);
      seedFixture(db, fixture.input);
      const adapter = global.createSqliteAdapter(db);
      const actual = await adapter.listRecipes();
      const ok = deepEqual(actual, fixture.expected);
      return { ok, actual };
    } finally {
      try { db.close(); } catch (_) {}
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
    const fixtures = Array.isArray(fixturesDoc?.fixtures) ? fixturesDoc.fixtures : [];

    log(`Running ${fixtures.length} fixtures.`);
    log('');

    let passed = 0;
    let failed = 0;
    for (const fixture of fixtures) {
      try {
        const { ok, actual } = await runOne(SQL, fixture);
        if (ok) {
          passed++;
          log(`PASS  ${fixture.name}`, 'pass');
        } else {
          failed++;
          log(`FAIL  ${fixture.name}`, 'fail');
          log('  expected:');
          log(pretty(fixture.expected).split('\n').map((l) => '    ' + l).join('\n'));
          log('  actual:');
          log(pretty(actual).split('\n').map((l) => '    ' + l).join('\n'));
        }
      } catch (err) {
        failed++;
        log(`FAIL  ${fixture.name}  (threw)`, 'fail');
        log('  ' + (err && err.message ? err.message : String(err)));
      }
    }

    log('');
    const summary = `TOTAL: ${passed} passed, ${failed} failed`;
    log(summary, failed === 0 ? 'pass summary' : 'fail summary');
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
