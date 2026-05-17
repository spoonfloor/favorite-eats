/**
 * Cooking-intent volume display ladder (interval tables). Loaded before quantityDisplayPolicy.js.
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
  /** Tbsp ladder handoff: keep (12, 16] → 1 cup through ~16.01 tbsp (ml round-trip). */
  const TBSP_LADDER_HI_SLACK = 1 / 64;

  const BOUND_EPS = 1e-9;
  /** Matches quantityDisplayPolicy MEASURED_BASE_CONVERSION_SLACK (ml toFixed(6) round-trip). */
  const ML_CLASSIFY_SLACK = 1e-6;

  /** @typedef {{ kind: 'simple', quantity: number, unit: string }} SimpleSnap */
  /** @typedef {{ kind: 'compound', displayLabel: string, quantity: number, unit: string }} CompoundSnap */

  function inHalfOpenUnit(x, lo, hi) {
    return x > lo + BOUND_EPS && x <= hi + BOUND_EPS;
  }

  function inIntervalMl(ml, loUnit, hiUnit, mlPerUnit, opts) {
    const loMl = loUnit * mlPerUnit;
    const hiMl = hiUnit * mlPerUnit;
    const loClosed = Boolean(opts && opts.loClosed);
    const hiExclusive = Boolean(opts && opts.hiExclusive);
    const aboveLo = loClosed
      ? ml >= loMl - ML_CLASSIFY_SLACK
      : ml > loMl + ML_CLASSIFY_SLACK;
    const belowHi = hiExclusive
      ? ml < hiMl - ML_CLASSIFY_SLACK
      : ml <= hiMl + ML_CLASSIFY_SLACK;
    return aboveLo && belowHi;
  }

  function inClosedMl(ml, loUnit, hiUnit, mlPerUnit) {
    const loMl = loUnit * mlPerUnit;
    const hiMl = hiUnit * mlPerUnit;
    return ml >= loMl - ML_CLASSIFY_SLACK && ml <= hiMl + ML_CLASSIFY_SLACK;
  }

  function isExactMl(ml, valueUnit, mlPerUnit) {
    return Math.abs(ml - valueUnit * mlPerUnit) <= ML_CLASSIFY_SLACK;
  }

  function inIntervalUnit(x, lo, hi, opts) {
    const loClosed = Boolean(opts && opts.loClosed);
    const hiExclusive = Boolean(opts && opts.hiExclusive);
    const aboveLo = loClosed ? x >= lo - ML_CLASSIFY_SLACK : x > lo + ML_CLASSIFY_SLACK;
    const belowHi = hiExclusive ? x < hi - ML_CLASSIFY_SLACK : x <= hi + ML_CLASSIFY_SLACK;
    return aboveLo && belowHi;
  }

  function classifyByMl(ml, rows, mlPerUnit) {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.exact != null && isExactMl(ml, row.exact, mlPerUnit)) return row.out;
      if (row.closed && row.lo != null && row.hi != null) {
        if (inClosedMl(ml, row.lo, row.hi, mlPerUnit)) return row.out;
      } else if (row.lo != null && row.hi != null) {
        if (
          inIntervalMl(ml, row.lo, row.hi, mlPerUnit, {
            loClosed: row.loClosed,
            hiExclusive: row.hiExclusive,
          })
        ) {
          return row.out;
        }
      }
    }
    return null;
  }

  function classifyByUnit(x, rows) {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.exact != null && Math.abs(x - row.exact) <= ML_CLASSIFY_SLACK) return row.out;
      if (row.closed && row.lo != null && row.hi != null) {
        if (x >= row.lo - ML_CLASSIFY_SLACK && x <= row.hi + ML_CLASSIFY_SLACK) return row.out;
      } else if (row.lo != null && row.hi != null) {
        if (
          inIntervalUnit(x, row.lo, row.hi, {
            loClosed: row.loClosed,
            hiExclusive: row.hiExclusive,
          })
        ) {
          return row.out;
        }
      }
    }
    return null;
  }

  function tbspFromMl(ml) {
    return ml / ML_PER_TBSP;
  }

  function classifyTbspFromMl(ml) {
    return classifyByUnit(tbspFromMl(ml), COOKING_VOLUME_TBSP_ROWS);
  }

  function snapSimple(quantity, unit) {
    return { kind: 'simple', quantity, unit };
  }

  function snapCompound(displayLabel, quantity, unit) {
    return { kind: 'compound', displayLabel, quantity, unit };
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

  /**
   * Staging by ml, honoring source unit when the same volume spans tsp and tbsp tables.
   */
  function snapTokenFromMlValue(ml, sourceUnit) {
    const src = normalizeSourceVolumeUnit(sourceUnit);
    if (src === 'tsp' && ml <= STAGE_MAX_TSP * ML_PER_TSP + ML_CLASSIFY_SLACK) {
      return classifyByMl(ml, COOKING_VOLUME_TSP_ROWS, ML_PER_TSP);
    }
    if (src === 'tbsp' && tbspFromMl(ml) <= STAGE_MAX_TBSP + TBSP_LADDER_HI_SLACK) {
      return classifyTbspFromMl(ml);
    }
    if (
      src === 'cup' &&
      ml >= ML_PER_CUP - ML_CLASSIFY_SLACK &&
      ml < STAGE_EXACT_CUPS_FOR_GAL * ML_PER_CUP - ML_CLASSIFY_SLACK
    ) {
      return classifyByMl(ml, COOKING_VOLUME_CUP_ROWS, ML_PER_CUP);
    }
    if (src === 'gal' && ml >= ML_PER_GAL - ML_CLASSIFY_SLACK) {
      return classifyByMl(ml, COOKING_VOLUME_GAL_ROWS, ML_PER_GAL);
    }
    if (ml <= STAGE_MAX_TSP * ML_PER_TSP + ML_CLASSIFY_SLACK) {
      return classifyByMl(ml, COOKING_VOLUME_TSP_ROWS, ML_PER_TSP);
    }
    if (tbspFromMl(ml) <= STAGE_MAX_TBSP + TBSP_LADDER_HI_SLACK) {
      return classifyTbspFromMl(ml);
    }
    if (isExactMl(ml, STAGE_EXACT_CUPS_FOR_GAL, ML_PER_CUP)) {
      return snapSimple(1, 'gal');
    }
    if (ml < STAGE_EXACT_CUPS_FOR_GAL * ML_PER_CUP - ML_CLASSIFY_SLACK) {
      return classifyByMl(ml, COOKING_VOLUME_CUP_ROWS, ML_PER_CUP);
    }
    if (ml >= ML_PER_GAL - ML_CLASSIFY_SLACK) {
      return classifyByMl(ml, COOKING_VOLUME_GAL_ROWS, ML_PER_GAL);
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
    if (token.kind === 'simple') {
      return {
        family: 'volume',
        quantity: Number(token.quantity.toFixed(6)),
        unit: token.unit,
      };
    }
    return {
      family: 'volume',
      quantity: Number(token.quantity.toFixed(6)),
      unit: token.unit,
      displayLabel: token.displayLabel,
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
