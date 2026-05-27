#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const recipesPage = fs.readFileSync(
  path.join(projectRoot, 'js', 'screens', 'recipesPage.js'),
  'utf8',
);
const shoppingListPage = fs.readFileSync(
  path.join(projectRoot, 'js', 'screens', 'shoppingListPage.js'),
  'utf8',
);
const main = fs.readFileSync(path.join(projectRoot, 'js', 'main.js'), 'utf8');
const supabaseAdapter = fs.readFileSync(
  path.join(projectRoot, 'js', 'data', 'adapters', 'supabaseAdapter.js'),
  'utf8',
);
const rpcMigration = fs.readFileSync(
  path.join(
    projectRoot,
    'supabase',
    'migrations',
    '20260524162500_set_plan_recipe_servings_override_rpc.sql',
  ),
  'utf8',
);
const quantityRpcMigration = fs.readFileSync(
  path.join(
    projectRoot,
    'supabase',
    'migrations',
    '20260525232300_set_plan_recipe_quantity.sql',
  ),
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const functionStart = source.indexOf(`function ${name}`);
  const constStart = source.indexOf(`const ${name} =`);
  const start =
    functionStart >= 0 && (constStart < 0 || functionStart < constStart)
      ? functionStart
      : constStart;
  if (start < 0) throw new Error(`Missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

assert(
  main.includes('let favoriteEatsPlanRecipeServingsQueue = null') &&
    main.includes('function getFavoriteEatsPlanRecipeServingsQueue') &&
    main.includes("storageKey: 'favoriteEatsInputSync:plan:recipeServings:v1'") &&
    main.includes('window.favoriteEatsPlanRecipeServingsQueue') &&
    main.includes('flushAll()') &&
    main.includes('drainPlanRecipeServingsDurable'),
  'Recipes servings queue should be singleton/module-scoped, durable, exposed, and flushed on pagehide.',
);

assert(
  main.includes('applyLocalPlanRecipeServingsOverride') &&
    main.includes('sendPlanRecipeServingsOverrideRpc') &&
    main.includes('setPlanRecipeServingsOverride(request)') &&
    main.includes('queue.enqueue({') &&
    main.includes("field: 'servingsOverride'"),
  'Recipes servings input should use the split local-apply / narrow-RPC queue path.',
);

const flushBlock = extractFunction(main, 'sendPlanRecipeServingsOverrideRpc');
assert(
  !flushBlock.includes('setShoppingPlanRecipeSelection') &&
    !flushBlock.includes('setShoppingPlanRecipeRootSelection') &&
    !flushBlock.includes('persistShoppingPlan') &&
    !flushBlock.includes('scheduleCoalescedPlanSaveToDataService') &&
    !flushBlock.includes('forceRemoteSave'),
  'Recipes servings flush must not write the local container or call a whole-plan save path.',
);

const localApplyBlock = extractFunction(main, 'applyLocalPlanRecipeServingsOverride');
assert(
  localApplyBlock.includes('setShoppingPlanRecipeRootSelection') &&
    localApplyBlock.includes('setShoppingPlanRecipeSelection') &&
    localApplyBlock.includes('{ skipRemoteSave: true }') &&
    !localApplyBlock.includes('setPlanRecipeServingsOverride') &&
    !localApplyBlock.includes('scheduleCoalescedPlanSaveToDataService') &&
    !localApplyBlock.includes('forceRemoteSave'),
  'Recipes servings local apply should update the local plan only.',
);

assert(
  main.includes('function applyFavoriteEatsPlanSelectedRecipeRealtimePatch') &&
    main.includes("String(payload.table || '') !== 'selected_recipes'") &&
    main.includes('window.favoriteEatsPlanRecipeServingsQueue') &&
    main.includes('queue.shouldSkipEcho') &&
    main.includes('queue.recordEchoApplied') &&
    main.includes('setShoppingPlanRecipeSelection') &&
    main.includes('setShoppingPlanRecipeRootSelection') &&
    main.includes('const rootEntry = roots && typeof roots ===') &&
    main.includes('{ skipRemoteSave: true }') &&
    main.includes('scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly') &&
    /String\(payload\.table \|\| ''\) === 'selected_recipes'[\s\S]*applyFavoriteEatsPlanSelectedRecipeRealtimePatch\(payload\)[\s\S]*scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly\([\s\S]*return;[\s\S]*String\(payload\.table \|\| ''\) === 'selected_items'/.test(
      main,
    ),
  'plan.selected_recipes realtime should patch child rows immediately and coalesce passive UI refreshes before wholesale fallback.',
);

const selectedRecipesPatchBlock = extractFunction(
  main,
  'applyFavoriteEatsPlanSelectedRecipeRealtimePatch',
);
assert(
  selectedRecipesPatchBlock.includes('const shouldSkipServingsEcho') &&
    selectedRecipesPatchBlock.includes('const hasActiveLocalServingsIntent') &&
    selectedRecipesPatchBlock.includes('const servingsForPatch') &&
    selectedRecipesPatchBlock.includes('servingsOverride: servingsForPatch') &&
    !/queue\.shouldSkipEcho[\s\S]{0,240}return true;/.test(
      selectedRecipesPatchBlock,
    ),
  'plan.selected_recipes membership patches must not be dropped just because the servings echo is skippable.',
);

assert(
  supabaseAdapter.includes("'selected_recipe_roots'") &&
    main.includes('function applyFavoriteEatsPlanSelectedRecipeRootRealtimePatch') &&
    main.includes("String(payload.table || '') !== 'selected_recipe_roots'") &&
    main.includes("String(payload.table || '') === 'selected_recipe_roots'") &&
    main.includes('plan.selected_recipe_roots child patch') &&
    main.includes('setShoppingPlanRecipeRootSelection') &&
    main.includes(
      "/^plan realtime fallback:plan\\.(selected_items|selected_recipe_roots|selected_recipes|documents|store_preferences)$/",
    ),
  'Recipes root membership should receive a canonical selected_recipe_roots child patch instead of relying on merged selected_recipes.',
);

const selectedRecipeRootsPatchBlock = extractFunction(
  main,
  'applyFavoriteEatsPlanSelectedRecipeRootRealtimePatch',
);
assert(
  selectedRecipeRootsPatchBlock.includes('const shouldSkipServingsEcho') &&
    selectedRecipeRootsPatchBlock.includes('const hasActiveLocalServingsIntent') &&
    selectedRecipeRootsPatchBlock.includes('const servingsForPatch') &&
    selectedRecipeRootsPatchBlock.includes('servingsOverride: servingsForPatch') &&
    !/queue\.shouldSkipEcho[\s\S]{0,240}return true;/.test(
      selectedRecipeRootsPatchBlock,
    ),
  'plan.selected_recipe_roots membership patches must not be dropped just because the servings echo is skippable.',
);

assert(
  recipesPage.includes('setPlanRecipeQuantity') &&
    recipesPage.includes('shouldUseNarrowRecipeQuantity') &&
    recipesPage.includes('quantity: isSelected ? 1 : 0') &&
    recipesPage.includes('servingsOverride: displayServingsForRpc') &&
    recipesPage.includes('{ skipRemoteSave: true }') &&
    !/shouldUseNarrowRecipeQuantity[\s\S]{0,500}persistShoppingPlan/.test(
      recipesPage,
    ),
  'Recipes zero/remove stepper path should use a narrow recipe quantity RPC, not a whole-plan save.',
);

assert(
  main.includes(
    "/^plan realtime fallback:plan\\.(selected_items|selected_recipe_roots|selected_recipes|documents|store_preferences)$/",
  ) &&
    main.includes('parent event absorbed') &&
    main.includes('companion event absorbed'),
  'Known migrated plan realtime tables should fail closed at hydrate scheduling.',
);

assert(
  main.includes('window.favoriteEatsPlanRecipeServingsQueue') &&
    main.includes('recipeSelections: merged') &&
    main.includes('Object.keys(currentRecipes).forEach') &&
    main.includes('seedShoppingPlanRecipeServingsQueueFromRemotePlan(remoteState.plan)') &&
    main.includes('seedShoppingPlanRecipeServingsQueueFromRemotePlan(state?.plan)') &&
    main.includes('seedShoppingPlanRecipeServingsQueueFromRemotePlan(snapshot.plan)'),
  'Wholesale plan hydrate should run protected recipe merge, splice-back, and seed recipe queue state.',
);

assert(
  recipesPage.includes('queue.peekInFlightKeys') &&
    recipesPage.includes('queue.getInFlightOp') &&
    recipesPage.includes('primeRecipeRowServings(recipeRow)') &&
    recipesPage.includes('refreshRecipeSelectionUi({ fullRerender: false })') &&
    recipesPage.includes('onIdleCollapse: () => {') &&
    recipesPage.includes('syncAllVisibleRecipeRowStates();') &&
    !recipesPage.includes('onIdleCollapse: rerenderFilteredRecipes') &&
    !recipesPage.includes('onDismissed: rerenderFilteredRecipes') &&
    /setRecipeSelected[\s\S]{0,5000}refreshRecipeSelectionUi\(\{ fullRerender: false \}\)/.test(
      recipesPage,
    ),
  'Recipes passive UI refresh should preserve active local intent and reprime visible rows before in-place sync.',
);

assert(
  recipesPage.includes('dispatchRecipeRowServingsApplied') &&
    recipesPage.includes('api.dispatchChanged(Math.trunc(rid), next)') &&
    /const appliedValue = recipePlannerServingsUi\.applyToModel\(row, nextValue\);[\s\S]{0,120}dispatchRecipeRowServingsApplied\(id, appliedValue\);/.test(
      recipesPage,
    ),
  'Recipes +/- stepper taps should explicitly publish the applied servings value to the plan queue.',
);

assert(
  main.includes('favoriteEatsRemotePlanUiRefreshRequestSeq += 1') &&
    main.includes('__favoriteEatsRemotePlanUiRefreshRequestSeq') &&
    shoppingListPage.includes('requestSeqAtStart') &&
    shoppingListPage.includes('__favoriteEatsRemotePlanUiRefreshRequestSeq') &&
    shoppingListPage.includes('stale plan refresh apply ignored') &&
    shoppingListPage.includes('stale plan refresh render ignored'),
  'Recipes burst refreshes should invalidate older Shopping List plan refreshes at schedule time.',
);

assert(
  /create or replace function catalog\.set_plan_recipe_servings_override[\s\S]*returning updated_at into v_updated_at[\s\S]*'updated_at', v_updated_at/.test(
    rpcMigration,
  ) &&
    rpcMigration.includes('update plan.documents') &&
    rpcMigration.includes('version = version + 1') &&
    !rpcMigration.includes('save_shopping_state(') &&
    !rpcMigration.includes('save_shopping_plan('),
  'Recipes servings RPC should return child updated_at, bump plan.documents, and avoid whole-state writes.',
);

assert(
  quantityRpcMigration.includes(
    'create or replace function catalog.set_plan_recipe_quantity',
  ) &&
    quantityRpcMigration.includes('p_servings_override numeric default null') &&
    quantityRpcMigration.includes('delete from plan.selected_recipe_roots') &&
    quantityRpcMigration.includes('delete from plan.selected_recipes') &&
    quantityRpcMigration.includes('servings_override = excluded.servings_override') &&
    quantityRpcMigration.includes('update plan.documents') &&
    quantityRpcMigration.includes('version = version + 1') &&
    !quantityRpcMigration.includes('save_shopping_state(') &&
    !quantityRpcMigration.includes('save_shopping_plan('),
  'Recipes quantity/remove RPC should delete only the touched recipe rows and bump plan.documents.',
);

console.log('shopping plan recipe servings architecture tests passed.');
