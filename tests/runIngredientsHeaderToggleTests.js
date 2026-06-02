#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const recipeEditorPath = path.join(projectRoot, 'js', 'recipeEditor.js');

function loadHelpers() {
  const source = fs.readFileSync(recipeEditorPath, 'utf8');
  const startMarker =
    '// --- Ingredients header toggle helpers (tests extract this block) ---';
  const endMarker = '// --- End ingredients header toggle helpers ---';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      'Could not locate ingredients header toggle helper block in recipeEditor.js',
    );
  }
  const snippet = source.slice(start, end + endMarker.length);
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(snippet, context, {
    filename: 'recipeEditor.ingredients-header-toggle-helpers.js',
  });
  const helpers = context.window.__ingredientsHeaderToggleHelpers;
  if (!helpers) throw new Error('Helper export not found on window.');
  return helpers;
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`,
  );
}

function run() {
  const {
    INGREDIENTS_HEADER_PIN_TIMEOUT_MS,
    ingredientsHeaderActionsVisibleFromState,
    ingredientsHeaderClickTransitionFromState,
  } = loadHelpers();

  assert(
    INGREDIENTS_HEADER_PIN_TIMEOUT_MS === 2750,
    'Pin timeout is 2750ms',
  );

  assert(
    ingredientsHeaderActionsVisibleFromState() === false,
    'Resting Manage: actions hidden',
  );
  assert(
    ingredientsHeaderActionsVisibleFromState({ hovering: true }) === true,
    'Hover preview: actions visible',
  );
  assert(
    ingredientsHeaderActionsVisibleFromState({
      hovering: true,
      hoverSuppressed: true,
    }) === false,
    'Hover suppressed: actions hidden while pointer still over row',
  );
  assert(
    ingredientsHeaderActionsVisibleFromState({ pinnedOpen: true }) === true,
    'Pinned open: actions visible',
  );
  assert(
    ingredientsHeaderActionsVisibleFromState({
      pinnedOpen: true,
      hovering: false,
    }) === true,
    'Pinned without hover: actions visible',
  );

  assertDeepEqual(
    ingredientsHeaderClickTransitionFromState({ hovering: true }),
    { pinnedOpen: true, hoverSuppressed: false },
    'Click during hover preview pins actions open',
  );
  assertDeepEqual(
    ingredientsHeaderClickTransitionFromState(),
    { pinnedOpen: true, hoverSuppressed: false },
    'Click at rest pins actions open',
  );
  assertDeepEqual(
    ingredientsHeaderClickTransitionFromState({ pinnedOpen: true, hovering: true }),
    { pinnedOpen: false, hoverSuppressed: true },
    'Click while pinned unpins and suppresses hover preview',
  );

  assert(
    ingredientsHeaderActionsVisibleFromState({
      ...ingredientsHeaderClickTransitionFromState({ hovering: true }),
      hovering: true,
    }) === true,
    'After hover-preview click, actions stay visible while still hovering',
  );

  let hovering = true;
  let pinnedOpen = false;
  let hoverSuppressed = false;

  ({ pinnedOpen, hoverSuppressed } = ingredientsHeaderClickTransitionFromState({
    pinnedOpen,
  }));
  assert(
    ingredientsHeaderActionsVisibleFromState({
      pinnedOpen,
      hovering,
      hoverSuppressed,
    }) === true,
    'Hover then first click: actions stay visible (pinned)',
  );

  ({ pinnedOpen, hoverSuppressed } = ingredientsHeaderClickTransitionFromState({
    pinnedOpen,
  }));
  assert(
    ingredientsHeaderActionsVisibleFromState({
      pinnedOpen,
      hovering,
      hoverSuppressed,
    }) === false,
    'Hover then second click: Manage (unpinned, hover suppressed)',
  );

  hovering = false;
  hoverSuppressed = false;
  assert(
    ingredientsHeaderActionsVisibleFromState({
      pinnedOpen,
      hovering,
      hoverSuppressed,
    }) === false,
    'After mouseleave: Manage at rest',
  );

  hovering = true;
  assert(
    ingredientsHeaderActionsVisibleFromState({
      pinnedOpen,
      hovering,
      hoverSuppressed,
    }) === true,
    'After mouseleave then hover again: actions preview',
  );

  console.log('runIngredientsHeaderToggleTests: ok');
}

run();
