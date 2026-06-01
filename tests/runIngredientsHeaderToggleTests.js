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
    ingredientsHeaderActionsVisibleFromState,
    ingredientsHeaderClickTransitionFromState,
  } = loadHelpers();

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
    'Hover suppressed: actions hidden',
  );
  assert(
    ingredientsHeaderActionsVisibleFromState({ pinnedOpen: true }) === true,
    'Pinned open: actions visible',
  );

  assertDeepEqual(
    ingredientsHeaderClickTransitionFromState({ hovering: true }),
    { pinnedOpen: false, hoverSuppressed: true },
    'Click during hover preview dismisses to Manage',
  );
  assertDeepEqual(
    ingredientsHeaderClickTransitionFromState(),
    { pinnedOpen: true, hoverSuppressed: true },
    'Click at rest pins actions open',
  );
  assertDeepEqual(
    ingredientsHeaderClickTransitionFromState({ pinnedOpen: true, hovering: true }),
    { pinnedOpen: false, hoverSuppressed: true },
    'Click while pinned closes to Manage',
  );

  assert(
    ingredientsHeaderActionsVisibleFromState({
      ...ingredientsHeaderClickTransitionFromState({ hovering: true }),
      hovering: true,
    }) === false,
    'After hover-preview click, actions hidden while still hovering',
  );

  console.log('runIngredientsHeaderToggleTests: ok');
}

run();
