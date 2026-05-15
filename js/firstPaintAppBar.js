/**
 * Runs synchronously right after #appBarMount in the document (before main.js).
 * Fills list titles, editor titles from session keys (e.g. selectedRecipeTitle, selectedTagName),
 * and planner Add→Reset so first paint matches initAppBar / applyPlannerModePresentation.
 * Keep planner/build reads aligned with js/chromeBoot.js.
 */
(function favoriteEatsFirstPaintAppBar() {
  if (typeof document === 'undefined') return;
  const body = document.body;
  if (!body) return;

  const page = body.dataset && body.dataset.page;
  if (!page) return;

  const TITLE_BY_PAGE = {
    recipes: 'Recipes',
    tags: 'Tags',
    stores: 'Stores',
    units: 'Units',
    sizes: 'Sizes',
    shopping: 'Items',
    'shopping-list': 'Shopping List',
  };

  function readSession(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  const titleEl = document.getElementById('appBarTitle');
  if (titleEl && !String(titleEl.textContent || '').trim()) {
    const listTitle = TITLE_BY_PAGE[page];
    if (listTitle) {
      titleEl.textContent = listTitle;
    } else {
      let early = '';
      if (page === 'recipe-editor') {
        if (readSession('selectedRecipeIsNew') === '1') {
          early = 'New recipe';
        } else {
          const nm = readSession('selectedRecipeTitle');
          early = (nm && nm.trim()) || 'Recipe';
        }
      } else if (page === 'tag-editor') {
        const nm = readSession('selectedTagName');
        early =
          (nm && nm.trim()) ||
          (readSession('selectedTagIsNew') === '1' ? 'New tag' : 'Tag');
      } else if (page === 'unit-editor') {
        const nm = readSession('selectedUnitNameSingular');
        early =
          (nm && nm.trim()) ||
          (readSession('selectedUnitIsNew') === '1' ? 'New unit' : 'Unit');
      } else if (page === 'size-editor') {
        const nm = readSession('selectedSizeName');
        early =
          (nm && nm.trim()) ||
          (readSession('selectedSizeIsNew') === '1' ? 'New size' : 'Size');
      } else if (page === 'store-editor') {
        const chain = (readSession('selectedStoreChain') || '').trim();
        early =
          chain ||
          (readSession('selectedStoreIsNew') === '1' ? 'New store' : 'Store');
      } else if (page === 'shopping-editor') {
        const nm = (readSession('selectedShoppingItemName') || '').trim();
        const itemNew = readSession('selectedShoppingItemIsNew') === '1';
        early = nm || (itemNew ? 'New item' : 'Shopping item');
      }
      if (early) titleEl.textContent = early;
    }
  }

  const FAVORITE_EATS_BUILD_DEFAULTS = {
    target: 'desktop',
    plannerExperience: false,
    allowHiddenPlannerModeToggle: true,
  };

  function readFavoriteEatsBuildConfig() {
    try {
      const raw =
        typeof window !== 'undefined' ? window.__FAVORITE_EATS_BUILD__ : null;
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
        plannerExperience:
          raw.plannerExperience === true || raw.forceWebExperience === true,
        allowHiddenPlannerModeToggle:
          raw.allowHiddenPlannerModeToggle !== false &&
          raw.allowHiddenForceWebModeToggle !== false,
      };
    } catch (_) {
      return { ...FAVORITE_EATS_BUILD_DEFAULTS };
    }
  }

  const PLANNER_LAYOUT_STORAGE_KEY = 'favoriteEatsPlannerModeOn';
  const PLANNER_LAYOUT_STORAGE_KEY_LEGACY = 'favoriteEatsPlannerOn';

  function isPublicPlannerExperienceLocked(build) {
    return build.target === 'web' && build.plannerExperience === true;
  }

  function isPlannerModeEnabledFromStorage(build) {
    if (isPublicPlannerExperienceLocked(build)) return true;
    try {
      const v = localStorage.getItem(PLANNER_LAYOUT_STORAGE_KEY);
      if (v === '1' || v === '0') return v === '1';
      const legacy = localStorage.getItem(PLANNER_LAYOUT_STORAGE_KEY_LEGACY);
      if (legacy === '1' || legacy === '0') {
        try {
          localStorage.setItem(PLANNER_LAYOUT_STORAGE_KEY, legacy);
        } catch (_) {}
        return legacy === '1';
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  const build = readFavoriteEatsBuildConfig();
  if (!isPlannerModeEnabledFromStorage(build)) return;
  if (page !== 'recipes' && page !== 'shopping' && page !== 'stores') return;

  const addBtn = document.getElementById('appBarAddBtn');
  if (!(addBtn instanceof HTMLElement)) return;
  const label = addBtn.querySelector('.app-bar-action-label');
  const icon = addBtn.querySelector('.app-bar-action-icon--snug-only');
  if (label) label.textContent = 'Reset';
  if (icon) icon.textContent = 'cancel';
})();
