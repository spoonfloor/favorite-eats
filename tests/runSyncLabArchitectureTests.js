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
    migration.includes('create table if not exists sync_lab.controls') &&
    migration.includes("'stepper2'") &&
    migration.includes("'checkbox2'"),
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
    adapter.includes("const tables = ['documents', 'controls']") &&
    adapter.includes('p_control_key: controlKey'),
  'Sync lab Realtime subscription should listen to parent and child tables.',
);

assert(
  page.includes('data-page="sync-lab"') &&
    page.includes('js/listRowStepper.js') &&
    page.includes('js/screens/syncLabPage.js') &&
    page.includes('id="syncLabStepperRow"') &&
    page.includes('id="syncLabStepper2Row"') &&
    page.includes('id="syncLabCheckboxBtn"') &&
    page.includes('id="syncLabCheckbox2Btn"') &&
    page.includes('id="syncLabInjectStaleChildBtn"') &&
    page.includes('auto-inject stale child event during local intent: on') &&
    page.includes('auto-inject older peer conflict replay after accepted peer patch: on') &&
    page.includes('auto-inject hostile wholesale snapshot during local intent: on') &&
    page.includes('auto-inject missing-row wholesale snapshot after ack: on') &&
    page.includes('auto-run explicit protected recovery after simulated Realtime gap: on') &&
    page.includes('log multi-control per-key isolation during overlap: on') &&
    page.includes('durable replay runs before boot hydrate: on') &&
    page.includes('lifecycle reload window auto-holds first save for 3000ms: on') &&
    page.includes('classify setup/network/RPC failures with bounded retries: on'),
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
  screen.includes('classifyFlushError') &&
    screen.includes('MAX_FLUSH_ATTEMPTS') &&
    screen.includes("'flush stopped'") &&
    screen.includes('failure classified'),
  'Sync lab should classify failures and stop setup/exhausted retry paths.',
);
assert(
  screen.includes('function applyLocalOp') &&
    screen.includes('async function sendOp'),
  'Sync lab local apply and flush should be separate named functions.',
);
assert(
  screen.includes('STEPPER_KEYS') &&
    screen.includes('CHECKBOX_KEYS') &&
    screen.includes('localState[key].value <= 0') &&
    screen.includes('getNextStepQty(localState[key].value, 1)'),
  'Sync lab boxed plus zero state should increment to 1 across both steppers.',
);
assert(
  screen.includes('queue.shouldSkipPatch(CONTROL_KEYS[key]') &&
    screen.includes('CONTROL_ORDER.forEach') &&
    screen.includes("if (table === 'documents')"),
  'Sync lab child patches and parent-triggered wholesale hydrates should run per-key staleness checks.',
);
assert(
  screen.includes('absorbed: true') &&
    screen.includes("[favorite-eats-sync-lab]") &&
    screen.includes('syncLabInjectStaleChildBtn') &&
    screen.includes('onLocalIntentProbe') &&
    screen.includes('auto stale child probe') &&
    screen.includes('peer conflict stale replay probe') &&
    screen.includes('auto hostile wholesale probe') &&
    screen.includes('auto hostile wholesale') &&
    screen.includes('missing-row wholesale probe') &&
    screen.includes('missing-row wholesale') &&
    screen.includes('realtime gap recovery probe') &&
    screen.includes('explicit recovery') &&
    screen.includes('simulatedMissedChildRealtime') &&
    screen.includes('runAckProbes') &&
    screen.includes('multi-control per-key isolation') &&
    screen.includes('durable pending mirrored') &&
    screen.includes('lastDurableMirrorSignature') &&
    screen.includes('durable replay before hydrate') &&
    screen.includes('durable replay enqueued') &&
    screen.includes('pagehide durable flush requested') &&
    screen.includes('lifecycle reload window open') &&
    screen.includes('LIFECYCLE_RELOAD_HOLD_MS') &&
    screen.includes('maybeHoldForLifecycleReload') &&
    screen.includes("instruction: 'reload now'") &&
    screen.includes('failure classification self-check') &&
    screen.includes("classification: classification.kind") &&
    screen.includes('willRetry') &&
    screen.includes('stopped') &&
    screen.includes('attempts') &&
    screen.includes('maxAttempts') &&
    screen.includes('exhausted') &&
    screen.indexOf('queue.drainDurable();') < screen.indexOf("await hydrate('boot');") &&
    screen.includes('siblingControlKey') &&
    screen.includes('logPerKeyIsolation') &&
    screen.includes('currentPending') &&
    screen.includes('currentInFlight') &&
    screen.includes('siblingPending') &&
    screen.includes('siblingInFlight') &&
    screen.includes('globalGate: false') &&
    screen.includes('makeSyntheticStaleSnapshot') &&
    screen.includes('makeSyntheticMissingRowSnapshot') &&
    screen.includes('makeSyntheticOlderPeerConflictRow') &&
    screen.includes('maybeAutoInjectPeerConflictReplay') &&
    screen.includes('maybeAutoInjectHostileWholesaleDuringLocalIntent') &&
    screen.includes('maybeAutoInjectMissingRowWholesaleAfterAck') &&
    screen.includes('maybeAutoRunExplicitRecoveryAfterRealtimeGap') &&
    screen.includes('hasKnownLocalRow') &&
    screen.includes('versionSnapshot') &&
    screen.includes('omitted: true') &&
    screen.includes('preserved: true') &&
    screen.includes('displayUpdatedAt') &&
    screen.includes('lastAppliedServerUpdatedAt') &&
    screen.includes('pending') &&
    screen.includes('inFlight') &&
    screen.includes('els.autoStaleChildToggle && !els.autoStaleChildToggle.checked') &&
    screen.includes("table: 'controls'") &&
    !screen.includes('scheduleWholesaleHydrate') &&
    !screen.includes('wholesaleHydrateInFlight') &&
    !page.includes('syncLabWholesaleToggle'),
  'Sync lab parent companion events should be absorbed and stale child probes should use the child patch path, not throttled wholesale reads.',
);
assert(
  !screen.includes('forceRemoteSave') &&
    !screen.includes('saveShoppingState') &&
    !screen.includes('saveShoppingPlan'),
  'Sync lab screen should not use product snapshot-save escape hatches.',
);

console.log('sync lab architecture tests passed.');
