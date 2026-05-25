#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(projectRoot, 'js', 'main.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  mainSource.includes("['recipes', 'shopping', 'stores', 'shopping-list', 'sync-lab']"),
  'Planner-mode top-level nav should include Sync Lab.',
);
assert(
  mainSource.includes("['recipes', 'shopping', 'stores', 'tags', 'sizes', 'units', 'sync-lab']"),
  'Editor-mode top-level nav should include Sync Lab.',
);
assert(
  mainSource.includes("if (key === 'sync-lab') return 'syncLab.html';"),
  'Sync Lab nav key should route to syncLab.html.',
);
assert(
  mainSource.includes("'sync-lab': 'Sync Lab'"),
  'Bottom nav labels should include Sync Lab.',
);

console.log('sync lab navigation tests passed.');
