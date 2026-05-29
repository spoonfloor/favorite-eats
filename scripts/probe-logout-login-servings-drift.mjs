#!/usr/bin/env node
/**
 * Confirm diagnosis: after add-to-plan + logout/login, sessionStorage store
 * lacks servingsOverride while Supabase selected_recipes still has servings_override.
 */
import { chromium } from 'playwright';

const SUPABASE_URL = 'https://ysesmbcvxmaymtsqeipc.supabase.co';
const ANON = 'sb_publishable_gIYjmWOjcHtg5RRLbw8yLQ_AGWYQH2E';
const BASE = process.env.PERF_BASE_URL || 'http://127.0.0.1:8000';
const RECIPE_ID = 216;
const RECIPE_TITLE = 'Basic Pasta';
const TARGET_SERVINGS = 5;

function initScript() {
  sessionStorage.setItem(
    'favoriteEatsSplashAccess',
    JSON.stringify({ grantedAt: Date.now(), expiresAt: Date.now() + 86400000 }),
  );
  sessionStorage.setItem('favoriteEats.sessionLoginAllowed', '1');
  localStorage.setItem('favoriteEatsPlannerModeOn', '1');
}

async function fetchServerRecipeRow() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/selected_recipes?recipe_id=eq.${RECIPE_ID}&select=recipe_id,title,quantity,servings_override,updated_at`,
    {
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'Accept-Profile': 'plan',
      },
    },
  );
  const rows = await res.json();
  return rows[0] || null;
}

async function fetchLoadShoppingStatePlanRecipe() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/load_shopping_state`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'catalog',
      'Content-Profile': 'catalog',
    },
    body: JSON.stringify({}),
  });
  const state = await res.json();
  const roots = state?.plan?.recipeSelectionRoots || {};
  const merged = state?.plan?.recipeSelections || {};
  const key = String(RECIPE_ID);
  return {
    planUpdatedAt: state?.planUpdatedAt || null,
    root: roots[key] || null,
    merged: merged[key] || null,
  };
}

async function readClientSnapshot(page, label) {
  return page.evaluate(
    async ({ recipeId, recipeTitle, label: stageLabel }) => {
      const key = String(recipeId);
      const storeRaw = sessionStorage.getItem('favoriteEats:store:v1');
      let store = null;
      try {
        store = storeRaw ? JSON.parse(storeRaw) : null;
      } catch (_) {
        store = { parseError: true };
      }
      const storeRoot = store?.plan?.recipeSelectionRoots?.[key] || null;
      const storeMerged = store?.plan?.recipeSelections?.[key] || null;
      const plan =
        typeof getShoppingPlan === 'function' ? getShoppingPlan() : null;
      const cacheRoot = plan?.recipeSelectionRoots?.[key] || null;
      const cacheMerged = plan?.recipeSelections?.[key] || null;
      const servingsFn = window.favoriteEatsGetRecipePlannerServingsStoredValueForUi;
      const servings =
        typeof servingsFn === 'function' ? servingsFn(recipeId) : null;
      const mapKey = 'favoriteEats:recipe-planner-servings:v1';
      let mapEntry = null;
      try {
        const map = JSON.parse(localStorage.getItem(mapKey) || '{}');
        mapEntry = map[key] ?? null;
      } catch (_) {}

      let derivedRows = [];
      try {
        window.dataService.useSupabase = true;
        const sel = Object.values(
          (plan && plan.recipeSelections) || {},
        ).filter((e) => Number(e?.recipeId) === recipeId);
        const withServings = sel.map((e) => ({
          ...e,
          servings:
            typeof window.favoriteEatsGetRecipePlannerServingsStoredValueForUi ===
            'function'
              ? window.favoriteEatsGetRecipePlannerServingsStoredValueForUi(
                  recipeId,
                )
              : null,
        }));
        if (typeof window.dataService.listShoppingPlanRecipeItems === 'function') {
          derivedRows = await window.dataService.listShoppingPlanRecipeItems(
            withServings.length
              ? withServings
              : [{ recipeId, quantity: 1, title: recipeTitle }],
          );
        }
      } catch (err) {
        derivedRows = [{ error: String(err?.message || err) }];
      }

      const domRows = [...document.querySelectorAll('#shoppingList li')]
        .map((li) => li.textContent?.replace(/\s+/g, ' ').trim())
        .filter((t) => /noodle|pasta|marinara/i.test(t || ''))
        .slice(0, 5);

      return {
        stage: stageLabel,
        storeRevisions: store?.revisions || null,
        storeRoot,
        storeMerged,
        cacheRoot,
        cacheMerged,
        servingsFromHelper: servings,
        localStorageServingsMap: mapEntry,
        derivedRows: derivedRows.slice(0, 8),
        domRows,
        shoppingStateSnapshotLoaded:
          typeof shoppingStateSnapshotLoaded !== 'undefined'
            ? shoppingStateSnapshotLoaded
            : null,
      };
    },
    { recipeId: RECIPE_ID, recipeTitle: RECIPE_TITLE, label },
  );
}

async function addRecipeToPlanLikeUi(page) {
  await page.goto(`${BASE}/recipes.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      typeof window.dataService?.setPlanRecipeQuantity === 'function' &&
      typeof getShoppingPlan === 'function',
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(2500);

  return page.evaluate(
    async ({ recipeId, targetServings, title }) => {
      window.dataService.useSupabase = true;
      const rows = document.querySelectorAll('#recipeList li[data-recipe-id]');
      let row = null;
      for (const li of rows) {
        if (Number(li.dataset.recipeId) === recipeId) {
          row = li;
          break;
        }
      }
      if (typeof primeShoppingPlanRecipeDetailCacheForRecipeTree === 'function') {
        await primeShoppingPlanRecipeDetailCacheForRecipeTree([recipeId]);
      }
      if (typeof window.recipePlannerModePrimeRecipe === 'function') {
        const recipeRow = { id: recipeId, title };
        window.recipePlannerModePrimeRecipe(recipeRow);
        if (typeof window.recipePlannerModeServings?.applyToModel === 'function') {
          window.recipePlannerModeServings.applyToModel(recipeRow, targetServings);
        }
      }
      setShoppingPlanRecipeRootSelection(
        { recipeId, title, quantity: 1 },
        { skipRemoteSave: true },
      );
      await window.dataService.setPlanRecipeQuantity({
        recipeId,
        title,
        quantity: 1,
        servingsOverride: targetServings,
      });
      await new Promise((r) => setTimeout(r, 800));
      return {
        rowFound: !!row,
        planAfterAdd: getShoppingPlan()?.recipeSelectionRoots?.[String(recipeId)] || null,
        mergedAfterAdd:
          getShoppingPlan()?.recipeSelections?.[String(recipeId)] || null,
      };
    },
    { recipeId: RECIPE_ID, targetServings: TARGET_SERVINGS, title: RECIPE_TITLE },
  );
}

async function simulateLogoutLogin(page) {
  await page.evaluate(() => {
    if (typeof favoriteEatsPerformSessionLogout === 'function') {
      favoriteEatsPerformSessionLogout();
    }
    if (typeof favoriteEatsApplyWelcomeSession === 'function') {
      favoriteEatsApplyWelcomeSession();
    }
  });
}

async function injectStaleStoreMissingServings(page) {
  return page.evaluate(({ recipeId }) => {
    const key = String(recipeId);
    const raw = sessionStorage.getItem('favoriteEats:store:v1');
    if (!raw) return { ok: false, reason: 'no store snapshot' };
    let store;
    try {
      store = JSON.parse(raw);
    } catch (_) {
      return { ok: false, reason: 'store parse failed' };
    }
    const root = store?.plan?.recipeSelectionRoots?.[key];
    const merged = store?.plan?.recipeSelections?.[key];
    if (!root || Number(root.quantity) <= 0) {
      return { ok: false, reason: 'store missing active root for recipe' };
    }
    delete root.servingsOverride;
    delete root.servings_override;
    if (merged) {
      delete merged.servingsOverride;
      delete merged.servings_override;
    }
    sessionStorage.setItem('favoriteEats:store:v1', JSON.stringify(store));
    const mapKey = 'favoriteEats:recipe-planner-servings:v1';
    try {
      const map = JSON.parse(localStorage.getItem(mapKey) || '{}');
      delete map[key];
      localStorage.setItem(mapKey, JSON.stringify(map));
    } catch (_) {}
    shoppingStateSnapshotLoaded = false;
    return {
      ok: true,
      storeRevisions: store.revisions,
      strippedRoot: store.plan.recipeSelectionRoots[key],
      strippedMerged: store.plan.recipeSelections?.[key] || null,
    };
  }, { recipeId: RECIPE_ID });
}

async function runInjectedStaleStoreProbe(browser) {
  console.log('\n=== INJECTED STALE STORE (roots lack servingsOverride, server has 5) ===');
  const ctx = await browser.newContext();
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/shopping.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.getElementById('shoppingList')?.dataset?.fePerfItemsReady === '1',
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(2000);

  const serverBefore = await fetchLoadShoppingStatePlanRecipe();
  const inject = await injectStaleStoreMissingServings(page);
  console.log('inject:', JSON.stringify(inject, null, 2));
  console.log('server before inject-nav:', serverBefore);

  await simulateLogoutLogin(page);
  await page.goto(`${BASE}/shopping.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.getElementById('shoppingList')?.dataset?.fePerfItemsReady === '1',
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(3500);

  const snap = await readClientSnapshot(page, 'after-inject-logout-login');
  console.log(JSON.stringify(snap, null, 2));
  const serverAfter = await fetchLoadShoppingStatePlanRecipe();
  console.log('load_shopping_state after inject-nav:', serverAfter);

  const serverServings = Number(
    serverAfter?.root?.servingsOverride ?? serverAfter?.merged?.servingsOverride,
  );
  const storeOv =
    snap.storeRoot?.servingsOverride ?? snap.storeRoot?.servings_override;
  const clientServings = Number(snap.servingsFromHelper);
  const confirmed =
    Number.isFinite(serverServings) &&
    serverServings === TARGET_SERVINGS &&
    (storeOv == null || storeOv === undefined) &&
    clientServings !== TARGET_SERVINGS;

  console.log('\n=== INJECTED DIAGNOSIS CHECK ===');
  console.log({
    serverServingsOverride: serverAfter?.root?.servingsOverride,
    storeRootServingsOverride: storeOv,
    clientServingsHelper: snap.servingsFromHelper,
    localStorageMap: snap.localStorageServingsMap,
    derivedNoodleQty: snap.derivedRows?.find((r) => /noodle/i.test(r.name || ''))
      ?.quantity,
    diagnosisConfirmed: confirmed,
    fastPathLikelyUsed:
      inject.ok &&
      snap.storeRevisions?.planUpdatedAt === inject.storeRevisions?.planUpdatedAt,
  });
  await ctx.close();
  return confirmed;
}

async function main() {
  console.log('=== Server BEFORE probe (may reflect prior session) ===');
  console.log('selected_recipes:', await fetchServerRecipeRow());
  console.log('load_shopping_state root:', await fetchLoadShoppingStatePlanRecipe());

  const browser = await chromium.launch({ headless: true });
  const sameWindow = await browser.newContext();
  await sameWindow.addInitScript(initScript);
  const page = await sameWindow.newPage();

  console.log('\n=== 1) Add Basic Pasta to plan (servings 5) ===');
  const addOut = await addRecipeToPlanLikeUi(page);
  console.log(JSON.stringify(addOut, null, 2));
  await page.waitForTimeout(1500);
  console.log('server after add:', await fetchServerRecipeRow());
  console.log('client after add:', await readClientSnapshot(page, 'after-add'));

  console.log('\n=== 2) Logout + login (same window, store kept) ===');
  await simulateLogoutLogin(page);
  await page.goto(`${BASE}/shopping.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.getElementById('shoppingList')?.dataset?.fePerfItemsReady === '1',
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(3500);
  const afterLogin = await readClientSnapshot(page, 'after-logout-login');
  console.log(JSON.stringify(afterLogin, null, 2));
  console.log('server after login nav:', await fetchServerRecipeRow());
  console.log('load_shopping_state after login nav:', await fetchLoadShoppingStatePlanRecipe());

  console.log('\n=== 3) Hard refresh (same window) ===');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.getElementById('shoppingList')?.dataset?.fePerfItemsReady === '1',
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(3500);
  const afterRefresh = await readClientSnapshot(page, 'after-hard-refresh');
  console.log(JSON.stringify(afterRefresh, null, 2));

  console.log('\n=== 4) Fresh incognito context ===');
  const fresh = await browser.newContext();
  await fresh.addInitScript(initScript);
  const pageFresh = await fresh.newPage();
  await pageFresh.goto(`${BASE}/shopping.html`, { waitUntil: 'domcontentloaded' });
  await pageFresh.waitForFunction(
    () => document.getElementById('shoppingList')?.dataset?.fePerfItemsReady === '1',
    null,
    { timeout: 120000 },
  );
  await pageFresh.waitForTimeout(3500);
  const freshSnap = await readClientSnapshot(pageFresh, 'fresh-incognito');
  console.log(JSON.stringify(freshSnap, null, 2));

  console.log('\n=== DIAGNOSIS CHECK (natural repro) ===');
  const serverState = await fetchLoadShoppingStatePlanRecipe();
  const serverServings = Number(
    serverState?.root?.servingsOverride ?? serverState?.merged?.servingsOverride,
  );
  let naturalConfirmed = false;
  for (const snap of [afterLogin, afterRefresh]) {
    const storeOv = snap.storeRoot?.servingsOverride ?? snap.storeRoot?.servings_override;
    const cacheOv = snap.cacheRoot?.servingsOverride ?? snap.cacheRoot?.servings_override;
    const clientServings = Number(snap.servingsFromHelper);
    const confirmed =
      Number.isFinite(serverServings) &&
      serverServings === TARGET_SERVINGS &&
      (storeOv == null || storeOv === undefined) &&
      clientServings !== TARGET_SERVINGS;
    if (confirmed) naturalConfirmed = true;
    console.log({
      stage: snap.stage,
      serverServingsOverride: serverState?.root?.servingsOverride,
      storeRootServingsOverride: storeOv,
      cacheRootServingsOverride: cacheOv,
      clientServingsHelper: snap.servingsFromHelper,
      localStorageMap: snap.localStorageServingsMap,
      diagnosisConfirmed: confirmed,
    });
  }

  const injectedConfirmed = await runInjectedStaleStoreProbe(browser);
  console.log('\n=== OVERALL ===');
  console.log({
    naturalReproConfirmed: naturalConfirmed,
    injectedStaleStoreConfirmed: injectedConfirmed,
    diagnosisConfidence:
      naturalConfirmed || injectedConfirmed ? '90%+' : 'still ~80% (code trace only)',
  });

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
