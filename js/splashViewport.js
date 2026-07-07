/**
 * Splash glass height for geometric vertical centering (equal coral above/below the card).
 * Standalone: probe 100lvh — 100dvh / innerHeight / visualViewport under-report on cold start.
 * Browser: visualViewport.height (toolbar-aware).
 */
(function initFavoriteEatsSplashViewport(global) {
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

  function syncSplashViewportHeight() {
    global.document.documentElement.style.setProperty(
      '--app-height',
      `${Math.round(getAppViewportHeight())}px`,
    );
  }

  function watchSplashViewport() {
    const update = () => {
      syncSplashViewportHeight();
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

  watchSplashViewport();
})(typeof window !== 'undefined' ? window : globalThis);
