/**
 * One-shot layout probe: compares main padding-top vs fixed chrome geometry.
 * Run with local static server (e.g. :4173): node scripts/probeRecipesChipRailLayout.mjs
 */
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173/recipes.html';
const plannerOn = process.argv.includes('--planner');

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
}, plannerOn);

const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(4000);

const report = await page.evaluate(() => {
  const main = document.querySelector('main.page-main');
  const bar = document.querySelector('.app-bar-wrapper');
  const dock =
    document.querySelector('#recipeFilterChipDock') ||
    document.querySelector('.list-filter-chip-dock');

  const csRoot = getComputedStyle(document.documentElement);
  const csMain = main ? getComputedStyle(main) : null;

  const padTop = csMain ? parseFloat(csMain.paddingTop) : NaN;
  const appBarVar = csRoot.getPropertyValue('--app-bar-height').trim();
  const stackVar = csRoot.getPropertyValue('--top-filter-chip-rail-stack-height').trim();

  const br = (el) =>
    el ? el.getBoundingClientRect() : { top: NaN, bottom: NaN, height: NaN };

  const barR = br(bar);
  const dockR = br(dock);
  const mainR = br(main);

  const dockBottomFromViewportTop = dock ? dockR.bottom : NaN;
  const paddingMatchesDockBottom =
    Number.isFinite(padTop) &&
    Number.isFinite(dockBottomFromViewportTop) &&
    Math.abs(padTop - dockBottomFromViewportTop) < 2;

  const barBottomVsVar =
    Number.isFinite(barR.bottom) && appBarVar.endsWith('px')
      ? barR.bottom - parseFloat(appBarVar)
      : null;

  const dockZ = dock ? getComputedStyle(dock).zIndex : '';
  const mainZ = main ? getComputedStyle(main).zIndex : '';

  const list = document.querySelector('#recipeList');
  const firstLi = list?.querySelector('li');
  const firstLiR = firstLi ? firstLi.getBoundingClientRect() : null;
  const listContentOverlapsDock =
    firstLiR && dock
      ? firstLiR.top < dock.getBoundingClientRect().bottom - 0.5
      : null;

  return {
    url: location.href,
    bodyPlanner: document.body.dataset.plannerMode,
    htmlPlatform: document.documentElement.dataset.platform,
    hasChipRailClass: document.body.classList.contains('has-top-filter-chip-rail'),
    vars: {
      '--app-bar-height': appBarVar,
      '--top-filter-chip-rail-stack-height': stackVar,
    },
    computed: {
      mainPaddingTopPx: padTop,
    },
    geometryViewport: {
      appBarBottom: barR.bottom,
      dockTop: dockR.top,
      dockBottom: dockR.bottom,
      dockHeight: dockR.height,
      mainTop: mainR.top,
    },
    checks: {
      paddingEqualsDockBottomPx: paddingMatchesDockBottom,
      deltaPadMinusDockBottom:
        Number.isFinite(padTop) && Number.isFinite(dockBottomFromViewportTop)
          ? Math.round((padTop - dockBottomFromViewportTop) * 100) / 100
          : null,
      appBarBottomMinusCssVarPx: barBottomVsVar,
      likelyIssue:
        !dock
          ? 'missing_chip_dock'
          : !Number.isFinite(padTop)
            ? 'no_main_padding'
            : Math.abs(padTop - dockBottomFromViewportTop) >= 2
              ? 'padding_top_does_not_reach_dock_bottom'
              : Number.isFinite(barBottomVsVar) && Math.abs(barBottomVsVar) > 1
                ? 'app_bar_rect_bottom_differs_from_--app-bar-height'
                : 'padding_matches_dock_bottom_if_numbers_align_zindex_next',
    },
    zIndex: { dock: dockZ, main: mainZ },
    listVsDock: firstLiR
      ? {
          firstListItemTop: firstLiR.top,
          dockBottom: dock ? dock.getBoundingClientRect().bottom : NaN,
          listTopLessThanDockBottom: listContentOverlapsDock,
        }
      : null,
    missing: { dock: !dock, main: !main, appBar: !bar },
  };
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
