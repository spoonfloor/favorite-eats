#!/usr/bin/env node
/**
 * Items page (`shopping.html`) acid-test: navigation → app bar + first catalog render,
 * then double-rAF sample from Navigation Timing origin (same spirit as perf-capture).
 *
 * Requires `#shoppingList[data-fe-perf-items-ready="1"]` (set in main.js after initial
 * `applyShoppingFilters()` on success, or `0` on Supabase list failure).
 *
 * Usage:
 *   PERF_SPLASH_PASSWORD=secret npm run perf:items
 *   PERF_SPLASH_PASSWORD=secret npm run perf:items -- --base-url http://127.0.0.1:4173
 *   npm run perf:items -- --skip-login --base-url http://127.0.0.1:4173
 *
 * Env:
 *   PERF_BASE_URL / BASE_URL — default http://127.0.0.1:8000
 *   PERF_SPLASH_PASSWORD — splash gate (omit with --skip-login)
 *   PERF_ITEMS_RUNS — repeat navigations in one session (default 1). Second+ measures warm repeat.
 *   PERF_ITEMS_BUDGET_MS — if set, exit 1 when feNavToItemsReadyMs exceeds this number
 *   PERF_HEADED=1 — headed Chromium
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ITEMS_PATH = 'shopping.html';
const SPLASH_LOGIN_TIMEOUT_MS = 120000;

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
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--base-url' || a === '-b') out.baseUrl = args[++i] || out.baseUrl;
    else if (a === '--skip-login') out.skipLogin = true;
  }
  return out;
}

async function completeSplashLogin(page, password, baseUrl) {
  await page.goto(joinUrl(baseUrl, 'index.html'), {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.fill('#splashPasswordInput', password);

  const verifyResponsePromise = page.waitForResponse(
    (resp) =>
      String(resp.url()).includes('/functions/v1/verify-splash-password') &&
      resp.request().method() === 'POST',
    { timeout: SPLASH_LOGIN_TIMEOUT_MS },
  );

  await page.locator('#splashContinueBtn').click();

  try {
    const resp = await verifyResponsePromise;
    const status = resp.status();
    const raw = await resp.text().catch(() => '');
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    console.log('[perf-items-acid] verify-splash-password', {
      status,
      okFlag: !!(payload && payload.ok === true),
      rawLen: raw.length,
    });
  } catch (e) {
    console.warn('[perf-items-acid] verify listener:', String(e?.message || e));
  }

  await page.waitForURL(/recipes\.html/, {
    timeout: SPLASH_LOGIN_TIMEOUT_MS,
    waitUntil: 'domcontentloaded',
  });
}

async function sampleItemsReadyMs(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const navs = performance.getEntriesByType('navigation');
            const nav =
              navs && navs.length > 0 ? navs[navs.length - 1] : null;
            const ms = nav ? performance.now() - nav.startTime : performance.now();
            resolve({ feNavToItemsReadyMs: ms });
          });
        });
      }),
  );
}

function parseIsoMs(s) {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Summarize Supabase traffic for the HAR page whose title ends with shopping.html.
 */
function headerValue(entry, headerName) {
  const want = String(headerName || '').toLowerCase();
  for (const h of entry?.request?.headers || []) {
    if (String(h?.name || '').toLowerCase() === want) return String(h?.value || '');
  }
  return '';
}

/**
 * Supabase traffic for the Items page. GETs from the page often have
 * `Referer: .../shopping.html`; `fetch()` POSTs may only send `Referer: .../` so we also
 * include requests at or after the last document navigation to `shopping.html`.
 */
function summarizeShoppingHar(harText) {
  const har = JSON.parse(harText);
  const pages = har?.log?.pages || [];
  const entries = har?.log?.entries || [];

  let lastShoppingNavMs = 0;
  for (const e of entries) {
    const url = e?.request?.url || '';
    const method = String(e?.request?.method || 'GET').toUpperCase();
    if (method !== 'GET') continue;
    if (!/\/shopping\.html(\?|$)/.test(url)) continue;
    const t = parseIsoMs(e?.startedDateTime);
    if (t > lastShoppingNavMs) lastShoppingNavMs = t;
  }

  const rows = [];
  for (const e of entries) {
    const url = e?.request?.url || '';
    if (!url.includes('supabase.co')) continue;
    const ref = headerValue(e, 'referer');
    const t0 = parseIsoMs(e?.startedDateTime);
    const fromReferer = ref.includes('shopping.html');
    const fromTimeline = lastShoppingNavMs > 0 && t0 >= lastShoppingNavMs - 1;
    if (!fromReferer && !fromTimeline) continue;

    const dt = Number(e?.time || 0);
    let pathname = '';
    try {
      pathname = new URL(url).pathname;
    } catch {
      pathname = url;
    }
    const isWs = pathname.includes('/realtime/v1/websocket');
    rows.push({ t0, t1: t0 + dt, dt, pathname, isWs });
  }
  rows.sort((a, b) => a.t0 - b.t0);
  const counts = {};
  let loadShoppingStateN = 0;
  for (const r of rows) {
    counts[r.pathname] = (counts[r.pathname] || 0) + 1;
    if (r.pathname.includes('/rpc/load_shopping_state')) loadShoppingStateN += 1;
  }
  const nonWs = rows.filter((r) => !r.isWs);
  const tMin = nonWs.length ? Math.min(...nonWs.map((r) => r.t0)) : 0;
  const tMax = nonWs.length ? Math.max(...nonWs.map((r) => r.t1)) : 0;
  const supabaseWallMsNoWs = tMax > tMin ? tMax - tMin : 0;

  return {
    harPagesSample: pages.map((p) => ({ id: p?.id, title: p?.title })),
    lastShoppingDocumentNavMs: lastShoppingNavMs || null,
    supabaseRequestCount: rows.length,
    supabaseWallMsNoWs,
    loadShoppingStateRpcCount: loadShoppingStateN,
    supabasePathCounts: counts,
    harNote:
      'supabase_rows_after_last_shopping.html_GET_or_referer_shopping.html',
  };
}

async function gotoItemsAndMeasure(page, baseUrl, { timeoutMs = 120000 } = {}) {
  const dest = joinUrl(baseUrl, ITEMS_PATH);
  await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

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
  if (marker === '0') {
    throw new Error(
      'Items page set data-fe-perf-items-ready=0 (listShoppingItems failed or no data service).',
    );
  }
  if (marker !== '1') {
    throw new Error(`Unexpected data-fe-perf-items-ready=${String(marker)}`);
  }

  const sampled = await sampleItemsReadyMs(page);
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});

  return {
    path: ITEMS_PATH,
    hrefAfter: page.url(),
    feNavToItemsReadyMs: sampled.feNavToItemsReadyMs,
    feItemsGateOk: true,
  };
}

async function main() {
  const opts = parseArgs();
  if (opts.help) {
    console.log(`Usage: node scripts/perf-items-acid.mjs [options]

Options:
  --base-url, -b   Site origin (default PERF_BASE_URL / BASE_URL / http://127.0.0.1:8000)
  --skip-login     Open shopping.html directly (no splash; may redirect if gated)

Env:
  PERF_SPLASH_PASSWORD   Required unless --skip-login
  PERF_ITEMS_RUNS        Default 1; set 2 to measure a warm second navigation in-session
  PERF_ITEMS_BUDGET_MS   Fail process if feNavToItemsReadyMs exceeds this value
`);
    process.exit(0);
  }

  const runs = Math.max(1, Math.min(10, Number(process.env.PERF_ITEMS_RUNS || 1) || 1));
  const budget = process.env.PERF_ITEMS_BUDGET_MS
    ? Number(process.env.PERF_ITEMS_BUDGET_MS)
    : null;

  if (!opts.skipLogin && !opts.password) {
    console.error(
      '[perf-items-acid] Set PERF_SPLASH_PASSWORD or pass --skip-login for ungated local runs.',
    );
    process.exit(1);
  }

  const runDir = path.join(REPO_ROOT, 'perf-artifacts', `run-${stamp()}`);
  fs.mkdirSync(runDir, { recursive: true });
  const harPath = path.join(runDir, 'items-network.har');
  const outPath = path.join(runDir, 'items-acid.json');

  const browser = await chromium.launch({
    headless: process.env.PERF_HEADED === '1' ? false : true,
  });
  const context = await browser.newContext({
    recordHar: { path: harPath, mode: 'full', content: 'omit' },
  });
  const page = await context.newPage();

  try {
    if (!opts.skipLogin) {
      await completeSplashLogin(page, opts.password, opts.baseUrl);
    }

    const navigations = [];
    for (let i = 0; i < runs; i += 1) {
      const label = i === 0 ? 'cold' : `warm-${i}`;
      if (i > 0) {
        await page.goto(joinUrl(opts.baseUrl, 'recipes.html'), {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        });
      }
      const row = await gotoItemsAndMeasure(page, opts.baseUrl);
      navigations.push({ run: i, label, ...row });
      if (row.feNavToItemsReadyMs != null) {
        console.log(
          `[perf-items-acid] ${label} feNavToItemsReadyMs=${row.feNavToItemsReadyMs.toFixed(1)}`,
        );
      }
    }

    await context.close();
    await browser.close();

    let harSummary = { note: 'har_missing' };
    if (fs.existsSync(harPath)) {
      harSummary = summarizeShoppingHar(fs.readFileSync(harPath, 'utf8'));
      harSummary.runsNote =
        runs > 1
          ? 'multiple_items_visits_may_share_referer_timeline_order_in_one_har'
          : 'single_items_visit';
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      baseUrl: opts.baseUrl,
      runs,
      navigations,
      har: harSummary,
    };
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

    console.log('[perf-items-acid] Wrote:', outPath);
    console.log('[perf-items-acid] HAR:', harPath);

    const lastMs = navigations[navigations.length - 1]?.feNavToItemsReadyMs;
    const worstMs = Math.max(
      ...navigations.map((n) => (n.feNavToItemsReadyMs != null ? n.feNavToItemsReadyMs : 0)),
    );
    if (budget != null && Number.isFinite(budget) && worstMs > budget) {
      console.error(
        `[perf-items-acid] BUDGET FAIL: max feNavToItemsReadyMs=${worstMs.toFixed(1)} > PERF_ITEMS_BUDGET_MS=${budget} (last run=${lastMs?.toFixed(1)})`,
      );
      process.exit(1);
    }
  } catch (err) {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    console.error('[perf-items-acid] Failed:', err);
    process.exit(1);
  }
}

main();
