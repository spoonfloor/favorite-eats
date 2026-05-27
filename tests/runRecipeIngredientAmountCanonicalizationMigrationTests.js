#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260623160000_recipe_ingredient_amount_canonicalization.sql',
);
const contractPath = path.join(
  projectRoot,
  'js',
  'data',
  'contracts',
  'recipeIngredientAmountModel.md',
);
const rulePath = path.join(
  projectRoot,
  '.cursor',
  'rules',
  'favorite-eats-recipe-ingredient-amount-model.mdc',
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const contract = fs.readFileSync(contractPath, 'utf8');
const rule = fs.readFileSync(rulePath, 'utf8');

assert(
  sql.includes('create or replace function catalog.canonicalize_recipe_amount_columns()'),
  'Migration should define the canonical amount trigger function.',
);
assert(
  sql.includes('trg_recipe_ingredient_map_amount_canonical') &&
    sql.includes('on catalog.recipe_ingredient_map'),
  'Migration should enforce recipe_ingredient_map amount canonicalization.',
);
assert(
  sql.includes('trg_recipe_subrecipe_links_amount_canonical') &&
    sql.includes('on catalog.recipe_subrecipe_links'),
  'Migration should enforce recipe_subrecipe_links amount canonicalization.',
);
assert(
  sql.includes('new.quantity_min := v_quantity_num;') &&
    sql.includes('new.quantity_max := v_quantity_num;'),
  'Positive scalar quantity should collapse min/max to the scalar.',
);
assert(
  sql.includes('new.quantity_min := null;') &&
    sql.includes('Plain nonnumeric text'),
  'Plain text quantities should clear stale numeric endpoints.',
);
assert(
  sql.includes("v_quantity ~* '(^|[[:space:]])(to|through|thru)([[:space:]]|$)'") &&
    sql.includes("v_quantity ~ '[0-9]\\s*[-–—]\\s*[0-9]'"),
  'Explicit range text should preserve endpoint data.',
);

assert(
  contract.includes('Scalar quantity wins over stale endpoint data') &&
    contract.includes('Do not add new `quantity_max -> quantity_min -> quantity` precedence logic'),
  'Contract should document scalar precedence and ban raw column precedence.',
);
assert(
  rule.includes('alwaysApply: true') &&
    rule.includes('favoriteEatsRecipeIngredientAmountModel') &&
    rule.includes('Do **not** add new `quantity_max -> quantity_min -> quantity` precedence logic'),
  'Workspace rule should make the amount model canonical for future agents.',
);

console.log('Recipe ingredient amount canonicalization migration tests passed.');
