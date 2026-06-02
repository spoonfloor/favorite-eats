#!/usr/bin/env node
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const probeScript = path.join(projectRoot, 'scripts', 'probe-unknown-items-suggestion-pill.mjs');

console.log('Unknown-items dialog dismiss regression (Playwright probe)\n');
execFileSync(process.execPath, [probeScript], {
  stdio: 'inherit',
  cwd: projectRoot,
});
console.log('\nrunUnknownItemsDialogDismissTests: ok');
