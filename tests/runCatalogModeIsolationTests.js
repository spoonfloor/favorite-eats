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

function assertNotIncludes(source, needle, message) {
  if (source.includes(needle)) {
    throw new Error(`${message}: unexpected ${JSON.stringify(needle)}`);
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
  const recipeEditorPage = read('js/screens/recipeEditorPage.js');
  const recipeEditor = read('js/recipeEditor.js');
  const recipeEditorSession = read('js/recipeEditor.session.js');
  const ingredientRenderer = read('js/ingredientRenderer.js');
  const main = read('js/main.js');
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
    itemsPage,
    'initialShoppingBrowsePlanRowsIndexPromise = refreshShoppingBrowsePlanRowsIndex();',
    'Items planner plan row index starts without blocking first render',
  );
  assertIncludes(
    itemsPage,
    'refreshShoppingFilterUi();\n        applyShoppingFilters();\n        void (async () => {',
    'Items planner-mode chips render before async hydrate on mode flip',
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
    recipesPage,
    'if (isRecipePlannerSelectMode()) {\n        rerenderFilteredRecipes();\n        void (async () => {',
    'Recipes planner-mode chips render before async hydrate on mode flip',
  );

  assertIncludes(
    recipeEditorPage,
    'if (isRecipePlannerMode && shouldUseRemoteShoppingState())',
    'Recipe editor hydrates plan/list only in planner mode',
  );
  assertIncludes(
    recipeEditorPage,
    'let recipeEditorPageLoadGeneration = 0;',
    'Recipe editor load has a generation guard for mode flips',
  );
  assertIncludes(
    recipeEditorPage,
    'if (!isCurrentLoad()) return;',
    'Recipe editor stale async loads abort before rendering',
  );
  assertOrder(
    ingredientRenderer,
    "document.body?.dataset?.page === 'recipe-editor'",
    'window.plannerMode',
    'Ingredient renderer trusts recipe editor page mode before global planner storage',
  );
  assertOrder(
    recipeEditor,
    "document.body?.dataset?.page === 'recipe-editor'",
    'window.plannerMode',
    'Recipe editor helpers trust page mode before global planner storage',
  );
  assertOrder(
    recipeEditorSession,
    "document.body?.dataset?.page === 'recipe-editor'",
    'window.plannerMode',
    'Recipe editor dirty state trusts page mode before global planner storage',
  );
  assertIncludes(
    recipeEditor,
    'needWrapper.replaceChildren(nextContents);',
    'Recipe editor swaps You Will Need contents atomically',
  );
  assertIncludes(
    recipeEditorPage,
    'let renderedRefreshedRecipe = false;',
    'Recipe editor save avoids duplicate ingredients/YWN rerender after full render',
  );
  assertIncludes(
    main,
    'favoriteEatsRecipeCatalogRealtimeUnsub();\n        } catch (_) {}',
    'Recipes catalog realtime setup should unsubscribe an existing channel before replacing it',
  );
  assertIncludes(
    main,
    "pageId !== 'store-editor' &&",
    'Global boot skips plan/list hydrate for store editor',
  );
  assertIncludes(
    main,
    "pageId !== 'unit-editor' &&",
    'Global boot skips plan/list hydrate for unit editor',
  );
  assertIncludes(
    main,
    "pageId !== 'size-editor' &&",
    'Global boot skips plan/list hydrate for size editor',
  );
  assertIncludes(
    main,
    "pageId !== 'tag-editor'",
    'Global boot skips plan/list hydrate for tag editor',
  );
  assertNotIncludes(
    main,
    'Shopping item editor: could not load plan/list from server:',
    'Shopping item editor no longer blocks on plan/list hydrate',
  );

  assertIncludes(
    itemsScreen,
    'const includePlan = options.includePlan !== false;',
    'Items screen derives includePlan from bootstrap options',
  );
  assertIncludes(
    itemsScreen,
    'await hydrateShoppingState();',
    'Items warm catalog revisit hydrates plan before applying cached catalog',
  );
  assertOrder(
    itemsScreen,
    'await hydrateShoppingState();',
    'fromCache: true',
    'Items catalog cache hit waits for plan hydrate before fromCache apply',
  );
  assertIncludes(
    itemsScreen,
    'shouldUseRemoteShoppingState: options.shouldUseRemoteShoppingState',
    'Items screen bootstrap forwards remote-state flag for warm plan hydrate',
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
    screenApply,
    'revisionsAligned || shoppingPlanHasContentSelections(snapshot?.plan)',
    'Items fromCache apply refuses stale empty store snapshots',
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
