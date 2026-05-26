#!/usr/bin/env node
/**
 * Determine root cause of cross-window recipe composition → Items sync failure.
 * Collects runtime evidence: Realtime, composition refresh, cache, DOM, manual refresh.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const SUPABASE_URL = 'https://ysesmbcvxmaymtsqeipc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gIYjmWOjcHtg5RRLbw8yLQ_AGWYQH2E';

function joinUrl(base, pathname) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(pathname || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

async function supabaseGet(pathname, profile = 'catalog') {
  const url = `${SUPABASE_URL}/rest/v1/${pathname}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
      'Accept-Profile': profile,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${pathname} ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function supabaseRpc(functionName, body) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Profile': 'catalog',
      'Content-Profile': 'catalog',
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RPC ${functionName} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function ensureRecipeOnPlan(recipeId, title, servings = 10) {
  return supabaseRpc('set_plan_recipe_quantity', {
    p_recipe_id: recipeId,
    p_quantity: 1,
    p_title: title,
    p_servings_override: servings,
  });
}

async function findAlicornStewRecipe() {
  const recipes = await supabaseGet(
    'recipes?select=id,title,servings_default&title=ilike.*alicorn*',
  );
  if (!Array.isArray(recipes) || !recipes.length) {
    throw new Error('No Alicorn Stew recipe found on server');
  }
  const recipe = recipes[0];
  const rims = await supabaseGet(
    `recipe_ingredient_map?recipe_id=eq.${recipe.id}&select=id,quantity,ingredient_id`,
  );
  const ingredients = await supabaseGet('ingredients?select=id,name');
  const nameById = new Map(
    (Array.isArray(ingredients) ? ingredients : []).map((i) => [
      i.id,
      String(i.name || ''),
    ]),
  );
  const rimsWithNames = (Array.isArray(rims) ? rims : []).map((row) => ({
    ...row,
    ingredientName: nameById.get(row.ingredient_id) || '',
  }));
  const alicornRim = rimsWithNames.find((row) =>
    String(row.ingredientName || '').toLowerCase().includes('alicorn'),
  );
  return { recipe, alicornRim, allRims: rimsWithNames };
}

function parseServerQty(qtyText) {
  const n = Number(String(qtyText || '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function installProbesEarly(context) {
  await context.addInitScript(() => {
    window.__feProbe = {
      compositionScheduled: 0,
      compositionRan: 0,
      bumpCount: 0,
      catalogRealtimeTables: [],
      planRealtimeCount: 0,
      lastScheduleSource: null,
      probesInstalled: false,
    };
    const tryInstall = () => {
      if (window.__feProbe.probesInstalled) return true;
      const sync = window.favoriteEatsRecipeCompositionSync;
      if (!sync) return false;
      const origSchedule = sync.scheduleFavoriteEatsCatalogCompositionRefresh;
      sync.scheduleFavoriteEatsCatalogCompositionRefresh = function (opts) {
        window.__feProbe.compositionScheduled += 1;
        window.__feProbe.lastScheduleSource = opts?.source || null;
        return origSchedule.call(this, opts);
      };
      const origRun = sync.runFavoriteEatsCatalogCompositionRefresh;
      sync.runFavoriteEatsCatalogCompositionRefresh = async function (opts) {
        window.__feProbe.compositionRan += 1;
        return origRun.call(this, opts);
      };
      if (
        window.dataService &&
        typeof window.dataService.bumpRecipeCompositionReadModel === 'function'
      ) {
        const origBump =
          window.dataService.bumpRecipeCompositionReadModel.bind(window.dataService);
        window.dataService.bumpRecipeCompositionReadModel = function () {
          window.__feProbe.bumpCount += 1;
          return origBump();
        };
      }
      window.__feProbe.probesInstalled = true;
      return true;
    };
    if (!tryInstall()) {
      const timer = setInterval(() => {
        if (tryInstall()) clearInterval(timer);
      }, 25);
    }
  });
}

async function installProbes(page) {
  await page.evaluate(() => {
    window.__feProbe = {
      compositionScheduled: 0,
      compositionRan: 0,
      bumpCount: 0,
      catalogRealtimeTables: [],
      planRealtimeCount: 0,
      lastScheduleSource: null,
      installedAt: Date.now(),
    };

    const sync = window.favoriteEatsRecipeCompositionSync;
    if (sync) {
      const origSchedule = sync.scheduleFavoriteEatsCatalogCompositionRefresh;
      sync.scheduleFavoriteEatsCatalogCompositionRefresh = function (opts) {
        window.__feProbe.compositionScheduled += 1;
        window.__feProbe.lastScheduleSource = opts?.source || null;
        return origSchedule.call(this, opts);
      };
      const origRun = sync.runFavoriteEatsCatalogCompositionRefresh;
      sync.runFavoriteEatsCatalogCompositionRefresh = async function (opts) {
        window.__feProbe.compositionRan += 1;
        return origRun.call(this, opts);
      };
    }

    if (
      window.dataService &&
      typeof window.dataService.bumpRecipeCompositionReadModel === 'function'
    ) {
      const origBump =
        window.dataService.bumpRecipeCompositionReadModel.bind(window.dataService);
      window.dataService.bumpRecipeCompositionReadModel = function () {
        window.__feProbe.bumpCount += 1;
        return origBump();
      };
    }

    if (
      window.dataService &&
      typeof window.dataService.subscribeCatalogReferenceChanges === 'function'
    ) {
      const origSub =
        window.dataService.subscribeCatalogReferenceChanges.bind(window.dataService);
      window.dataService.subscribeCatalogReferenceChanges = function (handlers) {
        const origOnChange = handlers?.onChange;
        return origSub({
          onChange: (payload) => {
            try {
              window.__feProbe.catalogRealtimeTables.push(
                String(payload?.table || payload?.schema || 'unknown'),
              );
            } catch (_) {}
            if (typeof origOnChange === 'function') origOnChange(payload);
          },
        });
      };
    }
  });
}

async function readProbe(page) {
  return page.evaluate(() => ({ ...(window.__feProbe || {}) }));
}

async function focusAlicornOnItems(page) {
  const search = page.locator('#appBarSearchInput, #shoppingSearchInput, input[type="search"]');
  if ((await search.count()) > 0) {
    await search.first().fill('alicorn');
    await page.waitForTimeout(800);
  }
}

async function readAlicornDom(page) {
  await focusAlicornOnItems(page);
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('#shoppingList li')];
    const hits = [];
    for (const li of rows) {
      const raw = String(li.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/alicorn/i.test(raw)) continue;
      const amountBtn = li.querySelector('.shopping-list-doc-text--amount');
      const detail = String(amountBtn?.textContent || '').trim();
      const m =
        detail.match(/\(([^)]+)\)/) ||
        raw.match(/alicorns?\s*\(([^)]+)\)/i);
      hits.push({
        rowText: raw.slice(0, 120),
        amountBtnText: detail,
        parsedQty: m ? String(m[1]).trim() : null,
        hasStepperKey: !!li.dataset.shoppingStepperKey,
      });
    }
    return hits[0] || null;
  });
}

async function readDerivedQtyViaDataService(page, recipeId) {
  return page.evaluate(async (rid) => {
    if (!window.dataService) return { error: 'no dataService' };
    window.dataService.useSupabase = true;
    const store = window.favoriteEatsStore?.getSnapshot?.();
    const recipeSelections = store?.plan?.recipeSelections || {};
    const selectedRecipes = Object.values(recipeSelections).map((entry) => ({
      ...entry,
      servings:
        entry?.servingsOverride != null ? Number(entry.servingsOverride) : undefined,
    }));
    if (!selectedRecipes.length) {
      return { error: 'no recipe selections in store', recipeSelections };
    }
    let rows = [];
    try {
      rows = await window.dataService.listShoppingPlanRecipeItems(selectedRecipes);
    } catch (err) {
      return { error: String(err?.message || err), selectedRecipes };
    }
    const alicorn = (Array.isArray(rows) ? rows : []).filter((r) =>
      /alicorn/i.test(String(r?.name || r?.label || '')),
    );
    return { selectedRecipes, alicornRows: alicorn, allRecipeRows: rows.length };
  }, recipeId);
}

async function waitForItemsReady(page, baseUrl, timeoutMs = 120000) {
  await page.goto(joinUrl(baseUrl, 'shopping.html'), {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  await page.locator('#appBarTitle').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const v = document.getElementById('shoppingList')?.dataset?.fePerfItemsReady;
      return v === '1' || v === '0';
    },
    null,
    { timeout: timeoutMs },
  );
  const marker = await page.locator('#shoppingList').getAttribute('data-fe-perf-items-ready');
  if (marker !== '1') {
    throw new Error(`Items page not ready: fePerfItemsReady=${marker}`);
  }
  await page.waitForTimeout(2500);
}

async function addRecipeToPlanViaRecipesUi(pageA, baseUrl, recipeTitle) {
  await pageA.goto(joinUrl(baseUrl, 'recipes.html'), {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await pageA.waitForTimeout(2000);
  const link = pageA.locator('a, button, [role="button"]').filter({
    hasText: new RegExp(recipeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  });
  const count = await link.count();
  if (count === 0) throw new Error(`Recipe row not found: ${recipeTitle}`);
  const row = link.first();
  await row.click({ timeout: 15000 });
  await pageA.waitForTimeout(1500);
  const servingsInput = pageA.locator(
    '.recipe-list-servings-input, input[data-recipe-servings], .recipe-servings-input',
  );
  if ((await servingsInput.count()) > 0) {
    await servingsInput.first().fill('10');
    await servingsInput.first().press('Enter').catch(() => {});
    await pageA.waitForTimeout(500);
  }
  const addBtn = pageA.locator(
    'button.recipe-list-add-btn, button[aria-label*="Add"], .recipe-list-row-add',
  );
  if ((await addBtn.count()) > 0) {
    await addBtn.first().click();
  } else {
    await row.click({ modifiers: ['Control'] }).catch(() => {});
  }
  await pageA.waitForTimeout(2000);
}

async function saveRecipeQtyViaEditor(pageA, baseUrl, recipeId, nextQty) {
  await pageA.goto(joinUrl(baseUrl, 'recipeEditor.html'), {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await pageA.waitForTimeout(3000);

  const saved = await pageA.evaluate(async ([rid, qty]) => {
    if (!window.dataService || typeof window.dataService.loadRecipeDetail !== 'function') {
      return { error: 'no loadRecipeDetail' };
    }
    window.dataService.useSupabase = true;
    const recipe = await window.dataService.loadRecipeDetail(Number(rid));
    if (!recipe?.sections?.length) return { error: 'no recipe sections', rid };

    let changed = false;
    for (const section of recipe.sections) {
      for (const line of section.ingredients || []) {
        if (line?.rowType === 'heading' || line?.isRecipe) continue;
        const name = String(line?.name || line?.ingredientName || '').toLowerCase();
        if (!name.includes('alicorn')) continue;
        line.quantity = String(qty);
        changed = true;
      }
    }
    if (!changed) return { error: 'alicorn line not found in editor model' };

    if (typeof window.dataService.saveRecipe !== 'function') {
      return { error: 'no saveRecipe' };
    }
    await window.dataService.saveRecipe({ recipe });
    return { ok: true, rid: Number(rid), qty };
  }, [recipeId, nextQty]);

  return saved;
}

async function manualCompositionRefresh(pageB) {
  return pageB.evaluate(async () => {
    if (
      !window.favoriteEatsRecipeCompositionSync ||
      typeof window.favoriteEatsRecipeCompositionSync
        .runFavoriteEatsCatalogCompositionRefresh !== 'function'
    ) {
      return { error: 'no composition sync module' };
    }
    await window.favoriteEatsRecipeCompositionSync.runFavoriteEatsCatalogCompositionRefresh(
      { source: 'probe-manual' },
    );
    return { ok: true };
  });
}

async function main() {
  const baseUrl = process.env.PERF_BASE_URL || 'http://127.0.0.1:8000';
  const outDir = path.join(REPO_ROOT, 'perf-artifacts', `probe-composition-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const serverInfo = { recipe: null, alicornRim: null };
  try {
    serverInfo.recipe = await findAlicornStewRecipe();
  } catch (err) {
    console.error('[probe] server lookup failed:', err.message);
    process.exit(1);
  }

  const { recipe, alicornRim } = serverInfo.recipe;
  const serverQtyBefore = parseServerQty(alicornRim?.quantity);
  const baselineQty = 1;
  const targetQtyAfter = 2;

  console.log('[probe] server baseline', {
    recipeId: recipe.id,
    title: recipe.title,
    servingsDefault: recipe.servings_default,
    rimId: alicornRim?.id,
    serverQtyBefore,
    targetQtyAfter,
  });

  const browser = await chromium.launch({
    headless: process.env.PERF_HEADED === '1' ? false : true,
  });

  const initScripts = () => ({
    splashAndPlanner: `
      try {
        const grantedAt = Date.now();
        sessionStorage.setItem('favoriteEatsSplashAccess', JSON.stringify({
          grantedAt, expiresAt: grantedAt + 1000 * 60 * 60 * 12,
        }));
        localStorage.setItem('favoriteEatsPlannerModeOn', '1');
      } catch (_) {}
    `,
  });

  const contextB = await browser.newContext();
  await contextB.addInitScript(initScripts().splashAndPlanner);
  await installProbesEarly(contextB);
  const pageB = await contextB.newPage();

  const contextA = await browser.newContext();
  await contextA.addInitScript(initScripts().splashAndPlanner);
  const pageA = await contextA.newPage();

  const evidence = {
    generatedAt: new Date().toISOString(),
    server: {
      recipeId: recipe.id,
      title: recipe.title,
      rimId: alicornRim?.id,
      qtyBefore: serverQtyBefore,
      qtyTarget: targetQtyAfter,
    },
    phases: {},
  };

  try {
    await waitForItemsReady(pageB, baseUrl);
    evidence.phases.itemsBoot = {
      probe: await readProbe(pageB),
      dom: await readAlicornDom(pageB),
      derived: await readDerivedQtyViaDataService(pageB, recipe.id),
    };

    const planRpc = await ensureRecipeOnPlan(recipe.id, recipe.title, 10);
    evidence.phases.planRpc = planRpc;
    await pageB.waitForTimeout(5000);
    evidence.phases.afterPlanAdd = {
      probeB: await readProbe(pageB),
      domB: await readAlicornDom(pageB),
      derivedB: await readDerivedQtyViaDataService(pageB, recipe.id),
    };

    if (serverQtyBefore !== baselineQty) {
      const normalizeSave = await saveRecipeQtyViaEditor(
        pageA,
        baseUrl,
        recipe.id,
        baselineQty,
      );
      evidence.phases.normalizeToBaseline = normalizeSave;
      await pageB.waitForTimeout(2500);
      evidence.phases.afterNormalize = {
        domB: await readAlicornDom(pageB),
        derivedB: await readDerivedQtyViaDataService(pageB, recipe.id),
        probeB: await readProbe(pageB),
      };
    }

    const probeBeforeSave = await readProbe(pageB);
    const domBeforeSave = await readAlicornDom(pageB);
    const derivedBeforeSave = await readDerivedQtyViaDataService(pageB, recipe.id);

    const saveResult = await saveRecipeQtyViaEditor(pageA, baseUrl, recipe.id, targetQtyAfter);
    evidence.phases.saveInA = saveResult;

    await pageB.waitForTimeout(2500);
    const probeAfterSave = await readProbe(pageB);
    const domAfterSave = await readAlicornDom(pageB);
    const derivedAfterSave = await readDerivedQtyViaDataService(pageB, recipe.id);

    const rimsAfter = await supabaseGet(
      `recipe_ingredient_map?id=eq.${alicornRim.id}&select=id,quantity`,
    );
    const serverQtyAfterSave = parseServerQty(rimsAfter?.[0]?.quantity);

    evidence.phases.afterSaveWait = {
      serverQtyAfterSave,
      probeBeforeSave,
      probeAfterSave,
      probeDelta: {
        compositionScheduled:
          probeAfterSave.compositionScheduled - probeBeforeSave.compositionScheduled,
        compositionRan: probeAfterSave.compositionRan - probeBeforeSave.compositionRan,
        bumpCount: probeAfterSave.bumpCount - probeBeforeSave.bumpCount,
        catalogRealtimeTables: probeAfterSave.catalogRealtimeTables.slice(
          probeBeforeSave.catalogRealtimeTables.length,
        ),
        planRealtimeCount:
          probeAfterSave.planRealtimeCount - probeBeforeSave.planRealtimeCount,
      },
      domBeforeSave,
      domAfterSave,
      derivedBeforeSave,
      derivedAfterSave,
    };

    await manualCompositionRefresh(pageB);
    await pageB.waitForTimeout(500);
    const domAfterManual = await readAlicornDom(pageB);
    const derivedAfterManual = await readDerivedQtyViaDataService(pageB, recipe.id);
    evidence.phases.afterManualRefresh = {
      dom: domAfterManual,
      derived: derivedAfterManual,
      probe: await readProbe(pageB),
    };

    evidence.verdict = determineVerdict(evidence);
    evidence.phases.afterSaveWait.domChanged =
      JSON.stringify(domBeforeSave) !== JSON.stringify(domAfterSave);
    evidence.phases.afterSaveWait.derivedChanged =
      JSON.stringify(derivedBeforeSave) !== JSON.stringify(derivedAfterSave);

    const outPath = path.join(outDir, 'composition-sync-evidence.json');
    fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
    console.log('\n[probe] VERDICT:', evidence.verdict.summary);
    console.log('[probe] detail:', evidence.verdict.detail);
    console.log('[probe] evidence:', outPath);
    process.exit(evidence.verdict.exitCode);
  } finally {
    await browser.close();
  }
}

function determineVerdict(evidence) {
  const after = evidence.phases.afterSaveWait || {};
  const manual = evidence.phases.afterManualRefresh || {};
  const delta = after.probeDelta || {};
  const serverSaved =
    after.serverQtyAfterSave === evidence.server.qtyTarget;
  const domStaleAfterSave =
    after.domAfterSave?.parsedQty != null &&
    String(after.domAfterSave.parsedQty) !== String(evidence.server.qtyTarget);
  const domFixedAfterManual =
    manual.dom?.parsedQty != null &&
    String(manual.dom.parsedQty) === String(evidence.server.qtyTarget);

  if (!serverSaved) {
    return {
      exitCode: 2,
      summary: 'SAVE_FAILED — server quantity did not update',
      detail: `Expected ${evidence.server.qtyTarget}, got ${after.serverQtyAfterSave}`,
    };
  }

  if (delta.compositionRan > 0 && !domStaleAfterSave) {
    return {
      exitCode: 0,
      summary: 'SYNC_OK — composition refresh ran and DOM updated',
      detail: `compositionRan +${delta.compositionRan}, bump +${delta.bumpCount}`,
    };
  }

  if (delta.compositionScheduled === 0 && delta.compositionRan === 0) {
    if (domFixedAfterManual) {
      return {
        exitCode: 3,
        summary:
          'CAUSE_DETERMINED: Realtime → composition refresh never ran on Items tab; manual refresh fixes DOM',
        detail: `No compositionScheduled/Ran after save. catalogRealtime tables seen: ${JSON.stringify(delta.catalogRealtimeTables)}. Manual refresh showed qty ${manual.dom?.parsedQty}.`,
      };
    }
    return {
      exitCode: 3,
      summary:
        'CAUSE_DETERMINED: Realtime → composition refresh never ran (manual refresh also insufficient)',
      detail: `No compositionScheduled/Ran. Manual dom: ${JSON.stringify(manual.dom)}`,
    };
  }

  if (delta.compositionRan > 0 && domStaleAfterSave && domFixedAfterManual) {
    return {
      exitCode: 4,
      summary:
        'CAUSE_DETERMINED: Composition refresh ran but did not update UI; manual re-run fixes it (timing/ordering bug)',
      detail: `compositionRan +${delta.compositionRan}, bump +${delta.bumpCount}, dom before/after save stale`,
    };
  }

  if (delta.compositionRan > 0 && domStaleAfterSave && !domFixedAfterManual) {
    const derivedTarget = manual.derived?.alicornRows?.[0]?.quantity;
    if (derivedTarget === evidence.server.qtyTarget) {
      return {
        exitCode: 5,
        summary:
          'CAUSE_DETERMINED: Data re-derived correctly but DOM patch failed to show new qty',
        detail: `derived qty ${derivedTarget}, dom ${manual.dom?.parsedQty}`,
      };
    }
    return {
      exitCode: 6,
      summary:
        'CAUSE_DETERMINED: Composition refresh ran but recompute still returned stale derived qty (cache/race)',
      detail: `derived after manual: ${JSON.stringify(manual.derived?.alicornRows)}`,
    };
  }

  return {
    exitCode: 7,
    summary: 'INCONCLUSIVE — inspect composition-sync-evidence.json',
    detail: JSON.stringify({ delta, domAfterSave: after.domAfterSave, manual: manual.dom }),
  };
}

main().catch((err) => {
  console.error('[probe] fatal:', err);
  process.exit(99);
});
