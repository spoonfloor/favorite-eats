#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'dist', 'web');

const ROOT_DIRECTORIES_TO_COPY = ['assets', 'css', 'fragments', 'js'];
const WEB_BUILD_CONFIG_SOURCE = `window.__FAVORITE_EATS_BUILD__ = Object.freeze({
  target: 'web',
  forceWebExperience: false,
  allowHiddenForceWebModeToggle: true,
});

`;

function copyRecursive(sourcePath, destinationPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(path.join(sourcePath, entry), path.join(destinationPath, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function buildWeb() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  for (const entry of fs.readdirSync(projectRoot)) {
    const sourcePath = path.join(projectRoot, entry);
    const destinationPath = path.join(outputRoot, entry);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      if (!ROOT_DIRECTORIES_TO_COPY.includes(entry)) continue;
      copyRecursive(sourcePath, destinationPath);
      continue;
    }

    if (path.extname(entry).toLowerCase() !== '.html') continue;
    copyRecursive(sourcePath, destinationPath);
  }

  const builtMainPath = path.join(outputRoot, 'js', 'main.js');
  const mainSource = fs.readFileSync(builtMainPath, 'utf8');
  fs.writeFileSync(builtMainPath, `${WEB_BUILD_CONFIG_SOURCE}${mainSource}`, 'utf8');

  console.log(`Web build ready at ${outputRoot}`);
}

buildWeb();
