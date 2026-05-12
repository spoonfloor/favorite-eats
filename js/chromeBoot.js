/**
 * Runs in <head> before styles.css so first paint uses the correct accent.
 * Keep planner / public-web lock logic aligned with js/main.js (PLANNER keys +
 * readFavoriteEatsBuildConfig / isPublicPlannerExperienceLocked).
 */
(function favoriteEatsChromeBoot() {
  if (typeof document === 'undefined') return;

  const FAVORITE_EATS_BUILD_DEFAULTS = Object.freeze({
    target: 'desktop',
    plannerExperience: false,
    allowHiddenPlannerModeToggle: true,
  });

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
  const planner = isPlannerModeEnabledFromStorage(build);
  const root = document.documentElement;
  if (root instanceof HTMLElement) {
    root.dataset.platform = planner ? 'planner' : 'editor';
  }
})();
