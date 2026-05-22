#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const typeaheadPath = path.join(projectRoot, 'js', 'typeahead.js');
const parserPath = path.join(projectRoot, 'js', 'ingredientPasteParser.js');

function loadMultilineBlurHelpers() {
  const source = fs.readFileSync(typeaheadPath, 'utf8');
  const start = source.indexOf('function getParsedNameFromIngredientLine(lineText)');
  const end = source.indexOf('async function normalizeMultilineIngredientTextareaNamesOnBlur');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not locate multiline blur helpers in typeahead.js');
  }

  const preamble = `
const normalizationExemptions = new Set();
window._typeaheadNormalizationExemptions = normalizationExemptions;
const norm = (s) => (s || '').toString().trim();
const lower = (s) => norm(s).toLowerCase();
`;

  const snippet = `${preamble}${source.slice(start, end)}
window.__typeaheadMultilineBlurHelpers = {
  replaceNameInIngredientLine,
  getParsedNameFromIngredientLine,
  canonicalizeMultilineIngredientLineText,
};`;

  const context = {
    window: {},
    console,
  };
  vm.createContext(context);
  vm.runInContext(snippet, context, {
    filename: 'typeahead.multiline-blur-helpers.js',
  });

  const parserSource = fs.readFileSync(parserPath, 'utf8');
  vm.runInContext(parserSource, context, {
    filename: 'ingredientPasteParser.js',
  });

  const helpers = context.window.__typeaheadMultilineBlurHelpers;
  if (
    !helpers ||
    typeof helpers.replaceNameInIngredientLine !== 'function' ||
    typeof helpers.canonicalizeMultilineIngredientLineText !== 'function'
  ) {
    throw new Error('Multiline blur helpers were not attached to window.');
  }
  return helpers;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const {
    replaceNameInIngredientLine,
    canonicalizeMultilineIngredientLineText,
  } = loadMultilineBlurHelpers();

  assert(
    replaceNameInIngredientLine('1 cup bar', 'foo') === '1 cup foo',
    'replaceNameInIngredientLine should swap parsed name while preserving qty/unit.',
  );

  assert(
    replaceNameInIngredientLine('bar', 'foo') === 'foo',
    'replaceNameInIngredientLine should replace a bare ingredient name.',
  );

  const resolveBarToFoo = async (name) =>
    String(name || '').trim().toLowerCase() === 'bar' ? 'foo' : String(name || '').trim();

  assert(
    (await canonicalizeMultilineIngredientLineText('1 cup bar', {
      resolveCanonicalName: resolveBarToFoo,
    })) === '1 cup foo',
    'Blur canonicalization should rewrite synonym aka to catalog name in a parsed line.',
  );

  assert(
    (await canonicalizeMultilineIngredientLineText('1 cup foo', {
      resolveCanonicalName: resolveBarToFoo,
    })) === '1 cup foo',
    'Blur canonicalization should leave already-canonical lines unchanged.',
  );

  console.log('Typeahead multiline blur tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
