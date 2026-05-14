#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const recipeEditorPath = path.join(projectRoot, 'js', 'recipeEditor.js');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    );
  }
}

function assertIncludes(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(`${message}: missing ${JSON.stringify(needle)}`);
  }
}

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not extract planner-placeholder snippet from recipeEditor.js.');
  }
  return source.slice(start, end);
}

function loadAppendPlannerPlaceholder(source, document) {
  const snippet = extractSnippet(
    source,
    "const DEFAULT_STEP_PLACEHOLDER_TEXT = 'Add a step.';",
    '\ntry {\n  window.isRecipeEditorStepPromptDisplayText = isRecipeEditorStepPromptDisplayText;',
  );
  const context = {
    window: {},
    document,
    ensureStepTextNotEmpty() {},
  };
  vm.createContext(context);
  vm.runInContext(snippet, context, { filename: 'recipeEditor.planner-placeholder-snippet.js' });
  if (typeof context.appendPlannerInstructionsEmptyPlaceholderRow !== 'function') {
    throw new Error('appendPlannerInstructionsEmptyPlaceholderRow was not defined by snippet.');
  }
  return context.appendPlannerInstructionsEmptyPlaceholderRow;
}

function createMinimalDom() {
  function makeEl(tag) {
    const el = {
      tagName: tag,
      className: '',
      textContent: '',
      dataset: {},
      children: [],
      appendChild(child) {
        el.children.push(child);
      },
    };
    return el;
  }
  return {
    createElement(tag) {
      return makeEl(tag);
    },
  };
}

function assertSourceContracts(source) {
  const matches = source.match(/appendPlannerInstructionsEmptyPlaceholderRow\(stepsSection\)/g);
  assertEqual(
    matches ? matches.length : 0,
    4,
    'definition plus three renderRecipe call sites must stay aligned',
  );

  assertIncludes(
    source,
    'text.dataset.placeholder = WEB_MODE_NO_INSTRUCTIONS_HINT',
    'planner empty row must use the shared web-mode hint constant',
  );

  const emptyMsgMatches = source.match(/No instructions found\./g);
  assertEqual(
    emptyMsgMatches ? emptyMsgMatches.length : 0,
    2,
    'non-planner empty state copy should remain exactly twice',
  );

  assertIncludes(
    source,
    [
      '    if (totalSteps === 0) {',
      '      if (plannerMode) {',
      '        appendPlannerInstructionsEmptyPlaceholderRow(stepsSection);',
    ].join('\n'),
    'sectioned-steps zero total branch must prefer planner placeholder',
  );

  assertIncludes(
    source,
    [
      '    if (stepNodes.length === 0) {',
      '      if (plannerMode) {',
      '        appendPlannerInstructionsEmptyPlaceholderRow(stepsSection);',
      '      }',
      '      return;',
    ].join('\n'),
    'empty StepNode list in planner mode must append placeholder row',
  );

  assertIncludes(
    source,
    [
      '  } else {',
      '    if (plannerMode) {',
      '      appendPlannerInstructionsEmptyPlaceholderRow(stepsSection);',
      '    } else {',
    ].join('\n'),
    'final no-steps branch must gate empty-state on planner mode',
  );
}

function run() {
  const source = fs.readFileSync(recipeEditorPath, 'utf8');
  assertSourceContracts(source);

  const document = createMinimalDom();
  const appendPlannerInstructionsEmptyPlaceholderRow = loadAppendPlannerPlaceholder(source, document);

  const stepsSection = document.createElement('div');
  appendPlannerInstructionsEmptyPlaceholderRow(stepsSection);

  assertEqual(stepsSection.children.length, 1, 'stepsSection receives one row');
  const line = stepsSection.children[0];
  assertIncludes(line.className, 'instruction-line', 'row wrapper');
  assertIncludes(line.className, 'instruction-line--placeholder', 'row uses placeholder styling');
  assertEqual(line.dataset.stepId, 'planner-instructions-empty', 'synthetic row id');
  assertEqual(line.dataset.stepType, 'step', 'synthetic row type');

  assertEqual(line.children.length, 2, 'number span + text span');
  const num = line.children[0];
  const text = line.children[1];
  assertIncludes(num.className, 'step-num', 'numbered prefix span');
  assertEqual(num.textContent, '1.', 'first displayed step index');

  assertIncludes(text.className, 'step-text', 'body span');
  assertIncludes(text.className, 'placeholder-prompt', 'placeholder styling hook');
  assertEqual(text.dataset.placeholder, 'Use the Force.', 'copy matches WEB_MODE hint');
  assertEqual(text.textContent, '', 'placeholder body stays empty for CSS ::before prompt');

  console.log('Planner instructions empty-row tests passed.');
}

run();
