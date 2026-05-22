/**
 * List- and editor-page load affordance: shuffled food Material icon filmstrip.
 * Overlay mounts on `.page-wrapper` (sibling of the list / #pageContent) so
 * content `innerHTML` clears cannot destroy it. Timing knobs live in
 * css/styles.css (--loader-*).
 */
(function initPageLoadFoodIcon(global) {
  if (!global || global.pageLoadFoodIcon) return;

  const ICONS = Object.freeze([
    'avocado_bean',
    'bakery_dining',
    'blender',
    'breakfast_dining',
    'coffee',
    'coffee_maker',
    'cookie',
    'dine_lamp',
    'dinner_dining',
    'emoji_food_beverage',
    'fastfood',
    'grocery',
    'icecream',
    'kitchen',
    'local_dining',
    'local_mall',
    'local_pizza',
    'lunch_dining',
    'menu_book',
    'nutrition',
    'self_care',
    'shopping_cart_checkout',
    'skillet',
    'soba',
    'soup_kitchen',
    'washoku',
  ]);

  const MATERIAL_SYMBOLS_FAMILY = 'Material Symbols Outlined';

  /** @type {{ pageId?: string, listEl?: HTMLElement|null, wrapperEl: HTMLElement, overlayEl: HTMLElement, glyphEl: HTMLElement, deck: string[], deckIndex: number, runId: number, debugMode?: boolean } | null} */
  let state = null;
  let runId = 0;

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function newDeck() {
    return shuffleInPlace(ICONS.slice());
  }

  function resolveListElement(pageId) {
    const map = {
      'shopping-list': 'shoppingListOutput',
      shopping: 'shoppingList',
      recipes: 'recipeList',
      stores: 'storesList',
      units: 'unitsList',
      tags: 'tagsList',
      sizes: 'sizesList',
      'recipe-editor': 'pageContent',
      'shopping-editor': 'pageContent',
      'store-editor': 'pageContent',
      'unit-editor': 'pageContent',
      'size-editor': 'pageContent',
      'tag-editor': 'pageContent',
    };
    const el = global.document?.getElementById(map[pageId] || '');
    return el && typeof el.appendChild === 'function' ? el : null;
  }

  function resolvePageWrapper(listEl) {
    const parent = listEl?.parentElement;
    if (
      parent &&
      typeof parent.classList?.contains === 'function' &&
      parent.classList.contains('page-wrapper')
    ) {
      return parent;
    }
    return parent && typeof parent.appendChild === 'function' ? parent : listEl;
  }

  function readKnobs() {
    const root = global.getComputedStyle(global.document.documentElement);
    const num = (name) => parseFloat(root.getPropertyValue(name));
    return {
      firstPauseMs: num('--loader-first-pause-ms'),
      firstIconFadeMs: num('--loader-first-icon-fade-ms'),
      firstIconHoldMs: num('--loader-first-icon-hold-ms'),
      minPlayMs: num('--loader-min-play-ms'),
      maxPlayMs: num('--loader-max-play-ms'),
      minPauseMs: num('--loader-min-pause-ms'),
      maxPauseMs: num('--loader-max-pause-ms'),
      msPerStep: num('--loader-ms-per-step'),
    };
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function delay(ms) {
    return new Promise((resolve) => {
      global.setTimeout(resolve, ms);
    });
  }

  function ensureMaterialSymbolsReady() {
    const fonts = global.document?.fonts;
    if (!fonts?.load) return Promise.resolve();
    return Promise.all([
      fonts.load(`24px "${MATERIAL_SYMBOLS_FAMILY}"`).catch(() => {}),
      typeof fonts.ready?.then === 'function'
        ? fonts.ready.catch(() => {})
        : Promise.resolve(),
    ]).then(() => {});
  }

  function isActive(generation) {
    return state != null && state.runId === generation;
  }

  function showCurrentIcon() {
    if (!state?.glyphEl) return;
    const name = state.deck[state.deckIndex] || ICONS[0];
    state.glyphEl.textContent = name;
  }

  function advanceFilmstripStep() {
    if (!state) return;
    state.deckIndex += 1;
    if (state.deckIndex >= state.deck.length) {
      state.deck = newDeck();
      state.deckIndex = 0;
    }
    showCurrentIcon();
  }

  async function firstPausePhase(generation) {
    if (!isActive(generation) || !state?.glyphEl) return false;
    state.glyphEl.hidden = true;
    state.glyphEl.textContent = '';
    await delay(readKnobs().firstPauseMs);
    return isActive(generation);
  }

  async function firstIconHoldPhase(generation) {
    if (!isActive(generation) || !state?.glyphEl) return false;
    const glyph = state.glyphEl;
    const knobs = readKnobs();
    const staticMs = Math.max(0, knobs.firstIconHoldMs - knobs.firstIconFadeMs);

    glyph.hidden = false;
    glyph.classList.add('page-load-food-icon__glyph--entering');
    showCurrentIcon();
    void glyph.offsetWidth;
    glyph.classList.remove('page-load-food-icon__glyph--entering');

    await delay(knobs.firstIconFadeMs);
    if (!isActive(generation)) return false;

    if (staticMs > 0) {
      await delay(staticMs);
    }
    return isActive(generation);
  }

  async function pausePhase(durationMs, generation) {
    if (!isActive(generation)) return false;
    await delay(durationMs);
    return isActive(generation);
  }

  async function playPhase(durationMs, stepMs, generation) {
    if (!isActive(generation)) return false;
    const deadline = global.performance.now() + durationMs;
    do {
      if (!isActive(generation)) return false;
      advanceFilmstripStep();
      await delay(stepMs);
    } while (global.performance.now() < deadline);
    return isActive(generation);
  }

  async function runLoop(generation) {
    while (isActive(generation)) {
      const knobs = readKnobs();
      const pauseMs = randomBetween(knobs.minPauseMs, knobs.maxPauseMs);
      if (!(await pausePhase(pauseMs, generation))) return;

      const playMs = randomBetween(knobs.minPlayMs, knobs.maxPlayMs);
      if (!(await playPhase(playMs, knobs.msPerStep, generation))) return;
    }
  }

  async function runFilmstrip(generation) {
    await ensureMaterialSymbolsReady();
    if (!(await firstPausePhase(generation))) return;

    if (!(await firstIconHoldPhase(generation))) return;

    await runLoop(generation);
  }

  function mountDebug(hostEl) {
    const overlay = global.document.createElement('div');
    overlay.className = 'page-load-food-icon-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const glyph = global.document.createElement('span');
    glyph.className = 'page-load-food-icon__glyph material-symbols-outlined';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.hidden = true;
    overlay.appendChild(glyph);
    hostEl.appendChild(overlay);

    return { wrapperEl: hostEl, overlay, glyph };
  }

  function mount(listEl) {
    const wrapperEl = resolvePageWrapper(listEl);

    const overlay = global.document.createElement('div');
    overlay.className = 'page-load-food-icon-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const glyph = global.document.createElement('span');
    glyph.className = 'page-load-food-icon__glyph material-symbols-outlined';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.hidden = true;
    overlay.appendChild(glyph);
    wrapperEl.appendChild(overlay);

    listEl.setAttribute('data-loading', '1');
    listEl.setAttribute('aria-busy', 'true');
    wrapperEl.setAttribute('data-fe-list-loading', '1');

    return { wrapperEl, overlay, glyph };
  }

  function teardown() {
    if (!state) return;
    runId += 1;
    const { listEl, wrapperEl, overlayEl, debugMode } = state;
    if (listEl && typeof listEl.removeAttribute === 'function') {
      listEl.removeAttribute('data-loading');
      listEl.removeAttribute('aria-busy');
    }
    if (
      !debugMode &&
      wrapperEl &&
      typeof wrapperEl.removeAttribute === 'function'
    ) {
      wrapperEl.removeAttribute('data-fe-list-loading');
    }
    if (overlayEl?.parentElement) overlayEl.remove();
    state = null;
  }

  /** Dev-only lab: blank stage, filmstrip loops until fail/finish. */
  function beginDebugForever(options = {}) {
    if (!ICONS.length) return false;
    fail();
    const hostEl =
      options.hostEl && typeof options.hostEl.appendChild === 'function'
        ? options.hostEl
        : global.document?.body;
    if (!hostEl) return false;

    runId += 1;
    const generation = runId;
    const { wrapperEl, overlay, glyph } = mountDebug(hostEl);
    state = {
      wrapperEl,
      overlayEl: overlay,
      glyphEl: glyph,
      deck: newDeck(),
      deckIndex: 0,
      runId: generation,
      debugMode: true,
    };

    void runFilmstrip(generation);
    return true;
  }

  function begin(pageId, options = {}) {
    if (!ICONS.length) return false;
    fail();
    const listEl =
      options.listEl && typeof options.listEl.appendChild === 'function'
        ? options.listEl
        : resolveListElement(pageId);
    if (!listEl) return false;

    runId += 1;
    const generation = runId;
    const { wrapperEl, overlay, glyph } = mount(listEl);
    state = {
      pageId,
      listEl,
      wrapperEl,
      overlayEl: overlay,
      glyphEl: glyph,
      deck: newDeck(),
      deckIndex: 0,
      runId: generation,
    };

    void runFilmstrip(generation);
    return true;
  }

  function finish() {
    teardown();
  }

  function fail() {
    teardown();
  }

  global.pageLoadFoodIcon = Object.freeze({
    begin,
    beginDebugForever,
    finish,
    fail,
    icons: ICONS,
    readKnobs,
  });
})(typeof window !== 'undefined' ? window : globalThis);
