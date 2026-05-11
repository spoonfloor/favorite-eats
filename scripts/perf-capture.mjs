#!/usr/bin/env node
/**
 * Synthetic perf capture: Chromium + HAR + Playwright trace + basic Navigation Timing / Paint.
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

async function collectTimings(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
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
  PERF_SPLASH_PASSWORD   Splash password for full capture through index.html
  PERF_TOUR              Comma-separated HTML paths (overrides default tour list)
`);
    process.exit(0);
  }

  const runDir = path.join(REPO_ROOT, 'perf-artifacts', `run-${stamp()}`);
  fs.mkdirSync(runDir, { recursive: true });

  const harPath = path.join(runDir, 'network.har');
  const tracePath = path.join(runDir, 'trace.zip');
  const timingsPath = path.join(runDir, 'timings.json');

  const browser = await chromium.launch({ headless: true });
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
        for (const pth of tourPaths) {
          await page.goto(joinUrl(opts.baseUrl, pth), {
            waitUntil: 'networkidle',
            timeout: 90000,
          });
          pages.push({ path: pth, ...(await collectTimings(page)) });
        }
        fs.writeFileSync(timingsPath, `${JSON.stringify({ pages }, null, 2)}\n`);
      } else {
        await page.goto(joinUrl(opts.baseUrl, opts.targetPath), {
          waitUntil: 'networkidle',
          timeout: 60000,
        });
        const timings = await collectTimings(page);
        fs.writeFileSync(timingsPath, `${JSON.stringify(timings, null, 2)}\n`);
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
      await page.goto(joinUrl(opts.baseUrl, 'index.html'), {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.fill('#splashPasswordInput', opts.password);
      await Promise.all([
        page.waitForURL(/recipes\.html/, { timeout: 45000 }),
        page.getByRole('button', { name: 'Continue' }).click(),
      ]);
      const pages = [];
      for (const pth of tourPaths) {
        await page.goto(joinUrl(opts.baseUrl, pth), {
          waitUntil: 'networkidle',
          timeout: 90000,
        });
        pages.push({ path: pth, ...(await collectTimings(page)) });
      }
      fs.writeFileSync(timingsPath, `${JSON.stringify({ pages }, null, 2)}\n`);
    } else {
      await page.goto(joinUrl(opts.baseUrl, 'index.html'), {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.fill('#splashPasswordInput', opts.password);
      await Promise.all([
        page.waitForURL(/recipes\.html/, { timeout: 45000 }),
        page.getByRole('button', { name: 'Continue' }).click(),
      ]);
      const dest = joinUrl(opts.baseUrl, opts.targetPath);
      const file = opts.targetPath.split('/').pop() || '';
      const onTarget =
        file && (page.url().endsWith(file) || page.url().includes(`/${file}`));
      if (!onTarget) {
        await page.goto(dest, { waitUntil: 'networkidle', timeout: 60000 });
      } else {
        await page.waitForLoadState('networkidle');
      }
      const timings = await collectTimings(page);
      fs.writeFileSync(timingsPath, `${JSON.stringify(timings, null, 2)}\n`);
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
