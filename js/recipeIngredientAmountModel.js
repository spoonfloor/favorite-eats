(function initRecipeIngredientAmountModel(global) {
  if (!global) return;

  function positiveNumberOrNull(rawValue) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function parsePositiveQuantity(rawValue) {
    if (rawValue == null) return null;
    if (typeof rawValue === 'number') {
      return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : null;
    }
    const parseRich =
      typeof global.parseNumericQuantityValue === 'function'
        ? global.parseNumericQuantityValue
        : null;
    if (parseRich) {
      const parsed = parseRich(rawValue);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    const n = Number(String(rawValue).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function normalizeRawQuantityText(rawValue) {
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric) && numeric <= 0) return '';
    return String(rawValue == null ? '' : rawValue).trim();
  }

  function normalizeEndpointPair(minRaw, maxRaw) {
    let min = positiveNumberOrNull(minRaw);
    let max = positiveNumberOrNull(maxRaw);
    if (min == null && max != null) min = max;
    if (max == null && min != null) max = min;
    if (min != null && max != null && min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }
    return { min, max };
  }

  function fromRow(row) {
    const quantityText = normalizeRawQuantityText(row?.quantity);
    const scalar = parsePositiveQuantity(row?.quantity);
    if (scalar != null) {
      return {
        kind: 'scalar',
        value: scalar,
        rawText: quantityText,
        isApprox: !!row?.quantityIsApprox,
      };
    }

    const { min, max } = normalizeEndpointPair(row?.quantityMin, row?.quantityMax);
    if (min != null || max != null) {
      if (min != null && max != null && Math.abs(min - max) < 1e-9) {
        return {
          kind: 'scalar',
          value: min,
          rawText: quantityText,
          isApprox: !!row?.quantityIsApprox,
        };
      }
      return {
        kind: 'range',
        min,
        max,
        rawText: quantityText,
        isApprox: !!row?.quantityIsApprox,
        shoppingPolicy: 'max',
      };
    }

    return {
      kind: 'text',
      rawText: quantityText,
      shoppingValue: null,
      isApprox: false,
    };
  }

  function toDbPayload(row) {
    const amount = fromRow(row);
    if (amount.kind === 'scalar') {
      const quantity = amount.rawText || String(amount.value);
      return {
        quantity,
        quantity_min: amount.value,
        quantity_max: amount.value,
        quantity_is_approx: !!amount.isApprox,
      };
    }
    if (amount.kind === 'range') {
      return {
        quantity: amount.rawText,
        quantity_min: amount.min,
        quantity_max: amount.max,
        quantity_is_approx: !!amount.isApprox,
      };
    }
    return {
      quantity: amount.rawText,
      quantity_min: null,
      quantity_max: null,
      quantity_is_approx: false,
    };
  }

  function toShoppingQuantity(row) {
    const amount = fromRow(row);
    if (amount.kind === 'scalar') return amount.value;
    if (amount.kind === 'range') {
      return amount.max != null ? amount.max : amount.min;
    }
    return null;
  }

  global.favoriteEatsRecipeIngredientAmountModel = {
    fromRow,
    toDbPayload,
    toShoppingQuantity,
  };
})(typeof window !== 'undefined' ? window : globalThis);
