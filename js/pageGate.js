(function initFavoriteEatsPageGate(global) {
  if (!global) return;

  const SESSION_KEY = 'favoriteEatsSplashAccess';
  const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

  function nowMs() {
    return Date.now();
  }

  function readAccessRecord() {
    try {
      const raw = global.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const expiresAt = Number(parsed.expiresAt || 0);
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs()) {
        global.sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function setGateAccess(ttlMs = SESSION_TTL_MS) {
    try {
      global.sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          grantedAt: nowMs(),
          expiresAt: nowMs() + Number(ttlMs || SESSION_TTL_MS),
        }),
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function hasGateAccess() {
    return !!readAccessRecord();
  }

  function ensureGateAccess({ redirectTo = 'index.html' } = {}) {
    if (hasGateAccess()) return true;
    try {
      global.location.replace(redirectTo);
    } catch (_) {
      global.location.href = redirectTo;
    }
    return false;
  }

  global.favoriteEatsGate = Object.freeze({
    hasAccess: hasGateAccess,
    ensureAccess: ensureGateAccess,
    grantAccess: setGateAccess,
    sessionKey: SESSION_KEY,
    sessionTtlMs: SESSION_TTL_MS,
  });
})(typeof window !== 'undefined' ? window : globalThis);
