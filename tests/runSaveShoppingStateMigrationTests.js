#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260527120000_save_shopping_state_skip_missing_recipes.sql',
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
  sql.includes('create or replace function catalog.save_shopping_state(state_payload jsonb)'),
  'Migration should redefine catalog.save_shopping_state.',
);
assert(
  sql.includes('return catalog.load_shopping_state();'),
  'save_shopping_state should still return the canonical loaded state.',
);

const selectedRecipesBlock = extractBetween(
  sql,
  'delete from plan.selected_recipes where document_id = v_doc_id;',
  '-- Always mirror recipeSelectionRoots',
);
assert(
  selectedRecipesBlock.includes("v_recipe_id := nullif(v_recipe->>'recipeId', '')::bigint;"),
  'selected_recipes should parse recipeId once into v_recipe_id.',
);
assert(
  selectedRecipesBlock.includes('exists (select 1 from catalog.recipes where id = v_recipe_id)'),
  'selected_recipes should skip recipe ids missing from catalog.recipes.',
);
assert(
  selectedRecipesBlock.includes('v_doc_id,\n        v_recipe_id,'),
  'selected_recipes insert should use the validated recipe id.',
);

const rootsBlock = extractBetween(
  sql,
  'delete from plan.selected_recipe_roots where document_id = v_doc_id;',
  'v_order := 0;',
);
assert(
  rootsBlock.includes("v_root_recipe_id := nullif(v_root->>'recipeId', '')::bigint;"),
  'selected_recipe_roots should parse recipeId once into v_root_recipe_id.',
);
assert(
  rootsBlock.includes('exists (select 1 from catalog.recipes where id = v_root_recipe_id)'),
  'selected_recipe_roots should skip recipe ids missing from catalog.recipes.',
);
assert(
  rootsBlock.includes('v_doc_id,\n        v_root_recipe_id,'),
  'selected_recipe_roots insert should use the validated recipe id.',
);

console.log('save_shopping_state migration tests passed.');
