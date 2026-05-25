#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sql = fs.readFileSync(
  path.join(
    projectRoot,
    'supabase',
    'migrations',
    '20260525204700_clear_list_when_plan_empty.sql',
  ),
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

[
  'create or replace function catalog.clear_active_list_if_plan_empty',
  'if exists (select 1 from plan.selected_items where document_id = p_document_id) then',
  'if exists (select 1 from plan.selected_recipes where document_id = p_document_id) then',
  'if exists (select 1 from plan.selected_recipe_roots where document_id = p_document_id) then',
  'delete from list.conflicts where session_id = v_session_id',
  'delete from list.manual_rows where session_id = v_session_id',
  'delete from list.row_overrides where session_id = v_session_id',
  'delete from list.generated_rows where session_id = v_session_id',
  'update list.sessions',
].forEach((needle) => {
  assert(
    sql.includes(needle),
    `Empty-plan list clear migration should include: ${needle}`,
  );
});

[
  'trg_clear_list_after_selected_items_empty',
  'trg_clear_list_after_selected_recipes_empty',
  'trg_clear_list_after_selected_recipe_roots_empty',
].forEach((triggerName) => {
  assert(
    sql.includes(`drop trigger if exists ${triggerName}`) &&
      sql.includes(`create trigger ${triggerName}`),
    `Migration should install ${triggerName}.`,
  );
});

assert(
  !sql.includes('save_shopping_state') && !sql.includes('load_shopping_state'),
  'Empty-plan cleanup should not route reset through wholesale state RPCs.',
);

console.log('shopping plan empty clears list migration tests passed.');
