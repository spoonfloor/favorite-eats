/**
 * ARCHIVED — unhooked. Not loaded by any HTML page.
 * Former cooking-volume ladder (pre interval-table cutover).
 * @see js/cookingVolumeLadder.js
 */
(function () {
  const MEASURED_DISPLAY_LADDER_EPS = 1e-9;
  const MEASURED_BASE_CONVERSION_SLACK = 1e-6;
  const MEASURED_UNIT_FACTORS = Object.freeze({
    tsp: 4.92892159375,
    tbsp: 14.78676478125,
    cup: 236.5882365,
    gal: 3785.411784,
  });
  const MEASURED_FINE_LB_FRACS = Object.freeze([
    0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75,
  ]);
  const MEASURED_COARSE_CUP_FRACS = Object.freeze([0, 1 / 3, 0.5, 2 / 3]);

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

  function measuredVolumeDisplayCookingLegacy(ml) {
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

    if (b <= 2 + MEASURED_BASE_CONVERSION_SLACK / tbspFactor) {
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

  window.favoriteEatsCookingVolumeLadderLegacy = {
    measuredVolumeDisplayCookingLegacy,
  };
})();
