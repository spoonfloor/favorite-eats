// --- Display modes ---
const SHOW_RECIPE_TEXT = true; // normal human-readable output
const SHOW_DEBUG_LOC_TAGS = false; // e.g., esse, 2_frid, spin, baby
const SHOW_DEBUG_MEASURE_TAGS = false; // e.g., marinar, 4½ cup

// --- Canonical measure order (normalized units) ---
const MEASURE_ORDER = [
  '⅛ tsp',
  '¼ tsp',
  '½ tsp',
  '1 tsp',
  '½ tbsp',
  '1 tbsp',
  '⅛ cup',
  '¼ cup',
  '⅓ cup',
  '½ cup',
  '⅔ cup',
  '¾ cup',
  '1 cup',
  '2 cup',
  '4 cup',
  '8 cup',
];

const RECIPE_EDITOR_HOME_LOCATION_DEFS =
  typeof window !== 'undefined' && typeof window.getHomeLocationDefs === 'function'
    ? window.getHomeLocationDefs()
    : [
        { id: 'fridge', label: 'fridge' },
        { id: 'freezer', label: 'freezer' },
        { id: 'above fridge', label: 'above fridge' },
        { id: 'cereal cabinet', label: 'cereal cabinet' },
        { id: 'pantry', label: 'pantry' },
        { id: 'spices', label: 'spices' },
        { id: 'fruit stand', label: 'fruit stand' },
        { id: 'coffee bar', label: 'coffee bar' },
        { id: 'none', label: 'no location' },
      ];
const RECIPE_EDITOR_HOME_LOCATION_ORDER = RECIPE_EDITOR_HOME_LOCATION_DEFS
  .map((entry) => String(entry?.id || '').trim().toLowerCase())
  .filter((locationId) => locationId && locationId !== 'none');

// --- Canonical order for locations (base version used in debug and general logic) ---
const LOCATION_ORDER = (() => {
  const base = ['', ...RECIPE_EDITOR_HOME_LOCATION_ORDER];
  const spicesIndex = base.indexOf('spices');
  const measuresIndex = base.indexOf('measures');
  if (measuresIndex !== -1) return base;
  const insertIndex = spicesIndex === -1 ? Math.max(1, base.length) : spicesIndex + 1;
  base.splice(insertIndex, 0, 'measures');
  return base;
})();

// --- Custom order for “You will need” section only ---
const NEED_LOCATION_ORDER = [...RECIPE_EDITOR_HOME_LOCATION_ORDER, '', 'measures'];

const YWN_LOCATION_ORDER_SET = new Set(NEED_LOCATION_ORDER);

/**
 * Map DB/editor `locationAtHome` to a key that `NEED_LOCATION_ORDER` will render.
 * Blank, "none", and unknown locations → '' (Misc). Known ids stay lowercased.
 */
function ywnLocationBucketForHome(raw) {
  const loc = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!loc || loc === 'none') return '';
  if (YWN_LOCATION_ORDER_SET.has(loc)) return loc;
  return '';
}

function recipeEditorHrefWithCurrentAdapter(href) {
  return href;
}

// --- You Will Need helpers ---
function formatNeedLine(ing) {
  if (ing && Array.isArray(ing.ywnBuckets) && ing.ywnBuckets.length) {
    return formatYwnBucketSummaryLine(ing);
  }
  if (typeof window.formatNeedLineText === 'function') {
    return window.formatNeedLineText(ing, { intent: 'cooking' });
  }

  const fallbackBaseName = `${ing.variant ? ing.variant + ' ' : ''}${ing.name}`.trim();
  return fallbackBaseName || '';
}

function getNeedLineBaseName(ing) {
  const fallbackBaseName = `${ing.variant ? ing.variant + ' ' : ''}${ing.name}`.trim();
  if (typeof window.getIngredientDisplayCoreParts === 'function') {
    try {
      return window.getIngredientDisplayCoreParts(ing).nameText || fallbackBaseName;
    } catch (_) {
      return fallbackBaseName;
    }
  }
  return fallbackBaseName;
}

function parseYwnPositiveQuantity(value) {
  if (typeof window.parseNumericQuantityValue === 'function') {
    const parsed = window.parseNumericQuantityValue(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatYwnQuantityText(quantity) {
  const numeric = Number(quantity);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  if (typeof window.decimalToFractionDisplay === 'function') {
    try {
      const formatted = String(
        window.decimalToFractionDisplay(numeric) || '',
      ).trim();
      if (formatted) return formatted;
    } catch (_) {}
  }
  return String(Number(numeric.toFixed(4)));
}

function formatYwnLeadTextFromIngredientShape({
  quantity = '',
  unit = '',
  size = '',
} = {}) {
  if (typeof window.getIngredientDisplayCoreParts === 'function') {
    try {
      return String(
        window.getIngredientDisplayCoreParts(
          {
            quantity,
            unit,
            size,
            name: '',
            variant: '',
          },
          { intent: 'cooking' },
        )?.leadText || '',
      ).trim();
    } catch (_) {}
  }
  return [
    formatYwnQuantityText(quantity),
    String(size || '').trim(),
    String(unit || '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function getYwnBucketSortPriority(bucket) {
  if (!bucket || typeof bucket !== 'object') return 99;
  if (bucket.kind === 'unspecified') return 0;
  if (bucket.kind === 'count') return 1;
  return 2;
}

function formatYwnBucketLeadText(bucket, ing) {
  if (!bucket || typeof bucket !== 'object') return '';
  if (bucket.kind === 'unspecified') return 'some';
  if (bucket.kind === 'measured') {
    const pol = window.favoriteEatsQuantityDisplayPolicy;
    if (pol && typeof pol.getMeasuredDisplayFromBase === 'function') {
      const display = pol.getMeasuredDisplayFromBase(
        bucket.family,
        bucket.baseQuantity,
        'cooking',
        undefined,
        {
          useMetric:
            typeof window.resolveIngredientLineUsesMetric === 'function'
              ? window.resolveIngredientLineUsesMetric(ing)
              : !!(ing && (ing.useMetric ?? ing.use_metric)),
        },
      );
      if (display) {
        const displayLabel = String(display.displayLabel || '').trim();
        if (displayLabel) return displayLabel;
        return formatYwnLeadTextFromIngredientShape({
          quantity: display.quantity,
          unit: display.unit,
        });
      }
    }
    return '';
  }
  return formatYwnLeadTextFromIngredientShape({
    quantity: bucket.quantity,
    unit: bucket.unit || '',
    size: bucket.size || '',
  });
}

function formatYwnBucketDetailText(buckets, ing) {
  const list = Array.isArray(buckets) ? buckets.filter(Boolean) : [];
  if (!list.length) return '';
  return list
    .slice()
    .sort(
      (a, b) =>
        getYwnBucketSortPriority(a) - getYwnBucketSortPriority(b) ||
        Number(a.order || 0) - Number(b.order || 0),
    )
    .map((bucket) => formatYwnBucketLeadText(bucket, ing))
    .filter(Boolean)
    .join(' + ');
}

function formatYwnBucketSummaryLine(ing) {
  const nameText = getNeedLineBaseName(ing);
  const detailText = formatYwnBucketDetailText(ing && ing.ywnBuckets, ing);
  const bits = [];
  if (detailText) bits.push(detailText);
  if (ing?.isOptional) bits.push('optional');
  const parenthetical = bits.join(', ');
  return [nameText, parenthetical ? `(${parenthetical})` : '']
    .filter(Boolean)
    .join(' ')
    .trim();
}

async function findYwnShoppingItemMatchByNameViaDataService(rawName) {
  const name = String(rawName || '').trim();
  if (!name) return null;
  if (
    window.dataService &&
    typeof window.dataService.lookupShoppingItemByName === 'function'
  ) {
    try {
      return (await window.dataService.lookupShoppingItemByName({ name })) || null;
    } catch (err) {
      console.error('dataService.lookupShoppingItemByName failed:', err);
      return null;
    }
  }
  return null;
}

function isRecipePlannerModeActive() {
  try {
    if (document.body?.dataset?.page === 'recipe-editor') {
      return document.body?.dataset?.plannerMode === 'on';
    }
  } catch (_) {}
  try {
    if (
      window.plannerMode &&
      typeof window.plannerMode.isEnabled === 'function'
    ) {
      return !!window.plannerMode.isEnabled();
    }
  } catch (_) {}
  try {
    return document.body?.dataset?.plannerMode === 'on';
  } catch (_) {
    return false;
  }
}

function recipeEditorDataServiceIsSupabaseActive() {
  return !!(window.dataService && window.dataService.useSupabase);
}

// Step row placeholder: default (native editor) vs web when the recipe has no real steps.
const DEFAULT_STEP_PLACEHOLDER_TEXT = 'Add a step.';
const WEB_MODE_NO_INSTRUCTIONS_HINT = 'Use the Force.';

function isRecipeEditorStepPromptDisplayText(s) {
  const t = String(s == null ? '' : s).trim();
  return (
    !t || t === DEFAULT_STEP_PLACEHOLDER_TEXT || t === WEB_MODE_NO_INSTRUCTIONS_HINT
  );
}

/** Synthetic step id when planner mode renders instructions with no persisted steps. */
const PLANNER_INSTRUCTIONS_EMPTY_ROW_STEP_ID = 'planner-instructions-empty';

function appendPlannerInstructionsEmptyPlaceholderRow(stepsSection) {
  if (!stepsSection) return;

  const line = document.createElement('div');
  line.className =
    'instruction-line numbered instruction-line--placeholder';
  line.dataset.stepType = 'step';
  line.dataset.stepId = PLANNER_INSTRUCTIONS_EMPTY_ROW_STEP_ID;

  const num = document.createElement('span');
  num.className = 'step-num';
  num.textContent = '1.';

  const text = document.createElement('span');
  text.className = 'step-text placeholder-prompt';
  text.dataset.stepId = PLANNER_INSTRUCTIONS_EMPTY_ROW_STEP_ID;
  text.dataset.placeholder = WEB_MODE_NO_INSTRUCTIONS_HINT;
  text.textContent = '';

  if (typeof ensureStepTextNotEmpty === 'function') {
    ensureStepTextNotEmpty(text);
  }

  line.appendChild(num);
  line.appendChild(text);
  stepsSection.appendChild(line);
}

try {
  window.isRecipeEditorStepPromptDisplayText = isRecipeEditorStepPromptDisplayText;
} catch (_) {}

function getRecipePlannerServingsApi() {
  return window.favoriteEatsRecipePlannerServings || {};
}

function getRecipeModelId(recipe) {
  const api = getRecipePlannerServingsApi();
  if (typeof api.getRecipeModelId === 'function') {
    return api.getRecipeModelId(recipe, { fallbackRecipeId: window.recipeId });
  }
  const raw = Number(recipe?.id ?? window.recipeId);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null;
}

function loadRecipePlannerServingsMap() {
  const api = getRecipePlannerServingsApi();
  if (typeof api.loadMap === 'function') return api.loadMap();
  try {
    const raw = localStorage.getItem(window.favoriteEatsStorageKeys.recipePlannerServings);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistRecipePlannerServingsMap(nextMap) {
  const api = getRecipePlannerServingsApi();
  if (typeof api.persistMap === 'function') {
    api.persistMap(nextMap);
    return;
  }
  try {
    localStorage.setItem(
      window.favoriteEatsStorageKeys.recipePlannerServings,
      JSON.stringify(
        nextMap && typeof nextMap === 'object' && !Array.isArray(nextMap)
          ? nextMap
          : {}
      )
    );
  } catch (_) {}
}

function getRecipeBaseServingsDefault(recipe) {
  const api = getRecipePlannerServingsApi();
  if (typeof api.getBaseDefault === 'function') return api.getBaseDefault(recipe);
  if (!recipe) return null;
  return roundRecipePlannerServingsValue(recipe.servingsDefault);
}

function getRecipePlannerServingsBounds(recipe) {
  const api = getRecipePlannerServingsApi();
  if (typeof api.getBounds === 'function') return api.getBounds(recipe);
  return null;
}

function getRecipePlannerServingsMultiplier(recipe) {
  const api = getRecipePlannerServingsApi();
  if (typeof api.getMultiplier === 'function') {
    return api.getMultiplier(recipe, {
      fallbackRecipeId: window.recipeId,
      scrubInvalid: true,
    });
  }
  return 1;
}

function parseIngredientQuantityRangeForDisplay(line) {
  const amountModel = window.favoriteEatsRecipeIngredientAmountModel;
  if (amountModel && typeof amountModel.fromRow === 'function') {
    const amount = amountModel.fromRow(line);
    if (amount?.kind === 'scalar') {
      return {
        quantityMin: amount.value,
        quantityMax: amount.value,
        quantityIsApprox: !!amount.isApprox,
      };
    }
    if (amount?.kind === 'range') {
      return {
        quantityMin: amount.min,
        quantityMax: amount.max,
        quantityIsApprox: !!amount.isApprox,
      };
    }
  }

  const min = Number(line?.quantityMin);
  const max = Number(line?.quantityMax);
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;
  if (hasMin || hasMax) {
    return {
      quantityMin: hasMin ? min : hasMax ? max : null,
      quantityMax: hasMax ? max : hasMin ? min : null,
      quantityIsApprox: !!line?.quantityIsApprox,
    };
  }

  try {
    if (typeof window.parseIngredientQuantityDescriptor === 'function') {
      const parsed = window.parseIngredientQuantityDescriptor(line?.quantity);
      const parsedMin = Number(parsed?.quantityMin);
      const parsedMax = Number(parsed?.quantityMax);
      const parsedMinOk = Number.isFinite(parsedMin) && parsedMin > 0;
      const parsedMaxOk = Number.isFinite(parsedMax) && parsedMax > 0;
      if (parsedMinOk || parsedMaxOk) {
        return {
          quantityMin: parsedMinOk ? parsedMin : parsedMaxOk ? parsedMax : null,
          quantityMax: parsedMaxOk ? parsedMax : parsedMinOk ? parsedMin : null,
          quantityIsApprox: !!parsed?.quantityIsApprox,
        };
      }
    }
  } catch (_) {}

  try {
    if (typeof parseNumericQuantityValue === 'function') {
      const scalar = Number(parseNumericQuantityValue(line?.quantity));
      if (Number.isFinite(scalar) && scalar > 0) {
        return {
          quantityMin: scalar,
          quantityMax: scalar,
          quantityIsApprox: !!line?.quantityIsApprox,
        };
      }
    }
  } catch (_) {}

  const fallbackScalar = Number(String(line?.quantity == null ? '' : line.quantity).trim());
  if (Number.isFinite(fallbackScalar) && fallbackScalar > 0) {
    return {
      quantityMin: fallbackScalar,
      quantityMax: fallbackScalar,
      quantityIsApprox: !!line?.quantityIsApprox,
    };
  }
  return null;
}

function scaleIngredientForRecipePlannerServingsDisplay(line, recipe) {
  if (!line || line.rowType === 'heading') return line;
  const multiplier = getRecipePlannerServingsMultiplier(recipe);
  if (!Number.isFinite(multiplier) || multiplier <= 0 || Math.abs(multiplier - 1) < 1e-9) {
    return line;
  }

  const parsed = parseIngredientQuantityRangeForDisplay(line);
  if (!parsed) return line;

  const normalizeQty = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (typeof window.normalizeActionableQuantity === 'function') {
      const normalized = window.normalizeActionableQuantity(numeric, line?.unit || '');
      if (Number.isFinite(Number(normalized)) && Number(normalized) > 0) {
        return Number(normalized);
      }
    }
    return Math.round(numeric * 100) / 100;
  };
  const scaledMin = normalizeQty(parsed.quantityMin * multiplier);
  const scaledMax = normalizeQty(parsed.quantityMax * multiplier);
  if (
    !Number.isFinite(scaledMin) ||
    scaledMin <= 0 ||
    !Number.isFinite(scaledMax) ||
    scaledMax <= 0
  ) {
    return line;
  }

  return {
    ...line,
    quantityMin: scaledMin,
    quantityMax: scaledMax,
    quantityIsApprox: !!parsed.quantityIsApprox,
  };
}

function roundRecipePlannerServingsValue(rawValue) {
  const api = getRecipePlannerServingsApi();
  if (typeof api.roundValue === 'function') return api.roundValue(rawValue);
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 2) / 2;
}

function clampRecipePlannerServingsValue(rawValue, bounds) {
  const api = getRecipePlannerServingsApi();
  if (typeof api.clampValue === 'function') return api.clampValue(rawValue, bounds);
  if (!bounds) return null;
  if (bounds.baseDefault == null) {
    const rounded = roundRecipePlannerServingsValue(rawValue);
    if (rounded == null) return null;
    return 1;
  }
  const rounded = roundRecipePlannerServingsValue(rawValue);
  if (rounded == null) return null;
  return Math.max(bounds.min, Math.min(bounds.max, rounded));
}

function formatRecipePlannerServingsDisplay(rawValue) {
  const normalized = roundRecipePlannerServingsValue(rawValue);
  if (normalized == null) return '';
  if (Number.isInteger(normalized)) return String(normalized);
  if (typeof decimalToFractionDisplay === 'function') {
    return decimalToFractionDisplay(normalized, [2]);
  }
  return String(normalized);
}

function getRecipePlannerServingsStoredValue(recipe) {
  if (typeof window.favoriteEatsGetRecipePlannerServingsStoredValueForUi === 'function') {
    const rid = getRecipeModelId(recipe);
    if (rid != null) {
      const fromPlanAndStore =
        window.favoriteEatsGetRecipePlannerServingsStoredValueForUi(rid, recipe);
      if (Number.isFinite(Number(fromPlanAndStore)) && Number(fromPlanAndStore) > 0) {
        return fromPlanAndStore;
      }
    }
  }
  const api = getRecipePlannerServingsApi();
  if (typeof api.getStoredValue === 'function') {
    return api.getStoredValue(recipe, {
      fallbackRecipeId: window.recipeId,
      scrubInvalid: true,
    });
  }
  const recipeId = getRecipeModelId(recipe);
  if (recipeId == null) return null;
  const raw = loadRecipePlannerServingsMap()[String(recipeId)];
  const bounds = getRecipePlannerServingsBounds(recipe);
  if (!bounds) return null;
  return clampRecipePlannerServingsValue(raw, bounds);
}

function setRecipePlannerServingsStoredValue(recipe, nextValue) {
  const api = getRecipePlannerServingsApi();
  if (typeof api.setStoredValue === 'function') {
    api.setStoredValue(recipe, nextValue, { fallbackRecipeId: window.recipeId });
    return;
  }
  const recipeId = getRecipeModelId(recipe);
  if (recipeId == null) return;
  const bounds = getRecipePlannerServingsBounds(recipe);
  if (!bounds) return;
  const map = loadRecipePlannerServingsMap();
  const next = clampRecipePlannerServingsValue(nextValue, bounds);
  if (next == null || next === bounds.baseDefault) {
    delete map[String(recipeId)];
  } else {
    map[String(recipeId)] = next;
  }
  persistRecipePlannerServingsMap(map);
}

function applyRecipePlannerServingsToModel(recipe, nextValue, { persist = true } = {}) {
  if (!recipe) return null;
  const bounds = getRecipePlannerServingsBounds(recipe);
  if (!bounds) return null;
  const next = clampRecipePlannerServingsValue(nextValue, bounds);
  const allowsUnset = bounds.baseDefault == null;
  if (next == null && !allowsUnset) return null;
  if (next == null && allowsUnset) {
    if (!recipe.servings || typeof recipe.servings !== 'object') {
      recipe.servings = {
        default: null,
        min: null,
        max: null,
      };
    } else {
      recipe.servings.default = null;
    }
    recipe.servingsDefault = null;
    recipe._plannerModeCurrentServingsDefault = null;
    if (persist) setRecipePlannerServingsStoredValue(recipe, null);
    try {
      if (typeof window.recipePlannerModeSyncAppBar === 'function') {
        window.recipePlannerModeSyncAppBar();
      }
    } catch (_) {}
    return null;
  }
  if (!recipe.servings || typeof recipe.servings !== 'object') {
    recipe.servings = {
      default: bounds.baseDefault,
      min: null,
      max: null,
    };
  }
  if (persist) setRecipePlannerServingsStoredValue(recipe, next);
  recipe.servingsDefault = next;
  recipe.servings.default = next;
  recipe._plannerModeCurrentServingsDefault = next;
  try {
    if (typeof window.recipePlannerModeSyncAppBar === 'function') {
      window.recipePlannerModeSyncAppBar();
    }
  } catch (_) {}
  return next;
}

function primeRecipePlannerModeServings(recipe) {
  if (!recipe) return;
  const bounds = getRecipePlannerServingsBounds(recipe);
  if (!bounds) return;
  const stored = getRecipePlannerServingsStoredValue(recipe);
  const nextValue =
    Number.isFinite(Number(stored)) && stored != null ? stored : bounds.baseDefault;
  applyRecipePlannerServingsToModel(recipe, nextValue, { persist: false });
}

function recipePlannerModeCanResetServings(recipe) {
  const bounds = getRecipePlannerServingsBounds(recipe);
  if (!bounds) return false;
  const current = roundRecipePlannerServingsValue(
    window.recipeData?.servingsDefault ?? recipe?.servingsDefault
  );
  return current != null && current !== bounds.baseDefault;
}

function resetRecipePlannerModeServings(recipe = window.recipeData) {
  const bounds = getRecipePlannerServingsBounds(recipe);
  if (!bounds) return;
  applyRecipePlannerServingsToModel(recipe, bounds.baseDefault);
  renderServingsRow(recipe);
  if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
    window.recipeEditorRerenderIngredientsFromModel();
  }
}

function getRecipePlannerServingsDisplayValue(recipe) {
  const bounds = getRecipePlannerServingsBounds(recipe);
  if (!bounds) return null;
  return roundRecipePlannerServingsValue(recipe?.servingsDefault) ?? bounds.baseDefault;
}

function getNextRecipePlannerServingsValue(recipe, delta) {
  const bounds = getRecipePlannerServingsBounds(recipe);
  if (!bounds) return null;
  const currentServings = roundRecipePlannerServingsValue(recipe?.servingsDefault);
  const currentStepValue =
    Number.isFinite(Number(currentServings)) && Number(currentServings) > 0 ? currentServings : 0;
  const isUnsetMode = bounds.baseDefault == null;
  const stepMin = isUnsetMode ? 0 : bounds.min;
  const stepMax = isUnsetMode ? 1 : bounds.max;
  const snapPositiveTo = isUnsetMode
    ? 1
    : Number.isFinite(Number(bounds.baseDefault)) && Number(bounds.baseDefault) > 0
      ? bounds.baseDefault
      : 1;
  const nextCandidate =
    window.listRowStepper &&
    typeof window.listRowStepper.getNextStepQty === 'function'
      ? window.listRowStepper.getNextStepQty(currentStepValue, delta, {
          min: stepMin,
          max: stepMax,
          snapPositiveTo,
        })
      : currentStepValue > 0
        ? currentStepValue + Number(delta || 0)
        : Number(delta || 0) > 0
          ? bounds.baseDefault != null
            ? bounds.baseDefault
            : 1
          : currentStepValue + Number(delta || 0);
  return clampRecipePlannerServingsValue(nextCandidate, bounds);
}

function parseRecipePlannerServingsInputValue(rawValue) {
  const text = String(rawValue == null ? '' : rawValue).trim();
  if (!text) return null;
  if (typeof parseNumericQuantityValue === 'function') {
    const parsed = parseNumericQuantityValue(text);
    if (parsed != null) return Number(parsed);
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function commitRecipePlannerServingsInputValue(recipe, rawValue, { fallbackValue = null } = {}) {
  const parsed = parseRecipePlannerServingsInputValue(rawValue);
  const candidate =
    parsed == null
      ? fallbackValue != null
        ? fallbackValue
        : getRecipePlannerServingsDisplayValue(recipe)
      : parsed;
  const rounded = roundRecipePlannerServingsValue(candidate);
  return applyRecipePlannerServingsToModel(recipe, rounded);
}

function syncActiveRecipePlannerServingsFromStorage() {
  if (!isRecipePlannerModeActive()) return;
  const recipeModel = window.recipeData;
  if (!recipeModel) return;
  primeRecipePlannerModeServings(recipeModel);
  renderServingsRow(recipeModel);
  if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
    window.recipeEditorRerenderIngredientsFromModel();
  }
}

async function navigateToShoppingListTarget(rawName, resolver) {
  const name = String(rawName || '').trim();
  const match =
    typeof resolver === 'function'
      ? await resolver(name)
      : null;
  try {
    if (match && Number.isFinite(Number(match.id)) && Number(match.id) > 0) {
      sessionStorage.setItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetId,
        String(Math.trunc(Number(match.id)))
      );
      sessionStorage.setItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetName,
        String(match.name || name).trim()
      );
    } else if (name) {
      sessionStorage.removeItem(window.favoriteEatsSessionKeys.shoppingNavTargetId);
      sessionStorage.setItem(window.favoriteEatsSessionKeys.shoppingNavTargetName, name);
    } else {
      sessionStorage.removeItem(window.favoriteEatsSessionKeys.shoppingNavTargetId);
      sessionStorage.removeItem(window.favoriteEatsSessionKeys.shoppingNavTargetName);
    }
  } catch (_) {}
  window.location.href = recipeEditorHrefWithCurrentAdapter('shopping.html');
}

async function navigateToYwnShoppingTarget(rawName) {
  const name = String(rawName || '').trim();
  if (!name) return;

  if (isRecipePlannerModeActive()) {
    await navigateToShoppingListTarget(
      name,
      findYwnShoppingItemMatchByNameViaDataService
    );
    return;
  }

  try {
    const match = await findYwnShoppingItemMatchByNameViaDataService(name);
    if (match) {
      sessionStorage.setItem('selectedShoppingItemId', String(match.id));
      sessionStorage.setItem('selectedShoppingItemName', String(match.name));
      sessionStorage.removeItem('selectedShoppingItemIsNew');
      const goEditor = () => {
        window.location.href =
          recipeEditorHrefWithCurrentAdapter('shoppingEditor.html');
      };
      if (typeof window.recipeEditorAttemptExit === 'function') {
        void window.recipeEditorAttemptExit({
          reason: 'manage',
          onClean: goEditor,
          onDiscard: goEditor,
          onSaveSuccess: goEditor,
        });
        return;
      }
      goEditor();
      return;
    }
  } catch (_) {}

  const fallback = () => {
    window.location.href = recipeEditorHrefWithCurrentAdapter('shopping.html');
  };
  if (typeof window.recipeEditorAttemptExit === 'function') {
    void window.recipeEditorAttemptExit({
      reason: 'manage',
      onClean: fallback,
      onDiscard: fallback,
      onSaveSuccess: fallback,
    });
    return;
  }
  fallback();
}

function isYwnMasterLinkActive(linkEl, e) {
  if (!(linkEl instanceof HTMLElement)) return false;
  if (!linkEl.classList.contains('ingredient-master-link')) return false;
  if (!e || !e.altKey) return false;
  const line = linkEl.closest('.ingredient-line');
  return !!(line && line.classList.contains('ywn-line--hint-active'));
}

function buildYwnMasterLink(label, ingredient) {
  const link = document.createElement('a');
  link.href = recipeEditorHrefWithCurrentAdapter('shopping.html');
  link.className = isRecipePlannerModeActive()
    ? 'ingredient-shopping-link ywn-shopping-link'
    : 'ingredient-master-link ywn-master-link';
  link.textContent = label;
  link.tabIndex = isRecipePlannerModeActive() ? 0 : -1;

  link.addEventListener('click', (e) => {
    if (!e) return;
    e.preventDefault();
    if (!isRecipePlannerModeActive() && !isYwnMasterLinkActive(link, e)) return;
    e.stopPropagation();
    void navigateToYwnShoppingTarget(ingredient && ingredient.name);
  });

  return link;
}

function appendYwnLineTextWithMasterLink(span, ing) {
  if (!span || !ing) return;
  const fullText = formatNeedLine(ing);
  const baseName = getNeedLineBaseName(ing);
  if (!baseName) {
    span.appendChild(document.createTextNode(fullText));
    return;
  }

  const fullLower = String(fullText).toLowerCase();
  const baseLower = String(baseName).toLowerCase();
  const idx = fullLower.indexOf(baseLower);
  if (idx === -1) {
    span.appendChild(document.createTextNode(fullText));
    return;
  }

  const before = fullText.slice(0, idx);
  const matched = fullText.slice(idx, idx + baseName.length);
  const after = fullText.slice(idx + baseName.length);

  if (before) span.appendChild(document.createTextNode(before));
  span.appendChild(buildYwnMasterLink(matched || baseName, ing));
  if (after) span.appendChild(document.createTextNode(after));
}

function initYwnMasterLinkController(needWrapper) {
  if (!needWrapper) return;

  try {
    if (typeof needWrapper._teardownYwnMasterLinkController === 'function') {
      needWrapper._teardownYwnMasterLinkController();
    }
  } catch (_) {}

  const ACTIVE_CLASS = 'ywn-line--hint-active';
  let hoverLine = null;
  let hoverModifierActive = false;

  const hasLink = (line) =>
    !!(line && line.querySelector && line.querySelector('.ingredient-master-link'));

  const findLine = (target) => {
    if (!target || !target.closest) return null;
    const line = target.closest('.ingredient-line');
    if (!line || !needWrapper.contains(line)) return null;
    return hasLink(line) ? line : null;
  };

  const apply = () => {
    const winner = hoverModifierActive ? hoverLine : null;
    needWrapper.querySelectorAll(`.${ACTIVE_CLASS}`).forEach((line) => {
      line.classList.remove(ACTIVE_CLASS);
    });
    if (winner) winner.classList.add(ACTIVE_CLASS);
  };

  const onMouseOver = (e) => {
    hoverLine = findLine(e && e.target);
    apply();
  };

  const onMouseOut = (e) => {
    const related = e && e.relatedTarget;
    const nextLine = findLine(related);
    if (nextLine === hoverLine) return;
    if (related && needWrapper.contains(related)) {
      hoverLine = nextLine;
    } else {
      hoverLine = null;
    }
    apply();
  };

  const syncModifier = (e) => {
    const next = !!(e && e.altKey);
    if (next === hoverModifierActive) return;
    hoverModifierActive = next;
    apply();
  };

  const clearModifier = () => {
    if (!hoverModifierActive) return;
    hoverModifierActive = false;
    apply();
  };

  needWrapper.addEventListener('mouseover', onMouseOver);
  needWrapper.addEventListener('mouseout', onMouseOut);
  needWrapper.addEventListener('mouseleave', onMouseOut);
  document.addEventListener('keydown', syncModifier, true);
  document.addEventListener('keyup', syncModifier, true);
  window.addEventListener('blur', clearModifier);

  apply();

  needWrapper._teardownYwnMasterLinkController = () => {
    needWrapper.removeEventListener('mouseover', onMouseOver);
    needWrapper.removeEventListener('mouseout', onMouseOut);
    needWrapper.removeEventListener('mouseleave', onMouseOut);
    document.removeEventListener('keydown', syncModifier, true);
    document.removeEventListener('keyup', syncModifier, true);
    window.removeEventListener('blur', clearModifier);
    hoverLine = null;
    hoverModifierActive = false;
    needWrapper.querySelectorAll(`.${ACTIVE_CLASS}`).forEach((line) => {
      line.classList.remove(ACTIVE_CLASS);
    });
  };
}

function normalizeYwnIngredientRows(rawRows) {
  const out = [];
  let activeAltAnchorLocation = '';

  (Array.isArray(rawRows) ? rawRows : []).forEach((row) => {
    if (!row) return;
    if (row.rowType === 'heading') {
      // Headings break OR chains in the editor model.
      activeAltAnchorLocation = '';
      return;
    }

    const next = { ...row };
    const ownBucket = ywnLocationBucketForHome(row.locationAtHome);
    if (row.isAlt) {
      // Preserve explicit alt-row location; only inherit when alt location is blank.
      next.locationAtHome = ownBucket || activeAltAnchorLocation;
    } else {
      activeAltAnchorLocation = ownBucket;
      next.locationAtHome = ownBucket;
    }
    out.push(next);
  });

  return out;
}

/**
 * Map raw recipe `name` to the shopping/DB canonical name for YWN deduping, so
 * e.g. "carrot" and "carrots" (synonym) merge into one line. Uses per-list cache.
 * @param {string} rawName
 * @param {Map<string, string>} cache  trimmed input → merge name
 * @returns {string}
 */
function resolveYwnMergeNameKey(rawName, cache) {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return '';
  if (cache.has(trimmed)) return cache.get(trimmed);
  cache.set(trimmed, trimmed);
  return trimmed;
}

async function resolveYwnMergeNameKeyAsync(rawName, cache) {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return '';
  if (cache.has(trimmed)) return cache.get(trimmed);
  let match = null;
  if (window.dataService && typeof window.dataService.lookupShoppingItemByName === 'function') {
    try {
      match = await window.dataService.lookupShoppingItemByName({
        name: trimmed,
      });
    } catch (_) {}
  }
  const nameForMerge = match
    ? String(match.name == null ? trimmed : match.name).trim() || trimmed
    : trimmed;
  cache.set(trimmed, nameForMerge);
  return nameForMerge;
}

/**
 * Stable merge identity + YWN line label. Prefers `ing.lemma` (from the DB join
 * on load) so rows that share a master item merge even when `ing.name` differs
 * in singular/plural or display text.
 * @returns {{ nameKey: string, displayName: string }}
 */
function ywnNameKeyAndDisplayForRow(ing, mergeNameCache) {
  const lemma = ing && String(ing.lemma || '').trim();
  if (lemma) {
    const name = String(ing.name || '').trim();
    return {
      nameKey: lemma.toLowerCase(),
      displayName: name || lemma,
    };
  }
  const nameKey = resolveYwnMergeNameKey(ing && ing.name, mergeNameCache);
  return { nameKey, displayName: nameKey };
}

async function ywnNameKeyAndDisplayForRowAsync(ing, mergeNameCache, lemmaCache) {
  const lemma = ing && String(ing.lemma || '').trim();
  if (lemma) {
    const lemmaKey = lemma.toLowerCase();
    if (!lemmaCache.has(lemmaKey)) {
      let displayFromLemma = null;
      if (
        window.dataService &&
        typeof window.dataService.lookupIngredientNameByLemma === 'function'
      ) {
        try {
          displayFromLemma =
            await window.dataService.lookupIngredientNameByLemma({ lemma });
        } catch (_) {}
      }
      lemmaCache.set(
        lemmaKey,
        displayFromLemma ? String(displayFromLemma).trim() : null,
      );
    }
    const resolvedLemmaName = lemmaCache.get(lemmaKey);
    if (resolvedLemmaName) {
      return { nameKey: lemmaKey, displayName: resolvedLemmaName };
    }
    const nameTrim = String(ing.name || '').trim();
    let m = null;
    if (
      nameTrim &&
      window.dataService &&
      typeof window.dataService.lookupShoppingItemByName === 'function'
    ) {
      try {
        m = await window.dataService.lookupShoppingItemByName({
          name: nameTrim,
        });
      } catch (_) {}
    }
    const displayName = m
      ? String(m.name == null ? ing.name : m.name).trim() || nameTrim || lemma
      : nameTrim || lemma;
    return { nameKey: lemmaKey, displayName };
  }
  const nameKey = await resolveYwnMergeNameKeyAsync(ing && ing.name, mergeNameCache);
  return { nameKey, displayName: nameKey };
}

async function mergeByIngredientAsync(list) {
  const merged = [];
  const map = new Map();
  const mergeNameCache = new Map();
  const lemmaCache = new Map();
  const normalizedUnit = (value) =>
    String(value == null ? '' : value).trim().toLowerCase();
  const addBucketToTarget = (target, bucket) => {
    if (!target || !bucket || typeof bucket !== 'object') return;
    if (!Array.isArray(target.ywnBuckets)) target.ywnBuckets = [];
    const bucketKey = String(bucket.key || '').trim();
    if (!bucketKey) return;
    let existing = target.ywnBuckets.find((b) => b && b.key === bucketKey);
    if (!existing) {
      existing = {
        ...bucket,
        order: target.ywnBuckets.length,
      };
      target.ywnBuckets.push(existing);
      return;
    }
    if (bucket.kind === 'measured') {
      existing.baseQuantity = Number(
        (
          Number(existing.baseQuantity || 0) + Number(bucket.baseQuantity || 0)
        ).toFixed(6),
      );
      return;
    }
    if (bucket.kind === 'unspecified') {
      existing.quantity = Number(
        (Number(existing.quantity || 0) + Number(bucket.quantity || 0)).toFixed(
          4,
        ),
      );
      return;
    }
    existing.quantity = Number(
      (Number(existing.quantity || 0) + Number(bucket.quantity || 0)).toFixed(4),
    );
  };
  const bucketForIngredient = (ing) => {
    const quantity = parseYwnPositiveQuantity(ing?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        key: 'unspecified',
        kind: 'unspecified',
        quantity: 1,
      };
    }

    const unit = normalizedUnit(ing?.unit);
    const size = String(ing?.size || '').trim();
    const pol = window.favoriteEatsQuantityDisplayPolicy;
    if (pol && typeof pol.convertIngredientQuantityToMeasuredBase === 'function') {
      const measured = pol.convertIngredientQuantityToMeasuredBase(quantity, unit);
      if (measured) {
        return {
          key: `measured:${measured.family}`,
          kind: 'measured',
          family: measured.family,
          baseQuantity: measured.baseQuantity,
        };
      }
    }

    if (unit || size) {
      return {
        key: `exact:${unit}|${size.toLowerCase()}`,
        kind: 'exact',
        quantity,
        unit,
        size,
      };
    }

    return {
      key: 'count',
      kind: 'count',
      quantity,
      unit: '',
      size: '',
    };
  };

  for (const ing of list) {
    const { nameKey, displayName } = await ywnNameKeyAndDisplayForRowAsync(
      ing,
      mergeNameCache,
      lemmaCache,
    );
    const key = `${ing.variant || ''}|${nameKey}|${ing.locationAtHome || ''}`;
    if (!map.has(key)) {
      const next = { ...ing, name: displayName, ywnBuckets: [] };
      addBucketToTarget(next, bucketForIngredient(ing));
      map.set(key, next);
    } else {
      const existing = map.get(key);
      addBucketToTarget(existing, bucketForIngredient(ing));
      if (
        String(existing.size || '').trim() !== String(ing.size || '').trim()
      ) {
        existing.size = '';
      }
      existing.isOptional = existing.isOptional || ing.isOptional;
      existing.isDeprecated = !!(existing.isDeprecated || ing.isDeprecated);
      existing.variantDeprecated = !!(
        existing.variantDeprecated || ing.variantDeprecated
      );
      existing.isAlt = !!(existing.isAlt && ing.isAlt);
    }
  }

  map.forEach((v) => merged.push(v));
  return merged;
}

function mergeByIngredient(list) {
  const merged = [];
  const map = new Map();
  const mergeNameCache = new Map();
  const toPositiveNumberOrNull = (value) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  };
  const normalizedUnit = (value) => String(value == null ? '' : value).trim().toLowerCase();

  list.forEach((ing) => {
    const { nameKey, displayName } = ywnNameKeyAndDisplayForRow(
      ing,
      mergeNameCache
    );
    // Merge by ingredient identity + variant + location (not size), so singular/
    // plural duplicates or differing size text for the same master item collapse.
    const key = `${ing.variant || ''}|${nameKey}|${ing.locationAtHome || ''}`;
    if (!map.has(key)) {
      map.set(key, { ...ing, name: displayName });
    } else {
      const existing = map.get(key);
      const sameUnit = normalizedUnit(existing.unit) === normalizedUnit(ing.unit);
      if (sameUnit) {
        const existingQty = toPositiveNumberOrNull(existing.quantity);
        const incomingQty = toPositiveNumberOrNull(ing.quantity);
        if (existingQty != null && incomingQty != null) {
          existing.quantity = existingQty + incomingQty;
        }

        const existingMin = toPositiveNumberOrNull(existing.quantityMin);
        const existingMax = toPositiveNumberOrNull(existing.quantityMax);
        const incomingMin = toPositiveNumberOrNull(ing.quantityMin);
        const incomingMax = toPositiveNumberOrNull(ing.quantityMax);
        const leftForMin = existingMin ?? existingQty;
        const rightForMin = incomingMin ?? incomingQty;
        const leftForMax = existingMax ?? existingQty ?? existingMin;
        const rightForMax = incomingMax ?? incomingQty ?? incomingMin;

        if (leftForMin != null && rightForMin != null) {
          existing.quantityMin = leftForMin + rightForMin;
        }
        if (leftForMax != null && rightForMax != null) {
          existing.quantityMax = leftForMax + rightForMax;
        }
      }
      if (
        String(existing.size || '').trim() !== String(ing.size || '').trim()
      ) {
        // Mixed size descriptors across merged lines should not imply one size.
        existing.size = '';
      }
      existing.isOptional = existing.isOptional || ing.isOptional;
      existing.isDeprecated = !!(existing.isDeprecated || ing.isDeprecated);
      existing.variantDeprecated = !!(
        existing.variantDeprecated || ing.variantDeprecated
      );
      // Preserve primary status when a primary + alt collapse into one merged row.
      existing.isAlt = !!(existing.isAlt && ing.isAlt);
    }
  });

  map.forEach((v) => merged.push(v));
  return merged;
}

// --- Shared page content resolver (non-breaking during migration) ---

const getPageContentContainer = () => document.getElementById('pageContent');

window.recipePlannerModeServings = Object.freeze({
  getBounds: getRecipePlannerServingsBounds,
  getDisplayValue: getRecipePlannerServingsDisplayValue,
  getNextValue: getNextRecipePlannerServingsValue,
  parseInputValue: parseRecipePlannerServingsInputValue,
  commitInputValue: commitRecipePlannerServingsInputValue,
  formatDisplay: formatRecipePlannerServingsDisplay,
  applyToModel: applyRecipePlannerServingsToModel,
});
window.recipePlannerModePrimeRecipe = primeRecipePlannerModeServings;
window.recipePlannerModeResetServings = resetRecipePlannerModeServings;
window.recipePlannerModeCanResetServings = recipePlannerModeCanResetServings;
window.recipePlannerModeSyncFromStorage = syncActiveRecipePlannerServingsFromStorage;

// --- Subhead insertion mode (hold Option/Alt) ---
function ensureIngredientSubheadInsertModeWiring() {
  if (window._ingredientSubheadInsertModeWired) return;
  window._ingredientSubheadInsertModeWired = true;

  // Hard-off: subhead insert mode is disabled.
  try {
    document.body.classList.remove('subhead-insert-mode');
  } catch (_) {}
}

function stripIngredientPlaceholders(section) {
  if (!section || !Array.isArray(section.ingredients)) return;
  const isPlaceholderish = (r) => {
    if (!r || r.rowType === 'heading') return false;
    if (r.isPlaceholder) return true;
    const isBlank = (val) => val == null || String(val).trim() === '';
    const nameIsPrompt =
      typeof r.name === 'string' &&
      r.name.trim().toLowerCase() === 'add an ingredient.';
    return (
      isBlank(r.quantity) &&
      isBlank(r.unit) &&
      isBlank(r.variant) &&
      isBlank(r.size) &&
      isBlank(r.prepNotes) &&
      isBlank(r.parentheticalNote) &&
      (isBlank(r.name) || nameIsPrompt)
    );
  };
  section.ingredients = section.ingredients.filter((r) => !isPlaceholderish(r));
}

function setManageButtonHiddenState(button, hidden) {
  if (!button) return;
  const isHidden = !!hidden;
  button.classList.toggle('manage-btn--hidden', isHidden);
  button.hidden = isHidden;
}

function rerenderIngredientsSectionFromModel() {
  const container = getPageContentContainer();
  if (!container) return;
  const ingredientsSection = container.querySelector('#ingredientsSection');
  if (!ingredientsSection) return;

  const recipe = window.recipeData;
  if (!recipe) return;

  ingredientsSection.innerHTML = '';
  const plannerMode = isRecipePlannerModeActive();

  const firstSection =
    Array.isArray(recipe.sections) && recipe.sections[0]
      ? recipe.sections[0]
      : null;
  if (firstSection) stripIngredientPlaceholders(firstSection);
  const rows = Array.isArray(firstSection?.ingredients)
    ? firstSection.ingredients
    : [];

  if (plannerMode) {
    const ingredientsHeader = document.createElement('h2');
    ingredientsHeader.className = 'section-header';
    ingredientsHeader.textContent = 'Ingredients';
    ingredientsSection.appendChild(ingredientsHeader);

    rows.forEach((row) => {
      let el = null;
      if (row && row.rowType === 'heading') {
        if (typeof window.renderIngredientHeading === 'function') {
          el = window.renderIngredientHeading(row);
        } else {
          el = document.createElement('div');
          el.className = 'ingredient-subsection-heading-line';
          const span = document.createElement('span');
          span.className = 'ingredient-subsection-heading-text';
          span.textContent = row.text || '';
          el.appendChild(span);
        }
      } else if (typeof renderIngredient === 'function') {
        el = renderIngredient(scaleIngredientForRecipePlannerServingsDisplay(row, recipe));
      }
      if (el) ingredientsSection.appendChild(el);
    });

    try {
      if (typeof window.recipeEditorRerenderYouWillNeedFromModel === 'function') {
        window.recipeEditorRerenderYouWillNeedFromModel();
      }
    } catch (_) {}
    return;
  }

  wireIngredientCtaDelegation(ingredientsSection);

  const headerRow = document.createElement('div');
  headerRow.className = 'recipe-editor-section-header-row';

  const ingredientsHeader = document.createElement('h2');
  ingredientsHeader.className = 'section-header';
  ingredientsHeader.textContent = 'Ingredients';

  const manageBtn = document.createElement('a');
  manageBtn.className = 'recipe-editor-manage-link';
  manageBtn.href = recipeEditorHrefWithCurrentAdapter('shopping.html');
  manageBtn.textContent = 'Manage';
  manageBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const goShopping = () => {
      window.location.href = recipeEditorHrefWithCurrentAdapter('shopping.html');
    };
    if (typeof window.recipeEditorAttemptExit === 'function') {
      void window.recipeEditorAttemptExit({
        reason: 'manage',
        onClean: goShopping,
        onDiscard: goShopping,
        onSaveSuccess: goShopping,
      });
      return;
    }
    goShopping();
  });

  headerRow.appendChild(ingredientsHeader);
  headerRow.appendChild(manageBtn);
  ingredientsSection.appendChild(headerRow);

  const hasIngredientItems = rows.some((row) => row && row.rowType !== 'heading');
  setManageButtonHiddenState(manageBtn, !hasIngredientItems);

  const isHeading = (row) => row && row.rowType === 'heading';

  ensureIngredientSubheadInsertModeWiring();

  // Top insertion zone (kept for future subhead-insert-mode; currently disabled)
  {
    const next = rows.length > 0 ? rows[0] : null;
    const zone = document.createElement('div');
    zone.className = 'ingredient-insert-zone';
    if (next && isHeading(next))
      zone.classList.add('ingredient-insert-zone--disabled');
    ingredientsSection.appendChild(zone);
  }

  // Shared INGREDIENTS-title CTA:
  // - empty state: persistently visible below the title
  // - non-empty state: shown only when the title is hovered
  {
    const headerCta = createPerLineCta(0);
    headerCta.classList.remove('ingredient-add-cta--per-line');
    headerCta.classList.add('ingredient-header-cta');
    if (rows.length === 0) {
      headerCta.classList.add('ingredient-header-cta--persistent');
    }
    ingredientsSection.appendChild(headerCta);
  }

  rows.forEach((row, idx) => {
    let el = null;
    if (row && row.rowType === 'heading') {
      if (typeof window.renderIngredientHeading === 'function') {
        el = window.renderIngredientHeading(row);
      } else {
        el = document.createElement('div');
        el.className = 'ingredient-subsection-heading-line';
        const span = document.createElement('span');
        span.className = 'ingredient-subsection-heading-text';
        span.textContent = row.text || '';
        el.appendChild(span);
      }
    } else {
      if (typeof renderIngredient === 'function') {
        if (!row.clientId) {
          row.clientId =
            row.rimId != null
              ? `i-${row.rimId}`
              : `tmp-ing-${Date.now()}-${Math.random()
                  .toString(16)
                  .slice(2)}`;
        }
        el = renderIngredient(row);
      } else {
        el = document.createElement('div');
        el.className = 'ingredient-line';
        const span = document.createElement('span');
        span.textContent = `${row.quantity || ''} ${row.unit || ''} ${
          row.name || ''
        }`.trim();
        el.appendChild(span);
      }
    }

    // Wrap in slot (line + per-line CTA; CSS handles show/hide)
    const slot = document.createElement('div');
    slot.className = 'ingredient-slot';

    if (idx === 0) {
      slot.classList.add('ingredient-slot--spacing-first');
    } else {
      const prev = rows[idx - 1];
      if (isHeading(row)) {
        slot.classList.add('ingredient-slot--spacing-item-heading');
      } else if (isHeading(prev)) {
        slot.classList.add('ingredient-slot--spacing-heading-item');
      } else {
        slot.classList.add('ingredient-slot--spacing-item-item');
      }
    }

    if (el) slot.appendChild(el);
    slot.appendChild(createPerLineCta(idx + 1));
    ingredientsSection.appendChild(slot);

    // Inter-row insertion zone (kept for future subhead-insert-mode)
    const next = idx + 1 < rows.length ? rows[idx + 1] : null;
    if (!next) return;
    const zone = document.createElement('div');
    zone.className = 'ingredient-insert-zone';
    if (isHeading(row) || isHeading(next)) {
      zone.classList.add('ingredient-insert-zone--disabled');
    }
    ingredientsSection.appendChild(zone);
  });

  // Trailing insertion zone
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    const zone = document.createElement('div');
    zone.className = 'ingredient-insert-zone';
    if (last && isHeading(last))
      zone.classList.add('ingredient-insert-zone--disabled');
    ingredientsSection.appendChild(zone);
  }

  // Focus a newly inserted heading, if any.
  try {
    const pending = window._pendingFocusIngredientHeadingClientId;
    if (pending) {
      window._pendingFocusIngredientHeadingClientId = null;
      const target = ingredientsSection.querySelector(
        `[data-heading-client-id="${pending}"]`
      );
      if (target && typeof target.click === 'function') {
        target.click();
      }
    }
  } catch (_) {}

  // Keep "You will need" in sync with ingredient edits.
  try {
    if (typeof window.recipeEditorRerenderYouWillNeedFromModel === 'function') {
      window.recipeEditorRerenderYouWillNeedFromModel();
    }
  } catch (_) {}

  // Wire up the centralized hint controller.
  try {
    if (typeof window.initIngredientHintController === 'function') {
      window.initIngredientHintController(ingredientsSection);
    }
  } catch (_) {}
}

let recipeEditorYwnRenderGeneration = 0;

function rerenderYouWillNeedFromModel() {
  void rerenderYouWillNeedFromModelAsync().catch((err) => {
    console.warn('recipeEditor: YWN rerender failed', err);
  });
}

async function rerenderYouWillNeedFromModelAsync() {
  const generation = (recipeEditorYwnRenderGeneration += 1);
  const container = getPageContentContainer();
  if (!container) return;
  const recipe = window.recipeData;
  if (!recipe) return;

  let needWrapper = container.querySelector('.you-will-need-card');
  const stepsSection = container.querySelector('#stepsSection');
  if (!needWrapper) {
    needWrapper = document.createElement('div');
    needWrapper.className = 'you-will-need-card';
    if (stepsSection && stepsSection.parentNode === container) {
      container.insertBefore(needWrapper, stepsSection);
    } else {
      container.appendChild(needWrapper);
    }
  }

  const nextContents = document.createDocumentFragment();
  const needHeader = document.createElement('h2');
  needHeader.className = 'section-header';
  needHeader.textContent = 'You will need';
  nextContents.appendChild(needHeader);

  const allRows = Array.isArray(recipe.sections)
    ? recipe.sections.flatMap((s) => s.ingredients || [])
    : [];

  const allIngredientsBase = normalizeYwnIngredientRows(allRows);
  const allIngredients = isRecipePlannerModeActive()
    ? allIngredientsBase.map((ing) =>
        scaleIngredientForRecipePlannerServingsDisplay(ing, recipe)
      )
    : allIngredientsBase;

  if (allIngredients.length === 0) {
    const line = document.createElement('div');
    line.className = 'ingredient-line';
    const span = document.createElement('span');
    span.className = 'placeholder-prompt';
    span.textContent = 'No ingredients yet. Add some above.';
    line.appendChild(span);
    nextContents.appendChild(line);
    if (generation !== recipeEditorYwnRenderGeneration) return;
    needWrapper.replaceChildren(nextContents);
    initYwnMasterLinkController(needWrapper);
    return;
  }

  const grouped = {};
  allIngredients.forEach((ing) => {
    const loc = ywnLocationBucketForHome(ing.locationAtHome);
    if (!grouped[loc]) grouped[loc] = [];
    grouped[loc].push(ing);
  });

  const locKeys = Object.keys(grouped);
  for (const loc of locKeys) {
    grouped[loc] = await mergeByIngredientAsync(grouped[loc]);
    if (generation !== recipeEditorYwnRenderGeneration) return;
  }

  if (generation !== recipeEditorYwnRenderGeneration) return;

  NEED_LOCATION_ORDER.forEach((loc) => {
    const items = grouped[loc];
    if (!items || !items.length) return;

    const subHeader = document.createElement('div');
    subHeader.className = 'subsection-header';
    subHeader.textContent = loc || 'Misc';
    nextContents.appendChild(subHeader);

    const compareYwnIngredientRows = (a, b) => {
      const nameA = String(a?.name || '').toLowerCase();
      const nameB = String(b?.name || '').toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);

      const varA = String(a?.variant || '').toLowerCase();
      const varB = String(b?.variant || '').toLowerCase();
      if (varA !== varB) return varA.localeCompare(varB);

      return String(a?.size || '')
        .toLowerCase()
        .localeCompare(String(b?.size || '').toLowerCase());
    };

    // Keep OR rows attached to their primary line while still alphabetizing groups.
    const ywnGroups = [];
    items.forEach((item) => {
      if (!item) return;
      if (!item.isAlt || ywnGroups.length === 0) {
        ywnGroups.push([item]);
        return;
      }
      ywnGroups[ywnGroups.length - 1].push(item);
    });

    const sortedItems = ywnGroups
      .sort((groupA, groupB) =>
        compareYwnIngredientRows(groupA[0] || {}, groupB[0] || {})
      )
      .flat();

    sortedItems.forEach((ing) => {
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const span = document.createElement('span');
      if (ing.isAlt) {
        const orPrefix = document.createElement('span');
        orPrefix.className = 'ingredient-alt-prefix';
        orPrefix.textContent = 'OR\u00A0';
        span.appendChild(orPrefix);
        appendYwnLineTextWithMasterLink(span, ing);
      } else {
        appendYwnLineTextWithMasterLink(span, ing);
      }
      line.appendChild(span);
      nextContents.appendChild(line);
    });
  });

  const measures = computeMeasures(allIngredients);
  if (measures.length > 0) {
    const measureHeader = document.createElement('div');
    measureHeader.className = 'subsection-header';
    measureHeader.textContent = 'Measures';
    nextContents.appendChild(measureHeader);

    measures.forEach((m) => {
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const span = document.createElement('span');
      span.textContent = formatMeasureLabel(m);
      line.appendChild(span);
      nextContents.appendChild(line);
    });
  }

  if (generation !== recipeEditorYwnRenderGeneration) return;
  needWrapper.replaceChildren(nextContents);
  initYwnMasterLinkController(needWrapper);
}

window.recipeEditorRerenderYouWillNeedFromModel = rerenderYouWillNeedFromModel;

// --- Per-line CTA infrastructure (replaces the old single-CTA approach) ---

function createPerLineCta(insertIndex) {
  const cta = document.createElement('div');
  cta.className = 'ingredient-line ingredient-add-cta ingredient-add-cta--per-line';
  cta.dataset.insertIndex = String(insertIndex);

  const text = document.createElement('span');
  text.className = 'placeholder-prompt ingredient-add-cta-copy';

  const ingredientBtn = document.createElement('button');
  ingredientBtn.type = 'button';
  ingredientBtn.className = 'ingredient-add-cta-action';
  ingredientBtn.textContent = 'Add an ingredient';
  ingredientBtn.dataset.ctaAction = 'add-ingredient';

  const headingBtn = document.createElement('button');
  headingBtn.type = 'button';
  headingBtn.className = 'ingredient-add-cta-action';
  headingBtn.textContent = 'title';
  headingBtn.dataset.ctaAction = 'add-heading';

  const pasteBtn = document.createElement('button');
  pasteBtn.type = 'button';
  pasteBtn.className = 'ingredient-add-cta-action';
  pasteBtn.textContent = 'paste content';
  pasteBtn.dataset.ctaAction = 'paste-content';

  text.appendChild(ingredientBtn);
  text.appendChild(document.createTextNode(', '));
  text.appendChild(headingBtn);
  text.appendChild(document.createTextNode(', or '));
  text.appendChild(pasteBtn);
  text.appendChild(document.createTextNode('.'));
  cta.appendChild(text);

  return cta;
}

function waitForIngredientCtaTick() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function getActiveIngredientEditor() {
  const active = window._activeIngredientEditor;
  if (!active || !active.rowElement || !active.rowElement.isConnected) {
    return null;
  }
  return active;
}

function getActiveHeadingEditor() {
  const active = window._activeIngredientHeadingEditor;
  if (!active || !active.clientId) return null;
  return active;
}

/** When the tags textarea is open, model.tags lags the draft until blur/Enter; sync before Save. */
function syncRecipeTagsDraftToModelIfEditing() {
  const st = window._recipeTagsEditorState;
  if (!st?.isEditing) return;
  const recipeModel = window.recipeData;
  if (!recipeModel) return;
  let draft = typeof st.draft === 'string' ? st.draft : '';
  try {
    const ta = document.querySelector('.recipe-tags-editor');
    if (ta && ta.isConnected && typeof ta.value === 'string') draft = ta.value;
  } catch (_) {}
  const prevTags = normalizeRecipeTagsArray(
    Array.isArray(st.originalTags) ? st.originalTags : [],
  );
  const nextTags = normalizeRecipeTagsArray(draft);
  const prevKey = JSON.stringify(prevTags.map((t) => t.toLowerCase()));
  const nextKey = JSON.stringify(nextTags.map((t) => t.toLowerCase()));
  recipeModel.tags = nextTags;
  if (prevKey !== nextKey && typeof markDirty === 'function') markDirty();
}

/**
 * Commit/blur any in-progress recipe edits so Save reads the same model the user sees.
 * Inline ingredient rows keep variant/unit/size in the overlay until commit — without this,
 * unknown-item preflight never sees those fields.
 */
async function recipeEditorFlushPendingEditorsForSave() {
  try {
    syncRecipeTagsDraftToModelIfEditing();
  } catch (_) {}

  try {
    const summaryText = document.getElementById('recipeSummaryText');
    if (
      summaryText &&
      summaryText.isContentEditable &&
      typeof summaryText.blur === 'function'
    ) {
      summaryText.blur();
      await waitForIngredientCtaTick();
    }
  } catch (_) {}

  try {
    if (
      window._activeStepInput &&
      typeof window._activeStepInput.blur === 'function'
    ) {
      window._activeStepInput.blur();
      await waitForIngredientCtaTick();
    }
  } catch (_) {}

  const heading = getActiveHeadingEditor();
  if (heading && typeof heading.commit === 'function') {
    try {
      heading.commit();
      await waitForIngredientCtaTick();
    } catch (_) {}
  }

  const ing = getActiveIngredientEditor();
  if (ing && typeof ing.commit === 'function') {
    await ing.commit();
    await waitForIngredientCtaTick();
  }
}

async function prepareActiveHeadingEditorForAction(action, cta, insertIndex) {
  const active = getActiveHeadingEditor();
  if (!active) {
    return { shouldProceed: true, insertIndex };
  }

  const activeSlot = active.slotElement;
  const clickedOwnSlotCta =
    !!activeSlot && !!cta && !!cta.closest && activeSlot === cta.closest('.ingredient-slot');
  const isBlankHeading =
    typeof active.isEmpty === 'function' ? active.isEmpty() : false;

  try {
    if (isBlankHeading && action === 'add-heading' && clickedOwnSlotCta) {
      return { shouldProceed: false, insertIndex };
    }

    if (isBlankHeading) {
      if (typeof active.cancel === 'function') {
        active.cancel();
      }
      await waitForIngredientCtaTick();
      return { shouldProceed: true, insertIndex };
    }

    if (typeof active.commit === 'function') {
      active.commit();
      await waitForIngredientCtaTick();
    }
  } catch (_) {
    return { shouldProceed: false, insertIndex };
  }

  return { shouldProceed: true, insertIndex };
}

async function prepareActiveIngredientEditorForAction(action, cta, insertIndex) {
  const active = getActiveIngredientEditor();
  if (!active) {
    return { shouldProceed: true, insertIndex };
  }

  if (action !== 'add-heading' && action !== 'paste-content') {
    return { shouldProceed: false, insertIndex };
  }

  const isBlankInsert =
    !!active.isInsert &&
    typeof active.isEmpty === 'function' &&
    active.isEmpty();
  const clickedOwnTrailingCta =
    !!active.isInsert && !!active.ctaAnchorEl && active.ctaAnchorEl === cta;

  try {
    if (isBlankInsert) {
      if (typeof active.cancel === 'function') {
        active.cancel();
      }
      await waitForIngredientCtaTick();
      return { shouldProceed: true, insertIndex };
    }

    if (typeof active.commit === 'function') {
      await active.commit();
      await waitForIngredientCtaTick();
    }

    return {
      shouldProceed: true,
      insertIndex: clickedOwnTrailingCta ? insertIndex + 1 : insertIndex,
    };
  } catch (_) {
    return { shouldProceed: false, insertIndex };
  }
}

async function handleCtaAction(ingredientsSection, cta, btn) {
  if (!ingredientsSection || !cta || !btn) return;

  const insertIndex = parseInt(cta.dataset.insertIndex, 10);
  const action = btn.dataset.ctaAction;
  if (!Number.isFinite(insertIndex)) return;

  const headingPrep = await prepareActiveHeadingEditorForAction(
    action,
    cta,
    insertIndex
  );
  if (!headingPrep.shouldProceed) return;

  const prep = await prepareActiveIngredientEditorForAction(
    action,
    cta,
    headingPrep.insertIndex
  );
  if (!prep.shouldProceed) return;
  const nextInsertIndex = prep.insertIndex;

  if (action === 'add-heading') {
    const sec = window.recipeData?.sections?.[0];
    if (sec && typeof window.recipeEditorInsertIngredientHeadingAt === 'function') {
      window.recipeEditorInsertIngredientHeadingAt(sec, nextInsertIndex);
    }
    return;
  }

  if (action === 'paste-content') {
    const sec = window.recipeData?.sections?.[0];
    if (!sec) return;
    const liveIdx = Array.isArray(sec.ingredients)
      ? Math.min(nextInsertIndex, sec.ingredients.length)
      : nextInsertIndex;

    const isPerLine = cta.classList.contains('ingredient-add-cta--per-line');
    if (isPerLine) {
      const anchor = document.createElement('div');
      const slot = cta.closest('.ingredient-slot');
      if (slot) {
        slot.after(anchor);
      } else {
        ingredientsSection.appendChild(anchor);
      }
      if (typeof window.openIngredientPasteRow === 'function') {
        window.openIngredientPasteRow({
          parent: ingredientsSection,
          replaceEl: anchor,
          insertAtIndex: liveIdx,
        });
      }
    } else {
      const liveCta = cta.isConnected
        ? cta
        : ingredientsSection.querySelector(
            '.ingredient-add-cta:not(.ingredient-add-cta--per-line)'
          );
      if (!liveCta) return;
      const anchor = document.createElement('div');
      const keepHeaderHintLive =
        liveCta.classList.contains('ingredient-header-cta') &&
        liveCta.classList.contains('ingredient-header-cta--persistent');
      if (keepHeaderHintLive) {
        liveCta.classList.remove('ingredient-header-cta--persistent');
        anchor._ingredientHeaderHintSourceEl = liveCta;
        anchor._ingredientHeaderHintRestorePersistent = true;
        liveCta.before(anchor);
      }
      if (typeof window.openIngredientPasteRow === 'function') {
        window.openIngredientPasteRow({
          parent: ingredientsSection,
          replaceEl: keepHeaderHintLive ? anchor : liveCta,
          insertAtIndex: liveIdx,
        });
      }
    }
    return;
  }

  if (action === 'add-ingredient') {
    const sec = window.recipeData?.sections?.[0];
    if (!sec) return;
    const liveIdx = Array.isArray(sec.ingredients)
      ? Math.min(nextInsertIndex, sec.ingredients.length)
      : nextInsertIndex;

    const isPerLine = cta.classList.contains('ingredient-add-cta--per-line');
    if (isPerLine) {
      const anchor = document.createElement('div');
      const slot = cta.closest('.ingredient-slot');
      if (slot) {
        slot.after(anchor);
      } else {
        ingredientsSection.appendChild(anchor);
      }
      if (typeof window.openIngredientEditRow === 'function') {
        window.openIngredientEditRow({
          parent: ingredientsSection,
          replaceEl: anchor,
          mode: 'insert',
          seedLine: null,
          insertAtIndex: liveIdx,
        });
      }
    } else {
      const liveCta = cta.isConnected
        ? cta
        : ingredientsSection.querySelector(
            '.ingredient-add-cta:not(.ingredient-add-cta--per-line)'
          );
      if (!liveCta) return;
      const anchor = document.createElement('div');
      const keepHeaderHintLive =
        liveCta.classList.contains('ingredient-header-cta') &&
        liveCta.classList.contains('ingredient-header-cta--persistent');
      if (keepHeaderHintLive) {
        liveCta.classList.remove('ingredient-header-cta--persistent');
        anchor._ingredientHeaderHintSourceEl = liveCta;
        anchor._ingredientHeaderHintRestorePersistent = true;
        liveCta.before(anchor);
      }
      if (typeof window.openIngredientEditRow === 'function') {
        window.openIngredientEditRow({
          parent: ingredientsSection,
          replaceEl: keepHeaderHintLive ? anchor : liveCta,
          mode: 'insert',
          seedLine: null,
          insertAtIndex: liveIdx,
        });
      }
    }
  }
}

function wireIngredientCtaDelegation(ingredientsSection) {
  if (!ingredientsSection || ingredientsSection._ctaDelegated) return;
  ingredientsSection._ctaDelegated = true;

  let consumedPointerDown = false;

  ingredientsSection.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.ingredient-add-cta-action');
    if (!btn || e.button !== 0) return;
    const cta = btn.closest('.ingredient-add-cta');
    if (!cta) return;

    consumedPointerDown = true;
    e.preventDefault();
    e.stopPropagation();
    handleCtaAction(ingredientsSection, cta, btn);
  });

  ingredientsSection.addEventListener('click', (e) => {
    const btn = e.target.closest('.ingredient-add-cta-action');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (consumedPointerDown) {
      consumedPointerDown = false;
      return;
    }
    const cta = btn.closest('.ingredient-add-cta');
    if (!cta) return;
    handleCtaAction(ingredientsSection, cta, btn);
  });
}

function deleteIngredientRowFromSection(sectionRef, rowRef) {
  if (!sectionRef || !Array.isArray(sectionRef.ingredients) || !rowRef)
    return null;
  const idx = sectionRef.ingredients.indexOf(rowRef);
  if (idx < 0) return null;
  const removed = sectionRef.ingredients.splice(idx, 1)[0] || null;

  // If the deleted row was a primary (non-alt ingredient), the first OR row
  // now sitting at idx has lost its anchor — promote it to primary.
  if (removed && !removed.isAlt && removed.rowType !== 'heading') {
    for (let i = idx; i < sectionRef.ingredients.length; i++) {
      const r = sectionRef.ingredients[i];
      if (!r || r.isPlaceholder) continue;
      if (r.rowType === 'heading') break;
      if (r.isAlt) r.isAlt = false;
      break;
    }
  }

  return { idx, removed };
}

function deleteIngredientHeadingRowFromSection(sectionRef, rowRef) {
  if (!sectionRef || !Array.isArray(sectionRef.ingredients) || !rowRef)
    return null;
  if (!rowRef || rowRef.rowType !== 'heading') return null;
  const idx = sectionRef.ingredients.indexOf(rowRef);
  if (idx < 0) return null;
  const removed = sectionRef.ingredients.splice(idx, 1)[0] || null;
  return { idx, removed };
}

// --- Ingredient reorder helpers (tests extract this block) ---
function isIngredientRenderableRow(row) {
  return !!(row && !row.isPlaceholder);
}

function isIngredientHeadingRow(row) {
  if (!row) return false;
  if (row.rowType === 'heading') return true;
  if (row.headingId != null) return true;
  if (row.headingClientId && row.text != null && row.name == null) return true;
  return false;
}

function ingredientRowsMatch(candidate, rowRef) {
  if (!candidate || !rowRef) return false;
  if (candidate === rowRef) return true;

  if (isIngredientHeadingRow(rowRef) || isIngredientHeadingRow(candidate)) {
    const candidateHeadingId =
      candidate.headingId != null ? String(candidate.headingId) : '';
    const rowHeadingId = rowRef.headingId != null ? String(rowRef.headingId) : '';
    if (candidateHeadingId && rowHeadingId && candidateHeadingId === rowHeadingId) {
      return true;
    }

    const candidateHeadingClientId = candidate.headingClientId
      ? String(candidate.headingClientId)
      : '';
    const rowHeadingClientId = rowRef.headingClientId
      ? String(rowRef.headingClientId)
      : '';
    if (
      candidateHeadingClientId &&
      rowHeadingClientId &&
      candidateHeadingClientId === rowHeadingClientId
    ) {
      return true;
    }

    return false;
  }

  const candidateRimId = candidate.rimId != null ? String(candidate.rimId) : '';
  const rowRimId = rowRef.rimId != null ? String(rowRef.rimId) : '';
  if (candidateRimId && rowRimId && candidateRimId === rowRimId) return true;

  const candidateClientId = candidate.clientId ? String(candidate.clientId) : '';
  const rowClientId = rowRef.clientId ? String(rowRef.clientId) : '';
  if (candidateClientId && rowClientId && candidateClientId === rowClientId) {
    return true;
  }

  return false;
}

function normalizeIngredientSortOrder(sectionRef) {
  if (!sectionRef || !Array.isArray(sectionRef.ingredients)) return;

  let nextSortOrder = 1;
  sectionRef.ingredients.forEach((row) => {
    if (!isIngredientRenderableRow(row)) return;
    row.sortOrder = nextSortOrder++;
  });
}

function findIngredientRowContext(rowRef) {
  if (!rowRef) return null;
  const recipe = window.recipeData;
  const sections = Array.isArray(recipe?.sections) ? recipe.sections : [];

  for (const sec of sections) {
    const arr = Array.isArray(sec?.ingredients) ? sec.ingredients : [];
    const idx = arr.findIndex((row) => ingredientRowsMatch(row, rowRef));
    if (idx !== -1) {
      return { sectionRef: sec, list: arr, index: idx, rowRef: arr[idx] };
    }
  }
  return null;
}

function promoteTrailingAltRowsAbovePrimary(sectionRef, rowRef) {
  if (!sectionRef || !Array.isArray(sectionRef.ingredients) || !rowRef) return false;
  const list = sectionRef.ingredients;
  const idx = list.findIndex((row) => ingredientRowsMatch(row, rowRef));
  if (idx === -1) return false;
  const pivot = list[idx];
  if (!isIngredientRenderableRow(pivot) || isIngredientHeadingRow(pivot)) return false;
  if (pivot.isAlt) return false;

  const toMove = [];
  let scan = idx + 1;
  while (scan < list.length) {
    const row = list[scan];
    if (!isIngredientRenderableRow(row)) break;
    if (isIngredientHeadingRow(row)) break;
    if (!row.isAlt) break;
    toMove.push(row);
    scan += 1;
  }
  if (!toMove.length) return false;

  list.splice(idx + 1, toMove.length);
  list.splice(idx, 0, ...toMove);
  normalizeIngredientSortOrder(sectionRef);
  return true;
}

// Returns the array indices of all rows in the same OR-group as the row at `index`.
// A group = nearest non-alt renderable anchor + all consecutive isAlt rows after it.
// Headings break groups. Any member of the group resolves to the full group.
function getIngredientOrGroupIndices(list, index) {
  const row = list[index];
  if (!isIngredientRenderableRow(row)) return [index];

  // Find the anchor (first non-alt row of this group) by walking backward.
  let anchorIdx = index;
  if (row.isAlt && row.rowType !== 'heading') {
    for (let i = index - 1; i >= 0; i--) {
      if (!isIngredientRenderableRow(list[i])) continue;
      if (isIngredientHeadingRow(list[i])) break;
      anchorIdx = i;
      if (!list[i].isAlt) break;
    }
  }

  // Collect anchor + all consecutive isAlt rows that follow it.
  const indices = [anchorIdx];
  for (let i = anchorIdx + 1; i < list.length; i++) {
    if (!isIngredientRenderableRow(list[i])) continue;
    if (isIngredientHeadingRow(list[i])) break;
    if (list[i].isAlt) {
      indices.push(i);
    } else {
      break;
    }
  }
  return indices;
}

function findIngredientAdjacentGroupBounds(list, fromIndex, delta) {
  if (!Array.isArray(list) || !Number.isFinite(fromIndex) || !delta) return null;

  if (delta < 0) {
    for (let i = fromIndex - 1; i >= 0; i--) {
      const row = list[i];
      if (!isIngredientRenderableRow(row)) continue;
      const indices = getIngredientOrGroupIndices(list, i);
      return {
        start: indices[0],
        end: indices[indices.length - 1],
      };
    }
    return null;
  }

  for (let i = fromIndex + 1; i < list.length; i++) {
    const row = list[i];
    if (!isIngredientRenderableRow(row)) continue;
    const indices = getIngredientOrGroupIndices(list, i);
    return {
      start: indices[0],
      end: indices[indices.length - 1],
    };
  }
  return null;
}

window.__ingredientReorderHelpers = {
  getIngredientOrGroupIndices,
  findIngredientAdjacentGroupBounds,
};
// --- End ingredient reorder helpers ---

window.recipeEditorGetIngredientMoveAvailability = ({ rowRef } = {}) => {
  const ctx = findIngredientRowContext(rowRef);
  if (!ctx) return { canMoveUp: false, canMoveDown: false };
  const { list, index } = ctx;

  const groupIndices = getIngredientOrGroupIndices(list, index);
  const firstIdx = groupIndices[0];
  const lastIdx = groupIndices[groupIndices.length - 1];

  const upGroup = findIngredientAdjacentGroupBounds(list, firstIdx, -1);
  const downGroup = findIngredientAdjacentGroupBounds(list, lastIdx, 1);
  return { canMoveUp: !!upGroup, canMoveDown: !!downGroup };
};

window.recipeEditorMoveIngredientRowByDelta = ({
  rowRef,
  delta,
  reopenEditor = false,
  reopenHeadingEditor = false,
  initialFocusField,
  initialCaretIndex,
} = {}) => {
  const dir = Number(delta);
  if (!rowRef || !Number.isFinite(dir) || !dir) return false;

  const ctx = findIngredientRowContext(rowRef);
  if (!ctx) return false;

  const { sectionRef, list, index } = ctx;
  const groupIndices = getIngredientOrGroupIndices(list, index);
  const firstGroupIdx = groupIndices[0];
  const lastGroupIdx = groupIndices[groupIndices.length - 1];
  const groupSize = lastGroupIdx - firstGroupIdx + 1;

  let moved;
  if (dir < 0) {
    // Moving up: insert before the previous group's first row.
    const targetGroup = findIngredientAdjacentGroupBounds(list, firstGroupIdx, -1);
    if (!targetGroup) return false;
    const targetIndex = targetGroup.start;
    const groupRows = list.splice(firstGroupIdx, groupSize);
    list.splice(targetIndex, 0, ...groupRows);
    moved = list[targetIndex + groupIndices.indexOf(index)];
  } else {
    // Moving down: insert after the next group's last row.
    const targetGroup = findIngredientAdjacentGroupBounds(list, lastGroupIdx, 1);
    if (!targetGroup) return false;
    const groupRows = list.splice(firstGroupIdx, groupSize);
    // After removing groupSize items, the next group's tail shifts left by groupSize.
    const adjustedTargetEnd = targetGroup.end - groupSize;
    list.splice(adjustedTargetEnd + 1, 0, ...groupRows);
    moved = list[adjustedTargetEnd + 1 + groupIndices.indexOf(index)];
  }
  normalizeIngredientSortOrder(sectionRef);

  try {
    if (typeof markDirty === 'function') markDirty();
  } catch (_) {}

  rerenderIngredientsSectionFromModel();

  // Restore interaction on the moved row after rerender.
  const setContentEditableCaretOffset = (el, offset) => {
    if (!(el instanceof HTMLElement)) return;
    try {
      const sel = window.getSelection();
      if (!sel) return;

      let firstTextNode = null;
      let lastTextNode = null;
      let remaining = Math.max(0, Number(offset) || 0);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (!firstTextNode) firstTextNode = node;
        lastTextNode = node;
        const len = node.textContent.length;
        if (remaining <= len) {
          const range = document.createRange();
          range.setStart(node, Math.max(0, remaining));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return;
        }
        remaining -= len;
        node = walker.nextNode();
      }

      if (!firstTextNode) {
        firstTextNode = document.createTextNode('');
        el.appendChild(firstTextNode);
        lastTextNode = firstTextNode;
      }
      const range = document.createRange();
      range.setStart(lastTextNode || firstTextNode, (lastTextNode || firstTextNode).textContent.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  };

  try {
    const rid = moved && moved.rimId != null ? String(moved.rimId) : '';
    const cid = moved && moved.clientId ? String(moved.clientId) : '';
    const headingClientId =
      moved && moved.headingClientId ? String(moved.headingClientId) : '';
    const headingSelector = headingClientId
      ? `.ingredient-subsection-heading-line[data-heading-client-id="${headingClientId}"]`
      : '';
    const selector = rid
      ? `.ingredient-line[data-rim-id="${rid}"]`
      : cid
      ? `.ingredient-line[data-client-id="${cid}"]`
      : headingSelector;
    const moveDir = dir < 0 ? 'up' : 'down';
    setTimeout(() => {
      try {
        const sectionEl = document.getElementById('ingredientsSection');
        if (!sectionEl) return;
        if (!selector) return;
        const lineEl = sectionEl.querySelector(selector);
        if (!(lineEl instanceof HTMLElement)) return;
        if (reopenHeadingEditor) {
          if (typeof lineEl.click === 'function') lineEl.click();
          setTimeout(() => {
            try {
              const textEl = lineEl.querySelector(
                '.ingredient-subsection-heading-text'
              );
              if (!(textEl instanceof HTMLElement)) return;
              textEl.focus();
              const nextOffset = Number.isFinite(Number(initialCaretIndex))
                ? Math.max(0, Number(initialCaretIndex))
                : (textEl.textContent || '').length;
              setContentEditableCaretOffset(textEl, nextOffset);
            } catch (_) {}
          }, 0);
          return;
        }
        if (
          reopenEditor &&
          typeof window.openIngredientEditRow === 'function' &&
          lineEl.parentNode
        ) {
          window.openIngredientEditRow({
            parent: lineEl.parentNode,
            replaceEl: lineEl,
            mode: 'update',
            seedLine: moved,
            initialFocusField,
            initialCaretIndex,
          });
          return;
        }
        if (headingSelector && lineEl.matches(headingSelector)) {
          lineEl.focus();
          return;
        }
        const btn = lineEl.querySelector(
          `.ingredient-row-move-btn[data-move-dir="${moveDir}"]`
        );
        if (btn instanceof HTMLElement) btn.focus();
      } catch (_) {}
    }, 0);
  } catch (_) {}

  return true;
};

window.recipeEditorDeleteIngredientRow = async ({
  sectionRef,
  rowRef,
  focusId,
  focusBy = 'clientId',
} = {}) => {
  if (!sectionRef || !rowRef) return false;

  // Capture a deep-ish snapshot for undo.
  const snapshot = JSON.parse(JSON.stringify(rowRef));

  const labelParts = [];
  if (snapshot.quantity != null && String(snapshot.quantity).trim()) {
    labelParts.push(String(snapshot.quantity).trim());
  }
  if (snapshot.unit != null && String(snapshot.unit).trim()) {
    labelParts.push(String(snapshot.unit).trim());
  }
  const nameBits = [];
  if (snapshot.variant) nameBits.push(String(snapshot.variant).trim());
  if (snapshot.name) nameBits.push(String(snapshot.name).trim());
  if (snapshot.size) nameBits.push(String(snapshot.size).trim());
  const nameStr = nameBits.filter(Boolean).join(' ');
  if (nameStr) labelParts.push(nameStr);
  const display = labelParts.filter(Boolean).join(' ').trim() || 'this ingredient';

  // Confirm before deleting (consistent with parent pages).
  try {
    const ok =
      window.ui && typeof window.ui.confirm === 'function'
        ? await window.ui.confirm({
            title: 'Remove this ingredient?',
            message: `"${display}" will be removed from this recipe only.`,
            confirmText: 'Remove',
            cancelText: 'Cancel',
            danger: true,
          })
        : window.confirm(`"${display}" will be removed from this recipe only.`);
    if (!ok) return false;
  } catch (_) {
    // If confirm fails for some reason, proceed (fail-open).
  }

  const del = deleteIngredientRowFromSection(sectionRef, rowRef);
  if (!del || !del.removed) return false;

  // Mark editor dirty (explicit destructive action).
  try {
    if (typeof markDirty === 'function') markDirty();
  } catch (_) {}

  rerenderIngredientsSectionFromModel();

  const restore = () => {
    try {
      if (!Array.isArray(sectionRef.ingredients)) sectionRef.ingredients = [];
      const insertAt = Math.min(
        Math.max(0, del.idx),
        sectionRef.ingredients.length
      );
      sectionRef.ingredients.splice(insertAt, 0, snapshot);
      stripIngredientPlaceholders(sectionRef);
    } catch (_) {}

    rerenderIngredientsSectionFromModel();

    // Best-effort: scroll restored row into view
    try {
      const container = getPageContentContainer();
      const ingredientsSection = container?.querySelector(
        '#ingredientsSection'
      );
      if (!ingredientsSection) return;
      const selector =
        focusBy === 'rimId'
          ? `.ingredient-line[data-rim-id="${String(
              focusId || snapshot.rimId || ''
            )}"]`
          : `.ingredient-line[data-client-id="${String(
              focusId || snapshot.clientId || ''
            )}"]`;
      const el = ingredientsSection.querySelector(selector);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } catch (_) {}
  };

  // Offer undo (single-slot toast)
  try {
    const um = window.undoManager;
    if (um && typeof um.push === 'function') {
      um.push({
        message: `Removed "${display}"`,
        undo: restore,
        timeoutMs: 3500,
      });
    } else if (typeof window.showUndoToast === 'function') {
      window.showUndoToast({
        message: `Removed "${display}"`,
        onUndo: restore,
      });
    }
  } catch (_) {}

  return true;
};

window.recipeEditorDeleteIngredientHeadingRow = async ({
  sectionRef,
  rowRef,
  headingClientId,
} = {}) => {
  if (!sectionRef || !rowRef) return false;

  const snapshot = JSON.parse(JSON.stringify(rowRef));
  const label =
    snapshot && snapshot.text && String(snapshot.text).trim()
      ? String(snapshot.text).trim()
      : 'Section title';

  try {
    const ok =
      window.ui && typeof window.ui.confirm === 'function'
        ? await window.ui.confirm({
            title: 'Remove Subhead',
            message: `Remove "${label}"?\n\nThis won’t delete any ingredients.`,
            confirmText: 'Remove',
            cancelText: 'Cancel',
            danger: true,
          })
        : window.confirm(
            `Remove "${label}"?\n\nThis won’t delete any ingredients.`
          );
    if (!ok) return false;
  } catch (_) {}

  const del = deleteIngredientHeadingRowFromSection(sectionRef, rowRef);
  if (!del || !del.removed) return false;

  try {
    if (typeof markDirty === 'function') markDirty();
  } catch (_) {}

  try {
    const cid = headingClientId || snapshot.headingClientId || null;
    if (cid && window._editingIngredientHeadingClientId === String(cid)) {
      window._editingIngredientHeadingClientId = null;
    }
    if (
      window._activeIngredientHeadingEditor &&
      cid &&
      window._activeIngredientHeadingEditor.clientId === String(cid)
    ) {
      window._activeIngredientHeadingEditor = null;
    }
  } catch (_) {}

  rerenderIngredientsSectionFromModel();

  const restore = () => {
    try {
      if (!Array.isArray(sectionRef.ingredients)) sectionRef.ingredients = [];
      const insertAt = Math.min(
        Math.max(0, del.idx),
        sectionRef.ingredients.length
      );
      sectionRef.ingredients.splice(insertAt, 0, snapshot);
    } catch (_) {}
    try {
      rerenderIngredientsSectionFromModel();
    } catch (_) {}
  };

  try {
    const um = window.undoManager;
    if (um && typeof um.push === 'function') {
      um.push({
        message: 'Subhead removed',
        undo: restore,
        timeoutMs: 3500,
      });
    } else if (typeof window.showUndoToast === 'function') {
      window.showUndoToast({
        message: 'Subhead removed',
        onUndo: restore,
      });
    }
  } catch (_) {}

  return true;
};

// Exposed hooks used by ingredient editor + main.js loader.
window.recipeEditorAfterIngredientEditCommit = (sectionRef) => {
  if (!sectionRef || !Array.isArray(sectionRef.ingredients)) return;

  // Remove any legacy placeholder-ish rows that may have slipped in.
  stripIngredientPlaceholders(sectionRef);

  // Keep "You will need" in sync even if we skip a disruptive rerender.
  try {
    if (typeof window.recipeEditorRerenderYouWillNeedFromModel === 'function') {
      window.recipeEditorRerenderYouWillNeedFromModel();
    }
  } catch (_) {}

  // If another ingredient row is already active (e.g. Enter-to-next flow),
  // avoid a disruptive rerender mid-session.
  const hasActiveIngredientEditor = !!document.querySelector(
    '.ingredient-edit-row.editing'
  );
  if (hasActiveIngredientEditor) return;

  rerenderIngredientsSectionFromModel();
};

window.recipeEditorPromoteTrailingAltRowsAbovePrimary = ({
  sectionRef,
  rowRef,
} = {}) => {
  return promoteTrailingAltRowsAbovePrimary(sectionRef, rowRef);
};

window.recipeEditorSortIngredientsOnLoad = (recipe) => {
  if (!recipe || !Array.isArray(recipe.sections)) return false;
  let changed = false;

  recipe.sections.forEach((sec) => {
    if (!sec || !Array.isArray(sec.ingredients) || sec.ingredients.length === 0)
      return;

    stripIngredientPlaceholders(sec);

    const before = sec.ingredients
      .map((row) => {
        if (!row) return '';
        if (row.rowType === 'heading')
          return `h:${row.headingId ?? row.headingClientId ?? ''}`;
        return `i:${row.rimId ?? ''}`;
      })
      .join('|');

    const after = sec.ingredients
      .map((row) => {
        if (!row) return '';
        if (row.rowType === 'heading')
          return `h:${row.headingId ?? row.headingClientId ?? ''}`;
        return `i:${row.rimId ?? ''}`;
      })
      .join('|');

    if (before !== after) changed = true;
  });

  return changed;
};

// Allow ingredient-heading insertion UX to delegate model mutations to the editor.
window.recipeEditorInsertIngredientHeadingAt = (sectionRef, index) => {
  if (!sectionRef || !Array.isArray(sectionRef.ingredients)) return;
  const idx = Math.max(
    0,
    Math.min(Number(index) || 0, sectionRef.ingredients.length)
  );
  const clientId = `tmp-h-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const row = {
    rowType: 'heading',
    headingId: null,
    headingClientId: clientId,
    sortOrder: null,
    text: '',
  };
  sectionRef.ingredients.splice(idx, 0, row);
  window._pendingFocusIngredientHeadingClientId = clientId;
  try {
    rerenderIngredientsSectionFromModel();
  } catch (_) {}
};

// Expose rerender for other modules (ingredient heading inline editor).
window.recipeEditorRerenderIngredientsFromModel =
  rerenderIngredientsSectionFromModel;

function ensureRecipeHasEditableStep(recipe) {
  if (!recipe || isRecipePlannerModeActive()) return;

  const hasAnySectionSteps =
    Array.isArray(recipe.sections) &&
    recipe.sections.some(
      (section) => Array.isArray(section.steps) && section.steps.length > 0
    );
  const hasAnyLegacySteps =
    Array.isArray(recipe.steps) && recipe.steps.length > 0;

  if (hasAnySectionSteps || hasAnyLegacySteps) return;

  if (!Array.isArray(recipe.sections) || recipe.sections.length === 0) {
    recipe.sections = [
      {
        ID: null,
        id: null,
        name: '',
        steps: [],
        ingredients: [],
      },
    ];
  }

  const firstSection = recipe.sections[0];
  if (!Array.isArray(firstSection.steps)) {
    firstSection.steps = [];
  }

  const tempId = `tmp-step-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  firstSection.steps = [
    {
      ID: null,
      id: tempId,
      section_id: firstSection.ID ?? firstSection.id ?? null,
      step_number: 1,
      instructions: '',
      type: 'step',
    },
  ];
}

function reconcileRecipeStepsAndStepNodes(recipe) {
  if (!recipe) return;

  const stepNodeModelRef =
    window.StepNodeModel && typeof window.StepNodeModel === 'object'
      ? window.StepNodeModel
      : null;
  const fromFlat =
    stepNodeModelRef &&
    typeof stepNodeModelRef.fromFlatStepsArray === 'function'
      ? (steps) => stepNodeModelRef.fromFlatStepsArray(steps)
      : null;

  let canonicalSteps = [];

  if (Array.isArray(recipe.sections)) {
    recipe.sections.forEach((section, index) => {
      if (!Array.isArray(section.steps) || section.steps.length === 0) return;

      const sectionSort =
        section.sort_order != null ? section.sort_order : index + 1;

      const tagged = section.steps.map((step) => ({
        ...step,
        _section_sort: sectionSort,
      }));

      canonicalSteps = canonicalSteps.concat(tagged);
    });
  }

  if (canonicalSteps.length > 0) {
    const normalizedSteps = canonicalSteps.sort((a, b) => {
      if (a._section_sort !== b._section_sort) {
        return a._section_sort - b._section_sort;
      }
      return (a.step_number ?? 0) - (b.step_number ?? 0);
    });

    recipe.steps = normalizedSteps.map((s) => ({
      id: s.ID || s.id,
      instructions: s.instructions,
      step_number: s.step_number,
      type: s.type || 'step',
    }));

    window.stepNodes = fromFlat ? fromFlat(recipe.steps) : [];
    return;
  }

  const legacyFlatSteps = Array.isArray(recipe.steps) ? recipe.steps.slice() : [];
  recipe.steps = legacyFlatSteps;
  window.stepNodes =
    legacyFlatSteps.length > 0 && fromFlat ? fromFlat(legacyFlatSteps) : [];
}

window.recipeEditorReconcileRecipeStepsAndStepNodes =
  reconcileRecipeStepsAndStepNodes;

function recipeEditorPrepareRecipeForSave(recipe) {
  if (!recipe) return recipe;
  const nodes =
    Array.isArray(window.stepNodes) && window.stepNodes.length
      ? window.stepNodes
      : null;
  if (!nodes) return recipe;

  const stepNodeModelRef =
    window.StepNodeModel && typeof window.StepNodeModel === 'object'
      ? window.StepNodeModel
      : null;
  const ordered =
    stepNodeModelRef &&
    typeof stepNodeModelRef.normalizeStepNodeOrder === 'function'
      ? stepNodeModelRef.normalizeStepNodeOrder(nodes)
      : nodes.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const flatSteps = ordered.map((node, index) => ({
    ID: node.id,
    id: node.id,
    step_number: index + 1,
    instructions: node.text == null ? '' : String(node.text),
    type: node.type === 'heading' ? 'heading' : 'step',
  }));

  recipe.steps = flatSteps;
  recipe.stepNodes = ordered.map((node, index) => ({
    id: node.id,
    type: node.type === 'heading' ? 'heading' : 'step',
    text: node.text == null ? '' : String(node.text),
    order: index + 1,
  }));

  if (Array.isArray(recipe.sections) && recipe.sections.length) {
    recipe.sections[0].steps = flatSteps;
    for (let i = 1; i < recipe.sections.length; i += 1) {
      if (Array.isArray(recipe.sections[i].steps)) recipe.sections[i].steps = [];
    }
  }

  return recipe;
}

window.recipeEditorPrepareRecipeForSave = recipeEditorPrepareRecipeForSave;
window.recipeEditorFlushPendingEditorsForSave =
  recipeEditorFlushPendingEditorsForSave;

// --- Main render function (bridge edition: safe, data-driven, backward compatible) ---

function renderRecipe(recipe) {
  ensureRecipeSummaryModel(recipe);

  if (
    recipe &&
    (!Array.isArray(recipe.sections) || recipe.sections.length === 0)
  ) {
    recipe.sections = [
      {
        ID: null,
        id: null,
        name: '',
        steps: [],
        ingredients: [],
      },
    ];
  }

  ensureRecipeHasEditableStep(recipe);
  reconcileRecipeStepsAndStepNodes(recipe);

  // Keep a deep copy for the live editing model (after normalization)
  window.recipeData = JSON.parse(JSON.stringify(recipe));
  if (typeof window.hydrateRecipeIngredientMetricFlags === 'function') {
    window.hydrateRecipeIngredientMetricFlags(window.recipeData);
  }
  ensureRecipeSummaryModel(window.recipeData);

  // Keep app-bar title in sync with the rendered recipe title (single visible source).
  const appBarTitleEl = document.getElementById('appBarTitle');
  if (appBarTitleEl) {
    appBarTitleEl.textContent = formatRecipeTitleForDisplay(recipe.title);
  }

  // 🧠 Session baseline for Cancel:
  try {
    if (
      !window.originalRecipeSnapshot ||
      window.originalRecipeSnapshot.id !== recipe.id
    ) {
      window.originalRecipeSnapshot = JSON.parse(JSON.stringify(recipe));
    }
  } catch (err) {
    console.warn('⚠️ Failed to update originalRecipeSnapshot:', err);
  }

  // --- Clear & rebuild container
  const container = getPageContentContainer();
  const plannerMode = isRecipePlannerModeActive();

  container.innerHTML = `
    <h1 id="recipeTitle" class="recipe-title">${formatRecipeTitleForDisplay(recipe.title)}</h1>
    <div id="servingsRow" class="servings-line"></div>
    <div id="recipeSummaryRow" class="recipe-summary-row"><span id="recipeSummaryText" class="recipe-summary-text"></span></div>
    <div id="ingredientsSection"></div>
    <div id="stepsSection">
      <h2 class="section-header">Instructions</h2>
    </div>
    <div id="tagsSection"></div>
  `;

  const stepsSection = container.querySelector('#stepsSection');

  // Unified servings row just under the title
  renderServingsRow(recipe, container);

  syncRecipeSummaryEditorDOM(container, window.recipeData);
  attachRecipeSummaryEditor(container.querySelector('#recipeSummaryText'));

  // Enable inline title editing
  const titleEl = container.querySelector('#recipeTitle');
  if (typeof attachTitleEditor === 'function') {
    attachTitleEditor(titleEl);
  }

  // Ingredients list + "You will need" — delegate to the shared rerender fn.
  // Always run after normalizing empty `sections` (Supabase loadRecipeDetail contract).
  rerenderIngredientsSectionFromModel();

  // --- StepNode-based instructions renderer (Phase 1) ---
  function renderStepsFromStepNodes(stepNodes, stepsSection, recipeId) {
    if (!Array.isArray(stepNodes) || !stepsSection) {
      return;
    }
    if (stepNodes.length === 0) {
      if (plannerMode) {
        appendPlannerInstructionsEmptyPlaceholderRow(stepsSection);
      }
      return;
    }
    const stepRecipeLinksRef =
      window.StepRecipeLinks && typeof window.StepRecipeLinks === 'object'
        ? window.StepRecipeLinks
        : null;
    const stepDisplayText = (raw) =>
      stepRecipeLinksRef && typeof stepRecipeLinksRef.toDisplayText === 'function'
        ? stepRecipeLinksRef.toDisplayText(raw)
        : String(raw == null ? '' : raw);
    const renderStepReadOnly = (el, raw) => {
      if (
        stepRecipeLinksRef &&
        typeof stepRecipeLinksRef.renderReadOnly === 'function'
      ) {
        stepRecipeLinksRef.renderReadOnly(el, raw);
      } else {
        el.textContent = stepDisplayText(raw);
      }
    };

    // Ensure Ctrl-held insert-mode wiring is active (shared with Ingredients).
    try {
      ensureIngredientSubheadInsertModeWiring();
    } catch (_) {}

    const nodes =
      window.StepNodeModel &&
      typeof StepNodeModel.normalizeStepNodeOrder === 'function'
        ? StepNodeModel.normalizeStepNodeOrder(stepNodes)
        : stepNodes.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const rerender = (nextNodes, focusId) => {
      // Keep the Instructions header, clear the rest.
      const header = stepsSection.querySelector('h2.section-header');
      stepsSection.innerHTML = '';
      if (header) stepsSection.appendChild(header);
      renderStepsFromStepNodes(nextNodes, stepsSection, recipeId);
      if (focusId != null) {
        try {
          const el = stepsSection.querySelector(
            `.step-text[data-step-id="${String(focusId)}"]`
          );
          if (el && typeof el.click === 'function') el.click();
        } catch (_) {}
      }
    };

    const insertHeadingAt = (idx) => {
      try {
        // If a step is actively being edited, blur it first so its onBlur commit runs.
        if (
          window._activeStepInput &&
          typeof window._activeStepInput.blur === 'function'
        ) {
          window._activeStepInput.blur();
        }
      } catch (_) {}

      const nodesNow = Array.isArray(window.stepNodes)
        ? window.stepNodes
        : nodes;
      const ordered =
        window.StepNodeModel &&
        typeof StepNodeModel.normalizeStepNodeOrder === 'function'
          ? StepNodeModel.normalizeStepNodeOrder(nodesNow)
          : nodesNow.slice();

      const safeIdx = Math.max(0, Math.min(Number(idx) || 0, ordered.length));
      const newId = `tmp-step-${Date.now()}-${Math.floor(
        Math.random() * 100000
      )}`;

      const makeNode =
        window.StepNodeModel &&
        typeof StepNodeModel.createStepNode === 'function'
          ? StepNodeModel.createStepNode
          : null;

      const StepType =
        window.StepNodeType && typeof window.StepNodeType === 'object'
          ? window.StepNodeType
          : { HEADING: 'heading', STEP: 'step' };

      const newNode = makeNode
        ? makeNode({
            id: newId,
            type: StepType.HEADING,
            text: '',
            order: safeIdx + 1,
          })
        : { id: newId, type: StepType.HEADING, text: '', order: safeIdx + 1 };

      const nextArr = ordered.slice();
      nextArr.splice(safeIdx, 0, newNode);
      // Renormalize order to 1..n (stable, deterministic).
      const normalized = nextArr.map((n, i) => ({ ...n, order: i + 1 }));

      window.stepNodes = normalized;
      rerender(normalized, newId);
    };

    let displayIndex = 0;

    const isHeading = (n) =>
      n &&
      (n.type === 'heading' ||
        n.type === (window.StepNodeType && window.StepNodeType.HEADING));

    const noUserWebStepContent =
      plannerMode &&
      !nodes.some((n) => {
        if (isHeading(n)) return false;
        const d = String(stepDisplayText(n.text ?? '')).trim();
        return d && !isRecipeEditorStepPromptDisplayText(d);
      });
    const stepRowPlaceholder = noUserWebStepContent
      ? WEB_MODE_NO_INSTRUCTIONS_HINT
      : DEFAULT_STEP_PLACEHOLDER_TEXT;

    nodes.forEach((node, idx) => {
      const line = document.createElement('div');
      line.className = 'instruction-line numbered';

      // Attach identity + type for editor + renumbering.
      line.dataset.stepId = String(node.id);
      const type = node.type || 'step';
      line.dataset.stepType = type;

      const num = document.createElement('span');
      num.className = 'step-num';

      if (type === 'heading') {
        // Headings: visually unnumbered and start a new numbering group.
        num.textContent = '';
        displayIndex = 0; // next steps under this heading start at 1
      } else {
        displayIndex += 1;
        num.textContent = `${displayIndex}.`;
      }

      const text = document.createElement('span');
      text.className = 'step-text';
      text.dataset.stepId = String(node.id);

      const rawText = node.text ?? '';
      const displayText = stepDisplayText(rawText);
      const isPlaceholder = isRecipeEditorStepPromptDisplayText(
        String(displayText).trim()
      );

      if (isPlaceholder) {
        text.textContent = '';
        // Headings use different language than steps.
        if (type === 'heading') {
          text.dataset.placeholder = 'Section title';
          text.classList.add(
            'placeholder-prompt',
            'placeholder-prompt--editblue'
          );
        } else {
          text.dataset.placeholder = stepRowPlaceholder;
          text.classList.add('placeholder-prompt');
          // Placeholder step row (empty-state). Used for hiding the number pre-focus.
          line.classList.add('instruction-line--placeholder');
        }
      } else {
        renderStepReadOnly(text, rawText);
      }

      ensureStepTextNotEmpty(text);

      line.appendChild(num);
      line.appendChild(text);
      stepsSection.appendChild(line);

      if (!plannerMode) attachStepInlineEditor(text);
    });
  }

  // --- Steps (instructions) ---

  const hasStepNodes =
    Array.isArray(window.stepNodes) && window.stepNodes.length > 0;

  const hasSectionedSteps =
    Array.isArray(recipe.sections) &&
    recipe.sections.some((s) => Array.isArray(s.steps) && s.steps.length > 0);
  const stepRecipeLinksRef =
    window.StepRecipeLinks && typeof window.StepRecipeLinks === 'object'
      ? window.StepRecipeLinks
      : null;
  const stepDisplayText = (raw) =>
    stepRecipeLinksRef && typeof stepRecipeLinksRef.toDisplayText === 'function'
      ? stepRecipeLinksRef.toDisplayText(raw)
      : String(raw == null ? '' : raw);
  const renderStepReadOnly = (el, raw) => {
    if (
      stepRecipeLinksRef &&
      typeof stepRecipeLinksRef.renderReadOnly === 'function'
    ) {
      stepRecipeLinksRef.renderReadOnly(el, raw);
    } else {
      el.textContent = stepDisplayText(raw);
    }
  };

  if (hasStepNodes) {
    renderStepsFromStepNodes(window.stepNodes, stepsSection, recipe.id);
  } else if (hasSectionedSteps) {
    const sortedSections = [...recipe.sections].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

    const noUserWebStepContent = plannerMode && (() => {
      for (const section of sortedSections) {
        const rawSteps = Array.isArray(section.steps) ? section.steps : [];
        for (const step of rawSteps) {
          if ((step.type || 'step') === 'heading') continue;
          const displayText = stepDisplayText(step.instructions ?? '');
          const d = String(displayText).trim();
          if (d && !isRecipeEditorStepPromptDisplayText(d)) return false;
        }
      }
      return true;
    })();
    const stepRowPlaceholder = noUserWebStepContent
      ? WEB_MODE_NO_INSTRUCTIONS_HINT
      : DEFAULT_STEP_PLACEHOLDER_TEXT;

    let totalSteps = 0;

    sortedSections.forEach((section) => {
      const rawSteps = Array.isArray(section.steps) ? section.steps : [];
      const stepsInSection = [...rawSteps].sort(
        (a, b) => (a.step_number ?? 0) - (b.step_number ?? 0)
      );
      if (!stepsInSection.length) return;

      const displayName =
        section.name && section.name !== '(unnamed)' ? section.name : null;

      if (displayName) {
        const header = document.createElement('h3');
        header.className = 'section-subheader';
        header.textContent = displayName;
        stepsSection.appendChild(header);
      }

      const sectionId = section.ID ?? section.id ?? null;

      stepsInSection.forEach((step, idx) => {
        const line = document.createElement('div');
        line.className = 'instruction-line numbered';
        if (sectionId != null) {
          line.dataset.sectionId = String(sectionId);
        }
        // Attach identity to the line itself for StepNode lookups.
        line.dataset.stepId = String(step.ID ?? step.id);
        // Default type is 'step' unless StepNode model says otherwise.
        line.dataset.stepType = 'step';

        const num = document.createElement('span');
        num.className = 'step-num';
        num.textContent = `${idx + 1}.`;

        const text = document.createElement('span');
        text.className = 'step-text';
        text.dataset.stepId = String(step.ID ?? step.id);
        if (sectionId != null) {
          text.dataset.sectionId = String(sectionId);
        }
        const rawText = step.instructions ?? '';
        const displayText = stepDisplayText(rawText);
        const isPlaceholder = isRecipeEditorStepPromptDisplayText(
          String(displayText).trim()
        );

        if (isPlaceholder) {
          text.textContent = '';
          text.dataset.placeholder = stepRowPlaceholder;
          text.classList.add('placeholder-prompt');
          line.classList.add('instruction-line--placeholder');
        } else {
          renderStepReadOnly(text, rawText);
        }

        // If StepNode model is present, mirror node.type → DOM.
        try {
          const nodes = Array.isArray(window.stepNodes)
            ? window.stepNodes
            : null;
          const stepNodeTypeRef =
            window.StepNodeType && typeof window.StepNodeType === 'object'
              ? window.StepNodeType
              : null;

          if (nodes && stepNodeTypeRef) {
            const idStr = String(step.ID ?? step.id);
            const node = nodes.find((n) => String(n.id) === idStr);
            if (node && node.type === stepNodeTypeRef.HEADING) {
              line.dataset.stepType = 'heading';
              // Headings are unnumbered; keep the num span for layout but clear text.
              num.textContent = '';
            }
          }
        } catch (err) {
          console.warn(
            'StepNode type sync failed; falling back to step type.',
            err
          );
        }

        ensureStepTextNotEmpty(text);

        line.appendChild(num);
        line.appendChild(text);
        stepsSection.appendChild(line);

        if (!plannerMode) attachStepInlineEditor(text);
        totalSteps++;
      });
    });

    if (totalSteps === 0) {
      if (plannerMode) {
        appendPlannerInstructionsEmptyPlaceholderRow(stepsSection);
      } else {
        const noSteps = document.createElement('div');
        noSteps.className = 'empty-state';
        noSteps.textContent = 'No instructions found.';
        stepsSection.appendChild(noSteps);
      }
    } else {
    }
  } else if (recipe.steps && recipe.steps.length > 0) {
    const noUserWebStepContent = plannerMode && (() => {
      for (const step of recipe.steps) {
        if ((step.type || 'step') === 'heading') continue;
        const displayText = stepDisplayText(step.instructions ?? '');
        const d = String(displayText).trim();
        if (d && !isRecipeEditorStepPromptDisplayText(d)) return false;
      }
      return true;
    })();
    const stepRowPlaceholder = noUserWebStepContent
      ? WEB_MODE_NO_INSTRUCTIONS_HINT
      : DEFAULT_STEP_PLACEHOLDER_TEXT;

    // Fallback: flat list if there are no sectioned steps
    recipe.steps.forEach((step, i) => {
      const line = document.createElement('div');
      line.className = 'instruction-line numbered';

      const num = document.createElement('span');
      num.className = 'step-num';
      num.textContent = `${i + 1}.`;
      const text = document.createElement('span');
      text.className = 'step-text';
      text.dataset.stepId = String(step.id);

      const rawText = step.instructions ?? '';
      const displayText = stepDisplayText(rawText);
      const isPlaceholder = isRecipeEditorStepPromptDisplayText(
        String(displayText).trim()
      );

      if (isPlaceholder) {
        text.textContent = '';
        // Headings use different language than steps.
        if (line.dataset.stepType === 'heading') {
          text.dataset.placeholder = 'Section title';
          text.classList.add(
            'placeholder-prompt',
            'placeholder-prompt--editblue'
          );
        } else {
          text.dataset.placeholder = stepRowPlaceholder;
          text.classList.add('placeholder-prompt');
          line.classList.add('instruction-line--placeholder');
        }
      } else {
        renderStepReadOnly(text, rawText);
      }

      ensureStepTextNotEmpty(text);

      line.appendChild(num);
      line.appendChild(text);

      stepsSection.appendChild(line);
      if (!plannerMode) attachStepInlineEditor(text);
    });
  } else {
    if (plannerMode) {
      appendPlannerInstructionsEmptyPlaceholderRow(stepsSection);
    } else {
      const noSteps = document.createElement('div');
      noSteps.className = 'empty-state';
      noSteps.textContent = 'No instructions found.';
      stepsSection.appendChild(noSteps);
    }
  }

  renderRecipeTagsSection(recipe, container);
}

// --- Servings helpers (rest-mode text + basic edit-mode structure) ---

// Remember last valid committed value so blur/enter can revert invalid edits
if (typeof window._servingsLastValid === 'undefined') {
  window._servingsLastValid = null;
}

// Track whether we should skip commit on this blur (used only for Escape flows)
if (typeof window._servingsSkipCommitOnce === 'undefined') {
  window._servingsSkipCommitOnce = false;
}

function _servingsIsValidNumber(raw) {
  const n = _servingsParseNumber(raw);
  return Number.isFinite(n) && n > 0;
}

/** Empty field or explicit zero → unset default (placeholder). */
function _servingsShouldUnsetDefault(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return true;
  const n = _servingsParseNumber(text);
  if (!Number.isFinite(n) || n !== 0) return false;
  // Keep "0." in the field while the user may be typing "0.5".
  if (/^0*\.?$/.test(text) && /\.$/.test(text)) return false;
  return true;
}

function _servingsParseNumber(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return null;
  if (typeof parseNumericQuantityValue === 'function') {
    const parsed = parseNumericQuantityValue(text);
    if (parsed != null) {
      const n = Number(parsed);
      if (Number.isFinite(n)) return n;
    }
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function _servingsFormatInputValue(rawValue) {
  const n = _servingsParseNumber(rawValue);
  if (!Number.isFinite(n) || n <= 0) return '';
  return formatRecipePlannerServingsDisplay(n);
}

function invalidateRecipePlannerServingsBaseDefault(recipe) {
  const api = getRecipePlannerServingsApi();
  if (typeof api.invalidateBaseDefault === 'function') {
    api.invalidateBaseDefault(recipe);
    return;
  }
  if (!recipe || typeof recipe !== 'object') return;
  delete recipe._plannerModeBaseServingsDefaultInitialized;
  delete recipe._plannerModeBaseServingsDefault;
}

function commitRecipeServingsDefaultInput(recipeModel, raw, { fallbackValue = null } = {}) {
  if (!recipeModel) return null;
  if (!recipeModel.servings || typeof recipeModel.servings !== 'object') {
    recipeModel.servings = {
      default: recipeModel.servingsDefault ?? null,
      min: null,
      max: null,
    };
  }

  const text = String(raw == null ? '' : raw).trim();
  if (_servingsShouldUnsetDefault(text)) {
    invalidateRecipePlannerServingsBaseDefault(recipeModel);
    recipeModel.servingsDefault = null;
    recipeModel.servings.default = null;
    window._servingsLastValid = null;
    return null;
  }

  if (!_servingsIsValidNumber(text)) {
    const revert =
      fallbackValue != null && _servingsIsValidNumber(fallbackValue)
        ? roundRecipePlannerServingsValue(_servingsParseNumber(fallbackValue))
        : window._servingsLastValid != null &&
            _servingsIsValidNumber(window._servingsLastValid)
          ? roundRecipePlannerServingsValue(_servingsParseNumber(window._servingsLastValid))
          : null;
    if (revert != null) {
      invalidateRecipePlannerServingsBaseDefault(recipeModel);
      const bounds = getRecipePlannerServingsBounds(recipeModel);
      const clamped = clampRecipePlannerServingsValue(revert, bounds);
      if (clamped != null) {
        recipeModel.servingsDefault = clamped;
        recipeModel.servings.default = clamped;
        window._servingsLastValid = clamped;
        return clamped;
      }
    }
    return revert;
  }

  invalidateRecipePlannerServingsBaseDefault(recipeModel);
  const bounds = getRecipePlannerServingsBounds(recipeModel);
  const clamped = clampRecipePlannerServingsValue(_servingsParseNumber(text), bounds);
  if (clamped == null) return null;
  recipeModel.servingsDefault = clamped;
  recipeModel.servings.default = clamped;
  window._servingsLastValid = clamped;
  return clamped;
}

function servingsHasDefaultValue(recipe) {
  if (!recipe) return false;

  let v = recipe.servingsDefault;
  const servingsObj =
    recipe.servings && typeof recipe.servings === 'object'
      ? recipe.servings
      : null;

  // Fallback to nested servings.default if top-level isn't populated
  if (v === null || v === undefined || v === '') {
    if (servingsObj && servingsObj.default != null) {
      v = servingsObj.default;
      const parsed = _servingsParseNumber(v);
      if (parsed != null && parsed > 0) {
        recipe.servingsDefault = parsed; // keep model in sync
      }
    }
  }

  return _servingsIsValidNumber(v);
}

function updateServingsVisibility(recipe) {
  const row = document.getElementById('servingsRow');
  if (!row) return;
  row.style.display = '';
}

function renderServingsRow(recipe, container) {
  const row =
    (container && container.querySelector('#servingsRow')) ||
    document.getElementById('servingsRow');
  if (!row) {
    window._skipServingsAutofocusOnce = false;
    return;
  }
  // Always prefer the canonical live model
  const recipeModel = window.recipeData || recipe;

  if (!recipeModel) {
    window._skipServingsAutofocusOnce = false;
    return;
  }

  if (isRecipePlannerModeActive()) {
    window._skipServingsAutofocusOnce = false;
    const bounds = getRecipePlannerServingsBounds(recipeModel);
    row.classList.add('row-shell', 'servings-line', 'servings-line--web');
    row.classList.remove('editing');
    row.innerHTML = '';
    row.onclick = null;
    row.style.display = bounds ? '' : 'none';
    if (!bounds) return;

    const field = document.createElement('div');
    field.className = 'row-field servings-web-field';
    const displayServings = getRecipePlannerServingsDisplayValue(recipeModel) ?? bounds.baseDefault;
    const curRounded = roundRecipePlannerServingsValue(recipeModel?.servingsDefault);
    const atNone = curRounded == null;
    const subtitle = document.createElement('span');
    subtitle.className = 'servings-web-subtitle';
    const subtitlePrefix = document.createElement('span');
    subtitlePrefix.className = 'servings-web-subtitle-prefix';
    subtitlePrefix.textContent = 'Serves ';
    const subtitleValue = document.createElement('button');
    subtitleValue.type = 'button';
    subtitleValue.className = 'servings-web-value';
    subtitleValue.setAttribute('aria-label', 'Edit servings');
    subtitleValue.textContent = formatRecipePlannerServingsDisplay(displayServings);
    subtitle.appendChild(subtitlePrefix);
    subtitle.appendChild(subtitleValue);

    const { stepper: picker, minusBtn, qtySpan: value, plusBtn } =
      window.listRowStepper.createStepperDOM({
        decreaseLabel: 'Decrease servings',
        increaseLabel: 'Increase servings',
      });
    picker.classList.add('servings-picker', 'servings-picker--inline');
    value.remove();
    picker.style.display = '';
    if (bounds.baseDefault == null) {
      minusBtn.disabled = !bounds.canAdjust || atNone;
      plusBtn.disabled = !bounds.canAdjust || !atNone;
    } else {
      minusBtn.disabled =
        !bounds.canAdjust || (curRounded != null && curRounded <= bounds.min + 1e-9);
      plusBtn.disabled =
        !bounds.canAdjust || (curRounded != null && curRounded >= bounds.max - 1e-9);
    }

    minusBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyRecipePlannerServingsToModel(
        recipeModel,
        getNextRecipePlannerServingsValue(recipeModel, -1)
      );
      renderServingsRow(recipeModel, container);
      if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
        window.recipeEditorRerenderIngredientsFromModel();
      }
    });

    plusBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyRecipePlannerServingsToModel(
        recipeModel,
        getNextRecipePlannerServingsValue(recipeModel, 1)
      );
      renderServingsRow(recipeModel, container);
      if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
        window.recipeEditorRerenderIngredientsFromModel();
      }
    });

    const startInlineServingsEdit = () => {
      if (!subtitle.isConnected) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'servings-web-value-input';
      input.inputMode = 'decimal';
      input.setAttribute('aria-label', 'Servings value');
      input.value =
        displayServings != null ? String(displayServings) : '';
      subtitle.replaceChild(input, subtitleValue);
      input.focus();
      input.select();

      let cancelled = false;
      const fallbackValue = displayServings;
      const commit = () => {
        const next = commitRecipePlannerServingsInputValue(recipeModel, input.value, {
          fallbackValue,
        });
        renderServingsRow(recipeModel, container);
        if (next != null && typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
          window.recipeEditorRerenderIngredientsFromModel();
        }
        return next;
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelled = true;
          renderServingsRow(recipeModel, container);
        }
      });

      input.addEventListener('blur', () => {
        if (cancelled) return;
        commit();
      });
    };

    subtitleValue.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startInlineServingsEdit();
    });

    field.appendChild(subtitle);
    field.appendChild(picker);
    row.appendChild(field);
    try {
      if (typeof window.recipePlannerModeSyncAppBar === 'function') {
        window.recipePlannerModeSyncAppBar();
      }
    } catch (_) {}
    return;
  }

  if (typeof window.isServingsEditing === 'undefined') {
    window.isServingsEditing = false;
  }

  const hasDefaultValue = servingsHasDefaultValue(recipeModel);
  const isTitleEditing = !!window.isTitleEditing;

  // If there is no default servings value yet, but the title is in edit mode,
  // go straight into servings edit instead of showing the old "Servings:" stub.
  if (!window.isServingsEditing && !hasDefaultValue && isTitleEditing) {
    window.isServingsEditing = true;
  }

  // Shell + editing state
  row.classList.add('row-shell', 'servings-line');
  row.classList.toggle('editing', !!window.isServingsEditing);

  // Reset contents/handlers
  row.innerHTML = '';
  row.onclick = null;

  const field = document.createElement('div');
  field.className = 'row-field';

  const beginServingsEdit = () => {
    window.isServingsEditing = true;
    window._servingsLastValid =
      recipeModel.servingsDefault != null ? recipeModel.servingsDefault : null;
    renderServingsRow(recipe, container);
  };

  if (!window.isServingsEditing) {
    window._skipServingsAutofocusOnce = false;
    row.onclick = beginServingsEdit;

    if (hasDefaultValue && recipeModel.servingsDefault != null) {
      const display = document.createElement('span');
      display.className = 'servings-display';
      display.textContent = `Serves ${formatRecipePlannerServingsDisplay(recipeModel.servingsDefault)}`;
      field.appendChild(display);
    } else {
      const hint = document.createElement('span');
      hint.className = 'servings-hint placeholder-prompt';
      hint.dataset.placeholder = RECIPE_SERVINGS_HINT_IDLE;
      field.appendChild(hint);
    }
  } else {

    const servingsObj = recipeModel.servings || {};
    const defaultVal =
      recipeModel.servingsDefault != null
        ? recipeModel.servingsDefault
        : servingsObj.default != null
        ? servingsObj.default
        : null;

    // Keep top-level + nested default in sync
    if (defaultVal != null) {
      recipeModel.servingsDefault = defaultVal;
    }

    const editRow = document.createElement('div');
    editRow.className = 'servings-edit-row';

    const label = document.createElement('span');
    label.className = 'servings-label';
    label.textContent = 'Serves';

    const defaultInput = document.createElement('input');
    defaultInput.type = 'text';
    defaultInput.className = 'servings-input';
    defaultInput.setAttribute('aria-label', 'Number of servings');
    defaultInput.value = defaultVal != null ? _servingsFormatInputValue(defaultVal) : '';

    field.innerHTML = '';

    editRow.appendChild(label);
    editRow.appendChild(defaultInput);
    wireLabelToInput(label, defaultInput);

    field.appendChild(editRow);
    row.onclick = null;

    const ensureServingsObj = () => {
      if (!recipeModel.servings) {
        recipeModel.servings = {
          default: recipeModel.servingsDefault ?? null,
          min: null,
          max: null,
        };
      }
    };

    const skipServingsAutofocus = !!window._skipServingsAutofocusOnce;
    if (skipServingsAutofocus) window._skipServingsAutofocusOnce = false;
    setTimeout(() => {
      if (skipServingsAutofocus) return;
      defaultInput.focus();
      defaultInput.select();
    }, 0);

    // --- Default: live-commit semantics ---
    defaultInput.addEventListener('input', () => {
      const raw = (defaultInput.value || '').trim();
      ensureServingsObj();

      if (_servingsShouldUnsetDefault(raw)) {
        invalidateRecipePlannerServingsBaseDefault(recipeModel);
        recipeModel.servingsDefault = null;
        recipeModel.servings.default = null;
        window._servingsLastValid = null;
      } else if (_servingsIsValidNumber(raw)) {
        const clamped = commitRecipeServingsDefaultInput(recipeModel, raw);
        if (clamped != null) {
          defaultInput.value = _servingsFormatInputValue(clamped);
        }
      }

      if (typeof markDirty === 'function') {
        markDirty();
      }
    });

    defaultInput.addEventListener('blur', (e) => {
      const raw = (defaultInput.value || '').trim();
      ensureServingsObj();

      const next = e && e.relatedTarget;
      const stayingInRow = row && next && row.contains(next);

      if (window._servingsSkipCommitOnce) {
        window._servingsSkipCommitOnce = false;
        recipeModel.servingsDefault = window._servingsLastValid;
        recipeModel.servings.default = window._servingsLastValid;
        invalidateRecipePlannerServingsBaseDefault(recipeModel);

        if (stayingInRow) {
          return;
        }

        window.isServingsEditing = false;
        renderServingsRow(recipeModel, container);
        return;
      }

      const committed = commitRecipeServingsDefaultInput(recipeModel, raw, {
        fallbackValue: window._servingsLastValid,
      });
      if (committed != null) {
        defaultInput.value = _servingsFormatInputValue(committed);
      }

      if (stayingInRow) {
        return;
      }

      window.isServingsEditing = false;
      renderServingsRow(recipeModel, container);
    });

    defaultInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        defaultInput.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        window._servingsSkipCommitOnce = true;
        defaultInput.blur();
      }
    });
  }

  row.appendChild(field);

  updateServingsVisibility(recipe);
}

function normalizeRecipeTagsArray(rawTags) {
  const source = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags || '')
        .split(/[\n,]/)
        .map((v) => v.trim());
  const seen = new Set();
  const out = [];
  source
    .map((v) => String(v || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .forEach((tag) => {
      const clipped = tag.length > 48 ? tag.slice(0, 48).trim() : tag;
      if (!clipped) return;
      const key = clipped.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clipped);
    });
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return out;
}

function formatRecipeTagsSubtitle(tags) {
  const arr = normalizeRecipeTagsArray(tags);
  return arr.join('\n');
}

// --- Recipe tags keyboard helpers (tests extract this block) ---
function shouldCommitRecipeTagsEdit(event) {
  return !!(
    event &&
    event.key === 'Enter' &&
    !event.shiftKey
  );
}

window.__recipeTagsKeyboardHelpers = {
  shouldCommitRecipeTagsEdit,
};
// --- End recipe tags keyboard helpers ---

async function getVisibleRecipeTagNamePool() {
  if (window.dataService && typeof window.dataService.listTags === 'function') {
    try {
      return (await window.dataService.listTags())
        .map((row) => String(row?.name || '').trim())
        .filter(Boolean);
    } catch (err) {
      console.error('dataService.listTags failed:', err);
      if (window.dataService.useSupabase) return [];
    }
  }

  return [];
}

function renderRecipeTagsSection(recipe, container) {
  if (isRecipePlannerModeActive()) return;
  const section =
    (container && container.querySelector('#tagsSection')) ||
    document.getElementById('tagsSection');
  if (!section) return;
  const recipeModel = window.recipeData || recipe;
  if (!recipeModel) return;

  const normalized = normalizeRecipeTagsArray(recipeModel.tags || []);
  recipeModel.tags = normalized;

  const previousEditorState = window._recipeTagsEditorState || {};
  const previousDraft =
    typeof previousEditorState.draft === 'string'
      ? previousEditorState.draft
      : Array.isArray(previousEditorState.draftTags)
      ? formatRecipeTagsSubtitle(previousEditorState.draftTags)
      : '';
  const isEditing = !!previousEditorState.isEditing;
  const originalTags = Array.isArray(previousEditorState.originalTags)
    ? previousEditorState.originalTags
    : normalized.slice();
  const ensureVisibleOnOpen = !!previousEditorState.ensureVisibleOnOpen;

  try {
    document.body.classList.toggle('recipe-tags-editing', isEditing);
  } catch (_) {}

  section.className = 'recipe-tags-section';
  section.innerHTML = '';

  const tagsHeaderRow = document.createElement('div');
  tagsHeaderRow.className = 'recipe-editor-section-header-row';

  const manage = document.createElement('a');
  manage.className = 'recipe-editor-manage-link';
  manage.href = recipeEditorHrefWithCurrentAdapter('tags.html');
  manage.textContent = 'Manage';
  manage.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      const navigate = () => {
        sessionStorage.setItem('selectedRecipeId', String(recipeModel.id || window.recipeId || ''));
        window.location.href = recipeEditorHrefWithCurrentAdapter('tags.html');
      };

      if (
        typeof normalizeRecipeTagDraftList === 'function' &&
        typeof resolveUnknownTagNames === 'function'
      ) {
        const tagDraftSource =
          window._recipeTagsEditorState?.isEditing &&
          typeof window._recipeTagsEditorState.draft === 'string'
            ? window._recipeTagsEditorState.draft
            : recipeModel.tags;
        const normalizedDraftTags = normalizeRecipeTagDraftList(tagDraftSource);
        const visibleTagNames = await getVisibleRecipeTagNamePool();
        const visibleTagNameKeys = new Set(
          (Array.isArray(visibleTagNames) ? visibleTagNames : [])
            .map((name) => String(name || '').trim().toLowerCase())
            .filter(Boolean),
        );
        const anyVisibleTagNamed = (name) =>
          visibleTagNameKeys.has(String(name || '').trim().toLowerCase());
        const unknownTags = [];
        const seen = new Set();
        normalizedDraftTags.forEach((tag) => {
          const key = String(tag || '').trim().toLowerCase();
          if (!key || seen.has(key)) return;
          seen.add(key);
          if (anyVisibleTagNamed(tag)) return;
          unknownTags.push(tag);
        });

        if (unknownTags.length) {
          const resolved = await resolveUnknownTagNames({
            db: null,
            tags: unknownTags,
          });
          if (!resolved) return;
          const replacementMap = resolved.map;
          recipeModel.tags = normalizeRecipeTagDraftList(
            normalizedDraftTags.map((tag) => {
              const key = String(tag || '').trim().toLowerCase();
              return replacementMap.get(key) || tag;
            })
          );
          try {
            if (typeof window.recipeEditorSave === 'function') {
              await window.recipeEditorSave();
            }
          } catch (_) { return; }
          const stillDirty =
            typeof window.recipeEditorGetIsDirty === 'function'
              ? window.recipeEditorGetIsDirty()
              : false;
          if (stillDirty) return;
        }
      }

      navigate();
    })();
  });

  const header = document.createElement('h2');
  header.className = 'section-header';
  header.textContent = 'Tags';

  tagsHeaderRow.appendChild(header);
  tagsHeaderRow.appendChild(manage);
  section.appendChild(tagsHeaderRow);

  setManageButtonHiddenState(manage, normalized.length === 0);

  const content = document.createElement('div');
  content.className = 'recipe-tags-content';
  section.appendChild(content);

  const updateModelFromDraft = (draftTags) => {
    const prevTags = normalizeRecipeTagsArray(originalTags);
    const nextTags = normalizeRecipeTagsArray(draftTags);
    const prevKey = JSON.stringify(prevTags.map((t) => t.toLowerCase()));
    const nextKey = JSON.stringify(nextTags.map((t) => t.toLowerCase()));
    recipeModel.tags = nextTags;
    if (prevKey !== nextKey && typeof markDirty === 'function') markDirty();
  };

  const confirmTagRemoval = async (tagLabel) => {
    const cleanTag = String(tagLabel || '').trim() || 'this tag';
    try {
      if (window.ui && typeof window.ui.confirm === 'function') {
        const ok = await window.ui.confirm({
          title: 'Remove tag?',
          message: `Remove "${cleanTag}" from this recipe?`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
        return !!ok;
      }
      return window.confirm(`Remove "${cleanTag}" from this recipe?`);
    } catch (_) {
      return false;
    }
  };

  if (!isEditing) {
    content.classList.add('recipe-tags-content--view');
    content.addEventListener('click', () => {
      window._recipeTagsEditorState = {
        isEditing: true,
        draft: formatRecipeTagsSubtitle(recipeModel.tags),
        originalTags: normalizeRecipeTagsArray(recipeModel.tags),
        ensureVisibleOnOpen: true,
      };
      renderRecipeTagsSection(recipeModel, container);
    });

    if (!normalized.length) {
      const empty = document.createElement('div');
      empty.className = 'recipe-tags-empty placeholder-prompt';
      empty.textContent = 'Add a tag.';
      content.appendChild(empty);
      return;
    }

    const pills = document.createElement('div');
    pills.className = 'recipe-tags-wrap';
    normalized.forEach((tag) => {
      const pill = document.createElement('span');
      pill.className = 'recipe-tag-pill';
      pill.textContent = tag;
      pill.title = 'Ctrl-click to remove';
      pill.addEventListener('click', async (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        e.stopPropagation();
        const ok = await confirmTagRemoval(tag);
        if (!ok) return;
        const next = normalized.filter(
          (v) => String(v || '').toLowerCase() !== String(tag || '').toLowerCase()
        );
        updateModelFromDraft(next);
        renderRecipeTagsSection(recipeModel, container);
      });
      pill.addEventListener('contextmenu', async (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        e.stopPropagation();
        const ok = await confirmTagRemoval(tag);
        if (!ok) return;
        const next = normalized.filter(
          (v) => String(v || '').toLowerCase() !== String(tag || '').toLowerCase()
        );
        updateModelFromDraft(next);
        renderRecipeTagsSection(recipeModel, container);
      });
      window.favoriteEatsBindLongPressRemove?.(pill, async () => {
        const ok = await confirmTagRemoval(tag);
        if (!ok) return;
        const next = normalized.filter(
          (v) => String(v || '').toLowerCase() !== String(tag || '').toLowerCase()
        );
        updateModelFromDraft(next);
        renderRecipeTagsSection(recipeModel, container);
      });
      pills.appendChild(pill);
    });
    content.appendChild(pills);
    return;
  }

  content.classList.add('recipe-tags-content--edit');
  const card = document.createElement('div');
  card.className = 'shopping-item-editor-card recipe-tags-editor-card';
  content.appendChild(card);

  const field = document.createElement('div');
  field.className = 'shopping-item-field recipe-tags-editor-field';
  card.appendChild(field);

  const textarea = document.createElement('textarea');
  textarea.className =
    'shopping-item-textarea recipe-tags-editor editor-paste-textarea';
  textarea.rows = 3;
  textarea.placeholder = 'e.g., Mexican, Chinese, comfort food';
  textarea.value = previousDraft || formatRecipeTagsSubtitle(normalized);
  if (ensureVisibleOnOpen && normalized.length > 0) {
    const v = String(textarea.value || '');
    if (!v.endsWith('\n')) textarea.value = `${v}\n`;
  }
  textarea.setAttribute('aria-label', 'Recipe tags');
  textarea.wrap = 'soft';
  field.appendChild(textarea);

  try {
    if (typeof attachEditorTextareaAutoGrow === 'function') {
      attachEditorTextareaAutoGrow(textarea, { maxLines: 10 });
    }
  } catch (_) {}

  const persistEditingState = () => {
    window._recipeTagsEditorState = {
      isEditing: true,
      draft: textarea.value || '',
      originalTags,
      ensureVisibleOnOpen: false,
    };
  };
  const draftBaseline = textarea.value || '';
  persistEditingState();
  let dirtyMarkedFromTyping = false;

  const finishEdit = ({ shouldCommit }) => {
    if (shouldCommit) updateModelFromDraft(textarea.value || '');
    window._recipeTagsEditorState = {
      isEditing: false,
      draft: '',
      originalTags: [],
      ensureVisibleOnOpen: false,
    };
    renderRecipeTagsSection(recipeModel, container);
  };
  textarea.addEventListener('input', () => {
    persistEditingState();
    if (!dirtyMarkedFromTyping && (textarea.value || '') !== draftBaseline) {
      dirtyMarkedFromTyping = true;
      if (typeof markDirty === 'function') markDirty();
    }
  });
  textarea.addEventListener('keydown', (e) => {
    if (shouldCommitRecipeTagsEdit(e)) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      finishEdit({ shouldCommit: true });
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      finishEdit({ shouldCommit: false });
    }
  });

  content.addEventListener('focusout', () => {
    setTimeout(() => {
      if (
        document.activeElement &&
        content.contains(document.activeElement)
      ) {
        return;
      }
      finishEdit({ shouldCommit: true });
    }, 0);
  });

  if (
    window.favoriteEatsTypeahead &&
    typeof window.favoriteEatsTypeahead.attach === 'function'
  ) {
    const getCaretLineBounds = (el, caretPos) => {
      const v = String(el.value || '');
      const pos =
        caretPos != null && Number.isFinite(caretPos)
          ? Number(caretPos)
          : el.selectionStart ?? 0;
      const prevNl = v.lastIndexOf('\n', pos - 1);
      const lineStart = prevNl === -1 ? 0 : prevNl + 1;
      const nextNl = v.indexOf('\n', pos);
      const lineEnd = nextNl === -1 ? v.length : nextNl;
      return { lineStart, lineEnd };
    };
    const vSlice = (s, a, b) => String(s || '').slice(a, b);
    const getCurrentLineText = (el) => {
      const caretPos = el.selectionStart ?? 0;
      const { lineStart, lineEnd } = getCaretLineBounds(el, caretPos);
      return vSlice(el.value, lineStart, lineEnd);
    };

    window.favoriteEatsTypeahead.attach({
      inputEl: textarea,
      openOnFocus: true,
      matchAnchorWidth: true,
      placement: 'below',
      dropdownGap: 4,
      maxVisible: 6,
      pickOnEnterWhenQueryEmpty: false,
      getPool: async (el) => {
        const active = new Set(
          normalizeRecipeTagsArray(el && el.value ? el.value : '').map((v) =>
            String(v || '').toLowerCase()
          )
        );
        const pool = await getVisibleRecipeTagNamePool();
        return pool.filter(
          (name) => !active.has(String(name || '').toLowerCase())
        );
      },
      getQuery: (el) => String(getCurrentLineText(el) || '').trim(),
      setValue: (picked, el) => {
        const canonical = String(picked || '').trim();
        const { lineStart, lineEnd } = getCaretLineBounds(el);
        const before = vSlice(el.value, 0, lineStart);
        const after = vSlice(el.value, lineEnd, String(el.value || '').length);
        el.value = before + canonical + after;
        return { caretPos: lineStart + canonical.length };
      },
      closeOnEmptyQuery: false,
      openOnlyWhenQueryNonEmpty: false,
    });
  }

  const ensureTagsEditorRunway = (targetEl, { minBelow = 240 } = {}) => {
    if (!(targetEl instanceof HTMLElement)) return 0;
    try {
      const rect = targetEl.getBoundingClientRect();
      const vh =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const viewportMargin = 16;
      const availBelow = vh - viewportMargin - rect.bottom;
      const needed = Math.max(0, Math.ceil(minBelow - availBelow));
      if (needed > 0) {
        window.scrollBy({ top: needed, behavior: 'instant' });
      }
      return needed;
    } catch (_) {
      return 0;
    }
  };

  const focusTextareaAtEnd = () => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  };

  if (ensureVisibleOnOpen) {
    setTimeout(() => {
      try {
        section.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'instant',
        });
      } catch (_) {}
      ensureTagsEditorRunway(textarea, { minBelow: 240 });
      requestAnimationFrame(focusTextareaAtEnd);
    }, 0);
  } else {
    setTimeout(focusTextareaAtEnd, 0);
  }
}

// --- Title normalization helper (preserve casing + fallback to "Untitled") ---
function normalizeRecipeTitle(raw) {
  if (raw == null) return 'Untitled';
  const trimmed = String(raw).trim();
  if (!trimmed) return 'Untitled';
  return trimmed;
}

function formatRecipeTitleForDisplay(raw) {
  const shared =
    typeof window !== 'undefined' &&
    typeof window.favoriteEatsFormatRecipeTitleForDisplay === 'function'
      ? window.favoriteEatsFormatRecipeTitleForDisplay
      : null;
  if (shared) return shared(raw);
  return String(raw || '')
    .replace(/'/g, '\u2019')
    .replace(/--/g, '\u2014')
    .replace(/\.{3}/g, '\u2026');
}

const RECIPE_SUMMARY_HINT_IDLE = 'Add an introduction.';
const RECIPE_SUMMARY_HINT_EDITING = 'Introduction';
const RECIPE_SERVINGS_HINT_IDLE = 'Add number of servings.';

function normalizeRecipeSummaryText(raw) {
  if (raw == null) return '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

function ensureRecipeSummaryModel(recipe) {
  if (!recipe || typeof recipe !== 'object') return;
  if (recipe.summary == null) recipe.summary = '';
  else recipe.summary = String(recipe.summary);
}

function syncRecipeSummaryEditorDOM(container, recipe) {
  const textEl =
    container &&
    container.querySelector &&
    container.querySelector('#recipeSummaryText');
  const rowEl =
    container &&
    container.querySelector &&
    container.querySelector('#recipeSummaryRow');
  if (!textEl || !recipe) return;

  const normalized = normalizeRecipeSummaryText(recipe.summary);
  textEl.contentEditable = 'false';
  if (rowEl) rowEl.classList.remove('editing');

  if (!normalized) {
    textEl.textContent = '';
    textEl.classList.add('placeholder-prompt');
    textEl.classList.remove('placeholder-prompt--editblue');
    textEl.dataset.placeholder = RECIPE_SUMMARY_HINT_IDLE;
  } else {
    textEl.textContent = normalized;
    textEl.classList.remove('placeholder-prompt', 'placeholder-prompt--editblue');
    textEl.removeAttribute('data-placeholder');
  }
}

function attachRecipeSummaryEditor(textEl) {
  if (isRecipePlannerModeActive() || !textEl) return;
  if (textEl.dataset.summaryEditorBound === '1') return;
  textEl.dataset.summaryEditorBound = '1';

  textEl.addEventListener('click', () => {
    if (textEl.isContentEditable) return;

    const rowEl = document.getElementById('recipeSummaryRow');
    const originalModel = normalizeRecipeSummaryText(window.recipeData?.summary);
    const hadDirty = typeof isDirty !== 'undefined' && isDirty === true;

    textEl.contentEditable = 'true';
    if (rowEl) rowEl.classList.add('editing');

    const startValue = originalModel;
    textEl.textContent = startValue;

    if (!startValue) {
      textEl.classList.add('placeholder-prompt', 'placeholder-prompt--editblue');
      textEl.dataset.placeholder = RECIPE_SUMMARY_HINT_EDITING;
    } else {
      textEl.classList.remove('placeholder-prompt', 'placeholder-prompt--editblue');
      textEl.removeAttribute('data-placeholder');
    }

    const placeCaret = () => {
      try {
        textEl.focus({ preventScroll: true });
      } catch (_) {
        try {
          textEl.focus();
        } catch (_) {}
      }
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(textEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    };
    requestAnimationFrame(() => requestAnimationFrame(placeCaret));

    let hasPendingEdit = false;

    const cleanup = () => {
      textEl.contentEditable = 'false';
      if (rowEl) rowEl.classList.remove('editing');
      textEl.removeEventListener('blur', onBlur);
      textEl.removeEventListener('input', onInput);
      textEl.removeEventListener('keydown', onKeyDown);
    };

    const commitToModel = () => {
      const next = normalizeRecipeSummaryText(textEl.textContent || '');
      if (
        window.recipeData &&
        normalizeRecipeSummaryText(window.recipeData.summary) !== next
      ) {
        window.recipeData.summary = next;
        if (typeof markDirty === 'function') markDirty();
      }
    };

    const onInput = () => {
      if (!hasPendingEdit) {
        hasPendingEdit = true;
        if (typeof markDirty === 'function') markDirty();
      }
      const v = normalizeRecipeSummaryText(textEl.textContent || '');
      if (v) {
        textEl.classList.remove('placeholder-prompt', 'placeholder-prompt--editblue');
        textEl.removeAttribute('data-placeholder');
      } else {
        textEl.classList.add('placeholder-prompt', 'placeholder-prompt--editblue');
        textEl.dataset.placeholder = RECIPE_SUMMARY_HINT_EDITING;
      }
    };

    const onBlur = () => {
      commitToModel();
      cleanup();
      syncRecipeSummaryEditorDOM(getPageContentContainer(), window.recipeData);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        textEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (window.recipeData) window.recipeData.summary = originalModel;
        cleanup();
        if (!hadDirty && typeof revertChanges === 'function') {
          revertChanges();
        } else {
          syncRecipeSummaryEditorDOM(getPageContentContainer(), window.recipeData);
        }
      }
    };

    textEl.addEventListener('blur', onBlur);
    textEl.addEventListener('input', onInput);
    textEl.addEventListener('keydown', onKeyDown);
  });
}

// --- Inline editable title (global helper) ---
function attachTitleEditor(titleEl) {
  if (isRecipePlannerModeActive()) return;
  if (!titleEl) return;

  // Ensure flag has a defined default
  if (typeof window.isTitleEditing === 'undefined')
    window.isTitleEditing = false;

  titleEl.addEventListener('click', () => {
    if (titleEl.isContentEditable) return;

    const original = titleEl.textContent || '';
    let hasPendingEdit = false;
    const hadDirty = typeof isDirty !== 'undefined' && isDirty === true;

    titleEl.contentEditable = 'true';

    // Mark title as "in edit mode" so servings visibility can follow spec.
    window.isTitleEditing = true;
    if (typeof updateServingsVisibility === 'function') {
      updateServingsVisibility(window.recipeData);
    }

    // If there is no default servings value yet, entering title edit
    // should immediately surface "Serves" + the number field — but without
    // stealing focus away from the title (caret stays where the user clicked).

    if (
      typeof servingsHasDefaultValue === 'function' &&
      !servingsHasDefaultValue(window.recipeData)
    ) {
      window.isServingsEditing = true;

      if (typeof renderServingsRow === 'function') {
        // renderServingsRow defers focus to the default input; skip that here so
        // titleEl.focus() below keeps the caret in the title.
        window._skipServingsAutofocusOnce = true;
        renderServingsRow(window.recipeData);

        // Prime last-valid snapshot at start of edit mode
        if (window.recipeData) {
          window._servingsLastValid =
            window.recipeData.servingsDefault != null
              ? window.recipeData.servingsDefault
              : null;
        }
      }
    }

    // Match instruction edit state: special editing color, no outline
    titleEl.classList.add('editing-title');

    titleEl.focus();

    const cleanup = () => {
      titleEl.contentEditable = 'false';
      titleEl.classList.remove('editing-title');
      titleEl.removeEventListener('blur', onBlur);
      titleEl.removeEventListener('input', onInput);
      titleEl.removeEventListener('keydown', onKeyDown);

      window.isTitleEditing = false;

      if (typeof updateServingsVisibility === 'function') {
        updateServingsVisibility(window.recipeData);
      }
    };

    const commit = () => {
      const raw = titleEl.textContent || '';
      const nextTitle = normalizeRecipeTitle(raw);

      if (window.recipeData && window.recipeData.title !== nextTitle) {
        window.recipeData.title = nextTitle;
        if (typeof markDirty === 'function') markDirty();
      }
      titleEl.textContent = formatRecipeTitleForDisplay(nextTitle);

      // Mirror into the app-bar title so Save reads the right value and UI stays coherent.
      const appTitle = document.getElementById('appBarTitle');
      if (appTitle) appTitle.textContent = formatRecipeTitleForDisplay(nextTitle);
    };

    const onInput = () => {
      if (!hasPendingEdit) {
        hasPendingEdit = true;
        if (typeof markDirty === 'function') {
          markDirty();
        }
      }
    };

    const cancelLocal = () => {
      titleEl.textContent = original;
      const appTitle = document.getElementById('appBarTitle');
      if (appTitle) appTitle.textContent = formatRecipeTitleForDisplay(original);
      if (!hadDirty && typeof revertChanges === 'function') {
        revertChanges();
      }
    };

    const collapseEmptyServingsEditor = () => {
      if (
        typeof servingsHasDefaultValue !== 'function' ||
        !window.recipeData ||
        servingsHasDefaultValue(window.recipeData)
      ) {
        return;
      }
      window.isServingsEditing = false;
      if (typeof renderServingsRow === 'function') {
        renderServingsRow(window.recipeData);
      }
      if (typeof updateServingsVisibility === 'function') {
        updateServingsVisibility(window.recipeData);
      }
    };

    const onBlur = (e) => {
      const row = document.getElementById('servingsRow');
      const next = e && e.relatedTarget;

      let goingIntoServings = row && next && row.contains(next);

      // FIX: On first render, servings row steals focus momentarily.
      // If next is *null* or outside both title and row → treat as real blur.
      if (!next) goingIntoServings = false;
      if (next && row && !row.contains(next) && next !== titleEl) {
        goingIntoServings = false;
      }

      const shouldCollapseServings =
        !goingIntoServings &&
        typeof servingsHasDefaultValue === 'function' &&
        window.recipeData &&
        !servingsHasDefaultValue(window.recipeData);

      // Finish title edit first so isTitleEditing is false before we touch servings.
      commit();
      cleanup();

      // If title lost focus, we didn’t move into servings, and there’s still no data,
      // hide the servings editor (match console shim behavior).
      if (shouldCollapseServings) {
        collapseEmptyServingsEditor();
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelLocal();
        cleanup();
        collapseEmptyServingsEditor();
      }
    };

    titleEl.addEventListener('blur', onBlur);
    titleEl.addEventListener('input', onInput);
    titleEl.addEventListener('keydown', onKeyDown);
  });
}

// --- Measure formatting helper (DB-aware when available) ---
function formatMeasureLabel(measureKey) {
  if (!measureKey || typeof measureKey !== 'string') return measureKey;

  const parts = measureKey.split(' ');
  if (parts.length < 2) return measureKey;

  const amount = parts[0];
  const unitCode = parts.slice(1).join(' ');

  // Best-effort numeric value for pluralization (e.g., "2 cup")
  let numericVal = null;
  const numericMatch = amount.match(/^\d+(\.\d+)?/);
  if (numericMatch) {
    numericVal = parseFloat(numericMatch[0]);
  }

  let unitText = unitCode;

  if (typeof window.getUnitDisplay === 'function') {
    unitText = window.getUnitDisplay(unitCode, numericVal);
  }

  return [amount, unitText].filter(Boolean).join(' ');
}

// --- Compute Measures ---
function computeMeasures(ingredients) {
  const found = new Set();

  const measures = {
    '⅛ tsp': 0.125,
    '¼ tsp': 0.25,
    '½ tsp': 0.5,
    '1 tsp': 1,
    '½ tbsp': 0.5,
    '1 tbsp': 1,
    '⅛ cup': 0.125,
    '¼ cup': 0.25,
    '⅓ cup': 0.333,
    '½ cup': 0.5,
    '⅔ cup': 0.667,
    '¾ cup': 0.75,
    '1 cup': 1,
    '2 cup': 2,
    '4 cup': 4,
    '8 cup': 8,
  };

  function addDryCup(qtyNum) {
    const dryCups = [
      '⅛ cup',
      '¼ cup',
      '⅓ cup',
      '½ cup',
      '⅔ cup',
      '¾ cup',
      '1 cup',
    ];
    for (const m of dryCups) {
      if (Math.abs(qtyNum - measures[m]) < 0.01) {
        found.add(m);
        return;
      }
      if (qtyNum < measures[m]) {
        found.add(m);
        return;
      }
    }
  }

  function decompose(qty, unit, isLiquid) {
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return;

    if (unit.includes('tsp')) {
      let remaining = qtyNum;
      const unitMeasures = ['1 tsp', '½ tsp', '¼ tsp', '⅛ tsp'];
      for (const m of unitMeasures) {
        while (remaining + 1e-6 >= measures[m]) {
          found.add(m);
          remaining -= measures[m];
        }
      }
    } else if (unit.includes('tbsp')) {
      let remaining = qtyNum;
      const unitMeasures = ['1 tbsp', '½ tbsp'];
      for (const m of unitMeasures) {
        while (remaining + 1e-6 >= measures[m]) {
          found.add(m);
          remaining -= measures[m];
        }
      }
    } else if (unit.includes('cup')) {
      function chooseLiquidMeasure(qtyCups) {
        if (qtyCups <= 1.25) return '1 cup';
        if (qtyCups <= 2.5) return '2 cup';
        if (qtyCups <= 5.5) return '4 cup';
        return '8 cup';
      }
      if (qtyNum <= 1.25) {
        addDryCup(qtyNum);
      } else {
        const mainVessel = chooseLiquidMeasure(qtyNum);
        found.add(mainVessel);
        const mainSize = measures[mainVessel];
        const remainder = qtyNum % mainSize;
        if (remainder > 0 && remainder < 1.25) {
          addDryCup(remainder);
        }
      }
    }
  }

  const normalizeMeasureToken = (value) =>
    String(value == null ? '' : value)
      .replace(/^\s*OR\s*/i, '')
      .trim();

  const resolveQuantityForMeasures = (ing) => {
    const min = Number(ing && ing.quantityMin);
    const max = Number(ing && ing.quantityMax);
    if (Number.isFinite(min) && min > 0) return min;
    if (Number.isFinite(max) && max > 0) return max;
    const fromQuantity = Number(normalizeMeasureToken(ing && ing.quantity));
    if (Number.isFinite(fromQuantity) && fromQuantity > 0) return fromQuantity;
    return null;
  };

  ingredients.forEach((ing) => {
    const qty = resolveQuantityForMeasures(ing);
    if (qty == null) return;
    const unit = normalizeMeasureToken(ing && ing.unit).toLowerCase();
    if (!unit || unit === 'or') return;
    decompose(qty, unit);
  });

  return MEASURE_ORDER.filter((m) => found.has(m));
}

// BFCache restore revives the frozen DOM without re-running loadRecipeEditorPage.
// That can leave ingredient slots with stale hint/CTA classes so "hidden" per-line
// affordances appear. Rebuild from the in-memory model (same pattern as shopping
// plan refetch on pageshow, but local-only).
(function installRecipeEditorBfCacheIngredientResync() {
  if (typeof window === 'undefined') return;
  if (window._recipeEditorBfCacheIngredientResyncInstalled) return;
  window._recipeEditorBfCacheIngredientResyncInstalled = true;

  window.addEventListener('pageshow', (event) => {
    if (!event || event.persisted !== true) return;
    const section = document.getElementById('ingredientsSection');
    if (!section || !window.recipeData) return;
    try {
      document.body.classList.remove(
        'ingredient-editing',
        'ingredient-insert-blank-active',
        'ingredient-master-link-mode',
      );
      window._activeIngredientEditor = null;
      window._activeIngredientHeadingEditor = null;
      window._editingIngredientHeadingClientId = null;
    } catch (_) {}
    try {
      if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
        window.recipeEditorRerenderIngredientsFromModel();
      }
    } catch (err) {
      console.warn('Recipe editor BFCache ingredients resync failed:', err);
    }
    try {
      if (typeof window.recipeEditorRerenderYouWillNeedFromModel === 'function') {
        void window.recipeEditorRerenderYouWillNeedFromModel();
      }
    } catch (err) {
      console.warn('Recipe editor BFCache YWN resync failed:', err);
    }
  });
})();
