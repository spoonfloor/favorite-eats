#!/usr/bin/env node
/**
 * Items planner stepper probes (Playwright).
 *
 * Scenarios:
 *   single-plus  — one row: expand, + click, watch collapse vs remote load
 *   cross-row    — A +×5, B +×2, B row ×2 (user repro)
 *   cross-row-fast — same steps, minimal waits (stress hydrate overlap)
 *   user-repro     — arugula +×5, asparagus +×2; assert server + UI qty
 *   all          — all scenarios (default)
 *
 * Usage:
 *   npm run probe:items-stepper
 *   PERF_BASE_URL=http://127.0.0.1:8765 npm run probe:items-stepper -- --scenario cross-row
 *   PERF_HEADED=1 npm run probe:items-stepper
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ITEMS_PATH = 'shopping.html';

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function joinUrl(base, pathname) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(pathname || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    baseUrl: process.env.PERF_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8000',
    skipLogin: false,
    password: process.env.PERF_SPLASH_PASSWORD || '',
    scenario: process.env.PROBE_STEPPER_SCENARIO || 'all',
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--base-url' || a === '-b') out.baseUrl = args[++i] || out.baseUrl;
    else if (a === '--skip-login') out.skipLogin = true;
    else if (a === '--scenario' || a === '-s') out.scenario = args[++i] || out.scenario;
  }
  return out;
}

function rpcKind(url) {
  const u = String(url || '');
  if (u.includes('save_shopping_state')) return 'save_shopping_state';
  if (u.includes('load_shopping_state')) return 'load_shopping_state';
  return null;
}

async function completeSplashLogin(page, password, baseUrl) {
  await page.goto(joinUrl(baseUrl, 'index.html'), {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.fill('#splashPasswordInput', password);
  const verifyResponsePromise = page.waitForResponse(
    (resp) =>
      String(resp.url()).includes('/functions/v1/verify-splash-password') &&
      resp.request().method() === 'POST',
    { timeout: 120000 },
  );
  await page.locator('#splashContinueBtn').click();
  await verifyResponsePromise;
  await page.waitForURL(/recipes\.html/, {
    timeout: 120000,
    waitUntil: 'domcontentloaded',
  });
}

async function waitForItemsReady(page, timeoutMs = 120000) {
  await page.locator('#appBarTitle').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('shoppingList');
      const v = el?.dataset?.fePerfItemsReady;
      return v === '1' || v === '0';
    },
    null,
    { timeout: timeoutMs },
  );
  const marker = await page.locator('#shoppingList').getAttribute('data-fe-perf-items-ready');
  if (marker !== '1') {
    throw new Error(`Items list not ready (data-fe-perf-items-ready=${String(marker)})`);
  }
}

/** @returns {Promise<Array<{ key: string, open: boolean, qty: string, badgeVisible: boolean }>>} */
async function readAllSimpleRowSteppers(page) {
  return page.evaluate(() => {
    const list = document.getElementById('shoppingList');
    if (!list) return [];
    return [...list.querySelectorAll('li[data-shopping-stepper-key]')].map((row) => {
      const key = row.dataset.shoppingStepperKey || '';
      const stepper = row.querySelector('.shopping-list-row-stepper');
      const qtyEl = stepper?.querySelector('.shopping-stepper-qty');
      const badge = row.querySelector('.shopping-list-row-badge');
      const display = stepper ? getComputedStyle(stepper).display : 'none';
      const badgeDisplay = badge ? getComputedStyle(badge).display : 'none';
      return {
        key,
        open: display !== 'none' && display !== '',
        qty: qtyEl?.textContent?.trim() || '',
        badgeVisible: badgeDisplay !== 'none' && badgeDisplay !== '',
      };
    });
  });
}

function rowState(rows, key) {
  const k = String(key || '').trim().toLowerCase();
  return rows.find((r) => String(r.key || '').trim().toLowerCase() === k) || null;
}

function analyzeRpcAfter(events, actionMs) {
  const after = events.filter((e) => e.tMs >= actionMs - 20);
  const saves = after.filter((e) => e.kind === 'save_shopping_state');
  const loads = after.filter((e) => e.kind === 'load_shopping_state');
  return {
    saveCountAfterAction: saves.length,
    loadCountAfterAction: loads.length,
    msToFirstSave: saves[0] ? saves[0].tMs - actionMs : null,
    msToFirstLoad: loads[0] ? loads[0].tMs - actionMs : null,
    events: after.slice(0, 16),
  };
}

async function setupPage(opts) {
  const browser = await chromium.launch({
    headless: process.env.PERF_HEADED !== '1',
  });
  const runDir = path.join(REPO_ROOT, 'perf-artifacts', `stepper-probe-${stamp()}`);
  fs.mkdirSync(runDir, { recursive: true });
  const harPath = path.join(runDir, 'stepper-probe.har');

  const context = await browser.newContext({
    recordHar: { path: harPath, mode: 'full', content: 'omit' },
  });

  if (opts.skipLogin) {
    await context.addInitScript(() => {
      try {
        const grantedAt = Date.now();
        sessionStorage.setItem(
          'favoriteEatsSplashAccess',
          JSON.stringify({
            grantedAt,
            expiresAt: grantedAt + 1000 * 60 * 60 * 12,
          }),
        );
        localStorage.setItem('favoriteEatsPlannerModeOn', '1');
      } catch (_) {}
    });
  }

  const page = await context.newPage();
  const rpcEvents = [];
  const savePayloads = [];
  const t0 = Date.now();
  const markMs = () => Date.now() - t0;

  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('save_shopping_state') || req.method() !== 'POST') return;
    const body = req.postData();
    if (!body) return;
    savePayloads.push({ tMs: markMs(), body });
  });

  page.on('response', (resp) => {
    const kind = rpcKind(resp.url());
    if (!kind) return;
    rpcEvents.push({
      tMs: markMs(),
      kind,
      status: resp.status(),
      method: resp.request().method(),
    });
  });

  if (!opts.skipLogin) {
    await completeSplashLogin(page, opts.password, opts.baseUrl);
  }

  await page.goto(joinUrl(opts.baseUrl, ITEMS_PATH), {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await waitForItemsReady(page);

  return {
    browser,
    context,
    page,
    rpcEvents,
    savePayloads,
    markMs,
    t0,
    runDir,
    harPath,
  };
}

function maxItemQtyInSavePayloads(savePayloads, itemNameLc) {
  const want = String(itemNameLc || '').trim().toLowerCase();
  let max = 0;
  const steps = [];
  for (const entry of savePayloads) {
    try {
      const j = JSON.parse(entry.body);
      const sel = j.state_payload?.plan?.itemSelections || {};
      for (const v of Object.values(sel)) {
        const name = String(v?.name || '').trim().toLowerCase();
        if (name !== want) continue;
        const q = Number(v?.quantity);
        if (!Number.isFinite(q)) continue;
        if (q > max) max = q;
        steps.push({ tMs: entry.tMs, qty: q });
      }
    } catch (_) {}
  }
  return { max, steps };
}

function rowLocatorByItemKey(page, itemName) {
  const key = String(itemName || '').trim().toLowerCase();
  return page.locator(`#shoppingList li[data-shopping-stepper-key="${key}"]`);
}

async function teardown({ browser, context }) {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

/** Planner qty +: + when stepper open, else icon, else badge/row to focus then +. */
async function incrementRowQty(page, rowLocator, times) {
  const plus = rowLocator.locator('.shopping-list-row-stepper .shopping-stepper-btn').last();
  const icon = rowLocator.locator('.shopping-list-row-icon');
  const badge = rowLocator.locator('.shopping-list-row-badge');
  for (let i = 0; i < times; i += 1) {
    if (await plus.isVisible().catch(() => false)) {
      await plus.click();
    } else if (await icon.isVisible().catch(() => false)) {
      await icon.click();
    } else if (await badge.isVisible().catch(() => false)) {
      await badge.click();
      if (await plus.isVisible().catch(() => false)) await plus.click();
    } else {
      await clickRowLabel(page, rowLocator);
      if (await plus.isVisible().catch(() => false)) await plus.click();
    }
    await page.waitForTimeout(100);
  }
}

async function clickRowLabel(page, rowLocator) {
  await rowLocator.locator('.shopping-list-row-label').click();
}

async function runSinglePlusScenario(ctx) {
  const { page, rpcEvents, markMs } = ctx;
  const report = { name: 'single-plus' };

  const row = page.locator('#shoppingList li[data-shopping-stepper-key]').first();
  await row.waitFor({ state: 'visible', timeout: 30000 });

  await clickRowLabel(page, row);
  await page.waitForTimeout(150);
  let rows = await readAllSimpleRowSteppers(page);
  const key = rows[0]?.key;
  if (!rowState(rows, key)?.open) {
    await row.locator('.shopping-list-row-icon').click();
    await page.waitForTimeout(150);
    rows = await readAllSimpleRowSteppers(page);
  }
  if (!rowState(rows, key)?.open) {
    report.error = 'Could not expand first row stepper';
    return { report, failed: true };
  }

  const actionMs = markMs();
  const plus = row.locator('.shopping-list-row-stepper .shopping-stepper-btn').last();
  await plus.click();

  await page.waitForTimeout(500);
  const at500 = await readAllSimpleRowSteppers(page);
  await page.waitForTimeout(1500);
  const at2000 = await readAllSimpleRowSteppers(page);

  const rpc = analyzeRpcAfter(rpcEvents, actionMs);
  const openAt2000 = rowState(at2000, key)?.open ?? false;

  report.actionMs = actionMs;
  report.at500 = rowState(at500, key);
  report.at2000 = rowState(at2000, key);
  report.rpc = rpc;
  report.verdict = {
    ok: openAt2000 && rpc.loadCountAfterAction > 0,
    summary: openAt2000
      ? `Stepper stayed open 2s after + (${rpc.loadCountAfterAction} load(s)).`
      : `Stepper collapsed within 2s after + (loads: ${rpc.loadCountAfterAction}).`,
  };
  return { report, failed: !report.verdict.ok };
}

/**
 * Cross-row (user repro):
 *   A +×5, B +×1 (handoff), B +×1 (qty 2), B row label ×2.
 * Bug: 2nd B row click closes B (toggle) and A stepper re-expands (stale preserve).
 */
async function runCrossRowScenario(ctx) {
  const { page, rpcEvents, markMs } = ctx;
  const report = { name: 'cross-row' };

  const rowLocators = page.locator('#shoppingList li[data-shopping-stepper-key]');
  const count = await rowLocators.count();
  if (count < 2) {
    report.error = `Need at least 2 simple rows, found ${count}`;
    return { report, failed: true };
  }

  const rowA = rowLocators.nth(0);
  const rowB = rowLocators.nth(1);

  const keyA = await rowA.getAttribute('data-shopping-stepper-key');
  const keyB = await rowB.getAttribute('data-shopping-stepper-key');
  report.rowA = keyA;
  report.rowB = keyB;

  let rows = await readAllSimpleRowSteppers(page);

  await incrementRowQty(page, rowA, 5);
  rows = await readAllSimpleRowSteppers(page);
  report.afterAPlus5 = { a: rowState(rows, keyA), b: rowState(rows, keyB) };

  await incrementRowQty(page, rowB, 1);
  rows = await readAllSimpleRowSteppers(page);
  report.afterBPlus1 = { a: rowState(rows, keyA), b: rowState(rows, keyB) };

  const handoffGood =
    report.afterBPlus1.a?.open === false &&
    report.afterBPlus1.b?.open === true &&
    String(report.afterBPlus1.b?.qty) === '1';

  await incrementRowQty(page, rowB, 1);
  rows = await readAllSimpleRowSteppers(page);
  report.afterBPlus2 = { a: rowState(rows, keyA), b: rowState(rows, keyB) };

  const firstRowClickMs = markMs();
  await clickRowLabel(page, rowB);
  await page.waitForTimeout(200);
  rows = await readAllSimpleRowSteppers(page);
  report.afterBRowClick1 = {
    a: rowState(rows, keyA),
    b: rowState(rows, keyB),
  };

  const secondRowClickMs = markMs();
  await clickRowLabel(page, rowB);
  await page.waitForTimeout(200);
  rows = await readAllSimpleRowSteppers(page);
  report.afterBRowClick2Immediate = {
    a: rowState(rows, keyA),
    b: rowState(rows, keyB),
  };

  await page.waitForTimeout(1200);
  rows = await readAllSimpleRowSteppers(page);
  report.afterBRowClick2Settled = {
    a: rowState(rows, keyA),
    b: rowState(rows, keyB),
  };

  report.rpcAfterSecondRowClick = analyzeRpcAfter(rpcEvents, secondRowClickMs);

  const s2i = report.afterBRowClick2Immediate;
  const s2s = report.afterBRowClick2Settled;

  const secondClickToggleClosesB = s2i.b?.open === false;
  const staleFocusBug =
    s2s.a?.open === true && s2s.b?.open === false && secondClickToggleClosesB;

  report.checks = {
    handoffGood,
    secondClickToggleClosesB,
    staleFocusBug,
  };

  report.verdict = {
    ok: handoffGood && !staleFocusBug,
    summary: staleFocusBug
      ? `BUG: after 2nd row-B click, A stepper re-opened (stale focus); B closed via toggle.`
      : handoffGood
        ? secondClickToggleClosesB
          ? 'OK: handoff and 2nd-click toggle; A did not steal focus after settle.'
          : 'Inconclusive: no stale A focus, but 2nd B row click did not toggle B closed.'
        : `Handoff after B+1 failed: ${JSON.stringify(report.afterBPlus1)}`,
  };

  return { report, failed: !report.verdict.ok };
}

/** Same as cross-row but no pauses — tries to overlap A hydrates with B focus. */
async function runCrossRowFastScenario(ctx) {
  const { page, rpcEvents, markMs } = ctx;
  const report = { name: 'cross-row-fast' };

  const rowLocators = page.locator('#shoppingList li[data-shopping-stepper-key]');
  if ((await rowLocators.count()) < 2) {
    report.error = 'Need at least 2 simple rows';
    return { report, failed: true };
  }

  const rowA = rowLocators.nth(0);
  const rowB = rowLocators.nth(1);
  const keyA = await rowA.getAttribute('data-shopping-stepper-key');
  const keyB = await rowB.getAttribute('data-shopping-stepper-key');
  report.rowA = keyA;
  report.rowB = keyB;

  await incrementRowQty(page, rowA, 5);
  await incrementRowQty(page, rowB, 1);
  await incrementRowQty(page, rowB, 1);

  let rows = await readAllSimpleRowSteppers(page);
  report.afterIncrements = { a: rowState(rows, keyA), b: rowState(rows, keyB) };

  await clickRowLabel(page, rowB);
  await clickRowLabel(page, rowB);

  const settleMs = markMs();
  await page.waitForTimeout(1500);
  rows = await readAllSimpleRowSteppers(page);
  report.afterSettle = { a: rowState(rows, keyA), b: rowState(rows, keyB) };
  report.rpc = analyzeRpcAfter(rpcEvents, settleMs - 1500);

  const staleFocusBug =
    report.afterSettle.a?.open === true && report.afterSettle.b?.open === false;

  report.checks = { staleFocusBug };
  report.verdict = {
    ok: !staleFocusBug,
    summary: staleFocusBug
      ? `BUG: A stepper stole focus after rapid cross-row (A open, B badge).`
      : 'No stale A focus after fast cross-row + double row click.',
  };
  return { report, failed: !report.verdict.ok };
}

/** User HAR repro: arugula +×5, asparagus +×2; both must appear in save payloads. */
async function runUserReproScenario(ctx) {
  const { page, savePayloads, rpcEvents, markMs } = ctx;
  const report = { name: 'user-repro' };
  const arugulaKey = 'arugula';
  const asparagusKey = 'asparagus';

  const rowArugula = rowLocatorByItemKey(page, arugulaKey);
  const rowAsparagus = rowLocatorByItemKey(page, asparagusKey);

  const saveCountBefore = savePayloads.length;
  const tStart = markMs();

  try {
    await rowArugula.waitFor({ state: 'visible', timeout: 30000 });
    await rowAsparagus.waitFor({ state: 'visible', timeout: 30000 });
  } catch (_) {
    report.error = 'arugula or asparagus row not in #shoppingList (check catalog / filters)';
    return { report, failed: true };
  }

  await incrementRowQty(page, rowArugula, 5);
  await incrementRowQty(page, rowAsparagus, 2);
  await page.waitForTimeout(2000);

  const sessionSaves = savePayloads.slice(saveCountBefore);
  const arugulaServer = maxItemQtyInSavePayloads(sessionSaves, arugulaKey);
  const asparagusServer = maxItemQtyInSavePayloads(sessionSaves, asparagusKey);

  let rows = await readAllSimpleRowSteppers(page);
  const uiArugula = rowState(rows, arugulaKey);
  const uiAsparagus = rowState(rows, asparagusKey);

  report.server = {
    arugulaMaxQty: arugulaServer.max,
    asparagusMaxQty: asparagusServer.max,
    saveCount: sessionSaves.length,
  };
  report.ui = { arugula: uiArugula, asparagus: uiAsparagus };
  report.rpc = analyzeRpcAfter(rpcEvents, tStart);

  const arugulaOk = arugulaServer.max >= 5;
  const asparagusOk = asparagusServer.max >= 2;
  const uiArugulaOk = String(uiArugula?.qty) === '5';
  const uiAsparagusOk = String(uiAsparagus?.qty) === '2';

  report.checks = {
    arugulaOnServer: arugulaOk,
    asparagusOnServer: asparagusOk,
    uiArugulaQty5: uiArugulaOk,
    uiAsparagusQty2: uiAsparagusOk,
  };

  report.verdict = {
    ok: arugulaOk && asparagusOk && uiArugulaOk && uiAsparagusOk,
    summary:
      arugulaOk && asparagusOk
        ? uiArugulaOk && uiAsparagusOk
          ? `OK: server arugula=${arugulaServer.max} asparagus=${asparagusServer.max}; UI matches.`
          : `PARTIAL: server ok (arugula=${arugulaServer.max}, asparagus=${asparagusServer.max}) but UI arugula=${uiArugula?.qty} asparagus=${uiAsparagus?.qty}.`
        : `BUG: server max arugula=${arugulaServer.max} (want 5), asparagus=${asparagusServer.max} (want 2); ${sessionSaves.length} saves.`,
  };

  return { report, failed: !report.verdict.ok };
}

async function main() {
  const opts = parseArgs();
  if (opts.help) {
    console.log(`Usage: node scripts/probe-items-stepper-collapse.mjs [options]
  --scenario, -s   single-plus | cross-row | cross-row-fast | user-repro | all
  --base-url, -b   Origin
  --skip-login     Seed splash + planner localStorage
`);
    process.exit(0);
  }

  if (!opts.skipLogin && !opts.password) {
    console.error('Set PERF_SPLASH_PASSWORD or pass --skip-login.');
    process.exit(1);
  }

  const wantSingle = opts.scenario === 'single-plus' || opts.scenario === 'all';
  const wantCross = opts.scenario === 'cross-row' || opts.scenario === 'all';
  const wantCrossFast =
    opts.scenario === 'cross-row-fast' || opts.scenario === 'all';
  const wantUserRepro =
    opts.scenario === 'user-repro' || opts.scenario === 'all';

  let ctx;
  try {
    ctx = await setupPage(opts);
    const results = [];

    if (wantSingle) {
      results.push(await runSinglePlusScenario(ctx));
    }
    if (wantCross) {
      results.push(await runCrossRowScenario(ctx));
    }
    if (wantCrossFast) {
      results.push(await runCrossRowFastScenario(ctx));
    }
    if (wantUserRepro) {
      results.push(await runUserReproScenario(ctx));
    }

    const outPath = path.join(ctx.runDir, 'stepper-probe.json');
    const payload = {
      baseUrl: opts.baseUrl,
      scenario: opts.scenario,
      results: results.map((r) => r.report),
      allRpcEvents: ctx.rpcEvents,
      savePayloadCount: ctx.savePayloads.length,
    };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

    for (const r of results) {
      console.log(`\n=== ${r.report.name} ===`);
      console.log(JSON.stringify(r.report.verdict, null, 2));
      if (r.report.checks) console.log('checks:', JSON.stringify(r.report.checks));
      if (r.report.afterBRowClick2Settled) {
        console.log('settled:', JSON.stringify(r.report.afterBRowClick2Settled));
      }
      if (r.report.server) {
        console.log('server:', JSON.stringify(r.report.server));
        console.log('ui:', JSON.stringify(r.report.ui));
      }
    }
    console.log('\nartifact:', outPath);
    console.log('har:', ctx.harPath);

    const anyFailed = results.some((r) => r.failed);
    process.exit(anyFailed ? 1 : 0);
  } finally {
    if (ctx) await teardown(ctx);
  }
}

main().catch((err) => {
  console.error('[probe-items-stepper-collapse]', err);
  process.exit(1);
});
