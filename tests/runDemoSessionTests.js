#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const demoSessionPath = path.join(projectRoot, 'js', 'demoSession.js');
const mainPath = path.join(projectRoot, 'js', 'main.js');
const splashGatePath = path.join(projectRoot, 'js', 'splashGate.js');
const edgeFnPath = path.join(
  projectRoot,
  'supabase',
  'functions',
  'verify-splash-password',
  'index.ts',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadDemoSessionHarness() {
  const source = fs.readFileSync(demoSessionPath, 'utf8');
  const storage = new Map();
  const context = {
    window: {},
    sessionStorage: {
      getItem(key) {
        return storage.has(String(key)) ? storage.get(String(key)) : null;
      },
      setItem(key, value) {
        storage.set(String(key), String(value));
      },
      removeItem(key) {
        storage.delete(String(key));
      },
    },
    localStorage: {
      getItem(key) {
        return storage.has(`ls:${key}`) ? storage.get(`ls:${key}`) : null;
      },
      setItem(key, value) {
        storage.set(`ls:${key}`, String(value));
      },
      removeItem(key) {
        storage.delete(`ls:${key}`);
      },
    },
    crypto: { randomUUID: () => 'demo-test-uuid' },
    console,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'demoSession.js' });
  return context;
}

function run() {
  const edgeFn = fs.readFileSync(edgeFnPath, 'utf8');
  assert(
    edgeFn.includes('SPLASH_DEMO_PASSWORD_HASH'),
    'Edge function should read SPLASH_DEMO_PASSWORD_HASH.',
  );
  assert(
    edgeFn.includes("mode: 'demo'"),
    'Edge function should return demo mode.',
  );
  assert(
    edgeFn.includes("mode: 'full'"),
    'Edge function should return full mode.',
  );

  const splashGate = fs.readFileSync(splashGatePath, 'utf8');
  assert(
    splashGate.includes('favoriteEatsCompleteWelcomeFrontDoorForMode'),
    'Splash gate should complete welcome using session mode.',
  );
  assert(
    splashGate.includes('resolveSplashLoginMode'),
    'Splash gate should resolve demo password locally when verify is skipped.',
  );

  const main = fs.readFileSync(mainPath, 'utf8');
  assert(
    main.includes('function isDemoSessionActive()'),
    'main.js should expose demo session detection.',
  );
  assert(
    main.includes('if (isDemoSessionActive()) return false;'),
    'Remote shopping state should be disabled in demo sessions.',
  );
  assert(
    main.includes('function resolveShoppingPlanStorageKey()'),
    'main.js should resolve demo-specific shopping plan storage keys.',
  );

  const harness = loadDemoSessionHarness();
  assert(
    harness.favoriteEatsResolveSplashLoginMode('demo', true) === 'demo',
    'Skip-verify dev flow should treat demo password as demo mode.',
  );
  assert(
    harness.favoriteEatsResolveSplashLoginMode('secret', true) === 'full',
    'Skip-verify dev flow should treat other passwords as full mode.',
  );

  harness.favoriteEatsApplyWelcomeSessionForMode('demo');
  assert(harness.favoriteEatsIsDemoSession(), 'Demo welcome should set demo session.');
  assert(
    harness.favoriteEatsGetShoppingPlanStorageKey() ===
      'favoriteEats:demo:shopping-plan:v1',
    'Demo session should use namespaced plan storage key.',
  );
  assert(
    harness.favoriteEatsIsCatalogWriteBlocked(),
    'Demo session should block catalog writes.',
  );

  harness.favoriteEatsApplyWelcomeSessionForMode('full');
  assert(!harness.favoriteEatsIsDemoSession(), 'Full welcome should clear demo mode.');
  assert(
    harness.favoriteEatsGetShoppingPlanStorageKey() ===
      'favoriteEats:shopping-plan:v1',
    'Full session should use standard plan storage key.',
  );

  assert(
    main.includes('if (!shouldUseRemoteShoppingState()) {\n          return { ok: true, updated_at: null };\n        }\n        return sendPlanRecipeRootQuantityRpc(op);'),
    'Recipe root quantity queue should skip remote flush in demo mode.',
  );

  const recipesPage = fs.readFileSync(
    path.join(projectRoot, 'js', 'screens', 'recipesPage.js'),
    'utf8',
  );
  assert(
    recipesPage.includes('shouldUseRemoteShoppingState() &&'),
    'Recipes page should gate narrow plan RPCs on remote shopping state.',
  );

  assert(
    main.includes('async function ensureIngredientLemmaMaintenanceInMain(db) {\n  if (isDemoSessionActive()) return 0;'),
    'Lemma maintenance should no-op in demo mode.',
  );

  console.log('runDemoSessionTests: ok');
}

run();
