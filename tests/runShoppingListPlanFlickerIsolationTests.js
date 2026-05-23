#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const shoppingListPagePath = path.join(
  projectRoot,
  'js',
  'screens',
  'shoppingListPage.js',
);
const mainPath = path.join(projectRoot, 'js', 'main.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const shoppingListPageSource = fs.readFileSync(shoppingListPagePath, 'utf8');
  const mainSource = fs.readFileSync(mainPath, 'utf8');

  const listHookStart = shoppingListPageSource.indexOf(
    'registerFavoriteEatsRemoteListUiRefreshHook(async () => {',
  );
  assert(listHookStart >= 0, 'list UI refresh hook missing');
  const listHookEnd = shoppingListPageSource.indexOf(
    'registerFavoriteEatsRemotePlanUiRefreshHook(async () => {',
    listHookStart,
  );
  assert(listHookEnd > listHookStart, 'plan UI refresh hook missing');
  const listHookBody = shoppingListPageSource.slice(listHookStart, listHookEnd);

  assert(
    !listHookBody.includes('refreshShoppingListGeneratedBaseline'),
    'list-only Realtime hook must not regen plan baseline (flicker)',
  );
  assert(
    listHookBody.includes('getAuthoritativeShoppingListDoc()'),
    'list-only Realtime hook should render authoritative list doc',
  );

  assert(
    mainSource.includes('revisionProbeAxesChanged(beforeRevisions, afterRevisions)'),
    'plan refresh should delegate list-only revision bumps to list hooks',
  );
  assert(
    mainSource.includes("favoriteEatsPendingRemoteShoppingUiRefreshKind = 'list'"),
    'pending list refresh should flush through list hook registration',
  );

  const loadEntry = shoppingListPageSource.indexOf('async function loadShoppingListPage()');
  assert(loadEntry >= 0, 'loadShoppingListPage missing');
  const loadEnd = shoppingListPageSource.indexOf(
    'window.addEventListener(\n    \'pagehide\'',
    loadEntry,
  );
  assert(loadEnd > loadEntry, 'loadShoppingListPage pagehide listener missing');
  const loadBody = shoppingListPageSource.slice(loadEntry, loadEnd);
  assert(
    loadBody.includes('ensureFavoriteEatsShoppingPlanRealtimeSubscription()') &&
      loadBody.includes('ensureFavoriteEatsShoppingListRealtimeSubscription()'),
    'Shopping List entry should re-subscribe plan+list Realtime after pagehide teardown',
  );

  console.log('shopping list v1 finish regression tests passed.');
}

run();
