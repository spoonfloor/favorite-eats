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
  return source.slice(start, end);
}

function loadKit() {
  const source = fs.readFileSync(mainPath, 'utf8');
  const snippet = extractSnippet(
    source,
    'function splitShoppingListRowTextToLabelAndDetail(text) {',
    'function joinShoppingListLabelAndDetail(label, detail) {',
  );
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(
    `${snippet}
if (typeof window !== 'undefined') {
  window.__listRowLabelKit = {
    splitShoppingListRowTextToLabelAndDetail,
    splitFoldedListRowLabel,
    formatListRowDetailParenthetical,
    applySplitListRowLabelPair,
  };
}`,
    context,
    { filename: 'listRowLabelKit.test-snippet.js' },
  );
  const kit = context.window.__listRowLabelKit;
  if (!kit) throw new Error('list row label kit was not attached to window.');
  return kit;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual:   ${actual}`);
  }
}

function run() {
  const kit = loadKit();

  assertEqual(
    kit.formatListRowDetailParenthetical('oat'),
    '(oat)',
    'detail parenthetical wrapper',
  );
  assertEqual(
    kit.formatListRowDetailParenthetical(''),
    '',
    'empty detail stays empty',
  );

  assertEqual(
    kit.splitFoldedListRowLabel('mushrooms (a, b)', 'mushrooms').label,
    'mushrooms',
    'folded split keeps base label',
  );
  assertEqual(
    kit.splitFoldedListRowLabel('mushrooms (a, b)', 'mushrooms').detail,
    'a, b',
    'folded split keeps inner detail',
  );

  assertEqual(
    kit.splitFoldedListRowLabel('Milk (oat)', 'Milk').detail,
    'oat',
    'filter hint uses known base name',
  );

  const primary = { textContent: '', style: { display: '' } };
  const detail = { textContent: '', style: { display: '' } };
  const wrap = {
    classList: {
      _set: new Set(),
      add(cls) {
        this._set.add(cls);
      },
      remove(cls) {
        this._set.delete(cls);
      },
      toggle(cls, on) {
        if (on) this.add(cls);
        else this.remove(cls);
      },
    },
  };
  primary.closest = () => wrap;

  kit.applySplitListRowLabelPair(
    primary,
    detail,
    'mushrooms (foo, bar)',
    'mushrooms',
  );
  assertEqual(primary.textContent, 'mushrooms', 'apply keeps full item name');
  assertEqual(detail.textContent, '(foo, bar)', 'apply keeps detail in parens');
  assertEqual(detail.style.display, '', 'detail visible when present');
}

run();
