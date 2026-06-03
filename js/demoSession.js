/**
 * Demo session: local plan/list sandbox, planner locked, catalog read-only.
 * Loaded before pageGate on gated pages and before welcome on index.html.
 */
(function initFavoriteEatsDemoSession(global) {
  if (!global) return;

  const SESSION_MODE_KEY = 'favoriteEats.sessionMode';
  const MODE_DEMO = 'demo';
  const MODE_FULL = 'full';
  const DEMO_PASSWORD = 'demo';

  const DEMO_SHOPPING_PLAN_STORAGE_KEY = 'favoriteEats:demo:shopping-plan:v1';
  const DEMO_SHOPPING_PLAN_SESSION_MIRROR_KEY =
    'favoriteEats:demo:shopping-plan:session-mirror:v1';
  const DEMO_SHOPPING_LIST_DOC_STORAGE_KEY =
    'favoriteEats:demo:shopping-list-doc:v2';
  const DEMO_SHOPPING_LIST_DOC_SESSION_MIRROR_KEY =
    'favoriteEats:demo:shopping-list-doc:session-mirror:v2';

  const DEMO_SESSION_MIRROR_KEYS = Object.freeze([
    'favoriteEats:store:v1',
    'favoriteEats:remote-shopping-authority:v1',
    DEMO_SHOPPING_PLAN_SESSION_MIRROR_KEY,
    DEMO_SHOPPING_LIST_DOC_SESSION_MIRROR_KEY,
  ]);

  function trimStr(value) {
    return String(value == null ? '' : value).trim();
  }

  function readSessionMode() {
    try {
      const mode = trimStr(global.sessionStorage.getItem(SESSION_MODE_KEY));
      return mode === MODE_DEMO ? MODE_DEMO : MODE_FULL;
    } catch (_) {
      return MODE_FULL;
    }
  }

  function isDemoSession() {
    return readSessionMode() === MODE_DEMO;
  }

  function isPlannerExperienceLocked() {
    if (isDemoSession()) return true;
    try {
      const build = global.__FAVORITE_EATS_BUILD__;
      return (
        build &&
        build.target === 'web' &&
        (build.plannerExperience === true || build.forceWebExperience === true)
      );
    } catch (_) {
      return false;
    }
  }

  function setSessionMode(mode) {
    const next = trimStr(mode) === MODE_DEMO ? MODE_DEMO : MODE_FULL;
    try {
      global.sessionStorage.setItem(SESSION_MODE_KEY, next);
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearDemoShoppingStorage() {
    if (typeof global.localStorage !== 'undefined') {
      try {
        global.localStorage.removeItem(DEMO_SHOPPING_PLAN_STORAGE_KEY);
        global.localStorage.removeItem(DEMO_SHOPPING_LIST_DOC_STORAGE_KEY);
      } catch (_) {}
    }
    if (typeof global.sessionStorage !== 'undefined') {
      DEMO_SESSION_MIRROR_KEYS.forEach((key) => {
        try {
          global.sessionStorage.removeItem(key);
        } catch (_) {}
      });
    }
  }

  function resolveSplashLoginMode(password, skipVerify) {
    if (trimStr(password) === DEMO_PASSWORD) return MODE_DEMO;
    if (skipVerify) return MODE_FULL;
    return null;
  }

  function normalizeVerifyMode(payload) {
    const mode = trimStr(payload && payload.mode);
    return mode === MODE_DEMO ? MODE_DEMO : MODE_FULL;
  }

  function isCatalogWriteBlocked() {
    return isDemoSession();
  }

  function getShoppingPlanStorageKey() {
    return isDemoSession()
      ? DEMO_SHOPPING_PLAN_STORAGE_KEY
      : 'favoriteEats:shopping-plan:v1';
  }

  function getShoppingPlanSessionMirrorKey() {
    return isDemoSession()
      ? DEMO_SHOPPING_PLAN_SESSION_MIRROR_KEY
      : 'favoriteEats:shopping-plan:session-mirror:v1';
  }

  function getShoppingListDocStorageKey() {
    return isDemoSession()
      ? DEMO_SHOPPING_LIST_DOC_STORAGE_KEY
      : 'favoriteEats:shopping-list-doc:v2';
  }

  function getShoppingListDocSessionMirrorKey() {
    return isDemoSession()
      ? DEMO_SHOPPING_LIST_DOC_SESSION_MIRROR_KEY
      : 'favoriteEats:shopping-list-doc:session-mirror:v2';
  }

  function applyWelcomeSessionForMode(mode) {
    const demo = trimStr(mode) === MODE_DEMO;
    setSessionMode(demo ? MODE_DEMO : MODE_FULL);

    const plannerLayoutStorageKey = 'favoriteEatsPlannerModeOn';
    let loginSessionId = '';
    try {
      loginSessionId =
        global.crypto && typeof global.crypto.randomUUID === 'function'
          ? global.crypto.randomUUID()
          : 'login-' + String(Date.now()) + '-' + String(Math.random()).slice(2);
    } catch (_) {
      loginSessionId =
        'login-' + String(Date.now()) + '-' + String(Math.random()).slice(2);
    }

    try {
      global.sessionStorage.setItem('favoriteEats.sessionLoginAllowed', '1');
    } catch (_) {}
    try {
      if (demo) {
        global.sessionStorage.removeItem('favoriteEats.justLoggedInFromWelcome');
        global.sessionStorage.removeItem('favoriteEats.monikerPresenceToastsArmed');
      } else {
        global.sessionStorage.setItem('favoriteEats.justLoggedInFromWelcome', '1');
        global.sessionStorage.setItem('favoriteEats.monikerPresenceToastsArmed', '1');
      }
    } catch (_) {}
    try {
      global.sessionStorage.setItem('favoriteEats.loginSessionId', loginSessionId);
    } catch (_) {}
    try {
      global.sessionStorage.removeItem('recipeEditor.presence.moniker.v1');
      global.localStorage.removeItem('favoriteEats.loginSessionId');
      global.localStorage.removeItem('recipeEditor.presence.moniker.v1');
    } catch (_) {}
    try {
      global.localStorage.setItem(plannerLayoutStorageKey, '1');
      global.localStorage.removeItem('favoriteEatsPlannerOn');
    } catch (_) {}

    if (demo) {
      clearDemoShoppingStorage();
    }

    try {
      if (typeof global.clearFavoriteEatsShoppingSessionCache === 'function') {
        global.clearFavoriteEatsShoppingSessionCache();
      } else if (typeof global.sessionStorage !== 'undefined') {
        const sessionKeys = demo
          ? DEMO_SESSION_MIRROR_KEYS.slice()
          : [
              'favoriteEats:store:v1',
              'favoriteEats:remote-shopping-authority:v1',
              'favoriteEats:shopping-plan:session-mirror:v1',
              'favoriteEats:shopping-list-doc:session-mirror:v2',
            ];
        sessionKeys.forEach((key) => {
          try {
            global.sessionStorage.removeItem(key);
          } catch (_) {}
        });
        if (!demo) {
          try {
            global.localStorage.removeItem('favoriteEats:shopping-plan:v1');
          } catch (_) {}
        }
      }
    } catch (_) {}

    if (demo) {
      clearDemoShoppingStorage();
    }
  }

  async function completeWelcomeFrontDoorForMode(mode) {
    applyWelcomeSessionForMode(mode);
    let granted = false;
    if (
      global.favoriteEatsGate &&
      typeof global.favoriteEatsGate.grantAccess === 'function'
    ) {
      granted = !!global.favoriteEatsGate.grantAccess();
    }
    if (!granted) {
      throw new Error('Could not save your session (browser storage).');
    }
    if (
      trimStr(mode) !== MODE_DEMO &&
      typeof global.favoriteEatsAdvanceMonikerFromWelcomeDeck === 'function'
    ) {
      await global.favoriteEatsAdvanceMonikerFromWelcomeDeck();
    }
  }

  global.favoriteEatsIsDemoSession = isDemoSession;
  global.favoriteEatsIsPlannerExperienceLocked = isPlannerExperienceLocked;
  global.favoriteEatsIsCatalogWriteBlocked = isCatalogWriteBlocked;
  global.favoriteEatsResolveSplashLoginMode = resolveSplashLoginMode;
  global.favoriteEatsNormalizeVerifyMode = normalizeVerifyMode;
  global.favoriteEatsSetSessionMode = setSessionMode;
  global.favoriteEatsApplyWelcomeSessionForMode = applyWelcomeSessionForMode;
  global.favoriteEatsCompleteWelcomeFrontDoorForMode = completeWelcomeFrontDoorForMode;
  global.favoriteEatsGetShoppingPlanStorageKey = getShoppingPlanStorageKey;
  global.favoriteEatsGetShoppingPlanSessionMirrorKey =
    getShoppingPlanSessionMirrorKey;
  global.favoriteEatsGetShoppingListDocStorageKey = getShoppingListDocStorageKey;
  global.favoriteEatsGetShoppingListDocSessionMirrorKey =
    getShoppingListDocSessionMirrorKey;
  global.favoriteEatsClearDemoShoppingStorage = clearDemoShoppingStorage;
})(typeof window !== 'undefined' ? window : globalThis);
