(function initIngredientDisplay(globalScope) {
  const root = globalScope || {};
  const EPSILON = 1e-9;

  function toPositiveNumberOrNull(value) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const number = Number(raw);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function parseQuantityToken(token) {
    if (typeof root.parseNumericQuantityValue === 'function') {
      return root.parseNumericQuantityValue(token);
    }
    if (token == null) return null;
    const raw = String(token).trim();
    if (!raw) return null;

    const mixed = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      const whole = Number(mixed[1]);
      const num = Number(mixed[2]);
      const den = Number(mixed[3]);
      if (
        Number.isFinite(whole) &&
        Number.isFinite(num) &&
        Number.isFinite(den) &&
        den > 0
      ) {
        return whole + num / den;
      }
      return null;
    }

    const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction) {
      const num = Number(fraction[1]);
      const den = Number(fraction[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        return num / den;
      }
      return null;
    }

    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  }

  function formatNumericDisplay(value) {
    if (typeof root.decimalToFractionDisplay === 'function') {
      const formatted = root.decimalToFractionDisplay(value);
      if (formatted) return formatted;
    }
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    if (typeof root.prettifyDisplayText === 'function') {
      return root.prettifyDisplayText(raw);
    }
    return raw;
  }

  function getIngredientNameText(line, nounQuantity) {
    const fallbackName = [String(line?.variant || '').trim(), String(line?.name || '').trim()]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (typeof root.getIngredientDisplayName !== 'function') return fallbackName;

    try {
      const computed = root.getIngredientDisplayName({
        ...(line || {}),
        quantity: nounQuantity,
      });
      return String(computed || '').trim() || fallbackName;
    } catch (_) {
      return fallbackName;
    }
  }

  /** Resolve unit singular/plural metadata from the Supabase data-service unit list. */
  let unitsMetaServiceMap = null;
  let unitsMetaServiceLoadPromise = null;

  function metaFromListUnitsContractRow(row) {
    return {
      code: String(row && row.code != null ? row.code : '').trim(),
      name_singular: String(row && row.nameSingular != null ? row.nameSingular : '').trim(),
      name_plural: String(row && row.namePlural != null ? row.namePlural : '').trim(),
      category: String(row && row.category != null ? row.category : '').trim(),
      quantityRoundingPreset: String(
        row && row.quantityRoundingPreset != null ? row.quantityRoundingPreset : '',
      )
        .trim()
        .toLowerCase(),
      quantityRoundingStepDenominator: (() => {
        if (row?.quantityRoundingStepDenominator == null) return null;
        const n = Number(row.quantityRoundingStepDenominator);
        return Number.isFinite(n) ? n : null;
      })(),
      quantityRoundingMode: String(
        row && row.quantityRoundingMode != null ? row.quantityRoundingMode : '',
      )
        .trim()
        .toLowerCase(),
    };
  }

  function categoryKey(meta) {
    return String(meta?.category ?? '').trim().toLowerCase();
  }

  function presetKey(meta) {
    return String(
      meta?.quantityRoundingPreset ?? meta?.quantity_rounding_preset ?? '',
    )
      .trim()
      .toLowerCase();
  }

  function stepDenomFromMeta(meta) {
    const d = Number(
      meta?.quantityRoundingStepDenominator ??
        meta?.quantity_rounding_step_denominator,
    );
    return [1, 2, 3, 4, 8, 12].includes(d) ? d : null;
  }

  /**
   * Step denominator for catalog "flexible" scalar snap, or null to leave raw display.
   * Mass/volume + `system_measured` → null (measured ladders elsewhere).
   * Non-measured + `system_measured` → 1 (same rounding as whole-number / step 1).
   */
  function resolveCatalogSnapStep(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const cat = categoryKey(meta);
    const preset = presetKey(meta);
    const isMeasured = cat === 'mass' || cat === 'volume';

    if (isMeasured) {
      if (preset === 'system_measured') return null;
      if (preset === 'custom') return stepDenomFromMeta(meta);
      return null;
    }

    if (preset === 'system_measured') return 1;
    if (preset === 'custom') return stepDenomFromMeta(meta);

    const fixedMap = {
      nearest_eighth: 8,
      nearest_quarter: 4,
      nearest_half: 2,
      nearest_whole: 1,
    };
    return fixedMap[preset] ?? null;
  }

  function snapScalarForCatalogIntent(value, stepDenom, intent) {
    const pol = root.favoriteEatsQuantityDisplayPolicy;
    if (!pol) return null;
    const mode = String(intent || 'cooking').toLowerCase();
    if (mode === 'shopping') {
      return typeof pol.snapScalarShoppingCeil === 'function'
        ? pol.snapScalarShoppingCeil(value, stepDenom)
        : null;
    }
    return typeof pol.snapScalarCookingNearest === 'function'
      ? pol.snapScalarCookingNearest(value, stepDenom)
      : null;
  }

  /**
   * Canonical measured mass/volume display (shopping vs cooking ladders).
   * Skips fractional-pound lines (&lt; 1 lb) so values like ¾ lb stay in lb, not oz.
   * @returns {{ quantityFmt: string, displayValue: number, displayUnit: string }|null}
   */
  function trySystemMeasuredLadderDisplay(parsed, unitTextRaw, meta, intent) {
    const cat = categoryKey(meta);
    const preset = presetKey(meta);
    if (
      meta &&
      ((cat !== 'mass' && cat !== 'volume') || preset === 'custom')
    ) {
      return null;
    }
    const pol = root.favoriteEatsQuantityDisplayPolicy;
    if (
      !pol ||
      typeof pol.convertIngredientQuantityToMeasuredBase !== 'function' ||
      typeof pol.getMeasuredDisplayFromBase !== 'function' ||
      typeof pol.normalizeMeasuredIngredientUnit !== 'function'
    ) {
      return null;
    }
    const unitRaw = String(unitTextRaw == null ? '' : unitTextRaw).trim();
    if (!unitRaw) return null;
    const conv = pol.convertIngredientQuantityToMeasuredBase(parsed, unitRaw);
    if (!conv) return null;
    const family = cat || conv.family;
    if (conv.family !== family) return null;
    const canonical = pol.normalizeMeasuredIngredientUnit(unitRaw);
    if (canonical === 'lb' && parsed < 1 - EPSILON) {
      return null;
    }
    const display = pol.getMeasuredDisplayFromBase(
      family,
      conv.baseQuantity,
      intent,
    );
    if (!display || !Number.isFinite(display.quantity) || display.quantity <= 0) {
      return null;
    }
    let quantityFmt = '';
    if (typeof root.decimalToFractionDisplay === 'function') {
      quantityFmt = String(root.decimalToFractionDisplay(display.quantity) || '').trim();
    }
    if (!quantityFmt) {
      quantityFmt = String(Number(display.quantity.toFixed(3)));
    }
    return {
      quantityFmt,
      displayValue: display.quantity,
      displayUnit: String(display.unit || '').trim(),
    };
  }

  async function ensureUnitsMetaLoadedFromDataService() {
    if (
      !root.dataService ||
      typeof root.dataService.listUnits !== 'function' ||
      !root.dataService.useSupabase
    ) {
      return;
    }
    if (unitsMetaServiceMap !== null) return;

    if (!unitsMetaServiceLoadPromise) {
      unitsMetaServiceLoadPromise = (async () => {
        try {
          const rows = await root.dataService.listUnits();
          const byCode = new Map();
          (Array.isArray(rows) ? rows : []).forEach((row) => {
            const c = String(row && row.code != null ? row.code : '')
              .trim()
              .toLowerCase();
            if (!c) return;
            if (!byCode.has(c)) {
              const m = metaFromListUnitsContractRow(row);
              if (m.code || m.name_singular || m.name_plural) {
                byCode.set(c, m);
              }
            }
          });
          unitsMetaServiceMap = byCode;
        } catch (err) {
          console.error('ingredientDisplay: listUnits failed:', err);
          unitsMetaServiceMap = new Map();
        } finally {
          unitsMetaServiceLoadPromise = null;
        }
      })();
    }
    await unitsMetaServiceLoadPromise;
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('favoriteEats:db-updated', () => {
      unitsMetaServiceMap = null;
      unitsMetaServiceLoadPromise = null;
      if (
        root.dataService &&
        root.dataService.useSupabase &&
        typeof root.dataService.listUnits === 'function'
      ) {
        void ensureUnitsMetaLoadedFromDataService();
      }
    });
  }

  if (
    root.dataService &&
    root.dataService.useSupabase &&
    typeof root.dataService.listUnits === 'function'
  ) {
    void ensureUnitsMetaLoadedFromDataService();
  }

  function getDbBackedUnitMeta(codeLower) {
    const key = String(codeLower || '').trim().toLowerCase();
    if (!key) return null;
    if (root.dataService && root.dataService.useSupabase) {
      if (unitsMetaServiceMap instanceof Map) {
        if (unitsMetaServiceMap.has(key)) return unitsMetaServiceMap.get(key);
        return null;
      }
      void ensureUnitsMetaLoadedFromDataService();
    }
    return null;
  }

  function getUnitDisplay(unitText, numericVal) {
    const rawUnit = String(unitText || '').trim();
    if (!rawUnit) return '';

    const codeLower = rawUnit.toLowerCase();
    const meta = resolveUnitMeta(codeLower);

    const unit = String(
      (meta && (meta.abbrev || meta.abbreviation || '')) || rawUnit
    ).trim();
    const singularLabel = String(
      (meta && (meta.name_singular || meta.name || '')) || ''
    ).trim();
    const pluralLabel = String(
      (meta && (meta.name_plural || meta.plural || '')) || ''
    ).trim();

    if (Number.isFinite(numericVal) && numericVal > 1) {
      const abbrevUnits = [
        'tsp',
        'tbsp',
        'cup',
        'fl oz',
        'oz',
        'lb',
        'pt',
        'qt',
        'gal',
        'ml',
        'l',
        'g',
        'kg',
      ];

      if (abbrevUnits.includes(codeLower)) {
        return unit;
      }

      if (
        pluralLabel &&
        singularLabel &&
        rawUnit.toLowerCase() === singularLabel.toLowerCase()
      ) {
        return pluralLabel;
      }

      if (typeof root.pluralizeEnglishNoun === 'function') {
        return root.pluralizeEnglishNoun(unit);
      }

      if (!unit.endsWith('s')) {
        return unit + 's';
      }
    }

    return unit;
  }

  function resolveUnitMeta(unitText) {
    const codeLower = String(unitText || '').trim().toLowerCase();
    if (!codeLower) return null;
    let meta = null;
    if (root.unitsDisplayMap && root.unitsDisplayMap[codeLower]) {
      meta = root.unitsDisplayMap[codeLower];
    } else if (root.unitsMeta && root.unitsMeta[codeLower]) {
      meta = root.unitsMeta[codeLower];
    } else {
      meta = getDbBackedUnitMeta(codeLower);
    }
    return meta;
  }

  function getIngredientQuantityParts(line, options = {}) {
    const qMinRaw = toPositiveNumberOrNull(line?.quantityMin);
    const qMaxRaw = toPositiveNumberOrNull(line?.quantityMax);
    const qApprox = !!line?.quantityIsApprox;

    let quantityText = '';
    let numericValue = null;
    let nounQuantity = line?.quantity;
    let measuredDisplayUnit = null;
    const intent = options?.intent === 'shopping' ? 'shopping' : 'cooking';

    if (qMinRaw != null || qMaxRaw != null) {
      const qMin = qMinRaw != null ? qMinRaw : qMaxRaw;
      const qMax = qMaxRaw != null ? qMaxRaw : qMinRaw;
      const same = qMin != null && qMax != null && Math.abs(qMin - qMax) < EPSILON;
      const meta = resolveUnitMeta(line?.unit);
      const minLadder =
        qMin != null
          ? trySystemMeasuredLadderDisplay(qMin, line?.unit, meta, intent)
          : null;
      const maxLadder =
        qMax != null
          ? trySystemMeasuredLadderDisplay(qMax, line?.unit, meta, intent)
          : null;
      const canUseLadder =
        minLadder &&
        maxLadder &&
        minLadder.displayUnit &&
        minLadder.displayUnit === maxLadder.displayUnit;

      quantityText =
        canUseLadder
          ? same
            ? minLadder.quantityFmt
            : `${minLadder.quantityFmt} to ${maxLadder.quantityFmt}`
          : qMin != null && qMax != null
          ? same
            ? formatNumericDisplay(qMin)
            : `${formatNumericDisplay(qMin)} to ${formatNumericDisplay(qMax)}`
          : '';

      if (qApprox && quantityText) quantityText = `about ${quantityText}`;
      if (canUseLadder) {
        measuredDisplayUnit = minLadder.displayUnit;
        numericValue = same ? minLadder.displayValue : maxLadder.displayValue;
        nounQuantity = maxLadder.displayValue;
      } else {
        if (same) numericValue = qMin;
        nounQuantity = qMax != null ? qMax : qMin;
      }
    } else {
      const rawQty = String(line?.quantity || '').trim();
      if (rawQty) {
        const approxMatch = rawQty.match(
          /^(about|approx(?:\.|imately)?|around|roughly|~)\s+/i
        );
        const approxPrefix = approxMatch ? 'about ' : '';
        const coreQty = approxMatch ? rawQty.slice(approxMatch[0].length).trim() : rawQty;
        const rangeMatch = coreQty.match(/^(.+?)\s*(?:to|-)\s*(.+)$/i);

        if (rangeMatch) {
          const left = parseQuantityToken(rangeMatch[1]);
          const right = parseQuantityToken(rangeMatch[2]);
          if (Number.isFinite(left) && left > 0 && Number.isFinite(right) && right > 0) {
            quantityText = `${approxPrefix}${formatNumericDisplay(
              rangeMatch[1]
            )} to ${formatNumericDisplay(rangeMatch[2])}`.trim();
          } else {
            quantityText = rawQty;
          }
        } else {
          const parsed = parseQuantityToken(coreQty);
          if (Number.isFinite(parsed) && parsed > 0) {
            const unitKey = String(line?.unit || '').trim().toLowerCase();
            const meta = resolveUnitMeta(unitKey);
            const stepDenom = resolveCatalogSnapStep(meta);
            let displayValue = parsed;
            let quantityFmt = formatNumericDisplay(coreQty);
            if (stepDenom != null) {
              const snapped = snapScalarForCatalogIntent(parsed, stepDenom, intent);
              if (snapped != null && Number.isFinite(snapped) && snapped > 0) {
                displayValue = snapped;
                const pol = root.favoriteEatsQuantityDisplayPolicy;
                if (pol && typeof pol.formatGlyphForAmount === 'function') {
                  const g = pol.formatGlyphForAmount(snapped, stepDenom);
                  quantityFmt = g || formatNumericDisplay(String(snapped));
                } else {
                  quantityFmt = formatNumericDisplay(String(snapped));
                }
              }
            } else {
              const ladder = trySystemMeasuredLadderDisplay(parsed, line?.unit, meta, intent);
              if (ladder && ladder.displayUnit) {
                quantityFmt = ladder.quantityFmt;
                displayValue = ladder.displayValue;
                measuredDisplayUnit = ladder.displayUnit;
              }
            }
            quantityText = `${approxPrefix}${quantityFmt}`.trim();
            numericValue = displayValue;
            nounQuantity = displayValue;
          } else {
            quantityText = rawQty;
          }
        }
      }
    }

    return {
      quantityText,
      numericValue,
      nounQuantity,
      measuredDisplayUnit,
    };
  }

  function getIngredientDisplayCoreParts(line, options = {}) {
    const quantityParts = getIngredientQuantityParts(line, options);
    const sizeText = String(line?.size || '').trim();
    const unitForDisplay = String(
      quantityParts.measuredDisplayUnit != null &&
        String(quantityParts.measuredDisplayUnit).trim()
        ? quantityParts.measuredDisplayUnit
        : line?.unit || '',
    ).trim();
    const unitText = unitForDisplay
      ? Number.isFinite(quantityParts.numericValue)
        ? getUnitDisplay(unitForDisplay, quantityParts.numericValue)
        : unitForDisplay
      : '';
    const amountUnitText = [sizeText, unitText].filter(Boolean).join(' ');
    const leadText = quantityParts.quantityText
      ? [quantityParts.quantityText, amountUnitText].filter(Boolean).join(' ')
      : amountUnitText;
    const nameText = getIngredientNameText(line, quantityParts.nounQuantity);
    const mainText = [leadText, nameText].filter(Boolean).join(' ').trim();

    return {
      quantityText: quantityParts.quantityText,
      numericValue: quantityParts.numericValue,
      nounQuantity: quantityParts.nounQuantity,
      sizeText,
      unitText,
      amountUnitText,
      leadText,
      nameText,
      mainText,
    };
  }

  function formatIngredientCoreText(line, options = {}) {
    return getIngredientDisplayCoreParts(line, options).mainText;
  }

  function getIngredientDisplayParts(line, options = {}) {
    const core = getIngredientDisplayCoreParts(line, options);
    const prepText = String(line?.prepNotes || '').trim();
    const substituteTexts = Array.isArray(line?.substitutes)
      ? line.substitutes
          .map((sub) =>
            formatIngredientCoreText({ ...(sub || {}), substitutes: [] }, options),
          )
          .filter(Boolean)
      : [];
    const parentheticalBits = [];
    const parentheticalNote = String(line?.parentheticalNote || '').trim();
    if (parentheticalNote) parentheticalBits.push(parentheticalNote);
    if (line?.isOptional) parentheticalBits.push('optional');
    const parentheticalText = parentheticalBits.join(', ');

    let text = core.mainText;
    if (prepText) text += text ? `, ${prepText}` : prepText;
    if (substituteTexts.length) text += `${text ? ' or ' : ''}${substituteTexts.join(' or ')}`;
    if (parentheticalText) text += `${text ? ' ' : ''}(${parentheticalText})`;

    return {
      ...core,
      prepText,
      substituteTexts,
      parentheticalBits,
      parentheticalText,
      text: text.trim(),
    };
  }

  function formatIngredientText(line, options = {}) {
    return getIngredientDisplayParts(line, options).text;
  }

  function formatNeedLineText(line, options = {}) {
    const parts = getIngredientDisplayCoreParts(line, options);
    let text = parts.nameText;

    if (parts.leadText) {
      text += text ? ` (${parts.leadText})` : parts.leadText;
    }

    if (line?.isOptional) {
      text = parts.leadText ? text.replace(/\)$/, ', optional)') : `${text} (optional)`.trim();
    }

    return text.trim();
  }

  root.getUnitDisplay = getUnitDisplay;
  root.getIngredientDisplayCoreParts = getIngredientDisplayCoreParts;
  root.getIngredientDisplayParts = getIngredientDisplayParts;
  root.formatIngredientText = formatIngredientText;
  root.formatNeedLineText = formatNeedLineText;
  root.ingredientDisplay = {
    getUnitDisplay,
    getIngredientDisplayCoreParts,
    getIngredientDisplayParts,
    formatIngredientText,
    formatNeedLineText,
  };
})(
  typeof window !== 'undefined'
    ? window
    : typeof globalThis !== 'undefined'
      ? globalThis
      : this
);
