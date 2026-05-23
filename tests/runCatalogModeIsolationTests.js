#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(`${message}: missing ${JSON.stringify(needle)}`);
  }
}

function assertOrder(source, first, second, message) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a === -1 || b === -1 || a >= b) {
    throw new Error(`${message}: expected ${JSON.stringify(first)} before ${JSON.stringify(second)}`);
  }
}

function run() {
  const itemsPage = read('js/screens/itemsPage.js');
  const recipesPage = read('js/screens/recipesPage.js');
  const itemsScreen = read('js/screens/items.js');
  const recipesScreen = read('js/screens/recipes.js');
  const dataIndex = read('js/data/index.js');
  const screenApply = read('js/favoriteEatsScreenApply.js');
  const adapter = read('js/data/adapters/supabaseAdapter.js');
  const migration = read('supabase/migrations/20260623150000_load_screen_include_plan.sql');

  assertIncludes(
    itemsPage,
    'includePlan: isPlannerModeEnabled()',
    'Items page passes planner mode to screen bootstrap',
  );
  assertIncludes(
    itemsPage,
    'const appendShoppingCatalogRowForItem =',
    'Items page has a catalog-only row path',
  );
  assertOrder(
    itemsPage,
    'if (!plannerSelectMode) {',
    'appendShoppingCatalogRowForItem(item, li, displayName);',
    'Items catalog row path is selected before planner row construction',
  );
  assertIncludes(
    itemsPage,
    'if (!isShoppingPlannerSelectMode()) return;',
    'Items deferred plan hydrate is planner-gated',
  );

  assertIncludes(
    recipesPage,
    'includePlan: isPlannerModeEnabled()',
    'Recipes page passes planner mode to screen bootstrap',
  );
  assertIncludes(
    recipesPage,
    'const plannerSelectMode = isRecipePlannerSelectMode();',
    'Recipes page chooses row rendering by mode',
  );
  assertOrder(
    recipesPage,
    'if (!plannerSelectMode) {',
    'primeRecipeRowServings(row);',
    'Recipes catalog row path avoids planner servings priming',
  );

  assertIncludes(
    itemsScreen,
    'const includePlan = options.includePlan !== false;',
    'Items screen derives includePlan from bootstrap options',
  );
  assertIncludes(
    recipesScreen,
    'const includePlan = options.includePlan !== false;',
    'Recipes screen derives includePlan from bootstrap options',
  );
  assertIncludes(
    dataIndex,
    'loadItemsScreen: (request) => getSupabaseAdapter().loadItemsScreen(request)',
    'Data service forwards loadItemsScreen request options',
  );

  assertIncludes(
    screenApply,
    'if (!includePlan) {',
    'Screen apply can skip plan ingestion',
  );
  assertIncludes(
    adapter,
    'p_include_plan: includePlan',
    'Supabase adapter sends p_include_plan',
  );
  assertIncludes(
    migration,
    'p_include_plan boolean default true',
    'Migration adds include-plan RPC parameter',
  );

  console.log('Catalog mode isolation tests passed.');
}

run();
