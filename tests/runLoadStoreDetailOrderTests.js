#!/usr/bin/env node
'use strict';

function asciiNocaseFold(s) {
  return String(s).replace(/[A-Z]/g, (ch) => ch.toLowerCase());
}

function compareAsciiNocaseString(a, b) {
  const la = asciiNocaseFold(String(a));
  const lb = asciiNocaseFold(String(b));
  if (la < lb) return -1;
  if (la > lb) return 1;
  return 0;
}

function sortStoreAisleItemSpecs(a, b) {
  const nameCompare = compareAsciiNocaseString(
    a?.baseName || '',
    b?.baseName || '',
  );
  if (nameCompare !== 0) return nameCompare;
  const aId = Number(a?.ingredientId) || 0;
  const bId = Number(b?.ingredientId) || 0;
  if (aId !== bId) return aId - bId;
  return compareAsciiNocaseString(a?.baseKey || '', b?.baseKey || '');
}

function assertJsonEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}: expected ${e} but got ${a}`);
  }
}

function run() {
  const specs = [
    { baseName: 'goji berries', baseKey: 'goji berries', ingredientId: 31 },
    { baseName: 'salsa', baseKey: 'salsa', ingredientId: 32 },
    {
      baseName: 'almonds',
      baseKey: 'almonds',
      ingredientId: 30,
      selectedVariants: ['all'],
    },
    {
      baseName: 'seaweed snacks',
      baseKey: 'seaweed snacks',
      ingredientId: 33,
    },
  ];
  specs.sort(sortStoreAisleItemSpecs);
  assertJsonEqual(
    specs.map((spec) => spec.baseName),
    ['almonds', 'goji berries', 'salsa', 'seaweed snacks'],
    'aisle item specs should sort A-Z by base name regardless of link order',
  );

  console.log('loadStoreDetail aisle item order tests passed.');
}

run();
