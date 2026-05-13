// Units catalog list (units.html): sort volume → mass → other, by physical
// size within measured volume/mass, then ASCII-nocase by unit code.
//
// Magnitudes match `SHOPPING_LIST_MEASURED_UNIT_META` in main.js (US cup, etc.).

(function initUnitCatalogSort(global) {
  if (!global) return;

  const UNIT_MEASURED_MAGNITUDE_META = Object.freeze({
    tsp: Object.freeze({ family: 'volume', baseAmount: 4.92892159375 }),
    tbsp: Object.freeze({ family: 'volume', baseAmount: 14.78676478125 }),
    cup: Object.freeze({ family: 'volume', baseAmount: 236.5882365 }),
    'fl oz': Object.freeze({ family: 'volume', baseAmount: 29.5735295625 }),
    floz: Object.freeze({ family: 'volume', baseAmount: 29.5735295625 }),
    pt: Object.freeze({ family: 'volume', baseAmount: 473.176473 }),
    qt: Object.freeze({ family: 'volume', baseAmount: 946.352946 }),
    gal: Object.freeze({ family: 'volume', baseAmount: 3785.411784 }),
    ml: Object.freeze({ family: 'volume', baseAmount: 1 }),
    l: Object.freeze({ family: 'volume', baseAmount: 1000 }),
    g: Object.freeze({ family: 'mass', baseAmount: 1 }),
    kg: Object.freeze({ family: 'mass', baseAmount: 1000 }),
    oz: Object.freeze({ family: 'mass', baseAmount: 28.349523125 }),
    lb: Object.freeze({ family: 'mass', baseAmount: 453.59237 }),
  });

  function asciiNocaseFold(s) {
    return String(s).replace(/[A-Z]/g, (c) => c.toLowerCase());
  }

  function normalizeUnitCodeKey(code) {
    return asciiNocaseFold(String(code == null ? '' : code).trim());
  }

  function unitCatalogBucket(categoryRaw) {
    const c = String(categoryRaw == null ? '' : categoryRaw).trim().toLowerCase();
    if (c === 'volume') return 0;
    if (c === 'mass') return 1;
    return 2;
  }

  function magnitudeForCatalogSort(row) {
    const bucket = unitCatalogBucket(row?.category);
    if (bucket === 2) return 0;

    const key = normalizeUnitCodeKey(row?.code);
    const meta = UNIT_MEASURED_MAGNITUDE_META[key];
    if (!meta) return Number.POSITIVE_INFINITY;
    if (bucket === 0 && meta.family !== 'volume') return Number.POSITIVE_INFINITY;
    if (bucket === 1 && meta.family !== 'mass') return Number.POSITIVE_INFINITY;
    return meta.baseAmount;
  }

  function compareAsciiNocaseCode(aCode, bCode) {
    const la = asciiNocaseFold(aCode == null ? '' : String(aCode));
    const lb = asciiNocaseFold(bCode == null ? '' : String(bCode));
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  function compareUnitsListCatalogRows(a, b) {
    const ba = unitCatalogBucket(a?.category);
    const bb = unitCatalogBucket(b?.category);
    if (ba !== bb) return ba - bb;

    if (ba === 2) {
      return compareAsciiNocaseCode(a?.code, b?.code);
    }

    const ma = magnitudeForCatalogSort(a);
    const mb = magnitudeForCatalogSort(b);
    if (ma !== mb) return ma - mb;
    return compareAsciiNocaseCode(a?.code, b?.code);
  }

  function sortUnitsListForCatalogUi(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return list.slice().sort(compareUnitsListCatalogRows);
  }

  global.UNIT_MEASURED_MAGNITUDE_META = UNIT_MEASURED_MAGNITUDE_META;
  global.sortUnitsListForCatalogUi = sortUnitsListForCatalogUi;
})(typeof globalThis !== 'undefined' ? globalThis : window);
