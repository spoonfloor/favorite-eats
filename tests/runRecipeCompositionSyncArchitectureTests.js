#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const compositionSync = fs.readFileSync(
  path.join(projectRoot, 'js/favoriteEatsRecipeCompositionSync.js'),
  'utf8',
);
const main = fs.readFileSync(path.join(projectRoot, 'js/main.js'), 'utf8');
const itemsPage = fs.readFileSync(
  path.join(projectRoot, 'js/screens/itemsPage.js'),
  'utf8',
);
const adapter = fs.readFileSync(
  path.join(projectRoot, 'js/data/adapters/supabaseAdapter.js'),
  'utf8',
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), `${message}: missing ${JSON.stringify(needle)}`);
}

assertIncludes(
  compositionSync,
  'registerFavoriteEatsCatalogCompositionUiRefreshHook',
  'composition sync exposes composition UI refresh hook registration',
);
assertIncludes(
  compositionSync,
  'bumpRecipeCompositionReadModel',
  'composition refresh bumps recipe composition read model',
);
assertIncludes(
  compositionSync,
  'recipe_ingredient_map',
  'composition sync classifies recipe ingredient map as composition table',
);

assertIncludes(
  adapter,
  'function bumpRecipeCompositionReadModel',
  'adapter defines composition read model bump',
);
assertIncludes(
  adapter,
  'recipeDetailResolvedCache.clear()',
  'composition read model bump clears recipe detail cache',
);
assertIncludes(
  adapter,
  'const recipeCatalogRealtimeChannels = new Map();',
  'adapter tracks recipe catalog realtime channels by channel name',
);
assertIncludes(
  adapter,
  'recipeCatalogRealtimeChannels.get(channelName)',
  'adapter removes an existing same-name recipe catalog channel before resubscribing',
);

assertIncludes(
  main,
  'favoriteEatsCatalogReferencePendingComposition',
  'catalog reference realtime routes composition vs reference refreshes',
);
assert(
  /needsComposition[\s\S]*scheduleFavoriteEatsCatalogCompositionRefresh/.test(
    main,
  ),
  'composition realtime schedules composition refresh, not wholesale plan hydrate',
);
assertIncludes(
  main,
  'ensureFavoriteEatsRecipeCatalogCompositionSubscription',
  'main boot subscribes to recipe catalog for composition refresh',
);

assertIncludes(
  itemsPage,
  'registerFavoriteEatsCatalogCompositionUiRefreshHook',
  'items page registers catalog composition refresh hook',
);
assertIncludes(
  itemsPage,
  'recomputeRecipeDerivedPlanDisplay',
  'items page defines unified recipe-derived plan display recompute',
);
assertIncludes(
  itemsPage,
  'registerFavoriteEatsCatalogCompositionUiRefreshHook(async () =>',
  'items composition hook recomputes derived display',
);

const referenceHookMatch = itemsPage.match(
  /registerFavoriteEatsCatalogReferenceUiRefreshHook\(async \(\) => \{[\s\S]*?\n    \}\);/,
);
assert(referenceHookMatch, 'items catalog reference hook block not found');
assert(
  !referenceHookMatch[0].includes('hydrateRecipeDerivedShoppingSelections'),
  'catalog reference hook must not recompute recipe-derived quantities',
);

console.log('Recipe composition sync architecture tests passed.');
