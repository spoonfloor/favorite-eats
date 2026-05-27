/**
 * Name deck: shuffle two lists into one round of moniker pairs (client seed only).
 * The remaining shoe lives in presence.moniker_decks; see docs/supabase-architecture.md.
 */
(function (global) {
  'use strict';

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

  var NameDeck = {
    dealRound: dealRound,
  };

  global.NameDeck = NameDeck;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NameDeck;
  }
})(typeof window !== 'undefined' ? window : globalThis);
