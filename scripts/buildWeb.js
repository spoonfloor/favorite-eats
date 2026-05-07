#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'dist', 'web');

const ROOT_DIRECTORIES_TO_COPY = ['assets', 'css', 'fragments', 'js'];
const REDIRECT_PAGE_TARGETS = Object.freeze({
  'dialog-gallery.html': 'recipes.html',
  'shoppingEditor.html': 'shopping.html',
  'sizeEditor.html': 'recipes.html',
  'sizes.html': 'recipes.html',
  'storeEditor.html': 'stores.html',
  'tagEditor.html': 'recipes.html',
  'tags.html': 'recipes.html',
  'unitEditor.html': 'recipes.html',
  'units.html': 'recipes.html',
});
const WEB_BUILD_CONFIG_SOURCE = `window.__FAVORITE_EATS_BUILD__ = Object.freeze({
  target: 'web',
  forceWebExperience: true,
  allowHiddenForceWebModeToggle: false,
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

function writeRedirectPage(filePath, redirectTarget) {
  const label = redirectTarget.replace(/\.html$/i, '');
  fs.writeFileSync(
    filePath,
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="refresh" content="0; url=${redirectTarget}" />
    <title>Redirecting…</title>
  </head>
  <body>
    <p>Redirecting to <a href="${redirectTarget}">${label}</a>…</p>
  </body>
</html>
`,
    'utf8',
  );
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

  for (const [entry, redirectTarget] of Object.entries(REDIRECT_PAGE_TARGETS)) {
    writeRedirectPage(path.join(outputRoot, entry), redirectTarget);
  }

  console.log(`Web build ready at ${outputRoot}`);
}

buildWeb();
