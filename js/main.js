// Shared SQL.js init (offline / local version)
let SQL;

// Set by loadStoresPage: if Cmd+↑/↓ should reorder a selected row instead of changing tabs.
/** @type {null | ((e: KeyboardEvent) => boolean)} */
let consumeCmdVerticalArrowBeforeTopLevelNav = null;

// --- Unified user messaging helpers (dialogs/toasts) ---
function uiToast(message, opts = {}) {
  try {
    if (window.ui && typeof window.ui.toast === 'function') {
      return window.ui.toast({ message: String(message || ''), ...opts });
    }
  } catch (_) {}
  try {
    // Fallback for early boot / missing ui
    alert(String(message || ''));
  } catch (_) {}
  return null;
}

function uiAlert(title, message, options = {}) {
  const messageNode =
    options && options.messageNode instanceof Node
      ? options.messageNode
      : null;
  try {
    if (window.ui && typeof window.ui.alert === 'function') {
      return window.ui.alert({
        title: String(title || ''),
        message: String(message || ''),
        messageNode,
      });
    }
  } catch (_) {}
  try {
    alert(String(message || ''));
  } catch (_) {}
  return Promise.resolve(true);
}

async function uiConfirm({
  title = 'Confirm',
  message = '',
  confirmText = 'OK',
  cancelText = 'Cancel',
  danger = false,
} = {}) {
  try {
    if (window.ui && typeof window.ui.confirm === 'function') {
      return await window.ui.confirm({
        title,
        message,
        confirmText,
        cancelText,
        danger,
      });
    }
  } catch (_) {}
  try {
    return window.confirm(String(message || 'Are you sure?'));
  } catch (_) {}
  return false;
}

function cloneForUndo(value, fallbackFactory = () => null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return typeof fallbackFactory === 'function' ? fallbackFactory() : null;
  }
}

function uiToastUndo(message, onUndo, { timeoutMs = 8000 } = {}) {
  if (typeof onUndo !== 'function') return uiToast(message);
  try {
    const um = window.undoManager;
    if (um && typeof um.push === 'function') {
      return um.push({
        message: String(message || ''),
        undo: onUndo,
        timeoutMs,
      });
    }
  } catch (_) {}
  return uiToast(message, {
    actionText: 'Undo',
    onAction: onUndo,
    timeoutMs,
  });
}

function attachSecretGalleryShortcut(addBtn) {
  if (!addBtn) return;
  const handler = (e) => {
    if (!e) return;
    const secret = e.ctrlKey || e.metaKey;
    if (!secret) return;
    e.preventDefault();
    e.stopPropagation();
    window.location.href = 'dialog-gallery.html';
  };
  addBtn.addEventListener('pointerdown', handler, { capture: true });
  addBtn.addEventListener('click', handler, { capture: true });
}

const FAVORITE_EATS_BUILD_DEFAULTS = Object.freeze({
  target: 'desktop',
  forceWebExperience: false,
  allowHiddenForceWebModeToggle: true,
});

function readFavoriteEatsBuildConfig() {
  try {
    const raw = window.__FAVORITE_EATS_BUILD__;
    if (!raw || typeof raw !== 'object') {
      return { ...FAVORITE_EATS_BUILD_DEFAULTS };
    }
    const target = String(raw.target || FAVORITE_EATS_BUILD_DEFAULTS.target)
      .trim()
      .toLowerCase();
    return {
      ...FAVORITE_EATS_BUILD_DEFAULTS,
      ...raw,
      target: target === 'web' ? 'web' : FAVORITE_EATS_BUILD_DEFAULTS.target,
      forceWebExperience: raw.forceWebExperience === true,
      allowHiddenForceWebModeToggle:
        raw.allowHiddenForceWebModeToggle !== false,
    };
  } catch (_) {
    return { ...FAVORITE_EATS_BUILD_DEFAULTS };
  }
}

const FAVORITE_EATS_BUILD = Object.freeze(readFavoriteEatsBuildConfig());
/* '1' = planner (force-web) layout on; absent or '0' = off (editing / native
   shell). Replaces legacy favoriteEatsForceWebMode. Default is editing until the
   user turns force-web on via the nav switch or shortcut. */
const PLANNER_LAYOUT_STORAGE_KEY = 'favoriteEatsPlannerOn';
/** Dispatched on `window` when planner (force-web) mode flips. `detail.enabled` is a boolean. */
const FAVORITE_EATS_FORCE_WEB_MODE_EVENT = 'favoriteEatsForceWebModeChanged';
// Only enforced when isPublicWebExperienceLocked() (GitHub Pages / dist/web with injected
// __FAVORITE_EATS_BUILD__). Electron always has target desktop — not affected. Recipe editor
// is allowed on public web: dist/web ships recipeEditor.html (list → recipe detail).
const PUBLIC_WEB_PAGE_REDIRECTS = Object.freeze({
  tags: 'recipes',
  'tag-editor': 'recipes',
  units: 'recipes',
  'unit-editor': 'recipes',
  sizes: 'recipes',
  'size-editor': 'recipes',
  'shopping-editor': 'shopping',
  'store-editor': 'stores',
  'dialog-gallery': 'recipes',
});

function isPublicWebExperienceLocked() {
  return (
    FAVORITE_EATS_BUILD.target === 'web' &&
    FAVORITE_EATS_BUILD.forceWebExperience
  );
}

function isHiddenForceWebModeToggleAllowed() {
  return (
    !isPublicWebExperienceLocked() &&
    FAVORITE_EATS_BUILD.allowHiddenForceWebModeToggle !== false
  );
}

function getPublicWebRedirectPageId(
  pageId = document.body?.dataset?.page || '',
) {
  if (!isPublicWebExperienceLocked()) return '';
  const key = String(pageId || '')
    .trim()
    .toLowerCase();
  if (!key) return '';
  return PUBLIC_WEB_PAGE_REDIRECTS[key] || '';
}

function redirectIfPublicWebPageIsDisallowed() {
  const redirectPageId = getPublicWebRedirectPageId();
  if (!redirectPageId) return false;
  window.location.replace(getTopLevelPageHref(redirectPageId));
  return true;
}

function isForceWebModeEnabled() {
  if (isPublicWebExperienceLocked()) return true;
  try {
    return localStorage.getItem(PLANNER_LAYOUT_STORAGE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

/** Wide recipe-list servings header from this width; keep in sync with `css/styles.css`. */
const RECIPE_LIST_SERVINGS_HEADER_WIDE_MIN_PX = 620;

/** @type {MediaQueryList | null} */
let recipeListServingsHeaderCompactMq = null;

function recipeListServingsHeaderCompactMqList() {
  if (recipeListServingsHeaderCompactMq) return recipeListServingsHeaderCompactMq;
  if (typeof window.matchMedia !== 'function') return null;
  recipeListServingsHeaderCompactMq = window.matchMedia(
    `(max-width: ${RECIPE_LIST_SERVINGS_HEADER_WIDE_MIN_PX - 1}px)`,
  );
  return recipeListServingsHeaderCompactMq;
}

function syncRecipeListServingsHeaderLabelText(headerLabel) {
  if (!headerLabel) return;
  const mq = recipeListServingsHeaderCompactMqList();
  const compact = mq ? mq.matches : false;
  headerLabel.textContent = compact ? 'svgs' : 'servings';
}

let recipeListServingsHeaderLabelMqBound = false;

function ensureRecipeListServingsHeaderLabelMediaListener() {
  const mq = recipeListServingsHeaderCompactMqList();
  if (!mq || recipeListServingsHeaderLabelMqBound) return;
  recipeListServingsHeaderLabelMqBound = true;
  const onChange = () => {
    const label = document.querySelector(
      'body.recipes-page #recipeList .recipe-list-servings-header-label',
    );
    syncRecipeListServingsHeaderLabelText(label);
  };
  try {
    mq.addEventListener('change', onChange);
  } catch (_) {
    mq.addListener(onChange);
  }
}

function applyForceWebModePresentation(enabled = isForceWebModeEnabled()) {
  const body = document.body;
  if (!(body instanceof HTMLElement)) return !!enabled;

  const forceWebMode = !!enabled;
  body.dataset.forceWebMode = forceWebMode ? 'on' : 'off';
  body.dataset.pageSet = forceWebMode ? 'web' : 'editor';
  body.classList.toggle('force-web-mode', forceWebMode);
  applyDocumentThemePlatform(forceWebMode);
  return forceWebMode;
}

function setForceWebModeEnabled(enabled) {
  if (isPublicWebExperienceLocked()) {
    return applyForceWebModePresentation(true);
  }
  const was = isForceWebModeEnabled();
  const next = !!enabled;
  if (was === next) {
    return applyForceWebModePresentation(next);
  }
  try {
    localStorage.setItem(PLANNER_LAYOUT_STORAGE_KEY, next ? '1' : '0');
  } catch (_) {}
  const result = applyForceWebModePresentation(next);
  try {
    window.dispatchEvent(
      new CustomEvent(FAVORITE_EATS_FORCE_WEB_MODE_EVENT, {
        detail: { enabled: next },
      }),
    );
  } catch (_) {}
  return result;
}

function getTopLevelPageOrder() {
  return isForceWebModeEnabled()
    ? ['recipes', 'shopping', 'stores', 'shopping-list']
    : ['recipes', 'shopping', 'stores', 'tags', 'sizes', 'units'];
}

function getTopLevelPageHref(pageId) {
  const key = String(pageId || '')
    .trim()
    .toLowerCase();
  if (!key) return 'index.html';
  if (key === 'shopping-list') return 'shoppingList.html';
  return `${key}.html`;
}

/** Force web off → editor (red); force web on → planner (purple). */
function applyDocumentThemePlatform(planner = isForceWebModeEnabled()) {
  const root = document.documentElement;
  if (!(root instanceof HTMLElement)) return;
  root.dataset.platform = planner ? 'planner' : 'editor';
}

if (!redirectIfPublicWebPageIsDisallowed()) {
  applyForceWebModePresentation();
}
window.forceWebMode = Object.freeze({
  isEnabled: isForceWebModeEnabled,
  setEnabled: setForceWebModeEnabled,
  apply: applyForceWebModePresentation,
});

function isTypingContext(target) {
  const el = target instanceof Element ? target : null;
  const active =
    document.activeElement instanceof Element ? document.activeElement : null;

  const selector =
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';

  return !!(el?.closest(selector) || active?.closest(selector));
}

function isAppBarSearchContext(target) {
  const el = target instanceof Element ? target : null;
  const active =
    document.activeElement instanceof Element ? document.activeElement : null;
  return !!(
    el?.closest?.('#appBarSearchInput') ||
    active?.closest?.('#appBarSearchInput')
  );
}

function isModalOpen() {
  try {
    if (window.ui && typeof window.ui.isDialogOpen === 'function') {
      return !!window.ui.isDialogOpen();
    }
  } catch (_) {}
  // Legacy fallback (older static modals)
  return !!document.querySelector('.modal:not(.hidden)');
}

const typeToAppBarSearchControllers = new WeakMap();
const appBarSearchControllers = new WeakMap();

function wireTypeToAppBarSearch(searchInput) {
  if (!(searchInput instanceof HTMLInputElement)) return;
  const priorController = typeToAppBarSearchControllers.get(searchInput);
  try {
    priorController?.abort();
  } catch (_) {}
  const controller = new AbortController();
  typeToAppBarSearchControllers.set(searchInput, controller);

  const onKeyDown = (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.defaultPrevented) return;
    if (e.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== ' ' && e.shiftKey) return;
    if (e.key.length !== 1) return;
    if (isModalOpen()) return;
    if (document.activeElement?.closest?.('.bottom-nav')) return;
    if (isAppBarSearchContext(e.target)) return;
    if (isTypingContext(e.target)) return;

    e.preventDefault();

    const start =
      typeof searchInput.selectionStart === 'number'
        ? searchInput.selectionStart
        : searchInput.value.length;
    const end =
      typeof searchInput.selectionEnd === 'number'
        ? searchInput.selectionEnd
        : searchInput.value.length;
    const nextValue =
      searchInput.value.slice(0, start) +
      e.key +
      searchInput.value.slice(Math.max(start, end));

    if (typeof setCompactWebAppBarSearchExpanded === 'function') {
      setCompactWebAppBarSearchExpanded(true);
    }
    searchInput.focus();
    searchInput.value = nextValue;

    try {
      const caret = start + e.key.length;
      searchInput.setSelectionRange(caret, caret);
    } catch (_) {}

    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  };

  document.addEventListener('keydown', onKeyDown, {
    capture: true,
    signal: controller.signal,
  });
}

function wireAppBarSearch(searchInput, options = {}) {
  if (!(searchInput instanceof HTMLInputElement)) return null;
  const priorController = appBarSearchControllers.get(searchInput);
  try {
    priorController?.abort();
  } catch (_) {}
  const controller = new AbortController();
  appBarSearchControllers.set(searchInput, controller);

  const {
    clearBtn = document.getElementById('appBarSearchClear'),
    toggleBtn = document.getElementById('appBarSearchToggleBtn'),
    onQueryChange = null,
    normalizeQuery = (value) => String(value || '').trim(),
    enableTypeToSearch = true,
  } = options;

  if (enableTypeToSearch) wireTypeToAppBarSearch(searchInput);

  const isCompactExpanded = () =>
    typeof isCompactWebAppBarSearchExpanded === 'function' &&
    isCompactWebAppBarSearchExpanded();

  const expandCompactSearch = () => {
    if (typeof setCompactWebAppBarSearchExpanded === 'function') {
      return !!setCompactWebAppBarSearchExpanded(true, { focusInput: true });
    }
    searchInput.focus();
    return false;
  };

  const collapseCompactSearch = ({ restoreFocus = false } = {}) => {
    if (typeof setCompactWebAppBarSearchExpanded === 'function') {
      return !!setCompactWebAppBarSearchExpanded(false, { restoreFocus });
    }
    if (restoreFocus && toggleBtn instanceof HTMLButtonElement) {
      toggleBtn.focus();
    }
    return false;
  };

  const syncClearBtn = () => {
    if (!(clearBtn instanceof HTMLElement)) return;
    const compactExpanded = isCompactExpanded();
    clearBtn.style.display =
      searchInput.value || compactExpanded ? 'inline' : 'none';
    clearBtn.setAttribute(
      'aria-label',
      searchInput.value ? 'Clear search' : 'Close search',
    );
  };

  const emitQueryChange = () => {
    syncClearBtn();
    if (typeof onQueryChange === 'function') {
      onQueryChange(normalizeQuery(searchInput.value), searchInput.value);
    }
  };

  syncClearBtn();
  searchInput.addEventListener('input', emitQueryChange, {
    signal: controller.signal,
  });

  if (toggleBtn instanceof HTMLButtonElement) {
    toggleBtn.addEventListener(
      'click',
      () => {
        expandCompactSearch();
        syncClearBtn();
      },
      { signal: controller.signal },
    );
  }

  if (clearBtn instanceof HTMLElement) {
    clearBtn.addEventListener(
      'click',
      () => {
        if (searchInput.value) {
          searchInput.value = '';
          emitQueryChange();
          searchInput.focus();
          return;
        }
        collapseCompactSearch({ restoreFocus: true });
        syncClearBtn();
      },
      { signal: controller.signal },
    );
  }

  searchInput.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (isCompactExpanded()) {
          collapseCompactSearch({ restoreFocus: true });
          syncClearBtn();
        } else {
          searchInput.blur();
        }
      }
    },
    { signal: controller.signal },
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!isCompactExpanded()) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (target.closest('.app-bar-wrapper')) return;
      collapseCompactSearch();
      syncClearBtn();
    },
    {
      capture: true,
      signal: controller.signal,
    },
  );

  window.addEventListener(
    'resize',
    () => {
      if (
        typeof isCompactWebAppBarModeActive === 'function' &&
        !isCompactWebAppBarModeActive()
      ) {
        collapseCompactSearch();
      }
      syncClearBtn();
    },
    { signal: controller.signal },
  );

  return {
    clearBtn,
    toggleBtn,
    syncClearBtn,
    emitQueryChange,
    expandCompactSearch,
    collapseCompactSearch,
  };
}

const TOP_LEVEL_EMPTY_STATE_MESSAGES = Object.freeze({
  recipes: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  shoppingItems: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  shoppingList: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  searchNoMatch: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  units: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  tags: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  sizes: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  stores: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
});

function setTopLevelEmptyStateLayoutMode(listEl, isEmpty) {
  if (!(listEl instanceof HTMLElement)) return;
  listEl.classList.toggle('is-top-level-empty', !!isEmpty);
}

function resolveTopLevelEmptyStateMessage(messageOrKey) {
  if (
    messageOrKey &&
    typeof messageOrKey === 'object' &&
    !Array.isArray(messageOrKey)
  ) {
    return {
      diagnosis: String(messageOrKey.diagnosis || '').trim(),
      cta: String(messageOrKey.cta || '').trim(),
    };
  }
  const messageKey = String(messageOrKey || '').trim();
  if (messageKey && TOP_LEVEL_EMPTY_STATE_MESSAGES[messageKey]) {
    return TOP_LEVEL_EMPTY_STATE_MESSAGES[messageKey];
  }
  const parts = Array.isArray(messageOrKey)
    ? messageOrKey.map((s) => String(s || '').trim()).filter(Boolean)
    : [String(messageOrKey || '').trim()].filter(Boolean);
  return {
    diagnosis: parts[0] || '',
    cta: parts[1] || '',
  };
}

function renderTopLevelEmptyState(listEl, messageOrKey) {
  if (!(listEl instanceof HTMLElement)) return;
  setTopLevelEmptyStateLayoutMode(listEl, true);
  listEl.innerHTML = '';
  const { diagnosis, cta } = resolveTopLevelEmptyStateMessage(messageOrKey);
  const li = document.createElement('li');
  li.className = 'list-section-label top-level-empty-state';
  const diagnosisEl = document.createElement('p');
  diagnosisEl.className = 'top-level-empty-diagnosis';
  diagnosisEl.textContent = diagnosis;
  li.appendChild(diagnosisEl);
  const ctaEl = document.createElement('p');
  ctaEl.className = 'top-level-empty-cta';
  ctaEl.textContent = cta;
  li.appendChild(ctaEl);
  listEl.appendChild(li);
}

function normalizeRecipeTagList(rawTags) {
  const source = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags || '').split('\n');
  const seen = new Set();
  const out = [];
  source
    .map((v) =>
      String(v || '')
        .trim()
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .forEach((tag) => {
      const clipped = tag.length > 48 ? tag.slice(0, 48).trim() : tag;
      if (!clipped) return;
      const key = clipped.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clipped);
    });
  return out;
}

// --- Unit/size row state helpers (tests extract this block) ---
function normalizeUnitSizeFlag(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n === 1 : value === true;
}

function getUnitSizeRowState(row) {
  return {
    isHidden: normalizeUnitSizeFlag(row?.isHidden ?? row?.is_hidden),
    isRemoved: normalizeUnitSizeFlag(row?.isRemoved ?? row?.is_removed),
  };
}

function isUnitSizeRowSelectable(row) {
  const state = getUnitSizeRowState(row);
  return state.isRemoved !== true;
}

function getUnitSizeRemovalAction(usedRecipeCount) {
  const n = Number(usedRecipeCount);
  if (Number.isFinite(n) && n > 0) return 'remove';
  return 'delete';
}

function shouldShowUnitSizeRow(row, activeFilterChips) {
  const state = getUnitSizeRowState(row);
  const chipSet =
    activeFilterChips && typeof activeFilterChips.has === 'function'
      ? activeFilterChips
      : new Set();
  const showHidden = chipSet.has('hidden');
  const showRemoved = chipSet.has('removed');
  if (!showHidden && !showRemoved) return !state.isHidden && !state.isRemoved;
  if (showHidden && showRemoved) return state.isHidden || state.isRemoved;
  if (showHidden) return state.isHidden === true;
  return state.isRemoved === true;
}

if (typeof window !== 'undefined') {
  window.__unitSizeRowStateHelpers = {
    normalizeUnitSizeFlag,
    getUnitSizeRowState,
    isUnitSizeRowSelectable,
    getUnitSizeRemovalAction,
    shouldShowUnitSizeRow,
  };
}
// --- End unit/size row state helpers ---

// --- Size sort helpers (tests extract this block) ---
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

  // For unclassified text sizes, preserve curated DB order when present.
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

function sortSizeNames(values) {
  return (Array.isArray(values) ? values.slice() : []).sort(
    compareSizeDisplayValues,
  );
}

function sortSizeRows(rows) {
  return (Array.isArray(rows) ? rows.slice() : []).sort(
    compareSizeDisplayValues,
  );
}

if (typeof window !== 'undefined') {
  window.__sizeSortHelpers = {
    normalizeSizeSortLabel,
    getNamedSizeRank,
    getNumericSizeSortMeta,
    getSizeSortMeta,
    compareSizeDisplayValues,
    sortSizeNames,
    sortSizeRows,
  };
}
// --- End size sort helpers ---

// --- Shopping list amount helpers (tests extract this block) ---
const SHOPPING_LIST_MEASURED_UNIT_META = Object.freeze({
  tsp: Object.freeze({
    family: 'volume',
    baseUnit: 'ml',
    factor: 4.92892159375,
  }),
  tbsp: Object.freeze({
    family: 'volume',
    baseUnit: 'ml',
    factor: 14.78676478125,
  }),
  cup: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 236.5882365 }),
  'fl oz': Object.freeze({
    family: 'volume',
    baseUnit: 'ml',
    factor: 29.5735295625,
  }),
  pt: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 473.176473 }),
  qt: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 946.352946 }),
  gal: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 3785.411784 }),
  ml: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 1 }),
  l: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 1000 }),
  g: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 1 }),
  kg: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 1000 }),
  oz: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 28.349523125 }),
  lb: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 453.59237 }),
});

const SHOPPING_LIST_UNIT_ALIASES = Object.freeze({
  t: 'tsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tb: 'tbsp',
  tbl: 'tbsp',
  tbspn: 'tbsp',
  tbs: 'tbsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  c: 'cup',
  cup: 'cup',
  cups: 'cup',
  floz: 'fl oz',
  'fl oz': 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  fluidounce: 'fl oz',
  fluidounces: 'fl oz',
  pt: 'pt',
  pint: 'pt',
  pints: 'pt',
  qt: 'qt',
  quart: 'qt',
  quarts: 'qt',
  gal: 'gal',
  gallon: 'gal',
  gallons: 'gal',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
});

function normalizeShoppingListUnit(unitText) {
  const raw = String(unitText || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  if (Object.prototype.hasOwnProperty.call(SHOPPING_LIST_UNIT_ALIASES, raw)) {
    return SHOPPING_LIST_UNIT_ALIASES[raw];
  }
  if (raw.endsWith('ies') && raw.length > 3) return `${raw.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|ses)$/.test(raw)) return raw.slice(0, -2);
  if (raw.endsWith('s') && !raw.endsWith('ss')) return raw.slice(0, -1);
  return raw;
}

function getShoppingListMeasuredUnitMeta(unitText) {
  const normalized = normalizeShoppingListUnit(unitText);
  if (!normalized) return null;
  return SHOPPING_LIST_MEASURED_UNIT_META[normalized] || null;
}

function convertShoppingListQuantityToMeasuredBase(quantity, unitText) {
  const numeric = Number(quantity);
  const meta = getShoppingListMeasuredUnitMeta(unitText);
  if (!meta || !Number.isFinite(numeric) || numeric <= 0) return null;
  return {
    unit: normalizeShoppingListUnit(unitText),
    family: meta.family,
    baseUnit: meta.baseUnit,
    baseQuantity: Number((numeric * meta.factor).toFixed(6)),
  };
}

function roundShoppingListDisplayQuantity(value, unitText = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const normalizedUnit = normalizeShoppingListUnit(unitText);
  let denominators = null;
  let allowThirds = false;

  if (
    normalizedUnit === 'tsp' ||
    normalizedUnit === 'tbsp' ||
    normalizedUnit === 'cup'
  ) {
    denominators = [2, 4, 8];
    allowThirds = true;
  } else if (
    normalizedUnit === 'oz' ||
    normalizedUnit === 'lb' ||
    normalizedUnit === 'pt' ||
    normalizedUnit === 'qt' ||
    normalizedUnit === 'gal'
  ) {
    denominators = [2, 4];
  }

  if (!denominators) return Number(numeric.toFixed(2));

  const abs = Math.abs(numeric);
  const whole = Math.floor(abs);
  const fraction = abs - whole;
  let best = null;

  const registerCandidate = (candidateValue, denominatorWeight) => {
    const err = Math.abs(abs - candidateValue);
    if (
      best == null ||
      err < best.err - 1e-12 ||
      (Math.abs(err - best.err) <= 1e-12 && denominatorWeight < best.den)
    ) {
      best = {
        value: candidateValue,
        err,
        den: denominatorWeight,
      };
    }
  };

  denominators.forEach((den) => {
    const num = Math.round(fraction * den);
    registerCandidate(whole + num / den, den);
  });

  if (allowThirds) {
    const thirdNum = Math.round(fraction * 3);
    registerCandidate(whole + thirdNum / 3, 3);
  }

  if (!best) return Number(numeric.toFixed(2));
  const rounded = Number(best.value.toFixed(6));
  return Number.isFinite(rounded) && rounded > 0
    ? rounded
    : Number(numeric.toFixed(2));
}

function getShoppingListMeasuredDisplayFromBase(family, baseQuantity) {
  const numeric = Number(baseQuantity);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  if (family === 'mass') {
    const ounces = numeric / SHOPPING_LIST_MEASURED_UNIT_META.oz.factor;
    const displayUnit = ounces >= 16 - 1e-9 ? 'lb' : 'oz';
    const unitMeta = SHOPPING_LIST_MEASURED_UNIT_META[displayUnit];
    const displayQuantity = roundShoppingListDisplayQuantity(
      numeric / unitMeta.factor,
      displayUnit,
    );
    if (!Number.isFinite(displayQuantity) || displayQuantity <= 0) return null;
    return {
      family,
      quantity: displayQuantity,
      unit: displayUnit,
    };
  }

  if (family === 'volume') {
    const cups = numeric / SHOPPING_LIST_MEASURED_UNIT_META.cup.factor;
    let displayUnit = 'tsp';
    if (cups >= 16 - 1e-9) displayUnit = 'gal';
    else if (cups >= 4 - 1e-9) displayUnit = 'qt';
    else if (cups >= 1 - 1e-9) displayUnit = 'cup';
    else {
      const tablespoons =
        numeric / SHOPPING_LIST_MEASURED_UNIT_META.tbsp.factor;
      if (tablespoons >= 1 - 1e-9) displayUnit = 'tbsp';
    }
    const unitMeta = SHOPPING_LIST_MEASURED_UNIT_META[displayUnit];
    const displayQuantity = roundShoppingListDisplayQuantity(
      numeric / unitMeta.factor,
      displayUnit,
    );
    if (!Number.isFinite(displayQuantity) || displayQuantity <= 0) return null;
    return {
      family,
      quantity: displayQuantity,
      unit: displayUnit,
    };
  }

  return null;
}

const INGREDIENT_BASE_VARIANT_NAME = 'default';
const INGREDIENT_RESERVED_VARIANT_NAMES = Object.freeze(
  new Set([INGREDIENT_BASE_VARIANT_NAME, 'base', 'any']),
);

function isIngredientBaseVariantName(rawVariant) {
  const normalized = String(rawVariant || '')
    .trim()
    .toLowerCase();
  return !normalized || normalized === INGREDIENT_BASE_VARIANT_NAME;
}

function normalizeNamedIngredientVariant(rawVariant) {
  const trimmed = String(rawVariant || '').trim();
  return isIngredientBaseVariantName(trimmed) ? '' : trimmed;
}

function isReservedIngredientVariantName(rawVariant) {
  const normalized = String(rawVariant || '')
    .trim()
    .toLowerCase();
  return normalized ? INGREDIENT_RESERVED_VARIANT_NAMES.has(normalized) : false;
}

function getIngredientBaseVariantWhereSql(columnSql = 'variant') {
  const escapedBaseVariant = INGREDIENT_BASE_VARIANT_NAME.replace(/'/g, "''");
  return `lower(trim(COALESCE(${columnSql}, ''))) IN ('', '${escapedBaseVariant}')`;
}

function getShoppingListIngredientLabel(name, variantName = '') {
  const displayFields = getShoppingListDisplayFields(name, variantName);
  const fallbackVariant =
    String(variantName || '').trim() &&
    String(variantName || '')
      .trim()
      .toLowerCase() !== 'default' &&
    !isShoppingListSizeVariant(variantName)
      ? variantName
      : '';
  const fallback = [
    String(fallbackVariant || '').trim(),
    String(name || '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  return displayFields.displayName || fallback;
}

function formatShoppingListIngredientText(line) {
  const source = line && typeof line === 'object' ? line : {};
  if (typeof window === 'undefined') {
    return String(source?.name || '').trim();
  }
  if (typeof window.formatIngredientText === 'function') {
    try {
      return String(window.formatIngredientText(source) || '').trim();
    } catch (_) {}
  }
  const fallbackName = [
    String(source.variant || '').trim(),
    String(source.name || '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const pieces = [
    String(source.quantity ?? '').trim(),
    String(source.size || '').trim(),
    String(source.unit || '').trim(),
    fallbackName,
  ].filter(Boolean);
  return pieces.join(' ').trim();
}

const SHOPPING_LIST_SIZE_VARIANT_TOKENS = Object.freeze(
  new Set([
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
  ]),
);

const SHOPPING_LIST_SINGULAR_UNIT_TOKENS = Object.freeze(
  new Set([
    'tsp',
    'tbsp',
    'cup',
    'fl oz',
    'oz',
    'lb',
    'pt',
    'qt',
    'gal',
    'ml',
    'l',
    'g',
    'kg',
    'can',
    'bag',
    'box',
    'carton',
    'package',
    'packet',
    'bottle',
    'jar',
    'container',
    'stick',
    'loaf',
  ]),
);

function formatShoppingListDisplayQuantity(quantity) {
  const numeric = Number(quantity);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  if (
    typeof window !== 'undefined' &&
    typeof window.decimalToFractionDisplay === 'function'
  ) {
    try {
      const formatted = window.decimalToFractionDisplay(numeric);
      if (formatted) return String(formatted).trim();
    } catch (_) {}
  }
  return formatShoppingPlanQuantity(numeric);
}

function isShoppingListSizeVariant(variantText) {
  const normalized = String(variantText || '')
    .trim()
    .toLowerCase();
  return normalized ? SHOPPING_LIST_SIZE_VARIANT_TOKENS.has(normalized) : false;
}

function getShoppingListDisplayFields(name, variantName = '') {
  const resolvedName = String(name || '').trim();
  const resolvedVariant = String(variantName || '').trim();
  const normalizedVariant = resolvedVariant.toLowerCase();
  const nameVariant =
    resolvedVariant &&
    normalizedVariant !== 'default' &&
    !isShoppingListSizeVariant(resolvedVariant)
      ? resolvedVariant
      : '';
  const quantitySizePrefix =
    resolvedVariant &&
    normalizedVariant !== 'default' &&
    isShoppingListSizeVariant(resolvedVariant)
      ? resolvedVariant
      : '';

  let displayName = '';
  if (
    typeof window !== 'undefined' &&
    typeof window.getIngredientDisplayCoreParts === 'function'
  ) {
    try {
      displayName = String(
        window.getIngredientDisplayCoreParts({
          name: resolvedName,
          variant: nameVariant,
        })?.nameText || '',
      ).trim();
    } catch (_) {}
  }
  if (!displayName) {
    displayName = [nameVariant, resolvedName].filter(Boolean).join(' ').trim();
  }

  return {
    displayName,
    quantitySizePrefix,
  };
}

function mergeShoppingListSizeText(prefix, sizeText = '') {
  return [String(prefix || '').trim(), String(sizeText || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function shouldUseShoppingListSingularUnit(unitText) {
  const normalizedUnit = normalizeShoppingListUnit(unitText);
  return normalizedUnit
    ? SHOPPING_LIST_SINGULAR_UNIT_TOKENS.has(normalizedUnit)
    : false;
}

function formatShoppingListAmountLeadText({
  quantity = '',
  size = '',
  unit = '',
} = {}) {
  const normalizedUnit = normalizeShoppingListUnit(unit);
  if (shouldUseShoppingListSingularUnit(normalizedUnit)) {
    const quantityText = formatShoppingListDisplayQuantity(quantity);
    return [quantityText, String(size || '').trim(), normalizedUnit]
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.getIngredientDisplayCoreParts === 'function'
  ) {
    try {
      return String(
        window.getIngredientDisplayCoreParts({
          quantity,
          size,
          unit,
          name: '',
          variant: '',
        })?.leadText || '',
      ).trim();
    } catch (_) {}
  }
  const quantityText = formatShoppingListDisplayQuantity(quantity);
  return [quantityText, String(size || '').trim(), String(unit || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function getShoppingListBucketSortPriority(bucket) {
  if (!bucket || typeof bucket !== 'object') return 99;
  if (bucket.kind === 'unspecified') return 0;
  if (bucket.kind === 'selected' || bucket.kind === 'count') return 1;
  return 2;
}

function formatShoppingListUnspecifiedLeadText({ size = '' } = {}) {
  return ['some', String(size || '').trim()].filter(Boolean).join(' ').trim();
}

function getShoppingListBucketLeadText(bucket, options = {}) {
  if (!bucket || typeof bucket !== 'object') return '';
  const quantitySizePrefix = String(options.quantitySizePrefix || '').trim();
  if (bucket.kind === 'selected') {
    return formatShoppingListAmountLeadText({
      quantity: bucket.quantity,
      size: quantitySizePrefix,
    });
  }
  if (bucket.kind === 'unspecified') {
    return formatShoppingListUnspecifiedLeadText({
      size: quantitySizePrefix,
    });
  }
  if (bucket.kind === 'measured') {
    const display = getShoppingListMeasuredDisplayFromBase(
      bucket.family,
      bucket.baseQuantity,
    );
    if (!display) return '';
    return formatShoppingListAmountLeadText({
      quantity: display.quantity,
      size: quantitySizePrefix,
      unit: display.unit,
    });
  }
  return formatShoppingListAmountLeadText({
    quantity: bucket.quantity,
    size: mergeShoppingListSizeText(quantitySizePrefix, bucket.size || ''),
    unit: bucket.unit || '',
  });
}

function formatShoppingListDisplayDetailText({
  variantName = '',
  buckets = [],
} = {}) {
  const displayFields = getShoppingListDisplayFields('', variantName);
  const list = Array.isArray(buckets) ? buckets.filter(Boolean) : [];
  if (!list.length) return '';
  return list
    .slice()
    .sort(
      (a, b) =>
        getShoppingListBucketSortPriority(a) -
        getShoppingListBucketSortPriority(b),
    )
    .map((bucket) =>
      getShoppingListBucketLeadText(bucket, {
        quantitySizePrefix: displayFields.quantitySizePrefix,
      }),
    )
    .filter(Boolean)
    .join(' + ');
}

function formatShoppingListDisplayRow({
  label = '',
  name = '',
  variantName = '',
  buckets = [],
} = {}) {
  const displayFields = getShoppingListDisplayFields(name, variantName);
  const resolvedLabel =
    String(label || '').trim() ||
    displayFields.displayName ||
    getShoppingListIngredientLabel(name, variantName);
  if (!resolvedLabel) return '';
  const detailText = formatShoppingListDisplayDetailText({
    variantName,
    buckets,
  });
  if (!detailText) return resolvedLabel;
  return `${resolvedLabel} (${detailText})`;
}

function getShoppingListPlanRowResolvedLabel(planRow) {
  if (!planRow || typeof planRow !== 'object') return '';
  const name = String(planRow.name || '').trim();
  const variantName = String(planRow.variantName || '').trim();
  const displayFields = getShoppingListDisplayFields(name, variantName);
  return (
    String(planRow.label || '').trim() ||
    displayFields.displayName ||
    getShoppingListIngredientLabel(name, variantName) ||
    ''
  );
}

function splitShoppingListRowTextToLabelAndDetail(text) {
  const src = String(text || '').trim();
  if (!src) return { label: '', detail: '' };
  const m = src.match(/^(.+?)\s+\(([^)]*)\)\s*$/);
  if (!m) {
    return { label: src, detail: '' };
  }
  return {
    label: String(m[1] || '').trim(),
    detail: String(m[2] || '').trim(),
  };
}

function joinShoppingListLabelAndDetail(label, detail) {
  const l = String(label || '').trim();
  const d = String(detail || '').trim();
  if (!l) return d;
  if (!d) return l;
  return `${l} (${d})`;
}

function shoppingListRowAmountDetailDivergedFromSource(row) {
  const sourceKey = String(row?.sourceKey || '').trim();
  const sourceText = String(row?.sourceText || '').trim();
  if (!sourceKey || !sourceText) return false;
  const currentText = String(row?.text || '').trim();
  const cur = splitShoppingListRowTextToLabelAndDetail(currentText);
  const src = splitShoppingListRowTextToLabelAndDetail(sourceText);
  if (cur.detail || src.detail) {
    return cur.detail !== src.detail;
  }
  return currentText !== sourceText;
}

if (typeof window !== 'undefined') {
  window.__shoppingListAmountHelpers = {
    normalizeShoppingListUnit,
    getShoppingListMeasuredUnitMeta,
    convertShoppingListQuantityToMeasuredBase,
    roundShoppingListDisplayQuantity,
    getShoppingListMeasuredDisplayFromBase,
    getShoppingListIngredientLabel,
    getShoppingListBucketLeadText,
    formatShoppingListDisplayDetailText,
    formatShoppingListDisplayRow,
  };
}
// --- End shopping list amount helpers ---

// --- Shopping browse labeling helpers (tests extract this block) ---
function normalizeShoppingBrowseLocationId(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  return !value || value === 'measures' ? 'none' : value;
}

function getShoppingBrowseVariantHomeRows(item) {
  const rows = Array.isArray(item?.variantHomeLocations)
    ? item.variantHomeLocations
    : [];
  const out = [];
  const byKey = new Map();
  rows.forEach((entry) => {
    const variant = String(entry?.variant || '').trim();
    if (!variant) return;
    const rowKey = variant.toLowerCase();
    const normalizedHome = normalizeShoppingBrowseLocationId(
      entry?.homeLocation,
    );
    const existing = byKey.get(rowKey);
    if (existing) {
      if (existing.homeLocation === 'none' && normalizedHome !== 'none') {
        existing.homeLocation = normalizedHome;
      }
      return;
    }
    const nextRow = { variant, homeLocation: normalizedHome };
    byKey.set(rowKey, nextRow);
    out.push(nextRow);
  });
  const baseHomeFallback = normalizeShoppingBrowseLocationId(
    item?.locationAtHome,
  );
  if (baseHomeFallback !== 'none') {
    out.forEach((row) => {
      if (row.homeLocation === 'none') {
        row.homeLocation = baseHomeFallback;
      }
    });
  }
  return out;
}

function getShoppingBrowseLocationIds(item) {
  const ids = [];
  const seen = new Set();
  const pushId = (rawId) => {
    const normalizedId = normalizeShoppingBrowseLocationId(rawId);
    if (seen.has(normalizedId)) return;
    seen.add(normalizedId);
    ids.push(normalizedId);
  };
  pushId(item?.locationAtHome);
  getShoppingBrowseVariantHomeRows(item).forEach((entry) =>
    pushId(entry.homeLocation),
  );
  return ids;
}

function getShoppingBrowseMatchInfo(item, options = {}) {
  const normalizedQuery = String(options?.searchQuery || '')
    .trim()
    .toLowerCase();
  const normalizedLocationIds = Array.from(
    new Set(
      (Array.isArray(options?.locationIds) ? options.locationIds : [])
        .map((value) => normalizeShoppingBrowseLocationId(value))
        .filter(Boolean),
    ),
  );
  const hasQuery = !!normalizedQuery;
  const hasLocationFilters = normalizedLocationIds.length > 0;
  if (!hasQuery && !hasLocationFilters) {
    return {
      baseMatched: false,
      matchedVariantNames: [],
      variantNameToShow: '',
    };
  }

  const baseName = String(item?.name || '')
    .trim()
    .toLowerCase();
  const baseLocationId = normalizeShoppingBrowseLocationId(
    item?.locationAtHome,
  );
  const baseMatched =
    (!hasQuery || baseName.includes(normalizedQuery)) &&
    (!hasLocationFilters || normalizedLocationIds.includes(baseLocationId));

  const matchedVariantNames = getShoppingBrowseVariantHomeRows(item)
    .filter((entry) => {
      const variantName = String(entry?.variant || '')
        .trim()
        .toLowerCase();
      if (!variantName) return false;
      const searchMatches = !hasQuery || variantName.includes(normalizedQuery);
      const locationMatches =
        !hasLocationFilters ||
        normalizedLocationIds.includes(
          normalizeShoppingBrowseLocationId(entry?.homeLocation),
        );
      return searchMatches && locationMatches;
    })
    .map((entry) => String(entry.variant || '').trim())
    .filter(Boolean);

  return {
    baseMatched,
    matchedVariantNames,
    variantNameToShow:
      !baseMatched && matchedVariantNames.length === 1
        ? matchedVariantNames[0]
        : '',
  };
}

function formatShoppingBrowseItemLabel(baseLabel, item, options = {}) {
  const resolvedBaseLabel =
    String(baseLabel || '').trim() || String(item?.name || '').trim();
  if (!resolvedBaseLabel) return '';
  const matchInfo = getShoppingBrowseMatchInfo(item, options);
  return matchInfo.variantNameToShow
    ? `${resolvedBaseLabel} (${matchInfo.variantNameToShow})`
    : resolvedBaseLabel;
}

if (typeof window !== 'undefined') {
  window.__shoppingBrowseLabelHelpers = {
    normalizeShoppingBrowseLocationId,
    getShoppingBrowseVariantHomeRows,
    getShoppingBrowseLocationIds,
    getShoppingBrowseMatchInfo,
    formatShoppingBrowseItemLabel,
  };
}
// --- End shopping browse labeling helpers ---

function tableHasColumnInMain(db, tableName, colName) {
  if (!db || !tableName || !colName) return false;
  try {
    const q = db.exec(`PRAGMA table_info(${tableName});`);
    const cols =
      Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
        ? q[0].values
            .map((r) =>
              String((Array.isArray(r) ? r[1] : '') || '').toLowerCase(),
            )
            .filter(Boolean)
        : [];
    return cols.includes(String(colName || '').toLowerCase());
  } catch (_) {
    return false;
  }
}

function dropLegacyVariantAisleUniqueIndexesInMain(db) {
  if (!db) return false;
  let changed = false;
  try {
    const listQ = db.exec(
      `PRAGMA index_list('ingredient_variant_store_location');`,
    );
    const rows =
      Array.isArray(listQ) && listQ.length > 0 && Array.isArray(listQ[0].values)
        ? listQ[0].values
        : [];
    rows.forEach((row) => {
      const indexName = String((Array.isArray(row) ? row[1] : '') || '').trim();
      const isUnique = Number(Array.isArray(row) ? row[2] : 0) === 1;
      if (!indexName || !isUnique) return;
      try {
        const infoQ = db.exec(
          `PRAGMA index_info(${JSON.stringify(indexName)});`,
        );
        const infoRows =
          Array.isArray(infoQ) &&
          infoQ.length > 0 &&
          Array.isArray(infoQ[0].values)
            ? infoQ[0].values
            : [];
        const cols = infoRows
          .map((infoRow) =>
            String((Array.isArray(infoRow) ? infoRow[2] : '') || '').trim(),
          )
          .filter(Boolean);
        if (cols.length === 1 && cols[0] === 'ingredient_variant_id') {
          db.run(`DROP INDEX IF EXISTS "${indexName.replace(/"/g, '""')}";`);
          changed = true;
        }
      } catch (_) {}
    });
  } catch (_) {}
  return changed;
}

function ensureRecipeTagsSchemaInMain(db) {
  if (!db) return false;
  try {
    db.run('PRAGMA foreign_keys = ON;');
  } catch (_) {}
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER,
        intended_use TEXT NOT NULL DEFAULT 'recipes'
      );
    `);
  } catch (_) {}
  try {
    if (!tableHasColumnInMain(db, 'tags', 'intended_use')) {
      db.run(
        "ALTER TABLE tags ADD COLUMN intended_use TEXT NOT NULL DEFAULT 'recipes';",
      );
    }
  } catch (_) {}
  try {
    db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_nocase
      ON tags(name COLLATE NOCASE);
    `);
  } catch (_) {}
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS recipe_tag_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL REFERENCES recipes(ID) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        sort_order INTEGER,
        UNIQUE(recipe_id, tag_id)
      );
    `);
  } catch (_) {}
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_recipe_tag_map_recipe
      ON recipe_tag_map(recipe_id, sort_order, id);
    `);
  } catch (_) {}
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_recipe_tag_map_tag
      ON recipe_tag_map(tag_id, recipe_id);
    `);
  } catch (_) {}
  return true;
}

function ensureIngredientVariantTagsSchemaInMain(db) {
  if (!db) return false;
  ensureRecipeTagsSchemaInMain(db);
  try {
    db.run('PRAGMA foreign_keys = ON;');
  } catch (_) {}
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS ingredient_variant_tag_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ingredient_variant_id INTEGER NOT NULL REFERENCES ingredient_variants(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        sort_order INTEGER,
        UNIQUE(ingredient_variant_id, tag_id)
      );
    `);
  } catch (_) {}
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_ingredient_variant_tag_map_variant
      ON ingredient_variant_tag_map(ingredient_variant_id, sort_order, id);
    `);
  } catch (_) {}
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_ingredient_variant_tag_map_tag
      ON ingredient_variant_tag_map(tag_id, ingredient_variant_id);
    `);
  } catch (_) {}
  ensureIngredientVariantIsDeprecatedColumnInMain(db);
  return true;
}

function ensureIngredientVariantIsDeprecatedColumnInMain(db) {
  if (!db) return false;
  try {
    if (!tableHasColumnInMain(db, 'ingredient_variants', 'ingredient_id')) {
      return false;
    }
    if (tableHasColumnInMain(db, 'ingredient_variants', 'is_deprecated')) {
      return false;
    }
    db.run(
      'ALTER TABLE ingredient_variants ADD COLUMN is_deprecated INTEGER NOT NULL DEFAULT 0;',
    );
    return true;
  } catch (_) {
    return false;
  }
}

function ensureSizesSchemaInMain(db) {
  if (!db) return false;
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS sizes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER,
        is_removed INTEGER NOT NULL DEFAULT 0
      );
    `);
  } catch (_) {}
  try {
    if (!tableHasColumnInMain(db, 'sizes', 'is_hidden')) {
      db.run(
        'ALTER TABLE sizes ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;',
      );
    }
  } catch (_) {}
  try {
    if (!tableHasColumnInMain(db, 'sizes', 'is_removed')) {
      db.run(
        'ALTER TABLE sizes ADD COLUMN is_removed INTEGER NOT NULL DEFAULT 0;',
      );
    }
  } catch (_) {}
  try {
    db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sizes_name_nocase
      ON sizes(name COLLATE NOCASE);
    `);
  } catch (_) {}
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_sizes_sort
      ON sizes(sort_order, name COLLATE NOCASE);
    `);
  } catch (_) {}
  return true;
}

function ensureUnitsSchemaInMain(db) {
  if (!db) return false;
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS units (
        code TEXT PRIMARY KEY,
        name_singular TEXT NOT NULL,
        name_plural TEXT NOT NULL,
        category TEXT NOT NULL,
        sort_order INTEGER,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        is_removed INTEGER NOT NULL DEFAULT 0
      );
    `);
  } catch (_) {}
  try {
    if (!tableHasColumnInMain(db, 'units', 'is_hidden')) {
      db.run(
        'ALTER TABLE units ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;',
      );
    }
  } catch (_) {}
  try {
    if (!tableHasColumnInMain(db, 'units', 'is_removed')) {
      db.run(
        'ALTER TABLE units ADD COLUMN is_removed INTEGER NOT NULL DEFAULT 0;',
      );
    }
  } catch (_) {}
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_units_sort
      ON units(sort_order, code COLLATE NOCASE);
    `);
  } catch (_) {}
  return true;
}

async function persistLoadedDbInMain(db, isElectron) {
  if (!db) return;
  await persistBinaryArrayInMain(db.export(), { isElectron });
}

async function persistBinaryArrayInMain(
  binaryArray,
  {
    isElectron = !!window.electronAPI,
    overwriteOnly = false,
    failureMessage = 'Failed to save database.',
  } = {},
) {
  if (isElectron) {
    const ok = await window.electronAPI.saveDB(binaryArray, { overwriteOnly });
    if (ok === false) throw new Error(failureMessage);
  } else {
    localStorage.setItem(
      'favoriteEatsDb',
      JSON.stringify(Array.from(binaryArray)),
    );
  }
}

async function loadFavoriteEatsDbBytesForCurrentRuntime({
  isElectron = !!window.electronAPI,
  pathHint = undefined,
} = {}) {
  if (isElectron) {
    const resolvedPathHint =
      pathHint === undefined
        ? localStorage.getItem('favoriteEatsDbPath') || null
        : pathHint;
    const bytes = await window.electronAPI.loadDB(resolvedPathHint);
    return new Uint8Array(bytes);
  }

  const browserBytes = await ensureFavoriteEatsDbBytesForWeb();
  if (browserBytes instanceof Uint8Array && browserBytes.length) {
    return browserBytes;
  }

  throw new Error(
    FAVORITE_EATS_BUILD.target === 'web'
      ? 'Bundled web database could not be loaded.'
      : 'No database loaded in browser storage.',
  );
}

async function openFavoriteEatsDbForCurrentRuntime(options = {}) {
  const bytes = await loadFavoriteEatsDbBytesForCurrentRuntime(options);
  return new SQL.Database(bytes);
}

async function persistDbForCurrentRuntime(db, options = {}) {
  if (!db) return;
  const binaryArray = db.export();
  await persistBinaryArrayInMain(binaryArray, options);
}

function ensureIngredientBaseVariantsInMain(db) {
  if (
    !db ||
    !tableHasColumnInMain(db, 'ingredient_variants', 'ingredient_id') ||
    !tableHasColumnInMain(db, 'ingredient_variants', 'variant')
  ) {
    return 0;
  }
  const hasHomeLocation = tableHasColumnInMain(
    db,
    'ingredient_variants',
    'home_location',
  );
  const hasSortOrder = tableHasColumnInMain(
    db,
    'ingredient_variants',
    'sort_order',
  );
  const hasLegacyHomeLocation = tableHasColumnInMain(
    db,
    'ingredients',
    'location_at_home',
  );
  let changedCount = 0;
  let txStarted = false;

  try {
    const ingredientQ = db.exec(
      `SELECT ID, ${
        hasLegacyHomeLocation ? "COALESCE(location_at_home, 'none')" : "'none'"
      } AS legacy_home
       FROM ingredients
       ORDER BY ID ASC;`,
    );
    const ingredientRows =
      Array.isArray(ingredientQ) &&
      ingredientQ.length &&
      Array.isArray(ingredientQ[0].values)
        ? ingredientQ[0].values
        : [];
    if (!ingredientRows.length) return 0;

    try {
      db.run('BEGIN IMMEDIATE;');
      txStarted = true;
    } catch (_) {
      db.run('BEGIN;');
      txStarted = true;
    }

    ingredientRows.forEach(([ingredientIdRaw, legacyHomeRaw]) => {
      const ingredientId = Number(ingredientIdRaw);
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) return;
      const clearLegacyHomeIfNeeded = () => {
        if (!hasLegacyHomeLocation || legacyHome === 'none') return false;
        db.run(
          `UPDATE ingredients
              SET location_at_home = 'none'
            WHERE ID = ?
              AND COALESCE(location_at_home, 'none') != 'none';`,
          [ingredientId],
        );
        return true;
      };

      const baseQ = db.exec(
        `SELECT id,
                COALESCE(variant, '') AS variant_name,
                ${hasHomeLocation ? "COALESCE(home_location, 'none')" : "'none'"} AS home_location,
                ${hasSortOrder ? 'COALESCE(sort_order, 999999)' : '0'} AS sort_order
           FROM ingredient_variants
          WHERE ingredient_id = ?
            AND ${getIngredientBaseVariantWhereSql('variant')}
          ORDER BY
            CASE
              WHEN lower(trim(COALESCE(variant, ''))) = '${INGREDIENT_BASE_VARIANT_NAME}'
                THEN 0
              ELSE 1
            END,
            ${hasSortOrder ? 'COALESCE(sort_order, 999999), ' : ''}id ASC
          LIMIT 1;`,
        [ingredientId],
      );
      const baseRow =
        Array.isArray(baseQ) &&
        baseQ.length &&
        Array.isArray(baseQ[0].values) &&
        baseQ[0].values.length
          ? baseQ[0].values[0]
          : null;
      const legacyHome = normalizeShoppingHomeLocationId(legacyHomeRaw);

      if (!baseRow) {
        const insertCols = ['ingredient_id', 'variant'];
        const insertVals = [ingredientId, INGREDIENT_BASE_VARIANT_NAME];
        if (hasSortOrder) {
          insertCols.push('sort_order');
          insertVals.push(0);
        }
        if (hasHomeLocation) {
          insertCols.push('home_location');
          insertVals.push(legacyHome);
        }
        const placeholders = insertCols.map(() => '?').join(', ');
        db.run(
          `INSERT INTO ingredient_variants (${insertCols.join(', ')}) VALUES (${placeholders});`,
          insertVals,
        );
        changedCount += clearLegacyHomeIfNeeded() ? 2 : 1;
        return;
      }

      const [baseIdRaw, baseVariantRaw, baseHomeRaw, baseSortOrderRaw] =
        baseRow;
      const baseId = Number(baseIdRaw);
      if (!Number.isFinite(baseId) || baseId <= 0) return;
      const currentHome = normalizeShoppingHomeLocationId(baseHomeRaw);
      const nextHome = currentHome !== 'none' ? currentHome : legacyHome;
      const sets = [];
      const vals = [];

      if (
        String(baseVariantRaw || '')
          .trim()
          .toLowerCase() !== INGREDIENT_BASE_VARIANT_NAME
      ) {
        sets.push('variant = ?');
        vals.push(INGREDIENT_BASE_VARIANT_NAME);
      }
      if (hasSortOrder && Number(baseSortOrderRaw) !== 0) {
        sets.push('sort_order = 0');
      }
      if (hasHomeLocation && nextHome !== currentHome) {
        sets.push('home_location = ?');
        vals.push(nextHome);
      }
      const legacyCleared = clearLegacyHomeIfNeeded();
      if (!sets.length && !legacyCleared) return;

      if (sets.length) {
        db.run(
          `UPDATE ingredient_variants SET ${sets.join(', ')} WHERE id = ?;`,
          [...vals, baseId],
        );
      }
      changedCount += legacyCleared ? 2 : 1;
    });

    if (txStarted) {
      db.run('COMMIT;');
      txStarted = false;
    }
    return changedCount;
  } catch (err) {
    if (txStarted) {
      try {
        db.run('ROLLBACK;');
      } catch (_) {}
    }
    throw err;
  }
}

/** Rows pointing at deleted ingredients block the global-unique aka column; remove them. */
function pruneOrphanedIngredientSynonymsInMain(db) {
  if (!db || typeof db.run !== 'function') return 0;
  if (
    !tableExistsForReconcile(db, 'ingredient_synonyms') ||
    !tableExistsForReconcile(db, 'ingredients')
  ) {
    return 0;
  }
  try {
    const cq = db.exec(
      `SELECT COUNT(*)
       FROM ingredient_synonyms syn
       WHERE NOT EXISTS (
         SELECT 1 FROM ingredients i WHERE i.ID = syn.ingredient_id
       );`,
    );
    const n =
      cq.length && cq[0].values && cq[0].values[0]
        ? Number(cq[0].values[0][0])
        : 0;
    if (!Number.isFinite(n) || n <= 0) return 0;
    db.run(
      `DELETE FROM ingredient_synonyms
       WHERE NOT EXISTS (
         SELECT 1 FROM ingredients i WHERE i.ID = ingredient_synonyms.ingredient_id
       );`,
    );
    return n;
  } catch (err) {
    console.warn('⚠️ Failed to prune orphaned ingredient_synonyms rows:', err);
    return 0;
  }
}

async function ensureIngredientLemmaMaintenanceInMain(db, isElectron) {
  if (!db) return 0;
  let synonymPruned = 0;
  try {
    synonymPruned = Number(pruneOrphanedIngredientSynonymsInMain(db)) || 0;
  } catch (err) {
    console.warn('⚠️ Failed to prune ingredient synonym orphans:', err);
    synonymPruned = 0;
  }
  let lemmaChangedCount = 0;
  let baseVariantChangedCount = 0;
  try {
    if (typeof window.bridge?.regenerateAllIngredientLemmas === 'function') {
      lemmaChangedCount =
        Number(window.bridge.regenerateAllIngredientLemmas(db)) || 0;
    }
  } catch (err) {
    console.warn('⚠️ Failed to regenerate ingredient lemmas:', err);
    lemmaChangedCount = 0;
  }
  try {
    baseVariantChangedCount =
      Number(ensureIngredientBaseVariantsInMain(db)) || 0;
  } catch (err) {
    console.warn('⚠️ Failed to repair ingredient base variants:', err);
    baseVariantChangedCount = 0;
  }
  const changedCount =
    (Number.isFinite(lemmaChangedCount) ? lemmaChangedCount : 0) +
    (Number.isFinite(baseVariantChangedCount) ? baseVariantChangedCount : 0) +
    (Number.isFinite(synonymPruned) && synonymPruned > 0 ? synonymPruned : 0);
  if (changedCount <= 0) return 0;
  try {
    await persistLoadedDbInMain(db, isElectron);
    if (lemmaChangedCount > 0) {
      console.info(
        `ℹ️ Regenerated ${lemmaChangedCount} ingredient lemma value(s).`,
      );
    }
    if (baseVariantChangedCount > 0) {
      console.info(
        `ℹ️ Repaired ${baseVariantChangedCount} ingredient base variant row(s).`,
      );
    }
    if (synonymPruned > 0) {
      console.info(
        `ℹ️ Removed ${synonymPruned} orphaned ingredient synonym row(s).`,
      );
    }
  } catch (err) {
    console.warn('⚠️ Failed to persist ingredient maintenance updates:', err);
  }
  return changedCount;
}

function deriveIngredientLemmaInMain(rawTitle) {
  if (typeof window.bridge?.deriveIngredientLemma === 'function') {
    return String(window.bridge.deriveIngredientLemma(rawTitle) || '').trim();
  }
  return String(rawTitle || '').trim();
}

const LAST_PAGE_SESSION_KEY = 'favoriteEats:last-page-id';
const SHOPPING_FILTER_CHIPS_SESSION_KEY_LEGACY =
  'favoriteEats:shopping-filter-chips';
const SHOPPING_FILTER_CHIPS_SESSION_KEY_PREFIX =
  'favoriteEats:shopping-filter-chips';
/** Prefix for Items-page tag filter chip ids (avoids collisions with home location ids). */
const SHOPPING_TAG_FILTER_PREFIX = 'tag:';
const SHOPPING_SCROLL_RESTORE_SESSION_KEY =
  'favoriteEats:shopping-scroll-restore-y';
const SHOPPING_ITEMS_SORT_SESSION_KEY = 'favoriteEats:shopping-items-sort:v1';
const SHOPPING_ITEMS_SORT_MODE_AZ = 'a-z';
const SHOPPING_ITEMS_SORT_MODE_LOCATION = 'location';
const ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY =
  'favoriteEats:items-browse-home-collapsed';
/** One-shot: scroll this aisle card into view after store editor loads. */
const STORE_EDITOR_FOCUS_AISLE_SESSION_KEY =
  'favoriteEats:store-editor-focus-aisle-id';
// --- Shopping plan helpers (tests extract this block) ---
const SHOPPING_PLAN_STORAGE_KEY = 'favoriteEats:shopping-plan:v1';
const SHOPPING_PLAN_KEY_SEP = '\x00';
/** When set, `itemSelections` keys use this prefix + `ingredient_variants.id` (stable across renames). */
const SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX = 'iv:';
let shoppingPlanCache = null;

function makeIngredientVariantShoppingPlanKey(ingredientVariantId) {
  const n = Math.trunc(Number(ingredientVariantId));
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX}${n}`;
}

function parseIngredientVariantIdFromShoppingPlanKey(key) {
  const s = String(key || '').trim();
  if (!s.startsWith(SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX)) return null;
  const n = Number(s.slice(SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function lookupIngredientVariantByIdForShoppingPlan(db, variantId) {
  if (!db || typeof db.exec !== 'function') return null;
  const id = Math.trunc(Number(variantId));
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const q = db.exec(
      `SELECT i.name, v.variant
         FROM ingredient_variants v
         JOIN ingredients i ON i.ID = v.ingredient_id
        WHERE v.id = ?
        LIMIT 1;`,
      [id],
    );
    if (q.length && q[0].values && q[0].values.length) {
      const [n, v] = q[0].values[0];
      return {
        name: String(n || '').trim(),
        variantName: String(v || '').trim(),
      };
    }
  } catch (_) {}
  return null;
}

/**
 * Prefer `iv:{id}` when `ingredient_variants` has a row for (ingredient, variant text).
 * Falls back to {@link getShoppingPlanAggregateKey} with a canonical base name.
 */
function resolvePersistedShoppingItemKeyForDb(db, name, variantName) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (!db || typeof db.exec !== 'function') {
    return getShoppingPlanAggregateKey(raw, variantName);
  }
  if (!tableExistsForReconcile(db, 'ingredient_variants')) {
    return getShoppingPlanAggregateKey(raw, variantName);
  }
  const row = lookupCanonicalIngredientNameForReconcile(
    db,
    normalizeShoppingIngredientNameKey(raw),
  );
  if (!row) {
    return getShoppingPlanAggregateKey(raw, variantName);
  }
  const v = String(variantName || '').trim();
  if (!v || isIngredientBaseVariantName(v) || isReservedIngredientVariantName(v)) {
    return getShoppingPlanAggregateKey(row.name, '');
  }
  try {
    const q = db.exec(
      `SELECT id FROM ingredient_variants
        WHERE ingredient_id = ?
          AND lower(trim(variant)) = lower(trim(?))
        LIMIT 1;`,
      [row.id, v],
    );
    if (q.length && q[0].values && q[0].values.length) {
      const vid = Number((q[0].values[0] && q[0].values[0][0]) || 0);
      if (Number.isFinite(vid) && vid > 0) {
        return makeIngredientVariantShoppingPlanKey(vid);
      }
    }
  } catch (_) {}
  return getShoppingPlanAggregateKey(row.name, v);
}

function loadRecipeWebServingsMap() {
  const api = window.favoriteEatsRecipeWebServings || {};
  if (typeof api.loadMap === 'function') return api.loadMap();
  try {
    const raw = localStorage.getItem(
      window.favoriteEatsStorageKeys.recipeWebServings,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (_) {
    return {};
  }
}

function getRecipeWebServingsStoredValue(recipeOrId, recipe = null) {
  const api = window.favoriteEatsRecipeWebServings || {};
  if (typeof api.getStoredValue === 'function') {
    const recipeModel =
      recipe && typeof recipe === 'object'
        ? recipe
        : recipeOrId && typeof recipeOrId === 'object'
          ? recipeOrId
          : null;
    const fallbackRecipeId =
      recipeModel == null ? Number(recipeOrId) : Number(recipeModel?.id);
    return api.getStoredValue(recipeModel, {
      fallbackRecipeId,
      scrubInvalid: true,
    });
  }
  const normalizedId = Number(recipeOrId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;
  const raw = loadRecipeWebServingsMap()[String(Math.trunc(normalizedId))];
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.round(numeric * 2) / 2
    : null;
}

function getShoppingPlanAggregateKey(name, variantName = '') {
  const normalizedName = String(name || '')
    .trim()
    .toLowerCase();
  const normalizedVariant = String(variantName || '')
    .trim()
    .toLowerCase();
  if (!normalizedName) return '';
  if (
    !normalizedVariant ||
    normalizedVariant === INGREDIENT_BASE_VARIANT_NAME
  ) {
    return normalizedName;
  }
  return `${normalizedName}${SHOPPING_PLAN_KEY_SEP}${normalizedVariant}`;
}

function formatShoppingPlanQuantity(quantity) {
  const numeric = Number(quantity);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return String(Number(numeric.toFixed(2)));
}

function normalizeShoppingPlanStoreIdList(rawStoreIds) {
  const out = [];
  const seen = new Set();
  (Array.isArray(rawStoreIds) ? rawStoreIds : []).forEach((rawId) => {
    const storeId = Math.trunc(Number(rawId));
    if (!Number.isFinite(storeId) || storeId <= 0 || seen.has(storeId)) return;
    seen.add(storeId);
    out.push(storeId);
  });
  return out;
}

function normalizeShoppingPlanStoreOrder(rawStoreOrder) {
  return normalizeShoppingPlanStoreIdList(rawStoreOrder);
}

function normalizeShoppingPlanSelectedStoreIds(rawSelectedStoreIds) {
  return normalizeShoppingPlanStoreIdList(rawSelectedStoreIds);
}

function createEmptyShoppingPlan() {
  return {
    version: 1,
    itemSelections: {},
    recipeSelections: {},
    storeOrder: [],
    selectedStoreIds: [],
  };
}

function normalizeShoppingPlan(rawPlan) {
  const source =
    rawPlan && typeof rawPlan === 'object' && !Array.isArray(rawPlan)
      ? rawPlan
      : {};
  const rawSelections =
    source.itemSelections &&
    typeof source.itemSelections === 'object' &&
    !Array.isArray(source.itemSelections)
      ? source.itemSelections
      : {};
  const rawRecipeSelections =
    source.recipeSelections &&
    typeof source.recipeSelections === 'object' &&
    !Array.isArray(source.recipeSelections)
      ? source.recipeSelections
      : {};
  const storeOrder = normalizeShoppingPlanStoreOrder(source.storeOrder);
  const selectedStoreIds = normalizeShoppingPlanSelectedStoreIds(
    source.selectedStoreIds,
  );
  const itemSelections = {};
  const recipeSelections = {};

  Object.keys(rawSelections).forEach((rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return;
    const rawEntry = rawSelections[rawKey];
    const entry =
      rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)
        ? rawEntry
        : {};
    const quantityRaw = Number(entry.quantity);
    if (!Number.isFinite(quantityRaw)) return;
    const quantity = Number(quantityRaw.toFixed(4));
    if (Math.abs(quantity) < 1e-9) return;
    const nextEntry = {
      key,
      name: String(entry.name || entry.itemName || '').trim(),
      variantName: String(entry.variantName || '').trim(),
      quantity,
    };
    const rawIv = Number(entry.ingredientVariantId);
    if (Number.isFinite(rawIv) && rawIv > 0) {
      nextEntry.ingredientVariantId = Math.trunc(rawIv);
    } else {
      const fromKey = parseIngredientVariantIdFromShoppingPlanKey(key);
      if (fromKey) {
        nextEntry.ingredientVariantId = fromKey;
      }
    }
    itemSelections[key] = nextEntry;
  });

  Object.keys(rawRecipeSelections).forEach((rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return;
    const rawEntry = rawRecipeSelections[rawKey];
    const entry =
      rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)
        ? rawEntry
        : {};
    const recipeId = Number(entry.recipeId != null ? entry.recipeId : key);
    const quantity = Math.max(0, Math.min(99, Number(entry.quantity || 0)));
    if (!Number.isFinite(recipeId) || recipeId <= 0) return;
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const normalizedKey = String(Math.trunc(recipeId));
    recipeSelections[normalizedKey] = {
      key: normalizedKey,
      recipeId: Math.trunc(recipeId),
      title: String(entry.title || entry.recipeTitle || '').trim(),
      quantity,
    };
  });

  return {
    version: 1,
    itemSelections,
    recipeSelections,
    storeOrder,
    selectedStoreIds,
  };
}

function loadShoppingPlanFromStorage() {
  if (shoppingPlanCache) return shoppingPlanCache;
  try {
    const raw = localStorage.getItem(SHOPPING_PLAN_STORAGE_KEY);
    if (!raw) {
      shoppingPlanCache = createEmptyShoppingPlan();
      return shoppingPlanCache;
    }
    shoppingPlanCache = normalizeShoppingPlan(JSON.parse(raw));
    return shoppingPlanCache;
  } catch (_) {
    shoppingPlanCache = createEmptyShoppingPlan();
    return shoppingPlanCache;
  }
}

function persistShoppingPlan(plan) {
  const normalized = normalizeShoppingPlan(plan);
  shoppingPlanCache = normalized;
  try {
    localStorage.setItem(SHOPPING_PLAN_STORAGE_KEY, JSON.stringify(normalized));
  } catch (_) {}
  return normalized;
}

function getShoppingPlan() {
  return loadShoppingPlanFromStorage();
}

function updateShoppingPlan(mutator) {
  const current = getShoppingPlan();
  let draft;
  try {
    draft = JSON.parse(JSON.stringify(current));
  } catch (_) {
    draft = createEmptyShoppingPlan();
  }
  if (typeof mutator === 'function') mutator(draft);
  return persistShoppingPlan(draft);
}

function getShoppingPlanStoreOrder() {
  return normalizeShoppingPlanStoreOrder(getShoppingPlan()?.storeOrder);
}

function setShoppingPlanStoreOrder(storeIds) {
  const normalizedStoreOrder = normalizeShoppingPlanStoreOrder(storeIds);
  return updateShoppingPlan((plan) => {
    plan.storeOrder = normalizedStoreOrder;
  });
}

function getShoppingPlanSelectedStoreIds() {
  return normalizeShoppingPlanSelectedStoreIds(
    getShoppingPlan()?.selectedStoreIds,
  );
}

function setShoppingPlanSelectedStoreIds(storeIds) {
  const normalizedSelectedStoreIds =
    normalizeShoppingPlanSelectedStoreIds(storeIds);
  return updateShoppingPlan((plan) => {
    plan.selectedStoreIds = normalizedSelectedStoreIds;
  });
}

if (typeof window !== 'undefined') {
  window.__shoppingPlanHelpers = {
    normalizeShoppingPlanStoreIdList,
    normalizeShoppingPlanStoreOrder,
    normalizeShoppingPlanSelectedStoreIds,
    createEmptyShoppingPlan,
    normalizeShoppingPlan,
    loadShoppingPlanFromStorage,
    persistShoppingPlan,
    getShoppingPlan,
    updateShoppingPlan,
    getShoppingPlanStoreOrder,
    setShoppingPlanStoreOrder,
    getShoppingPlanSelectedStoreIds,
    setShoppingPlanSelectedStoreIds,
  };
}
// --- End shopping plan helpers ---

function normalizeShoppingIngredientNameKey(rawName) {
  return String(rawName || '')
    .trim()
    .toLowerCase();
}

function normalizeShoppingMigrationVariantRow(raw) {
  const row = raw && typeof raw === 'object' ? raw : { value: raw };
  const value = normalizeNamedIngredientVariant(
    String(row.value != null ? row.value : raw || ''),
  ).trim();
  const variantId = Number(row.variantId);
  return {
    value,
    lower: value.toLowerCase(),
    variantId: Number.isFinite(variantId) && variantId > 0 ? variantId : null,
  };
}

function getShoppingMigrationVariantRows(rawRows) {
  return (Array.isArray(rawRows) ? rawRows : [])
    .map(normalizeShoppingMigrationVariantRow)
    .filter((row) => row.value);
}

function inferShoppingVariantRenames({
  prevNamedValues,
  nextNamedValues,
  prevNamedRows,
  nextNamedRows,
}) {
  const prevRows = getShoppingMigrationVariantRows(
    Array.isArray(prevNamedRows) ? prevNamedRows : prevNamedValues,
  );
  const nextRows = getShoppingMigrationVariantRows(
    Array.isArray(nextNamedRows) ? nextNamedRows : nextNamedValues,
  );
  const renames = [];
  const seenFrom = new Set();
  const nextByVariantId = new Map();
  nextRows.forEach((row) => {
    if (row.variantId) nextByVariantId.set(row.variantId, row);
  });

  prevRows.forEach((prevRow) => {
    if (!prevRow.variantId || seenFrom.has(prevRow.lower)) return;
    const nextRow = nextByVariantId.get(prevRow.variantId);
    if (!nextRow || !nextRow.lower || nextRow.lower === prevRow.lower) return;
    renames.push({
      from: prevRow.value,
      to: nextRow.value,
      fromVariantId: prevRow.variantId,
    });
    seenFrom.add(prevRow.lower);
  });

  const prevLow = new Set(prevRows.map((row) => row.lower));
  const nextLow = new Set(nextRows.map((row) => row.lower));
  const removed = prevRows.filter((row) => !nextLow.has(row.lower));
  const added = nextRows.filter((row) => !prevLow.has(row.lower));
  if (removed.length > 0 && removed.length === added.length) {
    removed.forEach((prevRow, index) => {
      if (seenFrom.has(prevRow.lower)) return;
      const nextRow = added[index];
      if (!nextRow) return;
      renames.push({
        from: prevRow.value,
        to: nextRow.value,
        fromVariantId: prevRow.variantId || null,
      });
      seenFrom.add(prevRow.lower);
    });
  }

  return renames;
}

function computePostRenameVariantLower(variantLower, variantRenames) {
  let v = String(variantLower || '').trim().toLowerCase();
  if (!v || v === INGREDIENT_BASE_VARIANT_NAME) return '';
  const ren = Array.isArray(variantRenames) ? variantRenames : [];
  for (let i = 0; i < ren.length; i += 1) {
    const from = String(ren[i]?.from || '')
      .trim()
      .toLowerCase();
    if (from && v === from) {
      v = String(ren[i]?.to || '').trim().toLowerCase();
      break;
    }
  }
  if (!v || v === INGREDIENT_BASE_VARIANT_NAME) return '';
  return v;
}

function newShoppingItemSelectionKey(newBase, variantLower, variantRenames) {
  const SEP = SHOPPING_PLAN_KEY_SEP;
  const vout = computePostRenameVariantLower(variantLower, variantRenames);
  if (!vout) return newBase;
  return `${newBase}${SEP}${vout}`;
}

function resolveVariantDisplayForSelection(
  variantLower,
  variantRenames,
  displayLookup,
) {
  const v = String(variantLower || '').trim().toLowerCase();
  if (!v || v === INGREDIENT_BASE_VARIANT_NAME) return '';
  if (displayLookup instanceof Map && displayLookup.has(v))
    return displayLookup.get(v);
  const ren = Array.isArray(variantRenames) ? variantRenames : [];
  for (let i = 0; i < ren.length; i += 1) {
    const to = String(ren[i]?.to || '').trim();
    if (to && to.toLowerCase() === v) return to;
  }
  return v;
}

function collectShoppingPlanEntriesToRewriteForIngredientIdentity({
  db,
  oldDisplayName,
  newDisplayName,
  prevNamedValues,
  nextNamedValues,
  prevNamedRows,
  nextNamedRows,
  hasVariantTable,
}) {
  const oldName = String(oldDisplayName || '').trim();
  const newName = String(newDisplayName || '').trim();
  const oldBase = normalizeShoppingIngredientNameKey(oldName);
  const newBase = normalizeShoppingIngredientNameKey(newName);
  if (!oldBase) return null;

  const variantRenames = hasVariantTable
    ? inferShoppingVariantRenames({
        prevNamedValues,
        nextNamedValues,
        prevNamedRows,
        nextNamedRows,
      })
    : [];
  const nextRows = getShoppingMigrationVariantRows(
    Array.isArray(nextNamedRows) ? nextNamedRows : nextNamedValues,
  );
  const nextByDraftVariantId = new Map();
  const nextByLower = new Map();
  nextRows.forEach((row) => {
    if (row.variantId) nextByDraftVariantId.set(row.variantId, row);
    if (row.lower && !nextByLower.has(row.lower)) nextByLower.set(row.lower, row);
  });
  const renameByFromLower = new Map();
  variantRenames.forEach((row) => {
    const fromLower = String(row?.from || '')
      .trim()
      .toLowerCase();
    const toLower = String(row?.to || '')
      .trim()
      .toLowerCase();
    if (fromLower && toLower) renameByFromLower.set(fromLower, toLower);
  });

  const displayLookup = new Map();
  nextRows.forEach((row) => {
    if (!row.value) return;
    displayLookup.set(row.lower, row.value);
  });

  const sep = SHOPPING_PLAN_KEY_SEP;
  const sel = getShoppingPlanItemSelections();
  const extract = [];
  Object.keys(sel).forEach((oldKey) => {
    if (!oldKey) return;
    const entry = sel[oldKey];
    if (!entry || typeof entry !== 'object') return;
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || Math.abs(quantity) < 1e-9) return;

    const idFromKey = parseIngredientVariantIdFromShoppingPlanKey(oldKey);
    if (idFromKey) {
      const entryBase = normalizeShoppingIngredientNameKey(entry.name);
      if (entryBase && entryBase !== oldBase) return;
      const entryVariantLower = normalizeNamedIngredientVariant(
        String(entry.variantName || ''),
      )
        .trim()
        .toLowerCase();
      const nextFromId = nextByDraftVariantId.get(idFromKey);
      const nextRow =
        nextFromId ||
        (entryVariantLower ? nextByLower.get(entryVariantLower) : null);
      if (!nextRow || !nextRow.lower) return;
      const nextVariantDisplay =
        displayLookup.get(nextRow.lower) || nextRow.value || nextRow.lower;
      const newKey = resolvePersistedShoppingItemKeyForDb(
        db,
        newName || oldName,
        nextVariantDisplay,
      );
      if (!newKey || newKey === oldKey) return;
      extract.push({
        oldKey,
        newKey,
        name: newName || oldName,
        variantName: nextVariantDisplay,
      });
      return;
    }

    if (oldKey !== oldBase && !oldKey.startsWith(oldBase + sep)) return;

    let vLower = '';
    if (oldKey.startsWith(oldBase + sep)) {
      const rest = oldKey.slice(oldBase.length + sep.length).toLowerCase();
      vLower = rest === INGREDIENT_BASE_VARIANT_NAME ? '' : rest;
    }
    const mappedLower =
      renameByFromLower.get(vLower) ||
      computePostRenameVariantLower(vLower, variantRenames);
    const vForDisplayLower = computePostRenameVariantLower(
      vLower,
      variantRenames,
    );
    const variantDisp = resolveVariantDisplayForSelection(
      vForDisplayLower,
      variantRenames,
      displayLookup,
    );
    const newKey =
      hasVariantTable && mappedLower
        ? resolvePersistedShoppingItemKeyForDb(db, newName, variantDisp)
        : newShoppingItemSelectionKey(newBase, vLower, variantRenames);
    if (!newKey) return;
    extract.push({
      oldKey,
      newKey,
      name: newName,
      variantName: variantDisp,
    });
  });

  return {
    oldBase,
    newBase,
    variantRenames,
    newName,
    extract,
  };
}

function patchShoppingListDocForRewrittenSelectionKeys({ db, extract }) {
  if (!Array.isArray(extract) || !extract.length) return;
  if (!db || typeof db.exec !== 'function') return;
  const rewrite = new Map(extract.map((e) => [e.oldKey, e]));
  const rawDoc = loadShoppingListDocFromStorage();
  if (!rawDoc || !Array.isArray(rawDoc.rows) || !rawDoc.rows.length) return;

  const genDoc = buildShoppingListDocFromPlanRows(
    getShoppingPlanSelectionRows({ db }),
  );
  const genByKey = new Map();
  genDoc.rows.forEach((row) => {
    const sk = String(row.sourceKey || '').trim();
    if (sk) genByKey.set(sk, row);
  });

  let changed = false;
  const nextRows = rawDoc.rows.map((rawRow) => {
    const row = normalizeShoppingListDocRow(rawRow, 0);
    if (!row) return rawRow;
    const sk = String(row.sourceKey || '').trim();
    if (!sk || !rewrite.has(sk)) return rawRow;
    const spec = rewrite.get(sk);
    const newSk = spec.newKey;
    const gen = genByKey.get(newSk);
    const next = { ...rawRow, sourceKey: newSk };
    if (newSk !== sk) changed = true;
    if (!row.userEdited && gen) {
      const t = String(gen.text || gen.label || '').trim();
      if (t) {
        if (String(rawRow.text || '').trim() !== t) changed = true;
        next.text = t;
        next.sourceText = t;
      }
    } else if (newSk !== sk) {
      changed = true;
    }
    return next;
  });

  if (changed) {
    persistShoppingListDoc(normalizeShoppingListDoc({ rows: nextRows }));
  }
}

/**
 * Re-sync persisted `itemSelections` (keys + name fields) with the current DB
 * (canonical ingredient names, synonyms, and variant text). Use when a rename
 * did not go through the shopping-item save migration, or to fix drift.
 */
function parseShoppingPlanItemSelectionKeyForReconcile(key) {
  const k = String(key || '');
  const sep = SHOPPING_PLAN_KEY_SEP;
  const idx = k.indexOf(sep);
  if (idx < 0) {
    return { baseLower: k.trim().toLowerCase(), variantPartLower: '' };
  }
  return {
    baseLower: k.slice(0, idx).trim().toLowerCase(),
    variantPartLower: k.slice(idx + sep.length).trim().toLowerCase(),
  };
}

function lookupCanonicalIngredientNameForReconcile(db, baseLower) {
  if (!db || typeof db.exec !== 'function' || !baseLower) return null;
  try {
    const q = db.exec(
      `SELECT i.ID, i.name FROM ingredients i
        WHERE lower(trim(i.name)) = lower(trim(?))
        LIMIT 1;`,
      [baseLower],
    );
    if (q.length && q[0].values && q[0].values.length) {
      const [id, name] = q[0].values[0];
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) {
        return { id: n, name: String(name || '').trim() };
      }
    }
  } catch (_) {}
  try {
    const q2 = db.exec(
      `SELECT i.ID, i.name
         FROM ingredient_synonyms s
         JOIN ingredients i ON i.ID = s.ingredient_id
        WHERE lower(trim(s.synonym)) = lower(trim(?))
        LIMIT 1;`,
      [baseLower],
    );
    if (q2.length && q2[0].values && q2[0].values.length) {
      const [id, name] = q2[0].values[0];
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) {
        return { id: n, name: String(name || '').trim() };
      }
    }
  } catch (_) {}
  return null;
}

function resolveVariantDisplayForReconcile(
  db,
  hasVariantTable,
  ingredientId,
  variantPartLower,
) {
  if (
    !variantPartLower ||
    variantPartLower === INGREDIENT_BASE_VARIANT_NAME ||
    variantPartLower === 'base' ||
    variantPartLower === 'any'
  ) {
    return '';
  }
  if (!hasVariantTable || !Number.isFinite(ingredientId) || ingredientId <= 0) {
    return String(variantPartLower || '').trim();
  }
  try {
    const q = db.exec(
      `SELECT variant FROM ingredient_variants
        WHERE ingredient_id = ?
          AND lower(trim(variant)) = lower(trim(?))
        LIMIT 1;`,
      [ingredientId, variantPartLower],
    );
    if (q.length && q[0].values && q[0].values.length) {
      return String((q[0].values[0] && q[0].values[0][0]) || '').trim();
    }
  } catch (_) {}
  return String(variantPartLower || '').trim();
}

function tableExistsForReconcile(db, table) {
  if (!db || typeof db.exec !== 'function' || !table) return false;
  try {
    const q = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ?;`,
      [table],
    );
    return !!(q.length && q[0].values && q[0].values.length);
  } catch (_) {
    return false;
  }
}

function reconcileShoppingPlanItemSelectionKeysWithDb(db) {
  if (!db || typeof db.exec !== 'function') return;
  const sel = getShoppingPlanItemSelections();
  const sourceKeys = Object.keys(sel);
  if (!sourceKeys.length) return;

  const hasVariantTable = tableExistsForReconcile(db, 'ingredient_variants');
  const hasSynTable = tableExistsForReconcile(db, 'ingredient_synonyms');
  const extract = [];
  const metaUpdates = new Map();
  const toRemove = [];

  const queueMeta = (k, name, variantName) => {
    if (!k) return;
    const nextName = String(name || '').trim();
    const nextVar = String(variantName || '').trim();
    const e = sel[k];
    if (!e || typeof e !== 'object') return;
    const sameName = String(e.name || '').trim() === nextName;
    const sameVar = String(e.variantName || '').trim() === nextVar;
    if (sameName && sameVar) return;
    metaUpdates.set(k, { name: nextName, variantName: nextVar });
  };

  sourceKeys.forEach((oldKey) => {
    if (!oldKey) return;
    const entry = sel[oldKey];
    if (!entry || typeof entry !== 'object') return;
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) return;

    const idFromKey = parseIngredientVariantIdFromShoppingPlanKey(oldKey);
    if (idFromKey) {
      const liv = lookupIngredientVariantByIdForShoppingPlan(db, idFromKey);
      if (!liv) {
        toRemove.push(oldKey);
        return;
      }
      const nextN = String(liv.name || '').trim();
      const nextV = String(liv.variantName || '').trim();
      const e = sel[oldKey];
      if (e) {
        const sameName = String(e.name || '').trim() === nextN;
        const sameVar = String(e.variantName || '').trim() === nextV;
        if (!sameName || !sameVar) {
          queueMeta(oldKey, nextN, nextV);
        }
      }
      return;
    }

    const { baseLower, variantPartLower } =
      parseShoppingPlanItemSelectionKeyForReconcile(oldKey);
    if (!baseLower) return;

    const row = hasSynTable
      ? lookupCanonicalIngredientNameForReconcile(db, baseLower)
      : (() => {
          try {
            const q = db.exec(
              `SELECT i.ID, i.name FROM ingredients i
                WHERE lower(trim(i.name)) = lower(trim(?))
                LIMIT 1;`,
              [baseLower],
            );
            if (q.length && q[0].values && q[0].values.length) {
              const [id, name] = q[0].values[0];
              const n = Number(id);
              if (Number.isFinite(n) && n > 0) {
                return { id: n, name: String(name || '').trim() };
              }
            }
          } catch (_) {}
          return null;
        })();
    if (!row) return;

    const variantDisplay = resolveVariantDisplayForReconcile(
      db,
      hasVariantTable,
      row.id,
      variantPartLower,
    );
    const preferIdKey =
      hasVariantTable &&
      String(variantPartLower || '').trim() &&
      !isIngredientBaseVariantName(variantPartLower) &&
      !isReservedIngredientVariantName(variantPartLower);
    let newKey;
    if (preferIdKey) {
      try {
        const qid = db.exec(
          `SELECT id FROM ingredient_variants
            WHERE ingredient_id = ?
              AND lower(trim(variant)) = lower(trim(?))
            LIMIT 1;`,
          [row.id, String(variantPartLower || '').trim()],
        );
        if (qid.length && qid[0].values && qid[0].values.length) {
          const rid = Number((qid[0].values[0] && qid[0].values[0][0]) || 0);
          if (Number.isFinite(rid) && rid > 0) {
            newKey = makeIngredientVariantShoppingPlanKey(rid);
          }
        }
      } catch (_) {}
    }
    if (!newKey) {
      newKey = getShoppingPlanAggregateKey(row.name, variantDisplay);
    }
    if (!newKey) return;

    if (newKey !== oldKey) {
      extract.push({
        oldKey,
        newKey,
        name: row.name,
        variantName: variantDisplay,
      });
    } else {
      queueMeta(newKey, row.name, variantDisplay);
    }
  });

  if (toRemove.length) {
    updateShoppingPlan((plan) => {
      if (!plan.itemSelections || typeof plan.itemSelections !== 'object') return;
      toRemove.forEach((k) => {
        if (k && Object.prototype.hasOwnProperty.call(plan.itemSelections, k)) {
          delete plan.itemSelections[k];
        }
      });
    });
    try {
      const fn = window.__favoriteEatsPruneShoppingBrowseSelectionKeys;
      if (typeof fn === 'function' && toRemove.length) fn(toRemove);
    } catch (err) {
      console.warn(
        'Failed to prune live shopping browse keys (reconcile removed iv)',
        err,
      );
    }
  }

  if (!extract.length && !metaUpdates.size) return;

  updateShoppingPlan((plan) => {
    if (!plan.itemSelections || typeof plan.itemSelections !== 'object') return;
    const sel2 = plan.itemSelections;

    if (extract.length) {
      const merged = new Map();
      extract.forEach((row) => {
        const live = sel2[row.oldKey];
        if (!live || typeof live !== 'object') return;
        const q = Number(live.quantity);
        if (!Number.isFinite(q) || Math.abs(q) < 1e-9) return;
        const prev = merged.get(row.newKey);
        const nextQty = Number((q + (prev ? prev.quantity : 0)).toFixed(4));
        const nIv = parseIngredientVariantIdFromShoppingPlanKey(row.newKey);
        const o = {
          key: row.newKey,
          name: row.name,
          variantName: row.variantName,
          quantity: nextQty,
        };
        if (nIv) o.ingredientVariantId = nIv;
        merged.set(row.newKey, o);
      });
      extract.forEach((row) => {
        if (Object.prototype.hasOwnProperty.call(sel2, row.oldKey)) {
          delete sel2[row.oldKey];
        }
      });
      merged.forEach((v) => {
        sel2[v.key] = { ...v };
      });
    }

    if (metaUpdates.size) {
      metaUpdates.forEach((meta, k) => {
        const live = sel2[k];
        if (!live || typeof live !== 'object') return;
        sel2[k] = {
          ...live,
          name: meta.name,
          variantName: meta.variantName,
        };
      });
    }
  });

  if (extract.length) {
    try {
      patchShoppingListDocForRewrittenSelectionKeys({ db, extract });
    } catch (err) {
      console.warn('Failed to patch shopping list doc (reconcile)', err);
    }
  }

  if (extract.length) {
    const browseRemaps = extract.map((row) => ({
      oldKey: row.oldKey,
      newKey: row.newKey,
      itemName: row.name,
      variantName: row.variantName,
    }));
    try {
      const fn = window.__favoriteEatsApplyShoppingBrowseSelectionKeyMap;
      if (typeof fn === 'function' && browseRemaps.length) fn(browseRemaps);
    } catch (err) {
      console.warn(
        'Failed to remap live shopping browse keys (reconcile)',
        err,
      );
    }
  }
}

/**
 * When a variant in `itemSelections` no longer exists in `ingredient_variants`,
 * remove that selection. Base ingredient must still resolve; unknown base is removed.
 */
function pruneOrphanShoppingItemSelectionsWithDb(db) {
  if (!db || typeof db.exec !== 'function') return;
  const hasVariantTable = tableExistsForReconcile(db, 'ingredient_variants');
  const hasSynTable = tableExistsForReconcile(db, 'ingredient_synonyms');
  const toRemove = [];

  Object.entries(getShoppingPlanItemSelections()).forEach(([oldKey, entry]) => {
    if (!oldKey || !entry || typeof entry !== 'object') return;
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) return;

    const idFromKey = parseIngredientVariantIdFromShoppingPlanKey(oldKey);
    if (idFromKey) {
      if (!hasVariantTable) {
        toRemove.push(oldKey);
        return;
      }
      try {
        const q = db.exec(
          'SELECT 1 FROM ingredient_variants WHERE id = ? LIMIT 1;',
          [idFromKey],
        );
        const ok = !!(q.length && q[0].values && q[0].values.length);
        if (!ok) {
          toRemove.push(oldKey);
        }
      } catch (_) {
        toRemove.push(oldKey);
      }
      return;
    }

    const { baseLower, variantPartLower } =
      parseShoppingPlanItemSelectionKeyForReconcile(oldKey);
    if (!baseLower) {
      toRemove.push(oldKey);
      return;
    }

    const row = hasSynTable
      ? lookupCanonicalIngredientNameForReconcile(db, baseLower)
      : (() => {
          try {
            const q = db.exec(
              `SELECT i.ID, i.name FROM ingredients i
                WHERE lower(trim(i.name)) = lower(trim(?))
                LIMIT 1;`,
              [baseLower],
            );
            if (q.length && q[0].values && q[0].values.length) {
              const [id, name] = q[0].values[0];
              const n = Number(id);
              if (Number.isFinite(n) && n > 0) {
                return { id: n, name: String(name || '').trim() };
              }
            }
          } catch (_) {}
          return null;
        })();
    if (!row) {
      toRemove.push(oldKey);
      return;
    }

    const v = String(variantPartLower || '').trim();
    if (!v || isIngredientBaseVariantName(v) || isReservedIngredientVariantName(v)) {
      return;
    }
    if (!hasVariantTable) {
      return;
    }
    try {
      const q = db.exec(
        `SELECT 1 FROM ingredient_variants
          WHERE ingredient_id = ?
            AND lower(trim(variant)) = lower(trim(?))
          LIMIT 1;`,
        [row.id, v],
      );
      const ok = !!(q.length && q[0].values && q[0].values.length);
      if (!ok) {
        toRemove.push(oldKey);
      }
    } catch (_) {
      toRemove.push(oldKey);
    }
  });

  if (!toRemove.length) return;

  updateShoppingPlan((plan) => {
    if (!plan.itemSelections || typeof plan.itemSelections !== 'object') return;
    toRemove.forEach((k) => {
      if (k && Object.prototype.hasOwnProperty.call(plan.itemSelections, k)) {
        delete plan.itemSelections[k];
      }
    });
  });

  try {
    const fn = window.__favoriteEatsPruneShoppingBrowseSelectionKeys;
    if (typeof fn === 'function' && toRemove.length) fn(toRemove);
  } catch (err) {
    console.warn('Failed to prune live shopping browse keys', err);
  }
}

function healShoppingListDocWithGeneratedFromPlan(db) {
  if (!db || typeof db.exec !== 'function') return;
  const stored = loadShoppingListDocFromStorage();
  const generated = buildShoppingListDocFromPlanRows(
    getShoppingPlanSelectionRows({ db }),
  );
  const merged = mergeShoppingListDocWithGenerated(stored, generated);
  persistShoppingListDoc(merged.doc);
}

function maintainShoppingPlanStorageWithDb(db) {
  if (!db || typeof db.exec !== 'function') return;
  try {
    reconcileShoppingPlanItemSelectionKeysWithDb(db);
  } catch (err) {
    console.warn('Shopping plan reconcile failed:', err);
  }
  try {
    pruneOrphanShoppingItemSelectionsWithDb(db);
  } catch (err) {
    console.warn('Shopping plan orphan prune failed:', err);
  }
  try {
    healShoppingListDocWithGeneratedFromPlan(db);
  } catch (err) {
    console.warn('Shopping list doc heal failed:', err);
  }
}

function migrateShoppingIdentityAfterIngredientEditorSave({
  db,
  oldDisplayName,
  newDisplayName,
  prevNamedValues,
  nextNamedValues,
  prevNamedRows,
  nextNamedRows,
  hasVariantTable,
}) {
  const ctx = collectShoppingPlanEntriesToRewriteForIngredientIdentity({
    db,
    oldDisplayName,
    newDisplayName,
    prevNamedValues,
    nextNamedValues,
    prevNamedRows,
    nextNamedRows,
    hasVariantTable,
  });
  if (!ctx) return;
  const { oldBase, newBase, variantRenames, extract } = ctx;
  if (oldBase === newBase && !variantRenames.length && !extract.length) return;

  const browseRemaps = [];
  if (extract.length) {
    updateShoppingPlan((plan) => {
      const sel = plan.itemSelections;
      if (!sel || typeof sel !== 'object') return;
      const merged = new Map();
      extract.forEach((row) => {
        const live = sel[row.oldKey];
        if (!live || typeof live !== 'object') return;
        const qty = Number(live.quantity);
        if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) return;
        const prev = merged.get(row.newKey);
        const nextQty = Number((qty + (prev ? prev.quantity : 0)).toFixed(4));
        const mIv = parseIngredientVariantIdFromShoppingPlanKey(row.newKey);
        const o = {
          key: row.newKey,
          name: row.name,
          variantName: row.variantName,
          quantity: nextQty,
        };
        if (mIv) o.ingredientVariantId = mIv;
        merged.set(row.newKey, o);
      });
      extract.forEach((row) => {
        if (Object.prototype.hasOwnProperty.call(sel, row.oldKey)) {
          delete sel[row.oldKey];
        }
      });
      merged.forEach((v) => {
        sel[v.key] = { ...v };
      });
    });

    extract.forEach((row) => {
      browseRemaps.push({
        oldKey: row.oldKey,
        newKey: row.newKey,
        itemName: row.name,
        variantName: row.variantName,
      });
    });

    try {
      patchShoppingListDocForRewrittenSelectionKeys({ db, extract });
    } catch (err) {
      console.warn('Failed to patch shopping list doc', err);
    }
  }

  try {
    const fn = window.__favoriteEatsApplyShoppingBrowseSelectionKeyMap;
    if (typeof fn === 'function' && browseRemaps.length) fn(browseRemaps);
  } catch (err) {
    console.warn('Failed to remap live shopping browse keys', err);
  }
}

function setShoppingPlanItemSelection({
  key,
  name = '',
  variantName = '',
  quantity = 0,
  ingredientVariantId: ingredientVariantIdArg = null,
}) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return getShoppingPlan();
  return updateShoppingPlan((plan) => {
    if (!plan.itemSelections || typeof plan.itemSelections !== 'object') {
      plan.itemSelections = {};
    }
    const nextQtyRaw = Number(quantity);
    if (!Number.isFinite(nextQtyRaw)) {
      delete plan.itemSelections[normalizedKey];
      return;
    }
    const nextQty = Number(nextQtyRaw.toFixed(4));
    if (Math.abs(nextQty) < 1e-9) {
      delete plan.itemSelections[normalizedKey];
      return;
    }
    const fromKeyId = parseIngredientVariantIdFromShoppingPlanKey(
      normalizedKey,
    );
    const nIv = Number(ingredientVariantIdArg);
    const ingredientVariantId =
      fromKeyId ||
      (Number.isFinite(nIv) && nIv > 0 ? Math.trunc(nIv) : null) ||
      null;
    const out = {
      key: normalizedKey,
      name: String(name || '').trim(),
      variantName: String(variantName || '').trim(),
      quantity: nextQty,
    };
    if (ingredientVariantId) {
      out.ingredientVariantId = ingredientVariantId;
    }
    plan.itemSelections[normalizedKey] = out;
  });
}

function getShoppingPlanItemSelections() {
  const plan = getShoppingPlan();
  return plan?.itemSelections && typeof plan.itemSelections === 'object'
    ? plan.itemSelections
    : {};
}

function setShoppingPlanRecipeSelection({
  recipeId,
  title = '',
  quantity = 0,
}) {
  const normalizedRecipeId = Number(recipeId);
  if (!Number.isFinite(normalizedRecipeId) || normalizedRecipeId <= 0) {
    return getShoppingPlan();
  }
  const normalizedKey = String(Math.trunc(normalizedRecipeId));
  return updateShoppingPlan((plan) => {
    if (!plan.recipeSelections || typeof plan.recipeSelections !== 'object') {
      plan.recipeSelections = {};
    }
    const nextQty = Math.max(0, Math.min(99, Number(quantity || 0)));
    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      delete plan.recipeSelections[normalizedKey];
      return;
    }
    plan.recipeSelections[normalizedKey] = {
      key: normalizedKey,
      recipeId: Math.trunc(normalizedRecipeId),
      title: String(title || '').trim(),
      quantity: nextQty,
    };
  });
}

function getShoppingPlanRecipeSelections() {
  const plan = getShoppingPlan();
  return plan?.recipeSelections && typeof plan.recipeSelections === 'object'
    ? plan.recipeSelections
    : {};
}

function clearShoppingPlanSelections({
  clearItems = false,
  clearRecipes = false,
} = {}) {
  return updateShoppingPlan((plan) => {
    if (clearItems) plan.itemSelections = {};
    if (clearRecipes) plan.recipeSelections = {};
  });
}

function getShoppingPlanSelectionLabel(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const name = String(entry.name || '').trim();
  const variantName = String(entry.variantName || '').trim();
  if (!name) return '';
  if (!variantName || variantName.toLowerCase() === 'default') return name;
  return `${name} (${variantName})`;
}

function getRecipeIngredientShoppingCount(line) {
  if (!line || typeof line !== 'object') return null;
  const qtyMax = Number(line.quantityMax);
  if (Number.isFinite(qtyMax) && qtyMax > 0) return qtyMax;
  const qtyMin = Number(line.quantityMin);
  if (Number.isFinite(qtyMin) && qtyMin > 0) return qtyMin;
  if (typeof parseNumericQuantityValue === 'function') {
    const parsed = parseNumericQuantityValue(line.quantity);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

const SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH = 2;

function loadShoppingPlanRecipeFromDB(db, recipeId) {
  if (
    !db ||
    typeof db.exec !== 'function' ||
    !window.bridge ||
    typeof window.bridge.loadRecipeFromDB !== 'function'
  ) {
    return null;
  }
  try {
    return window.bridge.loadRecipeFromDB(db, recipeId);
  } catch (_) {
    return null;
  }
}

function getRecipeServingsMultiplierForShoppingPlan(recipeId, recipe) {
  const recipeDefaultServings = Number(
    recipe?.servings?.default != null
      ? recipe.servings.default
      : recipe?.servingsDefault,
  );
  const selectedServings = getRecipeWebServingsStoredValue(recipeId, recipe);
  if (
    Number.isFinite(recipeDefaultServings) &&
    recipeDefaultServings > 0 &&
    Number.isFinite(selectedServings) &&
    selectedServings > 0
  ) {
    return selectedServings / recipeDefaultServings;
  }
  return 1;
}

function walkExpandedShoppingPlanIngredientLines(
  db,
  recipe,
  {
    recipeId = null,
    recipeTitle = '',
    outerRecipeMultiplier = 1,
    linkDepth = 0,
    ancestorRecipeIds = null,
  } = {},
  visit,
) {
  if (
    !db ||
    typeof db.exec !== 'function' ||
    !recipe ||
    !Array.isArray(recipe.sections) ||
    typeof visit !== 'function'
  ) {
    return;
  }

  const normalizedRecipeId = Math.trunc(Number(recipeId));
  const normalizedRecipeTitle = String(recipeTitle || '').trim();
  const normalizedOuterMultiplier = Number(outerRecipeMultiplier);
  const normalizedLinkDepth = Math.max(0, Math.trunc(Number(linkDepth) || 0));
  if (
    !Number.isFinite(normalizedOuterMultiplier) ||
    normalizedOuterMultiplier <= 0
  ) {
    return;
  }

  const nextAncestors =
    ancestorRecipeIds instanceof Set ? new Set(ancestorRecipeIds) : new Set();
  if (Number.isFinite(normalizedRecipeId) && normalizedRecipeId > 0) {
    nextAncestors.add(normalizedRecipeId);
  }

  const servingsMultiplier = getRecipeServingsMultiplierForShoppingPlan(
    normalizedRecipeId,
    recipe,
  );

  recipe.sections.forEach((section) => {
    const ingredients = Array.isArray(section?.ingredients)
      ? section.ingredients
      : [];
    ingredients.forEach((line) => {
      if (!line || line.rowType === 'heading') return;

      const linkedRecipeId = Math.trunc(Number(line.linkedRecipeId));
      if (line.isRecipe) {
        if (
          !Number.isFinite(linkedRecipeId) ||
          linkedRecipeId <= 0 ||
          normalizedLinkDepth >= SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH ||
          nextAncestors.has(linkedRecipeId)
        ) {
          return;
        }

        const linkedRecipe = loadShoppingPlanRecipeFromDB(db, linkedRecipeId);
        if (!linkedRecipe || !Array.isArray(linkedRecipe.sections)) return;

        const linkQuantity = getRecipeIngredientShoppingCount(line);
        const normalizedLinkQuantity =
          Number.isFinite(linkQuantity) && linkQuantity > 0 ? linkQuantity : 1;

        walkExpandedShoppingPlanIngredientLines(
          db,
          linkedRecipe,
          {
            recipeId: linkedRecipeId,
            recipeTitle: String(linkedRecipe?.title || '').trim(),
            outerRecipeMultiplier:
              normalizedOuterMultiplier *
              servingsMultiplier *
              normalizedLinkQuantity,
            linkDepth: normalizedLinkDepth + 1,
            ancestorRecipeIds: nextAncestors,
          },
          visit,
        );
        return;
      }

      visit(line, {
        recipeId:
          Number.isFinite(normalizedRecipeId) && normalizedRecipeId > 0
            ? normalizedRecipeId
            : null,
        recipeTitle: normalizedRecipeTitle,
        recipeCount: normalizedOuterMultiplier,
        servingsMultiplier,
      });
    });
  });
}

function getRecipeDerivedShoppingPlanRows({ db = window.dbInstance } = {}) {
  if (!db || typeof db.exec !== 'function') return [];
  const aggregate = new Map();

  Object.values(getShoppingPlanRecipeSelections()).forEach((selection) => {
    const recipeId = Number(selection?.recipeId);
    const recipeCount = Number(selection?.quantity || 0);
    if (!Number.isFinite(recipeId) || recipeId <= 0) return;
    if (!Number.isFinite(recipeCount) || recipeCount <= 0) return;

    const recipe = loadShoppingPlanRecipeFromDB(db, recipeId);
    if (!recipe || !Array.isArray(recipe.sections)) return;

    walkExpandedShoppingPlanIngredientLines(
      db,
      recipe,
      {
        recipeId,
        recipeTitle: String(recipe?.title || '').trim(),
        outerRecipeMultiplier: recipeCount,
        linkDepth: 0,
      },
      (
        line,
        { recipeCount: expandedRecipeCount = 0, servingsMultiplier = 1 } = {},
      ) => {
        const name = String(line.name || '').trim();
        if (!name) return;
        const variantName = String(line.variant || '').trim();
        const key = resolvePersistedShoppingItemKeyForDb(db, name, variantName);
        if (!key) return;
        const ingredientCount = getRecipeIngredientShoppingCount(line);
        if (!Number.isFinite(ingredientCount) || ingredientCount <= 0) return;
        const scaledPerRecipeQuantityRaw = ingredientCount * servingsMultiplier;
        const scaledPerRecipeQuantity =
          Math.abs(servingsMultiplier - 1) > 1e-9 &&
          typeof window.normalizeActionableQuantity === 'function'
            ? Number(
                window.normalizeActionableQuantity(
                  scaledPerRecipeQuantityRaw,
                  line.unit || '',
                ),
              )
            : Number(scaledPerRecipeQuantityRaw.toFixed(4));
        if (
          !Number.isFinite(scaledPerRecipeQuantity) ||
          scaledPerRecipeQuantity <= 0
        ) {
          return;
        }
        const nextQuantity = scaledPerRecipeQuantity * expandedRecipeCount;
        const existing = aggregate.get(key);
        if (existing) {
          existing.quantity += nextQuantity;
          return;
        }
        aggregate.set(key, {
          key,
          name,
          variantName,
          label: getShoppingPlanSelectionLabel({ name, variantName }),
          quantity: nextQuantity,
        });
      },
    );
  });

  return Array.from(aggregate.values());
}

// --- Shopping list grouping helpers (tests extract this block) ---
const SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME = 'default';
function orderShoppingListSelectedStoreIds(storeOrder, selectedStoreIds) {
  const normalizedStoreOrder = Array.isArray(storeOrder) ? storeOrder : [];
  const normalizedSelectedStoreIds = Array.isArray(selectedStoreIds)
    ? selectedStoreIds
    : [];
  const selectedSet = new Set();
  normalizedSelectedStoreIds.forEach((rawId) => {
    const storeId = Math.trunc(Number(rawId));
    if (!Number.isFinite(storeId) || storeId <= 0) return;
    selectedSet.add(storeId);
  });
  if (!selectedSet.size) return [];
  const ordered = [];
  normalizedStoreOrder.forEach((rawId) => {
    const storeId = Math.trunc(Number(rawId));
    if (!selectedSet.has(storeId)) return;
    ordered.push(storeId);
    selectedSet.delete(storeId);
  });
  normalizedSelectedStoreIds.forEach((rawId) => {
    const storeId = Math.trunc(Number(rawId));
    if (!selectedSet.has(storeId)) return;
    ordered.push(storeId);
    selectedSet.delete(storeId);
  });
  return ordered;
}

function compareShoppingListAssignmentCandidates(a, b) {
  const variantRankA = Number(a?.variantRank);
  const variantRankB = Number(b?.variantRank);
  const normalizedVariantRankA = Number.isFinite(variantRankA)
    ? variantRankA
    : -1;
  const normalizedVariantRankB = Number.isFinite(variantRankB)
    ? variantRankB
    : -1;
  if (normalizedVariantRankA !== normalizedVariantRankB) {
    return normalizedVariantRankA - normalizedVariantRankB;
  }
  const aisleSortA = Number(a?.aisleSortOrder);
  const aisleSortB = Number(b?.aisleSortOrder);
  const normalizedAisleSortA = Number.isFinite(aisleSortA)
    ? aisleSortA
    : 999999;
  const normalizedAisleSortB = Number.isFinite(aisleSortB)
    ? aisleSortB
    : 999999;
  if (normalizedAisleSortA !== normalizedAisleSortB) {
    return normalizedAisleSortA - normalizedAisleSortB;
  }
  const aisleIdA = Math.trunc(Number(a?.aisleId));
  const aisleIdB = Math.trunc(Number(b?.aisleId));
  if (
    Number.isFinite(aisleIdA) &&
    Number.isFinite(aisleIdB) &&
    aisleIdA !== aisleIdB
  ) {
    return aisleIdA - aisleIdB;
  }
  return String(a?.aisleLabel || '').localeCompare(
    String(b?.aisleLabel || ''),
    undefined,
    {
      sensitivity: 'base',
    },
  );
}

function chooseShoppingListAssignment(candidates, orderedSelectedStoreIds) {
  const candidateList = Array.isArray(candidates) ? candidates : [];
  const orderedStoreIds = Array.isArray(orderedSelectedStoreIds)
    ? orderedSelectedStoreIds
    : [];
  if (!candidateList.length || !orderedStoreIds.length) return null;
  for (const rawStoreId of orderedStoreIds) {
    const storeId = Math.trunc(Number(rawStoreId));
    if (!Number.isFinite(storeId) || storeId <= 0) continue;
    const matches = candidateList
      .filter((candidate) => Math.trunc(Number(candidate?.storeId)) === storeId)
      .sort(compareShoppingListAssignmentCandidates);
    if (matches.length) return matches[0];
  }
  return null;
}

function getShoppingListVariantAssignmentKey(name, variantName = '') {
  if (typeof getShoppingPlanAggregateKey === 'function') {
    return getShoppingPlanAggregateKey(name, variantName);
  }
  const normalizedName = String(name || '')
    .trim()
    .toLowerCase();
  const normalizedVariant = String(variantName || '')
    .trim()
    .toLowerCase();
  if (!normalizedName) return '';
  if (
    !normalizedVariant ||
    normalizedVariant === SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME
  )
    return normalizedName;
  return `${normalizedName}\x00${normalizedVariant}`;
}

function mergeShoppingListAssignmentCandidates(...candidateLists) {
  const merged = [];
  const seen = new Map();
  candidateLists.forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      const storeId = Math.trunc(Number(candidate.storeId));
      const aisleId = Math.trunc(Number(candidate.aisleId));
      const aisleLabel = String(candidate.aisleLabel || '').trim();
      const dedupeKey =
        Number.isFinite(storeId) &&
        storeId > 0 &&
        Number.isFinite(aisleId) &&
        aisleId > 0
          ? `${storeId}:${aisleId}`
          : `${storeId}:${aisleId}:${aisleLabel.toLowerCase()}`;
      if (seen.has(dedupeKey)) {
        const existingIndex = seen.get(dedupeKey);
        const existingCandidate = merged[existingIndex];
        if (
          compareShoppingListAssignmentCandidates(
            candidate,
            existingCandidate,
          ) < 0
        ) {
          merged[existingIndex] = candidate;
        }
        return;
      }
      seen.set(dedupeKey, merged.length);
      merged.push(candidate);
    });
  });
  return merged;
}

function buildOrderedVariantAssignmentCandidates(
  name,
  { variantAssignmentMap = null, variantOrderMap = null } = {},
) {
  const hasGetter = (value) => !!value && typeof value.get === 'function';
  const nameKey = String(name || '')
    .trim()
    .toLowerCase();
  if (
    !nameKey ||
    !hasGetter(variantAssignmentMap) ||
    !hasGetter(variantOrderMap)
  ) {
    return [];
  }
  const orderedVariants = Array.isArray(variantOrderMap.get(nameKey))
    ? variantOrderMap.get(nameKey)
    : [];
  if (!orderedVariants.length) return [];
  const rankedCandidates = [];
  orderedVariants.forEach((variantName, variantRank) => {
    const assignmentKey = getShoppingListVariantAssignmentKey(
      nameKey,
      variantName,
    );
    if (!assignmentKey) return;
    const variantCandidates = variantAssignmentMap.get(assignmentKey) || [];
    variantCandidates.forEach((candidate) => {
      rankedCandidates.push({
        ...candidate,
        variantRank,
      });
    });
  });
  return mergeShoppingListAssignmentCandidates(rankedCandidates);
}

function getShoppingListAssignmentCandidates(
  row,
  {
    baseAssignmentMap = null,
    variantAssignmentMap = null,
    variantAnyAssignmentMap = null,
    variantOrderMap = null,
  } = {},
) {
  const hasGetter = (value) => !!value && typeof value.get === 'function';
  const nameKey = String(row?.name || '')
    .trim()
    .toLowerCase();
  const variantName = String(row?.variantName || '').trim();
  const variantAssignmentKey = variantName
    ? getShoppingListVariantAssignmentKey(row.name, variantName)
    : '';
  const exactVariantCandidates =
    variantAssignmentKey && hasGetter(variantAssignmentMap)
      ? variantAssignmentMap.get(variantAssignmentKey) || []
      : [];
  if (exactVariantCandidates.length) return exactVariantCandidates;
  const baseCandidates =
    nameKey && hasGetter(baseAssignmentMap)
      ? baseAssignmentMap.get(nameKey) || []
      : [];
  if (!variantName && baseCandidates.length) return baseCandidates;
  const orderedVariantCandidates =
    !variantName && nameKey
      ? buildOrderedVariantAssignmentCandidates(nameKey, {
          variantAssignmentMap,
          variantOrderMap,
        })
      : [];
  if (orderedVariantCandidates.length) return orderedVariantCandidates;
  const anyVariantCandidates =
    nameKey && hasGetter(variantAnyAssignmentMap)
      ? variantAnyAssignmentMap.get(nameKey) || []
      : [];
  return mergeShoppingListAssignmentCandidates(
    baseCandidates,
    anyVariantCandidates,
  );
}

function buildGroupedShoppingListRows(items, options = {}) {
  const itemList = Array.isArray(items) ? items : [];
  const selectedStores = Array.isArray(options?.selectedStores)
    ? options.selectedStores
    : [];
  const unlistedLabel =
    String(options?.unlistedLabel || 'UNLISTED').trim() || 'UNLISTED';
  const storeIdsInOrder = selectedStores
    .map((store) => Math.trunc(Number(store?.id)))
    .filter((storeId) => Number.isFinite(storeId) && storeId > 0);
  const storeGroups = new Map(
    storeIdsInOrder.map((storeId) => [
      storeId,
      {
        aisles: new Map(),
      },
    ]),
  );
  const unlistedItems = [];

  itemList.forEach((item) => {
    if (!item || String(item.text || '').trim() === '') return;
    const chosenAssignment = chooseShoppingListAssignment(
      item.assignmentCandidates,
      storeIdsInOrder,
    );
    if (!chosenAssignment) {
      unlistedItems.push(item);
      return;
    }
    const storeId = Math.trunc(Number(chosenAssignment.storeId));
    const aisleId = Math.trunc(Number(chosenAssignment.aisleId));
    const storeGroup = storeGroups.get(storeId);
    if (!storeGroup || !Number.isFinite(aisleId) || aisleId <= 0) {
      unlistedItems.push(item);
      return;
    }
    const incomingSort = Number.isFinite(
      Number(chosenAssignment.aisleSortOrder),
    )
      ? Number(chosenAssignment.aisleSortOrder)
      : 999999;
    if (!storeGroup.aisles.has(aisleId)) {
      storeGroup.aisles.set(aisleId, {
        aisleId,
        aisleLabel:
          String(chosenAssignment.aisleLabel || '').trim() ||
          `Aisle ${aisleId}`,
        aisleSortOrder: incomingSort,
        items: [],
      });
    } else {
      const bucket = storeGroup.aisles.get(aisleId);
      const curSort = bucket.aisleSortOrder;
      const curPlaceholder = !Number.isFinite(curSort) || curSort >= 999999;
      const incomingPlaceholder =
        !Number.isFinite(incomingSort) || incomingSort >= 999999;
      const preferIncoming =
        incomingSort < curSort || (curPlaceholder && !incomingPlaceholder);
      if (preferIncoming) {
        bucket.aisleSortOrder = incomingSort;
        bucket.aisleLabel =
          String(chosenAssignment.aisleLabel || '').trim() ||
          `Aisle ${aisleId}`;
      }
    }
    storeGroup.aisles.get(aisleId).items.push(item);
  });

  const compareItems = (a, b) =>
    String(a?.label || '').localeCompare(String(b?.label || ''), undefined, {
      sensitivity: 'base',
    });

  const rows = [];
  selectedStores.forEach((store) => {
    const storeId = Math.trunc(Number(store?.id));
    const storeGroup = storeGroups.get(storeId);
    if (!storeGroup || !storeGroup.aisles.size) return;
    rows.push({
      key: `section:store:${storeId}`,
      rowType: 'section',
      sectionKind: 'store',
      storeId,
      text: String(store?.label || '').trim() || `Store ${storeId}`,
      className: 'shopping-list-section shopping-list-section--store',
    });
    const aisles = Array.from(storeGroup.aisles.values()).sort((a, b) =>
      compareShoppingListAssignmentCandidates(a, b),
    );
    aisles.forEach((aisle) => {
      rows.push({
        key: `section:aisle:${storeId}:${aisle.aisleId}`,
        rowType: 'section',
        sectionKind: 'aisle',
        storeId,
        aisleId: aisle.aisleId,
        aisleSortOrder: aisle.aisleSortOrder,
        text: aisle.aisleLabel,
        className: 'shopping-list-section shopping-list-section--aisle',
      });
      aisle.items.sort(compareItems).forEach((item) => {
        rows.push({
          ...item,
          rowType: 'item',
          className: 'shopping-list-group-item',
        });
      });
    });
  });

  if (unlistedItems.length) {
    rows.push({
      key: 'section:unlisted',
      rowType: 'section',
      sectionKind: 'unlisted',
      text: unlistedLabel,
      className: 'shopping-list-section shopping-list-section--unlisted',
    });
    unlistedItems.sort(compareItems).forEach((item) => {
      rows.push({
        ...item,
        rowType: 'item',
        className: 'shopping-list-group-item',
      });
    });
  }

  return rows;
}

if (typeof window !== 'undefined') {
  window.__shoppingListGroupingHelpers = {
    orderShoppingListSelectedStoreIds,
    compareShoppingListAssignmentCandidates,
    chooseShoppingListAssignment,
    getShoppingListVariantAssignmentKey,
    mergeShoppingListAssignmentCandidates,
    buildOrderedVariantAssignmentCandidates,
    getShoppingListAssignmentCandidates,
    buildGroupedShoppingListRows,
  };
}
// --- End shopping list grouping helpers ---

/**
 * True when `variantText` matches an ingredient_variants row for `ingredientName`
 * (direct name or synonym) and that row is soft-deprecated.
 */
function ingredientScopedVariantIsDeprecated(db, ingredientName, variantText) {
  const n = String(ingredientName || '').trim();
  const v = String(variantText || '').trim();
  if (!db || typeof db.exec !== 'function' || !n || !v) return false;
  if (v.toLowerCase() === 'default') return false;

  let hasVariantTable = false;
  try {
    const t = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='ingredient_variants';`,
    );
    hasVariantTable = !!(t?.length && t[0]?.values?.length);
  } catch (_) {
    return false;
  }
  if (!hasVariantTable) return false;

  const pragmaHasColumn = (table, col) => {
    try {
      const pc = db.exec(`PRAGMA table_info(${table});`);
      const vals = pc?.[0]?.values || [];
      const needle = String(col || '').toLowerCase();
      return vals.some(
        (row) =>
          Array.isArray(row) && String(row[1] || '').toLowerCase() === needle,
      );
    } catch (_) {
      return false;
    }
  };

  if (!pragmaHasColumn('ingredient_variants', 'is_deprecated')) return false;

  const ingHasDeprecated = pragmaHasColumn('ingredients', 'is_deprecated');
  const ingHasHide = pragmaHasColumn('ingredients', 'hide_from_shopping_list');
  const ingVisibilityClause = ingHasDeprecated
    ? `AND COALESCE(i.is_deprecated, 0) = 0`
    : ingHasHide
      ? `AND COALESCE(i.hide_from_shopping_list, 0) = 0`
      : ``;

  const canonicalIds = [];
  const seen = new Set();
  const pushIds = (result) => {
    const rows = result?.[0]?.values || [];
    rows.forEach((row) => {
      const id = Number(Array.isArray(row) ? row[0] : NaN);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
      seen.add(id);
      canonicalIds.push(id);
    });
  };

  try {
    pushIds(
      db.exec(
        `SELECT i.ID
           FROM ingredients i
          WHERE lower(trim(i.name)) = lower(trim(?))
            ${ingVisibilityClause}
          ORDER BY i.ID ASC;`,
        [n],
      ),
    );
    pushIds(
      db.exec(
        `SELECT i.ID
           FROM ingredient_synonyms s
           JOIN ingredients i ON i.ID = s.ingredient_id
          WHERE lower(trim(s.synonym)) = lower(trim(?))
            ${ingVisibilityClause}
          ORDER BY i.ID ASC;`,
        [n],
      ),
    );
  } catch (_) {
    return false;
  }

  if (!canonicalIds.length) return false;
  const ph = canonicalIds.map(() => '?').join(',');
  try {
    const r = db.exec(
      `SELECT 1
         FROM ingredient_variants
        WHERE ingredient_id IN (${ph})
          AND lower(trim(variant)) = lower(trim(?))
          AND COALESCE(is_deprecated, 0) = 1
        LIMIT 1;`,
      [...canonicalIds, v],
    );
    return !!(r?.length && r[0]?.values?.length);
  } catch (_) {
    return false;
  }
}

async function ingredientScopedVariantIsDeprecatedViaDataService({
  db = window.dbInstance,
  ingredientName = '',
  variantText = '',
} = {}) {
  if (
    window.dataService &&
    typeof window.dataService.isIngredientVariantDeprecated === 'function'
  ) {
    try {
      return await window.dataService.isIngredientVariantDeprecated({
        ingredientName,
        variantText,
      });
    } catch (err) {
      console.error('dataService.isIngredientVariantDeprecated failed:', err);
    }
  }
  return ingredientScopedVariantIsDeprecated(db, ingredientName, variantText);
}

if (typeof window !== 'undefined') {
  window.ingredientScopedVariantIsDeprecated = ingredientScopedVariantIsDeprecated;
}

function getShoppingPlanSelectionRows(options = {}) {
  const db = options?.db || window.dbInstance;
  const visibleNameKeys =
    db && typeof db.exec === 'function'
      ? new Set(
          getVisibleIngredientNamePool(db).map((name) =>
            String(name || '')
              .trim()
              .toLowerCase(),
          ),
        )
      : null;
  const aggregate = new Map();
  const ensureRow = ({
    name = '',
    variantName = '',
    allowInvisible = false,
  } = {}) => {
    const resolvedName = String(name || '').trim();
    const resolvedVariantName = String(variantName || '').trim();
    if (!resolvedName) return null;
    const key = getShoppingPlanAggregateKey(resolvedName, resolvedVariantName);
    if (!key) return null;
    const nameKey = resolvedName.toLowerCase();
    if (
      !allowInvisible &&
      visibleNameKeys instanceof Set &&
      !visibleNameKeys.has(nameKey)
    ) {
      return null;
    }
    if (!aggregate.has(key)) {
      aggregate.set(key, {
        key,
        name: resolvedName,
        variantName: resolvedVariantName,
        label: getShoppingListIngredientLabel(
          resolvedName,
          resolvedVariantName,
        ),
        buckets: new Map(),
        bucketOrder: [],
        contributionSources: new Map(),
        contributionSourceOrder: [],
      });
    }
    return aggregate.get(key);
  };
  const addBucketToTarget = (target, bucket) => {
    if (!target || !bucket || typeof bucket !== 'object') return;
    const bucketKey = String(bucket.key || '').trim();
    if (!bucketKey) return;
    if (!target.buckets.has(bucketKey)) {
      target.bucketOrder.push(bucketKey);
      target.buckets.set(bucketKey, { ...bucket });
      return;
    }
    const existing = target.buckets.get(bucketKey);
    if (!existing) return;
    if (bucket.kind === 'measured') {
      existing.baseQuantity = Number(
        (
          Number(existing.baseQuantity || 0) + Number(bucket.baseQuantity || 0)
        ).toFixed(6),
      );
      return;
    }
    existing.quantity = Number(
      (Number(existing.quantity || 0) + Number(bucket.quantity || 0)).toFixed(
        4,
      ),
    );
  };
  const ensureContributionSource = (row, source = {}) => {
    if (!row || typeof row !== 'object') return null;
    const sourceType = String(source.sourceType || '').trim() || 'recipe';
    const sourceKey =
      sourceType === 'manual'
        ? 'manual:selected'
        : `recipe:${Math.trunc(Number(source.recipeId || 0))}`;
    if (!sourceKey) return null;
    if (!row.contributionSources.has(sourceKey)) {
      row.contributionSourceOrder.push(sourceKey);
      row.contributionSources.set(sourceKey, {
        sourceType,
        sourceKey,
        recipeId:
          sourceType === 'recipe' && Number.isFinite(Number(source.recipeId))
            ? Math.trunc(Number(source.recipeId))
            : null,
        title: String(source.title || '').trim(),
        buckets: new Map(),
        bucketOrder: [],
      });
    }
    return row.contributionSources.get(sourceKey) || null;
  };
  const getContributionSortValue = (buckets) =>
    (Array.isArray(buckets) ? buckets : []).reduce((sum, bucket) => {
      if (bucket?.kind === 'measured') {
        return sum + Math.max(0, Number(bucket.baseQuantity || 0));
      }
      return sum + Math.max(0, Number(bucket?.quantity || 0));
    }, 0);
  const addSelectedItemBucket = (entry) => {
    const name = String(entry?.name || '').trim();
    const variantName = String(entry?.variantName || '').trim();
    const quantity = Number(entry?.quantity || 0);
    if (!name || !Number.isFinite(quantity) || quantity <= 1e-9) return;
    const row = ensureRow({ name, variantName });
    if (!row) return;
    const bucket = {
      key: 'selected',
      kind: 'selected',
      quantity,
    };
    addBucketToTarget(row, bucket);
    const source = ensureContributionSource(row, {
      sourceType: 'manual',
      title: 'Directly added',
    });
    addBucketToTarget(source, bucket);
  };
  const addRecipeIngredientBucket = (
    line,
    {
      recipeId = null,
      recipeTitle = '',
      recipeCount = 0,
      servingsMultiplier = 1,
    } = {},
  ) => {
    if (!line || typeof line !== 'object') return;
    if (line.rowType === 'heading' || line.isRecipe) return;
    const name = String(line.name || '').trim();
    if (!name) return;
    const variantName = String(line.variant || '').trim();
    // Recipe-sourced rows should stay visible even when the master ingredient is
    // hidden from the browse pool; otherwise OR/alt ingredients can disappear.
    const row = ensureRow({ name, variantName, allowInvisible: true });
    if (!row) return;
    const recipeMultiplier = Number(recipeCount);
    if (!Number.isFinite(recipeMultiplier) || recipeMultiplier <= 0) return;
    const source = ensureContributionSource(row, {
      sourceType: 'recipe',
      recipeId,
      title: recipeTitle,
    });

    const ingredientCount = getRecipeIngredientShoppingCount(line);
    if (!Number.isFinite(ingredientCount) || ingredientCount <= 0) {
      const bucket = {
        key: 'unspecified',
        kind: 'unspecified',
        quantity: recipeMultiplier,
      };
      addBucketToTarget(row, bucket);
      addBucketToTarget(source, bucket);
      return;
    }

    const scaledPerRecipeQuantityRaw = ingredientCount * servingsMultiplier;
    const scaledPerRecipeQuantity =
      Math.abs(servingsMultiplier - 1) > 1e-9 &&
      typeof window.normalizeActionableQuantity === 'function'
        ? Number(
            window.normalizeActionableQuantity(
              scaledPerRecipeQuantityRaw,
              line.unit || '',
            ),
          )
        : Number(scaledPerRecipeQuantityRaw.toFixed(4));
    if (
      !Number.isFinite(scaledPerRecipeQuantity) ||
      scaledPerRecipeQuantity <= 0
    )
      return;

    const nextQuantity = Number(
      (scaledPerRecipeQuantity * recipeMultiplier).toFixed(4),
    );
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return;

    const normalizedUnit = normalizeShoppingListUnit(line.unit || '');
    const size = String(line.size || '').trim();
    const measured = convertShoppingListQuantityToMeasuredBase(
      nextQuantity,
      normalizedUnit,
    );
    if (measured) {
      const bucket = {
        key: `measured:${measured.family}`,
        kind: 'measured',
        family: measured.family,
        baseQuantity: measured.baseQuantity,
      };
      addBucketToTarget(row, bucket);
      addBucketToTarget(source, bucket);
      return;
    }

    if (normalizedUnit || size) {
      const bucket = {
        key: `exact:${normalizedUnit}|${size.toLowerCase()}`,
        kind: 'exact',
        quantity: nextQuantity,
        unit: normalizedUnit,
        size,
      };
      addBucketToTarget(row, bucket);
      addBucketToTarget(source, bucket);
      return;
    }

    const bucket = {
      key: 'count',
      kind: 'count',
      quantity: nextQuantity,
      unit: '',
      size: '',
    };
    addBucketToTarget(row, bucket);
    addBucketToTarget(source, bucket);
  };

  Object.values(getShoppingPlanItemSelections()).forEach(addSelectedItemBucket);

  if (
    db &&
    typeof db.exec === 'function' &&
    window.bridge &&
    typeof window.bridge.loadRecipeFromDB === 'function'
  ) {
    Object.values(getShoppingPlanRecipeSelections()).forEach((selection) => {
      const recipeId = Number(selection?.recipeId);
      const recipeCount = Number(selection?.quantity || 0);
      if (!Number.isFinite(recipeId) || recipeId <= 0) return;
      if (!Number.isFinite(recipeCount) || recipeCount <= 0) return;

      const recipe = loadShoppingPlanRecipeFromDB(db, recipeId);
      if (!recipe || !Array.isArray(recipe.sections)) return;

      walkExpandedShoppingPlanIngredientLines(
        db,
        recipe,
        {
          recipeId,
          recipeTitle: String(recipe?.title || '').trim(),
          outerRecipeMultiplier: recipeCount,
          linkDepth: 0,
        },
        addRecipeIngredientBucket,
      );
    });
  }

  const rows = Array.from(aggregate.values())
    .map((row) => {
      const buckets = row.bucketOrder
        .map((bucketKey) => row.buckets.get(bucketKey))
        .filter(Boolean)
        .filter((bucket) => {
          if (bucket.kind === 'measured') {
            return Number(bucket.baseQuantity || 0) > 1e-9;
          }
          return Number(bucket.quantity || 0) > 1e-9;
        });
      const variantIsDeprecated =
        !!row.variantName &&
        ingredientScopedVariantIsDeprecated(db, row.name, row.variantName);
      return {
        key: row.key,
        name: row.name,
        variantName: row.variantName,
        variantIsDeprecated,
        label: row.label,
        detailText: formatShoppingListDisplayDetailText({
          variantName: row.variantName,
          buckets,
        }),
        text: formatShoppingListDisplayRow({
          label: row.label,
          name: row.name,
          variantName: row.variantName,
          buckets,
        }),
        contributionRows: row.contributionSourceOrder
          .map((sourceKey) => row.contributionSources.get(sourceKey))
          .filter(Boolean)
          .map((source) => {
            const sourceBuckets = source.bucketOrder
              .map((bucketKey) => source.buckets.get(bucketKey))
              .filter(Boolean)
              .filter((bucket) => {
                if (bucket.kind === 'measured') {
                  return Number(bucket.baseQuantity || 0) > 1e-9;
                }
                return Number(bucket.quantity || 0) > 1e-9;
              });
            const detailText = formatShoppingListDisplayDetailText({
              variantName: row.variantName,
              buckets: sourceBuckets,
            });
            if (!detailText) return null;
            return {
              sourceType: source.sourceType,
              sourceKey: source.sourceKey,
              recipeId: source.recipeId,
              title:
                String(source.title || '').trim() ||
                (source.sourceType === 'manual' ? 'Directly added' : 'Recipe'),
              detailText,
              sortValue: getContributionSortValue(sourceBuckets),
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            if (a.sourceType !== b.sourceType) {
              return a.sourceType === 'recipe' ? -1 : 1;
            }
            const sortDelta =
              Number(b.sortValue || 0) - Number(a.sortValue || 0);
            if (Math.abs(sortDelta) > 1e-9) return sortDelta;
            return String(a.title || '').localeCompare(
              String(b.title || ''),
              undefined,
              {
                sensitivity: 'base',
              },
            );
          }),
      };
    })
    .filter((entry) => String(entry.text || '').trim());

  if (options?.ungroupedOnly) return rows;

  const tableExists = (name) => {
    if (!db || typeof db.exec !== 'function') return false;
    try {
      const q = db.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`,
        [name],
      );
      return !!(Array.isArray(q) && q.length && q[0]?.values?.length);
    } catch (_) {
      return false;
    }
  };

  const orderedSelectedStoreIds = orderShoppingListSelectedStoreIds(
    getShoppingPlanStoreOrder(),
    getShoppingPlanSelectedStoreIds(),
  );

  /** @type {{ id: number, label: string }[]} */
  let selectedStores = [];
  const baseAssignmentMap = new Map();
  const variantAssignmentMap = new Map();
  const variantAnyAssignmentMap = new Map();
  const variantOrderMap = new Map();

  if (
    db &&
    typeof db.exec === 'function' &&
    rows.length > 0 &&
    orderedSelectedStoreIds.length > 0 &&
    tableExists('stores') &&
    tableExists('store_locations')
  ) {
    const storePh = orderedSelectedStoreIds.map(() => '?').join(',');
    try {
      const storeQ = db.exec(
        `
          SELECT ID, chain_name, location_name
          FROM stores
          WHERE ID IN (${storePh});
        `,
        orderedSelectedStoreIds,
      );
      const storeMeta = new Map();
      if (
        Array.isArray(storeQ) &&
        storeQ.length &&
        Array.isArray(storeQ[0].values)
      ) {
        storeQ[0].values.forEach(([id, chain, location]) => {
          const storeId = Math.trunc(Number(id));
          if (!Number.isFinite(storeId) || storeId <= 0) return;
          const chainName = String(chain || '').trim();
          const locationName = String(location || '').trim();
          const label = locationName
            ? `${chainName} (${locationName})`
            : chainName || `Store ${storeId}`;
          storeMeta.set(storeId, { id: storeId, label });
        });
      }
      selectedStores = orderedSelectedStoreIds
        .map((storeId) => storeMeta.get(storeId))
        .filter(Boolean);
    } catch (_) {
      selectedStores = [];
    }

    const effectiveStoreIds = selectedStores.map((store) => store.id);
    const uniqueNameKeys = [
      ...new Set(
        rows
          .map((row) =>
            String(row?.name || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
    if (effectiveStoreIds.length && uniqueNameKeys.length) {
      const effectiveStorePh = effectiveStoreIds.map(() => '?').join(',');
      const namePh = uniqueNameKeys.map(() => '?').join(',');
      if (tableExists('ingredient_store_location')) {
        try {
          const baseQ = db.exec(
            `
              SELECT DISTINCT
                lower(trim(i.name)) AS name_key,
                sl.store_id,
                sl.ID AS aisle_id,
                COALESCE(sl.name, '') AS aisle_name,
                COALESCE(sl.sort_order, 999999) AS aisle_sort_order
              FROM ingredient_store_location isl
              JOIN ingredients i ON i.ID = isl.ingredient_id
              JOIN store_locations sl ON sl.ID = isl.store_location_id
              WHERE sl.store_id IN (${effectiveStorePh})
                AND lower(trim(i.name)) IN (${namePh});
            `,
            [...effectiveStoreIds, ...uniqueNameKeys],
          );
          if (
            Array.isArray(baseQ) &&
            baseQ.length &&
            Array.isArray(baseQ[0].values)
          ) {
            baseQ[0].values.forEach(
              ([
                nameKey,
                storeIdRaw,
                aisleIdRaw,
                aisleName,
                aisleSortOrder,
              ]) => {
                const nameKeyNormalized = String(nameKey || '')
                  .trim()
                  .toLowerCase();
                const storeId = Math.trunc(Number(storeIdRaw));
                const aisleId = Math.trunc(Number(aisleIdRaw));
                if (
                  !nameKeyNormalized ||
                  !Number.isFinite(storeId) ||
                  !Number.isFinite(aisleId)
                ) {
                  return;
                }
                if (!baseAssignmentMap.has(nameKeyNormalized)) {
                  baseAssignmentMap.set(nameKeyNormalized, []);
                }
                baseAssignmentMap.get(nameKeyNormalized).push({
                  storeId,
                  aisleId,
                  aisleLabel:
                    String(aisleName || '').trim() || `Aisle ${aisleId}`,
                  aisleSortOrder: Number.isFinite(Number(aisleSortOrder))
                    ? Number(aisleSortOrder)
                    : 999999,
                });
              },
            );
          }
        } catch (_) {}
      }

      if (
        tableExists('ingredient_variants') &&
        tableExists('ingredient_variant_store_location')
      ) {
        try {
          const variantOrderQ = db.exec(
            `
              SELECT
                lower(trim(i.name)) AS name_key,
                lower(trim(v.variant)) AS variant_key
              FROM ingredient_variants v
              JOIN ingredients i ON i.ID = v.ingredient_id
              WHERE lower(trim(i.name)) IN (${namePh})
                AND NOT (${getIngredientBaseVariantWhereSql('v.variant')})
              ORDER BY
                lower(trim(i.name)) ASC,
                COALESCE(v.sort_order, 999999) ASC,
                COALESCE(v.id, 999999) ASC;
            `,
            uniqueNameKeys,
          );
          if (
            Array.isArray(variantOrderQ) &&
            variantOrderQ.length &&
            Array.isArray(variantOrderQ[0].values)
          ) {
            variantOrderQ[0].values.forEach(([nameKey, variantKey]) => {
              const nameKeyNormalized = String(nameKey || '')
                .trim()
                .toLowerCase();
              const variantKeyNormalized = String(variantKey || '')
                .trim()
                .toLowerCase();
              if (!nameKeyNormalized || !variantKeyNormalized) return;
              if (!variantOrderMap.has(nameKeyNormalized)) {
                variantOrderMap.set(nameKeyNormalized, []);
              }
              variantOrderMap.get(nameKeyNormalized).push(variantKeyNormalized);
            });
          }
        } catch (_) {}

        try {
          const variantAnyQ = db.exec(
            `
              SELECT DISTINCT
                lower(trim(i.name)) AS name_key,
                sl.store_id,
                sl.ID AS aisle_id,
                COALESCE(sl.name, '') AS aisle_name,
                COALESCE(sl.sort_order, 999999) AS aisle_sort_order
              FROM ingredient_variant_store_location ivsl
              JOIN ingredient_variants v ON v.id = ivsl.ingredient_variant_id
              JOIN ingredients i ON i.ID = v.ingredient_id
              JOIN store_locations sl ON sl.ID = ivsl.store_location_id
              WHERE sl.store_id IN (${effectiveStorePh})
                AND lower(trim(i.name)) IN (${namePh})
                AND NOT (${getIngredientBaseVariantWhereSql('v.variant')});
            `,
            [...effectiveStoreIds, ...uniqueNameKeys],
          );
          if (
            Array.isArray(variantAnyQ) &&
            variantAnyQ.length &&
            Array.isArray(variantAnyQ[0].values)
          ) {
            variantAnyQ[0].values.forEach(
              ([
                nameKey,
                storeIdRaw,
                aisleIdRaw,
                aisleName,
                aisleSortOrder,
              ]) => {
                const nameKeyNormalized = String(nameKey || '')
                  .trim()
                  .toLowerCase();
                const storeId = Math.trunc(Number(storeIdRaw));
                const aisleId = Math.trunc(Number(aisleIdRaw));
                if (
                  !nameKeyNormalized ||
                  !Number.isFinite(storeId) ||
                  !Number.isFinite(aisleId)
                ) {
                  return;
                }
                if (!variantAnyAssignmentMap.has(nameKeyNormalized)) {
                  variantAnyAssignmentMap.set(nameKeyNormalized, []);
                }
                variantAnyAssignmentMap.get(nameKeyNormalized).push({
                  storeId,
                  aisleId,
                  aisleLabel:
                    String(aisleName || '').trim() || `Aisle ${aisleId}`,
                  aisleSortOrder: Number.isFinite(Number(aisleSortOrder))
                    ? Number(aisleSortOrder)
                    : 999999,
                });
              },
            );
          }
        } catch (_) {}
        try {
          const variantQ = db.exec(
            `
              SELECT DISTINCT
                lower(trim(i.name)) AS name_key,
                lower(trim(v.variant)) AS variant_key,
                sl.store_id,
                sl.ID AS aisle_id,
                COALESCE(sl.name, '') AS aisle_name,
                COALESCE(sl.sort_order, 999999) AS aisle_sort_order
              FROM ingredient_variant_store_location ivsl
              JOIN ingredient_variants v ON v.id = ivsl.ingredient_variant_id
              JOIN ingredients i ON i.ID = v.ingredient_id
              JOIN store_locations sl ON sl.ID = ivsl.store_location_id
              WHERE sl.store_id IN (${effectiveStorePh})
                AND lower(trim(i.name)) IN (${namePh})
                AND NOT (${getIngredientBaseVariantWhereSql('v.variant')});
            `,
            [...effectiveStoreIds, ...uniqueNameKeys],
          );
          if (
            Array.isArray(variantQ) &&
            variantQ.length &&
            Array.isArray(variantQ[0].values)
          ) {
            variantQ[0].values.forEach(
              ([
                nameKey,
                variantKey,
                storeIdRaw,
                aisleIdRaw,
                aisleName,
                aisleSortOrder,
              ]) => {
                const nameKeyNormalized = String(nameKey || '')
                  .trim()
                  .toLowerCase();
                const variantKeyNormalized = String(variantKey || '')
                  .trim()
                  .toLowerCase();
                const storeId = Math.trunc(Number(storeIdRaw));
                const aisleId = Math.trunc(Number(aisleIdRaw));
                if (
                  !nameKeyNormalized ||
                  !variantKeyNormalized ||
                  !Number.isFinite(storeId) ||
                  !Number.isFinite(aisleId)
                ) {
                  return;
                }
                const assignmentKey = getShoppingListVariantAssignmentKey(
                  nameKeyNormalized,
                  variantKeyNormalized,
                );
                if (!assignmentKey) return;
                if (!variantAssignmentMap.has(assignmentKey)) {
                  variantAssignmentMap.set(assignmentKey, []);
                }
                variantAssignmentMap.get(assignmentKey).push({
                  storeId,
                  aisleId,
                  aisleLabel:
                    String(aisleName || '').trim() || `Aisle ${aisleId}`,
                  aisleSortOrder: Number.isFinite(Number(aisleSortOrder))
                    ? Number(aisleSortOrder)
                    : 999999,
                });
              },
            );
          }
        } catch (_) {}
      }
    }
  }

  const groupedInputRows = rows.map((row) => {
    return {
      ...row,
      assignmentCandidates: getShoppingListAssignmentCandidates(row, {
        baseAssignmentMap,
        variantAssignmentMap,
        variantAnyAssignmentMap,
        variantOrderMap,
      }),
    };
  });

  return buildGroupedShoppingListRows(groupedInputRows, {
    selectedStores,
    unlistedLabel: 'UNLISTED',
  });
}

async function getShoppingPlanSelectionRowsViaDataService(options = {}) {
  const db = options?.db || window.dbInstance;
  const getUngroupedRowsFallback = () =>
    getShoppingPlanSelectionRows({ db, ungroupedOnly: true });
  let rows = [];
  if (
    window.dataService &&
    typeof window.dataService.listShoppingListPlanRows === 'function'
  ) {
    try {
      const selectedRecipes = Object.values(getShoppingPlanRecipeSelections()).map(
        (entry) => {
          const recipeId = Number(entry?.recipeId);
          return {
            ...entry,
            servings: getRecipeWebServingsStoredValue(recipeId),
          };
        },
      );
      rows = await window.dataService.listShoppingListPlanRows({
        selectedItems: Object.values(getShoppingPlanItemSelections()),
        selectedRecipes,
      });
      rows = (Array.isArray(rows) ? rows : []).map((row) => ({
        ...row,
        variantIsDeprecated:
          row?.variantIsDeprecated != null
            ? !!row.variantIsDeprecated
            : !!row?.variantIsRemoved,
      }));
    } catch (err) {
      console.error('dataService.listShoppingListPlanRows failed:', err);
      rows = getUngroupedRowsFallback();
    }
  } else {
    rows = getUngroupedRowsFallback();
  }
  if (
    !window.dataService ||
    typeof window.dataService.listShoppingListAssignments !== 'function'
  ) {
    return getShoppingPlanSelectionRows({ db });
  }
  try {
    const assignmentData = await window.dataService.listShoppingListAssignments({
      storeOrder: getShoppingPlanStoreOrder(),
      selectedStoreIds: getShoppingPlanSelectedStoreIds(),
      items: rows.map((row) => ({
        key: row.key,
        name: row.name,
        variantName: row.variantName,
      })),
    });
    const assignmentsByKey =
      assignmentData && typeof assignmentData.assignmentsByKey === 'object'
        ? assignmentData.assignmentsByKey
        : {};
    const groupedInputRows = rows.map((row) => ({
      ...row,
      assignmentCandidates: Array.isArray(assignmentsByKey[row.key])
        ? assignmentsByKey[row.key]
        : [],
    }));
    return buildGroupedShoppingListRows(groupedInputRows, {
      selectedStores: Array.isArray(assignmentData?.selectedStores)
        ? assignmentData.selectedStores
        : [],
      unlistedLabel: 'UNLISTED',
    });
  } catch (err) {
    console.error('dataService.listShoppingListAssignments failed:', err);
    return getShoppingPlanSelectionRows({ db });
  }
}

function detectPageIdFromBody() {
  const body = document.body;
  if (!body) return null;
  return (
    body.dataset.page ||
    (body.classList.contains('recipes-page')
      ? 'recipes'
      : body.classList.contains('recipe-editor-page')
        ? 'recipe-editor'
        : body.classList.contains('shopping-page')
          ? 'shopping'
          : body.classList.contains('shopping-list-page')
            ? 'shopping-list'
            : body.classList.contains('shopping-editor-page')
              ? 'shopping-editor'
              : body.classList.contains('units-page')
                ? 'units'
                : body.classList.contains('unit-editor-page')
                  ? 'unit-editor'
                  : body.classList.contains('sizes-page')
                    ? 'sizes'
                    : body.classList.contains('size-editor-page')
                      ? 'size-editor'
                      : body.classList.contains('tags-page')
                        ? 'tags'
                        : body.classList.contains('tag-editor-page')
                          ? 'tag-editor'
                          : body.classList.contains('stores-page')
                            ? 'stores'
                            : body.classList.contains('store-editor-page')
                              ? 'store-editor'
                              : null)
  );
}

function shouldDeferSqlBootForCurrentPage() {
  const pageId = detectPageIdFromBody();
  return pageId === 'welcome' || pageId === 'web-db-error';
}

function markCurrentPageAsLastVisited() {
  try {
    const current = detectPageIdFromBody();
    if (!current) return;
    sessionStorage.setItem(
      LAST_PAGE_SESSION_KEY,
      String(current).toLowerCase(),
    );
  } catch (_) {}
}

// Track previous page id across full page navigations.
markCurrentPageAsLastVisited();

function enableTopLevelListKeyboardNav(listEl, options = {}) {
  if (!(listEl instanceof Element)) return null;
  const requireExistingSelectionForArrows =
    !!options.requireExistingSelectionForArrows;
  const disableArrowNavigation = !!options.disableArrowNavigation;
  const disableEnterActivation = !!options.disableEnterActivation;
  const disableHoverSelection = !!options.disableHoverSelection;
  const toggleSelectionOnClick = !!options.toggleSelectionOnClick;
  const clearSelectionOnOutsidePointerDown =
    !!options.clearSelectionOnOutsidePointerDown;
  const clearSelectionOnOutsideFocus = !!options.clearSelectionOnOutsideFocus;
  const clearSelectionOnWindowBlur = !!options.clearSelectionOnWindowBlur;
  const clearSelectionOnEscape = !!options.clearSelectionOnEscape;

  // Marks this list so CSS can avoid showing a second "hover highlight"
  // when keyboard selection moves off the hovered row.
  listEl.classList.add('top-level-kbd-nav');

  // Start with *no* selection. Hover or enabled keyboard nav can select.
  let selectedIdx = -1;
  let selectionSource = null; // 'hover' | 'keyboard' | null

  const getRows = () =>
    Array.from(listEl.querySelectorAll('li')).filter(
      (li) => !li.classList.contains('recipe-list-servings-header'),
    );

  const applySelection = () => {
    const rows = getRows();
    if (rows.length === 0) return;

    if (selectedIdx == null) selectedIdx = -1;
    if (selectedIdx >= rows.length) selectedIdx = rows.length - 1;

    rows.forEach((li, i) =>
      li.classList.toggle('is-selected', i === selectedIdx),
    );
    if (selectedIdx >= 0) {
      rows[selectedIdx]?.scrollIntoView?.({ block: 'nearest' });
    }
  };

  const applySelectedIdx = (idx) => {
    selectedIdx = idx;
    applySelection();
  };

  const clearSelection = () => {
    selectionSource = null;
    applySelectedIdx(-1);
  };

  // Hover should not be a competing highlight; it should *move selection*.
  listEl.addEventListener('mouseover', (e) => {
    if (disableHoverSelection) return;
    const li = e.target?.closest?.('li');
    if (!li || !listEl.contains(li)) return;
    const rows = getRows();
    const idx = rows.indexOf(li);
    if (idx >= 0) {
      selectionSource = 'hover';
      applySelectedIdx(idx);
    }
  });

  // If the mouse is not over a hover target (li), clear hover-driven selection.
  const clearHoverSelectionIfNeeded = (e) => {
    if (disableHoverSelection) return;
    if (selectionSource !== 'hover') return;
    const li = e?.target?.closest?.('li');
    if (li && listEl.contains(li)) return;
    selectionSource = null;
    applySelectedIdx(-1);
  };

  // When moving over blank space inside the list, clear the highlight.
  listEl.addEventListener('mousemove', clearHoverSelectionIfNeeded);
  // When leaving the list entirely, clear the highlight.
  listEl.addEventListener('mouseleave', clearHoverSelectionIfNeeded);

  // Click should also update selection (keeps state coherent after mouse use).
  listEl.addEventListener('click', (e) => {
    const li = e.target?.closest?.('li');
    if (!li || !listEl.contains(li)) return;
    const rows = getRows();
    const idx = rows.indexOf(li);
    if (idx >= 0) {
      if (toggleSelectionOnClick && idx === selectedIdx) {
        clearSelection();
        return;
      }
      // Treat click as a "committed" selection so it doesn't get cleared on mouseout.
      selectionSource = 'keyboard';
      applySelectedIdx(idx);
    }
  });

  if (clearSelectionOnOutsidePointerDown) {
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (selectedIdx < 0) return;
        const targetRow = e.target?.closest?.('li');
        if (targetRow && listEl.contains(targetRow)) return;
        clearSelection();
      },
      { capture: true },
    );
  }

  if (clearSelectionOnOutsideFocus) {
    document.addEventListener(
      'focusin',
      (e) => {
        if (selectedIdx < 0) return;
        if (e.target instanceof Node && listEl.contains(e.target)) return;
        clearSelection();
      },
      { capture: true },
    );
  }

  if (clearSelectionOnWindowBlur) {
    window.addEventListener('blur', () => {
      if (selectedIdx < 0) return;
      clearSelection();
    });
  }

  document.addEventListener(
    'keydown',
    (e) => {
      // Only plain keys; don't steal Cmd/Ctrl/Alt/Shift combos
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.isComposing) return;
      if (isTypingContext(e.target)) return;
      if (isModalOpen()) return;
      if (document.activeElement?.closest?.('.bottom-nav')) return;

      const rows = getRows();
      if (rows.length === 0) return;

      if (e.key === 'Escape') {
        if (!clearSelectionOnEscape || selectedIdx < 0) return;
        e.preventDefault();
        clearSelection();
        return;
      }

      if (disableArrowNavigation) return;

      if (e.key === 'ArrowDown') {
        if (selectedIdx < 0 && requireExistingSelectionForArrows) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        // If nothing selected yet, Down selects the first row.
        if (selectedIdx < 0) {
          selectionSource = 'keyboard';
          applySelectedIdx(0);
          return;
        }
        selectionSource = 'keyboard';
        applySelectedIdx(Math.min(selectedIdx + 1, rows.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        if (selectedIdx < 0 && requireExistingSelectionForArrows) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        // If nothing selected yet, Up selects the last row.
        if (selectedIdx < 0) {
          selectionSource = 'keyboard';
          applySelectedIdx(rows.length - 1);
          return;
        }
        selectionSource = 'keyboard';
        applySelectedIdx(Math.max(selectedIdx - 1, 0));
        return;
      }

      if (e.key === 'Enter') {
        if (disableEnterActivation) {
          if (selectedIdx >= 0) e.preventDefault();
          return;
        }
        if (selectedIdx < 0) return;
        e.preventDefault();
        rows[selectedIdx]?.click?.();
      }
    },
    { capture: true },
  );

  // Initial paint
  applySelection();

  return {
    syncAfterRender() {
      applySelection();
    },
    getSelectedIdx() {
      return selectedIdx;
    },
    setSelectedIdx(idx, options = {}) {
      selectionSource =
        options?.source === 'hover'
          ? 'hover'
          : options?.source === null
            ? null
            : 'keyboard';
      applySelectedIdx(idx);
    },
    resetToTop() {
      selectedIdx = -1;
      applySelection();
    },
  };
}

function bootFavoriteEatsAfterSqlReady() {
  initSqlJs({
    locateFile: (file) => `js/${file}`, // load local sql-wasm.wasm
  }).then((sql) => {
    SQL = sql;

    // --- page load routing ---

    if (redirectIfPublicWebPageIsDisallowed()) return;

    const pageId = detectPageIdFromBody();

    // --- Cmd/Ctrl+S: invoke visible editor Save action ---
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.isComposing) return;
        if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
        if (String(e.key || '').toLowerCase() !== 's') return;

        const saveBtn = document.getElementById('appBarSaveBtn');
        if (!(saveBtn instanceof HTMLButtonElement)) return;
        if (saveBtn.disabled) return;

        const styles = window.getComputedStyle(saveBtn);
        if (styles.display === 'none' || styles.visibility === 'hidden') return;

        e.preventDefault();
        e.stopPropagation();
        saveBtn.click();
      },
      { capture: true },
    );

    // --- Cmd+← / Cmd+→ / Cmd+↑ / Cmd+↓: move between top-level pages ---
    const TOP_LEVEL_PAGES = getTopLevelPageOrder();

    document.addEventListener(
      'keydown',
      (e) => {
        // Cmd only (avoid stealing Ctrl/Alt/Shift combos)
        if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        if (e.isComposing) return;

        if (
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
        )
          return;
        if (isTypingContext(e.target) && !isAppBarSearchContext(e.target))
          return;
        const idx = TOP_LEVEL_PAGES.indexOf(pageId);
        if (idx === -1) return; // only act on top-level list pages

        // Stores: Cmd+↑/↓ reorders when a row has keyboard selection (red), not tab switching.
        if (
          (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
          typeof consumeCmdVerticalArrowBeforeTopLevelNav === 'function'
        ) {
          try {
            if (consumeCmdVerticalArrowBeforeTopLevelNav(e)) return;
          } catch (_) {}
        }

        // Treat Up like Left, and Down like Right.
        const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx =
          (idx + delta + TOP_LEVEL_PAGES.length) % TOP_LEVEL_PAGES.length;

        e.preventDefault();
        window.location.href = getTopLevelPageHref(TOP_LEVEL_PAGES[nextIdx]);
      },
      { capture: true },
    );

    // --- Cmd+↑: go to parent/back page on editor pages ---
    const CHILD_EDITOR_PAGES = new Set([
      'recipe-editor',
      'shopping-editor',
      'unit-editor',
      'size-editor',
      'tag-editor',
      'store-editor',
    ]);

    document.addEventListener(
      'keydown',
      (e) => {
        // Cmd only (avoid stealing Ctrl/Alt/Shift combos)
        if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        if (e.isComposing) return;

        if (e.key !== 'ArrowUp') return;
        if (!CHILD_EDITOR_PAGES.has(pageId)) return;
        if (isTypingContext(e.target) && !isAppBarSearchContext(e.target))
          return;

        const backBtn = document.getElementById('appBarBackBtn');
        if (!backBtn) return;

        e.preventDefault();
        backBtn.click();
      },
      { capture: true },
    );

    const pageLoaders = {
      recipes: loadRecipesPage,
      'recipe-editor': loadRecipeEditorPage,
      shopping: loadShoppingPage,
      'shopping-list': loadShoppingListPage,
      'shopping-editor': loadShoppingItemEditorPage,
      units: loadUnitsPage,
      'unit-editor': loadUnitEditorPage,
      sizes: loadSizesPage,
      'size-editor': loadSizeEditorPage,
      tags: loadTagsPage,
      'tag-editor': loadTagEditorPage,
      stores: loadStoresPage,
      'store-editor': loadStoreEditorPage,
    };

    if (pageId && pageLoaders[pageId]) {
      pageLoaders[pageId]();
    }
  });
}

if (!shouldDeferSqlBootForCurrentPage()) {
  bootFavoriteEatsAfterSqlReady();
}

// Welcome page logic
const loadDbBtn = document.getElementById('loadDbBtn');
const dbLoader = document.getElementById('dbLoader');

const BUNDLED_FAVORITE_EATS_DB_PATH = 'assets/favorite_eats.db';
const BUNDLED_WEB_DB_ONLY_MODE = FAVORITE_EATS_BUILD.target === 'web';
const WEB_DB_LOAD_ERROR_COPY = Object.freeze({
  title: 'Couldn’t load recipes',
  body: 'The recipe database couldn’t be loaded. Reload to try again, or choose a database file from your device.',
  publicWebBody: 'The recipe database couldn’t be loaded. Reload to try again.',
  reloadCta: 'Reload',
  chooseFileCta: 'Choose file…',
  chooseFileFailure: 'Couldn’t load the chosen database file.',
});

function bundledFavoriteEatsDbUrl() {
  try {
    return new URL(BUNDLED_FAVORITE_EATS_DB_PATH, window.location.href).href;
  } catch (_) {
    return BUNDLED_FAVORITE_EATS_DB_PATH;
  }
}

async function fetchBundledFavoriteEatsDbBytes() {
  const res = await fetch(bundledFavoriteEatsDbUrl(), { cache: 'no-store' });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (!buf || buf.byteLength < 100) return null;
  return new Uint8Array(buf);
}

function persistFavoriteEatsDbBytesForWeb(uints) {
  localStorage.setItem('favoriteEatsDb', JSON.stringify(Array.from(uints)));
}

function clearStoredFavoriteEatsDbBytesForWeb() {
  try {
    localStorage.removeItem('favoriteEatsDb');
  } catch (_) {}
}

function getStoredFavoriteEatsDbBytesForWeb() {
  try {
    const stored = localStorage.getItem('favoriteEatsDb');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.length) {
      clearStoredFavoriteEatsDbBytesForWeb();
      return null;
    }
    return new Uint8Array(parsed);
  } catch (_) {
    clearStoredFavoriteEatsDbBytesForWeb();
    return null;
  }
}

function readFavoriteEatsDbFileAsUint8Array(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error('No file selected.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error || new Error('File read failed.'));
    reader.onload = () => {
      try {
        resolve(new Uint8Array(reader.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

async function importFavoriteEatsDbFileForWeb(file) {
  const uints = await readFavoriteEatsDbFileAsUint8Array(file);
  persistFavoriteEatsDbBytesForWeb(uints);
  window.location.href = 'recipes.html';
}

function renderWebDbLoadErrorScreen() {
  const body = document.body;
  if (!(body instanceof HTMLElement)) return;
  const allowChooseFile = !BUNDLED_WEB_DB_ONLY_MODE;
  const errorBody = allowChooseFile
    ? WEB_DB_LOAD_ERROR_COPY.body
    : WEB_DB_LOAD_ERROR_COPY.publicWebBody;

  body.dataset.page = 'web-db-error';
  body.className = 'web-db-error-page';
  body.innerHTML = `
    <div class="centered-container">
      <div class="welcome-card">
        <h1 class="nav-text">${WEB_DB_LOAD_ERROR_COPY.title}</h1>
        <p class="nav-text welcome-card__body">${errorBody}</p>
        <div class="welcome-card__actions">
          <button id="reloadWebDbBtn" class="button nav-text" type="button">
            ${WEB_DB_LOAD_ERROR_COPY.reloadCta}
          </button>
          ${
            allowChooseFile
              ? `<button id="chooseWebDbBtn" class="button nav-text" type="button">
            ${WEB_DB_LOAD_ERROR_COPY.chooseFileCta}
          </button>`
              : ''
          }
        </div>
        ${
          allowChooseFile
            ? `<input
          type="file"
          id="webDbErrorFileInput"
          accept=".db"
          class="file-input-hidden"
        />`
            : ''
        }
      </div>
    </div>
  `;

  const reloadBtn = document.getElementById('reloadWebDbBtn');
  const chooseFileBtn = document.getElementById('chooseWebDbBtn');
  const fileInput = document.getElementById('webDbErrorFileInput');

  reloadBtn?.addEventListener('click', () => {
    window.location.reload();
  });

  chooseFileBtn?.addEventListener('click', () => {
    if (!(fileInput instanceof HTMLInputElement)) return;
    fileInput.value = '';
    fileInput.click();
  });

  fileInput?.addEventListener('change', async (e) => {
    try {
      const file = e.target?.files?.[0];
      if (!file) return;
      await importFavoriteEatsDbFileForWeb(file);
    } catch (err) {
      console.error('❌ Failed to load chosen DB file:', err);
      uiToast(WEB_DB_LOAD_ERROR_COPY.chooseFileFailure);
    }
  });
}

async function ensureFavoriteEatsDbBytesForWeb() {
  if (BUNDLED_WEB_DB_ONLY_MODE) {
    clearStoredFavoriteEatsDbBytesForWeb();
    try {
      return await fetchBundledFavoriteEatsDbBytes();
    } catch (err) {
      console.warn('Bundled DB fetch failed:', err);
      return null;
    }
  }

  const storedBytes = getStoredFavoriteEatsDbBytesForWeb();
  if (storedBytes) return storedBytes;

  let bundledBytes = null;
  try {
    bundledBytes = await fetchBundledFavoriteEatsDbBytes();
  } catch (err) {
    console.warn('Bundled DB fetch failed:', err);
  }

  if (!bundledBytes) return null;
  persistFavoriteEatsDbBytesForWeb(bundledBytes);
  return bundledBytes;
}

// 🔑 Pressing Enter on the welcome screen behaves like clicking "Load Recipes"
if (document.body.classList.contains('welcome-page')) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadDbBtn?.click();
    }
  });
}

if (loadDbBtn && dbLoader) {
  loadDbBtn.addEventListener('click', async () => {
    const isElectron = !!window.electronAPI;

    if (isElectron) {
      // --- Electron flow ---
      try {
        // 1. Remember last folder
        const lastPath = localStorage.getItem('favoriteEatsDbPath');

        // 2. Prompt for DB file
        let dbPath = await window.electronAPI.pickDB(lastPath);
        if (!dbPath) {
          uiToast('No database selected.');
          return;
        }

        // 3. Save for next session
        localStorage.setItem('favoriteEatsDbPath', dbPath);

        // 4. Touch load once (validates path & sets ACTIVE_DB_PATH in main)
        await window.electronAPI.loadDB(dbPath);

        // 5. Navigate to recipes list
        window.location.href = 'recipes.html';
      } catch (err) {
        console.error('❌ Error loading database:', err);
        uiToast('Failed to load database — check console for details.');
      }
    } else {
      // --- Browser: load the current web DB source for this build/runtime ---
      try {
        const bytes = await ensureFavoriteEatsDbBytesForWeb();
        if (bytes) {
          window.location.href = 'recipes.html';
          return;
        }
      } catch (err) {
        console.error('❌ Failed to prepare browser DB:', err);
      }
      renderWebDbLoadErrorScreen();
    }
  });

  if (!BUNDLED_WEB_DB_ONLY_MODE) {
    dbLoader.addEventListener('change', async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        await importFavoriteEatsDbFileForWeb(file);
      } catch (err) {
        console.error('❌ Failed to load chosen DB file:', err);
        uiToast(WEB_DB_LOAD_ERROR_COPY.chooseFileFailure);
      }
    });
  }

  // Public web build: if nothing is cached yet, try the bundled DB immediately (no click).
  if (FAVORITE_EATS_BUILD.target === 'web') {
    void (async () => {
      try {
        const bytes = await ensureFavoriteEatsDbBytesForWeb();
        if (!bytes) return;
        window.location.href = 'recipes.html';
      } catch (err) {
        console.error('❌ Failed to prepare browser DB:', err);
        renderWebDbLoadErrorScreen();
      }
    })();
  }
}

/** Lowercase `adapter` query value, or empty string if absent. */
function favoriteEatsUrlAdapterParam() {
  try {
    return (
      new URLSearchParams(window.location.search || '')
        .get('adapter')
        ?.toLowerCase() || ''
    );
  } catch (_) {
    return '';
  }
}

/** Explicit opt-out to local SQLite (`?adapter=sqlite`). */
function favoriteEatsUrlAdapterIsSqlite() {
  return favoriteEatsUrlAdapterParam() === 'sqlite';
}

/**
 * Whether migrated reads should use Supabase first.
 * Web: default true unless `?adapter=sqlite`.
 * Electron: SQLite unless `?adapter=supabase`.
 */
function favoriteEatsShouldUseSupabaseDataDoor() {
  if (favoriteEatsUrlAdapterIsSqlite()) return false;
  if (window.electronAPI) return favoriteEatsUrlAdapterParam() === 'supabase';
  return true;
}

/** Loud signal when a Supabase-first read fails (testing / default web path). */
function favoriteEatsReportSupabasePrefetchFailure(label, err) {
  const inner =
    err && typeof err.message === 'string' ? err.message : String(err || '');
  const msg = `Supabase read failed (${label}). Use ?adapter=sqlite for the local database, or fix Supabase config/network. ${inner}`;
  console.error(msg, err);
  try {
    uiToast(msg);
  } catch (_) {}
}

/**
 * Copies `adapter` from the current page onto `href` so `?adapter=sqlite`
 * (or other adapter values) persist across internal navigations.
 */
function favoriteEatsHrefWithCurrentAdapter(href) {
  try {
    const adapterParam = new URLSearchParams(window.location.search || '').get(
      'adapter',
    );
    if (adapterParam == null || adapterParam === '') return href;
    const resolved = new URL(href, window.location.href);
    resolved.searchParams.set('adapter', adapterParam);
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch (_) {
    return href;
  }
}

/** Fixed pill showing when the data door is using Supabase (updates periodically). */
function ensureFavoriteEatsDataServiceAdapterBadge() {
  if (!window.dataService || document.getElementById('favoriteEatsDataServiceAdapterBadge')) {
    return;
  }
  const el = document.createElement('aside');
  el.id = 'favoriteEatsDataServiceAdapterBadge';
  el.className = 'favorite-eats-data-service-badge';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<span class="favorite-eats-data-service-badge__dot" aria-hidden="true"></span>' +
    '<span class="favorite-eats-data-service-badge__label">SB</span>';
  document.body.appendChild(el);
  const sync = () => {
    const on = !!(window.dataService && window.dataService.useSupabase);
    el.hidden = !on;
    el.title = on
      ? 'Data door: Supabase (add ?adapter=sqlite for local SQLite)'
      : '';
  };
  sync();
  window.addEventListener('pageshow', sync);
  setInterval(sync, 650);
}

// Recipes page logic
async function loadRecipesPage() {
  let prefetchedRecipeRows = null;
  let recipeRowsLoadedFromDataService = false;
  // Supabase-first recipe list (web default), then open SQLite for migrations / writes.
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listRecipes === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      prefetchedRecipeRows = await window.dataService.listRecipes();
      recipeRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listRecipes', err);
      window.dataService.useSupabase = false;
      prefetchedRecipeRows = null;
      recipeRowsLoadedFromDataService = false;
    }
  }

  const isElectron = !!window.electronAPI;
  let db;
  if (isElectron) {
    try {
      // prefer stored path; fall back to ACTIVE_DB_PATH in main
      const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
      const bytes = await window.electronAPI.loadDB(pathHint);
      const Uints = new Uint8Array(bytes);
      db = new SQL.Database(Uints);
    } catch (err) {
      console.error('❌ Failed to load DB from disk:', err);
      uiToast('No database loaded. Please go back to the welcome page.');
      return;
    }
  } else {
    let browserBytes;
    try {
      browserBytes = await ensureFavoriteEatsDbBytesForWeb();
    } catch (err) {
      console.error('❌ Failed to prepare browser DB:', err);
      renderWebDbLoadErrorScreen();
      return;
    }
    if (!browserBytes) {
      renderWebDbLoadErrorScreen();
      return;
    }
    try {
      db = new SQL.Database(browserBytes);
    } catch (err) {
      console.error('❌ Failed to open browser DB:', err);
      renderWebDbLoadErrorScreen();
      return;
    }
  }

  // Expose DB on window so other helpers can optionally reuse it if needed
  window.dbInstance = db;
  // Wire the data service door to this DB. UI must use window.dataService
  // (see js/data/index.js), not direct db.exec() calls.
  if (window.dataService && typeof window.dataService.setSqliteDb === 'function') {
    window.dataService.setSqliteDb(db);
    if (favoriteEatsShouldUseSupabaseDataDoor()) {
      window.dataService.useSupabase = recipeRowsLoadedFromDataService;
      console.info(
        '[dataService] using Supabase adapter',
      );
    }
  }
  await ensureIngredientLemmaMaintenanceInMain(db, isElectron);
  ensureRecipeTagsSchemaInMain(db);
  ensureIngredientVariantTagsSchemaInMain(db);

  initAppBar({
    mode: 'list',
    titleText: 'Recipes',
  });

  // App bar is injected async; wait before wiring menu/search/add.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const addBtnRecipes = document.getElementById('appBarAddBtn');
  const recipesActionBtn = addBtnRecipes;
  attachSecretGalleryShortcut(addBtnRecipes);

  const list = document.getElementById('recipeList');
  if (!list) return;
  ensureRecipeListServingsHeaderLabelMediaListener();
  ensureRecipeTagsSchemaInMain(db);
  ensureIngredientVariantTagsSchemaInMain(db);
  list.innerHTML = '';

  window.dbInstance = db;

  // Keyboard selection + Enter activation for list rows.
  const listNav = enableTopLevelListKeyboardNav(list);
  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: (query) => {
      searchQuery = String(query || '').toLowerCase();
      rerenderFilteredRecipes();
    },
  });
  const recipeFilterChipRail =
    typeof window.mountTopFilterChipRail === 'function' && searchInput
      ? window.mountTopFilterChipRail({
          anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
          dockId: 'recipeFilterChipDock',
        })
      : null;

  const activeTagFilters = new Set();
  let searchQuery = '';
  let recipeRows = [];
  const listRowStepper = window.listRowStepper;
  const recipeSelectionKeys = new Set();
  let recipeRowEditingKey = '';
  const recipeWebServingsUi = window.recipeWebModeServings || {};
  const recipeWebServingsChangedEventName =
    window.favoriteEatsRecipeWebServings?.changeEventName ||
    window.favoriteEatsEventNames?.recipeWebServingsChanged ||
    '';
  const isRecipeWebSelectMode = () => isForceWebModeEnabled();
  const toPositiveServingsOrNull = (rawValue) => {
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  };
  const getRecipeQtyKey = (recipeId) => String(recipeId || '').trim();
  const isRecipeSelected = (recipeId) =>
    recipeSelectionKeys.has(getRecipeQtyKey(recipeId));
  const getRecipeRowById = (recipeId) =>
    recipeRows.find((row) => Number(row?.id) === Number(recipeId)) || null;
  const primeRecipeRowServings = (recipeRow) => {
    if (!recipeRow || typeof window.recipeWebModePrimeRecipe !== 'function')
      return;
    window.recipeWebModePrimeRecipe(recipeRow);
  };
  const getRecipeRowBounds = (recipeRow) => {
    if (typeof recipeWebServingsUi.getBounds === 'function') {
      return recipeWebServingsUi.getBounds(recipeRow);
    }
    return null;
  };
  const getRecipeRowDisplayServings = (recipeRow) => {
    if (typeof recipeWebServingsUi.getDisplayValue === 'function') {
      return recipeWebServingsUi.getDisplayValue(recipeRow);
    }
    const bounds = getRecipeRowBounds(recipeRow);
    if (!bounds) return null;
    return bounds.baseDefault;
  };
  const formatRecipeRowServings = (rawValue) => {
    if (typeof recipeWebServingsUi.formatDisplay === 'function') {
      return recipeWebServingsUi.formatDisplay(rawValue);
    }
    return typeof window.formatShoppingQtyForDisplay === 'function'
      ? window.formatShoppingQtyForDisplay(rawValue)
      : String(rawValue == null ? '' : rawValue);
  };
  const initializeRecipeRowServings = (recipeRow) => {
    const bounds = getRecipeRowBounds(recipeRow);
    if (!bounds || typeof recipeWebServingsUi.applyToModel !== 'function')
      return null;
    const initial =
      bounds.baseDefault != null && bounds.baseDefault > 0
        ? bounds.baseDefault
        : 1;
    return recipeWebServingsUi.applyToModel(recipeRow, initial);
  };
  const syncRecipesActionButtonState = () => {
    if (!(recipesActionBtn instanceof HTMLButtonElement)) return;
    if (!isRecipeWebSelectMode()) {
      recipesActionBtn.disabled = false;
      recipesActionBtn.removeAttribute('aria-disabled');
      return;
    }
    const disabled = recipeSelectionKeys.size === 0;
    recipesActionBtn.disabled = disabled;
    recipesActionBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  };
  const makeRecipeStepperDOM = () => {
    const { stepper, minusBtn, qtySpan, plusBtn } =
      listRowStepper.createStepperDOM({
        decreaseLabel: 'Decrease recipe quantity',
        increaseLabel: 'Increase recipe quantity',
      });
    const qtyBtn = document.createElement('button');
    qtyBtn.type = 'button';
    qtyBtn.className = 'shopping-stepper-qty shopping-stepper-qty-button';
    qtyBtn.setAttribute('aria-label', 'Edit servings');
    qtyBtn.textContent = qtySpan.textContent || '0';
    stepper.replaceChild(qtyBtn, qtySpan);
    return { stepper, minusBtn, qtyBtn, plusBtn };
  };
  let recipeRowStepperController = null;
  const syncRecipeRowSelectionState = (rowEl, recipeRow) => {
    if (!(rowEl instanceof HTMLElement) || !recipeRow) return;
    const recipeId = recipeRow.id;
    const enabled = isRecipeWebSelectMode();
    const bounds = getRecipeRowBounds(recipeRow);
    const hasServings = !!bounds;
    const selected = isRecipeSelected(recipeId);
    const isActive =
      selected &&
      !!recipeRowStepperController?.isActive(getRecipeQtyKey(recipeId));
    const icon = rowEl.querySelector('.shopping-list-row-icon');
    const stepper = rowEl.querySelector('.shopping-list-row-stepper');
    const badge = rowEl.querySelector('.shopping-list-row-badge');
    const disabledIndicator = rowEl.querySelector(
      '.recipe-list-servings-disabled',
    );
    const qtyEl = stepper?.querySelector('.shopping-stepper-qty');
    const minusBtn = stepper?.querySelector('.shopping-stepper-btn');
    const minusIcon = minusBtn?.querySelector('.material-symbols-outlined');
    const displayServings = getRecipeRowDisplayServings(recipeRow);
    const formattedServings =
      displayServings == null ? '' : formatRecipeRowServings(displayServings);
    const shouldDeleteOnDecrease = !!(
      hasServings &&
      selected &&
      bounds?.canAdjust &&
      displayServings != null &&
      Math.abs(displayServings - bounds.min) < 1e-9
    );

    rowEl.dataset.recipeServingsAvailable = hasServings ? 'true' : 'false';
    rowEl.dataset.recipeSelected =
      enabled && selected && hasServings ? 'true' : 'false';
    rowEl.classList.toggle(
      'shopping-row-checked',
      enabled && selected && hasServings,
    );

    const servingsSlot = rowEl.querySelector('.recipe-list-servings-slot');
    if (servingsSlot) {
      servingsSlot.classList.toggle(
        'recipe-list-servings-slot--collapsed-hit',
        !!(enabled && hasServings && !isActive),
      );
    }

    if (qtyEl) qtyEl.textContent = formattedServings;
    if (badge) {
      listRowStepper.setShoppingListBadgeQtyLabel(badge, formattedServings);
    }
    if (minusBtn) {
      minusBtn.setAttribute(
        'aria-label',
        shouldDeleteOnDecrease
          ? 'Remove recipe selection'
          : 'Decrease servings',
      );
    }
    if (minusIcon)
      minusIcon.textContent = shouldDeleteOnDecrease ? 'delete' : 'remove';

    if (!enabled) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = 'none';
      if (badge) badge.style.display = 'none';
      if (disabledIndicator) disabledIndicator.style.display = 'none';
      return;
    }

    if (!hasServings) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = 'none';
      if (badge) badge.style.display = 'none';
      if (disabledIndicator) disabledIndicator.style.display = 'inline-flex';
      return;
    }

    if (disabledIndicator) disabledIndicator.style.display = 'none';
    if (isActive) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = 'inline-flex';
      if (badge) badge.style.display = 'none';
      return;
    }

    if (selected) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = 'none';
      if (badge) badge.style.display = 'inline-flex';
      return;
    }

    if (icon) icon.style.display = '';
    if (stepper) stepper.style.display = 'none';
    if (badge) badge.style.display = 'none';
  };
  const setRecipeSelected = (
    recipeId,
    isSelected,
    { activate = false } = {},
  ) => {
    const recipeKey = getRecipeQtyKey(recipeId);
    const recipeRow = getRecipeRowById(recipeId);
    if (!recipeKey || !recipeRow) return;
    if (isSelected) recipeSelectionKeys.add(recipeKey);
    else recipeSelectionKeys.delete(recipeKey);
    setShoppingPlanRecipeSelection({
      recipeId,
      title: recipeRow?.title || '',
      quantity: isSelected ? 1 : 0,
    });
    if (isSelected && activate) {
      recipeRowStepperController?.activate(recipeKey);
    } else if (!isSelected && recipeRowStepperController?.isActive(recipeKey)) {
      recipeRowStepperController.collapseActive();
    }
    if (!isSelected && recipeRowEditingKey === recipeKey) {
      recipeRowEditingKey = '';
    }
    syncRecipesActionButtonState();
    rerenderFilteredRecipes();
  };
  const collapseRecipeSelectionUi = () => {
    const changed = !!recipeRowStepperController?.collapseAll?.();
    if (changed) rerenderFilteredRecipes();
  };
  const hydrateRecipeSelectionsFromPlan = () => {
    Object.values(getShoppingPlanRecipeSelections()).forEach((entry) => {
      const recipeId = Number(entry?.recipeId);
      const quantity = Math.max(0, Math.min(99, Number(entry?.quantity || 0)));
      if (!Number.isFinite(recipeId) || recipeId <= 0) return;
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      recipeSelectionKeys.add(getRecipeQtyKey(recipeId));
      if (quantity !== 1) {
        setShoppingPlanRecipeSelection({
          recipeId,
          title: String(entry?.title || '').trim(),
          quantity: 1,
        });
      }
    });
  };

  const loadRecipeRows = () => {
    const recipesQ = db.exec(
      `
        SELECT ID, title, servings_default, servings_min, servings_max
        FROM recipes
        ORDER BY title COLLATE NOCASE;
      `,
    );
    const rows = recipesQ.length ? recipesQ[0].values : [];
    const out = rows.map(
      ([id, title, servingsDefault, servingsMin, servingsMax]) => {
        const normalizedDefault = toPositiveServingsOrNull(servingsDefault);
        return {
          id: Number(id),
          title: String(title || ''),
          tags: [],
          servingsDefault: normalizedDefault,
          servings: {
            default: normalizedDefault,
            min: toPositiveServingsOrNull(servingsMin),
            max: toPositiveServingsOrNull(servingsMax),
          },
        };
      },
    );
    const byRecipe = new Map();
    out.forEach((r) => byRecipe.set(r.id, r));

    try {
      const tagsQ = db.exec(`
        SELECT m.recipe_id, t.name
        FROM recipe_tag_map m
        JOIN tags t ON t.id = m.tag_id
        WHERE COALESCE(t.is_hidden, 0) = 0
        ORDER BY m.recipe_id, COALESCE(m.sort_order, 999999), m.id, t.name COLLATE NOCASE;
      `);
      if (tagsQ.length) {
        tagsQ[0].values.forEach(([recipeIdRaw, tagNameRaw]) => {
          const recipeId = Number(recipeIdRaw);
          const row = byRecipe.get(recipeId);
          if (!row) return;
          const nextTag = String(tagNameRaw || '').trim();
          if (!nextTag) return;
          if (row.tags.some((t) => t.toLowerCase() === nextTag.toLowerCase()))
            return;
          row.tags.push(nextTag);
        });
      }
    } catch (_) {}

    return out;
  };

  const renderTagFilterChips = (rows) => {
    const chipMountEl = recipeFilterChipRail?.trackEl;
    if (!chipMountEl) return;
    const names = [];
    const seen = new Set();
    (rows || []).forEach((r) => {
      (Array.isArray(r.tags) ? r.tags : []).forEach((name) => {
        const key = String(name || '')
          .trim()
          .toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        names.push(String(name || '').trim());
      });
    });
    names.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips: names.map((name) => ({
        id: String(name || '').toLowerCase(),
        label: String(name || ''),
        disabled: false,
      })),
      activeChipIds: activeTagFilters,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        if (!key) return;
        if (activeTagFilters.has(key)) activeTagFilters.delete(key);
        else activeTagFilters.add(key);
        rerenderFilteredRecipes();
      },
      chipClassName: 'app-filter-chip',
    });
  };

  const getFilteredRecipeRows = () => {
    const q = searchQuery;
    return recipeRows.filter((row) => {
      const titleText = row.title.toLowerCase();
      const tags = Array.isArray(row.tags) ? row.tags : [];
      const tagsInline = tags.join(' ').toLowerCase();
      const searchMatches =
        !q || titleText.includes(q) || tagsInline.includes(q);
      if (!searchMatches) return false;
      if (!activeTagFilters.size) return true;
      const rowKeys = new Set(tags.map((t) => t.toLowerCase()));
      for (const k of activeTagFilters) {
        if (rowKeys.has(k)) return true;
      }
      return false;
    });
  };

  // 🔹 Helper to render a given set of recipes
  function renderRecipeList(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      renderTopLevelEmptyState(list, 'recipes');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    if (isForceWebModeEnabled()) {
      const headerLi = document.createElement('li');
      headerLi.className = 'recipe-list-servings-header';
      headerLi.setAttribute('aria-hidden', 'true');
      const headerSpacer = document.createElement('span');
      headerSpacer.className =
        'recipe-list-title shopping-list-row-label recipe-list-servings-header-spacer';
      headerSpacer.textContent = '';
      const headerSlot = document.createElement('span');
      headerSlot.className = 'recipe-list-servings-slot';
      const headerLabel = document.createElement('span');
      headerLabel.className = 'recipe-list-servings-header-label';
      syncRecipeListServingsHeaderLabelText(headerLabel);
      headerSlot.appendChild(headerLabel);
      headerLi.appendChild(headerSpacer);
      headerLi.appendChild(headerSlot);
      list.appendChild(headerLi);
    }

    items.forEach((row) => {
      const id = row.id;
      const title = row.title;
      primeRecipeRowServings(row);
      const li = document.createElement('li');
      const titleSpan = document.createElement('span');
      titleSpan.className = 'shopping-list-row-label';
      const titleHit = document.createElement('span');
      titleHit.className = 'recipe-list-title recipe-list-title-hit';
      titleHit.textContent = title || '';
      titleSpan.appendChild(titleHit);
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined shopping-list-row-icon';
      icon.textContent = 'add_box';
      icon.setAttribute('aria-hidden', 'true');
      const { stepper, minusBtn, qtyBtn, plusBtn } = makeRecipeStepperDOM();
      const badge = document.createElement('span');
      badge.className = 'shopping-list-row-badge';
      badge.style.display = 'none';
      const disabledIndicator = document.createElement('span');
      disabledIndicator.className =
        'material-symbols-outlined recipe-list-servings-disabled';
      disabledIndicator.textContent = 'add_box';
      disabledIndicator.setAttribute('aria-hidden', 'true');
      const slot = document.createElement('span');
      slot.className = 'recipe-list-servings-slot';
      slot.appendChild(icon);
      slot.appendChild(stepper);
      slot.appendChild(badge);
      slot.appendChild(disabledIndicator);
      li.appendChild(titleSpan);
      li.appendChild(slot);
      const recipeKey = getRecipeQtyKey(id);
      li.dataset.recipeRowStepperKey = recipeKey;
      syncRecipeRowSelectionState(li, row);

      const consumeRowStepperEvent = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      const startInlineServingsEdit = () => {
        if (!isRecipeWebSelectMode() || !isRecipeSelected(id)) return;
        if (recipeRowEditingKey === recipeKey) return;
        recipeRowEditingKey = recipeKey;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'shopping-stepper-qty shopping-stepper-qty-input';
        input.inputMode = 'decimal';
        input.setAttribute('aria-label', 'Servings value');
        const fallbackValue = getRecipeRowDisplayServings(row);
        input.value =
          fallbackValue == null
            ? ''
            : Number.isInteger(fallbackValue)
              ? String(fallbackValue)
              : String(fallbackValue);
        stepper.replaceChild(input, qtyBtn);
        input.focus();
        input.select();

        let cancelled = false;
        const finishEdit = (shouldCommit) => {
          if (recipeRowEditingKey === recipeKey) {
            recipeRowEditingKey = '';
          }
          if (
            shouldCommit &&
            typeof recipeWebServingsUi.commitInputValue === 'function'
          ) {
            recipeWebServingsUi.commitInputValue(row, input.value, {
              fallbackValue,
            });
          }
          rerenderFilteredRecipes();
        };

        input.addEventListener('click', consumeRowStepperEvent);
        input.addEventListener('pointerdown', (event) =>
          event.stopPropagation(),
        );
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            consumeRowStepperEvent(event);
            input.blur();
          } else if (event.key === 'Escape') {
            consumeRowStepperEvent(event);
            cancelled = true;
            finishEdit(false);
          }
        });
        input.addEventListener('blur', () => {
          if (cancelled) return;
          finishEdit(true);
        });
      };

      slot.addEventListener('click', (event) => {
        if (!isRecipeWebSelectMode()) return;
        if (!getRecipeRowBounds(row)) return;
        if (disabledIndicator.contains(event.target)) return;

        const isStepperVisible = stepper.style.display === 'inline-flex';
        if (isStepperVisible && stepper.contains(event.target)) return;

        const selectedNow = isRecipeSelected(id);
        const stepperActive = !!recipeRowStepperController?.isActive(recipeKey);
        if (isStepperVisible && stepperActive) {
          consumeRowStepperEvent(event);
          return;
        }

        consumeRowStepperEvent(event);

        if (!selectedNow) {
          initializeRecipeRowServings(row);
          setRecipeSelected(id, true, { activate: true });
        } else {
          recipeRowStepperController?.activate(recipeKey);
          rerenderFilteredRecipes();
        }
      });
      slot.addEventListener('pointerdown', (event) => {
        if (!isRecipeWebSelectMode()) return;
        if (!getRecipeRowBounds(row)) return;
        if (disabledIndicator.contains(event.target)) return;
        if (
          stepper.style.display === 'inline-flex' &&
          stepper.contains(event.target)
        )
          return;
        event.stopPropagation();
      });
      disabledIndicator.addEventListener('click', consumeRowStepperEvent);
      disabledIndicator.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      stepper.addEventListener('click', (event) => event.stopPropagation());
      stepper.addEventListener('pointerdown', (event) =>
        event.stopPropagation(),
      );
      qtyBtn.addEventListener('click', (event) => {
        consumeRowStepperEvent(event);
        startInlineServingsEdit();
      });

      minusBtn.addEventListener('click', (event) => {
        consumeRowStepperEvent(event);
        if (!isRecipeWebSelectMode()) return;
        if (!isRecipeSelected(id)) {
          if (recipeRowStepperController?.isActive(recipeKey)) {
            recipeRowStepperController.collapseActive();
            rerenderFilteredRecipes();
          }
          return;
        }
        const bounds = getRecipeRowBounds(row);
        const displayServings = getRecipeRowDisplayServings(row);
        if (!bounds || displayServings == null) return;
        if (bounds.canAdjust && Math.abs(displayServings - bounds.min) < 1e-9) {
          setRecipeSelected(id, false);
          return;
        }
        const nextValue =
          typeof recipeWebServingsUi.getNextValue === 'function'
            ? recipeWebServingsUi.getNextValue(row, -1)
            : null;
        if (
          nextValue == null ||
          typeof recipeWebServingsUi.applyToModel !== 'function'
        )
          return;
        recipeWebServingsUi.applyToModel(row, nextValue);
        rerenderFilteredRecipes();
      });

      plusBtn.addEventListener('click', (event) => {
        consumeRowStepperEvent(event);
        if (!isRecipeWebSelectMode() || !isRecipeSelected(id)) return;
        const nextValue =
          typeof recipeWebServingsUi.getNextValue === 'function'
            ? recipeWebServingsUi.getNextValue(row, 1)
            : null;
        if (
          nextValue == null ||
          typeof recipeWebServingsUi.applyToModel !== 'function'
        )
          return;
        recipeWebServingsUi.applyToModel(row, nextValue);
        rerenderFilteredRecipes();
      });

      const bounds = getRecipeRowBounds(row);
      const displayServings = getRecipeRowDisplayServings(row);
      const atOrAboveMax =
        bounds &&
        displayServings != null &&
        displayServings >= bounds.max - 1e-9;
      minusBtn.disabled =
        !bounds || displayServings == null || !bounds.canAdjust;
      plusBtn.disabled =
        !bounds || displayServings == null || !bounds.canAdjust || atOrAboveMax;

      // Row-level hit target: open recipe from padding, label, gaps — not the servings column.
      li.addEventListener('click', (event) => {
        if (slot.contains(event.target)) return;
        // Treat Ctrl-click / Cmd-click as "delete"
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          void deleteRecipeWithConfirm(db, id, title);
          return;
        }

        collapseRecipeSelectionUi();
        sessionStorage.setItem('selectedRecipeId', id);
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
      });

      // Right-click / two-finger click → delete dialog as well
      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        void deleteRecipeWithConfirm(db, id, title);
      });

      list.appendChild(li);
    });

    // Keep selection valid after rerender (search/filter changes).
    listNav?.syncAfterRender?.();
  }

  const rerenderFilteredRecipes = () => {
    const filtered = getFilteredRecipeRows();
    renderTagFilterChips(recipeRows);
    renderRecipeList(filtered);
  };

  recipeRowStepperController = listRowStepper.createController({
    listEl: list,
    isEnabled: isRecipeWebSelectMode,
    collapseExpanded: () => {
      if (!recipeRowEditingKey) return false;
      recipeRowEditingKey = '';
      return true;
    },
    idleCollapseMs: 3500,
    onIdleCollapse: rerenderFilteredRecipes,
    idleResetActivity: (target, activeKey) => {
      if (!(target instanceof Element)) return false;
      const row = target.closest('li');
      if (!row || !list.contains(row)) return false;
      return String(row.dataset.recipeRowStepperKey || '') === activeKey;
    },
  });
  recipeRowStepperController.bindAutoDismiss({
    onDismissed: rerenderFilteredRecipes,
  });
  window.addEventListener('pageshow', collapseRecipeSelectionUi);
  if (recipeWebServingsChangedEventName) {
    window.addEventListener(recipeWebServingsChangedEventName, () => {
      rerenderFilteredRecipes();
    });
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== window.favoriteEatsStorageKeys?.recipeWebServings) return;
    rerenderFilteredRecipes();
  });

  // Read recipes via the data service door (see js/data/contracts/listRecipes.md).
  // The legacy loadRecipeRows() function below is kept for now but is no longer
  // called; it will be deleted once the door covers all read paths used here.
  if (!recipeRowsLoadedFromDataService) {
    try {
      recipeRows = await window.dataService.listRecipes();
    } catch (err) {
      console.error('dataService.listRecipes failed:', err);
      recipeRows = [];
    }
  } else {
    recipeRows = Array.isArray(prefetchedRecipeRows)
      ? prefetchedRecipeRows
      : [];
  }
  hydrateRecipeSelectionsFromPlan();
  syncRecipesActionButtonState();
  rerenderFilteredRecipes();

  // --- Recipes action button stub ---

  async function openCreateRecipeDialog(db) {
    if (!db || !window.ui) return;
    const vals = await window.ui.form({
      title: 'New Recipe',
      fields: [
        {
          key: 'title',
          label: 'Title',
          value: '',
          required: true,
          normalize: (v) => (v || '').trim(),
        },
      ],
      confirmText: 'Create',
      cancelText: 'Cancel',
      validate: (v) => {
        if (!v.title || !v.title.trim()) return 'Title is required.';
        return '';
      },
    });
    if (!vals) return;

    const title = vals.title;
    let newId = null;
    try {
      db.run(
        'INSERT INTO recipes (title, servings_min, servings_max) VALUES (?, ?, ?);',
        [title, 0.5, 99],
      );
      const idQ = db.exec('SELECT last_insert_rowid();');
      if (idQ.length && idQ[0].values.length) {
        newId = idQ[0].values[0][0];
      }
    } catch (err) {
      console.error('❌ Failed to create recipe:', err);
      window.ui.toast({ message: 'Failed to create recipe. See console.' });
      return;
    }

    // Persist DB so editor + list can see the new recipe
    try {
      await persistDbForCurrentRuntime(db, {
        isElectron: !!window.electronAPI,
        failureMessage: 'Failed to save database after creating recipe.',
      });
    } catch (err) {
      console.error('❌ Failed to persist DB after creating recipe:', err);
      window.ui.toast({
        message: 'Failed to save database after creating recipe.',
      });
      return;
    }

    if (newId != null) {
      sessionStorage.setItem('selectedRecipeId', newId);
      sessionStorage.setItem('selectedRecipeIsNew', '1');
      window.location.href =
        favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
    }
  }

  // Delete a recipe and all dependent rows in child tables.
  function deleteRecipeDeep(db, recipeId) {
    // Remove instructions for this recipe
    db.run('DELETE FROM recipe_steps WHERE recipe_id = ?;', [recipeId]);

    // Remove any sections owned by this recipe
    db.run('DELETE FROM recipe_sections WHERE recipe_id = ?;', [recipeId]);

    // Remove ingredient mappings (substitutes are ON DELETE CASCADE from this)
    db.run('DELETE FROM recipe_ingredient_map WHERE recipe_id = ?;', [
      recipeId,
    ]);
    // Remove recipe tag mappings.
    try {
      db.run('DELETE FROM recipe_tag_map WHERE recipe_id = ?;', [recipeId]);
    } catch (_) {}

    // Finally remove the recipe itself
    db.run('DELETE FROM recipes WHERE ID = ?;', [recipeId]);
  }

  async function deleteRecipeWithConfirm(db, recipeId, title) {
    if (!db || recipeId == null || !window.ui) return;
    const ok = await window.ui.confirm({
      title: 'Delete Recipe',
      message: `Delete "${title}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;

    try {
      deleteRecipeDeep(db, recipeId);
    } catch (err) {
      console.error('❌ Failed to delete recipe:', err);
      window.ui.toast({ message: 'Failed to delete recipe. See console.' });
      return;
    }

    try {
      await persistDbForCurrentRuntime(db, {
        isElectron: !!window.electronAPI,
        failureMessage: 'Failed to save database after deleting recipe.',
      });
    } catch (err) {
      console.error('❌ Failed to persist DB after deleting recipe:', err);
      window.ui.toast({
        message: 'Failed to save database after deleting recipe.',
      });
      return;
    }

    recipeRows = recipeRows.filter((r) => Number(r.id) !== Number(recipeId));
    rerenderFilteredRecipes();
  }

  const onRecipesActionClick = () => {
    if (isRecipeWebSelectMode()) {
      if (!recipeSelectionKeys.size) {
        uiToast('No recipe selections to clear.');
        return;
      }
      const previousPlan = cloneForUndo(getShoppingPlan(), () =>
        createEmptyShoppingPlan(),
      );
      const previousRecipeSelections = new Set(recipeSelectionKeys);
      const restoreClearedRecipes = () => {
        persistShoppingPlan(previousPlan);
        recipeSelectionKeys.clear();
        previousRecipeSelections.forEach((key) => {
          recipeSelectionKeys.add(key);
        });
        recipeRowEditingKey = '';
        recipeRowStepperController?.collapseAll?.();
        syncRecipesActionButtonState();
        rerenderFilteredRecipes();
      };
      clearShoppingPlanSelections({ clearRecipes: true });
      recipeSelectionKeys.clear();
      recipeRowEditingKey = '';
      recipeRowStepperController?.collapseAll?.();
      syncRecipesActionButtonState();
      rerenderFilteredRecipes();
      uiToastUndo('Recipe selections cleared.', restoreClearedRecipes);
    } else {
      void openCreateRecipeDialog(db);
    }
  };
  const syncRecipesAppBarActionChrome = () => {
    if (!recipesActionBtn) return;
    if (isRecipeWebSelectMode()) {
      ensureAppBarTextActionPair(recipesActionBtn, 'Reset', 'restart_alt');
    } else {
      ensureAppBarTextActionPair(recipesActionBtn, 'Add', 'add');
    }
    syncRecipesActionButtonState();
  };
  if (recipesActionBtn) {
    syncRecipesAppBarActionChrome();
    recipesActionBtn.addEventListener('click', onRecipesActionClick);
    window.addEventListener(
      FAVORITE_EATS_FORCE_WEB_MODE_EVENT,
      () => {
        if (!document.body.classList.contains('recipes-page')) return;
        syncRecipesAppBarActionChrome();
        rerenderFilteredRecipes();
      },
    );
  }
}

// --- Shopping / Units / Stores loaders (v0 stubs) ---
async function loadShoppingPage() {
  const list = document.getElementById('shoppingList');

  initAppBar({
    mode: 'list',
    titleText: 'Items',
  });

  // App bar is injected async; wait before wiring menu/search/add.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: () => {
      applyShoppingFilters();
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');
  const listRowStepper = window.listRowStepper;

  if (!list) return;

  // Keyboard selection + Enter activation for list rows.
  const listNav = enableTopLevelListKeyboardNav(list);
  const rememberShoppingScrollForReload = () => {
    try {
      const y = Number(window.scrollY || window.pageYOffset || 0);
      sessionStorage.setItem(SHOPPING_SCROLL_RESTORE_SESSION_KEY, String(y));
    } catch (_) {}
  };
  const restoreShoppingScrollAfterReload = () => {
    let targetY = null;
    try {
      const raw = sessionStorage.getItem(SHOPPING_SCROLL_RESTORE_SESSION_KEY);
      sessionStorage.removeItem(SHOPPING_SCROLL_RESTORE_SESSION_KEY);
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) targetY = parsed;
    } catch (_) {}
    if (targetY === null) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.scrollTo({ top: targetY, behavior: 'auto' });
        } catch (_) {
          window.scrollTo(0, targetY);
        }
      });
    });
  };
  const consumeShoppingNavTarget = () => {
    try {
      const rawId = sessionStorage.getItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetId,
      );
      const rawName = sessionStorage.getItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetName,
      );
      sessionStorage.removeItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetId,
      );
      sessionStorage.removeItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetName,
      );
      const targetId = Number(rawId);
      const targetName = String(rawName || '')
        .trim()
        .toLowerCase();
      if ((!Number.isFinite(targetId) || targetId <= 0) && !targetName) {
        return null;
      }
      return {
        id:
          Number.isFinite(targetId) && targetId > 0
            ? Math.trunc(targetId)
            : null,
        name: targetName || '',
      };
    } catch (_) {
      return null;
    }
  };
  const shoppingNavTargetCleanupTimers = new WeakMap();
  const pulseShoppingNavTargetRow = (row) => {
    if (!(row instanceof HTMLElement)) return;
    const existingTimer = shoppingNavTargetCleanupTimers.get(row);
    if (existingTimer) window.clearTimeout(existingTimer);
    const cleanup = () => {
      row.classList.remove('shopping-nav-target');
      shoppingNavTargetCleanupTimers.delete(row);
    };
    row.classList.remove('shopping-nav-target');
    void row.offsetWidth;
    row.classList.add('shopping-nav-target');
    row.addEventListener('animationend', cleanup, { once: true });
    const timeoutId = window.setTimeout(cleanup, 1400);
    shoppingNavTargetCleanupTimers.set(row, timeoutId);
  };
  const scrollToShoppingNavTarget = (target) => {
    if (!target) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const row = Array.from(list.querySelectorAll('li')).find((li) => {
            const itemId = Number(li.dataset.shoppingItemId || '');
            if (
              Number.isFinite(itemId) &&
              itemId > 0 &&
              Number.isFinite(target.id) &&
              itemId === target.id
            ) {
              return true;
            }
            const key = String(
              li.dataset.shoppingStepperKey ||
                li.dataset.variantParentKey ||
                '',
            )
              .trim()
              .toLowerCase();
            if (!key) return false;
            if (target.name && key === target.name) return true;
            return false;
          });
          if (!(row instanceof HTMLElement)) return;
          row.scrollIntoView({ block: 'center', behavior: 'auto' });
          pulseShoppingNavTargetRow(row);
        } catch (_) {}
      });
    });
  };
  const pendingShoppingNavTarget = consumeShoppingNavTarget();

  attachSecretGalleryShortcut(addBtn);

  const getShoppingEditorHref = () => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const adapterParam = params.get('adapter');
      if (adapterParam) {
        return `shoppingEditor.html?adapter=${encodeURIComponent(adapterParam)}`;
      }
    } catch (_) {}
    return 'shoppingEditor.html';
  };

  let shoppingRows = [];
  /** Tag filter dropdown options for Items page (ids use {@link SHOPPING_TAG_FILTER_PREFIX}). */
  let shoppingTagChipOptionDefs = [];
  let shoppingRowsLoadedFromDataService = false;
  const dataServiceShoppingItemToPageRow = (item) => {
    const removedVariants = Array.isArray(item?.removedVariants)
      ? item.removedVariants
      : [];
    return {
      ...item,
      variants: Array.isArray(item?.variants) ? item.variants : [],
      variantIdByName:
        item?.variantIdByName && typeof item.variantIdByName === 'object'
          ? item.variantIdByName
          : null,
      variantDeprecatedSet: new Set(
        removedVariants
          .map((name) =>
            String(name || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
      isDeprecated: !!item?.isRemoved,
      tags: Array.isArray(item?.tags) ? item.tags : [],
      recipeUseCount: Number(item?.recipeUseCount || 0),
      aisleUseCount: Number(item?.aisleUseCount || 0),
    };
  };

  // Supabase-first items list (web default), then SQLite.
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listShoppingItems === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      const rows = await window.dataService.listShoppingItems();
      shoppingRows = (Array.isArray(rows) ? rows : []).map(
        dataServiceShoppingItemToPageRow,
      );
      shoppingRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listShoppingItems', err);
      window.dataService.useSupabase = false;
      shoppingRows = [];
      shoppingRowsLoadedFromDataService = false;
    }
  }

  // --- Load DB (mirror recipe loaders) ---
  const isElectron = !!window.electronAPI;
  let db;
  attachSecretGalleryShortcut(addBtn);

  if (isElectron) {
    try {
      const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
      const bytes = await window.electronAPI.loadDB(pathHint);
      const Uints = new Uint8Array(bytes);
      db = new SQL.Database(Uints);
    } catch (err) {
      console.error('❌ Failed to load DB from disk:', err);
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  } else {
    try {
      db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
    } catch (err) {
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  }

  // Expose DB globally for any future helpers
  window.dbInstance = db;
  if (window.dataService && typeof window.dataService.setSqliteDb === 'function') {
    window.dataService.setSqliteDb(db);
    if (favoriteEatsShouldUseSupabaseDataDoor()) {
      window.dataService.useSupabase = shoppingRowsLoadedFromDataService;
      console.info(
        '[dataService] using Supabase adapter',
      );
    }
  }
  await ensureIngredientLemmaMaintenanceInMain(db, isElectron);

  if (
    !shoppingRowsLoadedFromDataService &&
    window.dataService &&
    typeof window.dataService.listShoppingItems === 'function'
  ) {
    try {
      const rows = await window.dataService.listShoppingItems();
      shoppingRows = (Array.isArray(rows) ? rows : []).map(
        dataServiceShoppingItemToPageRow,
      );
      shoppingRowsLoadedFromDataService = true;
    } catch (err) {
      console.error('dataService.listShoppingItems failed:', err);
      uiToast('Failed to load items.');
      shoppingRows = [];
    }
  }

  // --- Load shopping items from ingredients table ---
  // Prefer is_deprecated when available; fall back to legacy hide_from_shopping_list.
  const tableExists = (name) => {
    try {
      const q = db.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`,
        [name],
      );
      return !!(q.length && q[0].values && q[0].values.length);
    } catch (_) {
      return false;
    }
  };

  const tableHasColumn = (tableName, columnName) => {
    try {
      const q = db.exec(`PRAGMA table_info(${tableName});`);
      const rows =
        Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
          ? q[0].values
          : [];
      const cols = rows
        .map((r) => (Array.isArray(r) ? String(r[1] || '').toLowerCase() : ''))
        .filter(Boolean);
      return cols.includes(String(columnName || '').toLowerCase());
    } catch (_) {
      return false;
    }
  };

  const hasVariantTable = tableExists('ingredient_variants');

  if (!shoppingRowsLoadedFromDataService) {
    // When available, prefer the list table so Shopping can display multiple variants.
    const hasVariantHomeLocationCol =
      hasVariantTable && tableHasColumn('ingredient_variants', 'home_location');
    const hasVariantIsDeprecatedCol =
      hasVariantTable &&
      tableHasColumn('ingredient_variants', 'is_deprecated');
    const variantRowDepExpr = hasVariantIsDeprecatedCol
      ? 'COALESCE(v.is_deprecated, 0)'
      : '0';
    const hasIsDeprecatedCol = tableHasColumn('ingredients', 'is_deprecated');
    const hasIsHiddenCol = tableHasColumn('ingredients', 'is_hidden');
    const hasIsFoodCol = tableHasColumn('ingredients', 'is_food');
    const hasLemmaCol = tableHasColumn('ingredients', 'lemma');
    const hasPluralByDefaultCol = tableHasColumn(
      'ingredients',
      'plural_by_default',
    );
    const hasIsMassNounCol = tableHasColumn('ingredients', 'is_mass_noun');
    const hasPluralOverrideCol = tableHasColumn('ingredients', 'plural_override');
    const hasLegacyHideCol = tableHasColumn(
      'ingredients',
      'hide_from_shopping_list',
    );
    const deprecatedExpr = hasIsDeprecatedCol
      ? 'COALESCE(i.is_deprecated, 0)'
      : hasLegacyHideCol
        ? 'COALESCE(i.hide_from_shopping_list, 0)'
        : '0';
    const homeExpr = hasVariantHomeLocationCol
      ? `(SELECT COALESCE(iv_base.home_location, 'none')
        FROM ingredient_variants iv_base
       WHERE iv_base.ingredient_id = i.ID
         AND ${getIngredientBaseVariantWhereSql('iv_base.variant')}
       ORDER BY
         CASE
           WHEN lower(trim(COALESCE(iv_base.variant, ''))) = '${INGREDIENT_BASE_VARIANT_NAME}'
             THEN 0
           ELSE 1
         END,
         iv_base.id ASC
       LIMIT 1)`
      : "'none'";
    const variantHomeExpr = hasVariantHomeLocationCol
      ? "COALESCE(v.home_location, 'none')"
      : homeExpr;
    const isFoodExpr = hasIsFoodCol ? 'COALESCE(i.is_food, 1)' : '1';
    const isHiddenExpr = hasIsHiddenCol ? 'COALESCE(i.is_hidden, 0)' : '0';
    const lemmaExpr = hasLemmaCol ? "COALESCE(i.lemma, '')" : "''";
    const pluralByDefaultExpr = hasPluralByDefaultCol
      ? 'COALESCE(i.plural_by_default, 0)'
      : '0';
    const isMassNounExpr = hasIsMassNounCol ? 'COALESCE(i.is_mass_noun, 0)' : '0';
    const pluralOverrideExpr = hasPluralOverrideCol
      ? "COALESCE(i.plural_override, '')"
      : "''";
    const baseSelectSql = hasVariantTable
      ? `
      SELECT i.ID,
             i.name,
             COALESCE(v.variant, i.variant) AS variant,
             ${deprecatedExpr} AS is_deprecated,
             ${isHiddenExpr} AS is_hidden,
             ${homeExpr} AS home_location,
             ${variantHomeExpr} AS variant_home_location,
             ${isFoodExpr} AS is_food,
             ${lemmaExpr} AS lemma,
             ${pluralByDefaultExpr} AS plural_by_default,
             ${isMassNounExpr} AS is_mass_noun,
             ${pluralOverrideExpr} AS plural_override,
             ${variantRowDepExpr} AS v_is_deprecated,
             v.id AS ingredient_variant_id
      FROM ingredients i
      LEFT JOIN ingredient_variants v ON v.ingredient_id = i.ID
    `
      : `
      SELECT i.ID,
             i.name,
             i.variant,
             ${deprecatedExpr} AS is_deprecated,
             ${isHiddenExpr} AS is_hidden,
             ${homeExpr} AS home_location,
             ${homeExpr} AS variant_home_location,
             ${isFoodExpr} AS is_food,
             ${lemmaExpr} AS lemma,
             ${pluralByDefaultExpr} AS plural_by_default,
             ${isMassNounExpr} AS is_mass_noun,
             ${pluralOverrideExpr} AS plural_override,
             0 AS v_is_deprecated,
             NULL AS ingredient_variant_id
      FROM ingredients i
    `;

    const result = db.exec(`
    ${baseSelectSql}
    ORDER BY
      i.name COLLATE NOCASE
      ${
        hasVariantTable
          ? ', i.ID ASC, COALESCE(v.sort_order, 999999) ASC, COALESCE(v.id, 999999) ASC'
          : ''
      };
  `);

    // Normalize into the same shape the UI already expects, but
    // aggregate variants by ingredient name so each name appears once.
    if (result.length > 0) {
      const rawRows = result[0].values.map(
      ([
        id,
        name,
        variant,
        isDeprecated,
        isHidden,
        locationAtHome,
        variantLocationAtHome,
        isFood,
        lemma,
        pluralByDefault,
        isMassNoun,
        pluralOverride,
        vIsDeprecated,
        ingredientVariantId,
      ]) => ({
        id,
        name,
        variant: normalizeNamedIngredientVariant(variant),
        isDeprecated: Number(isDeprecated || 0) === 1,
        isHidden: Number(isHidden || 0) === 1,
        locationAtHome: String(locationAtHome || ''),
        variantLocationAtHome: String(variantLocationAtHome || ''),
        isFood: Number(isFood ?? 1) === 1,
        lemma: String(lemma || '').trim(),
        pluralByDefault: Number(pluralByDefault || 0) === 1,
        isMassNoun: Number(isMassNoun || 0) === 1,
        pluralOverride: String(pluralOverride || '').trim(),
        vIsDeprecated: Number(vIsDeprecated || 0) === 1,
        ingredientVariantId: ingredientVariantId == null
          ? null
          : Number(ingredientVariantId),
      }),
      );

      const byName = new Map();

    rawRows.forEach((row) => {
      const key = String(row.name || '')
        .trim()
        .toLowerCase();
      if (!key) return;

      if (!byName.has(key)) {
        byName.set(key, {
          id: row.id,
          name: row.name || '',
          variants: [],
          recentSortId: Number.isFinite(Number(row.id)) ? Number(row.id) : 0,
          recipeUseCount: 0,
          aisleUseCount: 0,
          _deprecatedFlags: [],
          _hiddenFlags: [],
          _homeLocations: [],
          _variantHomeLocations: [],
          _foodFlags: [],
          _lemmas: [],
          _pluralByDefaultFlags: [],
          _isMassNounFlags: [],
          _pluralOverrides: [],
          _vDepMap: new Map(),
        });
      }

      if (row.variant) {
        byName.get(key).variants.push(row.variant);
        byName.get(key)._variantHomeLocations.push({
          variant: row.variant,
          homeLocation: String(row.variantLocationAtHome || ''),
        });
        const vk = String(row.variant).trim().toLowerCase();
        if (vk) {
          const prev = byName.get(key)._vDepMap.get(vk) || false;
          byName.get(key)._vDepMap.set(
            vk,
            prev || !!row.vIsDeprecated,
          );
        }
        if (hasVariantTable) {
          const rid = Number(row.ingredientVariantId);
          if (Number.isFinite(rid) && rid > 0) {
            const ent = byName.get(key);
            if (!ent.variantIdByName) {
              ent.variantIdByName = Object.create(null);
            }
            ent.variantIdByName[vk] = Math.trunc(rid);
          }
        }
      }
      byName.get(key).recentSortId = Math.max(
        Number(byName.get(key).recentSortId) || 0,
        Number.isFinite(Number(row.id)) ? Number(row.id) : 0,
      );
      byName.get(key)._deprecatedFlags.push(!!row.isDeprecated);
      byName.get(key)._hiddenFlags.push(!!row.isHidden);
      byName.get(key)._homeLocations.push(String(row.locationAtHome || ''));
      byName.get(key)._foodFlags.push(row.isFood !== false);
      byName.get(key)._lemmas.push(String(row.lemma || '').trim());
      byName.get(key)._pluralByDefaultFlags.push(!!row.pluralByDefault);
      byName.get(key)._isMassNounFlags.push(!!row.isMassNoun);
      byName
        .get(key)
        ._pluralOverrides.push(String(row.pluralOverride || '').trim());
    });

    // Dedupe variants, then flatten into an array.
    // - If we have `ingredient_variants`, preserve list order (sort_order) from DB.
    // - Otherwise, fall back to alphabetical sorting for stability.
    shoppingRows = Array.from(byName.values()).map((item) => {
      if (Array.isArray(item.variants) && item.variants.length > 0) {
        const cleaned = item.variants
          .map((v) => (v || '').trim())
          .filter((v) => v.length > 0);

        const seen = new Set();
        const uniqueStable = [];
        cleaned.forEach((v) => {
          const k = v.toLowerCase();
          if (seen.has(k)) return;
          seen.add(k);
          uniqueStable.push(v);
        });

        if (!hasVariantTable) {
          uniqueStable.sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' }),
          );
        }

        item.variants = uniqueStable;
        if (item.variantIdByName && hasVariantTable) {
          const pruned = Object.create(null);
          uniqueStable.forEach((vn) => {
            const k = String(vn || '').trim().toLowerCase();
            if (k && item.variantIdByName[k] != null) {
              pruned[k] = item.variantIdByName[k];
            }
          });
          item.variantIdByName = pruned;
        } else {
          item.variantIdByName = null;
        }
        const vDepMap = item._vDepMap;
        const variantDeprecatedSet = new Set();
        if (vDepMap && typeof vDepMap.get === 'function') {
          uniqueStable.forEach((vn) => {
            const k = String(vn || '').trim().toLowerCase();
            if (k && vDepMap.get(k)) variantDeprecatedSet.add(k);
          });
        }
        item.variantDeprecatedSet = variantDeprecatedSet;
      } else {
        item.variants = [];
        item.variantDeprecatedSet = new Set();
        item.variantIdByName = null;
      }
      if (
        Array.isArray(item._variantHomeLocations) &&
        item._variantHomeLocations.length > 0
      ) {
        const seenVariantHomes = new Map();
        item._variantHomeLocations.forEach((entry) => {
          const variantName = String(entry?.variant || '').trim();
          if (!variantName) return;
          const variantKey = variantName.toLowerCase();
          const normalizedHomeLocation = normalizeShoppingHomeLocationId(
            entry?.homeLocation || 'none',
          );
          const existing = seenVariantHomes.get(variantKey);
          if (existing) {
            if (
              existing.homeLocation === 'none' &&
              normalizedHomeLocation !== 'none'
            ) {
              existing.homeLocation = normalizedHomeLocation;
            }
            return;
          }
          const nextEntry = {
            variant: variantName,
            homeLocation: normalizedHomeLocation,
          };
          seenVariantHomes.set(variantKey, nextEntry);
        });
        item.variantHomeLocations = item.variants
          .map((variantName) =>
            seenVariantHomes.get(
              String(variantName || '')
                .trim()
                .toLowerCase(),
            ),
          )
          .filter(Boolean);
      } else {
        item.variantHomeLocations = [];
      }

      item.isDeprecated =
        Array.isArray(item._deprecatedFlags) && item._deprecatedFlags.length > 0
          ? item._deprecatedFlags.every(Boolean)
          : false;
      item.isHidden =
        Array.isArray(item._hiddenFlags) && item._hiddenFlags.length > 0
          ? item._hiddenFlags.every(Boolean)
          : false;
      item.locationAtHome =
        Array.isArray(item._homeLocations) && item._homeLocations.length > 0
          ? String(item._homeLocations[0] || '')
          : '';
      item.isFood =
        Array.isArray(item._foodFlags) && item._foodFlags.length > 0
          ? item._foodFlags.some(Boolean)
          : true;
      item.lemma =
        Array.isArray(item._lemmas) && item._lemmas.length > 0
          ? String(
              item._lemmas.find((value) => String(value || '').trim()) || '',
            ).trim()
          : '';
      item.pluralByDefault =
        Array.isArray(item._pluralByDefaultFlags) &&
        item._pluralByDefaultFlags.length > 0
          ? item._pluralByDefaultFlags.some(Boolean)
          : false;
      item.isMassNoun =
        Array.isArray(item._isMassNounFlags) && item._isMassNounFlags.length > 0
          ? item._isMassNounFlags.some(Boolean)
          : false;
      item.pluralOverride =
        Array.isArray(item._pluralOverrides) && item._pluralOverrides.length > 0
          ? String(
              item._pluralOverrides.find((value) =>
                String(value || '').trim(),
              ) || '',
            ).trim()
          : '';
      delete item._deprecatedFlags;
      delete item._hiddenFlags;
      delete item._homeLocations;
      delete item._variantHomeLocations;
      delete item._foodFlags;
      delete item._lemmas;
      delete item._pluralByDefaultFlags;
      delete item._isMassNounFlags;
      delete item._pluralOverrides;
      delete item._vDepMap;

      return item;
    });

    // Keep list stable + alphabetical by name
    shoppingRows.sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, {
        sensitivity: 'base',
      }),
    );
  }
  }

  const rebuildShoppingTagChipOptionDefsFromRows = async () => {
    const seen = new Map();
    shoppingRows.forEach((item) => {
      (Array.isArray(item.tags) ? item.tags : []).forEach((raw) => {
        const label = String(raw || '').trim();
        if (!label) return;
        const key = label.toLowerCase();
        if (!seen.has(key)) seen.set(key, label);
      });
    });
    let pool = [];
    try {
      pool = await getVisibleIngredientTagNamePool(db);
    } catch (err) {
      console.warn('listIngredientTagNames pool unavailable:', err);
    }
    (Array.isArray(pool) ? pool : []).forEach((label) => {
      const normalizedLabel = String(label || '').trim();
      const key = normalizedLabel.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.set(key, normalizedLabel);
    });
    const pairs = Array.from(seen.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }),
    );
    shoppingTagChipOptionDefs = pairs.map(([lower, label]) => ({
      id: `${SHOPPING_TAG_FILTER_PREFIX}${lower}`,
      label,
    }));
  };

  const attachVariantTagsToShoppingRows = async () => {
    shoppingRows.forEach((item) => {
      item.tags = [];
    });
    await rebuildShoppingTagChipOptionDefsFromRows();
    if (
      !tableExists('ingredient_variants') ||
      !tableExists('ingredient_variant_tag_map') ||
      !tableExists('tags')
    ) {
      return;
    }
    try {
      ensureIngredientVariantTagsSchemaInMain(db);
    } catch (_) {}
    try {
      const tagQ = db.exec(`
        SELECT lower(trim(i.name)) AS name_key,
               t.name AS tag_name
        FROM ingredient_variants iv
        JOIN ingredients i ON i.ID = iv.ingredient_id
        JOIN ingredient_variant_tag_map ivtm ON ivtm.ingredient_variant_id = iv.id
        JOIN tags t ON t.id = ivtm.tag_id
        WHERE COALESCE(t.is_hidden, 0) = 0
      `);
      const byKey = new Map();
      if (Array.isArray(tagQ) && tagQ.length && Array.isArray(tagQ[0].values)) {
        tagQ[0].values.forEach(([nameKey, tagName]) => {
          const k = String(nameKey || '')
            .trim()
            .toLowerCase();
          const tag = String(tagName || '').trim();
          if (!k || !tag) return;
          if (!byKey.has(k)) byKey.set(k, new Set());
          byKey.get(k).add(tag);
        });
      }
      shoppingRows.forEach((item) => {
        const k = String(item?.name || '')
          .trim()
          .toLowerCase();
        const set = byKey.get(k);
        if (!set) {
          item.tags = [];
          return;
        }
        const arr = Array.from(set);
        arr.sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' }),
        );
        item.tags = arr;
      });
    } catch (err) {
      console.warn('attachVariantTagsToShoppingRows: tag query failed', err);
      shoppingRows.forEach((item) => {
        item.tags = [];
      });
    }
    await rebuildShoppingTagChipOptionDefsFromRows();
  };

  if (shoppingRowsLoadedFromDataService) {
    await rebuildShoppingTagChipOptionDefsFromRows();
  } else {
    await attachVariantTagsToShoppingRows();
  }

  const buildShoppingUsageCountMaps = () => {
    const recipeCounts = new Map();
    const aisleCounts = new Map();

    try {
      const recipeQ = db.exec(`
        SELECT name_key, COUNT(DISTINCT recipe_id) AS recipe_count
        FROM (
          SELECT lower(i.name) AS name_key, rim.recipe_id
          FROM recipe_ingredient_map rim
          JOIN ingredients i ON i.ID = rim.ingredient_id
          UNION ALL
          SELECT lower(i2.name) AS name_key, rim.recipe_id
          FROM recipe_ingredient_substitutes ris
          JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
          JOIN ingredients i2 ON i2.ID = ris.ingredient_id
        ) refs
        GROUP BY name_key;
      `);
      if (
        Array.isArray(recipeQ) &&
        recipeQ.length &&
        Array.isArray(recipeQ[0].values)
      ) {
        recipeQ[0].values.forEach(([nameKey, recipeCount]) => {
          const key = String(nameKey || '')
            .trim()
            .toLowerCase();
          if (!key) return;
          const count = Number(recipeCount);
          recipeCounts.set(key, Number.isFinite(count) ? count : 0);
        });
      }
    } catch (err) {
      console.warn(
        'buildShoppingUsageCountMaps: recipe count query failed',
        err,
      );
    }

    try {
      const hasBaseAisleTable = tableExists('ingredient_store_location');
      const hasVariantAisleTable = tableExists(
        'ingredient_variant_store_location',
      );
      const aisleSources = [];
      if (hasBaseAisleTable) {
        aisleSources.push(`
          SELECT lower(i.name) AS name_key, isl.store_location_id AS aisle_id
          FROM ingredient_store_location isl
          JOIN ingredients i ON i.ID = isl.ingredient_id
        `);
      }
      if (hasVariantAisleTable) {
        aisleSources.push(`
          SELECT lower(i.name) AS name_key, ivsl.store_location_id AS aisle_id
          FROM ingredient_variant_store_location ivsl
          JOIN ingredient_variants v ON v.id = ivsl.ingredient_variant_id
          JOIN ingredients i ON i.ID = v.ingredient_id
        `);
      }
      if (aisleSources.length) {
        const aisleQ = db.exec(`
          SELECT name_key, COUNT(DISTINCT aisle_id) AS aisle_count
          FROM (
            ${aisleSources.join('\nUNION ALL\n')}
          ) refs
          GROUP BY name_key;
        `);
        if (
          Array.isArray(aisleQ) &&
          aisleQ.length &&
          Array.isArray(aisleQ[0].values)
        ) {
          aisleQ[0].values.forEach(([nameKey, aisleCount]) => {
            const key = String(nameKey || '')
              .trim()
              .toLowerCase();
            if (!key) return;
            const count = Number(aisleCount);
            aisleCounts.set(key, Number.isFinite(count) ? count : 0);
          });
        }
      }
    } catch (err) {
      console.warn(
        'buildShoppingUsageCountMaps: aisle count query failed',
        err,
      );
    }

    return { recipeCounts, aisleCounts };
  };

  if (!shoppingRowsLoadedFromDataService) {
    const shoppingUsageCounts = buildShoppingUsageCountMaps();
    shoppingRows.forEach((item) => {
      const key = String(item?.name || '')
        .trim()
        .toLowerCase();
      item.recipeUseCount = Number(
        shoppingUsageCounts.recipeCounts.get(key) || 0,
      );
      item.aisleUseCount = Number(shoppingUsageCounts.aisleCounts.get(key) || 0);
    });
  }

  const getSharedHomeLocationDefs = () => {
    if (typeof window.getHomeLocationDefs === 'function') {
      return window.getHomeLocationDefs();
    }
    return [
      { id: 'fridge', label: 'fridge' },
      { id: 'freezer', label: 'freezer' },
      { id: 'above fridge', label: 'above fridge' },
      { id: 'pantry', label: 'pantry' },
      { id: 'cereal cabinet', label: 'cereal cabinet' },
      { id: 'spices', label: 'spices' },
      { id: 'fruit stand', label: 'fruit stand' },
      { id: 'coffee bar', label: 'coffee bar' },
      { id: 'none', label: 'no location' },
    ];
  };
  const shoppingLocationChipDefs = getSharedHomeLocationDefs();
  const shoppingFilterChipDefsWeb = [
    { id: 'selected', label: 'selected', kind: 'flag' },
  ];
  const shoppingFilterChipDefsEditor = [
    { id: 'recent', label: 'recent', kind: 'sort' },
    { id: 'food', label: 'food', kind: 'flag' },
    { id: 'not food', label: 'not food', kind: 'flag' },
  ];
  const shoppingMoreChipOptionDefs = [
    { id: 'no recipe', label: 'no recipe' },
    { id: 'no aisle', label: 'no aisle' },
    { id: 'hidden', label: 'hidden' },
    { id: 'removed', label: 'removed' },
  ];
  const activeFilterChips = new Set();
  const selectedShoppingNames = new Set();
  const shoppingQuantities = new Map();
  const shoppingRecipeQuantities = new Map();
  const shoppingSelectionMeta = new Map();
  let shoppingChipCounts = new Map();
  let filterChipRail = null;
  let suppressLocationDropdownReopen = false;
  let reopenShoppingCompoundDropdownId = '';
  let shoppingItemsSortMode = SHOPPING_ITEMS_SORT_MODE_AZ;
  const collapsedItemsBrowseHomeSections = new Set();
  const restoreShoppingItemsSortMode = () => {
    if (!isForceWebModeEnabled()) {
      shoppingItemsSortMode = SHOPPING_ITEMS_SORT_MODE_AZ;
      return;
    }
    try {
      const raw = sessionStorage.getItem(SHOPPING_ITEMS_SORT_SESSION_KEY);
      const key = String(raw || '').trim().toLowerCase();
      shoppingItemsSortMode =
        key === SHOPPING_ITEMS_SORT_MODE_LOCATION
          ? SHOPPING_ITEMS_SORT_MODE_LOCATION
          : SHOPPING_ITEMS_SORT_MODE_AZ;
    } catch (_) {
      shoppingItemsSortMode = SHOPPING_ITEMS_SORT_MODE_AZ;
    }
  };
  const persistShoppingItemsSortMode = () => {
    if (!isForceWebModeEnabled()) return;
    try {
      sessionStorage.setItem(
        SHOPPING_ITEMS_SORT_SESSION_KEY,
        shoppingItemsSortMode,
      );
    } catch (_) {}
  };
  const restoreItemsBrowseHomeCollapsed = () => {
    collapsedItemsBrowseHomeSections.clear();
    if (!isForceWebModeEnabled()) return;
    try {
      const raw = sessionStorage.getItem(ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach((id) => {
        const k = String(id || '').trim();
        if (k) collapsedItemsBrowseHomeSections.add(k);
      });
    } catch (_) {}
  };
  const persistItemsBrowseHomeCollapsed = () => {
    if (!isForceWebModeEnabled()) return;
    try {
      sessionStorage.setItem(
        ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY,
        JSON.stringify(Array.from(collapsedItemsBrowseHomeSections)),
      );
    } catch (_) {}
  };
  restoreShoppingItemsSortMode();
  restoreItemsBrowseHomeCollapsed();
  const syncShoppingActionButtonState = () => {
    if (!(addBtn instanceof HTMLButtonElement)) return;
    if (!isShoppingWebSelectMode()) {
      addBtn.disabled = false;
      addBtn.removeAttribute('aria-disabled');
      return;
    }
    const disabled =
      Object.keys(getShoppingPlanItemSelections()).length === 0 &&
      Object.keys(getShoppingPlanRecipeSelections()).length === 0;
    addBtn.disabled = disabled;
    addBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  };

  const getShoppingSelectionKey = (rawName) =>
    String(rawName || '')
      .trim()
      .toLowerCase();
  const isShoppingWebSelectMode = () => isForceWebModeEnabled();
  const getShoppingFilterChipMode = () =>
    isShoppingWebSelectMode() ? 'web' : 'editor';
  const getShoppingFilterChipStorageKey = (
    mode = getShoppingFilterChipMode(),
  ) => `${SHOPPING_FILTER_CHIPS_SESSION_KEY_PREFIX}:${mode}`;
  // On macOS, Ctrl+primary click can emit a contextmenu event.
  // Treat that gesture like a normal click in shopping web mode.
  const isCtrlPrimaryContextMenuGesture = (event) =>
    !!(
      event &&
      event.type === 'contextmenu' &&
      event.ctrlKey &&
      Number(event.button) === 0 &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey
    );
  const getActiveShoppingFilterChipDefs = () =>
    getShoppingFilterChipMode() === 'web'
      ? shoppingFilterChipDefsWeb
      : shoppingFilterChipDefsEditor;
  const SHOPPING_QTY_EPSILON = 1e-9;
  const getDirectShoppingQty = (key) => shoppingQuantities.get(key) || 0;
  const getRecipeShoppingQty = (key) => shoppingRecipeQuantities.get(key) || 0;
  const getShoppingQty = (key) =>
    Math.max(0, getDirectShoppingQty(key) + getRecipeShoppingQty(key));
  const hasPositiveShoppingQty = (qty) =>
    Number.isFinite(Number(qty)) && Number(qty) > SHOPPING_QTY_EPSILON;
  const getNextShoppingStepQty = (currentQty, delta) => {
    if (
      window.listRowStepper &&
      typeof window.listRowStepper.getNextStepQty === 'function'
    ) {
      return window.listRowStepper.getNextStepQty(currentQty, delta, {
        min: 0,
        epsilon: SHOPPING_QTY_EPSILON,
      });
    }
    const numeric = Number(currentQty);
    if (!Number.isFinite(numeric)) return delta > 0 ? 1 : 0;
    return Math.max(0, numeric + Number(delta || 0));
  };
  const parseShoppingQtyInputValue = (rawValue) => {
    const raw = String(rawValue == null ? '' : rawValue).trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(99, Math.round(numeric)));
  };
  const setShoppingQty = (key, qty, meta = null) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const nextMeta =
      meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    const itemName = String(nextMeta.itemName || nextMeta.name || '').trim();
    const variantName = String(nextMeta.variantName || '').trim();
    if (itemName || variantName || !shoppingSelectionMeta.has(normalizedKey)) {
      shoppingSelectionMeta.set(normalizedKey, { itemName, variantName });
    }
    const recipeQty = getRecipeShoppingQty(normalizedKey);
    const desiredQty = Math.max(0, Number(qty || 0));
    if (!Number.isFinite(desiredQty)) return;
    const directQty = Number((desiredQty - recipeQty).toFixed(4));
    if (Math.abs(directQty) < SHOPPING_QTY_EPSILON) {
      shoppingQuantities.delete(normalizedKey);
      selectedShoppingNames.delete(normalizedKey);
      shoppingSelectionMeta.delete(normalizedKey);
      setShoppingPlanItemSelection({ key: normalizedKey, quantity: 0 });
    } else {
      shoppingQuantities.set(normalizedKey, directQty);
      selectedShoppingNames.add(normalizedKey);
      const persistedMeta = shoppingSelectionMeta.get(normalizedKey) || {};
      setShoppingPlanItemSelection({
        key: normalizedKey,
        name: persistedMeta.itemName || itemName || normalizedKey,
        variantName: persistedMeta.variantName || variantName,
        quantity: directQty,
      });
    }
    syncShoppingActionButtonState();
  };
  const hydrateShoppingSelectionsFromPlan = () => {
    const storedSelections = getShoppingPlanItemSelections();
    Object.keys(storedSelections).forEach((rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key) return;
      const entry = storedSelections[rawKey];
      const quantity = Number(entry?.quantity);
      if (
        !Number.isFinite(quantity) ||
        Math.abs(quantity) < SHOPPING_QTY_EPSILON
      )
        return;
      shoppingQuantities.set(key, quantity);
      selectedShoppingNames.add(key);
      shoppingSelectionMeta.set(key, {
        itemName: String(entry?.name || '').trim(),
        variantName: String(entry?.variantName || '').trim(),
      });
    });
  };
  try {
    maintainShoppingPlanStorageWithDb(db);
  } catch (reconcileErr) {
    console.warn('Shopping plan maintain on items page failed:', reconcileErr);
  }
  hydrateShoppingSelectionsFromPlan();

  const VARIANT_KEY_SEP = '\x00';
  const getVariantQtyKey = (itemName, variantName) => {
    const base = getShoppingSelectionKey(itemName);
    const v = String(variantName || '')
      .trim()
      .toLowerCase();
    return v ? `${base}${VARIANT_KEY_SEP}${v}` : base;
  };
  const getBrowseVariantPlanKey = (itemName, rawVariantName, browseItem) => {
    const v = String(rawVariantName || '').trim();
    if (!v || v === 'default') {
      return getVariantQtyKey(itemName, v || 'default');
    }
    if (browseItem && browseItem.variantIdByName) {
      const vid = browseItem.variantIdByName[v.toLowerCase()];
      if (Number.isFinite(vid) && vid > 0) {
        return makeIngredientVariantShoppingPlanKey(vid);
      }
    }
    if (hasVariantTable) {
      const resolved = resolvePersistedShoppingItemKeyForDb(db, itemName, v);
      if (resolved) return resolved;
    }
    return getVariantQtyKey(itemName, v);
  };
  const getShoppingItemVariantAwareKey = (itemName, variantName = '') => {
    const itemKey = getShoppingSelectionKey(itemName);
    if (!itemKey) return '';
    const match = shoppingRows.find(
      (it) => getShoppingSelectionKey(it?.name) === itemKey,
    );
    const hasVariants =
      !!match && Array.isArray(match.variants) && match.variants.length > 0;
    if (!hasVariants) return itemKey;
    return getBrowseVariantPlanKey(
      itemName,
      String(variantName || '').trim() || 'default',
      match,
    );
  };
  const getRecipeSelectionsForDataService = () =>
    Object.values(getShoppingPlanRecipeSelections()).map((entry) => {
      const recipeId = Number(entry?.recipeId);
      const servings = getRecipeWebServingsStoredValue(recipeId);
      return {
        ...entry,
        servings,
      };
    });
  const hydrateRecipeDerivedShoppingSelections = async () => {
    shoppingRecipeQuantities.clear();
    let recipeRows = [];
    if (
      window.dataService &&
      typeof window.dataService.listShoppingPlanRecipeItems === 'function'
    ) {
      try {
        recipeRows = await window.dataService.listShoppingPlanRecipeItems(
          getRecipeSelectionsForDataService(),
        );
      } catch (err) {
        console.error('dataService.listShoppingPlanRecipeItems failed:', err);
        recipeRows = getRecipeDerivedShoppingPlanRows({ db });
      }
    } else {
      recipeRows = getRecipeDerivedShoppingPlanRows({ db });
    }
    recipeRows.forEach((entry) => {
      const label = String(entry?.label || '').trim();
      const quantity = Number(entry?.quantity || 0);
      if (!label || !Number.isFinite(quantity) || quantity <= 0) return;
      const baseName = String(entry?.name || '').trim();
      const variantName = String(entry?.variantName || '').trim();
      const fromPlan = String(entry?.key || '').trim();
      const key =
        fromPlan || getShoppingItemVariantAwareKey(baseName, variantName);
      if (!key) return;
      shoppingRecipeQuantities.set(
        key,
        (shoppingRecipeQuantities.get(key) || 0) + quantity,
      );
    });
  };
  await hydrateRecipeDerivedShoppingSelections();
  syncShoppingActionButtonState();
  const getItemTotalQty = (itemName, variants, browseItem) => {
    let total = getShoppingQty(
      getBrowseVariantPlanKey(itemName, 'default', browseItem),
    );
    (variants || []).forEach((v) => {
      total += getShoppingQty(
        getBrowseVariantPlanKey(itemName, v, browseItem),
      );
    });
    return total;
  };
  const getVariantQtyMap = (itemName, variants, browseItem) => {
    const m = new Map();
    m.set(
      'default',
      getShoppingQty(getBrowseVariantPlanKey(itemName, 'default', browseItem)),
    );
    (variants || []).forEach((v) => {
      m.set(
        v,
        getShoppingQty(getBrowseVariantPlanKey(itemName, v, browseItem)),
      );
    });
    return m;
  };
  const hasAnyVariantSelection = (itemName, variants) =>
    hasPositiveShoppingQty(getItemTotalQty(itemName, variants));
  function getItemRecipeQty(itemName, variants, browseItem) {
    let total = getRecipeShoppingQty(
      getBrowseVariantPlanKey(itemName, 'default', browseItem),
    );
    (variants || []).forEach((v) => {
      total += getRecipeShoppingQty(
        getBrowseVariantPlanKey(itemName, v, browseItem),
      );
    });
    return total;
  }
  function getShoppingRowTotalQty(item) {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return 0;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    return variants.length > 0
      ? getItemTotalQty(itemName, variants, item)
      : getShoppingQty(getShoppingSelectionKey(itemName));
  }
  function getShoppingRowRecipeQty(item) {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return 0;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    return variants.length > 0
      ? getItemRecipeQty(itemName, variants, item)
      : getRecipeShoppingQty(getShoppingSelectionKey(itemName));
  }

  const expandedVariantItems = new Set();
  const expandedVariantChildSteppers = new Set();
  const syncVariantParentByKey = new Map();
  let syncVariantChildVisuals = () => {};
  const collapseExpandedVariantRows = () => {
    let changed = false;
    if (expandedVariantChildSteppers.size) {
      changed = true;
      expandedVariantChildSteppers.clear();
      list.querySelectorAll('li.shopping-variant-child').forEach((row) => {
        const varKey = String(row.dataset.variantQtyKey || '');
        if (varKey) syncVariantChildVisuals(row, varKey);
      });
    }
    if (!expandedVariantItems.size) return changed;
    changed = true;
    expandedVariantItems.clear();
    list.querySelectorAll('li.shopping-variant-parent').forEach((parentLi) => {
      parentLi.dataset.expanded = 'false';
    });
    list.querySelectorAll('li.shopping-variant-child').forEach((row) => {
      row.style.display = 'none';
    });
    syncVariantParentByKey.forEach((syncFn) => {
      try {
        syncFn();
      } catch (_) {}
    });
    return changed;
  };
  const shoppingRowStepperController = listRowStepper.createController({
    listEl: list,
    isEnabled: isShoppingWebSelectMode,
    collapseExpanded: collapseExpandedVariantRows,
  });
  const syncShoppingRowVisuals = (rowEl, itemName) => {
    listRowStepper.syncRowVisuals(rowEl, {
      enabled: isShoppingWebSelectMode(),
      qty: getShoppingQty(getShoppingSelectionKey(itemName)),
      isActive: shoppingRowStepperController.isActive(
        getShoppingSelectionKey(itemName),
      ),
      selectedDatasetKey: 'shoppingSelected',
    });
  };
  const syncShoppingRowSelectionState = (rowEl, itemName) => {
    syncShoppingRowVisuals(rowEl, itemName);
  };
  const syncAllVisibleShoppingRowStates = () => {
    list.querySelectorAll('li[data-shopping-stepper-key]').forEach((row) => {
      const itemName = String(row.dataset.shoppingStepperKey || '');
      if (itemName) syncShoppingRowSelectionState(row, itemName);
    });
  };
  shoppingRowStepperController.bindAutoDismiss({
    shouldIgnoreTarget: () =>
      !!list.querySelector('.shopping-stepper-qty-input'),
    onDismissed: syncAllVisibleShoppingRowStates,
  });
  const toggleShoppingRowSelectionState = (rowEl, itemName) => {
    const key = getShoppingSelectionKey(itemName);
    if (!key) return;
    const qty = getShoppingQty(key);
    setShoppingQty(key, qty > 0 ? 0 : 1, { itemName });
    refreshShoppingSelectionUi({ activeKey: key });
  };
  const incrementShoppingQty = (rowEl, itemName, delta) => {
    const key = getShoppingSelectionKey(itemName);
    if (!key) return;
    const qty = getShoppingQty(key);
    const nextQty = getNextShoppingStepQty(qty, delta);
    setShoppingQty(key, nextQty, { itemName });
    if (
      !hasPositiveShoppingQty(nextQty) &&
      shoppingRowStepperController.isActive(key)
    ) {
      shoppingRowStepperController.collapseActive();
    }
    refreshShoppingSelectionUi({
      activeKey: hasPositiveShoppingQty(nextQty) ? key : '',
    });
  };
  const attachShoppingQtyManualEdit = ({
    qtyEl,
    getQty,
    commitQty,
    onAfterCommit,
  }) => {
    if (!(qtyEl instanceof HTMLElement)) return;
    let inputEl = null;
    let isEditing = false;

    const rerender = () => {
      if (typeof onAfterCommit === 'function') onAfterCommit();
    };
    const onBlur = () => finishEditing('commit');
    const onKeyDown = (event) => {
      if (!event) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        finishEditing('commit');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finishEditing('cancel');
        return;
      }
      event.stopPropagation();
    };
    const finishEditing = (mode) => {
      if (!isEditing) return;
      const currentInput = inputEl;
      inputEl = null;
      isEditing = false;
      if (currentInput) {
        currentInput.removeEventListener('blur', onBlur);
        currentInput.removeEventListener('keydown', onKeyDown);
      }
      if (mode === 'commit') {
        const nextQty = parseShoppingQtyInputValue(currentInput?.value);
        if (nextQty != null) {
          commitQty(nextQty);
          rerender();
          return;
        }
      }
      rerender();
    };
    const stopPropagation = (event) => {
      if (!event) return;
      event.preventDefault();
      event.stopPropagation();
    };

    qtyEl.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    qtyEl.addEventListener('dblclick', (event) => {
      if (!isShoppingWebSelectMode()) return;
      stopPropagation(event);
      if (isEditing) return;
      isEditing = true;
      const currentQty = Number(getQty());
      const initialValue = Number.isFinite(currentQty)
        ? String(Math.max(0, Math.min(99, Math.round(currentQty))))
        : '0';
      qtyEl.textContent = '';
      inputEl = document.createElement('input');
      inputEl.type = 'number';
      inputEl.className = 'shopping-stepper-qty-input';
      inputEl.min = '0';
      inputEl.max = '99';
      inputEl.step = '1';
      inputEl.inputMode = 'numeric';
      inputEl.value = initialValue;
      inputEl.addEventListener('click', (e) => e.stopPropagation());
      inputEl.addEventListener('mousedown', (e) => e.stopPropagation());
      inputEl.addEventListener('dblclick', (e) => e.stopPropagation());
      inputEl.addEventListener('blur', onBlur);
      inputEl.addEventListener('keydown', onKeyDown);
      qtyEl.appendChild(inputEl);
      try {
        inputEl.focus();
        inputEl.select();
      } catch (_) {}
    });
  };

  const persistShoppingChipState = () => {
    try {
      sessionStorage.setItem(
        getShoppingFilterChipStorageKey(),
        JSON.stringify(Array.from(activeFilterChips)),
      );
    } catch (_) {}
  };

  const restoreShoppingChipState = () => {
    try {
      const storageKey = getShoppingFilterChipStorageKey();
      let raw = sessionStorage.getItem(storageKey);
      let shouldPersistMigratedState = false;
      if (!raw) {
        raw = sessionStorage.getItem(SHOPPING_FILTER_CHIPS_SESSION_KEY_LEGACY);
        shouldPersistMigratedState = !!raw;
      }
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const knownIds = new Set(
        getActiveShoppingFilterChipDefs().map((c) => String(c.id)),
      );
      if (getShoppingFilterChipMode() === 'web') {
        knownIds.add('not food');
      }
      shoppingLocationChipDefs.forEach((locationDef) => {
        const locationId = String(locationDef?.id || '')
          .trim()
          .toLowerCase();
        if (locationId) knownIds.add(locationId);
      });
      shoppingMoreChipOptionDefs.forEach((optionDef) => {
        const optionId = String(optionDef?.id || '')
          .trim()
          .toLowerCase();
        if (optionId) knownIds.add(optionId);
      });
      shoppingTagChipOptionDefs.forEach((def) => {
        const tid = String(def?.id || '')
          .trim()
          .toLowerCase();
        if (tid) knownIds.add(tid);
      });
      parsed.forEach((chipId) => {
        const id = String(chipId || '')
          .trim()
          .toLowerCase();
        // Back-compat: old "hidden" chip represented deprecated/removed.
        if (id === 'hidden' && knownIds.has('removed')) {
          activeFilterChips.add('removed');
          return;
        }
        if (knownIds.has(id)) activeFilterChips.add(id);
      });
      if (getShoppingFilterChipMode() === 'web') {
        if (activeFilterChips.delete('food')) {
          shouldPersistMigratedState = true;
        }
        if (activeFilterChips.delete('for recipes')) {
          shouldPersistMigratedState = true;
        }
      } else if (activeFilterChips.has('food') && activeFilterChips.has('not food')) {
        activeFilterChips.delete('not food');
        shouldPersistMigratedState = true;
      }
      if (shouldPersistMigratedState) {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(activeFilterChips)),
        );
      }
    } catch (_) {}
  };

  const normalizeLocationForChip = (raw) =>
    normalizeShoppingHomeLocationId(raw);
  const getShoppingRowLocationIdsForBrowse = (item) =>
    getShoppingBrowseLocationIds(item).map((locationId) =>
      normalizeLocationForChip(locationId),
    );

  const recomputeShoppingChipCounts = () => {
    const counts = new Map();
    getActiveShoppingFilterChipDefs().forEach((c) => counts.set(c.id, 0));
    if (!counts.has('food')) counts.set('food', 0);
    if (!counts.has('not food')) counts.set('not food', 0);
    shoppingMoreChipOptionDefs.forEach((optionDef) => {
      const optionId = String(optionDef?.id || '')
        .trim()
        .toLowerCase();
      if (optionId) counts.set(optionId, 0);
    });
    shoppingTagChipOptionDefs.forEach((def) => {
      const tid = String(def?.id || '')
        .trim()
        .toLowerCase();
      if (tid) counts.set(tid, 0);
    });
    counts.set('recent', shoppingRows.length);
    shoppingRows.forEach((item) => {
      if (hasPositiveShoppingQty(getShoppingRowTotalQty(item))) {
        counts.set('selected', (counts.get('selected') || 0) + 1);
      }
      if (hasPositiveShoppingQty(getShoppingRowRecipeQty(item))) {
        counts.set('for recipes', (counts.get('for recipes') || 0) + 1);
      }
      if (item && item.isDeprecated) {
        counts.set('removed', (counts.get('removed') || 0) + 1);
      }
      if (item && item.isHidden) {
        counts.set('hidden', (counts.get('hidden') || 0) + 1);
      }
      if (item && item.isFood === true) {
        counts.set('food', (counts.get('food') || 0) + 1);
      }
      if (item && item.isFood === false) {
        counts.set('not food', (counts.get('not food') || 0) + 1);
      }
      getShoppingRowLocationIdsForBrowse(item).forEach((locId) => {
        counts.set(locId, (counts.get(locId) || 0) + 1);
      });
      if (Number(item?.recipeUseCount || 0) <= 0) {
        counts.set('no recipe', (counts.get('no recipe') || 0) + 1);
      }
      if (Number(item?.aisleUseCount || 0) <= 0) {
        counts.set('no aisle', (counts.get('no aisle') || 0) + 1);
      }
      const tagSeen = new Set();
      (Array.isArray(item.tags) ? item.tags : []).forEach((raw) => {
        const key = String(raw || '')
          .trim()
          .toLowerCase();
        if (!key) return;
        const chipId = `${SHOPPING_TAG_FILTER_PREFIX}${key}`;
        if (tagSeen.has(chipId)) return;
        tagSeen.add(chipId);
        counts.set(chipId, (counts.get(chipId) || 0) + 1);
      });
    });
    shoppingChipCounts = counts;
  };

  const pruneInactiveShoppingChipState = () => {
    let changed = false;
    Array.from(activeFilterChips).forEach((chipId) => {
      const count = Number(shoppingChipCounts.get(chipId) || 0);
      if (count <= 0) {
        activeFilterChips.delete(chipId);
        changed = true;
      }
    });
    if (changed) persistShoppingChipState();
  };

  const getActiveShoppingLocationFilterIds = (chipIds = activeFilterChips) =>
    shoppingLocationChipDefs
      .map((c) =>
        String(c?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((id) => id && chipIds.has(id));

  const getActiveShoppingTagKeysFromChipIds = (chipIds = activeFilterChips) =>
    Array.from(chipIds)
      .map((id) =>
        String(id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((id) => id.startsWith(SHOPPING_TAG_FILTER_PREFIX))
      .map((id) => id.slice(SHOPPING_TAG_FILTER_PREFIX.length));

  const buildShoppingRowFilterMatcher = ({
    chipIds = activeFilterChips,
    forcedLocationIds = null,
    forcedTagKeys = null,
  } = {}) => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const foodOnly = chipIds.has('food');
    const selectedOnly = chipIds.has('selected');
    const recipeOnly = chipIds.has('for recipes');
    const removedOnly = chipIds.has('removed');
    const hiddenOnly = chipIds.has('hidden');
    const notFoodOnly = chipIds.has('not food');
    const noRecipeOnly = chipIds.has('no recipe');
    const noAisleOnly = chipIds.has('no aisle');
    const activeLocationIds = Array.isArray(forcedLocationIds)
      ? forcedLocationIds
      : getActiveShoppingLocationFilterIds(chipIds);
    const activeTagKeys = Array.isArray(forcedTagKeys)
      ? forcedTagKeys
          .map((k) =>
            String(k || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
      : getActiveShoppingTagKeysFromChipIds(chipIds);
    return (item) => {
      const name = String(item?.name || '').toLowerCase();
      const variants = Array.isArray(item?.variants) ? item.variants : [];
      const matchesSearch =
        !query ||
        name.includes(query) ||
        variants.some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(query),
        );
      const matchesRemoved = removedOnly
        ? item?.isDeprecated === true
        : item?.isDeprecated !== true;
      const matchesHidden = hiddenOnly
        ? item?.isHidden === true
        : item?.isHidden !== true;
      const matchesFood = foodOnly
        ? item?.isFood === true
        : notFoodOnly
          ? item?.isFood === false
          : true;
      const matchesLocation =
        activeLocationIds.length === 0 ||
        getShoppingRowLocationIdsForBrowse(item).some((locationId) =>
          activeLocationIds.includes(locationId),
        );
      const matchesNoRecipe = noRecipeOnly
        ? Number(item?.recipeUseCount || 0) <= 0
        : true;
      const matchesNoAisle = noAisleOnly
        ? Number(item?.aisleUseCount || 0) <= 0
        : true;
      const matchesSelected = selectedOnly
        ? hasPositiveShoppingQty(getShoppingRowTotalQty(item))
        : true;
      const matchesRecipeSelections = recipeOnly
        ? hasPositiveShoppingQty(getShoppingRowRecipeQty(item))
        : true;
      const matchesTags =
        activeTagKeys.length === 0 ||
        (Array.isArray(item.tags) &&
          activeTagKeys.some((tk) =>
            item.tags.some(
              (t) =>
                String(t || '')
                  .trim()
                  .toLowerCase() === tk,
            ),
          ));
      return (
        matchesSearch &&
        matchesRemoved &&
        matchesHidden &&
        matchesFood &&
        matchesLocation &&
        matchesNoRecipe &&
        matchesNoAisle &&
        matchesSelected &&
        matchesRecipeSelections &&
        matchesTags
      );
    };
  };

  const isShoppingLocationOptionUnavailable = (rawLocationId) => {
    const locationId = String(rawLocationId || '')
      .trim()
      .toLowerCase();
    if (!locationId) return true;
    // Keep selected options enabled so users can always unselect them.
    if (activeFilterChips.has(locationId)) return false;
    const rowMatchesFilters = buildShoppingRowFilterMatcher({
      chipIds: activeFilterChips,
      forcedLocationIds: [locationId],
    });
    return !shoppingRows.some((item) => rowMatchesFilters(item));
  };

  const isShoppingTagOptionUnavailable = (rawChipId) => {
    const id = String(rawChipId || '')
      .trim()
      .toLowerCase();
    if (!id.startsWith(SHOPPING_TAG_FILTER_PREFIX)) return true;
    const keyOnly = id.slice(SHOPPING_TAG_FILTER_PREFIX.length);
    if (!keyOnly) return true;
    if (activeFilterChips.has(id)) return false;
    const rowMatchesFilters = buildShoppingRowFilterMatcher({
      chipIds: activeFilterChips,
      forcedTagKeys: [keyOnly],
    });
    return !shoppingRows.some((item) => rowMatchesFilters(item));
  };

  const renderShoppingMoreFoodPanelHeader = isShoppingWebSelectMode()
    ? (panel) => {
        const host = document.createElement('div');
        host.className = 'app-filter-chip-dropdown-panel-header';
        const labelText = 'not food';
        const editorLabel = document.createElement('label');
        editorLabel.className = 'bottom-nav-editor-toggle';
        const editorTitle = document.createElement('span');
        editorTitle.textContent = labelText;
        const switchTrack = document.createElement('span');
        switchTrack.className = 'bottom-nav-editor-switch-track';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'bottom-nav-editor-switch-input';
        input.setAttribute('aria-label', labelText);
        input.checked = activeFilterChips.has('not food');
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('change', () => {
          if (input.checked) {
            activeFilterChips.add('not food');
            activeFilterChips.delete('food');
          } else {
            activeFilterChips.delete('not food');
          }
          reopenShoppingCompoundDropdownId = 'shopping-more-filters';
          persistShoppingChipState();
          rerenderShoppingFilterChips();
          applyShoppingFilters();
        });
        const switchKnob = document.createElement('span');
        switchKnob.className = 'bottom-nav-editor-switch-knob';
        switchTrack.appendChild(input);
        switchTrack.appendChild(switchKnob);
        editorLabel.appendChild(editorTitle);
        editorLabel.appendChild(switchTrack);
        host.appendChild(editorLabel);
        panel.appendChild(host);
      }
    : null;

  const rerenderShoppingFilterChips = () => {
    const chipMountEl = filterChipRail?.trackEl;
    if (!chipMountEl) return;
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    const reopenCompoundDropdown =
      !suppressLocationDropdownReopen &&
      chipMountEl.querySelector('.app-filter-chip-dropdown-wrap.is-open') !=
        null;
    const reopenCompoundDropdownId = reopenCompoundDropdown
      ? reopenShoppingCompoundDropdownId
      : '';
    suppressLocationDropdownReopen = false;
    reopenShoppingCompoundDropdownId = '';
    const chips = getActiveShoppingFilterChipDefs()
      .filter((chipDef) => chipDef?.kind !== 'location')
      .map((chipDef) => {
        const chipId = String(chipDef?.id || '').toLowerCase();
        const count = Number(shoppingChipCounts.get(chipId) || 0);
        return {
          id: chipId,
          label: chipDef?.label || chipId,
          disabled: count <= 0,
        };
      });
    const locationSelectedIds = shoppingLocationChipDefs
      .map((locationDef) =>
        String(locationDef?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((locationId) => locationId && activeFilterChips.has(locationId));
    const moreSelectedIds = shoppingMoreChipOptionDefs
      .map((optionDef) =>
        String(optionDef?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((optionId) => optionId && activeFilterChips.has(optionId));
    const tagSelectedIds = shoppingTagChipOptionDefs
      .map((def) =>
        String(def?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((tid) => tid && activeFilterChips.has(tid));
    const sortOrderCompoundChip = isShoppingWebSelectMode()
      ? [
          {
            id: 'shopping-sort-order',
            label: 'sort by',
            selectionMode: 'single',
            options: [
              { id: SHOPPING_ITEMS_SORT_MODE_AZ, label: 'A–Z' },
              { id: SHOPPING_ITEMS_SORT_MODE_LOCATION, label: 'location' },
            ],
            selectedOptionIds: new Set([
              shoppingItemsSortMode === SHOPPING_ITEMS_SORT_MODE_LOCATION
                ? SHOPPING_ITEMS_SORT_MODE_LOCATION
                : SHOPPING_ITEMS_SORT_MODE_AZ,
            ]),
            onToggleOption: (optionId) => {
              const key = String(optionId || '').trim().toLowerCase();
              if (
                key !== SHOPPING_ITEMS_SORT_MODE_AZ &&
                key !== SHOPPING_ITEMS_SORT_MODE_LOCATION
              )
                return;
              if (key === shoppingItemsSortMode) return;
              shoppingItemsSortMode = key;
              persistShoppingItemsSortMode();
              reopenShoppingCompoundDropdownId = 'shopping-sort-order';
              rerenderShoppingFilterChips();
              applyShoppingFilters();
            },
          },
        ]
      : [];
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips,
      reopenCompoundDropdown,
      reopenCompoundDropdownId,
      leadingCompoundChips: sortOrderCompoundChip,
      compoundInsertIndex: isShoppingWebSelectMode()
        ? 1
        : getShoppingFilterChipMode() === 'editor'
          ? 3
          : 4,
      compoundChips: [
        {
          id: 'home-locations',
          label: 'location',
          options: shoppingLocationChipDefs.map((locationDef) => {
            const locationId = String(locationDef?.id || '')
              .trim()
              .toLowerCase();
            return {
              id: locationId,
              label: String(locationDef?.label || locationId),
              disabled: isShoppingLocationOptionUnavailable(locationId),
            };
          }),
          selectedOptionIds: locationSelectedIds,
          onToggleOption: (locationId) => {
            const key = String(locationId || '').toLowerCase();
            if (!key) return;
            if (
              !activeFilterChips.has(key) &&
              isShoppingLocationOptionUnavailable(key)
            )
              return;
            if (activeFilterChips.has(key)) {
              activeFilterChips.delete(key);
            } else {
              activeFilterChips.add(key);
            }
            reopenShoppingCompoundDropdownId = 'home-locations';
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          onClearSelection: () => {
            suppressLocationDropdownReopen = true;
            reopenShoppingCompoundDropdownId = '';
            shoppingLocationChipDefs.forEach((locationDef) => {
              const id = String(locationDef?.id || '')
                .trim()
                .toLowerCase();
              if (id) activeFilterChips.delete(id);
            });
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          clearAriaLabel: 'Clear location filters',
        },
        {
          id: 'shopping-item-tags',
          label: 'tags',
          disabled: shoppingTagChipOptionDefs.length === 0,
          options: shoppingTagChipOptionDefs.map((def) => {
            const optionId = String(def?.id || '')
              .trim()
              .toLowerCase();
            return {
              id: optionId,
              label: String(def?.label || optionId),
              disabled: isShoppingTagOptionUnavailable(optionId),
            };
          }),
          selectedOptionIds: tagSelectedIds,
          onToggleOption: (optionId) => {
            const key = String(optionId || '').toLowerCase();
            if (!key.startsWith(SHOPPING_TAG_FILTER_PREFIX)) return;
            if (
              !activeFilterChips.has(key) &&
              isShoppingTagOptionUnavailable(key)
            )
              return;
            if (activeFilterChips.has(key)) {
              activeFilterChips.delete(key);
            } else {
              activeFilterChips.add(key);
            }
            reopenShoppingCompoundDropdownId = 'shopping-item-tags';
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          onClearSelection: () => {
            suppressLocationDropdownReopen = true;
            reopenShoppingCompoundDropdownId = '';
            shoppingTagChipOptionDefs.forEach((def) => {
              const tid = String(def?.id || '')
                .trim()
                .toLowerCase();
              if (tid) activeFilterChips.delete(tid);
            });
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          clearAriaLabel: 'Clear tag filters',
        },
        {
          id: 'shopping-more-filters',
          label: 'more',
          ...(renderShoppingMoreFoodPanelHeader
            ? {
                pillActive:
                  moreSelectedIds.length > 0 ||
                  activeFilterChips.has('not food'),
                renderPanelHeader: renderShoppingMoreFoodPanelHeader,
              }
            : {}),
          options: shoppingMoreChipOptionDefs.map((optionDef) => {
            const optionId = String(optionDef?.id || '')
              .trim()
              .toLowerCase();
            const count = Number(shoppingChipCounts.get(optionId) || 0);
            return {
              id: optionId,
              label: String(optionDef?.label || optionId),
              disabled: count <= 0,
            };
          }),
          selectedOptionIds: moreSelectedIds,
          onToggleOption: (optionId) => {
            const key = String(optionId || '').toLowerCase();
            if (!key) return;
            const count = Number(shoppingChipCounts.get(key) || 0);
            if (count <= 0) return;
            if (activeFilterChips.has(key)) {
              activeFilterChips.delete(key);
            } else {
              activeFilterChips.add(key);
            }
            reopenShoppingCompoundDropdownId = 'shopping-more-filters';
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          onClearSelection: () => {
            suppressLocationDropdownReopen = true;
            reopenShoppingCompoundDropdownId = '';
            shoppingMoreChipOptionDefs.forEach((optionDef) => {
              const optionId = String(optionDef?.id || '')
                .trim()
                .toLowerCase();
              if (optionId) activeFilterChips.delete(optionId);
            });
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          clearAriaLabel: 'Clear more filters',
        },
      ],
      activeChipIds: activeFilterChips,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        if (!key) return;
        const count = Number(shoppingChipCounts.get(key) || 0);
        if (count <= 0) return;
        const isSelectedFamilyChip = key === 'selected';
        const isFoodFamilyChip = key === 'food' || key === 'not food';
        if (activeFilterChips.has(key)) {
          activeFilterChips.delete(key);
        } else {
          if (isSelectedFamilyChip) {
            activeFilterChips.delete('selected');
          }
          if (isFoodFamilyChip) {
            activeFilterChips.delete('food');
            activeFilterChips.delete('not food');
          }
          activeFilterChips.add(key);
        }
        persistShoppingChipState();
        rerenderShoppingFilterChips();
        applyShoppingFilters();
      },
      chipClassName: 'app-filter-chip',
    });
  };
  const refreshShoppingFilterUi = () => {
    recomputeShoppingChipCounts();
    pruneInactiveShoppingChipState();
    rerenderShoppingFilterChips();
  };
  const refreshShoppingSelectionUi = ({ activeKey = '' } = {}) => {
    refreshShoppingFilterUi();
    applyShoppingFilters();
    if (activeKey && hasPositiveShoppingQty(getShoppingQty(activeKey))) {
      shoppingRowStepperController.activate(activeKey);
    }
    syncAllVisibleShoppingRowStates();
  };

  window.__favoriteEatsApplyShoppingBrowseSelectionKeyMap = (remaps) => {
    if (!Array.isArray(remaps) || remaps.length === 0) return;
    remaps.forEach(
      ({ oldKey, newKey, itemName, variantName }) => {
        const okOld = String(oldKey || '').trim();
        const okNew = String(newKey || '').trim();
        if (!okOld || !okNew) return;
        if (okOld === okNew) {
          const cur = shoppingSelectionMeta.get(okNew) || {};
          shoppingSelectionMeta.set(okNew, {
            itemName: String(
              itemName != null ? itemName : cur.itemName || '',
            ).trim(),
            variantName: String(
              variantName != null ? variantName : cur.variantName || '',
            ).trim(),
          });
          return;
        }
        if (shoppingQuantities.has(okOld)) {
          const dq = Number(shoppingQuantities.get(okOld) || 0);
          const prevNew = Number(shoppingQuantities.get(okNew) || 0);
          shoppingQuantities.delete(okOld);
          const combined = Number((prevNew + dq).toFixed(4));
          if (Math.abs(combined) > SHOPPING_QTY_EPSILON) {
            shoppingQuantities.set(okNew, combined);
          }
        }
        const metaOld = shoppingSelectionMeta.get(okOld);
        shoppingSelectionMeta.delete(okOld);
        const existingNew = shoppingSelectionMeta.get(okNew) || {};
        shoppingSelectionMeta.set(okNew, {
          itemName: String(
            itemName != null
              ? itemName
              : metaOld?.itemName || existingNew.itemName || '',
          ).trim(),
          variantName: String(
            variantName != null
              ? variantName
              : metaOld?.variantName || existingNew.variantName || '',
          ).trim(),
        });
        if (selectedShoppingNames.has(okOld)) {
          selectedShoppingNames.delete(okOld);
          selectedShoppingNames.add(okNew);
        }
      },
    );
    collapseExpandedVariantRows();
    shoppingRowStepperController?.collapseAll?.();
    refreshShoppingSelectionUi();
    syncShoppingActionButtonState();
  };

  window.__favoriteEatsPruneShoppingBrowseSelectionKeys = (keys) => {
    if (!Array.isArray(keys) || keys.length === 0) return;
    keys.forEach((rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key) return;
      shoppingQuantities.delete(key);
      shoppingSelectionMeta.delete(key);
      selectedShoppingNames.delete(key);
      expandedVariantChildSteppers.delete(key);
    });
    collapseExpandedVariantRows();
    shoppingRowStepperController?.collapseAll?.();
    refreshShoppingSelectionUi();
    syncShoppingActionButtonState();
  };

  const mountShoppingFilterChips = () => {
    if (!searchInput) return;
    if (typeof window.mountTopFilterChipRail !== 'function') return;
    filterChipRail = window.mountTopFilterChipRail({
      anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
      dockId: 'shoppingFilterChipDock',
    });

    refreshShoppingFilterUi();
    filterChipRail?.sync?.();
  };

  const getFilteredShoppingRows = () => {
    const rowMatchesFilters = buildShoppingRowFilterMatcher({
      chipIds: activeFilterChips,
    });
    const recentFirst = activeFilterChips.has('recent');
    const filtered = shoppingRows.filter((item) => rowMatchesFilters(item));
    filtered.sort((a, b) => {
      if (recentFirst) {
        const aRecent = Number.isFinite(Number(a?.recentSortId))
          ? Number(a.recentSortId)
          : 0;
        const bRecent = Number.isFinite(Number(b?.recentSortId))
          ? Number(b.recentSortId)
          : 0;
        if (aRecent !== bRecent) return bRecent - aRecent;
      }
      return (a?.name || '').localeCompare(b?.name || '', undefined, {
        sensitivity: 'base',
      });
    });
    return filtered;
  };

  const applyShoppingFilters = () => {
    renderShoppingList(getFilteredShoppingRows());
  };

  function countRecipesUsingShoppingName(name) {
    const n = (name || '').trim();
    if (!n) return 0;

    // Count distinct recipes referenced by any ingredient row with this name.
    // Includes both direct ingredient usage and substitute usage.
    try {
      const q = db.exec(
        `
        SELECT COUNT(DISTINCT rid) AS n
        FROM (
          SELECT rim.recipe_id AS rid
          FROM recipe_ingredient_map rim
          JOIN ingredients i ON i.ID = rim.ingredient_id
          WHERE lower(i.name) = lower(?)
          UNION
          SELECT rim.recipe_id AS rid
          FROM recipe_ingredient_substitutes ris
          JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
          JOIN ingredients i2 ON i2.ID = ris.ingredient_id
          WHERE lower(i2.name) = lower(?)
        ) t;
        `,
        [n, n],
      );

      if (q.length && q[0].values.length) {
        const v = Number(q[0].values[0][0]);
        return Number.isFinite(v) ? v : 0;
      }
    } catch (err) {
      console.warn('countRecipesUsingShoppingName failed:', err);
    }
    return 0;
  }

  function getRecipesUsingShoppingName(name) {
    const n = (name || '').trim();
    if (!n) return [];
    try {
      const q = db.exec(
        `
        SELECT DISTINCT r.ID AS recipe_id, COALESCE(r.title, '') AS recipe_title
        FROM recipes r
        JOIN (
          SELECT rim.recipe_id AS rid
          FROM recipe_ingredient_map rim
          JOIN ingredients i ON i.ID = rim.ingredient_id
          WHERE lower(i.name) = lower(?)
          UNION
          SELECT rim.recipe_id AS rid
          FROM recipe_ingredient_substitutes ris
          JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
          JOIN ingredients i2 ON i2.ID = ris.ingredient_id
          WHERE lower(i2.name) = lower(?)
        ) refs ON refs.rid = r.ID
        ORDER BY r.title COLLATE NOCASE;
        `,
        [n, n],
      );
      if (!q.length || !q[0].values.length) return [];
      return q[0].values
        .map(([recipeId, recipeTitle]) => ({
          id: Number(recipeId),
          title: String(recipeTitle || '').trim(),
        }))
        .filter((row) => Number.isFinite(row.id) && row.id > 0);
    } catch (err) {
      console.warn('getRecipesUsingShoppingName failed:', err);
      return [];
    }
  }

  async function getRecipesUsingShoppingNameViaDataService(name) {
    const n = (name || '').trim();
    if (!n) return [];
    if (
      window.dataService &&
      typeof window.dataService.listShoppingItemRecipeUsage === 'function'
    ) {
      try {
        const rows = await window.dataService.listShoppingItemRecipeUsage(n);
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error('dataService.listShoppingItemRecipeUsage failed:', err);
      }
    }
    return getRecipesUsingShoppingName(n);
  }

  async function removeShoppingName(name) {
    const n = (name || '').trim();
    if (!n) return false;

    const recipes = await getRecipesUsingShoppingNameViaDataService(n);
    const usedCount = recipes.length;

    if (getUnitSizeRemovalAction(usedCount) === 'remove') {
      const usageLine =
        usedCount === 1
          ? 'This item is used in this recipe:'
          : 'This item is used in these recipes:';
      const details = document.createElement('div');
      details.className = 'shopping-remove-dialog-details';

      const linksWrap = document.createElement('div');
      linksWrap.className = 'shopping-remove-dialog-links';
      recipes.forEach((recipe) => {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'shopping-remove-dialog-link';
        a.textContent = recipe.title || `Recipe ${recipe.id}`;
        a.addEventListener('click', (event) => {
          event.preventDefault();
          if (typeof window.openRecipe === 'function') {
            window.openRecipe(recipe.id);
          }
        });
        linksWrap.appendChild(a);
      });
      if (recipes.length) details.appendChild(linksWrap);

      const note = document.createElement('div');
      note.className = 'shopping-remove-dialog-note';
      note.textContent = `Removing it will hide it from the Shopping Items list but will not delete it. To delete '${n}' permenantly, first remove it from the recipes that use it.`;
      details.appendChild(note);

      let ok = false;
      if (window.ui && typeof window.ui.dialog === 'function') {
        const res = await window.ui.dialog({
          title: 'Remove item',
          message: `Remove '${n}'? ${usageLine}`,
          messageNode: details,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
        ok = !!res;
      } else {
        ok = await uiConfirm({
          title: 'Remove item',
          message: `Remove '${n}'? ${usageLine}\n\nRemoving it will hide it from the Shopping Items list but will not delete it. To delete '${n}' permenantly, first remove it from the recipes that use it.`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
      }
      if (!ok) return false;

      try {
        try {
          db.run(
            'UPDATE ingredients SET is_deprecated = 1 WHERE lower(name) = lower(?);',
            [n],
          );
        } catch (_) {
          db.run(
            'UPDATE ingredients SET hide_from_shopping_list = 1 WHERE lower(name) = lower(?);',
            [n],
          );
        }
      } catch (err) {
        console.error('❌ Failed to deprecate shopping item:', err);
        uiToast('Failed to remove item. See console for details.');
        return false;
      }
    } else {
      const ok = await uiConfirm({
        title: 'Delete Shopping Item',
        message: `Delete '${n}' permanently?\n\nIt isn't used in any recipes. This will permanently delete it from the database.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true,
      });
      if (!ok) return false;

      let txStarted = false;
      try {
        db.run('BEGIN;');
        txStarted = true;

        const tableExists = (tableName) => {
          try {
            const q = db.exec(
              `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`,
              [tableName],
            );
            return !!(q.length && q[0].values && q[0].values.length);
          } catch (_) {
            return false;
          }
        };
        const hasIngredientStoreLocation = tableExists(
          'ingredient_store_location',
        );
        const hasIngredientVariants = tableExists('ingredient_variants');
        const hasIngredientVariantStoreLocation = tableExists(
          'ingredient_variant_store_location',
        );
        const hasIngredientSynonyms = tableExists('ingredient_synonyms');
        const hasRecipeIngredientSubstitutes = tableExists(
          'recipe_ingredient_substitutes',
        );
        const hasRecipeIngredientMap = tableExists('recipe_ingredient_map');

        // Gather ingredient IDs for this name (covers variants).
        const idsQ = db.exec(
          'SELECT ID FROM ingredients WHERE lower(name) = lower(?);',
          [n],
        );
        const ids = idsQ.length ? idsQ[0].values.map(([id]) => Number(id)) : [];

        // Remove dependent rows defensively (even though usedCount is 0).
        ids.forEach((id) => {
          if (!Number.isFinite(id)) return;
          if (hasIngredientStoreLocation) {
            db.run(
              'DELETE FROM ingredient_store_location WHERE ingredient_id = ?;',
              [id],
            );
          }
          if (hasIngredientVariantStoreLocation && hasIngredientVariants) {
            db.run(
              `DELETE FROM ingredient_variant_store_location
               WHERE ingredient_variant_id IN (
                 SELECT id FROM ingredient_variants WHERE ingredient_id = ?
               );`,
              [id],
            );
          }
          if (hasIngredientSynonyms) {
            db.run('DELETE FROM ingredient_synonyms WHERE ingredient_id = ?;', [
              id,
            ]);
          }
          if (hasRecipeIngredientSubstitutes) {
            db.run(
              'DELETE FROM recipe_ingredient_substitutes WHERE ingredient_id = ?;',
              [id],
            );
          }
          if (hasRecipeIngredientMap) {
            db.run(
              'DELETE FROM recipe_ingredient_map WHERE ingredient_id = ?;',
              [id],
            );
          }
        });

        db.run('DELETE FROM ingredients WHERE lower(name) = lower(?);', [n]);
        db.run('COMMIT;');
        txStarted = false;
      } catch (err) {
        if (txStarted) {
          try {
            db.run('ROLLBACK;');
          } catch (_) {}
        }
        console.error('❌ Failed to delete shopping item:', err);
        uiToast('Failed to delete item. See console for details.');
        return false;
      }
    }

    // Persist DB after remove/hide.
    try {
      await persistDbForCurrentRuntime(db, {
        isElectron: !!window.electronAPI,
        failureMessage: 'Failed to save database after removing shopping item.',
      });
    } catch (err) {
      console.error(
        '❌ Failed to persist DB after removing shopping item:',
        err,
      );
      uiToast('Failed to save database after removing shopping item.');
      return false;
    }

    return true;
  }

  // --- Shopping item label helpers (tests extract this block) ---
  function getShoppingItemDisplayName(item) {
    const fallbackName = String(item?.name || '').trim();
    if (!fallbackName) return '';
    if (typeof window?.getIngredientNounDisplay !== 'function')
      return fallbackName;

    const displayName = window.getIngredientNounDisplay({
      name: fallbackName,
      lemma: String(item?.lemma || '').trim(),
      pluralByDefault: !!item?.pluralByDefault,
      isMassNoun: !!item?.isMassNoun,
      pluralOverride: String(item?.pluralOverride || '').trim(),
    });

    return String(displayName || '').trim() || fallbackName;
  }

  if (typeof window !== 'undefined') {
    window.__shoppingItemLabelHelpers = {
      getShoppingItemDisplayName,
    };
  }
  // --- End shopping item label helpers ---

  function renderShoppingList(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    syncVariantParentByKey.clear();
    if (!items.length) {
      renderTopLevelEmptyState(list, 'shoppingItems');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    const makeTextMeasurer = (el) => {
      try {
        const cs = window.getComputedStyle ? getComputedStyle(el) : null;
        const fontStyle = cs ? cs.fontStyle : 'normal';
        const fontVariant = cs ? cs.fontVariant : 'normal';
        const fontWeight = cs ? cs.fontWeight : '400';
        const fontSize = cs ? cs.fontSize : '16px';
        const fontFamily = cs ? cs.fontFamily : 'sans-serif';
        const font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.font = font;
        return (s) => {
          try {
            return ctx.measureText(String(s || '')).width || 0;
          } catch (_) {
            return 0;
          }
        };
      } catch (_) {
        return null;
      }
    };

    const truncateToFitPx = (s, maxPx, measure) => {
      const str = String(s || '');
      if (!measure) return str;
      if (maxPx <= 0) return '';
      if (measure(str) <= maxPx) return str;

      // Ensure we can at least show an ellipsis when needed.
      const ell = '…';
      if (measure(ell) > maxPx) return '';

      let lo = 0;
      let hi = str.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const candidate = str.slice(0, Math.max(0, mid - 1)) + ell;
        if (measure(candidate) <= maxPx) lo = mid;
        else hi = mid - 1;
      }
      return str.slice(0, Math.max(0, lo - 1)) + ell;
    };

    const buildLineToFit = (li, baseName, variants, variantQtyMap) => {
      const fmtVariantQtyForLabel = (raw) => {
        const n = Number(raw);
        if (
          typeof window !== 'undefined' &&
          typeof window.formatShoppingQtyForDisplay === 'function'
        ) {
          return window.formatShoppingQtyForDisplay(n);
        }
        if (!Number.isFinite(n) || n <= 0) return '0';
        return String(Number(n.toFixed(2)));
      };

      const vs = Array.isArray(variants)
        ? variants.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      if (vs.length === 0) return baseName;

      const anySelected =
        isShoppingWebSelectMode() &&
        variantQtyMap &&
        Array.from(variantQtyMap.values()).some((q) => q > 0);

      // Build the ordered list of variant display strings.
      // If any variant is selected: counted variants first (with count prefix,
      // "any" always first among them when its count > 0), then zero-count
      // variants name-only at the end.
      // If nothing selected: just variant names in DB order, no "any".
      let parts = [];
      if (anySelected) {
        const defaultQty = (variantQtyMap && variantQtyMap.get('default')) || 0;
        if (defaultQty > 0)
          parts.push(`${fmtVariantQtyForLabel(defaultQty)} any`);
        const counted = [];
        const uncounted = [];
        vs.forEach((v) => {
          const q = (variantQtyMap && variantQtyMap.get(v)) || 0;
          if (q > 0) counted.push(`${fmtVariantQtyForLabel(q)} ${v}`);
          else uncounted.push(v);
        });
        parts = parts.concat(counted, uncounted);
      } else {
        parts = vs.slice();
      }

      const cs = window.getComputedStyle ? getComputedStyle(li) : null;
      const padL = cs ? parseFloat(cs.paddingLeft) : 0;
      const padR = cs ? parseFloat(cs.paddingRight) : 0;
      const checkboxReserve = isShoppingWebSelectMode() ? 96 : 0;
      const maxPx = Math.max(
        0,
        li.clientWidth - (padL || 0) - (padR || 0) - checkboxReserve,
      );
      const measure = makeTextMeasurer(li);
      if (!measure || maxPx <= 0) return `${baseName} (${parts[0]})`;

      const prefix = `${baseName} (`;
      const close = `)`;
      const prefixW = measure(prefix);
      const closeW = measure(close);

      const full = `${baseName} (${parts.join(', ')})`;
      if (measure(full) <= maxPx) return full;

      if (parts.length <= 3) {
        const room = Math.max(0, maxPx - prefixW - closeW);
        const inside = truncateToFitPx(parts.join(', '), room, measure);
        return `${prefix}${inside}${close}`;
      }

      for (let visibleCount = 3; visibleCount >= 1; visibleCount--) {
        const remaining = parts.length - visibleCount;
        const suffix = `, + ${remaining} more`;
        const suffixW = measure(suffix);
        const roomForNames = Math.max(0, maxPx - prefixW - suffixW - closeW);

        if (roomForNames <= 0) continue;

        const names = parts.slice(0, visibleCount).join(', ');
        if (measure(names) <= roomForNames) {
          return `${prefix}${names}${suffix}${close}`;
        }
      }

      const remaining = parts.length - 1;
      const suffix = `, + ${remaining} more`;
      const suffixW = measure(suffix);
      const roomForFirst = Math.max(0, maxPx - prefixW - suffixW - closeW);
      const first = truncateToFitPx(parts[0], roomForFirst, measure) || '…';
      return `${prefix}${first}${suffix}${close}`;
    };

    const makeStepperDOM = () => {
      return listRowStepper.createStepperDOM();
    };

    syncVariantChildVisuals = (childLi, varKey) => {
      const qty = getShoppingQty(varKey);
      const isExpanded = expandedVariantChildSteppers.has(varKey);
      const icon = childLi.querySelector('.shopping-list-row-icon');
      const stepper = childLi.querySelector('.shopping-list-row-stepper');
      const qtyEl = stepper?.querySelector('.shopping-stepper-qty');
      childLi.classList.toggle('shopping-row-checked', qty > 0);
      if (qty > 0 || isExpanded) {
        if (icon) icon.style.display = 'none';
        if (stepper) stepper.style.display = '';
        if (qtyEl) {
          qtyEl.textContent =
            typeof window.formatShoppingQtyForDisplay === 'function'
              ? window.formatShoppingQtyForDisplay(qty)
              : String(qty);
        }
      } else {
        if (icon) icon.style.display = '';
        if (stepper) stepper.style.display = 'none';
      }
    };

    const getShoppingBrowseDisplayName = (item) =>
      formatShoppingBrowseItemLabel(getShoppingItemDisplayName(item), item, {
        searchQuery: searchInput?.value || '',
        locationIds: getActiveShoppingLocationFilterIds(),
      });

    const appendShoppingBrowseRowsForItem = (item) => {
      const li = document.createElement('li');
      const baseName = String(item?.name || '').trim();
      const baseDisplayName = getShoppingItemDisplayName(item);
      const displayName = getShoppingBrowseDisplayName(item);
      const hasVariantDisplayHint = displayName !== baseDisplayName;
      const hasVariants =
        Array.isArray(item.variants) && item.variants.length > 0;
      const webSelectMode = isShoppingWebSelectMode();
      if (Number.isFinite(Number(item?.id)) && Number(item.id) > 0) {
        li.dataset.shoppingItemId = String(Math.trunc(Number(item.id)));
      }

      // ── Expandable variant row (web select mode only) ──
      if (hasVariants && webSelectMode) {
        li.classList.add('shopping-variant-parent');
        const itemKey = getShoppingSelectionKey(baseName);
        li.dataset.variantParentKey = itemKey;
        const isExpanded = expandedVariantItems.has(itemKey);
        li.dataset.expanded = isExpanded ? 'true' : 'false';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'shopping-list-row-label';
        if (
          item.variantDeprecatedSet instanceof Set &&
          item.variantDeprecatedSet.size > 0
        ) {
          labelSpan.classList.add(
            'shopping-list-row-label--variant-deprecated',
          );
        }
        labelSpan.textContent = displayName;

        const badge = document.createElement('span');
        badge.className = 'shopping-list-row-badge';
        // Keep the badge slot mounted to avoid parent-row layout shifts when
        // quantities transition between zero/non-zero while expanded.
        badge.style.display = 'inline-flex';
        badge.style.visibility = 'hidden';

        li.appendChild(labelSpan);
        li.appendChild(badge);

        const childRows = [];

        // Parent visuals: chevron always visible; badge with total only when
        // collapsed with count > 0; no badge while expanded.
        // Defined before child row creation so incrementVariant can reference it.
        const syncParentVisuals = () => {
          const totalQty = getItemTotalQty(baseName, item.variants, item);
          const expanded = li.dataset.expanded === 'true';
          li.classList.toggle('shopping-row-checked', totalQty > 0);

          if (expanded) {
            labelSpan.textContent = `${displayName} \u25B4`;
            if (totalQty > 0) {
              const label =
                typeof window.formatShoppingQtyForDisplay === 'function'
                  ? window.formatShoppingQtyForDisplay(totalQty)
                  : String(totalQty);
              listRowStepper.setShoppingListBadgeQtyLabel(badge, label);
              badge.style.visibility = 'visible';
            } else {
              listRowStepper.setShoppingListBadgeQtyLabel(badge, '');
              badge.style.visibility = 'hidden';
            }
          } else {
            if (totalQty > 0) {
              const label =
                typeof window.formatShoppingQtyForDisplay === 'function'
                  ? window.formatShoppingQtyForDisplay(totalQty)
                  : String(totalQty);
              listRowStepper.setShoppingListBadgeQtyLabel(badge, label);
              badge.style.visibility = 'visible';
            } else {
              listRowStepper.setShoppingListBadgeQtyLabel(badge, '');
              badge.style.visibility = 'hidden';
            }
            requestAnimationFrame(() => {
              try {
                if (hasVariantDisplayHint) {
                  labelSpan.textContent = `${displayName} \u25BE`;
                  return;
                }
                const qtyMap = getVariantQtyMap(baseName, item.variants, item);
                const nextText = buildLineToFit(
                  li,
                  baseDisplayName,
                  item.variants,
                  qtyMap,
                );
                labelSpan.textContent = `${nextText} \u25BE`;
              } catch (_) {}
            });
          }
        };
        syncVariantParentByKey.set(itemKey, syncParentVisuals);

        // Build variant child rows: show "any" first, then DB sort order.
        const allVariantNames = ['default', ...item.variants];
        const clearVariantChildStepperExpansion = () => {
          allVariantNames.forEach((variantName) => {
            expandedVariantChildSteppers.delete(
              getBrowseVariantPlanKey(baseName, variantName, item),
            );
          });
          childRows.forEach((row) => {
            const varKey = String(row.dataset.variantQtyKey || '');
            if (varKey) syncVariantChildVisuals(row, varKey);
          });
        };
        const toggleExpansion = () => {
          if (shoppingRowStepperController.collapseActive()) {
            syncAllVisibleShoppingRowStates();
          }
          const wasExpanded = expandedVariantItems.has(itemKey);
          if (wasExpanded) {
            expandedVariantItems.delete(itemKey);
            li.dataset.expanded = 'false';
            clearVariantChildStepperExpansion();
            childRows.forEach((r) => (r.style.display = 'none'));
          } else {
            collapseExpandedVariantRows();
            expandedVariantItems.add(itemKey);
            li.dataset.expanded = 'true';
            childRows.forEach((r) => (r.style.display = ''));
          }
          syncParentVisuals();
        };

        allVariantNames.forEach((variantName) => {
          const childLi = document.createElement('li');
          childLi.classList.add('shopping-variant-child');
          childLi.style.display = isExpanded ? '' : 'none';

          const childLabel = document.createElement('span');
          childLabel.className = 'shopping-list-row-label';
          const vdk = String(variantName || '').trim().toLowerCase();
          if (
            item.variantDeprecatedSet instanceof Set &&
            vdk &&
            item.variantDeprecatedSet.has(vdk)
          ) {
            childLabel.classList.add(
              'shopping-list-row-label--variant-deprecated',
            );
          }
          childLabel.textContent =
            variantName === 'default' ? 'any' : variantName;

          const childIcon = document.createElement('span');
          childIcon.className =
            'material-symbols-outlined shopping-list-row-icon';
          childIcon.textContent = 'add_box';
          childIcon.setAttribute('aria-hidden', 'true');

          const {
            stepper: childStepper,
            minusBtn,
            plusBtn,
            qtySpan,
          } = makeStepperDOM();

          childLi.appendChild(childLabel);
          childLi.appendChild(childIcon);
          childLi.appendChild(childStepper);

          const varKey = getBrowseVariantPlanKey(baseName, variantName, item);
          childLi.dataset.variantQtyKey = varKey;
          syncVariantChildVisuals(childLi, varKey);

          const incrementVariant = (delta) => {
            const qty = getShoppingQty(varKey);
            const nextQty = getNextShoppingStepQty(qty, delta);
            setShoppingQty(varKey, nextQty, {
              itemName: baseName,
              variantName: variantName === 'default' ? 'default' : variantName,
            });
            if (!hasPositiveShoppingQty(nextQty)) {
              expandedVariantChildSteppers.delete(varKey);
            }
            refreshShoppingSelectionUi();
          };
          attachShoppingQtyManualEdit({
            qtyEl: qtySpan,
            getQty: () => getShoppingQty(varKey),
            commitQty: (nextQty) =>
              setShoppingQty(varKey, nextQty, {
                itemName: baseName,
                variantName,
              }),
            onAfterCommit: () => refreshShoppingSelectionUi(),
          });

          childIcon.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            expandedVariantChildSteppers.add(varKey);
            incrementVariant(1);
          });
          minusBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isShoppingWebSelectMode() && getShoppingQty(varKey) <= 0) {
              expandedVariantChildSteppers.delete(varKey);
              syncVariantChildVisuals(childLi, varKey);
              syncParentVisuals();
              return;
            }
            incrementVariant(-1);
          });
          plusBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            expandedVariantChildSteppers.add(varKey);
            incrementVariant(1);
          });

          childLi.addEventListener('click', (event) => {
            if (!isShoppingWebSelectMode()) return;
            if (expandedVariantChildSteppers.has(varKey)) {
              expandedVariantChildSteppers.delete(varKey);
            } else {
              expandedVariantChildSteppers.add(varKey);
            }
            syncVariantChildVisuals(childLi, varKey);
            syncParentVisuals();
          });

          childLi.addEventListener('contextmenu', (event) => {
            event.preventDefault();
          });

          childRows.push(childLi);
        });

        li.addEventListener('click', (event) => {
          const wantsRemove = event.ctrlKey || event.metaKey;
          const webSelectMode = isShoppingWebSelectMode();
          if (wantsRemove && !webSelectMode) {
            event.preventDefault();
            event.stopPropagation();
            void (async () => {
              const ok = await removeShoppingName(item.name || '');
              if (!ok) return;
              rememberShoppingScrollForReload();
              window.location.reload();
            })();
            return;
          }
          if (webSelectMode) {
            toggleExpansion();
            return;
          }
          sessionStorage.setItem('selectedShoppingItemId', String(item.id));
          sessionStorage.setItem('selectedShoppingItemName', item.name || '');
          sessionStorage.removeItem('selectedShoppingItemIsNew');
          rememberShoppingScrollForReload();
          window.location.href = getShoppingEditorHref();
        });

        badge.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isShoppingWebSelectMode()) return;
          toggleExpansion();
        });

        li.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          if (isShoppingWebSelectMode()) {
            if (isCtrlPrimaryContextMenuGesture(event)) return;
            li.classList.toggle('shopping-row-flagged');
            return;
          }
          void (async () => {
            const ok = await removeShoppingName(item.name || '');
            if (!ok) return;
            rememberShoppingScrollForReload();
            window.location.reload();
          })();
        });

        list.appendChild(li);
        childRows.forEach((child) => list.appendChild(child));
        syncParentVisuals();
        li.title = `${displayName}\n\nAll variants: ${item.variants.join(', ')}`;

        return; // next item
      }

      // ── Simple row (no variants, or non-web-mode) ──
      const labelSpan = document.createElement('span');
      labelSpan.className = 'shopping-list-row-label';
      labelSpan.textContent = displayName;
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined shopping-list-row-icon';
      icon.textContent = 'add_box';
      icon.setAttribute('aria-hidden', 'true');

      const { stepper, minusBtn, plusBtn, qtySpan } = makeStepperDOM();

      const badge = document.createElement('span');
      badge.className = 'shopping-list-row-badge';
      badge.style.display = 'none';
      li.dataset.shoppingStepperKey = baseName;
      li.appendChild(labelSpan);
      li.appendChild(icon);
      li.appendChild(stepper);
      li.appendChild(badge);
      syncShoppingRowSelectionState(li, baseName);
      attachShoppingQtyManualEdit({
        qtyEl: qtySpan,
        getQty: () => getShoppingQty(getShoppingSelectionKey(baseName)),
        commitQty: (nextQty) =>
          setShoppingQty(getShoppingSelectionKey(baseName), nextQty, {
            itemName: baseName,
          }),
        onAfterCommit: () =>
          refreshShoppingSelectionUi({
            activeKey: getShoppingSelectionKey(baseName),
          }),
      });

      icon.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isShoppingWebSelectMode()) return;
        incrementShoppingQty(li, baseName, 1);
      });

      badge.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isShoppingWebSelectMode()) return;
        shoppingRowStepperController.activate(
          getShoppingSelectionKey(baseName),
        );
        syncAllVisibleShoppingRowStates();
      });

      minusBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (
          isShoppingWebSelectMode() &&
          getShoppingQty(getShoppingSelectionKey(baseName)) <= 0
        ) {
          if (
            shoppingRowStepperController.isActive(
              getShoppingSelectionKey(baseName),
            )
          ) {
            shoppingRowStepperController.collapseActive();
            syncAllVisibleShoppingRowStates();
          }
          return;
        }
        incrementShoppingQty(li, baseName, -1);
      });

      plusBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        incrementShoppingQty(li, baseName, 1);
      });

      li.addEventListener('click', (event) => {
        const wantsRemove = event.ctrlKey || event.metaKey;
        const webSelectMode = isShoppingWebSelectMode();
        if (wantsRemove && !webSelectMode) {
          event.preventDefault();
          event.stopPropagation();
          void (async () => {
            const ok = await removeShoppingName(item.name || '');
            if (!ok) return;
            rememberShoppingScrollForReload();
            window.location.reload();
          })();
          return;
        }

        if (webSelectMode) {
          const hadExpandedVariants = collapseExpandedVariantRows();
          // If this click only served to collapse an expanded variant group,
          // do not also auto-expand a simple-row stepper at qty 0.
          if (hadExpandedVariants) return;
          shoppingRowStepperController.toggle(
            getShoppingSelectionKey(baseName),
          );
          syncAllVisibleShoppingRowStates();
          return;
        }

        sessionStorage.setItem('selectedShoppingItemId', String(item.id));
        sessionStorage.setItem('selectedShoppingItemName', item.name || '');
        sessionStorage.removeItem('selectedShoppingItemIsNew');
        rememberShoppingScrollForReload();
        window.location.href = getShoppingEditorHref();
      });

      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (isShoppingWebSelectMode()) {
          if (isCtrlPrimaryContextMenuGesture(event)) return;
          li.classList.toggle('shopping-row-flagged');
          return;
        }
        void (async () => {
          const ok = await removeShoppingName(item.name || '');
          if (!ok) return;
          rememberShoppingScrollForReload();
          window.location.reload();
        })();
      });

      list.appendChild(li);

      if (hasVariants) {
        try {
          requestAnimationFrame(() => {
            try {
              if (hasVariantDisplayHint) {
                labelSpan.textContent = displayName;
                li.title = `${displayName}\n\nAll variants: ${item.variants.join(', ')}`;
                return;
              }
              const qtyMap = isShoppingWebSelectMode()
                ? getVariantQtyMap(baseName, item.variants, item)
                : null;
              const nextText = buildLineToFit(
                li,
                baseDisplayName,
                item.variants,
                qtyMap,
              );
              labelSpan.textContent = nextText;
              li.title = `${displayName}\n\nAll variants: ${item.variants.join(', ')}`;
            } catch (_) {}
          });
        } catch (_) {}
      }
    };

    const sortIsLocation =
      isShoppingWebSelectMode() &&
      shoppingItemsSortMode === SHOPPING_ITEMS_SORT_MODE_LOCATION;
    const searchActiveForSections = !!(searchInput?.value || '').trim();

    if (!sortIsLocation) {
      items.forEach(appendShoppingBrowseRowsForItem);
    } else {
      const bucketOrderIds = shoppingLocationChipDefs.map((def) =>
        String(def?.id || '')
          .trim()
          .toLowerCase(),
      );
      const bucketLists = new Map();
      bucketOrderIds.forEach((id) => bucketLists.set(id, []));
      const primaryBucketForItem = (browseItem) => {
        const ids = getShoppingRowLocationIdsForBrowse(browseItem);
        const idSet = new Set(ids);
        for (let i = 0; i < bucketOrderIds.length; i++) {
          const bid = bucketOrderIds[i];
          if (idSet.has(bid)) return bid;
        }
        return 'none';
      };
      items.forEach((browseItem) => {
        const b = primaryBucketForItem(browseItem);
        if (!bucketLists.has(b)) bucketLists.set(b, []);
        bucketLists.get(b).push(browseItem);
      });
      bucketLists.forEach((arr) => {
        arr.sort((a, b) =>
          (a?.name || '').localeCompare(b?.name || '', undefined, {
            sensitivity: 'base',
          }),
        );
      });
      bucketOrderIds.forEach((bucketId) => {
        const rowItems = bucketLists.get(bucketId) || [];
        if (!rowItems.length) return;
        const def = shoppingLocationChipDefs.find(
          (d) =>
            String(d?.id || '')
              .trim()
              .toLowerCase() === bucketId,
        );
        const headerRaw = String(def?.label || bucketId || '').trim();
        const headerText = headerRaw.toUpperCase();
        const sectionKey = itemsBrowseHomeCollapseKey(bucketId);
        const sectionLi = document.createElement('li');
        sectionLi.className =
          'list-section-label shopping-list-section--store'.trim();
        const isCollapsible = !searchActiveForSections;
        if (isCollapsible) {
          const isExpanded = !collapsedItemsBrowseHomeSections.has(sectionKey);
          const toggleBtn = createSectionToggleButton({
            label: headerText,
            expanded: isExpanded,
            completed: false,
            onToggle: () => {
              if (collapsedItemsBrowseHomeSections.has(sectionKey)) {
                collapsedItemsBrowseHomeSections.delete(sectionKey);
              } else {
                collapsedItemsBrowseHomeSections.add(sectionKey);
              }
              persistItemsBrowseHomeCollapsed();
              applyShoppingFilters();
            },
          });
          sectionLi.appendChild(toggleBtn);
        } else {
          sectionLi.textContent = headerText;
        }
        list.appendChild(sectionLi);
        if (
          !isCollapsible ||
          !collapsedItemsBrowseHomeSections.has(sectionKey)
        ) {
          rowItems.forEach(appendShoppingBrowseRowsForItem);
        }
      });
    }

    // Keep selection valid after rerender (search/filter changes).
    listNav?.syncAfterRender?.();
  }

  restoreShoppingChipState();
  mountShoppingFilterChips();
  // Initial render
  applyShoppingFilters();
  restoreShoppingScrollAfterReload();
  scrollToShoppingNavTarget(pendingShoppingNavTarget);

  // Recipes-style Add: popup → Cancel does nothing → Create inserts + opens editor
  async function openCreateShoppingItemDialog() {
    if (!window.ui) {
      uiToast('UI not ready yet.');
      return;
    }

    const name = await window.ui.prompt({
      title: 'New Shopping Item',
      label: 'Name',
      value: '',
      placeholder: '',
      confirmText: 'Create',
      cancelText: 'Cancel',
      required: true,
      normalize: (v) => (v || '').trim(),
    });
    if (!name) return;

    let newId = null;
    try {
      // Reuse existing ingredient if one with this name already exists.
      const existQ = db.exec(
        `SELECT ID FROM ingredients WHERE lower(name) = lower('${name.replace(/'/g, "''")}') LIMIT 1;`,
      );
      if (existQ.length && existQ[0].values.length) {
        newId = existQ[0].values[0][0];
      } else {
        let cols = [];
        try {
          const info = db.exec('PRAGMA table_info(ingredients);');
          const rows = info.length ? info[0].values : [];
          cols = rows.map((r) => String(r[1] || '').toLowerCase());
        } catch (_) {
          cols = [];
        }
        const has = (c) => cols.includes(String(c).toLowerCase());

        const insCols = ['name'];
        const insVals = [name];
        if (has('lemma')) {
          insCols.push('lemma');
          insVals.push(deriveIngredientLemmaInMain(name));
        }

        const ph = insCols.map(() => '?').join(', ');
        db.run(
          `INSERT INTO ingredients (${insCols.join(', ')}) VALUES (${ph});`,
          insVals,
        );
        const idQ = db.exec('SELECT last_insert_rowid();');
        if (idQ.length && idQ[0].values.length) {
          newId = idQ[0].values[0][0];
        }
      }
    } catch (err) {
      console.error('❌ Failed to create shopping item:', err);
      uiToast('Failed to create shopping item. See console.');
      return;
    }

    try {
      await persistDbForCurrentRuntime(db, {
        isElectron: !!window.electronAPI,
        failureMessage: 'Failed to save database after creating shopping item.',
      });
    } catch (err) {
      console.error(
        '❌ Failed to persist DB after creating shopping item:',
        err,
      );
      uiToast('Failed to save database after creating shopping item.');
      return;
    }

    if (newId != null) {
      sessionStorage.setItem('selectedShoppingItemId', String(newId));
      sessionStorage.setItem('selectedShoppingItemName', name);
      sessionStorage.setItem('selectedShoppingItemIsNew', '1');
      window.location.href =
        favoriteEatsHrefWithCurrentAdapter('shoppingEditor.html');
    }
  }

  const onShoppingActionClick = () => {
    if (isShoppingWebSelectMode()) {
      const hasItemSelections =
        Object.keys(getShoppingPlanItemSelections()).length > 0;
      const hasRecipeSelections =
        Object.keys(getShoppingPlanRecipeSelections()).length > 0;
      if (!hasItemSelections && !hasRecipeSelections) {
        uiToast('No shopping selections to clear.');
        return;
      }
      const previousPlan = cloneForUndo(getShoppingPlan(), () =>
        createEmptyShoppingPlan(),
      );
      const previousShoppingQuantities = new Map(shoppingQuantities);
      const previousShoppingRecipeQuantities = new Map(
        shoppingRecipeQuantities,
      );
      const previousSelectedShoppingNames = new Set(selectedShoppingNames);
      const previousShoppingSelectionMeta = new Map(
        Array.from(shoppingSelectionMeta.entries(), ([key, value]) => [
          key,
          cloneForUndo(value, () => value),
        ]),
      );
      const restoreClearedSelections = () => {
        persistShoppingPlan(previousPlan);
        shoppingQuantities.clear();
        previousShoppingQuantities.forEach((qty, key) => {
          shoppingQuantities.set(key, qty);
        });
        shoppingRecipeQuantities.clear();
        previousShoppingRecipeQuantities.forEach((qty, key) => {
          shoppingRecipeQuantities.set(key, qty);
        });
        selectedShoppingNames.clear();
        previousSelectedShoppingNames.forEach((name) => {
          selectedShoppingNames.add(name);
        });
        shoppingSelectionMeta.clear();
        previousShoppingSelectionMeta.forEach((meta, key) => {
          shoppingSelectionMeta.set(
            key,
            cloneForUndo(meta, () => meta),
          );
        });
        collapseExpandedVariantRows();
        shoppingRowStepperController?.collapseAll?.();
        refreshShoppingSelectionUi();
        syncShoppingActionButtonState();
      };
      clearShoppingPlanSelections({ clearItems: true, clearRecipes: true });
      shoppingQuantities.clear();
      shoppingRecipeQuantities.clear();
      selectedShoppingNames.clear();
      shoppingSelectionMeta.clear();
      collapseExpandedVariantRows();
      shoppingRowStepperController?.collapseAll?.();
      refreshShoppingSelectionUi();
      syncShoppingActionButtonState();
      uiToastUndo(
        'All shopping selections cleared.',
        restoreClearedSelections,
      );
    } else {
      void openCreateShoppingItemDialog();
    }
  };
  const syncShoppingAppBarActionChrome = () => {
    if (!addBtn) return;
    if (isShoppingWebSelectMode()) {
      ensureAppBarTextActionPair(addBtn, 'Reset', 'restart_alt');
    } else {
      ensureAppBarTextActionPair(addBtn, 'Add', 'add');
    }
    syncShoppingActionButtonState();
  };
  if (addBtn) {
    syncShoppingAppBarActionChrome();
    addBtn.addEventListener('click', onShoppingActionClick);
    window.addEventListener(
      FAVORITE_EATS_FORCE_WEB_MODE_EVENT,
      () => {
        if (!document.body.classList.contains('shopping-page')) return;
        syncShoppingAppBarActionChrome();
        shoppingRowStepperController?.collapseAll?.();
        refreshShoppingSelectionUi();
      },
    );
  }
}

// --- Shopping list checklist helpers (tests extract this block) ---
const SHOPPING_LIST_DOC_STORAGE_KEY = 'favoriteEats:shopping-list-doc:v2';
const SHOPPING_LIST_VIEW_MODE_SESSION_KEY =
  'favoriteEats:shopping-list-view-mode';
const SHOPPING_LIST_DOC_VERSION = 3;

function readShoppingListViewModeFromSession() {
  try {
    const raw = String(
      sessionStorage.getItem(SHOPPING_LIST_VIEW_MODE_SESSION_KEY) || '',
    )
      .trim()
      .toLowerCase();
    if (raw === 'home' || raw === 'stores') return raw;
  } catch (_) {}
  return 'stores';
}

function persistShoppingListViewMode(mode) {
  const next = mode === 'home' ? 'home' : 'stores';
  try {
    sessionStorage.setItem(SHOPPING_LIST_VIEW_MODE_SESSION_KEY, next);
  } catch (_) {}
}

function createShoppingListChecklistRowId() {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `shopping-list-row-${stamp}-${random}`;
}

function createEmptyShoppingListDoc() {
  return {
    version: SHOPPING_LIST_DOC_VERSION,
    rows: [],
  };
}

function normalizeShoppingListDocRow(rawRow, fallbackOrder = 0) {
  const source =
    rawRow && typeof rawRow === 'object' && !Array.isArray(rawRow)
      ? rawRow
      : {};
  const text = String(source.text || '').trim();
  if (!text) return null;
  const rawOrder = Number(source.order);
  const rawStoreId = Math.trunc(Number(source.storeId));
  const rawAisleId = Math.trunc(Number(source.aisleId));
  const rawAisleSortOrder = Number(source.aisleSortOrder);
  const hasExplicitAisleSortOrder =
    source.aisleSortOrder != null &&
    String(source.aisleSortOrder).trim() !== '';
  const sourceKey = String(source.sourceKey || '').trim();
  const sourceText = String(source.sourceText || '').trim();
  const sourceStoreLabel = String(source.sourceStoreLabel || '').trim();
  const sourceBucketLabel = String(source.sourceBucketLabel || '').trim();
  const hasExplicitUserEdited = typeof source.userEdited === 'boolean';
  const inferredUserEdited = !!(
    sourceKey &&
    sourceText &&
    text &&
    text !== sourceText
  );
  return {
    id: String(source.id || '').trim() || createShoppingListChecklistRowId(),
    text,
    checked: !!source.checked,
    storeLabel: String(source.storeLabel || '').trim(),
    storeId: Number.isFinite(rawStoreId) && rawStoreId > 0 ? rawStoreId : null,
    bucketLabel: String(source.bucketLabel || '').trim(),
    aisleId: Number.isFinite(rawAisleId) && rawAisleId > 0 ? rawAisleId : null,
    aisleSortOrder:
      hasExplicitAisleSortOrder && Number.isFinite(rawAisleSortOrder)
        ? rawAisleSortOrder
        : null,
    sourceKey,
    sourceText: sourceKey ? sourceText || text : '',
    sourceStoreLabel: sourceKey
      ? sourceStoreLabel || String(source.storeLabel || '').trim()
      : '',
    sourceBucketLabel: sourceKey
      ? sourceBucketLabel || String(source.bucketLabel || '').trim()
      : '',
    userEdited: sourceKey
      ? hasExplicitUserEdited
        ? !!source.userEdited || inferredUserEdited
        : inferredUserEdited
      : false,
    order: Number.isFinite(rawOrder) ? rawOrder : fallbackOrder,
  };
}

function normalizeShoppingListDoc(rawDoc) {
  const source =
    rawDoc && typeof rawDoc === 'object' && !Array.isArray(rawDoc)
      ? rawDoc
      : {};
  const rawRows = Array.isArray(source.rows) ? source.rows : [];
  const rows = rawRows
    .map((row, index) => normalizeShoppingListDocRow(row, index))
    .filter(Boolean)
    .sort((a, b) => {
      const orderDelta = Number(a.order || 0) - Number(b.order || 0);
      if (Math.abs(orderDelta) > 1e-9) return orderDelta;
      return String(a.id || '').localeCompare(String(b.id || ''));
    })
    .map((row, index) => ({
      ...row,
      order: index,
    }));
  return {
    version: SHOPPING_LIST_DOC_VERSION,
    rows,
  };
}

function loadShoppingListDocFromStorage() {
  try {
    const raw = localStorage.getItem(SHOPPING_LIST_DOC_STORAGE_KEY);
    if (!raw) return null;
    return normalizeShoppingListDoc(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

function persistShoppingListDoc(doc) {
  const normalized = normalizeShoppingListDoc(doc);
  try {
    localStorage.setItem(
      SHOPPING_LIST_DOC_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch (_) {}
  return normalized;
}

function doesShoppingListRowHaveUserOverride(row) {
  if (!row || typeof row !== 'object') return false;
  const sourceKey = String(row.sourceKey || '').trim();
  const text = String(row.text || '').trim();
  const sourceText = String(row.sourceText || '').trim();
  if (!sourceKey || !text || !sourceText) return false;
  return !!row.userEdited && text !== sourceText;
}

function hydrateLegacyShoppingListDocSources(storedDoc, generatedDoc) {
  const normalizedStoredDoc = normalizeShoppingListDoc(storedDoc);
  const normalizedGeneratedDoc = normalizeShoppingListDoc(generatedDoc);
  const storedRows = normalizedStoredDoc.rows;
  const generatedRows = normalizedGeneratedDoc.rows;
  const allRowsNeedSourceKeys =
    storedRows.length > 0 &&
    storedRows.every((row) => !String(row?.sourceKey || '').trim());
  if (!allRowsNeedSourceKeys) return normalizedStoredDoc;
  if (storedRows.length !== generatedRows.length) return normalizedStoredDoc;
  const canHydrateByOrder = storedRows.every((row, index) => {
    const generatedRow = generatedRows[index];
    if (!generatedRow || !String(generatedRow.sourceKey || '').trim())
      return false;
    return (
      String(row.storeLabel || '').trim() ===
        String(generatedRow.storeLabel || '').trim() &&
      String(row.bucketLabel || '').trim() ===
        String(generatedRow.bucketLabel || '').trim()
    );
  });
  if (!canHydrateByOrder) return normalizedStoredDoc;
  return normalizeShoppingListDoc({
    version: SHOPPING_LIST_DOC_VERSION,
    rows: storedRows.map((row, index) => {
      const generatedRow = generatedRows[index];
      const generatedText = String(generatedRow?.text || '').trim();
      return {
        ...row,
        sourceKey: String(generatedRow?.sourceKey || '').trim(),
        sourceText: generatedText,
        sourceStoreLabel: String(generatedRow?.sourceStoreLabel || '').trim(),
        sourceBucketLabel: String(generatedRow?.sourceBucketLabel || '').trim(),
        userEdited: generatedText
          ? String(row?.text || '').trim() !== generatedText
          : false,
      };
    }),
  });
}

function buildShoppingListDocFromPlanRows(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const docRows = [];
  let currentStoreLabel = '';
  let currentStoreId = null;
  let currentBucketLabel = '';
  let currentAisleId = null;
  let currentAisleSortOrder = null;

  sourceRows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const rowType = String(row.rowType || '').trim();
    const text = String(row.text || row.label || '').trim();
    const className = String(row.className || '').trim();
    const rowStoreId = Math.trunc(Number(row.storeId));
    const rowAisleId = Math.trunc(Number(row.aisleId));
    const rowAisleSortOrder = Number(row.aisleSortOrder);

    if (rowType === 'section') {
      if (!text) return;
      if (className.includes('shopping-list-section--store')) {
        currentStoreLabel = text;
        currentStoreId =
          Number.isFinite(rowStoreId) && rowStoreId > 0 ? rowStoreId : null;
        currentBucketLabel = '';
        currentAisleId = null;
        currentAisleSortOrder = null;
        return;
      }
      if (className.includes('shopping-list-section--unlisted')) {
        currentStoreLabel = '';
        currentStoreId = null;
        currentBucketLabel = text;
        currentAisleId = null;
        currentAisleSortOrder = null;
        return;
      }
      currentBucketLabel = text;
      currentAisleId =
        Number.isFinite(rowAisleId) && rowAisleId > 0 ? rowAisleId : null;
      currentAisleSortOrder = Number.isFinite(rowAisleSortOrder)
        ? rowAisleSortOrder
        : null;
      return;
    }

    if (!text) return;
    docRows.push({
      id: createShoppingListChecklistRowId(),
      text,
      checked: false,
      storeLabel: currentStoreLabel,
      storeId: currentStoreId,
      bucketLabel: currentBucketLabel,
      aisleId: currentAisleId,
      aisleSortOrder: currentAisleSortOrder,
      sourceKey: String(row.key || '').trim(),
      sourceText: text,
      sourceStoreLabel: currentStoreLabel,
      sourceBucketLabel: currentBucketLabel,
      userEdited: false,
      order: docRows.length,
    });
  });

  return normalizeShoppingListDoc({
    version: SHOPPING_LIST_DOC_VERSION,
    rows: docRows,
  });
}

function mergeShoppingListDocWithGenerated(storedDoc, generatedDoc) {
  const normalizedGeneratedDoc = normalizeShoppingListDoc(generatedDoc);
  const normalizedStoredDoc = hydrateLegacyShoppingListDocSources(
    storedDoc,
    normalizedGeneratedDoc,
  );
  const generatedRows = normalizedGeneratedDoc.rows;
  const storedRows = normalizedStoredDoc.rows;
  const storedRowsBySourceKey = new Map();
  const manualRows = [];
  storedRows.forEach((row) => {
    const sourceKey = String(row?.sourceKey || '').trim();
    if (!sourceKey) {
      manualRows.push(row);
      return;
    }
    storedRowsBySourceKey.set(sourceKey, row);
  });

  const generatedSourceKeys = new Set();
  const mergedRows = [];
  const conflicts = [];

  generatedRows.forEach((generatedRow) => {
    const sourceKey = String(generatedRow?.sourceKey || '').trim();
    if (!sourceKey) {
      mergedRows.push(generatedRow);
      return;
    }
    generatedSourceKeys.add(sourceKey);
    const storedRow = storedRowsBySourceKey.get(sourceKey);
    if (!storedRow) {
      mergedRows.push(generatedRow);
      return;
    }

    const hasUserOverride = doesShoppingListRowHaveUserOverride(storedRow);
    const sourceChanged =
      String(storedRow.sourceText || '').trim() !==
        String(generatedRow.sourceText || '').trim() ||
      String(storedRow.sourceStoreLabel || '').trim() !==
        String(generatedRow.sourceStoreLabel || '').trim() ||
      String(storedRow.sourceBucketLabel || '').trim() !==
        String(generatedRow.sourceBucketLabel || '').trim();

    if (hasUserOverride && sourceChanged) {
      mergedRows.push(storedRow);
      conflicts.push({
        kind: 'update',
        rowId: String(storedRow.id || '').trim(),
        sourceKey,
        currentText: String(storedRow.text || '').trim(),
        previousGeneratedText: String(storedRow.sourceText || '').trim(),
        nextGeneratedText: String(generatedRow.sourceText || '').trim(),
        nextGeneratedDisplayText: String(generatedRow.text || '').trim(),
        nextStoreLabel: String(generatedRow.sourceStoreLabel || '').trim(),
        nextBucketLabel: String(generatedRow.sourceBucketLabel || '').trim(),
        nextStoreId: generatedRow.storeId,
        nextAisleId: generatedRow.aisleId,
        nextAisleSortOrder: generatedRow.aisleSortOrder,
      });
      return;
    }

    mergedRows.push({
      ...storedRow,
      text: hasUserOverride
        ? String(storedRow.text || '').trim()
        : String(generatedRow.text || '').trim(),
      checked: !!storedRow.checked,
      storeLabel: String(generatedRow.storeLabel || '').trim(),
      storeId: generatedRow.storeId,
      bucketLabel: String(generatedRow.bucketLabel || '').trim(),
      aisleId: generatedRow.aisleId,
      aisleSortOrder: generatedRow.aisleSortOrder,
      sourceKey,
      sourceText: String(generatedRow.sourceText || '').trim(),
      sourceStoreLabel: String(generatedRow.sourceStoreLabel || '').trim(),
      sourceBucketLabel: String(generatedRow.sourceBucketLabel || '').trim(),
      userEdited: hasUserOverride,
    });
  });

  storedRows.forEach((storedRow) => {
    const sourceKey = String(storedRow?.sourceKey || '').trim();
    if (!sourceKey || generatedSourceKeys.has(sourceKey)) return;
    if (!doesShoppingListRowHaveUserOverride(storedRow)) return;
    mergedRows.push(storedRow);
    conflicts.push({
      kind: 'remove',
      rowId: String(storedRow.id || '').trim(),
      sourceKey,
      currentText: String(storedRow.text || '').trim(),
      previousGeneratedText: String(storedRow.sourceText || '').trim(),
      nextGeneratedText: '',
      nextGeneratedDisplayText: '',
      nextStoreLabel: '',
      nextBucketLabel: '',
    });
  });

  manualRows
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
    .forEach((row) => {
      mergedRows.push(row);
    });

  return {
    doc: normalizeShoppingListDoc({
      version: SHOPPING_LIST_DOC_VERSION,
      rows: mergedRows,
    }),
    conflicts,
  };
}

function resolveShoppingListDocConflict(doc, conflict, resolution = 'keep') {
  const normalizedDoc = normalizeShoppingListDoc(doc);
  const rows = normalizedDoc.rows.slice();
  const rowIndex = rows.findIndex(
    (row) => String(row?.id || '') === String(conflict?.rowId || ''),
  );
  if (rowIndex === -1) return normalizedDoc;
  const row = rows[rowIndex];
  const mode = resolution === 'replace' ? 'replace' : 'keep';

  if (String(conflict?.kind || '').trim() === 'remove') {
    if (mode === 'replace') {
      rows.splice(rowIndex, 1);
      return normalizeShoppingListDoc({
        version: SHOPPING_LIST_DOC_VERSION,
        rows,
      });
    }
    rows[rowIndex] = {
      ...row,
      sourceKey: '',
      sourceText: '',
      sourceStoreLabel: '',
      sourceBucketLabel: '',
      userEdited: false,
    };
    return normalizeShoppingListDoc({
      version: SHOPPING_LIST_DOC_VERSION,
      rows,
    });
  }

  const nextGeneratedText = String(conflict?.nextGeneratedText || '').trim();
  const nextStoreLabel = String(conflict?.nextStoreLabel || '').trim();
  const nextBucketLabel = String(conflict?.nextBucketLabel || '').trim();
  const nextStoreId = Math.trunc(Number(conflict?.nextStoreId));
  const nextAisleId = Math.trunc(Number(conflict?.nextAisleId));
  const nextAisleSortOrder = Number(conflict?.nextAisleSortOrder);
  if (!nextGeneratedText) return normalizedDoc;

  if (mode === 'replace') {
    rows[rowIndex] = {
      ...row,
      text: nextGeneratedText,
      storeLabel: nextStoreLabel,
      storeId:
        Number.isFinite(nextStoreId) && nextStoreId > 0 ? nextStoreId : null,
      bucketLabel: nextBucketLabel,
      aisleId:
        Number.isFinite(nextAisleId) && nextAisleId > 0 ? nextAisleId : null,
      aisleSortOrder: Number.isFinite(nextAisleSortOrder)
        ? nextAisleSortOrder
        : null,
      sourceKey: String(conflict?.sourceKey || row?.sourceKey || '').trim(),
      sourceText: nextGeneratedText,
      sourceStoreLabel: nextStoreLabel,
      sourceBucketLabel: nextBucketLabel,
      userEdited: false,
    };
  } else {
    rows[rowIndex] = {
      ...row,
      storeLabel: nextStoreLabel,
      storeId:
        Number.isFinite(nextStoreId) && nextStoreId > 0 ? nextStoreId : null,
      bucketLabel: nextBucketLabel,
      aisleId:
        Number.isFinite(nextAisleId) && nextAisleId > 0 ? nextAisleId : null,
      aisleSortOrder: Number.isFinite(nextAisleSortOrder)
        ? nextAisleSortOrder
        : null,
      sourceKey: String(conflict?.sourceKey || row?.sourceKey || '').trim(),
      sourceText: nextGeneratedText,
      sourceStoreLabel: nextStoreLabel,
      sourceBucketLabel: nextBucketLabel,
      userEdited: true,
    };
  }

  return normalizeShoppingListDoc({
    version: SHOPPING_LIST_DOC_VERSION,
    rows,
  });
}

function shoppingListStoreCollapseKey(storeLabel) {
  return `sl-store:\x00${String(storeLabel || '')}`;
}

function shoppingListAisleCollapseKey(storeLabel, bucketLabel) {
  return `sl-aisle:\x00${String(storeLabel || '')}\x00${String(bucketLabel || '')}`;
}

function shoppingListPseudoUnlistedCollapseKey() {
  return 'sl-pseudo-unlisted';
}

function shoppingListCompletedCollapseKey(storeLabel) {
  return `completed\x00${String(storeLabel || '')}`;
}

function toShoppingListAisleTitleCase(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  return normalized.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function normalizeShoppingListBucketKey(bucketLabel) {
  return String(bucketLabel || '')
    .trim()
    .toLowerCase();
}

function getShoppingListDocBucketKey(row) {
  const aisleId = Math.trunc(Number(row?.aisleId));
  if (Number.isFinite(aisleId) && aisleId > 0) {
    return `aisle:${aisleId}`;
  }
  return `label:${normalizeShoppingListBucketKey(row?.bucketLabel)}`;
}

function getShoppingListBucketDescriptors(rows) {
  const buckets = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const key = getShoppingListDocBucketKey(row);
    const label = String(row?.bucketLabel || '').trim();
    const aisleId = Math.trunc(Number(row?.aisleId));
    const rawSortOrder = Number(row?.aisleSortOrder);
    const hasExplicitSortOrder =
      row?.aisleSortOrder != null && String(row.aisleSortOrder).trim() !== '';
    const sortOrder =
      hasExplicitSortOrder && Number.isFinite(rawSortOrder)
        ? rawSortOrder
        : 999999;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label,
        sortOrder,
        aisleId: Number.isFinite(aisleId) && aisleId > 0 ? aisleId : null,
        firstIndex: index,
      });
      return;
    }
    const bucket = buckets.get(key);
    if (!bucket.label && label) {
      bucket.label = label;
    }
    if (sortOrder < bucket.sortOrder) {
      bucket.sortOrder = sortOrder;
    }
    if (
      Number.isFinite(aisleId) &&
      aisleId > 0 &&
      (!Number.isFinite(bucket.aisleId) ||
        bucket.aisleId == null ||
        aisleId < bucket.aisleId)
    ) {
      bucket.aisleId = aisleId;
    }
  });
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    const aisleIdA = Number.isFinite(a.aisleId) ? a.aisleId : 999999;
    const aisleIdB = Number.isFinite(b.aisleId) ? b.aisleId : 999999;
    if (aisleIdA !== aisleIdB) {
      return aisleIdA - aisleIdB;
    }
    const hasExplicitOrderA =
      (Number.isFinite(a.sortOrder) && a.sortOrder < 999999) ||
      Number.isFinite(a.aisleId);
    const hasExplicitOrderB =
      (Number.isFinite(b.sortOrder) && b.sortOrder < 999999) ||
      Number.isFinite(b.aisleId);
    if (!hasExplicitOrderA && !hasExplicitOrderB) {
      return a.firstIndex - b.firstIndex;
    }
    const labelDelta = String(a.label || '').localeCompare(
      String(b.label || ''),
      undefined,
      {
        sensitivity: 'base',
      },
    );
    if (labelDelta !== 0) {
      return labelDelta;
    }
    return a.firstIndex - b.firstIndex;
  });
}

function formatShoppingListPlainText(docRows) {
  const rows = normalizeShoppingListDoc({ rows: docRows }).rows.filter(
    (row) => !row?.checked && String(row?.text || '').trim(),
  );
  if (!rows.length) return '';

  const storeOrder = [];
  const seenStores = new Set();
  rows.forEach((row) => {
    const key = String(row?.storeLabel || '');
    if (seenStores.has(key)) return;
    seenStores.add(key);
    storeOrder.push(key);
  });

  const lines = [];
  storeOrder.forEach((storeLabel) => {
    const storeRows = rows.filter(
      (row) => String(row?.storeLabel || '') === storeLabel,
    );
    if (!storeRows.length) return;
    if (lines.length) lines.push('');
    const normalizedStoreLabel = String(storeLabel || '').trim();
    lines.push((normalizedStoreLabel || 'Unlisted').toUpperCase());

    const bucketDescriptors = getShoppingListBucketDescriptors(storeRows);
    const soleUnlistedPseudo =
      !normalizedStoreLabel &&
      bucketDescriptors.length === 1 &&
      normalizeShoppingListBucketKey(bucketDescriptors[0]?.label) ===
        'unlisted';

    bucketDescriptors.forEach((bucket) => {
      const bucketLabel = String(bucket?.label || '').trim();
      const normalizedBucketLabel = bucketLabel;
      if (
        normalizedBucketLabel &&
        !(
          soleUnlistedPseudo &&
          normalizeShoppingListBucketKey(normalizedBucketLabel) === 'unlisted'
        )
      ) {
        lines.push(toShoppingListAisleTitleCase(normalizedBucketLabel));
      }
      storeRows
        .filter((row) => getShoppingListDocBucketKey(row) === bucket.key)
        .forEach((row) => {
          lines.push(`- ${String(row?.text || '').trim()}`);
        });
    });
  });

  return lines.join('\n');
}

function formatShoppingListHtml(docRows) {
  const rows = normalizeShoppingListDoc({ rows: docRows }).rows.filter(
    (row) => !row?.checked && String(row?.text || '').trim(),
  );
  if (!rows.length) return '';

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const storeOrder = [];
  const seenStores = new Set();
  rows.forEach((row) => {
    const key = String(row?.storeLabel || '');
    if (seenStores.has(key)) return;
    seenStores.add(key);
    storeOrder.push(key);
  });

  const blocks = [];
  storeOrder.forEach((storeLabel) => {
    const storeRows = rows.filter(
      (row) => String(row?.storeLabel || '') === storeLabel,
    );
    if (!storeRows.length) return;
    if (blocks.length) blocks.push('<br>');

    const normalizedStoreLabel = String(storeLabel || '').trim();
    blocks.push(
      `<p>${escapeHtml((normalizedStoreLabel || 'Unlisted').toUpperCase())}</p>`,
    );

    const bucketDescriptors = getShoppingListBucketDescriptors(storeRows);
    const soleUnlistedPseudo =
      !normalizedStoreLabel &&
      bucketDescriptors.length === 1 &&
      normalizeShoppingListBucketKey(bucketDescriptors[0]?.label) ===
        'unlisted';

    bucketDescriptors.forEach((bucket) => {
      const bucketLabel = String(bucket?.label || '').trim();
      const normalizedBucketLabel = bucketLabel;
      const shouldShowBucketLabel =
        normalizedBucketLabel &&
        !(
          soleUnlistedPseudo &&
          normalizeShoppingListBucketKey(normalizedBucketLabel) === 'unlisted'
        );
      if (shouldShowBucketLabel) {
        blocks.push(
          `<p>${escapeHtml(toShoppingListAisleTitleCase(normalizedBucketLabel))}</p>`,
        );
      }
      const bucketItems = storeRows.filter(
        (row) => getShoppingListDocBucketKey(row) === bucket.key,
      );
      if (!bucketItems.length) return;
      blocks.push('<ul>');
      bucketItems.forEach((row) => {
        blocks.push(`<li>${escapeHtml(String(row?.text || '').trim())}</li>`);
      });
      blocks.push('</ul>');
    });
  });

  return blocks.join('');
}

function formatShoppingListDisplaySectionHeaderLine(row) {
  if (row?.rowType !== 'section') return '';
  const boundary = String(row.collapseBoundary || '').trim();
  const text = String(row.text || row.label || '').trim();
  if (
    boundary === 'store' ||
    boundary === 'home' ||
    boundary === 'pseudo-unlisted-root'
  ) {
    return (text || 'Unlisted').toUpperCase();
  }
  if (boundary === 'aisle' || boundary === 'plain-aisle' || boundary === 'completed') {
    return toShoppingListAisleTitleCase(text || (boundary === 'completed' ? 'completed' : ''));
  }
  return toShoppingListAisleTitleCase(text) || (text || '').toUpperCase();
}

function formatShoppingListPlainTextFromViewState(visibleRows, {
  selectedRecipes = [],
  recipesExpanded = false,
} = {}) {
  const lines = [];
  if (recipesExpanded && Array.isArray(selectedRecipes) && selectedRecipes.length) {
    lines.push('RECIPES');
    selectedRecipes.forEach((recipe) => {
      const title = String(recipe?.title || '').trim();
      if (!title) return;
      const parts = String(recipe?.servingsText || '').trim();
      lines.push(
        parts ? `- ${title} (${parts})` : `- ${title}`,
      );
    });
  }
  if (!Array.isArray(visibleRows)) return lines.join('\n');
  visibleRows.forEach((row) => {
    if (row?.rowType === 'section') {
      const boundary = String(row.collapseBoundary || '').trim();
      if (
        boundary === 'store' ||
        boundary === 'home' ||
        boundary === 'pseudo-unlisted-root'
      ) {
        if (lines.length) {
          lines.push('');
        }
      }
      const header = formatShoppingListDisplaySectionHeaderLine(row);
      if (header) {
        lines.push(header);
      }
      return;
    }
    if (row?.rowType === 'item') {
      if (row.checked) return;
      const t = String(row.text || '').trim();
      if (!t) return;
      lines.push(`- ${t}`);
    }
  });
  return lines.join('\n');
}

function formatShoppingListHtmlFromViewState(visibleRows, {
  selectedRecipes = [],
  recipesExpanded = false,
} = {}) {
  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const blocks = [];
  let openList = false;
  const closeList = () => {
    if (!openList) return;
    blocks.push('</ul>');
    openList = false;
  };

  if (recipesExpanded && Array.isArray(selectedRecipes) && selectedRecipes.length) {
    blocks.push(`<p>${escapeHtml('RECIPES')}</p>`);
    blocks.push('<ul>');
    openList = true;
    selectedRecipes.forEach((recipe) => {
      const title = String(recipe?.title || '').trim();
      if (!title) return;
      const parts = String(recipe?.servingsText || '').trim();
      const liText = parts
        ? `${escapeHtml(title)} (${escapeHtml(parts)})`
        : escapeHtml(title);
      blocks.push(`<li>${liText}</li>`);
    });
    closeList();
  }

  if (!Array.isArray(visibleRows) || !visibleRows.length) {
    return blocks.join('');
  }

  visibleRows.forEach((row) => {
    if (row?.rowType === 'section') {
      closeList();
      const boundary = String(row.collapseBoundary || '').trim();
      if (
        boundary === 'store' ||
        boundary === 'home' ||
        boundary === 'pseudo-unlisted-root'
      ) {
        if (blocks.length) {
          blocks.push('<br>');
        }
      }
      const header = formatShoppingListDisplaySectionHeaderLine(row);
      if (header) {
        blocks.push(`<p>${escapeHtml(header)}</p>`);
      }
      return;
    }
    if (row?.rowType === 'item') {
      if (row.checked) return;
      const t = String(row.text || '').trim();
      if (!t) return;
      if (!openList) {
        blocks.push('<ul>');
        openList = true;
      }
      blocks.push(`<li>${escapeHtml(t)}</li>`);
    }
  });
  closeList();
  return blocks.join('');
}

function buildShoppingListExportPayload(docRows, options = {}) {
  const rows = normalizeShoppingListDoc({ rows: docRows }).rows.filter(
    (row) => !row?.checked && String(row?.text || '').trim(),
  );
  const title = String(options?.title || '').trim() || 'Shopping List';
  if (!rows.length) {
    return { title, stores: [] };
  }

  const storeOrder = [];
  const seenStores = new Set();
  rows.forEach((row) => {
    const key = String(row?.storeLabel || '');
    if (seenStores.has(key)) return;
    seenStores.add(key);
    storeOrder.push(key);
  });

  const stores = [];
  storeOrder.forEach((storeLabel) => {
    const storeRows = rows.filter(
      (row) => String(row?.storeLabel || '') === storeLabel,
    );
    if (!storeRows.length) return;

    const normalizedStoreLabel = String(storeLabel || '').trim();
    const storeEntry = {
      label: (normalizedStoreLabel || 'Unlisted').toUpperCase(),
      aisles: [],
    };

    const bucketDescriptors = getShoppingListBucketDescriptors(storeRows);
    const soleUnlistedPseudo =
      !normalizedStoreLabel &&
      bucketDescriptors.length === 1 &&
      normalizeShoppingListBucketKey(bucketDescriptors[0]?.label) ===
        'unlisted';

    bucketDescriptors.forEach((bucket) => {
      const bucketRows = storeRows.filter(
        (row) => getShoppingListDocBucketKey(row) === bucket.key,
      );
      if (!bucketRows.length) return;
      const normalizedBucketLabel = String(bucket?.label || '').trim();
      const shouldShowBucketLabel =
        normalizedBucketLabel &&
        !(
          soleUnlistedPseudo &&
          normalizeShoppingListBucketKey(normalizedBucketLabel) === 'unlisted'
        );
      storeEntry.aisles.push({
        label: shouldShowBucketLabel
          ? toShoppingListAisleTitleCase(normalizedBucketLabel)
          : '',
        items: bucketRows
          .map((row) => String(row?.text || '').trim())
          .filter(Boolean),
      });
    });

    if (storeEntry.aisles.length) {
      stores.push(storeEntry);
    }
  });

  return { title, stores };
}

function filterShoppingListChecklistRowsForCollapse(
  displayRows,
  collapsedKeys,
) {
  const collapsed = new Set(
    collapsedKeys == null
      ? []
      : typeof collapsedKeys[Symbol.iterator] === 'function'
        ? collapsedKeys
        : [],
  );
  const out = [];
  let topCollapsed = false;
  let aisleCollapsed = false;

  displayRows.forEach((row) => {
    if (row?.rowType === 'section') {
      const boundary = String(row.collapseBoundary || '').trim();
      if (
        boundary === 'store' ||
        boundary === 'pseudo-unlisted-root' ||
        boundary === 'home'
      ) {
        const key = String(row.sectionCollapseKey || '');
        topCollapsed = !!(key && collapsed.has(key));
        aisleCollapsed = false;
        out.push(row);
        return;
      }
      if (topCollapsed) {
        return;
      }
      if (boundary === 'completed') {
        aisleCollapsed = false;
        out.push(row);
        return;
      }
      if (boundary === 'aisle') {
        const key = String(row.sectionCollapseKey || '');
        const canCollapse = !!row.collapsible && !!key;
        aisleCollapsed = !!(canCollapse && collapsed.has(key));
        out.push(row);
        return;
      }
      if (boundary === 'plain-aisle') {
        aisleCollapsed = false;
        out.push(row);
        return;
      }
      out.push(row);
      return;
    }

    if (row?.rowType === 'item') {
      if (topCollapsed) {
        return;
      }
      if (
        row.completedSectionKey &&
        collapsed.has(String(row.completedSectionKey || ''))
      ) {
        return;
      }
      if (aisleCollapsed) {
        return;
      }
      out.push(row);
    }
  });

  return out;
}

const SHOPPING_LIST_HOME_LOCATION_DEFS =
  typeof window !== 'undefined' &&
  typeof window.getHomeLocationDefs === 'function'
    ? window.getHomeLocationDefs()
    : [
        { id: 'fridge', label: 'fridge' },
        { id: 'freezer', label: 'freezer' },
        { id: 'above fridge', label: 'above fridge' },
        { id: 'pantry', label: 'pantry' },
        { id: 'cereal cabinet', label: 'cereal cabinet' },
        { id: 'spices', label: 'spices' },
        { id: 'fruit stand', label: 'fruit stand' },
        { id: 'coffee bar', label: 'coffee bar' },
        { id: 'none', label: 'no location' },
      ];
const SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP = '\x00';

function normalizeShoppingHomeLocationId(raw) {
  if (
    typeof window !== 'undefined' &&
    typeof window.normalizeHomeLocationId === 'function'
  ) {
    return window.normalizeHomeLocationId(raw);
  }
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (!value || value === 'measures') return 'none';
  return SHOPPING_LIST_HOME_LOCATION_DEFS.some((entry) => entry.id === value)
    ? value
    : 'none';
}

function normalizeIngredientVariantRows(rows, options = {}) {
  const fallbackBaseHome = normalizeShoppingHomeLocationId(
    options?.fallbackBaseHome || 'none',
  );
  const normalizeRowTags = (rawTags) =>
    normalizeRecipeTagList(
      Array.isArray(rawTags)
        ? rawTags
        : rawTags == null
          ? []
          : String(rawTags)
              .split(/[\n,]/)
              .map((value) => String(value || '').trim()),
    );
  const mergeTagLists = (left, right) =>
    normalizeRecipeTagList([
      ...(Array.isArray(left) ? left : []),
      ...(Array.isArray(right) ? right : []),
    ]);
  const namedRows = [];
  const namedRowsByKey = new Map();
  let baseRow = null;

  (Array.isArray(rows) ? rows : []).forEach((rawRow) => {
    const row = rawRow && typeof rawRow === 'object' ? rawRow : {};
    const isBase = !!row.isBase || isIngredientBaseVariantName(row.value);
    const normalizedHome = normalizeShoppingHomeLocationId(
      row.homeLocation != null
        ? row.homeLocation
        : row.home != null
          ? row.home
          : isBase
            ? fallbackBaseHome
            : 'none',
    );
    const normalizedTags = normalizeRowTags(
      row.tags != null ? row.tags : row.tagNames != null ? row.tagNames : [],
    );

    const depFlag = !!row.isDeprecated;
    const vId = Number(row.variantId);
    if (isBase) {
      if (!baseRow) {
        baseRow = {
          isBase: true,
          value: '',
          homeLocation: normalizedHome,
          tags: normalizedTags,
          variantId: Number.isFinite(vId) && vId > 0 ? vId : null,
          isDeprecated: false,
        };
      } else {
        if (Number.isFinite(vId) && vId > 0) baseRow.variantId = vId;
        if (depFlag) baseRow.isDeprecated = true;
        if (baseRow.homeLocation === 'none' && normalizedHome !== 'none') {
          baseRow.homeLocation = normalizedHome;
          baseRow.tags = mergeTagLists(baseRow.tags, normalizedTags);
        } else if (normalizedTags.length) {
          baseRow.tags = mergeTagLists(baseRow.tags, normalizedTags);
        }
      }
      return;
    }

    const normalizedValue = normalizeNamedIngredientVariant(row.value);
    if (!normalizedValue) return;
    const rowKey = normalizedValue.toLowerCase();
    const existing = namedRowsByKey.get(rowKey);
    if (existing) {
      if (depFlag) existing.isDeprecated = true;
      if (Number.isFinite(vId) && vId > 0) existing.variantId = vId;
      if (existing.homeLocation === 'none' && normalizedHome !== 'none') {
        existing.homeLocation = normalizedHome;
      }
      if (normalizedTags.length) {
        existing.tags = mergeTagLists(existing.tags, normalizedTags);
      }
      return;
    }

    const normalizedRow = {
      isBase: false,
      value: normalizedValue,
      homeLocation: normalizedHome,
      tags: normalizedTags,
      variantId: Number.isFinite(vId) && vId > 0 ? vId : null,
      isDeprecated: depFlag,
    };
    namedRowsByKey.set(rowKey, normalizedRow);
    namedRows.push(normalizedRow);
  });

  return [
    baseRow || {
      isBase: true,
      value: '',
      homeLocation: fallbackBaseHome,
      tags: [],
    },
    ...namedRows,
  ];
}

function serializeIngredientVariantRows(rows, options = {}) {
  try {
    return JSON.stringify(normalizeIngredientVariantRows(rows, options));
  } catch (_) {
    return JSON.stringify(
      normalizeIngredientVariantRows([], {
        fallbackBaseHome: options?.fallbackBaseHome || 'none',
      }),
    );
  }
}

function parseIngredientVariantRowsSerialized(rawValue, options = {}) {
  const fallbackBaseHome = normalizeShoppingHomeLocationId(
    options?.fallbackBaseHome || 'none',
  );
  const serialized = String(rawValue || '').trim();
  if (!serialized) {
    return normalizeIngredientVariantRows([], { fallbackBaseHome });
  }

  try {
    const parsed = JSON.parse(serialized);
    if (Array.isArray(parsed)) {
      return normalizeIngredientVariantRows(parsed, { fallbackBaseHome });
    }
  } catch (_) {}

  return normalizeIngredientVariantRows(
    serialized.split('\n').map((value) => ({
      isBase: false,
      value,
      homeLocation: 'none',
      tags: [],
    })),
    { fallbackBaseHome },
  );
}

function loadIngredientVariantRowsForIngredientInMain(
  db,
  ingredientId,
  options = {},
) {
  const iid = Number(ingredientId);
  if (!db || !Number.isFinite(iid) || iid <= 0) {
    return normalizeIngredientVariantRows([], {
      fallbackBaseHome: options?.fallbackBaseHome || 'none',
    });
  }
  ensureIngredientVariantTagsSchemaInMain(db);
  const hasHomeLocation = tableHasColumnInMain(
    db,
    'ingredient_variants',
    'home_location',
  );
  const hasVariantIsDeprecated = tableHasColumnInMain(
    db,
    'ingredient_variants',
    'is_deprecated',
  );
  const rows = [];
  const rowsByVariantId = new Map();
  try {
    const q = db.exec(
      `SELECT iv.id,
              COALESCE(iv.variant, '') AS variant_name,
              ${hasHomeLocation ? "COALESCE(iv.home_location, 'none')" : "'none'"} AS home_location,
              ${hasVariantIsDeprecated ? 'COALESCE(iv.is_deprecated, 0) AS is_deprecated' : '0 AS is_deprecated'},
              t.name AS tag_name
       FROM ingredient_variants iv
       LEFT JOIN ingredient_variant_tag_map ivtm
         ON ivtm.ingredient_variant_id = iv.id
       LEFT JOIN tags t
         ON t.id = ivtm.tag_id
        AND COALESCE(t.is_hidden, 0) = 0
       WHERE iv.ingredient_id = ?
       ORDER BY COALESCE(iv.sort_order, 999999) ASC,
                iv.id ASC,
                COALESCE(ivtm.sort_order, 999999) ASC,
                ivtm.id ASC,
                t.name COLLATE NOCASE;`,
      [iid],
    );
    if (Array.isArray(q) && q.length && Array.isArray(q[0].values)) {
      q[0].values.forEach((entry) => {
        const variantId = Number(Array.isArray(entry) ? entry[0] : NaN);
        const variantName = String(
          (Array.isArray(entry) ? entry[1] : '') || '',
        );
        const homeLocation = String(
          (Array.isArray(entry) ? entry[2] : 'none') || 'none',
        );
        const isDepRaw = Array.isArray(entry) ? entry[3] : 0;
        const tagName = String(
          (Array.isArray(entry) ? entry[4] : '') || '',
        ).trim();
        if (!Number.isFinite(variantId) || variantId <= 0) return;
        let row = rowsByVariantId.get(variantId);
        if (!row) {
          row = {
            isBase: isIngredientBaseVariantName(variantName),
            value: variantName,
            homeLocation,
            tags: [],
            variantId,
            isDeprecated: Number(isDepRaw || 0) === 1,
          };
          rowsByVariantId.set(variantId, row);
          rows.push(row);
        }
        if (tagName) row.tags.push(tagName);
      });
    }
  } catch (_) {
    return normalizeIngredientVariantRows([], {
      fallbackBaseHome: options?.fallbackBaseHome || 'none',
    });
  }
  return normalizeIngredientVariantRows(rows, {
    fallbackBaseHome: options?.fallbackBaseHome || 'none',
  });
}

function getShoppingListSourceBaseKey(sourceKey) {
  const normalized = String(sourceKey || '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  const sepIndex = normalized.indexOf(SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP);
  return sepIndex === -1 ? normalized : normalized.slice(0, sepIndex);
}

function shoppingListHomeCollapseKey(locationId) {
  return `home:${normalizeShoppingHomeLocationId(locationId)}`;
}

function itemsBrowseHomeCollapseKey(locationId) {
  return `items-browse-home:${normalizeShoppingHomeLocationId(locationId)}`;
}

function shoppingListHomeCompletedCollapseKey() {
  return 'completed:home';
}

function shoppingListRowMatchesSearch(row, query) {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return true;
  return String(row?.text || '')
    .toLowerCase()
    .includes(normalizedQuery);
}

function createShoppingListDisplayItemRow(row, extra = {}) {
  return {
    rowType: 'item',
    id: row.id,
    text: row.text,
    checked: !!row.checked,
    className: 'shopping-list-group-item shopping-list-doc-item',
    sourceKey: String(row.sourceKey || '').trim(),
    sourceText: String(row.sourceText || '').trim(),
    userEdited: !!row.userEdited,
    ...extra,
  };
}

function buildShoppingListChecklistStoreDisplayRows(rows, options = {}) {
  const normalizedQuery = String(options?.searchQuery || '')
    .trim()
    .toLowerCase();
  const isSearchActive = !!normalizedQuery;
  const visibleRows = isSearchActive
    ? rows.filter((row) => shoppingListRowMatchesSearch(row, normalizedQuery))
    : rows;
  const out = [];

  const storeOrder = [];
  const seenStores = new Set();
  visibleRows.forEach((row) => {
    const key = String(row.storeLabel || '');
    if (seenStores.has(key)) return;
    seenStores.add(key);
    storeOrder.push(key);
  });

  const pushItemRows = (items, extra = {}) => {
    items.forEach((row) => {
      out.push(createShoppingListDisplayItemRow(row, extra));
    });
  };

  storeOrder.forEach((storeLabel) => {
    const storeRows = visibleRows.filter(
      (row) => String(row.storeLabel || '') === storeLabel,
    );
    if (!storeRows.length) return;

    const activeRows = storeRows.filter((row) => !row.checked);
    const completedRows = storeRows.filter((row) => row.checked);
    const bucketDescriptors = getShoppingListBucketDescriptors([
      ...(isSearchActive ? activeRows : [...activeRows, ...completedRows]),
    ]);

    const soleUnlistedPseudo =
      !storeLabel &&
      bucketDescriptors.length === 1 &&
      normalizeShoppingListBucketKey(bucketDescriptors[0]?.label) ===
        'unlisted';

    if (storeLabel) {
      out.push({
        rowType: 'section',
        text: storeLabel,
        className: 'shopping-list-section--store',
        sectionCollapseKey: shoppingListStoreCollapseKey(storeLabel),
        collapseBoundary: 'store',
        collapsible: true,
      });
    } else {
      out.push({
        rowType: 'section',
        text: 'Unlisted',
        className:
          'shopping-list-section--unlisted shopping-list-section--pseudo-unlisted-root',
        sectionCollapseKey: shoppingListPseudoUnlistedCollapseKey(),
        collapseBoundary: 'pseudo-unlisted-root',
        collapsible: true,
      });
    }

    const pushBucket = (bucket, items) => {
      const list = Array.isArray(items) ? items : [];
      const label = String(bucket?.label || '').trim();
      if (!label) {
        if (!list.length) return;
        pushItemRows(list);
        return;
      }
      if (!storeLabel) {
        if (
          soleUnlistedPseudo &&
          normalizeShoppingListBucketKey(label) === 'unlisted'
        ) {
          if (!list.length) return;
          pushItemRows(list);
          return;
        }
        out.push({
          rowType: 'section',
          text: label,
          className:
            normalizeShoppingListBucketKey(label) === 'unlisted'
              ? 'shopping-list-section--unlisted'
              : 'shopping-list-section--aisle',
          collapseBoundary: 'plain-aisle',
          collapsible: false,
        });
      } else {
        out.push({
          rowType: 'section',
          text: label,
          className: 'shopping-list-section--aisle',
          sectionCollapseKey: shoppingListAisleCollapseKey(storeLabel, label),
          collapseBoundary: 'aisle',
          collapsible: list.length > 0,
        });
      }
      if (!list.length) return;
      pushItemRows(list);
    };

    bucketDescriptors.forEach((bucket) => {
      pushBucket(
        bucket,
        activeRows.filter(
          (row) => getShoppingListDocBucketKey(row) === bucket.key,
        ),
      );
    });

    if (completedRows.length) {
      const completedSectionKey = shoppingListCompletedCollapseKey(storeLabel);
      out.push({
        rowType: 'section',
        text: 'completed',
        className: 'shopping-list-section--completed',
        sectionKey: completedSectionKey,
        sectionCollapseKey: completedSectionKey,
        collapseBoundary: 'completed',
        collapsible: true,
      });
      completedRows.forEach((row) => {
        out.push(
          createShoppingListDisplayItemRow(row, {
            completedSectionKey,
          }),
        );
      });
    }
  });

  return out;
}

function getShoppingListHomeLocationIdForRow(row, homeLocationBySourceKey) {
  const sourceKey = String(row?.sourceKey || '')
    .trim()
    .toLowerCase();
  const lookup =
    homeLocationBySourceKey instanceof Map
      ? homeLocationBySourceKey
      : new Map(Object.entries(homeLocationBySourceKey || {}));
  const baseKey = getShoppingListSourceBaseKey(sourceKey);

  let resolved = 'none';
  if (sourceKey && lookup.has(sourceKey)) {
    resolved = normalizeShoppingHomeLocationId(lookup.get(sourceKey));
  }
  if (resolved === 'none' && baseKey && lookup.has(baseKey)) {
    resolved = normalizeShoppingHomeLocationId(lookup.get(baseKey));
  }
  return resolved;
}

function buildShoppingListChecklistHomeDisplayRows(rows, options = {}) {
  const normalizedQuery = String(options?.searchQuery || '')
    .trim()
    .toLowerCase();
  const visibleRows = normalizedQuery
    ? rows.filter((row) => shoppingListRowMatchesSearch(row, normalizedQuery))
    : rows;
  const out = [];
  const activeRows = visibleRows.filter((row) => !row.checked);
  const completedRows = visibleRows.filter((row) => row.checked);
  const homeLocationBySourceKey =
    options?.homeLocationBySourceKey instanceof Map
      ? options.homeLocationBySourceKey
      : new Map(Object.entries(options?.homeLocationBySourceKey || {}));

  SHOPPING_LIST_HOME_LOCATION_DEFS.forEach((locationDef) => {
    const locationRows = activeRows.filter(
      (row) =>
        getShoppingListHomeLocationIdForRow(row, homeLocationBySourceKey) ===
        locationDef.id,
    );
    if (!locationRows.length) return;
    out.push({
      rowType: 'section',
      text: locationDef.label,
      className: 'shopping-list-section--store',
      sectionCollapseKey: shoppingListHomeCollapseKey(locationDef.id),
      collapseBoundary: 'home',
      collapsible: true,
    });
    locationRows.forEach((row) => {
      out.push(
        createShoppingListDisplayItemRow(row, {
          homeLocationId: locationDef.id,
          homeLocationLabel: locationDef.label,
        }),
      );
    });
  });

  if (completedRows.length) {
    const completedSectionKey = shoppingListHomeCompletedCollapseKey();
    out.push({
      rowType: 'section',
      text: 'completed',
      className: 'shopping-list-section--completed',
      sectionKey: completedSectionKey,
      sectionCollapseKey: completedSectionKey,
      collapseBoundary: 'completed',
      collapsible: true,
    });
    completedRows.forEach((row) => {
      out.push(
        createShoppingListDisplayItemRow(row, {
          completedSectionKey,
          homeLocationId: getShoppingListHomeLocationIdForRow(
            row,
            homeLocationBySourceKey,
          ),
        }),
      );
    });
  }

  return out;
}

function getShoppingListChecklistDisplayRows(docRows, options = {}) {
  const rows = normalizeShoppingListDoc({ rows: docRows }).rows;
  const mode = String(options?.mode || 'stores')
    .trim()
    .toLowerCase();
  if (mode === 'home') {
    return buildShoppingListChecklistHomeDisplayRows(rows, options);
  }
  return buildShoppingListChecklistStoreDisplayRows(rows, options);
}

function createSectionToggleButton({
  label = '',
  expanded = true,
  onToggle,
  completed = false,
}) {
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = completed
    ? 'shopping-list-section-toggle shopping-list-section-toggle--completed'
    : 'shopping-list-section-toggle';
  toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'shopping-list-section-toggle__label';
  toggleLabel.textContent = String(label || '').trim();
  toggleBtn.appendChild(toggleLabel);
  const toggleIcon = document.createElement('span');
  toggleIcon.className =
    'material-symbols-outlined shopping-list-section-toggle__icon';
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggleIcon.textContent = 'expand_more';
  toggleBtn.appendChild(toggleIcon);
  if (typeof onToggle === 'function') {
    toggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggle(event);
    });
  }
  return toggleBtn;
}

function getShoppingListSelectedRecipeSummaryRows({
  db = window.dbInstance,
} = {}) {
  const selections = Object.values(getShoppingPlanRecipeSelections()).filter(
    (entry) => Number(entry?.recipeId) > 0,
  );
  if (!selections.length) return [];
  const formatServingsValue = (rawValue) => {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    if (typeof window.formatShoppingQtyForDisplay === 'function') {
      return String(window.formatShoppingQtyForDisplay(numeric) || '').trim();
    }
    return Number.isInteger(numeric)
      ? String(numeric)
      : String(Number(numeric.toFixed(2)));
  };
  return selections
    .map((selection) => {
      const recipeId = Math.trunc(Number(selection?.recipeId));
      if (!Number.isFinite(recipeId) || recipeId <= 0) return null;
      const recipe =
        db && typeof db.exec === 'function'
          ? loadShoppingPlanRecipeFromDB(db, recipeId)
          : null;
      const title =
        String(selection?.title || '').trim() ||
        String(recipe?.title || '').trim() ||
        `Recipe ${recipeId}`;
      const recipeDefaultServings = Number(
        recipe?.servings?.default != null
          ? recipe.servings.default
          : recipe?.servingsDefault,
      );
      const selectedServings = getRecipeWebServingsStoredValue(
        recipeId,
        recipe,
      );
      const servingsValue =
        Number.isFinite(selectedServings) && selectedServings > 0
          ? selectedServings
          : Number.isFinite(recipeDefaultServings) && recipeDefaultServings > 0
            ? recipeDefaultServings
            : null;
      const formattedServings = formatServingsValue(servingsValue);
      return {
        recipeId,
        title,
        servingsText: formattedServings ? `${formattedServings} svg` : '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const titleDelta = String(a?.title || '').localeCompare(
        String(b?.title || ''),
        undefined,
        {
          sensitivity: 'base',
        },
      );
      if (titleDelta !== 0) return titleDelta;
      return Number(a?.recipeId || 0) - Number(b?.recipeId || 0);
    });
}

async function getShoppingListSelectedRecipeSummaryRowsViaDataService({
  db = window.dbInstance,
} = {}) {
  const selections = Object.values(getShoppingPlanRecipeSelections())
    .filter((entry) => Number(entry?.recipeId) > 0)
    .map((entry) => {
      const recipeId = Math.trunc(Number(entry?.recipeId));
      return {
        recipeId,
        title: String(entry?.title || '').trim(),
        servings: getRecipeWebServingsStoredValue(recipeId),
      };
    });
  if (!selections.length) return [];
  if (
    !window.dataService ||
    typeof window.dataService.listShoppingListRecipeSummaries !== 'function'
  ) {
    return getShoppingListSelectedRecipeSummaryRows({ db });
  }
  try {
    return await window.dataService.listShoppingListRecipeSummaries(selections);
  } catch (err) {
    console.error('dataService.listShoppingListRecipeSummaries failed:', err);
    return getShoppingListSelectedRecipeSummaryRows({ db });
  }
}

if (typeof window !== 'undefined') {
  window.__shoppingListChecklistHelpers = {
    createEmptyShoppingListDoc,
    normalizeShoppingListDoc,
    doesShoppingListRowHaveUserOverride,
    buildShoppingListDocFromPlanRows,
    mergeShoppingListDocWithGenerated,
    resolveShoppingListDocConflict,
    formatShoppingListPlainText,
    formatShoppingListHtml,
    buildShoppingListExportPayload,
    getShoppingListChecklistDisplayRows,
    getShoppingListHomeLocationIdForRow,
    filterShoppingListChecklistRowsForCollapse,
    normalizeShoppingHomeLocationId,
    getShoppingListSourceBaseKey,
    shoppingListCompletedCollapseKey,
    shoppingListStoreCollapseKey,
    shoppingListAisleCollapseKey,
    shoppingListHomeCollapseKey,
    shoppingListPseudoUnlistedCollapseKey,
  };
}
// --- End shopping list checklist helpers ---

async function loadShoppingListPage() {
  const list = document.getElementById('shoppingListOutput');
  const shoppingListWebMode = isForceWebModeEnabled();
  const shoppingListExportEnabled = false;

  initAppBar({
    mode: 'list',
    titleText: 'Shopping List',
    showSearch: true,
    showAdd: shoppingListWebMode,
  });

  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();
  window.addEventListener(
    FAVORITE_EATS_FORCE_WEB_MODE_EVENT,
    () => {
      if (!getTopLevelPageOrder().includes('shopping-list')) return;
      try {
        window.location.reload();
      } catch (_) {}
    },
  );

  if (!list) return;

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');

  /** Supabase-backed doors can run before SQLite open (parity with Shopping / Tags list). */
  let shoppingListPrefetchedFromDataService = false;
  let prefetchedPlanRows = null;
  let prefetchedRecipeSummaryRows = null;
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listShoppingListPlanRows === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      prefetchedPlanRows = await getShoppingPlanSelectionRowsViaDataService({});
      prefetchedRecipeSummaryRows =
        await getShoppingListSelectedRecipeSummaryRowsViaDataService({});
      shoppingListPrefetchedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure(
        'shopping list plan prefetch',
        err,
      );
      prefetchedPlanRows = null;
      prefetchedRecipeSummaryRows = null;
      shoppingListPrefetchedFromDataService = false;
      window.dataService.useSupabase = false;
    }
  }

  const isElectron = !!window.electronAPI;
  let db = window.dbInstance;
  if (!db || typeof db.exec !== 'function') {
    if (isElectron) {
      try {
        const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
        const bytes = await window.electronAPI.loadDB(pathHint);
        const Uints = new Uint8Array(bytes);
        db = new SQL.Database(Uints);
      } catch (err) {
        console.error('❌ Failed to load DB from disk:', err);
        uiToast('No database loaded. Please go back to the welcome page.');
        window.location.href = 'index.html';
        return;
      }
    } else {
      try {
        db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
      } catch (err) {
        uiToast('No database loaded. Please go back to the welcome page.');
        window.location.href = 'index.html';
        return;
      }
    }
    window.dbInstance = db;
    if (
      window.dataService &&
      typeof window.dataService.setSqliteDb === 'function'
    ) {
      window.dataService.setSqliteDb(db);
      if (favoriteEatsShouldUseSupabaseDataDoor()) {
        window.dataService.useSupabase = shoppingListPrefetchedFromDataService;
        console.info('[dataService] using Supabase adapter');
      }
    }
    await ensureIngredientLemmaMaintenanceInMain(db, isElectron);
  } else if (window.dataService && favoriteEatsShouldUseSupabaseDataDoor()) {
    try {
      window.dataService.useSupabase = shoppingListPrefetchedFromDataService;
      if (shoppingListPrefetchedFromDataService) {
        console.info(
          '[dataService] using Supabase adapter',
        );
      }
    } catch (_) {}
  }

  try {
    maintainShoppingPlanStorageWithDb(db);
  } catch (reconcileErr) {
    console.warn(
      'Shopping plan maintain on shopping list page failed:',
      reconcileErr,
    );
  }

  const listNav = enableTopLevelListKeyboardNav(list);
  let generatedPlanRows;
  let selectedRecipeSummaryRows;
  if (shoppingListPrefetchedFromDataService) {
    generatedPlanRows = prefetchedPlanRows;
    selectedRecipeSummaryRows = prefetchedRecipeSummaryRows;
  } else {
    generatedPlanRows = await getShoppingPlanSelectionRowsViaDataService({
      db,
    });
    selectedRecipeSummaryRows =
      await getShoppingListSelectedRecipeSummaryRowsViaDataService({ db });
  }
  const getGeneratedShoppingListDoc = () =>
    buildShoppingListDocFromPlanRows(generatedPlanRows);
  const initialShoppingListSync = mergeShoppingListDocWithGenerated(
    loadShoppingListDocFromStorage(),
    getGeneratedShoppingListDoc(),
  );
  const pageWrapper =
    list.closest('.page-wrapper') instanceof HTMLElement
      ? list.closest('.page-wrapper')
      : null;

  let controls = null;
  if (!shoppingListWebMode) {
    controls = document.getElementById('shoppingListControls');
    if (!(controls instanceof HTMLElement) && pageWrapper) {
      controls = document.createElement('div');
      controls.id = 'shoppingListControls';
      controls.className = 'shopping-list-controls';
      pageWrapper.insertBefore(controls, list);
    }
  }

  let shoppingListDoc = persistShoppingListDoc(initialShoppingListSync.doc);
  let pendingSourceConflicts = Array.isArray(initialShoppingListSync.conflicts)
    ? initialShoppingListSync.conflicts.slice()
    : [];
  let editingRowId = '';
  let editingRowMode = '';
  const clearShoppingListRowEditing = () => {
    editingRowId = '';
    editingRowMode = '';
  };
  let exportBtn = null;
  let webCopyBtn = null;
  let webExportBtn = null;
  let resetBtn = null;
  let webResetBtn = null;
  let resolvingSourceConflicts = false;
  let exportingShoppingList = false;
  const pendingCheckTimers = new Map();
  const pendingCheckedRowIds = new Set();
  const collapsedShoppingListSections = new Set();
  const expandedShoppingListContributionRows = new Set();
  const CHECK_MOVE_DELAY_MS = 260;
  let shoppingListViewMode = readShoppingListViewModeFromSession();
  let shoppingListFilterChipRail = null;

  const toResetComparableRows = (doc) =>
    normalizeShoppingListDoc(doc).rows.map((row, index) => ({
      text: String(row?.text || '').trim(),
      checked: !!row?.checked,
      storeLabel: String(row?.storeLabel || '').trim(),
      bucketLabel: String(row?.bucketLabel || '').trim(),
      order: index,
    }));

  const isShoppingListResetNoOp = (nextDoc) => {
    const generatedDoc = nextDoc || getGeneratedShoppingListDoc();
    const currentComparable = toResetComparableRows(shoppingListDoc);
    const generatedComparable = toResetComparableRows(generatedDoc);
    return (
      JSON.stringify(currentComparable) === JSON.stringify(generatedComparable)
    );
  };

  const syncShoppingListResetButtonState = (nextDoc) => {
    const shouldDisable = isShoppingListResetNoOp(nextDoc);
    const syncBtn = (btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.disabled = shouldDisable;
      btn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    };
    syncBtn(resetBtn);
    syncBtn(webResetBtn);
  };

  const syncShoppingListExportButtonState = () => {
    if (!shoppingListExportEnabled) return;
    const hasItems =
      buildShoppingListExportPayload(shoppingListDoc?.rows).stores.length > 0;
    const isAvailable = !!window.electronAPI?.googleDocsExportShoppingList;
    const shouldDisable = !hasItems || !isAvailable || exportingShoppingList;
    const syncBtn = (btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.disabled = shouldDisable;
      btn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
      btn.textContent = exportingShoppingList ? 'Exporting...' : 'Export';
    };
    syncBtn(exportBtn);
    syncBtn(webExportBtn);
  };

  const cancelPendingCheck = (rowId) => {
    const normalizedId = String(rowId || '');
    const timerId = pendingCheckTimers.get(normalizedId);
    if (timerId) window.clearTimeout(timerId);
    pendingCheckTimers.delete(normalizedId);
    pendingCheckedRowIds.delete(normalizedId);
  };
  const cancelAllPendingChecks = () => {
    Array.from(pendingCheckTimers.keys()).forEach((rowId) => {
      cancelPendingCheck(rowId);
    });
  };

  const updateRow = (
    rowId,
    mutator,
    { message = '', undoMessage = '' } = {},
  ) => {
    const currentRows = Array.isArray(shoppingListDoc?.rows)
      ? shoppingListDoc.rows
      : [];
    const rowIndex = currentRows.findIndex(
      (row) => String(row?.id || '') === String(rowId || ''),
    );
    if (rowIndex === -1) return;
    const previousRow = cloneForUndo(
      currentRows[rowIndex],
      () => currentRows[rowIndex],
    );
    const nextRowDraft = cloneForUndo(
      currentRows[rowIndex],
      () => currentRows[rowIndex],
    );
    if (!nextRowDraft || typeof mutator !== 'function') return;
    mutator(nextRowDraft);
    const nextText = String(nextRowDraft.text || '').trim();
    if (!nextText) return;
    nextRowDraft.text = nextText;
    if (String(nextRowDraft.sourceKey || '').trim()) {
      const sourceText = String(nextRowDraft.sourceText || '').trim();
      nextRowDraft.userEdited = !!sourceText && nextText !== sourceText;
    }
    const nextRows = currentRows.slice();
    nextRows[rowIndex] = nextRowDraft;
    shoppingListDoc = persistShoppingListDoc({
      ...shoppingListDoc,
      rows: nextRows,
    });
    renderChecklist();
    if (message || undoMessage) {
      uiToastUndo(message || undoMessage, () => {
        const restoreRows = Array.isArray(shoppingListDoc?.rows)
          ? shoppingListDoc.rows.slice()
          : [];
        const restoreIndex = restoreRows.findIndex(
          (row) => String(row?.id || '') === String(rowId || ''),
        );
        if (restoreIndex === -1) return;
        restoreRows[restoreIndex] = previousRow;
        shoppingListDoc = persistShoppingListDoc({
          ...shoppingListDoc,
          rows: restoreRows,
        });
        clearShoppingListRowEditing();
        renderChecklist();
      });
    }
  };

  const buildShoppingListConflictDialog = (conflicts) => {
    const list = Array.isArray(conflicts) ? conflicts.filter(Boolean) : [];
    const count = list.length;
    const singular = count === 1;
    const title = `Review changes (${count})`;
    const body = singular
      ? 'An item you edited has been updated.'
      : 'Some items you edited have been updated.';
    const previewLimit = 3;
    const previewLines = [];
    list.slice(0, previewLimit).forEach((conflict, index) => {
      const currentText =
        String(conflict?.currentText || '').trim() || '(empty)';
      const nextGeneratedText = String(
        conflict?.nextGeneratedText || '',
      ).trim();
      const nextGeneratedDisplayText = String(
        conflict?.nextGeneratedDisplayText || nextGeneratedText,
      ).trim();
      const updateText =
        nextGeneratedDisplayText ||
        (String(conflict?.kind || '').trim() === 'remove'
          ? '(removed from shopping plan)'
          : '(empty)');
      previewLines.push(`Edit:    ${currentText}`);
      previewLines.push(`Update:  ${updateText}`);
      if (index < Math.min(previewLimit, count) - 1) previewLines.push('');
    });
    if (count > previewLimit) {
      previewLines.push('');
      previewLines.push(`+ ${count - previewLimit} more updates`);
    }
    return {
      title,
      message: [body, '', ...previewLines].join('\n').trim(),
      confirmText: singular ? 'Use update' : 'Use updates',
      cancelText: 'Keep my edits',
    };
  };

  const resolvePendingSourceConflicts = async () => {
    if (resolvingSourceConflicts) return;
    if (!pendingSourceConflicts.length) return;
    resolvingSourceConflicts = true;
    try {
      const conflictsToResolve = pendingSourceConflicts.filter((conflict) => {
        if (!conflict || typeof conflict !== 'object') return false;
        return Array.isArray(shoppingListDoc?.rows)
          ? shoppingListDoc.rows.some(
              (row) => String(row?.id || '') === String(conflict?.rowId || ''),
            )
          : false;
      });
      pendingSourceConflicts = [];
      if (!conflictsToResolve.length) return;
      const dialog = buildShoppingListConflictDialog(conflictsToResolve);
      const useUpdate = await uiConfirm(dialog);
      conflictsToResolve.forEach((conflict) => {
        shoppingListDoc = persistShoppingListDoc(
          resolveShoppingListDocConflict(
            shoppingListDoc,
            conflict,
            useUpdate ? 'replace' : 'keep',
          ),
        );
      });
      clearShoppingListRowEditing();
      renderChecklist();
    } finally {
      resolvingSourceConflicts = false;
    }
  };

  const rerenderShoppingListFilterChips = () => {
    const chipMountEl = shoppingListFilterChipRail?.trackEl;
    if (!(chipMountEl instanceof HTMLElement)) return;
    if (typeof window.renderFilterChipList !== 'function') return;
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips: [],
      compoundChips: [
        {
          id: 'shopping-list-sort-by',
          label: 'sort by',
          selectionMode: 'single',
          options: [
            { id: 'stores', label: 'store aisle' },
            { id: 'home', label: 'home location' },
          ],
          selectedOptionIds: new Set([
            shoppingListViewMode === 'home' ? 'home' : 'stores',
          ]),
          onToggleOption: (optionId) => {
            const nextMode = optionId === 'home' ? 'home' : 'stores';
            if (nextMode === shoppingListViewMode) return;
            shoppingListViewMode = nextMode;
            persistShoppingListViewMode(nextMode);
            collapsedShoppingListSections.clear();
            rerenderShoppingListFilterChips();
            renderChecklist();
          },
        },
      ],
      chipClassName: 'app-filter-chip',
    });
  };

  const mountShoppingListFilterChips = () => {
    if (!(searchInput instanceof HTMLInputElement)) return;
    if (typeof window.mountTopFilterChipRail !== 'function') return;
    shoppingListFilterChipRail = window.mountTopFilterChipRail({
      anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
      dockId: 'shoppingListFilterChipDock',
    });
    rerenderShoppingListFilterChips();
    shoppingListFilterChipRail?.sync?.();
  };

  let shoppingListHomeLocationCache = { signature: '', map: null };

  const getShoppingListSourceKeys = () => {
    const normalizedRows = normalizeShoppingListDoc(shoppingListDoc).rows;
    return Array.from(
      new Set(
        normalizedRows
          .map((row) =>
            String(row?.sourceKey || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );
  };

  const refreshShoppingListHomeLocationCache = async () => {
    const sourceKeys = getShoppingListSourceKeys();
    const signature = JSON.stringify(sourceKeys);
    if (
      shoppingListHomeLocationCache.map instanceof Map &&
      shoppingListHomeLocationCache.signature === signature
    ) {
      return shoppingListHomeLocationCache.map;
    }
    if (
      !window.dataService ||
      typeof window.dataService.listShoppingListHomeLocations !== 'function'
    ) {
      shoppingListHomeLocationCache = { signature: '', map: null };
      return null;
    }
    try {
      const rows = await window.dataService.listShoppingListHomeLocations(
        sourceKeys,
      );
      const nextMap = new Map();
      sourceKeys.forEach((sourceKey) => {
        nextMap.set(
          sourceKey,
          normalizeShoppingHomeLocationId(rows?.[sourceKey]),
        );
      });
      shoppingListHomeLocationCache = { signature, map: nextMap };
      return nextMap;
    } catch (err) {
      console.error('dataService.listShoppingListHomeLocations failed:', err);
      shoppingListHomeLocationCache = { signature: '', map: null };
      return null;
    }
  };

  const getShoppingListHomeLocationMap = () => {
    const sourceKeys = getShoppingListSourceKeys();
    const signature = JSON.stringify(sourceKeys);
    if (
      shoppingListHomeLocationCache.map instanceof Map &&
      shoppingListHomeLocationCache.signature === signature
    ) {
      return new Map(shoppingListHomeLocationCache.map);
    }
    const nextMap = new Map(sourceKeys.map((sourceKey) => [sourceKey, 'none']));
    const baseNameKeys = Array.from(
      new Set(
        sourceKeys
          .map((sourceKey) => getShoppingListSourceBaseKey(sourceKey))
          .filter(Boolean),
      ),
    );

    if (baseNameKeys.length && db && typeof db.exec === 'function') {
      try {
        const placeholders = baseNameKeys.map(() => '?').join(',');
        const result = db.exec(
          `
            SELECT lower(trim(i.name)) AS name_key,
                   COALESCE(iv.variant, '') AS variant_name,
                   COALESCE(iv.home_location, 'none') AS home_location
              FROM ingredients i
              LEFT JOIN ingredient_variants iv ON iv.ingredient_id = i.ID
             WHERE lower(trim(i.name)) IN (${placeholders})
             ORDER BY
               i.ID ASC,
               COALESCE(iv.sort_order, 999999) ASC,
               COALESCE(iv.id, 999999) ASC;
          `,
          baseNameKeys,
        );
        const locationBySourceKey = new Map();
        if (
          Array.isArray(result) &&
          result.length &&
          Array.isArray(result[0].values)
        ) {
          result[0].values.forEach(([nameKey, variantName, rawLocation]) => {
            const normalizedNameKey = String(nameKey || '')
              .trim()
              .toLowerCase();
            if (!normalizedNameKey) return;
            const normalizedVariant =
              normalizeNamedIngredientVariant(variantName).toLowerCase();
            const sourceKey = normalizedVariant
              ? `${normalizedNameKey}${SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP}${normalizedVariant}`
              : normalizedNameKey;
            const normalizedLocation =
              normalizeShoppingHomeLocationId(rawLocation);
            if (!locationBySourceKey.has(sourceKey)) {
              locationBySourceKey.set(sourceKey, normalizedLocation);
              return;
            }
            if (
              locationBySourceKey.get(sourceKey) === 'none' &&
              normalizedLocation !== 'none'
            ) {
              locationBySourceKey.set(sourceKey, normalizedLocation);
            }
          });
        }
        sourceKeys.forEach((sourceKey) => {
          const normalizedSourceKey = String(sourceKey || '')
            .trim()
            .toLowerCase();
          if (
            normalizedSourceKey &&
            locationBySourceKey.has(normalizedSourceKey)
          ) {
            nextMap.set(
              sourceKey,
              normalizeShoppingHomeLocationId(
                locationBySourceKey.get(normalizedSourceKey),
              ),
            );
            return;
          }
          const baseKey = getShoppingListSourceBaseKey(normalizedSourceKey);
          if (!baseKey) return;
          nextMap.set(
            sourceKey,
            normalizeShoppingHomeLocationId(locationBySourceKey.get(baseKey)),
          );
        });
        baseNameKeys.forEach((bk) => {
          const baseKey = String(bk || '')
            .trim()
            .toLowerCase();
          if (!baseKey || !locationBySourceKey.has(baseKey)) return;
          nextMap.set(
            baseKey,
            normalizeShoppingHomeLocationId(locationBySourceKey.get(baseKey)),
          );
        });
      } catch (_) {}
    }

    return nextMap;
  };

  const getShoppingListChecklistViewState = () => {
    const searchQuery = String(searchInput?.value || '').trim();
    const isSearchActive = !!searchQuery;
    const displayRows = getShoppingListChecklistDisplayRows(
      shoppingListDoc?.rows || [],
      {
        mode: shoppingListViewMode,
        searchQuery,
        homeLocationBySourceKey: getShoppingListHomeLocationMap(),
      },
    );
    const visibleRows = isSearchActive
      ? displayRows
      : filterShoppingListChecklistRowsForCollapse(
          displayRows,
          collapsedShoppingListSections,
        );
    const selectedRecipes = isSearchActive
      ? []
      : selectedRecipeSummaryRows;
    const recipesSectionKey = 'sl-recipes';
    const recipesExpanded =
      !!selectedRecipes.length &&
      !collapsedShoppingListSections.has(recipesSectionKey);
    return {
      searchQuery,
      isSearchActive,
      displayRows,
      visibleRows,
      selectedRecipes,
      recipesExpanded,
    };
  };

  const syncShoppingListCopyButtonState = () => {
    const { visibleRows, selectedRecipes, recipesExpanded } =
      getShoppingListChecklistViewState();
    const shouldDisable = !String(
      formatShoppingListPlainTextFromViewState(visibleRows, {
        selectedRecipes,
        recipesExpanded,
      }) || '',
    ).trim();
    if (!(webCopyBtn instanceof HTMLButtonElement)) return;
    webCopyBtn.disabled = shouldDisable;
    webCopyBtn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
  };

  if (searchInput instanceof HTMLInputElement) {
    wireAppBarSearch(searchInput, {
      clearBtn,
      onQueryChange: () => {
        renderChecklist();
      },
      normalizeQuery: (value) => String(value || '').trim(),
    });
  }

  const renderChecklist = () => {
    const {
      isSearchActive,
      displayRows,
      visibleRows,
      selectedRecipes,
      recipesExpanded,
    } = getShoppingListChecklistViewState();
    const planRowsByKey = new Map(
      generatedPlanRows
        .filter((row) => String(row?.key || '').trim())
        .map((row) => [String(row.key || '').trim(), row]),
    );
    const planRowKeysSample = [...planRowsByKey.keys()].slice(0, 8);
    console.log('[shopping list checklist] planRowsByKey', {
      size: planRowsByKey.size,
      sampleKeys: planRowKeysSample,
    });
    const shoppingNavKeys =
      window.favoriteEatsSessionKeys &&
      typeof window.favoriteEatsSessionKeys === 'object'
        ? window.favoriteEatsSessionKeys
        : {
            shoppingNavTargetId: 'favoriteEats:shopping-nav-target-id',
            shoppingNavTargetName: 'favoriteEats:shopping-nav-target-name',
          };
    list.innerHTML = '';

    if (!displayRows.length && !selectedRecipes.length) {
      if (isSearchActive) {
        renderTopLevelEmptyState(list, 'searchNoMatch');
      } else {
        renderTopLevelEmptyState(list, 'shoppingList');
      }
      listNav?.syncAfterRender?.();
      syncShoppingListResetButtonState();
      syncShoppingListCopyButtonState();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    let shoppingListChecklistItemDebugCount = 0;
    const SHOPPING_LIST_CHECKLIST_ITEM_DEBUG_MAX = 12;

    if (selectedRecipes.length) {
      const recipesSectionKey = 'sl-recipes';
      const recipeSection = document.createElement('li');
      recipeSection.className =
        'list-section-label shopping-list-section--recipes';
      const toggleBtn = createSectionToggleButton({
        label: 'RECIPES',
        expanded: recipesExpanded,
        onToggle: () => {
          if (collapsedShoppingListSections.has(recipesSectionKey)) {
            collapsedShoppingListSections.delete(recipesSectionKey);
          } else {
            collapsedShoppingListSections.add(recipesSectionKey);
          }
          renderChecklist();
        },
      });
      recipeSection.appendChild(toggleBtn);
      list.appendChild(recipeSection);
      if (recipesExpanded) {
        selectedRecipes.forEach((recipe) => {
          const li = document.createElement('li');
          li.className =
            'shopping-list-doc-item shopping-list-doc-item--recipe-summary';
          const headline = document.createElement('div');
          headline.className =
            'shopping-list-doc-headline shopping-list-doc-headline--recipe-summary';
          const recipeLink = document.createElement('a');
          recipeLink.href =
            favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
          recipeLink.className =
            'shopping-list-doc-contribution-link shopping-list-doc-recipe-summary-link';
          recipeLink.textContent = String(recipe.title || '').trim();
          recipeLink.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof window.openRecipe === 'function') {
              window.openRecipe(recipe.recipeId);
              return;
            }
            sessionStorage.setItem(
              'selectedRecipeId',
              String(recipe.recipeId || ''),
            );
            window.location.href =
              favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
          });
          headline.appendChild(recipeLink);
          if (recipe.servingsText) {
            const tail = document.createElement('span');
            tail.className = 'shopping-list-doc-tail';
            tail.appendChild(document.createTextNode('\u00a0'));
            const detail = document.createElement('span');
            detail.className = 'shopping-list-doc-contribution-detail';
            detail.textContent = `(${recipe.servingsText})`;
            tail.appendChild(detail);
            headline.appendChild(tail);
          }
          li.appendChild(headline);
          list.appendChild(li);
        });
      }
    }

    visibleRows.forEach((row) => {
      const li = document.createElement('li');
      if (row?.rowType === 'section') {
        li.className =
          `list-section-label ${String(row?.className || '').trim()}`.trim();
        const sectionToggleKey = String(row?.sectionCollapseKey || '').trim();
        const isCollapsible =
          !isSearchActive && !!row.collapsible && !!sectionToggleKey;
        if (isCollapsible) {
          const isCompleted = String(row?.className || '').includes(
            'shopping-list-section--completed',
          );
          const isExpanded =
            !collapsedShoppingListSections.has(sectionToggleKey);
          const toggleBtn = createSectionToggleButton({
            label: row.text || row.label || '',
            expanded: isExpanded,
            completed: isCompleted,
            onToggle: () => {
              if (collapsedShoppingListSections.has(sectionToggleKey)) {
                collapsedShoppingListSections.delete(sectionToggleKey);
              } else {
                collapsedShoppingListSections.add(sectionToggleKey);
              }
              renderChecklist();
            },
          });
          li.appendChild(toggleBtn);
        } else {
          li.textContent = String(row.text || row.label || '').trim();
        }
        list.appendChild(li);
        return;
      }

      li.className = String(row?.className || '').trim();
      li.dataset.shoppingListRowId = String(row?.id || '');
      const isPendingChecked = pendingCheckedRowIds.has(String(row?.id || ''));
      li.classList.toggle(
        'shopping-list-doc-item--checked',
        !!row?.checked || isPendingChecked,
      );
      const sourceKey = String(row?.sourceKey || '').trim();
      const planRow = sourceKey ? planRowsByKey.get(sourceKey) || null : null;
      const contributionRows = Array.isArray(planRow?.contributionRows)
        ? planRow.contributionRows.filter(Boolean)
        : [];
      const hasRecipeContributions = contributionRows.some(
        (entry) => String(entry?.sourceType || '') === 'recipe',
      );
      const supportsExpansion =
        !!sourceKey && !!planRow && hasRecipeContributions;
      if (
        shoppingListChecklistItemDebugCount <
        SHOPPING_LIST_CHECKLIST_ITEM_DEBUG_MAX
      ) {
        shoppingListChecklistItemDebugCount += 1;
        console.log('[shopping list checklist] row', {
          sourceKey: JSON.stringify(sourceKey),
          planRow: !!planRow,
          hasRecipeContributions,
          supportsExpansion,
          rowTextSample: String(row?.text || '')
            .trim()
            .slice(0, 80),
        });
      } else if (
        shoppingListChecklistItemDebugCount ===
        SHOPPING_LIST_CHECKLIST_ITEM_DEBUG_MAX
      ) {
        shoppingListChecklistItemDebugCount += 1;
        const totalItems = visibleRows.filter(
          (r) => r?.rowType !== 'section',
        ).length;
        if (totalItems > SHOPPING_LIST_CHECKLIST_ITEM_DEBUG_MAX) {
          console.log(
            `[shopping list checklist] … ${totalItems - SHOPPING_LIST_CHECKLIST_ITEM_DEBUG_MAX} more item rows (omit per-row debug)`,
          );
        }
      }
      const isExpanded =
        supportsExpansion &&
        expandedShoppingListContributionRows.has(sourceKey);
      const toggleContributionExpansion = () => {
        if (!supportsExpansion) return false;
        if (expandedShoppingListContributionRows.has(sourceKey)) {
          expandedShoppingListContributionRows.delete(sourceKey);
        } else {
          expandedShoppingListContributionRows.add(sourceKey);
        }
        renderChecklist();
        return true;
      };

      const checkbox = document.createElement('button');
      checkbox.type = 'button';
      checkbox.className = 'shopping-list-doc-checkbox';
      checkbox.setAttribute(
        'aria-label',
        row?.checked || isPendingChecked ? 'Include item' : 'Exclude item',
      );
      checkbox.setAttribute(
        'aria-pressed',
        row?.checked || isPendingChecked ? 'true' : 'false',
      );
      const checkboxIcon = document.createElement('span');
      checkboxIcon.className = 'material-symbols-outlined';
      checkboxIcon.setAttribute('aria-hidden', 'true');
      checkboxIcon.textContent =
        row?.checked || isPendingChecked
          ? 'check_box'
          : 'check_box_outline_blank';
      checkbox.appendChild(checkboxIcon);
      checkbox.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        clearShoppingListRowEditing();
        updateRow(
          row.id,
          (draft) => {
            draft.checked = !draft.checked;
          },
          {
            message: row?.checked ? 'Item included.' : 'Item completed.',
          },
        );
      });

      const textWrap = document.createElement('div');
      textWrap.className = 'shopping-list-doc-text-wrap';

      const rowTextParsed = splitShoppingListRowTextToLabelAndDetail(
        String(row?.text || '').trim(),
      );
      const planRowDetail = String(planRow?.detailText || '').trim();
      const useSplitPlanLayout =
        !!planRow &&
        (planRowDetail || rowTextParsed.detail) &&
        !(
          row?.userEdited &&
          !rowTextParsed.detail &&
          planRowDetail
        );

      const buildPlanIngredientLink = (headlineEl) => {
        const ingredientLink = document.createElement('a');
        ingredientLink.href = 'shopping.html';
        ingredientLink.className = 'shopping-list-doc-link';
        if (planRow?.variantIsDeprecated) {
          ingredientLink.classList.add(
            'shopping-list-doc-link--variant-deprecated',
          );
        }
        ingredientLink.textContent =
          String(planRow?.label || '').trim() ||
          String(row?.text || '').trim();
        ingredientLink.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            sessionStorage.removeItem(shoppingNavKeys.shoppingNavTargetId);
            sessionStorage.setItem(
              shoppingNavKeys.shoppingNavTargetName,
              String(planRow?.name || '').trim() ||
                String(planRow?.label || '').trim(),
            );
          } catch (_) {}
          window.location.href =
            favoriteEatsHrefWithCurrentAdapter('shopping.html');
        });
        headlineEl.appendChild(ingredientLink);
        return ingredientLink;
      };

      const appendTailExpansionButton = (getTail) => {
        if (!supportsExpansion) return;
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'shopping-list-doc-expand';
        toggleBtn.setAttribute(
          'aria-label',
          isExpanded ? 'Collapse recipe details' : 'Expand recipe details',
        );
        toggleBtn.setAttribute(
          'aria-expanded',
          isExpanded ? 'true' : 'false',
        );
        toggleBtn.textContent = isExpanded ? '\u25B4' : '\u25BE';
        toggleBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleContributionExpansion();
        });
        const tailEl = getTail();
        if (tailEl.childNodes.length > 1) {
          tailEl.appendChild(document.createTextNode('\u00a0'));
        }
        tailEl.appendChild(toggleBtn);
      };

      if (
        editingRowId === row.id &&
        useSplitPlanLayout &&
        editingRowMode === 'amount'
      ) {
        const resolvedPlanLabel = getShoppingListPlanRowResolvedLabel(planRow);
        const displayDetailForEdit = rowTextParsed.detail || planRowDetail;
        const headline = document.createElement('div');
        headline.className = 'shopping-list-doc-headline';
        buildPlanIngredientLink(headline);
        let tail = null;
        const getTail = () => {
          if (tail) return tail;
          tail = document.createElement('span');
          tail.className = 'shopping-list-doc-tail';
          tail.appendChild(document.createTextNode('\u00a0'));
          headline.appendChild(tail);
          return tail;
        };
        const amtInput = document.createElement('input');
        amtInput.type = 'text';
        amtInput.className =
          'shopping-list-doc-input shopping-list-doc-input--amount';
        amtInput.setAttribute('aria-label', 'Amount');
        amtInput.value = String(displayDetailForEdit || '');

        const applyShoppingListAmountInputWidth = () => {
          const len = String(amtInput.value || '').length;
          const cols = Math.min(32, Math.max(2, len + 1));
          amtInput.setAttribute('size', String(cols));
        };
        applyShoppingListAmountInputWidth();
        amtInput.addEventListener('input', () => {
          applyShoppingListAmountInputWidth();
        });

        const amountSkin = document.createElement('span');
        amountSkin.className = 'shopping-list-doc-amount-skin';
        const parenOpen = document.createElement('span');
        parenOpen.className = 'shopping-list-doc-amount-paren';
        parenOpen.setAttribute('aria-hidden', 'true');
        parenOpen.textContent = '(';
        const parenClose = document.createElement('span');
        parenClose.className = 'shopping-list-doc-amount-paren';
        parenClose.setAttribute('aria-hidden', 'true');
        parenClose.textContent = ')';
        amountSkin.appendChild(parenOpen);
        amountSkin.appendChild(amtInput);
        amountSkin.appendChild(parenClose);
        getTail().appendChild(amountSkin);
        appendTailExpansionButton(getTail);
        const finishAmountEditing = (mode) => {
          if (editingRowId !== row.id) return;
          let nextDetail = String(amtInput.value || '').trim();
          if (mode === 'commit' && !nextDetail) {
            const fromSource = splitShoppingListRowTextToLabelAndDetail(
              String(row?.sourceText || '').trim(),
            ).detail;
            const canonical = String(
              planRowDetail || fromSource || '',
            ).trim();
            if (canonical) {
              nextDetail = canonical;
            }
          }
          const nextText = joinShoppingListLabelAndDetail(
            resolvedPlanLabel,
            nextDetail,
          );
          clearShoppingListRowEditing();
          if (
            mode === 'commit' &&
            nextText &&
            nextText !== String(row?.text || '').trim()
          ) {
            updateRow(
              row.id,
              (draft) => {
                draft.text = nextText;
              },
              {
                message: 'Row updated.',
              },
            );
            return;
          }
          renderChecklist();
        };
        amountSkin.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.target !== amtInput) {
            try {
              amtInput.focus();
            } catch (_) {}
          }
        });
        amtInput.addEventListener('click', (event) => event.stopPropagation());
        amtInput.addEventListener('keydown', (event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            finishAmountEditing('commit');
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            finishAmountEditing('cancel');
          }
        });
        amtInput.addEventListener('blur', () => finishAmountEditing('commit'));
        textWrap.appendChild(headline);
      } else if (
        editingRowId === row.id &&
        (!useSplitPlanLayout || editingRowMode === 'line')
      ) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'shopping-list-doc-input';
        input.value = String(row?.text || '');
        const finishLineEditing = (mode) => {
          if (editingRowId !== row.id) return;
          const nextValue = String(input.value || '').trim();
          clearShoppingListRowEditing();
          if (
            mode === 'commit' &&
            nextValue &&
            nextValue !== String(row?.text || '').trim()
          ) {
            updateRow(
              row.id,
              (draft) => {
                draft.text = nextValue;
              },
              {
                message: 'Row updated.',
              },
            );
            return;
          }
          renderChecklist();
        };
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('keydown', (event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            finishLineEditing('commit');
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            finishLineEditing('cancel');
          }
        });
        input.addEventListener('blur', () => finishLineEditing('commit'));
        textWrap.appendChild(input);
      } else {
        const headline = document.createElement('div');
        headline.className = 'shopping-list-doc-headline';
        let tail = null;

        const getTail = () => {
          if (tail) return tail;
          tail = document.createElement('span');
          tail.className = 'shopping-list-doc-tail';
          tail.appendChild(document.createTextNode('\u00a0'));
          headline.appendChild(tail);
          return tail;
        };

        if (useSplitPlanLayout) {
          buildPlanIngredientLink(headline);
          const innerDetail = rowTextParsed.detail || planRowDetail;
          const amountBtn = document.createElement('button');
          amountBtn.type = 'button';
          const amountDiverged =
            shoppingListRowAmountDetailDivergedFromSource(row);
          amountBtn.className = [
            'shopping-list-doc-text',
            'shopping-list-doc-text--amount',
            amountDiverged ? 'shopping-list-doc-text--amount-diverged' : '',
          ]
            .filter(Boolean)
            .join(' ');
          amountBtn.textContent = `(${innerDetail})`;
          amountBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            editingRowId = row.id;
            editingRowMode = 'amount';
            renderChecklist();
          });
          getTail().appendChild(amountBtn);
        } else {
          const textBtn = document.createElement('button');
          textBtn.type = 'button';
          textBtn.className = [
            'shopping-list-doc-text',
            planRow?.variantIsDeprecated
              ? 'shopping-list-doc-text--variant-deprecated'
              : '',
          ]
            .filter(Boolean)
            .join(' ');
          textBtn.textContent = String(row?.text || '').trim();
          textBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            editingRowId = row.id;
            editingRowMode = 'line';
            renderChecklist();
          });
          headline.appendChild(textBtn);
        }

        if (useSplitPlanLayout) {
          appendTailExpansionButton(getTail);
        } else if (supportsExpansion) {
          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'shopping-list-doc-expand';
          toggleBtn.setAttribute(
            'aria-label',
            isExpanded ? 'Collapse recipe details' : 'Expand recipe details',
          );
          toggleBtn.setAttribute(
            'aria-expanded',
            isExpanded ? 'true' : 'false',
          );
          toggleBtn.textContent = isExpanded ? '\u25B4' : '\u25BE';
          toggleBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleContributionExpansion();
          });
          const textBtnTail = document.createElement('span');
          textBtnTail.className = 'shopping-list-doc-tail';
          textBtnTail.appendChild(document.createTextNode('\u00a0'));
          headline.appendChild(textBtnTail);
          textBtnTail.appendChild(toggleBtn);
        }

        textWrap.appendChild(headline);
      }

      li.appendChild(checkbox);
      li.appendChild(textWrap);
      if (supportsExpansion) {
        li.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest('.shopping-list-doc-link')) return;
          if (target.closest('.shopping-list-doc-amount-skin')) return;
          if (
            target.closest(
              '.shopping-list-doc-text:not(.shopping-list-doc-text--amount)',
            )
          ) {
            return;
          }
          if (target.closest('.shopping-list-doc-input')) return;
          if (target.closest('.shopping-list-doc-checkbox')) return;
          event.preventDefault();
          event.stopPropagation();
          toggleContributionExpansion();
        });
      }
      list.appendChild(li);

      if (isExpanded) {
        const createContributionCheckboxPlaceholder = () => {
          const placeholder = document.createElement('span');
          placeholder.className =
            'shopping-list-doc-checkbox shopping-list-doc-checkbox--placeholder';
          placeholder.setAttribute('aria-hidden', 'true');
          const placeholderIcon = document.createElement('span');
          placeholderIcon.className = 'material-symbols-outlined';
          placeholderIcon.setAttribute('aria-hidden', 'true');
          placeholderIcon.textContent = 'check_box_outline_blank';
          placeholder.appendChild(placeholderIcon);
          return placeholder;
        };
        const hasRecipeContributionRows = contributionRows.some(
          (entry) => String(entry?.sourceType || '') === 'recipe',
        );
        if (hasRecipeContributionRows) {
          const contextLi = document.createElement('li');
          contextLi.className =
            'shopping-list-doc-item shopping-list-doc-item--contribution-context';
          contextLi.appendChild(createContributionCheckboxPlaceholder());
          const contextTextWrap = document.createElement('div');
          contextTextWrap.className = 'shopping-list-doc-text-wrap';
          const contextHeadline = document.createElement('div');
          contextHeadline.className =
            'shopping-list-doc-headline shopping-list-doc-headline--contribution-context';
          const contextText = document.createElement('span');
          contextText.className =
            'shopping-list-doc-contribution-context-label';
          contextText.textContent = 'Recipes';
          contextHeadline.appendChild(contextText);
          contextTextWrap.appendChild(contextHeadline);
          contextLi.appendChild(contextTextWrap);
          list.appendChild(contextLi);
        }
        contributionRows.forEach((entry, contributionIndex) => {
          const childLi = document.createElement('li');
          childLi.className =
            'shopping-list-doc-item shopping-list-doc-item--contribution';
          if (contributionIndex === contributionRows.length - 1) {
            childLi.classList.add('shopping-list-doc-item--contribution-last');
          }
          childLi.appendChild(createContributionCheckboxPlaceholder());
          const textWrapChild = document.createElement('div');
          textWrapChild.className = 'shopping-list-doc-text-wrap';
          const headlineChild = document.createElement('div');
          headlineChild.className =
            'shopping-list-doc-headline shopping-list-doc-headline--contribution';

          if (String(entry?.sourceType || '') === 'recipe') {
            const recipeLink = document.createElement('a');
            recipeLink.href =
              favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
            recipeLink.className = 'shopping-list-doc-contribution-link';
            recipeLink.textContent =
              String(entry?.title || '').trim() || 'Recipe';
            recipeLink.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (typeof window.openRecipe === 'function') {
                window.openRecipe(entry.recipeId);
                return;
              }
              sessionStorage.setItem(
                'selectedRecipeId',
                String(entry.recipeId || ''),
              );
              window.location.href =
                favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
            });
            headlineChild.appendChild(recipeLink);
          } else {
            const label = document.createElement('span');
            label.className = 'shopping-list-doc-contribution-label';
            label.textContent =
              String(entry?.title || '').trim() || 'Directly added';
            headlineChild.appendChild(label);
          }

          const detail = document.createElement('span');
          detail.className = 'shopping-list-doc-contribution-detail';
          detail.textContent = `(${String(entry?.detailText || '').trim()})`;
          headlineChild.appendChild(detail);

          textWrapChild.appendChild(headlineChild);
          childLi.appendChild(textWrapChild);
          list.appendChild(childLi);
        });
      }
    });

    listNav?.syncAfterRender?.();

    if (editingRowId) {
      requestAnimationFrame(() => {
        const input =
          editingRowMode === 'amount'
            ? list.querySelector('input.shopping-list-doc-input--amount')
            : list.querySelector(
                'input.shopping-list-doc-input:not(.shopping-list-doc-input--amount)',
              );
        if (!(input instanceof HTMLInputElement)) return;
        try {
          input.focus();
          input.select();
        } catch (_) {}
      });
    }
    syncShoppingListResetButtonState();
    syncShoppingListCopyButtonState();
    shoppingListFilterChipRail?.sync?.();
  };

  const handleShoppingListReset = async () => {
    const previousDoc = cloneForUndo(
      shoppingListDoc,
      createEmptyShoppingListDoc,
    );
    const nextDoc = getGeneratedShoppingListDoc();
    if (isShoppingListResetNoOp(nextDoc)) {
      syncShoppingListResetButtonState(nextDoc);
      return;
    }
    const confirmed = await uiConfirm({
      title: 'Reset shopping list?',
      message:
        'Replace manual checklist edits with the latest generated shopping list.',
      confirmText: 'Reset',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    cancelAllPendingChecks();
    shoppingListDoc = persistShoppingListDoc(nextDoc);
    clearShoppingListRowEditing();
    collapsedShoppingListSections.clear();
    await refreshShoppingListHomeLocationCache();
    renderChecklist();
    uiToastUndo('Shopping list reset.', () => {
      cancelAllPendingChecks();
      shoppingListDoc = persistShoppingListDoc(previousDoc);
      clearShoppingListRowEditing();
      collapsedShoppingListSections.clear();
      void refreshShoppingListHomeLocationCache().then(() => {
        renderChecklist();
      });
    });
  };

  const handleShoppingListCopy = async () => {
    const { visibleRows, selectedRecipes, recipesExpanded } =
      getShoppingListChecklistViewState();
    const plainText = formatShoppingListPlainTextFromViewState(visibleRows, {
      selectedRecipes,
      recipesExpanded,
    });
    const htmlText = formatShoppingListHtmlFromViewState(visibleRows, {
      selectedRecipes,
      recipesExpanded,
    });
    if (!String(plainText || '').trim()) {
      syncShoppingListCopyButtonState();
      uiToast('Nothing to copy.');
      return;
    }
    const canWritePlainText =
      typeof navigator?.clipboard?.writeText === 'function';
    const canWriteRich =
      typeof navigator?.clipboard?.write === 'function' &&
      typeof ClipboardItem === 'function' &&
      typeof Blob === 'function';
    if (!canWritePlainText && !canWriteRich) {
      uiToast('Clipboard is unavailable on this device.');
      return;
    }
    try {
      if (canWriteRich) {
        const item = new ClipboardItem({
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
          'text/html': new Blob([htmlText], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
      } else if (canWritePlainText) {
        await navigator.clipboard.writeText(plainText);
      }
      uiToast('Shopping list copied.');
    } catch (err) {
      if (canWritePlainText) {
        try {
          await navigator.clipboard.writeText(plainText);
          uiToast('Shopping list copied.');
          return;
        } catch (fallbackErr) {
          console.error('❌ Failed to copy shopping list:', err);
          console.error(
            '❌ Failed plain text clipboard fallback:',
            fallbackErr,
          );
        }
      } else {
        console.error('❌ Failed to copy shopping list:', err);
      }
      uiToast('Could not copy shopping list.');
    }
  };

  const handleShoppingListExport = async () => {
    if (!shoppingListExportEnabled) return;
    const exportPayload = buildShoppingListExportPayload(shoppingListDoc?.rows);
    if (!exportPayload.stores.length) {
      syncShoppingListExportButtonState();
      uiToast('No unchecked shopping items to export.');
      return;
    }
    if (!window.electronAPI?.googleDocsExportShoppingList) {
      uiToast('Google Docs export is only available in the desktop app.');
      return;
    }
    const confirmed = await uiConfirm({
      title: 'Export shopping list?',
      message:
        'Create a Google Doc checklist from your unchecked shopping items.',
      confirmText: 'Export',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    exportingShoppingList = true;
    syncShoppingListExportButtonState();
    try {
      const result =
        await window.electronAPI.googleDocsExportShoppingList(exportPayload);
      if (result?.ok) {
        uiToast('Shopping list exported to Google Docs.');
        return;
      }
      uiToast(String(result?.message || 'Could not export shopping list.'));
    } catch (err) {
      console.error('❌ Failed to export shopping list:', err);
      uiToast('Could not export shopping list.');
    } finally {
      exportingShoppingList = false;
      syncShoppingListExportButtonState();
    }
  };

  if (!shoppingListWebMode && controls) {
    controls.innerHTML = '';
    if (
      shoppingListExportEnabled &&
      isElectron &&
      window.electronAPI?.googleDocsExportShoppingList
    ) {
      exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'button shopping-list-controls__action';
      exportBtn.textContent = 'Export';
      controls.appendChild(exportBtn);
      exportBtn.addEventListener('click', () => {
        void handleShoppingListExport();
      });
    }
    resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className =
      'button shopping-list-controls__action shopping-list-controls__reset';
    resetBtn.textContent = 'Reset List';
    controls.appendChild(resetBtn);
    resetBtn.addEventListener('click', () => {
      void handleShoppingListReset();
    });
  }

  if (shoppingListWebMode) {
    const addBtn = document.getElementById('appBarAddBtn');
    if (addBtn instanceof HTMLButtonElement) {
      const actions = addBtn.parentElement;
      if (actions instanceof HTMLElement) {
        if (
          shoppingListExportEnabled &&
          isElectron &&
          window.electronAPI?.googleDocsExportShoppingList
        ) {
          const existingWebExportBtn =
            document.getElementById('appBarExportBtn');
          if (existingWebExportBtn instanceof HTMLButtonElement) {
            webExportBtn = existingWebExportBtn;
          } else {
            webExportBtn = document.createElement('button');
            webExportBtn.type = 'button';
            webExportBtn.id = 'appBarExportBtn';
            webExportBtn.className = 'button';
            actions.insertBefore(webExportBtn, addBtn);
          }
          ensureAppBarTextActionPair(webExportBtn, 'Export', 'upload_file');
          webExportBtn.addEventListener('click', () => {
            void handleShoppingListExport();
          });
        }
        const existingWebCopyBtn = document.getElementById('appBarCopyBtn');
        if (existingWebCopyBtn instanceof HTMLButtonElement) {
          webCopyBtn = existingWebCopyBtn;
        } else {
          webCopyBtn = document.createElement('button');
          webCopyBtn.type = 'button';
          webCopyBtn.id = 'appBarCopyBtn';
          webCopyBtn.className = 'button';
          actions.insertBefore(webCopyBtn, addBtn);
        }
        ensureAppBarTextActionPair(webCopyBtn, 'Copy', 'content_copy');
        webCopyBtn.addEventListener('click', () => {
          void handleShoppingListCopy();
        });
      }
      webResetBtn = addBtn;
      ensureAppBarTextActionPair(webResetBtn, 'Reset', 'restart_alt');
      attachSecretGalleryShortcut(webResetBtn);
      webResetBtn.addEventListener('click', () => {
        void handleShoppingListReset();
      });
    }
  }

  await refreshShoppingListHomeLocationCache();
  mountShoppingListFilterChips();
  renderChecklist();
  syncShoppingListCopyButtonState();
  syncShoppingListExportButtonState();
  void resolvePendingSourceConflicts();
}

// --- Shared helper for child editor pages (shopping, units, stores, …) ---
function wireChildEditorPage({
  backBtn,
  cancelBtn,
  saveBtn,
  appBarTitleEl,
  bodyTitleEl,
  initialTitle,
  backHref,
  onSave,
  extraFields,
  normalizeTitle: normalizeTitleFn,
  displayTitle: displayTitleFn,
  subtitleEl,
  initialSubtitle,
  normalizeSubtitle: normalizeSubtitleFn,
  subtitlePlaceholder: subtitlePlaceholderText,
  subtitleEmptyMeansHidden = false,
  subtitleRevealBtn = null,
  hideSubtitleWhenMatchesTitle = false,
  extraDirtyState = null,
}) {
  if (!appBarTitleEl || !bodyTitleEl) return;

  const subtitlePlaceholder = subtitlePlaceholderText || 'Abbreviation';
  const normalize = (value) => (value || '').trim();
  const normalizeTitle = normalizeTitleFn || normalize;
  const displayTitle = displayTitleFn || ((v) => v ?? '');
  const maybeAutoGrow = (el) => {
    try {
      if (el && typeof el.__feAutoGrowResize === 'function') {
        el.__feAutoGrowResize();
      }
    } catch (_) {}
  };
  let baselineTitle = normalizeTitle(initialTitle);
  const extras = Array.isArray(extraFields) ? extraFields : [];
  let baselineExtras = {};
  extras.forEach((f) => {
    if (!f || !f.key) return;
    baselineExtras[String(f.key)] = normalize(f.initialValue);
  });

  const hasSubtitle = !!subtitleEl && normalizeSubtitleFn;
  let baselineSubtitle = hasSubtitle
    ? initialSubtitle
      ? normalizeSubtitleFn(initialSubtitle)
      : ''
    : '';

  /** Store editor: no saved location — subtitle row only while title/subtitle editing or after user enters a location. */
  const emptySubtitleFlow = () =>
    !!(
      subtitleEmptyMeansHidden &&
      hasSubtitle &&
      !(baselineSubtitle || '').trim()
    );

  let titleSessionActive = false;
  let subtitleSessionActive = false;
  /** True between pointerdown on subtitle and subtitle click (title blurs first). */
  let subtitlePointerKeepAlive = false;
  /** Shown after subtitle blur; survives sync until Save/Cancel (fixes draft wipe when baseline non-empty). */
  let lastCommittedSubtitle = hasSubtitle ? baselineSubtitle || '' : '';

  bodyTitleEl.textContent = displayTitle(baselineTitle) || '';
  appBarTitleEl.textContent = displayTitle(baselineTitle) || '';

  const setSubtitlePlaceholderClass = (showPlaceholder) => {
    try {
      if (showPlaceholder) subtitleEl.classList.add('placeholder-prompt');
      else subtitleEl.classList.remove('placeholder-prompt');
    } catch (_) {}
  };

  const syncSubtitleDomFromBaseline = () => {
    if (!hasSubtitle) return;
    const subtitleRaw = (lastCommittedSubtitle || '').trim()
      ? lastCommittedSubtitle
      : '';
    const titleForSubtitleCompare = normalizeTitle(
      bodyTitleEl.textContent || '',
    );
    const subtitleMatchesTitle =
      hideSubtitleWhenMatchesTitle &&
      !!subtitleRaw &&
      normalizeSubtitleFn(subtitleRaw) === titleForSubtitleCompare;
    const subDisplay = subtitleRaw
      ? subtitleMatchesTitle
        ? ''
        : subtitleRaw
      : subtitlePlaceholder;
    if (!subtitleEmptyMeansHidden) {
      subtitleEl.style.display = '';
      subtitleEl.textContent = subDisplay;
      setSubtitlePlaceholderClass(subDisplay === subtitlePlaceholder);
      if (subtitleRevealBtn) subtitleRevealBtn.style.display = 'none';
      try {
        subtitleEl.removeAttribute('aria-hidden');
      } catch (_) {}
      return;
    }
    if (!emptySubtitleFlow()) {
      subtitleEl.style.display = '';
      subtitleEl.textContent = subDisplay;
      setSubtitlePlaceholderClass(subDisplay === subtitlePlaceholder);
      if (subtitleRevealBtn) subtitleRevealBtn.style.display = 'none';
      try {
        subtitleEl.removeAttribute('aria-hidden');
      } catch (_) {}
      return;
    }
    const hasPending = (lastCommittedSubtitle || '').trim().length > 0;
    const showRow =
      titleSessionActive ||
      subtitleSessionActive ||
      hasPending ||
      subtitlePointerKeepAlive;
    if (!showRow) {
      subtitleEl.textContent = '';
      setSubtitlePlaceholderClass(false);
      subtitleEl.style.display = 'none';
      subtitleEl.setAttribute('aria-hidden', 'true');
      if (subtitleRevealBtn) subtitleRevealBtn.style.display = '';
      return;
    }
    subtitleEl.style.display = '';
    subtitleEl.removeAttribute('aria-hidden');
    if (subtitleRevealBtn) subtitleRevealBtn.style.display = 'none';
    if (subtitleSessionActive) return;
    const showingPlaceholder = !hasPending;
    subtitleEl.textContent = showingPlaceholder
      ? subtitlePlaceholder
      : lastCommittedSubtitle;
    setSubtitlePlaceholderClass(showingPlaceholder);
  };

  if (hasSubtitle) syncSubtitleDomFromBaseline();

  if (subtitleRevealBtn && subtitleEmptyMeansHidden && hasSubtitle) {
    subtitleRevealBtn.addEventListener('click', () => {
      subtitleRevealBtn.style.display = 'none';
      subtitleEl.style.display = '';
      subtitleEl.textContent = subtitlePlaceholder;
      setSubtitlePlaceholderClass(true);
      try {
        subtitleEl.click();
      } catch (_) {}
    });
  }

  if (hasSubtitle && subtitleEmptyMeansHidden) {
    subtitleEl.addEventListener(
      'pointerdown',
      () => {
        if (emptySubtitleFlow()) subtitlePointerKeepAlive = true;
      },
      true,
    );
  }

  let isDirty = false;

  const pageDirty = () =>
    isDirty ||
    (typeof extraDirtyState?.isDirty === 'function' &&
      extraDirtyState.isDirty());

  const updateButtons = () => {
    const d = pageDirty();
    if (cancelBtn) cancelBtn.disabled = !d;
    if (saveBtn) saveBtn.disabled = !d;
  };

  updateButtons(); // page starts clean

  const markDirty = () => {
    if (!isDirty) {
      isDirty = true;
      updateButtons();
    }
  };

  // Extra fields: set baseline values and wire dirty tracking
  extras.forEach((f) => {
    if (!f) return;
    const key = String(f.key || '');
    if (!key) return;

    const els = Array.isArray(f.els) ? f.els.filter(Boolean) : [];
    const primaryEl = f.el || els[0] || null;
    if (!primaryEl) return;

    try {
      const v = baselineExtras[key] ?? '';
      if (typeof f.setValue === 'function') {
        f.setValue(v);
      } else if ('value' in primaryEl) {
        primaryEl.value = v;
      } else if ('textContent' in primaryEl) {
        primaryEl.textContent = v;
      }
    } catch (_) {}
    // If this field supports auto-grow, ensure it sizes correctly even when value
    // is set programmatically (baseline load).
    try {
      maybeAutoGrow(primaryEl);
      els.forEach((el) => maybeAutoGrow(el));
    } catch (_) {}

    try {
      const targets = els.length > 0 ? els : [primaryEl];
      targets.forEach((el) => {
        try {
          el.addEventListener('input', markDirty);
          el.addEventListener('change', markDirty);
        } catch (_) {}
      });
    } catch (_) {}
  });

  // Title is editable in the page body only (app-bar title is display-only).
  bodyTitleEl.addEventListener('click', () => {
    if (bodyTitleEl.isContentEditable) return;

    const starting = bodyTitleEl.textContent || '';
    const startingStored = normalizeTitle(starting);

    titleSessionActive = true;
    if (emptySubtitleFlow()) syncSubtitleDomFromBaseline();

    bodyTitleEl.contentEditable = 'true';
    bodyTitleEl.classList.add('editing-title');
    bodyTitleEl.focus();

    const onInput = () => {
      markDirty();
    };

    const cleanup = () => {
      bodyTitleEl.contentEditable = 'false';
      bodyTitleEl.classList.remove('editing-title');
      bodyTitleEl.removeEventListener('blur', onBlur);
      bodyTitleEl.removeEventListener('keydown', onKeyDown);
      bodyTitleEl.removeEventListener('input', onInput);
      titleSessionActive = false;
      // While the store has no saved subtitle, don't immediately sync/hide on
      // title blur. Subtitle clicking causes the title to blur first, and we
      // need the subtitle click handler to still run reliably.
      if (!emptySubtitleFlow()) syncSubtitleDomFromBaseline();
      requestAnimationFrame(() => {
        // Do not clear `subtitlePointerKeepAlive` here.
        // Title blur happens before subtitle click; clearing early can hide
        // the subtitle before its click handler runs.
        syncSubtitleDomFromBaseline();
      });
    };

    const commit = () => {
      const next = normalizeTitle(bodyTitleEl.textContent);
      const changed = next !== startingStored;
      bodyTitleEl.textContent = displayTitle(next);
      appBarTitleEl.textContent = displayTitle(next);
      if (changed) markDirty();
    };

    const cancelEdit = () => {
      bodyTitleEl.textContent = starting;
      appBarTitleEl.textContent = starting;
    };

    const onBlur = () => {
      commit();
      cleanup();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
        cleanup();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
        cleanup();
      }
    };

    bodyTitleEl.addEventListener('input', onInput);
    bodyTitleEl.addEventListener('blur', onBlur);
    bodyTitleEl.addEventListener('keydown', onKeyDown);
  });

  if (hasSubtitle) {
    subtitleEl.addEventListener('click', () => {
      if (subtitleEl.isContentEditable) return;
      subtitlePointerKeepAlive = false;
      const starting = (lastCommittedSubtitle || '').trim()
        ? lastCommittedSubtitle
        : subtitleEl.textContent || '';
      const isPlaceholder =
        starting.trim().toLowerCase() ===
        subtitlePlaceholder.trim().toLowerCase();
      const restoreOnCancelEmptyFlow = emptySubtitleFlow()
        ? (lastCommittedSubtitle || '').trim() ||
          (isPlaceholder ? '' : starting)
        : null;
      subtitleSessionActive = true;
      // Keep the hint text visible until the first real character is typed.
      subtitleEl.textContent = isPlaceholder ? subtitlePlaceholder : starting;
      subtitleEl.contentEditable = 'true';
      subtitleEl.classList.remove('placeholder-prompt');
      subtitleEl.classList.add('editing-title');
      subtitleEl.focus();
      // Put caret at the start so typing replaces the hint immediately.
      try {
        const sel = window.getSelection && window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(subtitleEl);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (_) {}

      const onInput = () => markDirty();
      const cleanup = () => {
        subtitleEl.contentEditable = 'false';
        subtitleEl.classList.remove('editing-title');
        subtitleEl.removeEventListener('blur', onBlur);
        subtitleEl.removeEventListener('keydown', onKeyDown);
        subtitleEl.removeEventListener('input', onInput);
        subtitleSessionActive = false;
        syncSubtitleDomFromBaseline();
      };
      const commit = () => {
        const raw = subtitleEl.textContent || '';
        let next = normalizeSubtitleFn(raw);
        const ph = subtitlePlaceholder.toLowerCase();
        if (isPlaceholder && next.toLowerCase() === ph) next = '';
        lastCommittedSubtitle = next;
        if (next !== (baselineSubtitle || '')) markDirty();
      };
      const cancelEdit = () => {
        if (emptySubtitleFlow() && restoreOnCancelEmptyFlow !== null) {
          subtitleEl.textContent = restoreOnCancelEmptyFlow;
        } else {
          subtitleEl.textContent = baselineSubtitle || subtitlePlaceholder;
        }
      };
      const onBlur = () => {
        commit();
        cleanup();
      };
      const onKeyDown = (e) => {
        // Placeholder behavior: keep visible on focus, but remove on first
        // typed character so the hint doesn't get partially overwritten.
        try {
          const phNorm = subtitlePlaceholder.trim().toLowerCase();
          const curNorm = (subtitleEl.textContent || '').trim().toLowerCase();
          const isPrintable =
            e.key &&
            String(e.key).length === 1 &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey;

          if (curNorm === phNorm && isPrintable) {
            subtitleEl.textContent = '';
            const sel = window.getSelection && window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(subtitleEl);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        } catch (_) {}

        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          cleanup();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
          cleanup();
        }
      };
      subtitleEl.addEventListener('blur', onBlur);
      subtitleEl.addEventListener('input', onInput);
      subtitleEl.addEventListener('keydown', onKeyDown);
    });
  }

  const saveChildEditor = async () => {
    if (!pageDirty()) return true;

    const nextTitle = normalizeTitle(bodyTitleEl.textContent);
    bodyTitleEl.textContent = displayTitle(nextTitle) || '';
    appBarTitleEl.textContent = displayTitle(nextTitle) || '';

    let nextSubtitle = '';
    if (hasSubtitle) {
      let raw = lastCommittedSubtitle;
      try {
        if (subtitleEl?.isContentEditable) {
          const t = subtitleEl.textContent || '';
          const ph = subtitlePlaceholder.trim().toLowerCase();
          raw = t.trim().toLowerCase() === ph ? '' : normalizeSubtitleFn(t);
        } else {
          raw = normalizeSubtitleFn(lastCommittedSubtitle || '');
        }
      } catch (_) {
        raw = normalizeSubtitleFn(lastCommittedSubtitle || '');
      }
      nextSubtitle = normalizeSubtitleFn(raw || '');
    }

    const extraValues = {};
    extras.forEach((f) => {
      if (!f || !f.key) return;
      const key = String(f.key);
      let raw = '';
      try {
        if (typeof f.getValue === 'function') {
          raw = f.getValue();
        } else {
          const els = Array.isArray(f.els) ? f.els.filter(Boolean) : [];
          const primaryEl = f.el || els[0] || null;
          if (!primaryEl) return;
          if ('value' in primaryEl) raw = primaryEl.value;
          else if ('textContent' in primaryEl) raw = primaryEl.textContent;
        }
      } catch (_) {
        raw = '';
      }
      extraValues[key] = normalize(raw);
    });

    try {
      if (typeof onSave === 'function') {
        await onSave({
          title: nextTitle,
          subtitle: hasSubtitle ? nextSubtitle : undefined,
          baselineTitle,
          extraValues,
        });
      }
    } catch (err) {
      if (err && err.silent) return false;
      console.error('❌ Failed to save child editor:', err);
      uiToast('Failed to save changes. See console for details.');
      return false;
    }

    isDirty = false;
    try {
      extraDirtyState?.onAfterSaveSuccess?.();
    } catch (err2) {
      console.warn('extraDirtyState.onAfterSaveSuccess', err2);
    }
    updateButtons();
    baselineTitle = nextTitle;
    if (hasSubtitle) {
      baselineSubtitle = nextSubtitle;
      lastCommittedSubtitle = nextSubtitle;
    }
    baselineExtras = { ...baselineExtras, ...extraValues };
    if (hasSubtitle) syncSubtitleDomFromBaseline();
    return true;
  };

  const doBack = async () => {
    if (!pageDirty()) {
      window.location.href = backHref;
      return;
    }

    if (window.ui && typeof window.ui.dialogThreeChoice === 'function') {
      const choice = await window.ui.dialogThreeChoice({
        title: 'Unsaved changes',
        message: 'Save changes before exiting?',
        fixText: 'Cancel',
        discardText: 'Discard',
        createText: 'Save',
        discardDanger: true,
        dismissChoice: 'fix',
      });
      if (choice === 'fix') return;
      if (choice === 'create') {
        const ok = await saveChildEditor();
        if (!ok || pageDirty()) return;
      } else if (choice !== 'discard') {
        return;
      }
      window.location.href = backHref;
      return;
    }

    if (
      await uiConfirm({
        title: 'Discard Changes?',
        message: 'Discard unsaved changes?',
        confirmText: 'Discard',
        cancelText: 'Cancel',
        danger: true,
      })
    ) {
      window.location.href = backHref;
    }
  };

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      void doBack();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!pageDirty()) return;
      bodyTitleEl.textContent = displayTitle(baselineTitle) || '';
      appBarTitleEl.textContent = displayTitle(baselineTitle) || '';
      if (hasSubtitle) {
        lastCommittedSubtitle = baselineSubtitle || '';
        syncSubtitleDomFromBaseline();
      }
      try {
        extraDirtyState?.onCancel?.();
      } catch (err) {
        console.warn('extraDirtyState.onCancel', err);
      }
      extras.forEach((f) => {
        if (!f) return;
        const key = String(f.key || '');
        if (!key) return;
        const v = baselineExtras[key] ?? '';
        try {
          if (typeof f.setValue === 'function') {
            f.setValue(v);
          } else {
            const els = Array.isArray(f.els) ? f.els.filter(Boolean) : [];
            const primaryEl = f.el || els[0] || null;
            if (!primaryEl) return;
            if ('value' in primaryEl) primaryEl.value = v;
            else if ('textContent' in primaryEl) primaryEl.textContent = v;
          }
        } catch (_) {}
        // Re-measure any auto-grow fields after restoring values.
        try {
          const els = Array.isArray(f.els) ? f.els.filter(Boolean) : [];
          const primaryEl = f.el || els[0] || null;
          maybeAutoGrow(primaryEl);
          els.forEach((el) => maybeAutoGrow(el));
        } catch (_) {}
      });
      isDirty = false;
      updateButtons();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await saveChildEditor();
    });
  }

  return { refreshDirty: updateButtons };
}

function loadShoppingItemEditorPage() {
  const view = document.getElementById('pageContent');

  if (!view) return;

  const isNew = sessionStorage.getItem('selectedShoppingItemIsNew') === '1';
  const storedName = sessionStorage.getItem('selectedShoppingItemName') || '';

  let titleText = storedName.trim();
  if (!titleText && !isNew) {
    titleText = 'Shopping item';
  }

  // Page owns the title; app bar mirrors it (display-only).

  // App bar: render shell + mode toggles only.
  // Wiring (back/cancel/save + dirty confirm) is handled by wireChildEditorPage
  // after the fragment exists, so there is exactly one path.
  initAppBar({ mode: 'editor', titleText });

  // Body title + single calm card
  view.innerHTML = `
    <h1 id="childEditorTitle" class="recipe-title">${titleText || ''}</h1>
    <div class="shopping-item-editor-card" aria-label="Shopping item">
      <div class="shopping-item-field shopping-item-variant-field">
        <div class="shopping-item-label">Variant</div>
        <input id="shoppingItemVariantRowsHiddenInput" type="hidden" />
        <div
          id="shoppingItemVariantEditor"
          class="shopping-item-variant-editor"
          aria-label="Item variants"
        >
          <div
            id="shoppingItemVariantRows"
            class="shopping-item-variant-rows"
            role="group"
            aria-label="Variant rows"
          ></div>
        </div>
        <div class="shopping-item-help">
          Base item is always present. Named variants are optional.
        </div>
      </div>

      <div class="shopping-item-field">
        <div class="shopping-item-label">Also known as</div>
        <textarea
          id="shoppingItemSynonymsTextarea"
          class="shopping-item-textarea"
          placeholder="e.g. spring onion, scallion"
          wrap="off"
        ></textarea>
      </div>

      <div class="shopping-item-field">
        <div class="shopping-item-label">Sizes</div>
        <textarea
          id="shoppingItemSizesTextarea"
          class="shopping-item-textarea"
          placeholder="e.g. 12oz can"
          wrap="off"
        ></textarea>
      </div>

      <div class="shopping-item-status">
        <div class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="shoppingItemIsNotFoodToggle" type="checkbox" />
            <span>Not food</span>
          </label>
        </div>

        <div class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="shoppingItemIsDeprecatedToggle" type="checkbox" />
            <span>Removed</span>
          </label>
        </div>

        <div id="shoppingItemIsHiddenRow" class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="shoppingItemIsHiddenToggle" type="checkbox" />
            <span>Hidden</span>
          </label>
        </div>

        <div class="shopping-item-help">
          Removed items have been removed from Shopping and can be deleted once they
          aren't used by any recipe.
        </div>
      </div>
    </div>

    <div
      id="shoppingItemOverridesTitle"
      class="shopping-item-label"
      style="margin: 32px 0 6px 0; color: var(--font-color-near-black);"
    >
      Pluralization overrides (optional)
    </div>

    <div
      id="shoppingItemOverridesCard"
      class="shopping-item-editor-card"
      aria-label="Pluralization overrides"
    >
      <div
        id="shoppingItemLanguageDetails"
        class="shopping-item-status"
        style="align-items: stretch; width: 100%;"
      >
        <div
          id="shoppingItemPluralOverrideField"
          class="shopping-item-field"
          style="width: 100%;"
        >
          <div class="shopping-item-label">Plural form</div>
          <input
            id="shoppingItemPluralOverrideInput"
            class="shopping-item-input"
            type="text"
            placeholder="e.g. leaves, grapes, bagels"
          />
        </div>

        <div id="shoppingItemPluralByDefaultRow" class="shopping-item-status-row">
          <label class="shopping-item-toggle" style="display: flex; width: 100%;">
            <input id="shoppingItemPluralByDefaultToggle" type="checkbox" />
            <span>Plural by default</span>
          </label>
        </div>

        <div id="shoppingItemIsMassNounRow" class="shopping-item-status-row">
          <label class="shopping-item-toggle" style="display: flex; width: 100%;">
            <input id="shoppingItemIsMassNounToggle" type="checkbox" />
            <span>Is a mass or substance (e.g. rice, turmeric)</span>
          </label>
        </div>
      </div>
    </div>
  `;

  const variantRowsHiddenInput = document.getElementById(
    'shoppingItemVariantRowsHiddenInput',
  );
  const variantRowsEl = document.getElementById('shoppingItemVariantRows');
  const editorTitleEl = document.getElementById('childEditorTitle');
  let variantRowsDraft = [];
  let variantRowsBaselineSignature = '';
  let refreshVariantEditorDirty = () => {};
  let pendingVariantCellFocus = null;
  let variantActionDialogOpen = false;
  let activeVariantTagEditorState = null;
  /** Tracks an in-flight Ctrl/Cmd tag-pill gesture so blur doesn't tear down the clicked row. */
  let pendingVariantTagPillInteraction = null;
  /** Suppresses the old tags input blur cleanup during intentional rerender-and-refocus flows. */
  let pendingVariantTagBlurCleanupSuppression = null;

  const isVariantTagDebugLoggingEnabled = () =>
    !!(window && window.__favoriteEatsVariantTagDebug);
  const logVariantTagDebug = (message, details = null) => {
    if (!isVariantTagDebugLoggingEnabled()) return;
    if (details && typeof details === 'object') {
      console.log(`[variant-tags] ${message}`, details);
      return;
    }
    console.log(`[variant-tags] ${message}`);
  };
  const suppressNextVariantTagBlurCleanup = (rowIndex, reason = '') => {
    const normalizedRowIndex = Number(rowIndex);
    if (!Number.isFinite(normalizedRowIndex) || normalizedRowIndex < 0) return;
    pendingVariantTagBlurCleanupSuppression = {
      rowIndex: normalizedRowIndex,
      reason: String(reason || ''),
    };
    logVariantTagDebug(
      'suppress next tags blur cleanup',
      pendingVariantTagBlurCleanupSuppression,
    );
  };

  const confirmShoppingVariantTagRemoval = async (tagLabel) => {
    const cleanTag = String(tagLabel || '').trim() || 'this tag';
    try {
      if (window.ui && typeof window.ui.confirm === 'function') {
        const ok = await window.ui.confirm({
          title: 'Remove tag?',
          message: `Remove "${cleanTag}" from this variant?`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
        return !!ok;
      }
      return window.confirm(`Remove "${cleanTag}" from this variant?`);
    } catch (_) {
      return false;
    }
  };

  const getActiveVariantTagEditorRowIndex = () => {
    const rowIndex = Number(activeVariantTagEditorState?.rowIndex);
    return Number.isFinite(rowIndex) ? rowIndex : -1;
  };

  const setActiveVariantTagEditorState = (
    rowIndex,
    draft = '',
    options = {},
  ) => {
    const normalizedRowIndex = Number(rowIndex);
    if (!Number.isFinite(normalizedRowIndex) || normalizedRowIndex < 0) {
      activeVariantTagEditorState = null;
      return;
    }
    const insertAfterTagIndex = Number(options?.insertAfterTagIndex);
    activeVariantTagEditorState = {
      rowIndex: normalizedRowIndex,
      draft: String(draft || ''),
      insertAfterTagIndex: Number.isFinite(insertAfterTagIndex)
        ? Math.trunc(insertAfterTagIndex)
        : -1,
    };
  };

  const beginVariantTagPillInteraction = (rowIndex) => {
    const interaction = {
      rowIndex: Math.max(0, Number(rowIndex) || 0),
      previousActiveRowIndex: getActiveVariantTagEditorRowIndex(),
      handled: false,
    };
    pendingVariantTagPillInteraction = interaction;
    return interaction;
  };

  const getVariantTagInsertAfterIndexForPoint = (
    pillElements,
    clientX,
    clientY,
  ) => {
    const pills = Array.isArray(pillElements)
      ? pillElements
          .filter((el) => el instanceof HTMLElement)
          .map((el, index) => ({
            index,
            rect: el.getBoundingClientRect(),
          }))
      : [];
    if (!pills.length) return -1;
    if (typeof clientX !== 'number' || typeof clientY !== 'number')
      return pills[pills.length - 1].index;

    const rows = [];
    const rowTolerancePx = 6;
    pills.forEach((pill) => {
      const existingRow = rows.find(
        (row) => Math.abs(row.top - pill.rect.top) <= rowTolerancePx,
      );
      if (existingRow) {
        existingRow.items.push(pill);
        existingRow.top = Math.min(existingRow.top, pill.rect.top);
        existingRow.bottom = Math.max(existingRow.bottom, pill.rect.bottom);
        return;
      }
      rows.push({
        top: pill.rect.top,
        bottom: pill.rect.bottom,
        items: [pill],
      });
    });
    rows.sort((a, b) => a.top - b.top);
    rows.forEach((row) => row.items.sort((a, b) => a.rect.left - b.rect.left));

    const targetRow =
      rows.find(
        (row) =>
          clientY >= row.top - rowTolerancePx &&
          clientY <= row.bottom + rowTolerancePx,
      ) ||
      rows.reduce((bestRow, row) => {
        if (!bestRow) return row;
        const bestDistance =
          clientY < bestRow.top
            ? bestRow.top - clientY
            : clientY > bestRow.bottom
              ? clientY - bestRow.bottom
              : 0;
        const rowDistance =
          clientY < row.top
            ? row.top - clientY
            : clientY > row.bottom
              ? clientY - row.bottom
              : 0;
        return rowDistance < bestDistance ? row : bestRow;
      }, null);
    if (!targetRow) return pills[pills.length - 1].index;

    for (let i = 0; i < targetRow.items.length; i += 1) {
      const pill = targetRow.items[i];
      const midpoint = pill.rect.left + pill.rect.width / 2;
      if (clientX < midpoint) return pill.index - 1;
    }
    return targetRow.items[targetRow.items.length - 1].index;
  };

  const getVariantRowsSignature = (rows) =>
    normalizeIngredientVariantRows(Array.isArray(rows) ? rows : [])
      .map((row) => {
        const homeLocation = normalizeShoppingHomeLocationId(
          row?.homeLocation || 'none',
        );
        const tagKey = normalizeRecipeTagList(row?.tags || []).join('|');
        const dep = row?.isDeprecated ? '1' : '0';
        if (row?.isBase) return `base:${homeLocation}:${tagKey}:${dep}`;
        return `variant:${String(row?.value || '')}:${homeLocation}:${tagKey}:${dep}`;
      })
      .join('\n');

  const getNamedVariantRowsFromDraft = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .filter((row) => row && !row.isBase)
      .map((row) => ({
        isBase: false,
        value: normalizeNamedIngredientVariant(row.value),
        homeLocation: normalizeShoppingHomeLocationId(
          row.homeLocation || 'none',
        ),
        tags: normalizeRecipeTagList(row.tags || []),
        variantId: Number.isFinite(Number(row.variantId))
          ? Number(row.variantId)
          : null,
        isDeprecated: !!row.isDeprecated,
      }))
      .filter((row) => row.value);

  const getVariantRowsForEditing = (rows) =>
    normalizeIngredientVariantRows(rows);
  const ensureBaseVariantRowPresent = () => {
    if (variantRowsDraft[0]?.isBase) return;
    const existingBaseRow = variantRowsDraft.find((row) => row?.isBase);
    const baseHomeLocation = normalizeShoppingHomeLocationId(
      existingBaseRow?.homeLocation || 'none',
    );
    variantRowsDraft = [
      {
        isBase: true,
        value: '',
        homeLocation: baseHomeLocation,
        tags: normalizeRecipeTagList(existingBaseRow?.tags || []),
      },
      ...variantRowsDraft.filter((row) => row && !row.isBase),
    ];
  };
  const homeLocationDefsForEditor = SHOPPING_LIST_HOME_LOCATION_DEFS.filter(
    (locationDef) =>
      normalizeShoppingHomeLocationId(locationDef?.id || 'none') !== 'none',
  );
  const homeLocationLabelById = new Map();
  const homeLocationIdByLookupKey = new Map();
  homeLocationDefsForEditor.forEach((locationDef) => {
    const normalizedId = normalizeShoppingHomeLocationId(
      locationDef?.id || 'none',
    );
    if (normalizedId === 'none') return;
    const label =
      String(locationDef?.label || normalizedId).trim() || normalizedId;
    homeLocationLabelById.set(normalizedId, label);
    homeLocationIdByLookupKey.set(normalizedId, normalizedId);
    homeLocationIdByLookupKey.set(label.toLowerCase(), normalizedId);
  });

  const getCurrentItemNameForBaseRow = () => {
    const raw = String(
      editorTitleEl?.textContent || titleText || storedName || 'item',
    ).trim();
    return raw || 'item';
  };

  const getHomeLocationDisplayText = (homeLocationId) => {
    const normalizedId = normalizeShoppingHomeLocationId(
      homeLocationId || 'none',
    );
    if (normalizedId === 'none') return '';
    return homeLocationLabelById.get(normalizedId) || normalizedId;
  };

  const resolveHomeLocationIdFromInput = (rawValue) => {
    const normalized = String(rawValue || '')
      .trim()
      .toLowerCase();
    if (!normalized) return 'none';
    return homeLocationIdByLookupKey.get(normalized) || '';
  };

  const syncVariantHiddenInput = ({ emit = false } = {}) => {
    if (!variantRowsHiddenInput) return;
    const nextValue = serializeIngredientVariantRows(variantRowsDraft);
    const previousValue = String(variantRowsHiddenInput.value || '');
    variantRowsHiddenInput.value = nextValue;
    if (!emit || nextValue === previousValue) return;
    try {
      variantRowsHiddenInput.dispatchEvent(
        new Event('input', { bubbles: true }),
      );
      variantRowsHiddenInput.dispatchEvent(
        new Event('change', { bubbles: true }),
      );
    } catch (_) {}
    refreshVariantEditorDirty();
  };

  const addVariantTagToRow = (rowIndex, rawTag, { emit = true } = {}) => {
    const normalizedIndex = Number(rowIndex);
    if (
      !Number.isFinite(normalizedIndex) ||
      normalizedIndex < 0 ||
      normalizedIndex >= variantRowsDraft.length
    ) {
      return false;
    }
    const nextTag = normalizeRecipeTagList([rawTag])[0] || '';
    if (!nextTag) return false;
    const currentTags = normalizeRecipeTagList(
      variantRowsDraft[normalizedIndex].tags || [],
    );
    const nextTags = normalizeRecipeTagList([...currentTags, nextTag]);
    const previousKey = JSON.stringify(
      currentTags.map((value) => String(value || '').toLowerCase()),
    );
    const nextKey = JSON.stringify(
      nextTags.map((value) => String(value || '').toLowerCase()),
    );
    if (previousKey === nextKey) return false;
    variantRowsDraft[normalizedIndex].tags = nextTags;
    syncVariantHiddenInput({ emit });
    return true;
  };

  const insertVariantTagToRow = (
    rowIndex,
    rawTag,
    insertAfterTagIndex,
    { emit = true } = {},
  ) => {
    const normalizedIndex = Number(rowIndex);
    if (
      !Number.isFinite(normalizedIndex) ||
      normalizedIndex < 0 ||
      normalizedIndex >= variantRowsDraft.length
    ) {
      return false;
    }
    const nextTag = normalizeRecipeTagList([rawTag])[0] || '';
    if (!nextTag) return false;
    const currentTags = normalizeRecipeTagList(
      variantRowsDraft[normalizedIndex].tags || [],
    );
    const normalizedInsertAfter = Number.isFinite(Number(insertAfterTagIndex))
      ? Math.trunc(Number(insertAfterTagIndex))
      : currentTags.length - 1;
    const insertAt = Math.max(
      0,
      Math.min(currentTags.length, normalizedInsertAfter + 1),
    );
    const nextTags = normalizeRecipeTagList([
      ...currentTags.slice(0, insertAt),
      nextTag,
      ...currentTags.slice(insertAt),
    ]);
    const previousKey = JSON.stringify(
      currentTags.map((value) => String(value || '').toLowerCase()),
    );
    const nextKey = JSON.stringify(
      nextTags.map((value) => String(value || '').toLowerCase()),
    );
    if (previousKey === nextKey) return false;
    variantRowsDraft[normalizedIndex].tags = nextTags;
    syncVariantHiddenInput({ emit });
    return true;
  };

  const commitActiveVariantTagDraft = ({ clear = false, emit = true } = {}) => {
    if (!activeVariantTagEditorState) return false;
    const rowIndex = Number(activeVariantTagEditorState.rowIndex);
    const draft = String(activeVariantTagEditorState.draft || '').trim();
    const insertAfterTagIndex = Number(
      activeVariantTagEditorState.insertAfterTagIndex,
    );
    const changed = draft
      ? insertVariantTagToRow(rowIndex, draft, insertAfterTagIndex, { emit })
      : false;
    if (clear) activeVariantTagEditorState = null;
    else {
      activeVariantTagEditorState.draft = '';
      if (changed) {
        activeVariantTagEditorState.insertAfterTagIndex = Math.trunc(
          (Number.isFinite(insertAfterTagIndex) ? insertAfterTagIndex : -1) + 1,
        );
      }
    }
    try {
      refreshVariantEditorDirty();
    } catch (_) {}
    return changed;
  };

  /** Merge in-progress tag text so Save serializes the same rows the user sees while typing. */
  const getVariantRowsDraftWithMergedActiveTagDraft = () => {
    const raw = Array.isArray(variantRowsDraft) ? variantRowsDraft : [];
    const rows = raw.map((row) => ({
      ...row,
      tags: normalizeRecipeTagList(row?.tags || []),
    }));
    if (!activeVariantTagEditorState) return rows;
    const idx = Number(activeVariantTagEditorState.rowIndex);
    const draftRaw = String(activeVariantTagEditorState.draft || '').trim();
    const nextTag = normalizeRecipeTagList([draftRaw])[0] || '';
    const insertAfterTagIndex = Number(
      activeVariantTagEditorState.insertAfterTagIndex,
    );
    if (!Number.isFinite(idx) || idx < 0 || idx >= rows.length || !nextTag) {
      return rows;
    }
    const cur = normalizeRecipeTagList(rows[idx].tags || []);
    const normalizedInsertAfter = Number.isFinite(insertAfterTagIndex)
      ? Math.trunc(insertAfterTagIndex)
      : cur.length - 1;
    const insertAt = Math.max(
      0,
      Math.min(cur.length, normalizedInsertAfter + 1),
    );
    const merged = normalizeRecipeTagList([
      ...cur.slice(0, insertAt),
      nextTag,
      ...cur.slice(insertAt),
    ]);
    rows[idx] = {
      ...rows[idx],
      tags: merged,
    };
    return rows;
  };

  const setPendingVariantCellFocus = (rowIndex, column, options = {}) => {
    pendingVariantCellFocus = {
      rowIndex: Math.max(0, Number(rowIndex) || 0),
      column: column === 'home' || column === 'tags' ? column : 'variant',
      caretAtStart: options?.caretAtStart !== false,
      openTypeahead: !!options?.openTypeahead,
    };
  };

  const removeEmptyNamedVariantRows = () => {
    const baseRow = variantRowsDraft.find((row) => row?.isBase) || {
      isBase: true,
      value: '',
      homeLocation: 'none',
    };
    const namedRows = variantRowsDraft
      .filter((row) => row && !row.isBase)
      .filter((row) => String(row?.value || '').trim())
      .map((row) => ({
        isBase: false,
        value: String(row?.value || ''),
        homeLocation: normalizeShoppingHomeLocationId(
          row?.homeLocation || 'none',
        ),
        tags: normalizeRecipeTagList(row?.tags || []),
        variantId: Number.isFinite(Number(row?.variantId))
          ? Number(row.variantId)
          : null,
        isDeprecated: !!row?.isDeprecated,
      }));
    variantRowsDraft = [
      {
        isBase: true,
        value: '',
        homeLocation: normalizeShoppingHomeLocationId(
          baseRow.homeLocation || 'none',
        ),
        tags: normalizeRecipeTagList(baseRow.tags || []),
        variantId: Number.isFinite(Number(baseRow?.variantId))
          ? Number(baseRow.variantId)
          : null,
        isDeprecated: !!baseRow?.isDeprecated,
      },
      ...namedRows,
    ];
  };

  const ensureNamedVariantRowAt = (rowIndex) => {
    ensureBaseVariantRowPresent();
    const desiredIndex = Math.max(1, Number(rowIndex) || 1);
    while (variantRowsDraft.length <= desiredIndex) {
      variantRowsDraft.push({
        isBase: false,
        value: '',
        homeLocation: 'none',
        tags: [],
        variantId: null,
        isDeprecated: false,
      });
    }
    syncVariantHiddenInput({ emit: true });
    return desiredIndex;
  };

  const insertPastedVariantRowsAt = (rowIndex, rawText) => {
    const normalizedText = String(rawText || '').replace(/\r\n?/g, '\n');
    if (!normalizedText.includes('\n')) return false;
    const targetIndex = Math.max(1, Number(rowIndex) || 1);
    const currentRow =
      variantRowsDraft[targetIndex] && !variantRowsDraft[targetIndex].isBase
        ? variantRowsDraft[targetIndex]
        : { isBase: false, value: '', homeLocation: 'none' };
    const existingKeys = new Set(
      variantRowsDraft
        .filter((row, index) => index !== targetIndex && row && !row.isBase)
        .map((row) => normalizeNamedIngredientVariant(row.value).toLowerCase())
        .filter(Boolean),
    );
    const pastedKeys = new Set();
    const nextRows = [];
    let skippedDuplicateCount = 0;
    let skippedReservedCount = 0;

    normalizedText
      .split('\n')
      .map((value) => String(value || '').trim())
      .forEach((value) => {
        if (!value) return;
        if (isReservedIngredientVariantName(value)) {
          skippedReservedCount += 1;
          return;
        }
        const normalizedValue = normalizeNamedIngredientVariant(value);
        if (!normalizedValue) {
          skippedReservedCount += 1;
          return;
        }
        const rowKey = normalizedValue.toLowerCase();
        if (existingKeys.has(rowKey) || pastedKeys.has(rowKey)) {
          skippedDuplicateCount += 1;
          return;
        }
        pastedKeys.add(rowKey);
        nextRows.push({
          isBase: false,
          value: normalizedValue,
          homeLocation:
            nextRows.length === 0
              ? normalizeShoppingHomeLocationId(
                  currentRow.homeLocation || 'none',
                )
              : 'none',
          tags: [],
          variantId: null,
          isDeprecated: false,
        });
      });

    if (!nextRows.length) {
      uiToast('No new variants to add.');
      return true;
    }

    if (
      variantRowsDraft[targetIndex] &&
      !variantRowsDraft[targetIndex].isBase
    ) {
      variantRowsDraft.splice(targetIndex, 1, ...nextRows);
    } else {
      variantRowsDraft.splice(targetIndex, 0, ...nextRows);
    }
    removeEmptyNamedVariantRows();
    syncVariantHiddenInput({ emit: true });
    renderVariantRows({
      focusCell: {
        rowIndex: targetIndex,
        column: 'variant',
        caretAtStart: true,
      },
    });

    const detailBits = [];
    if (skippedDuplicateCount > 0) {
      detailBits.push(
        `${skippedDuplicateCount} duplicate${skippedDuplicateCount === 1 ? '' : 's'} skipped`,
      );
    }
    if (skippedReservedCount > 0) {
      detailBits.push(
        `${skippedReservedCount} reserved name${skippedReservedCount === 1 ? '' : 's'} skipped`,
      );
    }
    uiToast(
      detailBits.length
        ? `Added ${nextRows.length} variant${nextRows.length === 1 ? '' : 's'}; ${detailBits.join(', ')}.`
        : `Added ${nextRows.length} variant${nextRows.length === 1 ? '' : 's'}.`,
    );
    return true;
  };

  const moveVariantRow = (rowIndex, delta) => {
    const currentIndex = Number(rowIndex);
    if (!Number.isFinite(currentIndex) || currentIndex <= 0) return false;
    const targetIndex = currentIndex + Number(delta || 0);
    if (targetIndex <= 0 || targetIndex >= variantRowsDraft.length)
      return false;
    const currentRow = variantRowsDraft[currentIndex];
    const targetRow = variantRowsDraft[targetIndex];
    if (!currentRow || currentRow.isBase || !targetRow || targetRow.isBase)
      return false;
    variantRowsDraft.splice(currentIndex, 1);
    variantRowsDraft.splice(targetIndex, 0, currentRow);
    syncVariantHiddenInput({ emit: true });
    return true;
  };

  /**
   * If the variant still appears in recipes and is not yet soft-removed: mark
   * deprecated. If it has no recipe refs: offer permanent delete (skips the
   * soft-remove step). Deprecated + still referenced: alert only.
   * @returns {Promise<boolean>} true if draft was mutated; false if cancelled.
   */
  const runCatalogVariantRemovalFlow = async (normalizedIndex) => {
    const row = variantRowsDraft[Number(normalizedIndex)];
    if (!row || row.isBase) return false;
    const variantName = normalizeNamedIngredientVariant(row.value);
    if (!variantName) return false;

    let db = window.dbInstance;
    if (!db) {
      try {
        const loaded = await loadDbForShoppingEditor();
        db = loaded.db;
      } catch (_) {
        return false;
      }
    }

    const idStr = sessionStorage.getItem('selectedShoppingItemId');
    const ingredientId = Number(idStr);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0) return false;

    let usage = null;
    if (
      window.dataService &&
      typeof window.dataService.loadShoppingItemVariantUsage === 'function'
    ) {
      try {
        usage = await window.dataService.loadShoppingItemVariantUsage({
          ingredientId,
          variantName,
        });
      } catch (err) {
        console.error('dataService.loadShoppingItemVariantUsage failed:', err);
      }
    }
    const recipes =
      usage && Array.isArray(usage.recipes)
        ? usage.recipes
        : getRecipesForIngredientVariant(db, ingredientId, variantName);
    const refCount = recipes.length;
    const aislePlacements =
      usage && Array.isArray(usage.aislePlacements)
        ? usage.aislePlacements
        : getAislePlacementsForIngredientVariant(
            db,
            ingredientId,
            variantName,
          );
    const aisleCount = aislePlacements.length;

    if (!row.isDeprecated && (refCount > 0 || aisleCount > 0)) {
      const recipeCountLabel =
        refCount === 1 ? '1 recipe' : `${refCount} recipes`;
      const aisleCountLabel =
        aisleCount === 1 ? '1 aisle' : `${aisleCount} aisles`;
      const summaryLine = `Remove "${variantName}" from the catalog? This variant appears in ${recipeCountLabel} and ${aisleCountLabel}.`;
      const closingNote =
        "Recipes and store aisles will remain unchanged. The variant will be marked removed, and can be deleted once it's no longer in use.";

      const details = createVariantUsageLedgerNode(recipes, aislePlacements);
      const note = document.createElement('div');
      note.className = 'shopping-remove-dialog-note';
      note.textContent = closingNote;
      details.appendChild(note);

      let ok = false;
      if (window.ui && typeof window.ui.dialog === 'function') {
        const res = await window.ui.dialog({
          title: 'Remove variant',
          message: summaryLine,
          messageNode: details,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
        ok = !!res;
      } else {
        ok = await uiConfirm({
          title: 'Remove variant',
          message: `${summaryLine}${formatVariantUsageLedgerPlainText(recipes, aislePlacements)}\n\n${closingNote}`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
      }
      if (!ok) return false;
      row.isDeprecated = true;
      syncVariantHiddenInput({ emit: true });
      renderVariantRows({
        focusCell: {
          rowIndex: Number(normalizedIndex),
          column: 'variant',
          caretAtStart: true,
        },
      });
      return true;
    }

    if (row.isDeprecated && (refCount > 0 || aisleCount > 0)) {
      const recipeCountLabel =
        refCount === 1 ? '1 recipe' : `${refCount} recipes`;
      const aisleCountLabel =
        aisleCount === 1 ? '1 aisle' : `${aisleCount} aisles`;
      const blockMessage = `Remove "${variantName}" from ${recipeCountLabel} and ${aisleCountLabel} before you can delete it permanently from the catalog.`;
      const ledger = createVariantUsageLedgerNode(recipes, aislePlacements);
      if (window.ui && typeof window.ui.alert === 'function') {
        await uiAlert('Cannot delete variant yet', blockMessage, {
          messageNode: ledger,
        });
      } else {
        await uiAlert(
          'Cannot delete variant yet',
          `${blockMessage}${formatVariantUsageLedgerPlainText(recipes, aislePlacements)}`,
        );
      }
      return false;
    }

    const hardOk = await uiConfirm({
      title: 'Delete variant permanently',
      message: `Permanently delete "${variantName}" from the database? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!hardOk) return false;
    variantRowsDraft.splice(normalizedIndex, 1);
    removeEmptyNamedVariantRows();
    syncVariantHiddenInput({ emit: true });
    renderVariantRows({
      focusCell: {
        rowIndex: Math.max(1, normalizedIndex - 1),
        column: 'variant',
        caretAtStart: true,
      },
    });
    return true;
  };

  const openVariantRowActions = async (rowIndex) => {
    const normalizedIndex = Number(rowIndex);
    const row = variantRowsDraft[normalizedIndex];
    if (!row || variantActionDialogOpen) return;
    variantActionDialogOpen = true;
    try {
      if (row.isBase) {
        if (
          normalizeShoppingHomeLocationId(row.homeLocation || 'none') === 'none'
        )
          return;
        const ok = await uiConfirm({
          title: 'Clear home location',
          message: `Clear the home location for Base item (${getCurrentItemNameForBaseRow()})?`,
          confirmText: 'Clear',
          cancelText: 'Cancel',
        });
        if (!ok) return;
        row.homeLocation = 'none';
        syncVariantHiddenInput({ emit: true });
        renderVariantRows({
          focusCell: { rowIndex: 0, column: 'home', caretAtStart: true },
        });
        return;
      }

      await runCatalogVariantRemovalFlow(normalizedIndex);
    } finally {
      variantActionDialogOpen = false;
    }
  };

  const handleVariantCellContextAction = (event, rowIndex) => {
    const isCtrlClick = !!(event && event.type === 'click' && event.ctrlKey);
    const isCtrlContextMenu = !!(
      event &&
      event.type === 'contextmenu' &&
      event.ctrlKey &&
      Number(event.button) === 0
    );
    if (!isCtrlClick && !isCtrlContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    void openVariantRowActions(rowIndex);
  };

  const applyPendingVariantCellFocus = () => {
    if (!variantRowsEl || !pendingVariantCellFocus) return;
    const { rowIndex, column, caretAtStart, openTypeahead } =
      pendingVariantCellFocus;
    pendingVariantCellFocus = null;
    requestAnimationFrame(() => {
      const selector =
        column === 'home'
          ? `.shopping-item-variant-home-input[data-row-index="${rowIndex}"]`
          : column === 'tags'
            ? `.shopping-item-variant-tags-input[data-row-index="${rowIndex}"]`
            : `.shopping-item-variant-name-input[data-row-index="${rowIndex}"]`;
      const target =
        variantRowsEl.querySelector(selector) ||
        variantRowsEl.querySelector(
          column === 'home'
            ? '.shopping-item-variant-home-input[data-row-index]'
            : column === 'tags'
              ? '.shopping-item-variant-tags-input[data-row-index]'
              : '.shopping-item-variant-name-input[data-row-index]',
        );
      if (!(target instanceof HTMLInputElement)) return;
      try {
        logVariantTagDebug('apply pending focus', {
          rowIndex,
          column,
          caretAtStart: !!caretAtStart,
          openTypeahead: !!openTypeahead,
          targetClassName: target.className,
          targetValue: target.value,
        });
        target.focus();
        const caretIndex = caretAtStart ? 0 : target.value.length;
        target.setSelectionRange(caretIndex, caretIndex);
        if (openTypeahead) {
          target.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'ArrowDown',
              bubbles: true,
            }),
          );
        }
      } catch (_) {}
    });
  };

  const renderVariantRows = ({ focusCell = null } = {}) => {
    if (!variantRowsEl) return;
    ensureBaseVariantRowPresent();
    if (
      activeVariantTagEditorState &&
      (!Number.isFinite(Number(activeVariantTagEditorState.rowIndex)) ||
        Number(activeVariantTagEditorState.rowIndex) < 0 ||
        Number(activeVariantTagEditorState.rowIndex) >= variantRowsDraft.length)
    ) {
      activeVariantTagEditorState = null;
    }
    if (focusCell && Number.isFinite(Number(focusCell.rowIndex))) {
      setPendingVariantCellFocus(
        focusCell.rowIndex,
        focusCell.column,
        focusCell,
      );
    }
    variantRowsEl.innerHTML = '';
    const gridEl = document.createElement('div');
    gridEl.className = 'shopping-item-variant-grid';

    const headerRowEl = document.createElement('div');
    headerRowEl.className =
      'shopping-item-variant-grid-row shopping-item-variant-grid-row--header';
    headerRowEl.setAttribute('aria-hidden', 'true');

    const nameHeaderEl = document.createElement('div');
    nameHeaderEl.className = 'shopping-item-variant-header-cell';
    nameHeaderEl.textContent = 'Name';

    const homeHeaderEl = document.createElement('div');
    homeHeaderEl.className = 'shopping-item-variant-header-cell';
    homeHeaderEl.textContent = 'Home location';

    const tagsHeaderEl = document.createElement('div');
    tagsHeaderEl.className = 'shopping-item-variant-header-cell';
    tagsHeaderEl.textContent = 'Tags';

    headerRowEl.appendChild(nameHeaderEl);
    headerRowEl.appendChild(homeHeaderEl);
    headerRowEl.appendChild(tagsHeaderEl);
    gridEl.appendChild(headerRowEl);

    variantRowsDraft.forEach((row, index) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'shopping-item-variant-grid-row';
      if (!row?.isBase && row?.isDeprecated) {
        rowEl.classList.add('shopping-item-variant-grid-row--variant-deprecated');
      }
      rowEl.dataset.rowIndex = String(index);

      const variantCell = document.createElement('div');
      variantCell.className = row?.isBase
        ? 'shopping-item-variant-cell shopping-item-variant-cell--base'
        : 'shopping-item-variant-cell shopping-item-variant-cell--variant';
      variantCell.dataset.rowIndex = String(index);
      variantCell.title = row?.isBase
        ? `${getCurrentItemNameForBaseRow()} (base)`
        : String(row?.value || '');
      variantCell.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.ctrlKey) return;
        if (activeVariantTagEditorState) {
          commitActiveVariantTagDraft({ clear: true });
        }
        const targetIndex = row?.isBase ? ensureNamedVariantRowAt(1) : index;
        renderVariantRows({
          focusCell: {
            rowIndex: targetIndex,
            column: 'variant',
            caretAtStart: true,
          },
        });
      });
      variantCell.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );

      if (row?.isBase) {
        const baseLabel = document.createElement('div');
        baseLabel.className = 'shopping-item-variant-base-label';
        const basePrefix = document.createElement('span');
        basePrefix.className = 'shopping-item-variant-base-prefix';
        basePrefix.textContent = getCurrentItemNameForBaseRow();
        const baseName = document.createElement('span');
        baseName.className = 'shopping-item-variant-base-name';
        baseName.textContent = '(base)';
        baseLabel.appendChild(basePrefix);
        baseLabel.appendChild(baseName);
        variantCell.appendChild(baseLabel);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'shopping-item-variant-name-input';
        input.dataset.rowIndex = String(index);
        input.dataset.committedValue = String(row?.value || '');
        input.placeholder = '';
        input.value = String(row?.value || '');
        input.setAttribute(
          'aria-label',
          String(row?.value || '').trim()
            ? `Variant ${index}`
            : `Variant row ${index}`,
        );
        input.addEventListener('input', () => {
          if (!variantRowsEl || !variantRowsEl.contains(input)) return;
          if (!variantRowsDraft[index] || variantRowsDraft[index].isBase) return;
          variantRowsDraft[index].value = input.value;
          syncVariantHiddenInput({ emit: true });
          input.title = input.value;
        });
        input.addEventListener('paste', (event) => {
          const clipboard = event.clipboardData || window.clipboardData;
          const pastedText =
            clipboard?.getData?.('text/plain') ||
            clipboard?.getData?.('Text') ||
            '';
          if (!String(pastedText || '').match(/[\r\n]/)) return;
          event.preventDefault();
          event.stopPropagation();
          insertPastedVariantRowsAt(index, pastedText);
        });
        input.addEventListener('keydown', (event) => {
          if (event.metaKey && !event.ctrlKey && !event.altKey) {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              event.stopPropagation();
              const moved = moveVariantRow(
                index,
                event.key === 'ArrowDown' ? 1 : -1,
              );
              if (moved) {
                renderVariantRows({
                  focusCell: {
                    rowIndex: Math.max(
                      1,
                      index + (event.key === 'ArrowDown' ? 1 : -1),
                    ),
                    column: 'variant',
                    caretAtStart: true,
                  },
                });
              }
              return;
            }
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
              const targetIndex = ensureNamedVariantRowAt(index + 1);
              renderVariantRows({
                focusCell: {
                  rowIndex: targetIndex,
                  column: 'variant',
                  caretAtStart: true,
                },
              });
              return;
            }
            input.blur();
            return;
          }
          if (
            event.key === 'Backspace' &&
            String(input.value || '').trim() === ''
          ) {
            const prevC = String(input.dataset.committedValue || '').trim();
            if (!prevC) {
              event.preventDefault();
              event.stopPropagation();
              variantRowsDraft.splice(index, 1);
              removeEmptyNamedVariantRows();
              syncVariantHiddenInput({ emit: true });
              renderVariantRows({
                focusCell: {
                  rowIndex: Math.max(1, index - 1),
                  column: 'variant',
                  caretAtStart: true,
                },
              });
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            void (async () => {
              const ok = await runCatalogVariantRemovalFlow(index);
              if (!ok) {
                input.value = prevC;
                if (variantRowsDraft[index]) {
                  variantRowsDraft[index].value = prevC;
                }
                syncVariantHiddenInput({ emit: true });
                renderVariantRows({
                  focusCell: {
                    rowIndex: index,
                    column: 'variant',
                    caretAtStart: true,
                  },
                });
              }
            })();
          }
        });
        input.addEventListener('blur', () => {
          if (!variantRowsEl || !variantRowsEl.contains(input)) return;
          if (!variantRowsDraft[index] || variantRowsDraft[index].isBase) return;
          const previousCommittedValue = String(
            input.dataset.committedValue || '',
          ).trim();
          const normalizedValue = normalizeNamedIngredientVariant(input.value);
          if (!normalizedValue) {
            if (!previousCommittedValue) {
              variantRowsDraft.splice(index, 1);
              removeEmptyNamedVariantRows();
              syncVariantHiddenInput({ emit: true });
              renderVariantRows();
              return;
            }
            void (async () => {
              const ok = await runCatalogVariantRemovalFlow(index);
              if (!ok) {
                input.value = previousCommittedValue;
                if (variantRowsDraft[index]) {
                  variantRowsDraft[index].value = previousCommittedValue;
                }
                syncVariantHiddenInput({ emit: true });
                renderVariantRows({
                  focusCell: {
                    rowIndex: index,
                    column: 'variant',
                    caretAtStart: true,
                  },
                });
              }
            })();
            return;
          }
          const duplicateIndex = variantRowsDraft.findIndex(
            (entry, entryIndex) =>
              entryIndex !== index &&
              entry &&
              !entry.isBase &&
              normalizeNamedIngredientVariant(entry.value).toLowerCase() ===
                normalizedValue.toLowerCase(),
          );
          if (duplicateIndex !== -1) {
            uiToast('That variant already exists.');
            if (!previousCommittedValue) {
              variantRowsDraft.splice(index, 1);
              removeEmptyNamedVariantRows();
              syncVariantHiddenInput({ emit: true });
              renderVariantRows({
                focusCell: {
                  rowIndex: duplicateIndex,
                  column: 'variant',
                  caretAtStart: true,
                },
              });
              return;
            }
            variantRowsDraft[index].value = previousCommittedValue;
            syncVariantHiddenInput({ emit: true });
            renderVariantRows({
              focusCell: {
                rowIndex: index,
                column: 'variant',
                caretAtStart: true,
              },
            });
            return;
          }
          variantRowsDraft[index].value = normalizedValue;
          const pendingDeprecated = !!variantRowsDraft[index].isDeprecated;
          const committedKey = normalizeNamedIngredientVariant(
            previousCommittedValue,
          ).toLowerCase();
          const nextKey = normalizedValue.toLowerCase();
          const valueUnchangedForDeprecation =
            committedKey.length > 0 && committedKey === nextKey;
          void (async () => {
            const fromDbDeprecated =
              await ingredientScopedVariantIsDeprecatedViaDataService({
                db: window.dbInstance || null,
                ingredientName: getCurrentItemNameForBaseRow(),
                variantText: normalizedValue,
              });
            if (!variantRowsDraft[index]) return;
            // DB lags until save after "Remove variant"; keep draft flag on blur.
            variantRowsDraft[index].isDeprecated =
              fromDbDeprecated ||
              (valueUnchangedForDeprecation && pendingDeprecated);
            input.value = normalizedValue;
            input.dataset.committedValue = normalizedValue;
            input.title = normalizedValue;
            syncVariantHiddenInput({ emit: true });
            renderVariantRows();
          })();
        });
        input.addEventListener('click', (event) => {
          if (event.ctrlKey) return;
          event.stopPropagation();
        });
        input.addEventListener('contextmenu', (event) =>
          handleVariantCellContextAction(event, index),
        );
        input.addEventListener('click', (event) =>
          handleVariantCellContextAction(event, index),
        );
        variantCell.appendChild(input);
      }

      const homeCell = document.createElement('div');
      homeCell.className =
        'shopping-item-variant-cell shopping-item-variant-cell--home';
      homeCell.dataset.rowIndex = String(index);
      homeCell.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.ctrlKey) return;
        if (activeVariantTagEditorState) {
          commitActiveVariantTagDraft({ clear: true });
        }
        renderVariantRows({
          focusCell: {
            rowIndex: index,
            column: 'home',
            caretAtStart: true,
            openTypeahead: true,
          },
        });
      });
      homeCell.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );

      const homeInput = document.createElement('input');
      homeInput.type = 'text';
      homeInput.className = 'shopping-item-variant-home-input';
      homeInput.dataset.rowIndex = String(index);
      homeInput.dataset.committedValue = getHomeLocationDisplayText(
        row?.homeLocation || 'none',
      );
      homeInput.value = getHomeLocationDisplayText(row?.homeLocation || 'none');
      homeInput.placeholder = '';
      homeInput.title = homeInput.value;
      homeInput.setAttribute(
        'aria-label',
        row?.isBase
          ? `Home location for Base item`
          : `Home location for ${normalizeNamedIngredientVariant(row?.value) || 'variant'}`,
      );
      if (
        window.favoriteEatsTypeahead &&
        typeof window.favoriteEatsTypeahead.attach === 'function'
      ) {
        window.favoriteEatsTypeahead.attach({
          inputEl: homeInput,
          getPool: async () =>
            homeLocationDefsForEditor.map((entry) =>
              String(entry.label || entry.id),
            ),
          getItems: (pool, query) => {
            const normalizedQuery = String(query || '')
              .trim()
              .toLowerCase();
            const items = (Array.isArray(pool) ? pool : [])
              .map((value) => String(value || '').trim())
              .filter(Boolean);
            if (!normalizedQuery) return items;
            return items.filter((value) =>
              value.toLowerCase().includes(normalizedQuery),
            );
          },
          openOnFocus: true,
          pickOnEnterWhenQueryEmpty: false,
          minWidth: 220,
          maxWidth: 360,
        });
      }
      homeInput.addEventListener('input', () => {
        homeInput.title = homeInput.value;
        const liveMatch = resolveHomeLocationIdFromInput(homeInput.value);
        if (!liveMatch) return;
        variantRowsDraft[index].homeLocation = liveMatch;
        syncVariantHiddenInput({ emit: true });
      });
      homeInput.addEventListener('keydown', (event) => {
        if (event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            const moved = moveVariantRow(
              index,
              event.key === 'ArrowDown' ? 1 : -1,
            );
            if (moved) {
              renderVariantRows({
                focusCell: {
                  rowIndex: Math.max(
                    1,
                    index + (event.key === 'ArrowDown' ? 1 : -1),
                  ),
                  column: 'home',
                  caretAtStart: true,
                  openTypeahead: true,
                },
              });
            }
            return;
          }
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          const nextIndex = index + 1;
          if (nextIndex < variantRowsDraft.length) {
            renderVariantRows({
              focusCell: {
                rowIndex: nextIndex,
                column: 'home',
                caretAtStart: true,
                openTypeahead: true,
              },
            });
            return;
          }
        }
        window.setTimeout(() => {
          try {
            homeInput.blur();
          } catch (_) {}
        }, 0);
      });
      homeInput.addEventListener('blur', () => {
        const rawValue = String(homeInput.value || '').trim();
        const normalizedHomeLocation = resolveHomeLocationIdFromInput(rawValue);
        if (!rawValue) {
          variantRowsDraft[index].homeLocation = 'none';
          homeInput.value = '';
          homeInput.dataset.committedValue = '';
          homeInput.title = '';
          syncVariantHiddenInput({ emit: true });
          return;
        }
        if (!normalizedHomeLocation) {
          uiToast('Choose a known home location.');
          homeInput.value = String(homeInput.dataset.committedValue || '');
          homeInput.title = homeInput.value;
          return;
        }
        variantRowsDraft[index].homeLocation = normalizedHomeLocation;
        homeInput.value = getHomeLocationDisplayText(normalizedHomeLocation);
        homeInput.dataset.committedValue = homeInput.value;
        homeInput.title = homeInput.value;
        syncVariantHiddenInput({ emit: true });
      });
      homeInput.addEventListener('click', (event) => {
        if (event.ctrlKey) return;
        event.stopPropagation();
      });
      homeInput.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );
      homeInput.addEventListener('click', (event) =>
        handleVariantCellContextAction(event, index),
      );
      homeCell.appendChild(homeInput);

      const tagsCell = document.createElement('div');
      tagsCell.className =
        'shopping-item-variant-cell shopping-item-variant-cell--tags';
      tagsCell.dataset.rowIndex = String(index);
      const committedTags = normalizeRecipeTagList(row?.tags || []);
      variantRowsDraft[index].tags = committedTags;
      const tagsEditorState =
        Number(activeVariantTagEditorState?.rowIndex) === index
          ? activeVariantTagEditorState
          : null;
      const isEditingTags = !!tagsEditorState;
      const activeInsertAfterTagIndex = Number.isFinite(
        Number(tagsEditorState?.insertAfterTagIndex),
      )
        ? Math.trunc(Number(tagsEditorState?.insertAfterTagIndex))
        : committedTags.length - 1;
      const inputInsertBeforeIndex = isEditingTags
        ? Math.max(
            0,
            Math.min(committedTags.length, activeInsertAfterTagIndex + 1),
          )
        : -1;
      const tagsControl = document.createElement('div');
      tagsControl.className = isEditingTags
        ? 'shopping-item-variant-tags-control is-editing'
        : 'shopping-item-variant-tags-control';

      const tagsInput = document.createElement('input');
      tagsInput.type = 'text';
      tagsInput.className = 'shopping-item-variant-tags-input';
      tagsInput.dataset.rowIndex = String(index);
      const tagsInputSlot = document.createElement('span');
      tagsInputSlot.className = 'shopping-item-variant-tags-slot';
      tagsInputSlot.appendChild(tagsInput);
      tagsInput.value =
        isEditingTags && typeof tagsEditorState?.draft === 'string'
          ? tagsEditorState.draft
          : '';
      const syncVariantTagsInputLayout = () => {
        const draftValue = String(tagsInput.value || '');
        tagsInput.size = Math.max(1, draftValue.length || 1);
        tagsInputSlot.classList.toggle('is-empty', draftValue.length === 0);
      };
      syncVariantTagsInputLayout();
      tagsInput.placeholder = '';
      tagsInput.setAttribute(
        'aria-label',
        row?.isBase
          ? `Tags for Base item`
          : `Tags for ${normalizeNamedIngredientVariant(row?.value) || 'variant'}`,
      );
      if (
        window.favoriteEatsTypeahead &&
        typeof window.favoriteEatsTypeahead.attach === 'function'
      ) {
        window.favoriteEatsTypeahead.attach({
          inputEl: tagsInput,
          getPool: async () =>
            await getVisibleIngredientTagNamePool(window.dbInstance || null),
          openOnFocus: true,
          pickOnEnterWhenQueryEmpty: false,
          minWidth: 220,
          maxWidth: 380,
          onPick: (pickedValue, inputEl) => {
            const inserted = insertVariantTagToRow(
              index,
              pickedValue,
              activeInsertAfterTagIndex,
            );
            inputEl.value = '';
            syncVariantTagsInputLayout();
            if (!inserted) return;
            setActiveVariantTagEditorState(index, '', {
              insertAfterTagIndex: activeInsertAfterTagIndex + 1,
            });
            rerenderVariantTagsEditorWithFocus(index, {
              suppressBlurCleanup: true,
              reason: 'typeahead-pick',
            });
          },
        });
      }
      tagsInput.addEventListener('input', () => {
        const currentInsertAfterTagIndex =
          Number(activeVariantTagEditorState?.rowIndex) === index &&
          Number.isFinite(
            Number(activeVariantTagEditorState?.insertAfterTagIndex),
          )
            ? Math.trunc(
                Number(activeVariantTagEditorState.insertAfterTagIndex),
              )
            : activeInsertAfterTagIndex;
        setActiveVariantTagEditorState(index, tagsInput.value || '', {
          insertAfterTagIndex: currentInsertAfterTagIndex,
        });
        syncVariantTagsInputLayout();
        refreshVariantEditorDirty();
      });
      tagsInput.addEventListener('keydown', (event) => {
        const getCurrentInsertAfterTagIndex = () =>
          Number(activeVariantTagEditorState?.rowIndex) === index &&
          Number.isFinite(
            Number(activeVariantTagEditorState?.insertAfterTagIndex),
          )
            ? Math.trunc(
                Number(activeVariantTagEditorState.insertAfterTagIndex),
              )
            : activeInsertAfterTagIndex;

        const tryMoveVariantTagInsertSlot = (direction) => {
          if (direction !== -1 && direction !== 1) return false;
          if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
            return false;
          if (String(tagsInput.value || '') !== '') return false;
          const existingTags = normalizeRecipeTagList(
            variantRowsDraft[index].tags || [],
          );
          if (existingTags.length === 0) return false;

          event.preventDefault();
          event.stopPropagation();

          const currentInsertAfterTagIndex = getCurrentInsertAfterTagIndex();
          const nextInsertAfterTagIndex = Math.max(
            -1,
            Math.min(
              existingTags.length - 1,
              currentInsertAfterTagIndex + direction,
            ),
          );
          if (nextInsertAfterTagIndex === currentInsertAfterTagIndex) {
            logVariantTagDebug('slot move no-op at boundary', {
              rowIndex: index,
              key: event.key,
              insertAfterTagIndex: currentInsertAfterTagIndex,
            });
            return true;
          }

          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: nextInsertAfterTagIndex,
          });
          logVariantTagDebug('slot move via arrow key', {
            rowIndex: index,
            key: event.key,
            insertAfterTagIndex: currentInsertAfterTagIndex,
            nextInsertAfterTagIndex,
          });
          rerenderVariantTagsEditorWithFocus(index, {
            suppressBlurCleanup: true,
            reason: direction < 0 ? 'slot-move:left' : 'slot-move:right',
          });
          return true;
        };

        const commitTagsDraftInlineAndStay = () => {
          const draftText = String(tagsInput.value || '').trim();
          if (!draftText) {
            logVariantTagDebug('skip inline commit: empty draft', {
              rowIndex: index,
              key: event.key,
              shiftKey: !!event.shiftKey,
              insertAfterTagIndex: activeInsertAfterTagIndex,
            });
            return false;
          }
          event.preventDefault();
          event.stopPropagation();
          const pickedSuggestion =
            !!window.favoriteEatsTypeahead &&
            typeof window.favoriteEatsTypeahead
              .pickHighlightedIfOpenForInput === 'function' &&
            window.favoriteEatsTypeahead.pickHighlightedIfOpenForInput(
              tagsInput,
            );
          if (pickedSuggestion) {
            logVariantTagDebug('inline commit resolved via typeahead pick', {
              rowIndex: index,
              key: event.key,
              draftText,
              insertAfterTagIndex: activeInsertAfterTagIndex,
            });
            return true;
          }
          const changed = insertVariantTagToRow(
            index,
            draftText,
            activeInsertAfterTagIndex,
          );
          tagsInput.value = '';
          syncVariantTagsInputLayout();
          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: activeInsertAfterTagIndex + 1,
          });
          logVariantTagDebug('inline commit attempted', {
            rowIndex: index,
            key: event.key,
            draftText,
            changed,
            insertAfterTagIndex: activeInsertAfterTagIndex,
            nextInsertAfterTagIndex: activeInsertAfterTagIndex + 1,
          });
          if (changed) {
            rerenderVariantTagsEditorWithFocus(index, {
              suppressBlurCleanup: true,
              reason: `inline-commit:${String(event.key || '').toLowerCase() || 'unknown'}`,
            });
          }
          return true;
        };

        logVariantTagDebug('keydown', {
          rowIndex: index,
          key: event.key,
          shiftKey: !!event.shiftKey,
          ctrlKey: !!event.ctrlKey,
          metaKey: !!event.metaKey,
          altKey: !!event.altKey,
          draftText: String(tagsInput.value || ''),
          activeInsertAfterTagIndex,
          defaultPrevented: !!event.defaultPrevented,
        });

        if (event.key === 'ArrowLeft') {
          if (tryMoveVariantTagInsertSlot(-1)) return;
        }
        if (event.key === 'ArrowRight') {
          if (tryMoveVariantTagInsertSlot(1)) return;
        }

        if (event.key === 'Tab' && !event.shiftKey) {
          if (!String(tagsInput.value || '').trim()) {
            logVariantTagDebug('allow native Tab: empty draft', {
              rowIndex: index,
              activeInsertAfterTagIndex,
            });
            return;
          }
          commitTagsDraftInlineAndStay();
          return;
        }
        if (event.key === 'Enter' && event.shiftKey) {
          if (!String(tagsInput.value || '').trim()) {
            event.preventDefault();
            event.stopPropagation();
            logVariantTagDebug('Shift+Enter scheduling blur: empty draft', {
              rowIndex: index,
              activeInsertAfterTagIndex,
            });
            window.setTimeout(() => {
              try {
                tagsInput.blur();
              } catch (_) {}
            }, 0);
            return;
          }
          commitTagsDraftInlineAndStay();
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          if (
            window.favoriteEatsTypeahead &&
            typeof window.favoriteEatsTypeahead.tryPickEnterForInput ===
              'function' &&
            window.favoriteEatsTypeahead.tryPickEnterForInput(tagsInput)
          ) {
            event.preventDefault();
            event.stopPropagation();
            logVariantTagDebug('plain Enter picked highlighted suggestion', {
              rowIndex: index,
              draftText: String(tagsInput.value || ''),
            });
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          logVariantTagDebug('plain Enter scheduling blur', {
            rowIndex: index,
            draftText: String(tagsInput.value || ''),
            activeInsertAfterTagIndex,
          });
          window.setTimeout(() => {
            try {
              tagsInput.blur();
            } catch (_) {}
          }, 0);
          return;
        }
        if (event.key === ',') {
          event.preventDefault();
          event.stopPropagation();
          const changed = insertVariantTagToRow(
            index,
            tagsInput.value || '',
            activeInsertAfterTagIndex,
          );
          tagsInput.value = '';
          syncVariantTagsInputLayout();
          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: activeInsertAfterTagIndex + 1,
          });
          if (changed) {
            rerenderVariantTagsEditorWithFocus(index, {
              suppressBlurCleanup: true,
              reason: 'inline-commit:comma',
            });
          }
          return;
        }
        if (
          event.key === 'Backspace' &&
          String(tagsInput.value || '').trim() === ''
        ) {
          const existingTags = normalizeRecipeTagList(
            variantRowsDraft[index].tags || [],
          );
          const previousTagIndex = Math.min(
            existingTags.length - 1,
            activeInsertAfterTagIndex,
          );
          if (previousTagIndex < 0) return;
          event.preventDefault();
          event.stopPropagation();
          variantRowsDraft[index].tags = normalizeRecipeTagList(
            existingTags.filter((_, tagIndex) => tagIndex !== previousTagIndex),
          );
          syncVariantHiddenInput({ emit: true });
          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: previousTagIndex - 1,
          });
          rerenderVariantTagsEditorWithFocus(index, {
            suppressBlurCleanup: true,
            reason: 'backspace-remove-previous-tag',
          });
        }
      });
      tagsInput.addEventListener('blur', () => {
        logVariantTagDebug('tags input blur', {
          rowIndex: index,
          draftText: String(tagsInput.value || ''),
          activeElementClassName:
            document.activeElement instanceof HTMLElement
              ? document.activeElement.className
              : '',
          pendingVariantCellFocus,
          pendingVariantTagPillInteraction,
        });
        window.setTimeout(() => {
          if (pendingVariantTagPillInteraction) {
            logVariantTagDebug(
              'blur deferred for pending tag-pill interaction',
              {
                rowIndex: index,
                pendingVariantTagPillInteraction,
              },
            );
            if (pendingVariantTagPillInteraction.rowIndex === index) return;
            commitActiveVariantTagDraft({ clear: true });
            return;
          }
          if (pendingVariantTagBlurCleanupSuppression?.rowIndex === index) {
            logVariantTagDebug(
              'skip blur cleanup due to intentional tags refocus',
              {
                rowIndex: index,
                reason: pendingVariantTagBlurCleanupSuppression.reason,
              },
            );
            pendingVariantTagBlurCleanupSuppression = null;
            return;
          }
          if (tagsCell.contains(document.activeElement)) {
            logVariantTagDebug('blur ignored: focus stayed inside tags cell', {
              rowIndex: index,
              activeElementClassName:
                document.activeElement instanceof HTMLElement
                  ? document.activeElement.className
                  : '',
            });
            return;
          }
          logVariantTagDebug(
            'blur committing active draft and maybe rerendering',
            {
              rowIndex: index,
              draftText: String(tagsInput.value || ''),
            },
          );
          commitActiveVariantTagDraft({ clear: true });
          if (pendingVariantCellFocus) {
            logVariantTagDebug(
              'skip rerender after blur: pending focus exists',
              {
                rowIndex: index,
                pendingVariantCellFocus,
              },
            );
            return;
          }
          logVariantTagDebug('rerender rows after blur', { rowIndex: index });
          renderVariantRows();
        }, 0);
      });
      tagsInput.addEventListener('click', (event) => {
        if (event.ctrlKey) return;
        event.stopPropagation();
      });
      tagsInput.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );
      tagsCell.addEventListener('mousedown', (event) => {
        if (event.target === tagsInput) return;
        if (event.ctrlKey || event.metaKey || Number(event.button) !== 0)
          return;
        event.preventDefault();
      });

      const focusTagsInputInCurrentRow = () => {
        try {
          tagsInput.focus();
          const caretIndex = tagsInput.value.length;
          tagsInput.setSelectionRange(caretIndex, caretIndex);
        } catch (_) {}
      };

      const tagPills = [];
      const renderTagsInput = () => {
        tagsControl.appendChild(tagsInputSlot);
      };

      committedTags.forEach((tag, tagIndex) => {
        if (isEditingTags && tagIndex === inputInsertBeforeIndex) {
          renderTagsInput();
        }
        const pill = document.createElement('span');
        pill.className = 'recipe-tag-pill shopping-item-variant-tag-pill';
        pill.textContent = tag;
        pill.title = 'Ctrl-click to remove';
        const removeTag = () => {
          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: tagIndex - 1,
          });
          variantRowsDraft[index].tags = normalizeRecipeTagList(
            committedTags.filter(
              (value) =>
                String(value || '').toLowerCase() !==
                String(tag || '').toLowerCase(),
            ),
          );
          syncVariantHiddenInput({ emit: true });
          rerenderVariantTagsEditorWithFocus(index, {
            suppressBlurCleanup:
              Number(activeVariantTagEditorState?.rowIndex) === index,
            reason: 'remove-tag',
          });
        };
        pill.addEventListener('mousedown', (event) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          beginVariantTagPillInteraction(index);
        });
        const handleTagPillModifierAction = async (event) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          const interaction =
            pendingVariantTagPillInteraction?.rowIndex === index
              ? pendingVariantTagPillInteraction
              : beginVariantTagPillInteraction(index);
          if (interaction.handled) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          interaction.handled = true;
          event.preventDefault();
          event.stopPropagation();
          const ok = await confirmShoppingVariantTagRemoval(tag);
          if (pendingVariantTagPillInteraction === interaction) {
            pendingVariantTagPillInteraction = null;
          }
          if (!ok) {
            if (interaction.previousActiveRowIndex === index) {
              focusTagsInputInCurrentRow();
            } else if (interaction.previousActiveRowIndex >= 0) {
              setActiveVariantTagEditorState(index, '', {
                insertAfterTagIndex: tagIndex - 1,
              });
              rerenderVariantTagsEditorWithFocus(index, {
                reason: 'cancel-remove-refocus',
              });
            }
            return;
          }
          removeTag();
        };
        pill.addEventListener('click', (event) => {
          if (event.ctrlKey || event.metaKey) {
            void handleTagPillModifierAction(event);
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (
            activeVariantTagEditorState &&
            Number(activeVariantTagEditorState.rowIndex) !== index
          ) {
            commitActiveVariantTagDraft({ clear: true });
          }
          const rect = pill.getBoundingClientRect();
          const midpoint = rect.left + rect.width / 2;
          const insertAfterTagIndex =
            typeof event.clientX === 'number' && event.clientX < midpoint
              ? tagIndex - 1
              : tagIndex;
          setActiveVariantTagEditorState(
            index,
            Number(activeVariantTagEditorState?.rowIndex) === index
              ? String(activeVariantTagEditorState?.draft || '')
              : '',
            { insertAfterTagIndex },
          );
          rerenderVariantTagsEditorWithFocus(index, {
            suppressBlurCleanup:
              Number(activeVariantTagEditorState?.rowIndex) === index,
            reason: 'pill-click-reposition',
          });
        });
        pill.addEventListener('contextmenu', handleTagPillModifierAction);
        tagPills.push(pill);
        tagsControl.appendChild(pill);
      });
      if (isEditingTags && inputInsertBeforeIndex >= committedTags.length) {
        renderTagsInput();
      }
      tagsCell.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
        if (
          activeVariantTagEditorState &&
          Number(activeVariantTagEditorState.rowIndex) !== index
        ) {
          commitActiveVariantTagDraft({ clear: true });
        }
        setActiveVariantTagEditorState(
          index,
          Number(activeVariantTagEditorState?.rowIndex) === index
            ? String(activeVariantTagEditorState?.draft || '')
            : '',
          {
            insertAfterTagIndex: getVariantTagInsertAfterIndexForPoint(
              tagPills,
              event.clientX,
              event.clientY,
            ),
          },
        );
        rerenderVariantTagsEditorWithFocus(index, {
          suppressBlurCleanup:
            Number(activeVariantTagEditorState?.rowIndex) === index,
          reason: 'tags-cell-click',
        });
      });
      tagsCell.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );
      tagsCell.appendChild(tagsControl);

      rowEl.appendChild(variantCell);
      rowEl.appendChild(homeCell);
      rowEl.appendChild(tagsCell);
      gridEl.appendChild(rowEl);
    });

    variantRowsEl.appendChild(gridEl);
    applyPendingVariantCellFocus();
  };
  const rerenderVariantTagsEditorWithFocus = (
    rowIndex,
    { suppressBlurCleanup = false, reason = '' } = {},
  ) => {
    if (suppressBlurCleanup) {
      suppressNextVariantTagBlurCleanup(rowIndex, reason);
    }
    renderVariantRows({
      focusCell: {
        rowIndex,
        column: 'tags',
        caretAtStart: false,
        openTypeahead: true,
      },
    });
  };

  const setVariantRowsFromSerialized = (rawValue) => {
    activeVariantTagEditorState = null;
    variantRowsDraft = getVariantRowsForEditing(
      parseIngredientVariantRowsSerialized(rawValue),
    );
    syncVariantHiddenInput({ emit: false });
    renderVariantRows();
  };

  if (editorTitleEl) {
    editorTitleEl.addEventListener('input', () => {
      renderVariantRows();
    });
    editorTitleEl.addEventListener(
      'blur',
      () => {
        renderVariantRows();
      },
      true,
    );
  }

  attachEditorTextareaAutoGrow(
    document.getElementById('shoppingItemSynonymsTextarea'),
  );
  attachEditorTextareaAutoGrow(
    document.getElementById('shoppingItemSizesTextarea'),
  );
  attachEditorNewlineListPaste(
    document.getElementById('shoppingItemSynonymsTextarea'),
  );
  attachEditorNewlineListPaste(
    document.getElementById('shoppingItemSizesTextarea'),
  );

  const loadDbForShoppingEditor = async () => {
    const isElectron = !!window.electronAPI;
    let db;

    if (isElectron) {
      try {
        const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
        const bytes = await window.electronAPI.loadDB(pathHint);
        const Uints = new Uint8Array(bytes);
        db = new SQL.Database(Uints);
      } catch (err) {
        console.error(
          '❌ Failed to load DB from disk for shopping editor:',
          err,
        );
        uiToast('No database loaded. Please go back to the welcome page.');
        throw err;
      }
    } else {
      db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
    }

    window.dbInstance = db;
    if (
      window.dataService &&
      typeof window.dataService.setSqliteDb === 'function'
    ) {
      window.dataService.setSqliteDb(db);
      try {
        if (favoriteEatsShouldUseSupabaseDataDoor()) {
          window.dataService.useSupabase = true;
          console.info(
            '[dataService] using Supabase adapter',
          );
        }
      } catch (_) {}
    }
    await ensureIngredientLemmaMaintenanceInMain(db, isElectron);
    ensureIngredientVariantTagsSchemaInMain(db);
    return { db, isElectron };
  };

  const persistShoppingItem = async ({
    title: next,
    baselineTitle,
    extraValues,
  }) => {
    if (!next) return;

    const { db, isElectron } = await loadDbForShoppingEditor();

    let baseName = '';
    let variants = [];
    let snapshotPrevNamedForShoppingMigration = null;
    let snapshotPrevNamedRowsForShoppingMigration = null;
    let snapshotNextNamedRowsForShoppingMigration = null;
    let migrationVariantTableActive = false;
    // Captured after a successful COMMIT so the post-save draft refresh can
    // re-query the DB and rewrite `variantRowsDraft` with the new variantIds
    // (the ingredient_variants rows are recreated on each save).
    let savedIngredientIdForDraftRefresh = null;

    try {
      const idStr = sessionStorage.getItem('selectedShoppingItemId');
      const id = Number(idStr);
      const variantRowsText =
        (extraValues && extraValues.variant_rows) ||
        (extraValues && extraValues.variants) ||
        '';
      const sizesText = (extraValues && extraValues.sizes) || '';
      const synonymsText = (extraValues && extraValues.synonyms) || '';
      const home = (extraValues && extraValues.home) || '';
      const normalizedVariantRows = parseIngredientVariantRowsSerialized(
        variantRowsText,
        {
          fallbackBaseHome: home,
        },
      );
      const namedVariantRows = getNamedVariantRowsFromDraft(
        normalizedVariantRows,
      );
      snapshotNextNamedRowsForShoppingMigration = namedVariantRows;
      const normalizedBaseHomeLocation = normalizeShoppingHomeLocationId(
        normalizedVariantRows.find((row) => row?.isBase)?.homeLocation ||
          home ||
          'none',
      );
      const isFoodRaw = (extraValues && extraValues.is_food) || '';
      const isDeprecatedRaw = (extraValues && extraValues.is_deprecated) || '';
      const isHiddenRaw = (extraValues && extraValues.is_hidden) || '';
      const pluralOverride = (extraValues && extraValues.plural_override) || '';
      const pluralByDefaultRaw =
        (extraValues && extraValues.plural_by_default) || '';
      const isMassNounRaw = (extraValues && extraValues.is_mass_noun) || '';

      const isFood = isFoodRaw === '1' ? 1 : 0;
      const isDeprecated = isDeprecatedRaw === '1' ? 1 : 0;
      const isHidden = isHiddenRaw === '1' ? 1 : 0;
      const pluralByDefault = pluralByDefaultRaw === '1' ? 1 : 0;
      const isMassNoun = isMassNounRaw === '1' ? 1 : 0;

      const parseList = (raw) => {
        const lines = String(raw || '')
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const out = [];
        const seen = new Set();
        lines.forEach((s) => {
          const key = s.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          out.push(s);
        });
        return out;
      };

      variants = namedVariantRows.map((row) => row.value);
      const reservedVariantNames = variants.filter((value) =>
        isReservedIngredientVariantName(value),
      );
      if (reservedVariantNames.length > 0) {
        uiToast('Variant names can’t be "default", "base", or "any".');
        const err = new Error('reserved shopping item variant name');
        err.silent = true;
        throw err;
      }
      const sizes = parseList(sizesText);
      const synonyms = parseList(synonymsText);

      // Legacy fallback values are only used when list tables are unavailable.
      // When `ingredient_variants`/`ingredient_sizes` exist, those tables are
      // the source of truth.
      const variant0 = variants[0] || '';
      const size0 = sizes[0] || '';

      let cols = [];
      try {
        const info = db.exec('PRAGMA table_info(ingredients);');
        const rows = info.length ? info[0].values : [];
        cols = rows.map((r) => String(r[1] || '').toLowerCase());
      } catch (_) {
        cols = [];
      }
      const has = (c) => cols.includes(String(c).toLowerCase());

      const lemmaToWrite = has('lemma')
        ? deriveIngredientLemmaInMain(next)
        : '';

      const tableExists = (name) => {
        try {
          const q = db.exec(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`,
            [name],
          );
          return !!(q.length && q[0].values && q[0].values.length);
        } catch (_) {
          return false;
        }
      };
      const hasVariantTable = tableExists('ingredient_variants');
      migrationVariantTableActive = hasVariantTable;
      const hasVariantHomeLocationCol =
        hasVariantTable &&
        tableHasColumnInMain(db, 'ingredient_variants', 'home_location');
      const hasVariantIsDeprecatedCol =
        hasVariantTable &&
        tableHasColumnInMain(db, 'ingredient_variants', 'is_deprecated');
      ensureIngredientVariantTagsSchemaInMain(db);
      const hasSizeTable = tableExists('ingredient_sizes');
      const hasSynonymsTable = tableExists('ingredient_synonyms');
      const hasStoreLocationTable = tableExists('ingredient_store_location');
      const hasVariantAisleTable = tableExists(
        'ingredient_variant_store_location',
      );
      const hasRecipeIngredientMapTable = tableExists('recipe_ingredient_map');
      const hasRecipeIngredientSubstitutesTable = tableExists(
        'recipe_ingredient_substitutes',
      );
      const useLegacySingleRowSave = (() => {
        try {
          return (
            String(
              localStorage.getItem('favoriteEatsShoppingLegacySingleRowSave') ||
                '',
            )
              .trim()
              .toLowerCase() === '1'
          );
        } catch (_) {
          return false;
        }
      })();

      const tagsTableExists = tableExists('tags');
      if (hasVariantTable && tagsTableExists) {
        const rowsForNewTagCheck = normalizeIngredientVariantRows(
          normalizedVariantRows,
          { fallbackBaseHome: normalizedBaseHomeLocation },
        );
        const variantTagNames = [];
        const seenLower = new Set();
        rowsForNewTagCheck.forEach((row) => {
          normalizeRecipeTagList(row?.tags || []).forEach((tag) => {
            const lower = String(tag || '').toLowerCase();
            if (seenLower.has(lower)) return;
            seenLower.add(lower);
            variantTagNames.push(tag);
          });
        });
        const missingTagNames = [];
        variantTagNames.forEach((tagName) => {
          try {
            const q = db.exec(
              `SELECT id FROM tags WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1;`,
              [tagName],
            );
            if (q.length && q[0].values && q[0].values.length) return;
            missingTagNames.push(tagName);
          } catch (_) {}
        });
        if (missingTagNames.length > 0) {
          const label =
            missingTagNames.length === 1
              ? 'This tag is new to your library:'
              : 'These tags are new to your library:';
          const list = missingTagNames.map((t) => `• ${t}`).join('\n');
          const ok = await uiConfirm({
            title: 'Create new tags?',
            message: `${label}\n\n${list}\n\nSave will add them to Tags and assign them to variants.`,
            confirmText: 'Save',
            cancelText: 'Cancel',
          });
          if (!ok) {
            const err = new Error('new variant tags not confirmed');
            err.silent = true;
            throw err;
          }
        }
      }

      let currentId = Number.isFinite(id) ? id : null;
      baseName = String(baselineTitle || '').trim();
      const targetIds = [];
      const targetIdSeen = new Set();
      const pushTargetId = (rawId) => {
        const n = Number(rawId);
        if (!Number.isFinite(n)) return;
        if (targetIdSeen.has(n)) return;
        targetIdSeen.add(n);
        targetIds.push(n);
      };
      const getIngredientIdsByName = (nameText) => {
        const q = db.exec(
          'SELECT ID FROM ingredients WHERE lower(trim(name)) = lower(trim(?)) ORDER BY ID ASC;',
          [nameText],
        );
        return q.length
          ? q[0].values
              .map((r) => (Array.isArray(r) ? Number(r[0]) : NaN))
              .filter((v) => Number.isFinite(v))
          : [];
      };
      const deleteIngredientChildren = (ingredientId) => {
        if (!Number.isFinite(Number(ingredientId))) return;
        if (hasVariantAisleTable) {
          db.run(
            `DELETE FROM ingredient_variant_store_location
             WHERE ingredient_variant_id IN (
               SELECT id FROM ingredient_variants WHERE ingredient_id = ?
             );`,
            [ingredientId],
          );
        }
        if (hasVariantTable) {
          db.run('DELETE FROM ingredient_variants WHERE ingredient_id = ?;', [
            ingredientId,
          ]);
        }
        if (hasSizeTable) {
          db.run('DELETE FROM ingredient_sizes WHERE ingredient_id = ?;', [
            ingredientId,
          ]);
        }
        if (hasSynonymsTable) {
          db.run('DELETE FROM ingredient_synonyms WHERE ingredient_id = ?;', [
            ingredientId,
          ]);
        }
        if (hasStoreLocationTable) {
          db.run(
            'DELETE FROM ingredient_store_location WHERE ingredient_id = ?;',
            [ingredientId],
          );
        }
      };
      const mergeIngredientInto = (sourceId, targetId) => {
        const fromId = Number(sourceId);
        const toId = Number(targetId);
        if (
          !Number.isFinite(fromId) ||
          !Number.isFinite(toId) ||
          fromId === toId
        ) {
          return;
        }
        if (hasStoreLocationTable) {
          db.run(
            `DELETE FROM ingredient_store_location
             WHERE ingredient_id = ?
               AND EXISTS (
                 SELECT 1
                 FROM ingredient_store_location isl2
                 WHERE isl2.ingredient_id = ?
                   AND isl2.store_location_id = ingredient_store_location.store_location_id
               );`,
            [fromId, toId],
          );
          db.run(
            'UPDATE ingredient_store_location SET ingredient_id = ? WHERE ingredient_id = ?;',
            [toId, fromId],
          );
        }
        if (hasRecipeIngredientMapTable) {
          db.run(
            'UPDATE recipe_ingredient_map SET ingredient_id = ? WHERE ingredient_id = ?;',
            [toId, fromId],
          );
        }
        if (hasRecipeIngredientSubstitutesTable) {
          db.run(
            'UPDATE recipe_ingredient_substitutes SET ingredient_id = ? WHERE ingredient_id = ?;',
            [toId, fromId],
          );
        }
        deleteIngredientChildren(fromId);
        db.run('DELETE FROM ingredients WHERE ID = ?;', [fromId]);
      };

      if (useLegacySingleRowSave) {
        if (Number.isFinite(id)) pushTargetId(id);
      } else {
        // Shopping list entries are grouped by ingredient name, so edits should apply
        // to every row that currently belongs to the selected name.
        if (baseName) {
          try {
            const idsQ = db.exec(
              'SELECT ID FROM ingredients WHERE lower(trim(name)) = lower(trim(?));',
              [baseName],
            );
            const ids = idsQ.length
              ? idsQ[0].values.map((r) => (Array.isArray(r) ? r[0] : null))
              : [];
            ids.forEach((iid) => pushTargetId(iid));
          } catch (_) {}
        }
        if (Number.isFinite(id)) pushTargetId(id);
      }

      let txStarted = false;
      let findTagStmt = null;
      let insertTagStmt = null;
      let insertVariantTagStmt = null;
      try {
        try {
          db.run('BEGIN IMMEDIATE;');
          txStarted = true;
        } catch (_) {
          db.run('BEGIN;');
          txStarted = true;
        }
      } catch (_) {
        txStarted = false;
      }

      try {
        // Collapse edits onto one canonical ingredient row. This lets
        // rename-to-existing-name behave like a merge instead of tripping
        // the DB's unique-name constraint.
        const existingNextIds = getIngredientIdsByName(next).filter(
          (iid) => !targetIdSeen.has(iid),
        );
        let primaryIngredientId =
          existingNextIds.length > 0
            ? existingNextIds[0]
            : targetIds.length > 0
              ? targetIds[0]
              : null;
        const mergedSourceIds =
          targetIds.length > 1
            ? targetIds.filter((iid) => iid !== primaryIngredientId)
            : [];

        mergedSourceIds.forEach((iid) => {
          mergeIngredientInto(iid, primaryIngredientId);
        });

        if (primaryIngredientId != null) {
          const sets = ['name = ?'];
          const valsNoId = [next];

          if (!hasVariantTable && has('variant')) {
            sets.push('variant = ?');
            valsNoId.push(variant0);
          }
          if (!hasSizeTable && has('size')) {
            sets.push('size = ?');
            valsNoId.push(size0);
          }
          if (has('lemma')) {
            sets.push('lemma = ?');
            valsNoId.push(lemmaToWrite);
          }
          if (has('plural_override')) {
            sets.push('plural_override = ?');
            valsNoId.push(pluralOverride);
          }
          if (has('plural_by_default')) {
            sets.push('plural_by_default = ?');
            valsNoId.push(pluralByDefault);
          }
          if (has('is_mass_noun')) {
            sets.push('is_mass_noun = ?');
            valsNoId.push(isMassNoun);
          }
          if (has('is_food')) {
            sets.push('is_food = ?');
            valsNoId.push(isFood);
          }
          if (has('is_deprecated')) {
            sets.push('is_deprecated = ?');
            valsNoId.push(isDeprecated);
          } else if (has('hide_from_shopping_list')) {
            sets.push('hide_from_shopping_list = ?');
            valsNoId.push(isDeprecated);
          }
          if (has('is_hidden')) {
            sets.push('is_hidden = ?');
            valsNoId.push(isHidden);
          }

          db.run(`UPDATE ingredients SET ${sets.join(', ')} WHERE ID = ?;`, [
            ...valsNoId,
            primaryIngredientId,
          ]);

          currentId = Number(primaryIngredientId);
        } else {
          const insertCols = ['name'];
          const insertVals = [next];
          if (!hasVariantTable && has('variant')) {
            insertCols.push('variant');
            insertVals.push(variant0);
          }
          if (!hasSizeTable && has('size')) {
            insertCols.push('size');
            insertVals.push(size0);
          }
          if (has('lemma')) {
            insertCols.push('lemma');
            insertVals.push(lemmaToWrite);
          }
          if (has('plural_override')) {
            insertCols.push('plural_override');
            insertVals.push(pluralOverride);
          }
          if (has('plural_by_default')) {
            insertCols.push('plural_by_default');
            insertVals.push(pluralByDefault);
          }
          if (has('is_mass_noun')) {
            insertCols.push('is_mass_noun');
            insertVals.push(isMassNoun);
          }
          if (has('is_food')) {
            insertCols.push('is_food');
            insertVals.push(isFood);
          }
          if (has('is_deprecated')) {
            insertCols.push('is_deprecated');
            insertVals.push(isDeprecated);
          } else if (has('hide_from_shopping_list')) {
            insertCols.push('hide_from_shopping_list');
            insertVals.push(isDeprecated);
          }
          if (has('is_hidden')) {
            insertCols.push('is_hidden');
            insertVals.push(isHidden);
          }

          const placeholders = insertCols.map(() => '?').join(', ');
          db.run(
            `INSERT INTO ingredients (${insertCols.join(
              ', ',
            )}) VALUES (${placeholders});`,
            insertVals,
          );
          const idQ = db.exec('SELECT last_insert_rowid();');
          if (idQ.length && idQ[0].values.length) {
            const newId = idQ[0].values[0][0];
            sessionStorage.setItem('selectedShoppingItemId', String(newId));
            currentId = Number(newId);
          }
        }

        if (hasVariantTable && currentId != null && Number.isFinite(Number(currentId))) {
          const iid = Number(currentId);
          const priorRows = loadIngredientVariantRowsForIngredientInMain(
            db,
            iid,
            { fallbackBaseHome: normalizedBaseHomeLocation },
          );
          const prevNamed = getNamedVariantRowsFromDraft(priorRows);
          snapshotPrevNamedForShoppingMigration = prevNamed
            .map((r) =>
              normalizeNamedIngredientVariant(String(r?.value || '')).trim(),
            )
            .filter(Boolean);
          snapshotPrevNamedRowsForShoppingMigration = prevNamed.map((r) => ({
            value: normalizeNamedIngredientVariant(String(r?.value || '')).trim(),
            variantId: Number.isFinite(Number(r?.variantId))
              ? Number(r.variantId)
              : null,
          }));
          const nextKeys = new Set(
            namedVariantRows
              .map((r) =>
                normalizeNamedIngredientVariant(r.value).toLowerCase(),
              )
              .filter(Boolean),
          );
          for (const prow of prevNamed) {
            const disp = normalizeNamedIngredientVariant(prow.value);
            const k = disp.toLowerCase();
            if (!k || nextKeys.has(k)) continue;
            const rCount = getRecipesForIngredientVariant(db, iid, disp).length;
            const aCount = hasVariantAisleTable
              ? getAislePlacementsForIngredientVariant(db, iid, disp).length
              : 0;
            if (rCount > 0 || aCount > 0) {
              const err = new Error(
                `shopping-save-blocked-variant-refs:${disp}`,
              );
              err.silent = true;
              throw err;
            }
          }
        }

        // Persist variants/sizes lists to their own tables (newline-only, order preserved).
        const variantSizeTargetIds =
          currentId != null && Number.isFinite(Number(currentId))
            ? [Number(currentId)]
            : [];
        if (variantSizeTargetIds.length > 0) {
          if (hasVariantTable) {
            let nextTagSort = 1;
            try {
              const maxQ = db.exec(
                'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags;',
              );
              if (maxQ.length && maxQ[0].values.length) {
                const nextSort = Number(maxQ[0].values[0][0]);
                if (Number.isFinite(nextSort) && nextSort > 0)
                  nextTagSort = nextSort;
              }
            } catch (_) {}
            findTagStmt = db.prepare(
              `SELECT id FROM tags
               WHERE lower(trim(name)) = lower(trim(?))
               LIMIT 1;`,
            );
            insertTagStmt = db.prepare(
              'INSERT INTO tags (name, sort_order, intended_use) VALUES (?, ?, ?);',
            );
            insertVariantTagStmt = db.prepare(
              `INSERT INTO ingredient_variant_tag_map
                 (ingredient_variant_id, tag_id, sort_order)
               VALUES (?, ?, ?);`,
            );
            variantSizeTargetIds.forEach((iid) => {
              // If this ingredient currently has variant-only aisle links and the user
              // clears the variant list, migrate those aisle assignments to the base
              // ingredient row so the item does not silently disappear from aisles.
              let priorVariantAisleIds = [];
              if (hasVariantAisleTable && hasStoreLocationTable) {
                try {
                  const priorAislesQ = db.exec(
                    `SELECT DISTINCT ivsl.store_location_id
                     FROM ingredient_variant_store_location ivsl
                     JOIN ingredient_variants iv ON iv.id = ivsl.ingredient_variant_id
                     WHERE iv.ingredient_id = ?;`,
                    [iid],
                  );
                  priorVariantAisleIds =
                    priorAislesQ.length && priorAislesQ[0].values.length
                      ? priorAislesQ[0].values
                          .map((r) => Number(Array.isArray(r) ? r[0] : NaN))
                          .filter((n) => Number.isFinite(n))
                      : [];
                } catch (_) {
                  priorVariantAisleIds = [];
                }
              }

              // `DELETE FROM ingredient_variants` cascades to `ingredient_variant_store_location`.
              // Snapshot aisle links by variant name, then re-attach to the newly inserted row ids.
              let priorVariantIvslRows = [];
              if (hasVariantAisleTable) {
                try {
                  const ivslSnap = db.exec(
                    `SELECT ivsl.store_location_id, iv.variant
                       FROM ingredient_variant_store_location ivsl
                       JOIN ingredient_variants iv ON iv.id = ivsl.ingredient_variant_id
                      WHERE iv.ingredient_id = ?;`,
                    [iid],
                  );
                  if (ivslSnap.length && ivslSnap[0].values.length) {
                    priorVariantIvslRows = ivslSnap[0].values
                      .map((r) => ({
                        storeLocationId: Number(
                          Array.isArray(r) ? r[0] : NaN,
                        ),
                        variant: String(
                          Array.isArray(r) && r[1] != null ? r[1] : '',
                        ),
                      }))
                      .filter(
                        (row) =>
                          Number.isFinite(row.storeLocationId) &&
                          row.storeLocationId > 0,
                      );
                  }
                } catch (_) {
                  priorVariantIvslRows = [];
                }
              }

              db.run(
                'DELETE FROM ingredient_variants WHERE ingredient_id = ?;',
                [iid],
              );
              const variantRowsToPersist = normalizeIngredientVariantRows(
                normalizedVariantRows,
                {
                  fallbackBaseHome: normalizedBaseHomeLocation,
                },
              );
              variantRowsToPersist.forEach((row, idx) => {
                const sortOrder = idx === 0 ? 0 : idx;
                const variantName = row?.isBase
                  ? INGREDIENT_BASE_VARIANT_NAME
                  : normalizeNamedIngredientVariant(row?.value);
                if (!row?.isBase && !variantName) return;
                const isDep = row?.isBase ? 0 : (row?.isDeprecated ? 1 : 0);
                if (hasVariantHomeLocationCol) {
                  if (hasVariantIsDeprecatedCol) {
                    db.run(
                      'INSERT INTO ingredient_variants (ingredient_id, variant, sort_order, home_location, is_deprecated) VALUES (?, ?, ?, ?, ?);',
                      [
                        iid,
                        variantName,
                        sortOrder,
                        normalizeShoppingHomeLocationId(
                          row?.homeLocation || 'none',
                        ),
                        isDep,
                      ],
                    );
                  } else {
                    db.run(
                      'INSERT INTO ingredient_variants (ingredient_id, variant, sort_order, home_location) VALUES (?, ?, ?, ?);',
                      [
                        iid,
                        variantName,
                        sortOrder,
                        normalizeShoppingHomeLocationId(
                          row?.homeLocation || 'none',
                        ),
                      ],
                    );
                  }
                } else {
                  if (hasVariantIsDeprecatedCol) {
                    db.run(
                      'INSERT INTO ingredient_variants (ingredient_id, variant, sort_order, is_deprecated) VALUES (?, ?, ?, ?);',
                      [iid, variantName, sortOrder, isDep],
                    );
                  } else {
                    db.run(
                      'INSERT INTO ingredient_variants (ingredient_id, variant, sort_order) VALUES (?, ?, ?);',
                      [iid, variantName, sortOrder],
                    );
                  }
                }
                const variantIdQ = db.exec('SELECT last_insert_rowid();');
                const insertedVariantId =
                  variantIdQ.length && variantIdQ[0].values.length
                    ? Number(variantIdQ[0].values[0][0])
                    : NaN;
                if (
                  !Number.isFinite(insertedVariantId) ||
                  insertedVariantId <= 0
                )
                  return;
                normalizeRecipeTagList(row?.tags || []).forEach(
                  (tagName, tagIndex) => {
                    let tagId = null;
                    try {
                      findTagStmt.bind([tagName]);
                      if (findTagStmt.step()) {
                        const foundRow = findTagStmt.getAsObject();
                        const foundId = Number(
                          foundRow && foundRow.id != null ? foundRow.id : NaN,
                        );
                        if (Number.isFinite(foundId) && foundId > 0)
                          tagId = foundId;
                      }
                    } finally {
                      findTagStmt.reset();
                    }
                    if (tagId == null) {
                      insertTagStmt.run([
                        tagName,
                        nextTagSort++,
                        'ingredients',
                      ]);
                      const insertedTagQ = db.exec(
                        'SELECT last_insert_rowid();',
                      );
                      if (
                        insertedTagQ.length &&
                        insertedTagQ[0].values.length
                      ) {
                        const insertedTagId = Number(
                          insertedTagQ[0].values[0][0],
                        );
                        if (
                          Number.isFinite(insertedTagId) &&
                          insertedTagId > 0
                        ) {
                          tagId = insertedTagId;
                        }
                      }
                    }
                    if (tagId != null) {
                      insertVariantTagStmt.run([
                        insertedVariantId,
                        tagId,
                        tagIndex + 1,
                      ]);
                    }
                  },
                );
              });

              if (hasVariantAisleTable && priorVariantIvslRows.length) {
                priorVariantIvslRows.forEach(
                  ({ storeLocationId, variant: variantName }) => {
                    const vname = String(variantName || '').trim();
                    if (!vname) return;
                    const idQ = db.exec(
                      `SELECT id
                         FROM ingredient_variants
                        WHERE ingredient_id = ?
                          AND lower(trim(variant)) = lower(trim(?))
                        ORDER BY COALESCE(sort_order, 999999), id
                        LIMIT 1;`,
                      [iid, vname],
                    );
                    if (!idQ.length || !idQ[0].values.length) return;
                    const newVariantId = Number(idQ[0].values[0][0]);
                    if (!Number.isFinite(newVariantId) || newVariantId <= 0)
                      return;
                    db.run(
                      `INSERT OR IGNORE INTO ingredient_variant_store_location (ingredient_variant_id, store_location_id)
                       VALUES (?, ?);`,
                      [newVariantId, storeLocationId],
                    );
                  },
                );
              }

              if (
                variants.length === 0 &&
                hasStoreLocationTable &&
                Array.isArray(priorVariantAisleIds) &&
                priorVariantAisleIds.length > 0
              ) {
                priorVariantAisleIds.forEach((aisleId) => {
                  db.run(
                    `INSERT OR IGNORE INTO ingredient_store_location (ingredient_id, store_location_id)
                     VALUES (?, ?);`,
                    [iid, aisleId],
                  );
                });
              }
            });
          }

          if (hasSizeTable) {
            variantSizeTargetIds.forEach((iid) => {
              db.run('DELETE FROM ingredient_sizes WHERE ingredient_id = ?;', [
                iid,
              ]);
              sizes.forEach((s, idx) => {
                db.run(
                  'INSERT INTO ingredient_sizes (ingredient_id, size, sort_order) VALUES (?, ?, ?);',
                  [iid, s, idx + 1],
                );
              });
            });
          }

          if (hasSynonymsTable) {
            const primarySynonymId = variantSizeTargetIds[0];
            if (primarySynonymId != null) {
              db.run(
                'DELETE FROM ingredient_synonyms WHERE ingredient_id = ?;',
                [primarySynonymId],
              );
              synonyms.forEach((s) => {
                const ownQ = db.exec(
                  `SELECT COALESCE(i.name, '')
                   FROM ingredient_synonyms syn
                   LEFT JOIN ingredients i ON i.ID = syn.ingredient_id
                   WHERE lower(trim(syn.synonym)) = lower(trim(?))
                     AND syn.ingredient_id != ?
                   LIMIT 1;`,
                  [s, primarySynonymId],
                );
                if (ownQ.length && ownQ[0].values && ownQ[0].values.length) {
                  const otherName = String(
                    (ownQ[0].values[0] && ownQ[0].values[0][0]) || '',
                  ).trim();
                  const err = new Error('shopping-save-synonym-in-use');
                  err.silent = true;
                  err.synonymAlias = s;
                  err.conflictIngredientName = otherName;
                  throw err;
                }
                try {
                  db.run(
                    'INSERT INTO ingredient_synonyms (ingredient_id, synonym) VALUES (?, ?);',
                    [primarySynonymId, s],
                  );
                } catch (insertErr) {
                  const m = String(
                    insertErr && insertErr.message
                      ? insertErr.message
                      : insertErr,
                  );
                  if (/UNIQUE|unique constraint|constraint failed/i.test(m)) {
                    const err = new Error('shopping-save-synonym-in-use');
                    err.silent = true;
                    err.synonymAlias = s;
                    err.conflictIngredientName = '';
                    throw err;
                  }
                  throw insertErr;
                }
              });
            }
          }
        }

        if (currentId != null && Number.isFinite(Number(currentId))) {
          sessionStorage.setItem('selectedShoppingItemId', String(currentId));
        }

        // Verify writes before COMMIT so any mismatch can rollback atomically.
        const verifyIds =
          currentId != null && Number.isFinite(Number(currentId))
            ? [Number(currentId)]
            : [];
        const normalizedNext = String(next || '')
          .trim()
          .toLowerCase();
        const listEqual = (a, b) => {
          if (!Array.isArray(a) || !Array.isArray(b)) return false;
          if (a.length !== b.length) return false;
          for (let i = 0; i < a.length; i += 1) {
            if (String(a[i] || '') !== String(b[i] || '')) return false;
          }
          return true;
        };

        verifyIds.forEach((iid) => {
          const rowQ = db.exec(
            `SELECT COALESCE(name, ''),
                    ${has('variant') ? "COALESCE(variant, '')" : "''"},
                    ${has('size') ? "COALESCE(size, '')" : "''"}
             FROM ingredients
             WHERE ID = ?;`,
            [iid],
          );
          if (!(rowQ.length && rowQ[0].values.length)) {
            throw new Error(`shopping-save-verify-missing-row:${iid}`);
          }
          const row = rowQ[0].values[0] || [];
          const dbNameNorm = String(row[0] || '')
            .trim()
            .toLowerCase();
          if (dbNameNorm !== normalizedNext) {
            throw new Error(`shopping-save-verify-name:${iid}`);
          }
          if (!hasVariantTable && has('variant')) {
            if (String(row[1] || '') !== String(variant0 || '')) {
              throw new Error(`shopping-save-verify-variant:${iid}`);
            }
          }
          if (!hasSizeTable && has('size')) {
            if (String(row[2] || '') !== String(size0 || '')) {
              throw new Error(`shopping-save-verify-size:${iid}`);
            }
          }
          if (hasVariantTable) {
            const dbVariantRows = loadIngredientVariantRowsForIngredientInMain(
              db,
              iid,
              {
                fallbackBaseHome: normalizedBaseHomeLocation,
              },
            );
            const expectedVariantRows = normalizeIngredientVariantRows(
              normalizedVariantRows,
              {
                fallbackBaseHome: normalizedBaseHomeLocation,
              },
            );
            const stripVariantRowIds = (rows) =>
              (Array.isArray(rows) ? rows : []).map((r) => {
                if (!r || typeof r !== 'object') return r;
                const { variantId, ...rest } = r;
                return rest;
              });
            if (
              JSON.stringify(stripVariantRowIds(dbVariantRows)) !==
              JSON.stringify(stripVariantRowIds(expectedVariantRows))
            ) {
              throw new Error(`shopping-save-verify-variant-rows:${iid}`);
            }
          }
          if (hasSizeTable) {
            const sq = db.exec(
              `SELECT COALESCE(size, '')
               FROM ingredient_sizes
               WHERE ingredient_id = ?
               ORDER BY sort_order ASC, id ASC;`,
              [iid],
            );
            const dbSizes = sq.length
              ? sq[0].values.map((r) => String((r && r[0]) || ''))
              : [];
            if (!listEqual(dbSizes, sizes)) {
              throw new Error(`shopping-save-verify-sizes-list:${iid}`);
            }
          }

          if (hasSynonymsTable) {
            const primarySynonymId = variantSizeTargetIds[0];
            if (iid === primarySynonymId) {
              const synQ = db.exec(
                `SELECT COALESCE(synonym, '')
                 FROM ingredient_synonyms
                 WHERE ingredient_id = ?
                 ORDER BY id ASC;`,
                [iid],
              );
              const dbSynonyms = synQ.length
                ? synQ[0].values.map((r) => String((r && r[0]) || ''))
                : [];
              if (!listEqual(dbSynonyms, synonyms)) {
                throw new Error(`shopping-save-verify-synonyms-list:${iid}`);
              }
            }
          }
        });

        if (txStarted) {
          db.run('COMMIT;');
          txStarted = false;
        }
        if (Number.isFinite(Number(currentId)) && Number(currentId) > 0) {
          savedIngredientIdForDraftRefresh = Number(currentId);
        }
      } catch (writeErr) {
        if (txStarted) {
          try {
            db.run('ROLLBACK;');
          } catch (_) {}
          txStarted = false;
        }
        try {
          if (findTagStmt) findTagStmt.free();
        } catch (_) {}
        try {
          if (insertTagStmt) insertTagStmt.free();
        } catch (_) {}
        try {
          if (insertVariantTagStmt) insertVariantTagStmt.free();
        } catch (_) {}
        findTagStmt = null;
        insertTagStmt = null;
        insertVariantTagStmt = null;
        throw writeErr;
      }
      try {
        if (findTagStmt) findTagStmt.free();
      } catch (_) {}
      try {
        if (insertTagStmt) insertTagStmt.free();
      } catch (_) {}
      try {
        if (insertVariantTagStmt) insertVariantTagStmt.free();
      } catch (_) {}
    } catch (err) {
      const msg = String(err && err.message ? err.message : '');
      if (err && err.silent) {
        if (msg.startsWith('shopping-save-blocked-variant-refs:')) {
          const v = msg
            .replace(/^shopping-save-blocked-variant-refs:/, '')
            .trim();
          uiToast(
            v
              ? `Cannot remove “${v}” while it is still used in a recipe or store aisle. Clear those references first.`
              : 'Cannot remove this variant while it is still used in a recipe or store aisle. Clear those references first.',
          );
        } else if (msg === 'shopping-save-synonym-in-use') {
          const a = String(
            (err.synonymAlias != null && err.synonymAlias) || '',
          ).trim();
          const n = String(
            (err.conflictIngredientName != null && err.conflictIngredientName) ||
              '',
          ).trim();
          uiToast(
            a
              ? n
                ? `The alias “${a}” is already used for “${n}”. Each aka / synonym must be unique across your library.`
                : `The alias “${a}” is already in use. Each aka / synonym must be unique across your library.`
              : 'That aka / synonym is already in use for another ingredient.',
          );
        }
        throw err;
      }
      console.error('❌ Failed to upsert shopping item ingredient:', err);
      uiToast('Failed to save shopping item. See console for details.');
      throw err;
    }

    try {
      await persistDbForCurrentRuntime(db, {
        isElectron,
        failureMessage: 'Failed to save database after shopping edit.',
      });
    } catch (err) {
      console.error('❌ Failed to persist DB after shopping edit:', err);
      uiToast('Failed to save database. See console for details.');
      throw err;
    }

    try {
      migrateShoppingIdentityAfterIngredientEditorSave({
        db,
        oldDisplayName: baseName,
        newDisplayName: String(next || '').trim(),
        prevNamedValues: snapshotPrevNamedForShoppingMigration,
        nextNamedValues: variants,
        prevNamedRows: snapshotPrevNamedRowsForShoppingMigration,
        nextNamedRows: snapshotNextNamedRowsForShoppingMigration,
        hasVariantTable: migrationVariantTableActive,
      });
    } catch (migrateErr) {
      console.warn(
        'Shopping plan migration after ingredient save failed:',
        migrateErr,
      );
    }

    try {
      maintainShoppingPlanStorageWithDb(db);
    } catch (reconcileErr) {
      console.warn(
        'Shopping plan maintain after ingredient save failed:',
        reconcileErr,
      );
    }

    // Hardening: each save deletes and re-inserts ingredient_variants rows,
    // assigning fresh row IDs. Without refreshing, `variantRowsDraft` (and
    // therefore the hidden input) keeps the previous epoch's IDs, so a
    // second save in the same editor session would compare stale `next`
    // variantIds against fresh `prev` IDs and fail to detect renames by ID.
    // Re-read the live DB rows and rewrite the draft variantIds in place.
    try {
      const refreshIid = Number(savedIngredientIdForDraftRefresh);
      if (Number.isFinite(refreshIid) && refreshIid > 0) {
        const baseHomeForRefresh = normalizeShoppingHomeLocationId(
          (Array.isArray(variantRowsDraft)
            ? variantRowsDraft.find((row) => row?.isBase)?.homeLocation
            : null) || 'none',
        );
        const freshRows = loadIngredientVariantRowsForIngredientInMain(
          db,
          refreshIid,
          { fallbackBaseHome: baseHomeForRefresh },
        );
        const namedFreshByLower = new Map();
        let baseFreshId = null;
        (Array.isArray(freshRows) ? freshRows : []).forEach((row) => {
          if (!row || typeof row !== 'object') return;
          const vid = Number(row.variantId);
          if (!Number.isFinite(vid) || vid <= 0) return;
          if (row.isBase) {
            if (baseFreshId == null) baseFreshId = vid;
            return;
          }
          const key = normalizeNamedIngredientVariant(row.value)
            .toLowerCase();
          if (!key) return;
          if (!namedFreshByLower.has(key)) namedFreshByLower.set(key, vid);
        });
        let mutated = false;
        (Array.isArray(variantRowsDraft) ? variantRowsDraft : []).forEach(
          (row) => {
            if (!row || typeof row !== 'object') return;
            if (row.isBase) {
              if (baseFreshId != null && row.variantId !== baseFreshId) {
                row.variantId = baseFreshId;
                mutated = true;
              }
              return;
            }
            const key = normalizeNamedIngredientVariant(row.value)
              .toLowerCase();
            if (!key) return;
            const fresh = namedFreshByLower.get(key);
            if (
              Number.isFinite(Number(fresh)) &&
              Number(fresh) > 0 &&
              row.variantId !== Number(fresh)
            ) {
              row.variantId = Number(fresh);
              mutated = true;
            }
          },
        );
        if (mutated) {
          try {
            syncVariantHiddenInput({ emit: false });
          } catch (_) {}
        }
      }
    } catch (refreshErr) {
      console.warn(
        'Shopping editor draft variantId refresh after save failed:',
        refreshErr,
      );
    }

    sessionStorage.setItem('selectedShoppingItemName', next);
    sessionStorage.removeItem('selectedShoppingItemIsNew');
  };

  // Wire shared editor behavior once the injected shell exists.
  if (typeof waitForAppBarReady === 'function') {
    waitForAppBarReady().then(async () => {
      let baselineVariants = '';
      let baselineSizes = '';
      let baselineSynonyms = '';
      let baselineHome = 'none';
      let baselineVariantRows = normalizeIngredientVariantRows([], {
        fallbackBaseHome: baselineHome,
      });
      let baselineIsFood = '1';
      let baselineIsDeprecated = '0';
      let baselineIsHidden = '0';
      let baselinePluralOverride = '';
      let baselinePluralByDefault = '0';
      let baselineIsMassNoun = '0';

      const setShoppingItemDetailVisible = (elOrId, ok) => {
        const el =
          typeof elOrId === 'string'
            ? document.getElementById(elOrId)
            : elOrId;
        if (!el) return;
        el.style.display = ok ? '' : 'none';
      };

      const applyShoppingItemDetailFromDataService = (detail) => {
        if (!detail || typeof detail !== 'object') return false;
        baselineHome = normalizeShoppingHomeLocationId(
          detail.homeLocation || 'none',
        );
        baselineVariantRows = normalizeIngredientVariantRows(
          Array.isArray(detail.variantRows) ? detail.variantRows : [],
          { fallbackBaseHome: baselineHome },
        );
        baselineVariants = getNamedVariantRowsFromDraft(baselineVariantRows)
          .map((row) => row.value)
          .join('\n');
        baselineSizes = String(detail.sizesText || '');
        baselineSynonyms = String(detail.synonymsText || '');
        baselineIsFood = detail.isFood === false ? '0' : '1';
        baselineIsDeprecated = detail.isRemoved ? '1' : '0';
        baselineIsHidden = detail.isHidden ? '1' : '0';
        baselinePluralOverride = String(detail.pluralOverride || '');
        baselinePluralByDefault = detail.pluralByDefault ? '1' : '0';
        baselineIsMassNoun = detail.isMassNoun ? '1' : '0';

        const visibility =
          detail.visibility && typeof detail.visibility === 'object'
            ? detail.visibility
            : {};
        const showPluralOverride = visibility.showPluralOverride !== false;
        const showPluralByDefault = visibility.showPluralByDefault !== false;
        const showIsMassNoun = visibility.showIsMassNoun !== false;
        const showAnyOverrides =
          visibility.showAnyOverrides !== false &&
          (showPluralOverride || showPluralByDefault || showIsMassNoun);
        setShoppingItemDetailVisible('shoppingItemOverridesCard', showAnyOverrides);
        setShoppingItemDetailVisible('shoppingItemOverridesTitle', showAnyOverrides);
        setShoppingItemDetailVisible('shoppingItemLanguageDetails', showAnyOverrides);
        setShoppingItemDetailVisible(
          'shoppingItemPluralOverrideField',
          showPluralOverride,
        );
        setShoppingItemDetailVisible(
          'shoppingItemPluralByDefaultRow',
          showPluralByDefault,
        );
        setShoppingItemDetailVisible('shoppingItemIsMassNounRow', showIsMassNoun);
        setShoppingItemDetailVisible(
          'shoppingItemIsHiddenRow',
          visibility.showHiddenToggle !== false,
        );
        return true;
      };

      const getShoppingPageHref = () => {
        try {
          const params = new URLSearchParams(window.location.search || '');
          const adapterParam = params.get('adapter');
          if (adapterParam) {
            return `shopping.html?adapter=${encodeURIComponent(adapterParam)}`;
          }
        } catch (_) {}
        return 'shopping.html';
      };

      const loadShoppingItemDetailFromDataService = async () => {
        const idStr = sessionStorage.getItem('selectedShoppingItemId');
        const id = Number(idStr);
        if (
          !Number.isFinite(id) ||
          id <= 0 ||
          !window.dataService ||
          typeof window.dataService.loadShoppingItemDetail !== 'function'
        ) {
          return false;
        }
        if (favoriteEatsShouldUseSupabaseDataDoor()) {
          window.dataService.useSupabase = true;
          console.info(
            '[dataService] using Supabase adapter',
          );
        }
        const detail = await window.dataService.loadShoppingItemDetail({
          ingredientId: id,
          itemName: storedName,
        });
        return applyShoppingItemDetailFromDataService(detail);
      };

      let loadedViaDataService = false;

      try {
        if (!isNew && favoriteEatsShouldUseSupabaseDataDoor()) {
          try {
            loadedViaDataService = await loadShoppingItemDetailFromDataService();
          } catch (err) {
            favoriteEatsReportSupabasePrefetchFailure(
              'loadShoppingItemDetail',
              err,
            );
          }
        }

        if (!loadedViaDataService) {
          // Load DB once up-front so shared utilities (e.g., typeahead pools) can use window.dbInstance.
          // (loadDbForShoppingEditor also sets window.dbInstance)
          await loadDbForShoppingEditor();

          const idStr = sessionStorage.getItem('selectedShoppingItemId');
          const id = Number(idStr);
          if (Number.isFinite(id)) {
            const db = window.dbInstance;
            if (!db) throw new Error('DB not available for shopping editor init');

            let cols = [];
            try {
              const info = db.exec('PRAGMA table_info(ingredients);');
              const rows = info.length ? info[0].values : [];
              cols = rows.map((r) => String(r[1] || '').toLowerCase());
            } catch (_) {
              cols = [];
            }
            const has = (c) => cols.includes(String(c).toLowerCase());

            const setVisible = (elOrId, ok) => {
              const el =
                typeof elOrId === 'string'
                  ? document.getElementById(elOrId)
                  : elOrId;
              if (!el) return;
              el.style.display = ok ? '' : 'none';
            };

            // Show grammar controls only when schema supports them (older DBs hide them).
            const showPluralOverride = has('plural_override');
            const showPluralByDefault = has('plural_by_default');
            const showIsMassNoun = has('is_mass_noun');
            const showAnyOverrides =
              showPluralOverride || showPluralByDefault || showIsMassNoun;
            setVisible('shoppingItemOverridesCard', showAnyOverrides);
            setVisible('shoppingItemOverridesTitle', showAnyOverrides);
            setVisible('shoppingItemLanguageDetails', showAnyOverrides);
            setVisible('shoppingItemPluralOverrideField', showPluralOverride);
            setVisible('shoppingItemPluralByDefaultRow', showPluralByDefault);
            setVisible('shoppingItemIsMassNounRow', showIsMassNoun);
            setVisible('shoppingItemIsHiddenRow', has('is_hidden'));

          const selectCols = [
            "COALESCE(variant, '')",
            "COALESCE(size, '')",
            has('plural_override') ? "COALESCE(plural_override, '')" : "''",
            has('plural_by_default') ? 'COALESCE(plural_by_default, 0)' : '0',
            has('is_mass_noun') ? 'COALESCE(is_mass_noun, 0)' : '0',
            has('is_food') ? 'COALESCE(is_food, 1)' : '1',
            has('is_deprecated')
              ? 'COALESCE(is_deprecated, 0)'
              : has('hide_from_shopping_list')
                ? 'COALESCE(hide_from_shopping_list, 0)'
                : '0',
            has('is_hidden') ? 'COALESCE(is_hidden, 0)' : '0',
          ];

          const q = db.exec(
            `SELECT ${selectCols.join(', ')} FROM ingredients WHERE ID = ?;`,
            [id],
          );
          if (q.length && q[0].values.length) {
            const row = q[0].values[0];
            // Fallback scalar columns on ingredients
            baselineVariants = String(row[0] || '');
            baselineSizes = String(row[1] || '');
            baselinePluralOverride = String(row[2] || '');
            baselinePluralByDefault = String(row[3] != null ? row[3] : '0');
            baselineIsMassNoun = String(row[4] != null ? row[4] : '0');
            baselineIsFood = String(row[5] != null ? row[5] : '1');
            baselineIsDeprecated = String(row[6] != null ? row[6] : '0');
            baselineIsHidden = String(row[7] != null ? row[7] : '0');
          }

          const targetIngredientIds = [];
          const seenTargetIds = new Set();
          const pushTargetId = (rawId) => {
            const n = Number(rawId);
            if (!Number.isFinite(n)) return;
            if (seenTargetIds.has(n)) return;
            seenTargetIds.add(n);
            targetIngredientIds.push(n);
          };
          const targetName = String(storedName || '').trim();
          if (targetName) {
            try {
              const idsQ = db.exec(
                'SELECT ID FROM ingredients WHERE lower(name) = lower(?) ORDER BY ID ASC;',
                [targetName],
              );
              const ids = idsQ.length
                ? idsQ[0].values.map((r) => (Array.isArray(r) ? r[0] : null))
                : [];
              ids.forEach((iid) => pushTargetId(iid));
            } catch (_) {}
          }
          if (targetIngredientIds.length === 0) pushTargetId(id);

          const dedupeStable = (arr) => {
            const out = [];
            const seen = new Set();
            (arr || []).forEach((raw) => {
              const v = String(raw || '').trim();
              if (!v) return;
              const key = v.toLowerCase();
              if (seen.has(key)) return;
              seen.add(key);
              out.push(v);
            });
            return out;
          };

          // Aggregate fallback scalar columns across all grouped rows so editor
          // matches shopping list behavior even when selected ID is not the one
          // currently carrying the first variant/size values.
          if (has('variant')) {
            try {
              const legacyVariants = [];
              targetIngredientIds.forEach((iid) => {
                const qv = db.exec(
                  "SELECT COALESCE(variant, '') FROM ingredients WHERE ID = ?;",
                  [iid],
                );
                if (qv.length && qv[0].values.length) {
                  legacyVariants.push(String(qv[0].values[0][0] || ''));
                }
              });
              const cleaned = dedupeStable(legacyVariants);
              if (cleaned.length > 0) baselineVariants = cleaned.join('\n');
            } catch (_) {}
          }
          if (has('size')) {
            try {
              const legacySizes = [];
              targetIngredientIds.forEach((iid) => {
                const qs = db.exec(
                  "SELECT COALESCE(size, '') FROM ingredients WHERE ID = ?;",
                  [iid],
                );
                if (qs.length && qs[0].values.length) {
                  legacySizes.push(String(qs[0].values[0][0] || ''));
                }
              });
              const cleaned = dedupeStable(legacySizes);
              if (cleaned.length > 0) baselineSizes = cleaned.join('\n');
            } catch (_) {}
          }

          // Note: overrides are always visible (no disclosure); nothing to auto-open.

          // If list tables exist, prefer them as the baseline source-of-truth,
          // aggregated across all grouped IDs for this shopping-item name.
          try {
            const rows = [];
            targetIngredientIds.forEach((iid) => {
              loadIngredientVariantRowsForIngredientInMain(db, iid, {
                fallbackBaseHome: baselineHome,
              }).forEach((row) => rows.push(row));
            });
            baselineVariantRows = normalizeIngredientVariantRows(rows, {
              fallbackBaseHome: baselineHome,
            });
            baselineVariants = getNamedVariantRowsFromDraft(baselineVariantRows)
              .map((row) => row.value)
              .join('\n');
          } catch (_) {}

          try {
            const rows = [];
            targetIngredientIds.forEach((iid) => {
              const sq = db.exec(
                `SELECT size
                 FROM ingredient_sizes
                 WHERE ingredient_id = ?
                 ORDER BY sort_order ASC, id ASC;`,
                [iid],
              );
              if (sq.length && sq[0].values.length) {
                sq[0].values.forEach((r) =>
                  rows.push(String((r && r[0]) || '')),
                );
              }
            });
            const cleaned = dedupeStable(rows);
            if (cleaned.length > 0) {
              baselineSizes = cleaned.join('\n');
            }
          } catch (_) {}

          try {
            const rows = [];
            if (
              tableHasColumnInMain(db, 'ingredient_variants', 'home_location')
            ) {
              targetIngredientIds.forEach((iid) => {
                const hq = db.exec(
                  `SELECT COALESCE(home_location, 'none')
                   FROM ingredient_variants
                   WHERE ingredient_id = ?
                     AND ${getIngredientBaseVariantWhereSql('variant')}
                   ORDER BY id ASC
                   LIMIT 1;`,
                  [iid],
                );
                if (hq.length && hq[0].values.length) {
                  rows.push(
                    String((hq[0].values[0] && hq[0].values[0][0]) || 'none'),
                  );
                }
              });
            }
            const cleaned = dedupeStable(rows);
            if (cleaned.length > 0) {
              baselineHome = normalizeShoppingHomeLocationId(cleaned[0]);
            } else {
              baselineHome = 'none';
            }
          } catch (_) {
            baselineHome = normalizeShoppingHomeLocationId(baselineHome);
          }
          baselineVariantRows = normalizeIngredientVariantRows(
            baselineVariantRows,
            {
              fallbackBaseHome: baselineHome,
            },
          );

          try {
            const rows = [];
            targetIngredientIds.forEach((iid) => {
              const synQ = db.exec(
                `SELECT synonym
                 FROM ingredient_synonyms
                 WHERE ingredient_id = ?
                 ORDER BY id ASC;`,
                [iid],
              );
              if (synQ.length && synQ[0].values.length) {
                synQ[0].values.forEach((r) =>
                  rows.push(String((r && r[0]) || '')),
                );
              }
            });
            const cleaned = dedupeStable(rows);
            if (cleaned.length > 0) {
              baselineSynonyms = cleaned.join('\n');
            }
          } catch (_) {}
        }
        }
      } catch (_) {}

      if (!loadedViaDataService) {
        try {
          loadedViaDataService = await loadShoppingItemDetailFromDataService();
        } catch (err) {
          console.error('dataService.loadShoppingItemDetail failed:', err);
        }
      }

      const pageCtl = wireChildEditorPage({
        backBtn: document.getElementById('appBarBackBtn'),
        cancelBtn: document.getElementById('appBarCancelBtn'),
        saveBtn: document.getElementById('appBarSaveBtn'),
        appBarTitleEl: document.getElementById('appBarTitle'),
        bodyTitleEl: document.getElementById('childEditorTitle'),
        initialTitle: titleText,
        backHref: getShoppingPageHref(),
        extraFields: [
          {
            key: 'variant_rows',
            el: document.getElementById('shoppingItemVariantRowsHiddenInput'),
            initialValue: serializeIngredientVariantRows(baselineVariantRows, {
              fallbackBaseHome: baselineHome,
            }),
            getValue: () =>
              serializeIngredientVariantRows(
                getVariantRowsDraftWithMergedActiveTagDraft(),
              ),
            setValue: (value) => {
              setVariantRowsFromSerialized(value);
            },
          },
          {
            key: 'synonyms',
            el: document.getElementById('shoppingItemSynonymsTextarea'),
            initialValue: baselineSynonyms,
          },
          {
            key: 'sizes',
            el: document.getElementById('shoppingItemSizesTextarea'),
            initialValue: baselineSizes,
          },
          {
            key: 'plural_override',
            el: document.getElementById('shoppingItemPluralOverrideInput'),
            initialValue: baselinePluralOverride,
          },
          {
            key: 'plural_by_default',
            el: document.getElementById('shoppingItemPluralByDefaultToggle'),
            initialValue: baselinePluralByDefault === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemPluralByDefaultToggle')
                ?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById(
                'shoppingItemPluralByDefaultToggle',
              );
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'is_mass_noun',
            el: document.getElementById('shoppingItemIsMassNounToggle'),
            initialValue: baselineIsMassNoun === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemIsMassNounToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById(
                'shoppingItemIsMassNounToggle',
              );
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'is_food',
            el: document.getElementById('shoppingItemIsNotFoodToggle'),
            initialValue: baselineIsFood === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemIsNotFoodToggle')?.checked
                ? '0'
                : '1',
            setValue: (v) => {
              const el = document.getElementById('shoppingItemIsNotFoodToggle');
              if (el) el.checked = String(v) !== '1';
            },
          },
          {
            key: 'is_deprecated',
            el: document.getElementById('shoppingItemIsDeprecatedToggle'),
            initialValue: baselineIsDeprecated === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemIsDeprecatedToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById(
                'shoppingItemIsDeprecatedToggle',
              );
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'is_hidden',
            el: document.getElementById('shoppingItemIsHiddenToggle'),
            initialValue: baselineIsHidden === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemIsHiddenToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById('shoppingItemIsHiddenToggle');
              if (el) el.checked = String(v) === '1';
            },
          },
        ],
        onSave: persistShoppingItem,
        extraDirtyState: {
          isDirty: () => {
            const draftText = String(activeVariantTagEditorState?.draft || '');
            if (draftText.trim().length > 0) return true;
            return (
              getVariantRowsSignature(variantRowsDraft) !==
              variantRowsBaselineSignature
            );
          },
          onAfterSaveSuccess: () => {
            commitActiveVariantTagDraft({ clear: true, emit: false });
            try {
              renderVariantRows();
            } catch (_) {}
            // Baseline must reflect draft *after* render: ensureBaseVariantRowPresent
            // can normalize rows and would leave an eager snapshot falsely "dirty".
            variantRowsBaselineSignature =
              getVariantRowsSignature(variantRowsDraft);
            try {
              syncVariantHiddenInput({ emit: false });
            } catch (_) {}
          },
        },
      });
      refreshVariantEditorDirty =
        (pageCtl && pageCtl.refreshDirty) ||
        (() => {
          /* noop */
        });
      variantRowsBaselineSignature = getVariantRowsSignature(variantRowsDraft);
      try {
        refreshVariantEditorDirty();
      } catch (_) {}
    });
  }
}

function loadUnitEditorPage() {
  const view = document.getElementById('pageContent');

  if (!view) return;

  const isNew = sessionStorage.getItem('selectedUnitIsNew') === '1';
  const storedName = sessionStorage.getItem('selectedUnitNameSingular') || '';
  const storedPlural = sessionStorage.getItem('selectedUnitNamePlural') || '';
  const code = sessionStorage.getItem('selectedUnitCode') || '';
  const initialHidden = sessionStorage.getItem('selectedUnitIsHidden') === '1';
  const initialRemoved =
    sessionStorage.getItem('selectedUnitIsRemoved') === '1';
  const titleDisplay = storedName || (isNew ? 'New unit' : 'Unit');
  const initialTitle = storedName
    ? (storedName || '').trim().toLowerCase()
    : isNew
      ? 'new unit'
      : 'unit';

  initAppBar({ mode: 'editor', titleText: titleDisplay });

  const abbreviationDisplay = code || 'Abbreviation';
  view.innerHTML = `
    <h1 id="childEditorTitle" class="recipe-title">${titleDisplay || ''}</h1>
    <div id="unitAbbreviation" class="unit-abbreviation-line">${abbreviationDisplay}</div>
    <div
      id="unitDetailsCard"
      class="shopping-item-editor-card"
      aria-label="Unit details"
      style="margin-top: 20px;"
    >
      <div class="shopping-item-field" style="width: 100%;">
        <div class="shopping-item-label">Plural form</div>
        <input
          id="unitPluralInput"
          class="shopping-item-input"
          type="text"
          placeholder="e.g. bunches, cloves, pinches"
        />
      </div>
      <div class="shopping-item-status">
        <div class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="unitIsHiddenToggle" type="checkbox" ${initialHidden ? 'checked' : ''} />
            <span>Hidden</span>
          </label>
        </div>
        <div class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="unitIsRemovedToggle" type="checkbox" ${initialRemoved ? 'checked' : ''} />
            <span>Removed</span>
          </label>
        </div>
      </div>
    </div>
  `;
  const unitPluralInput = document.getElementById('unitPluralInput');
  if (unitPluralInput) unitPluralInput.value = storedPlural;

  if (typeof waitForAppBarReady === 'function') {
    waitForAppBarReady().then(() => {
      wireChildEditorPage({
        backBtn: document.getElementById('appBarBackBtn'),
        cancelBtn: document.getElementById('appBarCancelBtn'),
        saveBtn: document.getElementById('appBarSaveBtn'),
        appBarTitleEl: document.getElementById('appBarTitle'),
        bodyTitleEl: document.getElementById('childEditorTitle'),
        initialTitle,
        backHref: 'units.html',
        normalizeTitle: (s) => (s || '').trim().toLowerCase(),
        subtitleEl: document.getElementById('unitAbbreviation'),
        initialSubtitle: code,
        normalizeSubtitle: (s) => (s || '').trim().toLowerCase(),
        hideSubtitleWhenMatchesTitle: true,
        extraFields: [
          {
            key: 'name_plural',
            el: document.getElementById('unitPluralInput'),
            initialValue: storedPlural,
          },
          {
            key: 'is_hidden',
            el: document.getElementById('unitIsHiddenToggle'),
            initialValue: initialHidden ? '1' : '0',
            getValue: () =>
              document.getElementById('unitIsHiddenToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById('unitIsHiddenToggle');
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'is_removed',
            el: document.getElementById('unitIsRemovedToggle'),
            initialValue: initialRemoved ? '1' : '0',
            getValue: () =>
              document.getElementById('unitIsRemovedToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById('unitIsRemovedToggle');
              if (el) el.checked = String(v) === '1';
            },
          },
        ],
        onSave: async ({ title: next, subtitle: nextCode }) => {
          const oldCode = (sessionStorage.getItem('selectedUnitCode') || '')
            .trim()
            .toLowerCase();
          if (!oldCode && !isNew) return;

          const isElectron = !!window.electronAPI;
          let db;

          if (isElectron) {
            const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
            const bytes = await window.electronAPI.loadDB(pathHint);
            const Uints = new Uint8Array(bytes);
            db = new SQL.Database(Uints);
          } else {
            db = await openFavoriteEatsDbForCurrentRuntime({
              isElectron: false,
            });
          }

          window.dbInstance = db;
          await ensureIngredientLemmaMaintenanceInMain(db, isElectron);
          ensureUnitsSchemaInMain(db);

          const newCode = (nextCode ?? '').trim().toLowerCase();
          const pluralForm = (
            document.getElementById('unitPluralInput')?.value || ''
          ).trim();
          const isHidden = document.getElementById('unitIsHiddenToggle')
            ?.checked
            ? 1
            : 0;
          const isRemoved = document.getElementById('unitIsRemovedToggle')
            ?.checked
            ? 1
            : 0;

          if (oldCode && newCode !== oldCode) {
            const safe = (x) => String(x || '').replace(/'/g, "''");
            const exists = db.exec(
              `SELECT 1 FROM units WHERE lower(trim(code)) = '${safe(newCode)}' AND lower(trim(code)) != lower(trim('${safe(oldCode)}')) LIMIT 1;`,
            );
            if (exists.length > 0 && exists[0].values.length > 0) {
              uiToast('That abbreviation is already used by another unit.');
              throw new Error('Duplicate unit code');
            }
            try {
              db.run(
                'UPDATE recipe_ingredient_map SET unit = ? WHERE unit = ?;',
                [newCode, oldCode],
              );
            } catch (_) {}
            try {
              db.run(
                'UPDATE recipe_ingredient_substitutes SET unit = ? WHERE unit = ?;',
                [newCode, oldCode],
              );
            } catch (_) {}
            db.run(
              'UPDATE units SET code = ?, name_singular = ?, name_plural = ?, is_hidden = ?, is_removed = ? WHERE code = ?;',
              [newCode, next || '', pluralForm, isHidden, isRemoved, oldCode],
            );
            sessionStorage.setItem('selectedUnitCode', newCode);
          } else {
            db.run(
              'UPDATE units SET name_singular = ?, name_plural = ?, is_hidden = ?, is_removed = ? WHERE code = ?;',
              [next || '', pluralForm, isHidden, isRemoved, oldCode || newCode],
            );
            if (newCode && newCode !== oldCode)
              sessionStorage.setItem('selectedUnitCode', newCode);
          }

          await persistDbForCurrentRuntime(db, {
            isElectron,
            failureMessage: 'Failed to save DB for unit editor.',
          });

          sessionStorage.setItem('selectedUnitNameSingular', next || '');
          sessionStorage.setItem('selectedUnitNamePlural', pluralForm);
          sessionStorage.setItem('selectedUnitIsHidden', String(isHidden));
          sessionStorage.setItem('selectedUnitIsRemoved', String(isRemoved));
          sessionStorage.removeItem('selectedUnitIsNew');
        },
      });
    });
  }
}

async function loadUnitsPage() {
  initAppBar({
    mode: 'list',
    titleText: 'Units',
    showAdd: true,
  });

  const list = document.getElementById('unitsList');

  // App bar is injected async; wait before wiring menu/search.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: () => {
      applyUnitFilters();
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');
  if (addBtn) ensureAppBarTextActionPair(addBtn, 'Add', 'add');

  if (!list) return;

  // Keyboard selection + Enter activation for list rows.
  const listNav = enableTopLevelListKeyboardNav(list);

  attachSecretGalleryShortcut(addBtn);

  let unitRows = [];
  let unitRowsLoadedFromDataService = false;
  // Supabase-first units list (web default), then SQLite.
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listUnits === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      const rows = await window.dataService.listUnits();
      unitRows = Array.isArray(rows) ? rows : [];
      unitRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listUnits', err);
      window.dataService.useSupabase = false;
      unitRows = [];
      unitRowsLoadedFromDataService = false;
    }
  }

  // --- Load DB (mirror recipe/shopping loaders) ---
  const isElectron = !!window.electronAPI;
  let db;

  if (isElectron) {
    try {
      const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
      const bytes = await window.electronAPI.loadDB(pathHint);
      const Uints = new Uint8Array(bytes);
      db = new SQL.Database(Uints);
    } catch (err) {
      console.error('❌ Failed to load DB from disk:', err);
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  } else {
    try {
      db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
    } catch (err) {
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  }

  // Expose DB globally for any future helpers
  window.dbInstance = db;
  if (window.dataService && typeof window.dataService.setSqliteDb === 'function') {
    window.dataService.setSqliteDb(db);
    if (favoriteEatsShouldUseSupabaseDataDoor()) {
      window.dataService.useSupabase = unitRowsLoadedFromDataService;
      console.info('[dataService] using Supabase adapter');
    }
  }
  await ensureIngredientLemmaMaintenanceInMain(db, isElectron);
  ensureUnitsSchemaInMain(db);

  const queryUnits = async () => {
    try {
      return await window.dataService.listUnits();
    } catch (err) {
      console.error('dataService.listUnits failed:', err);
      uiToast('Failed to load units.');
      return [];
    }
  };

  if (!unitRowsLoadedFromDataService) {
    unitRows = await queryUnits();
  }

  const persistDb = async () => {
    await persistDbForCurrentRuntime(db, {
      isElectron: !!window.electronAPI,
      failureMessage: 'Failed to save database after updating units.',
    });
  };

  const unitFilterChipDefs = [
    { id: 'hidden', label: 'hidden' },
    { id: 'removed', label: 'removed' },
  ];
  const activeUnitFilterChips = new Set();
  let unitChipCounts = new Map();
  let unitFilterChipRail = null;

  const recomputeUnitChipCounts = () => {
    const counts = new Map();
    unitFilterChipDefs.forEach((chip) => counts.set(chip.id, 0));
    unitRows.forEach((row) => {
      const state = getUnitSizeRowState(row);
      if (state.isHidden) counts.set('hidden', (counts.get('hidden') || 0) + 1);
      if (state.isRemoved)
        counts.set('removed', (counts.get('removed') || 0) + 1);
    });
    unitChipCounts = counts;
  };

  const rerenderUnitFilterChips = () => {
    const chipMountEl = unitFilterChipRail?.trackEl;
    if (!chipMountEl) return;
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips: unitFilterChipDefs.map((chipDef) => {
        const count = Number(unitChipCounts.get(chipDef.id) || 0);
        return {
          id: chipDef.id,
          label: chipDef.label,
          disabled: count <= 0,
        };
      }),
      activeChipIds: activeUnitFilterChips,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        const count = Number(unitChipCounts.get(key) || 0);
        if (!key || count <= 0) return;
        if (activeUnitFilterChips.has(key)) activeUnitFilterChips.delete(key);
        else activeUnitFilterChips.add(key);
        rerenderUnitFilterChips();
        applyUnitFilters();
      },
      chipClassName: 'app-filter-chip',
    });
  };

  const mountUnitFilterChips = () => {
    if (!searchInput) return;
    if (typeof window.mountTopFilterChipRail !== 'function') return;
    unitFilterChipRail = window.mountTopFilterChipRail({
      anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
      dockId: 'unitFilterChipDock',
    });
    recomputeUnitChipCounts();
    rerenderUnitFilterChips();
    unitFilterChipRail?.sync?.();
  };

  const getFilteredUnits = () => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    return unitRows.filter((u) => {
      if (!shouldShowUnitSizeRow(u, activeUnitFilterChips)) return false;
      const haystack = [
        u.code || '',
        u.nameSingular || '',
        u.namePlural || '',
        u.category || '',
      ]
        .join(' ')
        .toLowerCase();
      return !query || haystack.includes(query);
    });
  };

  function renderUnitsList({ units }) {
    list.innerHTML = '';

    const rows = Array.isArray(units) ? units : [];
    if (!rows.length) {
      renderTopLevelEmptyState(list, 'units');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    rows.forEach((unit) => {
      const li = document.createElement('li');
      const state = getUnitSizeRowState(unit);
      if (state.isRemoved) li.classList.add('list-item--removed');

      const code = (unit.code || '').trim();
      const nameSingular = (unit.nameSingular || '').trim();
      let line = nameSingular || code;
      if (
        nameSingular &&
        code &&
        nameSingular.toLowerCase() !== code.toLowerCase()
      ) {
        line = `${nameSingular} (${code})`;
      }

      li.textContent = line;

      const countRecipesUsingUnit = (code) => {
        const c = (code || '').trim();
        if (!c) return 0;
        try {
          const q = db.exec(
            `
            SELECT COUNT(DISTINCT rid) AS n
            FROM (
              SELECT recipe_id AS rid
              FROM recipe_ingredient_map
              WHERE lower(unit) = lower(?)
              UNION
              SELECT rim.recipe_id AS rid
              FROM recipe_ingredient_substitutes ris
              JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
              WHERE lower(ris.unit) = lower(?)
            ) t;
            `,
            [c, c],
          );
          if (q.length && q[0].values.length) {
            const v = Number(q[0].values[0][0]);
            return Number.isFinite(v) ? v : 0;
          }
        } catch (err) {
          console.warn('countRecipesUsingUnit failed:', err);
        }
        return 0;
      };

      const removeUnit = async (code) => {
        const c = (code || '').trim();
        if (!c) return false;

        const usedCount = countRecipesUsingUnit(c);

        if (getUnitSizeRemovalAction(usedCount) === 'remove') {
          const ok = await uiConfirm({
            title: 'Remove Unit',
            message: `Remove '${c}'?\n\nUsed in ${usedCount} recipe${
              usedCount === 1 ? '' : 's'
            }.\n\nRemoving marks it as removed and blocks it from new selections. It remains in existing recipes until replaced.`,
            confirmText: 'Remove',
            cancelText: 'Cancel',
            danger: true,
          });
          if (!ok) return false;

          try {
            db.run('UPDATE units SET is_removed = 1 WHERE code = ?;', [c]);
          } catch (err) {
            console.error('❌ Failed to remove unit:', err);
            uiToast('Failed to remove unit. See console for details.');
            return false;
          }
        } else {
          const ok = await uiConfirm({
            title: 'Delete Unit',
            message: `Remove '${c}' permanently?\n\nIt isn't used in any recipes. This will permanently delete it from the database.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            danger: true,
          });
          if (!ok) return false;

          try {
            db.run('DELETE FROM units WHERE code = ?;', [c]);
          } catch (err) {
            console.error('❌ Failed to delete unit:', err);
            uiToast('Failed to delete unit. See console for details.');
            return false;
          }
        }

        // Persist DB after remove/hide.
        try {
          await persistDb();
        } catch (err) {
          console.error('❌ Failed to persist DB after removing unit:', err);
          uiToast('Failed to save database after removing unit.');
          return false;
        }

        return true;
      };

      li.addEventListener('click', (event) => {
        const wantsRemove = event.ctrlKey || event.metaKey;
        if (wantsRemove) {
          event.preventDefault();
          event.stopPropagation();
          void (async () => {
            const ok = await removeUnit(unit.code || '');
            if (!ok) return;
            unitRows = await queryUnits();
            recomputeUnitChipCounts();
            rerenderUnitFilterChips();
            applyUnitFilters();
          })();
          return;
        }

        // Stash selected unit in session for future editor wiring
        sessionStorage.setItem('selectedUnitCode', unit.code || '');
        sessionStorage.setItem(
          'selectedUnitNameSingular',
          unit.nameSingular || '',
        );
        sessionStorage.setItem('selectedUnitNamePlural', unit.namePlural || '');
        sessionStorage.setItem('selectedUnitCategory', unit.category || '');
        sessionStorage.setItem(
          'selectedUnitIsHidden',
          state.isHidden ? '1' : '0',
        );
        sessionStorage.setItem(
          'selectedUnitIsRemoved',
          state.isRemoved ? '1' : '0',
        );
        sessionStorage.removeItem('selectedUnitIsNew');

        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('unitEditor.html');
      });

      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        void (async () => {
          const ok = await removeUnit(unit.code || '');
          if (!ok) return;
          unitRows = await queryUnits();
          recomputeUnitChipCounts();
          rerenderUnitFilterChips();
          applyUnitFilters();
        })();
      });

      list.appendChild(li);
    });

    // Keep selection valid after rerender (search/filter changes).
    listNav?.syncAfterRender?.();
  }

  const applyUnitFilters = () => {
    renderUnitsList({ units: getFilteredUnits() });
  };

  mountUnitFilterChips();
  // Initial render
  applyUnitFilters();

  async function openCreateUnitDialog() {
    if (!window.ui) {
      uiToast('UI not ready yet.');
      return;
    }

    const vals = await window.ui.form({
      title: 'New Unit',
      fields: [
        {
          key: 'nameSingular',
          label: 'Name (singular)',
          value: '',
          required: true,
          normalize: (v) => (v || '').trim(),
        },
        {
          key: 'code',
          label: 'Abbreviation (optional)',
          value: '',
          required: false,
          normalize: (v) => (v || '').trim(),
        },
      ],
      confirmText: 'Create',
      cancelText: 'Cancel',
      validate: (v) => {
        if (!v.nameSingular || !v.nameSingular.trim()) {
          return 'Name (singular) is required.';
        }
        return '';
      },
    });
    if (!vals) return;

    const nameSingular = (vals.nameSingular || '').trim();
    const code = ((vals.code || '').trim() || nameSingular).trim();
    if (!nameSingular || !code) return;

    try {
      // Best-effort sort order: append at end
      let nextSort = null;
      try {
        const q = db.exec(
          'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM units;',
        );
        if (q.length && q[0].values.length) {
          nextSort = q[0].values[0][0];
        }
      } catch (_) {
        nextSort = null;
      }

      db.run(
        'INSERT INTO units (code, name_singular, name_plural, category, sort_order, is_hidden, is_removed) VALUES (?, ?, ?, ?, ?, 0, 0);',
        [code, nameSingular, '', '', nextSort],
      );
    } catch (err) {
      console.error('❌ Failed to create unit:', err);
      uiToast('Failed to create unit. (Code must be unique.)');
      return;
    }

    try {
      await persistDbForCurrentRuntime(db, {
        isElectron: !!window.electronAPI,
        failureMessage: 'Failed to save database after creating unit.',
      });
    } catch (err) {
      console.error('❌ Failed to persist DB after creating unit:', err);
      uiToast('Failed to save database after creating unit.');
      return;
    }

    sessionStorage.setItem('selectedUnitCode', code);
    sessionStorage.setItem('selectedUnitNameSingular', nameSingular);
    sessionStorage.setItem('selectedUnitNamePlural', '');
    sessionStorage.setItem('selectedUnitCategory', '');
    sessionStorage.setItem('selectedUnitIsHidden', '0');
    sessionStorage.setItem('selectedUnitIsRemoved', '0');
    sessionStorage.setItem('selectedUnitIsNew', '1');
    window.location.href =
      favoriteEatsHrefWithCurrentAdapter('unitEditor.html');
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      void openCreateUnitDialog();
    });
  }
}

async function loadTagsPage() {
  initAppBar({
    mode: 'list',
    titleText: 'Tags',
    showAdd: true,
  });

  const list = document.getElementById('tagsList');
  if (!list) return;

  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: () => {
      renderTags(applyTagSearchFilter(tagRows));
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');
  if (addBtn) ensureAppBarTextActionPair(addBtn, 'Add', 'add');

  const listNav = enableTopLevelListKeyboardNav(list);
  attachSecretGalleryShortcut(addBtn);

  let tagRows = [];
  let tagRowsLoadedFromDataService = false;
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listTags === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      const rows = await window.dataService.listTags();
      tagRows = Array.isArray(rows) ? rows : [];
      tagRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listTags', err);
      window.dataService.useSupabase = false;
      tagRows = [];
      tagRowsLoadedFromDataService = false;
    }
  }

  const isElectron = !!window.electronAPI;
  let db;
  if (isElectron) {
    try {
      const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
      const bytes = await window.electronAPI.loadDB(pathHint);
      const Uints = new Uint8Array(bytes);
      db = new SQL.Database(Uints);
    } catch (err) {
      console.error('❌ Failed to load DB from disk:', err);
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  } else {
    try {
      db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
    } catch (err) {
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  }

  window.dbInstance = db;
  if (window.dataService && typeof window.dataService.setSqliteDb === 'function') {
    window.dataService.setSqliteDb(db);
    if (favoriteEatsShouldUseSupabaseDataDoor()) {
      window.dataService.useSupabase = tagRowsLoadedFromDataService;
      console.info('[dataService] using Supabase adapter');
    }
  }
  await ensureIngredientLemmaMaintenanceInMain(db, isElectron);
  ensureRecipeTagsSchemaInMain(db);
  ensureIngredientVariantTagsSchemaInMain(db);

  const persistDb = async () => {
    await persistDbForCurrentRuntime(db, {
      isElectron,
      failureMessage: 'Failed to save DB.',
    });
  };

  const queryTags = async () => {
    try {
      return await window.dataService.listTags();
    } catch (err) {
      console.error('dataService.listTags failed:', err);
      uiToast('Failed to load tags.');
      return [];
    }
  };

  if (!tagRowsLoadedFromDataService) {
    tagRows = await queryTags();
  }

  const TAGS_COLLAPSE_KEYS = {
    recipes: 'tags-section-recipes',
    ingredients: 'tags-section-ingredients',
  };
  const collapsedTagsSections = new Set();

  const deleteTag = async (tag) => {
    if (!tag || !Number.isFinite(Number(tag.id))) return false;
    const ok = await uiConfirm({
      title: 'Delete Tag',
      message: `Delete "${tag.name}"?\n\nThis removes it from all recipes and ingredient variants.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return false;
    try {
      db.run('DELETE FROM tags WHERE id = ?;', [tag.id]);
      await persistDb();
      return true;
    } catch (err) {
      console.error('❌ Failed to delete tag:', err);
      uiToast('Failed to delete tag. See console.');
      return false;
    }
  };

  function renderTags(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      renderTopLevelEmptyState(list, 'tags');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);
    const appendSection = (
      label,
      collapseKey,
      headerModifierClass,
      sectionRows,
    ) => {
      const expanded = !collapsedTagsSections.has(collapseKey);
      const header = document.createElement('li');
      header.className = `list-section-label ${headerModifierClass}`;
      const toggleBtn = createSectionToggleButton({
        label,
        expanded,
        onToggle: () => {
          if (collapsedTagsSections.has(collapseKey)) {
            collapsedTagsSections.delete(collapseKey);
          } else {
            collapsedTagsSections.add(collapseKey);
          }
          renderTags(applyTagSearchFilter(tagRows));
        },
      });
      header.appendChild(toggleBtn);
      list.appendChild(header);
      if (!expanded) return;
      [...sectionRows]
        .sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''), undefined, {
            sensitivity: 'base',
          }),
        )
        .forEach((tag) => {
          const li = document.createElement('li');
          li.textContent = tag.name || '';
          li.addEventListener('click', (event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              event.stopPropagation();
              void (async () => {
                const ok = await deleteTag(tag);
                if (!ok) return;
                tagRows = await queryTags();
                renderTags(applyTagSearchFilter(tagRows));
              })();
              return;
            }
            sessionStorage.setItem('selectedTagId', String(tag.id));
            sessionStorage.setItem('selectedTagName', tag.name || '');
            sessionStorage.removeItem('selectedTagIsNew');
            sessionStorage.removeItem('selectedTagUseFor');
            window.location.href =
              favoriteEatsHrefWithCurrentAdapter('tagEditor.html');
          });
          li.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            void (async () => {
              const ok = await deleteTag(tag);
              if (!ok) return;
              tagRows = await queryTags();
              renderTags(applyTagSearchFilter(tagRows));
            })();
          });
          list.appendChild(li);
        });
    };
    appendSection(
      'Recipes',
      TAGS_COLLAPSE_KEYS.recipes,
      'shopping-list-section--recipes',
      items.filter(
        (tag) =>
          tag.hasRecipeUsage ||
          (!tag.hasIngredientUsage &&
            (tag.intendedUse || 'recipes') !== 'ingredients'),
      ),
    );
    appendSection(
      'Ingredients',
      TAGS_COLLAPSE_KEYS.ingredients,
      'tags-list-section--ingredients',
      items.filter(
        (tag) =>
          tag.hasIngredientUsage ||
          (!tag.hasRecipeUsage &&
            (tag.intendedUse || 'recipes') === 'ingredients'),
      ),
    );
    listNav?.syncAfterRender?.();
  }

  const applyTagSearchFilter = (rows) => {
    const q = (searchInput?.value || '').trim().toLowerCase();
    if (!q) return rows;
    return (rows || []).filter((row) =>
      String(row.name || '')
        .toLowerCase()
        .includes(q),
    );
  };

  const openCreateTagDialog = async () => {
    if (!window.ui) return;
    const findDuplicateTagIdByName = (rawName) => {
      const candidate = String(rawName || '').trim();
      if (!candidate) return null;
      const stmt = db.prepare(`
        SELECT id
        FROM tags
        WHERE lower(trim(name)) = lower(trim(?))
        LIMIT 1;
      `);
      try {
        stmt.bind([candidate]);
        if (!stmt.step()) return null;
        const row = stmt.get();
        if (!Array.isArray(row) || !row.length) return null;
        const id = Number(row[0]);
        return Number.isFinite(id) && id > 0 ? id : null;
      } catch (_) {
        return null;
      } finally {
        try {
          stmt.free();
        } catch (_) {}
      }
    };
    const vals = await window.ui.form({
      title: 'New Tag',
      fields: [
        {
          key: 'name',
          label: 'Name',
          value: '',
          required: true,
          normalize: (v) => String(v || '').trim(),
          validate: (nameVal) => {
            const clipped = String(nameVal || '')
              .trim()
              .slice(0, 48)
              .trim();
            if (!clipped) return '';
            const dupId = findDuplicateTagIdByName(clipped);
            if (!Number.isFinite(dupId)) return '';
            return `There is already a tag called "${clipped}". Please choose a unique name.`;
          },
        },
        {
          key: 'useFor',
          label: 'Use for',
          type: 'toggleGroup',
          value: 'recipes',
          options: [
            { value: 'recipes', label: 'Recipes' },
            { value: 'ingredients', label: 'Ingredients' },
          ],
        },
      ],
      confirmText: 'Create',
      cancelText: 'Cancel',
      validate: (v) => {
        const clipped = String(v.name || '')
          .trim()
          .slice(0, 48)
          .trim();
        if (!clipped) return 'Name is required.';
        return '';
      },
    });
    if (!vals) return;
    const name = String(vals.name || '')
      .trim()
      .slice(0, 48)
      .trim();
    if (!name) return;
    const useFor = vals.useFor === 'ingredients' ? 'ingredients' : 'recipes';
    try {
      const maxQ = db.exec(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags;',
      );
      const nextSort =
        maxQ.length && maxQ[0].values.length
          ? Number(maxQ[0].values[0][0]) || 1
          : 1;
      db.run(
        'INSERT INTO tags (name, sort_order, intended_use) VALUES (?, ?, ?);',
        [name, nextSort, useFor],
      );
      const idQ = db.exec('SELECT last_insert_rowid();');
      const newId =
        idQ.length && idQ[0].values.length ? Number(idQ[0].values[0][0]) : null;
      await persistDb();
      if (Number.isFinite(newId) && newId > 0) {
        const sectionKey =
          useFor === 'ingredients'
            ? TAGS_COLLAPSE_KEYS.ingredients
            : TAGS_COLLAPSE_KEYS.recipes;
        collapsedTagsSections.delete(sectionKey);
        tagRows = await queryTags();
        renderTags(applyTagSearchFilter(tagRows));
        return;
      }
      tagRows = await queryTags();
      renderTags(applyTagSearchFilter(tagRows));
    } catch (err) {
      console.error('❌ Failed to create tag:', err);
      uiToast('Failed to create tag. Please try again.');
    }
  };

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      void openCreateTagDialog();
    });
  }

  renderTags(tagRows);
}

function navigateShoppingListToIngredient({ id, name }) {
  const keys = window.favoriteEatsSessionKeys || {};
  const ingId = Number(id);
  const n = String(name || '').trim();
  try {
    if (Number.isFinite(ingId) && ingId > 0) {
      sessionStorage.setItem(
        keys.shoppingNavTargetId,
        String(Math.trunc(ingId)),
      );
      sessionStorage.setItem(keys.shoppingNavTargetName, n);
    } else if (n) {
      sessionStorage.removeItem(keys.shoppingNavTargetId);
      sessionStorage.setItem(keys.shoppingNavTargetName, n);
    } else {
      sessionStorage.removeItem(keys.shoppingNavTargetId);
      sessionStorage.removeItem(keys.shoppingNavTargetName);
    }
  } catch (_) {}
  window.location.href = favoriteEatsHrefWithCurrentAdapter('shopping.html');
}

function loadTagEditorPage() {
  const view = document.getElementById('pageContent');
  if (!view) return;

  const isNew = sessionStorage.getItem('selectedTagIsNew') === '1';
  const idStr = sessionStorage.getItem('selectedTagId');
  const tagId = Number(idStr);
  const storedName = sessionStorage.getItem('selectedTagName') || '';
  const titleDisplay = storedName || (isNew ? 'New tag' : 'Tag');
  const initialTitle = storedName || (isNew ? 'new tag' : 'tag');

  initAppBar({ mode: 'editor', titleText: titleDisplay });
  view.innerHTML = `
    <h1 id="childEditorTitle" class="recipe-title">${titleDisplay || ''}</h1>
    <div id="tagUsageCardMount"></div>
  `;
  const usageMount = document.getElementById('tagUsageCardMount');

  const renderRecipesForTag = (recipesListEl, rows) => {
    if (!recipesListEl) return;
    recipesListEl.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const span = document.createElement('span');
      span.className = 'placeholder-prompt';
      span.textContent = 'No recipes use this tag.';
      line.appendChild(span);
      recipesListEl.appendChild(line);
      return;
    }
    items.forEach((row) => {
      const recipeId = Number(row?.id);
      const title = String(row?.title || '').trim();
      if (!Number.isFinite(recipeId) || recipeId <= 0 || !title) return;
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = title;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (typeof window.openRecipe === 'function') {
          window.openRecipe(recipeId);
          return;
        }
        sessionStorage.setItem('selectedRecipeId', String(recipeId));
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
      });
      line.appendChild(link);
      recipesListEl.appendChild(line);
    });
    if (!recipesListEl.children.length) renderRecipesForTag(recipesListEl, []);
  };

  const renderIngredientsForTag = (listEl, rows) => {
    if (!listEl) return;
    listEl.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const span = document.createElement('span');
      span.className = 'placeholder-prompt';
      span.textContent = 'No ingredients use this tag.';
      line.appendChild(span);
      listEl.appendChild(line);
      return;
    }
    items.forEach((row) => {
      const ingredientId = Number(row?.ingredientId);
      const canonicalName = String(row?.ingredientName || '').trim();
      const label = String(row?.label || '').trim();
      if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !label) return;
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const link = document.createElement('a');
      link.href = 'shopping.html';
      link.textContent = label;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigateShoppingListToIngredient({
          id: ingredientId,
          name: canonicalName || label,
        });
      });
      line.appendChild(link);
      listEl.appendChild(line);
    });
    if (!listEl.children.length) renderIngredientsForTag(listEl, []);
  };

  const renderTagUsage = (usage) => {
    const mode = usage?.mode === 'ingredients' ? 'ingredients' : 'recipes';
    if (mode === 'ingredients') {
      usageMount.innerHTML = `
        <div id="tagRecipesCard" class="you-will-need-card" aria-label="Ingredients with this tag">
          <h2 class="section-header">INGREDIENTS</h2>
          <div id="tagRecipesList"></div>
        </div>`;
      renderIngredientsForTag(
        document.getElementById('tagRecipesList'),
        Array.isArray(usage?.ingredients) ? usage.ingredients : [],
      );
      return;
    }
    usageMount.innerHTML = `
      <div id="tagRecipesCard" class="you-will-need-card" aria-label="Recipes with this tag">
        <h2 class="section-header">RECIPES</h2>
        <div id="tagRecipesList"></div>
      </div>`;
    renderRecipesForTag(
      document.getElementById('tagRecipesList'),
      Array.isArray(usage?.recipes) ? usage.recipes : [],
    );
  };

  const loadTagUsageCard = async () => {
    if (!usageMount) return;

    let tagUsageLoadedFromDataService = false;
    let tagUsagePrefetch = null;
    if (
      favoriteEatsShouldUseSupabaseDataDoor() &&
      window.dataService &&
      typeof window.dataService.loadTagUsage === 'function'
    ) {
      window.dataService.useSupabase = true;
      try {
        tagUsagePrefetch = await window.dataService.loadTagUsage(tagId);
        tagUsageLoadedFromDataService = true;
      } catch (err) {
        favoriteEatsReportSupabasePrefetchFailure('loadTagUsage', err);
        tagUsagePrefetch = null;
        tagUsageLoadedFromDataService = false;
        window.dataService.useSupabase = false;
      }
    }

    const isElectron = !!window.electronAPI;
    let db;
    try {
      if (isElectron) {
        const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
        const bytes = await window.electronAPI.loadDB(pathHint);
        db = new SQL.Database(new Uint8Array(bytes));
      } else {
        db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
      }
    } catch (err) {
      console.warn('⚠️ Failed to load DB for tag usage card:', err);
      if (tagUsageLoadedFromDataService && tagUsagePrefetch != null) {
        renderTagUsage(tagUsagePrefetch);
        return;
      }
      usageMount.innerHTML = `
        <div id="tagRecipesCard" class="you-will-need-card" aria-label="Recipes with this tag">
          <h2 class="section-header">RECIPES</h2>
          <div id="tagRecipesList"></div>
        </div>`;
      renderRecipesForTag(document.getElementById('tagRecipesList'), []);
      return;
    }

    ensureRecipeTagsSchemaInMain(db);
    ensureIngredientVariantTagsSchemaInMain(db);
    window.dbInstance = db;
    if (window.dataService && typeof window.dataService.setSqliteDb === 'function') {
      window.dataService.setSqliteDb(db);
      if (favoriteEatsShouldUseSupabaseDataDoor()) {
        window.dataService.useSupabase = tagUsageLoadedFromDataService;
        console.info('[dataService] using Supabase adapter');
      }
    }

    if (tagUsageLoadedFromDataService && tagUsagePrefetch != null) {
      renderTagUsage(tagUsagePrefetch);
      return;
    }

    if (
      window.dataService &&
      typeof window.dataService.loadTagUsage === 'function'
    ) {
      try {
        renderTagUsage(await window.dataService.loadTagUsage(tagId));
        return;
      } catch (err) {
        console.error('dataService.loadTagUsage failed:', err);
      }
    }

    let tagUseMode = 'recipes';
    if (Number.isFinite(tagId) && tagId > 0) {
      try {
        const uq = db.exec(`
          SELECT COALESCE(NULLIF(lower(trim(intended_use)), ''), 'recipes') AS u
          FROM tags
          WHERE id = ${Math.trunc(tagId)}
          LIMIT 1;
        `);
        if (uq.length && uq[0].values && uq[0].values.length) {
          const raw = String(uq[0].values[0][0] || 'recipes');
          tagUseMode = raw === 'ingredients' ? 'ingredients' : 'recipes';
        }
      } catch (_) {}
    }

    if (tagUseMode === 'ingredients') {
      usageMount.innerHTML = `
        <div id="tagRecipesCard" class="you-will-need-card" aria-label="Ingredients with this tag">
          <h2 class="section-header">INGREDIENTS</h2>
          <div id="tagRecipesList"></div>
        </div>`;
      const listEl = document.getElementById('tagRecipesList');
      let rows = [];
      if (Number.isFinite(tagId) && tagId > 0) {
        try {
          const iq = db.exec(`
            SELECT i.ID,
                   i.name,
                   iv.variant
            FROM ingredient_variant_tag_map ivtm
            JOIN ingredient_variants iv ON iv.id = ivtm.ingredient_variant_id
            JOIN ingredients i ON i.ID = iv.ingredient_id
            WHERE ivtm.tag_id = ${Math.trunc(tagId)}
            ORDER BY i.name COLLATE NOCASE,
                     lower(trim(COALESCE(iv.variant, ''))) COLLATE NOCASE;
          `);
          rows = iq.length
            ? iq[0].values.map(([ingId, ingName, variant]) => {
                const nameStr = String(ingName || '').trim();
                const varStr = String(variant || '').trim();
                return {
                  ingredientId: Number(ingId),
                  ingredientName: nameStr,
                  label: getShoppingListIngredientLabel(nameStr, varStr),
                };
              })
            : [];
        } catch (err) {
          console.warn('⚠️ Failed to load ingredients for tag card:', err);
        }
      }
      renderIngredientsForTag(listEl, rows);
      return;
    }

    usageMount.innerHTML = `
      <div id="tagRecipesCard" class="you-will-need-card" aria-label="Recipes with this tag">
        <h2 class="section-header">RECIPES</h2>
        <div id="tagRecipesList"></div>
      </div>`;
    const recipesListEl = document.getElementById('tagRecipesList');
    let recipeRows = [];
    if (Number.isFinite(tagId) && tagId > 0) {
      try {
        const q = db.exec(`
          SELECT DISTINCT r.ID, r.title
          FROM recipe_tag_map m
          JOIN recipes r ON r.ID = m.recipe_id
          WHERE m.tag_id = ${Math.trunc(tagId)}
          ORDER BY r.title COLLATE NOCASE;
        `);
        recipeRows = q.length
          ? q[0].values.map(([id, title]) => ({
              id: Number(id),
              title: String(title || ''),
            }))
          : [];
      } catch (err) {
        console.warn('⚠️ Failed to load recipes for tag card:', err);
      }
    }
    renderRecipesForTag(recipesListEl, recipeRows);
  };
  void loadTagUsageCard();

  if (typeof waitForAppBarReady !== 'function') return;
  waitForAppBarReady().then(() => {
    wireChildEditorPage({
      backBtn: document.getElementById('appBarBackBtn'),
      cancelBtn: document.getElementById('appBarCancelBtn'),
      saveBtn: document.getElementById('appBarSaveBtn'),
      appBarTitleEl: document.getElementById('appBarTitle'),
      bodyTitleEl: document.getElementById('childEditorTitle'),
      initialTitle,
      backHref: 'tags.html',
      normalizeTitle: (s) =>
        String(s || '')
          .trim()
          .slice(0, 48),
      onSave: async ({ title: next }) => {
        const name = String(next || '')
          .trim()
          .slice(0, 48)
          .trim();
        if (!name) {
          uiToast('Tag name is required.');
          throw new Error('Tag name required');
        }

        const isElectron = !!window.electronAPI;
        let db;
        if (isElectron) {
          const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
          const bytes = await window.electronAPI.loadDB(pathHint);
          const Uints = new Uint8Array(bytes);
          db = new SQL.Database(Uints);
        } else {
          db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
        }
        ensureRecipeTagsSchemaInMain(db);
        ensureIngredientVariantTagsSchemaInMain(db);
        window.dbInstance = db;
        await ensureIngredientLemmaMaintenanceInMain(db, isElectron);

        const dupStmt = db.prepare(
          `SELECT id FROM tags
           WHERE lower(trim(name)) = lower(trim(?))
             AND (? IS NULL OR id != ?)
           LIMIT 1;`,
        );
        let hasDup = false;
        try {
          dupStmt.bind([
            name,
            Number.isFinite(tagId) ? tagId : null,
            Number.isFinite(tagId) ? tagId : null,
          ]);
          if (dupStmt.step()) hasDup = true;
        } finally {
          dupStmt.free();
        }
        if (hasDup) {
          uiToast('That tag already exists.');
          throw new Error('Duplicate tag');
        }

        if (Number.isFinite(tagId) && tagId > 0) {
          db.run('UPDATE tags SET name = ? WHERE id = ?;', [name, tagId]);
        } else {
          const maxQ = db.exec(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags;',
          );
          const nextSort =
            maxQ.length && maxQ[0].values.length
              ? Number(maxQ[0].values[0][0]) || 1
              : 1;
          db.run('INSERT INTO tags (name, sort_order) VALUES (?, ?);', [
            name,
            nextSort,
          ]);
          const idQ = db.exec('SELECT last_insert_rowid();');
          if (idQ.length && idQ[0].values.length) {
            sessionStorage.setItem(
              'selectedTagId',
              String(idQ[0].values[0][0]),
            );
          }
        }

        await persistDbForCurrentRuntime(db, {
          isElectron,
          failureMessage: 'Failed to save DB.',
        });
        sessionStorage.setItem('selectedTagName', name);
        sessionStorage.removeItem('selectedTagIsNew');
      },
    });
  });
}

async function loadSizesPage() {
  initAppBar({
    mode: 'list',
    titleText: 'Sizes',
    showAdd: true,
  });

  const list = document.getElementById('sizesList');
  if (!list) return;

  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: () => {
      applySizeFilters();
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');
  if (addBtn) ensureAppBarTextActionPair(addBtn, 'Add', 'add');

  const listNav = enableTopLevelListKeyboardNav(list);
  attachSecretGalleryShortcut(addBtn);

  let sizeRows = [];
  let sizeRowsLoadedFromDataService = false;
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listSizes === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      const rows = await window.dataService.listSizes();
      sizeRows = Array.isArray(rows) ? rows : [];
      sizeRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listSizes', err);
      window.dataService.useSupabase = false;
      sizeRows = [];
      sizeRowsLoadedFromDataService = false;
    }
  }

  const isElectron = !!window.electronAPI;
  let db;
  if (isElectron) {
    try {
      const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
      const bytes = await window.electronAPI.loadDB(pathHint);
      db = new SQL.Database(new Uint8Array(bytes));
    } catch (err) {
      console.error('❌ Failed to load DB from disk:', err);
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  } else {
    try {
      db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
    } catch (err) {
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  }

  window.dbInstance = db;
  if (window.dataService && typeof window.dataService.setSqliteDb === 'function') {
    window.dataService.setSqliteDb(db);
    if (favoriteEatsShouldUseSupabaseDataDoor()) {
      window.dataService.useSupabase = sizeRowsLoadedFromDataService;
      console.info('[dataService] using Supabase adapter');
    }
  }
  await ensureIngredientLemmaMaintenanceInMain(db, isElectron);
  ensureSizesSchemaInMain(db);

  const persistDb = async () => {
    await persistDbForCurrentRuntime(db, {
      isElectron,
      failureMessage: 'Failed to save DB.',
    });
  };

  const querySizes = async () => {
    try {
      return await window.dataService.listSizes();
    } catch (err) {
      console.error('dataService.listSizes failed:', err);
      uiToast('Failed to load sizes.');
      return [];
    }
  };

  if (!sizeRowsLoadedFromDataService) {
    sizeRows = await querySizes();
  }

  const sizeFilterChipDefs = [
    { id: 'hidden', label: 'hidden' },
    { id: 'removed', label: 'removed' },
  ];
  const activeSizeFilterChips = new Set();
  let sizeChipCounts = new Map();
  let sizeFilterChipRail = null;

  const recomputeSizeChipCounts = () => {
    const counts = new Map();
    sizeFilterChipDefs.forEach((chip) => counts.set(chip.id, 0));
    sizeRows.forEach((row) => {
      const state = getUnitSizeRowState(row);
      if (state.isHidden) counts.set('hidden', (counts.get('hidden') || 0) + 1);
      if (state.isRemoved)
        counts.set('removed', (counts.get('removed') || 0) + 1);
    });
    sizeChipCounts = counts;
  };

  const rerenderSizeFilterChips = () => {
    const chipMountEl = sizeFilterChipRail?.trackEl;
    if (!chipMountEl) return;
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips: sizeFilterChipDefs.map((chipDef) => {
        const count = Number(sizeChipCounts.get(chipDef.id) || 0);
        return {
          id: chipDef.id,
          label: chipDef.label,
          disabled: count <= 0,
        };
      }),
      activeChipIds: activeSizeFilterChips,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        const count = Number(sizeChipCounts.get(key) || 0);
        if (!key || count <= 0) return;
        if (activeSizeFilterChips.has(key)) activeSizeFilterChips.delete(key);
        else activeSizeFilterChips.add(key);
        rerenderSizeFilterChips();
        applySizeFilters();
      },
      chipClassName: 'app-filter-chip',
    });
  };

  const mountSizeFilterChips = () => {
    if (!searchInput) return;
    if (typeof window.mountTopFilterChipRail !== 'function') return;
    sizeFilterChipRail = window.mountTopFilterChipRail({
      anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
      dockId: 'sizeFilterChipDock',
    });
    recomputeSizeChipCounts();
    rerenderSizeFilterChips();
    sizeFilterChipRail?.sync?.();
  };

  const tableHasColumn = (tableName, colName) => {
    try {
      const q = db.exec(`PRAGMA table_info(${tableName});`);
      const cols =
        Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
          ? q[0].values
              .map((r) =>
                String((Array.isArray(r) ? r[1] : '') || '').toLowerCase(),
              )
              .filter(Boolean)
          : [];
      return cols.includes(String(colName || '').toLowerCase());
    } catch (_) {
      return false;
    }
  };
  const hasRimSize = tableHasColumn('recipe_ingredient_map', 'size');
  const hasRisSize = tableHasColumn('recipe_ingredient_substitutes', 'size');
  const hasIngSize = tableHasColumn('ingredients', 'size');

  const countRecipesUsingSize = (sizeName) => {
    const n = String(sizeName || '').trim();
    if (!n) return 0;
    const usageSelects = [];
    if (hasRimSize) {
      usageSelects.push(`
          SELECT recipe_id AS rid
          FROM recipe_ingredient_map
          WHERE lower(trim(COALESCE(size, ''))) = lower(trim(?))
      `);
    }
    if (hasIngSize) {
      usageSelects.push(`
          SELECT rim.recipe_id AS rid
          FROM recipe_ingredient_map rim
          JOIN ingredients i ON i.ID = rim.ingredient_id
          WHERE lower(trim(COALESCE(i.size, ''))) = lower(trim(?))
      `);
    }
    if (hasRisSize) {
      usageSelects.push(`
          SELECT rim.recipe_id AS rid
          FROM recipe_ingredient_substitutes ris
          JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
          WHERE lower(trim(COALESCE(ris.size, ''))) = lower(trim(?))
      `);
    }
    if (!usageSelects.length) return 0;
    const params = new Array(usageSelects.length).fill(n);
    try {
      const q = db.exec(
        `
        SELECT COUNT(DISTINCT rid) AS n
        FROM (
          ${usageSelects.join('\nUNION\n')}
        ) t;
        `,
        params,
      );
      if (q.length && q[0].values.length) {
        const v = Number(q[0].values[0][0]);
        return Number.isFinite(v) ? v : 0;
      }
    } catch (err) {
      console.warn('countRecipesUsingSize failed:', err);
    }
    return 0;
  };

  const getRecipesUsingSize = (sizeName) => {
    const n = String(sizeName || '').trim();
    if (!n) return [];
    const usageSelects = [];
    if (hasRimSize) {
      usageSelects.push(`
          SELECT recipe_id AS rid
          FROM recipe_ingredient_map
          WHERE lower(trim(COALESCE(size, ''))) = lower(trim(?))
      `);
    }
    if (hasIngSize) {
      usageSelects.push(`
          SELECT rim.recipe_id AS rid
          FROM recipe_ingredient_map rim
          JOIN ingredients i ON i.ID = rim.ingredient_id
          WHERE lower(trim(COALESCE(i.size, ''))) = lower(trim(?))
      `);
    }
    if (hasRisSize) {
      usageSelects.push(`
          SELECT rim.recipe_id AS rid
          FROM recipe_ingredient_substitutes ris
          JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
          WHERE lower(trim(COALESCE(ris.size, ''))) = lower(trim(?))
      `);
    }
    if (!usageSelects.length) return [];
    const params = new Array(usageSelects.length).fill(n);
    try {
      const q = db.exec(
        `
        SELECT r.ID, r.title
        FROM recipes r
        JOIN (
          ${usageSelects.join('\nUNION\n')}
        ) refs ON refs.rid = r.ID
        ORDER BY r.title COLLATE NOCASE;
        `,
        params,
      );
      if (!q.length || !q[0].values.length) return [];
      return q[0].values
        .map(([recipeId, recipeTitle]) => ({
          id: Number(recipeId),
          title: String(recipeTitle || '').trim(),
        }))
        .filter((row) => Number.isFinite(row.id) && row.id > 0);
    } catch (err) {
      console.warn('getRecipesUsingSize failed:', err);
      return [];
    }
  };

  const removeSize = async (sizeRow) => {
    if (!sizeRow || !Number.isFinite(Number(sizeRow.id))) return false;
    const name = String(sizeRow.name || '').trim();
    const usedCount = countRecipesUsingSize(name);

    if (usedCount > 0) {
      const recipes = getRecipesUsingSize(name);
      const usageLine =
        usedCount === 1
          ? 'This size is used in this recipe:'
          : 'This size is used in these recipes:';
      const details = document.createElement('div');
      details.className = 'shopping-remove-dialog-details';

      const linksWrap = document.createElement('div');
      linksWrap.className = 'shopping-remove-dialog-links';
      recipes.forEach((recipe) => {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'shopping-remove-dialog-link';
        a.textContent = recipe.title || `Recipe ${recipe.id}`;
        a.addEventListener('click', (event) => {
          event.preventDefault();
          if (typeof window.openRecipe === 'function') {
            window.openRecipe(recipe.id);
          }
        });
        linksWrap.appendChild(a);
      });
      if (recipes.length) details.appendChild(linksWrap);

      const note = document.createElement('div');
      note.className = 'shopping-remove-dialog-note';
      note.textContent = `Removing marks this size as removed and blocks it from new selections, but keeps existing recipe references intact.`;
      details.appendChild(note);

      let ok = false;
      if (window.ui && typeof window.ui.dialog === 'function') {
        const res = await window.ui.dialog({
          title: 'Remove Size',
          message: `Remove "${name}"? ${usageLine}`,
          messageNode: details,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
        ok = !!res;
      } else {
        ok = await uiConfirm({
          title: 'Remove Size',
          message: `Remove "${name}"? ${usageLine}\n\nRemoving marks it as removed and blocks it from new selections.`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
      }
      if (!ok) return false;

      try {
        db.run('UPDATE sizes SET is_removed = 1 WHERE id = ?;', [sizeRow.id]);
      } catch (err) {
        console.error('❌ Failed to remove size:', err);
        uiToast('Failed to remove size. See console.');
        return false;
      }
    } else {
      const ok = await uiConfirm({
        title: 'Delete Size',
        message: `Remove "${name}" permanently?\n\nIt isn't used in any recipes. This will permanently delete it from the database.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true,
      });
      if (!ok) return false;
      try {
        db.run('DELETE FROM sizes WHERE id = ?;', [sizeRow.id]);
      } catch (err) {
        console.error('❌ Failed to delete size:', err);
        uiToast('Failed to delete size. See console.');
        return false;
      }
    }

    try {
      await persistDb();
      return true;
    } catch (err) {
      console.error('❌ Failed to save DB after size remove/delete:', err);
      uiToast('Failed to save changes. See console.');
      return false;
    }
  };

  function renderSizes(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      renderTopLevelEmptyState(list, 'sizes');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);
    items.forEach((sizeRow) => {
      const li = document.createElement('li');
      if (getUnitSizeRowState(sizeRow).isRemoved)
        li.classList.add('list-item--removed');
      li.textContent = sizeRow.name || '';
      li.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          void (async () => {
            const ok = await removeSize(sizeRow);
            if (!ok) return;
            sizeRows = await querySizes();
            recomputeSizeChipCounts();
            rerenderSizeFilterChips();
            applySizeFilters();
          })();
          return;
        }
        sessionStorage.setItem('selectedSizeId', String(sizeRow.id));
        sessionStorage.setItem('selectedSizeName', sizeRow.name || '');
        sessionStorage.setItem(
          'selectedSizeIsHidden',
          sizeRow.isHidden ? '1' : '0',
        );
        sessionStorage.setItem(
          'selectedSizeIsRemoved',
          sizeRow.isRemoved ? '1' : '0',
        );
        sessionStorage.removeItem('selectedSizeIsNew');
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('sizeEditor.html');
      });
      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        void (async () => {
          const ok = await removeSize(sizeRow);
          if (!ok) return;
          sizeRows = await querySizes();
          recomputeSizeChipCounts();
          rerenderSizeFilterChips();
          applySizeFilters();
        })();
      });
      list.appendChild(li);
    });
    listNav?.syncAfterRender?.();
  }

  const applySizeSearchFilter = (rows) => {
    const q = (searchInput?.value || '').trim().toLowerCase();
    return (rows || []).filter((row) => {
      if (!shouldShowUnitSizeRow(row, activeSizeFilterChips)) return false;
      return (
        !q ||
        String(row.name || '')
          .toLowerCase()
          .includes(q)
      );
    });
  };

  const openCreateSizeDialog = async () => {
    if (!window.ui) return;
    const vals = await window.ui.form({
      title: 'New Size',
      fields: [
        {
          key: 'name',
          label: 'Name',
          value: '',
          required: true,
          normalize: (v) =>
            String(v || '')
              .trim()
              .replace(/\s+/g, ' '),
        },
      ],
      confirmText: 'Create',
      cancelText: 'Cancel',
      validate: (v) => {
        const clipped = String(v.name || '')
          .trim()
          .slice(0, 64)
          .trim();
        if (!clipped) return 'Name is required.';
        return '';
      },
    });
    if (!vals) return;
    const name = String(vals.name || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 64)
      .trim();
    if (!name) return;
    try {
      const maxQ = db.exec(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM sizes;',
      );
      const nextSort =
        maxQ.length && maxQ[0].values.length
          ? Number(maxQ[0].values[0][0]) || 1
          : 1;
      db.run(
        'INSERT INTO sizes (name, sort_order, is_hidden, is_removed) VALUES (?, ?, 0, 0);',
        [name, nextSort],
      );
      const idQ = db.exec('SELECT last_insert_rowid();');
      const newId =
        idQ.length && idQ[0].values.length ? Number(idQ[0].values[0][0]) : null;
      await persistDb();
      if (Number.isFinite(newId) && newId > 0) {
        sessionStorage.setItem('selectedSizeId', String(newId));
        sessionStorage.setItem('selectedSizeName', name);
        sessionStorage.setItem('selectedSizeIsHidden', '0');
        sessionStorage.setItem('selectedSizeIsRemoved', '0');
        sessionStorage.setItem('selectedSizeIsNew', '1');
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('sizeEditor.html');
        return;
      }
      sizeRows = await querySizes();
      recomputeSizeChipCounts();
      rerenderSizeFilterChips();
      renderSizes(applySizeSearchFilter(sizeRows));
    } catch (err) {
      console.error('❌ Failed to create size:', err);
      uiToast('Failed to create size. Name must be unique.');
    }
  };

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      void openCreateSizeDialog();
    });
  }

  const applySizeFilters = () => {
    renderSizes(applySizeSearchFilter(sizeRows));
  };

  mountSizeFilterChips();
  applySizeFilters();
}

function loadSizeEditorPage() {
  const view = document.getElementById('pageContent');
  if (!view) return;

  const isNew = sessionStorage.getItem('selectedSizeIsNew') === '1';
  const idStr = sessionStorage.getItem('selectedSizeId');
  const sizeId = Number(idStr);
  const storedName = sessionStorage.getItem('selectedSizeName') || '';
  const initialHidden = sessionStorage.getItem('selectedSizeIsHidden') === '1';
  const initialRemoved =
    sessionStorage.getItem('selectedSizeIsRemoved') === '1';
  const titleDisplay = storedName || (isNew ? 'New size' : 'Size');
  const initialTitle = storedName || (isNew ? 'new size' : 'size');

  initAppBar({ mode: 'editor', titleText: titleDisplay });
  view.innerHTML = `
    <h1 id="childEditorTitle" class="recipe-title">${titleDisplay || ''}</h1>
    <div class="shopping-item-status" style="margin-top: 20px;">
      <div class="shopping-item-status-row">
        <label class="shopping-item-toggle">
          <input id="sizeIsHiddenToggle" type="checkbox" ${initialHidden ? 'checked' : ''} />
          <span>Hidden</span>
        </label>
      </div>
      <div class="shopping-item-status-row">
        <label class="shopping-item-toggle">
          <input id="sizeIsRemovedToggle" type="checkbox" ${initialRemoved ? 'checked' : ''} />
          <span>Removed</span>
        </label>
      </div>
    </div>
  `;

  if (typeof waitForAppBarReady !== 'function') return;
  waitForAppBarReady().then(() => {
    wireChildEditorPage({
      backBtn: document.getElementById('appBarBackBtn'),
      cancelBtn: document.getElementById('appBarCancelBtn'),
      saveBtn: document.getElementById('appBarSaveBtn'),
      appBarTitleEl: document.getElementById('appBarTitle'),
      bodyTitleEl: document.getElementById('childEditorTitle'),
      initialTitle,
      backHref: 'sizes.html',
      normalizeTitle: (s) =>
        String(s || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 64),
      onSave: async ({ title: next }) => {
        const name = String(next || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 64)
          .trim();
        if (!name) {
          uiToast('Size name is required.');
          throw new Error('Size name required');
        }

        const isElectron = !!window.electronAPI;
        let db;
        if (isElectron) {
          const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
          const bytes = await window.electronAPI.loadDB(pathHint);
          db = new SQL.Database(new Uint8Array(bytes));
        } else {
          db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
        }
        ensureSizesSchemaInMain(db);
        window.dbInstance = db;
        await ensureIngredientLemmaMaintenanceInMain(db, isElectron);

        const tableHasColumn = (tableName, colName) => {
          try {
            const q = db.exec(`PRAGMA table_info(${tableName});`);
            const cols =
              Array.isArray(q) && q.length > 0 && Array.isArray(q[0].values)
                ? q[0].values
                    .map((r) =>
                      String(
                        (Array.isArray(r) ? r[1] : '') || '',
                      ).toLowerCase(),
                    )
                    .filter(Boolean)
                : [];
            return cols.includes(String(colName || '').toLowerCase());
          } catch (_) {
            return false;
          }
        };

        const dupStmt = db.prepare(
          `SELECT id FROM sizes
           WHERE lower(trim(name)) = lower(trim(?))
             AND (? IS NULL OR id != ?)
           LIMIT 1;`,
        );
        let hasDup = false;
        try {
          dupStmt.bind([
            name,
            Number.isFinite(sizeId) ? sizeId : null,
            Number.isFinite(sizeId) ? sizeId : null,
          ]);
          if (dupStmt.step()) hasDup = true;
        } finally {
          dupStmt.free();
        }
        if (hasDup) {
          uiToast('That size already exists.');
          throw new Error('Duplicate size');
        }

        const oldName = String(storedName || '').trim();
        const isHidden = document.getElementById('sizeIsHiddenToggle')?.checked
          ? 1
          : 0;
        const isRemoved = document.getElementById('sizeIsRemovedToggle')
          ?.checked
          ? 1
          : 0;
        if (Number.isFinite(sizeId) && sizeId > 0) {
          db.run(
            'UPDATE sizes SET name = ?, is_hidden = ?, is_removed = ? WHERE id = ?;',
            [name, isHidden, isRemoved, sizeId],
          );
        } else {
          const maxQ = db.exec(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM sizes;',
          );
          const nextSort =
            maxQ.length && maxQ[0].values.length
              ? Number(maxQ[0].values[0][0]) || 1
              : 1;
          db.run(
            'INSERT INTO sizes (name, sort_order, is_hidden, is_removed) VALUES (?, ?, ?, ?);',
            [name, nextSort, isHidden, isRemoved],
          );
          const idQ = db.exec('SELECT last_insert_rowid();');
          if (idQ.length && idQ[0].values.length) {
            sessionStorage.setItem(
              'selectedSizeId',
              String(idQ[0].values[0][0]),
            );
          }
        }

        if (oldName && oldName.toLowerCase() !== name.toLowerCase()) {
          try {
            if (tableHasColumn('ingredients', 'size')) {
              db.run(
                `UPDATE ingredients
                 SET size = ?
                 WHERE lower(trim(size)) = lower(trim(?));`,
                [name, oldName],
              );
            }
          } catch (_) {}
          try {
            if (tableHasColumn('ingredient_sizes', 'size')) {
              db.run(
                `UPDATE ingredient_sizes
                 SET size = ?
                 WHERE lower(trim(size)) = lower(trim(?));`,
                [name, oldName],
              );
            }
          } catch (_) {}
          try {
            if (tableHasColumn('recipe_ingredient_substitutes', 'size')) {
              db.run(
                `UPDATE recipe_ingredient_substitutes
                 SET size = ?
                 WHERE lower(trim(size)) = lower(trim(?));`,
                [name, oldName],
              );
            }
          } catch (_) {}
        }

        await persistDbForCurrentRuntime(db, {
          isElectron,
          failureMessage: 'Failed to save DB.',
        });
        sessionStorage.setItem('selectedSizeName', name);
        sessionStorage.setItem('selectedSizeIsHidden', String(isHidden));
        sessionStorage.setItem('selectedSizeIsRemoved', String(isRemoved));
        sessionStorage.removeItem('selectedSizeIsNew');
      },
    });
  });
}

/** Recipes that reference a specific ingredient + variant (rim + substitutes). */
function getRecipesForIngredientVariant(db, ingredientId, variantName) {
  const iid = Number(ingredientId);
  const v = String(variantName || '').trim();
  if (!db || !Number.isFinite(iid) || iid <= 0 || !v) return [];
  try {
    const q = db.exec(
      `
      SELECT DISTINCT r.ID AS recipe_id, COALESCE(r.title, '') AS recipe_title
      FROM recipes r
      JOIN (
        SELECT rim.recipe_id AS rid
        FROM recipe_ingredient_map rim
        WHERE rim.ingredient_id = ?
          AND lower(trim(COALESCE(rim.variant, ''))) = lower(trim(?))
        UNION
        SELECT rim.recipe_id AS rid
        FROM recipe_ingredient_substitutes ris
        JOIN recipe_ingredient_map rim ON rim.ID = ris.recipe_ingredient_id
        WHERE ris.ingredient_id = ?
          AND lower(trim(COALESCE(ris.variant, ''))) = lower(trim(?))
      ) refs ON refs.rid = r.ID
      ORDER BY r.title COLLATE NOCASE;
      `,
      [iid, v, iid, v],
    );
    if (!q.length || !q[0].values.length) return [];
    return q[0].values
      .map(([recipeId, recipeTitle]) => ({
        id: Number(recipeId),
        title: String(recipeTitle || '').trim(),
      }))
      .filter((row) => Number.isFinite(row.id) && row.id > 0);
  } catch (err) {
    console.warn('getRecipesForIngredientVariant failed:', err);
    return [];
  }
}

function countRecipeRefsForIngredientVariant(db, ingredientId, variantName) {
  return getRecipesForIngredientVariant(db, ingredientId, variantName).length;
}

/**
 * Store aisles that reference a named variant (variant–aisle links only).
 * @returns {{ storeId: number, chainName: string, locationName: string, aisleId: number, aisleName: string }[]}
 */
function getAislePlacementsForIngredientVariant(db, ingredientId, variantName) {
  const iid = Number(ingredientId);
  const v = String(variantName || '').trim();
  if (!db || !Number.isFinite(iid) || iid <= 0 || !v) return [];
  try {
    const q = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='ingredient_variant_store_location';`,
    );
    if (!q.length || !q[0].values || !q[0].values.length) return [];
    const rowsQ = db.exec(
      `
      SELECT DISTINCT
        s.ID AS store_id,
        COALESCE(s.chain_name, '') AS chain_name,
        COALESCE(s.location_name, '') AS location_name,
        sl.ID AS aisle_id,
        COALESCE(sl.name, '') AS aisle_name
      FROM ingredient_variant_store_location ivsl
      JOIN ingredient_variants iv ON iv.id = ivsl.ingredient_variant_id
      JOIN store_locations sl ON sl.ID = ivsl.store_location_id
      JOIN stores s ON s.ID = sl.store_id
      WHERE iv.ingredient_id = ?
        AND lower(trim(iv.variant)) = lower(trim(?))
      ORDER BY COALESCE(s.chain_name, '') COLLATE NOCASE,
               COALESCE(s.location_name, '') COLLATE NOCASE,
               COALESCE(sl.sort_order, 999999),
               sl.ID;
      `,
      [iid, v],
    );
    if (!rowsQ.length || !rowsQ[0].values.length) return [];
    return rowsQ[0].values
      .map((row) => {
        if (!Array.isArray(row) || row.length < 5) return null;
        const storeId = Number(row[0]);
        const aisleId = Number(row[3]);
        if (!Number.isFinite(storeId) || storeId <= 0) return null;
        if (!Number.isFinite(aisleId) || aisleId <= 0) return null;
        return {
          storeId,
          chainName: String(row[1] || '').trim(),
          locationName: String(row[2] || '').trim(),
          aisleId,
          aisleName: String(row[4] || '').trim(),
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.warn('getAislePlacementsForIngredientVariant failed:', err);
    return [];
  }
}

/**
 * Recipes + aisles link ledger for variant usage dialogs (remove / delete blocked).
 * @param {{ id: number, title: string }[]} recipes
 * @param {{ storeId: number, chainName: string, locationName: string, aisleId: number, aisleName: string }[]} aislePlacements
 * @returns {HTMLDivElement}
 */
function createVariantUsageLedgerNode(recipes, aislePlacements) {
  const details = document.createElement('div');
  details.className = 'shopping-remove-dialog-details';
  const refCount = Array.isArray(recipes) ? recipes.length : 0;
  const aisleCount = Array.isArray(aislePlacements) ? aislePlacements.length : 0;
  if (refCount > 0) {
    const recipesHeading = document.createElement('div');
    recipesHeading.className = 'shopping-remove-dialog-section-heading';
    recipesHeading.textContent = 'Recipes';
    details.appendChild(recipesHeading);
    const linksWrap = document.createElement('div');
    linksWrap.className = 'shopping-remove-dialog-links';
    recipes.forEach((recipe) => {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'shopping-remove-dialog-link';
      a.textContent = recipe.title || `Recipe ${recipe.id}`;
      a.addEventListener('click', (event) => {
        event.preventDefault();
        if (typeof window.openRecipe === 'function') {
          window.openRecipe(recipe.id);
        }
      });
      linksWrap.appendChild(a);
    });
    details.appendChild(linksWrap);
  }
  if (aisleCount > 0) {
    const aislesHeading = document.createElement('div');
    aislesHeading.className = 'shopping-remove-dialog-section-heading';
    aislesHeading.textContent = 'Aisles';
    details.appendChild(aislesHeading);
    const aisleLinksWrap = document.createElement('div');
    aisleLinksWrap.className = 'shopping-remove-dialog-links';
    aislePlacements.forEach((placement) => {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'shopping-remove-dialog-link';
      const aisleLabel =
        String(placement.aisleName || '').trim() ||
        `Aisle ${placement.aisleId}`;
      const storeBits = [
        String(placement.chainName || '').trim(),
        String(placement.locationName || '').trim(),
      ].filter(Boolean);
      const storeLabel = storeBits.length ? storeBits.join(', ') : 'Store';
      a.textContent = `${aisleLabel} (${storeLabel})`;
      a.addEventListener('click', (event) => {
        event.preventDefault();
        if (typeof window.openStoreAisle === 'function') {
          window.openStoreAisle(
            placement.storeId,
            placement.aisleId,
            placement.chainName,
            placement.locationName,
          );
        }
      });
      aisleLinksWrap.appendChild(a);
    });
    details.appendChild(aisleLinksWrap);
  }
  return details;
}

/** Plain-text fallback for variant usage ledger (native alert / no rich UI). */
function formatVariantUsageLedgerPlainText(recipes, aislePlacements) {
  const refCount = Array.isArray(recipes) ? recipes.length : 0;
  const aisleCount = Array.isArray(aislePlacements) ? aislePlacements.length : 0;
  const recipeLines =
    refCount > 0
      ? `\n\nRecipes\n${recipes.map((r) => `• ${r.title || `Recipe ${r.id}`}`).join('\n')}`
      : '';
  const aisleLines =
    aisleCount > 0
      ? `\n\nAisles\n${aislePlacements
          .map((p) => {
            const aisleLabel =
              String(p.aisleName || '').trim() || `Aisle ${p.aisleId}`;
            const storeBits = [
              String(p.chainName || '').trim(),
              String(p.locationName || '').trim(),
            ].filter(Boolean);
            const storeLabel = storeBits.length ? storeBits.join(', ') : 'Store';
            return `• ${aisleLabel} (${storeLabel})`;
          })
          .join('\n')}`
      : '';
  return `${recipeLines}${aisleLines}`;
}

async function loadStoresPage() {
  initAppBar({
    mode: 'list',
    titleText: 'Stores',
  });

  const list = document.getElementById('storesList');

  // App bar is injected async; wait before wiring menu/search/add.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: (query) => {
      const selectedStoreId = getSelectedVisibleStoreId();
      searchQuery = String(query || '').toLowerCase();
      rerenderFilteredStores({
        selectedStoreId,
        clearSelectionWhenMissing: true,
      });
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');

  if (!list) return;

  // Keyboard behavior:
  // - Enter is no-op
  // - Cmd+↑/↓ reorders when a row has red selection (hijacks top-level tab shortcut)
  // - Escape clears the current selection
  const listNav = enableTopLevelListKeyboardNav(list, {
    requireExistingSelectionForArrows: true,
    disableArrowNavigation: true,
    disableEnterActivation: true,
    disableHoverSelection: true,
    toggleSelectionOnClick: true,
    clearSelectionOnOutsidePointerDown: true,
    clearSelectionOnOutsideFocus: true,
    clearSelectionOnWindowBlur: true,
    clearSelectionOnEscape: true,
  });

  let storeRows = [];
  let storeRowsLoadedFromDataService = false;
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listStores === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      const rows = await window.dataService.listStores();
      storeRows = Array.isArray(rows) ? rows : [];
      storeRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listStores', err);
      window.dataService.useSupabase = false;
      storeRows = [];
      storeRowsLoadedFromDataService = false;
    }
  }

  // --- Load DB (mirror recipe loaders) ---
  const isElectron = !!window.electronAPI;
  let db;

  if (isElectron) {
    try {
      const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
      const bytes = await window.electronAPI.loadDB(pathHint);
      const Uints = new Uint8Array(bytes);
      db = new SQL.Database(Uints);
    } catch (err) {
      console.error('❌ Failed to load DB from disk:', err);
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  } else {
    try {
      db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
    } catch (err) {
      uiToast('No database loaded. Please go back to the welcome page.');
      window.location.href = 'index.html';
      return;
    }
  }

  // Expose DB globally for any future helpers
  window.dbInstance = db;
  if (window.dataService && typeof window.dataService.setSqliteDb === 'function') {
    window.dataService.setSqliteDb(db);
    if (favoriteEatsShouldUseSupabaseDataDoor()) {
      window.dataService.useSupabase = storeRowsLoadedFromDataService;
      console.info('[dataService] using Supabase adapter');
    }
  }
  await ensureIngredientLemmaMaintenanceInMain(db, isElectron);

  const queryStores = async () => {
    try {
      return await window.dataService.listStores();
    } catch (err) {
      console.error('dataService.listStores failed:', err);
      uiToast('Failed to load stores.');
      return [];
    }
  };

  if (!storeRowsLoadedFromDataService) {
    storeRows = await queryStores();
  }
  const defaultStoreRows = storeRows.slice();
  const orderStoreRowsFromPlan = (rows) => {
    const normalizedRows = Array.isArray(rows) ? rows.slice() : [];
    const persistedOrder = getShoppingPlanStoreOrder();
    if (!persistedOrder.length) return normalizedRows;
    const rowsById = new Map();
    normalizedRows.forEach((row) => {
      const rowId = Number(row?.id);
      if (!Number.isFinite(rowId) || rowId <= 0) return;
      rowsById.set(rowId, row);
    });
    const orderedRows = [];
    persistedOrder.forEach((storeId) => {
      const row = rowsById.get(storeId);
      if (!row) return;
      orderedRows.push(row);
      rowsById.delete(storeId);
    });
    normalizedRows.forEach((row) => {
      const rowId = Number(row?.id);
      if (!rowsById.has(rowId)) return;
      orderedRows.push(row);
      rowsById.delete(rowId);
    });
    return orderedRows;
  };
  storeRows = orderStoreRowsFromPlan(storeRows);
  const getExistingStoreIds = () =>
    new Set(
      storeRows
        .map((row) => Math.trunc(Number(row?.id)))
        .filter((storeId) => Number.isFinite(storeId) && storeId > 0),
    );
  const checkedStoreIds = new Set(
    getShoppingPlanSelectedStoreIds().filter((storeId) =>
      getExistingStoreIds().has(storeId),
    ),
  );
  const getStoreOrderIds = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((row) => Math.trunc(Number(row?.id)))
      .filter((storeId) => Number.isFinite(storeId) && storeId > 0);
  const isAtDefaultStoreOrder = () => {
    const currentIds = getStoreOrderIds(storeRows);
    const defaultIds = getStoreOrderIds(defaultStoreRows);
    if (currentIds.length !== defaultIds.length) return false;
    for (let idx = 0; idx < currentIds.length; idx += 1) {
      if (currentIds[idx] !== defaultIds[idx]) return false;
    }
    return true;
  };
  const canResetStoreSelections = () =>
    checkedStoreIds.size > 0 || !isAtDefaultStoreOrder();
  let searchQuery = '';
  const isStoreWebSelectMode = () => isForceWebModeEnabled();
  const syncStoresResetButtonState = () => {
    if (!(addBtn instanceof HTMLButtonElement)) return;
    if (!isStoreWebSelectMode()) {
      addBtn.disabled = false;
      addBtn.setAttribute('aria-disabled', 'false');
      return;
    }
    const canReset = canResetStoreSelections();
    addBtn.disabled = !canReset;
    addBtn.setAttribute('aria-disabled', canReset ? 'false' : 'true');
  };
  const persistCurrentStoreOrder = () =>
    setShoppingPlanStoreOrder(
      storeRows
        .map((row) => Math.trunc(Number(row?.id)))
        .filter((storeId) => Number.isFinite(storeId) && storeId > 0),
    );
  const persistCheckedStoreSelections = () =>
    setShoppingPlanSelectedStoreIds(
      Array.from(checkedStoreIds).filter((storeId) =>
        getExistingStoreIds().has(storeId),
      ),
    );
  const persistStoresDb = async (reasonLabel) => {
    try {
      await persistDbForCurrentRuntime(db, {
        isElectron,
        failureMessage: `Failed to save DB after ${reasonLabel}.`,
      });
      return true;
    } catch (err) {
      console.error(`❌ Failed to persist DB after ${reasonLabel}:`, err);
      return false;
    }
  };
  persistCurrentStoreOrder();
  persistCheckedStoreSelections();

  const getFilteredStoreRows = () => {
    const q = searchQuery;
    if (!q) return storeRows;
    return storeRows.filter((store) => {
      const chain = String(store?.chain || '').toLowerCase();
      const location = String(store?.location || '').toLowerCase();
      return chain.includes(q) || location.includes(q);
    });
  };

  const syncStoreRowVisualState = (rowEl, storeId) => {
    if (!(rowEl instanceof HTMLElement)) return;
    const isChecked = checkedStoreIds.has(Number(storeId));
    rowEl.classList.toggle(
      'shopping-row-checked',
      isStoreWebSelectMode() && isChecked,
    );
    const icon = rowEl.querySelector('.shopping-list-row-icon');
    if (icon) {
      icon.textContent = isChecked ? 'check_box' : 'check_box_outline_blank';
    }
  };

  const swapStoreRowsById = (sourceId, targetId) => {
    const sourceIdx = storeRows.findIndex(
      (row) => Number(row?.id) === Number(sourceId),
    );
    const targetIdx = storeRows.findIndex(
      (row) => Number(row?.id) === Number(targetId),
    );
    if (sourceIdx < 0 || targetIdx < 0 || sourceIdx === targetIdx) return false;
    const nextRows = storeRows.slice();
    [nextRows[sourceIdx], nextRows[targetIdx]] = [
      nextRows[targetIdx],
      nextRows[sourceIdx],
    ];
    storeRows = nextRows;
    persistCurrentStoreOrder();
    return true;
  };

  let activeStoreDrag = null;
  let suppressStoreListClickUntil = 0;

  const getVisibleStoreIndexById = (storeId) =>
    getFilteredStoreRows().findIndex(
      (row) => Number(row?.id) === Number(storeId),
    );

  const isStoreReorderDragEnabled = () =>
    isStoreWebSelectMode() && !searchQuery && getFilteredStoreRows().length > 1;

  const isStoreRowDragExcludedTarget = (event, rowEl) => {
    if (!(event instanceof PointerEvent) || !(rowEl instanceof HTMLElement)) {
      return false;
    }
    const targetEl = event.target;
    if (!(targetEl instanceof Element)) return false;
    if (
      targetEl.closest(
        '.shopping-list-row-icon, button, a, input, label, textarea, select',
      )
    ) {
      return true;
    }
    const rowRect = rowEl.getBoundingClientRect();
    const checkboxExclusionPx = 48;
    return rowRect.right - event.clientX <= checkboxExclusionPx;
  };

  const getStoreRowElementById = (storeId) =>
    list.querySelector(`[data-store-id="${Number(storeId)}"]`);

  const clearStoreDragVisualState = () => {
    list
      .querySelectorAll('.store-row-dragging, .store-row-drag-source')
      .forEach((rowEl) => {
        rowEl.classList.remove('store-row-dragging', 'store-row-drag-source');
        rowEl.style.transform = '';
      });
    list
      .querySelectorAll('.shopping-list-row-handle--dragging')
      .forEach((handleEl) =>
        handleEl.classList.remove('shopping-list-row-handle--dragging'),
      );
  };

  const measureActiveStoreDragThreshold = () => {
    if (!activeStoreDrag) return 0;
    const rowEl = getStoreRowElementById(activeStoreDrag.storeId);
    if (!(rowEl instanceof HTMLElement))
      return activeStoreDrag.thresholdPx || 0;
    const rect = rowEl.getBoundingClientRect();
    const nextThreshold = Math.max(rect.height * 0.5, 24);
    activeStoreDrag.thresholdPx = nextThreshold;
    return nextThreshold;
  };

  const syncActiveStoreDragVisualState = () => {
    clearStoreDragVisualState();
    if (!activeStoreDrag || !isStoreReorderDragEnabled()) return;
    const rowEl = getStoreRowElementById(activeStoreDrag.storeId);
    if (!(rowEl instanceof HTMLElement)) return;
    rowEl.classList.add('store-row-dragging', 'store-row-drag-source');
    rowEl.style.transform = `translateY(${Math.round(activeStoreDrag.offsetY || 0)}px)`;
    const handleEl = rowEl.querySelector('.shopping-list-row-handle');
    handleEl?.classList?.add('shopping-list-row-handle--dragging');
  };

  const detachStoreDragListeners = () => {
    if (!activeStoreDrag) return;
    document.removeEventListener(
      'pointermove',
      activeStoreDrag.onPointerMove,
      true,
    );
    document.removeEventListener(
      'pointerup',
      activeStoreDrag.onPointerUp,
      true,
    );
    document.removeEventListener(
      'pointercancel',
      activeStoreDrag.onPointerCancel,
      true,
    );
    window.removeEventListener('blur', activeStoreDrag.onWindowBlur);
  };

  const finishActiveStoreDrag = ({ suppressClick = false } = {}) => {
    if (!activeStoreDrag) return;
    try {
      activeStoreDrag.dragSourceEl?.releasePointerCapture?.(
        activeStoreDrag.pointerId,
      );
    } catch (_) {}
    detachStoreDragListeners();
    clearStoreDragVisualState();
    if (suppressClick) suppressStoreListClickUntil = Date.now() + 250;
    activeStoreDrag = null;
  };

  const trySwapDraggedStore = (direction) => {
    if (!activeStoreDrag) return false;
    const visibleRows = getFilteredStoreRows();
    const sourceIdx = getVisibleStoreIndexById(activeStoreDrag.storeId);
    if (sourceIdx < 0) return false;
    const targetIdx = sourceIdx + Number(direction || 0);
    if (targetIdx < 0 || targetIdx >= visibleRows.length) return false;
    const targetStore = visibleRows[targetIdx];
    if (!targetStore) return false;
    const moved = swapStoreRowsById(activeStoreDrag.storeId, targetStore.id);
    if (!moved) return false;
    activeStoreDrag.didSwap = true;
    rerenderFilteredStores({ selectedStoreId: activeStoreDrag.storeId });
    measureActiveStoreDragThreshold();
    return true;
  };

  const onStoreDragPointerMove = (event) => {
    if (!activeStoreDrag || event.pointerId !== activeStoreDrag.pointerId)
      return;
    if (!isStoreReorderDragEnabled()) {
      finishActiveStoreDrag({ suppressClick: activeStoreDrag.didSwap });
      return;
    }
    event.preventDefault();
    const deltaY = event.clientY - activeStoreDrag.baselineY;
    activeStoreDrag.offsetY = deltaY;
    syncActiveStoreDragVisualState();
    const threshold = measureActiveStoreDragThreshold();
    if (threshold <= 0 || Math.abs(deltaY) < threshold) return;
    const direction = deltaY > 0 ? 1 : -1;
    const moved = trySwapDraggedStore(direction);
    if (!moved) return;
    activeStoreDrag.baselineY = event.clientY;
    activeStoreDrag.offsetY = 0;
    syncActiveStoreDragVisualState();
  };

  const onStoreDragPointerUp = (event) => {
    if (!activeStoreDrag || event.pointerId !== activeStoreDrag.pointerId)
      return;
    event.preventDefault();
    finishActiveStoreDrag({ suppressClick: true });
  };

  const onStoreDragPointerCancel = (event) => {
    if (!activeStoreDrag || event.pointerId !== activeStoreDrag.pointerId)
      return;
    finishActiveStoreDrag({ suppressClick: activeStoreDrag.didSwap });
  };

  const onStoreDragWindowBlur = () => {
    finishActiveStoreDrag({ suppressClick: !!activeStoreDrag?.didSwap });
  };

  const startStoreDrag = (event, storeId) => {
    if (!(event instanceof PointerEvent)) return;
    if (event.button !== 0 || event.isPrimary === false) return;
    if (!isStoreReorderDragEnabled()) return;
    const rowEl = getStoreRowElementById(storeId);
    if (!(rowEl instanceof HTMLElement)) return;
    finishActiveStoreDrag();
    const visibleIdx = getVisibleStoreIndexById(storeId);
    if (visibleIdx >= 0) {
      listNav?.setSelectedIdx?.(visibleIdx);
    }
    activeStoreDrag = {
      pointerId: event.pointerId,
      storeId: Number(storeId),
      dragSourceEl: rowEl,
      baselineY: event.clientY,
      offsetY: 0,
      thresholdPx: Math.max(rowEl.getBoundingClientRect().height * 0.5, 24),
      didSwap: false,
      onPointerMove: onStoreDragPointerMove,
      onPointerUp: onStoreDragPointerUp,
      onPointerCancel: onStoreDragPointerCancel,
      onWindowBlur: onStoreDragWindowBlur,
    };
    document.addEventListener('pointermove', onStoreDragPointerMove, true);
    document.addEventListener('pointerup', onStoreDragPointerUp, true);
    document.addEventListener('pointercancel', onStoreDragPointerCancel, true);
    window.addEventListener('blur', onStoreDragWindowBlur);
    try {
      rowEl.setPointerCapture(event.pointerId);
    } catch (_) {}
    event.preventDefault();
    event.stopPropagation();
    syncActiveStoreDragVisualState();
  };

  function renderStoresList(rows, options = {}) {
    if (activeStoreDrag && !isStoreReorderDragEnabled()) {
      finishActiveStoreDrag({ suppressClick: activeStoreDrag.didSwap });
    }
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      finishActiveStoreDrag();
      renderTopLevelEmptyState(list, 'stores');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);
    const reorderEnabled = isStoreReorderDragEnabled();

    items.forEach((store) => {
      const li = document.createElement('li');
      li.dataset.storeId = String(store.id);
      li.classList.toggle('stores-row-reorderable', reorderEnabled);
      const dragHandle = document.createElement('span');
      dragHandle.className =
        'material-symbols-outlined shopping-list-row-handle';
      dragHandle.setAttribute('aria-hidden', 'true');
      dragHandle.textContent = 'drag_indicator';
      const label = document.createElement('span');
      label.className = 'shopping-list-row-label';

      // Display exactly as stored (no forced capitalization)
      const chain = store.chain || '';
      const location = store.location || '';
      const storeLabel = location ? `${chain} (${location})` : chain || '';
      label.textContent = storeLabel;
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined shopping-list-row-icon';
      icon.setAttribute('aria-hidden', 'true');
      li.appendChild(dragHandle);
      li.appendChild(label);
      li.appendChild(icon);
      syncStoreRowVisualState(li, store.id);

      const deleteStoreDeep = async (storeId, label) => {
        const ok = await uiConfirm({
          title: 'Delete store',
          message: `Delete '${label}'?`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          danger: true,
        });
        if (!ok) return false;

        try {
          // Delete dependent store_locations and join rows first.
          const locQ = db.exec(
            'SELECT ID FROM store_locations WHERE store_id = ?;',
            [storeId],
          );
          const locIds = locQ.length
            ? locQ[0].values.map(([id]) => Number(id)).filter(Number.isFinite)
            : [];

          locIds.forEach((lid) => {
            try {
              db.run(
                'DELETE FROM ingredient_store_location WHERE store_location_id = ?;',
                [lid],
              );
            } catch (_) {}
            try {
              db.run(
                'DELETE FROM ingredient_variant_store_location WHERE store_location_id = ?;',
                [lid],
              );
            } catch (_) {}
          });

          db.run('DELETE FROM store_locations WHERE store_id = ?;', [storeId]);
          db.run('DELETE FROM stores WHERE ID = ?;', [storeId]);
        } catch (err) {
          console.error('❌ Failed to delete store:', err);
          uiToast('Failed to delete store. See console for details.');
          return false;
        }

        const persisted = await persistStoresDb('deleting store');
        if (!persisted) {
          uiToast('Failed to save database after deleting store.');
          return false;
        }

        storeRows = storeRows.filter(
          (row) => Number(row?.id) !== Number(storeId),
        );
        checkedStoreIds.delete(Number(storeId));
        persistCurrentStoreOrder();
        persistCheckedStoreSelections();

        return true;
      };

      icon.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isStoreWebSelectMode()) return;
        const storeId = Number(store.id);
        if (checkedStoreIds.has(storeId)) checkedStoreIds.delete(storeId);
        else checkedStoreIds.add(storeId);
        persistCheckedStoreSelections();
        syncStoreRowVisualState(li, storeId);
      });

      li.addEventListener('pointerdown', (event) => {
        if (isStoreRowDragExcludedTarget(event, li)) return;
        startStoreDrag(event, store.id);
      });

      li.addEventListener('click', (event) => {
        const wantsDelete = event.ctrlKey || event.metaKey;
        const webSelectMode = isStoreWebSelectMode();
        if (wantsDelete && !webSelectMode) {
          event.preventDefault();
          event.stopPropagation();
          const label = storeLabel || 'Store';
          void (async () => {
            const ok = await deleteStoreDeep(Number(store.id), label);
            if (ok) window.location.reload();
          })();
          return;
        }

        if (webSelectMode) {
          return;
        }

        // Open editor
        sessionStorage.setItem('selectedStoreId', String(store.id));
        sessionStorage.setItem('selectedStoreChain', store.chain || '');
        sessionStorage.setItem('selectedStoreLocation', store.location || '');
        sessionStorage.removeItem('selectedStoreIsNew');
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('storeEditor.html');
      });

      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (isStoreWebSelectMode()) {
          return;
        }
        const label = storeLabel || 'Store';
        void (async () => {
          const ok = await deleteStoreDeep(Number(store.id), label);
          if (ok) window.location.reload();
        })();
      });

      list.appendChild(li);
    });

    syncActiveStoreDragVisualState();

    // Keep selection valid after rerender (search/filter changes).
    const selectedStoreId = Number(options?.selectedStoreId);
    if (
      Number.isFinite(selectedStoreId) &&
      selectedStoreId > 0 &&
      typeof listNav?.setSelectedIdx === 'function'
    ) {
      const nextSelectedIdx = items.findIndex(
        (store) => Number(store?.id) === selectedStoreId,
      );
      if (nextSelectedIdx >= 0) {
        listNav.setSelectedIdx(nextSelectedIdx);
        return;
      }
      if (options?.clearSelectionWhenMissing) {
        listNav.setSelectedIdx(-1, { source: null });
        return;
      }
    }
    listNav?.syncAfterRender?.();
  }

  const getSelectedVisibleStoreId = () => {
    const selectedIdx = Number(listNav?.getSelectedIdx?.() ?? -1);
    const visibleRows = getFilteredStoreRows();
    if (
      !Number.isFinite(selectedIdx) ||
      selectedIdx < 0 ||
      selectedIdx >= visibleRows.length
    ) {
      return null;
    }
    const storeId = Number(visibleRows[selectedIdx]?.id);
    return Number.isFinite(storeId) && storeId > 0 ? storeId : null;
  };

  const rerenderFilteredStores = (options = {}) => {
    const nextOptions = { ...options };
    const requestedStoreId = Number(nextOptions?.selectedStoreId);
    const shouldPreserveById =
      !!nextOptions?.preserveSelectionById &&
      (!Number.isFinite(requestedStoreId) || requestedStoreId <= 0);
    if (shouldPreserveById) {
      const selectedStoreId = getSelectedVisibleStoreId();
      if (selectedStoreId) nextOptions.selectedStoreId = selectedStoreId;
    }
    renderStoresList(getFilteredStoreRows(), nextOptions);
    syncStoresResetButtonState();
  };

  list.addEventListener(
    'click',
    (event) => {
      if (Date.now() > suppressStoreListClickUntil) return;
      suppressStoreListClickUntil = 0;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  let isOpeningStoreDialog = false;
  const normalizeStoreField = (value) =>
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ');
  const openCreateStoreDialog = async () => {
    if (isOpeningStoreDialog) return;
    if (!window.ui) {
      uiToast('UI not ready yet.');
      return;
    }
    isOpeningStoreDialog = true;
    if (addBtn instanceof HTMLButtonElement) {
      addBtn.disabled = true;
      addBtn.setAttribute('aria-disabled', 'true');
    }
    try {
      const vals = await window.ui.form({
        title: 'New store',
        fields: [
          {
            key: 'chain',
            label: 'Name',
            value: '',
            required: true,
            normalize: normalizeStoreField,
          },
          {
            key: 'location',
            label: 'Location (optional)',
            value: '',
            required: false,
            normalize: normalizeStoreField,
          },
        ],
        confirmText: 'Create',
        cancelText: 'Cancel',
        validate: (value) => {
          if (!normalizeStoreField(value?.chain)) return 'Chain is required.';
          return '';
        },
      });
      if (!vals) return;

      const chain = normalizeStoreField(vals.chain);
      const location = normalizeStoreField(vals.location);
      if (!chain) return;

      let newStoreId = null;
      try {
        db.run(
          'INSERT INTO stores (chain_name, location_name) VALUES (?, ?);',
          [chain, location],
        );
        const idQ = db.exec('SELECT last_insert_rowid();');
        newStoreId =
          idQ.length && idQ[0].values.length
            ? Number(idQ[0].values[0][0])
            : null;
        if (!Number.isFinite(newStoreId) || newStoreId <= 0) {
          uiToast('Failed to create store. See console for details.');
          return;
        }
        const persisted = await persistStoresDb('creating store');
        if (!persisted) {
          try {
            db.run('DELETE FROM stores WHERE ID = ?;', [newStoreId]);
          } catch (_) {}
          uiToast('Failed to save database after creating store.');
          return;
        }
      } catch (err) {
        console.error('❌ Failed to create store:', err);
        uiToast('Failed to create store. See console for details.');
        return;
      }

      sessionStorage.setItem('selectedStoreId', String(newStoreId));
      sessionStorage.removeItem('selectedStoreIsNew');
      sessionStorage.setItem('selectedStoreChain', chain);
      sessionStorage.setItem('selectedStoreLocation', location);
      window.location.href =
        favoriteEatsHrefWithCurrentAdapter('storeEditor.html');
    } finally {
      isOpeningStoreDialog = false;
      syncStoresResetButtonState();
    }
  };

  const moveSelectedStoreRow = (delta) => {
    const items = getFilteredStoreRows();
    const selectedIdx = Number(listNav?.getSelectedIdx?.() ?? -1);
    if (
      !Number.isFinite(selectedIdx) ||
      selectedIdx < 0 ||
      selectedIdx >= items.length
    ) {
      return false;
    }
    const targetIdx = selectedIdx + Number(delta || 0);
    if (targetIdx < 0 || targetIdx >= items.length) return false;
    const selectedStore = items[selectedIdx];
    const targetStore = items[targetIdx];
    if (!selectedStore || !targetStore) return false;
    return swapStoreRowsById(selectedStore.id, targetStore.id);
  };

  // Initial render
  rerenderFilteredStores();

  consumeCmdVerticalArrowBeforeTopLevelNav = (e) => {
    if (!(e instanceof KeyboardEvent)) return false;
    if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
    if (e.isComposing) return false;
    if (isTypingContext(e.target) && !isAppBarSearchContext(e.target))
      return false;
    if (isModalOpen()) return false;
    if (document.activeElement?.closest?.('.bottom-nav')) return false;

    const selectedIdx = Number(listNav?.getSelectedIdx?.() ?? -1);
    if (!Number.isFinite(selectedIdx) || selectedIdx < 0) return false;

    const visibleRows = getFilteredStoreRows();
    const selectedStore = visibleRows[selectedIdx];
    if (!selectedStore) return false;

    e.preventDefault();
    e.stopPropagation();
    const moved = moveSelectedStoreRow(e.key === 'ArrowDown' ? 1 : -1);
    if (moved) rerenderFilteredStores({ selectedStoreId: selectedStore.id });
    return true;
  };

  const onStoresActionClick = () => {
    if (isStoreWebSelectMode()) {
      if (!canResetStoreSelections()) return;
      storeRows = defaultStoreRows.slice();
      checkedStoreIds.clear();
      setShoppingPlanStoreOrder([]);
      setShoppingPlanSelectedStoreIds([]);
      listNav?.setSelectedIdx?.(-1, { source: null });
      rerenderFilteredStores({ clearSelectionWhenMissing: true });
    } else {
      void openCreateStoreDialog();
    }
  };
  const syncStoresAppBarActionChrome = () => {
    if (!addBtn) return;
    if (isStoreWebSelectMode()) {
      ensureAppBarTextActionPair(addBtn, 'Reset', 'restart_alt');
    } else {
      ensureAppBarTextActionPair(addBtn, 'Add', 'add');
    }
    syncStoresResetButtonState();
  };
  if (addBtn) {
    syncStoresAppBarActionChrome();
    addBtn.addEventListener('click', onStoresActionClick);
    window.addEventListener(
      FAVORITE_EATS_FORCE_WEB_MODE_EVENT,
      () => {
        if (!document.body.classList.contains('stores-page')) return;
        syncStoresAppBarActionChrome();
        rerenderFilteredStores();
      },
    );
  }
}

function loadStoreEditorPage() {
  const view = document.getElementById('pageContent');

  if (!view) {
    console.warn('No #pageContent found; skipping store-editor wiring.');
    return;
  }

  void (async () => {
    const isNew = sessionStorage.getItem('selectedStoreIsNew') === '1';
    const idStr = sessionStorage.getItem('selectedStoreId');
    const storeId = Number(idStr);
    const hasPersistedStore = Number.isFinite(storeId) && storeId > 0;

    let chain = sessionStorage.getItem('selectedStoreChain') || '';
    let locationName = sessionStorage.getItem('selectedStoreLocation') || '';
    /** @type {{ id: number, name: string }[]} */
    let aisleRows = [];
    /** @type {Map<number, string[]>} */
    let aisleItemsByAisle = new Map();
    /** @type {Map<number, Array<any>>} */
    let aisleItemSpecsByAisle = new Map();
    /** @type {Set<number>} */
    let deletedAisleIds = new Set();
    let nextTempAisleId = -1;
    let draftSnapshot = null;
    let refreshDirty = () => {};
    let ingredientCatalog = { byName: new Map(), hasVariantAisleTable: false };
    let activeVariantPicker = null;

    const normItemKey = (s) =>
      String(s || '')
        .trim()
        .toLowerCase();

    const parseUniqueItemLines = (raw) => {
      const seen = new Set();
      const out = [];
      for (const line of String(raw || '').split('\n')) {
        const t = line.trim();
        if (!t) continue;
        const k = normItemKey(t);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
      return out;
    };

    const normVariantKey = (s) =>
      String(s || '')
        .trim()
        .toLowerCase();
    const splitLineIntoBaseAndParen = (line) => {
      const t = String(line || '').trim();
      if (!t) return null;
      const m = t.match(/^(.*?)\s*\((.*)\)\s*$/);
      if (!m) return { baseName: t, inside: '', hasParen: false };
      return {
        baseName: String(m[1] || '').trim(),
        inside: String(m[2] || ''),
        hasParen: true,
      };
    };
    const splitLineIntoBaseAndParenLoose = (line) => {
      const strict = splitLineIntoBaseAndParen(line);
      if (strict && strict.hasParen) return strict;
      const t = String(line || '').trim();
      if (!t) return null;
      const openIdx = t.indexOf('(');
      if (openIdx < 0) return strict;
      const baseName = String(t.slice(0, openIdx) || '').trim();
      if (!baseName) return strict;
      let inside = String(t.slice(openIdx + 1) || '').trim();
      if (inside.endsWith(')')) inside = inside.slice(0, -1).trim();
      return { baseName, inside, hasParen: true };
    };
    const isSupportedVariantName = (s) => {
      const t = String(s || '').trim();
      if (!t) return false;
      if (/[()]/.test(t)) return false;
      if (isReservedIngredientVariantName(t)) return false;
      return /[a-z0-9]/i.test(t);
    };
    const parseVariantNames = (insideRaw) => {
      const inside = String(insideRaw || '').trim();
      if (!inside) return [];
      const out = [];
      const seen = new Set();
      const tokens = inside.split(',').map((s) => String(s || '').trim());
      for (const tok of tokens) {
        if (!isSupportedVariantName(tok)) continue;
        const k = normVariantKey(tok);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(tok);
      }
      return out;
    };
    const collapseVariantSummary = (baseName, selectedNames) => {
      const base = String(baseName || '').trim();
      const names = Array.isArray(selectedNames)
        ? selectedNames.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      if (!names.length) return base;
      const maxInsideChars = 45;
      const ellipsize = (s, max) => {
        const t = String(s || '');
        if (t.length <= max) return t;
        if (max <= 1) return '…';
        return `${t.slice(0, max - 1)}…`;
      };
      const fullInside = names.join(', ');
      if (fullInside.length <= maxInsideChars) return `${base} (${fullInside})`;

      const parts = [];
      for (let i = 0; i < names.length; i++) {
        const remaining = names.length - (i + 1);
        const suffix =
          remaining > 0
            ? `, + ${remaining} other${remaining === 1 ? '' : 's'}`
            : '';
        const candidateParts = [...parts, names[i]];
        const candidateInside = `${candidateParts.join(', ')}${suffix}`;
        if (candidateInside.length <= maxInsideChars) {
          parts.push(names[i]);
          continue;
        }
        if (!parts.length) {
          // Ensure at least one variant token is visible before the suffix.
          const roomForFirst = Math.max(1, maxInsideChars - suffix.length);
          parts.push(ellipsize(names[i], roomForFirst));
        }
        break;
      }
      const remaining = Math.max(0, names.length - parts.length);
      const suffix =
        remaining > 0
          ? `, + ${remaining} other${remaining === 1 ? '' : 's'}`
          : '';
      const inside = `${parts.join(', ')}${suffix}`;
      return `${base} (${inside})`;
    };
    const cloneSpecs = (specs) =>
      (Array.isArray(specs) ? specs : []).map((s) => ({
        baseName: s.baseName || '',
        baseKey: s.baseKey || '',
        ingredientId: Number.isFinite(Number(s.ingredientId))
          ? Number(s.ingredientId)
          : null,
        selectedVariants: Array.isArray(s.selectedVariants)
          ? [...s.selectedVariants]
          : [],
        knownVariants: Array.isArray(s.knownVariants)
          ? s.knownVariants.map((v) => ({
              id: Number.isFinite(Number(v?.id)) ? Number(v.id) : null,
              name: String(v?.name || ''),
            }))
          : [],
      }));
    const specsToDisplayLines = (specs, opts = {}) => {
      const pickerKey = String(opts.pickerBaseKey || '')
        .trim()
        .toLowerCase();
      const expandAll = opts.expandAll === true;
      return (Array.isArray(specs) ? specs : []).map((spec) => {
        if (pickerKey && spec.baseKey === pickerKey) return spec.baseName || '';
        if (expandAll) {
          const base = String(spec.baseName || '').trim();
          const variants = Array.isArray(spec.selectedVariants)
            ? spec.selectedVariants
                .map((v) => String(v || '').trim())
                .filter(Boolean)
            : [];
          return variants.length ? `${base} (${variants.join(', ')})` : base;
        }
        return collapseVariantSummary(
          spec.baseName || '',
          spec.selectedVariants,
        );
      });
    };
    const syncDisplayLinesFromSpecs = (aid, opts = {}) => {
      const specs = Array.isArray(aisleItemSpecsByAisle.get(aid))
        ? aisleItemSpecsByAisle.get(aid)
        : [];
      aisleItemsByAisle.set(aid, specsToDisplayLines(specs, opts));
    };
    const syncStoreAisleDeprecatedFieldClassForField = (aid, itemsFieldEl) => {
      if (!(itemsFieldEl instanceof HTMLElement)) return;
      const specs = aisleItemSpecsByAisle.get(aid) || [];
      let bad = false;
      for (const spec of specs) {
        const known = ingredientCatalog?.byName?.get?.(spec.baseKey) || null;
        if (!known?.variants?.length) continue;
        const depKeys = new Set(
          known.variants
            .filter((vv) => vv.isDeprecated)
            .map((vv) => normVariantKey(String(vv.name || ''))),
        );
        for (const sv of spec.selectedVariants || []) {
          if (depKeys.has(normVariantKey(String(sv || '')))) {
            bad = true;
            break;
          }
        }
        if (bad) break;
      }
      itemsFieldEl.classList.toggle(
        'store-aisle-items-field--has-deprecated-variant',
        bad,
      );
    };
    const setAisleTextareaRawDraft = (textarea, value) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.__feStoreRawDraftValue = String(value == null ? '' : value);
    };
    const getAisleTextareaRawDraft = (textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return '';
      if (typeof textarea.__feStoreRawDraftValue === 'string') {
        return textarea.__feStoreRawDraftValue;
      }
      return String(textarea.value || '');
    };
    const parseSpecsFromRaw = (raw, prevSpecs, catalog) => {
      const prevByKey = new Map();
      (Array.isArray(prevSpecs) ? prevSpecs : []).forEach((s) => {
        if (s?.baseKey) prevByKey.set(s.baseKey, s);
      });
      const out = [];
      const seenBase = new Set();
      for (const line of String(raw || '').split('\n')) {
        const parsed = splitLineIntoBaseAndParenLoose(line);
        if (!parsed) continue;
        const baseName = String(parsed.baseName || '').trim();
        if (!baseName) continue;
        const baseKey = normItemKey(baseName);
        if (!baseKey || seenBase.has(baseKey)) continue;
        seenBase.add(baseKey);
        const known = catalog?.byName?.get?.(baseKey) || null;
        const prev = prevByKey.get(baseKey) || null;
        let selected = [];
        const inside = String(parsed.inside || '');
        const looksCollapsed = /\+\s*\d+\s+others?/i.test(inside);
        if (parsed.hasParen) {
          if (looksCollapsed && prev && Array.isArray(prev.selectedVariants)) {
            selected = [...prev.selectedVariants];
          } else {
            selected = parseVariantNames(inside);
          }
        }
        // Collapsed lines reuse prev.selectedVariants; drop soft-deprecated variants
        // that no longer appear as explicit variant tokens in the edited line.
        if (
          known &&
          Array.isArray(known.variants) &&
          selected.length
        ) {
          const depKeys = new Set(
            known.variants
              .filter((v) => v.isDeprecated)
              .map((v) => normVariantKey(String(v?.name || '').trim())),
          );
          if (depKeys.size) {
            const explicitVariantKeys = new Set(
              parseVariantNames(inside).map((name) => normVariantKey(name)),
            );
            selected = selected.filter((sv) => {
              const k = normVariantKey(sv);
              if (!depKeys.has(k)) return true;
              return explicitVariantKeys.has(k);
            });
          }
        }
        if (known && Array.isArray(known.variants)) {
          // Keep DB order first, then append any valid ad-hoc variants the user typed.
          const dbOrdered = known.variants.map((v) =>
            String(v?.name || '').trim(),
          );
          const dbKeys = new Set(dbOrdered.map((v) => normVariantKey(v)));
          const selectedBeforeNormalize = [...selected];
          const extras = selected.filter((v) => !dbKeys.has(normVariantKey(v)));
          selected = [];
          const wanted = new Set(
            selectedBeforeNormalize.map((v) => normVariantKey(v)),
          );
          dbOrdered.forEach((name) => {
            if (wanted.has(normVariantKey(name))) selected.push(name);
          });
          extras.forEach((name) => {
            if (
              !selected.some((v) => normVariantKey(v) === normVariantKey(name))
            ) {
              selected.push(name);
            }
          });
        } else {
          selected = selected.filter(isSupportedVariantName);
        }
        out.push({
          baseName,
          baseKey,
          ingredientId:
            known && Number.isFinite(Number(known.ingredientId))
              ? Number(known.ingredientId)
              : null,
          selectedVariants: selected,
          knownVariants:
            known && Array.isArray(known.variants)
              ? known.variants.map((v) => ({ id: Number(v.id), name: v.name }))
              : [],
        });
      }
      return out;
    };
    const normalizeSpecsWithCatalog = (specs, catalog) => {
      const out = [];
      const seenBase = new Set();
      for (const spec of Array.isArray(specs) ? specs : []) {
        const baseName = String(spec?.baseName || '').trim();
        if (!baseName) continue;
        const baseKey = normItemKey(baseName);
        if (!baseKey || seenBase.has(baseKey)) continue;
        seenBase.add(baseKey);
        const known = catalog?.byName?.get?.(baseKey) || null;
        let selected = Array.isArray(spec?.selectedVariants)
          ? spec.selectedVariants
              .map((v) => String(v || '').trim())
              .filter(isSupportedVariantName)
          : [];
        if (known && Array.isArray(known.variants)) {
          const dbOrdered = known.variants.map((v) =>
            String(v?.name || '').trim(),
          );
          const dbKeys = new Set(dbOrdered.map((v) => normVariantKey(v)));
          const selectedBeforeNormalize = [...selected];
          const extras = selected.filter((v) => !dbKeys.has(normVariantKey(v)));
          selected = [];
          const wanted = new Set(
            selectedBeforeNormalize.map((v) => normVariantKey(v)),
          );
          dbOrdered.forEach((name) => {
            if (wanted.has(normVariantKey(name))) selected.push(name);
          });
          extras.forEach((name) => {
            if (
              !selected.some((v) => normVariantKey(v) === normVariantKey(name))
            ) {
              selected.push(name);
            }
          });
        }
        out.push({
          baseName,
          baseKey,
          ingredientId:
            known && Number.isFinite(Number(known.ingredientId))
              ? Number(known.ingredientId)
              : Number.isFinite(Number(spec?.ingredientId))
                ? Number(spec.ingredientId)
                : null,
          selectedVariants: selected,
          knownVariants:
            known && Array.isArray(known.variants)
              ? known.variants.map((v) => ({ id: Number(v.id), name: v.name }))
              : Array.isArray(spec?.knownVariants)
                ? spec.knownVariants.map((v) => ({
                    id: Number.isFinite(Number(v?.id)) ? Number(v.id) : null,
                    name: String(v?.name || ''),
                  }))
                : [],
        });
      }
      return out;
    };

    const cloneDraftSnapshot = () => ({
      aisleRows: aisleRows.map((r) => ({ id: r.id, name: r.name })),
      items: Object.fromEntries(
        [...aisleItemsByAisle.entries()].map(([k, v]) => [String(k), [...v]]),
      ),
      specs: Object.fromEntries(
        [...aisleItemSpecsByAisle.entries()].map(([k, v]) => [
          String(k),
          cloneSpecs(v),
        ]),
      ),
      deletedIds: [...deletedAisleIds],
    });
    const restoreDraftFromSnapshot = (snap) => {
      if (!snap) return;
      aisleRows = snap.aisleRows.map((r) => ({ id: r.id, name: r.name }));
      aisleItemsByAisle = new Map();
      for (const [ks, v] of Object.entries(snap.items || {})) {
        const n = Number(ks);
        aisleItemsByAisle.set(Number.isFinite(n) ? n : ks, [...v]);
      }
      aisleItemSpecsByAisle = new Map();
      for (const [ks, v] of Object.entries(snap.specs || {})) {
        const n = Number(ks);
        aisleItemSpecsByAisle.set(Number.isFinite(n) ? n : ks, cloneSpecs(v));
      }
      deletedAisleIds = new Set(snap.deletedIds || []);
    };
    const itemsListEqual = (a, b) => {
      const pa = parseUniqueItemLines((a || []).join('\n'));
      const pb = parseUniqueItemLines((b || []).join('\n'));
      if (pa.length !== pb.length) return false;
      for (let i = 0; i < pa.length; i++) {
        if (normItemKey(pa[i]) !== normItemKey(pb[i])) return false;
      }
      return true;
    };
    const specsEqual = (a, b) => {
      const aa = Array.isArray(a) ? a : [];
      const bb = Array.isArray(b) ? b : [];
      if (aa.length !== bb.length) return false;
      for (let i = 0; i < aa.length; i++) {
        const sa = aa[i] || {};
        const sb = bb[i] || {};
        if (normItemKey(sa.baseName) !== normItemKey(sb.baseName)) return false;
        if (
          (sa.selectedVariants || []).length !==
          (sb.selectedVariants || []).length
        )
          return false;
        for (let j = 0; j < (sa.selectedVariants || []).length; j++) {
          if (
            normVariantKey(sa.selectedVariants[j]) !==
            normVariantKey((sb.selectedVariants || [])[j])
          )
            return false;
        }
      }
      return true;
    };
    const aislesDraftDirty = () => {
      if (!draftSnapshot) return false;
      const sd = draftSnapshot.deletedIds || [];
      if (deletedAisleIds.size !== sd.length) return true;
      for (const id of deletedAisleIds) if (!sd.includes(id)) return true;
      for (const id of sd) if (!deletedAisleIds.has(id)) return true;
      if (aisleRows.length !== draftSnapshot.aisleRows.length) return true;
      for (let i = 0; i < aisleRows.length; i++) {
        if (aisleRows[i]?.id !== draftSnapshot.aisleRows[i]?.id) return true;
      }
      const snapRows = new Map(draftSnapshot.aisleRows.map((r) => [r.id, r]));
      for (const r of aisleRows) {
        const s = snapRows.get(r.id);
        if (!s) return true;
        if ((r.name || '') !== (s.name || '')) return true;
        const cur = aisleItemsByAisle.get(r.id) || [];
        const snapItems = draftSnapshot.items[String(r.id)] || [];
        if (!itemsListEqual(cur, snapItems)) return true;
        const curSpecs = aisleItemSpecsByAisle.get(r.id) || [];
        const snapSpecs = draftSnapshot.specs?.[String(r.id)] || [];
        if (!specsEqual(curSpecs, snapSpecs)) return true;
      }
      for (const id of snapRows.keys()) {
        if (!aisleRows.some((row) => row.id === id)) return true;
      }
      return false;
    };

    const openStoreEditorDb = async () => {
      const isElectron = !!window.electronAPI;
      let db;
      if (isElectron) {
        const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
        const bytes = await window.electronAPI.loadDB(pathHint);
        db = new SQL.Database(new Uint8Array(bytes));
      } else {
        db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
      }
      window.dbInstance = db;
      await ensureIngredientLemmaMaintenanceInMain(db, isElectron);
      return db;
    };

    const persistStoreEditorDb = async (db) => {
      await persistDbForCurrentRuntime(db, {
        isElectron: !!window.electronAPI,
        failureMessage: 'Failed to save DB for store editor.',
      });
    };

    const tableExistsLocal = (db, name) => {
      try {
        const q = db.exec(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`,
          [name],
        );
        return !!(q.length && q[0].values && q[0].values.length);
      } catch (_) {
        return false;
      }
    };

    const tableHasColumnLocal = (db, tableName, colName) => {
      try {
        const pc = db.exec(`PRAGMA table_info(${tableName});`);
        const vals = pc?.length ? pc[0].values || [] : [];
        const needle = String(colName || '').toLowerCase();
        return vals.some(
          (row) =>
            Array.isArray(row) && String(row[1] || '').toLowerCase() === needle,
        );
      } catch (_) {
        return false;
      }
    };

    const loadIngredientCatalog = (db) => {
      const byName = new Map();
      const byId = new Map();
      const hasVariantTable = tableExistsLocal(db, 'ingredient_variants');
      const hasVariantDepCol =
        hasVariantTable &&
        tableHasColumnLocal(db, 'ingredient_variants', 'is_deprecated');
      const hasVariantAisleTable = tableExistsLocal(
        db,
        'ingredient_variant_store_location',
      );
      try {
        const q = db.exec(
          `SELECT ID, name
             FROM ingredients
            WHERE name IS NOT NULL
              AND trim(name) != ''
              AND COALESCE(is_deprecated, 0) = 0
              AND COALESCE(hide_from_shopping_list, 0) = 0
            ORDER BY name COLLATE NOCASE, ID ASC;`,
        );
        const rows = q.length ? q[0].values : [];
        rows.forEach(([id, name]) => {
          const clean = String(name || '').trim();
          const key = normItemKey(clean);
          if (!key || byName.has(key)) return;
          const rec = {
            ingredientId: Number(id),
            name: clean,
            variants: [],
          };
          byName.set(key, rec);
          byId.set(Number(id), rec);
        });
      } catch (_) {}
      if (hasVariantTable) {
        try {
          const depSel = hasVariantDepCol
            ? ', COALESCE(iv.is_deprecated, 0)'
            : '';
          const vq = db.exec(
            `SELECT ingredient_id, id, variant${depSel}
               FROM ingredient_variants iv
              WHERE iv.variant IS NOT NULL
                AND trim(iv.variant) != ''
                AND lower(trim(iv.variant)) != '${INGREDIENT_BASE_VARIANT_NAME}'
              ORDER BY ingredient_id ASC, COALESCE(sort_order, 999999) ASC, id ASC;`,
          );
          const rows = vq.length ? vq[0].values : [];
          rows.forEach((row) => {
            if (!Array.isArray(row) || row.length < 3) return;
            const ingredientId = row[0];
            const variantId = row[1];
            const variant = row[2];
            const depRaw = hasVariantDepCol ? row[3] : 0;
            const vv = String(variant || '').trim();
            if (!isSupportedVariantName(vv)) return;
            const item = byId.get(Number(ingredientId));
            if (!item) return;
            if (
              item.variants.some(
                (v) => normVariantKey(v.name) === normVariantKey(vv),
              )
            )
              return;
            item.variants.push({
              id: Number(variantId),
              name: vv,
              isDeprecated: hasVariantDepCol && Number(depRaw || 0) === 1,
            });
          });
        } catch (_) {}
      }
      return { byName, hasVariantAisleTable };
    };

    const prepareStoreEditorReadAdapter = async () => {
      if (
        !window.dataService ||
        typeof window.dataService.loadStoreDetail !== 'function'
      ) {
        return null;
      }
      if (favoriteEatsShouldUseSupabaseDataDoor()) {
        window.dataService.useSupabase = true;
        console.info(
          '[dataService] using Supabase adapter',
        );
        return null;
      }
      if (window.dataService.activeAdapter === 'supabase') return null;
      const db = await openStoreEditorDb();
      if (typeof window.dataService.setSqliteDb === 'function') {
        window.dataService.setSqliteDb(db);
      }
      return db;
    };

    const applyStoreDetailFromDataService = (detail) => {
      if (!detail || typeof detail !== 'object') return false;
      chain = String(detail.chain || '');
      locationName = String(detail.location || '');

      const catalogByName = new Map();
      (Array.isArray(detail.ingredientCatalog)
        ? detail.ingredientCatalog
        : []
      ).forEach((item) => {
        const name = String(item?.name || '').trim();
        const key = normItemKey(item?.baseKey || name);
        const ingredientId = Number(item?.ingredientId);
        if (!key || catalogByName.has(key)) return;
        catalogByName.set(key, {
          ingredientId: Number.isFinite(ingredientId) ? ingredientId : null,
          name,
          variants: Array.isArray(item?.variants)
            ? item.variants.map((variant) => ({
                id: Number.isFinite(Number(variant?.id))
                  ? Number(variant.id)
                  : null,
                name: String(variant?.name || ''),
                isDeprecated: Boolean(variant?.isDeprecated),
              }))
            : [],
        });
      });
      ingredientCatalog = {
        byName: catalogByName,
        hasVariantAisleTable: detail.hasVariantAisleTable === true,
      };

      aisleRows = (Array.isArray(detail.aisles) ? detail.aisles : [])
        .map((aisle) => ({
          id: Number(aisle?.id),
          name: String(aisle?.name || ''),
          itemSpecs: Array.isArray(aisle?.itemSpecs) ? aisle.itemSpecs : [],
        }))
        .filter((aisle) => Number.isFinite(aisle.id));
      aisleItemsByAisle = new Map();
      aisleItemSpecsByAisle = new Map();
      aisleRows.forEach((aisle) => {
        const specs = normalizeSpecsWithCatalog(
          aisle.itemSpecs,
          ingredientCatalog,
        );
        aisleItemSpecsByAisle.set(aisle.id, specs);
        syncDisplayLinesFromSpecs(aisle.id);
      });
      return true;
    };

    if (hasPersistedStore) {
      try {
        let loadedViaDataService = false;
        let db = null;
        if (
          window.dataService &&
          typeof window.dataService.loadStoreDetail === 'function'
        ) {
          try {
            db = await prepareStoreEditorReadAdapter();
            const detail = await window.dataService.loadStoreDetail({ storeId });
            loadedViaDataService = applyStoreDetailFromDataService(detail);
          } catch (err) {
            console.error('dataService.loadStoreDetail failed:', err);
          }
        }

        if (!loadedViaDataService && window.dataService?.activeAdapter !== 'supabase') {
          db = db || (await openStoreEditorDb());
          const sr = db.exec(
            'SELECT chain_name, location_name FROM stores WHERE ID = ?;',
            [storeId],
          );
          if (sr.length && sr[0].values.length) {
            const row = sr[0].values[0];
            if (row[0] != null) chain = String(row[0]);
            if (row[1] != null) locationName = String(row[1]);
          }
          const ar = db.exec(
            'SELECT ID, name FROM store_locations WHERE store_id = ? ORDER BY COALESCE(sort_order, 999999), ID;',
            [storeId],
          );
          if (ar.length && ar[0].values.length) {
            aisleRows = ar[0].values.map(([id, name]) => ({
              id: Number(id),
              name: String(name || ''),
            }));
          }
          ingredientCatalog = loadIngredientCatalog(db);
          aisleRows.forEach((r) => {
            aisleItemsByAisle.set(r.id, []);
            aisleItemSpecsByAisle.set(r.id, []);
          });
          if (aisleRows.length) {
            const ids = aisleRows.map((r) => r.id);
            const ph = ids.map(() => '?').join(',');
            const baseStmt = db.prepare(`
              SELECT isl.store_location_id, i.ID, i.name
              FROM ingredient_store_location isl
              JOIN ingredients i ON i.ID = isl.ingredient_id
              WHERE isl.store_location_id IN (${ph})
                AND COALESCE(i.is_deprecated, 0) = 0
                AND COALESCE(i.hide_from_shopping_list, 0) = 0
              ORDER BY isl.ID ASC
            `);
            baseStmt.bind(ids);
            while (baseStmt.step()) {
              const row = baseStmt.get();
              const aid = Number(row[0]);
              const ingredientId = Number(row[1]);
              const name = String(row[2] || '').trim();
              const specs = aisleItemSpecsByAisle.get(aid);
              if (!Array.isArray(specs) || !name) continue;
              const key = normItemKey(name);
              if (specs.some((s) => s.baseKey === key)) continue;
              const known = ingredientCatalog.byName.get(key) || null;
              specs.push({
                baseName: name,
                baseKey: key,
                ingredientId: Number.isFinite(ingredientId) ? ingredientId : null,
                selectedVariants: [],
                knownVariants:
                  known && Array.isArray(known.variants)
                    ? known.variants.map((v) => ({
                        id: Number(v.id),
                        name: v.name,
                      }))
                    : [],
              });
            }
            baseStmt.free();
            if (ingredientCatalog.hasVariantAisleTable) {
              const variantStmt = db.prepare(`
                SELECT ivsl.store_location_id, i.ID, i.name, v.id, v.variant
                FROM ingredient_variant_store_location ivsl
                JOIN ingredient_variants v ON v.id = ivsl.ingredient_variant_id
                JOIN ingredients i ON i.ID = v.ingredient_id
                WHERE ivsl.store_location_id IN (${ph})
                  AND COALESCE(i.is_deprecated, 0) = 0
                  AND COALESCE(i.hide_from_shopping_list, 0) = 0
                ORDER BY ivsl.id ASC, COALESCE(v.sort_order, 999999) ASC, v.id ASC
              `);
              variantStmt.bind(ids);
              while (variantStmt.step()) {
                const row = variantStmt.get();
                const aid = Number(row[0]);
                const ingredientId = Number(row[1]);
                const name = String(row[2] || '').trim();
                const variantName = String(row[4] || '').trim();
                if (!name || !isSupportedVariantName(variantName)) continue;
                const specs = aisleItemSpecsByAisle.get(aid);
                if (!Array.isArray(specs)) continue;
                const key = normItemKey(name);
                let spec = specs.find((s) => s.baseKey === key);
                if (!spec) {
                  const known = ingredientCatalog.byName.get(key) || null;
                  spec = {
                    baseName: name,
                    baseKey: key,
                    ingredientId: Number.isFinite(ingredientId)
                      ? ingredientId
                      : null,
                    selectedVariants: [],
                    knownVariants:
                      known && Array.isArray(known.variants)
                        ? known.variants.map((v) => ({
                            id: Number(v.id),
                            name: v.name,
                          }))
                        : [],
                  };
                  specs.push(spec);
                }
                if (
                  !spec.selectedVariants.some(
                    (v) => normVariantKey(v) === normVariantKey(variantName),
                  )
                ) {
                  spec.selectedVariants.push(variantName);
                }
              }
              variantStmt.free();
            }
            aisleRows.forEach((r) => syncDisplayLinesFromSpecs(r.id));
          }
        }
      } catch (err) {
        console.warn('Store editor: failed to load store/aisles', err);
      }
    }

    if (hasPersistedStore) draftSnapshot = cloneDraftSnapshot();

    const titleText = chain ? chain : isNew ? 'New store' : 'Store';
    const locTrim = (locationName || '').trim();
    const storeLocationBlock = locTrim
      ? `<div id="storeLocationSubtitle" class="unit-abbreviation-line"></div>`
      : `<div id="storeLocationSubtitle" class="unit-abbreviation-line" style="display:none" aria-hidden="true"></div>`;

    initAppBar({ mode: 'editor', titleText, showSearch: hasPersistedStore });

    const aislesBlock = hasPersistedStore
      ? `
    <h2
      id="storeAislesSectionLabel"
      class="section-header store-aisles-section-label"
    >
      Aisles
    </h2>
    <div id="storeAislesList" class="store-aisles-list" aria-label="Store aisles"></div>
    <div id="storeAddAisleCtaEmpty" class="store-add-aisle-cta" role="button" tabindex="0">
      <span class="placeholder-prompt">Add an aisle</span>
    </div>`
      : '';

    view.innerHTML = `
    <h1 id="childEditorTitle" class="recipe-title">${titleText || ''}</h1>
    ${storeLocationBlock}
    ${aislesBlock}
  `;

    const STORE_AISLE_SLOT_CLASS = 'store-aisle-slot';
    const STORE_AISLE_HINT_ACTIVE_CLASS = 'store-aisle-slot--hint-active';
    const STORE_MASTER_LINK_MODE_CLASS = 'store-master-link-mode';

    let hoverModifierActive = false;
    const desktopHoverEnabled = (() => {
      try {
        return Boolean(
          window.matchMedia &&
          window.matchMedia('(hover: hover) and (pointer: fine)').matches,
        );
      } catch (_) {
        return false;
      }
    })();

    const syncStoreMasterLinkModeClass = () => {
      try {
        document.body.classList.toggle(
          STORE_MASTER_LINK_MODE_CLASS,
          hoverModifierActive,
        );
      } catch (_) {}
    };

    const syncActiveAisleHintClass = (targetSlot = null) => {
      try {
        const list = document.getElementById('storeAislesList');
        if (!list) return;
        list
          .querySelectorAll(`.${STORE_AISLE_HINT_ACTIVE_CLASS}`)
          .forEach((el) => el.classList.remove(STORE_AISLE_HINT_ACTIVE_CLASS));
        if (
          targetSlot &&
          targetSlot.classList &&
          targetSlot.classList.contains(STORE_AISLE_SLOT_CLASS)
        ) {
          targetSlot.classList.add(STORE_AISLE_HINT_ACTIVE_CLASS);
        }
      } catch (_) {}
    };

    const getTextareaLineBoundsAtCaret = (textarea, caretPos) => {
      const value = String(textarea && textarea.value ? textarea.value : '');
      const pos =
        caretPos != null && Number.isFinite(caretPos)
          ? Number(caretPos)
          : Number(
              textarea && textarea.selectionStart != null
                ? textarea.selectionStart
                : 0,
            );
      const prevNl = value.lastIndexOf('\n', Math.max(0, pos - 1));
      const lineStart = prevNl === -1 ? 0 : prevNl + 1;
      const nextNl = value.indexOf('\n', pos);
      const lineEnd = nextNl === -1 ? value.length : nextNl;
      return { lineStart, lineEnd };
    };

    const getTextareaLineTextAtCaret = (textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return '';
      const caretPos = Number(textarea.selectionStart ?? 0);
      const { lineStart, lineEnd } = getTextareaLineBoundsAtCaret(
        textarea,
        caretPos,
      );
      return String(textarea.value || '').slice(lineStart, lineEnd);
    };

    const getShoppingMatchByName = async (rawName) => {
      const name = String(rawName || '').trim();
      if (
        name &&
        window.dataService &&
        typeof window.dataService.lookupShoppingItemByName === 'function'
      ) {
        try {
          return await window.dataService.lookupShoppingItemByName({ name });
        } catch (err) {
          console.error('dataService.lookupShoppingItemByName failed:', err);
        }
      }

      const db = window.dbInstance;
      if (!name || !db) return null;

      try {
        const directQ = db.exec(
          `SELECT ID, name
           FROM ingredients
           WHERE lower(trim(name)) = lower(trim(?))
           ORDER BY ID
           LIMIT 1;`,
          [name],
        );
        if (directQ.length && directQ[0].values.length) {
          const [id, matchedName] = directQ[0].values[0];
          const normalizedId = Number(id);
          if (Number.isFinite(normalizedId) && normalizedId > 0) {
            return {
              id: normalizedId,
              name: matchedName == null ? name : String(matchedName),
            };
          }
        }
      } catch (_) {}

      try {
        const synonymQ = db.exec(
          `SELECT i.ID, i.name
           FROM ingredient_synonyms s
           JOIN ingredients i ON i.ID = s.ingredient_id
           WHERE lower(trim(s.synonym)) = lower(trim(?))
           ORDER BY i.ID
           LIMIT 1;`,
          [name],
        );
        if (synonymQ.length && synonymQ[0].values.length) {
          const [id, matchedName] = synonymQ[0].values[0];
          const normalizedId = Number(id);
          if (Number.isFinite(normalizedId) && normalizedId > 0) {
            return {
              id: normalizedId,
              name: matchedName == null ? name : String(matchedName),
            };
          }
        }
      } catch (_) {}

      return null;
    };

    const extractMasterNameFromAisleLine = (rawLine) => {
      const line = String(rawLine || '').trim();
      if (!line) return '';
      try {
        const parsed = parseSpecsFromRaw(line, [], ingredientCatalog);
        if (Array.isArray(parsed) && parsed[0] && parsed[0].baseName) {
          return String(parsed[0].baseName).trim();
        }
      } catch (_) {}
      return line;
    };

    const navigateToShoppingMatch = (match) => {
      const normalizedId = Number(match && match.id);
      const normalizedName = String(
        match && match.name ? match.name : '',
      ).trim();
      if (
        !Number.isFinite(normalizedId) ||
        normalizedId <= 0 ||
        !normalizedName
      )
        return;
      sessionStorage.setItem('selectedShoppingItemId', String(normalizedId));
      sessionStorage.setItem('selectedShoppingItemName', normalizedName);
      sessionStorage.removeItem('selectedShoppingItemIsNew');
      window.location.href =
        favoriteEatsHrefWithCurrentAdapter('shoppingEditor.html');
    };

    const syncEmptyStateAisleCta = () => {
      const cta = document.getElementById('storeAddAisleCtaEmpty');
      if (!cta) return;
      cta.hidden = aisleRows.length > 0;
    };

    let storeEditorSearchQuery = '';
    /** @type {HTMLInputElement | null} */
    let storeEditorSearchInput = null;
    const normalizeStoreEditorSearchQuery = (value) =>
      String(value || '')
        .trim()
        .toLowerCase();
    const lineMatchesStoreEditorSearch = (line, query) => {
      const q = normalizeStoreEditorSearchQuery(query);
      if (!q) return true;
      return String(line || '')
        .toLowerCase()
        .includes(q);
    };
    const getStoreEditorFilteredLines = (aid, query) => {
      const q = normalizeStoreEditorSearchQuery(query);
      const lines = Array.isArray(aisleItemsByAisle.get(aid))
        ? aisleItemsByAisle.get(aid)
        : [];
      if (!q) return [...lines];
      return lines.filter((line) => lineMatchesStoreEditorSearch(line, q));
    };
    const aisleMatchesStoreEditorSearch = (aisleName, aid, query) => {
      const q = normalizeStoreEditorSearchQuery(query);
      if (!q) return true;
      if (
        String(aisleName || '')
          .toLowerCase()
          .includes(q)
      )
        return true;
      return getStoreEditorFilteredLines(aid, q).length > 0;
    };
    const applyStoreEditorSearch = (query = storeEditorSearchQuery) => {
      storeEditorSearchQuery = normalizeStoreEditorSearchQuery(query);
      const isSearchActive = !!storeEditorSearchQuery;
      if (isSearchActive) closeActiveVariantPicker({ commit: true });
      document.body.classList.toggle(
        'store-editor-search-active',
        isSearchActive,
      );

      const list = document.getElementById('storeAislesList');
      if (!list) return;
      const slotEls = Array.from(
        list.querySelectorAll(`.${STORE_AISLE_SLOT_CLASS}`),
      );
      slotEls.forEach((slotEl) => {
        const cardEl = slotEl.querySelector('.store-aisle-card');
        const aid = Number(cardEl?.dataset?.aisleId);
        const aisle = aisleRows.find((row) => row.id === aid);
        const showSlot = aisle
          ? aisleMatchesStoreEditorSearch(
              aisle.name,
              aisle.id,
              storeEditorSearchQuery,
            )
          : !isSearchActive;
        slotEl.hidden = !showSlot;
        slotEl.setAttribute('aria-hidden', showSlot ? 'false' : 'true');

        if (!(cardEl instanceof HTMLElement)) return;
        cardEl.classList.toggle(
          'store-aisle-card--search-active',
          isSearchActive,
        );

        const itemsFieldEl = cardEl.querySelector('.store-aisle-items-field');
        if (itemsFieldEl instanceof HTMLElement) {
          itemsFieldEl.classList.toggle(
            'store-aisle-items-field--search-active',
            isSearchActive,
          );
        }

        const resultsEl = cardEl.querySelector('.store-aisle-search-results');
        if (!(resultsEl instanceof HTMLElement)) return;

        const matchingLines =
          aisle && isSearchActive
            ? getStoreEditorFilteredLines(aisle.id, storeEditorSearchQuery)
            : [];
        resultsEl.innerHTML = '';
        matchingLines.forEach((line) => {
          const lineEl = document.createElement('div');
          lineEl.className = 'store-aisle-search-line';
          lineEl.textContent = String(line || '');
          resultsEl.appendChild(lineEl);
        });
        resultsEl.hidden = !(isSearchActive && matchingLines.length > 0);
        resultsEl.setAttribute(
          'aria-hidden',
          resultsEl.hidden ? 'true' : 'false',
        );
      });
    };

    const endStoreEditorSearchPreservingScroll = (anchorEl) => {
      if (!normalizeStoreEditorSearchQuery(storeEditorSearchQuery)) return;
      const anchor = anchorEl instanceof HTMLElement ? anchorEl : null;
      const anchorTop =
        anchor && anchor.isConnected
          ? anchor.getBoundingClientRect().top
          : null;
      const se =
        document.scrollingElement ||
        document.documentElement ||
        document.body;
      const fallbackX = se ? se.scrollLeft : 0;
      const fallbackY = se ? se.scrollTop : 0;

      if (storeEditorSearchInput) {
        storeEditorSearchInput.value = '';
        storeEditorSearchInput.dispatchEvent(
          new Event('input', { bubbles: true }),
        );
      } else {
        applyStoreEditorSearch('');
      }

      // Raw scrollY restore is wrong when search ends: previously hidden aisles
      // reappear *above* the current row and the layout reflows. Keep the
      // clicked/focused aisle at the same viewport Y by nudging `scrollBy` after
      // reflow, and re-run a few times to also beat the browser’s focus
      // scroll-into-view for the textarea.
      const nudgeAisleToSavedViewportY = () => {
        if (anchor == null || anchorTop == null || !anchor.isConnected) {
          return;
        }
        const newTop = anchor.getBoundingClientRect().top;
        const delta = newTop - anchorTop;
        if (Math.abs(delta) < 0.5) return;
        try {
          window.scrollBy(0, delta);
        } catch (_) {}
      };

      const nudgeOrFallback = () => {
        if (anchor && anchorTop != null && anchor.isConnected) {
          nudgeAisleToSavedViewportY();
        } else {
          try {
            if (se) {
              se.scrollLeft = fallbackX;
              se.scrollTop = fallbackY;
            }
            window.scrollTo(fallbackX, fallbackY);
          } catch (_) {}
        }
      };

      try {
        if (anchor) void anchor.offsetHeight;
      } catch (_) {}
      requestAnimationFrame(() => {
        nudgeOrFallback();
        requestAnimationFrame(() => {
          nudgeOrFallback();
          setTimeout(() => {
            nudgeOrFallback();
            setTimeout(nudgeOrFallback, 16);
          }, 0);
        });
      });
    };

    let lastPointerClientX = -1;
    let lastPointerClientY = -1;

    const getHoveredSlot = () => {
      try {
        if (lastPointerClientX < 0) return null;
        const el = document.elementFromPoint(
          lastPointerClientX,
          lastPointerClientY,
        );
        if (!el) return null;
        return el.closest ? el.closest(`.${STORE_AISLE_SLOT_CLASS}`) : null;
      } catch (_) {
        return null;
      }
    };

    const syncAddAisleHoverModifier = (e) => {
      const next = !!(e && e.altKey);
      if (next === hoverModifierActive) return;
      hoverModifierActive = next;
      syncStoreMasterLinkModeClass();
      if (hoverModifierActive) {
        const slot = getHoveredSlot();
        if (slot) syncActiveAisleHintClass(slot);
      } else {
        syncActiveAisleHintClass(null);
      }
    };

    const clearAddAisleHoverModifier = () => {
      if (!hoverModifierActive) return;
      hoverModifierActive = false;
      syncStoreMasterLinkModeClass();
      syncActiveAisleHintClass(null);
    };

    try {
      if (typeof window._storeAddAisleHoverModifierTeardown === 'function') {
        window._storeAddAisleHoverModifierTeardown();
      }
    } catch (_) {}
    const onPointerMove = (e) => {
      lastPointerClientX = e.clientX;
      lastPointerClientY = e.clientY;
    };
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('keydown', syncAddAisleHoverModifier, true);
    document.addEventListener('keyup', syncAddAisleHoverModifier, true);
    window.addEventListener('blur', clearAddAisleHoverModifier);
    window._storeAddAisleHoverModifierTeardown = () => {
      try {
        document.removeEventListener('pointermove', onPointerMove, true);
      } catch (_) {}
      try {
        document.removeEventListener(
          'keydown',
          syncAddAisleHoverModifier,
          true,
        );
      } catch (_) {}
      try {
        document.removeEventListener('keyup', syncAddAisleHoverModifier, true);
      } catch (_) {}
      try {
        window.removeEventListener('blur', clearAddAisleHoverModifier);
      } catch (_) {}
      hoverModifierActive = false;
      syncStoreMasterLinkModeClass();
      syncActiveAisleHintClass(null);
    };

    const closeActiveVariantPicker = ({ commit = true } = {}) => {
      if (!activeVariantPicker) return;
      const {
        aid,
        baseKey,
        textarea,
        panel,
        outsideClickHandler,
        onEsc,
        onPanelKeyDown,
        onDocumentKeyDown,
        focusBaselineValue,
      } = activeVariantPicker;
      try {
        document.removeEventListener('mousedown', outsideClickHandler, true);
      } catch (_) {}
      try {
        textarea?.removeEventListener('keydown', onEsc, true);
      } catch (_) {}
      try {
        panel?.removeEventListener('keydown', onPanelKeyDown, true);
      } catch (_) {}
      try {
        document.removeEventListener('keydown', onDocumentKeyDown, true);
      } catch (_) {}
      try {
        panel?.remove();
      } catch (_) {}
      try {
        textarea?.classList?.remove('store-variant-picker-hidden-input');
      } catch (_) {}
      activeVariantPicker = null;
      const specs = cloneSpecs(aisleItemSpecsByAisle.get(aid) || []);
      if (!commit && typeof focusBaselineValue === 'string') {
        const restored = parseSpecsFromRaw(
          focusBaselineValue,
          specs,
          ingredientCatalog,
        );
        aisleItemSpecsByAisle.set(aid, restored);
      }
      syncDisplayLinesFromSpecs(aid);
      if (textarea && typeof textarea.value === 'string') {
        textarea.value = (aisleItemsByAisle.get(aid) || []).join('\n');
        setAisleTextareaRawDraft(textarea, textarea.value);
        try {
          textarea.__feAutoGrowResize?.();
        } catch (_) {}
        const itemsFieldEl = textarea.closest('.store-aisle-items-field');
        if (itemsFieldEl)
          syncStoreAisleDeprecatedFieldClassForField(aid, itemsFieldEl);
      }
      if (baseKey) refreshDirty();
    };

    const maybeOpenVariantPickerFromCaret = (textarea, aid) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const originalTextareaValue = String(textarea.value || '');
      const v = String(textarea.value || '');
      const selStart = Number(textarea.selectionStart ?? 0);
      const selEnd = Number(textarea.selectionEnd ?? selStart);
      const pos = Math.max(selStart, selEnd);
      const prevNl = v.lastIndexOf('\n', Math.max(0, pos - 1));
      const lineStart = prevNl === -1 ? 0 : prevNl + 1;
      const nextNl = v.indexOf('\n', pos);
      const lineEnd = nextNl === -1 ? v.length : nextNl;
      const lineText = String(v.slice(lineStart, lineEnd) || '');
      const col = Math.max(0, pos - lineStart);
      const selColStart = Math.max(0, Math.min(selStart, selEnd) - lineStart);
      const selColEnd = Math.max(0, Math.max(selStart, selEnd) - lineStart);
      const hasSelection = selColEnd > selColStart;
      const openIdx = lineText.indexOf('(');
      const closeIdx = lineText.lastIndexOf(')');
      if (openIdx < 0) return;
      const hasClosingParen = closeIdx > openIdx;
      if (hasClosingParen) {
        const inParenByCaret = col >= openIdx && col <= closeIdx + 1;
        const inParenBySelection =
          hasSelection && selColEnd >= openIdx && selColStart <= closeIdx + 1;
        if (!inParenByCaret && !inParenBySelection) return;
      } else if (col < openIdx) {
        const inParenBySelection = hasSelection && selColEnd >= openIdx;
        if (inParenBySelection) {
          // Selection reaches into the open-paren segment (e.g. triple-click line select).
        } else {
          // Support in-progress variant text (e.g. "apple (Fuji") before closing ")".
          return;
        }
      }
      const specs = parseSpecsFromRaw(
        textarea.value,
        aisleItemSpecsByAisle.get(aid) || [],
        ingredientCatalog,
      );
      aisleItemSpecsByAisle.set(aid, specs);
      const parsed = splitLineIntoBaseAndParenLoose(lineText);
      const baseKey = normItemKey(parsed?.baseName || '');
      if (!baseKey) return;
      const spec = specs.find((s) => s.baseKey === baseKey);
      if (!spec || !Number.isFinite(Number(spec.ingredientId))) return;
      closeActiveVariantPicker({ commit: true });
      const card = textarea.closest('.store-aisle-card');
      const itemsField = textarea.closest('.store-aisle-items-field');
      if (!card || !itemsField) return;
      const selected = new Set(
        (spec.selectedVariants || []).map((x) => normVariantKey(x)),
      );
      const knownVariants = Array.isArray(spec.knownVariants)
        ? spec.knownVariants.filter((x) => String(x?.name || '').trim())
        : [];
      // Build picker options optimistically: saved DB variants first, then any
      // valid ad-hoc variants the user already typed in this line.
      const pickerVariants = [];
      const seenPickerVariantKeys = new Set();
      knownVariants.forEach((variant) => {
        const vn = String(variant?.name || '').trim();
        const key = normVariantKey(vn);
        if (!key || seenPickerVariantKeys.has(key)) return;
        seenPickerVariantKeys.add(key);
        pickerVariants.push({
          id: Number.isFinite(Number(variant?.id)) ? Number(variant.id) : null,
          name: vn,
        });
      });
      (spec.selectedVariants || []).forEach((variantName) => {
        const vn = String(variantName || '').trim();
        const key = normVariantKey(vn);
        if (!key || seenPickerVariantKeys.has(key)) return;
        if (!isSupportedVariantName(vn)) return;
        seenPickerVariantKeys.add(key);
        pickerVariants.push({ id: null, name: vn });
      });
      const panel = document.createElement('div');
      panel.className = 'store-variant-picker store-variant-picker--inline';
      const inlineLine = document.createElement('div');
      inlineLine.className = 'store-variant-picker-inline-line';
      const baseLabel = document.createElement('span');
      baseLabel.className =
        'store-variant-picker-inline-name store-variant-picker-inline-name-pill';
      baseLabel.textContent = spec.baseName || '';
      inlineLine.appendChild(baseLabel);
      const pillsWrap = document.createElement('div');
      pillsWrap.className =
        'store-variant-picker-pills store-variant-picker-pills--inline';
      const pillButtons = [];
      let addAllBtn = null;
      const syncAllPillStates = () => {
        pillButtons.forEach(({ btn, key }) => {
          const on = selected.has(key);
          btn.classList.toggle('is-on', on);
          btn.classList.toggle('is-off', !on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (addAllBtn) {
          const allSelected =
            pickerVariants.length > 0 &&
            pickerVariants.every((v) =>
              selected.has(normVariantKey(String(v?.name || '').trim())),
            );
          addAllBtn.disabled = allSelected;
          addAllBtn.classList.toggle('is-unavailable', allSelected);
          addAllBtn.setAttribute(
            'aria-disabled',
            allSelected ? 'true' : 'false',
          );
        }
      };
      if (knownVariants.length >= 5) {
        addAllBtn = document.createElement('button');
        addAllBtn.type = 'button';
        addAllBtn.className =
          'ui-unknown-items-suggestion-pill store-variant-picker-pill store-variant-picker-pill--add-all';
        addAllBtn.textContent = 'Add all';
        addAllBtn.addEventListener('click', () => {
          pickerVariants.forEach((variant) => {
            const vn = String(variant?.name || '').trim();
            const key = normVariantKey(vn);
            if (key) selected.add(key);
          });
          const nextList = pickerVariants
            .map((v2) => String(v2?.name || '').trim())
            .filter((name) => selected.has(normVariantKey(name)));
          spec.selectedVariants = nextList;
          syncAllPillStates();
          syncDisplayLinesFromSpecs(aid, { pickerBaseKey: spec.baseKey });
          textarea.value = (aisleItemsByAisle.get(aid) || []).join('\n');
          try {
            textarea.__feAutoGrowResize?.();
          } catch (_) {}
          const ifield = textarea.closest('.store-aisle-items-field');
          if (ifield) syncStoreAisleDeprecatedFieldClassForField(aid, ifield);
          refreshDirty();
        });
        pillsWrap.appendChild(addAllBtn);
      }
      pickerVariants.forEach((variant) => {
        const vn = String(variant?.name || '').trim();
        const key = normVariantKey(vn);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'ui-unknown-items-suggestion-pill store-variant-picker-pill';
        btn.textContent = vn;
        pillButtons.push({ btn, key });
        btn.addEventListener('click', () => {
          if (selected.has(key)) selected.delete(key);
          else selected.add(key);
          const nextList = pickerVariants
            .map((v2) => String(v2?.name || '').trim())
            .filter((name) => selected.has(normVariantKey(name)));
          spec.selectedVariants = nextList;
          syncAllPillStates();
          syncDisplayLinesFromSpecs(aid, { pickerBaseKey: spec.baseKey });
          textarea.value = (aisleItemsByAisle.get(aid) || []).join('\n');
          try {
            textarea.__feAutoGrowResize?.();
          } catch (_) {}
          const ifield = textarea.closest('.store-aisle-items-field');
          if (ifield) syncStoreAisleDeprecatedFieldClassForField(aid, ifield);
          refreshDirty();
        });
        pillsWrap.appendChild(btn);
      });
      syncAllPillStates();
      inlineLine.appendChild(pillsWrap);
      panel.appendChild(inlineLine);
      itemsField.appendChild(panel);
      textarea.classList.add('store-variant-picker-hidden-input');
      syncDisplayLinesFromSpecs(aid, { pickerBaseKey: spec.baseKey });
      textarea.value = (aisleItemsByAisle.get(aid) || []).join('\n');
      try {
        textarea.__feAutoGrowResize?.();
      } catch (_) {}
      {
        const ifield = textarea.closest('.store-aisle-items-field');
        if (ifield) syncStoreAisleDeprecatedFieldClassForField(aid, ifield);
      }

      const outsideClickHandler = (evt) => {
        const t = evt?.target;
        if (!(t instanceof HTMLElement)) return;
        if (panel.contains(t)) return;
        if (t === textarea) return;
        closeActiveVariantPicker({ commit: true });
      };
      const onEsc = (evt) => {
        const key = String(evt?.key || '');
        if (key === 'Enter') {
          evt.preventDefault();
          evt.stopPropagation();
          const caretPos = Number(textarea?.selectionStart ?? 0);
          closeActiveVariantPicker({ commit: true });
          try {
            const nextPos = Math.max(
              0,
              Math.min(caretPos, Number(textarea?.value?.length ?? 0)),
            );
            textarea.focus();
            textarea.setSelectionRange(nextPos, nextPos);
          } catch (_) {}
          return;
        }
        if (key !== 'Escape') return;
        evt.preventDefault();
        evt.stopPropagation();
        closeActiveVariantPicker({ commit: false });
        try {
          textarea.blur();
        } catch (_) {}
      };
      const onPanelKeyDown = (evt) => {
        const key = String(evt?.key || '');
        if (key === 'Enter') {
          evt.preventDefault();
          evt.stopPropagation();
          const caretPos = Number(textarea?.selectionStart ?? 0);
          closeActiveVariantPicker({ commit: true });
          try {
            const nextPos = Math.max(
              0,
              Math.min(caretPos, Number(textarea?.value?.length ?? 0)),
            );
            textarea.focus();
            textarea.setSelectionRange(nextPos, nextPos);
          } catch (_) {}
          return;
        }
        if (key === 'Escape') {
          evt.preventDefault();
          evt.stopPropagation();
          closeActiveVariantPicker({ commit: false });
          try {
            textarea.blur();
          } catch (_) {}
        }
      };
      const onDocumentKeyDown = (evt) => {
        const key = String(evt?.key || '');
        if (key === 'Enter') {
          evt.preventDefault();
          evt.stopPropagation();
          const caretPos = Number(textarea?.selectionStart ?? 0);
          closeActiveVariantPicker({ commit: true });
          try {
            const nextPos = Math.max(
              0,
              Math.min(caretPos, Number(textarea?.value?.length ?? 0)),
            );
            textarea.focus();
            textarea.setSelectionRange(nextPos, nextPos);
          } catch (_) {}
          return;
        }
        if (key !== 'Escape') return;
        evt.preventDefault();
        evt.stopPropagation();
        closeActiveVariantPicker({ commit: false });
        try {
          textarea.blur();
        } catch (_) {}
      };
      document.addEventListener('mousedown', outsideClickHandler, true);
      textarea.addEventListener('keydown', onEsc, true);
      panel.addEventListener('keydown', onPanelKeyDown, true);
      document.addEventListener('keydown', onDocumentKeyDown, true);
      activeVariantPicker = {
        aid,
        baseKey: spec.baseKey,
        textarea,
        panel,
        outsideClickHandler,
        onEsc,
        onPanelKeyDown,
        onDocumentKeyDown,
        focusBaselineValue: originalTextareaValue,
      };
    };

    const renderAisleCards = () => {
      const list = document.getElementById('storeAislesList');
      if (!list) return;

      closeActiveVariantPicker({ commit: true });
      list.innerHTML = '';
      aisleRows.forEach((a) => {
        const aisleIndex = aisleRows.findIndex((r) => r.id === a.id);

        const slot = document.createElement('div');
        slot.className = STORE_AISLE_SLOT_CLASS;

        const card = document.createElement('div');
        card.className = 'shopping-item-editor-card store-aisle-card';
        card.dataset.aisleId = String(a.id);
        card.tabIndex = 0;
        if (desktopHoverEnabled) {
          slot.addEventListener('mouseenter', (e) => {
            hoverModifierActive = !!e.altKey;
            syncStoreMasterLinkModeClass();
            if (hoverModifierActive) {
              syncActiveAisleHintClass(slot);
            }
          });
          slot.addEventListener('mouseleave', () => {
            syncActiveAisleHintClass(null);
          });
        }

        const aisleTargetIsNameOrList = (target) =>
          target.closest('.store-aisle-name') ||
          target.closest('textarea') ||
          target.closest('.store-variant-picker') ||
          target.closest('.store-aisle-move-controls');

        const moveAisleByDelta = (delta, options = null) => {
          const from = aisleRows.findIndex((r) => r.id === a.id);
          if (from < 0) return;
          const to = from + delta;
          if (to < 0 || to >= aisleRows.length) return;
          const [row] = aisleRows.splice(from, 1);
          aisleRows.splice(to, 0, row);
          renderAisleCards();
          if (options?.focus === 'textarea') {
            const movedCard = document.querySelector(
              `.store-aisle-card[data-aisle-id="${String(a.id)}"]`,
            );
            const movedTextarea = movedCard?.querySelector(
              '.shopping-item-textarea',
            );
            if (movedTextarea) {
              try {
                movedTextarea.focus({ preventScroll: true });
              } catch (_) {
                movedTextarea.focus();
              }
              const start = Number.isFinite(options.selectionStart)
                ? Number(options.selectionStart)
                : null;
              const end = Number.isFinite(options.selectionEnd)
                ? Number(options.selectionEnd)
                : start;
              if (start != null) {
                try {
                  movedTextarea.setSelectionRange(start, end ?? start);
                } catch (_) {}
              }
            }
          }
          refreshDirty();
        };

        const attemptDeleteAisle = async () => {
          const ok = await uiConfirm({
            title: 'Delete aisle?',
            message: `Permanently delete “${(a.name || 'Aisle').replace(/"/g, '')}” and its item list?`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            danger: true,
          });
          if (!ok) return;
          const idx = aisleRows.findIndex((r) => r.id === a.id);
          if (idx < 0) return;
          const snapshot = { id: a.id, name: a.name };
          const itemsSnap = [...(aisleItemsByAisle.get(a.id) || [])];
          const specsSnap = cloneSpecs(aisleItemSpecsByAisle.get(a.id) || []);
          const wasPersisted = a.id > 0;

          if (wasPersisted) deletedAisleIds.add(a.id);
          aisleRows = aisleRows.filter((r) => r.id !== a.id);
          aisleItemsByAisle.delete(a.id);
          aisleItemSpecsByAisle.delete(a.id);
          renderAisleCards();
          refreshDirty();

          const restore = () => {
            try {
              if (wasPersisted) deletedAisleIds.delete(snapshot.id);
              const insertAt = Math.min(Math.max(0, idx), aisleRows.length);
              aisleRows.splice(insertAt, 0, {
                id: snapshot.id,
                name: snapshot.name,
              });
              aisleItemsByAisle.set(snapshot.id, [...itemsSnap]);
              aisleItemSpecsByAisle.set(snapshot.id, cloneSpecs(specsSnap));
            } catch (_) {}
            renderAisleCards();
            refreshDirty();
          };

          try {
            const um = window.undoManager;
            if (um && typeof um.push === 'function') {
              um.push({
                message: 'Aisle removed',
                undo: restore,
                timeoutMs: 8000,
              });
            } else if (typeof window.showUndoToast === 'function') {
              window.showUndoToast({
                message: 'Aisle removed',
                onUndo: restore,
              });
            }
          } catch (_) {}
        };

        card.addEventListener('click', (e) => {
          const wantsDelete = e.ctrlKey || e.metaKey;
          if (!wantsDelete) return;
          if (aisleTargetIsNameOrList(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          void attemptDeleteAisle();
        });

        card.addEventListener('contextmenu', (e) => {
          if (aisleTargetIsNameOrList(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          void attemptDeleteAisle();
        });

        card.addEventListener(
          'pointerdown',
          (e) => {
            if (e.button !== 0) return;
            if (e.ctrlKey || e.metaKey) return;
            if (e.target.closest('.store-aisle-move-controls')) return;
            if (!normalizeStoreEditorSearchQuery(storeEditorSearchQuery)) return;
            endStoreEditorSearchPreservingScroll(card);
          },
          true,
        );

        const moveControls = document.createElement('div');
        moveControls.className = 'store-aisle-move-controls';
        moveControls.setAttribute('aria-label', 'Reorder aisle');

        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'store-aisle-move-btn';
        moveUpBtn.type = 'button';
        const moveUpIcon = document.createElement('span');
        moveUpIcon.className =
          'material-symbols-outlined store-aisle-move-icon';
        moveUpIcon.setAttribute('aria-hidden', 'true');
        moveUpIcon.textContent = 'arrow_upward_alt';
        moveUpBtn.appendChild(moveUpIcon);
        moveUpBtn.setAttribute('aria-label', 'Move aisle up');
        if (aisleIndex <= 0) {
          moveUpBtn.disabled = true;
          moveUpBtn.setAttribute('aria-disabled', 'true');
        }
        moveUpBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          moveAisleByDelta(-1);
        });

        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'store-aisle-move-btn';
        moveDownBtn.type = 'button';
        const moveDownIcon = document.createElement('span');
        moveDownIcon.className =
          'material-symbols-outlined store-aisle-move-icon';
        moveDownIcon.setAttribute('aria-hidden', 'true');
        moveDownIcon.textContent = 'arrow_downward_alt';
        moveDownBtn.appendChild(moveDownIcon);
        moveDownBtn.setAttribute('aria-label', 'Move aisle down');
        if (aisleIndex >= aisleRows.length - 1) {
          moveDownBtn.disabled = true;
          moveDownBtn.setAttribute('aria-disabled', 'true');
        }
        moveDownBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          moveAisleByDelta(1);
        });

        moveControls.appendChild(moveUpBtn);
        moveControls.appendChild(moveDownBtn);
        card.appendChild(moveControls);

        const nameEl = document.createElement('div');
        nameEl.className = 'shopping-item-label store-aisle-name';
        nameEl.textContent = a.name || 'Aisle';

        nameEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (nameEl.isContentEditable) return;
          const starting = (a.name || '').trim() || 'Aisle';

          nameEl.contentEditable = 'true';
          nameEl.classList.add('editing-title');
          nameEl.textContent = starting;
          nameEl.focus();

          const cleanup = () => {
            nameEl.contentEditable = 'false';
            nameEl.classList.remove('editing-title');
            nameEl.removeEventListener('blur', onBlur);
            nameEl.removeEventListener('keydown', onKeyDown);
          };

          const commitLocal = () => {
            let next = (nameEl.textContent || '').trim();
            if (!next) next = starting;
            a.name = next;
            nameEl.textContent = next || 'Aisle';
            cleanup();
            refreshDirty();
          };

          const onBlur = () => {
            commitLocal();
          };

          const onKeyDown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              nameEl.removeEventListener('blur', onBlur);
              commitLocal();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              nameEl.textContent = a.name || 'Aisle';
              cleanup();
            }
          };

          nameEl.addEventListener('blur', onBlur);
          nameEl.addEventListener('keydown', onKeyDown);
        });

        card.appendChild(nameEl);

        let specs = cloneSpecs(aisleItemSpecsByAisle.get(a.id) || []);
        if (!specs.length) {
          const items = aisleItemsByAisle.get(a.id) || [];
          specs = parseSpecsFromRaw(items.join('\n'), [], ingredientCatalog);
          aisleItemSpecsByAisle.set(a.id, specs);
          syncDisplayLinesFromSpecs(a.id);
        }
        const itemsField = document.createElement('div');
        itemsField.className = 'shopping-item-field store-aisle-items-field';

        const ta = document.createElement('textarea');
        ta.className = 'shopping-item-textarea';
        ta.value = (aisleItemsByAisle.get(a.id) || []).join('\n');
        setAisleTextareaRawDraft(ta, ta.value);
        ta.placeholder = 'Add an item.';
        ta.setAttribute('aria-label', 'Aisle items');
        ta.wrap = 'soft';
        attachEditorTextareaAutoGrow(ta, { maxLines: 10 });
        attachEditorNewlineListPaste(ta);

        // Ingredient-name suggestions for the aisle items "paste box".
        // Uses shared typeahead infrastructure, but adapts it to textarea "current line".
        try {
          const taTypeahead = window.favoriteEatsTypeahead;
          if (
            taTypeahead &&
            typeof taTypeahead.attach === 'function' &&
            typeof taTypeahead.getNamePool === 'function'
          ) {
            const getCaretLineBounds = (textarea, caretPos) => {
              const v = String(textarea.value || '');
              const pos =
                caretPos != null && Number.isFinite(caretPos)
                  ? Number(caretPos)
                  : (textarea.selectionStart ?? 0);
              const prevNl = v.lastIndexOf('\n', pos - 1);
              const lineStart = prevNl === -1 ? 0 : prevNl + 1;
              const nextNl = v.indexOf('\n', pos);
              const lineEnd = nextNl === -1 ? v.length : nextNl;
              return { lineStart, lineEnd };
            };

            const getCurrentLineText = (textarea) => {
              const caretPos = textarea.selectionStart ?? 0;
              const { lineStart, lineEnd } = getCaretLineBounds(
                textarea,
                caretPos,
              );
              return vSlice(textarea.value, lineStart, lineEnd);
            };

            // Small local helper (keeps code below readable).
            const vSlice = (s, a, b) => String(s || '').slice(a, b);
            const getVariantPoolForBaseName = (baseName) => {
              const key = normItemKey(baseName);
              if (!key) return [];
              const known = ingredientCatalog?.byName?.get?.(key) || null;
              if (!known || !Array.isArray(known.variants)) return [];
              const out = [];
              const seen = new Set();
              known.variants.forEach((v) => {
                if (v?.isDeprecated) return;
                const clean = String(v?.name || '').trim();
                if (!clean) return;
                const k = normVariantKey(clean);
                if (!k || seen.has(k)) return;
                seen.add(k);
                out.push(clean);
              });
              return out;
            };
            const getLineTypeaheadContext = (textarea) => {
              const caretPos = textarea.selectionStart ?? 0;
              const { lineStart, lineEnd } = getCaretLineBounds(
                textarea,
                caretPos,
              );
              const lineText = vSlice(textarea.value, lineStart, lineEnd);
              const caretInLine = Math.max(
                0,
                Math.min(lineText.length, caretPos - lineStart),
              );
              const beforeCaret = vSlice(lineText, 0, caretInLine);
              const openParenIdx = beforeCaret.lastIndexOf('(');
              const closeParenIdx = beforeCaret.lastIndexOf(')');
              const inVariantContext =
                openParenIdx >= 0 && closeParenIdx < openParenIdx;
              if (!inVariantContext) {
                return {
                  mode: 'name',
                  query: String(lineText || '').trim(),
                  lineStart,
                  lineEnd,
                };
              }

              const baseName = String(
                vSlice(lineText, 0, openParenIdx) || '',
              ).trim();
              if (!baseName) {
                return {
                  mode: 'name',
                  query: String(lineText || '').trim(),
                  lineStart,
                  lineEnd,
                };
              }

              const tokenAnchor = beforeCaret.lastIndexOf(',');
              const tokenStartInLine =
                tokenAnchor >= openParenIdx
                  ? tokenAnchor + 1
                  : openParenIdx + 1;

              const afterCaret = vSlice(lineText, caretInLine, lineText.length);
              const tokenEndRel = afterCaret.search(/[,\)]/);
              const tokenEndInLine =
                tokenEndRel === -1
                  ? lineText.length
                  : caretInLine + tokenEndRel;

              let tokenTextStartInLine = tokenStartInLine;
              while (
                tokenTextStartInLine < tokenEndInLine &&
                /\s/.test(lineText[tokenTextStartInLine] || '')
              ) {
                tokenTextStartInLine += 1;
              }

              return {
                mode: 'variant',
                baseName,
                query: String(
                  vSlice(lineText, tokenTextStartInLine, caretInLine),
                ).trim(),
                lineStart,
                lineEnd,
                tokenTextStartAbs: lineStart + tokenTextStartInLine,
                tokenEndAbs: lineStart + tokenEndInLine,
              };
            };

            taTypeahead.attach({
              inputEl: ta,
              getPool: async (textarea) => {
                const ctx = getLineTypeaheadContext(textarea);
                if (ctx.mode === 'variant') {
                  return getVariantPoolForBaseName(ctx.baseName);
                }
                return await taTypeahead.getNamePool();
              },
              // Query is context-aware:
              // - name mode: current line text
              // - variant mode: current token inside parentheses
              getQuery: (textarea) =>
                String(getLineTypeaheadContext(textarea).query || ''),
              // Replace either:
              // - full line (name mode), or
              // - active variant token only (variant mode)
              setValue: (picked, textarea) => {
                const canonical = String(picked || '').trim();
                const ctx = getLineTypeaheadContext(textarea);
                if (ctx.mode === 'variant') {
                  const start = Number(ctx.tokenTextStartAbs);
                  const end = Number(ctx.tokenEndAbs);
                  const before = vSlice(textarea.value, 0, start);
                  const after = vSlice(
                    textarea.value,
                    end,
                    textarea.value.length,
                  );
                  textarea.value = before + canonical + after;
                  return { caretPos: start + canonical.length };
                }
                const before = vSlice(textarea.value, 0, ctx.lineStart);
                const after = vSlice(
                  textarea.value,
                  ctx.lineEnd,
                  textarea.value.length,
                );
                textarea.value = before + canonical + after;
                return { caretPos: ctx.lineStart + canonical.length };
              },
              allowSuggestionsWhenQueryEmpty: (textarea) => {
                const ctx = getLineTypeaheadContext(textarea);
                return (
                  ctx.mode === 'variant' &&
                  !ctx.query &&
                  getVariantPoolForBaseName(ctx.baseName).length > 0
                );
              },
              closeOnEmptyQuery: true,
              openOnlyWhenQueryNonEmpty: true,
              // Avoid suggestion flicker when pasting a whole list.
              ignoreInputTypes: ['insertFromPaste', 'insertFromDrop'],
              // Keep native down-arrow caret movement in aisle list textarea.
              openOnArrowDownWhenClosed: false,
            });

            // Caret changes without typing can leave stale suggestions; close on click to force refresh on typing.
            ta.addEventListener('click', () => {
              try {
                if (typeof taTypeahead.close === 'function')
                  taTypeahead.close();
              } catch (_) {}
            });
          }
        } catch (_) {}

        let escBaseline = parseUniqueItemLines(ta.value);
        let escBaselineText = ta.value;

        ta.addEventListener('focus', () => {
          if (normalizeStoreEditorSearchQuery(storeEditorSearchQuery)) {
            const anchorCard = ta.closest('.store-aisle-card');
            endStoreEditorSearchPreservingScroll(anchorCard);
          }
          closeActiveVariantPicker({ commit: true });
          const nextSpecs = parseSpecsFromRaw(
            ta.value,
            aisleItemSpecsByAisle.get(a.id) || [],
            ingredientCatalog,
          );
          aisleItemSpecsByAisle.set(a.id, nextSpecs);
          syncDisplayLinesFromSpecs(a.id, { expandAll: true });
          ta.value = (aisleItemsByAisle.get(a.id) || []).join('\n');
          setAisleTextareaRawDraft(ta, ta.value);
          escBaseline = parseUniqueItemLines(ta.value);
          escBaselineText = ta.value;
          syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
        });

        ta.addEventListener('input', () => {
          setAisleTextareaRawDraft(ta, ta.value);
          const nextSpecs = parseSpecsFromRaw(
            ta.value,
            aisleItemSpecsByAisle.get(a.id) || [],
            ingredientCatalog,
          );
          aisleItemSpecsByAisle.set(a.id, nextSpecs);
          aisleItemsByAisle.set(a.id, parseUniqueItemLines(ta.value));
          syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
          refreshDirty();
        });

        ta.addEventListener('click', (e) => {
          if (
            e &&
            e.altKey &&
            slot.classList.contains(STORE_AISLE_HINT_ACTIVE_CLASS)
          ) {
            const lineText = getTextareaLineTextAtCaret(ta);
            const baseName = extractMasterNameFromAisleLine(lineText);
            if (baseName) {
              e.preventDefault();
              e.stopPropagation();
              void (async () => {
                const match = await getShoppingMatchByName(baseName);
                if (match) navigateToShoppingMatch(match);
              })();
              return;
            }
          }
          if (Number(e?.detail || 0) < 3) return;
          if (activeVariantPicker && activeVariantPicker.textarea === ta)
            return;
          // Let native selection/caret settle first, then inspect caret context.
          window.setTimeout(() => {
            maybeOpenVariantPickerFromCaret(ta, a.id);
          }, 0);
        });

        ta.addEventListener('keydown', (e) => {
          const wantsAisleReorder =
            e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.shiftKey &&
            (e.key === 'ArrowUp' || e.key === 'ArrowDown');
          if (wantsAisleReorder) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
              e.stopImmediatePropagation();
            }
            moveAisleByDelta(e.key === 'ArrowUp' ? -1 : 1, {
              focus: 'textarea',
              selectionStart: ta.selectionStart,
              selectionEnd: ta.selectionEnd,
            });
            return;
          }
          if (
            e.key === 'Enter' &&
            activeVariantPicker &&
            activeVariantPicker.textarea === ta
          ) {
            // Picker-level Enter handler (capture phase) owns commit + focus restore.
            return;
          }
          if (e.key === 'Enter' && e.shiftKey) {
            // Chat-style newline override: Shift+Enter inserts a hard line break.
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            closeActiveVariantPicker({ commit: true });
            try {
              ta.blur();
            } catch (_) {}
            return;
          }
          if (
            e.key === 'Escape' &&
            activeVariantPicker &&
            activeVariantPicker.textarea === ta
          ) {
            // Picker-level Esc handler (capture phase) owns close + blur.
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            closeActiveVariantPicker({ commit: false });
            ta.value = escBaselineText || escBaseline.join('\n');
            const nextSpecs = parseSpecsFromRaw(
              ta.value,
              aisleItemSpecsByAisle.get(a.id) || [],
              ingredientCatalog,
            );
            aisleItemSpecsByAisle.set(a.id, nextSpecs);
            syncDisplayLinesFromSpecs(a.id);
            ta.value = (aisleItemsByAisle.get(a.id) || []).join('\n');
            syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
            try {
              ta.__feAutoGrowResize();
            } catch (_) {}
            refreshDirty();
            return;
          }
        });

        ta.addEventListener('blur', () => {
          window.setTimeout(() => {
            if (activeVariantPicker && activeVariantPicker.textarea === ta)
              return;
            const nextSpecs = parseSpecsFromRaw(
              ta.value,
              aisleItemSpecsByAisle.get(a.id) || [],
              ingredientCatalog,
            );
            aisleItemSpecsByAisle.set(a.id, nextSpecs);
            syncDisplayLinesFromSpecs(a.id);
            ta.value = (aisleItemsByAisle.get(a.id) || []).join('\n');
            setAisleTextareaRawDraft(ta, ta.value);
            syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
            try {
              ta.__feAutoGrowResize?.();
            } catch (_) {}
            refreshDirty();
          }, 0);
        });

        const filteredResults = document.createElement('div');
        filteredResults.className = 'store-aisle-search-results';
        filteredResults.hidden = true;
        filteredResults.setAttribute('aria-hidden', 'true');
        filteredResults.setAttribute('aria-label', 'Matching aisle items');
        itemsField.appendChild(filteredResults);

        itemsField.appendChild(ta);
        syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
        card.appendChild(itemsField);

        slot.appendChild(card);

        const slotCta = document.createElement('div');
        slotCta.className = 'store-add-aisle-cta store-add-aisle-cta--per-slot';
        slotCta.setAttribute('role', 'button');
        slotCta.tabIndex = 0;
        const slotCtaLabel = document.createElement('span');
        slotCtaLabel.className = 'placeholder-prompt';
        slotCtaLabel.textContent = 'Add an aisle';
        slotCta.appendChild(slotCtaLabel);
        slot.appendChild(slotCta);

        list.appendChild(slot);
      });
      syncEmptyStateAisleCta();
      applyStoreEditorSearch(storeEditorSearchQuery);
      list.querySelectorAll('.store-aisle-card').forEach((cardEl) => {
        const aid = Number(cardEl.dataset.aisleId);
        const field = cardEl.querySelector('.store-aisle-items-field');
        if (Number.isFinite(aid) && field) {
          syncStoreAisleDeprecatedFieldClassForField(aid, field);
        }
      });
      try {
        const rawFocus = sessionStorage.getItem(
          STORE_EDITOR_FOCUS_AISLE_SESSION_KEY,
        );
        if (rawFocus != null && rawFocus !== '') {
          sessionStorage.removeItem(STORE_EDITOR_FOCUS_AISLE_SESSION_KEY);
          const focusAisleId = Number(rawFocus);
          if (Number.isFinite(focusAisleId) && focusAisleId > 0 && list) {
            requestAnimationFrame(() => {
              const card = list.querySelector(
                `.store-aisle-card[data-aisle-id="${String(focusAisleId)}"]`,
              );
              card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
          }
        }
      } catch (_) {}
    };

    const runAddAisle = async (insertAfterIndex) => {
      if (!window.ui) {
        uiToast('UI not ready yet.');
        return;
      }
      const name = await window.ui.prompt({
        title: 'New Aisle',
        label: 'Name',
        value: '',
        confirmText: 'Create',
        cancelText: 'Cancel',
        required: true,
        normalize: (v) => (v || '').trim(),
      });
      if (!name) return;

      const tid = nextTempAisleId--;
      const newRow = { id: tid, name };
      if (
        insertAfterIndex != null &&
        insertAfterIndex >= 0 &&
        insertAfterIndex < aisleRows.length
      ) {
        aisleRows.splice(insertAfterIndex + 1, 0, newRow);
      } else {
        aisleRows.push(newRow);
      }
      aisleItemsByAisle.set(tid, []);
      aisleItemSpecsByAisle.set(tid, []);
      renderAisleCards();
      refreshDirty();
    };

    const wireAddAisle = () => {
      if (!hasPersistedStore) return;
      const list = document.getElementById('storeAislesList');
      const emptyCta = document.getElementById('storeAddAisleCtaEmpty');

      if (list) {
        const slotIndex = (cta) => {
          const slot = cta.closest('.store-aisle-slot');
          if (!slot) return undefined;
          const slots = Array.from(list.querySelectorAll('.store-aisle-slot'));
          return slots.indexOf(slot);
        };
        list.addEventListener('click', (e) => {
          const cta = e.target.closest('.store-add-aisle-cta--per-slot');
          if (!cta) return;
          e.preventDefault();
          e.stopPropagation();
          void runAddAisle(slotIndex(cta));
        });
        list.addEventListener('keydown', (e) => {
          const cta = e.target.closest('.store-add-aisle-cta--per-slot');
          if (!cta) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void runAddAisle(slotIndex(cta));
          }
        });
      }

      if (emptyCta) {
        emptyCta.addEventListener('click', () => void runAddAisle());
        emptyCta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void runAddAisle();
          }
        });
      }
    };

    const flushStoreAislesDraft = async (db, sid) => {
      dropLegacyVariantAisleUniqueIndexesInMain(db);
      const { getVisibleCanonicalId, anyIngredientNamed } =
        createIngredientLookupHelpers(db);
      const {
        hasVariantTable: hasVariantLookupTable,
        getIngredientNameById,
        anyVariantForIngredient,
      } = createVariantLookupHelpers(db);
      ingredientCatalog = loadIngredientCatalog(db);
      const hasVariantTable = tableExistsLocal(db, 'ingredient_variants');
      const hasVariantAisleTable = tableExistsLocal(
        db,
        'ingredient_variant_store_location',
      );

      const normalizeAllAisleSpecs = () => {
        for (const r of aisleRows) {
          const currentSpecs = cloneSpecs(
            aisleItemSpecsByAisle.get(r.id) || [],
          );
          const specs = currentSpecs.length
            ? normalizeSpecsWithCatalog(currentSpecs, ingredientCatalog)
            : parseSpecsFromRaw(
                (aisleItemsByAisle.get(r.id) || []).join('\n'),
                [],
                ingredientCatalog,
              );
          aisleItemSpecsByAisle.set(r.id, specs);
          syncDisplayLinesFromSpecs(r.id);
        }
      };
      normalizeAllAisleSpecs();

      const blockedKeys = new Set();
      const unknownUnique = [];
      const uk = new Set();
      for (const r of aisleRows) {
        const specs = cloneSpecs(aisleItemSpecsByAisle.get(r.id) || []);
        for (const spec of specs) {
          const base = String(spec.baseName || '').trim();
          if (!base) continue;
          const vid = getVisibleCanonicalId(base);
          if (vid) continue;
          if (anyIngredientNamed(base)) blockedKeys.add(normItemKey(base));
          else {
            const k = normItemKey(base);
            if (!uk.has(k)) {
              uk.add(k);
              unknownUnique.push(base);
            }
          }
        }
      }

      if (blockedKeys.size) {
        const sample = [];
        outer: for (const r of aisleRows) {
          for (const spec of aisleItemSpecsByAisle.get(r.id) || []) {
            if (blockedKeys.has(normItemKey(spec.baseName))) {
              sample.push(spec.baseName);
              if (sample.length >= 5) break outer;
            }
          }
        }
        uiToast(
          `Skipped (hidden or deprecated): ${sample.join(', ')}${blockedKeys.size > 5 ? '…' : ''}`,
        );
      }

      if (unknownUnique.length) {
        if (!window.ui?.unknownItems) {
          uiToast('UI not ready.');
          throw { silent: true };
        }
        const resolved = await resolveUnknownIngredientNames({
          db,
          names: unknownUnique,
          title: `New ingredients (${unknownUnique.length})`,
          message:
            unknownUnique.length === 1
              ? 'This ingredient is not in your database. Edit, match it to an existing ingredient, or save it as a new one.'
              : 'These ingredients are not in your database. Edit, match them to existing ingredients, or save them as new ones.',
        });
        if (!resolved) {
          uiToast('Save cancelled.');
          throw { silent: true };
        }

        const replacementMap = resolved.map;
        for (const r of aisleRows) {
          const specs = cloneSpecs(aisleItemSpecsByAisle.get(r.id) || []);
          specs.forEach((spec) => {
            const key = normItemKey(spec.baseName);
            const repl = replacementMap.get(key);
            if (!repl) return;
            spec.baseName = repl;
            spec.baseKey = normItemKey(repl);
          });
          aisleItemSpecsByAisle.set(r.id, specs);
          syncDisplayLinesFromSpecs(r.id);
        }

        const createQueue = [];
        const createSeen = new Set();
        for (const n of resolved.finalNames) {
          const t = String(n || '').trim();
          const k = normItemKey(t);
          if (!t || createSeen.has(k)) continue;
          createSeen.add(k);
          if (anyIngredientNamed(t)) continue;
          createQueue.push(t);
        }

        let ingredientsHasLemma = false;
        try {
          const info = db.exec('PRAGMA table_info(ingredients);');
          const rows = info.length ? info[0].values : [];
          ingredientsHasLemma = rows.some(
            (row) => String((row && row[1]) || '').toLowerCase() === 'lemma',
          );
        } catch (_) {}

        for (const n of createQueue) {
          try {
            // Skip if ingredient already exists by name.
            const existQ = db.exec(
              `SELECT 1 FROM ingredients WHERE lower(name) = lower('${n.replace(/'/g, "''")}') LIMIT 1;`,
            );
            if (existQ.length && existQ[0].values.length) continue;

            const cols = ['name'];
            const vals = [n];
            if (ingredientsHasLemma) {
              cols.push('lemma');
              vals.push(deriveIngredientLemmaInMain(n));
            }

            const placeholders = cols.map(() => '?').join(', ');
            db.run(
              `INSERT INTO ingredients (${cols.join(', ')}) VALUES (${placeholders});`,
              vals,
            );
          } catch (e) {
            console.warn('Store editor: insert ingredient', e);
          }
        }
        // New ingredient names should become available in the aisle items suggestions immediately.
        try {
          window.favoriteEatsTypeahead?.invalidate?.();
        } catch (_) {}
        ingredientCatalog = loadIngredientCatalog(db);
        normalizeAllAisleSpecs();
      }

      if (hasVariantLookupTable) {
        const unknownVariantUnique = [];
        const seenUnknownVariants = new Set();
        for (const r of aisleRows) {
          const specs = cloneSpecs(aisleItemSpecsByAisle.get(r.id) || []);
          for (const spec of specs) {
            const base = String(spec.baseName || '').trim();
            if (!base) continue;
            const ingredientId = Number(getVisibleCanonicalId(base));
            if (!Number.isFinite(ingredientId) || ingredientId <= 0) continue;
            const selected = (spec.selectedVariants || []).filter(
              isSupportedVariantName,
            );
            for (const variantName of selected) {
              if (anyVariantForIngredient(ingredientId, variantName)) continue;
              const key = `${ingredientId}::${normVariantKey(variantName)}`;
              if (!key || seenUnknownVariants.has(key)) continue;
              seenUnknownVariants.add(key);
              unknownVariantUnique.push({
                ingredientId,
                ingredientName: getIngredientNameById(ingredientId) || base,
                variant: variantName,
              });
            }
          }
        }

        if (unknownVariantUnique.length) {
          const resolvedVariants = await resolveUnknownIngredientVariants({
            db,
            entries: unknownVariantUnique,
          });
          if (!resolvedVariants) {
            uiToast('Save cancelled.');
            throw { silent: true };
          }
          const replacementMap = resolvedVariants.map;
          for (const r of aisleRows) {
            const specs = cloneSpecs(aisleItemSpecsByAisle.get(r.id) || []);
            specs.forEach((spec) => {
              const base = String(spec.baseName || '').trim();
              const ingredientId = Number(getVisibleCanonicalId(base));
              if (!Number.isFinite(ingredientId) || ingredientId <= 0) return;
              const nextSelected = [];
              const seenSelected = new Set();
              (spec.selectedVariants || []).forEach((variantName) => {
                const original = String(variantName || '').trim();
                if (!isSupportedVariantName(original)) return;
                const key = `${ingredientId}::${normVariantKey(original)}`;
                const replacement = String(
                  replacementMap.get(key) || original,
                ).trim();
                if (!isSupportedVariantName(replacement)) return;
                const replacementKey = normVariantKey(replacement);
                if (!replacementKey || seenSelected.has(replacementKey)) return;
                seenSelected.add(replacementKey);
                nextSelected.push(replacement);
              });
              spec.selectedVariants = nextSelected;
            });
            aisleItemSpecsByAisle.set(r.id, specs);
            syncDisplayLinesFromSpecs(r.id);
          }
        }
      }

      for (const aid of [...deletedAisleIds]) {
        if (hasVariantAisleTable) {
          db.run(
            'DELETE FROM ingredient_variant_store_location WHERE store_location_id = ?;',
            [aid],
          );
        }
        db.run(
          'DELETE FROM ingredient_store_location WHERE store_location_id = ?;',
          [aid],
        );
        db.run('DELETE FROM store_locations WHERE ID = ? AND store_id = ?;', [
          aid,
          sid,
        ]);
      }
      deletedAisleIds.clear();

      const toRemap = aisleRows.filter((r) => r.id < 0);
      for (const r of toRemap) {
        const maxQ = db.exec(
          'SELECT COALESCE(MAX(sort_order), 0) FROM store_locations WHERE store_id = ?;',
          [sid],
        );
        let nextSort = 1;
        if (maxQ.length && maxQ[0].values.length) {
          nextSort = Number(maxQ[0].values[0][0]) + 1;
        }
        db.run(
          'INSERT INTO store_locations (store_id, name, sort_order) VALUES (?, ?, ?);',
          [sid, r.name || 'Aisle', nextSort],
        );
        const idQ = db.exec('SELECT last_insert_rowid();');
        const newId = Number(idQ[0].values[0][0]);
        const oldId = r.id;
        const items = aisleItemsByAisle.get(oldId) || [];
        const specs = cloneSpecs(aisleItemSpecsByAisle.get(oldId) || []);
        aisleItemsByAisle.delete(oldId);
        aisleItemsByAisle.set(newId, [...items]);
        aisleItemSpecsByAisle.delete(oldId);
        aisleItemSpecsByAisle.set(newId, specs);
        r.id = newId;
      }

      aisleRows.forEach((r, index) => {
        const sortOrder = index + 1;
        db.run(
          'UPDATE store_locations SET name = ?, sort_order = ? WHERE ID = ? AND store_id = ?;',
          [r.name || 'Aisle', sortOrder, r.id, sid],
        );
      });

      const compareAisleItemSpecsForSave = (a, b) => {
        const baseA = String(a?.baseName || '').trim();
        const baseB = String(b?.baseName || '').trim();
        const byBase = baseA.localeCompare(baseB, undefined, {
          sensitivity: 'base',
        });
        if (byBase !== 0) return byBase;

        const variantsA = (
          Array.isArray(a?.selectedVariants) ? a.selectedVariants : []
        )
          .map((v) => String(v || '').trim())
          .filter(Boolean);
        const variantsB = (
          Array.isArray(b?.selectedVariants) ? b.selectedVariants : []
        )
          .map((v) => String(v || '').trim())
          .filter(Boolean);
        const byVariants = variantsA
          .join(', ')
          .localeCompare(variantsB.join(', '), undefined, {
            sensitivity: 'base',
          });
        if (byVariants !== 0) return byVariants;

        return Number(a?.ingredientId || 0) - Number(b?.ingredientId || 0);
      };

      for (const r of aisleRows) {
        const specs = cloneSpecs(aisleItemSpecsByAisle.get(r.id) || [])
          .filter((spec) => !blockedKeys.has(normItemKey(spec.baseName)))
          .sort(compareAisleItemSpecsForSave);
        const resolvedGenericIds = [];
        const seenGenericId = new Set();
        const ensureVariantId = (ingredientId, variantName) => {
          const iid = Number(ingredientId);
          const vv = String(variantName || '').trim();
          if (!Number.isFinite(iid) || !isSupportedVariantName(vv)) return null;
          const q = db.exec(
            `SELECT id
               FROM ingredient_variants
              WHERE ingredient_id = ?
                AND lower(trim(variant)) = lower(trim(?))
              ORDER BY COALESCE(sort_order, 999999), id
              LIMIT 1;`,
            [iid, vv],
          );
          if (q.length && q[0].values.length) return Number(q[0].values[0][0]);
          const maxQ = db.exec(
            `SELECT COALESCE(MAX(sort_order), 0) FROM ingredient_variants WHERE ingredient_id = ?;`,
            [iid],
          );
          const nextSort =
            maxQ.length && maxQ[0].values.length
              ? Number(maxQ[0].values[0][0]) + 1
              : 1;
          db.run(
            `INSERT INTO ingredient_variants (ingredient_id, variant, sort_order)
             VALUES (?, ?, ?);`,
            [iid, vv, nextSort],
          );
          const idQ = db.exec('SELECT last_insert_rowid();');
          if (idQ.length && idQ[0].values.length)
            return Number(idQ[0].values[0][0]);
          return null;
        };
        db.run(
          'DELETE FROM ingredient_store_location WHERE store_location_id = ?;',
          [r.id],
        );
        if (hasVariantAisleTable) {
          db.run(
            'DELETE FROM ingredient_variant_store_location WHERE store_location_id = ?;',
            [r.id],
          );
        }
        for (const spec of specs) {
          const iid = getVisibleCanonicalId(spec.baseName);
          if (!Number.isFinite(iid)) continue;
          const selected = (spec.selectedVariants || []).filter(
            isSupportedVariantName,
          );
          if (!seenGenericId.has(iid)) {
            seenGenericId.add(iid);
            resolvedGenericIds.push(iid);
          }
          if (!selected.length || !hasVariantTable || !hasVariantAisleTable)
            continue;
          const seenVariantKey = new Set();
          for (const vn of selected) {
            const vk = normVariantKey(vn);
            if (!vk || seenVariantKey.has(vk)) continue;
            seenVariantKey.add(vk);
            const variantId = ensureVariantId(iid, vn);
            if (!Number.isFinite(variantId)) continue;
            db.run(
              `INSERT OR IGNORE INTO ingredient_variant_store_location (ingredient_variant_id, store_location_id)
               VALUES (?, ?);`,
              [variantId, r.id],
            );
          }
        }
        for (const iid of resolvedGenericIds) {
          db.run(
            'INSERT INTO ingredient_store_location (ingredient_id, store_location_id) VALUES (?, ?);',
            [iid, r.id],
          );
        }
        aisleItemSpecsByAisle.set(r.id, specs);
        syncDisplayLinesFromSpecs(r.id);
      }
    };

    if (typeof waitForAppBarReady !== 'function') {
      renderAisleCards();
      wireAddAisle();
      return;
    }

    await waitForAppBarReady();
    if (hasPersistedStore) {
      storeEditorSearchInput = document.getElementById('appBarSearchInput');
      const storeEditorSearchClearBtn =
        document.getElementById('appBarSearchClear');
      wireAppBarSearch(storeEditorSearchInput, {
        clearBtn: storeEditorSearchClearBtn,
        onQueryChange: (query) => {
          applyStoreEditorSearch(query);
        },
        normalizeQuery: normalizeStoreEditorSearchQuery,
      });
    }
    const pageCtl = wireChildEditorPage({
      backBtn: document.getElementById('appBarBackBtn'),
      cancelBtn: document.getElementById('appBarCancelBtn'),
      saveBtn: document.getElementById('appBarSaveBtn'),
      appBarTitleEl: document.getElementById('appBarTitle'),
      bodyTitleEl: document.getElementById('childEditorTitle'),
      initialTitle: titleText,
      backHref: 'stores.html',
      subtitleEl: document.getElementById('storeLocationSubtitle'),
      initialSubtitle: locTrim,
      normalizeSubtitle: (s) => (s || '').trim(),
      subtitlePlaceholder: 'Add a description.',
      subtitleEmptyMeansHidden: true,
      extraDirtyState: hasPersistedStore
        ? {
            isDirty: () => aislesDraftDirty(),
            onCancel: () => {
              restoreDraftFromSnapshot(draftSnapshot);
              renderAisleCards();
            },
            onAfterSaveSuccess: () => {
              draftSnapshot = cloneDraftSnapshot();
            },
          }
        : null,
      onSave: async ({ title: next, subtitle: nextLoc }) => {
        const sid = sessionStorage.getItem('selectedStoreId');
        const isNewStore = sessionStorage.getItem('selectedStoreIsNew') === '1';

        const db = await openStoreEditorDb();
        const id = Number(sid);
        const loc = (nextLoc ?? '').trim();
        let insertedNewStore = false;

        if (Number.isFinite(id)) {
          if (hasPersistedStore) {
            for (const card of document.querySelectorAll('.store-aisle-card')) {
              const aid = Number(card.dataset.aisleId);
              const row = aisleRows.find((r) => r.id === aid);
              if (!row) continue;
              const ne = card.querySelector('.store-aisle-name');
              if (ne) {
                const t = (ne.textContent || '').trim();
                if (t) row.name = t;
              }
              const ta = card.querySelector('textarea');
              if (ta) {
                const currentSpecs = cloneSpecs(
                  aisleItemSpecsByAisle.get(aid) || [],
                );
                const nextSpecs = currentSpecs.length
                  ? normalizeSpecsWithCatalog(currentSpecs, ingredientCatalog)
                  : parseSpecsFromRaw(
                      getAisleTextareaRawDraft(ta),
                      [],
                      ingredientCatalog,
                    );
                aisleItemSpecsByAisle.set(aid, nextSpecs);
                syncDisplayLinesFromSpecs(aid);
                const itemsFieldEl = card.querySelector(
                  '.store-aisle-items-field',
                );
                if (itemsFieldEl)
                  syncStoreAisleDeprecatedFieldClassForField(aid, itemsFieldEl);
              }
            }
            await flushStoreAislesDraft(db, id);
          }
          db.run(
            'UPDATE stores SET chain_name = ?, location_name = ? WHERE ID = ?;',
            [next || '', loc, id],
          );
        } else if (isNewStore || !sid) {
          db.run(
            'INSERT INTO stores (chain_name, location_name) VALUES (?, ?);',
            [next || '', loc],
          );
          const idQ = db.exec('SELECT last_insert_rowid();');
          if (idQ.length && idQ[0].values.length) {
            sessionStorage.setItem(
              'selectedStoreId',
              String(idQ[0].values[0][0]),
            );
          }
          insertedNewStore = true;
        }

        await persistStoreEditorDb(db);
        sessionStorage.setItem('selectedStoreChain', next || '');
        sessionStorage.setItem('selectedStoreLocation', loc);
        sessionStorage.removeItem('selectedStoreIsNew');
        if (insertedNewStore) {
          window.location.reload();
        } else if (hasPersistedStore) {
          renderAisleCards();
        }
      },
    });
    refreshDirty =
      (pageCtl && pageCtl.refreshDirty) ||
      (() => {
        /* noop */
      });
    renderAisleCards();
    wireAddAisle();
  })();
}

// Shared helper for *all* editor pages (shopping, units, stores, future)

// Usage inside any load*EditorPage():
//   const editor = initEditorPage({ saveBtn, cancelBtn, root: view });
//   editor.markDirty();  // optional manual trigger
// ---------------------------------------------------------------------------
function initEditorPage({ saveBtn, cancelBtn, root }) {
  // Each editor gets its own dirty flag; starts clean.
  let isDirty = false;

  // Disable buttons until the user edits.
  if (cancelBtn) cancelBtn.disabled = true;
  if (saveBtn) saveBtn.disabled = true;

  const enableButtons = () => {
    if (cancelBtn) cancelBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
  };

  const markDirty = () => {
    if (isDirty) return;
    isDirty = true;
    enableButtons();
  };

  // Common-sense rule: anything the user can change marks the page dirty.
  const wireDirtyTracking = (node) => {
    if (!node) return;
    const editables = node.querySelectorAll(
      'input, textarea, select, [contenteditable="true"]',
    );
    editables.forEach((el) => {
      el.addEventListener('input', markDirty);
      el.addEventListener('change', markDirty);
    });
  };

  wireDirtyTracking(root);

  // Expose a tiny API for pages that need manual control later.
  return {
    markDirty,
    resetDirty() {
      isDirty = false;
      if (cancelBtn) cancelBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
    },
    get isDirty() {
      return isDirty;
    },
  };
}

const BOTTOM_NAV_TAB_LABELS = Object.freeze({
  recipes: 'Recipes',
  shopping: 'Items',
  'shopping-list': 'List',
  stores: 'Stores',
  tags: 'Tags',
  sizes: 'Sizes',
  units: 'Units',
});

function syncBottomNavPills(pillRow) {
  if (!(pillRow instanceof HTMLElement)) return;
  const order = getTopLevelPageOrder();
  const existing = new Map();
  Array.from(pillRow.querySelectorAll('.bottom-nav-pill')).forEach((p) => {
    const tab = String(p.dataset.tab || '').trim();
    if (tab) existing.set(tab, p);
  });
  const frag = document.createDocumentFragment();
  for (const tab of order) {
    let pill = existing.get(tab);
    if (!pill) {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'bottom-nav-pill';
      pill.dataset.tab = tab;
    }
    const label = BOTTOM_NAV_TAB_LABELS[tab];
    if (label) pill.textContent = label;
    frag.appendChild(pill);
  }
  while (pillRow.firstChild) pillRow.removeChild(pillRow.firstChild);
  pillRow.appendChild(frag);
}

function applyBottomNavActiveState(pillRow, activeTab) {
  if (!(pillRow instanceof HTMLElement)) return;
  pillRow.querySelectorAll('.bottom-nav-pill').forEach((pill) => {
    const tab = pill.dataset.tab;
    const isActive = tab === activeTab;
    pill.classList.toggle('bottom-nav-pill--active', isActive);
    pill.disabled = !!isActive;
  });
}

function getListPageBottomNavActiveTab() {
  const body = document.body;
  if (!body) return null;
  if (body.classList.contains('recipes-page')) return 'recipes';
  if (body.classList.contains('shopping-page')) return 'shopping';
  if (body.classList.contains('shopping-list-page')) return 'shopping-list';
  if (body.classList.contains('units-page')) return 'units';
  if (body.classList.contains('sizes-page')) return 'sizes';
  if (body.classList.contains('stores-page')) return 'stores';
  if (body.classList.contains('tags-page')) return 'tags';
  return null;
}

function reconcileAfterForceWebModeToggle() {
  const pillRow = document.querySelector('.bottom-nav-pill-row');
  const activeTab = getListPageBottomNavActiveTab();
  if (pillRow instanceof HTMLElement) {
    syncBottomNavPills(pillRow);
    if (activeTab) applyBottomNavActiveState(pillRow, activeTab);
  }
  const nextPages = getTopLevelPageOrder();
  const currentPage = String(activeTab || detectPageIdFromBody() || '')
    .trim()
    .toLowerCase();
  if (!nextPages.includes(currentPage)) {
    const targetPage = nextPages.includes('recipes')
      ? 'recipes'
      : nextPages[0] || 'recipes';
    window.location.href = getTopLevelPageHref(targetPage);
  }
}

function syncBottomNavEditorToggleCheckedState() {
  const bottomNavEditorToggle = document.getElementById('bottomNavEditorToggle');
  if (bottomNavEditorToggle instanceof HTMLInputElement) {
    bottomNavEditorToggle.checked = !isForceWebModeEnabled();
  }
}

let favoriteEatsForceWebModeShortcutWired = false;
function wireFavoriteEatsForceWebModeShortcutOnce() {
  if (favoriteEatsForceWebModeShortcutWired) return;
  favoriteEatsForceWebModeShortcutWired = true;
  document.addEventListener(
    'keydown',
    (e) => {
      if (!isHiddenForceWebModeToggleAllowed()) return;
      if (e.isComposing) return;
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey) return;
      if (String(e.key || '').toLowerCase() !== 'e') return;
      if (isTypingContext(e.target) && !isAppBarSearchContext(e.target)) return;
      if (isModalOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      setForceWebModeEnabled(!isForceWebModeEnabled());
      syncBottomNavEditorToggleCheckedState();
      reconcileAfterForceWebModeToggle();
    },
    { capture: true },
  );
}

wireFavoriteEatsForceWebModeShortcutOnce();

// --- Bottom navigation wiring (list pages only) ---
function initBottomNav() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;

  // Hidden-by-default sheet model: rely on CSS class.
  nav.classList.add('bottom-nav--hidden');

  const pillRow = nav.querySelector('.bottom-nav-pill-row');
  if (pillRow instanceof HTMLElement) {
    syncBottomNavPills(pillRow);
  }

  if (
    isHiddenForceWebModeToggleAllowed() &&
    pillRow instanceof HTMLElement &&
    !nav.querySelector('.bottom-nav-editor-section')
  ) {
    const editorSection = document.createElement('div');
    editorSection.className = 'bottom-nav-editor-section';
    const editorLabel = document.createElement('label');
    editorLabel.className = 'bottom-nav-editor-toggle';
    const editorTitle = document.createElement('span');
    editorTitle.textContent = 'Editing';
    const switchTrack = document.createElement('span');
    switchTrack.className = 'bottom-nav-editor-switch-track';
    const editorToggle = document.createElement('input');
    editorToggle.type = 'checkbox';
    editorToggle.id = 'bottomNavEditorToggle';
    editorToggle.className = 'bottom-nav-editor-switch-input';
    editorToggle.setAttribute('aria-label', 'Editing');
    const switchKnob = document.createElement('span');
    switchKnob.className = 'bottom-nav-editor-switch-knob';
    switchTrack.appendChild(editorToggle);
    switchTrack.appendChild(switchKnob);
    editorLabel.appendChild(editorTitle);
    editorLabel.appendChild(switchTrack);
    const editorSeparator = document.createElement('div');
    editorSeparator.className = 'bottom-nav-editor-separator';
    editorSeparator.setAttribute('role', 'presentation');
    editorSection.appendChild(editorLabel);
    editorSection.appendChild(editorSeparator);
    nav.insertBefore(editorSection, pillRow);
  }

  const pills = Array.from(nav.querySelectorAll('.bottom-nav-pill'));
  if (!pills.length) return;

  const body = document.body;
  let activeTab = null;

  if (body.classList.contains('recipes-page')) {
    activeTab = 'recipes';
  } else if (body.classList.contains('shopping-page')) {
    activeTab = 'shopping';
  } else if (body.classList.contains('shopping-list-page')) {
    activeTab = 'shopping-list';
  } else if (body.classList.contains('units-page')) {
    activeTab = 'units';
  } else if (body.classList.contains('sizes-page')) {
    activeTab = 'sizes';
  } else if (body.classList.contains('stores-page')) {
    activeTab = 'stores';
  } else if (body.classList.contains('tags-page')) {
    activeTab = 'tags';
  }

  const bottomNavEditorToggle = document.getElementById('bottomNavEditorToggle');
  if (bottomNavEditorToggle && pillRow instanceof HTMLElement) {
    bottomNavEditorToggle.checked = !isForceWebModeEnabled();
    bottomNavEditorToggle.addEventListener('change', () => {
      setForceWebModeEnabled(!bottomNavEditorToggle.checked);
      reconcileAfterForceWebModeToggle();
    });
  }

  // Shared toggle handler for menu icon + app-bar title.

  const menuButton = document.getElementById('appBarMenuBtn');
  const titleToggle = document.getElementById('appBarTitle');

  const isNavOpen = () => !nav.classList.contains('bottom-nav--hidden');

  const closeNav = () => {
    nav.classList.add('bottom-nav--hidden');
  };

  const openNav = () => {
    nav.classList.remove('bottom-nav--hidden');
  };

  const toggleNavVisibility = () => {
    if (!isNavOpen()) {
      openNav();
      return;
    }
    closeNav();
  };

  // Menu icon toggles bottom nav visibility on list pages.
  if (menuButton) {
    menuButton.addEventListener('click', () => {
      toggleNavVisibility();
    });
  }

  // App-bar title also acts as a nav toggle.
  if (titleToggle) {
    titleToggle.addEventListener('click', () => {
      toggleNavVisibility();
    });
  }

  // Click-outside / blur-to-dismiss behavior.
  document.addEventListener('click', (event) => {
    if (nav.classList.contains('bottom-nav--hidden')) return;

    const target = event.target;

    // Ignore clicks inside nav or on the toggle controls.
    if (
      nav.contains(target) ||
      (menuButton && (menuButton === target || menuButton.contains(target))) ||
      (titleToggle && (titleToggle === target || titleToggle.contains(target)))
    ) {
      return;
    }

    closeNav();
  });

  if (pillRow instanceof HTMLElement) {
    applyBottomNavActiveState(pillRow, activeTab);
    pillRow.addEventListener('click', (event) => {
      const pill =
        event.target &&
        typeof event.target.closest === 'function' &&
        event.target.closest('.bottom-nav-pill');
      if (!pill || !pillRow.contains(pill)) return;
      const tab = pill.dataset.tab;
      if (!tab || tab === activeTab) return;
      window.location.href = getTopLevelPageHref(tab);
    });
  }
}

function getIngredientTableColumnSet(db) {
  try {
    const q = db.exec('PRAGMA table_info(ingredients);');
    const rows = Array.isArray(q) && q.length > 0 ? q[0].values : [];
    return new Set(
      rows.map((r) =>
        String((Array.isArray(r) ? r[1] : '') || '').toLowerCase(),
      ),
    );
  } catch (_) {
    return new Set();
  }
}

function createIngredientVisibilitySql(colsSet) {
  const hasDeprecated = colsSet.has('is_deprecated');
  const hasHideLegacy = colsSet.has('hide_from_shopping_list');
  const hasHidden = colsSet.has('is_hidden');
  const clauses = [];
  if (hasDeprecated) clauses.push('COALESCE(is_deprecated, 0) = 0');
  if (hasHideLegacy) clauses.push('COALESCE(hide_from_shopping_list, 0) = 0');
  if (hasHidden) clauses.push('COALESCE(is_hidden, 0) = 0');
  return clauses.length ? clauses.join(' AND ') : '1 = 1';
}

function getVisibleIngredientNamePool(db) {
  const colsSet = getIngredientTableColumnSet(db);
  const visibilitySql = createIngredientVisibilitySql(colsSet);
  try {
    const q = db.exec(
      `
      SELECT DISTINCT name
      FROM ingredients
      WHERE name IS NOT NULL
        AND trim(name) != ''
        AND ${visibilitySql}
      ORDER BY name COLLATE NOCASE;
      `,
    );
    if (!Array.isArray(q) || !q.length || !Array.isArray(q[0].values))
      return [];
    return q[0].values
      .map((row) => (Array.isArray(row) ? row[0] : null))
      .map((v) => String(v || '').trim())
      .filter((v) => v.length > 0);
  } catch (_) {
    return [];
  }
}

async function getVisibleIngredientNamePoolViaDataService(db) {
  if (
    window.dataService &&
    typeof window.dataService.loadTypeaheadPools === 'function'
  ) {
    try {
      if (db && typeof window.dataService.setSqliteDb === 'function') {
        window.dataService.setSqliteDb(db);
      }
      const pools = await window.dataService.loadTypeaheadPools();
      return Array.isArray(pools?.ingredientNames)
        ? pools.ingredientNames
        : [];
    } catch (err) {
      console.error('dataService.loadTypeaheadPools failed:', err);
    }
  }
  if (!db) return [];
  return getVisibleIngredientNamePool(db);
}

async function getVisibleVariantPoolForIngredientViaDataService(
  db,
  ingredientName,
  fallback,
) {
  const normalizedName = String(ingredientName || '').trim();
  if (
    normalizedName &&
    window.dataService &&
    typeof window.dataService.loadTypeaheadPools === 'function'
  ) {
    try {
      if (db && typeof window.dataService.setSqliteDb === 'function') {
        window.dataService.setSqliteDb(db);
      }
      const pools = await window.dataService.loadTypeaheadPools({
        ingredientName: normalizedName,
      });
      return Array.isArray(pools?.variantNames) ? pools.variantNames : [];
    } catch (err) {
      console.error('dataService.loadTypeaheadPools failed:', err);
    }
  }
  return typeof fallback === 'function' ? fallback() : [];
}

function createIngredientLookupHelpers(db) {
  const colsSet = getIngredientTableColumnSet(db);
  const visibilitySql = createIngredientVisibilitySql(colsSet);
  const getVisibleCanonicalId = (name) => {
    const stmt = db.prepare(
      `
      SELECT ID
      FROM ingredients
      WHERE lower(trim(name)) = lower(trim(?))
        AND ${visibilitySql}
      ORDER BY
        CASE WHEN TRIM(COALESCE(variant, '')) = '' THEN 0 ELSE 1 END,
        CASE WHEN TRIM(COALESCE(size, '')) = '' THEN 0 ELSE 1 END,
        ID ASC
      LIMIT 1;
      `,
    );
    stmt.bind([name]);
    let id = null;
    if (stmt.step()) id = Number(stmt.get()[0]);
    stmt.free();
    if (Number.isFinite(id)) return id;

    // Fall back to synonym lookup.
    try {
      const synStmt = db.prepare(
        `
        SELECT i.ID
        FROM ingredient_synonyms s
        JOIN ingredients i ON i.ID = s.ingredient_id
        WHERE lower(trim(s.synonym)) = lower(trim(?))
          AND ${visibilitySql}
        ORDER BY
          CASE WHEN TRIM(COALESCE(i.variant, '')) = '' THEN 0 ELSE 1 END,
          CASE WHEN TRIM(COALESCE(i.size, '')) = '' THEN 0 ELSE 1 END,
          i.ID ASC
        LIMIT 1;
        `,
      );
      synStmt.bind([name]);
      let synId = null;
      if (synStmt.step()) synId = Number(synStmt.get()[0]);
      synStmt.free();
      if (Number.isFinite(synId)) return synId;
    } catch (_) {}

    return null;
  };

  const anyIngredientNamed = (name) => {
    const stmt = db.prepare(
      `SELECT 1 FROM ingredients WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1;`,
    );
    stmt.bind([name]);
    const ok = stmt.step();
    stmt.free();
    if (ok) return true;

    // Fall back to synonym lookup.
    try {
      const synStmt = db.prepare(
        `SELECT 1 FROM ingredient_synonyms WHERE lower(trim(synonym)) = lower(trim(?)) LIMIT 1;`,
      );
      synStmt.bind([name]);
      const synOk = synStmt.step();
      synStmt.free();
      if (synOk) return true;
    } catch (_) {}

    return false;
  };

  return { getVisibleCanonicalId, anyIngredientNamed };
}

function normalizeRecipeTagDraftList(rawTags) {
  const source = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags || '')
        .split('\n')
        .map((v) => v.trim());
  const seen = new Set();
  const out = [];
  source
    .map((v) =>
      String(v || '')
        .trim()
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .forEach((tag) => {
      const clipped = tag.length > 48 ? tag.slice(0, 48).trim() : tag;
      if (!clipped) return;
      const key = clipped.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clipped);
    });
  return out;
}

async function getVisibleTagNamePool(db) {
  if (
    window.dataService &&
    typeof window.dataService.listTags === 'function'
  ) {
    try {
      if (db && typeof window.dataService.setSqliteDb === 'function') {
        window.dataService.setSqliteDb(db);
      }
      const rows = await window.dataService.listTags();
      const seen = new Set();
      return (Array.isArray(rows) ? rows : [])
        .map((row) => String(row?.name || '').trim())
        .filter((name) => {
          if (!name) return false;
          const key = name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    } catch (err) {
      console.error('dataService.listTags failed:', err);
    }
  }
  try {
    const q = db.exec(`
      SELECT DISTINCT name
      FROM tags
      WHERE name IS NOT NULL
        AND trim(name) != ''
        AND COALESCE(is_hidden, 0) = 0
      ORDER BY name COLLATE NOCASE;
    `);
    if (!Array.isArray(q) || !q.length || !Array.isArray(q[0].values))
      return [];
    return q[0].values
      .map((row) => (Array.isArray(row) ? row[0] : null))
      .map((v) => String(v || '').trim())
      .filter((v) => v.length > 0);
  } catch (_) {
    return [];
  }
}

async function getVisibleIngredientTagNamePool(db) {
  if (
    window.dataService &&
    typeof window.dataService.listIngredientTagNames === 'function'
  ) {
    try {
      if (db && typeof window.dataService.setSqliteDb === 'function') {
        window.dataService.setSqliteDb(db);
      }
      return await window.dataService.listIngredientTagNames();
    } catch (err) {
      console.error('dataService.listIngredientTagNames failed:', err);
    }
  }
  if (!db) return [];
  ensureRecipeTagsSchemaInMain(db);
  ensureIngredientVariantTagsSchemaInMain(db);
  try {
    const q = db.exec(`
      SELECT DISTINCT t.name
      FROM tags t
      WHERE t.name IS NOT NULL
        AND trim(t.name) != ''
        AND COALESCE(t.is_hidden, 0) = 0
        AND (
          COALESCE(NULLIF(lower(trim(t.intended_use)), ''), 'recipes') = 'ingredients'
          OR EXISTS(
            SELECT 1
            FROM ingredient_variant_tag_map ivtm
            WHERE ivtm.tag_id = t.id
          )
        )
      ORDER BY t.name COLLATE NOCASE;
    `);
    if (!Array.isArray(q) || !q.length || !Array.isArray(q[0].values))
      return [];
    return q[0].values
      .map((row) => (Array.isArray(row) ? row[0] : null))
      .map((v) => String(v || '').trim())
      .filter((v) => v.length > 0);
  } catch (_) {
    return [];
  }
}

async function getVisibleVariantTagNamePool(db) {
  return getVisibleIngredientTagNamePool(db);
}

function normalizeRecipeSizeNameList(rawSizes) {
  const source = Array.isArray(rawSizes)
    ? rawSizes
    : String(rawSizes || '')
        .split('\n')
        .map((v) => v.trim());
  const seen = new Set();
  const out = [];
  source
    .map((v) =>
      String(v || '')
        .trim()
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .forEach((size) => {
      const clipped = size.length > 64 ? size.slice(0, 64).trim() : size;
      if (!clipped) return;
      const key = clipped.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clipped);
    });
  return out;
}

async function getVisibleSizeNamePool(db) {
  if (
    window.dataService &&
    typeof window.dataService.listSizes === 'function'
  ) {
    try {
      if (typeof window.dataService.setSqliteDb === 'function') {
        window.dataService.setSqliteDb(db);
      }
      const rows = await window.dataService.listSizes();
      const names = [];
      const seen = new Set();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (row?.isRemoved) return;
        const name = String(row?.name || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        names.push(name);
      });
      return sortSizeNames(names);
    } catch (err) {
      console.error('dataService.listSizes failed:', err);
    }
  }
  if (!db) return [];
  ensureSizesSchemaInMain(db);
  const names = [];
  const seen = new Set();
  const pushMany = (arr) => {
    (Array.isArray(arr) ? arr : []).forEach((raw) => {
      const v = String(raw || '').trim();
      if (!v) return;
      const key = v.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(v);
    });
  };

  try {
    const q = db.exec(`
      SELECT DISTINCT name
      FROM sizes
      WHERE name IS NOT NULL
        AND trim(name) != ''
        AND COALESCE(is_removed, 0) = 0
      ORDER BY COALESCE(sort_order, 999999) ASC,
               name COLLATE NOCASE;
    `);
    if (Array.isArray(q) && q.length && Array.isArray(q[0].values)) {
      pushMany(q[0].values.map((row) => (Array.isArray(row) ? row[0] : null)));
    }
  } catch (_) {}

  return sortSizeNames(names);
}

function createSizeLookupHelpers(db) {
  const anySelectableSizeNamed = (name) => {
    try {
      const stmt = db.prepare(
        `SELECT 1
         FROM sizes
         WHERE lower(trim(name)) = lower(trim(?))
           AND COALESCE(is_removed, 0) = 0
         LIMIT 1;`,
      );
      stmt.bind([name]);
      const ok = stmt.step();
      stmt.free();
      return ok;
    } catch (_) {
      return false;
    }
  };
  return { anySelectableSizeNamed };
}

function normalizeRecipeUnitCodeList(rawUnits) {
  const source = Array.isArray(rawUnits)
    ? rawUnits
    : String(rawUnits || '')
        .split('\n')
        .map((v) => v.trim());
  const seen = new Set();
  const out = [];
  source
    .map((v) =>
      String(v || '')
        .trim()
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .forEach((code) => {
      const key = code.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(code);
    });
  return out;
}

async function getVisibleUnitCodePool(db) {
  if (
    window.dataService &&
    typeof window.dataService.listUnits === 'function'
  ) {
    try {
      if (db && typeof window.dataService.setSqliteDb === 'function') {
        window.dataService.setSqliteDb(db);
      }
      const rows = await window.dataService.listUnits();
      const seen = new Set();
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => !row?.isRemoved)
        .map((row) => String(row?.code || '').trim())
        .filter((code) => {
          if (!code) return false;
          const key = code.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    } catch (err) {
      console.error('dataService.listUnits failed:', err);
    }
  }
  if (!db) return [];
  ensureUnitsSchemaInMain(db);
  try {
    const q = db.exec(`
      SELECT DISTINCT code
      FROM units
      WHERE code IS NOT NULL
        AND trim(code) != ''
        AND COALESCE(is_removed, 0) = 0
      ORDER BY COALESCE(sort_order, 999999) ASC,
               code COLLATE NOCASE;
    `);
    if (!Array.isArray(q) || !q.length || !Array.isArray(q[0].values))
      return [];
    return q[0].values
      .map((row) => (Array.isArray(row) ? row[0] : null))
      .map((v) => String(v || '').trim())
      .filter((v) => v.length > 0);
  } catch (_) {
    return [];
  }
}

function createUnitLookupHelpers(db) {
  const anySelectableUnitCoded = (code) => {
    try {
      const stmt = db.prepare(
        `SELECT 1
         FROM units
         WHERE lower(trim(code)) = lower(trim(?))
           AND COALESCE(is_removed, 0) = 0
         LIMIT 1;`,
      );
      stmt.bind([code]);
      const ok = stmt.step();
      stmt.free();
      return ok;
    } catch (_) {
      return false;
    }
  };
  return { anySelectableUnitCoded };
}

function createTagLookupHelpers(db) {
  const anyVisibleTagNamed = (name) => {
    try {
      const stmt = db.prepare(
        `SELECT 1
         FROM tags
         WHERE lower(trim(name)) = lower(trim(?))
           AND COALESCE(is_hidden, 0) = 0
         LIMIT 1;`,
      );
      stmt.bind([name]);
      const ok = stmt.step();
      stmt.free();
      return ok;
    } catch (_) {
      return false;
    }
  };
  return { anyVisibleTagNamed };
}

function createVariantLookupHelpers(db) {
  const colsSet = getIngredientTableColumnSet(db);
  const visibilitySql = createIngredientVisibilitySql(colsSet);
  const hasVariantTable = (() => {
    try {
      const q = db.exec(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name='ingredient_variants' LIMIT 1;`,
      );
      return !!(
        Array.isArray(q) &&
        q.length &&
        q[0].values &&
        q[0].values.length
      );
    } catch (_) {
      return false;
    }
  })();

  const getIngredientNameById = (ingredientId) => {
    const iid = Number(ingredientId);
    if (!Number.isFinite(iid) || iid <= 0) return '';
    try {
      const stmt = db.prepare(
        `SELECT name
         FROM ingredients
         WHERE ID = ?
           AND ${visibilitySql}
         LIMIT 1;`,
      );
      stmt.bind([iid]);
      let out = '';
      if (stmt.step()) out = String(stmt.get()[0] || '').trim();
      stmt.free();
      return out;
    } catch (_) {
      return '';
    }
  };

  const getVisibleVariantPoolForIngredientId = (ingredientId) => {
    const iid = Number(ingredientId);
    if (!Number.isFinite(iid) || iid <= 0 || !hasVariantTable) return [];
    try {
      const q = db.exec(
        `SELECT iv.variant
         FROM ingredient_variants iv
         JOIN ingredients i ON i.ID = iv.ingredient_id
         WHERE iv.ingredient_id = ?
           AND iv.variant IS NOT NULL
           AND trim(iv.variant) != ''
           AND lower(trim(iv.variant)) != '${INGREDIENT_BASE_VARIANT_NAME}'
           AND ${visibilitySql.replaceAll('COALESCE(', 'COALESCE(i.')}
         ORDER BY COALESCE(iv.sort_order, 999999) ASC, iv.id ASC;`,
        [iid],
      );
      const rows = Array.isArray(q) && q.length ? q[0].values : [];
      const out = [];
      const seen = new Set();
      rows.forEach((row) => {
        const value = String((Array.isArray(row) ? row[0] : '') || '').trim();
        if (!value) return;
        const key = value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(value);
      });
      return out;
    } catch (_) {
      return [];
    }
  };

  const anyVariantForIngredient = (ingredientId, variantName) => {
    const iid = Number(ingredientId);
    const vv = String(variantName || '').trim();
    if (!Number.isFinite(iid) || iid <= 0 || !vv) return false;
    if (isIngredientBaseVariantName(vv) || isReservedIngredientVariantName(vv))
      return true;
    if (hasVariantTable) {
      try {
        const stmt = db.prepare(
          `SELECT 1
           FROM ingredient_variants iv
           JOIN ingredients i ON i.ID = iv.ingredient_id
           WHERE iv.ingredient_id = ?
             AND lower(trim(iv.variant)) = lower(trim(?))
             AND ${visibilitySql.replaceAll('COALESCE(', 'COALESCE(i.')}
           LIMIT 1;`,
        );
        stmt.bind([iid, vv]);
        const ok = stmt.step();
        stmt.free();
        return ok;
      } catch (_) {}
    }
    try {
      const stmt = db.prepare(
        `SELECT 1
         FROM ingredients
         WHERE ID = ?
           AND lower(trim(COALESCE(variant, ''))) = lower(trim(?))
           AND ${visibilitySql}
         LIMIT 1;`,
      );
      stmt.bind([iid, vv]);
      const ok = stmt.step();
      stmt.free();
      return ok;
    } catch (_) {
      return false;
    }
  };

  const ensureVariantForIngredient = (ingredientId, variantName) => {
    const iid = Number(ingredientId);
    const vv = String(variantName || '').trim();
    if (
      !Number.isFinite(iid) ||
      iid <= 0 ||
      !vv ||
      !hasVariantTable ||
      isIngredientBaseVariantName(vv) ||
      isReservedIngredientVariantName(vv)
    ) {
      return false;
    }
    try {
      if (anyVariantForIngredient(iid, vv)) return false;
      const maxQ = db.exec(
        `SELECT COALESCE(MAX(sort_order), 0) FROM ingredient_variants WHERE ingredient_id = ?;`,
        [iid],
      );
      const nextSort =
        maxQ.length && maxQ[0].values.length
          ? Number(maxQ[0].values[0][0]) + 1
          : 1;
      db.run(
        `INSERT INTO ingredient_variants (ingredient_id, variant, sort_order)
         VALUES (?, ?, ?);`,
        [iid, vv, nextSort],
      );
      return true;
    } catch (_) {
      return false;
    }
  };

  return {
    hasVariantTable,
    getIngredientNameById,
    getVisibleVariantPoolForIngredientId,
    anyVariantForIngredient,
    ensureVariantForIngredient,
  };
}

async function resolveUnknownIngredientNames({
  db,
  names,
  title = '',
  message = '',
}) {
  if (!db) return null;
  const list = Array.isArray(names) ? names : [];
  if (!list.length) return { map: new Map(), finalNames: [] };
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') {
    return null;
  }
  const suggestionPool = await getVisibleIngredientNamePoolViaDataService(db);
  const result = await ui.unknownItems({
    title: title || `New ingredients (${list.length})`,
    message:
      message ||
      (list.length === 1
        ? 'This ingredient is not in your database. Edit, match it to an existing ingredient, or save it as a new one.'
        : 'These ingredients are not in your database. Edit, match them to existing ingredients, or save them as new ones.'),
    items: list,
    suggestionPool,
    applyAllText: 'Apply all',
    cancelText: 'Cancel',
    editText: 'Edit',
    saveText: 'Save',
  });
  if (!result || !Array.isArray(result.rows)) return null;

  const map = new Map();
  const finalNames = [];
  const seenFinal = new Set();
  result.rows.forEach((row) => {
    const key = String(row?.original || '')
      .trim()
      .toLowerCase();
    const replacement = String(row?.value || '').trim();
    if (!key || !replacement) return;
    map.set(key, replacement);
    const rk = replacement.toLowerCase();
    if (seenFinal.has(rk)) return;
    seenFinal.add(rk);
    finalNames.push(replacement);
  });
  return { map, finalNames };
}

async function resolveUnknownIngredientVariants({
  db,
  entries,
  title = '',
  message = '',
}) {
  if (!db) return null;
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') return null;

  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length) return { map: new Map() };
  const variantLookup = createVariantLookupHelpers(db);
  if (!variantLookup.hasVariantTable) return { map: new Map() };

  const deduped = [];
  const seen = new Set();
  rows.forEach((row) => {
    const ingredientId = Number(row?.ingredientId);
    const ingredientName = String(row?.ingredientName || '').trim();
    const variant = String(row?.variant || '').trim();
    if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !variant) return;
    const key = `${ingredientId}::${variant.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push({ ingredientId, ingredientName, variant });
  });
  if (!deduped.length) return { map: new Map() };

  const groups = new Map();
  deduped.forEach((entry) => {
    if (!groups.has(entry.ingredientId)) groups.set(entry.ingredientId, []);
    groups.get(entry.ingredientId).push(entry);
  });

  const replacementMap = new Map();
  for (const [ingredientId, groupEntries] of groups.entries()) {
    const ingredientName =
      String(groupEntries[0]?.ingredientName || '').trim() ||
      variantLookup.getIngredientNameById(ingredientId) ||
      'ingredient';
    const suggestionPool = await getVisibleVariantPoolForIngredientViaDataService(
      db,
      ingredientName,
      () => variantLookup.getVisibleVariantPoolForIngredientId(ingredientId),
    );
    const dialogTitle =
      title ||
      `${
        groupEntries.length === 1 ? 'New variant' : 'New variants'
      } for ${ingredientName} (${groupEntries.length})`;
    const dialogMessage =
      message ||
      (groupEntries.length === 1
        ? `This variant for ${ingredientName} is not in your database. Edit, match it to an existing variant, or save it as a new one.`
        : `These variants for ${ingredientName} are not in your database. Edit, match them to existing variants, or save them as new ones.`);
    const result = await ui.unknownItems({
      title: dialogTitle,
      message: dialogMessage,
      items: groupEntries.map((entry) => entry.variant),
      suggestionPool,
      applyAllText: 'Apply all',
      cancelText: 'Cancel',
      editText: 'Edit',
      saveText: 'Save',
    });
    if (!result || !Array.isArray(result.rows)) return null;
    result.rows.forEach((row) => {
      const original = String(row?.original || '').trim();
      const replacement = String(row?.value || '').trim();
      if (!original || !replacement) return;
      const key = `${ingredientId}::${original.toLowerCase()}`;
      replacementMap.set(key, replacement);
    });
  }

  return { map: replacementMap };
}

async function resolveUnknownTagNames({ db, tags, title = '', message = '' }) {
  if (!db) return null;
  const list = normalizeRecipeTagDraftList(tags);
  if (!list.length) return { map: new Map(), finalNames: [] };
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') {
    return null;
  }
  const suggestionPool = await getVisibleTagNamePool(db);
  const result = await ui.unknownItems({
    title: title || `New tags (${list.length})`,
    message:
      message ||
      (list.length === 1
        ? 'This tag is not in your database. Edit, match it to an existing tag, or save it as a new one.'
        : 'These tags are not in your database. Edit, match them to existing tags, or save them as new ones.'),
    items: list,
    suggestionPool,
    applyAllText: 'Apply all',
    cancelText: 'Cancel',
    editText: 'Edit',
    saveText: 'Save',
  });
  if (!result || !Array.isArray(result.rows)) return null;

  const map = new Map();
  const finalNames = [];
  const seenFinal = new Set();
  result.rows.forEach((row) => {
    const key = String(row?.original || '')
      .trim()
      .toLowerCase();
    const replacementRaw = String(row?.value || '').trim();
    const replacement = replacementRaw
      ? normalizeRecipeTagDraftList([replacementRaw])[0] || ''
      : '';
    if (!key || !replacement) return;
    map.set(key, replacement);
    const rk = replacement.toLowerCase();
    if (seenFinal.has(rk)) return;
    seenFinal.add(rk);
    finalNames.push(replacement);
  });
  return { map, finalNames };
}

async function resolveUnknownSizeNames({
  db,
  sizes,
  title = '',
  message = '',
}) {
  if (!db) return null;
  const list = normalizeRecipeSizeNameList(sizes);
  if (!list.length) return { map: new Map(), finalNames: [] };
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') {
    return null;
  }
  const suggestionPool = await getVisibleSizeNamePool(db);
  const result = await ui.unknownItems({
    title: title || `New sizes (${list.length})`,
    message:
      message ||
      (list.length === 1
        ? 'This size is not in your database. Edit, match it to an existing size, or save it as a new one.'
        : 'These sizes are not in your database. Edit, match them to existing sizes, or save them as new ones.'),
    items: list,
    suggestionPool,
    applyAllText: 'Apply all',
    cancelText: 'Cancel',
    editText: 'Edit',
    saveText: 'Save',
  });
  if (!result || !Array.isArray(result.rows)) return null;

  const map = new Map();
  const finalNames = [];
  const seenFinal = new Set();
  result.rows.forEach((row) => {
    const key = String(row?.original || '')
      .trim()
      .toLowerCase();
    const replacementRaw = String(row?.value || '').trim();
    const replacement = replacementRaw
      ? normalizeRecipeSizeNameList([replacementRaw])[0] || ''
      : '';
    if (!key || !replacement) return;
    map.set(key, replacement);
    const rk = replacement.toLowerCase();
    if (seenFinal.has(rk)) return;
    seenFinal.add(rk);
    finalNames.push(replacement);
  });
  return { map, finalNames };
}

async function resolveUnknownUnitCodes({
  db,
  units,
  title = '',
  message = '',
}) {
  if (!db) return null;
  const list = normalizeRecipeUnitCodeList(units);
  if (!list.length) return { map: new Map(), finalCodes: [] };
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') {
    return null;
  }
  const suggestionPool = await getVisibleUnitCodePool(db);
  const result = await ui.unknownItems({
    title: title || `New units (${list.length})`,
    message:
      message ||
      (list.length === 1
        ? 'This unit is not in your database. Edit, match it to an existing unit, or save it as a new one.'
        : 'These units are not in your database. Edit, match them to existing units, or save them as new ones.'),
    items: list,
    suggestionPool,
    applyAllText: 'Apply all',
    cancelText: 'Cancel',
    editText: 'Edit',
    saveText: 'Save',
  });
  if (!result || !Array.isArray(result.rows)) return null;

  const map = new Map();
  const finalCodes = [];
  const seenFinal = new Set();
  result.rows.forEach((row) => {
    const key = String(row?.original || '')
      .trim()
      .toLowerCase();
    const replacementRaw = String(row?.value || '').trim();
    const replacement = replacementRaw
      ? normalizeRecipeUnitCodeList([replacementRaw])[0] || ''
      : '';
    if (!key || !replacement) return;
    map.set(key, replacement);
    const rk = replacement.toLowerCase();
    if (seenFinal.has(rk)) return;
    seenFinal.add(rk);
    finalCodes.push(replacement);
  });
  return { map, finalCodes };
}

// --- Recipe editor loader ---
async function loadRecipeEditorPage() {
  const isElectron = !!window.electronAPI;
  const recipeId = sessionStorage.getItem('selectedRecipeId');
  const isNewRecipe = sessionStorage.getItem('selectedRecipeIsNew') === '1';
  const shouldUseSupabaseAdapter = favoriteEatsShouldUseSupabaseDataDoor();

  if (!recipeId) {
    uiToast('No recipe selected.');
    window.location.href = 'recipes.html';
    return;
  }

  let db;
  if (!shouldUseSupabaseAdapter || isNewRecipe) {
    if (isElectron) {
      try {
        const pathHint = localStorage.getItem('favoriteEatsDbPath') || null;
        const bytes = await window.electronAPI.loadDB(pathHint);
        const Uints = new Uint8Array(bytes);
        db = new SQL.Database(Uints);
      } catch (err) {
        console.error('❌ Failed to load DB from disk:', err);
        uiToast('No database loaded. Please go back to the welcome page.');
        window.location.href = 'index.html';
        return;
      }
    } else {
      try {
        db = await openFavoriteEatsDbForCurrentRuntime({ isElectron: false });
      } catch (err) {
        uiToast('No database loaded. Please go back to the welcome page.');
        window.location.href = 'index.html';
        return;
      }
    }
  }

  window.dbInstance = db || null;
  // Wire the data service door to this DB. UI must use window.dataService
  // (see js/data/index.js), not direct bridge.loadRecipeFromDB calls — except
  // for read-after-write paths (post-save refresh) which stay on bridge until
  // the write side is migrated.
  if (window.dataService) {
    if (db && typeof window.dataService.setSqliteDb === 'function') {
    window.dataService.setSqliteDb(db);
    }
    if (shouldUseSupabaseAdapter) {
      window.dataService.useSupabase = true;
      console.info(
        '[dataService] using Supabase adapter',
      );
    }
  }
  if (db) {
    await ensureIngredientLemmaMaintenanceInMain(db, isElectron);
  }
  window.recipeId = recipeId;
  const isRecipeWebMode = isForceWebModeEnabled();
  if (db) {
    ensureRecipeTagsSchemaInMain(db);
    ensureIngredientVariantTagsSchemaInMain(db);
    ensureSizesSchemaInMain(db);
    ensureUnitsSchemaInMain(db);
  }

  // Notes are recipe-level (stored on recipe_ingredient_map), not shopping-item-level.
  // Ensure the DB has the right column and backfill once for legacy DBs.
  try {
    if (
      window.bridge &&
      typeof bridge.ensureRecipeIngredientMapParentheticalNoteSchema ===
        'function'
    ) {
      if (db) bridge.ensureRecipeIngredientMapParentheticalNoteSchema(db);
    }
  } catch (_) {}

  // Read recipe via the data service door (see js/data/contracts/loadRecipeDetail.md).
  // bridge.loadRecipeFromDB is still the SQLite implementation behind the door;
  // the door swaps in Supabase when window.dataService.useSupabase is true.
  let recipe;
  try {
    recipe = await window.dataService.loadRecipeDetail(recipeId);
  } catch (err) {
    console.error('dataService.loadRecipeDetail failed:', err);
    uiToast('Failed to load recipe.');
    window.location.href = 'recipes.html';
    return;
  }

  if (!recipe) {
    uiToast('Recipe not found.');
    window.location.href = 'recipes.html';
    return;
  }
  // Compatibility shim for existing UI

  if (
    !recipe.servingsDefault &&
    recipe.servings &&
    recipe.servings.default != null
  ) {
    recipe.servingsDefault = recipe.servings.default;
  }

  // Decide when to seed placeholder rows:
  // - brand-new recipes (fresh from "Add")
  // - OR recipes that currently have no steps and no ingredients at all
  const hasAnySteps =
    (Array.isArray(recipe.sections) &&
      recipe.sections.some(
        (section) => Array.isArray(section.steps) && section.steps.length > 0,
      )) ||
    (Array.isArray(recipe.steps) && recipe.steps.length > 0);

  const hasAnyIngredients =
    Array.isArray(recipe.sections) &&
    recipe.sections.some(
      (section) =>
        Array.isArray(section.ingredients) && section.ingredients.length > 0,
    );

  // 🔍 Decide seeding separately for steps vs ingredients.
  // - Steps placeholder any time there are zero steps so the editor can
  //   recover from missing-instruction recipes without user action.
  // - Ingredient placeholder any time there are zero ingredients, even if steps exist
  //   (e.g., user edited title + saved but never added ingredients).
  const shouldSeedStepPlaceholder =
    !isRecipeWebMode && (isNewRecipe || !hasAnySteps);

  const shouldSeedIngredientPlaceholder =
    !isRecipeWebMode && !hasAnyIngredients;

  if (shouldSeedStepPlaceholder || shouldSeedIngredientPlaceholder) {
    if (isNewRecipe) {
      // One-shot flag: once we've initialized a brand-new recipe,
      // we don't treat it as "new" again on future opens.
      sessionStorage.removeItem('selectedRecipeIsNew');
    }

    if (!Array.isArray(recipe.sections) || recipe.sections.length === 0) {
      recipe.sections = [
        {
          ID: null,
          id: null,
          name: '',
          steps: [],
          ingredients: [],
        },
      ];
    }

    const firstSection = recipe.sections[0];

    // Ensure at least one placeholder step when a recipe has no steps at all.
    if (
      shouldSeedStepPlaceholder &&
      (!Array.isArray(firstSection.steps) || firstSection.steps.length === 0)
    ) {
      const tempId = `tmp-step-${Date.now()}`;
      firstSection.steps = [
        {
          ID: null,
          id: tempId,
          section_id: firstSection.ID ?? firstSection.id ?? null,
          step_number: 1,
          instructions: '',
          type: 'step',
        },
      ];
    }

    // Allow empty ingredient arrays; UI provides an add CTA instead of data placeholders.
  }

  if (
    isRecipeWebMode &&
    typeof window.recipeWebModePrimeRecipe === 'function'
  ) {
    window.recipeWebModePrimeRecipe(recipe);
  }

  // --- On load/return: keep ingredient order as loaded ---
  try {
    if (typeof window.recipeEditorSortIngredientsOnLoad === 'function') {
      window.recipeEditorSortIngredientsOnLoad(recipe);
    }
  } catch (err) {
    console.warn('⚠️ Ingredient load-order normalization failed:', err);
  }

  const titleEl = document.getElementById('recipeTitle');
  if (titleEl) titleEl.textContent = recipe.title;

  // Shared app bar for recipe editor
  initAppBar({
    mode: 'editor',
    titleText: recipe.title || '',
    showCancel: true,
    showSave: !isRecipeWebMode,
    cancelText: isRecipeWebMode ? 'Reset servings' : 'Cancel',
    onBack: () => {
      const goRecipes = () => {
        window.location.href = 'recipes.html';
      };
      if (
        !isRecipeWebMode &&
        typeof window.recipeEditorAttemptExit === 'function'
      ) {
        void window.recipeEditorAttemptExit({
          reason: 'back',
          onClean: goRecipes,
          onDiscard: goRecipes,
          onSaveSuccess: goRecipes,
        });
        return;
      }
      goRecipes();
    },
    onCancel: () => {
      if (isRecipeWebMode) {
        if (typeof window.recipeWebModeResetServings === 'function') {
          window.recipeWebModeResetServings(window.recipeData || recipe);
        }
        return;
      }
      if (typeof revertChanges === 'function') {
        revertChanges();
      }
    },
    onSave: (window.recipeEditorSave = async () => {
      // Recipe editor SoT: the live model (`window.recipeData.title`).
      // The app-bar title is a view; it may lag if the user edited the in-page title.
      const modelTitle = (window.recipeData?.title || '').trim();
      const el = document.getElementById('appBarTitle');
      const next = (modelTitle || el?.textContent || '').trim();
      if (!next) return;

      // Keep in-memory model + visible title in sync
      recipe.title = next;
      if (window.recipeData) window.recipeData.title = next;
      if (el) el.textContent = next;
      const titleEl = document.getElementById('recipeTitle');
      if (titleEl) titleEl.textContent = next;

      // Real save path (DB + persist-to-disk/localStorage), reusing existing helpers
      try {
        try {
          const db = window.dbInstance;
          const recipeModel = window.recipeData;
          if (db && recipeModel && Array.isArray(recipeModel.sections)) {
            ensureSizesSchemaInMain(db);
            const { getVisibleCanonicalId, anyIngredientNamed } =
              createIngredientLookupHelpers(db);
            const { anySelectableUnitCoded } = createUnitLookupHelpers(db);
            const { anyVisibleTagNamed } = createTagLookupHelpers(db);
            const { anySelectableSizeNamed } = createSizeLookupHelpers(db);
            const {
              hasVariantTable: hasIngredientVariantTable,
              getIngredientNameById,
              anyVariantForIngredient,
              ensureVariantForIngredient,
            } = createVariantLookupHelpers(db);
            const unknownUnique = [];
            const seenUnknown = new Set();
            recipeModel.sections.forEach((sec) => {
              const rows = Array.isArray(sec?.ingredients)
                ? sec.ingredients
                : [];
              rows.forEach((row) => {
                if (!row || row.isPlaceholder || row.rowType === 'heading')
                  return;
                const linkedRecipeId = Number(row.linkedRecipeId);
                const currentRecipeId = Number(recipeModel.id);
                const isLinkedSubrecipe =
                  !!row.isRecipe &&
                  Number.isFinite(linkedRecipeId) &&
                  linkedRecipeId > 0 &&
                  (!Number.isFinite(currentRecipeId) ||
                    linkedRecipeId !== currentRecipeId);
                if (isLinkedSubrecipe) return;
                const rawName = String(row.name || '').trim();
                if (!rawName) return;
                if (getVisibleCanonicalId(rawName)) return;
                if (anyIngredientNamed(rawName)) return;
                const key = rawName.toLowerCase();
                if (seenUnknown.has(key)) return;
                seenUnknown.add(key);
                unknownUnique.push(rawName);
              });
            });

            if (unknownUnique.length) {
              const resolved = await resolveUnknownIngredientNames({
                db,
                names: unknownUnique,
                title: `New ingredients (${unknownUnique.length})`,
                message:
                  unknownUnique.length === 1
                    ? 'This ingredient is not in your database. Edit, match it to an existing ingredient, or save it as a new one.'
                    : 'These ingredients are not in your database. Edit, match them to existing ingredients, or save them as new ones.',
              });
              if (!resolved) {
                uiToast('Save cancelled.');
                return;
              }
              const replacementMap = resolved.map;
              recipeModel.sections.forEach((sec) => {
                const rows = Array.isArray(sec?.ingredients)
                  ? sec.ingredients
                  : [];
                rows.forEach((row) => {
                  if (!row || row.isPlaceholder || row.rowType === 'heading')
                    return;
                  const key = String(row.name || '')
                    .trim()
                    .toLowerCase();
                  if (!key) return;
                  const nextName = replacementMap.get(key);
                  if (nextName) row.name = nextName;
                });
              });
              if (
                typeof window.recipeEditorRerenderIngredientsFromModel ===
                'function'
              ) {
                window.recipeEditorRerenderIngredientsFromModel();
              }
            }

            if (hasIngredientVariantTable) {
              const unknownVariantUnique = [];
              const seenUnknownVariants = new Set();
              recipeModel.sections.forEach((sec) => {
                const rows = Array.isArray(sec?.ingredients)
                  ? sec.ingredients
                  : [];
                rows.forEach((row) => {
                  if (!row || row.isPlaceholder || row.rowType === 'heading')
                    return;
                  const linkedRecipeId = Number(row.linkedRecipeId);
                  const currentRecipeId = Number(recipeModel.id);
                  const isLinkedSubrecipe =
                    !!row.isRecipe &&
                    Number.isFinite(linkedRecipeId) &&
                    linkedRecipeId > 0 &&
                    (!Number.isFinite(currentRecipeId) ||
                      linkedRecipeId !== currentRecipeId);
                  if (isLinkedSubrecipe) return;
                  const rawName = String(row.name || '').trim();
                  const rawVariant = String(row.variant || '').trim();
                  if (!rawName || !rawVariant) return;
                  const ingredientId = Number(getVisibleCanonicalId(rawName));
                  if (!Number.isFinite(ingredientId) || ingredientId <= 0)
                    return;
                  if (anyVariantForIngredient(ingredientId, rawVariant)) return;
                  const key = `${ingredientId}::${rawVariant.toLowerCase()}`;
                  if (seenUnknownVariants.has(key)) return;
                  seenUnknownVariants.add(key);
                  unknownVariantUnique.push({
                    ingredientId,
                    ingredientName:
                      getIngredientNameById(ingredientId) || rawName,
                    variant: rawVariant,
                  });
                });
              });
              if (unknownVariantUnique.length) {
                const resolvedVariants = await resolveUnknownIngredientVariants(
                  {
                    db,
                    entries: unknownVariantUnique,
                  },
                );
                if (!resolvedVariants) {
                  uiToast('Save cancelled.');
                  return;
                }
                const variantReplacementMap = resolvedVariants.map;
                recipeModel.sections.forEach((sec) => {
                  const rows = Array.isArray(sec?.ingredients)
                    ? sec.ingredients
                    : [];
                  rows.forEach((row) => {
                    if (!row || row.isPlaceholder || row.rowType === 'heading')
                      return;
                    const rawName = String(row.name || '').trim();
                    const rawVariant = String(row.variant || '').trim();
                    if (!rawName || !rawVariant) return;
                    const ingredientId = Number(getVisibleCanonicalId(rawName));
                    if (!Number.isFinite(ingredientId) || ingredientId <= 0)
                      return;
                    const key = `${ingredientId}::${rawVariant.toLowerCase()}`;
                    const nextVariant = String(
                      variantReplacementMap.get(key) || '',
                    ).trim();
                    if (nextVariant) row.variant = nextVariant;
                  });
                });
                if (
                  typeof window.recipeEditorRerenderIngredientsFromModel ===
                  'function'
                ) {
                  window.recipeEditorRerenderIngredientsFromModel();
                }
              }

              const ensuredVariantKeys = new Set();
              recipeModel.sections.forEach((sec) => {
                const rows = Array.isArray(sec?.ingredients)
                  ? sec.ingredients
                  : [];
                rows.forEach((row) => {
                  if (!row || row.isPlaceholder || row.rowType === 'heading')
                    return;
                  const rawName = String(row.name || '').trim();
                  const rawVariant = String(row.variant || '').trim();
                  if (!rawName || !rawVariant) return;
                  const ingredientId = Number(getVisibleCanonicalId(rawName));
                  if (!Number.isFinite(ingredientId) || ingredientId <= 0)
                    return;
                  const key = `${ingredientId}::${rawVariant.toLowerCase()}`;
                  if (ensuredVariantKeys.has(key)) return;
                  ensuredVariantKeys.add(key);
                  if (!anyVariantForIngredient(ingredientId, rawVariant)) {
                    ensureVariantForIngredient(ingredientId, rawVariant);
                  }
                });
              });
            }

            const unknownUnitUnique = [];
            const seenUnknownUnits = new Set();
            recipeModel.sections.forEach((sec) => {
              const rows = Array.isArray(sec?.ingredients)
                ? sec.ingredients
                : [];
              rows.forEach((row) => {
                if (!row || row.isPlaceholder || row.rowType === 'heading')
                  return;
                const rawUnit = String(row.unit || '').trim();
                if (!rawUnit) return;
                const key = rawUnit.toLowerCase();
                if (seenUnknownUnits.has(key)) return;
                seenUnknownUnits.add(key);
                if (anySelectableUnitCoded(rawUnit)) return;
                unknownUnitUnique.push(rawUnit);
              });
            });
            if (unknownUnitUnique.length) {
              const resolvedUnits = await resolveUnknownUnitCodes({
                db,
                units: unknownUnitUnique,
                title: `New units (${unknownUnitUnique.length})`,
                message:
                  unknownUnitUnique.length === 1
                    ? 'This unit is not in your database. Edit, match it to an existing unit, or save it as a new one.'
                    : 'These units are not in your database. Edit, match them to existing units, or save them as new ones.',
              });
              if (!resolvedUnits) {
                uiToast('Save cancelled.');
                return;
              }
              const replacementMap = resolvedUnits.map;
              recipeModel.sections.forEach((sec) => {
                const rows = Array.isArray(sec?.ingredients)
                  ? sec.ingredients
                  : [];
                rows.forEach((row) => {
                  if (!row || row.isPlaceholder || row.rowType === 'heading')
                    return;
                  const key = String(row.unit || '')
                    .trim()
                    .toLowerCase();
                  if (!key) return;
                  const nextUnit = replacementMap.get(key);
                  if (nextUnit) row.unit = nextUnit;
                });
              });
              if (
                typeof window.recipeEditorRerenderIngredientsFromModel ===
                'function'
              ) {
                window.recipeEditorRerenderIngredientsFromModel();
              }
            }

            const unknownSizeUnique = [];
            const seenUnknownSizes = new Set();
            recipeModel.sections.forEach((sec) => {
              const rows = Array.isArray(sec?.ingredients)
                ? sec.ingredients
                : [];
              rows.forEach((row) => {
                if (!row || row.isPlaceholder || row.rowType === 'heading')
                  return;
                const rawSize = String(row.size || '').trim();
                if (!rawSize) return;
                const key = rawSize.toLowerCase();
                if (seenUnknownSizes.has(key)) return;
                seenUnknownSizes.add(key);
                if (anySelectableSizeNamed(rawSize)) return;
                unknownSizeUnique.push(rawSize);
              });
            });
            if (unknownSizeUnique.length) {
              const resolvedSizes = await resolveUnknownSizeNames({
                db,
                sizes: unknownSizeUnique,
                title: `New sizes (${unknownSizeUnique.length})`,
                message:
                  unknownSizeUnique.length === 1
                    ? 'This size is not in your database. Edit, match it to an existing size, or save it as a new one.'
                    : 'These sizes are not in your database. Edit, match them to existing sizes, or save them as new ones.',
              });
              if (!resolvedSizes) {
                uiToast('Save cancelled.');
                return;
              }
              const replacementMap = resolvedSizes.map;
              recipeModel.sections.forEach((sec) => {
                const rows = Array.isArray(sec?.ingredients)
                  ? sec.ingredients
                  : [];
                rows.forEach((row) => {
                  if (!row || row.isPlaceholder || row.rowType === 'heading')
                    return;
                  const key = String(row.size || '')
                    .trim()
                    .toLowerCase();
                  if (key) {
                    const nextSize = replacementMap.get(key);
                    if (nextSize) row.size = nextSize;
                  }
                  if (!Array.isArray(row.substitutes)) return;
                  row.substitutes.forEach((sub) => {
                    if (!sub) return;
                    const subKey = String(sub.size || '')
                      .trim()
                      .toLowerCase();
                    if (!subKey) return;
                    const nextSubSize = replacementMap.get(subKey);
                    if (nextSubSize) sub.size = nextSubSize;
                  });
                });
              });
              if (
                typeof window.recipeEditorRerenderIngredientsFromModel ===
                'function'
              ) {
                window.recipeEditorRerenderIngredientsFromModel();
              }
            }

            const normalizedDraftTags = normalizeRecipeTagDraftList(
              recipeModel.tags,
            );
            const unknownTagUnique = [];
            const seenUnknownTags = new Set();
            normalizedDraftTags.forEach((tag) => {
              const key = String(tag || '')
                .trim()
                .toLowerCase();
              if (!key || seenUnknownTags.has(key)) return;
              seenUnknownTags.add(key);
              if (anyVisibleTagNamed(tag)) return;
              unknownTagUnique.push(tag);
            });
            if (unknownTagUnique.length) {
              const resolvedTags = await resolveUnknownTagNames({
                db,
                tags: unknownTagUnique,
                title: `New tags (${unknownTagUnique.length})`,
                message:
                  unknownTagUnique.length === 1
                    ? 'This tag is not in your database. Edit, match it to an existing tag, or save it as a new one.'
                    : 'These tags are not in your database. Edit, match them to existing tags, or save them as new ones.',
              });
              if (!resolvedTags) {
                uiToast('Save cancelled.');
                return;
              }
              const replacementMap = resolvedTags.map;
              recipeModel.tags = normalizeRecipeTagDraftList(
                normalizedDraftTags.map((tag) => {
                  const key = String(tag || '')
                    .trim()
                    .toLowerCase();
                  return replacementMap.get(key) || tag;
                }),
              );
            } else {
              recipeModel.tags = normalizedDraftTags;
            }
          }
        } catch (unknownErr) {
          console.warn('Unknown-item resolution skipped:', unknownErr);
        }

        if (typeof saveRecipeToDB === 'function') {
          await saveRecipeToDB();
        }

        // Persist SQL.js memory to disk (Electron) or localStorage (browser fallback)
        if (!window.dbInstance) throw new Error('No active database found');
        const binaryArray = window.dbInstance.export();
        const isElectron = !!window.electronAPI;

        await persistBinaryArrayInMain(binaryArray, {
          isElectron,
          overwriteOnly: false,
          failureMessage: 'Save failed — check console for details.',
        });
        if (isElectron) uiToast('Database saved successfully.');

        // Refresh Cancel baseline after a successful save
        if (window.bridge && typeof bridge.loadRecipeFromDB === 'function') {
          const refreshed = bridge.loadRecipeFromDB(
            window.dbInstance,
            window.recipeId,
          );
          window.originalRecipeSnapshot = JSON.parse(JSON.stringify(refreshed));
          window.recipeData = JSON.parse(JSON.stringify(refreshed));
        }

        // Reset editor UI state after save
        if (typeof window.recipeEditorResetDirty === 'function') {
          window.recipeEditorResetDirty();
        } else {
          const appCancel = document.getElementById('appBarCancelBtn');
          if (appCancel) appCancel.disabled = true;
          if (typeof disableSave === 'function') disableSave();
        }
        if (typeof clearSelectedStep === 'function') clearSelectedStep();
      } catch (err) {
        console.error('❌ Save failed:', err);
        uiToast('Save failed — check console for details.');
        throw err;
      }
    }),
  });

  window.recipeWebModeSyncAppBar = () => {
    const cancelBtn = document.getElementById('appBarCancelBtn');
    if (!cancelBtn) return;
    if (!isRecipeWebMode) {
      setAppBarTextActionLabel(cancelBtn, 'Cancel');
      cancelBtn.classList.remove('app-bar-cancel--reset-servings');
      const dirty =
        typeof window.recipeEditorGetIsDirty === 'function'
          ? window.recipeEditorGetIsDirty()
          : false;
      cancelBtn.disabled = !dirty;
      return;
    }
    setAppBarTextActionLabel(cancelBtn, 'Reset servings');
    cancelBtn.classList.add('app-bar-cancel--reset-servings');
    cancelBtn.disabled =
      typeof window.recipeWebModeCanResetServings === 'function'
        ? !window.recipeWebModeCanResetServings(window.recipeData || recipe)
        : true;
  };
  window.recipeWebModeSyncAppBar();
  if (isRecipeWebMode) {
    const recipeWebServingsChangedEventName =
      window.favoriteEatsRecipeWebServings?.changeEventName ||
      window.favoriteEatsEventNames?.recipeWebServingsChanged ||
      '';
    if (!window._recipeWebModeStorageSyncBound) {
      window._recipeWebModeStorageSyncBound = true;
      const syncFromStorage = (event) => {
        const changedRecipeId = Number(event?.detail?.recipeId);
        if (
          Number.isFinite(changedRecipeId) &&
          changedRecipeId > 0 &&
          Number(window.recipeData?.id) !== changedRecipeId
        ) {
          return;
        }
        if (typeof window.recipeWebModeSyncFromStorage === 'function') {
          window.recipeWebModeSyncFromStorage();
        }
      };
      if (recipeWebServingsChangedEventName) {
        window.addEventListener(
          recipeWebServingsChangedEventName,
          syncFromStorage,
        );
      }
      window.addEventListener('storage', (event) => {
        if (event.key !== window.favoriteEatsStorageKeys?.recipeWebServings)
          return;
        syncFromStorage();
      });
    }
  }

  renderRecipe(recipe);

  // ✅ One-time reset after first render
  if (!isRecipeWebMode && typeof revertChanges === 'function') {
    revertChanges();
  }

  // --- Always scroll editor to top on load ---
  try {
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch (_) {
    window.scrollTo(0, 0);
  }
}

window.openRecipe = function openRecipe(recipeId) {
  const rid = Number(recipeId);
  if (!Number.isFinite(rid) || rid <= 0) return;
  const proceed = () => {
    sessionStorage.setItem('selectedRecipeId', String(rid));
    window.location.href =
      favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
  };
  if (typeof window.recipeEditorAttemptExit === 'function') {
    void window.recipeEditorAttemptExit({
      reason: 'open-recipe',
      onClean: proceed,
      onDiscard: proceed,
      onSaveSuccess: proceed,
    });
    return;
  }
  proceed();
};

/**
 * Open the store editor; optionally focus an aisle after load (see STORE_EDITOR_FOCUS_AISLE_SESSION_KEY).
 * @param {number} storeId
 * @param {number} [aisleId]
 * @param {string} [chainName]
 * @param {string} [locationName]
 */
window.openStoreAisle = function openStoreAisle(
  storeId,
  aisleId,
  chainName,
  locationName,
) {
  const sid = Number(storeId);
  if (!Number.isFinite(sid) || sid <= 0) return;
  const aid = Number(aisleId);
  const proceed = () => {
    sessionStorage.setItem('selectedStoreId', String(sid));
    sessionStorage.removeItem('selectedStoreIsNew');
    if (chainName != null)
      sessionStorage.setItem('selectedStoreChain', String(chainName));
    if (locationName != null)
      sessionStorage.setItem('selectedStoreLocation', String(locationName));
    if (Number.isFinite(aid) && aid > 0) {
      sessionStorage.setItem(
        STORE_EDITOR_FOCUS_AISLE_SESSION_KEY,
        String(aid),
      );
    } else {
      sessionStorage.removeItem(STORE_EDITOR_FOCUS_AISLE_SESSION_KEY);
    }
    window.location.href =
      favoriteEatsHrefWithCurrentAdapter('storeEditor.html');
  };
  if (typeof window.recipeEditorAttemptExit === 'function') {
    void window.recipeEditorAttemptExit({
      reason: 'open-store-aisle',
      onClean: proceed,
      onDiscard: proceed,
      onSaveSuccess: proceed,
    });
    return;
  }
  proceed();
};

document.addEventListener('DOMContentLoaded', () => {
  ensureFavoriteEatsDataServiceAdapterBadge();
});
