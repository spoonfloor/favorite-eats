#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const typeaheadPath = path.join(projectRoot, 'js', 'typeahead.js');

function loadTypeaheadSnippet(startMarker, endMarker, exportName, filename) {
  const source = fs.readFileSync(typeaheadPath, 'utf8');
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not locate ${startMarker} in typeahead.js`);
  }

  const snippet = source.slice(start, end + endMarker.length);
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(snippet, context, { filename });

  const helpers = context.window[exportName];
  if (!helpers) throw new Error(`${exportName} not found on window.`);
  return helpers;
}

function loadKeyboardHelpers() {
  return loadTypeaheadSnippet(
    '// --- Typeahead keyboard helpers (tests extract this block) ---',
    '// --- End typeahead keyboard helpers ---',
    '__typeaheadKeyboardHelpers',
    'typeahead.keyboard-helpers.js'
  );
}

function loadMultilineContextHelper() {
  const source = fs.readFileSync(typeaheadPath, 'utf8');
  const start = source.indexOf('function vSlice(s, a, b)');
  const end = source.indexOf('function attachMultilineIngredientLineTypeahead');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not locate buildMultilineLineTypeaheadContext in typeahead.js');
  }
  const snippet =
    source.slice(start, end) +
    '\nwindow.__typeaheadMultilineContext = { buildMultilineLineTypeaheadContext };';
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(snippet, context, {
    filename: 'typeahead.multiline-context.js',
  });
  const helper = context.window.__typeaheadMultilineContext;
  if (!helper || typeof helper.buildMultilineLineTypeaheadContext !== 'function') {
    throw new Error('buildMultilineLineTypeaheadContext helper not found on window.');
  }
  return helper.buildMultilineLineTypeaheadContext;
}

function loadFilterHelpers() {
  const source = fs.readFileSync(typeaheadPath, 'utf8');
  const textHelpersStart = source.indexOf('const norm = (s)');
  const endMarker = 'function filterAndRankPreservePoolOrderOnEmpty';
  const filterStart = source.indexOf('function filterAndRank(pool, query)');
  const end = source.indexOf(endMarker, filterStart);
  if (textHelpersStart === -1 || filterStart === -1 || end === -1 || end <= filterStart) {
    throw new Error('Could not locate filterAndRank in typeahead.js');
  }
  const snippet =
    source.slice(textHelpersStart, end) +
    '\nwindow.__typeaheadFilterHelpers = { filterAndRank };';
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(snippet, context, {
    filename: 'typeahead.filter-helpers.js',
  });
  const helpers = context.window.__typeaheadFilterHelpers;
  if (!helpers || typeof helpers.filterAndRank !== 'function') {
    throw new Error('filterAndRank helper not found on window.');
  }
  return helpers;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const helpers = loadKeyboardHelpers();
  const { filterAndRank } = loadFilterHelpers();

  assert(
    helpers.shouldPreserveTextareaShiftEnter(
      { tagName: 'TEXTAREA' },
      { key: 'Enter', shiftKey: true }
    ) === true,
    'Shift+Enter on a textarea should preserve the native newline behavior.'
  );

  assert(
    helpers.shouldPreserveTextareaShiftEnter(
      { tagName: 'TEXTAREA' },
      { key: 'Enter', shiftKey: false }
    ) === false,
    'Plain Enter on a textarea should still be handled by the typeahead.'
  );

  assert(
    helpers.shouldPreserveTextareaShiftEnter(
      { tagName: 'INPUT' },
      { key: 'Enter', shiftKey: true }
    ) === false,
    'Shift+Enter on a single-line input should not opt out of typeahead handling.'
  );

  assert(
    helpers.shouldPreserveTextareaShiftEnter(
      { tagName: 'TEXTAREA' },
      { key: 'Tab', shiftKey: true }
    ) === false,
    'Non-Enter keys should never trigger the textarea newline preservation rule.'
  );

  const jamMatches = filterAndRank(['Jam', 'Jalapeño', 'bread'], 'jam');
  assert(
    jamMatches.length === 1 && jamMatches[0] === 'Jam',
    'Full query "jam" should still return the exact pool match.'
  );

  const jaMatches = filterAndRank(['Jam', 'Jalapeño', 'bread'], 'ja');
  assert(
    jaMatches.includes('Jam') && jaMatches.includes('Jalapeño'),
    'Partial query "ja" should return all substring matches.'
  );

  const buildMultilineLineTypeaheadContext = loadMultilineContextHelper();
  const ctxFor = (line, caret) => {
    const textarea = {
      value: line,
      selectionStart: caret,
      selectionEnd: caret,
    };
    return buildMultilineLineTypeaheadContext(textarea, {});
  };

  const noSpaceCtx = ctxFor('foo(bar,baz', 11);
  assert(
    noSpaceCtx.mode === 'variant' && noSpaceCtx.query === 'baz',
    'Variant type-along query should include the second token without a space after the comma.'
  );

  const withSpaceCtx = ctxFor('foo(bar, baz', 12);
  assert(
    withSpaceCtx.mode === 'variant' && withSpaceCtx.query === 'baz',
    'Variant type-along query should include the second token when there is a space after the comma.'
  );

  const caretBeforeTypedTailCtx = ctxFor('foo(bar, baz', 8);
  assert(
    caretBeforeTypedTailCtx.mode === 'variant' &&
      caretBeforeTypedTailCtx.query === 'baz',
    'Caret before a spaced variant tail should still filter using the in-progress token after the comma.'
  );

  console.log('Typeahead keyboard tests passed.');
}

run();
