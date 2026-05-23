#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260623140000_shopping_list_canonical_removed.sql',
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
  sql.includes('set removed = true'),
  'Remove RPC should set canonical removed=true.',
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
  sql.includes('create or replace function catalog.restore_removed_shopping_list_rows(') &&
    sql.includes('ro.removed = true'),
  'restore_removed bulk RPC should target canonical removed rows.',
);
assert(
  sql.includes("'removed', coalesce(") && sql.includes('ro.removed'),
  'load_shopping_state should emit removed flag.',
);
assert(
  sql.includes('v_row_removed := coalesce'),
  'save_shopping_state should persist removed from list doc payload.',
);
assert(
  sql.includes('grant execute on function catalog.set_shopping_list_row_removed(text, boolean)'),
  'Migration should grant execute on set_shopping_list_row_removed.',
);

console.log('shopping list row removed RPC migration tests passed.');
