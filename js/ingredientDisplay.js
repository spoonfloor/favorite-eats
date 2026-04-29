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

  /** When hosted reads use Supabase and there is no local sql.js db, resolve unit singular/plural from `listUnits`. */
  let unitsMetaServiceMap = null;
  let unitsMetaServiceLoadPromise = null;

  function metaFromListUnitsContractRow(row) {
    return {
      code: String(row && row.code != null ? row.code : '').trim(),
      name_singular: String(row && row.nameSingular != null ? row.nameSingular : '').trim(),
      name_plural: String(row && row.namePlural != null ? row.namePlural : '').trim(),
    };
  }

  async function ensureUnitsMetaLoadedFromDataService() {
    if (root.dbInstance && typeof root.dbInstance.exec === 'function') return;
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
      root.__ingredientDisplayUnitMetaCache = null;
      if (
        root.dataService &&
        root.dataService.useSupabase &&
        typeof root.dataService.listUnits === 'function' &&
        !(root.dbInstance && typeof root.dbInstance.exec === 'function')
      ) {
        void ensureUnitsMetaLoadedFromDataService();
      }
    });
  }

  if (
    root.dataService &&
    root.dataService.useSupabase &&
    typeof root.dataService.listUnits === 'function' &&
    !(root.dbInstance && typeof root.dbInstance.exec === 'function')
  ) {
    void ensureUnitsMetaLoadedFromDataService();
  }

  function getDbBackedUnitMeta(codeLower) {
    const key = String(codeLower || '').trim().toLowerCase();
    if (!key) return null;
    const db = root.dbInstance;

    if (!db || typeof db.exec !== 'function') {
      if (root.dataService && root.dataService.useSupabase) {
        if (unitsMetaServiceMap instanceof Map) {
          if (unitsMetaServiceMap.has(key)) return unitsMetaServiceMap.get(key);
          return null;
        }
        void ensureUnitsMetaLoadedFromDataService();
      }
      return null;
    }

    if (
      !root.__ingredientDisplayUnitMetaCache ||
      root.__ingredientDisplayUnitMetaCache.db !== db
    ) {
      root.__ingredientDisplayUnitMetaCache = {
        db,
        byCode: new Map(),
      };
    }

    const cache = root.__ingredientDisplayUnitMetaCache.byCode;
    if (cache.has(key)) return cache.get(key);

    let meta = null;
    try {
      const q = db.exec(
        `SELECT code, name_singular, name_plural
         FROM units
         WHERE lower(trim(code)) = lower(trim('${key.replace(/'/g, "''")}'))
         LIMIT 1;`
      );
      if (Array.isArray(q) && q.length && Array.isArray(q[0].values) && q[0].values.length) {
        const [code, nameSingular, namePlural] = q[0].values[0];
        meta = {
          code: String(code || '').trim(),
          name_singular: String(nameSingular || '').trim(),
          name_plural: String(namePlural || '').trim(),
        };
      }
    } catch (_) {
      meta = null;
    }

    cache.set(key, meta);
    return meta;
  }

  function getUnitDisplay(unitText, numericVal) {
    const rawUnit = String(unitText || '').trim();
    if (!rawUnit) return '';

    const codeLower = rawUnit.toLowerCase();
    let meta = null;
    if (root.unitsDisplayMap && root.unitsDisplayMap[codeLower]) {
      meta = root.unitsDisplayMap[codeLower];
    } else if (root.unitsMeta && root.unitsMeta[codeLower]) {
      meta = root.unitsMeta[codeLower];
    } else {
      meta = getDbBackedUnitMeta(codeLower);
    }

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

  function getIngredientQuantityParts(line) {
    const qMinRaw = toPositiveNumberOrNull(line?.quantityMin);
    const qMaxRaw = toPositiveNumberOrNull(line?.quantityMax);
    const qApprox = !!line?.quantityIsApprox;

    let quantityText = '';
    let numericValue = null;
    let nounQuantity = line?.quantity;

    if (qMinRaw != null || qMaxRaw != null) {
      const qMin = qMinRaw != null ? qMinRaw : qMaxRaw;
      const qMax = qMaxRaw != null ? qMaxRaw : qMinRaw;
      const same = qMin != null && qMax != null && Math.abs(qMin - qMax) < EPSILON;

      quantityText =
        qMin != null && qMax != null
          ? same
            ? formatNumericDisplay(qMin)
            : `${formatNumericDisplay(qMin)} to ${formatNumericDisplay(qMax)}`
          : '';

      if (qApprox && quantityText) quantityText = `about ${quantityText}`;
      if (same) numericValue = qMin;
      nounQuantity = qMax != null ? qMax : qMin;
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
            quantityText = `${approxPrefix}${formatNumericDisplay(coreQty)}`.trim();
            numericValue = parsed;
            nounQuantity = parsed;
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
    };
  }

  function getIngredientDisplayCoreParts(line) {
    const quantityParts = getIngredientQuantityParts(line);
    const sizeText = String(line?.size || '').trim();
    const unitBase = String(line?.unit || '').trim();
    const unitText = unitBase
      ? Number.isFinite(quantityParts.numericValue)
        ? getUnitDisplay(unitBase, quantityParts.numericValue)
        : unitBase
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

  function formatIngredientCoreText(line) {
    return getIngredientDisplayCoreParts(line).mainText;
  }

  function getIngredientDisplayParts(line) {
    const core = getIngredientDisplayCoreParts(line);
    const prepText = String(line?.prepNotes || '').trim();
    const substituteTexts = Array.isArray(line?.substitutes)
      ? line.substitutes
          .map((sub) => formatIngredientCoreText({ ...(sub || {}), substitutes: [] }))
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

  function formatIngredientText(line) {
    return getIngredientDisplayParts(line).text;
  }

  function formatNeedLineText(line) {
    const parts = getIngredientDisplayCoreParts(line);
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
