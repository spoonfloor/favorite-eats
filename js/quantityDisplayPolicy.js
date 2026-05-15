/**
 * Measured mass/volume display ladders (shopping vs cooking) and helpers
 * for unit-editor scalar snapping / previews. Loaded before main.js.
 */
(function () {
  const MEASURED_DISPLAY_LADDER_EPS = 1e-9;
  const MEASURED_LB_SHOPPING_CEIL_SLACK = 1e-7;
  const MEASURED_UNIT_FACTORS = Object.freeze({
    tsp: 4.92892159375,
    tbsp: 14.78676478125,
    cup: 236.5882365,
    gal: 3785.411784,
    lb: 453.59237,
  });
  const MEASURED_LB_PER_GRAM = 1 / MEASURED_UNIT_FACTORS.lb;
  const MEASURED_FINE_LB_FRACS = Object.freeze([
    0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75,
  ]);
  const MEASURED_COARSE_CUP_FRACS = Object.freeze([0, 1 / 3, 0.5, 2 / 3]);

  /** Same factors as shopping-list helpers in main.js (US cup, mass oz, etc.). */
  const MEASURED_INGREDIENT_UNIT_META = Object.freeze({
    tsp: Object.freeze({ family: 'volume', factorToMl: 4.92892159375 }),
    tbsp: Object.freeze({ family: 'volume', factorToMl: 14.78676478125 }),
    cup: Object.freeze({ family: 'volume', factorToMl: 236.5882365 }),
    'fl oz': Object.freeze({ family: 'volume', factorToMl: 29.5735295625 }),
    pt: Object.freeze({ family: 'volume', factorToMl: 473.176473 }),
    qt: Object.freeze({ family: 'volume', factorToMl: 946.352946 }),
    gal: Object.freeze({ family: 'volume', factorToMl: 3785.411784 }),
    ml: Object.freeze({ family: 'volume', factorToMl: 1 }),
    l: Object.freeze({ family: 'volume', factorToMl: 1000 }),
    g: Object.freeze({ family: 'mass', factorToG: 1 }),
    kg: Object.freeze({ family: 'mass', factorToG: 1000 }),
    oz: Object.freeze({ family: 'mass', factorToG: 28.349523125 }),
    lb: Object.freeze({ family: 'mass', factorToG: 453.59237 }),
  });

  const MEASURED_INGREDIENT_UNIT_ALIASES = Object.freeze({
    t: 'tsp',
    tsp: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    tb: 'tbsp',
    tbl: 'tbsp',
    tbspn: 'tbsp',
    tbs: 'tbsp',
    tbsp: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    c: 'cup',
    cup: 'cup',
    cups: 'cup',
    floz: 'fl oz',
    'fl oz': 'fl oz',
    'fluid ounce': 'fl oz',
    'fluid ounces': 'fl oz',
    fluidounce: 'fl oz',
    fluidounces: 'fl oz',
    pt: 'pt',
    pint: 'pt',
    pints: 'pt',
    qt: 'qt',
    quart: 'qt',
    quarts: 'qt',
    gal: 'gal',
    gallon: 'gal',
    gallons: 'gal',
    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    l: 'l',
    liter: 'l',
    liters: 'l',
    g: 'g',
    gram: 'g',
    grams: 'g',
    kg: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    oz: 'oz',
    ounce: 'oz',
    ounces: 'oz',
    lb: 'lb',
    lbs: 'lb',
    pound: 'lb',
    pounds: 'lb',
  });

  function normalizeMeasuredIngredientUnit(unitText) {
    const raw = String(unitText || '')
      .trim()
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s+/g, ' ');
    if (!raw) return '';
    if (Object.prototype.hasOwnProperty.call(MEASURED_INGREDIENT_UNIT_ALIASES, raw)) {
      return MEASURED_INGREDIENT_UNIT_ALIASES[raw];
    }
    if (raw.endsWith('ies') && raw.length > 3) return `${raw.slice(0, -3)}y`;
    if (/(ches|shes|xes|zes|ses)$/.test(raw)) return raw.slice(0, -2);
    if (raw.endsWith('s') && !raw.endsWith('ss')) return raw.slice(0, -1);
    return raw;
  }

  /**
   * @returns {{ family: 'mass'|'volume', baseQuantity: number, canonicalUnit: string }|null}
   *   mass → grams, volume → ml
   */
  function convertIngredientQuantityToMeasuredBase(quantity, unitText) {
    const numeric = Number(quantity);
    const canonical = normalizeMeasuredIngredientUnit(unitText);
    if (!canonical || !Number.isFinite(numeric) || numeric <= 0) return null;
    const meta = MEASURED_INGREDIENT_UNIT_META[canonical];
    if (!meta) return null;
    if (meta.family === 'mass') {
      return {
        family: 'mass',
        baseQuantity: Number((numeric * meta.factorToG).toFixed(6)),
        canonicalUnit: canonical,
      };
    }
    return {
      family: 'volume',
      baseQuantity: Number((numeric * meta.factorToMl).toFixed(6)),
      canonicalUnit: canonical,
    };
  }

  function measuredDisplayCeilStep(value, step) {
    const v = Number(value);
    const s = Number(step);
    if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return null;
    return Math.ceil(v / s - MEASURED_DISPLAY_LADDER_EPS) * s;
  }

  function measuredDisplayRoundStep(value, step) {
    const v = Number(value);
    const s = Number(step);
    if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return null;
    return Math.round(v / s) * s;
  }

  function measuredDisplayNormalizeOut(family, quantity, unit) {
    if (!Number.isFinite(quantity) || quantity <= 0 || !unit) return null;
    return {
      family,
      quantity: Number(quantity.toFixed(6)),
      unit,
    };
  }

  function measuredFineLbShoppingCeil(W) {
    let best = Infinity;
    for (let n = 1; n <= 4; n += 1) {
      for (let fi = 0; fi < MEASURED_FINE_LB_FRACS.length; fi += 1) {
        const f = MEASURED_FINE_LB_FRACS[fi];
        const v = n + f;
        if (v < 1 - MEASURED_DISPLAY_LADDER_EPS) continue;
        if (v > 4 + MEASURED_DISPLAY_LADDER_EPS) continue;
        if (v >= W - MEASURED_LB_SHOPPING_CEIL_SLACK && v < best) best = v;
      }
    }
    return Number.isFinite(best) && best < Infinity ? best : null;
  }

  function measuredFineLbCookingNearest(W) {
    let best = null;
    let bestErr = Infinity;
    for (let n = 0; n <= 12; n += 1) {
      for (let fi = 0; fi < MEASURED_FINE_LB_FRACS.length; fi += 1) {
        const f = MEASURED_FINE_LB_FRACS[fi];
        const v = n + f;
        if (v < 1 - MEASURED_DISPLAY_LADDER_EPS) continue;
        if (v > 10 + MEASURED_DISPLAY_LADDER_EPS) continue;
        const err = Math.abs(v - W);
        if (
          best == null ||
          err < bestErr - 1e-12 ||
          (Math.abs(err - bestErr) <= 1e-12 && v < best)
        ) {
          best = v;
          bestErr = err;
        }
      }
    }
    return best;
  }

  function measuredMassDisplayShopping(grams) {
    const W = grams * MEASURED_LB_PER_GRAM;
    if (!Number.isFinite(W) || W <= 0) return null;
    if (W < 1 - MEASURED_DISPLAY_LADDER_EPS) {
      const oz = measuredDisplayCeilStep(W * 16, 1);
      return measuredDisplayNormalizeOut('mass', oz, 'oz');
    }
    if (W <= 4 + MEASURED_DISPLAY_LADDER_EPS) {
      const lb = measuredFineLbShoppingCeil(W);
      if (lb == null) return null;
      return measuredDisplayNormalizeOut('mass', lb, 'lb');
    }
    const lb = measuredDisplayCeilStep(W, 0.5);
    return measuredDisplayNormalizeOut('mass', lb, 'lb');
  }

  function measuredMassDisplayCooking(grams) {
    const W = grams * MEASURED_LB_PER_GRAM;
    if (!Number.isFinite(W) || W <= 0) return null;
    if (W < 1 - MEASURED_DISPLAY_LADDER_EPS) {
      const oz = measuredDisplayRoundStep(W * 16, 1);
      const ozClamped = !Number.isFinite(oz) || oz <= 0 ? 1 : oz;
      return measuredDisplayNormalizeOut('mass', ozClamped, 'oz');
    }
    if (W <= 10 + MEASURED_DISPLAY_LADDER_EPS) {
      const lb = measuredFineLbCookingNearest(W);
      if (lb == null) return null;
      return measuredDisplayNormalizeOut('mass', lb, 'lb');
    }
    const lb = measuredDisplayRoundStep(W, 0.5);
    return measuredDisplayNormalizeOut('mass', lb, 'lb');
  }

  function measuredVolumeDisplayShopping(ml) {
    const numeric = Number(ml);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const family = 'volume';
    const tspFactor = MEASURED_UNIT_FACTORS.tsp;
    const tbspFactor = MEASURED_UNIT_FACTORS.tbsp;
    const cupFactor = MEASURED_UNIT_FACTORS.cup;
    const galFactor = MEASURED_UNIT_FACTORS.gal;
    const EPSILON = 1e-12;
    const cups = numeric / cupFactor;
    const gallons = numeric / galFactor;

    if (numeric <= 2 * tspFactor + EPSILON) {
      return measuredDisplayNormalizeOut(
        family,
        measuredDisplayCeilStep(numeric / tspFactor, 0.5),
        'tsp',
      );
    }

    if (numeric <= 2 * tbspFactor + EPSILON) {
      return measuredDisplayNormalizeOut(
        family,
        measuredDisplayCeilStep(numeric / tbspFactor, 1),
        'tbsp',
      );
    }

    if (cups <= 2.5 + EPSILON) {
      const cupSteps = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5];
      for (let si = 0; si < cupSteps.length; si += 1) {
        const step = cupSteps[si];
        if (cups <= step + EPSILON) {
          return measuredDisplayNormalizeOut(family, step, 'cup');
        }
      }
    }

    // Fixed ladder ends at 2½ cups (above). Beyond that: ceil to ½ cup until 16 cups,
    // then gallons with ½-gallon ceil (16 US cups = 1 gal per stored factors).
    if (numeric + EPSILON < galFactor) {
      return measuredDisplayNormalizeOut(
        family,
        measuredDisplayCeilStep(cups, 0.5),
        'cup',
      );
    }

    return measuredDisplayNormalizeOut(
      family,
      measuredDisplayCeilStep(gallons, 0.5),
      'gal',
    );
  }

  function measuredNearestMixedCup(cups, fracs, minN, maxN) {
    let best = null;
    let bestErr = Infinity;
    for (let n = minN; n <= maxN; n += 1) {
      for (let fi = 0; fi < fracs.length; fi += 1) {
        const f = fracs[fi];
        const v = n + f;
        if (v < MEASURED_DISPLAY_LADDER_EPS) continue;
        const err = Math.abs(v - cups);
        if (
          best == null ||
          err < bestErr - 1e-12 ||
          (Math.abs(err - bestErr) <= 1e-12 && v < best)
        ) {
          best = v;
          bestErr = err;
        }
      }
    }
    return best;
  }

  function measuredVolumeDisplayCooking(ml) {
    const numeric = Number(ml);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const family = 'volume';
    const tspFactor = MEASURED_UNIT_FACTORS.tsp;
    const tbspFactor = MEASURED_UNIT_FACTORS.tbsp;
    const cupFactor = MEASURED_UNIT_FACTORS.cup;
    const t = numeric / tspFactor;
    const b = numeric / tbspFactor;
    const c = numeric / cupFactor;

    if (t <= 1 + MEASURED_DISPLAY_LADDER_EPS) {
      const tspQty = measuredDisplayRoundStep(t, 1 / 8);
      const q = !Number.isFinite(tspQty) || tspQty <= 0 ? 1 / 8 : tspQty;
      return measuredDisplayNormalizeOut(family, q, 'tsp');
    }

    if (b <= 2 + MEASURED_DISPLAY_LADDER_EPS) {
      const tbspQty = measuredDisplayRoundStep(b, 0.5);
      const q = !Number.isFinite(tbspQty) || tbspQty <= 0 ? 0.5 : tbspQty;
      return measuredDisplayNormalizeOut(family, q, 'tbsp');
    }

    if (c <= 8 + MEASURED_DISPLAY_LADDER_EPS) {
      const cupQty = measuredNearestMixedCup(
        c,
        MEASURED_FINE_LB_FRACS,
        0,
        Math.ceil(c) + 2,
      );
      if (cupQty == null) return null;
      return measuredDisplayNormalizeOut(family, cupQty, 'cup');
    }

    const cupQty = measuredNearestMixedCup(
      c,
      MEASURED_COARSE_CUP_FRACS,
      0,
      Math.ceil(c) + 2,
    );
    if (cupQty == null) return null;
    return measuredDisplayNormalizeOut(family, cupQty, 'cup');
  }

  function getMeasuredDisplayFromBase(family, baseQuantity, intent = 'cooking') {
    const numeric = Number(baseQuantity);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const mode = String(intent || 'cooking').toLowerCase();
    const isShopping = mode === 'shopping';
    if (family === 'mass') {
      return isShopping
        ? measuredMassDisplayShopping(numeric)
        : measuredMassDisplayCooking(numeric);
    }
    if (family === 'volume') {
      return isShopping
        ? measuredVolumeDisplayShopping(numeric)
        : measuredVolumeDisplayCooking(numeric);
    }
    return null;
  }

  function getShoppingListMeasuredDisplayFromBase(family, baseQuantity) {
    return getMeasuredDisplayFromBase(family, baseQuantity, 'shopping');
  }

  function nearestOnFineQ3Scalar(x) {
    const W = Number(x);
    if (!Number.isFinite(W) || W <= 0) return null;
    let best = null;
    let bestErr = Infinity;
    const maxN = Math.ceil(W) + 4;
    for (let n = 0; n <= maxN; n += 1) {
      for (let fi = 0; fi < MEASURED_FINE_LB_FRACS.length; fi += 1) {
        const f = MEASURED_FINE_LB_FRACS[fi];
        const v = n + f;
        if (v < MEASURED_DISPLAY_LADDER_EPS) continue;
        const err = Math.abs(v - W);
        if (
          best == null ||
          err < bestErr - 1e-12 ||
          (Math.abs(err - bestErr) <= 1e-12 && v < best)
        ) {
          best = v;
          bestErr = err;
        }
      }
    }
    return best;
  }

  /**
   * Cooking display snap for count-like / generic scalar amounts (not mass/volume ladders).
   * @param {number} amount
   * @param {number} stepDenominator 1 | 2 | 3 | 4 | 8 | 12 (12 = ¼∪⅓ grid)
   */
  function snapScalarCookingNearest(amount, stepDenominator) {
    const n = Number(amount);
    const d = Number(stepDenominator);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (d === 12) return nearestOnFineQ3Scalar(n);
    if (![1, 2, 3, 4, 8].includes(d)) return null;
    const fmt = window.favoriteEatsUnitQuantityFormat;
    if (fmt && typeof fmt.roundQuantityWithGrid === 'function') {
      return fmt.roundQuantityWithGrid(n, d, 'nearest');
    }
    return measuredDisplayRoundStep(n, 1 / d);
  }

  function fineQ3GridShoppingCeil(W) {
    let best = Infinity;
    const maxN = Math.ceil(W) + 6;
    for (let n = 0; n <= maxN; n += 1) {
      for (let fi = 0; fi < MEASURED_FINE_LB_FRACS.length; fi += 1) {
        const f = MEASURED_FINE_LB_FRACS[fi];
        const v = n + f;
        if (v < MEASURED_DISPLAY_LADDER_EPS) continue;
        if (v + MEASURED_DISPLAY_LADDER_EPS >= W && v < best) best = v;
      }
    }
    return Number.isFinite(best) && best < Infinity ? best : null;
  }

  /**
   * Shopping display snap (ceil on step grid) for count-like scalars.
   * @param {number} amount
   * @param {number} stepDenominator 1 | 2 | 3 | 4 | 8 | 12
   */
  function snapScalarShoppingCeil(amount, stepDenominator) {
    const n = Number(amount);
    const d = Number(stepDenominator);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (d === 12) {
      const v = fineQ3GridShoppingCeil(n);
      return v;
    }
    if (![1, 2, 3, 4, 8].includes(d)) return null;
    const step = 1 / d;
    const out = measuredDisplayCeilStep(n, step);
    if (out == null || !Number.isFinite(out) || out <= 0) return step;
    return out;
  }

  function gridDenominatorForStepSelect(stepDenom) {
    const d = Number(stepDenom);
    if (d === 12) return 12;
    if ([1, 2, 3, 4, 8].includes(d)) return d;
    return 8;
  }

  function formatGlyphForAmount(amount, stepDenom) {
    const fmt = window.favoriteEatsUnitQuantityFormat;
    const gridD = gridDenominatorForStepSelect(stepDenom);
    if (fmt && typeof fmt.formatQuantityOnGridGlyphs === 'function') {
      const g = fmt.formatQuantityOnGridGlyphs(Number(amount), gridD);
      return g || String(Number(amount.toFixed(3)));
    }
    return String(Number(amount.toFixed(3)));
  }

  /**
   * Preview addends use 1×, 7×, 13× the step atom (e.g. step 8 → ⅛ + …).
   * Step 12 ("¼ & ⅓") uses ¼-sized addends so every term sits on the fine union grid
   * (never twelfth-based copy).
   * @param {object} opts
   * @param {number} opts.stepDenominator 1 | 2 | 3 | 4 | 8 | 12
   * @param {string} opts.singular
   * @param {string} opts.plural
   */
  function buildUnitEditorExampleTotals(opts) {
    const stepDenom = Number(opts?.stepDenominator) || 8;
    const singular = String(opts?.singular || 'unit').trim() || 'unit';
    const plural = String(opts?.plural || singular).trim() || singular;
    const coeffs = [1, 7, 13];
    const d = [1, 2, 3, 4, 8, 12].includes(stepDenom) ? stepDenom : 8;
    const baseUnit = stepDenom === 12 ? 0.25 : 1 / d;
    if (!Number.isFinite(baseUnit) || baseUnit <= 0) {
      return { lines: [], sum: 0, sumGlyph: '', error: 'bad step' };
    }
    const parts = coeffs.map((c) => c * baseUnit);
    const sum = parts.reduce((a, b) => a + b, 0);
    const snapped = snapScalarCookingNearest(sum, stepDenom);
    const sumGlyph =
      snapped != null && Number.isFinite(snapped)
        ? formatGlyphForAmount(snapped, stepDenom)
        : '—';
    const lines = coeffs.map((c, i) => {
      const amt = parts[i];
      const label = c === 1 ? singular : plural;
      const glyph = formatGlyphForAmount(amt, stepDenom);
      return `${glyph} ${label}`;
    });
    const joined = lines.join(' + ');
    return {
      lines,
      joined,
      sum,
      sumGlyph,
      summary: `${joined} → ${sumGlyph} ${plural}`,
    };
  }

  window.favoriteEatsQuantityDisplayPolicy = {
    getMeasuredDisplayFromBase,
    getShoppingListMeasuredDisplayFromBase,
    snapScalarCookingNearest,
    snapScalarShoppingCeil,
    formatGlyphForAmount,
    buildUnitEditorExampleTotals,
    normalizeMeasuredIngredientUnit,
    convertIngredientQuantityToMeasuredBase,
  };
})();
