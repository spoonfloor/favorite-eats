// snapVolume.js

const ML_PER_TSP = 4.92892159375;
const UNIT = ML_PER_TSP / 24;

const ML_PER_TBSP = ML_PER_TSP * 3;
const ML_PER_CUP = ML_PER_TBSP * 16;
const ML_PER_GAL = ML_PER_CUP * 16;

// ---- unit converter (integer-safe) ----
const u = (ml) => Math.round(ml / UNIT);

// ---- canonical snap table (sorted ascending) ----
const TABLE = [
  ['⅛ tsp', (ML_PER_TSP * 1) / 8],
  ['¼ tsp', (ML_PER_TSP * 1) / 4],
  ['½ tsp', (ML_PER_TSP * 1) / 2],
  ['¾ tsp', (ML_PER_TSP * 3) / 4],
  ['1 tsp', ML_PER_TSP],
  ['1 ¼ tsp', (ML_PER_TSP * 5) / 4],
  ['½ tbsp', (ML_PER_TSP * 6) / 4],
  ['1 ¾ tsp', (ML_PER_TSP * 7) / 4],
  ['2 tsp', ML_PER_TSP],

  ['1 tbsp', ML_PER_TBSP],
  ['1 ½ tbsp', (ML_PER_TBSP * 3) / 2],
  ['2 tbsp', ML_PER_TBSP * 2],
  ['3 tbsp', ML_PER_TBSP * 3],

  ['¼ cup', (ML_PER_CUP * 1) / 4],
  ['⅓ cup', (ML_PER_CUP * 1) / 3],
  ['½ cup', (ML_PER_CUP * 1) / 2],
  ['⅔ cup', (ML_PER_CUP * 2) / 3],
  ['¾ cup', (ML_PER_CUP * 3) / 4],
  ['1 cup', ML_PER_CUP],

  ['1 ½ cup', (ML_PER_CUP * 3) / 2],
  ['2 cup', ML_PER_CUP * 2],
  ['3 cup', ML_PER_CUP * 3],
  ['4 cup', ML_PER_CUP * 4],
  ['5 cup', ML_PER_CUP * 5],
  ['10 cup', ML_PER_CUP * 10],
  ['15 cup', ML_PER_CUP * 15],

  ['1 gal', ML_PER_GAL],
].map(([label, ml]) => ({
  label,
  units: u(ml),
}));

// ---- binary search ----
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

// ---- main API ----
export function snapVolume(volumeMl, isCooking) {
  const v = Math.round(volumeMl / UNIT);

  const min = TABLE[0].units;
  if (v <= min) return '⅛ tsp';

  const gal = TABLE[TABLE.length - 1].units;

  // ---- gallon extension ----
  if (v > gal) {
    const halfGal = gal / 2;

    const snapped = isCooking
      ? Math.round(v / halfGal)
      : Math.ceil(v / halfGal);

    const whole = Math.floor(snapped / 2);
    const isHalf = snapped % 2 === 1;

    return isHalf ? `${whole} ½ gal` : `${whole} gal`;
  }

  // ---- find insertion point ----
  const idx = lowerBound(TABLE, v);

  // ---- non-cooking: ceil ----
  if (!isCooking) {
    return TABLE[idx].label;
  }

  // ---- cooking: nearest neighbor ----
  const prev = TABLE[idx - 1];
  const next = TABLE[idx];

  if (!prev) return next.label;
  if (!next) return prev.label;

  const dPrev = Math.abs(v - prev.units);
  const dNext = Math.abs(v - next.units);

  // stable tie-break: prefer lower unit (more conservative cooking behavior)
  if (dPrev <= dNext) return prev.label;
  return next.label;
}
