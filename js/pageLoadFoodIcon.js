/**
 * List-page load affordance: shuffled food Material icons with opacity pulse.
 * Overlay mounts on `.page-wrapper` (sibling of the list) so list `innerHTML`
 * clears cannot destroy it. Scoped styles only — no global Material token changes.
 */
(function initPageLoadFoodIcon(global) {
  if (!global || global.pageLoadFoodIcon) return;

  const ICONS = Object.freeze([
    'emoji_food_beverage',
    'avocado_bean',
    'breakfast_dining',
    'cookie',
    'grocery',
    'local_dining',
    'nutrition',
    'soba',
    'lunch_dining',
    'soup_kitchen',
    'washoku',
    'skillet',
    'blender',
    'bakery_dining',
  ]);

  const MATERIAL_SYMBOLS_FAMILY = 'Material Symbols Outlined';
  const START_DELAY_MS = 200;
  const PULSE_MS = 1000;
  const FADE_IN_MS = 400;
  const FADE_OUT_MS = 600;

  /** @type {{ pageId: string, listEl: HTMLElement, wrapperEl?: HTMLElement, overlayEl?: HTMLElement, pulseEl?: HTMLElement, glyphEl?: HTMLElement, deck?: string[], deckIndex?: number, onIteration?: ((ev: AnimationEvent) => void)|null, generation: number, delayTimer?: ReturnType<typeof setTimeout>|null }} */
  let state = null;
  let mountGeneration = 0;

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

  function teardown() {
    if (!state) return;
    mountGeneration += 1;
    const { listEl, wrapperEl, overlayEl, pulseEl, onIteration, delayTimer } =
      state;
    if (delayTimer != null) {
      global.clearTimeout(delayTimer);
    }
    if (pulseEl && onIteration) {
      pulseEl.removeEventListener('animationiteration', onIteration);
    }
    if (listEl && typeof listEl.removeAttribute === 'function') {
      listEl.removeAttribute('data-loading');
      listEl.removeAttribute('aria-busy');
    }
    if (wrapperEl && typeof wrapperEl.removeAttribute === 'function') {
      wrapperEl.removeAttribute('data-fe-list-loading');
    }
    if (overlayEl?.parentElement) overlayEl.remove();
    state = null;
  }

  function showCurrentIcon() {
    if (!state?.glyphEl) return;
    const name = state.deck[state.deckIndex] || ICONS[0];
    state.glyphEl.textContent = name;
  }

  function startPulseAnimation() {
    if (!state?.pulseEl) return;
    state.pulseEl.classList.add('page-load-food-icon__pulse--active');
  }

  function advanceDeck() {
    if (!state) return;
    state.deckIndex += 1;
    if (state.deckIndex >= state.deck.length) {
      state.deck = newDeck();
      state.deckIndex = 0;
    }
    showCurrentIcon();
  }

  function mount(listEl) {
    const wrapperEl = resolvePageWrapper(listEl);

    const overlay = global.document.createElement('div');
    overlay.className = 'page-load-food-icon-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const pulse = global.document.createElement('div');
    pulse.className = 'page-load-food-icon__pulse';

    const glyph = global.document.createElement('span');
    glyph.className = 'page-load-food-icon__glyph material-symbols-outlined';
    glyph.setAttribute('aria-hidden', 'true');
    pulse.appendChild(glyph);
    overlay.appendChild(pulse);
    wrapperEl.appendChild(overlay);

    listEl.setAttribute('data-loading', '1');
    listEl.setAttribute('aria-busy', 'true');
    wrapperEl.setAttribute('data-fe-list-loading', '1');

    const onIteration = () => {
      advanceDeck();
    };
    pulse.addEventListener('animationiteration', onIteration);

    return { wrapperEl, overlay, pulse, glyph, onIteration };
  }

  function revealLoader(generation) {
    if (!state || state.generation !== generation || state.overlayEl) return;
    const listEl = state.listEl;
    const deck = newDeck();
    const { wrapperEl, overlay, pulse, glyph, onIteration } = mount(listEl);
    state = {
      ...state,
      wrapperEl,
      overlayEl: overlay,
      pulseEl: pulse,
      glyphEl: glyph,
      deck,
      deckIndex: 0,
      onIteration,
      delayTimer: null,
    };

    void ensureMaterialSymbolsReady().then(() => {
      if (!state || state.generation !== generation) return;
      showCurrentIcon();
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(() => {
          if (!state || state.generation !== generation) return;
          startPulseAnimation();
        });
      } else {
        startPulseAnimation();
      }
    });
  }

  function begin(pageId, options = {}) {
    if (!ICONS.length) return false;
    fail();
    const listEl =
      options.listEl && typeof options.listEl.appendChild === 'function'
        ? options.listEl
        : resolveListElement(pageId);
    if (!listEl) return false;

    const generation = mountGeneration + 1;
    mountGeneration = generation;
    const delayTimer = global.setTimeout(() => {
      revealLoader(generation);
    }, START_DELAY_MS);
    state = {
      pageId,
      listEl,
      generation,
      delayTimer,
    };

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
    finish,
    fail,
    icons: ICONS,
    startDelayMs: START_DELAY_MS,
    pulseMs: PULSE_MS,
    fadeInMs: FADE_IN_MS,
    fadeOutMs: FADE_OUT_MS,
  });
})(typeof window !== 'undefined' ? window : globalThis);
