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

function isReservedIngredientVariantName(rawVariant) {
  const key = normVariantKey(rawVariant);
  return key === 'default' || key === 'base';
}

function storeAisleHasActiveNamedCatalogVariants(catalogVariants) {
  return (Array.isArray(catalogVariants) ? catalogVariants : []).some((variant) => {
    const name = String(variant?.name ?? variant ?? '').trim();
    if (!name || variant?.isDeprecated) return false;
    if (isStoreAisleReservedVariantToken(name)) return false;
    if (isReservedIngredientVariantName(name)) return false;
    return /[a-z0-9]/i.test(name);
  });
}

function finalizeStoreAisleSelectedVariants(
  selected,
  dbOrdered = [],
  catalogVariants = null,
) {
  const source = Array.isArray(selected) ? selected : [];
  const hasActiveNamed = storeAisleHasActiveNamedCatalogVariants(
    catalogVariants ??
      (Array.isArray(dbOrdered) ? dbOrdered.map((name) => ({ name })) : []),
  );
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
  if (!hasActiveNamed) {
    return ordered;
  }
  if (source.some(isStoreAisleAllVariantToken)) {
    return [STORE_AISLE_ALL_VARIANT_TOKEN];
  }
  const anyTokens = source.filter(isStoreAisleAnyVariantToken);
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

  assertJsonEqual(
    finalizeStoreAisleSelectedVariants(['all'], [], []),
    [],
    'base-only catalog items should not keep all token'
  );

  assertJsonEqual(
    finalizeStoreAisleSelectedVariants(['any'], [], []),
    [],
    'base-only catalog items should not keep any token'
  );

  assertJsonEqual(
    finalizeStoreAisleSelectedVariants(
      ['all', 'white'],
      ['white', 'Roma'],
      [{ name: 'white' }, { name: 'Roma' }],
    ),
    ['all'],
    'all still wins when catalog has named variants'
  );

  console.log('Store aisle variant token tests passed.');
}

run();
