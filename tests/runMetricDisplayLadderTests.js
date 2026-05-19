#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const quantityDisplayPolicyPath = path.join(
  projectRoot,
  'js',
  'quantityDisplayPolicy.js',
);

function loadPolicy() {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(quantityDisplayPolicyPath, 'utf8'), context, {
    filename: 'quantityDisplayPolicy.js',
  });
  const pol = context.window.favoriteEatsQuantityDisplayPolicy;
  if (!pol) throw new Error('quantityDisplayPolicy not loaded');
  return pol;
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}: expected ${e} but got ${a}`);
  }
}

function run() {
  const pol = loadPolicy();
  const metric = { useMetric: true };

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 450, 'shopping', undefined, metric),
    {
      family: 'mass',
      quantity: 450,
      unit: 'g',
      displayLabel: '450 g',
    },
    'shopping 450g stays in grams with ceil',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 450.2, 'shopping', undefined, metric),
    {
      family: 'mass',
      quantity: 451,
      unit: 'g',
      displayLabel: '451 g',
    },
    'shopping grams ceil',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 0.4, 'cooking', undefined, metric),
    {
      family: 'mass',
      quantity: 1,
      unit: 'g',
      displayLabel: '1 g',
    },
    'cooking sub-gram ceils to 1 g minimum',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 1050, 'cooking', undefined, metric),
    {
      family: 'mass',
      quantity: 1.1,
      unit: 'kg',
      displayLabel: '1.1 kg',
    },
    'cooking kg rounds to 0.1',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 1050, 'shopping', undefined, metric),
    {
      family: 'mass',
      quantity: 1.1,
      unit: 'kg',
      displayLabel: '1.1 kg',
    },
    'shopping kg ceils to 0.1',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('volume', 55.2, 'cooking', undefined, metric),
    {
      family: 'volume',
      quantity: 56,
      unit: 'ml',
      displayLabel: '56 ml',
    },
    'cooking ml ceil with minimum 1',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('volume', 0.2, 'cooking', undefined, metric),
    {
      family: 'volume',
      quantity: 1,
      unit: 'ml',
      displayLabel: '1 ml',
    },
    'cooking sub-ml ceils to 1 ml minimum',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('volume', 1500, 'shopping', undefined, metric),
    {
      family: 'volume',
      quantity: 1.5,
      unit: 'l',
      displayLabel: '1.5 l',
    },
    'shopping liters ceil to 0.1',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 450, 'cooking', undefined, {
      useMetric: false,
    }),
    pol.getMeasuredDisplayFromBase('mass', 450, 'cooking'),
    'US ladder when useMetric false',
  );

  console.log('runMetricDisplayLadderTests: ok');
}

run();
