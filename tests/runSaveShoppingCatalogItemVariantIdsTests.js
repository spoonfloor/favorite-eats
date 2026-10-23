#!/usr/bin/env node
'use strict';

// saveShoppingCatalogItem must keep ingredient_variants ids stable across saves:
// plan items are keyed `iv:<id>`, so renumbering on save orphans them.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const adapterPath =
  process.env.FE_ADAPTER_PATH ||
  path.join(projectRoot, 'js', 'data', 'adapters', 'supabaseAdapter.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e} but got ${a}`);
}

/** Minimal in-memory PostgREST: eq./in. filters, insert with ids, FK cascade on variants. */
function createFakeDb(seed) {
  const tables = new Map(Object.entries(JSON.parse(JSON.stringify(seed))));
  let nextId = Math.max(
    0,
    ...[...tables.values()].flat().map((row) => Number(row.id) || 0),
  );
  const table = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };

  function parse(endpoint) {
    const u = new URL(endpoint);
    const name = u.pathname.replace(/^\/rest\/v1\//, '');
    const filters = [];
    u.searchParams.forEach((value, key) => {
      if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return;
      if (value.startsWith('eq.')) {
        filters.push((row) => String(row[key]) === value.slice(3));
      } else if (value.startsWith('in.(')) {
        const set = new Set(value.slice(4, -1).split(',').map((v) => v.trim()));
        filters.push((row) => set.has(String(row[key])));
      } else {
        filters.push(() => false);
      }
    });
    return { name, match: (row) => filters.every((f) => f(row)) };
  }

  function cascadeVariantDelete(ids) {
    const gone = new Set(ids.map(String));
    for (const child of ['ingredient_variant_tag_map', 'ingredient_variant_store_location']) {
      tables.set(child, table(child).filter((r) => !gone.has(String(r.ingredient_variant_id))));
    }
  }

  const respond = (status, payload) => ({
    ok: status < 400,
    status,
    async json() {
      return payload;
    },
    async text() {
      return payload == null ? '' : JSON.stringify(payload);
    },
  });

  async function fetchImpl(endpoint, init = {}) {
    const method = init.method || 'GET';
    if (endpoint.includes('/rest/v1/rpc/')) {
      const fn = endpoint.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(init.body || '{}');
      if (fn === 'delete_catalog_named_variant_with_aisle_promotion') {
        const key = String(body.p_variant_name || '').trim().toLowerCase();
        const ids = table('ingredient_variants')
          .filter(
            (r) =>
              String(r.ingredient_id) === String(body.p_ingredient_id) &&
              String(r.variant).trim().toLowerCase() === key,
          )
          .map((r) => r.id);
        tables.set(
          'ingredient_variants',
          table('ingredient_variants').filter((r) => !ids.includes(r.id)),
        );
        cascadeVariantDelete(ids);
        return respond(200, ids.length);
      }
      return respond(200, null);
    }
    const { name, match } = parse(endpoint);
    const rows = table(name);
    if (method === 'GET') return respond(200, rows.filter(match));
    if (method === 'DELETE') {
      const removed = rows.filter(match).map((r) => r.id);
      tables.set(name, rows.filter((r) => !match(r)));
      if (name === 'ingredient_variants') cascadeVariantDelete(removed);
      return respond(204, null);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(init.body || '{}');
      rows.filter(match).forEach((r) => Object.assign(r, patch));
      return respond(204, null);
    }
    if (method === 'POST') {
      const body = JSON.parse(init.body || '{}');
      const row = { id: (nextId += 1), ...body };
      rows.push(row);
      return respond(201, [row]);
    }
    return respond(405, null);
  }

  return { fetchImpl, rows: (name) => table(name) };
}

function createAdapter(fetchImpl) {
  const context = { console, URL, localStorage: null, sessionStorage: null };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(adapterPath, 'utf8'), context, {
    filename: 'supabaseAdapter.js',
  });
  return context.createSupabaseAdapter({
    url: 'https://example.test',
    anonKey: 'anon',
    fetchImpl,
  });
}

const OAT_MILK_SEED = {
  ingredients: [{ id: 238, name: 'oat milk' }],
  ingredient_variants: [
    { id: 2018, ingredient_id: 238, variant: 'default', sort_order: 0, home_location: 'none', is_deprecated: false },
    { id: 2019, ingredient_id: 238, variant: 'barista', sort_order: 1, home_location: 'none', is_deprecated: false },
    { id: 2021, ingredient_id: 238, variant: 'Oatley', sort_order: 2, home_location: 'none', is_deprecated: false },
  ],
  ingredient_variant_store_location: [
    { id: 1, ingredient_variant_id: 2018, store_location_id: 7 },
    { id: 2, ingredient_variant_id: 2019, store_location_id: 9 },
  ],
  ingredient_variant_tag_map: [{ id: 1, ingredient_variant_id: 2019, tag_id: 5, sort_order: 1 }],
  tags: [{ id: 5, name: 'dairy-free', is_hidden: 0 }],
};

function saveRequest(variantRows) {
  return {
    ingredientId: 238,
    name: 'oat milk',
    variantRows,
    sizes: [],
    synonyms: [],
  };
}

const BASE_ROW = { isBase: true, variant: 'default', homeLocation: 'none', isDeprecated: false, tags: [] };
const BARISTA_ROW = { isBase: false, variant: 'barista', homeLocation: 'fridge', isDeprecated: false, tags: ['dairy-free'] };
const OATLEY_ROW = { isBase: false, variant: 'Oatley', homeLocation: 'none', isDeprecated: false, tags: [] };

const variantIdsByName = (db) =>
  Object.fromEntries(
    db
      .rows('ingredient_variants')
      .filter((r) => r.ingredient_id === 238)
      .map((r) => [r.variant, r.id]),
  );

async function run() {
  {
    const db = createFakeDb(OAT_MILK_SEED);
    await createAdapter(db.fetchImpl).saveShoppingCatalogItem(
      saveRequest([BASE_ROW, BARISTA_ROW, OATLEY_ROW]),
    );
    assertDeepEqual(
      variantIdsByName(db),
      { default: 2018, barista: 2019, Oatley: 2021 },
      'Saving without variant changes keeps every variant id',
    );
    const barista = db.rows('ingredient_variants').find((r) => r.id === 2019);
    assert(barista.home_location === 'fridge', 'Edited fields are patched onto the existing row');
    assertDeepEqual(
      db.rows('ingredient_variant_store_location').map((r) => r.ingredient_variant_id).sort(),
      [2018, 2019],
      'Aisle links on surviving variants (base included) are left in place',
    );
    assertDeepEqual(
      db.rows('ingredient_variant_tag_map').map((r) => [r.ingredient_variant_id, r.tag_id]),
      [[2019, 5]],
      'Tags are rebuilt against the same variant id',
    );
  }

  {
    const db = createFakeDb(OAT_MILK_SEED);
    await createAdapter(db.fetchImpl).saveShoppingCatalogItem(
      saveRequest([
        BASE_ROW,
        BARISTA_ROW,
        OATLEY_ROW,
        { isBase: false, variant: 'unsweetened', homeLocation: 'none', isDeprecated: false, tags: [] },
      ]),
    );
    const ids = variantIdsByName(db);
    assert(
      ids.default === 2018 && ids.barista === 2019 && ids.Oatley === 2021,
      'Adding a variant keeps existing ids',
    );
    assert(ids.unsweetened > 2021, 'A new variant gets a new row');
  }

  {
    const db = createFakeDb(OAT_MILK_SEED);
    await createAdapter(db.fetchImpl).saveShoppingCatalogItem(
      saveRequest([BASE_ROW, BARISTA_ROW]),
    );
    assertDeepEqual(
      variantIdsByName(db),
      { default: 2018, barista: 2019 },
      'Removing a variant deletes only that row',
    );
  }

  {
    const db = createFakeDb(OAT_MILK_SEED);
    await createAdapter(db.fetchImpl).saveShoppingCatalogItem(
      saveRequest([BASE_ROW, BARISTA_ROW, { ...OATLEY_ROW, variant: 'OATLEY' }]),
    );
    assertDeepEqual(
      variantIdsByName(db),
      { default: 2018, barista: 2019, OATLEY: 2021 },
      'A case-only rename keeps the id and updates the spelling',
    );
  }

  console.log('saveShoppingCatalogItem variant id stability tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
