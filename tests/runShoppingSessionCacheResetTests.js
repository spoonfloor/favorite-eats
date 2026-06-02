#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'main.js'),
  'utf8',
);
const utilsSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'utils.js'),
  'utf8',
);
const welcomeSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'welcome.js'),
  'utf8',
);
const recipesSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'screens', 'recipesPage.js'),
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  mainSource.includes('function clearFavoriteEatsShoppingSessionCache()'),
  'main.js should define clearFavoriteEatsShoppingSessionCache',
);
assert(
  mainSource.includes('favoriteEatsShoppingHydrateForceRemoteAfterAuth = true'),
  'auth boundary should force the next hydrate to skip revision fast-path',
);
assert(
  mainSource.includes('shoppingPlanStoreSnapshotBlocksRevisionFastPath'),
  'main.js should block revision fast-path for incomplete recipe servings snapshots',
);
assert(
  mainSource.includes('!favoriteEatsShoppingHydrateForceRemoteAfterAuth'),
  'hydrate should honor auth cold-boot flag before revision fast-path',
);
assert(
  mainSource.includes('patchFavoriteEatsStorePlanFromMainCache(normalized)'),
  'persistShoppingPlan should keep favoriteEatsStore aligned on skipRemoteSave',
);
assert(
  utilsSource.includes('window.clearFavoriteEatsShoppingSessionCache()'),
  'logout should clear warm shopping session cache',
);
assert(
  welcomeSource.includes('favoriteEats:store:v1'),
  'welcome login should clear store session keys when main.js is absent',
);
assert(
  mainSource.includes('window.clearFavoriteEatsShoppingSessionCache') &&
    mainSource.includes('clearFavoriteEatsShoppingSessionCache'),
  'main.js should expose clearFavoriteEatsShoppingSessionCache on window',
);
assert(
  /getShoppingPlanRecipeSelectionRoots\(\)\[planKey\]/.test(mainSource),
  'servings helper should read recipeSelectionRoots when merged rows lack override',
);
assert(
  mainSource.includes('resolvedOv = rawOv != null ? rawOv : rootOv'),
  'syncRecipePlannerServings should prefer roots before deleting planner map entries',
);
assert(
  /servingsOverride:\s*displayServingsForRpc/.test(recipesSource) &&
    recipesSource.includes('enqueueRecipeRootToggle'),
  'add-to-plan should carry servingsOverride into local recipe roots via the root checkbox queue',
);

console.log('Shopping session cache reset tests passed.');
