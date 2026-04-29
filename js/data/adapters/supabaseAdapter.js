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

  // ---- loadRecipeDetail ----------------------------------------------------
  //
  // Contract: js/data/contracts/loadRecipeDetail.md
  //
  // Five PostgREST queries, one per data slice. Kept as separate calls
  // (instead of one big embedded query) for clarity and easier mocking.

  async function pgGet(opts, pathWithQuery) {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error('loadRecipeDetail: missing Supabase URL or anon key.');
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error('loadRecipeDetail: no fetch implementation available.');
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
      throw new Error(`loadRecipeDetail: Supabase read failed (${status}): ${body}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
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

  function createSupabaseAdapter(opts = {}) {
    return {
      listRecipes: () => listRecipes(opts),
      loadRecipeDetail: (recipeId) => loadRecipeDetail(opts, recipeId),
    };
  }

  global.createSupabaseAdapter = createSupabaseAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
