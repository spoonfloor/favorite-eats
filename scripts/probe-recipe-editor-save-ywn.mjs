#!/usr/bin/env node
/**
 * Probe: record paint + YWN DOM events during recipe editor Save.
 *
 * Usage:
 *   python3 -m http.server 8765   # from repo root (use a free port)
 *   PERF_BASE_URL=http://127.0.0.1:8765 node scripts/probe-recipe-editor-save-ywn.mjs --recipe-id=262 --with-ingredient-edit
 */
import { chromium } from 'playwright';

const BASE = process.env.PERF_BASE_URL || 'http://127.0.0.1:8765';
const WITH_INGREDIENT_EDIT = process.argv.includes('--with-ingredient-edit');
const RECIPE_ID = Number(
  (process.argv.find((a) => a.startsWith('--recipe-id=')) || '')
    .split('=')[1] || '274',
);

async function fetchRecipeId() {
  if (Number.isFinite(RECIPE_ID) && RECIPE_ID > 0) return RECIPE_ID;
  throw new Error('Pass --recipe-id=N');
}

async function waitForRecipeEditorReady(page) {
  await page.waitForFunction(
    () =>
      document.body?.dataset?.page === 'recipe-editor' &&
      window.recipeData &&
      Array.isArray(window.recipeData.sections) &&
      document.querySelector('#ingredientsSection'),
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(2000);
}

async function installDomObserver(page) {
  return page.evaluate(() => {
    window.__feYwnDomLog = [];
    const push = (type, detail) => {
      window.__feYwnDomLog.push({
        t: Date.now(),
        perf: Math.round(performance.now()),
        type,
        ...detail,
      });
    };
    const observeCard = (card) => {
      if (!card || card.__feYwnObserved) return;
      card.__feYwnObserved = true;
      push('ywnDom:observed', { childCount: card.childElementCount });
      const mo = new MutationObserver((records) => {
        for (const rec of records) {
          if (rec.type === 'childList') {
            push('ywnDom:childList', {
              removed: rec.removedNodes.length,
              added: rec.addedNodes.length,
              childCount: card.childElementCount,
            });
          }
        }
      });
      mo.observe(card, { childList: true, subtree: false });
      card.__feYwnMo = mo;
    };
    observeCard(document.querySelector('.you-will-need-card'));
    const rootMo = new MutationObserver(() => {
      observeCard(document.querySelector('.you-will-need-card'));
      const card = document.querySelector('.you-will-need-card');
      if (!card) push('ywnDom:missing', {});
    });
    const root = document.querySelector('#pageContent') || document.body;
    rootMo.observe(root, { childList: true, subtree: true });
    window.__feYwnRootMo = rootMo;
  });
}

function relMs(entries, t0) {
  return entries.map((e) => ({
    ...e,
    relMs: e.t - t0,
  }));
}

function summarize(log, domLog, t0) {
  const paint = relMs(log, t0);
  const dom = relMs(domLog, t0);

  const ywnCommits = paint.filter((e) => e.event === 'ywn:commit');
  const innerHtmlWipes = paint.filter((e) => e.event === 'renderRecipe:innerHTML');
  const commitPaints = paint.filter((e) => e.event === 'commitPaint:enter');
  const catalog = paint.filter((e) => e.event.startsWith('catalog:'));

  console.log('\n=== SAVE YWN PROBE SUMMARY ===');
  console.log(`Recipe id: ${RECIPE_ID}`);
  console.log(`Paint log entries: ${paint.length}`);
  console.log(`YWN commit events: ${ywnCommits.length}`);
  console.log(`renderRecipe innerHTML wipes: ${innerHtmlWipes.length}`);
  console.log(`commitPaint calls: ${commitPaints.length}`);
  console.log(`Catalog reload events: ${catalog.length}`);
  console.log(`YWN DOM mutations: ${dom.filter((d) => d.type.startsWith('ywnDom')).length}`);

  console.log('\n--- Timeline (ms since save click) ---');
  for (const e of paint) {
    const surfaces = e.surfaces || e.requestedSurfaces || e.pendingAfter;
    console.log(
      `[+${String(e.relMs).padStart(5)}] ${e.event}` +
        (e.reason ? ` reason=${e.reason}` : '') +
        (surfaces ? ` surfaces=${JSON.stringify(surfaces)}` : '') +
        (e.branch ? ` branch=${e.branch}` : '') +
        (e.generation != null ? ` gen=${e.generation}` : '') +
        (e.hadYwn != null ? ` hadYwn=${e.hadYwn}` : ''),
    );
  }

  const domEvents = dom.filter((d) => d.type !== 'ywnDom:observed');
  if (domEvents.length) {
    console.log('\n--- YWN DOM ---');
    for (const d of domEvents) {
      console.log(
        `[+${String(d.relMs).padStart(5)}] ${d.type}` +
          (d.removed != null ? ` removed=${d.removed} added=${d.added}` : '') +
          (d.childCount != null ? ` children=${d.childCount}` : ''),
      );
    }
  }

  console.log('\n--- Verdict ---');
  if (ywnCommits.length >= 2) {
    const reasons = commitPaints.map((e) => e.reason).filter(Boolean);
    console.log(
      `CONFIRMED: ${ywnCommits.length} YWN DOM commits on save.` +
        (reasons.length
          ? ` commitPaint reasons: ${[...new Set(reasons)].join(', ')}`
          : ''),
    );
    if (catalog.some((e) => e.event.includes('paintedFullPage'))) {
      console.log('Likely culprit: save commitPaint + catalog-reload fullPage.');
    } else if (commitPaints.length >= 2) {
      console.log('Likely culprit: multiple commitPaint invocations.');
    } else if (innerHtmlWipes.length >= 1 && ywnCommits.length >= 1) {
      console.log('Likely culprit: fullPage innerHTML wipe + YWN rebuild.');
    } else {
      console.log('Likely culprit: duplicate ywn:commit within save window (check schedulePaint pending).');
    }
  } else if (ywnCommits.length === 1) {
    console.log('Single YWN commit on save — double flash may be innerHTML wipe + ywn:commit, or visual only.');
  } else if (innerHtmlWipes.length >= 1) {
    console.log('Full page wipe without separate ywn:commit logged (YWN may stay missing until async).');
  } else {
    console.log('No YWN commit on save — bug may need an edit-before-save repro.');
  }
}

async function main() {
  const recipeId = await fetchRecipeId();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript((id) => {
    sessionStorage.setItem(
      'favoriteEatsSplashAccess',
      JSON.stringify({
        grantedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      }),
    );
    sessionStorage.setItem('selectedRecipeId', String(id));
  }, recipeId);

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.text().includes('[fePaintProbe]')) {
      console.log('browser:', msg.text());
    }
  });

  await page.goto(`${BASE}/recipeEditor.html`, { waitUntil: 'load' });
  await waitForRecipeEditorReady(page);
  await page.waitForTimeout(1500);
  await installDomObserver(page);

  if (WITH_INGREDIENT_EDIT) {
    console.log('Editing first ingredient row (blur commit before save)...');
    const line = page
      .locator('#ingredientsSection .ingredient-line:not(.ingredient-add-cta)')
      .first();
    await line.click();
    await page.waitForSelector('.ingredient-edit-row.editing', { timeout: 30000 });
    const qty = page.locator(
      '.ingredient-edit-row.editing .ingredient-edit-input[data-field="qtymin"]',
    );
    if ((await qty.count()) === 0) {
      throw new Error('No qtymin field on first ingredient row');
    }
    const currentQty = (await qty.inputValue()) || '1';
    await qty.fill(currentQty === '1' ? '2' : '1');
    await qty.blur();
    await page.waitForFunction(
      () => !document.querySelector('.ingredient-edit-row.editing'),
      null,
      { timeout: 30000 },
    );
    await page.waitForTimeout(800);
  } else {
    // Trivial dirty: append zero-width space to title.
    await page.evaluate(() => {
      if (!window.recipeData) throw new Error('recipeData missing');
      window.recipeData.title = `${window.recipeData.title || 'Recipe'}\u200b`;
      const saveBtn = document.getElementById('appBarSaveBtn');
      if (saveBtn) saveBtn.disabled = false;
    });
  }

  const t0 = await page.evaluate(() => {
    if (typeof window.__fePaintLogReset === 'function') window.__fePaintLogReset();
    else window.__fePaintLog = [];
    window.__feYwnDomLog = [];
    return Date.now();
  });

  console.log(`Clicking Save on recipe ${recipeId}${WITH_INGREDIENT_EDIT ? ' (after ingredient edit)' : ''}...`);
  await page.click('#appBarSaveBtn');
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('appBarSaveBtn');
      return btn && btn.disabled === true;
    },
    null,
    { timeout: 120000 },
  );
  // Catch catalog debounced refresh (~320ms) + async YWN.
  await page.waitForTimeout(2000);

  const { log, domLog } = await page.evaluate(() => ({
    log: window.__fePaintLog || [],
    domLog: window.__feYwnDomLog || [],
  }));

  summarize(log, domLog, t0);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
