#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');

function extractFunctionBlock(source, startMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Could not find ${startMarker}`);
  }
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Unclosed block for ${startMarker}`);
}

function loadHelpers() {
  const source = fs.readFileSync(mainPath, 'utf8');
  const deps = `
const INGREDIENT_BASE_VARIANT_NAME = 'default';
const SHOPPING_PLAN_KEY_SEP = '\\u001e';
const SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX = 'iv:';
function isIngredientBaseVariantName(rawVariant) {
  const normalized = String(rawVariant || '').trim().toLowerCase();
  return !normalized || normalized === INGREDIENT_BASE_VARIANT_NAME;
}
function makeIngredientVariantShoppingPlanKey(ingredientVariantId) {
  const n = Math.trunc(Number(ingredientVariantId));
  if (!Number.isFinite(n) || n <= 0) return '';
  return \`\${SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX}\${n}\`;
}
function parseIngredientVariantIdFromShoppingPlanKey(key) {
  const s = String(key || '').trim();
  if (!s.startsWith(SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX)) return null;
  const n = Number(s.slice(SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
function getShoppingPlanAggregateKey(name, variantName = '') {
  const normalizedName = String(name || '').trim().toLowerCase();
  const normalizedVariant = String(variantName || '').trim().toLowerCase();
  if (!normalizedName) return '';
  if (!normalizedVariant || normalizedVariant === INGREDIENT_BASE_VARIANT_NAME) {
    return normalizedName;
  }
  return \`\${normalizedName}\${SHOPPING_PLAN_KEY_SEP}\${normalizedVariant}\`;
}
`;
  const blocks = [
    extractFunctionBlock(source, 'function resolveBrowseIvKeyForCatalogItem'),
    extractFunctionBlock(source, 'function resolveBrowseIvKeyForPlanRow'),
    extractFunctionBlock(
      source,
      'function resolveShoppingBrowsePlanRowAggregateKey',
    ),
  ];
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(
    `${deps}\n${blocks.join('\n\n')}\nwindow.__shoppingBrowsePlanRowHelpers = {
  resolveBrowseIvKeyForCatalogItem,
  resolveBrowseIvKeyForPlanRow,
  resolveShoppingBrowsePlanRowAggregateKey,
};`,
    context,
    { filename: 'main.shoppingBrowsePlanRowKeyHelpers.js' },
  );
  const helpers = context.window.__shoppingBrowsePlanRowHelpers;
  if (!helpers) {
    throw new Error('Shopping browse plan row helpers were not attached to window.');
  }
  return helpers;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual:   ${actual}`);
  }
}

function run() {
  const helpers = loadHelpers();
  const noodlesCatalog = {
    name: 'noodles',
    defaultVariantId: 50,
    variants: ['elbow', 'spaghetti'],
    variantIdByName: { elbow: 51, spaghetti: 52 },
  };

  assertEqual(
    helpers.resolveBrowseIvKeyForCatalogItem(noodlesCatalog, 'default'),
    'iv:50',
    'default variant maps to iv key',
  );

  assertEqual(
    helpers.resolveBrowseIvKeyForCatalogItem(noodlesCatalog, 'elbow'),
    'iv:51',
    'named variant maps to iv key',
  );

  assertEqual(
    helpers.resolveShoppingBrowsePlanRowAggregateKey('iv:50', [noodlesCatalog]),
    'noodles',
    'iv default resolves to base aggregate key',
  );

  assertEqual(
    helpers.resolveShoppingBrowsePlanRowAggregateKey('iv:51', [noodlesCatalog]),
    `noodles${'\u001e'}elbow`,
    'iv named variant resolves to aggregate key',
  );

  assertEqual(
    helpers.resolveBrowseIvKeyForPlanRow(
      { name: 'noodles', variantName: 'elbow' },
      [noodlesCatalog],
    ),
    'iv:51',
    'plan row reverse maps to iv key for index aliasing',
  );

  assertEqual(
    helpers.resolveShoppingBrowsePlanRowAggregateKey('noodles', [noodlesCatalog]),
    'noodles',
    'aggregate keys pass through unchanged',
  );

  console.log('Shopping browse plan row key tests passed.');
}

run();
