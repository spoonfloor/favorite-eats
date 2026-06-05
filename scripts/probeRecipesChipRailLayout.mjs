#!/usr/bin/env node
/**
 * Chip rail layout probe: static + post-scroll alignment (padding, dock, list).
 *
 * Usage:
 *   npm run probe:chip-rail-layout
 *   npm run probe:chip-rail-layout -- http://127.0.0.1:4173/recipes.html
 *   npm run probe:chip-rail-layout -- --tour --base-url http://127.0.0.1:4173
 *   npm run probe:chip-rail-layout -- --planner
 *
 * Env: PERF_SPLASH_PASSWORD optional (probe seeds splash access like other probes).
 */
import { chromium } from 'playwright';

const DEFAULT_BASE = 'http://127.0.0.1:4173';
const DOCK_TOP_STABLE_TOLERANCE_PX = 1;

const TOUR = [
  { path: 'recipes.html', listSelector: '#recipeList' },
  { path: 'shopping.html', listSelector: '#shoppingList' },
  { path: 'shoppingList.html', listSelector: '#shoppingListOutput' },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    baseUrl: DEFAULT_BASE,
    targets: [],
    planner: false,
    tour: false,
    failOnRegression: true,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--planner') out.planner = true;
    else if (a === '--tour') out.tour = true;
    else if (a === '--no-fail') out.failOnRegression = false;
    else if (a === '--base-url' || a === '-b') out.baseUrl = args[++i] || out.baseUrl;
    else if (a.startsWith('http://') || a.startsWith('https://')) {
      out.targets.push(a);
    } else if (a.endsWith('.html')) {
      out.targets.push(joinUrl(out.baseUrl, a));
    }
  }
  if (!out.targets.length) {
    out.targets.push(joinUrl(out.baseUrl, 'recipes.html'));
  }
  if (out.tour) {
    out.targets = TOUR.map((t) => joinUrl(out.baseUrl, t.path));
  }
  return out;
}

function joinUrl(base, pathname) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(pathname || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

function tourMetaForUrl(url) {
  const file = String(url).split('/').pop()?.toLowerCase() || '';
  return (
    TOUR.find((t) => t.path.toLowerCase() === file) || {
      path: file,
      listSelector: null,
    }
  );
}

async function collectScrollSamples(page) {
  return page.evaluate(async () => {
    const listSelector =
      document.querySelector('#recipeList') ? '#recipeList'
      : document.querySelector('#shoppingList') ? '#shoppingList'
      : document.querySelector('#shoppingListOutput') ? '#shoppingListOutput'
      : null;

    const readListChromeGapPx = () => {
      try {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(
          '--page-main-chrome-to-list-gap',
        );
        const parsed = Number.parseFloat(String(raw || '').trim());
        return Number.isFinite(parsed) ? parsed : 8;
      } catch (_) {
        return 8;
      }
    };

    const measure = (scrollY) => {
      const listChromeGapPx = readListChromeGapPx();
      const main = document.querySelector('main.page-main');
      const bar = document.querySelector('.app-bar-wrapper');
      const dock =
        document.querySelector('#recipeFilterChipDock') ||
        document.querySelector('#shoppingListFilterChipDock') ||
        document.querySelector('.list-filter-chip-dock');

      const csRoot = getComputedStyle(document.documentElement);
      const csMain = main ? getComputedStyle(main) : null;
      const padTop = csMain ? parseFloat(csMain.paddingTop) : NaN;
      const stackVar = csRoot
        .getPropertyValue('--top-filter-chip-rail-stack-height')
        .trim();
      const br = (el) =>
        el ? el.getBoundingClientRect() : { top: NaN, bottom: NaN, height: NaN };

      const dockR = br(dock);
      const dockBottom = dock ? dockR.bottom : NaN;
      const dockTop = dock ? dockR.top : NaN;
      const expectedPadTop =
        Number.isFinite(dockBottom) ? dockBottom + listChromeGapPx : NaN;
      const paddingMatchesLayout =
        Number.isFinite(padTop) &&
        Number.isFinite(expectedPadTop) &&
        Math.abs(padTop - expectedPadTop) < 2;

      const list = listSelector ? document.querySelector(listSelector) : null;
      const firstLi = list?.querySelector('li');
      const firstLiR = firstLi ? firstLi.getBoundingClientRect() : null;
      const listOverlapsDock =
        firstLiR && dock
          ? firstLiR.top < dock.getBoundingClientRect().bottom - 0.5
          : null;

      return {
        scrollY: Math.round(scrollY),
        windowScrollY: Math.round(window.scrollY || 0),
        vars: { '--top-filter-chip-rail-stack-height': stackVar },
        mainPaddingTopPx: padTop,
        dockTopPx: Number.isFinite(dockTop) ? Math.round(dockTop * 100) / 100 : null,
        dockBottomPx: Number.isFinite(dockBottom)
          ? Math.round(dockBottom * 100) / 100
          : null,
        checks: {
          paddingMatchesDockPlusListGapPx: paddingMatchesLayout,
          listChromeGapPx,
          deltaPadMinusExpected:
            Number.isFinite(padTop) && Number.isFinite(expectedPadTop)
              ? Math.round((padTop - expectedPadTop) * 100) / 100
              : null,
          listTopLessThanDockBottom: listOverlapsDock,
        },
        missing: { dock: !dock, main: !main, appBar: !bar, list: !list },
      };
    };

    const waitFrame = () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });

    const maxScroll = Math.max(
      0,
      (document.documentElement.scrollHeight || 0) - window.innerHeight,
    );
    const targets = [0, Math.floor(maxScroll / 2), maxScroll];
    const samples = [];
    for (const y of targets) {
      window.scrollTo(0, y);
      await waitFrame();
      samples.push(measure(y));
    }
    return { maxScroll: Math.round(maxScroll), samples };
  });
}

function analyzeScrollSamples(samples) {
  const issues = [];
  if (!samples?.length) {
    issues.push('no_scroll_samples');
    return { ok: false, issues };
  }

  const withDock = samples.filter((s) => !s.missing?.dock);
  for (const s of withDock) {
    if (s.checks?.paddingMatchesDockPlusListGapPx === false) {
      issues.push(`padding_mismatch_at_scrollY_${s.scrollY}`);
    }
  }

  const atTop = samples.find((s) => s.scrollY === 0) || samples[0];
  if (
    atTop &&
    !atTop.missing?.dock &&
    !atTop.missing?.list &&
    atTop.checks?.listTopLessThanDockBottom === true
  ) {
    issues.push('list_overlaps_dock_at_scroll_top');
  }

  const stackVars = [
    ...new Set(withDock.map((s) => s.vars?.['--top-filter-chip-rail-stack-height'] || '')),
  ];
  if (stackVars.length > 1) {
    issues.push(`stack_height_var_changed_during_scroll:${stackVars.join('|')}`);
  }

  const dockTops = withDock
    .map((s) => s.dockTopPx)
    .filter((n) => Number.isFinite(n));
  if (dockTops.length > 1) {
    const min = Math.min(...dockTops);
    const max = Math.max(...dockTops);
    if (max - min > DOCK_TOP_STABLE_TOLERANCE_PX) {
      issues.push(`dock_top_unstable_px_range:${min}-${max}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

async function probeUrl(page, url, { planner }) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('.list-filter-chip-dock, main.page-main', {
    timeout: 120000,
  });
  await page.waitForTimeout(4000);

  const idle = await page.evaluate(() => {
    const main = document.querySelector('main.page-main');
    const dock = document.querySelector('.list-filter-chip-dock');
    const csMain = main ? getComputedStyle(main) : null;
    const padTop = csMain ? parseFloat(csMain.paddingTop) : NaN;
    const dockR = dock ? dock.getBoundingClientRect() : null;
    return {
      url: location.href,
      hasChipRailClass: document.body.classList.contains('has-top-filter-chip-rail'),
      enableScrollSyncFlag:
        sessionStorage.getItem('favoriteEats:chip-rail-scroll-sync') === '1',
      idle: {
        mainPaddingTopPx: padTop,
        dockBottomPx: dockR ? Math.round(dockR.bottom * 100) / 100 : null,
        listChromeGapPx: (() => {
          try {
            const raw = getComputedStyle(document.documentElement).getPropertyValue(
              '--page-main-chrome-to-list-gap',
            );
            const parsed = Number.parseFloat(String(raw || '').trim());
            return Number.isFinite(parsed) ? parsed : 8;
          } catch (_) {
            return 8;
          }
        })(),
        paddingMatchesDockPlusListGapPx:
          Number.isFinite(padTop) &&
          dockR &&
          Math.abs(
            padTop -
              dockR.bottom -
              (() => {
                try {
                  const raw = getComputedStyle(document.documentElement).getPropertyValue(
                    '--page-main-chrome-to-list-gap',
                  );
                  const parsed = Number.parseFloat(String(raw || '').trim());
                  return Number.isFinite(parsed) ? parsed : 8;
                } catch (_) {
                  return 8;
                }
              })(),
          ) < 2,
      },
    };
  });

  const scrollPass = await collectScrollSamples(page);
  const scrollAnalysis = analyzeScrollSamples(scrollPass.samples);

  return {
    url,
    meta: tourMetaForUrl(url),
    plannerMode: planner ? 'on' : 'off',
    idle,
    scroll: scrollPass,
    scrollAnalysis,
    ok:
      idle.idle?.paddingMatchesDockPlusListGapPx !== false &&
      scrollAnalysis.ok &&
      !scrollPass.samples.some((s) => s.missing?.dock && !s.missing?.main),
  };
}

async function main() {
  const opts = parseArgs();
  if (opts.help) {
    console.log(`Usage:
  npm run probe:chip-rail-layout
  npm run probe:chip-rail-layout -- --tour --base-url http://127.0.0.1:4173
  npm run probe:chip-rail-layout -- http://127.0.0.1:4173/recipes.html --planner

Flags:
  --tour       recipes.html, shopping.html, shoppingList.html
  --planner    localStorage favoriteEatsPlannerModeOn=1
  --no-fail    print JSON only, exit 0
  --base-url   default ${DEFAULT_BASE}

Dev rollback (re-enable scroll sync; hurts iOS bounce):
  sessionStorage.setItem('favoriteEats:chip-rail-scroll-sync','1'); location.reload();

Sync debug counter:
  sessionStorage.setItem('favoriteEats:chip-rail-sync-debug','1');
  window.__favoriteEatsChipRailSyncCount = 0; location.reload();
  // scroll, then: window.__favoriteEatsChipRailSyncCount
`);
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem(
        'favoriteEatsSplashAccess',
        JSON.stringify({
          grantedAt: Date.now(),
          expiresAt: Date.now() + 86400000000,
        }),
      );
    } catch (_) {}
  });
  await ctx.addInitScript((planner) => {
    if (!planner) return;
    try {
      localStorage.setItem('favoriteEatsPlannerModeOn', '1');
    } catch (_) {}
  }, opts.planner);

  const page = await ctx.newPage();
  const reports = [];
  let allOk = true;

  for (const url of opts.targets) {
    try {
      const report = await probeUrl(page, url, { planner: opts.planner });
      reports.push(report);
      if (!report.ok) allOk = false;
    } catch (err) {
      allOk = false;
      reports.push({
        url,
        ok: false,
        error: String(err?.message || err),
      });
    }
  }

  const summary = {
    ok: allOk,
    targetCount: opts.targets.length,
    reports,
  };

  console.log(JSON.stringify(summary, null, 2));
  await browser.close();

  if (opts.failOnRegression && !allOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[probe:chip-rail-layout]', err);
  process.exit(1);
});
