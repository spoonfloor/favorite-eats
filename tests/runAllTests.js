#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const testsDir = __dirname;
const projectRoot = path.resolve(testsDir, '..');

const files = fs
  .readdirSync(testsDir)
  .filter(
    (name) =>
      name.startsWith('run') &&
      name.endsWith('.js') &&
      name !== 'runAllTests.js',
  )
  .sort();

for (const name of files) {
  const rel = path.join('tests', name);
  console.log(`\n--- ${rel} ---\n`);
  execFileSync(process.execPath, [path.join(testsDir, name)], {
    stdio: 'inherit',
    cwd: projectRoot,
  });
}

console.log(`\nAll ${files.length} test file(s) passed.`);
