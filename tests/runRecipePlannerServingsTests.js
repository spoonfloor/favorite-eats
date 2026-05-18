#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end + endMarker.length);
}

function createLocalStorageMock(seed = {}) {
  const store = new Map(
    Object.entries(seed).map(([key, value]) => [String(key), String(value)])
  );
  return {
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

function loadHelpers(localStorageSeed = {}) {
  const source = fs.readFileSync(utilsPath, 'utf8');
  const snippet = extractSnippet(
    source,
    '// --- Recipe planner servings helpers (tests extract this block) ---',
    '// --- End recipe planner servings helpers ---'
  );
  const localStorage = createLocalStorageMock(localStorageSeed);
  const dispatchedEvents = [];
  function CustomEvent(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
  const context = {
    console,
    CustomEvent,
    localStorage,
    window: {
      favoriteEatsStorageKeys: {
        recipePlannerServings: 'favoriteEats:recipe-planner-servings:v1',
      },
      favoriteEatsEventNames: {
        recipePlannerServingsChanged: 'favoriteEats:recipe-planner-servings-changed',
      },
      dispatchEvent(event) {
        dispatchedEvents.push(event);
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(snippet, context, { filename: 'utils.recipe-planner-servings.js' });
  const helpers = context.window.favoriteEatsRecipePlannerServings;
  if (!helpers) throw new Error('Recipe planner servings helpers were not attached to window.');
  return { helpers, localStorage, dispatchedEvents };
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function run() {
  const NEW_KEY = 'favoriteEats:recipe-planner-servings:v1';
  const staleSeed = {
    [NEW_KEY]: JSON.stringify({ 7: 99 }),
  };
  const { helpers: staleHelpers, localStorage: staleStorage } = loadHelpers(staleSeed);
  const recipe = {
    id: 7,
    servingsDefault: 4,
    servings: {
      default: 4,
      min: null,
      max: null,
    },
  };

  assertEqual(
    staleHelpers.getStoredValue(recipe, { scrubInvalid: false }),
    99,
    'stored servings clamp to planner max when stale value exceeds bounds'
  );
  assertEqual(
    staleHelpers.getMultiplier(recipe, { scrubInvalid: false }),
    24.75,
    'clamped stale value produces multiplier from planner max'
  );

  staleHelpers.getStoredValue(recipe, { scrubInvalid: true });
  assertEqual(
    staleStorage.getItem(NEW_KEY),
    JSON.stringify({ 7: 99 }),
    'scrubbing preserves clamped override when it differs from default'
  );

  const validSeed = {
    [NEW_KEY]: JSON.stringify({ 12: 6 }),
  };
  const {
    helpers: validHelpers,
    localStorage: validStorage,
    dispatchedEvents: validEvents,
  } = loadHelpers(validSeed);
  const adjustableRecipe = {
    id: 12,
    servingsDefault: 4,
    servings: {
      default: 4,
      min: 2,
      max: 8,
    },
  };

  const adjustableBounds = validHelpers.getBounds(adjustableRecipe);
  assertEqual(adjustableBounds.min, 0.5, 'planner min ignores DB servings_min');
  assertEqual(adjustableBounds.max, 99, 'planner max ignores DB servings_max');

  assertEqual(
    validHelpers.getStoredValue(adjustableRecipe, { scrubInvalid: true }),
    6,
    'valid stored override remains intact'
  );
  assertEqual(
    validHelpers.getMultiplier(adjustableRecipe, { scrubInvalid: true }),
    1.5,
    'valid stored override produces expected multiplier'
  );
  assertEqual(
    validStorage.getItem(NEW_KEY),
    JSON.stringify({ 12: 6 }),
    'valid stored override is preserved during scrubbing'
  );

  validHelpers.setStoredValue(adjustableRecipe, 7);
  assertEqual(
    validStorage.getItem(NEW_KEY),
    JSON.stringify({ 12: 7 }),
    'setting a new servings override persists the updated value'
  );
  assertEqual(
    validHelpers.changeEventName,
    'favoriteEats:recipe-planner-servings-changed',
    'change event name is exposed on the shared API'
  );
  assertEqual(
    typeof validHelpers.dispatchChanged,
    'function',
    'shared API exposes a change dispatcher'
  );
  assertEqual(
    validHelpers.getEffectiveServings(adjustableRecipe, { scrubInvalid: true }),
    7,
    'effective servings reflect the latest persisted override'
  );
  assertEqual(
    validHelpers.getMultiplier(adjustableRecipe, { scrubInvalid: true }),
    1.75,
    'updated override produces the expected multiplier'
  );
  assertEqual(
    validHelpers.loadMap()['12'],
    7,
    'loadMap returns the latest persisted servings override'
  );
  assertEqual(
    validEvents.length,
    1,
    'changing servings dispatches a single sync event'
  );
  assertEqual(
    validEvents[0].type,
    'favoriteEats:recipe-planner-servings-changed',
    'sync event uses the shared recipe-planner-servings event name'
  );
  assertEqual(
    validEvents[0].detail.recipeId,
    12,
    'sync event includes the changed recipe id'
  );
  assertEqual(
    validEvents[0].detail.value,
    7,
    'sync event includes the latest effective servings value'
  );

  const { helpers: noBaseHelpers } = loadHelpers({});
  const noBaseRecipe = {
    id: 99,
    servingsDefault: null,
    servings: { default: null, min: null, max: null },
  };
  const nbBounds = noBaseHelpers.getBounds(noBaseRecipe);
  assertEqual(nbBounds.baseDefault, 1, 'no-base recipe assumes baseline default of 1');
  assertEqual(nbBounds.canAdjust, true, 'no-base recipe stepper is adjustable');
  assertEqual(nbBounds.min, 0.5, 'no-base recipe allows servings down to planner min');
  assertEqual(nbBounds.max, 99, 'no-base recipe allows servings up to planner max');
  assertEqual(
    noBaseHelpers.clampValue(0, nbBounds),
    null,
    'no-base clamp maps zero to unset storage'
  );
  assertEqual(noBaseHelpers.clampValue(1, nbBounds), 1, 'no-base clamp keeps 1');
  assertEqual(noBaseHelpers.clampValue(2, nbBounds), 2, 'no-base clamp allows scaling above baseline');
  assertEqual(
    noBaseHelpers.getMultiplier(noBaseRecipe, { scrubInvalid: true }),
    1,
    'no-base unset servings use neutral multiplier'
  );
  noBaseHelpers.setStoredValue(noBaseRecipe, 1);
  assertEqual(
    noBaseHelpers.getMultiplier(noBaseRecipe, { scrubInvalid: true }),
    1,
    'no-base servings at baseline keep neutral multiplier'
  );
  noBaseHelpers.setStoredValue(noBaseRecipe, 2);
  assertEqual(
    noBaseHelpers.getMultiplier(noBaseRecipe, { scrubInvalid: true }),
    2,
    'no-base servings at 2 double ingredient scale'
  );

  console.log('Recipe planner servings tests passed.');
}

run();
