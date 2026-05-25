#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const screen = fs.readFileSync(
  path.join(projectRoot, 'js', 'screens', 'shoppingListPage.js'),
  'utf8',
);
const main = fs.readFileSync(path.join(projectRoot, 'js', 'main.js'), 'utf8');
const checkedRpcMigration = fs.readFileSync(
  path.join(
    projectRoot,
    'supabase',
    'migrations',
    '20260524162600_list_narrow_rpcs_return_updated_at.sql',
  ),
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

[
  '[favorite-eats-shopping-list-checkbox]',
  'local applied',
  'enqueue requested',
  'undo enqueue requested',
  'flush started',
  'rpc returned',
  'ack',
  'child patch applied',
  'child patch skipped',
  'protected wholesale merge checked rows',
  'protected wholesale merge preserved local rows',
  'durable replay found',
  'durable replay sent',
].forEach((needle) => {
  assert(
    screen.includes(needle),
    `Shopping List checkbox path should log proof event: ${needle}.`,
  );
});

[
  'legacy direct checkbox rpc path used',
  'queue unavailable fallback checkbox path',
  'protected wholesale merge unavailable',
  'local apply row missing',
  'child patch missing updated_at',
  'child patch row missing',
  'bootstrap whole-state save used',
  'ack missing updated_at',
  'flush failed',
  'durable replay ack missing updated_at',
  'durable replay failed',
  'stale patch hook ignored',
  'stale list refresh hook ignored',
  'stale plan refresh hook ignored',
  'patch hook deferred by row edit',
].forEach((needle) => {
  assert(
    screen.includes(needle),
    `Shopping List checkbox path should log architecture deviation: ${needle}.`,
  );
});

assert(
  main.includes('parent event absorbed') &&
    main.includes("String(payload.table || '') === 'sessions'") &&
    main.includes('[favorite-eats-shopping-list-checkbox]'),
  'List parent/session realtime events should be visibly absorbed.',
);

assert(
  !main.includes("source: 'focus refetch'") &&
    !main.includes('source: "focus refetch"') &&
    !main.includes('installFavoriteEatsShoppingFocusRefetch') &&
    !main.includes('favoriteEatsShoppingFocusRefetchInstalled'),
  'Window focus should not schedule a wholesale shopping plan hydrate during routine input.',
);

assert(
  main.includes('function mergeRemoteListDocForCheckboxStaleness') &&
    main.includes('seedShoppingListCheckboxQueueFromRemoteDoc') &&
    main.includes('protected wholesale list merge checked rows') &&
    main.includes('plan hydrate scheduled') &&
    main.includes('list hydrate scheduled') &&
    main.includes('__favoriteEatsHydrateSource') &&
    main.includes("source: sourceLabel") &&
    /mergeRemoteListDocForCheckboxStaleness\(\s*remoteState\.shoppingListDoc,\s*'save echo'\s*,?\s*\)/.test(main) &&
    /mergeRemoteListDocForCheckboxStaleness\(remoteDoc,\s*hydrateSource\)/.test(main) &&
    /mergeRemoteListDocForCheckboxStaleness\(\s*snapshot\.listDoc,\s*'store snapshot sync'\s*,?\s*\)/.test(main) &&
    !main.includes(
      'wholesale list hydrate persisted without checkbox protected merge',
    ),
  'Wholesale list hydrate should run protected checkbox merge before persisting.',
);

assert(
  screen.includes('registerFavoriteEatsRemoteListPatchHook') &&
    screen.includes('applyShoppingListCheckboxRemotePatch(payload)') &&
    screen.includes('isActiveShoppingListCheckboxSyncInstance()') &&
    screen.includes('shoppingListCheckboxInputQueue.getKeyState(opLike)') &&
    screen.includes('pending: !!queueState?.pending') &&
    screen.includes('inFlight: !!queueState?.inFlight'),
  'Shopping List checkbox should expose a child-row patch hook with per-key queue-state evidence before wholesale refresh.',
);

assert(
  screen.includes('__favoriteEatsShoppingListCheckboxSyncActiveInstanceId') &&
    screen.includes('__favoriteEatsShoppingListCheckboxSyncInstanceSeq') &&
    screen.includes('instanceId: shoppingListCheckboxSyncInstanceId'),
  'Shopping List checkbox logs and hooks should identify the active screen instance.',
);

assert(
  screen.includes('shoppingListCheckboxInputQueue.enqueue') &&
    screen.includes("storageKey: 'favoriteEatsInputSync:list:v1'") &&
    screen.includes('flushAll()') &&
    screen.includes('window.favoriteEatsShoppingListCheckboxInputQueue') &&
    screen.includes("source: sourceLabel") &&
    screen.includes("'list ui refresh hook'") &&
    screen.includes("'plan ui refresh hook'"),
  'Shopping List checkbox should have queued input, durable storage, singleton exposure, and pagehide flush instrumentation.',
);

assert(
  screen.includes('flushShoppingListCheckedToSupabase') &&
    screen.includes('legacy direct checkbox rpc path used'),
  'The legacy direct checkbox RPC path should remain detectable until removed.',
);

assert(
  !screen.includes('list refresh skipped by row rpc in-flight gate') &&
    !screen.includes('plan refresh skipped by row rpc in-flight gate') &&
    !/registerFavoriteEatsRemoteListUiRefreshHook[\s\S]*getShoppingListRowDataRpcInFlight\(\)\s*>\s*0[\s\S]*registerFavoriteEatsRemotePlanUiRefreshHook/.test(
      screen,
    ) &&
    !/registerFavoriteEatsRemotePlanUiRefreshHook[\s\S]*getShoppingListRowDataRpcInFlight\(\)\s*>\s*0[\s\S]*window\.addEventListener\(\s*['"]pagehide['"]/.test(
      screen,
    ),
  'Shopping List checkbox routine refresh hooks must not use a global row-RPC in-flight gate.',
);

assert(
  /const hasLocalIntent = !!\(pending \|\| queueState\?\.inFlight\);/.test(
    screen,
  ) && screen.includes('checked: !!queueState.lastLocalValue'),
  'Shopping List checkbox protected refresh merge should preserve in-flight local intent per key.',
);

assert(
  !/(?:const|let|var|function)\s+recentShoppingListCheckboxOps\b/.test(screen) &&
    !/(?:const|let|var|function)\s+rememberRecentShoppingListCheckboxOp\b/.test(screen) &&
    !/(?:const|let|var|function)\s+applyRecentShoppingListCheckboxOpsToDoc\b/.test(screen),
  'Shopping List checkbox should not reintroduce time-window checkbox ledgers.',
);

assert(
  checkedRpcMigration.includes(
    'create or replace function catalog.set_shopping_list_row_checked',
  ),
  'Checked-row RPC migration should exist.',
);
assert(
  /create or replace function catalog\.set_shopping_list_row_checked[\s\S]*returning updated_at into v_updated_at[\s\S]*'updated_at', v_updated_at/.test(
    checkedRpcMigration,
  ),
  'Checked-row RPC should return child updated_at for echo suppression.',
);

console.log('shopping list checkbox architecture tests passed.');
