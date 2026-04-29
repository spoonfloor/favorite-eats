// Supabase adapter for the data service.
//
// Implements contracts in js/data/contracts/. Reads from Supabase via PostgREST.
// Created via createSupabaseAdapter(opts). The adapter has the same shape as
// sqliteAdapter; both must satisfy the same contracts.
//
// Contract: js/data/contracts/listRecipes.md
//
// `opts.fetchImpl` is injectable for parity tests — defaults to window.fetch.
// `opts.url` and `opts.anonKey` are also injectable; defaults come from globals
// and localStorage matching the legacy catalogApi.js layer.

(function initSupabaseAdapter(global) {
  if (!global) return;

  const DEFAULT_SUPABASE_URL = 'https://ysesmbcvxmaymtsqeipc.supabase.co';
  const DEFAULT_SUPABASE_ANON_KEY =
    'sb_publishable_gIYjmWOjcHtg5RRLbw8yLQ_AGWYQH2E';

  function trimStr(v) {
    return String(v == null ? '' : v).trim();
  }

  function readLocalStorage(key) {
    try {
      return global.localStorage && typeof global.localStorage.getItem === 'function'
        ? global.localStorage.getItem(key)
        : null;
    } catch (_) {
      return null;
    }
  }

  function getConfig(opts) {
    const url = trimStr(
      opts?.url ||
        global.__SUPABASE_URL__ ||
        readLocalStorage('favoriteEatsSupabaseUrl') ||
        DEFAULT_SUPABASE_URL,
    );
    const anonKey = trimStr(
      opts?.anonKey ||
        global.__SUPABASE_ANON_KEY__ ||
        readLocalStorage('favoriteEatsSupabaseAnonKey') ||
        DEFAULT_SUPABASE_ANON_KEY,
    );
    return { url, anonKey };
  }

  function toPositiveOrNull(rawValue) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function fetchRecipesWithTags(opts) {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error('listRecipes: missing Supabase URL or anon key.');
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error('listRecipes: no fetch implementation available.');
    }

    const select = [
      'id',
      'title',
      'servings_default',
      'servings_min',
      'servings_max',
      'recipe_tag_map(id,sort_order,tags(name,is_hidden))',
    ].join(',');

    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/recipes?select=${encodeURIComponent(
      select,
    )}&order=title.asc`;

    const res = await fetchImpl(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Accept-Profile': 'catalog',
      },
    });
    if (!res || !res.ok) {
      const body =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`listRecipes: Supabase read failed (${status}): ${body}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  function buildTagListFromMappings(mappings) {
    const candidates = (Array.isArray(mappings) ? mappings : [])
      .filter((m) => m && m.tags && Number(m.tags.is_hidden || 0) === 0)
      .map((m) => ({
        sortOrder:
          m.sort_order == null || m.sort_order === ''
            ? null
            : Number(m.sort_order),
        mapId: Number(m.id),
        name: trimStr(m.tags.name),
      }))
      .filter((t) => t.name.length > 0);

    candidates.sort((a, b) => {
      const aSort = a.sortOrder == null ? Infinity : a.sortOrder;
      const bSort = b.sortOrder == null ? Infinity : b.sortOrder;
      if (aSort !== bSort) return aSort - bSort;
      if (Number.isFinite(a.mapId) && Number.isFinite(b.mapId)) {
        if (a.mapId !== b.mapId) return a.mapId - b.mapId;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const seen = new Set();
    const out = [];
    candidates.forEach((t) => {
      const key = t.name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(t.name);
    });
    return out;
  }

  function transformRecipeRow(row) {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    const def = toPositiveOrNull(row?.servings_default);
    return {
      id,
      title: row?.title == null ? '' : String(row.title),
      tags: buildTagListFromMappings(row?.recipe_tag_map),
      servingsDefault: def,
      servings: {
        default: def,
        min: toPositiveOrNull(row?.servings_min),
        max: toPositiveOrNull(row?.servings_max),
      },
    };
  }

  function sortByTitleNocase(arr) {
    return arr.slice().sort((a, b) =>
      String(a?.title || '').localeCompare(String(b?.title || ''), undefined, {
        sensitivity: 'base',
      }),
    );
  }

  async function listRecipes(opts) {
    const rows = await fetchRecipesWithTags(opts);
    const transformed = rows
      .map((row) => transformRecipeRow(row))
      .filter((row) => row != null);
    // PostgREST sorts by title.asc (case-sensitive). Contract requires NOCASE
    // ordering, so re-sort client-side to guarantee parity.
    return sortByTitleNocase(transformed);
  }

  function createSupabaseAdapter(opts = {}) {
    return {
      listRecipes: () => listRecipes(opts),
    };
  }

  global.createSupabaseAdapter = createSupabaseAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
