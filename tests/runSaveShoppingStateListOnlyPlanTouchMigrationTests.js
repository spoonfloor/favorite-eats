#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260622120000_save_shopping_state_list_only_no_plan_touch.sql',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

assert(
  sql.includes('create or replace function catalog.save_shopping_state(state_payload jsonb)'),
  'Migration should redefine catalog.save_shopping_state.',
);
assert(
  sql.includes("when state_payload ? 'plan' then now()") &&
    sql.includes('else plan.documents.updated_at'),
  'List-only saves should not bump plan.documents.updated_at on document upsert.',
);
assert(
  sql.includes("if state_payload ? 'plan' then") &&
    sql.includes('update plan.documents') &&
    sql.includes('version = version + 1'),
  'Plan payload saves should still bump plan.documents.updated_at.',
);

console.log('save_shopping_state list-only plan touch migration tests passed.');
