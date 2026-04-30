/**
 * Same sentence shape as intended presence toasts in baby-eats (“X is editing …”).
 * Demo only — swap recipe title when you wire a real document name.
 */
(function (global) {
  'use strict';

  /**
   * @param {string} displayName — e.g. generated pair line
   * @param {string} [recipeTitle] — omit or pass "" to use "this recipe"
   */
  function presenceEditingMessage(displayName, recipeTitle) {
    var name = String(displayName || '').trim();
    var title = String(recipeTitle || '').trim();
    if (!title) {
      title = 'this recipe';
    }
    return name + ' is editing ' + title + '.';
  }

  global.presenceToastMessage = { presenceEditingMessage: presenceEditingMessage };
})(typeof window !== 'undefined' ? window : globalThis);
