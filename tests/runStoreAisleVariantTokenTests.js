#!/usr/bin/env node
'use strict';

function normVariantKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

const STORE_AISLE_ANY_VARIANT_TOKEN = 'any';
const STORE_AISLE_ALL_VARIANT_TOKEN = 'all';

function isStoreAisleAnyVariantToken(name) {
  return normVariantKey(name) === STORE_AISLE_ANY_VARIANT_TOKEN;
}

function isStoreAisleAllVariantToken(name) {
  return normVariantKey(name) === STORE_AISLE_ALL_VARIANT_TOKEN;
}

function isStoreAisleReservedVariantToken(name) {
  return isStoreAisleAnyVariantToken(name) || isStoreAisleAllVariantToken(name);
}

function finalizeStoreAisleSelectedVariants(selected, dbOrdered = []) {
  const source = Array.isArray(selected) ? selected : [];
  if (source.some(isStoreAisleAllVariantToken)) {
    return [STORE_AISLE_ALL_VARIANT_TOKEN];
  }
  const anyTokens = source.filter(isStoreAisleAnyVariantToken);
  const named = source.filter((v) => !isStoreAisleReservedVariantToken(v));
  const orderedNames = Array.isArray(dbOrdered)
    ? dbOrdered.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  const dbKeys = new Set(orderedNames.map((v) => normVariantKey(v)));
  const extras = named.filter((v) => !dbKeys.has(normVariantKey(v)));
  const wanted = new Set(named.map((v) => normVariantKey(v)));
  const ordered = [];
  orderedNames.forEach((name) => {
    if (wanted.has(normVariantKey(name))) ordered.push(name);
  });
  extras.forEach((name) => {
    if (!ordered.some((v) => normVariantKey(v) === normVariantKey(name))) {
      ordered.push(name);
    }
  });
  return anyTokens.length
    ? [STORE_AISLE_ANY_VARIANT_TOKEN, ...ordered]
    : ordered;
}

function assertJsonEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}: expected ${e} but got ${a}`);
  }
}

function run() {
  assertJsonEqual(
    finalizeStoreAisleSelectedVariants(['any', 'bar', 'baz', 'all'], [
      'bar',
      'baz',
    ]),
    ['all'],
    'all should collapse any and named variants on finalize'
  );

  assertJsonEqual(
    finalizeStoreAisleSelectedVariants(['white', 'Roma'], ['Roma', 'Cherry', 'white']),
    ['Roma', 'white'],
    'partial variants should stay ordered without any'
  );

  assertJsonEqual(
    finalizeStoreAisleSelectedVariants(['any', 'white'], ['white', 'Roma']),
    ['any', 'white'],
    'any with partial named variants should remain explicit'
  );

  console.log('Store aisle variant token tests passed.');
}

run();
