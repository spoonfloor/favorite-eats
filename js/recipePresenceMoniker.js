/**
 * Persistent moniker from cloud deck (front door) + sessionStorage (this visit).
 */
(function (global) {
  'use strict';

  var MONIKER_KEY = 'recipeEditor.presence.moniker.v1';
  var LOGIN_SESSION_ID_KEY = 'favoriteEats.loginSessionId';
  var WELCOME_LOGIN_TOAST_KEY = 'favoriteEats.justLoggedInFromWelcome';
  var FALLBACK_MONIKER = 'Doctor Incognito';
  var MONIKER_SCOPE_KEY = 'default';

  function getMonikerStorage(explicitStorage) {
    if (explicitStorage && typeof explicitStorage.getItem === 'function') {
      return explicitStorage;
    }
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  }

  function readLoginSessionId(store) {
    if (!store) return '';
    try {
      return String(store.getItem(LOGIN_SESSION_ID_KEY) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function readCachedMoniker(store, loginSessionId) {
    if (!store || !loginSessionId) return '';
    try {
      var raw = store.getItem(MONIKER_KEY);
      if (!raw) return '';
      var o = JSON.parse(raw);
      if (
        o &&
        String(o.moniker || '').trim() &&
        String(o.loginSessionId || '').trim() === loginSessionId
      ) {
        return String(o.moniker).trim();
      }
    } catch (_) {}
    return '';
  }

  function writeCachedMoniker(store, loginSessionId, moniker) {
    if (!store || !loginSessionId) return;
    var picked = String(moniker || '').trim();
    if (!picked) return;
    try {
      store.setItem(
        MONIKER_KEY,
        JSON.stringify({
          loginSessionId: loginSessionId,
          moniker: picked,
        }),
      );
    } catch (_) {}
  }

  function splitPairByKnownA(fullName, listA) {
    var name = String(fullName || '');
    var candidates = (listA || []).slice().sort(function (a, b) {
      return b.length - a.length;
    });
    for (var i = 0; i < candidates.length; i++) {
      var left = candidates[i];
      var prefix = left + ' ';
      if (name.indexOf(prefix) === 0) {
        return { a: left, b: name.slice(prefix.length) };
      }
    }
    return { a: '', b: name };
  }

  function firstAlphaUpper(s, fallback) {
    var m = String(s || '').match(/\p{L}/u);
    if (m) {
      return m[0].toUpperCase();
    }
    var mf = String(fallback || '').match(/\p{L}/u);
    if (mf) {
      return mf[0].toUpperCase();
    }
    return '?';
  }

  /**
   * First Unicode letter in the list-B segment of the moniker (uppercase); else "?".
   * Fallback display moniker uses “I” for Incognito (not “D” from Doctor).
   */
  function monogramLetterFromBSide(moniker, listA) {
    if (String(moniker || '').trim() === FALLBACK_MONIKER) {
      return 'I';
    }
    var parsed = splitPairByKnownA(String(moniker || ''), listA);
    var b = String(parsed.b || '');
    var m = b.match(/\p{L}/u);
    return m ? m[0].toUpperCase() : '?';
  }

  function buildMonikerResult(moniker, loginSessionId, listA) {
    var picked = String(moniker || '').trim() || FALLBACK_MONIKER;
    return {
      moniker: picked,
      loginSessionId: loginSessionId,
      monogram: monogramLetterFromBSide(picked, listA),
    };
  }

  /**
   * Read this visit's moniker. Never deals from the cloud shoe.
   * @returns {{ moniker: string, monogram: string, loginSessionId: string }}
   */
  function getOrCreateMoniker(listA, listB, storage) {
    var store = getMonikerStorage(storage);
    var loginSessionId = readLoginSessionId(store);
    var cached = readCachedMoniker(store, loginSessionId);
    if (cached) {
      return buildMonikerResult(cached, loginSessionId, listA);
    }
    return buildMonikerResult(FALLBACK_MONIKER, loginSessionId, listA);
  }

  function buildFreshDeckForCloudSeed(listA, listB) {
    if (
      !global.NameDeck ||
      typeof global.NameDeck.dealRound !== 'function' ||
      !Array.isArray(listA) ||
      !Array.isArray(listB)
    ) {
      return [];
    }
    return global.NameDeck.dealRound(listA, listB);
  }

  /**
   * Draw one moniker from the cloud shoe and persist for this visit (splash only).
   * @returns {Promise<string>}
   */
  async function favoriteEatsAdvanceMonikerFromWelcomeDeck() {
    var listA = global.NAME_DECK_LIST_A;
    var listB = global.NAME_DECK_LIST_B;
    var store = getMonikerStorage(
      typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    );
    var loginSessionId = readLoginSessionId(store);
    var moniker = FALLBACK_MONIKER;

    try {
      if (
        global.dataService &&
        typeof global.dataService.drawPresenceMoniker === 'function'
      ) {
        global.dataService.useSupabase = true;
        var freshDeck = buildFreshDeckForCloudSeed(listA, listB);
        var drawn = await global.dataService.drawPresenceMoniker({
          scopeKey: MONIKER_SCOPE_KEY,
          freshDeck: freshDeck,
        });
        if (drawn) {
          moniker = drawn;
        }
      }
    } catch (_) {}

    writeCachedMoniker(store, loginSessionId, moniker);
    return moniker;
  }

  var LOGIN_TOAST_DELAY_MS = 400;

  /**
   * “Logged in as …” — uses `window.ui.toast` default duration (see utils.js).
   * @param {{ delayMs?: number }} [opts]
   */
  function favoriteEatsShowMonikerLoginToast(opts) {
    var delay =
      opts && opts.delayMs != null
        ? Math.max(0, Number(opts.delayMs) || 0)
        : LOGIN_TOAST_DELAY_MS;
    try {
      var listA = global.NAME_DECK_LIST_A;
      var listB = global.NAME_DECK_LIST_B;
      if (!Array.isArray(listA) || !Array.isArray(listB)) return;
      var info = getOrCreateMoniker(listA, listB);
      var moniker = String((info && info.moniker) || '').trim();
      if (!moniker) moniker = FALLBACK_MONIKER;
      global.setTimeout(function () {
        try {
          if (
            global.window &&
            window.ui &&
            typeof window.ui.toast === 'function'
          ) {
            window.ui.toast({
              message: 'Logged in as ' + moniker,
            });
          }
        } catch (_) {}
      }, delay);
    } catch (_) {}
  }

  /**
   * Show login toast once after navigating from welcome -> recipes.
   */
  function favoriteEatsShowWelcomeLandingMonikerToast() {
    var enteredViaWelcome = false;
    try {
      enteredViaWelcome =
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(WELCOME_LOGIN_TOAST_KEY) === '1';
    } catch (_) {}
    if (!enteredViaWelcome) return;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(WELCOME_LOGIN_TOAST_KEY);
      }
    } catch (_) {}
    favoriteEatsShowMonikerLoginToast({ delayMs: 250 });
  }

  global.recipePresenceMoniker = {
    getOrCreateMoniker: getOrCreateMoniker,
    getMonikerStorage: getMonikerStorage,
    splitPairByKnownA: splitPairByKnownA,
    firstAlphaUpper: firstAlphaUpper,
    monogramLetterFromBSide: monogramLetterFromBSide,
  };
  global.favoriteEatsAdvanceMonikerFromWelcomeDeck =
    favoriteEatsAdvanceMonikerFromWelcomeDeck;
  global.favoriteEatsShowMonikerLoginToast = favoriteEatsShowMonikerLoginToast;
  global.favoriteEatsShowWelcomeLandingMonikerToast =
    favoriteEatsShowWelcomeLandingMonikerToast;
})(typeof window !== 'undefined' ? window : globalThis);
