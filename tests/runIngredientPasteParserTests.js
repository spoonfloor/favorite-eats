#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const parserPath = path.join(projectRoot, 'js', 'ingredientPasteParser.js');
const fixturesPath = path.join(__dirname, 'ingredientPasteParser.fixtures.json');

function loadParser() {
  const parserSource = fs.readFileSync(parserPath, 'utf8');
  const context = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(parserSource, context, { filename: 'ingredientPasteParser.js' });
  if (
    typeof context.window.parseIngredientLine !== 'function' ||
    typeof context.window.parseIngredientLines !== 'function' ||
    typeof context.window.createIngredientPasteUnitRegistry !== 'function'
  ) {
    throw new Error('Ingredient parser functions were not attached to window.');
  }
  return {
    parseIngredientLine: context.window.parseIngredientLine,
    parseIngredientLines: context.window.parseIngredientLines,
    createIngredientPasteUnitRegistry:
      context.window.createIngredientPasteUnitRegistry,
  };
}

function buildParseOptions(fixture, createIngredientPasteUnitRegistry) {
  const rawUnits = fixture && Array.isArray(fixture.units) ? fixture.units : [];
  if (!rawUnits.length) return undefined;
  const catalogUnits = rawUnits.map((entry) => {
    if (entry && typeof entry === 'object') return entry;
    return { code: String(entry || '').trim() };
  });
  return {
    unitRegistry: createIngredientPasteUnitRegistry(catalogUnits),
  };
}

function assertEqual(actual, expected, key, line) {
  if (actual !== expected) {
    throw new Error(
      `Expected "${key}" to be ${JSON.stringify(expected)} but got ${JSON.stringify(
        actual
      )} for line: ${JSON.stringify(line)}`
    );
  }
}

function assertContains(actual, expectedSnippet, key, line) {
  const hay = String(actual || '');
  if (!hay.toLowerCase().includes(String(expectedSnippet).toLowerCase())) {
    throw new Error(
      `Expected "${key}" to contain ${JSON.stringify(
        expectedSnippet
      )} but got ${JSON.stringify(actual)} for line: ${JSON.stringify(line)}`
    );
  }
}

function run() {
  const { parseIngredientLine, parseIngredientLines, createIngredientPasteUnitRegistry } =
    loadParser();
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  let passed = 0;
  const failures = [];

  fixtures.forEach((fixture, index) => {
    const line = fixture && fixture.line;
    const expect = (fixture && fixture.expect) || {};
    const parseOptions = buildParseOptions(fixture, createIngredientPasteUnitRegistry);
    try {
      const parsed = parseIngredientLine(line, parseOptions);
      if (!parsed) {
        throw new Error(`Parser returned null for line: ${JSON.stringify(line)}`);
      }

      Object.keys(expect).forEach((key) => {
        const expectedValue = expect[key];
        if (key === 'nameContains') {
          assertContains(parsed.name, expectedValue, key, line);
          return;
        }
        if (key === 'prepNotesContains') {
          assertContains(parsed.prepNotes, expectedValue, key, line);
          return;
        }
        if (key === 'sizeContains') {
          assertContains(parsed.size, expectedValue, key, line);
          return;
        }
        assertEqual(parsed[key], expectedValue, key, line);
      });

      passed += 1;
    } catch (err) {
      failures.push({
        index,
        line,
        error: err && err.message ? err.message : String(err),
      });
    }
  });

  const multilineFixtures = [
    {
      line: '1 large or 2 small diced carrots',
      expectLength: 2,
      expect: [
        { quantityMin: 1, quantityMax: 1, name: 'carrot', size: 'large', prepNotesContains: 'diced' },
        {
          quantityMin: 2,
          quantityMax: 2,
          name: 'carrot',
          size: 'small',
          prepNotesContains: 'diced',
          isAlt: true,
        },
      ],
    },
    {
      line: '1/4 large or 1/2 small purple cabbage, diced',
      expectLength: 2,
      expect: [
        {
          quantityMin: 0.25,
          quantityMax: 0.25,
          name: 'cabbage',
          variant: 'purple',
          size: 'large',
          prepNotesContains: 'diced',
        },
        {
          quantityMin: 0.5,
          quantityMax: 0.5,
          name: 'cabbage',
          variant: 'purple',
          size: 'small',
          prepNotesContains: 'diced',
          isAlt: true,
        },
      ],
    },
    {
      line: '½  cup tamari or soy sauce',
      expectLength: 2,
      expect: [
        {
          quantityMin: 0.5,
          quantityMax: 0.5,
          unit: 'cup',
          name: 'tamari',
        },
        {
          quantityMin: 0.5,
          quantityMax: 0.5,
          unit: 'cup',
          name: 'soy sauce',
          isAlt: true,
        },
      ],
    },
    {
      line: '1 cup tamari or 2 tbsp soy sauce',
      expectLength: 2,
      expect: [
        { quantityMin: 1, quantityMax: 1, unit: 'cup', name: 'tamari' },
        { quantityMin: 2, quantityMax: 2, unit: 'tbsp', name: 'soy sauce', isAlt: true },
      ],
    },
  ];

  multilineFixtures.forEach((fixture, index) => {
    const line = fixture.line;
    try {
      const parsedRows = parseIngredientLines(line);
      assertEqual(parsedRows.length, fixture.expectLength, 'rowCount', line);
      fixture.expect.forEach((rowExpect, rowIndex) => {
        const row = parsedRows[rowIndex];
        if (!row) {
          throw new Error(`Missing parsed row ${rowIndex} for line: ${JSON.stringify(line)}`);
        }
        Object.keys(rowExpect).forEach((key) => {
          const expectedValue = rowExpect[key];
          if (key === 'prepNotesContains') {
            assertContains(row.prepNotes, expectedValue, key, line);
            return;
          }
          assertEqual(row[key], expectedValue, key, line);
        });
      });
      passed += 1;
    } catch (err) {
      failures.push({
        index: fixtures.length + index,
        line,
        error: err && err.message ? err.message : String(err),
      });
    }
  });

  const total = fixtures.length + multilineFixtures.length;

  if (failures.length) {
    console.error(
      `Ingredient parser tests failed: ${failures.length} failed, ${passed} passed.`
    );
    failures.forEach((f) => {
      console.error(`- [${f.index}] ${f.line}`);
      console.error(`  ${f.error}`);
    });
    process.exit(1);
  }

  console.log(`Ingredient parser tests passed: ${passed}/${total}.`);
}

run();
