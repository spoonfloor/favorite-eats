#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'dist', 'web');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readBuiltFile(relativePath) {
  return fs.readFileSync(path.join(outputRoot, relativePath), 'utf8');
}

function run() {
  childProcess.execFileSync(process.execPath, [path.join(projectRoot, 'scripts', 'buildWeb.js')], {
    cwd: projectRoot,
    stdio: 'pipe',
  });

  const builtMain = readBuiltFile(path.join('js', 'main.js'));
  assert(
    builtMain.includes("window.__FAVORITE_EATS_BUILD__ = Object.freeze({"),
    'Web build should inject the public build config into dist/web/js/main.js.',
  );
  assert(
    builtMain.includes("target: 'web'"),
    'Web build config should target the web artifact.',
  );
  assert(
    builtMain.includes('plannerExperience: false'),
    'Web build config should keep both planning and editing modes available.',
  );
  assert(
    builtMain.includes('allowHiddenPlannerModeToggle: true'),
    'Web build config should keep the hidden planner-mode toggle available.',
  );

  const builtChromeBoot = readBuiltFile(path.join('js', 'chromeBoot.js'));
  assert(
    builtChromeBoot.includes("window.__FAVORITE_EATS_BUILD__ = Object.freeze({"),
    'Web build should inject the public build config into dist/web/js/chromeBoot.js.',
  );
  assert(
    builtChromeBoot.includes("target: 'web'"),
    'Web build config should be prepended to chromeBoot.js for head-time planner lock.',
  );

  const builtFirstPaint = readBuiltFile(path.join('js', 'firstPaintAppBar.js'));
  assert(
    builtFirstPaint.includes("window.__FAVORITE_EATS_BUILD__ = Object.freeze({"),
    'Web build should inject the public build config into dist/web/js/firstPaintAppBar.js.',
  );
  assert(
    builtFirstPaint.includes("target: 'web'"),
    'Web build config should be prepended to firstPaintAppBar.js.',
  );

  const tagsPage = readBuiltFile('tags.html');
  assert(
    !tagsPage.includes('http-equiv="refresh"'),
    'tags.html should ship as a full page in the web build.',
  );

  const indexPage = readBuiltFile('index.html');
  assert(
    !indexPage.includes('http-equiv="refresh"'),
    'index.html should ship as a full page in the web build.',
  );
  assert(
    indexPage.includes('id="splashGateForm"'),
    'index.html should keep the splash gate markup from local web dev.',
  );
  assert(
    indexPage.includes('js/splashGate.js'),
    'index.html should keep the same scripts as local web dev.',
  );

  const builtSplashGate = readBuiltFile(path.join('js', 'splashGate.js'));
  assert(
    builtSplashGate.includes('window.__FAVORITE_EATS_SPLASH_SKIP_VERIFY__ = false'),
    'Default web build should require splash password (skip flag false).',
  );

  const recipeEditorBuilt = readBuiltFile('recipeEditor.html');
  assert(
    recipeEditorBuilt.includes('data-page="recipe-editor"') &&
      recipeEditorBuilt.includes('js/main.js'),
    'recipeEditor.html should ship the full editor page in the web build (recipe opens from recipes list).',
  );
  assert(
    !recipeEditorBuilt.includes('http-equiv="refresh"'),
    'recipeEditor.html should not be a redirect stub in the web build.',
  );

  const shoppingEditorPage = readBuiltFile('shoppingEditor.html');
  assert(
    !shoppingEditorPage.includes('http-equiv="refresh"'),
    'shoppingEditor.html should ship as a full page in the web build.',
  );

  assert(
    !fs.existsSync(path.join(outputRoot, 'electronMain.js')),
    'Web build should not copy the legacy desktop shell entry point.',
  );

  assert(
    !recipeEditorBuilt.includes('sqliteBlobCache.js'),
    'Web build HTML should not load the removed sqlite blob cache script.',
  );
  assert(
    !builtMain.includes('ensureSqlJsReady') &&
      !builtMain.includes('SQL_JS_CDN_BASE') &&
      !builtMain.includes('openFavoriteEatsDbForCurrentRuntime'),
    'Web build main.js should not include browser sql.js bootstrap.',
  );

  assert(
    !fs.existsSync(path.join(outputRoot, 'assets', 'favorite_eats.db')),
    'Web build should not include the legacy bundled database file.',
  );

  console.log('Web build tests passed.');
}

run();
