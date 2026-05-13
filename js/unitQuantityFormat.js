/**
 * Display-only quantity rounding for units (kitchen-style fraction glyphs).
 * Used by the unit editor preview; does not persist amounts.
 */
(function () {
  function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  }

  const UNICODE_FRACTIONS = new Map([
    ['1/2', '\u00bd'],
    ['1/3', '\u2153'],
    ['2/3', '\u2154'],
    ['1/4', '\u00bc'],
    ['3/4', '\u00be'],
    ['1/5', '\u2155'],
    ['2/5', '\u2156'],
    ['3/5', '\u2157'],
    ['4/5', '\u2158'],
    ['1/6', '\u2159'],
    ['5/6', '\u215a'],
    ['1/8', '\u215b'],
    ['3/8', '\u215c'],
    ['5/8', '\u215d'],
    ['7/8', '\u215e'],
  ]);

  /**
   * @param {number} value
   * @param {number} stepDenominator 1=whole, 2..8 as 1/n step
   * @param {'nearest'|'up'|'down'} roundingMode
   */
  function roundQuantityWithGrid(value, stepDenominator, roundingMode) {
    const v = Number(value);
    const d = Number(stepDenominator);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d <= 0) return v;
    const scaled = v * d;
    const eps = 1e-9;
    let k;
    if (roundingMode === 'up') k = Math.ceil(scaled - eps);
    else if (roundingMode === 'down') k = Math.floor(scaled + eps);
    else k = Math.round(scaled);
    const minStep = 1 / d;
    let r = k / d;
    // Positive amounts never round/display to zero; values below one grid step use the minimum step.
    if (v > 0 && k <= 0) r = minStep;
    return r;
  }

  function roundWithPreset(value, preset, stepDenominator, roundingMode) {
    const v = Number(value);
    if (!Number.isFinite(v)) return v;
    if (preset === 'nearest_eighth') {
      return roundQuantityWithGrid(v, 8, 'nearest');
    }
    return roundQuantityWithGrid(v, stepDenominator, roundingMode);
  }

  /**
   * Format a value known to lie on grid `gridDenominator` (e.g. 8 for eighths).
   */
  function formatQuantityOnGridGlyphs(value, gridDenominator) {
    const d = Number(gridDenominator);
    const v = Number(value);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d <= 0) return '';
    if (v === 0) return '0';
    if (v < 0) return '-' + formatQuantityOnGridGlyphs(-v, gridDenominator);

    const sign = '';
    const abs = Math.abs(v);
    const k = Math.round(abs * d);
    let rem = k % d;
    let whole = (k - rem) / d;
    if (rem === 0) return `${sign}${whole}`;

    const g = gcd(rem, d);
    const rn = rem / g;
    const rd = d / g;
    const key = `${rn}/${rd}`;
    const glyph = UNICODE_FRACTIONS.get(key);
    if (whole === 0) return sign + (glyph || `${rn}/${rd}`);
    return sign + `${whole}${glyph || ` ${rn}/${rd}`}`;
  }

  /** @param {number} stepDenominator 1=whole, 2..8 as 1/n step */
  function divisibilityMinFractionLabel(stepDenominator) {
    const d = Number(stepDenominator);
    if (!Number.isFinite(d) || d <= 0) return '1/8';
    if (d === 1) return '1';
    return `1/${d}`;
  }

  window.favoriteEatsUnitQuantityFormat = {
    roundQuantityWithGrid,
    roundWithPreset,
    formatQuantityOnGridGlyphs,
    divisibilityMinFractionLabel,
    UNICODE_FRACTIONS,
  };
})();
