/**
 * Name deck: shuffle two lists into a round of pairs, optional localStorage.
 */
(function (global) {
  'use strict';

  /** Bump when deal semantics change (invalidates saved deck state). */
  var STORAGE_VERSION = 2;
  /** Deck shuffle state only (moniker string stored separately). */
  var DEFAULT_KEY = 'recipeEditor.nameDeck.deckState.v1';

  function shuffleInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /**
   * One round = min(|A|,|B|) pairs: shuffle each list, zip index-wise (no wrap).
   * Within a round each index i is used once → distinct slot-pairs; duplicate full
   * strings only if the same text appears more than once inside list A or list B.
   */
  function dealRound(listA, listB) {
    var a = Array.isArray(listA) ? listA.slice() : [];
    var b = Array.isArray(listB) ? listB.slice() : [];
    var k = Math.min(a.length, b.length);
    if (k === 0) {
      return ['Doctor Incognito'];
    }
    shuffleInPlace(a);
    shuffleInPlace(b);
    var pairs = [];
    for (var i = 0; i < k; i++) {
      pairs.push(String(a[i]) + ' ' + String(b[i]));
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
