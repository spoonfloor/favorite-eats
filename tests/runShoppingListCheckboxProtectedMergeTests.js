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

function runMerge({ currentDoc, remoteDoc, stateByKey = {} }) {
  const source = fs.readFileSync(mainPath, 'utf8');
  const helpers = [
    'shoppingListCheckboxEntityKeyFromRow',
    'rowCheckedValue',
    'mergeRemoteListDocForCheckboxStaleness',
  ]
    .map((name) => extractFunction(source, name))
    .join('\n');
  const context = {
    Date,
    Map,
    Array,
    String,
    Object,
    __currentDoc: currentDoc,
    __remoteDoc: remoteDoc,
    __stateByKey: stateByKey,
  };
  context.window = {
    favoriteEatsShoppingListCheckboxInputQueue: {
      getKeyState(op) {
        return context.__stateByKey[String(op.entityKey)] || null;
      },
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    `
    var shoppingListDocAuthoritativeCache = __currentDoc;
    ${helpers}
    var __result = mergeRemoteListDocForCheckboxStaleness(__remoteDoc);
    `,
    context,
    { filename: 'mergeRemoteListDocForCheckboxStaleness.vm.js' },
  );
  return context.__result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testPendingLocalIntentPreservesCurrentRow() {
  const result = runMerge({
    currentDoc: {
      rows: [{ id: 'avocado', sourceKey: 'avocado', text: 'avocado', checked: true }],
    },
    remoteDoc: {
      rows: [{ id: 'avocado', sourceKey: 'avocado', text: 'avocado', checked: false }],
    },
    stateByKey: {
      avocado: {
        pending: true,
        inFlight: false,
        hasLocalValue: true,
        lastLocalValue: true,
        lastAppliedServerUpdatedAt: null,
      },
    },
  });
  assert(
    result.rows[0].checked === true,
    'Wholesale list hydrate should preserve row with pending checkbox intent.',
  );
}

function testInFlightLocalIntentPreservesCurrentRow() {
  const result = runMerge({
    currentDoc: {
      rows: [{ id: 'avocado', sourceKey: 'avocado', text: 'avocado', checked: true }],
    },
    remoteDoc: {
      rows: [{ id: 'avocado', sourceKey: 'avocado', text: 'avocado', checked: false }],
    },
    stateByKey: {
      avocado: {
        pending: false,
        inFlight: true,
        hasLocalValue: true,
        lastLocalValue: true,
        lastAppliedServerUpdatedAt: null,
      },
    },
  });
  assert(
    result.rows[0].checked === true,
    'Wholesale list hydrate should preserve row with in-flight checkbox intent.',
  );
}

function testUntimestampedStaleRowPreservesCurrentRow() {
  const result = runMerge({
    currentDoc: {
      rows: [{ id: 'avocado', sourceKey: 'avocado', text: 'avocado', checked: true }],
    },
    remoteDoc: {
      rows: [{ id: 'avocado', sourceKey: 'avocado', text: 'avocado', checked: false }],
    },
    stateByKey: {
      avocado: {
        pending: false,
        inFlight: false,
        hasLocalValue: true,
        lastLocalValue: true,
        lastAppliedServerUpdatedAt: '2026-05-25T19:39:37.46563+00:00',
      },
    },
  });
  assert(
    result.rows[0].checked === true,
    'Untimestamped stale wholesale row should preserve the known local checkbox value.',
  );
}

function testNewerTimestampedPeerRowApplies() {
  const result = runMerge({
    currentDoc: {
      rows: [
        {
          id: 'avocado',
          sourceKey: 'avocado',
          text: 'avocado',
          checked: true,
          updatedAt: '2026-05-25T19:39:37.46563+00:00',
        },
      ],
    },
    remoteDoc: {
      rows: [
        {
          id: 'avocado',
          sourceKey: 'avocado',
          text: 'avocado',
          checked: false,
          updatedAt: '2026-05-25T19:40:37.46563+00:00',
        },
      ],
    },
    stateByKey: {
      avocado: {
        pending: false,
        inFlight: false,
        hasLocalValue: true,
        lastLocalValue: true,
        lastAppliedServerUpdatedAt: '2026-05-25T19:39:37.46563+00:00',
      },
    },
  });
  assert(
    result.rows[0].checked === false,
    'Newer timestamped peer wholesale row should apply.',
  );
}

testPendingLocalIntentPreservesCurrentRow();
testInFlightLocalIntentPreservesCurrentRow();
testUntimestampedStaleRowPreservesCurrentRow();
testNewerTimestampedPeerRowApplies();

console.log('shopping list checkbox protected merge tests passed.');
