#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(projectRoot, 'supabase', 'migrations', '20260525130600_sync_lab_controls.sql'),
  'utf8',
);
const adapter = fs.readFileSync(
  path.join(projectRoot, 'js', 'data', 'adapters', 'supabaseAdapter.js'),
  'utf8',
);
const dataIndex = fs.readFileSync(
  path.join(projectRoot, 'js', 'data', 'index.js'),
  'utf8',
);
const page = fs.readFileSync(path.join(projectRoot, 'syncLab.html'), 'utf8');
const screen = fs.readFileSync(
  path.join(projectRoot, 'js', 'screens', 'syncLabPage.js'),
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  migration.includes('create schema if not exists sync_lab') &&
    migration.includes('create table if not exists sync_lab.documents') &&
    migration.includes('create table if not exists sync_lab.controls'),
  'Sync lab migration should create isolated parent + child tables.',
);
assert(
  migration.includes("alter publication supabase_realtime add table sync_lab.documents") &&
    migration.includes("alter publication supabase_realtime add table sync_lab.controls"),
  'Sync lab parent and child tables should both be in the Realtime publication.',
);
assert(
  migration.includes('create or replace function catalog.set_sync_lab_stepper_value') &&
    migration.includes('create or replace function catalog.set_sync_lab_checkbox_checked') &&
    migration.includes('create or replace function catalog.load_sync_lab_state'),
  'Sync lab should expose narrow write RPCs and a wholesale snapshot RPC.',
);
assert(
  /update sync_lab\.controls[\s\S]*returning updated_at into v_updated_at[\s\S]*update sync_lab\.documents[\s\S]*version = version \+ 1/.test(migration),
  'Narrow child writes should return child updated_at and bump the parent companion row.',
);
assert(
  !migration.includes('save_shopping_state') && !migration.includes('save_shopping_plan'),
  'Sync lab migration should not depend on product wholesale save paths.',
);

[
  'loadSyncLabState',
  'setSyncLabStepperValue',
  'setSyncLabCheckboxChecked',
  'resetSyncLabState',
  'subscribeSyncLabChanges',
].forEach((name) => {
  assert(adapter.includes(name), `Supabase adapter should expose ${name}.`);
  assert(dataIndex.includes(name), `Data service should expose ${name}.`);
});
assert(
  adapter.includes("schema: 'sync_lab'") &&
    adapter.includes("const tables = ['documents', 'controls']"),
  'Sync lab Realtime subscription should listen to parent and child tables.',
);

assert(
  page.includes('data-page="sync-lab"') &&
    page.includes('js/listRowStepper.js') &&
    page.includes('js/screens/syncLabPage.js') &&
    page.includes('id="syncLabStepperRow"') &&
    page.includes('id="syncLabCheckboxBtn"'),
  'Sync lab page should be a top-level page that reuses the stepper script and mounts both controls.',
);
assert(
  page.includes('.sync-lab-control-slot') &&
    page.includes('grid-template-columns: minmax(0, 1fr) 132px') &&
    page.includes('class="sync-lab-checkbox shopping-list-doc-checkbox"'),
  'Sync lab controls should sit in a fixed control rail and reuse the app checkbox class to avoid layout shift during testing.',
);

assert(
  screen.includes('pendingOp') &&
    screen.includes('inFlightOp') &&
    screen.includes('lastAppliedServerUpdatedAt') &&
    screen.includes('lastLocalValue'),
  'Sync lab queue should track per-key pending, in-flight, server version, and local value state.',
);
assert(
  screen.includes('isDefinitiveRemoteSetupError') &&
    screen.includes("'flush stopped'"),
  'Sync lab should fail fast instead of endlessly retrying missing remote RPC setup.',
);
assert(
  screen.includes('function applyLocalOp') &&
    screen.includes('async function sendOp'),
  'Sync lab local apply and flush should be separate named functions.',
);
assert(
  screen.includes('localState.stepper.value <= 0') &&
    screen.includes('getNextStepQty(localState.stepper.value, 1)'),
  'Sync lab boxed plus zero state should increment to 1, not merely activate a hidden stepper.',
);
assert(
  screen.includes('queue.shouldSkipPatch(CONTROL_KEYS.stepper') &&
    screen.includes('queue.shouldSkipPatch(CONTROL_KEYS.checkbox') &&
    screen.includes("if (table === 'documents')"),
  'Sync lab child patches and parent-triggered wholesale hydrates should run per-key staleness checks.',
);
assert(
  screen.includes('absorbed: true') &&
    !screen.includes('scheduleWholesaleHydrate') &&
    !screen.includes('wholesaleHydrateInFlight') &&
    !page.includes('syncLabWholesaleToggle'),
  'Sync lab parent companion events should be absorbed on the default spammable path, not throttled into wholesale reads.',
);
assert(
  !screen.includes('forceRemoteSave') &&
    !screen.includes('saveShoppingState') &&
    !screen.includes('saveShoppingPlan'),
  'Sync lab screen should not use product snapshot-save escape hatches.',
);

console.log('sync lab architecture tests passed.');
