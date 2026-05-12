#!/usr/bin/env node
/**
 * Synthetic perf capture: Chromium + HAR + Playwright trace + basic Navigation Timing / Paint.
 *
 * Also records **feNavToShellPaintMs**: ms from navigation `startTime` to when the app bar
 * (`#appBarTitle`) and page-specific main list/editor chrome are visible, sampled after
 * double `requestAnimationFrame` (approx. next frame after layout).
 *
 * Usage:
 *   npm run perf:capture
 *   PERF_SPLASH_PASSWORD=... npm run perf:capture -- --base-url http://127.0.0.1:8000 --target recipes.html
 *   PERF_SPLASH_PASSWORD=... npm run perf:capture -- --base-url https://YOUR.pages.url/repo/
 *
 * Env:
 *   PERF_BASE_URL / BASE_URL — default http://127.0.0.1:8000
 *   PERF_SPLASH_PASSWORD — unlock protected pages (omit to capture index.html load only)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** Default multi-page pass (after splash login). Order matters for shared-session realism. */
const DEFAULT_TOUR = ['recipes.html', 'shoppingList.html', 'recipeEditor.html'];

function parseTourFromEnv() {
  const raw = process.env.PERF_TOUR;
  if (!raw || !String(raw).trim()) return null;
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    baseUrl: process.env.PERF_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8000',
    targetPath: 'recipes.html',
    skipLogin: false,
    password: process.env.PERF_SPLASH_PASSWORD || '',
    tour: false,
    tourPaths: parseTourFromEnv(),
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--base-url' || a === '-b') out.baseUrl = args[++i] || out.baseUrl;
    else if (a === '--target' || a === '-t') out.targetPath = args[++i] || out.targetPath;
    else if (a === '--skip-login') out.skipLogin = true;
    else if (a === '--tour') out.tour = true;
  }
  return out;
}

function joinUrl(base, pathname) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(pathname || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function shellGateForHtmlPath(htmlPath) {
  const file = String(htmlPath || '').split('/').pop().toLowerCase() || '';
  if (file === 'recipes.html') {
    return {
      label: 'recipeListFirstRow',
      content: '#recipeList > li',
    };
  }
  if (file === 'shoppinglist.html') {
    return {
      label: 'shoppingListFirstRow',
      content: '#shoppingListOutput > li',
    };
  }
  if (file === 'shopping.html') {
    return {
      label: 'shoppingItemsReady',
      content: '#shoppingList[data-fe-perf-items-ready="1"]',
    };
  }
  if (file === 'recipeeditor.html') {
    return {
      label: 'recipeEditorTitle',
      content: '#recipeTitle',
    };
  }
  return {
    label: 'mainPageMain',
    content: 'main.page-main',
  };
}

async function sampleShellPaintMs(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            const ms = nav ? performance.now() - nav.startTime : performance.now();
            resolve({ feNavToShellPaintMs: ms });
          });
        });
      }),
  );
}

async function readFirstRecipeRowStepperKey(page) {
  return page.evaluate(() => {
    const li = document.querySelector('#recipeList li[data-recipe-row-stepper-key]');
    const k = li?.getAttribute('data-recipe-row-stepper-key');
    return k ? String(k).trim() : '';
  });
}

async function seedRecipeEditorSession(page, recipeId) {
  if (!recipeId) return;
  await page.evaluate((id) => {
    try {
      sessionStorage.setItem('selectedRecipeId', String(id));
      sessionStorage.removeItem('selectedRecipeIsNew');
    } catch (_) {}
  }, recipeId);
}

async function collectTimings(page) {
  return page.evaluate(() => {
    const navs = performance.getEntriesByType('navigation');
    const nav =
      navs && navs.length > 0 ? navs[navs.length - 1] : null;
    const paint = performance.getEntriesByType('paint');
    const resources = performance.getEntriesByType('resource').length;
    let navigation = null;
    if (nav && typeof nav.toJSON === 'function') {
      const j = nav.toJSON();
      navigation = {
        name: j.name,
        duration: j.duration,
        domContentLoadedEventEnd: j.domContentLoadedEventEnd,
        loadEventEnd: j.loadEventEnd,
        fetchStart: j.fetchStart,
        transferSize: j.transferSize,
      };
    }
    return {
      href: location.href,
      navigation,
      paint: paint.map((e) => ({ name: e.name, startTime: e.startTime })),
      resourceEntryCount: resources,
    };
  });
}

/** Splash must finish Supabase verify + redirect; wrong password never leaves index.html. */
const SPLASH_LOGIN_TIMEOUT_MS = 120000;

/**
 * Full navigation → wait app bar + content row → sample paint-aligned time → networkidle → Navigation Timing.
 */

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

  let verifyMeta = { note: 'pending' };
  try {
    const resp = await verifyResponsePromise;
    const status = resp.status();
    const raw = await resp.text().catch(() => '');
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch (_) {
      payload = null;
    }
    verifyMeta = {
      status,
      okFlag: !!(payload && payload.ok === true),
      payload,
      rawLen: raw.length,
    };
    console.log('[perf-capture] verify-splash-password', verifyMeta);
  } catch (e) {
    verifyMeta = { error: String(e?.message || e) };
    console.warn(
      '[perf-capture] verify-splash-password listener failed (still waiting for recipes):',
      verifyMeta.error,
    );
  }

  try {
    await page.waitForURL(/recipes\.html/, {
      timeout: SPLASH_LOGIN_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
  } catch (err) {
    const errText = await page
      .locator('#splashGateError')
      .innerText()
      .catch(() => '');
    const url = page.url();
    const hint =
      errText && String(errText).trim()
        ? `Splash message: ${String(errText).trim()}`
        : 'Timed out before recipes.html (wrong password, verify network, or storage blocked session).';
    throw new Error(
      `Splash did not reach recipes.html within ${SPLASH_LOGIN_TIMEOUT_MS}ms. ` +
        `Current URL: ${url}. ${hint} ` +
        `Underlying: ${err?.message || err} verifyMeta=${JSON.stringify(verifyMeta)}`,
    );
  }
}

async function gotoAndCollectPageTimings(page, destUrl, pathLabel, { timeoutMs = 90000 } = {}) {
  const file = String(pathLabel || '').split('/').pop() || '';
  const gate = shellGateForHtmlPath(file);
  const shellMeta = {
    feNavToShellPaintMs: null,
    feShellGate: gate.label,
    feShellGateOk: false,
    feShellGateError: null,
    hrefAfterShell: null,
  };

  await page.goto(destUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

  try {
    await page.locator('#appBarTitle').waitFor({ state: 'visible', timeout: timeoutMs });
    await page.locator(gate.content).first().waitFor({ state: 'visible', timeout: timeoutMs });
    shellMeta.hrefAfterShell = page.url();
    const sampled = await sampleShellPaintMs(page);
    shellMeta.feNavToShellPaintMs = sampled.feNavToShellPaintMs;
    shellMeta.feShellGateOk = true;
  } catch (err) {
    shellMeta.feShellGateError = String(err?.message || err);
    shellMeta.hrefAfterShell = page.url();
  }

  await page.waitForLoadState('networkidle', { timeout: timeoutMs });
  const timings = await collectTimings(page);
  return {
    path: pathLabel,
    ...shellMeta,
    ...timings,
  };
}

async function main() {
  const opts = parseArgs();
  if (opts.help) {
    console.log(`Usage: node scripts/perf-capture.mjs [options]

Options:
  --base-url, -b   Site origin (default PERF_BASE_URL / BASE_URL / http://127.0.0.1:8000)
  --target, -t     Path after login (default recipes.html); ignored when --tour
  --tour           After login, visit DEFAULT_TOUR pages (see PERF_TOUR)
  --skip-login       Go straight to --target (no splash; gated pages may redirect)

Env:
  PERF_SPLASH_PASSWORD   Must match the live Supabase verify-splash-password function
  PERF_TOUR              Comma-separated HTML paths (overrides default tour list)
  PERF_HEADED=1          Run Chromium headed (debug splash / storage issues)

Metrics (timings.json per page when applicable):
  feNavToShellPaintMs   Ms from navigation time origin until shell+content visible (double rAF)
  feShellGate           Which DOM gate was used (recipe list row, shopping row, editor title, …)
  feShellGateOk         Whether both #appBarTitle and the content gate matched
  feShellGateError     Playwright error message when the gate timed out
`);
    process.exit(0);
  }

  const runDir = path.join(REPO_ROOT, 'perf-artifacts', `run-${stamp()}`);
  fs.mkdirSync(runDir, { recursive: true });

  const harPath = path.join(runDir, 'network.har');
  const tracePath = path.join(runDir, 'trace.zip');
  const timingsPath = path.join(runDir, 'timings.json');

  const browser = await chromium.launch({
    headless: process.env.PERF_HEADED === '1' ? false : true,
  });
  const context = await browser.newContext({
    recordHar: { path: harPath, mode: 'full', content: 'attach' },
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();

  try {
    const tourPaths = opts.tour ? opts.tourPaths || DEFAULT_TOUR : null;

    if (opts.skipLogin) {
      if (tourPaths && tourPaths.length) {
        const pages = [];
        let lastRecipesFirstRowId = '';
        for (const pth of tourPaths) {
          const file = pth.split('/').pop() || '';
          if (file.toLowerCase() === 'recipeeditor.html' && lastRecipesFirstRowId) {
            await seedRecipeEditorSession(page, lastRecipesFirstRowId);
          }
          const row = await gotoAndCollectPageTimings(
            page,
            joinUrl(opts.baseUrl, pth),
            pth,
            { timeoutMs: 90000 },
          );
          pages.push(row);
          if (file.toLowerCase() === 'recipes.html' && row.feShellGateOk) {
            lastRecipesFirstRowId = await readFirstRecipeRowStepperKey(page);
          }
          if (row.feNavToShellPaintMs != null) {
            console.log(
              `[perf-capture] ${pth} feNavToShellPaintMs=${row.feNavToShellPaintMs.toFixed(1)} (${row.feShellGate})`,
            );
          } else {
            console.warn(`[perf-capture] ${pth} shell gate failed: ${row.feShellGateError || 'unknown'}`);
          }
        }
        fs.writeFileSync(timingsPath, `${JSON.stringify({ pages }, null, 2)}\n`);
      } else {
        const timings = await gotoAndCollectPageTimings(
          page,
          joinUrl(opts.baseUrl, opts.targetPath),
          opts.targetPath,
          { timeoutMs: 60000 },
        );
        fs.writeFileSync(timingsPath, `${JSON.stringify(timings, null, 2)}\n`);
        if (timings.feNavToShellPaintMs != null) {
          console.log(
            `[perf-capture] ${opts.targetPath} feNavToShellPaintMs=${timings.feNavToShellPaintMs.toFixed(1)} (${timings.feShellGate})`,
          );
        }
      }
    } else if (!opts.password) {
      console.warn(
        '[perf-capture] PERF_SPLASH_PASSWORD not set — loading index.html only (splash). Set PERF_SPLASH_PASSWORD for post-login pages.',
      );
      await page.goto(joinUrl(opts.baseUrl, 'index.html'), {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      const timings = await collectTimings(page);
      fs.writeFileSync(timingsPath, `${JSON.stringify(timings, null, 2)}\n`);
    } else if (opts.tour && tourPaths && tourPaths.length) {
      await completeSplashLogin(page, opts.password, opts.baseUrl);
      const pages = [];
      let lastRecipesFirstRowId = '';
      for (const pth of tourPaths) {
        const file = pth.split('/').pop() || '';
        if (file.toLowerCase() === 'recipeeditor.html' && lastRecipesFirstRowId) {
          await seedRecipeEditorSession(page, lastRecipesFirstRowId);
        }
        const row = await gotoAndCollectPageTimings(
          page,
          joinUrl(opts.baseUrl, pth),
          pth,
          { timeoutMs: 90000 },
        );
        pages.push(row);
        if (file.toLowerCase() === 'recipes.html' && row.feShellGateOk) {
          lastRecipesFirstRowId = await readFirstRecipeRowStepperKey(page);
        }
        if (row.feNavToShellPaintMs != null) {
          console.log(
            `[perf-capture] ${pth} feNavToShellPaintMs=${row.feNavToShellPaintMs.toFixed(1)} (${row.feShellGate})`,
          );
        } else {
          console.warn(`[perf-capture] ${pth} shell gate failed: ${row.feShellGateError || 'unknown'}`);
        }
      }
      fs.writeFileSync(timingsPath, `${JSON.stringify({ pages }, null, 2)}\n`);
    } else {
      await completeSplashLogin(page, opts.password, opts.baseUrl);
      const dest = joinUrl(opts.baseUrl, opts.targetPath);
      const file = opts.targetPath.split('/').pop() || '';
      const onTarget =
        file && (page.url().endsWith(file) || page.url().includes(`/${file}`));
      let timings;
      if (!onTarget) {
        timings = await gotoAndCollectPageTimings(page, dest, opts.targetPath, {
          timeoutMs: 60000,
        });
      } else {
        await page.waitForLoadState('networkidle', { timeout: 60000 });
        timings = {
          path: opts.targetPath,
          feNavToShellPaintMs: null,
          feShellGate: null,
          feShellGateOk: false,
          feShellGateSkipped: 'already-on-target-after-login',
          ...(await collectTimings(page)),
        };
      }
      fs.writeFileSync(timingsPath, `${JSON.stringify(timings, null, 2)}\n`);
      if (timings.feNavToShellPaintMs != null) {
        console.log(
          `[perf-capture] ${opts.targetPath} feNavToShellPaintMs=${timings.feNavToShellPaintMs.toFixed(1)} (${timings.feShellGate})`,
        );
      }
    }

    await context.tracing.stop({ path: tracePath });
    await context.close();
    await browser.close();

    console.log('[perf-capture] Artifacts written:');
    console.log(`  ${harPath}`);
    console.log(`  ${tracePath}`);
    console.log(`  ${timingsPath}`);
    console.log('[perf-capture] View trace: npx playwright show-trace', tracePath);
  } catch (err) {
    await context.tracing.stop({ path: tracePath }).catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    console.error('[perf-capture] Failed:', err);
    process.exit(1);
  }
}

main();
