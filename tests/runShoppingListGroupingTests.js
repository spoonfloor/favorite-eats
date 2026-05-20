#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end + endMarker.length);
}

function loadHelpers() {
  const source = fs.readFileSync(mainPath, 'utf8');
  const snippet = extractSnippet(
    source,
    '// --- Shopping list grouping helpers (tests extract this block) ---',
    '// --- End shopping list grouping helpers ---'
  );
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(snippet, context, { filename: 'main.shopping-list-grouping-helpers.js' });
  const helpers = context.window.__shoppingListGroupingHelpers;
  if (!helpers) throw new Error('Shopping list grouping helpers were not attached to window.');
  return helpers;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertJsonEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`
  );
}

function run() {
  const helpers = loadHelpers();

  assertJsonEqual(
    helpers.orderShoppingListSelectedStoreIds([5, 2, 7], [2, 7]),
    [2, 7],
    'selected store ids should follow persisted store order'
  );

  assertJsonEqual(
    helpers.orderShoppingListSelectedStoreIds([5, 2], [9, 2, 9, 5]),
    [5, 2, 9],
    'selected stores missing from store order should append after ordered matches'
  );

  const chosen = helpers.chooseShoppingListAssignment(
    [
      { storeId: 4, aisleId: 99, aisleLabel: 'Late', aisleSortOrder: 50 },
      { storeId: 3, aisleId: 2, aisleLabel: 'Second', aisleSortOrder: 2 },
      { storeId: 3, aisleId: 1, aisleLabel: 'First', aisleSortOrder: 1 },
    ],
    [4, 3]
  );
  assertJsonEqual(
    chosen,
    { storeId: 4, aisleId: 99, aisleLabel: 'Late', aisleSortOrder: 50 },
    'first selected store should win even if a later store has an earlier aisle'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'foo', variantName: '' },
      {
        baseAssignmentMap: new Map(),
        variantAssignmentMap: new Map([
          [
            helpers.getShoppingListVariantAssignmentKey('foo', 'bar'),
            [{ storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 }],
          ],
          [
            helpers.getShoppingListVariantAssignmentKey('foo', 'baz'),
            [{ storeId: 1, aisleId: 12, aisleLabel: 'Aisle 2', aisleSortOrder: 2 }],
          ],
        ]),
        variantOrderMap: new Map([['foo', ['bar', 'baz']]]),
        variantAnyAssignmentMap: new Map([
          [
            'foo',
            [
              { storeId: 1, aisleId: 12, aisleLabel: 'Aisle 2', aisleSortOrder: 2 },
              { storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 },
            ],
          ],
        ]),
        selectedStoreIds: [1],
      }
    ),
    helpers.buildShoppingListUnknownAisleCandidates([1]),
    'bare items without base aisle links should use unknown aisle, not sibling variants'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'basil', variantName: 'default' },
      {
        baseAssignmentMap: new Map(),
        variantAssignmentMap: new Map([
          [
            helpers.getShoppingListVariantAssignmentKey('basil', 'dried'),
            [{ storeId: 1, aisleId: 12, aisleLabel: 'Spices', aisleSortOrder: 2 }],
          ],
        ]),
        variantOrderMap: new Map([['basil', ['dried']]]),
        variantAnyAssignmentMap: new Map([
          [
            'basil',
            [{ storeId: 1, aisleId: 12, aisleLabel: 'Spices', aisleSortOrder: 2 }],
          ],
        ]),
        selectedStoreIds: [1],
      }
    ),
    helpers.buildShoppingListUnknownAisleCandidates([1]),
    'planner any rows (variantName default) should use unknown aisle, not sibling variants'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'foo', variantName: 'bar' },
      {
        baseAssignmentMap: new Map([
          ['foo', [{ storeId: 1, aisleId: 99, aisleLabel: 'Base', aisleSortOrder: 99 }]],
        ]),
        variantAssignmentMap: new Map([
          [
            helpers.getShoppingListVariantAssignmentKey('foo', 'bar'),
            [{ storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 }],
          ],
        ]),
        variantAnyAssignmentMap: new Map([
          ['foo', [{ storeId: 1, aisleId: 12, aisleLabel: 'Aisle 2', aisleSortOrder: 2 }]],
        ]),
      }
    ),
    [{ storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 }],
    'explicit variant rows should keep exact variant assignments'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'basil', variantName: 'fresh' },
      {
        baseAssignmentMap: new Map(),
        variantAssignmentMap: new Map([
          [
            helpers.getShoppingListVariantAssignmentKey('basil', 'dried'),
            [{ storeId: 1, aisleId: 12, aisleLabel: 'Spices', aisleSortOrder: 2 }],
          ],
        ]),
        variantOrderMap: new Map([['basil', ['dried']]]),
        variantAnyAssignmentMap: new Map([
          [
            'basil',
            [{ storeId: 1, aisleId: 12, aisleLabel: 'Spices', aisleSortOrder: 2 }],
          ],
        ]),
        selectedStoreIds: [1],
      }
    ),
    [],
    'explicit variant rows with only sibling variant links should be unlisted, not unknown'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'tomatoes', variantName: 'roma' },
      {
        baseAssignmentMap: new Map([
          [
            'tomatoes',
            [{ storeId: 1, aisleId: 4, aisleLabel: 'Produce', aisleSortOrder: 1 }],
          ],
        ]),
        variantAssignmentMap: new Map(),
        variantOrderMap: new Map([['tomatoes', ['roma']]]),
        selectedStoreIds: [1],
      }
    ),
    helpers.buildShoppingListUnknownAisleCandidates([1]),
    'named variant rows should use unknown when only the generic base is listed'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'vinegar', variantName: 'white' },
      {
        baseAssignmentMap: new Map(),
        variantAssignmentMap: new Map([
          [
            helpers.getShoppingListVariantAssignmentKey('vinegar', 'apple cider'),
            [{ storeId: 1, aisleId: 55, aisleLabel: 'Condiments', aisleSortOrder: 5 }],
          ],
        ]),
        variantOrderMap: new Map([['vinegar', ['apple cider']]]),
        selectedStoreIds: [1],
      }
    ),
    [],
    'named variant rows with only a different specific variant should be unlisted'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'puff pastry', variantName: 'default' },
      {
        baseAssignmentMap: new Map(),
        variantAssignmentMap: new Map(),
        variantOrderMap: new Map(),
        selectedStoreIds: [1],
      }
    ),
    [],
    'rows with no store links at any selected store should be unlisted'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'foo', variantName: '' },
      {
        baseAssignmentMap: new Map([
          ['foo', [{ storeId: 1, aisleId: 99, aisleLabel: 'Base', aisleSortOrder: 99 }]],
        ]),
        variantAssignmentMap: new Map([
          [
            helpers.getShoppingListVariantAssignmentKey('foo', 'bar'),
            [{ storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 }],
          ],
        ]),
        variantOrderMap: new Map([['foo', ['bar']]]),
        variantAnyAssignmentMap: new Map([
          ['foo', [{ storeId: 1, aisleId: 12, aisleLabel: 'Aisle 2', aisleSortOrder: 2 }]],
        ]),
      }
    ),
    [{ storeId: 1, aisleId: 99, aisleLabel: 'Base', aisleSortOrder: 99 }],
    'bare items should keep explicit base assignments ahead of variant-derived aisles'
  );

  const vinegarAisle = [
    { storeId: 1, aisleId: 55, aisleLabel: 'Condiments', aisleSortOrder: 5 },
  ];
  const vinegarMaps = {
    baseAssignmentMap: new Map([['vinegar', vinegarAisle]]),
    variantAssignmentMap: new Map([
      [
        helpers.getShoppingListVariantAssignmentKey('vinegar', 'white'),
        vinegarAisle,
      ],
    ]),
    selectedStoreIds: [1],
  };

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'vinegar', variantName: 'default' },
      vinegarMaps,
    ),
    vinegarAisle,
    'explicit (any) base links should place generic vinegar rows in the configured aisle'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'vinegar', variantName: 'white' },
      vinegarMaps,
    ),
    vinegarAisle,
    'named white vinegar rows should use the exact variant link from vinegar (any, white)'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'vinegar', variantName: 'default' },
      {
        baseAssignmentMap: new Map(),
        variantAssignmentMap: new Map([
          [
            helpers.getShoppingListVariantAssignmentKey('vinegar', 'white'),
            vinegarAisle,
          ],
        ]),
        variantOrderMap: new Map([['vinegar', ['white']]]),
        selectedStoreIds: [1],
      },
    ),
    helpers.buildShoppingListUnknownAisleCandidates([1]),
    'generic vinegar rows should stay unknown when only a sibling variant has an aisle link'
  );

  const vinegarGroupedRows = helpers.buildGroupedShoppingListRows(
    [
      {
        key: 'vinegar',
        label: 'vinegar',
        text: 'vinegar',
        assignmentCandidates: helpers.getShoppingListAssignmentCandidates(
          { name: 'vinegar', variantName: 'default' },
          vinegarMaps,
        ),
      },
      {
        key: 'vinegar:white',
        label: 'white vinegar',
        text: 'white vinegar',
        assignmentCandidates: helpers.getShoppingListAssignmentCandidates(
          { name: 'vinegar', variantName: 'white' },
          vinegarMaps,
        ),
      },
    ],
    {
      selectedStores: [{ id: 1, label: 'Numarket' }],
      unlistedLabel: 'UNLISTED',
    },
  );

  assertJsonEqual(
    vinegarGroupedRows.map((row) => [row.rowType, row.text]),
    [
      ['section', 'Numarket'],
      ['section', 'Condiments'],
      ['item', 'vinegar'],
      ['item', 'white vinegar'],
    ],
    'vinegar (any, white) assignments should group generic and named variant rows under the same aisle'
  );

  const tomatoAllAisle = [
    { storeId: 1, aisleId: 60, aisleLabel: 'Produce', aisleSortOrder: 1 },
  ];
  const tomatoAllMaps = {
    baseAssignmentMap: new Map([['tomato', tomatoAllAisle]]),
    variantAssignmentMap: new Map([
      [
        helpers.getShoppingListVariantAssignmentKey('tomato', 'Roma'),
        tomatoAllAisle,
      ],
      [
        helpers.getShoppingListVariantAssignmentKey('tomato', 'Cherry'),
        tomatoAllAisle,
      ],
    ]),
    selectedStoreIds: [1],
  };

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'tomato', variantName: 'default' },
      tomatoAllMaps,
    ),
    tomatoAllAisle,
    'tomato (all) base link should place generic tomato rows in Produce'
  );

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'tomato', variantName: 'Cherry' },
      tomatoAllMaps,
    ),
    tomatoAllAisle,
    'tomato (all) variant links should place every named variant row in Produce'
  );

  const tomatoAllIntentAisle = [
    { storeId: 1, aisleId: 60, aisleLabel: 'Produce', aisleSortOrder: 1 },
  ];
  const tomatoAllIntentMaps = {
    baseAssignmentMap: new Map([['tomato', tomatoAllIntentAisle]]),
    variantAssignmentMap: new Map(),
    allVariantsAssignmentMap: new Map([['tomato', tomatoAllIntentAisle]]),
    selectedStoreIds: [1],
  };

  assertJsonEqual(
    helpers.getShoppingListAssignmentCandidates(
      { name: 'tomato', variantName: 'Heirloom' },
      tomatoAllIntentMaps,
    ),
    tomatoAllIntentAisle,
    'tomato (all) intent should place new variants even before explicit variant links exist'
  );

  const rows = helpers.buildGroupedShoppingListRows(
    [
      {
        key: 'foo',
        label: 'foo',
        text: 'foo',
        assignmentCandidates: [
          { storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 },
          { storeId: 2, aisleId: 21, aisleLabel: 'Aisle 1', aisleSortOrder: 1 },
        ],
      },
      {
        key: 'bar',
        label: 'bar',
        text: 'bar',
        assignmentCandidates: [
          { storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 },
          { storeId: 2, aisleId: 21, aisleLabel: 'Aisle 1', aisleSortOrder: 1 },
        ],
      },
      {
        key: 'baz',
        label: 'baz',
        text: 'baz',
        assignmentCandidates: [
          { storeId: 1, aisleId: 12, aisleLabel: 'Aisle 2', aisleSortOrder: 2 },
          { storeId: 2, aisleId: 21, aisleLabel: 'Aisle 1', aisleSortOrder: 1 },
        ],
      },
      {
        key: 'qux',
        label: 'qux',
        text: 'qux',
        assignmentCandidates: [
          { storeId: 2, aisleId: 213, aisleLabel: 'Aisle 13', aisleSortOrder: 13 },
        ],
      },
      {
        key: 'pup',
        label: 'pup',
        text: 'pup',
        assignmentCandidates: [],
      },
    ],
    {
      selectedStores: [
        { id: 1, label: 'STORE 1' },
        { id: 2, label: 'STORE 2' },
      ],
      unlistedLabel: 'UNLISTED',
    }
  );

  assertJsonEqual(
    rows.map((row) => [row.rowType, row.text]),
    [
      ['section', 'STORE 1'],
      ['section', 'Aisle 1'],
      ['item', 'bar'],
      ['item', 'foo'],
      ['section', 'Aisle 2'],
      ['item', 'baz'],
      ['section', 'STORE 2'],
      ['section', 'Aisle 13'],
      ['item', 'qux'],
      ['section', 'UNLISTED'],
      ['item', 'pup'],
    ],
    'shopping list rows should group by selected store, then aisle, then unlisted'
  );

  const bareVariantRows = helpers.buildGroupedShoppingListRows(
    [
      {
        key: 'foo',
        label: 'foo',
        text: 'foo',
        assignmentCandidates: helpers.getShoppingListAssignmentCandidates(
          {
            name: 'foo',
            variantName: '',
          },
          {
            baseAssignmentMap: new Map(),
            variantAssignmentMap: new Map([
              [
                helpers.getShoppingListVariantAssignmentKey('foo', 'bar'),
                [{ storeId: 1, aisleId: 12, aisleLabel: 'Aisle 2', aisleSortOrder: 2 }],
              ],
              [
                helpers.getShoppingListVariantAssignmentKey('foo', 'baz'),
                [{ storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 }],
              ],
            ]),
            variantOrderMap: new Map([['foo', ['bar', 'baz']]]),
            variantAnyAssignmentMap: new Map([
              [
                'foo',
                [
                  { storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 },
                  { storeId: 1, aisleId: 12, aisleLabel: 'Aisle 2', aisleSortOrder: 2 },
                ],
              ],
            ]),
            selectedStoreIds: [1],
          },
        ),
      },
    ],
    {
      selectedStores: [{ id: 1, label: 'STORE 1' }],
      unlistedLabel: 'UNLISTED',
    }
  );

  assertJsonEqual(
    bareVariantRows.map((row) => [row.rowType, row.text]),
    [
      ['section', 'STORE 1'],
      ['section', helpers.SHOPPING_LIST_UNKNOWN_AISLE_LABEL],
      ['item', 'foo'],
    ],
    'bare items without base aisle links should render under unknown aisle'
  );

  const plannerAnyRows = helpers.buildGroupedShoppingListRows(
    [
      {
        key: 'basil',
        label: 'basil',
        text: '4 basil',
        assignmentCandidates: helpers.getShoppingListAssignmentCandidates(
          { name: 'basil', variantName: 'default' },
          {
            baseAssignmentMap: new Map(),
            variantAssignmentMap: new Map([
              [
                helpers.getShoppingListVariantAssignmentKey('basil', 'dried'),
                [{ storeId: 1, aisleId: 12, aisleLabel: 'Spices', aisleSortOrder: 2 }],
              ],
            ]),
            variantOrderMap: new Map([['basil', ['dried']]]),
            variantAnyAssignmentMap: new Map([
              [
                'basil',
                [{ storeId: 1, aisleId: 12, aisleLabel: 'Spices', aisleSortOrder: 2 }],
              ],
            ]),
            selectedStoreIds: [1],
          },
        ),
      },
    ],
    {
      selectedStores: [{ id: 1, label: 'Numarket' }],
      unlistedLabel: 'UNLISTED',
    }
  );

  assertJsonEqual(
    plannerAnyRows.map((row) => [row.rowType, row.text]),
    [
      ['section', 'Numarket'],
      ['section', helpers.SHOPPING_LIST_UNKNOWN_AISLE_LABEL],
      ['item', '4 basil'],
    ],
    'planner any rows should render under unknown aisle when only a sibling variant has an aisle'
  );

  const mergedAisleMetaRows = helpers.buildGroupedShoppingListRows(
    [
      {
        key: 'late',
        label: 'late',
        text: 'late',
        assignmentCandidates: [
          { storeId: 1, aisleId: 11, aisleLabel: 'Dairy', aisleSortOrder: 999999 },
        ],
      },
      {
        key: 'early',
        label: 'early',
        text: 'early',
        assignmentCandidates: [
          { storeId: 1, aisleId: 11, aisleLabel: 'Dairy', aisleSortOrder: 1 },
        ],
      },
      {
        key: 'mid',
        label: 'mid',
        text: 'mid',
        assignmentCandidates: [
          { storeId: 1, aisleId: 12, aisleLabel: 'Bakery', aisleSortOrder: 2 },
        ],
      },
    ],
    {
      selectedStores: [{ id: 1, label: 'STORE 1' }],
      unlistedLabel: 'UNLISTED',
    }
  );

  assertJsonEqual(
    mergedAisleMetaRows.map((row) => [row.rowType, row.text]),
    [
      ['section', 'STORE 1'],
      ['section', 'Dairy'],
      ['item', 'early'],
      ['item', 'late'],
      ['section', 'Bakery'],
      ['item', 'mid'],
    ],
    'aisle sort order should use the best metadata when the first item had a placeholder sort'
  );

  const extraSelectedStoreNoItems = helpers.buildGroupedShoppingListRows(
    [
      {
        key: 'only-s1',
        label: 'only-s1',
        text: 'only-s1',
        assignmentCandidates: [
          { storeId: 1, aisleId: 11, aisleLabel: 'Aisle 1', aisleSortOrder: 1 },
        ],
      },
    ],
    {
      selectedStores: [
        { id: 1, label: 'STORE 1' },
        { id: 99, label: 'STORE 99 (NO ITEMS)' },
      ],
      unlistedLabel: 'UNLISTED',
    },
  );

  assertJsonEqual(
    extraSelectedStoreNoItems.map((row) => [row.rowType, row.text]),
    [
      ['section', 'STORE 1'],
      ['section', 'Aisle 1'],
      ['item', 'only-s1'],
    ],
    'selected stores with no allocated line items should not emit store or aisle sections'
  );

  const unlistedVariantRows = helpers.buildGroupedShoppingListRows(
    [
      {
        key: 'vinegar:white',
        label: 'vinegar (white)',
        text: 'vinegar (white)',
        assignmentCandidates: helpers.getShoppingListAssignmentCandidates(
          { name: 'vinegar', variantName: 'white' },
          {
            baseAssignmentMap: new Map(),
            variantAssignmentMap: new Map([
              [
                helpers.getShoppingListVariantAssignmentKey('vinegar', 'apple cider'),
                [{ storeId: 1, aisleId: 55, aisleLabel: 'Condiments', aisleSortOrder: 5 }],
              ],
            ]),
            variantOrderMap: new Map([['vinegar', ['apple cider']]]),
            selectedStoreIds: [1],
          },
        ),
      },
    ],
    {
      selectedStores: [{ id: 1, label: 'Numarket' }],
      unlistedLabel: 'UNLISTED',
    },
  );

  assertJsonEqual(
    unlistedVariantRows.map((row) => [row.rowType, row.text]),
    [
      ['section', 'UNLISTED'],
      ['item', 'vinegar (white)'],
    ],
    'sibling-only variant rows should render under unlisted'
  );

  console.log('Shopping list grouping tests passed.');
}

run();
