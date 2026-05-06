/**
 * Persistent moniker from NameDeck + localStorage (survives reload; rotates when lists change).
 */
(function (global) {
  'use strict';

  var MONIKER_KEY = 'recipeEditor.presence.moniker.v1';
  var LOGIN_SESSION_ID_KEY = 'favoriteEats.loginSessionId';
  var WELCOME_LOGIN_TOAST_KEY = 'favoriteEats.justLoggedInFromWelcome';
  var FALLBACK_MONIKER = 'Doctor Incognito';

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
   */
  function monogramLetterFromBSide(moniker, listA) {
    var parsed = splitPairByKnownA(String(moniker || ''), listA);
    var b = String(parsed.b || '');
    var m = b.match(/\p{L}/u);
    return m ? m[0].toUpperCase() : '?';
  }

  /**
   * @returns {{ moniker: string, monogram: string }}
   */
  function getOrCreateMoniker(listA, listB, storage) {
    var store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var loginSessionId = '';
    if (store) {
      try {
        loginSessionId = String(store.getItem(LOGIN_SESSION_ID_KEY) || '').trim();
      } catch (_) {}
    }
    var fp =
      global.NameDeck && typeof global.NameDeck.fingerprintLists === 'function'
        ? global.NameDeck.fingerprintLists(listA, listB)
        : '';

    if (store && fp) {
      try {
        var raw = store.getItem(MONIKER_KEY);
        if (raw) {
          var o = JSON.parse(raw);
          if (
            o &&
            o.listFingerprint === fp &&
            String(o.moniker || '').trim() &&
            String(o.loginSessionId || '').trim() === loginSessionId
          ) {
            var moniker = String(o.moniker).trim();
            return {
              moniker: moniker,
              loginSessionId: loginSessionId,
              monogram: monogramLetterFromBSide(moniker, listA),
            };
          }
        }
      } catch (_) {}
    }

    var session =
      global.NameDeck &&
      typeof global.NameDeck.createSession === 'function'
        ? global.NameDeck.createSession({
            listA: listA,
            listB: listB,
            storage: store,
          })
        : null;
    var moniker = '';
    if (session && typeof session.next === 'function') {
      moniker = String(session.next().text || '').trim();
    }
    if (!moniker) {
      moniker = FALLBACK_MONIKER;
    }

    if (store && fp) {
      try {
        store.setItem(
          MONIKER_KEY,
          JSON.stringify({
            listFingerprint: fp,
            loginSessionId: loginSessionId,
            moniker: moniker,
          }),
        );
      } catch (_) {}
    }

    return {
      moniker: moniker,
      loginSessionId: loginSessionId,
      monogram: monogramLetterFromBSide(moniker, listA),
    };
  }

  var LOGIN_TOAST_DELAY_MS = 400;

  /**
   * Draw next card from NameDeck and persist as current moniker (splash → Open Recipes).
   */
  function favoriteEatsAdvanceMonikerFromWelcomeDeck() {
    try {
      var listA = global.NAME_DECK_LIST_A;
      var listB = global.NAME_DECK_LIST_B;
      if (!Array.isArray(listA) || !Array.isArray(listB)) return;
      if (!global.NameDeck || typeof global.NameDeck.createSession !== 'function') {
        return;
      }
      var store = typeof localStorage !== 'undefined' ? localStorage : null;
      var fp =
        typeof global.NameDeck.fingerprintLists === 'function'
          ? global.NameDeck.fingerprintLists(listA, listB)
          : '';
      var session = global.NameDeck.createSession({
        listA: listA,
        listB: listB,
        storage: store,
      });
      var moniker = '';
      if (session && typeof session.next === 'function') {
        moniker = String(session.next().text || '').trim();
      }
      if (!moniker) moniker = FALLBACK_MONIKER;
      if (store && fp) {
        try {
          store.setItem(
            MONIKER_KEY,
            JSON.stringify({
              listFingerprint: fp,
              loginSessionId: String(store.getItem(LOGIN_SESSION_ID_KEY) || '').trim(),
              moniker: moniker,
            }),
          );
        } catch (_) {}
      }
    } catch (_) {}
  }

  /**
   * “Logged in as …” — uses `window.ui.toast` default duration (see utils.js).
   * @param {{ delayMs?: number }} [opts]
   */
  function favoriteEatsShowMonikerLoginToast(opts) {
    if (
      typeof global.favoriteEatsMonikerPresenceToastsArmed === 'function' &&
      !global.favoriteEatsMonikerPresenceToastsArmed()
    ) {
      return;
    }
    var delay =
      opts && opts.delayMs != null
        ? Math.max(0, Number(opts.delayMs) || 0)
        : LOGIN_TOAST_DELAY_MS;
    try {
      var listA = global.NAME_DECK_LIST_A;
      var listB = global.NAME_DECK_LIST_B;
      if (!Array.isArray(listA) || !Array.isArray(listB)) return;
      var info = getOrCreateMoniker(
        listA,
        listB,
        typeof localStorage !== 'undefined' ? localStorage : null,
      );
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
    if (
      typeof global.favoriteEatsMonikerPresenceToastsArmed === 'function' &&
      !global.favoriteEatsMonikerPresenceToastsArmed()
    ) {
      return;
    }
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(WELCOME_LOGIN_TOAST_KEY);
      }
    } catch (_) {}
    favoriteEatsShowMonikerLoginToast({ delayMs: 250 });
  }

  global.recipePresenceMoniker = {
    getOrCreateMoniker: getOrCreateMoniker,
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
