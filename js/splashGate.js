(function initFavoriteEatsSplashGate(global) {
  if (!global || !global.document) return;

  try {
    const root = global.document.documentElement;
    if (root instanceof HTMLElement) root.dataset.platform = 'planner';
  } catch (_) {}

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
      let granted = false;
      if (
        global.favoriteEatsGate &&
        typeof global.favoriteEatsGate.grantAccess === 'function'
      ) {
        granted = !!global.favoriteEatsGate.grantAccess();
      }
      if (!granted) {
        setError(
          errorEl,
          'Could not save your session (browser storage). Allow site data for this origin and try again.',
        );
        return;
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

  function focusPasswordInput() {
    const input = global.document.getElementById('splashPasswordInput');
    if (!(input instanceof HTMLInputElement)) return null;
    try {
      input.focus({ preventScroll: true });
      const len = input.value.length;
      if (typeof input.setSelectionRange === 'function') {
        try {
          input.setSelectionRange(len, len);
        } catch (_) {}
      }
    } catch (_) {
      try {
        input.focus();
      } catch (_) {}
    }
    return input;
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function onGlobalKeydown(event) {
    if (!event || event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.isComposing) return;
    if (isTypingTarget(event.target)) return;
    const input = global.document.getElementById('splashPasswordInput');
    if (!(input instanceof HTMLInputElement)) return;
    if (global.document.activeElement === input) return;

    const key = event.key;
    if (!key) return;

    if (key === 'Enter') {
      event.preventDefault();
      focusPasswordInput();
      const form = input.form;
      if (form && typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else if (form && typeof form.submit === 'function') {
        form.submit();
      }
      return;
    }

    if (key === 'Backspace') {
      event.preventDefault();
      input.value = input.value.slice(0, -1);
    } else if (key === 'Delete') {
      event.preventDefault();
      input.value = '';
    } else if (key.length === 1) {
      event.preventDefault();
      input.value = input.value + key;
    } else {
      return;
    }

    focusPasswordInput();
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {}
  }

  function init() {
    try {
      global.sessionStorage.removeItem('favoriteEatsSplashAccess');
    } catch (_) {}
    const form = global.document.getElementById('splashGateForm');
    if (form instanceof HTMLFormElement) {
      form.addEventListener('submit', onSubmit);
    }
    global.document.addEventListener('keydown', onGlobalKeydown, true);
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
