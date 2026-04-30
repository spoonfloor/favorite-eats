/**
 * Name deck: shuffle two lists into a round of pairs, optional localStorage.
 * Quarantined experiment — not imported by main app code.
 */
(function (global) {
  'use strict';

  var STORAGE_VERSION = 1;
  var DEFAULT_KEY = 'recipeEditor.experiments.nameDeck.v1';

  function shuffleInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function dealRound(listA, listB) {
    var n = Math.max(listA.length, listB.length);
    var a = shuffleInPlace(listA.slice());
    var b = shuffleInPlace(listB.slice());
    var pairs = [];
    for (var i = 0; i < n; i++) {
      pairs.push(a[i % a.length] + ' ' + b[i % b.length]);
    }
    return pairs;
  }

  function simpleHash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return String(h);
  }

  function fingerprintLists(listA, listB) {
    return (
      listA.length +
      ':' +
      listB.length +
      ':' +
      simpleHash(listA.join('\n')) +
      ':' +
      simpleHash(listB.join('\n'))
    );
  }

  /**
   * @param {Storage} storage
   * @param {string} key
   * @param {string[]} listA
   * @param {string[]} listB
   * @returns {{ deck: string[], idx: number, round: number } | null}
   */
  function loadState(storage, key, listA, listB) {
    if (!storage || typeof storage.getItem !== 'function') {
      return null;
    }
    try {
      var raw = storage.getItem(key || DEFAULT_KEY);
      if (!raw) {
        return null;
      }
      var o = JSON.parse(raw);
      if (o.version !== STORAGE_VERSION) {
        return null;
      }
      if (o.listFingerprint !== fingerprintLists(listA, listB)) {
        return null;
      }
      if (!Array.isArray(o.deck) || typeof o.idx !== 'number') {
        return null;
      }
      return {
        deck: o.deck,
        idx: o.idx,
        round: typeof o.round === 'number' ? o.round : 0,
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * @param {Storage} storage
   * @param {string} key
   * @param {{ deck: string[], idx: number, round: number }} state
   * @param {string[]} listA
   * @param {string[]} listB
   */
  function saveState(storage, key, state, listA, listB) {
    if (!storage || typeof storage.setItem !== 'function') {
      return;
    }
    var payload = {
      version: STORAGE_VERSION,
      listFingerprint: fingerprintLists(listA, listB),
      deck: state.deck,
      idx: state.idx,
      round: state.round,
    };
    try {
      storage.setItem(key || DEFAULT_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  /**
   * @param {{ listA: string[], listB: string[], storage?: Storage, storageKey?: string }} opts
   */
  function createSession(opts) {
    var listA = opts.listA;
    var listB = opts.listB;
    var storage = opts.storage;
    var storageKey = opts.storageKey || DEFAULT_KEY;

    var deck = [];
    var idx = 0;
    var round = 0;

    var restored = loadState(storage, storageKey, listA, listB);
    if (restored) {
      deck = restored.deck;
      idx = restored.idx;
      round = restored.round;
    }

    function persist() {
      saveState(storage, storageKey, { deck: deck, idx: idx, round: round }, listA, listB);
    }

    /**
     * @returns {{ text: string, progress: { shown: number, total: number, round: number } }}
     */
    function next() {
      if (idx >= deck.length) {
        deck = dealRound(listA, listB);
        idx = 0;
        round += 1;
      }
      var text = deck[idx];
      idx += 1;
      persist();
      return {
        text: text,
        progress: { shown: idx, total: deck.length, round: round },
      };
    }

    function progressLine() {
      if (!deck.length) {
        return '';
      }
      if (idx === 0) {
        return 'Round ' + round + ' · press Generate for first pair';
      }
      return 'Pair ' + idx + ' of ' + deck.length + ' · round ' + round;
    }

    return {
      next: next,
      progressLine: progressLine,
      getState: function () {
        return { deck: deck, idx: idx, round: round };
      },
    };
  }

  var NameDeck = {
    STORAGE_VERSION: STORAGE_VERSION,
    DEFAULT_KEY: DEFAULT_KEY,
    shuffleInPlace: shuffleInPlace,
    dealRound: dealRound,
    fingerprintLists: fingerprintLists,
    loadState: loadState,
    saveState: saveState,
    createSession: createSession,
  };

  global.NameDeck = NameDeck;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NameDeck;
  }
})(typeof window !== 'undefined' ? window : globalThis);
