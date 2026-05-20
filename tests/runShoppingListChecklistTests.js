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
    '// --- Shopping list checklist helpers (tests extract this block) ---',
    '// --- End shopping list checklist helpers ---',
  );
  const context = {
    window: {},
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
  };
  vm.createContext(context);
  vm.runInContext(snippet, context, {
    filename: 'main.shopping-list-checklist-helpers.js',
  });
  const helpers = context.window.__shoppingListChecklistHelpers;
  if (!helpers) throw new Error('Shopping list checklist helpers were not attached to window.');
  return helpers;
}

function assertJsonEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}

function run() {
  const helpers = loadHelpers();

  const doc = helpers.buildShoppingListDocFromPlanRows([
    {
      rowType: 'section',
      text: 'Store A',
      className: 'shopping-list-section--store',
      storeId: 10,
    },
    {
      rowType: 'section',
      text: 'Produce',
      className: 'shopping-list-section--aisle',
      aisleId: 110,
      aisleSortOrder: 6,
    },
    { rowType: 'item', text: '3 avocados', className: 'shopping-list-group-item' },
    { rowType: 'item', text: '2 limes', className: 'shopping-list-group-item' },
    {
      rowType: 'section',
      text: 'Aisle 2',
      className: 'shopping-list-section--aisle',
      aisleId: 120,
      aisleSortOrder: 2,
    },
    { rowType: 'item', text: 'chips', className: 'shopping-list-group-item' },
    { rowType: 'section', text: 'Unlisted', className: 'shopping-list-section--unlisted' },
    { rowType: 'item', text: 'paper towels', className: 'shopping-list-group-item' },
  ]);

  assertJsonEqual(
    doc.rows.map((row) => ({
      text: row.text,
      checked: row.checked,
      storeLabel: row.storeLabel,
      storeId: row.storeId,
      bucketLabel: row.bucketLabel,
      aisleId: row.aisleId,
      aisleSortOrder: row.aisleSortOrder,
      sourceKey: row.sourceKey,
      sourceText: row.sourceText,
      userEdited: row.userEdited,
      order: row.order,
    })),
    [
      {
        text: '3 avocados',
        checked: false,
        storeLabel: 'Store A',
        storeId: 10,
        bucketLabel: 'Produce',
        aisleId: 110,
        aisleSortOrder: 6,
        sourceKey: '',
        sourceText: '',
        userEdited: false,
        order: 0,
      },
      {
        text: '2 limes',
        checked: false,
        storeLabel: 'Store A',
        storeId: 10,
        bucketLabel: 'Produce',
        aisleId: 110,
        aisleSortOrder: 6,
        sourceKey: '',
        sourceText: '',
        userEdited: false,
        order: 1,
      },
      {
        text: 'chips',
        checked: false,
        storeLabel: 'Store A',
        storeId: 10,
        bucketLabel: 'Aisle 2',
        aisleId: 120,
        aisleSortOrder: 2,
        sourceKey: '',
        sourceText: '',
        userEdited: false,
        order: 2,
      },
      {
        text: 'paper towels',
        checked: false,
        storeLabel: '',
        storeId: null,
        bucketLabel: 'Unlisted',
        aisleId: null,
        aisleSortOrder: null,
        sourceKey: '',
        sourceText: '',
        userEdited: false,
        order: 3,
      },
    ],
    'plan rows should seed checklist rows with store and bucket metadata',
  );

  const sourcedDoc = helpers.buildShoppingListDocFromPlanRows([
    { rowType: 'section', text: 'Store A', className: 'shopping-list-section--store' },
    { rowType: 'section', text: 'Produce', className: 'shopping-list-section--aisle' },
    {
      rowType: 'item',
      key: 'foo',
      text: 'foo (1 cup)',
      className: 'shopping-list-group-item',
    },
  ]);

  assertJsonEqual(
    sourcedDoc.rows.map((row) => ({
      text: row.text,
      sourceKey: row.sourceKey,
      sourceText: row.sourceText,
      sourceStoreLabel: row.sourceStoreLabel,
      sourceBucketLabel: row.sourceBucketLabel,
      userEdited: row.userEdited,
    })),
    [
      {
        text: 'foo (1 cup)',
        sourceKey: 'foo',
        sourceText: 'foo (1 cup)',
        sourceStoreLabel: 'Store A',
        sourceBucketLabel: 'Produce',
        userEdited: false,
      },
    ],
    'generated rows should retain stable source metadata for future merges',
  );

  const merged = helpers.mergeShoppingListDocWithGenerated(
    {
      version: 2,
      rows: [
        {
          id: 'foo-row',
          text: 'bar baz qux',
          checked: false,
          storeLabel: 'Store A',
          bucketLabel: 'Produce',
          sourceKey: 'foo',
          sourceText: 'foo (1 cup)',
          sourceStoreLabel: 'Store A',
          sourceBucketLabel: 'Produce',
          userEdited: true,
          order: 0,
        },
        {
          id: 'lime-row',
          text: '2 limes',
          checked: true,
          storeLabel: 'Store A',
          bucketLabel: 'Produce',
          sourceKey: 'lime',
          sourceText: '2 limes',
          sourceStoreLabel: 'Store A',
          sourceBucketLabel: 'Produce',
          userEdited: false,
          order: 1,
        },
      ],
    },
    helpers.buildShoppingListDocFromPlanRows([
      { rowType: 'section', text: 'Store A', className: 'shopping-list-section--store' },
      { rowType: 'section', text: 'Produce', className: 'shopping-list-section--aisle' },
      {
        rowType: 'item',
        key: 'foo',
        text: 'foo (2 cups)',
        className: 'shopping-list-group-item',
      },
      {
        rowType: 'item',
        key: 'lime',
        text: '2 limes',
        className: 'shopping-list-group-item',
      },
    ]),
  );

  assertJsonEqual(
    merged.conflicts,
    [
      {
        kind: 'update',
        rowId: 'foo-row',
        sourceKey: 'foo',
        currentText: 'bar baz qux',
        previousGeneratedText: 'foo (1 cup)',
        nextGeneratedText: 'foo (2 cups)',
        nextGeneratedDisplayText: 'foo (2 cups)',
        nextStoreLabel: 'Store A',
        nextBucketLabel: 'Produce',
        nextStoreId: null,
        nextAisleId: null,
        nextAisleSortOrder: null,
      },
    ],
    'manually edited generated rows should surface a per-line update conflict',
  );

  assertJsonEqual(
    merged.doc.rows.map((row) => ({
      id: row.id,
      text: row.text,
      checked: row.checked,
      sourceKey: row.sourceKey,
      sourceText: row.sourceText,
      userEdited: row.userEdited,
    })),
    [
      {
        id: 'foo-row',
        text: 'bar baz qux',
        checked: false,
        sourceKey: 'foo',
        sourceText: 'foo (1 cup)',
        userEdited: true,
      },
      {
        id: 'lime-row',
        text: '2 limes',
        checked: true,
        sourceKey: 'lime',
        sourceText: '2 limes',
        userEdited: false,
      },
    ],
    'conflicting rows should keep the user version until that specific conflict is resolved',
  );

  assertJsonEqual(
    helpers.resolveShoppingListDocConflict(merged.doc, merged.conflicts[0], 'keep').rows.map((row) => ({
      id: row.id,
      text: row.text,
      sourceKey: row.sourceKey,
      sourceText: row.sourceText,
      userEdited: row.userEdited,
    })),
    [
      {
        id: 'foo-row',
        text: 'bar baz qux',
        sourceKey: 'foo',
        sourceText: 'foo (2 cups)',
        userEdited: true,
      },
      {
        id: 'lime-row',
        text: '2 limes',
        sourceKey: 'lime',
        sourceText: '2 limes',
        userEdited: false,
      },
    ],
    'keeping a manual edit should acknowledge the latest generated source without overwriting the text',
  );

  assertJsonEqual(
    helpers.resolveShoppingListDocConflict(merged.doc, merged.conflicts[0], 'replace').rows.map((row) => ({
      id: row.id,
      text: row.text,
      sourceKey: row.sourceKey,
      sourceText: row.sourceText,
      userEdited: row.userEdited,
    })),
    [
      {
        id: 'foo-row',
        text: 'foo (2 cups)',
        sourceKey: 'foo',
        sourceText: 'foo (2 cups)',
        userEdited: false,
      },
      {
        id: 'lime-row',
        text: '2 limes',
        sourceKey: 'lime',
        sourceText: '2 limes',
        userEdited: false,
      },
    ],
    'replacing a manual edit should apply the new generated text only for that line',
  );

  const removalConflict = helpers.mergeShoppingListDocWithGenerated(
    {
      version: 2,
      rows: [
        {
          id: 'chips-row',
          text: 'party chips',
          checked: false,
          storeLabel: 'Store A',
          bucketLabel: 'Aisle 2',
          sourceKey: 'chips',
          sourceText: 'chips',
          sourceStoreLabel: 'Store A',
          sourceBucketLabel: 'Aisle 2',
          userEdited: true,
          order: 0,
        },
      ],
    },
    helpers.createEmptyShoppingListDoc(),
  );

  assertJsonEqual(
    removalConflict.conflicts,
    [
      {
        kind: 'remove',
        rowId: 'chips-row',
        sourceKey: 'chips',
        currentText: 'party chips',
        previousGeneratedText: 'chips',
        nextGeneratedText: '',
        nextGeneratedDisplayText: '',
        nextStoreLabel: '',
        nextBucketLabel: '',
      },
    ],
    'manual edits should also conflict when their generated source disappears',
  );

  assertJsonEqual(
    helpers.resolveShoppingListDocConflict(removalConflict.doc, removalConflict.conflicts[0], 'keep').rows.map((row) => ({
      id: row.id,
      text: row.text,
      sourceKey: row.sourceKey,
      sourceText: row.sourceText,
    })),
    [
      {
        id: 'chips-row',
        text: 'party chips',
        sourceKey: '',
        sourceText: '',
      },
    ],
    'keeping an edited row after source removal should convert it into a manual-only item',
  );

  assertJsonEqual(
    helpers.resolveShoppingListDocConflict(removalConflict.doc, removalConflict.conflicts[0], 'replace').rows,
    [],
    'accepting a source removal should only delete the affected line',
  );

  const preservedManualEdit = helpers.mergeShoppingListDocWithGenerated(
    {
      version: 2,
      rows: [
        {
          id: 'foo-row',
          text: '1 goo',
          checked: false,
          storeLabel: 'Store A',
          bucketLabel: 'Produce',
          sourceKey: 'foo',
          sourceText: '1 foo',
          sourceStoreLabel: 'Store A',
          sourceBucketLabel: 'Produce',
          userEdited: false,
          order: 0,
        },
        {
          id: 'bar-row',
          text: '1 bar',
          checked: false,
          storeLabel: 'Store A',
          bucketLabel: 'Produce',
          sourceKey: 'bar',
          sourceText: '1 bar',
          sourceStoreLabel: 'Store A',
          sourceBucketLabel: 'Produce',
          userEdited: false,
          order: 1,
        },
      ],
    },
    helpers.buildShoppingListDocFromPlanRows([
      { rowType: 'section', text: 'Store A', className: 'shopping-list-section--store' },
      { rowType: 'section', text: 'Produce', className: 'shopping-list-section--aisle' },
      {
        rowType: 'item',
        key: 'foo',
        text: '1 foo',
        className: 'shopping-list-group-item',
      },
      {
        rowType: 'item',
        key: 'bar',
        text: '2 bar',
        className: 'shopping-list-group-item',
      },
    ]),
  );

  assertJsonEqual(
    preservedManualEdit.conflicts,
    [],
    'unchanged generated rows should not conflict when only a different row changed',
  );

  assertJsonEqual(
    preservedManualEdit.doc.rows.map((row) => ({
      id: row.id,
      text: row.text,
      sourceKey: row.sourceKey,
      sourceText: row.sourceText,
      userEdited: row.userEdited,
    })),
    [
      {
        id: 'foo-row',
        text: '1 goo',
        sourceKey: 'foo',
        sourceText: '1 foo',
        userEdited: true,
      },
      {
        id: 'bar-row',
        text: '2 bar',
        sourceKey: 'bar',
        sourceText: '2 bar',
        userEdited: false,
      },
    ],
    'manual text edits should survive unrelated generated updates while changed source rows refresh',
  );

  const displayRows = helpers.getShoppingListChecklistDisplayRows([
    {
      id: 'a',
      text: '3 avocados',
      checked: false,
      storeLabel: 'Store A',
      bucketLabel: 'Produce',
      aisleId: 110,
      aisleSortOrder: 6,
      sourceKey: 'avocado',
      sourceText: '3 avocados',
      order: 0,
    },
    {
      id: 'b',
      text: '2 limes',
      checked: true,
      storeLabel: 'Store A',
      bucketLabel: 'Produce',
      aisleId: 110,
      aisleSortOrder: 6,
      sourceKey: 'lime',
      sourceText: '2 limes',
      userEdited: true,
      order: 1,
    },
    {
      id: 'c',
      text: 'chips',
      checked: false,
      storeLabel: 'Store A',
      bucketLabel: 'Aisle 2',
      aisleId: 120,
      aisleSortOrder: 2,
      order: 2,
    },
    { id: 'd', text: 'paper towels', checked: true, storeLabel: '', bucketLabel: 'Unlisted', order: 3 },
  ]);

  assertJsonEqual(
    displayRows.map((row) => ({
      rowType: row.rowType,
      text: row.text,
      checked: row.checked || false,
      className: row.className,
    })),
    [
      {
        rowType: 'section',
        text: 'Store A',
        checked: false,
        className: 'shopping-list-section--store',
      },
      {
        rowType: 'section',
        text: 'Aisle 2',
        checked: false,
        className: 'shopping-list-section--aisle',
      },
      {
        rowType: 'item',
        text: 'chips',
        checked: false,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
      {
        rowType: 'section',
        text: 'Produce',
        checked: false,
        className: 'shopping-list-section--aisle',
      },
      {
        rowType: 'item',
        text: '3 avocados',
        checked: false,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
      {
        rowType: 'section',
        text: 'completed',
        checked: false,
        className: 'shopping-list-section--completed',
      },
      {
        rowType: 'item',
        text: '2 limes',
        checked: true,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
      {
        rowType: 'section',
        text: 'Unlisted',
        checked: false,
        className:
          'shopping-list-section--unlisted shopping-list-section--pseudo-unlisted-root',
      },
      {
        rowType: 'section',
        text: 'completed',
        checked: false,
        className: 'shopping-list-section--completed',
      },
      {
        rowType: 'item',
        text: 'paper towels',
        checked: true,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
    ],
    'checked items should move into a completed bucket within each store grouping while aisle sections follow aisle sort order',
  );

  const unlistedLastDisplayRows = helpers.getShoppingListChecklistDisplayRows([
    {
      id: 'unlisted-first',
      text: 'puff pastry',
      checked: false,
      storeLabel: '',
      bucketLabel: 'UNLISTED',
      order: 0,
      sourceKey: 'puff',
      sourceText: 'puff pastry',
    },
    {
      id: 'store-second',
      text: 'basil',
      checked: false,
      storeLabel: '_DEBUG STORE',
      bucketLabel: 'unknown',
      order: 1,
      sourceKey: 'basil',
      sourceText: 'basil',
    },
  ]);

  assertJsonEqual(
    unlistedLastDisplayRows
      .filter(
        (row) =>
          row.rowType === 'section' &&
          (String(row.className || '').includes('shopping-list-section--store') ||
            String(row.className || '').includes('pseudo-unlisted-root')),
      )
      .map((row) => row.text),
    ['_DEBUG STORE', 'Unlisted'],
    'unlisted pseudo-store should render after real stores even when doc row order puts it first',
  );

  const displayRowsKeepCompletedInPlace = helpers.getShoppingListChecklistDisplayRows(
    [
      {
        id: 'a',
        text: '3 avocados',
        checked: false,
        storeLabel: 'Store A',
        bucketLabel: 'Produce',
        aisleId: 110,
        aisleSortOrder: 6,
        sourceKey: 'avocado',
        sourceText: '3 avocados',
        order: 0,
      },
      {
        id: 'b',
        text: '2 limes',
        checked: true,
        storeLabel: 'Store A',
        bucketLabel: 'Produce',
        aisleId: 110,
        aisleSortOrder: 6,
        sourceKey: 'lime',
        sourceText: '2 limes',
        userEdited: true,
        order: 1,
      },
      {
        id: 'c',
        text: 'chips',
        checked: false,
        storeLabel: 'Store A',
        bucketLabel: 'Aisle 2',
        aisleId: 120,
        aisleSortOrder: 2,
        order: 2,
      },
      { id: 'd', text: 'paper towels', checked: true, storeLabel: '', bucketLabel: 'Unlisted', order: 3 },
    ],
    { keepCompletedInPlace: true },
  );

  assertJsonEqual(
    displayRowsKeepCompletedInPlace.map((row) => ({
      rowType: row.rowType,
      text: row.text,
      checked: row.checked || false,
      className: row.className,
    })),
    [
      {
        rowType: 'section',
        text: 'Store A',
        checked: false,
        className: 'shopping-list-section--store',
      },
      {
        rowType: 'section',
        text: 'Aisle 2',
        checked: false,
        className: 'shopping-list-section--aisle',
      },
      {
        rowType: 'item',
        text: 'chips',
        checked: false,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
      {
        rowType: 'section',
        text: 'Produce',
        checked: false,
        className: 'shopping-list-section--aisle',
      },
      {
        rowType: 'item',
        text: '2 limes',
        checked: true,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
      {
        rowType: 'item',
        text: '3 avocados',
        checked: false,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
      {
        rowType: 'section',
        text: 'Unlisted',
        checked: false,
        className:
          'shopping-list-section--unlisted shopping-list-section--pseudo-unlisted-root',
      },
      {
        rowType: 'item',
        text: 'paper towels',
        checked: true,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
    ],
    'keepCompletedInPlace should inline checked rows within store aisles and omit completed sections',
  );

  const sameAisleSortRows = helpers.getShoppingListChecklistDisplayRows([
    {
      id: 'z',
      text: 'zucchini',
      checked: false,
      storeLabel: 'Store A',
      bucketLabel: 'Produce',
      aisleId: 110,
      aisleSortOrder: 6,
      order: 0,
    },
    {
      id: 'a',
      text: 'apples',
      checked: false,
      storeLabel: 'Store A',
      bucketLabel: 'Produce',
      aisleId: 110,
      aisleSortOrder: 6,
      order: 1,
    },
  ]);

  assertJsonEqual(
    sameAisleSortRows
      .filter((row) => row.rowType === 'item')
      .map((row) => row.text),
    ['apples', 'zucchini'],
    'items within the same aisle should sort A-Z by display text',
  );

  assertJsonEqual(
    displayRows
      .filter((row) => row.rowType === 'item')
      .map((row) => ({
        text: row.text,
        sourceKey: row.sourceKey || '',
        sourceText: row.sourceText || '',
        userEdited: !!row.userEdited,
      })),
    [
      {
        text: 'chips',
        sourceKey: '',
        sourceText: '',
        userEdited: false,
      },
      {
        text: '3 avocados',
        sourceKey: 'avocado',
        sourceText: '3 avocados',
        userEdited: false,
      },
      {
        text: '2 limes',
        sourceKey: 'lime',
        sourceText: '2 limes',
        userEdited: true,
      },
      {
        text: 'paper towels',
        sourceKey: '',
        sourceText: '',
        userEdited: false,
      },
    ],
    'display rows should retain source metadata so source-backed items can render links and drilldowns',
  );

  const namedAisleCompletedOnlyRows = helpers.getShoppingListChecklistDisplayRows([
    { id: 'n1', text: 'romaine', checked: true, storeLabel: 'Store A', bucketLabel: 'Produce', order: 0 },
    { id: 'n2', text: 'olive oil', checked: true, storeLabel: 'Store A', bucketLabel: 'Aisle 2', order: 1 },
  ]);

  assertJsonEqual(
    namedAisleCompletedOnlyRows.map((row) => ({
      rowType: row.rowType,
      text: row.text,
      checked: row.checked || false,
      className: row.className,
    })),
    [
      {
        rowType: 'section',
        text: 'Store A',
        checked: false,
        className: 'shopping-list-section--store',
      },
      {
        rowType: 'section',
        text: 'Produce',
        checked: false,
        className: 'shopping-list-section--aisle',
      },
      {
        rowType: 'section',
        text: 'Aisle 2',
        checked: false,
        className: 'shopping-list-section--aisle',
      },
      {
        rowType: 'section',
        text: 'completed',
        checked: false,
        className: 'shopping-list-section--completed',
      },
      {
        rowType: 'item',
        text: 'olive oil',
        checked: true,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
      {
        rowType: 'item',
        text: 'romaine',
        checked: true,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
    ],
    'named aisle headers should remain visible even when all aisle items are completed',
  );

  const storeCollapsed = helpers.filterShoppingListChecklistRowsForCollapse(
    displayRows,
    new Set([helpers.shoppingListStoreCollapseKey('Store A')]),
  );
  assertJsonEqual(
    storeCollapsed.map((row) => ({ rowType: row.rowType, text: row.text })),
    [
      { rowType: 'section', text: 'Store A' },
      { rowType: 'section', text: 'Unlisted' },
      { rowType: 'section', text: 'completed' },
      { rowType: 'item', text: 'paper towels' },
    ],
    'collapsing a named store should hide its aisles/items/completed but not a sibling pseudo-unlisted group',
  );

  const produceAisleCollapsed = helpers.filterShoppingListChecklistRowsForCollapse(
    displayRows,
    new Set([helpers.shoppingListAisleCollapseKey('Store A', 'Produce')]),
  );
  assertJsonEqual(
    produceAisleCollapsed.map((row) => row.text),
    [
      'Store A',
      'Aisle 2',
      'chips',
      'Produce',
      'completed',
      '2 limes',
      'Unlisted',
      'completed',
      'paper towels',
    ],
    'collapsing a single aisle should hide only that aisle active items',
  );

  const pseudoCompletedCollapsed = helpers.filterShoppingListChecklistRowsForCollapse(
    displayRows,
    new Set([helpers.shoppingListCompletedCollapseKey('')]),
  );
  assertJsonEqual(
    pseudoCompletedCollapsed.map((row) => row.text),
    [
      'Store A',
      'Aisle 2',
      'chips',
      'Produce',
      '3 avocados',
      'completed',
      '2 limes',
      'Unlisted',
      'completed',
    ],
    'collapsing pseudo-unlisted completed should hide completed items but keep the completed header',
  );

  const homeDisplayRows = helpers.getShoppingListChecklistDisplayRows(
    [
      {
        id: 'h1',
        text: '3 avocados',
        checked: false,
        storeLabel: 'Store A',
        bucketLabel: 'Produce',
        sourceKey: 'avocado',
        sourceText: '3 avocados',
        order: 0,
      },
      {
        id: 'h2',
        text: '2 limes',
        checked: true,
        storeLabel: 'Store A',
        bucketLabel: 'Produce',
        sourceKey: 'lime',
        sourceText: '2 limes',
        order: 1,
      },
      {
        id: 'h3',
        text: 'paper towels',
        checked: false,
        storeLabel: '',
        bucketLabel: 'Unlisted',
        order: 2,
      },
    ],
    {
      mode: 'home',
      homeLocationBySourceKey: {
        avocado: 'fridge',
        lime: 'fruit stand',
      },
    },
  );

  assertJsonEqual(
    homeDisplayRows.map((row) => ({
      rowType: row.rowType,
      text: row.text,
      checked: !!row.checked,
      className: row.className,
    })),
    [
      {
        rowType: 'section',
        text: 'fridge',
        checked: false,
        className: 'shopping-list-section--store',
      },
      {
        rowType: 'item',
        text: '3 avocados',
        checked: false,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
      {
        rowType: 'section',
        text: 'no location',
        checked: false,
        className: 'shopping-list-section--store',
      },
      {
        rowType: 'item',
        text: 'paper towels',
        checked: false,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
      {
        rowType: 'section',
        text: 'completed',
        checked: false,
        className: 'shopping-list-section--completed',
      },
      {
        rowType: 'item',
        text: '2 limes',
        checked: true,
        className: 'shopping-list-group-item shopping-list-doc-item',
      },
    ],
    'home mode should group active items by normalized home location and keep completed rows in a single trailing section',
  );

  const homeDisplayRowsInPlace = helpers.getShoppingListChecklistDisplayRows(
    [
      {
        id: 'h1',
        text: '3 avocados',
        checked: false,
        storeLabel: 'Store A',
        bucketLabel: 'Produce',
        sourceKey: 'avocado',
        sourceText: '3 avocados',
        order: 0,
      },
      {
        id: 'h2',
        text: '2 limes',
        checked: true,
        storeLabel: 'Store A',
        bucketLabel: 'Produce',
        sourceKey: 'lime',
        sourceText: '2 limes',
        order: 1,
      },
      {
        id: 'h3',
        text: 'paper towels',
        checked: false,
        storeLabel: '',
        bucketLabel: 'Unlisted',
        order: 2,
      },
    ],
    {
      mode: 'home',
      homeLocationBySourceKey: {
        avocado: 'fridge',
        lime: 'fruit stand',
      },
      keepCompletedInPlace: true,
    },
  );

  assertJsonEqual(
    homeDisplayRowsInPlace.map((row) => ({ rowType: row.rowType, text: row.text })),
    [
      { rowType: 'section', text: 'fridge' },
      { rowType: 'item', text: '3 avocados' },
      { rowType: 'section', text: 'fruit stand' },
      { rowType: 'item', text: '2 limes' },
      { rowType: 'section', text: 'no location' },
      { rowType: 'item', text: 'paper towels' },
    ],
    'home mode keepCompletedInPlace should place checked rows into their home sections without a trailing completed bucket',
  );

  const fridgeCollapsed = helpers.filterShoppingListChecklistRowsForCollapse(
    homeDisplayRows,
    new Set([helpers.shoppingListHomeCollapseKey('fridge')]),
  );
  assertJsonEqual(
    fridgeCollapsed.map((row) => row.text),
    ['fridge', 'no location', 'paper towels', 'completed', '2 limes'],
    'collapsing a home section should hide only that home bucket items',
  );

  const storeSearchRows = helpers.getShoppingListChecklistDisplayRows(
    [
      {
        id: 's1',
        text: 'foo (1)',
        checked: false,
        storeLabel: 'Store 1',
        bucketLabel: 'Aisle 1',
        aisleId: 1,
        aisleSortOrder: 1,
        order: 0,
      },
      {
        id: 's2',
        text: 'bar (1)',
        checked: false,
        storeLabel: 'Store 1',
        bucketLabel: 'Aisle 1',
        aisleId: 1,
        aisleSortOrder: 1,
        order: 1,
      },
      {
        id: 's3',
        text: 'baz qux (1)',
        checked: false,
        storeLabel: 'Store 1',
        bucketLabel: 'Aisle 2',
        aisleId: 2,
        aisleSortOrder: 2,
        order: 2,
      },
    ],
    {
      mode: 'stores',
      searchQuery: 'f',
    },
  );

  assertJsonEqual(
    storeSearchRows.map((row) => row.text),
    ['Store 1', 'Aisle 1', 'foo (1)'],
    'stores mode search should keep only matching items and prune empty aisles and stores',
  );

  const homeSearchRows = helpers.getShoppingListChecklistDisplayRows(
    [
      {
        id: 'hs1',
        text: 'foo (1)',
        checked: false,
        storeLabel: 'Store 1',
        bucketLabel: 'Aisle 1',
        sourceKey: 'foo',
        sourceText: 'foo (1)',
        order: 0,
      },
      {
        id: 'hs2',
        text: 'bar (1)',
        checked: false,
        storeLabel: 'Store 1',
        bucketLabel: 'Aisle 1',
        sourceKey: 'bar',
        sourceText: 'bar (1)',
        order: 1,
      },
      {
        id: 'hs3',
        text: 'frozen peas (1)',
        checked: true,
        storeLabel: 'Store 1',
        bucketLabel: 'Aisle 2',
        sourceKey: 'peas',
        sourceText: 'frozen peas (1)',
        order: 2,
      },
    ],
    {
      mode: 'home',
      searchQuery: 'fo',
      homeLocationBySourceKey: {
        foo: 'fridge',
        bar: 'pantry',
        peas: 'freezer',
      },
    },
  );

  assertJsonEqual(
    homeSearchRows.map((row) => row.text),
    ['fridge', 'foo (1)'],
    'home mode search should work against the active home grouping and prune empty sections including completed',
  );

  const variantSourceSep = '\u001e';
  const variantHomeRows = helpers.getShoppingListChecklistDisplayRows(
    [
      {
        id: 'vh1',
        text: 'foo (bar)',
        checked: false,
        storeLabel: '',
        bucketLabel: 'Unlisted',
        sourceKey: `foo${variantSourceSep}bar`,
        sourceText: 'foo (bar)',
        order: 0,
      },
    ],
    {
      mode: 'home',
      homeLocationBySourceKey: {
        [`foo${variantSourceSep}bar`]: 'none',
        foo: 'fridge',
      },
    },
  );

  assertJsonEqual(
    variantHomeRows.map((row) => ({ rowType: row.rowType, text: row.text })),
    [
      { rowType: 'section', text: 'fridge' },
      { rowType: 'item', text: 'foo (bar)' },
    ],
    'variant list lines should inherit the base ingredient home when the variant row has no home location',
  );

  const sep = '\u001e';
  assertJsonEqual(
    helpers.getShoppingListHomeLocationIdForRow(
      { sourceKey: `bun${sep}brioche` },
      { [`bun${sep}brioche`]: 'none' },
    ),
    'none',
    'home resolver needs the base key in the lookup map when the variant home is none (production map must merge baseNameKeys)',
  );
  assertJsonEqual(
    helpers.getShoppingListHomeLocationIdForRow(
      { sourceKey: `bun${sep}brioche` },
      { [`bun${sep}brioche`]: 'none', bun: 'fridge' },
    ),
    'fridge',
    'variant lines should resolve to the base home once the lookup map includes the base ingredient key',
  );

  const clipboardRows = [
    {
      id: '1',
      text: 'Bananas (n)',
      checked: false,
      storeLabel: 'Safeway',
      bucketLabel: 'nuts & dried fruit',
      aisleId: 6,
      aisleSortOrder: 6,
      order: 0,
    },
    {
      id: '2',
      text: 'Cilantro (n)',
      checked: false,
      storeLabel: 'Safeway',
      bucketLabel: 'nuts & dried fruit',
      aisleId: 6,
      aisleSortOrder: 6,
      order: 1,
    },
    {
      id: '3',
      text: 'Greek yogurt (n)',
      checked: false,
      storeLabel: 'Safeway',
      bucketLabel: 'dairy',
      aisleId: 2,
      aisleSortOrder: 2,
      order: 2,
    },
    {
      id: '4',
      text: 'Already done',
      checked: true,
      storeLabel: 'Safeway',
      bucketLabel: 'dairy',
      aisleId: 2,
      aisleSortOrder: 2,
      order: 3,
    },
    {
      id: '5',
      text: 'baby spinach',
      checked: false,
      storeLabel: 'whole foods',
      bucketLabel: 'produce',
      aisleId: 1,
      aisleSortOrder: 1,
      order: 4,
    },
  ];
  const plainText = helpers.formatShoppingListPlainText(clipboardRows);
  assertJsonEqual(
    plainText,
    [
      'SAFEWAY',
      'Dairy',
      '- Greek yogurt (n)',
      'Nuts & Dried Fruit',
      '- Bananas (n)',
      '- Cilantro (n)',
      '',
      'WHOLE FOODS',
      'Produce',
      '- baby spinach',
    ].join('\n'),
    'plain text formatter should use uppercase stores, title-case aisles, and preserve item casing',
  );

  const htmlText = helpers.formatShoppingListHtml(clipboardRows);
  const expectedHtmlFragments = [
    '<p>SAFEWAY</p>',
    '<p>Dairy</p>',
    '<li>Greek yogurt (n)</li>',
    '<p>Nuts &amp; Dried Fruit</p>',
    '<li>Bananas (n)</li>',
    '<li>Cilantro (n)</li>',
    '<p>WHOLE FOODS</p>',
    '<p>Produce</p>',
    '<li>baby spinach</li>',
  ];
  expectedHtmlFragments.forEach((fragment) => {
    if (!htmlText.includes(fragment)) {
      throw new Error(`Expected html clipboard output to include "${fragment}".`);
    }
  });
  if (htmlText.includes('Already done')) {
    throw new Error('html clipboard formatter should omit checked items.');
  }
  if (htmlText.indexOf('SAFEWAY') > htmlText.indexOf('WHOLE FOODS')) {
    throw new Error('html clipboard formatter should keep store ordering stable.');
  }

  const exportPayload = helpers.buildShoppingListExportPayload(clipboardRows, {
    title: 'Weekly Shopping',
  });
  assertJsonEqual(
    exportPayload,
    {
      title: 'Weekly Shopping',
      stores: [
        {
          label: 'SAFEWAY',
          aisles: [
            {
              label: 'Dairy',
              items: ['Greek yogurt (n)'],
            },
            {
              label: 'Nuts & Dried Fruit',
              items: ['Bananas (n)', 'Cilantro (n)'],
            },
          ],
        },
        {
          label: 'WHOLE FOODS',
          aisles: [
            {
              label: 'Produce',
              items: ['baby spinach'],
            },
          ],
        },
      ],
    },
    'export payload should preserve grouping and exclude checked items',
  );

  const generatedForDiscard = helpers.buildShoppingListDocFromPlanRows([
    { rowType: 'section', text: 'Store A', className: 'shopping-list-section--store' },
    { rowType: 'section', text: 'Produce', className: 'shopping-list-section--aisle' },
    {
      rowType: 'item',
      key: 'lime',
      text: '2 limes',
      className: 'shopping-list-group-item',
    },
  ]);
  const generatedLimeRow = generatedForDiscard.rows.find(
    (row) => String(row?.sourceKey || '') === 'lime',
  );
  if (!generatedLimeRow) {
    throw new Error('discard test setup: expected generated lime row');
  }

  const checkedOnlyCurrent = helpers.normalizeShoppingListDoc({
    version: 2,
    rows: [
      {
        ...generatedLimeRow,
        id: 'lime-row',
        checked: true,
        order: 0,
      },
    ],
  });
  if (
    !helpers.isShoppingListDiscardChangesNoOp(
      checkedOnlyCurrent,
      generatedForDiscard,
    )
  ) {
    throw new Error(
      'checked-only diff should not count as discardable quantity changes',
    );
  }

  const editedCurrent = helpers.normalizeShoppingListDoc({
    version: 2,
    rows: [
      {
        ...generatedLimeRow,
        id: 'lime-row',
        text: '5 limes',
        checked: true,
        userEdited: true,
        order: 0,
      },
    ],
  });
  if (
    helpers.isShoppingListDiscardChangesNoOp(editedCurrent, generatedForDiscard)
  ) {
    throw new Error('text override should count as discardable quantity changes');
  }

  const afterDiscard = helpers.applyShoppingListDiscardQuantityChanges(
    editedCurrent,
    generatedForDiscard,
  );
  assertJsonEqual(
    afterDiscard.rows.map((row) => ({
      id: row.id,
      text: row.text,
      checked: row.checked,
      sourceKey: row.sourceKey,
      userEdited: row.userEdited,
    })),
    [
      {
        id: 'lime-row',
        text: '2 limes',
        checked: true,
        sourceKey: 'lime',
        userEdited: false,
      },
    ],
    'discard should revert text but preserve checked state',
  );

  const removedDisplayRows = helpers.getShoppingListChecklistDisplayRows([
    {
      id: 'active',
      text: 'milk',
      checked: false,
      storeLabel: 'Store A',
      bucketLabel: 'Dairy',
      order: 0,
    },
    {
      id: 'removed-checked',
      text: 'eggs',
      checked: true,
      storeLabel: helpers.SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL,
      restoreStoreLabel: 'Store A',
      restoreBucketLabel: 'Dairy',
      order: 1,
    },
    {
      id: 'removed-unchecked',
      text: 'bread',
      checked: false,
      storeLabel: helpers.SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL,
      restoreStoreLabel: 'Store B',
      restoreBucketLabel: 'Bakery',
      order: 2,
    },
  ]);

  assertJsonEqual(
    removedDisplayRows
      .filter(
        (row) =>
          row.rowType === 'section' &&
          (String(row.className || '').includes('shopping-list-section--store') ||
            String(row.className || '').includes('pseudo-removed-root')),
      )
      .map((row) => row.text),
    ['Store A', 'Removed'],
    'removed pseudo-store section should render last after active stores',
  );

  const removedItemsById = Object.fromEntries(
    removedDisplayRows
      .filter((row) => row.rowType === 'item')
      .map((row) => [row.id, row]),
  );
  if (removedItemsById.active?.checked !== false) {
    throw new Error('active row should stay unchecked in store section');
  }
  if (removedItemsById['removed-checked']?.listRemoved !== true) {
    throw new Error('removed-checked row should be marked listRemoved');
  }
  if (removedItemsById['removed-checked']?.checked !== true) {
    throw new Error('removed-checked row should keep checked state');
  }
  if (removedItemsById['removed-unchecked']?.listRemoved !== true) {
    throw new Error('removed-unchecked row should be marked listRemoved');
  }

  const restoredDoc = helpers.normalizeShoppingListDoc({
    rows: [
      {
        id: 'r1',
        text: 'spinach',
        checked: true,
        storeLabel: helpers.SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL,
        restoreStoreLabel: 'Store A',
        restoreBucketLabel: 'Produce',
        restoreStoreId: 10,
        order: 0,
      },
    ],
  });
  const restoredRow = helpers.applyShoppingListRowListRestore({
    ...restoredDoc.rows[0],
  });
  assertJsonEqual(
    {
      storeLabel: restoredRow.storeLabel,
      bucketLabel: restoredRow.bucketLabel,
      storeId: restoredRow.storeId,
      checked: restoredRow.checked,
    },
    {
      storeLabel: 'Store A',
      bucketLabel: 'Produce',
      storeId: 10,
      checked: true,
    },
    'restore should return placement and preserve checked state',
  );

  assertJsonEqual(
    helpers.isReservedShoppingListStoreName('Removed'),
    true,
    'reserved store name should match case-insensitively',
  );
  assertJsonEqual(
    helpers.isReservedShoppingListStoreName('remove'),
    false,
    'remove without d should not be reserved',
  );

  const mergedRemoved = helpers.mergeShoppingListDocWithGenerated(
    helpers.normalizeShoppingListDoc({
      rows: [
        {
          id: 'k1',
          text: '2 milk',
          checked: false,
          storeLabel: helpers.SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL,
          restoreStoreLabel: 'Store A',
          restoreBucketLabel: 'Dairy',
          sourceKey: 'milk',
          sourceText: '2 milk',
          sourceStoreLabel: 'Store A',
          sourceBucketLabel: 'Dairy',
          order: 0,
        },
      ],
    }),
    helpers.normalizeShoppingListDoc({
      rows: [
        {
          id: 'g1',
          text: '3 milk',
          checked: false,
          storeLabel: 'Store B',
          bucketLabel: 'Cold',
          sourceKey: 'milk',
          sourceText: '3 milk',
          sourceStoreLabel: 'Store B',
          sourceBucketLabel: 'Cold',
          order: 0,
        },
      ],
    }),
  );
  assertJsonEqual(
    mergedRemoved.doc.rows[0].storeLabel,
    helpers.SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL,
    'merge should keep list-removed placement when generated store changes',
  );
  assertJsonEqual(
    mergedRemoved.doc.rows[0].text,
    '3 milk',
    'merge should still adopt regenerated text for list-removed rows',
  );

  console.log('Shopping list checklist tests passed.');
}

run();
