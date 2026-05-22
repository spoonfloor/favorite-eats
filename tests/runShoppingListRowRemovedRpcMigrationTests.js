#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260522225836_shopping_list_row_removed_rpc.sql',
);

const sql = fs.readFileSync(migrationPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  sql.includes('create or replace function catalog.set_shopping_list_row_removed('),
  'Migration should define set_shopping_list_row_removed.',
);
assert(
  sql.includes("store_label = 'removed'"),
  'Remove RPC should use current pseudo-removed store label semantics.',
);
assert(
  sql.includes('from list.generated_rows gr'),
  'Remove/restore RPC should restore generated-row placement from list.generated_rows.',
);
assert(
  sql.includes('on conflict (session_id, source_key) do update'),
  'Remove RPC should upsert generated rows that do not yet have overrides.',
);
assert(
  sql.includes('update list.sessions') && sql.includes('listSessionUpdatedAt'),
  'Remove RPC should bump and return list session revision.',
);
assert(
  sql.includes('grant execute on function catalog.set_shopping_list_row_removed(text, boolean)'),
  'Migration should grant execute on set_shopping_list_row_removed.',
);

console.log('shopping list row removed RPC migration tests passed.');
