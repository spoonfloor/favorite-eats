#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  path.resolve(__dirname, '..'),
  'supabase',
  'migrations',
  '20260602120000_shopping_list_bulk_rpcs.sql',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

assert(
  sql.includes(
    'create or replace function catalog.uncheck_all_shopping_list_rows()',
  ),
  'Migration should define uncheck_all_shopping_list_rows.',
);
assert(
  sql.includes(
    'create or replace function catalog.apply_shopping_list_sourced_rows_sync(',
  ),
  'Migration should define apply_shopping_list_sourced_rows_sync.',
);
assert(
  sql.includes(
    'create or replace function catalog.restore_removed_shopping_list_rows()',
  ),
  'Migration should define restore_removed_shopping_list_rows.',
);
assert(
  sql.includes("and ro.store_label = 'removed'"),
  'Original bulk migration restore_removed targets legacy pseudo-store rows.',
);
assert(
  sql.includes('delete from list.conflicts where session_id = v_session_id'),
  'sourced rows sync should clear conflicts without deleting manual rows.',
);

console.log('shopping list bulk RPC migration tests passed.');
