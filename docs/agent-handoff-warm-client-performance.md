# Agent handoff: warm client + screen loads (performance + multi-device)

Last updated: 2026-05-21.

This document is the **single opinionated plan** for fixing high latency on repeat navigation **without** breaking multi-device sync, list merge semantics, or checkbox snap-back. Use it at the start of a chat when working on performance, caching, shopping load paths, or new screen RPCs.

**Companion docs (read before coding):**

| Doc | Why |
|-----|-----|
| `docs/app-performance-optimization.md` | Snap-back causes, coalesced reloads, revision gating, shipped `listShoppingItems` cache |
| `docs/catalog-plan-list-supabase.md` | Catalog / Plan / List ownership and invariants |
| `docs/multi-device-roadmap.md` | Remote-first north star, verification matrix |
| `docs/supabase-architecture.md` | `window.dataService` door, migrations |
| `.cursor/rules/shopping-state-known-fragility.mdc` | Silent-write modes, hydrate guards — **do not bypass** |
| `.cursor/rules/shopping-list-no-adhoc-lines.mdc` | Shopping List has no free-text “add line” UX |

**Functional reference (patterns, not schema copy):** `/Users/erichenry/Desktop/baby-eats` — remote plan fetch, Realtime → rehydrate, presence.

---

## Evergreen starter message (paste into a new chat)

```text
We are implementing the warm-client performance plan in docs/agent-handoff-warm-client-performance.md.

Goal: hub screens paint fast on revisit when the server is unchanged; when it changed, one round trip updates truth without snap-back or stale data winning.

Non-negotiables:
- Supabase remains authoritative for Plan and List after apply.
- All remote JSON applies only through favoriteEatsStore.applyRemote() with monotonic revisions.
- Keep per-row list RPCs (set_shopping_list_row_checked / set_shopping_list_row_text).
- Realtime → bump revision → coalesced refetch (do not patch from Realtime payloads).
- UI uses window.dataService only (js/data/index.js).
- Shopping List has no UX to add brand-new free-text rows (see shopping-list-no-adhoc-lines rule).

Before coding:
1. git status + recent commits
2. Read the slice you are implementing in agent-handoff-warm-client-performance.md
3. rg the flow in js/main.js and js/data/adapters/supabaseAdapter.js — do not trust stale comments alone
4. If touching Plan/List sync: two-session verification

Do not:
- SPA rewrite, Service Worker cache for Supabase REST, GraphQL, offline CRDT
- force: true hydrate on every page load once revision probe exists (except post-login seed / explicit invalidation)
- Full save_shopping_state after every checkbox
- Reintroduce local-first shopping glue (busy windows, write suppression layers) instead of remote-first
- listShoppingListRecipeSummaries full-table recipes scan (use id filter or screen RPC)

First slice if nothing shipped yet: get_shopping_revisions RPC + js/favoriteEatsStore.js + probe-before-hydrate + single-flight load_shopping_state.

End of message.
```

---

## North star

**After login, hub screens paint from a warm client store in &lt;100ms when the server is unchanged. When something changed, one round trip updates truth without snap-back or stale wins.**

Latency is dominated by **HTTP round trips and merge order**, not Postgres size. Fix round trips and **which snapshot applies last**.

**Acceptance stance:** this plan is only successful if the app is faster **and** more predictable under multi-device writes. A cached paint that can silently win over newer server truth is a regression, even if it feels fast.

**Hard requirements:**

- Every Plan/List-affecting write path must advance the relevant server revision. This includes plan saves, list row RPCs, generated-list/session changes, assignment changes, and catalog changes that alter derived plan/list rows.
- Revision comparison must be deterministic. Prefer strictly monotonic revision values over wall-clock assumptions; if timestamps are used, define null/equality behavior and use one canonical comparison helper.
- A blocked remote apply must always schedule or preserve a coalesced retry. Guards for row RPCs and plan saves may delay truth, but must not strand the store stale.
- Screen RPCs must be reviewed as database API surface, not just performance plumbing: RLS, grants, function volatility, `search_path`, and `security definer` posture are part of the feature.
- Slice 1 must stay small. Do not turn `favoriteEatsStore.js` into a general app framework before it has proven the revision gate and single-flight hydrate path.

---

## Opinionated architecture choices (already decided)

| Choice | Rejected | Reason |
|--------|----------|--------|
| Keep **MPA** (separate HTML pages) | SPA rewrite | Session cache + inline app bar already shipped; IDB + revision probe gives most SPA benefit |
| **`js/favoriteEatsStore.js`** single store | Caches in `main.js` + adapter | Snap-back = merge-order bugs; one `applyRemote()` path |
| **Screen RPCs** for Shopping List, Items, Recipes | More PostgREST chat | Matches `load_shopping_state` / `save_recipe`; DB does joins |
| **Revision tokens** (`planUpdatedAt`, `listSessionUpdatedAt`) | TTL-only cache | Multi-device “unchanged” must be server-backed |
| **Realtime → invalidate → coalesced refetch** | Apply Realtime rows in UI | Avoid duplicate merge logic; matches current debounced hydrate |
| **Finish remote-first Plan/List** | More local-first patches | Roadmap + rollback history: local-first + Realtime = fragile |
| **Keep per-row list RPCs** | Bulk list save for toggles | Two devices toggling different rows must not wipe each other |
| **IndexedDB for catalog aggregate only** | IDB for all state | Plan/list are small; catalog blob is large and shared |
| **Strangle `main.js`** into `js/screens/*.js` | Big-bang rewrite | Lower risk; hub loaders first |

**Explicitly out of scope:** Service Worker HTTP cache for auth’d Supabase, TanStack Query/Redux, admin editor screen RPCs (units/tags/sizes), offline mutation queue, CRDT.

---

## Store shape (target)

```text
favoriteEatsStore
├── authoritative     plan, listDoc, revisions.{ planUpdatedAt, listSessionUpdatedAt, catalogGeneration }
├── derived           planRows, groupedListRows, catalogItems, recipeSummaries (invalidatable)
├── optimistic        in-flight row RPCs, edit drafts (never persisted as truth)
└── applyRemote()     ONLY entry for hydrate / screen RPC / save echo — monotonic revision gate
```

**Slice 1 store boundary:** implement only authoritative snapshot, revision comparison, sessionStorage persistence, subscriptions, single-flight hydrate coordination, and apply-block retry state. Derived caches, IndexedDB catalog plumbing, and screen-specific loaders land in later slices unless needed to preserve an existing behavior.

**Persistence:**

| Data | Storage | Notes |
|------|---------|--------|
| plan + listDoc + revisions | `sessionStorage` key `favoriteEats:store:v1` | After every successful `applyRemote` |
| catalogItems | IndexedDB `favoriteEats-catalog-v1` | Paint-first; validate with `catalogGeneration` + probe |
| UI prefs | existing `localStorage` keys | Unchanged |

**Derived cache keys:** `planRows` → `(planUpdatedAt, catalogGeneration)`; full list pipeline also includes `listSessionUpdatedAt`.

**Revision comparison contract:**

- `newer` → apply remote payload, persist snapshot, recompute affected derived state.
- `equal` → keep current authoritative state unless the call is an explicit post-write echo from this client.
- `older` → drop payload and leave optimistic/draft state alone.
- `null remote revision` → never beats a non-null local revision; only seeds an empty store.
- `null local revision` → any authenticated remote payload may seed the store.

Use one helper for this logic. Do not scatter `Date.parse(...)`, string comparison, or truthy checks across `main.js`, screen modules, and the adapter.

---

## Server RPCs (fixed set, in order)

### RPC security and behavior rules

- Create migrations with Supabase CLI migration tooling; do not hand-invent migration filenames.
- Verify each RPC with SQL/MCP before wiring UI.
- Keep functions in the existing schema pattern, but treat any `security definer` use as exceptional. If one is required, lock down `search_path`, grants, owner, and argument validation explicitly.
- RPCs must return only data the current user/session is allowed to see under the app's ownership model.
- RPCs must return canonical revision fields with every payload that can update the client store.
- Avoid client-visible views that bypass RLS. If views are introduced on Postgres 15+, use `security_invoker = true`; otherwise protect them from exposed roles.

### 1. `catalog.get_shopping_revisions()` — Slice 1

Returns `planUpdatedAt`, `listSessionUpdatedAt` (nullable). Cheap gate for unchanged revisit.

This RPC is the cache correctness gate. It must be cheap, authenticated, and complete: if any write could change Plan/List rendering, this probe must observe the changed revision.

### 2. `catalog.load_shopping_list_screen(...)` — Slice 2

One response: revisions, plan (or unchanged flag), listDoc, **server-side planRows**, assignments for row keys only, recipe summaries for selected ids only. Replaces client `listShoppingItems` + N×`loadRecipeDetail` + `listShoppingListAssignments` + full-table recipe scan on list load.

### 3. `catalog.load_items_screen()` — Slice 4

Full catalog aggregate now built by `listShoppingItems` (8+ GETs).

### 4. `catalog.load_recipes_screen(ifPlanUpdatedAt)` — Slice 4

`recipe_list_rows` + plan slice + revisions.

### 5. `catalog.load_recipe_editor(recipe_id)` — Slice 5

Single editor payload. Defer until hub screens done.

**Migrations:** Supabase CLI only (`supabase/migrations/`). Wire through `dataService`, never PostgREST from UI.

---

## Implementation slices (do not reorder)

### Slice 1 — Store + revision gate (do this first)

**Ship:**

- Migration: `get_shopping_revisions`
- `js/favoriteEatsStore.js`: `applyRemote`, `getSnapshot`, `subscribe`, sessionStorage persist
- `dataService.getShoppingRevisions()`
- `hydrateShoppingStateFromDataService`: **probe first**; skip `load_shopping_state` if revisions match store
- **Single-flight** `load_shopping_state` (Realtime + focus + visibility share one promise)
- Move existing guards into `applyRemote` (preserve behavior):
  - `shoppingListRowDataRpcInFlight` / `shoppingListRowMutationEpoch`
  - `shoppingStateRemoteApplyGeneration`
  - `shoppingPlanRemoteSaveInFlight`
- Canonical revision comparison helper with explicit `newer` / `equal` / `older` / `seed` outcomes
- Apply-block retry: when row RPC or plan-save guards block a payload, keep/schedule exactly one coalesced hydrate after the guard drains

**Do not yet:** Remove `force: true` on Realtime path (still means “refetch when invalidated”).

**Tests:** `applyRemote` rejects older revision; equal revisions do not clobber local optimistic state; null revision seeding behaves intentionally; coalesced hydrate fires once under burst; blocked apply retries after in-flight row RPC drains.

### Slice 2 — Shopping List screen RPC

- `load_shopping_list_screen` + adapter + thin `js/screens/shoppingList.js` loader
- Still use `mergeShoppingListDocWithGenerated` for list doc + conflicts
- Checkbox: optimistic store patch + `setShoppingListRowChecked` only — **no** immediate full hydrate
- Remove from loader: `refreshFavoriteEatsCatalogReferenceCaches`, plan-row prefetch via `listShoppingListPlanRows`, `listShoppingListRecipeSummaries`, assignment fan-out

**Interim fix if RPC slips:** `listShoppingListRecipeSummaries` must use `id=in.(...)` — never full `recipes` table.

### Slice 3 — Remote-first authority (parallel with 2)

- After first successful remote apply: `localStorage` plan/list = cache only; end legacy bridge auto-runs
- `maintainShoppingPlanStorageWithDb` on **invalidation**, not every list paint
- Roadmap verification matrix for two sessions
- Do not preserve compatibility with unshipped local-first bridge behavior on this branch. Replace it cleanly once the remote-first path is verified.

### Slice 4 — Items + Recipes screen RPCs

- `load_items_screen`, `load_recipes_screen`
- IDB catalog write-through; drop Recipes `requestIdleCallback` hydrate deferral once probe exists

### Slice 5 — Recipe editor screen RPC

- `load_recipe_editor`; keep `invalidateRecipeDetailCache` on `saveRecipe`

### Slice 6 — Realtime / focus tightening

- Handlers: bump expected revision + schedule coalesced refresh (~300ms)
- Focus/visibility: **probe only** unless probe fails
- Keep bfcache `pageshow` full refresh (history cache is stale)

### Slice 7 — Strangle `main.js`

- Extract loaders to `js/screens/*.js`; target &lt;150 lines per hub loader
- Do **not** touch shopping variant editor known-issue zone unless asked

---

## Merge and sync policy (fixed)

| Situation | Behavior |
|-----------|----------|
| Remote revision newer | `applyRemote` replaces authoritative slice; recompute derived; run `mergeShoppingListDocWithGenerated` |
| Remote revision older | Drop payload |
| Row RPC in flight | Block full list apply; coalesced retry (existing drain pattern) |
| Plan save in flight | Block plan apply from hydrate |
| Override + changed generated source | Conflict UI — never auto-pick generated |
| Store order / low-risk plan fields | Server last-write-wins |
| Checkbox on two devices | Per-row RPC; no full-doc race |
| Equal server revision after local optimistic write | Keep local optimistic state until RPC echo or invalidation resolves |
| Apply blocked by in-flight mutation | Delay once; retry via shared coalesced hydrate after drain |
| Catalog rename affects generated rows | Advance catalog generation and invalidate derived plan/list rows |

**No** field-level Realtime merge. **No** CRDT.

---

## Code landmarks

| Area | Location |
|------|----------|
| Data door | `js/data/index.js` |
| Adapter | `js/data/adapters/supabaseAdapter.js` (~7k lines) |
| Shopping hydrate / Realtime | `js/main.js` — `hydrateShoppingStateFromDataService`, `scheduleFavoriteEatsRemoteShoppingPlanHydrate`, `mergeShoppingListDocWithGenerated` |
| Catalog item cache | `supabaseAdapter.js` — `listShoppingItems`, `bumpListShoppingItemsAggregateGeneration` |
| Recipe detail cache | `loadRecipeDetail`, `invalidateRecipeDetailCache` (invalidate on **every** write that changes cached shape) |
| List load | `loadShoppingListPage` (~line 14411) |
| Items load | `loadShoppingPage` (~line 9082) |
| Recipes load | `loadRecipesPage` (~line 7910) |
| Plan RPC | `catalog.load_shopping_state` in migrations |
| Perf harness | `npm run perf:capture:tour`, `npm run perf:items` |

**`walkRecipe` exists twice** in `supabaseAdapter.js` with different parameter names — edit one, check the other.

---

## Anti-patterns (will regress perf or sync)

- Painting from cache with **no** revision probe after MPA navigation
- Applying `load_shopping_state` without generation / mutation epoch checks
- `load_shopping_state` immediately after every checkbox toggle
- `force: true` hydrate on every hub page load once probe ships (except seed / invalidation)
- Caching derived plan rows without invalidating on catalog rename
- `recipeDetailResolvedCache` not invalidated after non-`saveRecipe` catalog writes
- Adding Realtime “guards” instead of remote-first reads
- Suggesting Shopping List “add a line” manual QA
- Timestamp comparison logic copied into multiple files
- Blocked hydrates that depend on a later focus/page event to recover
- Screen RPCs that return data without revision fields
- RPC migrations without explicit RLS/grant/security posture review

---

## Verification (required per slice)

**Always:**

- `node --check` on touched JS
- If migration: verify RPC in Supabase (MCP / SQL) before wiring UI
- If migration adds or changes RPCs: review grants, RLS assumptions, `security definer` usage, `search_path`, and returned data shape

**Slice 1+:**

- Unchanged revisit: Network shows ≤1 small RPC (`get_shopping_revisions`), UI matches last session
- Changed list on device B: device A probe fails → one fetch → correct checks
- Same-tab MPA navigation: warm paint, probe only when unchanged
- Two tabs in same browser: no stale `sessionStorage` assumption across tabs; probe corrects truth
- Two devices / browsers: remote write in B cannot be overwritten by stale A hydrate
- In-flight checkbox + incoming hydrate: optimistic UI does not snap back; delayed hydrate eventually applies server truth
- Equal revision payload after optimistic edit: does not clobber the optimistic edit before the row RPC resolves

**Slice 2+:**

- Shopping List cold: ≤3 Supabase calls (ideally 1 screen RPC)
- Rapid checkbox toggle: no snap-back; HAR shows row RPC + at most one coalesced hydrate

**Roadmap matrix** (`docs/multi-device-roadmap.md`): save A → reload A → B; save A while B open; catalog rename affects plan/list.

---

## Success metrics

| Metric | Target |
|--------|--------|
| Shopping List revisit, unchanged | ≤1 revision RPC; fast paint from cache |
| Shopping List cold | ≤3 network calls |
| Items warm revisit | 0 catalog GETs if revision + catalogGen match |
| Checkbox burst | 0 snap-back; coalesced hydrate ≤1 per burst |
| Two-device | Roadmap matrix passes without manual refresh |
| Blocked hydrate recovery | Stale window closes automatically after mutation drain |
| Revision correctness | Every Plan/List rendering write changes the observed probe token |

Optional: `npm run perf:capture:tour` before/after; compare `feNavToShellPaintMs` in `perf-artifacts/`.

---

## What to kill as slices land

1. `hydrateShoppingStateFromDataService({ force: true })` on every hub load → probe-first
2. `refreshFavoriteEatsCatalogReferenceCaches` on Shopping List load → screen RPC or store
3. Full hydrate after each checkbox
4. `listShoppingListRecipeSummaries` full-table scan
5. `maintainShoppingPlanStorageWithDb` on every list paint
6. New local-first bridge paths

---

## First PR checklist (Slice 1)

- [ ] `supabase/migrations/*_get_shopping_revisions.sql`
- [ ] `js/favoriteEatsStore.js` (minimal)
- [ ] `dataService.getShoppingRevisions()` + adapter
- [ ] Probe integrated in `hydrateShoppingStateFromDataService`
- [ ] Single-flight `load_shopping_state`
- [ ] Canonical revision comparison helper, with explicit null/equal/older/newer cases
- [ ] Apply-block retry after row RPC / plan save guard drains
- [ ] Tests or small node script for revision monotonicity, equal-revision behavior, null seeding, blocked-apply retry, and coalesced hydrate
- [ ] RPC security review noted in PR summary: grants, RLS assumptions, `security definer` / `search_path` posture
- [ ] Update `docs/app-performance-optimization.md` changelog when shipped

---

## Communications

- User prefers brief, plain language and step-by-step manual tests when UI behavior changes.
- This is a hobby app: avoid proposing observability platforms or large refactors unless asked.
- Do not touch `experiments/name-deck/*`.
- Do not fix shopping variant editor Shift+Enter/focus unless explicitly asked (`docs/migration-sweep.md`).

When a round changes code or database behavior, the user’s preference is to end the reply with: **Happy Birthday!!! 🎂🎉🎁**

---

## Changelog

- **2026-05-21:** Initial handoff doc from warm-client + multi-device planning sessions.
