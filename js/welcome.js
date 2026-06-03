function ensureWelcomeToastHost() {
  let host = document.getElementById('typeaheadToastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'typeaheadToastHost';
    document.body.appendChild(host);
  }
  if (!host.classList.contains('ui-toast-host')) host.classList.add('ui-toast-host');
  if (!host.classList.contains('typeahead-toast-host'))
    host.classList.add('typeahead-toast-host');
  return host;
}

function welcomeToast({
  message = '',
  timeoutMs = 3500,
  singleSlot = true,
} = {}) {
  try {
    const host = ensureWelcomeToastHost();
    if (singleSlot) {
      try {
        while (host.firstChild) host.removeChild(host.firstChild);
      } catch (_) {}
    }

    const el = document.createElement('div');
    el.className = 'ui-toast typeahead-toast';

    const msg = document.createElement('div');
    msg.className = 'ui-toast__msg typeahead-toast__msg';
    msg.textContent = message || '';
    el.appendChild(msg);

    host.appendChild(el);

    const t = window.setTimeout(() => {
      try {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch (_) {}
    }, Math.max(1000, Number(timeoutMs) || 3500));

    el.addEventListener('mouseenter', () => {
      try {
        window.clearTimeout(t);
      } catch (_) {}
    });

    return el;
  } catch (_) {
    return null;
  }
}

function favoriteEatsApplyWelcomeSession() {
  const plannerLayoutStorageKey = 'favoriteEatsPlannerModeOn';
  let loginSessionId = '';
  try {
    loginSessionId =
      window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : 'login-' + String(Date.now()) + '-' + String(Math.random()).slice(2);
  } catch (_) {
    loginSessionId = 'login-' + String(Date.now()) + '-' + String(Math.random()).slice(2);
  }
  try {
    sessionStorage.setItem('favoriteEats.sessionLoginAllowed', '1');
  } catch (_) {}
  try {
    sessionStorage.setItem('favoriteEats.justLoggedInFromWelcome', '1');
  } catch (_) {}
  try {
    sessionStorage.setItem('favoriteEats.monikerPresenceToastsArmed', '1');
  } catch (_) {}
  try {
    sessionStorage.setItem('favoriteEats.loginSessionId', loginSessionId);
  } catch (_) {}
  try {
    sessionStorage.removeItem('recipeEditor.presence.moniker.v1');
    localStorage.removeItem('favoriteEats.loginSessionId');
    localStorage.removeItem('recipeEditor.presence.moniker.v1');
  } catch (_) {}
  try {
    // Front-door login should always land in planner layout (editing off).
    localStorage.setItem(plannerLayoutStorageKey, '1');
    try {
      localStorage.removeItem('favoriteEatsPlannerOn');
    } catch (_) {}
  } catch (_) {}
  try {
    if (typeof window.clearFavoriteEatsShoppingSessionCache === 'function') {
      window.clearFavoriteEatsShoppingSessionCache();
    } else if (typeof sessionStorage !== 'undefined') {
      // index.html loads welcome.js without main.js — drop stale warm-client cache.
      [
        'favoriteEats:store:v1',
        'favoriteEats:remote-shopping-authority:v1',
        'favoriteEats:shopping-plan:session-mirror:v1',
        'favoriteEats:shopping-list-doc:session-mirror:v2',
      ].forEach((key) => {
        try {
          sessionStorage.removeItem(key);
        } catch (_) {}
      });
      try {
        localStorage.removeItem('favoriteEats:shopping-plan:v1');
      } catch (_) {}
    }
  } catch (_) {}
}

try {
  window.favoriteEatsApplyWelcomeSession = favoriteEatsApplyWelcomeSession;
} catch (_) {}

async function favoriteEatsCompleteWelcomeFrontDoor() {
  if (typeof window.favoriteEatsCompleteWelcomeFrontDoorForMode === 'function') {
    await window.favoriteEatsCompleteWelcomeFrontDoorForMode('full');
    return;
  }
  favoriteEatsApplyWelcomeSession();
  let granted = false;
  if (
    window.favoriteEatsGate &&
    typeof window.favoriteEatsGate.grantAccess === 'function'
  ) {
    granted = !!window.favoriteEatsGate.grantAccess();
  }
  if (!granted) {
    throw new Error('Could not save your session (browser storage).');
  }
  if (typeof window.favoriteEatsAdvanceMonikerFromWelcomeDeck === 'function') {
    await window.favoriteEatsAdvanceMonikerFromWelcomeDeck();
  }
}

try {
  window.favoriteEatsCompleteWelcomeFrontDoor = favoriteEatsCompleteWelcomeFrontDoor;
} catch (_) {}

async function handleWelcomeLoad() {
  await favoriteEatsCompleteWelcomeFrontDoor();
  window.location.href = `recipes.html${window.location.search || ''}`;
}

function initWelcomeShell() {
  try {
    const splashGate = document.getElementById('splashGateForm');
    document.documentElement.dataset.platform =
      splashGate instanceof HTMLFormElement ? 'planner' : 'editor';
  } catch (_) {}
}

function initWelcomePage() {
  initWelcomeShell();

  const loadDbBtn = document.getElementById('loadDbBtn');
  if (!(loadDbBtn instanceof HTMLButtonElement)) return;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadDbBtn.click();
    }
  });

  loadDbBtn.addEventListener('click', async () => {
    try {
      await handleWelcomeLoad();
    } catch (err) {
      console.error('Failed to open recipes:', err);
      welcomeToast({
        message: 'Failed to open recipes.',
        timeoutMs: 3500,
      });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWelcomePage, { once: true });
} else {
  initWelcomePage();
}
