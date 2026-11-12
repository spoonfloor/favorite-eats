#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const planSessionPath = path.join(projectRoot, 'js', 'favoriteEatsPlanSession.js');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');
const planSessionJs = fs.readFileSync(planSessionPath, 'utf8');
const utilsJs = fs.readFileSync(utilsPath, 'utf8');

function loadPlanSession() {
  const storage = new Map();
  const fakeWindow = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout,
    clearTimeout,
  };
  const context = vm.createContext({
    window: fakeWindow,
    console,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(planSessionJs, context, { filename: planSessionPath });
  return fakeWindow.favoriteEatsPlanSession;
}

const planSession = loadPlanSession();
assert(planSession, 'favoriteEatsPlanSession should load.');
const fmt = planSession.formatDefaultSessionName;

// Week of 9–15 Nov 2026: Mon 9 … Sun 15.
const cases = [
  [new Date(2026, 10, 9, 8, 0), 'Week of 9 November'], // Monday → same day
  [new Date(2026, 10, 10, 8, 0), 'Week of 16 November'], // Tuesday → next Monday
  [new Date(2026, 10, 12, 23, 59), 'Week of 16 November'], // Thursday late
  [new Date(2026, 10, 14, 8, 0), 'Week of 16 November'], // Saturday
  [new Date(2026, 10, 15, 8, 0), 'Week of 16 November'], // Sunday
  [new Date(2026, 11, 29, 8, 0), 'Week of 4 January'], // Tue → crosses year
  [new Date(2026, 1, 25, 8, 0), 'Week of 2 March'], // Wed → crosses month
];
for (const [date, expected] of cases) {
  assert.strictEqual(fmt(date), expected, `${date.toDateString()} → ${expected}`);
}
const input = new Date(2026, 10, 12, 8, 0);
const before = input.getTime();
fmt(input);
assert.strictEqual(input.getTime(), before, 'formatDefaultSessionName must not mutate its input.');

// Save dialog wiring: empty field with the default as a hint, no selection,
// Tab accepts the hint, × clears, empty save uses the hint.
assert(
  /promptSessionName[\s\S]*selectOnOpen: false[\s\S]*tabAcceptsPlaceholder: true[\s\S]*clearable: true/.test(
    planSessionJs,
  ),
  'Save-plan prompt should opt into no-select, Tab-accept, and clear button.',
);
assert(
  /const normalizeName = \(v\) => String\(v \|\| ''\)\.trim\(\) \|\| placeholder;/.test(
    planSessionJs,
  ),
  'Saving with an empty name should fall back to the hint name.',
);
assert(
  /let initialValue = saveAs \? activeName \+ ' \(copy\)' : '';/.test(planSessionJs),
  'A new plan should open with an empty field, not a prefilled default.',
);

// Shared dialog support.
assert(
  utilsJs.includes('tabAcceptInputs.has(e.target)') &&
    /input\.value = input\.placeholder;/.test(utilsJs),
  'Dialog should fill an empty field with its placeholder on Tab.',
);
assert(
  /if \(selectFirstInputOnOpen\) \{[\s\S]*firstInput\.select\(\)/.test(utilsJs),
  'Dialog should only select the first input when selectOnOpen is not false.',
);
assert(
  utilsJs.includes("clearBtn.className = 'ui-dialog-input-clear'") &&
    utilsJs.includes('clearBtn.hidden = !input.value'),
  'Clearable fields should show a × button only while they have text.',
);

console.log('runPlanSessionNamePromptTests: ok');
