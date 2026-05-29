#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const session = fs.readFileSync(
  path.join(projectRoot, 'js/favoriteEatsDocumentSession.js'),
  'utf8',
);
const recipeEditor = fs.readFileSync(
  path.join(projectRoot, 'js/recipeEditor.js'),
  'utf8',
);
const recipeEditorPage = fs.readFileSync(
  path.join(projectRoot, 'js/screens/recipeEditorPage.js'),
  'utf8',
);
const main = fs.readFileSync(path.join(projectRoot, 'js/main.js'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'recipeEditor.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), `${message}: missing ${JSON.stringify(needle)}`);
}

assertIncludes(session, 'createRecipeSession', 'document session exposes recipe factory');
assertIncludes(session, 'beginDeferPaint', 'document session supports deferred paint');
assertIncludes(session, 'commitPaint', 'document session supports commit paint');
assertIncludes(session, 'applyCatalogVariantPurgedPatch', 'document session supports catalog purge patch');
assertIncludes(session, 'stashCatalogVariantPurgedPatch', 'document session stashes pending purges');

assertIncludes(recipeEditor, 'skipDocumentSessionQueue', 'ingredients rerender can bypass session queue');
assertIncludes(recipeEditor, 'syncYouWillNeed', 'ingredients rerender can skip YWN tail');

assertIncludes(recipeEditorPage, 'createRecipeSession', 'recipe editor page creates document session');
assertIncludes(recipeEditorPage, 'beginDeferPaint', 'save defers paints through document session');
assertIncludes(recipeEditorPage, 'commitPaint', 'save commits one paint through document session');

assertIncludes(main, 'tryApplyOpenRecipeEditorCatalogPatches', 'catalog refresh applies variant purge patches');
assertIncludes(main, 'catalogVariantPurged', 'catalog refresh carries variant purge payload');

assertIncludes(html, 'favoriteEatsDocumentSession.js', 'recipe editor loads document session module');

console.log('Document session architecture tests passed.');
