(function initFavoriteEatsSplashGate(global) {
  if (!global || !global.document) return;

  const DEFAULT_SUPABASE_URL = 'https://ysesmbcvxmaymtsqeipc.supabase.co';
  const DEFAULT_SUPABASE_ANON_KEY =
    'sb_publishable_gIYjmWOjcHtg5RRLbw8yLQ_AGWYQH2E';
  const VERIFY_PATH = '/functions/v1/verify-splash-password';

  function trimStr(v) {
    return String(v == null ? '' : v).trim();
  }

  function readLocalStorage(key) {
    try {
      return global.localStorage && typeof global.localStorage.getItem === 'function'
        ? global.localStorage.getItem(key)
        : null;
    } catch (_) {
      return null;
    }
  }

  function getSupabaseUrl() {
    return (
      trimStr(global.__SUPABASE_URL__) ||
      trimStr(readLocalStorage('favoriteEatsSupabaseUrl')) ||
      DEFAULT_SUPABASE_URL
    );
  }

  function getSupabaseAnonKey() {
    return (
      trimStr(global.__SUPABASE_ANON_KEY__) ||
      trimStr(readLocalStorage('favoriteEatsSupabaseAnonKey')) ||
      DEFAULT_SUPABASE_ANON_KEY
    );
  }

  function setError(el, message) {
    if (!(el instanceof HTMLElement)) return;
    const text = String(message || '').trim();
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  async function verifyPassword(password) {
    const url = `${getSupabaseUrl()}${VERIFY_PATH}`;
    const anonKey = getSupabaseAnonKey();
    const headers = { 'content-type': 'application/json' };
    if (anonKey) {
      headers.apikey = anonKey;
      headers.authorization = `Bearer ${anonKey}`;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error || '').trim();
      throw new Error(message || `Request failed (${response.status}).`);
    }
    if (!payload || payload.ok !== true) {
      throw new Error('Invalid response from password service.');
    }
    return true;
  }

  function setButtonBusy(button, isBusy) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = !!isBusy;
    button.textContent = isBusy ? 'Checking...' : 'Continue';
  }

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    const input = form.querySelector('#splashPasswordInput');
    const button = form.querySelector('#splashContinueBtn');
    const errorEl = global.document.getElementById('splashGateError');
    const password = input instanceof HTMLInputElement ? input.value : '';

    setError(errorEl, '');
    setButtonBusy(button, true);

    try {
      await verifyPassword(password);
      if (typeof global.favoriteEatsApplyWelcomeSession === 'function') {
        global.favoriteEatsApplyWelcomeSession();
      }
      if (global.favoriteEatsGate && typeof global.favoriteEatsGate.grantAccess === 'function') {
        global.favoriteEatsGate.grantAccess();
      }
      global.location.href = `recipes.html${global.location.search || ''}`;
    } catch (err) {
      const message = String(err && err.message ? err.message : '').trim();
      if (message.toLowerCase() === 'invalid password.') {
        setError(errorEl, 'Incorrect password.');
      } else if (message) {
        setError(errorEl, message);
      } else {
        setError(errorEl, 'Unable to verify password right now.');
      }
    } finally {
      setButtonBusy(button, false);
    }
  }

  function init() {
    try {
      global.sessionStorage.removeItem('favoriteEatsSplashAccess');
    } catch (_) {}
    const form = global.document.getElementById('splashGateForm');
    if (form instanceof HTMLFormElement) {
      form.addEventListener('submit', onSubmit);
    }
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
