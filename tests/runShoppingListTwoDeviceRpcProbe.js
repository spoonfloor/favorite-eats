#!/usr/bin/env node
'use strict';

/**
 * Opt-in live prod two-device simulation at the RPC layer.
 * Mutates one sourced row then reverts — run only against shared prod when OK:
 *   SHOPPING_LIST_LIVE_PROBE=1 node tests/runShoppingListTwoDeviceRpcProbe.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const adapterPath = path.join(
  projectRoot,
  'js',
  'data',
  'adapters',
  'supabaseAdapter.js',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findSourcedRow(state) {
  const rows = state?.shoppingListDoc?.rows;
  if (!Array.isArray(rows)) return null;
  return (
    rows.find((row) => String(row?.sourceKey || '').trim() !== '') || null
  );
}

function rowById(state, rowId) {
  const rows = state?.shoppingListDoc?.rows;
  if (!Array.isArray(rows)) return null;
  return rows.find((row) => String(row?.id || '') === String(rowId)) || null;
}

function createAdapter() {
  const adapterSource = fs.readFileSync(adapterPath, 'utf8');
  const context = { console, URL, localStorage: null, sessionStorage: null };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(adapterSource, context, { filename: 'supabaseAdapter.js' });
  if (typeof context.createSupabaseAdapter !== 'function') {
    throw new Error('createSupabaseAdapter missing');
  }
  return context.createSupabaseAdapter({
    fetchImpl: typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  });
}

async function run() {
  if (process.env.SHOPPING_LIST_LIVE_PROBE !== '1') {
    console.log(
      'shopping list two-device RPC probe skipped (set SHOPPING_LIST_LIVE_PROBE=1)',
    );
    return;
  }

  const adapter = createAdapter();
  const initial = await adapter.loadShoppingState();
  const target = findSourcedRow(initial);
  assert(target, 'prod shopping list needs at least one sourced row for probe');

  const rowId = String(target.id);
  const initialChecked = !!target.checked;
  const initialRemoved = target.removed === true;
  const initialStoreLabel = String(target.storeLabel || '');
  const initialBucketLabel = String(target.bucketLabel || '');
  const initialStoreId = target.storeId != null ? target.storeId : null;
  const initialAisleId = target.aisleId != null ? target.aisleId : null;
  const initialAisleSortOrder =
    target.aisleSortOrder != null ? target.aisleSortOrder : null;
  const initialOrder = target.order != null ? target.order : null;

  const nextChecked = !initialChecked;

  try {
    const checkResult = await adapter.setShoppingListRowChecked({
      rowId,
      checked: nextChecked,
    });
    assert(checkResult?.ok === true, 'set_shopping_list_row_checked should ok');

    const deviceBAfterCheck = await adapter.loadShoppingState();
    const rowAfterCheck = rowById(deviceBAfterCheck, rowId);
    assert(rowAfterCheck, 'row should still exist after check RPC');
    assert(
      rowAfterCheck.checked === nextChecked,
      'device B should see checkbox change from device A RPC',
    );

    const removeResult = await adapter.setShoppingListRowRemoved({
      rowId,
      removed: true,
    });
    assert(removeResult?.ok === true, 'set_shopping_list_row_removed should ok');

    const deviceBAfterRemove = await adapter.loadShoppingState();
    const rowAfterRemove = rowById(deviceBAfterRemove, rowId);
    assert(rowAfterRemove, 'removed row should still load');
    assert(
      rowAfterRemove.removed === true,
      'load_shopping_state should emit canonical removed=true',
    );

    const restoreResult = await adapter.setShoppingListRowRemoved({
      rowId,
      removed: false,
    });
    assert(restoreResult?.ok === true, 'restore removed RPC should ok');

    const deviceBAfterRestore = await adapter.loadShoppingState();
    const rowAfterRestore = rowById(deviceBAfterRestore, rowId);
    assert(rowAfterRestore?.removed !== true, 'restored row should not be removed');

    const placementLabel = initialStoreLabel || 'Probe Store';
    const placementBucket = initialBucketLabel || 'Probe Aisle';
    const placementResult = await adapter.setShoppingListRowPlacement({
      rowId,
      storeLabel: placementLabel,
      bucketLabel: placementBucket,
      storeId: initialStoreId,
      aisleId: initialAisleId,
      aisleSortOrder: initialAisleSortOrder,
      order: initialOrder,
    });
    assert(
      placementResult?.ok === true,
      'set_shopping_list_row_placement should ok for sourced row',
    );

    const deviceBAfterPlacement = await adapter.loadShoppingState();
    const rowAfterPlacement = rowById(deviceBAfterPlacement, rowId);
    assert(rowAfterPlacement, 'row should exist after placement RPC');
    assert(
      String(rowAfterPlacement.storeLabel || '') === placementLabel,
      'device B should see placement store label',
    );
    assert(
      String(rowAfterPlacement.bucketLabel || '') === placementBucket,
      'device B should see placement bucket label',
    );
  } finally {
    await adapter.setShoppingListRowRemoved({ rowId, removed: initialRemoved });
    await adapter.setShoppingListRowChecked({ rowId, checked: initialChecked });
    if (
      initialStoreLabel ||
      initialBucketLabel ||
      initialStoreId != null ||
      initialAisleId != null
    ) {
      await adapter.setShoppingListRowPlacement({
        rowId,
        storeLabel: initialStoreLabel,
        bucketLabel: initialBucketLabel,
        storeId: initialStoreId,
        aisleId: initialAisleId,
        aisleSortOrder: initialAisleSortOrder,
        order: initialOrder,
      });
    }
  }

  console.log('shopping list two-device RPC probe passed (prod, reverted).');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
