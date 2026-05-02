// Supabase adapter for the data service.
//
// Implements the data-service surface in js/data/index.js. Reads from Supabase
// via PostgREST and bundled writes via catalog RPCs where needed.
//
// Contracts live under js/data/contracts/.
//
// `opts.fetchImpl` is injectable for focused tests; defaults to window.fetch.
// `opts.url` and `opts.anonKey` are also injectable; defaults come from globals
// and localStorage.

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

  // SQLite NOCASE folds only ASCII A-Z to a-z (everything else passes through),
  // then compares byte-by-byte. JS localeCompare with sensitivity:'base' does
  // unicode-aware folding and locale ordering, which doesn't match — notably
  // it sorts the typographic apostrophe (U+2019) differently from SQLite.
  function asciiNocaseFold(s) {
    return String(s).replace(/[A-Z]/g, (c) => c.toLowerCase());
  }
  function sortByTitleNocase(arr) {
    return arr.slice().sort((a, b) => {
      const la = asciiNocaseFold(a?.title || '');
      const lb = asciiNocaseFold(b?.title || '');
      if (la < lb) return -1;
      if (la > lb) return 1;
      return 0;
    });
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

  // ---- loadRecipeDetail ----------------------------------------------------
  //
  // Contract: js/data/contracts/loadRecipeDetail.md
  //
  // Five PostgREST queries, one per data slice. Kept as separate calls
  // (instead of one big embedded query) for clarity and easier mocking.

  async function pgGet(opts, pathWithQuery, label = 'loadRecipeDetail') {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${pathWithQuery}`;
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
      throw new Error(`${label}: Supabase read failed (${status}): ${body}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  async function pgPost(opts, pathWithQuery, body, label = 'write') {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${pathWithQuery}`;
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Profile': 'catalog',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body || {}),
    });
    if (!res || !res.ok) {
      const responseBody =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`${label}: Supabase write failed (${status}): ${responseBody}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  async function pgDelete(opts, pathWithQuery, label = 'delete') {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${pathWithQuery}`;
    const res = await fetchImpl(endpoint, {
      method: 'DELETE',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Content-Profile': 'catalog',
        Prefer: 'return=minimal',
      },
    });
    if (!res || !res.ok) {
      const responseBody =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`${label}: Supabase delete failed (${status}): ${responseBody}`);
    }
    return true;
  }

  async function pgPatch(opts, pathWithQuery, body, label = 'write') {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${pathWithQuery}`;
    const res = await fetchImpl(endpoint, {
      method: 'PATCH',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Profile': 'catalog',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body || {}),
    });
    if (!res || !res.ok) {
      const responseBody =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`${label}: Supabase update failed (${status}): ${responseBody}`);
    }
    return true;
  }

  async function pgRpc(opts, functionName, body, label = 'rpc') {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/rpc/${functionName}`;
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Profile': 'catalog',
        'Content-Profile': 'catalog',
      },
      body: JSON.stringify(body || {}),
    });
    if (!res || !res.ok) {
      const responseBody =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`${label}: Supabase RPC failed (${status}): ${responseBody}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---- createRecipe --------------------------------------------------------
  //
  // Contract: js/data/contracts/createRecipe.md

  async function createRecipe(opts, request = {}) {
    const title = trimStr(request?.title);
    if (!title) {
      throw new Error('createRecipe: title is required.');
    }
    const rows = await pgPost(
      opts,
      'recipes?select=id',
      { title, servings_min: 0.5, servings_max: 99 },
      'createRecipe',
    );
    const newId = Number(rows[0]?.id);
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createRecipe: Supabase did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- deleteRecipe --------------------------------------------------------
  //
  // Contract: js/data/contracts/deleteRecipe.md

  async function deleteRecipe(opts, request = {}) {
    const id = Number(request?.id ?? request?.recipeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('deleteRecipe: valid recipe id is required.');
    }
    await pgDelete(opts, `recipes?id=eq.${encodeURIComponent(String(id))}`, 'deleteRecipe');
    return { id };
  }

  function toBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    const n = Number(v);
    return Number.isFinite(n) && n !== 0;
  }

  function emptyIfNullish(v) {
    return v == null ? '' : String(v);
  }

  function trimOrEmpty(v) {
    return v == null ? '' : String(v).trim();
  }

  // PostgREST integer columns can come back as numbers or string-encoded
  // numbers depending on the column type. Normalize to a JS number when it
  // looks like one, otherwise keep the original (which may be null).
  function intOrNull(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeQuantity(rawQty) {
    if (rawQty == null) return null;
    if (typeof rawQty === 'number') return rawQty;
    if (typeof rawQty === 'string') {
      if (/^\s*\d+(\.\d+)?\s*$/.test(rawQty)) return parseFloat(rawQty);
      return rawQty;
    }
    return rawQty;
  }

  function buildTagListFromTagMapRows(rows) {
    return buildTagListFromMappings(rows);
  }

  function buildSteps(rawSteps) {
    return (Array.isArray(rawSteps) ? rawSteps : [])
      .map((s) => ({
        ID: intOrNull(s?.id),
        step_number: intOrNull(s?.step_number),
        instructions: s?.instructions == null ? '' : String(s.instructions),
        type: s?.type == null ? null : String(s.type),
      }))
      .sort((a, b) => {
        const aN = a.step_number == null ? Infinity : a.step_number;
        const bN = b.step_number == null ? Infinity : b.step_number;
        return aN - bN;
      });
  }

  // Mirrors bridge.loadRecipeFromDB's home_location subquery: pick the
  // ingredient's canonical variant (variant in ('','default'), with 'default'
  // preferred, then lowest id) and return its home_location lowercased. If
  // no canonical variant exists, return ''.
  function resolveLocationAtHome(ingredientVariants) {
    const candidates = (
      Array.isArray(ingredientVariants) ? ingredientVariants : []
    )
      .map((v) => ({
        variant: trimOrEmpty(v?.variant).toLowerCase(),
        home_location: v?.home_location == null ? null : String(v.home_location),
        id: intOrNull(v?.id),
      }))
      .filter((v) => v.variant === '' || v.variant === 'default');

    if (!candidates.length) return '';
    candidates.sort((a, b) => {
      const aRank = a.variant === 'default' ? 0 : 1;
      const bRank = b.variant === 'default' ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      const aId = a.id == null ? Infinity : a.id;
      const bId = b.id == null ? Infinity : b.id;
      return aId - bId;
    });
    const loc = candidates[0].home_location;
    if (loc == null) return '';
    return String(loc).toLowerCase();
  }

  // Mirrors bridge.loadRecipeFromDB's variant_deprecated subquery: find the
  // ingredient_variant whose variant string matches the rim's chosen variant
  // (case-insensitive trim) and return its is_deprecated. Default false.
  function resolveVariantDeprecated(ingredientVariants, chosenVariantRaw) {
    const chosen = trimOrEmpty(chosenVariantRaw).toLowerCase();
    const match = (Array.isArray(ingredientVariants) ? ingredientVariants : []).find(
      (v) => trimOrEmpty(v?.variant).toLowerCase() === chosen,
    );
    return toBool(match?.is_deprecated);
  }

  // Mirrors recipeDisplayNameSql in bridge: linked recipes show their linked
  // recipe title (or recipe_text override), non-recipe rows show display_name
  // when it's set and meaningfully different from the ingredient name.
  //
  // Bridge SQL is COALESCE(NULLIF(TRIM(rim.recipe_text), ''), lr.title, i.name, '')
  // for is_recipe=1 rows. Note: only recipe_text is trimmed; lr.title and
  // i.name are used raw. linkedRecipeTitle (a separate field) IS trimmed.
  function resolveDisplayName({ rim, ingredient, linkedRecipe }) {
    const isRecipeFlag = toBool(rim?.is_recipe);
    if (isRecipeFlag) {
      const rtTrimmed = trimOrEmpty(rim?.recipe_text);
      if (rtTrimmed) return rtTrimmed;
      if (linkedRecipe && linkedRecipe.title != null) {
        return String(linkedRecipe.title);
      }
      if (ingredient && ingredient.name != null) {
        return String(ingredient.name);
      }
      return '';
    }
    const display = rim?.display_name;
    const ingName = ingredient?.name;
    const displayTrim = trimOrEmpty(display);
    const ingNameTrim = trimOrEmpty(ingName);
    if (displayTrim && displayTrim.toLowerCase() !== ingNameTrim.toLowerCase()) {
      return display == null ? '' : String(display);
    }
    return ingName == null ? '' : String(ingName);
  }

  function transformRimRow(rim) {
    const ingredient = rim?.ingredients || null;
    const linkedRecipe = rim?.linked_recipe || null;
    const variants = ingredient?.ingredient_variants || [];

    const rimId = intOrNull(rim?.id);

    const chosenVariant =
      rim?.variant === undefined || rim?.variant === null
        ? ingredient?.variant || ''
        : rim.variant || '';
    const chosenSize =
      rim?.size === undefined || rim?.size === null
        ? ingredient?.size || ''
        : rim.size || '';

    const linkedRecipeId = intOrNull(rim?.linked_recipe_id);
    const linkedRecipeIdPositive =
      linkedRecipeId != null && linkedRecipeId > 0 ? linkedRecipeId : null;
    const isRecipe = toBool(rim?.is_recipe) && linkedRecipeIdPositive != null;

    const rawName = resolveDisplayName({ rim, ingredient, linkedRecipe });
    const name =
      typeof rawName === 'string' && rawName.trim() === 'Add an ingredient.'
        ? ''
        : rawName;

    return {
      rowType: 'ingredient',
      rimId: rimId,
      clientId: rimId == null ? null : `i-${rimId}`,
      sectionId: intOrNull(rim?.section_id),
      sortOrder: intOrNull(rim?.sort_order),
      quantity: normalizeQuantity(rim?.quantity),
      quantityMin: toPositiveOrNull(rim?.quantity_min),
      quantityMax: toPositiveOrNull(rim?.quantity_max),
      quantityIsApprox: toBool(rim?.quantity_is_approx),
      unit: emptyIfNullish(rim?.unit),
      name,
      variant: emptyIfNullish(chosenVariant),
      size: emptyIfNullish(chosenSize),
      lemma: emptyIfNullish(ingredient?.lemma),
      pluralByDefault: toBool(ingredient?.plural_by_default),
      isMassNoun: toBool(ingredient?.is_mass_noun),
      pluralOverride: emptyIfNullish(ingredient?.plural_override),
      prepNotes: emptyIfNullish(rim?.prep_notes),
      isOptional: toBool(rim?.is_optional),
      parentheticalNote:
        rim?.parenthetical_note != null
          ? String(rim.parenthetical_note)
          : ingredient?.parenthetical_note != null
            ? String(ingredient.parenthetical_note)
            : '',
      locationAtHome: resolveLocationAtHome(variants),
      isRecipe,
      linkedRecipeId: linkedRecipeIdPositive,
      linkedRecipeTitle: trimOrEmpty(linkedRecipe?.title),
      recipeText: trimOrEmpty(rim?.recipe_text),
      isDeprecated: toBool(ingredient?.is_deprecated),
      variantDeprecated: resolveVariantDeprecated(variants, chosenVariant),
      isAlt: toBool(rim?.is_alt),
    };
  }

  function transformHeadingRow(row) {
    const headingId = intOrNull(row?.id);
    return {
      rowType: 'heading',
      headingId,
      headingClientId: headingId == null ? null : `h-${headingId}`,
      sectionId: intOrNull(row?.section_id),
      sortOrder: intOrNull(row?.sort_order),
      text: row?.heading_text == null ? '' : String(row.heading_text),
    };
  }

  function interleaveIngredientsAndHeadings(ingredientRows, headingRows) {
    const all = [...ingredientRows, ...headingRows];
    const sortKey = (row) =>
      row && row.sortOrder != null ? row.sortOrder : 999999;
    const typeRank = (row) => {
      if (!row) return 9;
      if (row.rowType === 'heading') return 0;
      if (row.rowType === 'ingredient') return 1;
      return 5;
    };
    const idOf = (row) =>
      row.rowType === 'heading'
        ? row.headingId == null
          ? 0
          : row.headingId
        : row.rimId == null
          ? 0
          : row.rimId;
    all.sort((a, b) => {
      const sa = sortKey(a);
      const sb = sortKey(b);
      if (sa !== sb) return sa - sb;
      const ta = typeRank(a);
      const tb = typeRank(b);
      if (ta !== tb) return ta - tb;
      return idOf(a) - idOf(b);
    });
    return all;
  }

  async function loadRecipeDetail(opts, recipeId) {
    const id = Number(recipeId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const recipeRows = await pgGet(
      opts,
      `recipes?select=id,title,servings_default,servings_min,servings_max&id=eq.${id}&limit=1`,
    );
    if (!recipeRows.length) return null;
    const recipe = recipeRows[0];
    const recipeIdValid = intOrNull(recipe?.id);
    if (recipeIdValid == null || recipeIdValid <= 0) return null;

    const tagMapSelect = encodeURIComponent('id,sort_order,tags(name,is_hidden)');
    const stepsSelect = encodeURIComponent('id,step_number,instructions,type');
    const headingsSelect = encodeURIComponent('id,section_id,sort_order,heading_text');
    const rimSelect = encodeURIComponent(
      [
        'id',
        'section_id',
        'sort_order',
        'quantity',
        'quantity_min',
        'quantity_max',
        'quantity_is_approx',
        'unit',
        'variant',
        'size',
        'prep_notes',
        'is_optional',
        'parenthetical_note',
        'is_recipe',
        'linked_recipe_id',
        'recipe_text',
        'is_alt',
        'display_name',
        'ingredients(id,name,variant,size,parenthetical_note,lemma,plural_by_default,is_mass_noun,plural_override,is_deprecated,ingredient_variants(id,variant,home_location,is_deprecated))',
        'linked_recipe:recipes!linked_recipe_id(title)',
      ].join(','),
    );

    const [tagMapRows, stepRows, headingRows, rimRows] = await Promise.all([
      pgGet(opts, `recipe_tag_map?recipe_id=eq.${id}&select=${tagMapSelect}`),
      pgGet(opts, `recipe_steps?recipe_id=eq.${id}&select=${stepsSelect}`),
      pgGet(
        opts,
        `recipe_ingredient_headings?recipe_id=eq.${id}&select=${headingsSelect}`,
      ),
      pgGet(opts, `recipe_ingredient_map?recipe_id=eq.${id}&select=${rimSelect}`),
    ]);

    const tags = buildTagListFromTagMapRows(tagMapRows);
    const steps = buildSteps(stepRows);
    const ingredients = (Array.isArray(rimRows) ? rimRows : []).map(transformRimRow);
    const headings = (Array.isArray(headingRows) ? headingRows : []).map(
      transformHeadingRow,
    );

    const interleaved = interleaveIngredientsAndHeadings(ingredients, headings);

    const hasContent = steps.length > 0 || interleaved.length > 0;
    const sections = hasContent
      ? [
          {
            ID: null,
            name: '(unnamed)',
            steps,
            ingredients: interleaved,
          },
        ]
      : [];

    const def = toPositiveOrNull(recipe?.servings_default);
    return {
      id: recipeIdValid,
      title: recipe?.title == null ? '' : String(recipe.title),
      servings: {
        default: def,
        min: toPositiveOrNull(recipe?.servings_min),
        max: toPositiveOrNull(recipe?.servings_max),
      },
      tags,
      sections,
    };
  }

  // ---- saveRecipe ----------------------------------------------------------
  //
  // Contract: js/data/contracts/saveRecipe.md

  function normalizeStepInstructions(raw) {
    if (raw == null) return '';
    let next = String(raw);
    next = next.replace(/[\u200B-\u200D\uFEFF]/g, '');
    next = next.replace(/\s+/g, ' ');
    next = next.trim();
    next = next.replace(/\s+([.,!?:;])/g, '$1');
    next = next.replace(/([.,!?:;])\s+/g, '$1 ');
    next = next.trim();
    if (/^[.,!?:;]+$/.test(next)) return '';
    return next;
  }

  function normalizeSaveTags(rawTags) {
    const values = Array.isArray(rawTags)
      ? rawTags
      : String(rawTags == null ? '' : rawTags).split(/\r?\n|,/);
    const out = [];
    const seen = new Set();
    values.forEach((rawTag) => {
      const name = String(rawTag == null ? '' : rawTag)
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 48)
        .trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(name);
    });
    return out;
  }

  function deriveIngredientLemma(rawTitle) {
    const t = String(rawTitle || '').trim();
    if (!t) return '';
    if (/^tomatoes$/i.test(t)) return t.slice(0, -2);
    if (/^potatoes$/i.test(t)) return t.slice(0, -2);
    if (/ies$/i.test(t) && t.length > 3) return t.slice(0, -3) + 'y';
    if (/(ch|sh|s|x|z)es$/i.test(t) && t.length > 2) return t.slice(0, -2);
    if (/ses$/i.test(t) && t.length > 3) return t.slice(0, -2);
    if (/s$/i.test(t) && !/ss$/i.test(t) && t.length > 1) return t.slice(0, -1);
    return t;
  }

  function positiveNumberOrNull(rawValue) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function saveRowId(rawValue) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }

  function normalizeSaveSortOrder(rawValue, fallback) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  function isSaveHeadingRow(row) {
    if (!row) return false;
    if (row.rowType === 'heading') return true;
    if (row.headingId != null) return true;
    if (row.headingClientId && row.text != null && row.name == null) return true;
    return false;
  }

  function boolFromSaveRow(row, ...keys) {
    for (const key of keys) {
      if (row && row[key] !== undefined) {
        const value = row[key];
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
          if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
        }
        return toBool(value);
      }
    }
    return false;
  }

  function buildStepsFromStepNodes(rawNodes) {
    return (Array.isArray(rawNodes) ? rawNodes : [])
      .slice()
      .sort((a, b) => {
        const ao = Number(a?.order);
        const bo = Number(b?.order);
        const aOrder = Number.isFinite(ao) ? ao : 0;
        const bOrder = Number.isFinite(bo) ? bo : 0;
        return aOrder - bOrder || String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
      })
      .map((node, index) => ({
        step_number: index + 1,
        instructions: normalizeStepInstructions(node?.text),
        type: node?.type === 'heading' ? 'heading' : null,
      }))
      .filter((step) => !!step.instructions);
  }

  function buildSavePayload(recipe) {
    const id = Number(recipe?.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('saveRecipe: valid recipe id is required.');
    }

    const sections = Array.isArray(recipe?.sections) ? recipe.sections : [];
    const stepNodesForSave =
      Array.isArray(recipe?.stepNodes) && recipe.stepNodes.length
        ? buildStepsFromStepNodes(recipe.stepNodes)
        : null;
    const steps = [];
    const headings = [];
    const ingredients = [];

    if (stepNodesForSave) {
      steps.push(...stepNodesForSave);
    }

    sections.forEach((section) => {
      const sectionId = saveRowId(section?.ID ?? section?.id);
      if (!stepNodesForSave) {
        (Array.isArray(section?.steps) ? section.steps : []).forEach((step) => {
          const instructions = normalizeStepInstructions(step?.instructions);
          if (!instructions) return;
          steps.push({
            step_number: steps.length + 1,
            instructions,
            type: step?.type === 'heading' ? 'heading' : null,
          });
        });
      }

      let fallbackSort = 1;
      (Array.isArray(section?.ingredients) ? section.ingredients : []).forEach((row) => {
        if (!row || row.isPlaceholder) return;
        if (isSaveHeadingRow(row)) {
          const headingText = trimStr(row.text);
          if (!headingText) return;
          headings.push({
            id: saveRowId(row.headingId),
            section_id: sectionId,
            sort_order: normalizeSaveSortOrder(row.sortOrder, fallbackSort++),
            heading_text: headingText,
          });
          return;
        }

        const linkedRecipeId = saveRowId(row.linkedRecipeId);
        const linkedRecipeIsValid = !!(row.isRecipe && linkedRecipeId && linkedRecipeId !== id);
        const name = trimStr(row.name);
        if (!linkedRecipeIsValid && !name) return;

        const quantityRaw = row.quantity;
        const quantityNum = Number(quantityRaw);
        const quantity =
          Number.isFinite(quantityNum) && quantityNum <= 0
            ? ''
            : String(quantityRaw == null ? '' : quantityRaw);
        const quantityFallback = positiveNumberOrNull(quantityRaw);

        ingredients.push({
          id: saveRowId(row.rimId),
          section_id: sectionId,
          sort_order: normalizeSaveSortOrder(row.sortOrder, fallbackSort++),
          quantity,
          quantity_min: positiveNumberOrNull(row.quantityMin) ?? quantityFallback,
          quantity_max: positiveNumberOrNull(row.quantityMax) ?? quantityFallback,
          quantity_is_approx: !!row.quantityIsApprox,
          unit: trimStr(row.unit),
          ingredient_name: name,
          ingredient_lemma: deriveIngredientLemma(name),
          variant: trimStr(row.variant),
          size: trimStr(row.size),
          prep_notes: trimStr(row.prepNotes),
          is_optional: !!row.isOptional,
          parenthetical_note: trimStr(row.parentheticalNote),
          is_recipe: linkedRecipeIsValid,
          linked_recipe_id: linkedRecipeIsValid ? linkedRecipeId : null,
          recipe_text: linkedRecipeIsValid
            ? trimStr(row.name || row.recipeText)
            : '',
          is_alt: boolFromSaveRow(row, 'isAlt', 'is_alt', 'isalt'),
        });
      });
    });

    return {
      id: Math.trunc(id),
      title: recipe?.title == null ? '' : String(recipe.title),
      servings: {
        default: recipe?.servings?.default ?? null,
        min: recipe?.servings?.min ?? null,
        max: recipe?.servings?.max ?? null,
      },
      tags: normalizeSaveTags(recipe?.tags),
      steps,
      headings,
      ingredients,
    };
  }

  async function saveRecipe(opts, request = {}) {
    const recipe = request?.recipe || request;
    const payload = buildSavePayload(recipe);
    await pgRpc(
      opts,
      'save_recipe',
      { recipe_payload: payload },
      'saveRecipe',
    );
    const saved = await loadRecipeDetail(opts, payload.id);
    if (!saved) {
      throw new Error('saveRecipe: saved recipe could not be reloaded.');
    }
    return saved;
  }

  // ---- loadTypeaheadPools --------------------------------------------------
  //
  // Contract: js/data/contracts/loadTypeaheadPools.md

  function sortByAsciiNocaseText(arr) {
    return arr.slice().sort((a, b) => {
      const la = asciiNocaseFold(trimStr(a));
      const lb = asciiNocaseFold(trimStr(b));
      if (la < lb) return -1;
      if (la > lb) return 1;
      return 0;
    });
  }

  function distinctTrimmedText(rows, field) {
    const seenRaw = new Set();
    const out = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const raw = row ? row[field] : null;
      const rawKey = raw == null ? '__NULL__' : String(raw);
      if (seenRaw.has(rawKey)) return;
      seenRaw.add(rawKey);
      const trimmed = trimStr(raw);
      if (trimmed) out.push(trimmed);
    });
    return out;
  }

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

  function toSortOrderValue(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function visibleIngredient(row) {
    if (!row) return false;
    if (trimStr(row.name).length === 0) return false;
    if (toBool(row.is_deprecated)) return false;
    if (toBool(row.is_hidden)) return false;
    return true;
  }

  async function loadTypeaheadPools(opts, options = {}) {
    const [ingredientRows, synonymRows, variantRows, unitRows, sizeRows] =
      await Promise.all([
        pgGet(
          opts,
          'ingredients?select=id,name,is_deprecated,is_hidden,hide_from_shopping_list',
          'loadTypeaheadPools',
        ),
        pgGet(
          opts,
          'ingredient_synonyms?select=id,ingredient_id,synonym',
          'loadTypeaheadPools',
        ),
        pgGet(
          opts,
          'ingredient_variants?select=id,ingredient_id,variant,sort_order,is_deprecated',
          'loadTypeaheadPools',
        ),
        pgGet(opts, 'units?select=code,sort_order,is_removed', 'loadTypeaheadPools'),
        pgGet(opts, 'sizes?select=id,name,sort_order,is_removed', 'loadTypeaheadPools'),
      ]);

    const visibleIngredients = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .filter(visibleIngredient)
      .map((row) => ({
        id: intOrNull(row.id ?? row.ID),
        name: row.name,
      }))
      .filter((row) => row.id != null && row.id > 0);

    const ingredientNames = sortByAsciiNocaseText(
      distinctTrimmedText(visibleIngredients, 'name'),
    );

    const unitCodes = (Array.isArray(unitRows) ? unitRows : [])
      .filter((row) => !toBool(row?.is_removed))
      .map((row) => ({
        code: trimStr(row?.code),
        sortOrder: toSortOrderValue(row?.sort_order),
      }))
      .filter((row) => row.code.length > 0)
      .sort((a, b) => {
        const aSort = a.sortOrder == null ? Infinity : a.sortOrder;
        const bSort = b.sortOrder == null ? Infinity : b.sortOrder;
        if (aSort !== bSort) return aSort - bSort;
        const la = asciiNocaseFold(a.code);
        const lb = asciiNocaseFold(b.code);
        if (la < lb) return -1;
        if (la > lb) return 1;
        return 0;
      })
      .map((row) => row.code);

    const sizeNames = (Array.isArray(sizeRows) ? sizeRows : [])
      .filter((row) => !toBool(row?.is_removed))
      .map((row) => ({
        name: trimStr(row?.name),
        sortOrder: toSortOrderValue(row?.sort_order),
      }))
      .filter((row) => row.name.length > 0)
      .sort(compareSizeDisplayValues)
      .map((row) => row.name);

    const ingredientName = trimStr(options?.ingredientName);
    let variantNames = [];
    if (ingredientName) {
      const key = ingredientName.toLowerCase();
      const ingredientIds = [];
      const seenIds = new Set();
      const pushId = (idRaw) => {
        const id = intOrNull(idRaw);
        if (id == null || id <= 0 || seenIds.has(id)) return;
        seenIds.add(id);
        ingredientIds.push(id);
      };

      visibleIngredients.forEach((row) => {
        if (trimStr(row.name).toLowerCase() === key) pushId(row.id);
      });

      const visibleIdSet = new Set(visibleIngredients.map((row) => row.id));
      (Array.isArray(synonymRows) ? synonymRows : []).forEach((row) => {
        const id = intOrNull(row?.ingredient_id);
        if (!visibleIdSet.has(id)) return;
        if (trimStr(row?.synonym).toLowerCase() === key) pushId(id);
      });

      const idSet = new Set(ingredientIds);
      variantNames = sortByAsciiNocaseText(
        distinctTrimmedText(
          (Array.isArray(variantRows) ? variantRows : []).filter((row) => {
            const id = intOrNull(row?.ingredient_id);
            const variant = trimStr(row?.variant);
            return (
              idSet.has(id) &&
              variant.length > 0 &&
              variant.toLowerCase() !== 'default' &&
              !toBool(row?.is_deprecated)
            );
          }),
          'variant',
        ),
      );
    }

    return { ingredientNames, unitCodes, sizeNames, variantNames };
  }

  // ---- buildRecipeEditorPreflightHelpers -----------------------------------
  //
  // Loads ingredient/synonym/variant/unit/size/tag snapshots so recipe-editor Save
  // can resolve unknown names (dialogs + ensure missing catalog variants) without SQLite.

  async function buildRecipeEditorPreflightHelpers(opts) {
    const [
      ingredientRows,
      synonymRows,
      variantRows,
      tagRows,
      unitList,
      sizeList,
    ] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,is_deprecated,is_hidden,hide_from_shopping_list',
        'buildRecipeEditorPreflightHelpers',
      ),
      pgGet(
        opts,
        'ingredient_synonyms?select=id,ingredient_id,synonym',
        'buildRecipeEditorPreflightHelpers',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,is_deprecated,home_location',
        'buildRecipeEditorPreflightHelpers',
      ),
      listTags(opts),
      listUnits(opts),
      listSizes(opts),
    ]);

    const visibleIngredients = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .filter(visibleIngredient)
      .map((row) => ({
        id: intOrNull(row.id ?? row.ID),
        name: row.name,
      }))
      .filter((row) => row.id != null && row.id > 0);

    const visibleIdSet = new Set(visibleIngredients.map((row) => row.id));
    const idToName = new Map();
    visibleIngredients.forEach((row) => {
      idToName.set(row.id, trimStr(row.name));
    });

    const nameToCanonicalId = new Map();
    visibleIngredients.forEach((row) => {
      const k = asciiNocaseFold(trimStr(row.name));
      if (!k) return;
      const id = row.id;
      const prev = nameToCanonicalId.get(k);
      if (prev == null || id < prev) nameToCanonicalId.set(k, id);
    });

    const synonymToId = new Map();
    (Array.isArray(synonymRows) ? synonymRows : []).forEach((syn) => {
      const id = intOrNull(syn.ingredient_id);
      if (!visibleIdSet.has(id)) return;
      const k = asciiNocaseFold(trimStr(syn.synonym));
      if (!k) return;
      const prev = synonymToId.get(k);
      if (prev == null || id < prev) synonymToId.set(k, id);
    });

    function getVisibleCanonicalId(name) {
      const k = asciiNocaseFold(trimStr(name));
      if (!k) return null;
      if (nameToCanonicalId.has(k)) return nameToCanonicalId.get(k);
      if (synonymToId.has(k)) return synonymToId.get(k);
      return null;
    }

    function anyIngredientNamed(name) {
      return getVisibleCanonicalId(name) != null;
    }

    const ingredientHelpers = { getVisibleCanonicalId, anyIngredientNamed };

    const variantRowsMutable = (Array.isArray(variantRows) ? variantRows : []).filter(
      (row) => visibleIdSet.has(intOrNull(row.ingredient_id)),
    );

    const variantPairKeys = new Set();
    variantRowsMutable.forEach((row) => {
      const iid = intOrNull(row.ingredient_id);
      const vv = trimStr(row.variant);
      if (!iid || !vv) return;
      variantPairKeys.add(`${iid}::${asciiNocaseFold(vv)}`);
    });

    const RECIPE_RESERVED_VARIANTS = new Set(['default', 'base', 'any']);

    function recipeVariantIsBaseOrReserved(rawVariant) {
      const n = asciiNocaseFold(trimStr(rawVariant));
      return !n || RECIPE_RESERVED_VARIANTS.has(n);
    }

    const hasVariantTable = true;

    function getIngredientNameById(ingredientId) {
      const iid = intOrNull(ingredientId);
      if (iid == null || iid <= 0) return '';
      return idToName.get(iid) || '';
    }

    function anyVariantForIngredient(ingredientId, variantName) {
      const iid = intOrNull(ingredientId);
      const vv = trimStr(variantName);
      if (iid == null || iid <= 0 || !vv) return false;
      if (recipeVariantIsBaseOrReserved(vv)) return true;
      return variantPairKeys.has(`${iid}::${asciiNocaseFold(vv)}`);
    }

    function getVisibleVariantPoolForIngredientId(ingredientId) {
      const iid = intOrNull(ingredientId);
      if (iid == null || iid <= 0) return [];
      const rows = variantRowsMutable
        .filter((row) => intOrNull(row.ingredient_id) === iid)
        .filter((row) => !toBool(row?.is_deprecated))
        .slice()
        .sort((a, b) => {
          const as = Number(a?.sort_order);
          const bs = Number(b?.sort_order);
          const ar = Number.isFinite(as) ? as : 999999;
          const br = Number.isFinite(bs) ? bs : 999999;
          if (ar !== br) return ar - br;
          return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
        });
      const out = [];
      const seen = new Set();
      rows.forEach((row) => {
        const value = trimStr(row?.variant);
        if (!value) return;
        const nk = asciiNocaseFold(value);
        if (!nk || nk === 'default' || seen.has(nk)) return;
        seen.add(nk);
        out.push(value);
      });
      return out;
    }

    async function ensureVariantForIngredient(ingredientId, variantName) {
      const iid = intOrNull(ingredientId);
      const vv = trimStr(variantName);
      if (iid == null || iid <= 0 || !vv) return false;
      if (recipeVariantIsBaseOrReserved(vv)) return false;
      if (anyVariantForIngredient(iid, vv)) return false;
      const rowsForIng = variantRowsMutable.filter(
        (row) => intOrNull(row.ingredient_id) === iid,
      );
      let maxSort = 0;
      rowsForIng.forEach((row) => {
        const n = Number(row.sort_order);
        if (Number.isFinite(n) && n > maxSort) maxSort = n;
      });
      const nextSort = maxSort + 1;
      const inserted = await pgPost(
        opts,
        'ingredient_variants?select=id',
        {
          ingredient_id: iid,
          variant: vv,
          sort_order: nextSort,
          home_location: 'none',
          is_deprecated: false,
        },
        'buildRecipeEditorPreflightHelpers',
      );
      const newId = intOrNull(inserted[0]?.id);
      if (newId == null || newId <= 0) return false;
      variantRowsMutable.push({
        id: newId,
        ingredient_id: iid,
        variant: vv,
        sort_order: nextSort,
        is_deprecated: false,
      });
      variantPairKeys.add(`${iid}::${asciiNocaseFold(vv)}`);
      return true;
    }

    const variantHelpers = {
      hasVariantTable,
      getIngredientNameById,
      getVisibleVariantPoolForIngredientId,
      anyVariantForIngredient,
      ensureVariantForIngredient,
    };

    const unitCodesLower = new Set();
    (Array.isArray(unitList) ? unitList : []).forEach((row) => {
      if (row?.isRemoved) return;
      const code = trimStr(row?.code);
      if (!code) return;
      unitCodesLower.add(code.toLowerCase());
    });
    const unitHelpers = {
      anySelectableUnitCoded: (code) =>
        unitCodesLower.has(trimStr(code).toLowerCase()),
    };

    const sizeNamesLower = new Set();
    (Array.isArray(sizeList) ? sizeList : []).forEach((row) => {
      if (row?.isRemoved) return;
      const name = trimStr(row?.name);
      if (!name) return;
      sizeNamesLower.add(name.toLowerCase());
    });
    const sizeHelpers = {
      anySelectableSizeNamed: (name) =>
        sizeNamesLower.has(trimStr(name).toLowerCase()),
    };

    const tagNamesLower = new Set();
    (Array.isArray(tagRows) ? tagRows : []).forEach((row) => {
      const name = trimStr(row?.name);
      if (!name) return;
      tagNamesLower.add(name.toLowerCase());
    });
    const tagHelpers = {
      anyVisibleTagNamed: (name) => tagNamesLower.has(trimStr(name).toLowerCase()),
    };

    return {
      ingredient: ingredientHelpers,
      variant: variantHelpers,
      unit: unitHelpers,
      size: sizeHelpers,
      tag: tagHelpers,
    };
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

  function compareTagRows(a, b) {
    const aSort = toTagSortOrder(a?.sort_order);
    const bSort = toTagSortOrder(b?.sort_order);
    if (aSort !== bSort) return aSort - bSort;
    const la = asciiNocaseFold(a?.name == null ? '' : String(a.name));
    const lb = asciiNocaseFold(b?.name == null ? '' : String(b.name));
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  async function listTags(opts) {
    const [tagRows, recipeTagMapRows, ingredientVariantTagMapRows] =
      await Promise.all([
        pgGet(
          opts,
          'tags?select=id,name,is_hidden,sort_order,intended_use',
          'listTags',
        ),
        pgGet(opts, 'recipe_tag_map?select=id,tag_id', 'listTags'),
        pgGet(opts, 'ingredient_variant_tag_map?select=id,tag_id', 'listTags'),
      ]);

    const recipeTagIds = new Set(
      (Array.isArray(recipeTagMapRows) ? recipeTagMapRows : [])
        .map((row) => intOrNull(row?.tag_id))
        .filter((id) => id != null && id > 0),
    );
    const ingredientTagIds = new Set(
      (Array.isArray(ingredientVariantTagMapRows)
        ? ingredientVariantTagMapRows
        : []
      )
        .map((row) => intOrNull(row?.tag_id))
        .filter((id) => id != null && id > 0),
    );

    return (Array.isArray(tagRows) ? tagRows : [])
      .filter((row) => !toBool(row?.is_hidden))
      .slice()
      .sort(compareTagRows)
      .map((row) => {
        const id = intOrNull(row?.id);
        return {
          id,
          name: row?.name == null ? '' : String(row.name),
          sortOrder: toTagSortOrder(row?.sort_order),
          intendedUse: normalizeIntendedUse(row?.intended_use),
          hasRecipeUsage: recipeTagIds.has(id),
          hasIngredientUsage: ingredientTagIds.has(id),
        };
      });
  }

  // ---- createTag -----------------------------------------------------------
  //
  // Contract: js/data/contracts/createTag.md

  async function createTag(opts, request = {}) {
    const name = trimStr(request?.name).slice(0, 48).trim();
    if (!name) {
      throw new Error('createTag: name is required.');
    }
    const intendedUse = normalizeIntendedUse(request?.intendedUse ?? request?.useFor);
    const existingRows = await pgGet(opts, 'tags?select=sort_order', 'createTag');
    const nextSort =
      (Array.isArray(existingRows) ? existingRows : []).reduce((max, row) => {
        const n = Number(row?.sort_order);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0) + 1;

    const rows = await pgPost(
      opts,
      'tags?select=id',
      { name, sort_order: nextSort, intended_use: intendedUse, is_hidden: 0 },
      'createTag',
    );
    const newId = Number(rows[0]?.id);
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createTag: Supabase did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- deleteTag -----------------------------------------------------------
  //
  // Contract: js/data/contracts/deleteTag.md

  async function deleteTag(opts, request = {}) {
    const id = Number(request?.id ?? request?.tagId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('deleteTag: valid tag id is required.');
    }
    const tagId = Math.trunc(id);
    const encodedId = encodeURIComponent(String(tagId));
    await pgDelete(opts, `recipe_tag_map?tag_id=eq.${encodedId}`, 'deleteTag');
    await pgDelete(
      opts,
      `ingredient_variant_tag_map?tag_id=eq.${encodedId}`,
      'deleteTag',
    );
    await pgDelete(opts, `tags?id=eq.${encodedId}`, 'deleteTag');
    return { id: tagId };
  }

  // ---- editTag -------------------------------------------------------------
  //
  // Contract: js/data/contracts/editTag.md

  async function editTag(opts, request = {}) {
    const id = Number(request?.id ?? request?.tagId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('editTag: valid tag id is required.');
    }
    const name = trimStr(request?.name).slice(0, 48).trim();
    if (!name) {
      throw new Error('editTag: name is required.');
    }
    const tagId = Math.trunc(id);
    await pgPatch(
      opts,
      `tags?id=eq.${encodeURIComponent(String(tagId))}`,
      { name },
      'editTag',
    );
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

  function compareTagUsageTitle(a, b) {
    const la = asciiNocaseFold(a?.title || '');
    const lb = asciiNocaseFold(b?.title || '');
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  function compareTagUsageIngredient(a, b) {
    const aName = asciiNocaseFold(a?.ingredientName || '');
    const bName = asciiNocaseFold(b?.ingredientName || '');
    if (aName < bName) return -1;
    if (aName > bName) return 1;
    const aVariant = asciiNocaseFold(a?.variantName || '');
    const bVariant = asciiNocaseFold(b?.variantName || '');
    if (aVariant < bVariant) return -1;
    if (aVariant > bVariant) return 1;
    return 0;
  }

  function positiveUniqueIds(rows, key) {
    const seen = new Set();
    const out = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const id = intOrNull(row?.[key]);
      if (id == null || id <= 0 || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  function inFilter(ids) {
    return `in.(${ids.map((id) => Math.trunc(Number(id))).join(',')})`;
  }

  async function loadTagUsage(opts, tagId) {
    const id = Number(tagId);
    if (!Number.isFinite(id) || id <= 0) return emptyTagUsage();
    const tagKey = Math.trunc(id);
    const tagRows = await pgGet(
      opts,
      `tags?select=id,intended_use&id=eq.${tagKey}&limit=1`,
      'loadTagUsage',
    );
    if (!Array.isArray(tagRows) || !tagRows.length) return emptyTagUsage();

    const mode = normalizeIntendedUse(tagRows[0]?.intended_use);
    if (mode !== 'ingredients') {
      const mapRows = await pgGet(
        opts,
        `recipe_tag_map?select=id,recipe_id&tag_id=eq.${tagKey}`,
        'loadTagUsage',
      );
      const recipeIds = positiveUniqueIds(mapRows, 'recipe_id');
      if (!recipeIds.length) return emptyTagUsage('recipes');
      const recipeRows = await pgGet(
        opts,
        `recipes?select=id,title&id=${inFilter(recipeIds)}`,
        'loadTagUsage',
      );
      const seen = new Set();
      const recipes = (Array.isArray(recipeRows) ? recipeRows : [])
        .map((row) => ({
          id: intOrNull(row?.id),
          title: row?.title == null ? '' : String(row.title),
        }))
        .filter((row) => {
          if (row.id == null || row.id <= 0 || seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        })
        .sort(compareTagUsageTitle);
      return { mode: 'recipes', recipes, ingredients: [] };
    }

    const mapRows = await pgGet(
      opts,
      `ingredient_variant_tag_map?select=id,ingredient_variant_id&tag_id=eq.${tagKey}`,
      'loadTagUsage',
    );
    const variantIds = positiveUniqueIds(mapRows, 'ingredient_variant_id');
    if (!variantIds.length) return emptyTagUsage('ingredients');
    const variantRows = await pgGet(
      opts,
      `ingredient_variants?select=id,ingredient_id,variant&id=${inFilter(variantIds)}`,
      'loadTagUsage',
    );
    const ingredientIds = positiveUniqueIds(variantRows, 'ingredient_id');
    const ingredientRows = ingredientIds.length
      ? await pgGet(
          opts,
          `ingredients?select=id,name&id=${inFilter(ingredientIds)}`,
          'loadTagUsage',
        )
      : [];
    const ingredientById = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const ingredientId = intOrNull(row?.id);
      if (ingredientId != null && ingredientId > 0) ingredientById.set(ingredientId, row);
    });
    const seen = new Set();
    const ingredients = (Array.isArray(variantRows) ? variantRows : [])
      .map((variantRow) => {
        const variantId = intOrNull(variantRow?.id);
        const ingredientId = intOrNull(variantRow?.ingredient_id);
        const ingredientRow = ingredientById.get(ingredientId);
        if (
          variantId == null ||
          variantId <= 0 ||
          ingredientId == null ||
          ingredientId <= 0 ||
          !ingredientRow ||
          seen.has(variantId)
        ) {
          return null;
        }
        seen.add(variantId);
        const ingredientName = trimStr(ingredientRow?.name);
        const variantName = normalizeTagUsageVariant(variantRow?.variant);
        return {
          ingredientId,
          ingredientName,
          variantName,
          label: makeTagUsageIngredientLabel(ingredientName, variantName),
        };
      })
      .filter(Boolean)
      .sort(compareTagUsageIngredient);
    return { mode: 'ingredients', recipes: [], ingredients };
  }

  // ---- listUnits -----------------------------------------------------------
  //
  // Contract: js/data/contracts/listUnits.md

  function compareUnitRows(a, b) {
    const aSort = toSortOrderValue(a?.sort_order);
    const bSort = toSortOrderValue(b?.sort_order);
    const aSortRank = aSort == null ? -Infinity : aSort;
    const bSortRank = bSort == null ? -Infinity : bSort;
    if (aSortRank !== bSortRank) return aSortRank - bSortRank;
    const la = asciiNocaseFold(a?.code == null ? '' : String(a.code));
    const lb = asciiNocaseFold(b?.code == null ? '' : String(b.code));
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  async function listUnits(opts) {
    const rows = await pgGet(
      opts,
      'units?select=code,name_singular,name_plural,category,sort_order,is_hidden,is_removed',
      'listUnits',
    );

    return (Array.isArray(rows) ? rows : [])
      .slice()
      .sort(compareUnitRows)
      .map((row) => ({
        code: row?.code == null ? '' : String(row.code),
        nameSingular:
          row?.name_singular == null ? '' : String(row.name_singular),
        namePlural: row?.name_plural == null ? '' : String(row.name_plural),
        category: row?.category == null ? '' : String(row.category),
        sortOrder: toSortOrderValue(row?.sort_order),
        isHidden: Number(row?.is_hidden || 0) === 1,
        isRemoved: Number(row?.is_removed || 0) === 1,
      }));
  }

  // ---- createUnit ----------------------------------------------------------
  //
  // Contract: js/data/contracts/createUnit.md

  async function createUnit(opts, request = {}) {
    const nameSingular = trimStr(
      request?.nameSingular ?? request?.name_singular,
    );
    if (!nameSingular) {
      throw new Error('createUnit: singular name is required.');
    }
    const code = (trimStr(request?.code ?? request?.unitCode) || nameSingular).trim();
    if (!code) {
      throw new Error('createUnit: unit code is required.');
    }
    const rows = await pgGet(opts, 'units?select=sort_order', 'createUnit');
    const maxSort = (Array.isArray(rows) ? rows : []).reduce((max, row) => {
      const value = Number(row?.sort_order);
      return Number.isFinite(value) && value > max ? value : max;
    }, 0);
    await pgPost(
      opts,
      'units',
      {
        code,
        name_singular: nameSingular,
        name_plural: '',
        category: '',
        sort_order: maxSort + 1,
        is_hidden: 0,
        is_removed: 0,
      },
      'createUnit',
    );
    return { code };
  }

  // ---- editUnit ------------------------------------------------------------
  //
  // Contract: js/data/contracts/editUnit.md

  async function patchUnitCodeMatches(opts, table, oldCode, newCode) {
    const rows = await pgGet(opts, `${table}?select=id,unit`, 'editUnit');
    const matches = (Array.isArray(rows) ? rows : []).filter(
      (row) => String(row?.unit ?? '') === oldCode,
    );
    for (const row of matches) {
      const rowId = intOrNull(row?.id);
      if (rowId == null || rowId <= 0) continue;
      await pgPatch(
        opts,
        `${table}?id=eq.${encodeURIComponent(String(rowId))}`,
        { unit: newCode },
        'editUnit',
      );
    }
  }

  async function editUnit(opts, request = {}) {
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
    const isHidden = toBool(request?.isHidden ?? request?.is_hidden) ? 1 : 0;
    const isRemoved = toBool(request?.isRemoved ?? request?.is_removed) ? 1 : 0;

    if (code !== oldCode) {
      await patchUnitCodeMatches(opts, 'recipe_ingredient_map', oldCode, code);
      await patchUnitCodeMatches(
        opts,
        'recipe_ingredient_substitutes',
        oldCode,
        code,
      );
    }

    await pgPatch(
      opts,
      `units?code=eq.${encodeURIComponent(oldCode)}`,
      {
        code,
        name_singular: nameSingular,
        name_plural: namePlural,
        is_hidden: isHidden,
        is_removed: isRemoved,
      },
      'editUnit',
    );
    return { code };
  }

  // ---- removeUnit ----------------------------------------------------------
  //
  // Contract: js/data/contracts/removeUnit.md

  async function removeUnit(opts, request = {}) {
    const code = trimStr(request?.code ?? request?.unitCode);
    if (!code) {
      throw new Error('removeUnit: unit code is required.');
    }
    const action = trimStr(request?.action).toLowerCase();
    if (action !== 'remove' && action !== 'delete') {
      throw new Error('removeUnit: action must be remove or delete.');
    }
    const encodedCode = encodeURIComponent(code);
    if (action === 'remove') {
      await pgPatch(opts, `units?code=eq.${encodedCode}`, { is_removed: 1 }, 'removeUnit');
    } else {
      await pgDelete(opts, `units?code=eq.${encodedCode}`, 'removeUnit');
    }
    return { code };
  }

  // ---- countRecipesUsingUnit / listRecipesUsingUnit ------------------------
  //
  // Distinct recipes referencing a unit on recipe lines or substitutes (matches
  // legacy SQLite lower(unit) semantics for the remove/delete confirmation).

  async function recipeIdSetForUnitCode(opts, rawCode, label) {
    const code = trimStr(rawCode);
    if (!code) return new Set();
    const codeKey = code.toLowerCase();

    const [rimRows, subRows] = await Promise.all([
      pgGet(
        opts,
        'recipe_ingredient_map?select=id,recipe_id,unit',
        label,
      ),
      pgGet(
        opts,
        'recipe_ingredient_substitutes?select=recipe_ingredient_id,unit',
        label,
      ),
    ]);

    const recipeIds = new Set();
    const recipeIdByRimId = new Map();

    (Array.isArray(rimRows) ? rimRows : []).forEach((row) => {
      const rimId = intOrNull(row?.id ?? row?.ID);
      const recipeId = intOrNull(row?.recipe_id);
      if (rimId != null && rimId > 0 && recipeId != null && recipeId > 0) {
        recipeIdByRimId.set(rimId, recipeId);
      }
      const u = trimStr(row?.unit);
      if (u.toLowerCase() !== codeKey) return;
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });

    (Array.isArray(subRows) ? subRows : []).forEach((row) => {
      const u = trimStr(row?.unit);
      if (u.toLowerCase() !== codeKey) return;
      const recipeId = recipeIdByRimId.get(
        intOrNull(row?.recipe_ingredient_id),
      );
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });

    return recipeIds;
  }

  async function countRecipesUsingUnit(opts, request = {}) {
    const code = trimStr(request?.code ?? request?.unitCode);
    if (!code) return 0;
    const ids = await recipeIdSetForUnitCode(
      opts,
      code,
      'countRecipesUsingUnit',
    );
    return ids.size;
  }

  async function listRecipesUsingUnit(opts, request = {}) {
    const code = trimStr(request?.code ?? request?.unitCode);
    if (!code) return [];
    const recipeIds = await recipeIdSetForUnitCode(
      opts,
      code,
      'listRecipesUsingUnit',
    );
    if (!recipeIds.size) return [];

    const recipeRows = await pgGet(
      opts,
      `recipes?select=id,title&id=in.(${Array.from(recipeIds)
        .map((id) => Math.trunc(Number(id)))
        .join(',')})`,
      'listRecipesUsingUnit',
    );
    const seen = new Set();
    return (Array.isArray(recipeRows) ? recipeRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        title: trimStr(row?.title),
      }))
      .filter((row) => {
        if (row.id == null || row.id <= 0 || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .sort(compareRecipeUsageRows);
  }

  // ---- countRecipesUsingSize / listRecipesUsingSize ------------------------
  //
  // Size usage across rim.size, legacy ingredients.size on the line, and
  // recipe_ingredient_substitutes.size (matches main.js SQLite unions).

  async function recipeIdSetForSizeNameMatch(opts, rawName, label) {
    const nameKey = trimStr(rawName).toLowerCase();
    if (!nameKey) return new Set();
    const norm = (v) => trimStr(v).toLowerCase();

    const [rimRows, ingRows, subRows] = await Promise.all([
      pgGet(
        opts,
        'recipe_ingredient_map?select=id,recipe_id,ingredient_id,size',
        label,
      ),
      pgGet(opts, 'ingredients?select=id,size', label),
      pgGet(
        opts,
        'recipe_ingredient_substitutes?select=recipe_ingredient_id,size',
        label,
      ),
    ]);

    const ingredientSizeById = new Map();
    (Array.isArray(ingRows) ? ingRows : []).forEach((row) => {
      const id = intOrNull(row?.id ?? row?.ID);
      if (id != null && id > 0) ingredientSizeById.set(id, row?.size);
    });

    const recipeIds = new Set();
    const recipeIdByRimId = new Map();

    (Array.isArray(rimRows) ? rimRows : []).forEach((row) => {
      const rimId = intOrNull(row?.id ?? row?.ID);
      const recipeId = intOrNull(row?.recipe_id);
      if (rimId != null && rimId > 0 && recipeId != null && recipeId > 0) {
        recipeIdByRimId.set(rimId, recipeId);
      }
      if (recipeId == null || recipeId <= 0) return;
      let hit = false;
      if (norm(row?.size) === nameKey) hit = true;
      else {
        const iid = intOrNull(row?.ingredient_id);
        const legacy = ingredientSizeById.get(iid);
        if (legacy != null && norm(legacy) === nameKey) hit = true;
      }
      if (hit) recipeIds.add(recipeId);
    });

    (Array.isArray(subRows) ? subRows : []).forEach((row) => {
      if (norm(row?.size) !== nameKey) return;
      const recipeId = recipeIdByRimId.get(
        intOrNull(row?.recipe_ingredient_id),
      );
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });

    return recipeIds;
  }

  async function countRecipesUsingSize(opts, request = {}) {
    const name = trimStr(request?.name ?? request?.sizeName);
    if (!name) return 0;
    const ids = await recipeIdSetForSizeNameMatch(
      opts,
      name,
      'countRecipesUsingSize',
    );
    return ids.size;
  }

  async function listRecipesUsingSize(opts, request = {}) {
    const name = trimStr(request?.name ?? request?.sizeName);
    if (!name) return [];
    const recipeIds = await recipeIdSetForSizeNameMatch(
      opts,
      name,
      'listRecipesUsingSize',
    );
    if (!recipeIds.size) return [];

    const recipeRows = await pgGet(
      opts,
      `recipes?select=id,title&id=in.(${Array.from(recipeIds)
        .map((id) => Math.trunc(Number(id)))
        .join(',')})`,
      'listRecipesUsingSize',
    );
    const seen = new Set();
    return (Array.isArray(recipeRows) ? recipeRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        title: trimStr(row?.title),
      }))
      .filter((row) => {
        if (row.id == null || row.id <= 0 || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .sort(compareRecipeUsageRows);
  }

  // ---- listSizes -----------------------------------------------------------
  //
  // Contract: js/data/contracts/listSizes.md

  async function listSizes(opts) {
    const rows = await pgGet(
      opts,
      'sizes?select=id,name,sort_order,is_hidden,is_removed',
      'listSizes',
    );

    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: intOrNull(row?.id),
        name: row?.name == null ? '' : String(row.name),
        sortOrder: toTagSortOrder(row?.sort_order),
        isHidden: Number(row?.is_hidden || 0) === 1,
        isRemoved: Number(row?.is_removed || 0) === 1,
      }))
      .sort(compareSizeDisplayValues);
  }

  // ---- createSize ----------------------------------------------------------
  //
  // Contract: js/data/contracts/createSize.md

  async function createSize(opts, request = {}) {
    const name = trimStr(request?.name)
      .replace(/\s+/g, ' ')
      .slice(0, 64)
      .trim();
    if (!name) {
      throw new Error('createSize: name is required.');
    }

    const existingRows = await pgGet(opts, 'sizes?select=sort_order', 'createSize');
    const nextSort =
      (Array.isArray(existingRows) ? existingRows : []).reduce((max, row) => {
        const n = Number(row?.sort_order);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0) + 1;

    const rows = await pgPost(
      opts,
      'sizes?select=id',
      { name, sort_order: nextSort, is_hidden: 0, is_removed: 0 },
      'createSize',
    );
    const newId = Number(rows[0]?.id);
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createSize: Supabase did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- editSize ------------------------------------------------------------
  //
  // Contract: js/data/contracts/editSize.md

  function normalizeSizeMatch(value) {
    return trimStr(value).replace(/\s+/g, ' ').toLowerCase();
  }

  async function patchSizeTextMatches(opts, table, idColumn, oldName, newName) {
    const rows = await pgGet(opts, `${table}?select=${idColumn},size`, 'editSize');
    const oldKey = normalizeSizeMatch(oldName);
    const matches = (Array.isArray(rows) ? rows : []).filter(
      (row) => normalizeSizeMatch(row?.size) === oldKey,
    );
    for (const row of matches) {
      const rowId = intOrNull(row?.[idColumn]);
      if (rowId == null || rowId <= 0) continue;
      await pgPatch(
        opts,
        `${table}?${idColumn}=eq.${encodeURIComponent(String(rowId))}`,
        { size: newName },
        'editSize',
      );
    }
  }

  async function editSize(opts, request = {}) {
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
    const isHidden = toBool(request?.isHidden ?? request?.is_hidden) ? 1 : 0;
    const isRemoved = toBool(request?.isRemoved ?? request?.is_removed) ? 1 : 0;
    await pgPatch(
      opts,
      `sizes?id=eq.${encodeURIComponent(String(sizeId))}`,
      { name, is_hidden: isHidden, is_removed: isRemoved },
      'editSize',
    );

    const oldName = trimStr(request?.oldName).replace(/\s+/g, ' ').trim();
    if (oldName && normalizeSizeMatch(oldName) !== normalizeSizeMatch(name)) {
      await patchSizeTextMatches(opts, 'ingredients', 'id', oldName, name);
      await patchSizeTextMatches(opts, 'ingredient_sizes', 'id', oldName, name);
      await patchSizeTextMatches(
        opts,
        'recipe_ingredient_substitutes',
        'id',
        oldName,
        name,
      );
    }
    return { id: sizeId };
  }

  // ---- removeSize ----------------------------------------------------------
  //
  // Contract: js/data/contracts/removeSize.md

  async function removeSize(opts, request = {}) {
    const id = Number(request?.id ?? request?.sizeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('removeSize: valid size id is required.');
    }
    const action = trimStr(request?.action).toLowerCase();
    if (action !== 'remove' && action !== 'delete') {
      throw new Error('removeSize: action must be remove or delete.');
    }
    const sizeId = Math.trunc(id);
    const encodedId = encodeURIComponent(String(sizeId));
    if (action === 'remove') {
      await pgPatch(opts, `sizes?id=eq.${encodedId}`, { is_removed: 1 }, 'removeSize');
    } else {
      await pgDelete(opts, `sizes?id=eq.${encodedId}`, 'removeSize');
    }
    return { id: sizeId };
  }

  // ---- deleteShoppingItem --------------------------------------------------
  //
  // Contract: js/data/contracts/deleteShoppingItem.md

  async function deleteShoppingItem(opts, request = {}) {
    const name = trimStr(request?.name);
    if (!name) {
      throw new Error('deleteShoppingItem: name is required.');
    }
    const action = trimStr(request?.action).toLowerCase();
    if (action !== 'remove' && action !== 'delete') {
      throw new Error('deleteShoppingItem: action must be remove or delete.');
    }

    const ingredientRows = await pgGet(
      opts,
      'ingredients?select=id,name',
      'deleteShoppingItem',
    );
    const needle = name.toLowerCase();
    const ids = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .filter((row) => trimStr(row?.name).toLowerCase() === needle)
      .map((row) => intOrNull(row?.id))
      .filter((id) => id != null && id > 0);

    if (!ids.length) {
      return { name };
    }

    const idFilter = postgrestInList(ids);
    if (action === 'remove') {
      await pgPatch(
        opts,
        `ingredients?id=in.${idFilter}`,
        { is_deprecated: 1 },
        'deleteShoppingItem',
      );
    } else {
      await pgDelete(
        opts,
        `ingredients?id=in.${idFilter}`,
        'deleteShoppingItem',
      );
    }
    return { name };
  }

  // ---- listStores ----------------------------------------------------------
  //
  // Contract: js/data/contracts/listStores.md

  function compareStoreRows(a, b) {
    const aChain = asciiNocaseFold(a?.chain_name == null ? '' : String(a.chain_name));
    const bChain = asciiNocaseFold(b?.chain_name == null ? '' : String(b.chain_name));
    if (aChain < bChain) return -1;
    if (aChain > bChain) return 1;
    const aLocation = asciiNocaseFold(
      a?.location_name == null ? '' : String(a.location_name),
    );
    const bLocation = asciiNocaseFold(
      b?.location_name == null ? '' : String(b.location_name),
    );
    if (aLocation < bLocation) return -1;
    if (aLocation > bLocation) return 1;
    return 0;
  }

  async function listStores(opts) {
    const rows = await pgGet(
      opts,
      'stores?select=id,chain_name,location_name',
      'listStores',
    );

    return (Array.isArray(rows) ? rows : [])
      .slice()
      .sort(compareStoreRows)
      .map((row) => ({
        id: intOrNull(row?.id),
        chain: row?.chain_name == null ? '' : String(row.chain_name),
        location: row?.location_name == null ? '' : String(row.location_name),
      }));
  }

  // ---- createStore ---------------------------------------------------------

  async function createStore(opts, request = {}) {
    const chain = trimStr(request?.chain ?? request?.chainName).replace(/\s+/g, ' ');
    if (!chain) {
      throw new Error('createStore: chain name is required.');
    }
    const location = trimStr(request?.location ?? request?.locationName).replace(
      /\s+/g,
      ' ',
    );
    const rows = await pgPost(
      opts,
      'stores?select=id',
      { chain_name: chain, location_name: location },
      'createStore',
    );
    const newId = Number(rows[0]?.id);
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createStore: Supabase did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- deleteStore ---------------------------------------------------------

  async function deleteStore(opts, request = {}) {
    const id = Number(request?.id ?? request?.storeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('deleteStore: valid store id is required.');
    }
    const storeId = Math.trunc(id);
    const encodedStoreId = encodeURIComponent(String(storeId));
    const locationRows = await pgGet(
      opts,
      `store_locations?select=id&store_id=eq.${encodedStoreId}`,
      'deleteStore',
    );
    const locationIds = (Array.isArray(locationRows) ? locationRows : [])
      .map((row) => intOrNull(row?.id))
      .filter((locationId) => locationId != null && locationId > 0);

    if (locationIds.length) {
      const locationFilter = postgrestInList(locationIds);
      await pgDelete(
        opts,
        `ingredient_store_location?store_location_id=in.${locationFilter}`,
        'deleteStore',
      );
      await pgDelete(
        opts,
        `ingredient_variant_store_location?store_location_id=in.${locationFilter}`,
        'deleteStore',
      );
    }

    await pgDelete(
      opts,
      `store_locations?store_id=eq.${encodedStoreId}`,
      'deleteStore',
    );
    await pgDelete(opts, `stores?id=eq.${encodedStoreId}`, 'deleteStore');
    return { id: storeId };
  }

  // ---- editStore -----------------------------------------------------------

  async function editStore(opts, request = {}) {
    const id = Number(request?.id ?? request?.storeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('editStore: valid store id is required.');
    }
    const storeId = Math.trunc(id);
    const chain = trimStr(request?.chain ?? request?.chainName).replace(/\s+/g, ' ');
    const location = trimStr(request?.location ?? request?.locationName).replace(
      /\s+/g,
      ' ',
    );
    await pgPatch(
      opts,
      `stores?id=eq.${encodeURIComponent(String(storeId))}`,
      { chain_name: chain, location_name: location },
      'editStore',
    );
    return { id: storeId };
  }

  async function saveStoreLayout(opts, request = {}) {
    const id = Number(request?.id ?? request?.storeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('saveStoreLayout: valid store id is required.');
    }
    const payload = {
      id: Math.trunc(id),
      chain: trimStr(request?.chain ?? request?.chainName).replace(/\s+/g, ' '),
      location: trimStr(request?.location ?? request?.locationName).replace(/\s+/g, ' '),
      aisles: (Array.isArray(request?.aisles) ? request.aisles : [])
        .map((aisle, index) => {
          const aisleId = intOrNull(aisle?.id);
          const sortOrder = Number(aisle?.sortOrder ?? aisle?.sort_order);
          return {
            id: aisleId != null && aisleId > 0 ? aisleId : null,
            name: trimStr(aisle?.name) || 'Aisle',
            sort_order: Number.isFinite(sortOrder) && sortOrder > 0 ? sortOrder : index + 1,
            item_specs: (Array.isArray(aisle?.itemSpecs) ? aisle.itemSpecs : [])
              .map((spec) => ({
                ingredient_id: intOrNull(spec?.ingredientId),
                base_name: trimStr(spec?.baseName ?? spec?.name),
                selected_variants: (Array.isArray(spec?.selectedVariants)
                  ? spec.selectedVariants
                  : []
                )
                  .map(trimStr)
                  .filter(Boolean),
              }))
              .filter((spec) => spec.ingredient_id || spec.base_name),
          };
        })
        .filter((aisle) => aisle.name),
    };

    await pgRpc(
      opts,
      'save_store_layout',
      { store_payload: payload },
      'saveStoreLayout',
    );
    return loadStoreDetail(opts, { storeId: payload.id });
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

  function sortStoreDetailAisles(a, b) {
    const aSort = Number(a?.sort_order);
    const bSort = Number(b?.sort_order);
    const aRank = Number.isFinite(aSort) ? aSort : Number.POSITIVE_INFINITY;
    const bRank = Number.isFinite(bSort) ? bSort : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  }

  function sortStoreCatalogIngredientRows(a, b) {
    const nameCompare = compareAsciiNocaseString(a?.name || '', b?.name || '');
    if (nameCompare !== 0) return nameCompare;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  }

  function sortStoreCatalogVariantRows(a, b) {
    const aIngredient = Number(a?.ingredient_id);
    const bIngredient = Number(b?.ingredient_id);
    if (aIngredient !== bIngredient) return aIngredient - bIngredient;
    const aSort = Number(a?.sort_order);
    const bSort = Number(b?.sort_order);
    const aRank = Number.isFinite(aSort) ? aSort : Number.POSITIVE_INFINITY;
    const bRank = Number.isFinite(bSort) ? bSort : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  }

  function buildStoreIngredientCatalogFromRows(ingredientRows, variantRows) {
    const byName = new Map();
    const byId = new Map();

    (Array.isArray(ingredientRows) ? ingredientRows : [])
      .slice()
      .sort(sortStoreCatalogIngredientRows)
      .forEach((row) => {
        const id = intOrNull(row?.id);
        const name = row?.name == null ? '' : String(row.name);
        const key = normalizeStoreItemKey(name);
        if (!id || !key || byName.has(key)) return;
        if (toBool(row?.is_deprecated) || toBool(row?.hide_from_shopping_list)) {
          return;
        }
        const item = {
          ingredientId: id,
          name,
          baseKey: key,
          variants: [],
        };
        byName.set(key, item);
        byId.set(id, item);
      });

    (Array.isArray(variantRows) ? variantRows : [])
      .slice()
      .sort(sortStoreCatalogVariantRows)
      .forEach((row) => {
        const ingredientId = intOrNull(row?.ingredient_id);
        const id = intOrNull(row?.id);
        const name = row?.variant == null ? '' : String(row.variant);
        if (!ingredientId || !id || !isSupportedStoreVariantName(name)) return;
        const item = byId.get(ingredientId);
        if (!item) return;
        const variantKey = normalizeStoreItemKey(name);
        if (item.variants.some((v) => normalizeStoreItemKey(v.name) === variantKey)) {
          return;
        }
        item.variants.push({
          id,
          name,
          isDeprecated: toBool(row?.is_deprecated),
        });
      });

    return { byName, byId, items: Array.from(byName.values()) };
  }

  function storeKnownVariantsForCatalogItem(item) {
    return item && Array.isArray(item.variants)
      ? item.variants.map((v) => ({
          id: intOrNull(v.id),
          name: v?.name == null ? '' : String(v.name),
          isDeprecated: toBool(v?.isDeprecated),
        }))
      : [];
  }

  function makeStoreAisleItemSpec(ingredient, ingredientId = null) {
    if (!ingredient) return null;
    const numericIngredientId = intOrNull(ingredientId ?? ingredient.ingredientId);
    return {
      baseName: ingredient.name == null ? '' : String(ingredient.name),
      baseKey: ingredient.baseKey || normalizeStoreItemKey(ingredient.name),
      ingredientId: numericIngredientId,
      selectedVariants: [],
      knownVariants: storeKnownVariantsForCatalogItem(ingredient),
    };
  }

  function postgrestInList(values) {
    return `(${values.map((value) => encodeURIComponent(String(value))).join(',')})`;
  }

  async function loadStoreDetail(opts, request = {}) {
    const storeId = intOrNull(request?.storeId);
    if (!storeId) return null;

    const storeRows = await pgGet(
      opts,
      `stores?select=id,chain_name,location_name&id=eq.${encodeURIComponent(
        String(storeId),
      )}`,
      'loadStoreDetail',
    );
    if (!Array.isArray(storeRows) || !storeRows.length) return null;

    const store = storeRows[0] || {};
    const [aisleRows, ingredientRows, variantRows] = await Promise.all([
      pgGet(
        opts,
        `store_locations?select=id,store_id,name,sort_order&store_id=eq.${encodeURIComponent(
          String(storeId),
        )}`,
        'loadStoreDetail',
      ),
      pgGet(
        opts,
        'ingredients?select=id,name,is_deprecated,hide_from_shopping_list',
        'loadStoreDetail',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,is_deprecated',
        'loadStoreDetail',
      ),
    ]);

    const catalog = buildStoreIngredientCatalogFromRows(ingredientRows, variantRows);
    const detail = {
      id: intOrNull(store.id),
      chain: store?.chain_name == null ? '' : String(store.chain_name),
      location: store?.location_name == null ? '' : String(store.location_name),
      aisles: (Array.isArray(aisleRows) ? aisleRows : [])
        .slice()
        .sort(sortStoreDetailAisles)
        .map((aisle) => ({
          id: intOrNull(aisle?.id),
          name: aisle?.name == null ? '' : String(aisle.name),
          itemSpecs: [],
        }))
        .filter((aisle) => aisle.id),
      ingredientCatalog: catalog.items.map((item) => ({
        ingredientId: item.ingredientId,
        name: item.name,
        baseKey: item.baseKey,
        variants: storeKnownVariantsForCatalogItem(item),
      })),
      hasVariantAisleTable: true,
    };

    const aisleIds = detail.aisles.map((aisle) => aisle.id);
    if (!aisleIds.length) return detail;

    const aisleById = new Map(detail.aisles.map((aisle) => [aisle.id, aisle]));
    const [baseLinks, variantLinks] = await Promise.all([
      pgGet(
        opts,
        `ingredient_store_location?select=id,store_location_id,ingredient_id&store_location_id=in.${postgrestInList(
          aisleIds,
        )}`,
        'loadStoreDetail',
      ),
      pgGet(
        opts,
        `ingredient_variant_store_location?select=id,store_location_id,ingredient_variant_id&store_location_id=in.${postgrestInList(
          aisleIds,
        )}`,
        'loadStoreDetail',
      ),
    ]);

    const ingredientById = catalog.byId;
    (Array.isArray(baseLinks) ? baseLinks : [])
      .slice()
      .sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0))
      .forEach((link) => {
        const aisle = aisleById.get(intOrNull(link?.store_location_id));
        const ingredient = ingredientById.get(intOrNull(link?.ingredient_id));
        if (!aisle || !ingredient) return;
        if (aisle.itemSpecs.some((spec) => spec.baseKey === ingredient.baseKey)) {
          return;
        }
        const spec = makeStoreAisleItemSpec(ingredient);
        if (spec) aisle.itemSpecs.push(spec);
      });

    const variantById = new Map();
    (Array.isArray(variantRows) ? variantRows : []).forEach((variant) => {
      const id = intOrNull(variant?.id);
      if (id) variantById.set(id, variant);
    });

    (Array.isArray(variantLinks) ? variantLinks : [])
      .slice()
      .sort((a, b) => {
        const aId = Number(a?.id) || 0;
        const bId = Number(b?.id) || 0;
        if (aId !== bId) return aId - bId;
        const aVariant = variantById.get(intOrNull(a?.ingredient_variant_id));
        const bVariant = variantById.get(intOrNull(b?.ingredient_variant_id));
        return sortStoreCatalogVariantRows(aVariant, bVariant);
      })
      .forEach((link) => {
        const aisle = aisleById.get(intOrNull(link?.store_location_id));
        const variant = variantById.get(intOrNull(link?.ingredient_variant_id));
        const ingredient = variant ? ingredientById.get(intOrNull(variant.ingredient_id)) : null;
        const variantName = variant?.variant == null ? '' : String(variant.variant);
        if (!aisle || !ingredient || !isSupportedStoreVariantName(variantName)) return;
        let spec = aisle.itemSpecs.find((item) => item.baseKey === ingredient.baseKey);
        if (!spec) {
          spec = makeStoreAisleItemSpec(ingredient);
          if (!spec) return;
          aisle.itemSpecs.push(spec);
        }
        const variantKey = normalizeStoreItemKey(variantName);
        if (
          !spec.selectedVariants.some(
            (name) => normalizeStoreItemKey(name) === variantKey,
          )
        ) {
          spec.selectedVariants.push(variantName);
        }
      });

    return detail;
  }

  // Shopping keys use ASCII NUL as variant separator; Postgres text/json cannot store U+0000.
  const SHOPPING_STATE_NUL_SENTINEL = '\u001f';

  function shoppingStateEncodeNulForPostgres(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      return value.indexOf('\u0000') === -1
        ? value
        : value.replace(/\u0000/g, SHOPPING_STATE_NUL_SENTINEL);
    }
    if (Array.isArray(value)) {
      return value.map((v) => shoppingStateEncodeNulForPostgres(v));
    }
    if (typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value)) {
        const encodedKey =
          key.indexOf('\u0000') === -1
            ? key
            : key.replace(/\u0000/g, SHOPPING_STATE_NUL_SENTINEL);
        out[encodedKey] = shoppingStateEncodeNulForPostgres(value[key]);
      }
      return out;
    }
    return value;
  }

  function shoppingStateDecodeNulFromPostgres(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      return value.indexOf(SHOPPING_STATE_NUL_SENTINEL) === -1
        ? value
        : value.replace(/\u001f/g, '\u0000');
    }
    if (Array.isArray(value)) {
      return value.map((v) => shoppingStateDecodeNulFromPostgres(v));
    }
    if (typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value)) {
        const decodedKey =
          key.indexOf(SHOPPING_STATE_NUL_SENTINEL) === -1
            ? key
            : key.replace(/\u001f/g, '\u0000');
        out[decodedKey] = shoppingStateDecodeNulFromPostgres(value[key]);
      }
      return out;
    }
    return value;
  }

  async function loadShoppingState(opts) {
    const state = await pgRpc(opts, 'load_shopping_state', {}, 'loadShoppingState');
    const obj = state && typeof state === 'object' ? state : {};
    return shoppingStateDecodeNulFromPostgres(obj);
  }

  async function saveShoppingState(opts, request = {}) {
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(request, 'plan')) {
      payload.plan = request.plan;
    }
    if (Object.prototype.hasOwnProperty.call(request, 'shoppingListDoc')) {
      payload.shoppingListDoc = request.shoppingListDoc;
    }
    const state_payload = shoppingStateEncodeNulForPostgres(payload);
    return pgRpc(
      opts,
      'save_shopping_state',
      { state_payload },
      'saveShoppingState',
    );
  }

  // Escape % and _ so PostgREST ilike matches the literal string (case-insensitive).
  function ilikeLiteralExact(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  function pickNameOrLemmaMatch(rows, needleLower) {
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => {
        const n = trimStr(row?.name).toLowerCase();
        const l = trimStr(row?.lemma).toLowerCase();
        return n === needleLower || (l && l === needleLower);
      })
      .sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0))[0];
  }

  function pickSynonymMatch(rows, needleLower) {
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => trimStr(row?.synonym).toLowerCase() === needleLower)
      .sort((a, b) => (Number(a?.ingredient_id) || 0) - (Number(b?.ingredient_id) || 0))[0];
  }

  // Extra lowercase needles so "tomatoes" (list/plural) finds rows stored as
  // "tomato" (singular name/lemma). Same situation as lemma vs title in the UI.
  function catalogLookupNeedleVariants(needleLc) {
    const out = [];
    if (needleLc) out.push(needleLc);
    if (needleLc.length >= 6 && needleLc.endsWith('oes')) {
      out.push(needleLc.slice(0, -2));
    }
    if (needleLc.length >= 5 && needleLc.endsWith('ies')) {
      out.push(needleLc.slice(0, -3) + 'y');
    }
    if (
      needleLc.length >= 2 &&
      needleLc.endsWith('s') &&
      !needleLc.endsWith('ss') &&
      !needleLc.endsWith('oes') &&
      !needleLc.endsWith('ies')
    ) {
      out.push(needleLc.slice(0, -1));
    }
    return [...new Set(out)];
  }

  async function tryFindIngredientByNeedleVariant(opts, needleLc) {
    const enc = encodeURIComponent(needleLc);
    const ilikeEnc = encodeURIComponent(ilikeLiteralExact(needleLc));
    const ilikeSubEnc = encodeURIComponent(
      `%${ilikeLiteralExact(needleLc)}%`,
    );

    const orEq = await pgGet(
      opts,
      `ingredients?select=id,name,lemma&or=(name.eq.${enc},lemma.eq.${enc})`,
      'lookupShoppingItemByName',
    );
    let hit = pickNameOrLemmaMatch(orEq, needleLc);
    if (hit) return hit;

    const orIlike = await pgGet(
      opts,
      `ingredients?select=id,name,lemma&or=(name.ilike.${ilikeEnc},lemma.ilike.${ilikeEnc})`,
      'lookupShoppingItemByName',
    );
    hit = pickNameOrLemmaMatch(orIlike, needleLc);
    if (hit) return hit;

    const loose = await pgGet(
      opts,
      `ingredients?select=id,name,lemma&or=(name.ilike.${ilikeSubEnc},lemma.ilike.${ilikeSubEnc})&limit=500`,
      'lookupShoppingItemByName',
    );
    return pickNameOrLemmaMatch(loose, needleLc) || null;
  }

  async function tryFindSynonymByNeedleVariant(opts, needleLc) {
    const enc = encodeURIComponent(needleLc);
    const ilikeEnc = encodeURIComponent(ilikeLiteralExact(needleLc));
    const ilikeSubEnc = encodeURIComponent(
      `%${ilikeLiteralExact(needleLc)}%`,
    );

    let synHit = null;
    const synEq = await pgGet(
      opts,
      `ingredient_synonyms?select=id,ingredient_id,synonym&synonym=eq.${enc}`,
      'lookupShoppingItemByName',
    );
    synHit = pickSynonymMatch(synEq, needleLc);
    if (!synHit) {
      const synIlike = await pgGet(
        opts,
        `ingredient_synonyms?select=id,ingredient_id,synonym&synonym=ilike.${ilikeEnc}`,
        'lookupShoppingItemByName',
      );
      synHit = pickSynonymMatch(synIlike, needleLc);
    }
    if (!synHit) {
      const synLoose = await pgGet(
        opts,
        `ingredient_synonyms?select=id,ingredient_id,synonym&synonym=ilike.${ilikeSubEnc}&limit=500`,
        'lookupShoppingItemByName',
      );
      synHit = pickSynonymMatch(synLoose, needleLc);
    }
    return synHit;
  }

  // ---- Shopping plan reconcile / prune (catalog reads) ---------------------
  //
  // Mirrors SQLite helpers in js/main.js: canonical ingredient + variant rows
  // for rewriting shopping `itemSelections` keys against the live catalog.

  async function resolveCanonicalIngredientForShoppingReconcile(
    opts,
    request = {},
  ) {
    const baseLower = trimStr(request?.baseLower).toLowerCase();
    if (!baseLower) return null;

    const ilikeEnc = encodeURIComponent(ilikeLiteralExact(baseLower));

    const ingRows = await pgGet(
      opts,
      `ingredients?select=id,name,lemma&or=(name.ilike.${ilikeEnc},lemma.ilike.${ilikeEnc})`,
      'resolveCanonicalIngredientForShoppingReconcile',
    );
    const hit = pickNameOrLemmaMatch(ingRows, baseLower);
    if (hit) {
      const id = intOrNull(hit.id);
      if (id != null && id > 0) {
        return { id, name: String(hit.name || '').trim() };
      }
    }

    const synRows = await pgGet(
      opts,
      `ingredient_synonyms?select=id,ingredient_id,synonym&synonym=ilike.${ilikeEnc}`,
      'resolveCanonicalIngredientForShoppingReconcile',
    );
    const synHit = pickSynonymMatch(synRows, baseLower);
    if (!synHit) return null;

    const ingId = intOrNull(synHit.ingredient_id);
    if (ingId == null || ingId <= 0) return null;

    const canonRows = await pgGet(
      opts,
      `ingredients?select=id,name&id=eq.${encodeURIComponent(String(ingId))}`,
      'resolveCanonicalIngredientForShoppingReconcile',
    );
    const canon = (Array.isArray(canonRows) ? canonRows : [])[0];
    const id = intOrNull(canon?.id ?? ingId);
    if (id == null || id <= 0) return null;
    return { id, name: String(canon?.name || '').trim() };
  }

  async function listIngredientVariantsWithIngredientsByIds(opts, request = {}) {
    const rawIds = request?.variantIds;
    const ids = [
      ...new Set(
        (Array.isArray(rawIds) ? rawIds : [])
          .map((id) => Math.trunc(Number(id)))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
    if (!ids.length) return [];
    const variantRows = await pgGet(
      opts,
      `ingredient_variants?select=id,ingredient_id,variant&id=${inFilter(ids)}`,
      'listIngredientVariantsWithIngredientsByIds',
    );
    const ingredientIds = [
      ...new Set(
        (Array.isArray(variantRows) ? variantRows : [])
          .map((r) => intOrNull(r?.ingredient_id))
          .filter((id) => id != null && id > 0),
      ),
    ];
    const ingredientRows = ingredientIds.length
      ? await pgGet(
          opts,
          `ingredients?select=id,name&id=${inFilter(ingredientIds)}`,
          'listIngredientVariantsWithIngredientsByIds',
        )
      : [];
    const ingById = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const id = intOrNull(row?.id);
      if (id != null && id > 0) ingById.set(id, row);
    });
    return (Array.isArray(variantRows) ? variantRows : [])
      .map((vr) => {
        const vid = intOrNull(vr?.id);
        const iid = intOrNull(vr?.ingredient_id);
        if (vid == null || vid <= 0 || iid == null || iid <= 0) return null;
        const ing = ingById.get(iid);
        return {
          id: vid,
          ingredient_id: iid,
          variant: vr?.variant == null ? '' : String(vr.variant).trim(),
          ingredientName: ing?.name == null ? '' : String(ing.name).trim(),
        };
      })
      .filter(Boolean);
  }

  async function listIngredientVariantsByIngredientIds(opts, request = {}) {
    const rawIds = request?.ingredientIds;
    const ids = [
      ...new Set(
        (Array.isArray(rawIds) ? rawIds : [])
          .map((id) => Math.trunc(Number(id)))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
    if (!ids.length) return [];
    const rows = await pgGet(
      opts,
      `ingredient_variants?select=id,ingredient_id,variant&ingredient_id=${inFilter(ids)}`,
      'listIngredientVariantsByIngredientIds',
    );
    return Array.isArray(rows) ? rows : [];
  }

  // ---- lookupShoppingItemByName --------------------------------------------
  //
  // Contract: js/data/contracts/lookupShoppingItemByName.md
  //
  // Uses filtered PostgREST queries (not a full-table fetch). Unfiltered GETs
  // are capped (default 1000 rows) and miss matches, which caused duplicate
  // inserts in find-or-create flows.
  //
  // Matches name OR lemma, and tries plural→singular needles (tomatoes→tomato)
  // so list wording matches singular catalog rows.

  async function lookupShoppingItemByName(opts, request = {}) {
    const name = trimStr(request?.name);
    if (!name) return null;

    const needle = name.toLowerCase();
    const variants = catalogLookupNeedleVariants(needle);

    for (const v of variants) {
      const direct = await tryFindIngredientByNeedleVariant(opts, v);
      if (direct) {
        const id = intOrNull(direct.id);
        if (id) {
          return {
            id,
            name: direct.name == null ? name : String(direct.name),
          };
        }
      }
    }

    for (const v of variants) {
      const synHit = await tryFindSynonymByNeedleVariant(opts, v);
      if (!synHit) continue;

      const ingId = intOrNull(synHit.ingredient_id);
      if (ingId == null || ingId <= 0) continue;

      const canonRows = await pgGet(
        opts,
        `ingredients?select=id,name&id=eq.${encodeURIComponent(String(ingId))}`,
        'lookupShoppingItemByName',
      );
      const canon = (Array.isArray(canonRows) ? canonRows : [])[0];
      const id = intOrNull(canon?.id ?? synHit.ingredient_id);
      if (id == null || id <= 0) continue;
      return {
        id,
        name: canon?.name == null ? name : String(canon.name),
      };
    }

    return null;
  }

  // ---- findOrCreateShoppingItem --------------------------------------------
  //
  // Items page "New Shopping Item": reuse catalog row by name/synonym (same
  // rules as lookupShoppingItemByName) or insert ingredients + default variant.

  async function findOrCreateShoppingItem(opts, request = {}) {
    const name = trimStr(request?.name);
    if (!name) {
      throw new Error('findOrCreateShoppingItem: name is required.');
    }
    const lemmaStr = trimStr(request?.lemma);
    const lemma = lemmaStr ? lemmaStr : null;

    const existing = await lookupShoppingItemByName(opts, { name });
    const existingId = intOrNull(existing?.id);
    if (existingId != null && existingId > 0) {
      return { id: existingId, created: false };
    }

    const body = { name };
    if (lemma) body.lemma = lemma;

    let ingRows;
    try {
      ingRows = await pgPost(
        opts,
        'ingredients?select=id',
        body,
        'findOrCreateShoppingItem',
      );
    } catch (err) {
      const text = err && err.message != null ? String(err.message) : '';
      if (/409|unique|23505|duplicate key/i.test(text)) {
        const again = await lookupShoppingItemByName(opts, { name });
        const rid = intOrNull(again?.id);
        if (rid != null && rid > 0) {
          return { id: rid, created: false };
        }
      }
      throw err;
    }
    const newId = intOrNull(ingRows[0]?.id);
    if (newId == null || newId <= 0) {
      throw new Error(
        'findOrCreateShoppingItem: Supabase did not return a valid new id.',
      );
    }

    try {
      await pgPost(
        opts,
        'ingredient_variants?select=id',
        {
          ingredient_id: newId,
          variant: 'default',
          sort_order: 0,
          home_location: 'none',
          is_deprecated: false,
        },
        'findOrCreateShoppingItem',
      );
    } catch (err) {
      const text = err && err.message != null ? String(err.message) : '';
      if (/409|unique|23505|duplicate key/i.test(text)) {
        const again = await lookupShoppingItemByName(opts, { name });
        const rid = intOrNull(again?.id);
        if (rid != null && rid > 0) {
          return { id: rid, created: false };
        }
      }
      throw err;
    }

    return { id: newId, created: true };
  }

  // ---- pruneOrphanedIngredientSynonyms -------------------------------------
  //
  // Deletes ingredient_synonyms rows whose ingredient_id no longer exists in
  // ingredients (keeps the global-unique synonym namespace consistent).

  async function pruneOrphanedIngredientSynonyms(opts) {
    const raw = await pgRpc(
      opts,
      'prune_orphaned_ingredient_synonyms',
      {},
      'pruneOrphanedIngredientSynonyms',
    );
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  // ---- saveShoppingCatalogItem ---------------------------------------------
  //
  // Browser shopping-item editor save path (no local SQLite file): replaces
  // ingredient_variants / sizes / synonyms / variant tags after PATCH on ingredients.

  async function saveShoppingCatalogItem(opts, request = {}) {
    const ingredientId = intOrNull(request?.ingredientId);
    if (ingredientId == null || ingredientId <= 0) {
      throw new Error('saveShoppingCatalogItem: ingredientId is required.');
    }
    const name = trimStr(request?.name);
    if (!name) {
      throw new Error('saveShoppingCatalogItem: name is required.');
    }

    const lemmaRaw = request?.lemma;
    const lemma =
      lemmaRaw == null || String(lemmaRaw).trim() === ''
        ? null
        : trimStr(lemmaRaw);

    const pluralOverrideRaw = trimStr(request?.pluralOverride ?? '');
    const pluralByDefault = !!request?.pluralByDefault;
    const isMassNoun = !!request?.isMassNoun;
    const isFood = request?.isFood !== false;
    const isDeprecated = !!request?.isDeprecated;
    const isHidden = !!request?.isHidden;

    const variantRowsIn = Array.isArray(request?.variantRows)
      ? request.variantRows
      : [];
    const sizesIn = Array.isArray(request?.sizes) ? request.sizes : [];
    const synonymsIn = Array.isArray(request?.synonyms) ? request.synonyms : [];

    const ivExisting = await pgGet(
      opts,
      `ingredient_variants?select=id&ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      'saveShoppingCatalogItem',
    );
    const variantIds = positiveUniqueIds(ivExisting, 'id');
    if (variantIds.length) {
      const vf = inFilter(variantIds);
      await pgDelete(
        opts,
        `ingredient_variant_store_location?ingredient_variant_id=${vf}`,
        'saveShoppingCatalogItem',
      );
      await pgDelete(
        opts,
        `ingredient_variant_tag_map?ingredient_variant_id=${vf}`,
        'saveShoppingCatalogItem',
      );
    }

    await pgDelete(
      opts,
      `ingredient_variants?ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      'saveShoppingCatalogItem',
    );
    await pgDelete(
      opts,
      `ingredient_sizes?ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      'saveShoppingCatalogItem',
    );
    await pgDelete(
      opts,
      `ingredient_synonyms?ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      'saveShoppingCatalogItem',
    );

    await pgPatch(
      opts,
      `ingredients?id=eq.${encodeURIComponent(String(ingredientId))}`,
      {
        name,
        lemma,
        plural_override: pluralOverrideRaw || null,
        plural_by_default: pluralByDefault,
        is_mass_noun: isMassNoun,
        is_food: isFood,
        is_deprecated: isDeprecated,
        is_hidden: isHidden,
      },
      'saveShoppingCatalogItem',
    );

    const BASE_VARIANT = 'default';
    const variantRows =
      variantRowsIn.length > 0
        ? variantRowsIn
        : [
            {
              isBase: true,
              variant: BASE_VARIANT,
              homeLocation: 'none',
              isDeprecated: false,
              tags: [],
            },
          ];

    const tagRows = await pgGet(
      opts,
      'tags?select=id,name,is_hidden',
      'saveShoppingCatalogItem',
    );
    const tagByLower = new Map();
    (Array.isArray(tagRows) ? tagRows : []).forEach((row) => {
      const tid = intOrNull(row?.id);
      const n = trimStr(row?.name);
      if (tid != null && tid > 0 && n) tagByLower.set(n.toLowerCase(), tid);
    });

    async function resolveTagId(tagName) {
      const n = trimStr(tagName);
      if (!n) return null;
      const k = n.toLowerCase();
      if (tagByLower.has(k)) return tagByLower.get(k);
      const created = await createTag(opts, {
        name: n,
        intendedUse: 'ingredients',
      });
      const tid = intOrNull(created?.id);
      if (tid != null && tid > 0) tagByLower.set(k, tid);
      return tid;
    }

    for (let i = 0; i < variantRows.length; i += 1) {
      const row = variantRows[i];
      const isBase = !!row?.isBase;
      const variantName = isBase
        ? BASE_VARIANT
        : trimStr(row?.variant ?? row?.value ?? '');
      if (!isBase && !variantName) continue;

      const sortOrder = i === 0 ? 0 : i;
      const homeLocation =
        trimStr(row?.homeLocation ?? 'none') || 'none';
      const vDep = !!row?.isDeprecated;

      const inserted = await pgPost(
        opts,
        'ingredient_variants?select=id',
        {
          ingredient_id: ingredientId,
          variant: variantName,
          sort_order: sortOrder,
          home_location: homeLocation,
          is_deprecated: vDep,
        },
        'saveShoppingCatalogItem',
      );
      const newVid = intOrNull(inserted[0]?.id);
      if (newVid == null || newVid <= 0) continue;

      const tags = Array.isArray(row?.tags) ? row.tags : [];
      let tagOrder = 1;
      for (let t = 0; t < tags.length; t += 1) {
        const tid = await resolveTagId(tags[t]);
        if (tid == null || tid <= 0) continue;
        await pgPost(
          opts,
          'ingredient_variant_tag_map?select=id',
          {
            ingredient_variant_id: newVid,
            tag_id: tid,
            sort_order: tagOrder,
          },
          'saveShoppingCatalogItem',
        );
        tagOrder += 1;
      }
    }

    let szOrder = 1;
    for (let s = 0; s < sizesIn.length; s += 1) {
      const sz = trimStr(sizesIn[s]);
      if (!sz) continue;
      await pgPost(
        opts,
        'ingredient_sizes?select=id',
        {
          ingredient_id: ingredientId,
          size: sz,
          sort_order: szOrder,
        },
        'saveShoppingCatalogItem',
      );
      szOrder += 1;
    }

    for (let y = 0; y < synonymsIn.length; y += 1) {
      const syn = trimStr(synonymsIn[y]);
      if (!syn) continue;
      await pgPost(
        opts,
        'ingredient_synonyms?select=id',
        {
          ingredient_id: ingredientId,
          synonym: syn,
        },
        'saveShoppingCatalogItem',
      );
    }

    return { ingredientId };
  }

  // ---- lookupIngredientNameByLemma -----------------------------------------
  //
  // Contract: js/data/contracts/lookupIngredientNameByLemma.md

  async function lookupIngredientNameByLemma(opts, request = {}) {
    const lemma = trimStr(request?.lemma);
    if (!lemma) return null;

    const ingredientRows = await pgGet(
      opts,
      'ingredients?select=id,name,lemma',
      'lookupIngredientNameByLemma',
    );
    const needle = lemma.toLowerCase();
    const hit = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .filter((row) => trimStr(row?.lemma).toLowerCase() === needle)
      .sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0))[0];
    if (!hit) return null;
    const n = hit.name == null ? '' : String(hit.name).trim();
    return n || null;
  }

  // ---- listIngredientTagNames ----------------------------------------------
  //
  // Contract: js/data/contracts/listIngredientTagNames.md

  function effectiveTagIntendedUseForIngredientPool(raw) {
    const t = trimStr(raw == null ? '' : String(raw));
    const lower = t.toLowerCase();
    return lower ? lower : 'recipes';
  }

  function compareAsciiNocaseString(a, b) {
    const la = asciiNocaseFold(String(a));
    const lb = asciiNocaseFold(String(b));
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  async function listIngredientTagNames(opts) {
    const [tagRows, ivMapRows] = await Promise.all([
      pgGet(
        opts,
        'tags?select=id,name,is_hidden,intended_use',
        'listIngredientTagNames',
      ),
      pgGet(
        opts,
        'ingredient_variant_tag_map?select=id,tag_id',
        'listIngredientTagNames',
      ),
    ]);

    const ingredientUsageTagIds = new Set(
      (Array.isArray(ivMapRows) ? ivMapRows : [])
        .map((row) => intOrNull(row?.tag_id))
        .filter((id) => id != null && id > 0),
    );

    const names = new Set();
    (Array.isArray(tagRows) ? tagRows : []).forEach((row) => {
      if (Number(row?.is_hidden || 0) === 1) return;
      const trimmed = trimStr(row?.name == null ? '' : String(row.name));
      if (!trimmed) return;
      const id = intOrNull(row?.id);
      if (id == null || id <= 0) return;
      const intended = effectiveTagIntendedUseForIngredientPool(
        row?.intended_use,
      );
      const isIngredientUse = intended === 'ingredients';
      const hasIngredientLink = ingredientUsageTagIds.has(id);
      if (!isIngredientUse && !hasIngredientLink) return;
      names.add(trimmed);
    });

    return Array.from(names).sort(compareAsciiNocaseString);
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

  async function isIngredientVariantDeprecated(opts, request) {
    const ingredientName = trimStr(request?.ingredientName);
    const variantText = trimStr(request?.variantText);
    if (!ingredientName || !variantText) return false;
    if (variantText.toLowerCase() === 'default') return false;

    const [ingredientRows, synonymRows, variantRows] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,is_deprecated,hide_from_shopping_list',
        'isIngredientVariantDeprecated',
      ),
      pgGet(
        opts,
        'ingredient_synonyms?select=id,ingredient_id,synonym',
        'isIngredientVariantDeprecated',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,is_deprecated',
        'isIngredientVariantDeprecated',
      ),
    ]);

    const requestedNameKey = ingredientName.toLowerCase();
    const requestedVariantKey = variantText.toLowerCase();
    const visibleIngredientById = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const id = intOrNull(row?.id ?? row?.ID);
      if (id == null || id <= 0) return;
      const hasIsDeprecated = Object.prototype.hasOwnProperty.call(
        row || {},
        'is_deprecated',
      );
      const hidden = hasIsDeprecated
        ? toBool(row?.is_deprecated)
        : toBool(row?.hide_from_shopping_list);
      if (hidden) return;
      visibleIngredientById.set(id, {
        id,
        nameKey: trimStr(row?.name).toLowerCase(),
      });
    });

    const matchingIngredientIds = new Set();
    visibleIngredientById.forEach((row) => {
      if (row.nameKey && row.nameKey === requestedNameKey) {
        matchingIngredientIds.add(row.id);
      }
    });
    (Array.isArray(synonymRows) ? synonymRows : []).forEach((row) => {
      const ingredientId = intOrNull(row?.ingredient_id);
      if (
        ingredientId == null ||
        !visibleIngredientById.has(ingredientId) ||
        trimStr(row?.synonym).toLowerCase() !== requestedNameKey
      ) {
        return;
      }
      matchingIngredientIds.add(ingredientId);
    });

    if (!matchingIngredientIds.size) return false;
    return (Array.isArray(variantRows) ? variantRows : []).some((row) => {
      const ingredientId = intOrNull(row?.ingredient_id);
      return (
        ingredientId != null &&
        matchingIngredientIds.has(ingredientId) &&
        trimStr(row?.variant).toLowerCase() === requestedVariantKey &&
        toBool(row?.is_deprecated)
      );
    });
  }

  function makeEmptyShoppingItem(row) {
    return {
      id: intOrNull(row?.id ?? row?.ID),
      name: row?.name == null ? '' : String(row.name),
      variants: [],
      /** Stable id for the `default` variant row (excluded from variantIdByName). */
      defaultVariantId: null,
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
    item.locationAtHome =
      item._homeLocations.find(
        (value) => normalizeShoppingHomeLocation(value) !== 'none',
      ) || 'none';
    item.locationAtHome = normalizeShoppingHomeLocation(item.locationAtHome);
    item.isHidden = item._hiddenFlags.length
      ? item._hiddenFlags.every(Boolean)
      : false;
    item.isRemoved = item._removedFlags.length
      ? item._removedFlags.every(Boolean)
      : false;
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

  function rowsByIngredientId(rows) {
    const byId = new Map();
    (Array.isArray(rows) ? rows : [])
      .slice()
      .sort((a, b) => {
        const ai = intOrNull(a?.ingredient_id);
        const bi = intOrNull(b?.ingredient_id);
        if ((ai || 0) !== (bi || 0)) return (ai || 0) - (bi || 0);
        const as = toTagSortOrder(a?.sort_order);
        const bs = toTagSortOrder(b?.sort_order);
        if (as !== bs) return as - bs;
        return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
      })
      .forEach((row) => {
        const id = intOrNull(row?.ingredient_id);
        if (id == null || id <= 0) return;
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push(row);
      });
    return byId;
  }

  async function listShoppingItems(opts) {
    const [ingredientRows, variantRows] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,variant,is_deprecated,hide_from_shopping_list,is_hidden,is_food,lemma,plural_by_default,is_mass_noun,plural_override',
        'listShoppingItems',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,home_location,is_deprecated',
        'listShoppingItems',
      ),
    ]);

    const variantsByIngredientId = rowsByIngredientId(variantRows);
    const groups = new Map();

    (Array.isArray(ingredientRows) ? ingredientRows : [])
      .slice()
      .sort((a, b) => compareAsciiNocaseString(a?.name || '', b?.name || ''))
      .forEach((row) => {
        const key = trimStr(row?.name).toLowerCase();
        if (!key) return;
        const rowId = intOrNull(row?.id ?? row?.ID);
        if (!groups.has(key)) groups.set(key, makeEmptyShoppingItem(row));
        const item = groups.get(key);
        if (rowId != null && rowId > 0) {
          item.id = Math.max(Number(item.id) || 0, rowId);
        }
        item._removedFlags.push(
          toBool(row?.is_deprecated) || toBool(row?.hide_from_shopping_list),
        );
        item._hiddenFlags.push(toBool(row?.is_hidden));
        item._foodFlags.push(row?.is_food == null ? true : toBool(row.is_food));
        item._lemmas.push(row?.lemma);
        item._pluralByDefaultFlags.push(toBool(row?.plural_by_default));
        item._isMassNounFlags.push(toBool(row?.is_mass_noun));
        item._pluralOverrides.push(row?.plural_override);

        const variants = variantsByIngredientId.get(rowId) || [];
        const baseVariant = variants.find(
          (v) => trimStr(v?.variant).toLowerCase() === 'default',
        );
        item._homeLocations.push(
          baseVariant ? normalizeShoppingHomeLocation(baseVariant.home_location) : 'none',
        );
        const variantsToUse = variants.length
          ? variants
          : row?.variant
            ? [
                {
                  id: null,
                  variant: row.variant,
                  home_location: 'none',
                  is_deprecated: 0,
                },
              ]
            : [];
        variantsToUse.forEach((variantRow) => {
          const variantName = trimStr(variantRow?.variant);
          const variantKey = variantName.toLowerCase();
          if (!variantName) return;
          if (variantKey === 'default') {
            const defVid = intOrNull(variantRow?.id);
            if (defVid != null && defVid > 0) {
              item.defaultVariantId = defVid;
            }
            return;
          }
          if (item._variantSeen.has(variantKey)) {
            if (toBool(variantRow?.is_deprecated)) {
              item._removedVariantSet.add(variantKey);
            }
            return;
          }
          item._variantSeen.add(variantKey);
          item.variants.push(variantName);
          const variantId = intOrNull(variantRow?.id);
          if (variantId != null && variantId > 0) {
            item.variantIdByName[variantKey] = variantId;
          }
          if (toBool(variantRow?.is_deprecated)) {
            item._removedVariantSet.add(variantKey);
          }
          item.variantHomeLocations.push({
            variant: variantName,
            homeLocation: normalizeShoppingHomeLocation(variantRow?.home_location),
          });
        });
      });

    try {
      const [tagRows, mapRows] = await Promise.all([
        pgGet(opts, 'tags?select=id,name,is_hidden', 'listShoppingItems'),
        pgGet(
          opts,
          'ingredient_variant_tag_map?select=id,ingredient_variant_id,tag_id',
          'listShoppingItems',
        ),
      ]);
      const variantsById = new Map();
      (Array.isArray(variantRows) ? variantRows : []).forEach((row) => {
        const id = intOrNull(row?.id);
        const ingredientId = intOrNull(row?.ingredient_id);
        if (id != null && id > 0) variantsById.set(id, ingredientId);
      });
      const ingredientNameById = new Map();
      (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
        const id = intOrNull(row?.id ?? row?.ID);
        const key = trimStr(row?.name).toLowerCase();
        if (id != null && id > 0 && key) ingredientNameById.set(id, key);
      });
      const visibleTags = new Map();
      (Array.isArray(tagRows) ? tagRows : []).forEach((row) => {
        if (toBool(row?.is_hidden)) return;
        const id = intOrNull(row?.id);
        const name = trimStr(row?.name);
        if (id != null && id > 0 && name) visibleTags.set(id, name);
      });
      const tagsByNameKey = new Map();
      (Array.isArray(mapRows) ? mapRows : []).forEach((row) => {
        const variantId = intOrNull(row?.ingredient_variant_id);
        const tagId = intOrNull(row?.tag_id);
        const ingredientId = variantsById.get(variantId);
        const nameKey = ingredientNameById.get(ingredientId);
        const tagName = visibleTags.get(tagId);
        if (!nameKey || !tagName) return;
        if (!tagsByNameKey.has(nameKey)) tagsByNameKey.set(nameKey, new Map());
        const lower = tagName.toLowerCase();
        if (!tagsByNameKey.get(nameKey).has(lower)) {
          tagsByNameKey.get(nameKey).set(lower, tagName);
        }
      });
      tagsByNameKey.forEach((tagMap, nameKey) => {
        const item = groups.get(nameKey);
        if (item) item.tags = Array.from(tagMap.values()).sort(compareAsciiNocaseString);
      });
    } catch (_) {}

    try {
      const [rimRows, substituteRows] = await Promise.all([
        pgGet(
          opts,
          'recipe_ingredient_map?select=id,recipe_id,ingredient_id',
          'listShoppingItems',
        ),
        pgGet(
          opts,
          'recipe_ingredient_substitutes?select=id,recipe_ingredient_id,ingredient_id',
          'listShoppingItems',
        ),
      ]);
      const ingredientNameById = new Map();
      (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
        const id = intOrNull(row?.id ?? row?.ID);
        const key = trimStr(row?.name).toLowerCase();
        if (id != null && id > 0 && key) ingredientNameById.set(id, key);
      });
      const recipeIdByRimId = new Map();
      const recipeIdsByNameKey = new Map();
      const addRecipeRef = (ingredientId, recipeId) => {
        const key = ingredientNameById.get(intOrNull(ingredientId));
        const rid = intOrNull(recipeId);
        if (!key || rid == null || rid <= 0) return;
        if (!recipeIdsByNameKey.has(key)) recipeIdsByNameKey.set(key, new Set());
        recipeIdsByNameKey.get(key).add(rid);
      };
      (Array.isArray(rimRows) ? rimRows : []).forEach((row) => {
        const rimId = intOrNull(row?.id ?? row?.ID);
        const recipeId = intOrNull(row?.recipe_id);
        if (rimId != null && rimId > 0) recipeIdByRimId.set(rimId, recipeId);
        addRecipeRef(row?.ingredient_id, recipeId);
      });
      (Array.isArray(substituteRows) ? substituteRows : []).forEach((row) => {
        const recipeId = recipeIdByRimId.get(intOrNull(row?.recipe_ingredient_id));
        addRecipeRef(row?.ingredient_id, recipeId);
      });
      recipeIdsByNameKey.forEach((ids, key) => {
        const item = groups.get(key);
        if (item) item.recipeUseCount = ids.size;
      });
    } catch (_) {}

    try {
      const [itemAisleRows, variantAisleRows] = await Promise.all([
        pgGet(
          opts,
          'ingredient_store_location?select=id,ingredient_id,store_location_id',
          'listShoppingItems',
        ),
        pgGet(
          opts,
          'ingredient_variant_store_location?select=id,ingredient_variant_id,store_location_id',
          'listShoppingItems',
        ),
      ]);
      const ingredientNameById = new Map();
      (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
        const id = intOrNull(row?.id ?? row?.ID);
        const key = trimStr(row?.name).toLowerCase();
        if (id != null && id > 0 && key) ingredientNameById.set(id, key);
      });
      const variantsById = new Map();
      (Array.isArray(variantRows) ? variantRows : []).forEach((row) => {
        const id = intOrNull(row?.id);
        const ingredientId = intOrNull(row?.ingredient_id);
        if (id != null && id > 0) variantsById.set(id, ingredientId);
      });
      const aisleIdsByNameKey = new Map();
      const addAisleRef = (ingredientId, aisleId) => {
        const key = ingredientNameById.get(intOrNull(ingredientId));
        const aid = intOrNull(aisleId);
        if (!key || aid == null || aid <= 0) return;
        if (!aisleIdsByNameKey.has(key)) aisleIdsByNameKey.set(key, new Set());
        aisleIdsByNameKey.get(key).add(aid);
      };
      (Array.isArray(itemAisleRows) ? itemAisleRows : []).forEach((row) => {
        addAisleRef(row?.ingredient_id, row?.store_location_id);
      });
      (Array.isArray(variantAisleRows) ? variantAisleRows : []).forEach((row) => {
        addAisleRef(
          variantsById.get(intOrNull(row?.ingredient_variant_id)),
          row?.store_location_id,
        );
      });
      aisleIdsByNameKey.forEach((ids, key) => {
        const item = groups.get(key);
        if (item) item.aisleUseCount = ids.size;
      });
    } catch (_) {}

    return Array.from(groups.values())
      .map(finalizeShoppingItem)
      .sort((a, b) => compareAsciiNocaseString(a.name, b.name));
  }

  // ---- loadShoppingItemDetail ---------------------------------------------
  //
  // Contract: js/data/contracts/loadShoppingItemDetail.md

  function objectHasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
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
        intOrNull(variantId) != null && intOrNull(variantId) > 0
          ? intOrNull(variantId)
          : null,
      isDeprecated: !!isDeprecated,
    };
  }

  function buildDetailTagsByVariantId(tagRows, mapRows, variantIds) {
    const idSet = new Set(
      (Array.isArray(variantIds) ? variantIds : [])
        .map((id) => intOrNull(id))
        .filter((id) => id != null && id > 0),
    );
    const byVariantId = new Map(Array.from(idSet).map((id) => [id, []]));
    const visibleTags = new Map();
    (Array.isArray(tagRows) ? tagRows : []).forEach((row) => {
      const id = intOrNull(row?.id);
      const name = trimStr(row?.name);
      if (id != null && id > 0 && name && !toBool(row?.is_hidden)) {
        visibleTags.set(id, name);
      }
    });
    const seenByVariant = new Map();
    (Array.isArray(mapRows) ? mapRows : [])
      .slice()
      .sort((a, b) => {
        const av = intOrNull(a?.ingredient_variant_id) || 0;
        const bv = intOrNull(b?.ingredient_variant_id) || 0;
        if (av !== bv) return av - bv;
        const as = toTagSortOrder(a?.sort_order);
        const bs = toTagSortOrder(b?.sort_order);
        if (as !== bs) return as - bs;
        return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
      })
      .forEach((row) => {
        const variantId = intOrNull(row?.ingredient_variant_id);
        const tagName = visibleTags.get(intOrNull(row?.tag_id));
        if (variantId == null || !idSet.has(variantId) || !tagName) return;
        if (!seenByVariant.has(variantId)) seenByVariant.set(variantId, new Set());
        const key = tagName.toLowerCase();
        if (seenByVariant.get(variantId).has(key)) return;
        seenByVariant.get(variantId).add(key);
        byVariantId.get(variantId).push(tagName);
      });
    return byVariantId;
  }

  async function loadShoppingItemDetail(opts, request = {}) {
    const ingredientId = Math.trunc(Number(request?.ingredientId));
    if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;

    const [
      ingredientRows,
      variantRows,
      tagRows,
      tagMapRows,
      sizeRows,
      synonymRows,
    ] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,variant,size,is_deprecated,hide_from_shopping_list,is_hidden,is_food,plural_override,plural_by_default,is_mass_noun,lemma',
        'loadShoppingItemDetail',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,home_location,is_deprecated',
        'loadShoppingItemDetail',
      ),
      pgGet(opts, 'tags?select=id,name,is_hidden', 'loadShoppingItemDetail'),
      pgGet(
        opts,
        'ingredient_variant_tag_map?select=id,ingredient_variant_id,tag_id,sort_order',
        'loadShoppingItemDetail',
      ),
      pgGet(
        opts,
        'ingredient_sizes?select=id,ingredient_id,size,sort_order',
        'loadShoppingItemDetail',
      ),
      pgGet(
        opts,
        'ingredient_synonyms?select=id,ingredient_id,synonym',
        'loadShoppingItemDetail',
      ),
    ]);

    const requested = (Array.isArray(ingredientRows) ? ingredientRows : []).find(
      (row) => intOrNull(row?.id ?? row?.ID) === ingredientId,
    );
    if (!requested) return null;

    const targetIds = [];
    const seenTargetIds = new Set();
    const pushTargetId = (rawId) => {
      const id = intOrNull(rawId);
      if (id == null || id <= 0 || seenTargetIds.has(id)) return;
      seenTargetIds.add(id);
      targetIds.push(id);
    };
    pushTargetId(ingredientId);
    const itemName = trimStr(request?.itemName);
    if (itemName) {
      (Array.isArray(ingredientRows) ? ingredientRows : [])
        .slice()
        .sort((a, b) => (intOrNull(a?.id ?? a?.ID) || 0) - (intOrNull(b?.id ?? b?.ID) || 0))
        .forEach((row) => {
          if (trimStr(row?.name).toLowerCase() === itemName.toLowerCase()) {
            pushTargetId(row?.id ?? row?.ID);
          }
        });
    }

    const targetIdSet = new Set(targetIds);
    const rawVariantRows = (Array.isArray(variantRows) ? variantRows : [])
      .filter((row) => targetIdSet.has(intOrNull(row?.ingredient_id)))
      .map((row) => ({
        id: intOrNull(row?.id),
        ingredientId: intOrNull(row?.ingredient_id),
        variant: trimStr(row?.variant),
        sortOrder: toTagSortOrder(row?.sort_order),
        homeLocation: normalizeShoppingListHomeLocation(row?.home_location),
        isDeprecated: toBool(row?.is_deprecated),
      }))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return (a.id || 0) - (b.id || 0);
      });

    const tagsByVariantId = buildDetailTagsByVariantId(
      tagRows,
      tagMapRows,
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

    const detailVariantRows = [baseRow];
    const seenVariants = new Set();
    rawVariantRows.forEach((row) => {
      const value = trimStr(row.variant);
      const key = value.toLowerCase();
      if (!value || isBaseVariantName(value) || seenVariants.has(key)) return;
      seenVariants.add(key);
      detailVariantRows.push({
        isBase: false,
        value,
        homeLocation: normalizeShoppingListHomeLocation(row.homeLocation),
        tags: tagsByVariantId.get(row.id) || [],
        variantId: row.id != null && row.id > 0 ? row.id : null,
        isDeprecated: !!row.isDeprecated,
      });
    });

    if (!rawVariantRows.length) {
      dedupeTextInOrder(
        (Array.isArray(ingredientRows) ? ingredientRows : [])
          .filter((row) => targetIdSet.has(intOrNull(row?.id ?? row?.ID)))
          .map((row) => row?.variant),
      ).forEach((value) => {
        const key = value.toLowerCase();
        if (isBaseVariantName(value) || seenVariants.has(key)) return;
        seenVariants.add(key);
        detailVariantRows.push({
          isBase: false,
          value,
          homeLocation: 'none',
          tags: [],
          variantId: null,
          isDeprecated: false,
        });
      });
    }

    const sizesText = dedupeTextInOrder(
      (Array.isArray(sizeRows) ? sizeRows : [])
        .filter((row) => targetIdSet.has(intOrNull(row?.ingredient_id)))
        .slice()
        .sort((a, b) => {
          const ai = targetIds.indexOf(intOrNull(a?.ingredient_id));
          const bi = targetIds.indexOf(intOrNull(b?.ingredient_id));
          if (ai !== bi) return ai - bi;
          const as = toTagSortOrder(a?.sort_order);
          const bs = toTagSortOrder(b?.sort_order);
          if (as !== bs) return as - bs;
          return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
        })
        .map((row) => row?.size),
    ).join('\n');
    const fallbackSizesText =
      sizesText ||
      dedupeTextInOrder(
        (Array.isArray(ingredientRows) ? ingredientRows : [])
          .filter((row) => targetIdSet.has(intOrNull(row?.id ?? row?.ID)))
          .map((row) => row?.size),
      ).join('\n');
    const synonymsText = dedupeTextInOrder(
      (Array.isArray(synonymRows) ? synonymRows : [])
        .filter((row) => targetIdSet.has(intOrNull(row?.ingredient_id)))
        .slice()
        .sort((a, b) => {
          const ai = targetIds.indexOf(intOrNull(a?.ingredient_id));
          const bi = targetIds.indexOf(intOrNull(b?.ingredient_id));
          if (ai !== bi) return ai - bi;
          return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
        })
        .map((row) => row?.synonym),
    ).join('\n');

    const hasIsDeprecated = objectHasOwn(requested, 'is_deprecated');
    const visibility = {
      showPluralOverride: objectHasOwn(requested, 'plural_override'),
      showPluralByDefault: objectHasOwn(requested, 'plural_by_default'),
      showIsMassNoun: objectHasOwn(requested, 'is_mass_noun'),
      showAnyOverrides:
        objectHasOwn(requested, 'plural_override') ||
        objectHasOwn(requested, 'plural_by_default') ||
        objectHasOwn(requested, 'is_mass_noun'),
      showHiddenToggle: objectHasOwn(requested, 'is_hidden'),
    };

    return {
      id: ingredientId,
      name: requested?.name == null ? '' : String(requested.name),
      lemma: trimStr(requested?.lemma),
      variantRows: detailVariantRows,
      synonymsText,
      sizesText: fallbackSizesText,
      homeLocation: baseRow.homeLocation,
      isFood: objectHasOwn(requested, 'is_food') ? toBool(requested.is_food) : true,
      isRemoved: hasIsDeprecated
        ? toBool(requested?.is_deprecated)
        : toBool(requested?.hide_from_shopping_list),
      isHidden: toBool(requested?.is_hidden),
      pluralOverride: trimStr(requested?.plural_override),
      pluralByDefault: toBool(requested?.plural_by_default),
      isMassNoun: toBool(requested?.is_mass_noun),
      visibility,
    };
  }

  // ---- listShoppingItemRecipeUsage ----------------------------------------
  //
  // Contract: js/data/contracts/listShoppingItemRecipeUsage.md

  function compareRecipeUsageRows(a, b) {
    const la = asciiNocaseFold(a?.title || '');
    const lb = asciiNocaseFold(b?.title || '');
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  async function listShoppingItemRecipeUsage(opts, itemName) {
    const name = trimStr(itemName);
    if (!name) return [];
    const nameKey = name.toLowerCase();

    const [ingredientRows, rimRows, substituteRows] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,variant',
        'listShoppingItemRecipeUsage',
      ),
      pgGet(
        opts,
        'recipe_ingredient_map?select=id,recipe_id,ingredient_id',
        'listShoppingItemRecipeUsage',
      ),
      pgGet(
        opts,
        'recipe_ingredient_substitutes?select=id,recipe_ingredient_id,ingredient_id',
        'listShoppingItemRecipeUsage',
      ),
    ]);

    const matchingIngredientIds = new Set();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const id = intOrNull(row?.id ?? row?.ID);
      if (id == null || id <= 0) return;
      if (trimStr(row?.name).toLowerCase() === nameKey) {
        matchingIngredientIds.add(id);
      }
    });
    if (!matchingIngredientIds.size) return [];

    const recipeIdByRimId = new Map();
    const recipeIds = new Set();
    (Array.isArray(rimRows) ? rimRows : []).forEach((row) => {
      const rimId = intOrNull(row?.id ?? row?.ID);
      const recipeId = intOrNull(row?.recipe_id);
      const ingredientId = intOrNull(row?.ingredient_id);
      if (rimId != null && rimId > 0) recipeIdByRimId.set(rimId, recipeId);
      if (
        recipeId != null &&
        recipeId > 0 &&
        matchingIngredientIds.has(ingredientId)
      ) {
        recipeIds.add(recipeId);
      }
    });
    (Array.isArray(substituteRows) ? substituteRows : []).forEach((row) => {
      const ingredientId = intOrNull(row?.ingredient_id);
      if (!matchingIngredientIds.has(ingredientId)) return;
      const recipeId = recipeIdByRimId.get(intOrNull(row?.recipe_ingredient_id));
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });
    if (!recipeIds.size) return [];

    const recipeRows = await pgGet(
      opts,
      `recipes?select=id,title&id=in.(${Array.from(recipeIds)
        .map((id) => Math.trunc(Number(id)))
        .join(',')})`,
      'listShoppingItemRecipeUsage',
    );
    const seen = new Set();
    return (Array.isArray(recipeRows) ? recipeRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        title: trimStr(row?.title),
      }))
      .filter((row) => {
        if (row.id == null || row.id <= 0 || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .sort(compareRecipeUsageRows);
  }

  // ---- listShoppingListHomeLocations --------------------------------------
  //
  // Contract: js/data/contracts/listShoppingListHomeLocations.md

  async function listShoppingListHomeLocations(opts, sourceKeys) {
    const keys = normalizeShoppingListSourceKeys(sourceKeys);
    const out = Object.fromEntries(keys.map((key) => [key, 'none']));
    if (!keys.length) return out;

    const baseKeys = [
      ...new Set(keys.map((key) => splitShoppingListSourceKey(key).baseKey).filter(Boolean)),
    ];
    if (!baseKeys.length) return out;

    const [ingredientRows, variantRows] = await Promise.all([
      pgGet(opts, 'ingredients?select=id,name', 'listShoppingListHomeLocations'),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,home_location',
        'listShoppingListHomeLocations',
      ),
    ]);

    const ingredients = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        nameKey: trimStr(row?.name).toLowerCase(),
      }))
      .filter(
        (row) =>
          row.id != null &&
          row.id > 0 &&
          row.nameKey &&
          baseKeys.includes(row.nameKey),
      )
      .sort((a, b) => a.id - b.id);
    const ingredientById = new Map();
    ingredients.forEach((row) => ingredientById.set(row.id, row));

    const variants = (Array.isArray(variantRows) ? variantRows : [])
      .map((row) => ({
        id: intOrNull(row?.id),
        ingredientId: intOrNull(row?.ingredient_id),
        variantKey: trimStr(row?.variant).toLowerCase(),
        sortOrder:
          row?.sort_order != null && Number.isFinite(Number(row.sort_order))
            ? Number(row.sort_order)
            : 999999,
        homeLocation: normalizeShoppingListHomeLocation(row?.home_location),
      }))
      .filter(
        (row) =>
          row.id != null &&
          row.id > 0 &&
          row.ingredientId != null &&
          ingredientById.has(row.ingredientId),
      )
      .sort((a, b) => {
        const ingredientDiff = a.ingredientId - b.ingredientId;
        if (ingredientDiff !== 0) return ingredientDiff;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id - b.id;
      });

    const baseLocations = new Map();
    const variantLocations = new Map();
    variants.forEach((variant) => {
      const ingredient = ingredientById.get(variant.ingredientId);
      const nameKey = ingredient?.nameKey || '';
      if (!nameKey) return;
      if (!variant.variantKey || variant.variantKey === 'default') {
        if (!baseLocations.has(nameKey)) {
          baseLocations.set(nameKey, variant.homeLocation);
        }
        return;
      }
      const sourceKey = `${nameKey}${SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP}${variant.variantKey}`;
      if (!variantLocations.has(sourceKey)) {
        variantLocations.set(sourceKey, variant.homeLocation);
      }
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

  function compareVariantUsageAisles(a, b) {
    const chainA = asciiNocaseFold(a?.chainName || '');
    const chainB = asciiNocaseFold(b?.chainName || '');
    if (chainA < chainB) return -1;
    if (chainA > chainB) return 1;
    const locA = asciiNocaseFold(a?.locationName || '');
    const locB = asciiNocaseFold(b?.locationName || '');
    if (locA < locB) return -1;
    if (locA > locB) return 1;
    const sortA = Number.isFinite(Number(a?._sortOrder))
      ? Number(a._sortOrder)
      : 999999;
    const sortB = Number.isFinite(Number(b?._sortOrder))
      ? Number(b._sortOrder)
      : 999999;
    if (sortA !== sortB) return sortA - sortB;
    return (Number(a?.aisleId) || 0) - (Number(b?.aisleId) || 0);
  }

  async function loadShoppingItemVariantUsage(opts, request = {}) {
    const ingredientId = Math.trunc(Number(request?.ingredientId));
    const variantName = trimStr(request?.variantName);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !variantName) {
      return emptyVariantUsage();
    }
    const variantKey = variantName.toLowerCase();

    const [rimRows, substituteRows, variantRows] = await Promise.all([
      pgGet(
        opts,
        'recipe_ingredient_map?select=id,recipe_id,ingredient_id,variant',
        'loadShoppingItemVariantUsage',
      ),
      pgGet(
        opts,
        'recipe_ingredient_substitutes?select=id,recipe_ingredient_id,ingredient_id,variant',
        'loadShoppingItemVariantUsage',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant',
        'loadShoppingItemVariantUsage',
      ),
    ]);

    const recipeIdByRimId = new Map();
    const recipeIds = new Set();
    (Array.isArray(rimRows) ? rimRows : []).forEach((row) => {
      const rimId = intOrNull(row?.id ?? row?.ID);
      const recipeId = intOrNull(row?.recipe_id);
      if (rimId != null && rimId > 0) recipeIdByRimId.set(rimId, recipeId);
      if (
        intOrNull(row?.ingredient_id) === ingredientId &&
        trimStr(row?.variant).toLowerCase() === variantKey &&
        recipeId != null &&
        recipeId > 0
      ) {
        recipeIds.add(recipeId);
      }
    });
    (Array.isArray(substituteRows) ? substituteRows : []).forEach((row) => {
      if (
        intOrNull(row?.ingredient_id) !== ingredientId ||
        trimStr(row?.variant).toLowerCase() !== variantKey
      ) {
        return;
      }
      const recipeId = recipeIdByRimId.get(intOrNull(row?.recipe_ingredient_id));
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });

    const recipeRows = recipeIds.size
      ? await pgGet(
          opts,
          `recipes?select=id,title&id=in.(${Array.from(recipeIds)
            .map((id) => Math.trunc(Number(id)))
            .join(',')})`,
          'loadShoppingItemVariantUsage',
        )
      : [];
    const seenRecipes = new Set();
    const recipes = (Array.isArray(recipeRows) ? recipeRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        title: trimStr(row?.title),
      }))
      .filter((row) => {
        if (row.id == null || row.id <= 0 || seenRecipes.has(row.id)) return false;
        seenRecipes.add(row.id);
        return true;
      })
      .sort(compareRecipeUsageRows);

    const matchingVariantIds = new Set();
    (Array.isArray(variantRows) ? variantRows : []).forEach((row) => {
      const id = intOrNull(row?.id);
      if (
        id != null &&
        id > 0 &&
        intOrNull(row?.ingredient_id) === ingredientId &&
        trimStr(row?.variant).toLowerCase() === variantKey
      ) {
        matchingVariantIds.add(id);
      }
    });

    let aislePlacements = [];
    if (matchingVariantIds.size) {
      const [variantAisleRows, aisleRows, storeRows] = await Promise.all([
        pgGet(
          opts,
          'ingredient_variant_store_location?select=id,ingredient_variant_id,store_location_id',
          'loadShoppingItemVariantUsage',
        ),
        pgGet(
          opts,
          'store_locations?select=id,store_id,name,sort_order',
          'loadShoppingItemVariantUsage',
        ),
        pgGet(
          opts,
          'stores?select=id,chain_name,location_name',
          'loadShoppingItemVariantUsage',
        ),
      ]);
      const aislesById = new Map();
      (Array.isArray(aisleRows) ? aisleRows : []).forEach((row) => {
        const id = intOrNull(row?.id ?? row?.ID);
        if (id != null && id > 0) aislesById.set(id, row);
      });
      const storesById = new Map();
      (Array.isArray(storeRows) ? storeRows : []).forEach((row) => {
        const id = intOrNull(row?.id ?? row?.ID);
        if (id != null && id > 0) storesById.set(id, row);
      });
      const seenAisles = new Set();
      aislePlacements = (Array.isArray(variantAisleRows) ? variantAisleRows : [])
        .map((row) => {
          const variantId = intOrNull(row?.ingredient_variant_id);
          const aisleId = intOrNull(row?.store_location_id);
          if (!matchingVariantIds.has(variantId) || aisleId == null || aisleId <= 0) {
            return null;
          }
          if (seenAisles.has(aisleId)) return null;
          const aisle = aislesById.get(aisleId);
          if (!aisle) return null;
          const storeId = intOrNull(aisle?.store_id);
          const store = storesById.get(storeId);
          if (storeId == null || storeId <= 0 || !store) return null;
          seenAisles.add(aisleId);
          return {
            storeId,
            chainName: trimStr(store?.chain_name),
            locationName: trimStr(store?.location_name),
            aisleId,
            aisleName: trimStr(aisle?.name),
            _sortOrder: intOrNull(aisle?.sort_order),
          };
        })
        .filter(Boolean)
        .sort(compareVariantUsageAisles)
        .map((row) => {
          const { _sortOrder, ...publicRow } = row;
          return publicRow;
        });
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
    if (typeof raw === 'string' && /^\s*\d+(\.\d)?\s*$/.test(raw)) {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
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

  async function buildShoppingPlanKeyResolver(opts) {
    const [ingredientRows, variantRows] = await Promise.all([
      pgGet(opts, 'ingredients?select=id,name', 'listShoppingPlanRecipeItems'),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant',
        'listShoppingPlanRecipeItems',
      ),
    ]);
    const ingredientsByName = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : [])
      .slice()
      .sort((a, b) => (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0))
      .forEach((row) => {
        const key = trimStr(row?.name).toLowerCase();
        const id = intOrNull(row?.id);
        if (!key || id == null || id <= 0 || ingredientsByName.has(key)) return;
        ingredientsByName.set(key, { id, name: row?.name == null ? '' : String(row.name) });
      });
    const variantsByIngredientAndName = new Map();
    (Array.isArray(variantRows) ? variantRows : [])
      .slice()
      .sort((a, b) => (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0))
      .forEach((row) => {
        const ingredientId = intOrNull(row?.ingredient_id);
        const variant = trimStr(row?.variant);
        const id = intOrNull(row?.id);
        if (ingredientId == null || ingredientId <= 0 || !variant || id == null || id <= 0) {
          return;
        }
        const key = `${ingredientId}:${variant.toLowerCase()}`;
        if (!variantsByIngredientAndName.has(key)) {
          variantsByIngredientAndName.set(key, id);
        }
      });

    return function resolveShoppingPlanItemKey(name, variantName) {
      const rawName = trimStr(name);
      const rawVariant = trimStr(variantName);
      if (!rawName) return '';
      const ingredient = ingredientsByName.get(rawName.toLowerCase());
      if (!ingredient) return shoppingPlanAggregateKey(rawName, rawVariant);
      const variantKey = rawVariant.toLowerCase();
      if (!variantKey || RESERVED_VARIANT_NAMES.has(variantKey)) {
        return shoppingPlanAggregateKey(ingredient.name, '');
      }
      const variantId = variantsByIngredientAndName.get(
        `${ingredient.id}:${variantKey}`,
      );
      if (variantId != null && variantId > 0) {
        return `${SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX}${Math.trunc(variantId)}`;
      }
      return shoppingPlanAggregateKey(ingredient.name, rawVariant);
    };
  }

  async function listShoppingPlanRecipeItems(opts, selectedRecipes = []) {
    const selections = normalizeShoppingPlanSelections(selectedRecipes);
    const resolveShoppingPlanItemKey = await buildShoppingPlanKeyResolver(opts);
    const aggregate = new Map();
    const recipeCache = new Map();
    const loadRecipe = async (recipeId) => {
      const id = Math.trunc(Number(recipeId));
      if (!Number.isFinite(id) || id <= 0) return null;
      if (!recipeCache.has(id)) {
        recipeCache.set(id, await loadRecipeDetail(opts, id));
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
          const key = resolveShoppingPlanItemKey(name, variantName);
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

  function pushAssignment(map, key, candidate) {
    const normalizedKey = trimStr(key).toLowerCase();
    if (!normalizedKey) return;
    if (!map.has(normalizedKey)) map.set(normalizedKey, []);
    map.get(normalizedKey).push(candidate);
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

  async function listShoppingListAssignments(opts, request = {}) {
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

    const [
      storeRows,
      storeLocationRows,
      ingredientRows,
      variantRows,
      itemLocationRows,
      variantLocationRows,
    ] = await Promise.all([
      pgGet(opts, 'stores?select=id,chain_name,location_name', 'listShoppingListAssignments'),
      pgGet(
        opts,
        'store_locations?select=id,store_id,name,sort_order',
        'listShoppingListAssignments',
      ),
      pgGet(opts, 'ingredients?select=id,name', 'listShoppingListAssignments'),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order',
        'listShoppingListAssignments',
      ),
      pgGet(
        opts,
        'ingredient_store_location?select=id,ingredient_id,store_location_id',
        'listShoppingListAssignments',
      ),
      pgGet(
        opts,
        'ingredient_variant_store_location?select=id,ingredient_variant_id,store_location_id',
        'listShoppingListAssignments',
      ),
    ]);

    const storeMeta = new Map();
    (Array.isArray(storeRows) ? storeRows : []).forEach((row) => {
      const storeId = intOrNull(row?.id ?? row?.ID);
      if (storeId == null || storeId <= 0) return;
      const chainName = trimStr(row?.chain_name);
      const locationName = trimStr(row?.location_name);
      storeMeta.set(storeId, {
        id: storeId,
        label: locationName ? `${chainName} (${locationName})` : chainName || `Store ${storeId}`,
      });
    });
    const selectedStores = orderedStoreIds
      .map((storeId) => storeMeta.get(storeId))
      .filter(Boolean);
    const effectiveStoreIds = new Set(selectedStores.map((store) => store.id));
    if (!items.length) return { selectedStores, assignmentsByKey };
    if (!effectiveStoreIds.size) return { selectedStores, assignmentsByKey };

    const itemNameKeys = new Set(
      items.map((item) => trimStr(item.name).toLowerCase()).filter(Boolean),
    );
    const ingredientsById = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const id = intOrNull(row?.id ?? row?.ID);
      const nameKey = trimStr(row?.name).toLowerCase();
      if (id == null || id <= 0 || !nameKey || !itemNameKeys.has(nameKey)) return;
      ingredientsById.set(id, { id, nameKey });
    });

    const aisleById = new Map();
    (Array.isArray(storeLocationRows) ? storeLocationRows : []).forEach((row) => {
      const aisleId = intOrNull(row?.id ?? row?.ID);
      const storeId = intOrNull(row?.store_id);
      if (
        aisleId == null ||
        aisleId <= 0 ||
        storeId == null ||
        storeId <= 0 ||
        !effectiveStoreIds.has(storeId)
      ) {
        return;
      }
      aisleById.set(aisleId, {
        storeId,
        aisleId,
        aisleLabel: trimStr(row?.name) || `Aisle ${aisleId}`,
        aisleSortOrder:
          row?.sort_order != null && Number.isFinite(Number(row.sort_order))
          ? Number(row.sort_order)
          : 999999,
      });
    });

    const variantsById = new Map();
    const variantRowsSorted = (Array.isArray(variantRows) ? variantRows : [])
      .slice()
      .sort((a, b) => {
        const an = ingredientsById.get(intOrNull(a?.ingredient_id))?.nameKey || '';
        const bn = ingredientsById.get(intOrNull(b?.ingredient_id))?.nameKey || '';
        const nameDelta = compareAsciiNocaseString(an, bn);
        if (nameDelta) return nameDelta;
        const as =
          a?.sort_order != null && Number.isFinite(Number(a.sort_order))
            ? Number(a.sort_order)
            : 999999;
        const bs =
          b?.sort_order != null && Number.isFinite(Number(b.sort_order))
            ? Number(b.sort_order)
            : 999999;
        if (as !== bs) return as - bs;
        return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
      });

    const maps = {
      baseAssignmentMap: new Map(),
      variantAssignmentMap: new Map(),
      variantAnyAssignmentMap: new Map(),
      variantOrderMap: new Map(),
    };

    variantRowsSorted.forEach((row) => {
      const id = intOrNull(row?.id);
      const ingredient = ingredientsById.get(intOrNull(row?.ingredient_id));
      const variantKey = trimStr(row?.variant).toLowerCase();
      if (id == null || id <= 0 || !ingredient || !variantKey) return;
      variantsById.set(id, {
        id,
        ingredientId: ingredient.id,
        nameKey: ingredient.nameKey,
        variantKey,
      });
      if (variantKey === SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME) return;
      if (!maps.variantOrderMap.has(ingredient.nameKey)) {
        maps.variantOrderMap.set(ingredient.nameKey, []);
      }
      maps.variantOrderMap.get(ingredient.nameKey).push(variantKey);
    });

    (Array.isArray(itemLocationRows) ? itemLocationRows : []).forEach((row) => {
      const ingredient = ingredientsById.get(intOrNull(row?.ingredient_id));
      const aisle = aisleById.get(intOrNull(row?.store_location_id));
      if (!ingredient || !aisle) return;
      pushAssignment(maps.baseAssignmentMap, ingredient.nameKey, { ...aisle });
    });

    (Array.isArray(variantLocationRows) ? variantLocationRows : []).forEach((row) => {
      const variant = variantsById.get(intOrNull(row?.ingredient_variant_id));
      const aisle = aisleById.get(intOrNull(row?.store_location_id));
      if (
        !variant ||
        !aisle ||
        variant.variantKey === SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME
      ) {
        return;
      }
      const candidate = { ...aisle };
      pushAssignment(maps.variantAnyAssignmentMap, variant.nameKey, candidate);
      const assignmentKey = assignmentVariantKey(variant.nameKey, variant.variantKey);
      if (!assignmentKey) return;
      if (!maps.variantAssignmentMap.has(assignmentKey)) {
        maps.variantAssignmentMap.set(assignmentKey, []);
      }
      maps.variantAssignmentMap.get(assignmentKey).push(candidate);
    });

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

  async function listShoppingListRecipeSummaries(opts, selectedRecipes = []) {
    const selections = normalizeShoppingListRecipeSummarySelections(selectedRecipes);
    if (!selections.length) return [];

    const recipeRows = await pgGet(
      opts,
      'recipes?select=id,title,servings_default',
      'listShoppingListRecipeSummaries',
    );
    const recipesById = new Map();
    (Array.isArray(recipeRows) ? recipeRows : []).forEach((row) => {
      const recipeId = intOrNull(row?.id ?? row?.ID);
      if (recipeId == null || recipeId <= 0) return;
      recipesById.set(recipeId, {
        title: trimStr(row?.title),
        servingsDefault: Number(row?.servings_default),
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
        recipeId:
          sourceType === 'recipe' && Number.isFinite(recipeId) && recipeId > 0
            ? recipeId
            : null,
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
        ingredientVariantId: intOrNull(entry?.ingredientVariantId),
      }))
      .filter((entry) => {
        const q = Number(entry.quantity);
        if (!Number.isFinite(q) || q <= 0) return false;
        if (trimStr(entry.name)) return true;
        const iv = intOrNull(entry.ingredientVariantId);
        return iv != null && iv > 0;
      });
  }

  async function listShoppingListPlanRows(opts, request = {}) {
    const selectedItems = normalizePlanRowsSelectedItems(request?.selectedItems);
    const selectedRecipes = normalizeShoppingPlanSelections(request?.selectedRecipes);
    if (!selectedItems.length && !selectedRecipes.length) return [];

    const rowsByKey = new Map();
    const itemRows = await listShoppingItems(opts);
    const visibleItems = new Map();
    itemRows.forEach((item) => {
      const key = trimStr(item?.name).toLowerCase();
      if (!key || item.isHidden || item.isRemoved) return;
      visibleItems.set(key, item);
    });

    selectedItems.forEach((entry) => {
      let visible = visibleItems.get(entry.name.toLowerCase());
      let rowName = entry.name;
      let rowVariant = entry.variantName;
      if (!visible) {
        const wantIv = intOrNull(entry.ingredientVariantId);
        if (wantIv != null && wantIv > 0) {
          for (const item of itemRows) {
            if (item.isHidden || item.isRemoved) continue;
            const vidMap = item.variantIdByName || {};
            const hitVariantLc = Object.keys(vidMap).find(
              (k) => intOrNull(vidMap[k]) === wantIv,
            );
            const defVid = intOrNull(item.defaultVariantId);
            if (hitVariantLc != null) {
              visible = item;
              rowName = trimStr(item.name);
              const proper = (Array.isArray(item.variants) ? item.variants : []).find(
                (v) => trimStr(v).toLowerCase() === hitVariantLc,
              );
              rowVariant = proper != null ? trimStr(proper) : hitVariantLc;
              break;
            }
            if (defVid === wantIv) {
              visible = item;
              rowName = trimStr(item.name);
              rowVariant = 'default';
              break;
            }
          }
        }
      }
      if (!visible) return;
      const variantKey = rowVariant.toLowerCase();
      const row = ensurePlanRowsRow(rowsByKey, {
        name: rowName,
        variantName: rowVariant,
        variantIsRemoved:
          !!variantKey &&
          Array.isArray(visible.removedVariants) &&
          visible.removedVariants.some((v) => trimStr(v).toLowerCase() === variantKey),
      });
      if (!row) return;
      const bucket = makePlanRowsBucket({ kind: 'selected', quantity: entry.quantity });
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
      if (!recipeCache.has(id)) recipeCache.set(id, await loadRecipeDetail(opts, id));
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
              title:
                trimStr(linkedRecipe.title) ||
                trimStr(line.linkedRecipeTitle) ||
                `Recipe ${linkedRecipeId}`,
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

  function createSupabaseAdapter(opts = {}) {
    return {
      createRecipe: (request) => createRecipe(opts, request),
      deleteRecipe: (request) => deleteRecipe(opts, request),
      listRecipes: () => listRecipes(opts),
      loadRecipeDetail: (recipeId) => loadRecipeDetail(opts, recipeId),
      saveRecipe: (request) => saveRecipe(opts, request),
      buildRecipeEditorPreflightHelpers: () =>
        buildRecipeEditorPreflightHelpers(opts),
      loadTagUsage: (tagId) => loadTagUsage(opts, tagId),
      loadTypeaheadPools: (options) => loadTypeaheadPools(opts, options),
      listTags: () => listTags(opts),
      createTag: (request) => createTag(opts, request),
      deleteTag: (request) => deleteTag(opts, request),
      editTag: (request) => editTag(opts, request),
      listUnits: () => listUnits(opts),
      createUnit: (request) => createUnit(opts, request),
      editUnit: (request) => editUnit(opts, request),
      removeUnit: (request) => removeUnit(opts, request),
      countRecipesUsingUnit: (request) =>
        countRecipesUsingUnit(opts, request),
      listRecipesUsingUnit: (request) =>
        listRecipesUsingUnit(opts, request),
      listSizes: () => listSizes(opts),
      createSize: (request) => createSize(opts, request),
      editSize: (request) => editSize(opts, request),
      removeSize: (request) => removeSize(opts, request),
      countRecipesUsingSize: (request) =>
        countRecipesUsingSize(opts, request),
      listRecipesUsingSize: (request) =>
        listRecipesUsingSize(opts, request),
      listStores: () => listStores(opts),
      createStore: (request) => createStore(opts, request),
      deleteStore: (request) => deleteStore(opts, request),
      editStore: (request) => editStore(opts, request),
      saveStoreLayout: (request) => saveStoreLayout(opts, request),
      loadStoreDetail: (request) => loadStoreDetail(opts, request),
      loadShoppingState: () => loadShoppingState(opts),
      saveShoppingState: (request) => saveShoppingState(opts, request),
      lookupShoppingItemByName: (request) =>
        lookupShoppingItemByName(opts, request),
      findOrCreateShoppingItem: (request) =>
        findOrCreateShoppingItem(opts, request),
      pruneOrphanedIngredientSynonyms: () =>
        pruneOrphanedIngredientSynonyms(opts),
      saveShoppingCatalogItem: (request) =>
        saveShoppingCatalogItem(opts, request),
      lookupIngredientNameByLemma: (request) =>
        lookupIngredientNameByLemma(opts, request),
      listIngredientTagNames: () => listIngredientTagNames(opts),
      listShoppingItems: () => listShoppingItems(opts),
      loadShoppingItemDetail: (request) => loadShoppingItemDetail(opts, request),
      deleteShoppingItem: (request) => deleteShoppingItem(opts, request),
      listShoppingItemRecipeUsage: (itemName) =>
        listShoppingItemRecipeUsage(opts, itemName),
      listShoppingListHomeLocations: (sourceKeys) =>
        listShoppingListHomeLocations(opts, sourceKeys),
      isIngredientVariantDeprecated: (request) =>
        isIngredientVariantDeprecated(opts, request),
      loadShoppingItemVariantUsage: (request) =>
        loadShoppingItemVariantUsage(opts, request),
      listShoppingPlanRecipeItems: (selectedRecipes) =>
        listShoppingPlanRecipeItems(opts, selectedRecipes),
      listShoppingListAssignments: (request) =>
        listShoppingListAssignments(opts, request),
      listShoppingListRecipeSummaries: (selectedRecipes) =>
        listShoppingListRecipeSummaries(opts, selectedRecipes),
      listShoppingListPlanRows: (request) => listShoppingListPlanRows(opts, request),
      resolveCanonicalIngredientForShoppingReconcile: (request) =>
        resolveCanonicalIngredientForShoppingReconcile(opts, request),
      listIngredientVariantsWithIngredientsByIds: (request) =>
        listIngredientVariantsWithIngredientsByIds(opts, request),
      listIngredientVariantsByIngredientIds: (request) =>
        listIngredientVariantsByIngredientIds(opts, request),
    };
  }

  global.createSupabaseAdapter = createSupabaseAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
