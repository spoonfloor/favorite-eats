# Document session — design

**Repo:** `favorite-eats-document-session` (sibling clone of `favorite-eats`)  
**Branch:** `feat/document-session-recipe-editor` (patient zero)  
**Status:** Recipe editor host implemented. **Recipes browse** host (`recipesBrowse` kind, `membership` / `filterChrome` / `visibleRows` / `actionChrome`) wired on `recipes.html`. Items browse host sketched; not wired on main.

**Related (main repo):** `docs/spammable-input-charter.md` — input sync contract; wins on conflicts with this doc.

---

## Summary

Screens need a **high-level way to learn that data they consume changed** and to **repaint the right UI surfaces once**, instead of every refresh hook updating whatever happens to be in the DOM.

`favoriteEatsDocumentSession` is the first implementation of that idea: **mutate (or ingest) → coalesce → paint declared surfaces**. It is **not** a replacement for the spammable input pipeline (local apply + narrow RPC + per-key echo skip).

**Strategy:** Build the widget **high** (stable, general contract). Apply **low** (ad hoc page migration when real bugs force the surface list). Each new bug becomes a **test case** and a chance to harden the infra — revise the core contract only for unforeseen gaps, not per-page convenience.

---

## Problems this addresses

### Patient zero — recipe editor

1. **Save flicker** — Multiple independent full redraws of “You will need” (YWN) and ingredients during one Save (blur commit, preflight rerenders, post-save `renderRecipe`).
2. **Catalog variant delete** — When the editor is dirty, catalog refresh can skip `loadRecipeDetail` and re-render stale `window.recipeData`, so deleted variant text remains on open recipes.

### Forcing function — Items browse + **selected** filter (main repo)

Observed on `shopping.html` (Items planner):

1. User enables **selected** filter → sees recipe-derived rows (e.g. allspice **1**).
2. User adds another selected recipe (e.g. **Aah!** → almond butter **2**) while plan/composition changes.
3. **allspice** still updates (row already in the list; stepper/amount sync runs).
4. **almond butter** never appears until the user toggles the filter or reloads.

**Root cause (conceptual):** Recipe-derived read model updates (`shoppingRecipeQuantities`, plan row index, chip counts) without a **membership** repaint. `recomputeRecipeDerivedPlanDisplay()` ends in `refreshShoppingSelectionUi({ fullRerender: false })`, which syncs **existing DOM rows** and filter chips but does **not** call `applyShoppingFilters()` → `renderShoppingList(getFilteredShoppingRows())`.

Partial fixes on main (plain-step promotion, chip rerender after hydrate) improved stepper and chip **disabled** state; the **filtered list** still misses new rows when plan changes arrive via plan realtime or composition hooks (paths that omit `applyShoppingFilters()`).

This bug is **direct bearing** on document session design: it proves the coordinator must model **list membership** as a first-class **surface**, not only in-place cell updates.

---

## Relationship to the spammable input charter

The charter and document session solve **different layers**. Both must coexist on the same pages (Items, Recipes, Shopping List).

| Layer | Responsibility | Must not |
|--------|----------------|----------|
| **Spammable input** (`docs/spammable-input-charter.md`) | User taps: local apply now, narrow RPC flush, per-key `updated_at`, echo/wholesale skip rules | Use time windows, whole-plan save on routine input, or wholesale hydrate as the routine echo path |
| **Document session** | Read model changed: wake the screen, coalesce paints for **declared surfaces** | Re-run input flush, replace op queue, or paste wholesale snapshots over keys with pending ops |

### Rules when both are on one screen (e.g. Items browse)

1. **Stepper / checkbox input** stays on the charter path: `applyLocal` vs `flushRemote` remain separate functions; document session does not enqueue plan saves.
2. **Repaint after read-model change** goes through document session (or an equivalent invalidate → schedulePaint registry): recipe-derived hydrate, plan realtime (non-row patches), composition refresh.
3. **`membership` paint** may rebuild the list (`applyShoppingFilters`). Charter still applies: per-row patches for `plan.selected_items` child events; wholesale hydrate only on boot/recovery with per-key merge. A list rebuild must **not** reset in-flight stepper state for keys the queue still owns (reuse existing sync paths after render, or patch-only rows where possible).
4. **Parent companion events** (`plan.documents` bump) stay absorbed on the spammable path; document session may react to the **derived** read model refresh triggered after row-level truth is known, not by running `load_shopping_state` on every companion event.
5. **Defer paint during user edit** — If Items later uses `beginDeferPaint` for bulk operations, defer only **read-model surfaces**, not synchronous local apply on tap.

If this doc and the charter disagree, **the charter wins** for input behavior.

---

## Design principles

### Stable contract, opportunistic adoption

Freeze the **shape** early; add hosts and surfaces incrementally.

**Revise v1 only when reality breaks the model** (e.g. ordering guarantees between surfaces, hot-path partial invalidation the bus cannot express, or accidental coupling of input flush into paint). Do **not** revise the core API for one-page naming or to avoid registering another surface.

### Widget high, apply low

- **Core module** — invalidation → coalesce → run registered painters (small, tested).
- **Per host** — register `kind`, surfaces, and which upstream hooks call `invalidate` / `schedulePaint`.
- **Strangler** — legacy `rerender*` and hook bodies remain until that path is provably redundant; new bugs prefer wiring through the session over a third one-off refresh.

### Surfaces are per-host, not global

Recipe editor: `ingredients`, `youWillNeed`, `fullPage`.  
Items browse (proposed): `membership`, `filterChrome`, `visibleRows` (see below).  
Names are host-local; the contract only requires **string surface ids** and a **set** coalesced per frame/generation.

### Tests assert architecture

Each migration ships a **repro** encoded as a test (e.g. selected filter + new recipe-derived row appears without toggling chip). Static architecture tests guard module shape; behavioral tests guard invalidation → paint edges.

---

## Contract (v1 — intended stability)

### Concepts

- **Host / kind** — One active session per open document context (`recipe`, `itemsBrowse`, …).
- **Model** — Host-defined canonical object (e.g. `window.recipeData`, Items planner maps + `shoppingRows`).
- **Invalidation** — Something changed the data the host displays (save, catalog purge, plan recipe selection, composition bump). Carries `reason` + optional scope (`recipeIds`, `planKeys`, …). Payload extensible; core API does not embed product rules.
- **Surface** — A named repaint callback registered by the host. Coalesced; run at most once per commit generation per surface.
- **Defer / commit** — Optional batching (Save, multi-step preflight) so intermediate states do not paint.

### Core API (recipe kind today; generalize without renaming)

| API | Role |
|-----|------|
| `createRecipeSession({ recipeId, getModel, setModel })` | Bind host on load |
| `getActiveRecipeSession()` | Current session or `null` |
| `beginDeferPaint()` / `abortDeferPaint()` / `commitPaint({ surfaces, reason })` | Batch paints (Save) |
| `schedulePaint(surfaces)` | Coalesce paints (rAF); no-op while deferred |
| Catalog purge helpers | Stash/consume/apply variant purge patches on open model |

**Future (same module, new kinds):** e.g. `createItemsBrowseSession`, `invalidateItemsBrowse({ reason, recipeIds? })`, shared `schedulePaint` / coalescing engine. Recipe and Items share **coalescing mechanics**; they do not share surface names.

### Invalidation sources (Items browse — target wiring)

| Source | Today (main) | Should invalidate |
|--------|----------------|-------------------|
| `hydrateRecipeDerivedShoppingSelections` + plan row index | `refreshShoppingSelectionUi(false)` | `membership`, `filterChrome`, `visibleRows` |
| `registerFavoriteEatsRemotePlanUiRefreshHook` | recompute derived; **no** `applyShoppingFilters` | same |
| `registerFavoriteEatsCatalogCompositionUiRefreshHook` | recompute derived; **no** `applyShoppingFilters` | same |
| `runDeferredRecipeDerivedHydrate` (idle boot) | calls `applyShoppingFilters()` | same (already correct outcome; route via session) |
| User toggles filter chip | `applyShoppingFilters()` | `membership` only (optional optimization) |
| Charter: `plan.selected_items` child patch | per-row local apply + row sync | `visibleRows` for affected key; **not** full plan snapshot |

---

## Patient zero — recipe editor (implemented)

| Item | Location |
|------|----------|
| Module | `js/favoriteEatsDocumentSession.js` |
| Global | `window.favoriteEatsDocumentSession` |
| Loaded on | `recipeEditor.html` (before `recipeEditor.js`) |

### Surfaces

| Surface | Paint |
|---------|--------|
| `ingredients` | `recipeEditorRerenderIngredientsFromModel({ syncYouWillNeed: false, skipDocumentSessionQueue: true })` |
| `youWillNeed` | `recipeEditorRerenderYouWillNeedFromModelAsync()` |
| `fullPage` | `renderRecipe(model)` (post-save, new ids) |

### Wiring

| Area | Behavior |
|------|----------|
| **Load** | After `renderRecipe(recipe)`, `createRecipeSession` binds `window.recipeData`. |
| **Save** | `beginDeferPaint` before preflight; model-only updates during preflight; legacy inline `renderRecipe` skipped when session active; `commitPaint(fullPage)` on success, `abortDeferPaint` on failure. |
| **Ingredients rerender** | If session active and not `skipDocumentSessionQueue`, `schedulePaint` instead of immediate DOM. |
| **Catalog purge** | Adapter notify → stash patch; dirty editor applies patch before grammar fallback. |

### Key files

- `js/favoriteEatsDocumentSession.js`
- `js/screens/recipeEditorPage.js`
- `js/recipeEditor.js`
- `js/main.js` — `tryApplyOpenRecipeEditorCatalogPatches`
- `tests/runDocumentSessionArchitectureTests.js`

---

## Next host — Items browse (sketch)

### Session binding

On `loadShoppingPage` (planner mode): `createItemsBrowseSession({ getModel, … })` where `getModel` returns the planner read model handles the screen already maintains (`shoppingRows`, `shoppingQuantities`, `shoppingRecipeQuantities`, `shoppingBrowsePlanRowsByKey`, `activeFilterChips`, …).

Teardown on `pagehide` (same as existing hook unregister).

### Proposed surfaces

| Surface | Paint function | When required |
|---------|----------------|---------------|
| **`membership`** | `applyShoppingFilters()` | Filter chips active **or** recipe-derived/plan change may add/remove rows (fixes **selected** filter bug) |
| **`filterChrome`** | `recomputeShoppingChipCounts` + `rerenderShoppingFilterChips` + dock `sync` | Counts change when recipe/direct selection set changes |
| **`visibleRows`** | `syncAllVisibleShoppingRowStates` (+ variant children / parents) | Qty/display tails change; keys already in DOM |

**Critical:** Any invalidation that today ends in `recomputeRecipeDerivedPlanDisplay()` must schedule at least **`membership`** and **`filterChrome`** when `activeFilterChips` can narrow the list (always schedule `membership` on planner mode for simplicity until profiling says otherwise).

### Path to fix the **selected** filter bug via document session

**Phase A — hotfix on main (optional if not already merged):** Call `applyShoppingFilters()` from every path that calls `recomputeRecipeDerivedPlanDisplay()` (plan realtime hook, composition hook). Low risk; does not require document session merge.

**Phase B — document session on Items (strangler):**

1. Extend `favoriteEatsDocumentSession.js` with `itemsBrowse` kind (or generic `createSession({ kind, … })`) reusing defer/schedule/commit/coalesce.
2. Register the three surfaces above in `itemsPage.js`.
3. Replace direct `refreshShoppingSelectionUi(false)` tails with `session.schedulePaint(['filterChrome', 'visibleRows'])` and `session.schedulePaint(['membership', 'filterChrome', 'visibleRows'])` when recipe-derived read model changes.
4. Single helper: `invalidateItemsBrowseFromPlanDerived(reason)` called from plan refresh hook, composition hook, and `runDeferredRecipeDerivedHydrate` — **one** place that decides surface set.
5. Add test: selected chip on → select second recipe with new ingredient → almond butter row appears without chip toggle.
6. Add architecture test: plan refresh hook must not call only `syncAllVisibleShoppingRowStates` without `membership` paint registration.

**Phase C — charter hardening:** Ensure `membership` repaint respects pending qty ops (re-sync from local maps after filter; do not hydrate-overwrite pending keys). Document in charter appendix if list rebuild needs explicit rules.

### What this bug taught the design

1. **“Repaint” ≠ “sync visible rows.”** Membership is a separate surface from cell sync.
2. **Filter UI ≠ list UI.** Chip disabled state (`filterChrome`) can update while the list is stale — both must be scheduled from the same invalidation when counts and membership depend on the same read model.
3. **Invalidation must be centralized.** Multiple hooks (plan realtime, composition, idle hydrate) need one **invalidate** entry point or surfaces will always drift.
4. **Read-model changes ≠ user input.** Recipe selection on another page is not a stepper op; it must not go through `enqueue` but must still wake Items.

---

## Not in scope (recipe-editor branch)

- Full Items / planner session implementation
- Removing every legacy `rerender*` call site on the editor (strangler continues)
- Debounce-as-primary-fix for YWN (explicitly avoided; same for Items list)
- Replacing spammable op queue or narrow RPCs

---

## Verification

### Recipe editor (patient zero)

1. Paste + Save — one ingredient line; YWN updates once without repeated blank flashes.
2. Dirty editor + catalog variant delete — row loses variant without manual refresh; unsaved edits preserved.
3. Clean editor + variant delete — full reload from server still works.

```bash
node tests/runDocumentSessionArchitectureTests.js
node tests/runRecipeCompositionSyncArchitectureTests.js
```

### Items browse (when implemented)

1. **Selected filter + new recipe ingredient** — Second recipe adds row visible under **selected** without toggling chip.
2. **Spammable stepper** — Rapid +/- on visible row still charter-clean (no snapback; no whole-plan save in HAR).
3. **Plan realtime while filtered** — Composition/plan hook schedules `membership` paint (architecture test).

---

## Follow-ups

- Route `recipeEditorAfterIngredientEditCommit` entirely through session.
- YWN skeleton during async merge so `fullPage` never shows an empty card.
- `recipeIdsTouched` on purge RPC for multi-recipe scope.
- Implement `itemsBrowse` host per sketch above; align main-repo hooks to `invalidateItemsBrowseFromPlanDerived`.
- Document per-host surface one-liners in this file as each migrates (keep the contract table stable).

---

## Merge notes

- Develop in `favorite-eats-document-session` until reviewed; merge to main when patient zero + tests are green.
- Items **selected** bug can land on main before or in parallel with Phase B; Phase B should subsume ad hoc `applyShoppingFilters` calls into session invalidation.

---

## References

- `docs/spammable-input-charter.md` (main repo) — input path; non-negotiables
- `docs/known-issues.md` (main repo) — “shared infrastructure for redrawing pages”
- `js/screens/itemsPage.js` (main) — `applyShoppingFilters`, `recomputeRecipeDerivedPlanDisplay`, filter matcher `getShoppingRowHasPlainStepSelection`
