#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260531120000_save_shopping_plan.sql',
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(start !== -1, `Missing start marker: ${startNeedle}`);
  assert(end !== -1 && end > start, `Missing end marker after: ${startNeedle}`);
  return source.slice(start, end);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

assert(
  sql.includes('create or replace function catalog.save_shopping_plan(plan_payload jsonb)'),
  'Migration should define catalog.save_shopping_plan.',
);
assert(
  !sql.includes('return catalog.load_shopping_state();') &&
    !/catalog\.load_shopping_state\s*\(\s*\)/.test(
      sql.replace(/--[^\n]*/g, ''),
    ),
  'save_shopping_plan must not call catalog.load_shopping_state().',
);
assert(
  sql.includes("'planUpdatedAt', v_plan_updated_at") &&
    sql.includes("'planVersion', v_plan_version"),
  'save_shopping_plan should return plan revision metadata.',
);

const itemsBlock = extractBetween(
  sql,
  'delete from plan.selected_items si',
  'delete from plan.selected_recipes sr',
);
assert(
  itemsBlock.includes("jsonb_each(coalesce(v_plan->'itemSelections'"),
  'selected_items should upsert from jsonb_each.',
);
assert(
  itemsBlock.includes('on conflict (document_id, item_key) do update'),
  'selected_items should upsert instead of blind delete-all insert loop.',
);

const recipesBlock = extractBetween(
  sql,
  'delete from plan.selected_recipes sr',
  'delete from plan.selected_recipe_roots rr',
);
assert(
  recipesBlock.includes('inner join catalog.recipes r'),
  'selected_recipes should validate recipe ids with a join.',
);
assert(
  recipesBlock.includes('on conflict (document_id, recipe_id) do update'),
  'selected_recipes should upsert validated rows.',
);

const rootsBlock = extractBetween(
  sql,
  'delete from plan.selected_recipe_roots rr',
  'with store_order_raw as',
);
assert(
  rootsBlock.includes('inner join catalog.recipes r'),
  'selected_recipe_roots should validate recipe ids with a join.',
);

console.log('save_shopping_plan migration tests passed.');
