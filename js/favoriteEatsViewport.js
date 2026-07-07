/**
 * App glass viewport height — single source of truth for iOS standalone first paint.
 * Standalone: probe 100lvh (100dvh / innerHeight / visualViewport under-report on cold start).
 * Browser: visualViewport.height (toolbar-aware).
 * Pair with root min-height: calc(var(--app-height) + 1px) in overrides.css.
 */
(function initFavoriteEatsViewport(global) {
  if (!global || !global.document) return;

  function isStandalone() {
    if (global.navigator.standalone === true) return true;
    return global.matchMedia('(display-mode: standalone)').matches;
  }

  function measureLargeViewportHeight() {
    const probe = global.document.createElement('div');
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;height:100vh;height:100lvh;';
    global.document.documentElement.appendChild(probe);
    const height = probe.offsetHeight;
    probe.remove();
    return height;
  }

  function getAppViewportHeight() {
    if (isStandalone()) {
      return measureLargeViewportHeight();
    }

    const viewport = global.visualViewport;
    if (viewport && viewport.height > 0) {
      return viewport.height;
    }

    return global.innerHeight;
  }

  function syncAppViewportHeight() {
    global.document.documentElement.style.setProperty(
      '--app-height',
      `${Math.round(getAppViewportHeight())}px`,
    );
  }

  function watchAppViewport() {
    const update = () => {
      syncAppViewportHeight();
    };

    update();
    global.requestAnimationFrame(update);
    global.addEventListener('resize', update);
    global.document.fonts?.ready?.then(update);

    const viewport = global.visualViewport;
    if (viewport) {
      viewport.addEventListener('resize', update);
      viewport.addEventListener('scroll', update);
    }
  }

  global.favoriteEatsViewport = {
    getAppViewportHeight,
    syncAppViewportHeight,
    watchAppViewport,
  };

  watchAppViewport();
})(typeof window !== 'undefined' ? window : globalThis);
