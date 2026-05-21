# App Performance Optimization

## Purpose

This document **tracks what we know** about perceived performance (**latency**, **general sluggishness**, **UI snap-back**) and **guides systematic fixes** so we avoid fixing the same class of bug repeatedly (“whack-a-mole”). Update it as we measure new hotspots or ship architectural guardrails.

**Related:** list/session semantics live in `docs/catalog-plan-list-supabase.md`; broader migration context in `docs/multi-device-roadmap.md`.

---

## Two overlapping problems

### 1. High latency

Work that crosses the network (Supabase PostgREST, RPCs, Realtime, Edge Functions) is subject to **round-trip time**, **regional distance**, **cold paths**, and **chatty clients** (many small requests). Latency shows up as slow first paint, sluggish toggles, and crowded Network timelines—not always “the database is slow.”

### 2. Operation snap-back

The UI updates optimistically (or briefly shows the intended state), then **reverts** to an older value. With Supabase this is rarely mysticism: it is usually **ordering and merging** of asynchronous results, not magic.

---

## Snap-back: three causes (diagnosis lens)

Use these to classify an incident before rewriting feature code.

| Cause | One-line check |
|--------|----------------|
| **Failed write** | The mutation returns non-success (4xx/5xx) or the client error path runs; revert matches “server never accepted this.” |
| **Stale Realtime / ordering** | A broadcast or subscription delivers row/doc state that is **older** than the last successful write or arrives **out of order**; merge reapplies old truth. |
| **Race with refetch / full reload** | A `select`, RPC like `load_*`, or **full document reload** completes **after** a newer interaction and **replaces** in-memory state with an older snapshot. |

**Important:** Snap-back can happen even when **every HTTP status is 200**—the bug is **which payload applied last**, not whether one request “failed.”

---

## Working hypothesis: what usually causes snap-back (and why)

**Primary hypothesis:** Snap-backs are **most often** caused by **overlapping asynchronous updates**—multiple **full-state reloads** (`load_*` RPCs), **Realtime-driven hydrates**, and **optimistic UI**—where **whichever response or merge runs last wins**, even when that payload is **older** than the user’s latest intent. This is the **race-with-refetch / merge-order** class above, generalized beyond a single screen.

**Why we lean here (evidence, not proof):**

1. **Writes often succeed:** Shopping-list captures show **`set_*` RPCs returning 200** with OK bodies; failed mutations alone would not explain those timelines.  
2. **Server truth at rest matches intent:** In HAR analysis, the **last** `load_shopping_state` for a row aligned with the **last** mutation—the database narrative was consistent **when read after everything settled**. That argues against “RPC is persistently wrong” as the main story.  
3. **Many reloads, many origins:** The same session showed **`load_shopping_state`** fired close together from **different code paths** (post-toggle hydrate vs **Realtime** `onConnMessage`). Each returns a **full document**. Without strict versioning or “ignore stale snapshot” rules, applying those payloads **in completion order** can briefly (or stickily) paint an **out-of-date** doc over a **newer** local state.  
4. **Rapid interaction matches the failure mode:** Fast toggles increase **in-flight overlap**; “locks in” until refresh matches a **backlog of completions** reapplying stale snapshots, not a single bad request.  
5. **What would falsify this:** Reproducible snap-back where the **authoritative** `load_*` response (or a cheap follow-up read) **already** shows the wrong value for the row **while** the UI reverts—then we’d weight **server read-after-write**, **RPC semantics**, or **mapping bugs** more heavily. We have not seen that as the leading pattern in the captures so far.

**Secondary contributor (still common):** **Realtime** and **HTTP refetch** both updating the same aggregate **without a single merge policy**—functionally a special case of the same ordering problem, not a separate root cause.

---

## How to diagnose with Chrome DevTools (Network)

1. Use **Fetch/XHR** to hide static assets.  
2. Filter by host (e.g. `supabase.co`) or by RPC path fragment (`set_`, `load_`).  
3. Sort by **Waterfall** (timeline order), **not** by the **Time** column alone—that column is **duration**, not chronological order.  
4. For one reproduction: find the **write** (`POST`…`/rpc/…`), then trace **what runs immediately after** (especially **`load_*`** RPCs or large `GET`s).  
5. Compare **Payload** (intent) vs **Response** (server truth). If both agree but the UI still flips, suspect **client merge** or **another request finishing later**.

**HAR exports:** Useful for offline timelines; **redact** API keys and auth headers before sharing. Prefer filenames like `shopping-list-snapback-YYYY-MM-DD.har`, not generic `127.0.0.1.har`.

---

## What we learned: Shopping List checkbox snap-back (HAR-backed)

Concrete capture (local shopping list, checkbox toggles):

- **`set_shopping_list_row_checked`** returns **200** with a small `{ ok, kind }` body—writes often succeed.  
- **`load_shopping_state`** runs **right after** toggles (full shopping doc reload).  
- **Multiple `load_shopping_state` calls** appeared close together from **different initiators**: scheduled hydrate paths (`setTimeout` / `hydrateShoppingStateFromDataService`) **and** Supabase **Realtime** (`onConnMessage` → shopping plan hydrate).  
- **Last** `load_shopping_state` in the sequence matched the **last** mutation for the row—the server snapshot was **consistent** with the final intent. That pattern points to **merge / ordering / overlapping reloads**, not “RPC permanently wrong.”  
- Rapid back-and-forth toggling correlates with **more overlapping work**; once desync appears, the UI can feel “locked” until the queue drains or the page reloads—classic **request backlog**, not necessarily permanent DB corruption.

**Takeaway:** Feature-level checkbox hacks are insufficient if **global patterns** (duplicate full reloads + Realtime + optimistic UI) fight each other.

---

## Global directions (avoid whack-a-mole)

Implement once in shared plumbing; apply everywhere interactions can overlap.

1. **Versioned or monotonic snapshots**  
   Apply server payloads **only if** they are **newer** than what the client last applied (`version`, `updated_at`, or a client-side monotonic token per aggregate). Drop stale responses instead of blindly replacing state.

2. **Serialize or cancel per logical key**  
   For the **same row / same aggregate**, avoid overlapping contradictory mutations: queue, replace-with-latest, or **AbortController** for superseded fetches.

3. **Coalesce full reloads**  
   If both “after mutation” and “Realtime said something changed” call **`load_shopping_state`** (or equivalent), **dedupe**: one in-flight reload per session/key, collapse bursts to the latest request.

4. **Single reducer / merge path**  
   Route Realtime events and REST/RPC reloads through **one** code path that understands priority and staleness—avoid parallel full-document applies without ordering rules.

5. **Optional data-layer wrapper**  
   Whether TanStack Query, Rx, or a thin internal cache: centralize **dedupe, abort stale GETs, mutation lifecycle** so screens do not each reinvent races.

---

## General sluggishness

Beyond snap-back, the app can feel slow because of **network chatter**, **main-thread work**, or **cold RPCs**. Treat diagnosis as **top-down**: confirm *where* time goes before tuning Postgres or adding caches.

### 1. Diagnosing chief causes

| Approach | What it surfaces |
|----------|------------------|
| **Chrome Performance** recording | Long tasks on the **main thread** (big JS, sync layout, huge JSON parse) vs gaps waiting on **network**. |
| **Network** (Fetch/XHR, waterfall order) | **How many** `supabase.co` calls per navigation or gesture—**chatty clients** (many small `GET`s, N+1 patterns) often dominate over “slow database.” |
| **Lighthouse** (optional) | Structured lab metrics (e.g. blocking time) when tuning first interactions. |
| **Supabase dashboard** | Query/API logs—use **after** identifying **which** endpoints fire most often locally. |

Rough **symptom → layer** mapping:

| Symptom | Likely layer |
|---------|----------------|
| Many similar REST rows in Network | **Chatty client** (per-key lookups, missing batching)—not necessarily slow Postgres |
| One or two slow RPCs | **Specific RPC/query** or cold path |
| UI freezes while Network looks quiet | **Main-thread** cost (render, merge, parse) |
| Degrades after heavy use | Duplicate listeners, leaks, or **request backlog** |

### 2. Caching and splash-screen warmup

For a **hobby-scale, fairly small** database, the biggest wins are usually **fewer round-trips** and **session reuse**, not “download every table up front.”

**Practical options (increasing commitment):**

- **In-memory cache in the adapter** for **reference data** that changes rarely (stores, aisles, units, stable slices of catalog): reuse within the session; invalidate on explicit writes or a simple TTL.  
- **Batch or consolidate reads** where the client today fires **many parallel similar queries** (e.g. repeated `ingredients?select=...` patterns)—prefer **one batched query or RPC** when the product allows.  
- **Splash / gate (`index.html`, `splashGate.js`):** before auth, only **public** prefetch is safe. **After** password verify and a valid session, use the transition to **warm** the client: instantiate Supabase, optionally run a **small bootstrap** set (session + commonly needed slices) so the **next** navigation pays less cold-start tax. Prefetch **predictable next routes** (critical JS + first RPCs for the page users usually open next)—not necessarily the whole DB.  
- **Service Worker / HTTP cache** for authenticated Supabase REST: easy to get **wrong** (stale data, wrong user); treat as **advanced** unless requirements are clear.  
- **IndexedDB / persistent local cache:** good for **instant repeat visits**; adds **invalidation** complexity—reasonable **phase two** after in-memory + fewer requests prove out.

### 3. Optimistic actions

**Optimistic UI** (update the screen before the server confirms) improves **perceived** speed for actions that are safe to retry or reconcile (toggles, minor edits).

**Guardrails** (see **Working hypothesis** and **Global directions** above): optimism **amplifies** races if every action also triggers a **full `load_*`** or unconstrained **Realtime** hydrate—overlapping snapshots can still apply **last completion wins**. Prefer **staleness rules** (version / monotonic token), **coalesced reloads**, and **per-row serialization** before widening optimistic patterns across the app.

For a hobby project: use optimism where rollback is obvious (toast + revert); keep heavy or ambiguous flows **pessimistic** until merge logic is solid.

---

## Warm client: stop treating every navigation as a cold remote read

### Goal

**Stop treating every navigation like a cold remote read** and **treat the browser as a client that keeps a warm slice of truth**—enough local state (and enough discipline on refresh) that top-level moves feel **snappy**, while the server remains authoritative for durability and multi-device convergence.

The total database size can be “only tens of MB” and still feel slow if each HTML navigation **re-pays** RTT, cold adapter work, chatty reads, and full-document merges. Latency is dominated by **how often** and **how serially** we cross the network, not by Postgres byte count alone.

### High-level plan (sketch)

Work in layers; do not skip merge guardrails (see **Global directions** and **Working hypothesis** above) or caches will amplify snap-back.

1. **Define “warm slice” per session**  
   Decide what must be **instant without network** for the next screen (e.g. recipe list rows, tag catalog slice, store/aisle reference) vs what can stay **lazy** (heavy editor payloads, rare admin surfaces). Keep the slice **small enough to reason about** and **large enough** to kill the worst navigations.

2. **In-memory + in-flight dedupe in the adapter (first)**  
   Single-flight reads: same key in flight → share one promise. Short TTL or explicit invalidation after writes. This is the cheapest path to fewer redundant `GET`s/`load_*` without new storage APIs.

3. **Post-splash bootstrap (second)**  
   After password verify and session grant, run a **bounded** prefetch set (predictable next route + shared reference data) so the **first** hop after splash is not a cold chain. Stay within CSP and auth rules; do not prefetch private data before the gate.

4. **Coalesce full-document reloads (third)**  
   Where multiple paths fire the same **`load_*`** or equivalent, **one in-flight reload per aggregate**, merge bursts to the latest request, and apply **staleness/version rules** so Realtime + HTTP cannot paint older snapshots over newer intent.

5. **Optional persistent cache (fourth)**  
   IndexedDB (or similar) for **repeat visits** and larger read models only after (2)–(4) are stable—otherwise invalidation and wrong-user risk dominate. Service Worker HTTP caching for authenticated Supabase remains **advanced** unless requirements are explicit.

6. **Measure against a bar, not a single HAR**  
   Use **`perf:capture:tour`** (and DevTools throttling) to track **p95** of **`feNavToShellPaintMs`** (or successor metrics) after meaningful changes; regressions should be caught in CI or pre-deploy ritual, not vibes.

### What this does *not* mean

- **Not** “download the whole DB up front” unless the product truly needs offline-everything.  
- **Not** caching without **merge policy**—that recreates snap-back (see diagnosis lens above).  
- **Not** abandoning the server as source of truth; the warm slice is **performance and UX**, not a second contradictory database.

### First-paint hub app bar (shipped)

**Design rule:** Top hub app bars should not **change identity** across load phases (for example **Add → Reset**, or an empty mount **→** newly inserted row actions) except **monogram** content and real **dirty / edit** affordances on recipes, items, and lists.

**Shipped (implementation):**

- **Web-only runtime:** Legacy desktop shell entrypoints and npm desktop-shell dependencies removed. App code no longer branches on native delivery APIs. The supported behavioral axes are **editing vs planning** (`window.plannerMode`, planner `localStorage` keys)—not delivery channel.
- **Chrome boot (`js/chromeBoot.js`):** Loaded in **`<head>` before `css/styles.css`** on every page that ships the main stylesheet. Sets **`document.documentElement.dataset.platform`** using the same planner / public-web lock rules as `js/main.js`, so first paint does not briefly use the default purple editor accent. **`scripts/buildWeb.js`** prepends **`window.__FAVORITE_EATS_BUILD__`** to **`dist/web/js/chromeBoot.js`** as well as **`main.js`**, so head scripts see the same build flags as the bundle.
- **Material Symbols preload:** Each of those pages preloads **`assets/fonts/material-symbols-outlined.woff2`** in `<head>` so ligature icons are less likely to flash as plain text before the font file arrives.
- **Inlined app bar:** Every standard gated page inlines **`fragments/appBar.shell.html`** under **`#appBarMount`** with **`data-app-bar-inline="1"`** (parser-built; no `fetch` on first paint). **`npm run sync:appbar`** (`scripts/syncAppBarHtml.js`) rewrites those copies from the fragment; **`shoppingList.html` is excluded** because it carries extra list-only buttons (`#appBarShoppingListCancelBtn` / `#appBarShoppingListSaveBtn`). **`ensureAppBarInjected`** in **`js/utils.js`** still skips **`sessionStorage`** shell cache when **`data-app-bar-inline="1"`** so a cached shell from another route cannot overwrite page-specific markup.
- **Stores + Items (`shopping.html`):** `applyPlannerModePresentation` in `js/main.js` sets **Add vs Reset** on `#appBarAddBtn` when `body` is `stores-page` or `shopping-page` and the button exists (covers planner presentation before async loaders). **`loadShoppingPage`** also sets Add/Reset immediately after `waitForAppBarReady()` so Items does not wait on Supabase prefetch to flip the pill.
- **Compact app bar:** `isCompactWebAppBarModeActive` in `js/utils.js` uses the same narrow-width compact behavior for **editing** and **planning** (no desktop-only branch).

**Maintenance:** Edit **`fragments/appBar.shell.html`**, bump **`data-app-bar-shell`** when markup changes (keep **`isCurrentAppBarShellMarkup`** in **`js/utils.js`** in agreement), then run **`npm run sync:appbar`** so all standard HTML pages pick up the fragment. **`shoppingList.html`** stays hand-edited next to the fragment for list-only controls.

### Shell-to-content latency sample (2026-05-12)

**What was measured:** **`feNavToShellPaintMs`** in `scripts/perf-capture.mjs` — milliseconds from the **current document’s navigation time origin** until (1) **`#appBarTitle`** is visible, (2) a **page-specific first content** node is visible (`#recipeList > li`, `#shoppingListOutput > li`, or `#recipeTitle`), then (3) **double `requestAnimationFrame`** to approximate the next composited frame after layout. After that gate, the script still waits for **`networkidle`** and records Navigation Timing + paint entries in **`timings.json`** (see same run’s `network.har` / `trace.zip`).

**How it was obtained:**

- **Command:** `npm run perf:capture:tour` (runs `node scripts/perf-capture.mjs --tour`).  
- **Environment:** static site served at **`http://127.0.0.1:8000`** (e.g. `python3 -m http.server 8000` from repo root); **Playwright Chromium headless**; splash login via **`PERF_SPLASH_PASSWORD`** so the tour reaches gated pages.  
- **Tour order:** `recipes.html` → `shoppingList.html` → `recipeEditor.html`. For **`recipeEditor.html`**, the capture seeds **`sessionStorage.selectedRecipeId`** from the **first** `#recipeList li[data-recipe-row-stepper-key]` seen after the recipes leg so the editor page does not bounce back to recipes.  
- **Artifacts:** `perf-artifacts/run-20260512-064212/timings.json` (plus HAR and trace alongside it).

**Numbers (one successful run — not p95, not throttled “field” conditions):**

| Page | `feNavToShellPaintMs` | Content gate (`feShellGate`) |
|------|----------------------:|------------------------------|
| `recipes.html` | **339** | `recipeListFirstRow` |
| `shoppingList.html` | **~844** | `shoppingListFirstRow` |
| `recipeEditor.html` | **~840** | `recipeEditorTitle` |

From the same `timings.json` **paint** entries (**different** definition than `feNavToShellPaintMs`): **first-contentful-paint** `startTime` was about **293 ms** (recipes), **28.5 ms** (shopping), **408.5 ms** (editor).

**Caveats:** single lab sample; warm-ish session after splash; local loopback; headless may differ from your daily-driver browser; repeat runs belong in **`perf-artifacts/run-*`** for comparison.

### Items page: `listShoppingItems` dedupe + session reuse (shipped)

**Problem:** The Items surface (`shopping.html`) and **`listShoppingListPlanRows`** (plan merge / heal paths) both need the same **catalog aggregate** built by **`listShoppingItems`** in `js/data/adapters/supabaseAdapter.js`. In one navigation that produced **overlapping waves** of identical PostgREST reads (`ingredients`, `ingredient_variants`, tags, maps, etc.).

**What shipped:**

1. **Adapter-level coalescing** — **`fetchListShoppingItemsUncached`** holds the real work; **`listShoppingItems`** wraps it with:
   - **Single-flight:** concurrent callers await one in-flight promise.
   - **Short in-memory reuse** (~**5 s** TTL, keyed by a monotonic **catalog revision**) so sequential callers in the same burst (e.g. Items load then plan-row merge) reuse the last successful rows without a second network wave.

2. **Session reuse across MPA navigations** — After a successful fetch, rows are stored in **`sessionStorage`** under `favoriteEats:listShoppingItemsCache:v1` with **`catalogRev`**, a **config fingerprint** (Supabase URL + anon key prefix), and **`savedAt`**. A later load can skip the network for up to **~90 s** when revision + fingerprint still match.

3. **Invalidation** — **`bumpListShoppingItemsAggregateGeneration()`** increments **`catalogRev`**, clears memory + session cache, and runs when:
   - **Catalog reference Realtime** fires (`subscribeCatalogReferenceChanges`, before app `onChange`).
   - Shopping catalog **writes** succeed: **`saveShoppingCatalogItem`**, **`deleteShoppingItem`** (when a row was actually updated), **`findOrCreateShoppingItem`** (mutation paths only—not the pure “already exists” lookup return).

**Perf harness:** **`npm run perf:items`** (`scripts/perf-items-acid.mjs`) measures **`#shoppingList[data-fe-perf-items-ready="1"]`** and summarizes Supabase traffic in the HAR window after the last **`shopping.html`** document navigation (see script comments: `fetch` POSTs may lack a `shopping.html` **Referer**). With **`--skip-login`**, Playwright seeds **`sessionStorage.favoriteEatsSplashAccess`** (same shape as `js/pageGate.js`) via **`addInitScript`** so **`protectedPageGate.js`** does not redirect **`shopping.html`** to **`index.html`** before measurement.

**One-run A/B (local static server, `PERF_ITEMS_RUNS=2`, adapter on `main` vs branch with only this change swapped):**

| Metric | `main` (before) | After ship |
|--------|----------------:|-----------:|
| Supabase rows in Items HAR window (both navigations) | 32 | **15** |
| `GET …/ingredients` | 6 | **4** |
| `GET …/ingredient_variants` | 6 | **4** |
| `feNavToItemsReadyMs` **warm** (second visit, same session) | ~920 ms | **~520 ms** |
| `feNavToItemsReadyMs` **cold** (single pair) | ~1390 ms vs ~2090 ms | **noisy**—do not read as a regression or win from one sample |

**Caveats:** Session cache is a **latency** trade: short TTL + Realtime/write bumps limit staleness but do not replace authoritative merges elsewhere. Re-run **`perf:items`** after meaningful catalog changes; use **median of several runs** for cold if you need a stable number.

---

## Latency optimization cycle (2026-05-11)

End-to-end pass on **“slow everywhere”** perception: measure first, then ship a small set of **high-leverage** changes (fonts + fewer Supabase round-trips + less critical-path blocking on Recipes).

### Tests we ran

- **Synthetic browser capture:** `npm run perf:capture` and `npm run perf:capture:tour` (Playwright headless → **`perf-artifacts/run-*/network.har`**, **`trace.zip`**, **`timings.json`**). Tour: splash login → **`recipes.html`** → **`shoppingList.html`** → **`recipeEditor.html`** in one recording.
- **HAR analysis (automated):** Parsed the tour HAR for **slowest URLs**, **request counts by host**, and **first-contentful-paint** hints from `timings.json`.
- **Supabase remote apply:** Cursor Supabase plugin — **`apply_migration`** for **`recipe_list_view_lookup_ingredient`** on project **Favorite Eats** (`ysesmbcvxmaymtsqeipc`), after fixing a **`boolean` vs `integer`** mismatch in the view’s JSON for **`tags.is_hidden`**.
- **Manual smoke (you):** **`recipes.html`** with DevTools **Network (Fetch/XHR)** — confirmed **`recipe_list_rows`** and **`load_shopping_state`** both **200** and fast.
- **Post-ship HAR:** Exported **`localhost.har`** from Chrome; re-parsed for top timings and **Google Fonts presence** (none).

### Diagnosis (what the data said)

- **Google Fonts chain** (`fonts.googleapis.com` + `fonts.gstatic.com`, including **Material Symbols**) showed up as **hundreds of milliseconds** of work competing with first paint—not “Postgres is 14 MB so it’s free.”
- **Recipe list** was dominated by a **single heavy PostgREST read** on **`recipes`** with an **embedded** `recipe_tag_map(...tags...)` select — one logical operation but **expensive shape** for the DB/JSON path.
- **Ingredient resolution** for shopping flows fired **multiple sequential** `ingredients?…ilike…` (and similar) requests — classic **chatty client** pattern.
- **Recipes page startup** awaited **`listRecipes`** and then **`hydrateShoppingStateFromDataService`** **serially**, so **shopping RPC latency** stacked on top of **catalog** latency even when the list UI did not strictly need the full shopping doc to render.
- **Tour-scale request volume** (~**245** requests for three pages) was mostly **repeat static JS/CSS per navigation** plus remote calls — diagnosing “everywhere slow” needed **shared** hotspots (fonts + Supabase + ordering), not one screen in isolation.

### Fix (what we shipped) and rationale

| Change | Rationale |
|--------|-----------|
| **Self-hosted fonts** (`css/fonts.css` + `assets/fonts/*.woff2`; CSP **`font-src 'self'`**; removed Google `<link>`s) | Same typography without **extra cross-origin connections** and CSS→font discovery latency; aligns with static hosting on **GitHub Pages**. |
| **`catalog.recipe_list_rows` view** + adapter reads **`recipe_list_rows`** instead of embedded `recipes?select=…recipe_tag_map…` | **One simpler read** with tags **pre-aggregated** as JSON the client already understands — fewer moving parts per request, easier to reason about than N+1 embed expansion. |
| **`catalog.lookup_ingredient_by_needle` RPC** + adapter uses it for **`tryFindIngredientByNeedleVariant`** | **One round-trip** replaces **2–3** sequential ingredient lookups for the same needle — fewer waits on high-latency paths. |
| **`requestIdleCallback`** (fallback `setTimeout(0)`) for **`hydrateShoppingStateFromDataService`** on **Recipes only** | **Perceived** speed: paint the recipe list **without waiting** on the full shopping document hydrate unless idle budget allows — shopping still loads, just not on the **critical path**. |
| **`scripts/perf-capture.mjs`:** use **last** `navigation` performance entry for snapshots | After multi-page tours, **`navigation[0]`** lied about the current URL — fixes **trustworthy** `timings.json` for future runs. |

### Results (evidence after ship)

- **Manual Network (Fetch/XHR):** **`recipe_list_rows`** ~**49 ms**, **`load_shopping_state`** ~**51 ms** — both **200**; confirms migration + adapter wiring on real **`localhost:8000`**.
- **`localhost.har`:** **34** total requests for that session; **0** Google font hosts; self-hosted **`material-symbols-outlined.woff2`** from **`localhost`**; Supabase REST/RPC timings ~**60 ms** in that capture.
- **Caveat:** HAR **WebSocket** rows often show **very long “duration”** because the connection stays open for the whole recording — **not** a multi-second stall on initial load.

**Residual risk / follow-up:** spot-check **shopping name → ingredient** edge cases against the new RPC (pluralization, odd strings); run **`perf:capture:tour`** again after a deploy and compare **HAR tops** to this baseline.

---

## Measurement backlog (fill in as we profile)

| Area | Symptom | Next measurement | Owner / note |
|------|---------|------------------|--------------|
| Shopping list | Checkbox snap-back under rapid toggle | Network waterfall + optional HAR | See section above |
| App-wide | Sluggish navigation / interactions | **Partially done (2026-05-11):** tour HAR + `localhost.har` + Recipes smoke; re-run tour after each meaningful deploy | Fonts + `recipe_list_rows` + ingredient RPC + Recipes idle hydrate |
| Items (`shopping.html`) | Duplicate catalog GETs / slow repeat visit | **`npm run perf:items`** (HAR + `feNavToItemsReadyMs`); `PERF_ITEMS_RUNS=2` for cold+warm in one session | **Shipped (2026-05-12):** adapter dedupe + session cache + acid `--skip-login` gate seed |
| *Add rows as identified* | | | |

---

## Changelog

- **2026-05-21:** **First-paint chrome (shipped)** — `js/chromeBoot.js` in `<head>` before styles (planner vs editor accent without waiting for `main.js`); Material Symbols **preload**; standard pages inline **`fragments/appBar.shell.html`** via **`npm run sync:appbar`** (`shoppingList.html` hand-maintained); **`buildWeb.js`** injects **`__FAVORITE_EATS_BUILD__`** into **`dist/web/js/chromeBoot.js`**. Touches root `*.html`, `scripts/buildWeb.js`, `scripts/syncAppBarHtml.js`, `package.json`.
- **2026-05-12:** **Items `listShoppingItems` dedupe + session cache (shipped)** — adapter coalescing, in-memory TTL reuse, `sessionStorage` reuse with Realtime/write invalidation; **`perf-items-acid.mjs`** seeds splash gate session for **`--skip-login`**. Documented above with one-run HAR numbers. Code: `js/data/adapters/supabaseAdapter.js`, `scripts/perf-items-acid.mjs`.
- **2026-05-20:** **First-paint hub app bar (shipped)** — documented under **Warm client** (web-only runtime; inlined app bar on `stores.html` + `shoppingList.html` with `data-app-bar-inline`; session shell cache skip; shopping list inline Cancel/Save; planner-aligned Add/Reset for Stores + Items including early sync in `loadShoppingPage`; compact bar for all modes). Related code: `js/main.js`, `js/utils.js`, `package.json`, `AVOID.md`, `fragments/appBar.shell.html`, `stores.html`, `shoppingList.html`.
- **2026-05-12:** Documented **shell-to-content sample** (`feNavToShellPaintMs`, how obtained, one-run numbers) under **Warm client**.
- **2026-05-12:** Added **Warm client** section (goal: browser holds a warm slice of truth; high-level phased plan; explicit non-goals vs snap-back / authority).
- **2026-05-11:** **Latency cycle** — documented tests, diagnosis, shipped fixes (self-hosted fonts, `recipe_list_rows`, `lookup_ingredient_by_needle`, Recipes idle shopping hydrate, perf capture navigation fix), and post-ship HAR/results in **Latency optimization cycle**; updated measurement backlog row.
- **2026-05-11:** Added **General sluggishness** (diagnosis workflow, caching/splash warmup, optimistic actions + guardrails); expanded Purpose blurb; measurement backlog row.
- **2026-05-11:** Added explicit **working hypothesis** (overlapping full reloads + merge order; evidence and falsification); initial doc (Supabase latency vs snap-back; Shopping List HAR; global mitigation directions).
