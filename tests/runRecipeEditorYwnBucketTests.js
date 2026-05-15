#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(projectRoot, 'js', 'recipeEditor.js'),
  'utf8',
);

function extractSnippet(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    );
  }
}

async function run() {
  const context = {
    console,
    window: {
      parseNumericQuantityValue(value) {
        const raw = String(value == null ? '' : value).trim();
        const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
        if (fraction) return Number(fraction[1]) / Number(fraction[2]);
        return Number(raw);
      },
      decimalToFractionDisplay(value) {
        const n = Number(value);
        if (Math.abs(n - 0.5) < 1e-9) return '½';
        return Number.isFinite(n) ? String(Number(n.toFixed(4))) : '';
      },
      getIngredientDisplayCoreParts(line) {
        const quantity = Number(line?.quantity);
        const quantityText =
          Math.abs(quantity - 0.5) < 1e-9
            ? '½'
            : Number.isFinite(quantity)
              ? String(Number(quantity.toFixed(4)))
              : '';
        return {
          leadText: [quantityText, String(line?.unit || '').trim()]
            .filter(Boolean)
            .join(' '),
          nameText: [String(line?.variant || '').trim(), String(line?.name || '').trim()]
            .filter(Boolean)
            .join(' '),
        };
      },
      favoriteEatsQuantityDisplayPolicy: {
        convertIngredientQuantityToMeasuredBase(quantity, unit) {
          if (String(unit || '').trim().toLowerCase() !== 'cup') return null;
          return {
            family: 'volume',
            baseQuantity: Number(quantity),
            canonicalUnit: 'cup',
          };
        },
        getMeasuredDisplayFromBase(family, baseQuantity) {
          if (family !== 'volume') return null;
          return {
            family: 'volume',
            quantity: Number(baseQuantity),
            unit: 'cup',
          };
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    [
      extractSnippet(
        '// --- You Will Need helpers ---',
        'function isRecipePlannerModeActive()',
      ),
      extractSnippet('function resolveYwnMergeNameKey', 'function mergeByIngredient(list)'),
    ].join('\n'),
    context,
    { filename: 'recipeEditor.ywn-bucket-snippet.js' },
  );

  const rows = await context.mergeByIngredientAsync([
    { name: 'bar', quantity: '', unit: '', locationAtHome: 'pantry' },
    { name: 'bar', quantity: 1, unit: '', locationAtHome: 'pantry' },
    { name: 'bar', quantity: 0.5, unit: 'cup', locationAtHome: 'pantry' },
  ]);

  assertEqual(rows.length, 1, 'matching YWN ingredient rows merge to one bucket row');
  assertEqual(
    context.formatNeedLine(rows[0]),
    'bar (some + 1 + ½ cup)',
    'YWN mixed amount rows use shopping-list-style bucket detail text',
  );

  console.log('Recipe editor YWN bucket tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
