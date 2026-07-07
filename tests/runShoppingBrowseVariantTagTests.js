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
    '// --- Shopping browse labeling helpers (tests extract this block) ---',
    '// --- End shopping browse labeling helpers ---',
  );
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(snippet, context, {
    filename: 'main.shopping-browse-variant-tag-helpers.js',
  });
  const helpers = context.window.__shoppingBrowseLabelHelpers;
  if (!helpers) throw new Error('Shopping browse helpers were not attached to window.');
  return helpers;
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

const helpers = loadHelpers();
const {
  getShoppingBrowseVariantsMatchingTagKeys,
  shoppingBrowseItemHasExplicitVariantTagMatch,
} = helpers;

const alicorn = {
  name: 'alicorn',
  variants: ['fresh', 'dried'],
  tags: ['annual'],
  variantTagsByName: {
    fresh: ['annual'],
    dried: ['annual'],
  },
};

assertEqual(
  getShoppingBrowseVariantsMatchingTagKeys(alicorn, ['annual']),
  ['fresh', 'dried'],
  'alicorn annual should add tagged named variants only',
);
assertEqual(
  shoppingBrowseItemHasExplicitVariantTagMatch(alicorn, ['annual']),
  true,
  'alicorn should match annual tag filter candidacy',
);
assertEqual(
  getShoppingBrowseVariantsMatchingTagKeys(alicorn, ['monthly']),
  [],
  'alicorn should not match unrelated tag',
);

const basil = {
  name: 'basil',
  variants: ['dried', 'fresh'],
  tags: ['weekly', 'monthly'],
  variantTagsByName: {
    default: ['weekly'],
    dried: ['weekly'],
    fresh: ['monthly'],
  },
};

assertEqual(
  getShoppingBrowseVariantsMatchingTagKeys(basil, ['weekly']),
  ['default', 'dried'],
  'weekly should add base and dried basil only',
);
assertEqual(
  getShoppingBrowseVariantsMatchingTagKeys(basil, ['monthly']),
  ['fresh'],
  'monthly should add fresh basil only',
);
assertEqual(
  getShoppingBrowseVariantsMatchingTagKeys(basil, ['weekly', 'monthly']),
  ['default', 'dried', 'fresh'],
  'multiple tags should OR across variants',
);

const partialOverlap = {
  name: 'basil',
  variants: ['dried', 'fresh'],
  tags: ['weekly', 'monthly'],
  variantTagsByName: {
    default: ['weekly'],
    dried: ['weekly'],
    fresh: ['monthly'],
  },
};

assertEqual(
  getShoppingBrowseVariantsMatchingTagKeys(partialOverlap, ['weekly']),
  ['default', 'dried'],
  'partial tag selection should still include all weekly rows',
);

const cannedOnly = {
  name: 'tomato',
  variants: ['canned'],
  tags: ['emergency'],
  variantTagsByName: {
    canned: ['emergency'],
  },
};

assertEqual(
  getShoppingBrowseVariantsMatchingTagKeys(cannedOnly, ['emergency']),
  ['canned'],
  'named-only tag should not add untagged base',
);

const legacyUnionOnly = {
  name: 'salt',
  variants: [],
  tags: ['pantry'],
};

assertEqual(
  getShoppingBrowseVariantsMatchingTagKeys(legacyUnionOnly, ['pantry']),
  ['default'],
  'legacy union-only rows should still add base for simple items',
);

console.log('runShoppingBrowseVariantTagTests: all assertions passed.');
