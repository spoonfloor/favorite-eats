/**
 * Presence-style “also active” copy for toasts (demo / future multi-session UI).
 */
(function (global) {
  'use strict';

  function possessiveDisplayName(displayName) {
    var name = String(displayName || '').trim();
    if (!name) return '';
    return name + "'s";
  }

  /**
   * @param {string} displayName
   * @param {number} otherCount — additional active sessions besides displayName
   * @param {{ linkClass?: string, onOthersClick?: function(number): void }} [options]
   * @returns {DocumentFragment}
   */
  function buildPresenceAlsoEditingFragment(displayName, otherCount, options) {
    var opts = options || {};
    var linkClass = opts.linkClass || '';
    var onOthersClick = opts.onOthersClick;
    var name = String(displayName || '').trim();
    var n = Math.max(0, Math.floor(Number(otherCount) || 0));
    var frag = document.createDocumentFragment();
    if (n === 0) {
      frag.appendChild(document.createTextNode(name + ' is also active'));
      return frag;
    }
    frag.appendChild(document.createTextNode(name + ' (+ '));
    var a = document.createElement('a');
    a.href = '#';
    a.className = linkClass;
    a.textContent = n + ' other' + (n === 1 ? '' : 's');
    a.addEventListener('click', function (e) {
      e.preventDefault();
      try {
        var root =
          typeof a.closest === 'function' ? a.closest('.ui-toast') : null;
        if (root && root.parentNode) root.parentNode.removeChild(root);
      } catch (_) {}
      if (typeof onOthersClick === 'function') onOthersClick(n);
    });
    frag.appendChild(a);
    frag.appendChild(document.createTextNode(') are also active'));
    return frag;
  }

  global.presenceToastMessage = {
    possessiveDisplayName: possessiveDisplayName,
    buildPresenceAlsoEditingFragment: buildPresenceAlsoEditingFragment,
  };
})(typeof window !== 'undefined' ? window : globalThis);
