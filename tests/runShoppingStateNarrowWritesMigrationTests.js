#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260601120000_shopping_state_narrow_writes_and_guards.sql',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

assert(
  sql.includes('create or replace function catalog.rewrite_plan_item_keys(rewrites jsonb)'),
  'Migration should define rewrite_plan_item_keys.',
);
assert(
  sql.includes('create or replace function catalog.patch_shopping_list_source_keys(key_map jsonb)'),
  'Migration should define patch_shopping_list_source_keys.',
);
assert(
  sql.includes('create or replace function catalog.save_shopping_plan(') &&
    sql.includes('allow_empty boolean default false'),
  'save_shopping_plan should accept allow_empty.',
);
assert(
  sql.includes('empty plan snapshot rejected'),
  'Plan saves should reject empty overwrite of non-empty server plan.',
);
assert(
  sql.includes("state_payload->>'allowEmpty'"),
  'save_shopping_state should honor allowEmpty payload flag.',
);
assert(
  sql.includes('update list.row_overrides') &&
    sql.includes('update list.generated_rows'),
  'patch_shopping_list_source_keys should update list source keys.',
);

console.log('shopping state narrow writes migration tests passed.');
