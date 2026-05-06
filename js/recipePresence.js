/**
 * Recipe editor: Supabase Realtime presence + moniker badge (easter egg).
 */
(function (global) {
  'use strict';

  var SESSION_KEY = 'favoriteEats.recipePresence.tabKey';
  var LOGIN_TOAST_DELAY_MS = 400;

  function getPresenceTabKey() {
    try {
      if (typeof sessionStorage === 'undefined') return 'anon-' + String(Date.now());
      var existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      var id =
        global.crypto && typeof global.crypto.randomUUID === 'function'
          ? global.crypto.randomUUID()
          : 'p-' + String(Date.now()) + '-' + String(Math.random()).slice(2);
      sessionStorage.setItem(SESSION_KEY, id);
      return id;
    } catch (_) {
      return 'p-fallback';
    }
  }

  function buildOthersFromPresenceState(rawState, myKey) {
    var list = [];
    var seen = {};
    var keys = Object.keys(rawState || {});
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === myKey) continue;
      var metas = rawState[k];
      var arr = Array.isArray(metas) ? metas : [];
      for (var j = 0; j < arr.length; j++) {
        var m = arr[j] && arr[j].moniker != null ? String(arr[j].moniker).trim() : '';
        if (m && !seen[m]) {
          seen[m] = true;
          list.push({ key: k, moniker: m });
        }
      }
    }
    return list;
  }

  function openPresenceDialog(opts) {
    var title = opts.title || 'Who’s here';
    var myMoniker = String(opts.myMoniker || '').trim();
    var recipeTitle = String(opts.recipeTitle || '').trim();
    var others = Array.isArray(opts.others) ? opts.others : [];

    var intro = document.createDocumentFragment();
    if (recipeTitle) {
      var p1 = document.createElement('p');
      p1.className = 'ui-dialog-body';
      p1.style.marginTop = '0';
      p1.textContent = 'Recipe: ' + recipeTitle;
      intro.appendChild(p1);
    }
    var p2 = document.createElement('p');
    p2.className = 'ui-dialog-body';
    p2.textContent =
      'You appear as “' +
      (myMoniker || '—') +
      '”. Others editing this recipe right now:';
    intro.appendChild(p2);

    var ul = document.createElement('ul');
    ul.style.margin = '0';
    ul.style.paddingLeft = '1.25rem';
    ul.style.fontSize = 'var(--body-font-size)';
    if (!others.length) {
      var empty = document.createElement('li');
      empty.style.color = 'var(--subtitle)';
      empty.textContent = 'No one else (yet).';
      ul.appendChild(empty);
    } else {
      for (var i = 0; i < others.length; i++) {
        var li = document.createElement('li');
        li.textContent = others[i].moniker || others[i];
        ul.appendChild(li);
      }
    }

    var wrap = document.createElement('div');
    wrap.appendChild(intro);
    wrap.appendChild(ul);

    if (global.window && window.ui && typeof window.ui.dialog === 'function') {
      void window.ui.dialog({
        title: title,
        message: '',
        messageNode: wrap,
        confirmText: 'OK',
        showCancel: false,
      });
    }
  }

  /**
   * @returns {void|function(): void} teardown
   */
  function favoriteEatsInitRecipePresence(opts) {
    var recipeId = opts && opts.recipeId != null ? String(opts.recipeId) : '';
    var recipeTitle = opts && opts.recipeTitle != null ? String(opts.recipeTitle) : '';

    var useRemote =
      typeof global.favoriteEatsShouldUseSupabaseDataDoor === 'function' &&
      global.favoriteEatsShouldUseSupabaseDataDoor();

    var badge = document.getElementById('recipePresenceBadge');
    if (!badge) return undefined;

    if (
      !useRemote ||
      !recipeId ||
      !global.window ||
      !window.dataService ||
      typeof window.dataService.subscribeRecipePresence !== 'function'
    ) {
      return undefined;
    }

    var listA = global.NAME_DECK_LIST_A;
    var listB = global.NAME_DECK_LIST_B;
    if (
      !Array.isArray(listA) ||
      !Array.isArray(listB) ||
      !global.recipePresenceMoniker ||
      typeof global.recipePresenceMoniker.getOrCreateMoniker !== 'function'
    ) {
      return undefined;
    }

    var monikerInfo = global.recipePresenceMoniker.getOrCreateMoniker(
      listA,
      listB,
      typeof localStorage !== 'undefined' ? localStorage : null,
    );
    var myMoniker = monikerInfo.moniker;
    var myLoginSessionId = String(monikerInfo.loginSessionId || '').trim();
    var monogram = monikerInfo.monogram || '?';

    badge.textContent = monogram;
    badge.setAttribute('title', myMoniker);
    badge.setAttribute('aria-label', 'Your editing name: ' + myMoniker);
    badge.classList.remove('recipe-presence-badge--hidden');

    var presenceKey = getPresenceTabKey();
    var prevRecipeOtherPresenceKeys = new Set();
    var latestOthers = [];
    var pendingRecipePresenceMonikers = null;
    var recipePresenceToastFlushScheduled = false;

    function flushRecipePresenceToastFromPending() {
      recipePresenceToastFlushScheduled = false;
      var monikers = pendingRecipePresenceMonikers;
      pendingRecipePresenceMonikers = null;
      if (!monikers || !monikers.length) return;
      if (!window.ui || typeof window.ui.toast !== 'function') return;
      var primary = monikers[0];
      var extra = Math.max(0, monikers.length - 1);
      if (
        window.presenceToastMessage &&
        typeof window.presenceToastMessage.buildPresenceAlsoEditingFragment ===
          'function'
      ) {
        var frag =
          window.presenceToastMessage.buildPresenceAlsoEditingFragment(
            primary,
            extra,
            {
              linkClass: 'recipe-presence-toast-link',
              onOthersClick: function () {
                try {
                  if (
                    typeof window.favoriteEatsOpenContributorsModalWithList ===
                    'function'
                  ) {
                    window.favoriteEatsOpenContributorsModalWithList(monikers);
                  }
                } catch (_) {}
              },
            },
          );
        window.ui.toast({
          message: '',
          messageNode: frag,
          toastClass: 'recipe-presence-toast',
        });
      } else {
        window.ui.toast({
          message:
            extra === 0
              ? primary + ' is also active'
              : primary +
                ' (+ ' +
                extra +
                ' other' +
                (extra === 1 ? '' : 's') +
                ') are also active',
          toastClass: 'recipe-presence-toast',
        });
      }
    }

    function scheduleRecipePresenceToast(monikersSnapshot) {
      if (
        typeof window.favoriteEatsMonikerPresenceToastsArmed !== 'function' ||
        !window.favoriteEatsMonikerPresenceToastsArmed()
      ) {
        return;
      }
      pendingRecipePresenceMonikers = monikersSnapshot;
      if (recipePresenceToastFlushScheduled) return;
      recipePresenceToastFlushScheduled = true;
      if (
        typeof window.favoriteEatsDeferUntilCoPresenceEarliest === 'function'
      ) {
        window.favoriteEatsDeferUntilCoPresenceEarliest(
          flushRecipePresenceToastFromPending,
        );
      } else {
        flushRecipePresenceToastFromPending();
      }
    }

    function syncBadgeClick() {
      badge.onclick = function () {
        openPresenceDialog({
          title: 'Editing party',
          myMoniker: myMoniker,
          recipeTitle: recipeTitle,
          others: latestOthers,
        });
      };
    }
    syncBadgeClick();

    var unsub =
      typeof window.dataService.subscribeRecipePresence === 'function'
        ? window.dataService.subscribeRecipePresence({
            recipeId: recipeId,
            presenceKey: presenceKey,
            loginSessionId: myLoginSessionId,
            moniker: myMoniker,
            onState: function (rawState) {
              latestOthers = buildOthersFromPresenceState(rawState, presenceKey);
              var cohortKeys = latestOthers
                .map(function (row) {
                  return row.key;
                })
                .sort();

              var joinDetected = cohortKeys.some(function (k) {
                return !prevRecipeOtherPresenceKeys.has(k);
              });

              prevRecipeOtherPresenceKeys = new Set(cohortKeys);

              if (!joinDetected || latestOthers.length === 0) {
                return;
              }

              var monikersSnapshot = latestOthers
                .map(function (row) {
                  return row.moniker;
                })
                .slice()
                .sort(function (a, b) {
                  return String(a).localeCompare(String(b));
                });

              scheduleRecipePresenceToast(monikersSnapshot);
            },
          })
        : function () {};

    var monikerArmOk =
      typeof window.favoriteEatsMonikerPresenceToastsArmed === 'function' &&
      window.favoriteEatsMonikerPresenceToastsArmed();

    if (monikerArmOk && typeof global.favoriteEatsShowMonikerLoginToast === 'function') {
      global.favoriteEatsShowMonikerLoginToast();
    } else if (monikerArmOk) {
      global.setTimeout(function () {
        if (window.ui && typeof window.ui.toast === 'function') {
          window.ui.toast({
            message: 'Logged in as ' + myMoniker,
          });
        }
      }, LOGIN_TOAST_DELAY_MS);
    }

    if (monikerArmOk) {
      global.setTimeout(function () {
        try {
          if (
            typeof window.favoriteEatsSetCoPresenceAllowedAfterIdentityToast ===
            'function'
          ) {
            window.favoriteEatsSetCoPresenceAllowedAfterIdentityToast(
              LOGIN_TOAST_DELAY_MS,
            );
          }
        } catch (_) {}
      }, 0);
    }

    function teardown() {
      try {
        unsub();
      } catch (_) {}
      try {
        badge.classList.add('recipe-presence-badge--hidden');
        badge.onclick = null;
      } catch (_) {}
    }

    global.addEventListener('pagehide', teardown, { once: true });

    return teardown;
  }

  global.favoriteEatsInitRecipePresence = favoriteEatsInitRecipePresence;
})(typeof window !== 'undefined' ? window : globalThis);
