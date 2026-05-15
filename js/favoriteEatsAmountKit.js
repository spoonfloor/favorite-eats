/**
 * favoriteEatsAmountKit — single place for ingredient *scalar* amounts:
 * parse messy text → positive number when possible; format numbers for display
 * (grid/fraction glyphs, then decimalToFractionDisplay, then decimal fallback).
 *
 * Mass/volume "ladders" (cup↔ml, shopping vs cooking) stay in quantityDisplayPolicy.js.
 * This kit handles the numeric *presentation* after ladders—or alone for count-like units.
 */
(function () {
  function gridDenominatorForStepSelect(stepDenom) {
    const d = Number(stepDenom);
    if (d === 12) return 12;
    if ([1, 2, 3, 4, 8].includes(d)) return d;
    return 8;
  }

  /**
   * @param {unknown} input
   * @returns {number|null}
   */
  function parseToPositiveNumber(input) {
    if (input == null || input === '') return null;
    if (
      typeof window !== 'undefined' &&
      typeof window.parseNumericQuantityValue === 'function'
    ) {
      const v = window.parseNumericQuantityValue(input);
      if (Number.isFinite(v) && v > 0) return v;
      return null;
    }
    const n = Number(input);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * Format a snapped scalar on a catalog step grid (denominator 1|2|3|4|8|12).
   * Uses favoriteEatsUnitQuantityFormat when present; otherwise fraction display.
   * @param {number} amount
   * @param {number} stepDenom
   * @returns {string}
   */
  function formatScalarForStep(amount, stepDenom) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return '';
    const gridD = gridDenominatorForStepSelect(stepDenom);
    const fmt =
      typeof window !== 'undefined' ? window.favoriteEatsUnitQuantityFormat : null;
    if (fmt && typeof fmt.formatQuantityOnGridGlyphs === 'function') {
      const g = fmt.formatQuantityOnGridGlyphs(n, gridD);
      if (g) return g;
    }
    if (
      typeof window !== 'undefined' &&
      typeof window.decimalToFractionDisplay === 'function'
    ) {
      const s = window.decimalToFractionDisplay(n);
      if (s) return String(s).trim();
    }
    return String(Number(n.toFixed(3)));
  }

  /**
   * Format a positive scalar for UI without a catalog step (kitchen-style fractions).
   * @param {number} amount
   * @returns {string}
   */
  function formatScalar(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (
      typeof window !== 'undefined' &&
      typeof window.decimalToFractionDisplay === 'function'
    ) {
      const s = window.decimalToFractionDisplay(n);
      if (s) return String(s).trim();
    }
    return String(Number(n.toFixed(4)));
  }

  window.favoriteEatsAmountKit = {
    parseToPositiveNumber,
    formatScalarForStep,
    formatScalar,
    gridDenominatorForStepSelect,
  };
})();
