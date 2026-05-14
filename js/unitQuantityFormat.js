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

  /** Fractional part of the cooking "¼ ∪ ⅓" fine grid (matches quantityDisplayPolicy). */
  const KITCHEN_FINE_FRACS = Object.freeze([
    0,
    0.25,
    1 / 3,
    0.5,
    2 / 3,
    0.75,
  ]);
  const KITCHEN_GRID_EPS = 1e-9;

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
    if (preset === 'nearest_quarter') {
      return roundQuantityWithGrid(v, 4, 'nearest');
    }
    if (preset === 'nearest_half') {
      return roundQuantityWithGrid(v, 2, 'nearest');
    }
    if (preset === 'nearest_whole') {
      return roundQuantityWithGrid(v, 1, 'nearest');
    }
    return roundQuantityWithGrid(v, stepDenominator, roundingMode);
  }

  function fineFracToUnicodeKey(f) {
    const x = Number(f);
    if (!Number.isFinite(x)) return null;
    if (x < KITCHEN_GRID_EPS) return null;
    if (Math.abs(x - 0.25) < 1e-9) return '1/4';
    if (Math.abs(x - 1 / 3) < 1e-9) return '1/3';
    if (Math.abs(x - 0.5) < 1e-9) return '1/2';
    if (Math.abs(x - 2 / 3) < 1e-9) return '2/3';
    if (Math.abs(x - 0.75) < 1e-9) return '3/4';
    return null;
  }

  /**
   * Nearest point on the fine {whole + {0,¼,⅓,½,⅔,¾}} grid (same tie-break as policy).
   * @returns {object|null} with `n`, `f`, `value` when snapped
   */
  function snapToFineKitchenUnionGrid(W) {
    const x = Number(W);
    if (!Number.isFinite(x) || x <= 0) return null;
    let bestCand = null;
    let bestErr = Infinity;
    let bestN = 0;
    let bestF = 0;
    const maxN = Math.ceil(x) + 4;
    for (let n = 0; n <= maxN; n += 1) {
      for (let fi = 0; fi < KITCHEN_FINE_FRACS.length; fi += 1) {
        const f = KITCHEN_FINE_FRACS[fi];
        const cand = n + f;
        if (cand < KITCHEN_GRID_EPS) continue;
        const err = Math.abs(cand - x);
        if (
          bestCand == null ||
          err < bestErr - 1e-12 ||
          (Math.abs(err - bestErr) <= 1e-12 && cand < bestCand)
        ) {
          bestCand = cand;
          bestErr = err;
          bestN = n;
          bestF = f;
        }
      }
    }
    return bestCand == null ? null : { n: bestN, f: bestF, value: bestCand };
  }

  /**
   * Format for gridDenominator 12: never show twelfths — snap to ¼∪⅓ fine grid, then glyphs.
   */
  function formatQuantityOnKitchenUnionGridGlyphs(abs) {
    const snapped = snapToFineKitchenUnionGrid(abs);
    if (snapped == null) return '';
    const whole = snapped.n;
    const frac = snapped.f;
    if (frac < KITCHEN_GRID_EPS) {
      return `${whole}`;
    }
    const key = fineFracToUnicodeKey(frac);
    const glyph = key ? UNICODE_FRACTIONS.get(key) : null;
    const fracOut = glyph || key || '';
    if (!fracOut) return `${whole}`;
    if (whole === 0) return fracOut;
    return glyph ? `${whole}${glyph}` : `${whole} ${fracOut}`;
  }

  /**
   * Format a value on `gridDenominator` (e.g. 8 for eighths).
   * For 12 ("¼ & ⅓"), uses the fine kitchen union — never shows slash fractions with denominator 12.
   */
  function formatQuantityOnGridGlyphs(value, gridDenominator) {
    const d = Number(gridDenominator);
    const v = Number(value);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d <= 0) return '';
    if (v === 0) return '0';
    if (v < 0) return '-' + formatQuantityOnGridGlyphs(-v, gridDenominator);

    const sign = '';
    const abs = Math.abs(v);
    if (d === 12) {
      return sign + formatQuantityOnKitchenUnionGridGlyphs(abs);
    }

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

  /** @param {number} stepDenominator 1=whole, 2..8 as 1/n step; 12 = kitchen union (no 1/12 label) */
  function divisibilityMinFractionLabel(stepDenominator) {
    const d = Number(stepDenominator);
    if (!Number.isFinite(d) || d <= 0) return '1/8';
    if (d === 1) return '1';
    if (d === 12) return '¼ & ⅓';
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
