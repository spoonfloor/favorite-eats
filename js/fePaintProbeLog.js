/**
 * Paint event log for recipe editor save / YWN investigations.
 * Enable with `window.__fePaintProbeEnabled = true` or `?fePaintProbe=1`.
 */
(function fePaintProbeLogModule(global) {
  if (!global) return;

  function isProbeEnabled() {
    if (global.__fePaintProbeEnabled === true) return true;
    try {
      const search = global.location && global.location.search;
      return !!(
        search &&
        typeof global.URLSearchParams === 'function' &&
        new global.URLSearchParams(search).get('fePaintProbe') === '1'
      );
    } catch (_) {
      return false;
    }
  }

  function fePaintProbeLog(event, detail) {
    if (!isProbeEnabled()) return;
    if (!global.__fePaintLog) global.__fePaintLog = [];
    const entry = {
      t: Date.now(),
      perf:
        typeof global.performance !== 'undefined'
          ? Math.round(global.performance.now())
          : 0,
      event: String(event || ''),
    };
    if (detail && typeof detail === 'object') {
      Object.assign(entry, detail);
    }
    global.__fePaintLog.push(entry);
    if (global.__fePaintProbeQuiet) return;
    try {
      console.log('[fePaintProbe]', entry.event, detail || '');
    } catch (_) {}
  }

  global.fePaintProbeLog = fePaintProbeLog;
  global.__fePaintLogReset = (opts = {}) => {
    if (opts.enabled !== false) {
      global.__fePaintProbeEnabled = true;
    }
    global.__fePaintLog = [];
    global.__fePaintProbeT0 = Date.now();
  };
})(typeof window !== 'undefined' ? window : globalThis);
