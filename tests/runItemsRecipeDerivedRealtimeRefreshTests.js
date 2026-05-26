#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const itemsPage = fs.readFileSync(
  path.join(projectRoot, 'js/screens/itemsPage.js'),
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

function assertOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert(
    firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex,
    `${message}: expected ${JSON.stringify(first)} before ${JSON.stringify(second)}`,
  );
}

assertIncludes(
  itemsPage,
  'const refreshShoppingBrowsePlanRowsIndex = async (options = {}) => {',
  'Items browse plan row index refresh accepts freshness options',
);
const refreshStart = itemsPage.indexOf(
  'const refreshShoppingBrowsePlanRowsIndex = async (options = {}) => {',
);
const refreshEnd = itemsPage.indexOf(
  'let initialShoppingBrowsePlanRowsIndexPromise = Promise.resolve();',
  refreshStart,
);
assert(
  refreshStart >= 0 && refreshEnd > refreshStart,
  'Items browse plan row index refresh body not found',
);
const refreshBody = itemsPage.slice(refreshStart, refreshEnd);
assertIncludes(
  refreshBody,
  'const nextRowsByKey = new Map();',
  'Items browse plan row index builds a replacement map before commit',
);
assertOrder(
  refreshBody,
  'const nextRowsByKey = new Map();',
  'if (shouldApply && !shouldApply()) return false;',
  'Items browse plan row index checks freshness after building replacement map',
);
const freshnessIndex = refreshBody.indexOf(
  'if (shouldApply && !shouldApply()) return false;',
);
const commitClearIndex = refreshBody.indexOf(
  'shoppingBrowsePlanRowsByKey.clear();',
  freshnessIndex,
);
assert(
  freshnessIndex >= 0 && commitClearIndex > freshnessIndex,
  'Items browse plan row index only clears the live map after freshness passes',
);

const remoteHookMatch = itemsPage.match(
  /registerFavoriteEatsRemotePlanUiRefreshHook\(async \(\) => \{[\s\S]*?syncShoppingActionButtonState\(\);[\s\S]*?\n  \}\);/,
);
assert(remoteHookMatch, 'Items remote plan UI refresh hook not found');
const remoteHook = remoteHookMatch[0];

assertIncludes(
  remoteHook,
  'const isLatestPlanUiRefresh = () =>',
  'Items remote plan refresh hook gates overlapping async refreshes',
);
assertIncludes(
  remoteHook,
  'await recomputeRecipeDerivedPlanDisplay({',
  'Items remote plan refresh recomputes derived plan display',
);
assertIncludes(
  remoteHook,
  'shouldApply: isLatestPlanUiRefresh',
  'Items remote plan refresh prevents stale async row-index commits',
);

const recomputeMatch = itemsPage.match(
  /const recomputeRecipeDerivedPlanDisplay = async \(options = \{\}\) => \{[\s\S]*?\n  \};/,
);
assert(recomputeMatch, 'Items recomputeRecipeDerivedPlanDisplay body not found');
const recomputeBody = recomputeMatch[0];
assertOrder(
  recomputeBody,
  'await refreshShoppingBrowsePlanRowsIndex({',
  'await hydrateRecipeDerivedShoppingSelections();',
  'Items derived recompute rebuilds plan-row index before recipe quantity walk',
);
assertOrder(
  recomputeBody,
  'await hydrateRecipeDerivedShoppingSelections();',
  'refreshShoppingSelectionUi({ fullRerender: false });',
  'Items derived recompute patches DOM after recipe quantity walk',
);

console.log('Items recipe-derived realtime refresh architecture tests passed.');
