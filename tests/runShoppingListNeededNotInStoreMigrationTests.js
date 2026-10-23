#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20261023170821_shopping_list_needed_not_in_store.sql',
);

const sql = fs.readFileSync(migrationPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fnBody(name) {
  const start = sql.indexOf(`create or replace function catalog.${name}(`);
  assert(start !== -1, `Migration should define catalog.${name}.`);
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end);
}

assert(
  /alter table list\.row_overrides\s+add column if not exists needed boolean not null default false,\s+add column if not exists not_in_store boolean not null default false;/.test(
    sql,
  ),
  'row_overrides should gain needed / not_in_store columns defaulting to false.',
);
assert(
  /alter table list\.manual_rows\s+add column if not exists needed boolean not null default false,\s+add column if not exists not_in_store boolean not null default false;/.test(
    sql,
  ),
  'manual_rows should gain needed / not_in_store columns defaulting to false.',
);

const flag = fnBody('set_shopping_list_row_flag');
assert(
  flag.includes("v_flag not in ('needed', 'not_in_store')"),
  'Flag RPC should reject unknown flags.',
);
assert(
  flag.includes('removed = case when v_is_needed and v_value then false else removed end') &&
    flag.includes('store_id = gr.store_id'),
  'Setting needed should un-remove the row and restore generated placement.',
);
assert(
  flag.includes('checked = case when v_value then false else checked end'),
  'Setting either flag should clear checked.',
);
assert(
  flag.includes("store_label = 'removed' then ''"),
  'Setting needed on a removed manual row should un-remove it.',
);
assert(
  flag.includes('listSessionUpdatedAt'),
  'Flag RPC should bump and return the list session revision.',
);
assert(
  sql.includes(
    'grant execute on function catalog.set_shopping_list_row_flag(text, text, boolean)\n  to anon, authenticated;',
  ),
  'Migration should grant execute on set_shopping_list_row_flag.',
);

const checked = fnBody('set_shopping_list_row_checked');
assert(
  (checked.match(/needed = case when v_checked then false else needed end/g) || [])
    .length === 2 &&
    checked.includes('when excluded.checked then false'),
  'Checking a row should clear needed / not_in_store on overrides and manual rows.',
);

const removed = fnBody('set_shopping_list_row_removed');
assert(
  (removed.match(/needed = false,\s+not_in_store = false/g) || []).length === 3,
  'Removing a row should clear needed / not_in_store (update, upsert, manual).',
);

const uncheckAll = fnBody('uncheck_all_shopping_list_rows');
assert(
  (uncheckAll.match(/not_in_store = false/g) || []).length === 2,
  'Uncheck all should also clear not_in_store.',
);

const load = fnBody('load_shopping_state');
assert(
  load.includes("'needed', mr.needed") &&
    load.includes("'notInStore', mr.not_in_store") &&
    load.includes("'needed', ro.needed") &&
    load.includes("'notInStore', ro.not_in_store"),
  'load_shopping_state should emit needed / notInStore for manual and override rows.',
);

const save = fnBody('save_shopping_state');
assert(
  (save.match(/coalesce\(\(v_row->>'needed'\)::boolean, false\)/g) || []).length ===
    2 &&
    (save.match(/coalesce\(\(v_row->>'notInStore'\)::boolean, false\)/g) || [])
      .length === 2,
  'save_shopping_state should persist needed / notInStore for override and manual rows.',
);
assert(
  save.includes("case when v_row_removed then nullif(v_row->>'restoreAisleSortOrder', '')::numeric end"),
  'save_shopping_state should keep the removed-row placement fallback.',
);

console.log('shopping list needed / not-in-store migration tests passed.');
