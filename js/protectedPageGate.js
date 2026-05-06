(function enforceFavoriteEatsPageGate(global) {
  function redirectToSplash() {
    try {
      global.location.replace('index.html');
    } catch (_) {
      global.location.href = 'index.html';
    }
  }

  if (!global || !global.favoriteEatsGate) {
    redirectToSplash();
    throw new Error('Password gate is unavailable.');
  }

  if (!global.favoriteEatsGate.ensureAccess()) {
    throw new Error('Redirecting to splash.');
  }
})(typeof window !== 'undefined' ? window : globalThis);
