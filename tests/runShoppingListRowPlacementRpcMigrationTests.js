#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260623120000_set_shopping_list_row_placement_rpc.sql',
);

const sql = fs.readFileSync(migrationPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  sql.includes(
    'create or replace function catalog.set_shopping_list_row_placement(',
  ),
  'Migration should define set_shopping_list_row_placement.',
);
assert(
  sql.includes('store_id = p_store_id') &&
    sql.includes('store_label = v_store_label') &&
    sql.includes('bucket_label = v_bucket_label') &&
    sql.includes('aisle_id = p_aisle_id') &&
    sql.includes('aisle_sort_order = p_aisle_sort_order'),
  'Placement RPC should update store/aisle placement columns.',
);
assert(
  sql.includes('from list.generated_rows gr'),
  'Placement RPC should upsert generated rows that do not yet have overrides.',
);
assert(
  sql.includes('on conflict (session_id, source_key) do update'),
  'Placement RPC should upsert row_overrides on conflict.',
);
assert(
  sql.includes('update list.manual_rows'),
  'Placement RPC should update manual rows when present.',
);
assert(
  sql.includes('ro.removed = false') ||
    sql.includes("coalesce(ro.store_label, '') <> 'removed'"),
  'Placement RPC should skip removed override rows.',
);
assert(
  sql.includes('update list.sessions') && sql.includes('listSessionUpdatedAt'),
  'Placement RPC should bump and return list session revision.',
);
assert(
  sql.includes(
    'grant execute on function catalog.set_shopping_list_row_placement(',
  ),
  'Migration should grant execute on set_shopping_list_row_placement.',
);

console.log('shopping list row placement RPC migration tests passed.');
