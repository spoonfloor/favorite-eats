/**
 * iOS standalone splash viewport sync.
 * 100dvh / innerHeight / visualViewport under-report on cold start; probe 100lvh instead.
 * Root min-height + 1px (styles.css) needs --app-height in px for fixed layout to pin on first paint.
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
