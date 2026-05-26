#!/usr/bin/env node
/** Minimal repro: server qty 1 vs Items derived qty after composition events */
import { chromium } from 'playwright';

const SUPABASE_URL = 'https://ysesmbcvxmaymtsqeipc.supabase.co';
const ANON = 'sb_publishable_gIYjmWOjcHtg5RRLbw8yLQ_AGWYQH2E';
const BASE = process.env.PERF_BASE_URL || 'http://127.0.0.1:8000';
const RECIPE_ID = 264;
const RIM_ID = 1454;

async function rimQty() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/recipe_ingredient_map?id=eq.${RIM_ID}&select=quantity`,
    {
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'Accept-Profile': 'catalog',
      },
    },
  );
  const rows = await res.json();
  return rows[0]?.quantity;
}

async function saveQty(page, qty) {
  return page.evaluate(async ([rid, q]) => {
    window.dataService.useSupabase = true;
    const recipe = await window.dataService.loadRecipeDetail(Number(rid));
    for (const section of recipe.sections || []) {
      for (const line of section.ingredients || []) {
        if (String(line?.name || '').toLowerCase().includes('alicorn')) {
          line.quantity = String(q);
        }
      }
    }
    await window.dataService.saveRecipe({ recipe });
    return { ok: true };
  }, [RECIPE_ID, qty]);
}

async function readRecipeDetailQty(page) {
  return page.evaluate(async (rid) => {
    window.dataService.useSupabase = true;
    const recipe = await window.dataService.loadRecipeDetail(Number(rid), {
      forShoppingPlan: true,
    });
    for (const section of recipe?.sections || []) {
      for (const line of section.ingredients || []) {
        if (String(line?.name || '').toLowerCase().includes('alicorn')) {
          return line.quantity;
        }
      }
    }
    return null;
  }, RECIPE_ID);
}

async function readDerived(page) {
  return page.evaluate(async () => {
    window.dataService.useSupabase = true;
    const store = window.favoriteEatsStore.getSnapshot();
    const selectedRecipes = Object.values(store.plan.recipeSelections || {}).map(
      (e) => ({ ...e, servings: e.servingsOverride }),
    );
    const rows = await window.dataService.listShoppingPlanRecipeItems(selectedRecipes);
    const alicorn = rows.find((r) => /alicorn/i.test(r.name || r.label || ''));
    return { alicornQty: alicorn?.quantity ?? null, selectedRecipes };
  });
}

async function readDom(page) {
  const search = page.locator('#appBarSearchInput');
  if (await search.count()) {
    await search.fill('alicorn');
    await page.waitForTimeout(500);
  }
  return page.evaluate(() => {
    const li = [...document.querySelectorAll('#shoppingList li')].find((el) =>
      /alicorn/i.test(el.textContent || ''),
    );
    const btn = li?.querySelector('.shopping-list-doc-text--amount');
    return {
      amount: btn?.textContent?.trim() || null,
      text: li?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || null,
    };
  });
}

async function ensurePlan() {
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_plan_recipe_quantity`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'catalog',
      'Content-Profile': 'catalog',
    },
    body: JSON.stringify({
      p_recipe_id: RECIPE_ID,
      p_quantity: 1,
      p_title: 'Alicorn Stew',
      p_servings_override: 10,
    }),
  });
}

async function main() {
  await ensurePlan();
  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  for (const ctx of [ctxA, ctxB]) {
    await ctx.addInitScript(() => {
      sessionStorage.setItem(
        'favoriteEatsSplashAccess',
        JSON.stringify({ grantedAt: Date.now(), expiresAt: Date.now() + 86400000 }),
      );
      localStorage.setItem('favoriteEatsPlannerModeOn', '1');
    });
  }
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageB.goto(`${BASE}/shopping.html`, { waitUntil: 'domcontentloaded' });
  await pageB.waitForFunction(
    () => document.getElementById('shoppingList')?.dataset?.fePerfItemsReady === '1',
    null,
    { timeout: 120000 },
  );
  await pageB.waitForTimeout(3000);

  await pageA.goto(`${BASE}/recipeEditor.html`, { waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(2000);

  console.log('--- set server to 1 ---');
  await saveQty(pageA, 1);
  await pageB.waitForTimeout(3000);
  console.log('server', await rimQty());
  console.log('B loadRecipeDetail alicorn qty', await readRecipeDetailQty(pageB));
  console.log('B derived', await readDerived(pageB));
  console.log('B dom', await readDom(pageB));

  await pageB.evaluate(async () => {
    window.dataService.bumpRecipeCompositionReadModel();
  });
  console.log('--- after bump only (server=1) ---');
  console.log('B loadRecipeDetail alicorn qty', await readRecipeDetailQty(pageB));
  console.log('B derived', await readDerived(pageB));

  await pageB.evaluate(async () => {
    await window.favoriteEatsRecipeCompositionSync.runFavoriteEatsCatalogCompositionRefresh(
      { source: 'probe-after-1' },
    );
  });
  await pageB.waitForTimeout(1000);
  console.log('--- after manual refresh while server=1 ---');
  console.log('server', await rimQty());
  console.log('B derived', await readDerived(pageB));
  console.log('B dom', await readDom(pageB));

  console.log('--- set server to 2 ---');
  await saveQty(pageA, 2);
  await pageB.waitForTimeout(3000);
  console.log('server', await rimQty());
  console.log('B derived (no manual refresh)', await readDerived(pageB));
  console.log('B dom (no manual refresh)', await readDom(pageB));

  await pageB.evaluate(async () => {
    await window.favoriteEatsRecipeCompositionSync.runFavoriteEatsCatalogCompositionRefresh(
      { source: 'probe' },
    );
  });
  await pageB.waitForTimeout(1000);
  console.log('--- after manual composition refresh on B ---');
  console.log('server', await rimQty());
  console.log('B derived', await readDerived(pageB));
  console.log('B dom', await readDom(pageB));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
