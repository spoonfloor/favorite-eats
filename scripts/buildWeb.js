#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'dist', 'web');

const ROOT_DIRECTORIES_TO_COPY = ['assets', 'css', 'fragments', 'js', 'icons'];
const ROOT_FILES_TO_COPY = new Set(['manifest.json']);
const PWA_ARTIFACT_PATHS = [
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-512.png',
  'icons/splash-1179x2556.png',
];
const WEB_BUILD_CONFIG_SOURCE = `window.__FAVORITE_EATS_BUILD__ = Object.freeze({
  target: 'web',
  plannerExperience: false,
  allowHiddenPlannerModeToggle: true,
});

`;

function readSplashSkipVerifyFromEnv() {
  const raw = String(process.env.SPLASH_SKIP_VERIFY || '').trim();
  return raw === '1' || /^true$/i.test(raw);
}

function splashGateBuildPreamble() {
  const skip = readSplashSkipVerifyFromEnv();
  return `window.__FAVORITE_EATS_SPLASH_SKIP_VERIFY__ = ${skip ? 'true' : 'false'};\n`;
}

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

    const ext = path.extname(entry).toLowerCase();
    if (ext !== '.html' && !ROOT_FILES_TO_COPY.has(entry)) continue;
    copyRecursive(sourcePath, destinationPath);
  }

  for (const relativePath of PWA_ARTIFACT_PATHS) {
    const builtPath = path.join(outputRoot, relativePath);
    if (!fs.existsSync(builtPath)) {
      throw new Error(`Web build incomplete: missing PWA artifact ${relativePath}`);
    }
  }

  const builtMainPath = path.join(outputRoot, 'js', 'main.js');
  const mainSource = fs.readFileSync(builtMainPath, 'utf8');
  fs.writeFileSync(builtMainPath, `${WEB_BUILD_CONFIG_SOURCE}${mainSource}`, 'utf8');

  const builtChromeBootPath = path.join(outputRoot, 'js', 'chromeBoot.js');
  if (fs.existsSync(builtChromeBootPath)) {
    const chromeBootSource = fs.readFileSync(builtChromeBootPath, 'utf8');
    fs.writeFileSync(
      builtChromeBootPath,
      `${WEB_BUILD_CONFIG_SOURCE}${chromeBootSource}`,
      'utf8',
    );
  }

  const builtFirstPaintPath = path.join(outputRoot, 'js', 'firstPaintAppBar.js');
  if (fs.existsSync(builtFirstPaintPath)) {
    const firstPaintSource = fs.readFileSync(builtFirstPaintPath, 'utf8');
    fs.writeFileSync(
      builtFirstPaintPath,
      `${WEB_BUILD_CONFIG_SOURCE}${firstPaintSource}`,
      'utf8',
    );
  }

  const builtSplashGatePath = path.join(outputRoot, 'js', 'splashGate.js');
  const splashGateSource = fs.readFileSync(builtSplashGatePath, 'utf8');
  fs.writeFileSync(builtSplashGatePath, `${splashGateBuildPreamble()}${splashGateSource}`, 'utf8');

  console.log(`Web build ready at ${outputRoot}`);
}

buildWeb();
