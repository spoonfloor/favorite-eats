/**
 * Unified US volume snap ladder (cooking = nearest, ties ceil; shopping = ceil).
 * Rungs are built from rational factors; snap compares integer units (1/24 tsp).
 * Table through 1 gal; above 1 gal snaps to ½-gallon steps.
 */
(function () {
  const ML_PER_TSP = 4.92892159375;
  const ML_PER_TBSP = ML_PER_TSP * 3;
  const ML_PER_CUP = ML_PER_TBSP * 16;
  const ML_PER_GAL = ML_PER_CUP * 16;
  const UNIT = ML_PER_TSP / 24;
  const BOUND_EPS = 1e-9;
  const ML_EIGHTH_TSP = ML_PER_TSP / 8;

  /** @typedef {{ kind: 'simple', quantity: number, unit: string }} SimpleSnap */
  /** @typedef {{ kind: 'compound', displayLabel: string, quantity: number, unit: string }} CompoundSnap */

  function snapSimple(quantity, unit) {
    return { kind: 'simple', quantity, unit };
  }

  function snapCompound(displayLabel, quantity, unit) {
    return { kind: 'compound', displayLabel, quantity, unit };
  }

  function tokenToMl(token) {
    if (!token) return null;
    const q = Number(token.quantity);
    if (!Number.isFinite(q)) return null;
    const u = String(token.unit || '').trim();
    if (u === 'tsp') return q * ML_PER_TSP;
    if (u === 'tbsp') return q * ML_PER_TBSP;
    if (u === 'cup') return q * ML_PER_CUP;
    if (u === 'gal') return q * ML_PER_GAL;
    return null;
  }

  function toUnits(ml) {
    return Math.round(ml / UNIT);
  }

  function formatTspAmount(tsp) {
    const whole = Math.floor(tsp + BOUND_EPS);
    const frac = tsp - whole;
    const fracGlyph =
      Math.abs(frac - 0.25) < BOUND_EPS
        ? '¼'
        : Math.abs(frac - 0.5) < BOUND_EPS
          ? '½'
          : Math.abs(frac - 0.75) < BOUND_EPS
            ? '¾'
            : '';
    if (whole === 0 && fracGlyph) return fracGlyph;
    if (!fracGlyph) return String(whole);
    return `${whole} ${fracGlyph}`.trim();
  }

  function compoundTbspTsp(nTbsp, addTsp) {
    const totalTsp = nTbsp * 3 + addTsp;
    const label = `${nTbsp} tbsp + ${formatTspAmount(addTsp)} tsp`;
    return snapCompound(label, totalTsp, 'tsp');
  }

  function appendRow(rows, token) {
    const ml = tokenToMl(token);
    if (ml == null || !Number.isFinite(ml)) return;
    const units = toUnits(ml);
    const last = rows[rows.length - 1];
    if (!last || units > last.units) {
      rows.push({ units, token });
    }
  }

  function buildVolumeLadderRows() {
    const rows = [];

    const preTbspTsp = [0.125, 0.25, 0.5, 0.75, 1, 1.25];
    for (let i = 0; i < preTbspTsp.length; i += 1) {
      appendRow(rows, snapSimple(preTbspTsp[i], 'tsp'));
    }
    appendRow(rows, snapSimple(0.5, 'tbsp'));
    const preTbspTail = [1.75, 2, 2.25, 2.5, 2.75];
    for (let i = 0; i < preTbspTail.length; i += 1) {
      appendRow(rows, snapSimple(preTbspTail[i], 'tsp'));
    }

    const tbspPlusFracs = [0.25, 0.5, 0.75, 1, 1.25];
    const tbspPlusAfterHalf = [1.75, 2, 2.25, 2.5, 2.75];
    for (let n = 1; n <= 3; n += 1) {
      appendRow(rows, snapSimple(n, 'tbsp'));
      for (let fi = 0; fi < tbspPlusFracs.length; fi += 1) {
        appendRow(rows, compoundTbspTsp(n, tbspPlusFracs[fi]));
      }
      appendRow(rows, snapSimple(n + 0.5, 'tbsp'));
      for (let fi = 0; fi < tbspPlusAfterHalf.length; fi += 1) {
        appendRow(rows, compoundTbspTsp(n, tbspPlusAfterHalf[fi]));
      }
    }

    const cupLeadFracs = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
    for (let fi = 0; fi < cupLeadFracs.length; fi += 1) {
      appendRow(rows, snapSimple(cupLeadFracs[fi], 'cup'));
    }
    appendRow(rows, snapSimple(1, 'cup'));
    for (let fi = 0; fi < cupLeadFracs.length; fi += 1) {
      appendRow(rows, snapSimple(1 + cupLeadFracs[fi], 'cup'));
    }

    const twoCupFracs = [2, 2.25, 2.5, 2.75];
    for (let i = 0; i < twoCupFracs.length; i += 1) {
      appendRow(rows, snapSimple(twoCupFracs[i], 'cup'));
    }

    for (let n = 3; n <= 8; n += 1) {
      appendRow(rows, snapSimple(n, 'cup'));
      appendRow(rows, snapSimple(n + 0.5, 'cup'));
    }
    for (let n = 9; n <= 15; n += 1) {
      appendRow(rows, snapSimple(n, 'cup'));
    }
    appendRow(rows, snapSimple(1, 'gal'));

    return rows;
  }

  const VOLUME_LADDER_TABLE = buildVolumeLadderRows();
  const VOLUME_LADDER_MIN_UNITS = VOLUME_LADDER_TABLE[0].units;
  const VOLUME_LADDER_GAL_UNITS = VOLUME_LADDER_TABLE[VOLUME_LADDER_TABLE.length - 1].units;
  const VOLUME_LADDER_HALF_GAL_UNITS = VOLUME_LADDER_GAL_UNITS / 2;

  function lowerBound(arr, x) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].units < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function snapHalfGalQuantity(halfGalMultiples, isShopping) {
    const x = Number(halfGalMultiples);
    if (!Number.isFinite(x) || x <= 0) return snapSimple(0.5, 'gal');
    if (isShopping) {
      const snapped = Math.ceil(x - BOUND_EPS);
      const whole = Math.floor(snapped / 2);
      return snapSimple(whole + (snapped % 2 === 1 ? 0.5 : 0), 'gal');
    }
    const fl = Math.floor(x);
    const ce = Math.ceil(x);
    let snapped;
    if (x - fl < ce - x - BOUND_EPS) snapped = fl;
    else if (ce - x < x - fl - BOUND_EPS) snapped = ce;
    else snapped = ce;
    const whole = Math.floor(snapped / 2);
    return snapSimple(whole + (snapped % 2 === 1 ? 0.5 : 0), 'gal');
  }

  function snapTokenFromMlValue(ml, intent) {
    const isShopping = String(intent || 'cooking').toLowerCase() === 'shopping';
    if (ml < ML_EIGHTH_TSP - BOUND_EPS) {
      return VOLUME_LADDER_TABLE[0].token;
    }

    const v = toUnits(ml);

    if (v > VOLUME_LADDER_GAL_UNITS) {
      const halfGalMultiples = v / VOLUME_LADDER_HALF_GAL_UNITS;
      return snapHalfGalQuantity(halfGalMultiples, isShopping);
    }

    if (v <= VOLUME_LADDER_MIN_UNITS) {
      return VOLUME_LADDER_TABLE[0].token;
    }

    const idx = lowerBound(VOLUME_LADDER_TABLE, v);
    if (isShopping) {
      return VOLUME_LADDER_TABLE[idx].token;
    }

    const prev = VOLUME_LADDER_TABLE[idx - 1];
    const next = VOLUME_LADDER_TABLE[idx];
    if (!prev) return next.token;
    if (!next) return prev.token;
    const dPrev = Math.abs(v - prev.units);
    const dNext = Math.abs(v - next.units);
    if (dNext < dPrev - BOUND_EPS) return next.token;
    if (dPrev < dNext - BOUND_EPS) return prev.token;
    return next.token;
  }

  function normalizeIntent(intent) {
    const mode = String(intent || 'cooking').toLowerCase();
    return mode === 'shopping' ? 'shopping' : 'cooking';
  }

  function snapTokenFromMl(ml, sourceUnit, intent) {
    void sourceUnit;
    const x = Number(ml);
    if (!Number.isFinite(x) || x <= 0) return null;
    return snapTokenFromMlValue(x, normalizeIntent(intent));
  }

  function tokenToMeasuredDisplay(token) {
    if (!token) return null;
    if (token.kind === 'compound') {
      return {
        family: 'volume',
        quantity: Number(token.quantity.toFixed(6)),
        unit: token.unit,
        displayLabel: token.displayLabel,
      };
    }
    return {
      family: 'volume',
      quantity: Number(token.quantity.toFixed(6)),
      unit: token.unit,
    };
  }

  function getMeasuredDisplayFromMl(ml, sourceUnit, intent) {
    return tokenToMeasuredDisplay(snapTokenFromMl(ml, sourceUnit, intent));
  }

  window.favoriteEatsCookingVolumeLadder = {
    getMeasuredDisplayFromMl,
    snapTokenFromMl,
    tokenToMeasuredDisplay,
  };
})();
