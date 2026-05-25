#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function runMerge({ currentPlan, remotePlan, itemStateByKey = {}, recipeStateByKey = {} }) {
  const source = fs.readFileSync(mainPath, 'utf8');
  const fn = extractFunction(source, 'mergeRemotePlanForPerKeyStaleness');
  const context = {
    Date,
    Array,
    String,
    Number,
    Object,
    __currentPlan: currentPlan,
    __remotePlan: remotePlan,
    __itemStateByKey: itemStateByKey,
    __recipeStateByKey: recipeStateByKey,
  };
  context.window = {
    favoriteEatsPlanItemsQuantityQueue: {
      getKeyState(op) {
        return context.__itemStateByKey[String(op.entityKey)] || null;
      },
    },
    favoriteEatsPlanRecipeServingsQueue: {
      getKeyState(op) {
        return context.__recipeStateByKey[String(op.entityKey)] || null;
      },
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    `
    var shoppingPlanCache = __currentPlan;
    ${fn}
    var __result = mergeRemotePlanForPerKeyStaleness(__remotePlan);
    `,
    context,
    { filename: 'mergeRemotePlanForPerKeyStaleness.vm.js' },
  );
  return context.__result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testStaleItemRowDeletedWhenLocalReachedZero() {
  const result = runMerge({
    currentPlan: {
      version: 1,
      itemSelections: {},
      recipeSelections: {},
    },
    remotePlan: {
      version: 1,
      itemSelections: {
        apples: {
          key: 'apples',
          quantity: 2,
          updatedAt: '2026-05-24T10:00:00.000Z',
        },
      },
      recipeSelections: {},
    },
    itemStateByKey: {
      apples: {
        lastAppliedServerUpdatedAt: '2026-05-24T10:00:00.000Z',
        lastLocalValue: 0,
        hasLocalValue: true,
      },
    },
  });

  assert(
    !Object.prototype.hasOwnProperty.call(result.itemSelections, 'apples'),
    'Stale wholesale item row should not reappear after local quantity reached zero.',
  );
}

function testUntimestampedStaleItemRowDeletedWhenLocalReachedZero() {
  const result = runMerge({
    currentPlan: {
      version: 1,
      itemSelections: {},
      recipeSelections: {},
    },
    remotePlan: {
      version: 1,
      itemSelections: {
        apples: {
          key: 'apples',
          quantity: 2,
        },
      },
      recipeSelections: {},
    },
    itemStateByKey: {
      apples: {
        lastAppliedServerUpdatedAt: '2026-05-24T10:00:00.000Z',
        lastLocalValue: 0,
        hasLocalValue: true,
      },
    },
  });

  assert(
    !Object.prototype.hasOwnProperty.call(result.itemSelections, 'apples'),
    'Untimestamped stale wholesale item row should not reappear after local quantity reached zero.',
  );
}

function testStaleItemRowStillReplacedWhenLocalRowExists() {
  const result = runMerge({
    currentPlan: {
      version: 1,
      itemSelections: {
        apples: {
          key: 'apples',
          quantity: 4,
          updatedAt: '2026-05-24T10:00:00.000Z',
        },
      },
      recipeSelections: {},
    },
    remotePlan: {
      version: 1,
      itemSelections: {
        apples: {
          key: 'apples',
          quantity: 2,
          updatedAt: '2026-05-24T10:00:00.000Z',
        },
      },
      recipeSelections: {},
    },
    itemStateByKey: {
      apples: {
        lastAppliedServerUpdatedAt: '2026-05-24T10:00:00.000Z',
        lastLocalValue: 4,
        hasLocalValue: true,
      },
    },
  });

  assert(
    result.itemSelections.apples.quantity === 4,
    'Stale wholesale item row should still splice in the current local row when present.',
  );
}

testStaleItemRowDeletedWhenLocalReachedZero();
testUntimestampedStaleItemRowDeletedWhenLocalReachedZero();
testStaleItemRowStillReplacedWhenLocalRowExists();

console.log('shopping plan per-key staleness merge tests passed.');
