/**
 * Cooking-intent volume ladder: band tables route intervals; nearest picks the label on that stage.
 * Shopping volume ladder remains in quantityDisplayPolicy.js.
 */
(function () {
  const ML_PER_TSP = 4.92892159375;
  const ML_PER_TBSP = 14.78676478125;
  const ML_PER_CUP = 236.5882365;
  const ML_PER_GAL = 3785.411784;

  const STAGE_MAX_TSP = 6;
  const STAGE_MAX_TBSP = 16;
  const STAGE_EXACT_CUPS_FOR_GAL = 16;
  const TBSP_LADDER_HI_SLACK = 1 / 64;

  const BOUND_EPS = 1e-9;
  const ML_CLASSIFY_SLACK = 1e-6;
  const ML_EIGHTH_TSP = ML_PER_TSP / 8;

  const CUP_SNAP_FRACS = Object.freeze([0.25, 1 / 3, 0.5, 2 / 3, 0.75]);
  const TSP_SNAP_STEPS = Object.freeze([0.125, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6]);

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

  function rowMatchesMl(ml, row, mlPerUnit) {
    if (row.exact != null) {
      return Math.abs(ml - row.exact * mlPerUnit) <= ML_CLASSIFY_SLACK;
    }
    if (row.closed && row.lo != null && row.hi != null) {
      const loMl = row.lo * mlPerUnit;
      const hiMl = row.hi * mlPerUnit;
      return ml >= loMl - ML_CLASSIFY_SLACK && ml <= hiMl + ML_CLASSIFY_SLACK;
    }
    if (row.lo == null || row.hi == null) return false;
    const loMl = row.lo * mlPerUnit;
    const hiMl = row.hi * mlPerUnit;
    const loClosed = Boolean(row.loClosed);
    const hiExclusive = Boolean(row.hiExclusive);
    const aboveLo = loClosed
      ? ml >= loMl - ML_CLASSIFY_SLACK
      : ml > loMl + ML_CLASSIFY_SLACK;
    const belowHi = hiExclusive
      ? ml < hiMl - ML_CLASSIFY_SLACK
      : ml <= hiMl + ML_CLASSIFY_SLACK;
    return aboveLo && belowHi;
  }

  function rowMatchesUnit(x, row) {
    if (row.exact != null) {
      return Math.abs(x - row.exact) <= ML_CLASSIFY_SLACK;
    }
    if (row.closed && row.lo != null && row.hi != null) {
      return x >= row.lo - ML_CLASSIFY_SLACK && x <= row.hi + ML_CLASSIFY_SLACK;
    }
    if (row.lo == null || row.hi == null) return false;
    const loClosed = Boolean(row.loClosed);
    const hiExclusive = Boolean(row.hiExclusive);
    const aboveLo = loClosed ? x >= row.lo - ML_CLASSIFY_SLACK : x > row.lo + ML_CLASSIFY_SLACK;
    const belowHi = hiExclusive ? x < row.hi - ML_CLASSIFY_SLACK : x <= row.hi + ML_CLASSIFY_SLACK;
    return aboveLo && belowHi;
  }

  function findMatchingRowMl(ml, rows, mlPerUnit) {
    for (let i = 0; i < rows.length; i += 1) {
      if (rowMatchesMl(ml, rows[i], mlPerUnit)) return rows[i];
    }
    return null;
  }

  function findMatchingRowUnit(x, rows) {
    for (let i = 0; i < rows.length; i += 1) {
      if (rowMatchesUnit(x, rows[i])) return rows[i];
    }
    return null;
  }

  function uniqueTokensFromRows(rows) {
    const seen = new Set();
    const tokens = [];
    for (let i = 0; i < rows.length; i += 1) {
      const out = rows[i].out;
      if (!out) continue;
      const key =
        out.kind === 'compound'
          ? `c:${out.displayLabel}:${out.quantity}:${out.unit}`
          : `s:${out.quantity}:${out.unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(out);
    }
    return tokens;
  }

  function nearestSnapTokenMl(ml, tokens) {
    const x = Number(ml);
    if (!Number.isFinite(x) || x <= 0 || !tokens || !tokens.length) return null;
    let best = null;
    let bestErr = Infinity;
    for (let i = 0; i < tokens.length; i += 1) {
      const tml = tokenToMl(tokens[i]);
      if (tml == null || !Number.isFinite(tml)) continue;
      const err = Math.abs(x - tml);
      if (best == null || err < bestErr - BOUND_EPS) {
        best = tokens[i];
        bestErr = err;
      } else if (Math.abs(err - bestErr) <= BOUND_EPS) {
        if (best.kind === 'compound' && tokens[i].kind !== 'compound') {
          best = tokens[i];
        } else if (tokens[i].kind !== 'compound' && tml < tokenToMl(best)) {
          best = tokens[i];
        }
      }
    }
    return best;
  }

  function pushUniqueToken(bucket, seen, token) {
    const key =
      token.kind === 'compound'
        ? `c:${token.displayLabel}:${token.quantity}:${token.unit}`
        : `s:${token.quantity}:${token.unit}`;
    if (seen.has(key)) return;
    seen.add(key);
    bucket.push(token);
  }

  function allCupSnapTokens() {
    const seen = new Set();
    const tokens = [];
    const pushQ = (q) => {
      pushUniqueToken(tokens, seen, snapSimple(Number(q.toFixed(6)), 'cup'));
    };
    for (let n = 0; n <= 16; n += 1) {
      for (let fi = 0; fi < CUP_SNAP_FRACS.length; fi += 1) {
        pushQ(n + CUP_SNAP_FRACS[fi]);
      }
      if (n >= 1) pushQ(n);
    }
    return tokens;
  }

  function allTspSnapTokens() {
    const seen = new Set();
    const tokens = [];
    for (let i = 0; i < TSP_SNAP_STEPS.length; i += 1) {
      pushUniqueToken(tokens, seen, snapSimple(TSP_SNAP_STEPS[i], 'tsp'));
    }
    const rowTokens = uniqueTokensFromRows(COOKING_VOLUME_TSP_ROWS);
    for (let i = 0; i < rowTokens.length; i += 1) {
      pushUniqueToken(tokens, seen, rowTokens[i]);
    }
    return tokens;
  }

  function allTbspSnapTokens() {
    const seen = new Set();
    const tokens = [];
    for (let q = 0.5; q <= STAGE_MAX_TBSP + TBSP_LADDER_HI_SLACK + BOUND_EPS; q += 0.5) {
      pushUniqueToken(tokens, seen, snapSimple(Number(q.toFixed(6)), 'tbsp'));
    }
    for (let q = 1; q <= STAGE_MAX_TBSP + BOUND_EPS; q += 1) {
      pushUniqueToken(tokens, seen, snapSimple(q, 'tbsp'));
    }
    for (let n = 0; n <= 2; n += 1) {
      for (let fi = 0; fi < CUP_SNAP_FRACS.length; fi += 1) {
        pushUniqueToken(
          tokens,
          seen,
          snapSimple(Number((n + CUP_SNAP_FRACS[fi]).toFixed(6)), 'cup'),
        );
      }
    }
    const rowTokens = uniqueTokensFromRows(COOKING_VOLUME_TBSP_ROWS);
    for (let i = 0; i < rowTokens.length; i += 1) {
      pushUniqueToken(tokens, seen, rowTokens[i]);
    }
    return tokens;
  }

  function allGalSnapTokens() {
    const seen = new Set();
    const tokens = [];
    for (let n = 1; n <= 128; n += 1) {
      pushUniqueToken(tokens, seen, snapSimple(n, 'gal'));
      pushUniqueToken(tokens, seen, snapSimple(n + 0.5, 'gal'));
    }
    return tokens;
  }

  function preferBandRowOut(ml, row, picked) {
    if (!row || !row.out) return picked;
    const outMl = tokenToMl(row.out);
    const pickedMl = tokenToMl(picked);
    if (outMl == null || pickedMl == null) return picked;
    if (Math.abs(ml - outMl) <= Math.abs(ml - pickedMl) + BOUND_EPS) {
      return row.out;
    }
    return picked;
  }

  function snapNearestInBandMl(ml, rows, mlPerUnit) {
    const row = findMatchingRowMl(ml, rows, mlPerUnit);
    if (!row) return null;
    let candidates;
    if (mlPerUnit === ML_PER_CUP) candidates = allCupSnapTokens();
    else if (mlPerUnit === ML_PER_GAL) candidates = allGalSnapTokens();
    else candidates = allTspSnapTokens();
    if (!candidates.length) return row.out;
    const picked = nearestSnapTokenMl(ml, candidates);
    return preferBandRowOut(ml, row, picked);
  }

  function snapNearestInBandUnit(x, rows) {
    const row = findMatchingRowUnit(x, rows);
    if (!row) return null;
    const ml = x * ML_PER_TBSP;
    const candidates = allTbspSnapTokens();
    if (!candidates.length) return row.out;
    const picked = nearestSnapTokenMl(ml, candidates);
    return preferBandRowOut(ml, row, picked);
  }

  function classifyTspFromMl(ml) {
    if (ml < ML_EIGHTH_TSP - ML_CLASSIFY_SLACK) {
      return snapSimple(0.125, 'tsp');
    }
    return snapNearestInBandMl(ml, COOKING_VOLUME_TSP_ROWS, ML_PER_TSP);
  }

  function tbspFromMl(ml) {
    return ml / ML_PER_TBSP;
  }

  function classifyTbspFromMl(ml) {
    return snapNearestInBandUnit(tbspFromMl(ml), COOKING_VOLUME_TBSP_ROWS);
  }

  function cupSnapCandidatesForMl(ml) {
    const cups = ml / ML_PER_CUP;
    if (cups >= 2 - ML_CLASSIFY_SLACK) {
      const tokens = [];
      for (let n = 2; n <= 16; n += 1) {
        tokens.push(snapSimple(n, 'cup'));
      }
      return tokens;
    }
    return allCupSnapTokens().filter((t) => t.quantity < 2 + BOUND_EPS);
  }

  function classifyCupFromMl(ml) {
    const row = findMatchingRowMl(ml, COOKING_VOLUME_CUP_ROWS, ML_PER_CUP);
    if (!row) return null;
    const candidates = cupSnapCandidatesForMl(ml);
    if (!candidates.length) return row.out;
    const picked = nearestSnapTokenMl(ml, candidates);
    return preferBandRowOut(ml, row, picked);
  }

  function classifyGalFromMl(ml) {
    return snapNearestInBandMl(ml, COOKING_VOLUME_GAL_ROWS, ML_PER_GAL);
  }

  const COOKING_VOLUME_TSP_ROWS = [
    { closed: true, lo: 0, hi: 1 / 8, out: snapSimple(1 / 8, 'tsp') },
    { lo: 1 / 8, hi: 1 / 4, hiExclusive: true, out: snapSimple(1 / 8, 'tsp') },
    { lo: 1 / 4, hi: 1 / 2, loClosed: true, hiExclusive: true, out: snapSimple(1 / 4, 'tsp') },
    { lo: 1 / 2, hi: 1, loClosed: true, hiExclusive: true, out: snapSimple(1 / 2, 'tsp') },
    { lo: 1, hi: 1.5, loClosed: true, hiExclusive: true, out: snapSimple(1, 'tsp') },
    { lo: 1.5, hi: 2, loClosed: true, hiExclusive: true, out: snapSimple(2, 'tsp') },
    { lo: 2, hi: 2.5, loClosed: true, hiExclusive: true, out: snapSimple(2, 'tsp') },
    { lo: 2.5, hi: 3, loClosed: true, hiExclusive: true, out: snapSimple(1, 'tbsp') },
    { lo: 3, hi: 3.5, loClosed: true, hiExclusive: true, out: snapSimple(1, 'tbsp') },
    {
      lo: 3.5,
      hi: 4,
      loClosed: true,
      hiExclusive: true,
      out: snapCompound('1 tbsp + ½ tsp', 3.5, 'tsp'),
    },
    {
      lo: 4,
      hi: 4.5,
      loClosed: true,
      hiExclusive: true,
      out: snapCompound('1 tbsp + ½ tsp', 3.5, 'tsp'),
    },
    {
      lo: 4.5,
      hi: 5,
      loClosed: true,
      hiExclusive: true,
      out: snapCompound('1 tbsp + 1 tsp', 4, 'tsp'),
    },
    {
      lo: 5,
      hi: 5.5,
      loClosed: true,
      hiExclusive: true,
      out: snapCompound('1 tbsp + 1½ tsp', 4.5, 'tsp'),
    },
    { lo: 5.5, hi: 6, loClosed: true, out: snapSimple(2, 'tbsp') },
  ];

  const COOKING_VOLUME_TBSP_ROWS = [
    { lo: 0, hi: 1, out: snapSimple(1, 'tbsp') },
    {
      lo: 1,
      hi: 1.5,
      loClosed: true,
      out: snapCompound('1 tbsp + ½ tsp', 3.5, 'tsp'),
    },
    { lo: 1.5, hi: 2, out: snapSimple(2, 'tbsp') },
    { lo: 2, hi: 2.5, out: snapSimple(2.5, 'tbsp') },
    { lo: 2.5, hi: 3, out: snapSimple(3, 'tbsp') },
    { lo: 3, hi: 4, out: snapSimple(0.25, 'cup') },
    { lo: 4, hi: 5, out: snapSimple(1 / 3, 'cup') },
    { lo: 5, hi: 6, out: snapSimple(1 / 3, 'cup') },
    { lo: 6, hi: 8, out: snapSimple(0.5, 'cup') },
    { lo: 8, hi: 10 + 2 / 3, out: snapSimple(2 / 3, 'cup') },
    {
      lo: 10 + 2 / 3,
      hi: 12,
      loClosed: true,
      hiExclusive: true,
      out: snapSimple(0.75, 'cup'),
    },
    { lo: 12, hi: STAGE_MAX_TBSP + TBSP_LADDER_HI_SLACK, out: snapSimple(1, 'cup') },
  ];

  function cupQuarterBlockRows(n) {
    const q = (f) => n + f;
    return [
      { lo: n, hi: q(0.25), out: snapSimple(n, 'cup') },
      { lo: q(0.25), hi: q(0.5), out: snapSimple(n + 0.25, 'cup') },
      { lo: q(0.5), hi: q(0.75), out: snapSimple(n + 0.5, 'cup') },
      { lo: q(0.75), hi: n + 1, out: snapSimple(n + 1, 'cup') },
    ];
  }

  function buildCookingVolumeCupRows() {
    const rows = [
      { lo: 0, hi: 1, hiExclusive: true, out: snapSimple(0.75, 'cup') },
      { exact: 1, out: snapSimple(1, 'cup') },
      { lo: 1, hi: 1.25, out: snapSimple(1.25, 'cup') },
      { lo: 1.25, hi: 1.5, out: snapSimple(1.5, 'cup') },
      { lo: 1.5, hi: 1.75, out: snapSimple(1.5, 'cup') },
      { lo: 1.75, hi: 2, out: snapSimple(2, 'cup') },
    ];
    for (let n = 2; n <= 15; n += 1) {
      rows.push(...cupQuarterBlockRows(n));
    }
    return rows;
  }

  const COOKING_VOLUME_CUP_ROWS = buildCookingVolumeCupRows();

  function galHalfBlockRows(n) {
    return [
      { lo: n, hi: n + 0.5, out: snapSimple(n, 'gal') },
      { lo: n + 0.5, hi: n + 1, out: snapSimple(n + 1, 'gal') },
    ];
  }

  function buildCookingVolumeGalRows(maxWholeGal) {
    const rows = [];
    for (let n = 1; n < maxWholeGal; n += 1) {
      rows.push(...galHalfBlockRows(n));
    }
    return rows;
  }

  const COOKING_VOLUME_GAL_ROWS = buildCookingVolumeGalRows(128);

  function isExactMl(ml, valueUnit, mlPerUnit) {
    return Math.abs(ml - valueUnit * mlPerUnit) <= ML_CLASSIFY_SLACK;
  }

  function normalizeSourceVolumeUnit(unit) {
    const raw = String(unit || '')
      .trim()
      .toLowerCase()
      .replace(/\./g, '');
    if (!raw) return '';
    const map = {
      t: 'tsp',
      tsp: 'tsp',
      teaspoon: 'tsp',
      teaspoons: 'tsp',
      tb: 'tbsp',
      tbsp: 'tbsp',
      tablespoon: 'tbsp',
      tablespoons: 'tbsp',
      c: 'cup',
      cup: 'cup',
      cups: 'cup',
      gal: 'gal',
      gallon: 'gal',
      gallons: 'gal',
    };
    return map[raw] || '';
  }

  function snapTokenFromMlValue(ml, sourceUnit) {
    const src = normalizeSourceVolumeUnit(sourceUnit);
    if (src === 'tsp' && ml <= STAGE_MAX_TSP * ML_PER_TSP + ML_CLASSIFY_SLACK) {
      return classifyTspFromMl(ml);
    }
    if (src === 'tbsp' && tbspFromMl(ml) <= STAGE_MAX_TBSP + TBSP_LADDER_HI_SLACK) {
      return classifyTbspFromMl(ml);
    }
    if (
      src === 'cup' &&
      ml < STAGE_EXACT_CUPS_FOR_GAL * ML_PER_CUP - ML_CLASSIFY_SLACK
    ) {
      return classifyCupFromMl(ml);
    }
    if (src === 'gal' && ml >= ML_PER_GAL - ML_CLASSIFY_SLACK) {
      return classifyGalFromMl(ml);
    }
    if (ml <= STAGE_MAX_TSP * ML_PER_TSP + ML_CLASSIFY_SLACK) {
      return classifyTspFromMl(ml);
    }
    if (tbspFromMl(ml) <= STAGE_MAX_TBSP + TBSP_LADDER_HI_SLACK) {
      return classifyTbspFromMl(ml);
    }
    if (isExactMl(ml, STAGE_EXACT_CUPS_FOR_GAL, ML_PER_CUP)) {
      return snapSimple(1, 'gal');
    }
    if (ml < STAGE_EXACT_CUPS_FOR_GAL * ML_PER_CUP - ML_CLASSIFY_SLACK) {
      return classifyCupFromMl(ml);
    }
    if (ml >= ML_PER_GAL - ML_CLASSIFY_SLACK) {
      return classifyGalFromMl(ml);
    }
    return snapSimple(1, 'gal');
  }

  function snapTokenFromMl(ml, sourceUnit) {
    const x = Number(ml);
    if (!Number.isFinite(x) || x <= 0) return null;
    return snapTokenFromMlValue(x, sourceUnit);
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

  function getMeasuredDisplayFromMl(ml, sourceUnit) {
    return tokenToMeasuredDisplay(snapTokenFromMl(ml, sourceUnit));
  }

  window.favoriteEatsCookingVolumeLadder = {
    getMeasuredDisplayFromMl,
    snapTokenFromMl,
    tokenToMeasuredDisplay,
  };
})();
