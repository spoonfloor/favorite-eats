#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260704170500_plan_sessions_snapshots.sql',
);
const planSessionPath = path.join(
  projectRoot,
  'js',
  'favoriteEatsPlanSession.js',
);
const mainPath = path.join(projectRoot, 'js', 'main.js');
const itemsPagePath = path.join(projectRoot, 'js', 'screens', 'itemsPage.js');
const shoppingListPagePath = path.join(
  projectRoot,
  'js',
  'screens',
  'shoppingListPage.js',
);
const recipesPagePath = path.join(
  projectRoot,
  'js',
  'screens',
  'recipesPage.js',
);
const recipesHtmlPath = path.join(projectRoot, 'recipes.html');
const shoppingHtmlPath = path.join(projectRoot, 'shopping.html');
const shoppingListHtmlPath = path.join(projectRoot, 'shoppingList.html');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const planSessionJs = fs.readFileSync(planSessionPath, 'utf8');
const mainJs = fs.readFileSync(mainPath, 'utf8');
const itemsPageJs = fs.readFileSync(itemsPagePath, 'utf8');
const shoppingListPageJs = fs.readFileSync(shoppingListPagePath, 'utf8');
const recipesPageJs = fs.readFileSync(recipesPagePath, 'utf8');
const recipesHtml = fs.readFileSync(recipesHtmlPath, 'utf8');
const shoppingHtml = fs.readFileSync(shoppingHtmlPath, 'utf8');
const shoppingListHtml = fs.readFileSync(shoppingListHtmlPath, 'utf8');

const planSessionScriptTag =
  '<script src="js/favoriteEatsPlanSession.js"></script>';

assert(
  sql.includes('create table if not exists plan.snapshots'),
  'Migration should create plan.snapshots.',
);
assert(
  sql.includes("create type plan.snapshot_kind as enum ('named', 'auto')"),
  'Migration should define snapshot kind enum.',
);
assert(
  sql.includes('create or replace function catalog.list_plan_sessions()'),
  'Migration should define list_plan_sessions RPC.',
);
assert(
  sql.includes('create or replace function catalog.create_named_plan_session'),
  'Migration should define create_named_plan_session RPC.',
);
assert(
  sql.includes('create or replace function catalog.update_named_plan_session'),
  'Migration should define update_named_plan_session RPC.',
);
assert(
  sql.includes('create or replace function catalog.create_auto_plan_session()'),
  'Migration should define create_auto_plan_session RPC.',
);
assert(
  sql.includes('create or replace function catalog.load_plan_session'),
  'Migration should define load_plan_session RPC.',
);
assert(
  sql.includes('create or replace function catalog.delete_plan_session'),
  'Migration should define delete_plan_session RPC.',
);
assert(
  sql.includes('internal_trim_auto_plan_sessions'),
  'Migration should trim auto sessions to 8.',
);
assert(
  !sql.includes('v_last_auto_fingerprint'),
  'Auto-save should insert on every call; no fingerprint dedup skip.',
);
assert(
  sql.includes('coalesce(ro.removed, false) = false'),
  'Snapshot capture should exclude removed rows.',
);
assert(
  !sql.includes('ro.checked') || sql.includes('checked = ro.checked'),
  'Load overrides should preserve checked state separately from snapshot payload.',
);

assert(
  planSessionJs.includes('ackRemoteSessionCommit'),
  'Plan session module should expose canonical remote-commit ack gate.',
);
assert(
  planSessionJs.includes('REMOTE_COMMIT_AUTO_SAVE_DEBOUNCE_MS'),
  'Auto-save should debounce burst remote commits (Add all).',
);
assert(
  planSessionJs.includes('autoSaveQueued'),
  'Auto-save should queue while a prior auto-save is in flight.',
);
assert(
  mainJs.includes('function emitPlanSessionRemoteCommitAck') &&
    mainJs.includes('emitPlanSessionRemoteCommitAckForPersistedRequest'),
  'main.js should own the single remote-commit ack emission surface.',
);
assert(
  /async function awaitPersistShoppingStateToDataService[\s\S]*emitPlanSessionRemoteCommitAckForPersistedRequest\(request\)/.test(
    mainJs,
  ),
  'Wholesale plan save success should ack through the unified gate.',
);
assert(
  mainJs.includes('emitPlanSessionRemoteCommitAck({ surface: \'plan\'') &&
    mainJs.includes("source: 'narrowRpc'"),
  'Plan narrow RPC queues should ack through the unified gate.',
);
assert(
  !itemsPageJs.includes('favoriteEatsPlanSession?.notifyPlanSessionCommittedChange'),
  'Items page must not call plan session notify directly.',
);
assert(
  itemsPageJs.includes('emitPlanSessionRemoteCommitAck'),
  'Items narrow RPC flush should use main.js ack gate.',
);
assert(
  !shoppingListPageJs.includes('notifyListOverridePersisted'),
  'Shopping list page must not call notifyListOverridePersisted directly.',
);
assert(
  shoppingListPageJs.includes('emitPlanSessionRemoteCommitAck') &&
    shoppingListPageJs.includes("surface: 'listOverrides'"),
  'List override narrow RPC flushes should use main.js ack gate.',
);
assert(
  /clearShoppingPlanSelections\(\{[\s\S]*allowEmptyPlanRemoteSave: true[\s\S]*\}\);[\s\S]*await flushCoalescedPlanSaveToDataService\(\{ awaited: true \}\)/.test(
    recipesPageJs,
  ),
  'Recipes clear should await wholesale plan flush before user can rely on Manage.',
);

assert(
  planSessionJs.includes('Manage sessions'),
  'Plan session module should label manage CTA correctly.',
);
assert(
  planSessionJs.includes('Auto-Saved Sessions') &&
    planSessionJs.includes('ui-plan-session-section-title') &&
    planSessionJs.includes('renderAutoSessionRows') &&
    planSessionJs.includes('renderNamedSessionRows'),
  'Manage dialog should split named vs auto session rows.',
);
assert(
  planSessionJs.includes('No meal plan sessions yet') &&
    planSessionJs.includes('openEmptyPlanSessionsDialog'),
  'Manage flow should show empty-state dialog when no sessions exist.',
);
assert(
  planSessionJs.includes('aria-multiselectable') &&
    planSessionJs.includes('Choose a meal plan to load'),
  'Manage dialog should support multi-select with load gated to one row.',
);
assert(
  planSessionJs.includes('event.shiftKey') &&
    planSessionJs.includes('event.metaKey || event.ctrlKey') &&
    planSessionJs.includes('selectRange') &&
    planSessionJs.includes('selectOnly'),
  'Manage dialog should use plain, shift-range, and modifier-toggle selection.',
);
assert(
  planSessionJs.includes('selectAllSessions') &&
    planSessionJs.includes('isSelectAllShortcut') &&
    planSessionJs.includes("setAttribute('inert'"),
  'Manage dialog should support Cmd/Ctrl+A select-all and inert background isolation.',
);
assert(
  /formatDefaultSessionName[\s\S]*getSeconds\(\)/.test(planSessionJs),
  'Session timestamps should include seconds.',
);
assert(
  planSessionJs.includes('Save this meal plan?'),
  'Plan session module should include first-save copy.',
);
assert(
  planSessionJs.includes('syncShoppingListPlanSessionSaveButtonState'),
  'Plan session module should sync explicit Save button state.',
);
assert(
  planSessionJs.includes('hasSaveablePlanContent') &&
    planSessionJs.includes('btn.disabled = !saveEnabled'),
  'Explicit Save should disable in zero-state (no plan content).',
);
assert(
  !planSessionJs.includes('saveBtn.disabled = !isDirty'),
  'Explicit Save should not be gated on dirty state.',
);
assert(
  /async function runAutoSaveNow\(\)[\s\S]*!hasSaveablePlanContent\(\)/.test(
    planSessionJs,
  ),
  'Auto-save should skip zero-state plans.',
);
assert(
  planSessionJs.includes('Replace existing session?'),
  'Plan session module should confirm name collisions before overwrite.',
);
assert(
  planSessionJs.includes('A session named “'),
  'Collision dialog should name the conflicting session.',
);
assert(
  planSessionJs.includes('Go back'),
  'Collision dialog should offer Go back to the save modal.',
);
assert(
  planSessionJs.includes('Save session as:'),
  'Plan session module should label the session name field.',
);
assert(
  planSessionJs.includes('persistNamedSessionWithName'),
  'Plan session module should use unified save-by-name logic.',
);
assert(
  !planSessionJs.includes('Save as'),
  'Save modal should use a single Save CTA.',
);
assert(
  [recipesHtml, shoppingHtml, shoppingListHtml].every((html) =>
    html.includes(planSessionScriptTag),
  ),
  'Plan session module should load on every surface that commits plan changes.',
);

console.log('runPlanSessionsMigrationTests: ok');
