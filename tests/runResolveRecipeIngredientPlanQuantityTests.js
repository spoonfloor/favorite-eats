#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');
const mainPath = path.join(projectRoot, 'js', 'main.js');
const adapterPath = path.join(
  projectRoot,
  'js',
  'data',
  'adapters',
  'supabaseAdapter.js',
);

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadResolverContext() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const snippet = extractSnippet(
    utilsSource,
    'const UNICODE_QUANTITY_FRACTIONS = Object.freeze({',
    'function isNumericQuantity(q) {',
  );
  const context = { console };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(`${snippet}
function isNumericQuantity(q) {
  return parseNumericQuantityValue(q) != null;
}
`, context, { filename: 'resolveRecipeIngredientPlanQuantity.js' });
  return context;
}

function run() {
  const ctx = loadResolverContext();
  const resolve = ctx.resolveRecipeIngredientPlanQuantity;
  assert(typeof resolve === 'function', 'resolveRecipeIngredientPlanQuantity should export');

  assert(resolve({ quantityMax: 9, quantityMin: 3 }) === 9, 'quantityMax wins');
  assert(resolve({ quantityMin: 4 }) === 4, 'quantityMin resolves');
  assert(resolve({ quantity: '9 1/2' }) === 9.5, 'mixed fraction resolves');
  assert(resolve({ quantity: '½' }) === 0.5, 'unicode fraction resolves');
  assert(resolve({ quantity: '3 to 6' }) == null, 'bare range string without descriptor stays null');
  assert(resolve({ quantity: '100' }) === 100, 'plain numeric string resolves');
  assert(
    resolve({ quantity: '100', quantityMin: 100, quantityMax: 100 }) === 100,
    'explicit min/max resolves for recipe 000 ingredient 111 shape',
  );

  const main = fs.readFileSync(mainPath, 'utf8');
  const adapter = fs.readFileSync(adapterPath, 'utf8');
  assert(
    main.includes('return resolveRecipeIngredientPlanQuantity(line);'),
    'main.js getRecipeIngredientShoppingCount should delegate to shared resolver',
  );
  assert(
    adapter.includes('globalThis.resolveRecipeIngredientPlanQuantity(line)'),
    'supabaseAdapter plan row quantity helpers should delegate to shared resolver',
  );
  assert(
    !/function getRecipeIngredientShoppingCount[\s\S]{0,220}parseNumericQuantityValue/.test(
      main,
    ),
    'main.js should not keep a separate parse path after delegation',
  );

  console.log('resolveRecipeIngredientPlanQuantity tests passed.');
}

run();
