#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const session = fs.readFileSync(
  path.join(projectRoot, 'js/favoriteEatsDocumentSession.js'),
  'utf8',
);
const recipesPage = fs.readFileSync(
  path.join(projectRoot, 'js/screens/recipesPage.js'),
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ds = (() => {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(session, context);
  return context.favoriteEatsDocumentSession;
})();

assert(ds && typeof ds.surfacesForRecipesBrowseInvalidation === 'function');

const selectedDeselectSurfaces = ds.surfacesForRecipesBrowseInvalidation(
  ds.RECIPES_BROWSE_REASON_PLAN_SELECTION_CHANGED,
  { plannerSelectMode: true },
);
assert(
  selectedDeselectSurfaces.includes(ds.SURFACE_MEMBERSHIP),
  'deselect under planner must schedule membership (filtered list rebuild)',
);

assert(
  recipesPage.includes("activeTagFilters.has(RECIPE_LIST_SELECTED_FILTER_CHIP_ID)") &&
    recipesPage.includes('matchesSelected = selectedOnly ? isRecipeSelected(row.id) : true'),
  'recipes page still filters membership by plan selection when selected chip is active',
);

assert(
  /invalidateRecipesBrowseUi\('planSelectionChanged'\)/.test(recipesPage) &&
    recipesPage.includes("invalidateRecipesBrowseUi('userFilterToggle')"),
  'recipes page routes selection and filter changes through browse invalidation',
);

assert(
  recipesPage.includes('paintRecipesBrowseVisibleRows') &&
    recipesPage.includes('paintRecipesBrowseMembership'),
  'recipes page registers membership and visible-row browse paint surfaces',
);

console.log('Recipes browse document session tests passed.');
