# Shopping state save hardening — staged proposal

Last updated: 2026-05-22.

Companion docs: `docs/catalog-plan-list-supabase.md`, `docs/agent-handoff-full-catalog-stress.md`, `.cursor/rules/shopping-state-known-fragility.mdc`.

This document traces how Plan, List, and Catalog writes actually behave today, states **opinionated choices** (not a buffet of options), and proposes a **staged** fix path: **Good → Better → Best → Diminishing returns**.

---

## 1. Incident summary (what we are fixing)

During a two-browser full-catalog stress test (no user Reset), the meal plan disappeared on both devices. Shopping List showed the empty state (“utter emptiness”) because **generated rows and recipe summaries both derive from Plan**.

Contributors in the same window:

- Two **agent bug-fix deploys** (page reloads → in-memory plan cache reset)
- Two **item display-name changes** (catalog editor save)
- Ongoing **coalesced plan saves** and **Realtime hydrates** across browsers

**Working theory (supported by code traces below):** a **full snapshot save** ran with an **empty or stale in-memory plan** and overwrote authoritative Supabase rows. Item rename is a high-risk trigger because it intentionally calls `save_shopping_state` with `{ plan, shoppingListDoc }`.

---

## 2. Architecture recap (three schemas, one bad RPC)

| Schema | Authority | Typical write style today | Blast radius of bad snapshot |
|--------|-----------|---------------------------|------------------------------|
| **catalog** | Reference data (recipes, ingredients, stores) | Delete-then-reinsert **per entity id** | One recipe / one item / one store |
| **plan** | User intent (selected recipes/items/stores) | Full replace via `save_shopping_state` or `save_shopping_plan` | **Entire meal plan** (single `default` document) |
| **list** | Shopping artifact (checks, overrides, generated rows) | Full replace via `save_shopping_state` **or** narrow per-row RPCs | **Entire list session** |

The systemic bug is not Postgres. It is **using snapshot-replace RPCs from narrow UI actions**, without:

1. **Hydrate-before-write** guarantees
2. **Empty-snapshot rejection**
3. **Revision guards** (last-write-wins)

---

## 3. Code traces (evidence)

### 3.1 Plan writes

**Entry points**

| Caller | Payload | RPC used |
|--------|---------|----------|
| `persistShoppingPlan` → `queueSaveShoppingStateToDataService({ plan })` | plan only | `save_shopping_plan` (coalesced, 400ms debounce) |
| `awaitPersistShoppingStateToDataService({ plan })` | plan only | `save_shopping_plan` |
| `awaitPersistShoppingStateToDataService({ plan, shoppingListDoc })` | plan + list | **`save_shopping_state`** |
| `migrateShoppingIdentityAfterIngredientEditorSave` | plan + optional list | **`save_shopping_state`** |
| Legacy bridge / empty-remote bridge in `persistShoppingHydrateRemoteStateToMain` | plan and/or list | awaited full or plan-only |

**In-memory seed (remote mode)**

```text
loadShoppingPlanFromStorage()
  → if shoppingPlanCache is null and remote mode
  → createEmptyShoppingPlan()   // until hydrate assigns cache
```

Any `persistShoppingPlan` / `getShoppingPlan()` between page load and successful hydrate can serialize `{}`.

**Server SQL (`save_shopping_state`, plan branch)**

```sql
delete from plan.selected_items where document_id = v_doc_id;
-- reinsert from payload itemSelections
delete from plan.selected_recipes where document_id = v_doc_id;
-- reinsert from payload recipeSelections
delete from plan.selected_recipe_roots where document_id = v_doc_id;
-- roots key absent in payload ⇒ treated as empty (clears roots)
```

**Server SQL (`save_shopping_plan`)**

Set-based delete-not-in + upsert. Still destructive if payload is empty, but **does not touch list tables** and **does not call `load_shopping_state`**.

**Coalescing (partially landed)**

- Plan-only queue → `scheduleCoalescedPlanSaveToDataService` → `save_shopping_plan`
- Add-all / remove-all batching via `runWithShoppingPlanMutationBatch` (add-all yes; remove-all **not** batched)
- `pagehide` flushes pending coalesced plan (can persist stale snapshot if memory wrong)

### 3.2 List writes

**Narrow (safe) paths — keep and extend**

| RPC | Used for |
|-----|----------|
| `set_shopping_list_row_checked` | checkbox toggles |
| `set_shopping_list_row_text` | line text edits |
| `append_manual_shopping_list_row` | single manual row append (fallback to full save on failure) |

**Full snapshot paths — risky**

| Caller | Payload | Notes |
|--------|---------|-------|
| `persistShoppingListDoc` → `queueSaveShoppingStateToDataService({ shoppingListDoc })` | list only | Plan **not** deleted in SQL, but **entire list session** replaced |
| `awaitPersistShoppingStateToDataService({ shoppingListDoc })` | list only | Shopping List: reset, discard, uncheck-all, conflict resolve, restore-all, RPC bootstrap fallback |
| Item rename migration | plan + list | **Cross-schema wipe risk on plan** |
| `healShoppingListDocWithGeneratedFromPlan` → `persistShoppingListDoc` | list | Can save sparse doc if plan empty at heal time |

**Server SQL (`save_shopping_state`, list branch)**

```sql
delete from list.conflicts where session_id = v_session_id;
delete from list.manual_rows where session_id = v_session_id;
delete from list.row_overrides where session_id = v_session_id;
-- reinsert from shoppingListDoc.rows
```

Empty `rows: []` ⇒ all checks, overrides, and manual rows gone.

### 3.3 Catalog writes

**Scoped delete-then-reinsert (acceptable blast radius, still fragile per entity)**

| Path | Scope |
|------|-------|
| `saveShoppingCatalogItem` | one `ingredient_id`: variants, sizes, synonyms |
| `save_recipe` | one `recipe_id`: tags, steps, headings, ingredient map |
| `save_store_layout` | one `store_id`: per-aisle links |

**Coupling to Plan/List (the real catalog problem)**

Item editor save → `saveShoppingCatalogItem` (scoped, OK) → **`migrateShoppingIdentityAfterIngredientEditorSave`** → if keys remapped:

1. `updateShoppingPlan` (local key rewrite)
2. `patchShoppingListDocForRewrittenSelectionKeysAsync` (local list patch)
3. **`awaitPersistShoppingStateToDataService({ plan: getShoppingPlan(), shoppingListDoc })`** ← **full snapshot**

Catalog Realtime (`subscribeCatalogReferenceChanges`) → `scheduleFavoriteEatsRemoteShoppingPlanHydrate({ force: true })` on **all** open tabs. Hydrate-only, but amplifies races with in-flight saves.

### 3.4 Hydrate / authority

- `favoriteEatsStore` holds authoritative snapshot + revisions in `sessionStorage`
- Probe-first hydrate can skip network when revisions match
- `shoppingStateRemoteWriteSuppressed` during hydrate apply — **silent drop** of queued saves
- `shoppingPlanRemoteSaveInFlight` blocks hydrate apply — good for stale read, bad if counter stuck
- No server-side rejection when client sends older/empty snapshot

---

## 4. Opinionated principles (choices made)

These are **decisions**, not options to re-debate each PR.

### P1 — Snapshot replace is a legacy escape hatch, not a default write path

**Choice:** New work must not add callers of `save_shopping_state` for incremental edits.

**Defense:** Every full save is O(n) delete+insert, races under multi-tab load, and couples unrelated slices (rename → plan wipe).

### P2 — Plan and List must never accept an empty overwrite of non-empty server state

**Choice:** Client refuses to send; server refuses to apply (Better stage). “Empty” means `!shoppingPlanHasSelections(plan)` for plan; list uses row-count + revision probe.

**Defense:** This single guard would have prevented the reported incident even if memory was stale after reload.

### P3 — Item identity changes patch keys; they do not re-save the universe

**Choice:** Replace `migrateShoppingIdentity…` full save with a **narrow plan-key rewrite RPC** + existing list key patch RPCs (Better). Until that RPC exists (Good), **omit plan from rename save** and only persist list key patches via narrow paths.

**Defense:** Rename affects a bounded set of `item_key` values. Sending 800 recipe rows because one ingredient renamed is incorrect modeling.

### P4 — Keep catalog entity saves as-is for now

**Choice:** Do **not** open a catalog-wide migration in this effort. Optionally add client guard: block `saveShoppingCatalogItem` if variant payload is empty when prior had variants (Good, tiny).

**Defense:** Blast radius is one entity; hobby-app risk is dominated by shared Plan document. Catalog work is distraction until Plan/List are safe.

### P5 — `save_shopping_plan` is the only plan write path for planner edits

**Choice:** Finish routing all plan-only client saves through `save_shopping_plan`; deprecate plan branch of `save_shopping_state` for client-initiated writes.

**Defense:** Already migrated in adapter for plan-only awaited/coalesced path; avoids list table churn and expensive reload.

### P6 — List checkbox/text stay on per-row RPCs; bulk list ops get narrow bulk RPCs, not full doc

**Choice:** Reset / uncheck-all / discard / conflict-resolve should not call `save_shopping_state` with entire doc (Better). Good stage: require hydrate + non-empty guard before any full list save.

**Defense:** Matches existing checkbox architecture documented in `docs/multi-device-roadmap.md`.

### P7 — No “raise statement_timeout” as the fix

**Choice:** Rejected. Timeouts that fail are preferable to timeouts that commit half-empty snapshots (Postgres transactions roll back, but **successful** empty saves are the bug).

### P8 — No SPA rewrite / main.js split as part of this proposal

**Choice:** Changes stay localized to save door, migrate paths, and small RPCs. Tests at JS + migration level.

---

## 5. Staged approach

### Stage Good — stop the bleeding (1–2 PRs, ~1 week)

**Goal:** Prevent empty plan/list snapshots from reaching Supabase. Finish in-flight stress hardening. **No new tables.**

| # | Change | Where | Defense |
|---|--------|-------|---------|
| G1 | **`assertSafePlanSnapshotBeforeRemoteSave(plan)`** — if `!shoppingPlanHasSelections(plan)`, probe server (`getShoppingRevisions` + quick row count or lightweight probe RPC); if server has selections, **abort save** and force hydrate | `queueSaveShoppingStateToDataService`, `awaitPersistShoppingStateToDataService` | Direct fix for reload-before-hydrate and coalesced empty flush |
| G2 | **`assertHydratedBeforePlanWrite()`** — block plan writes until `shoppingStateSnapshotLoaded` or `favoriteEatsStore.hasAuthoritativeSnapshot()` with selections | same + `persistShoppingPlan` | Closes race on fresh Incognito tab |
| G3 | **Item rename: stop sending full plan** — in `migrateShoppingIdentityAfterIngredientEditorSave`, persist **list key patches only** (narrow RPC or list-only save with G1 guard); plan key rewrite stays local + **`save_shopping_plan` with full plan only after G1/G2 pass** OR defer plan persist until hydrate confirms | `js/main.js` ~6066 | Removes dumbest coupling immediately |
| G4 | **Batch remove-all** like add-all (`runWithShoppingPlanMutationBatch`) | `itemsPage.js`, `recipesPage.js` | Stress matrix step 8 |
| G5 | **Finish coalesced plan save** (in flight): one in flight, trailing debounce, pagehide flush with G1 | `js/main.js` | Already in handoff doc |
| G6 | **List full-save guard** — before `save_shopping_state` with list only, if rows empty and server list session has overrides/generated rows, abort + hydrate | `persistShoppingListDoc` / awaited list saves | Parallels G1 for list |
| G7 | **Tests** | `tests/runShoppingPlanStoreOrderTests.js`, new guard tests | Regression net |

**Explicitly not in Good:** new SQL functions (except deploying existing `save_shopping_plan` migration if not live).

**Verification**

1. Reload mid-stress → rename item → plan row counts unchanged in DB
2. Two tabs, add-all, no empty `save_shopping_plan` / `save_shopping_state` bodies in network
3. Simulated empty `getShoppingPlan()` → save rejected, toast or console warn (user-visible in dev)

---

### Stage Better — narrow writes and decouple schemas (2–3 PRs)

**Goal:** Remove full snapshot from all routine paths. Add minimal SQL.

| # | Change | Defense |
|---|--------|---------|
| B1 | **`catalog.rewrite_plan_item_keys(jsonb map)`** — `{ "oldKey": "newKey", ... }` updates `plan.selected_items.item_key` + metadata; returns revision | Rename and reconcile persist **only affected keys** |
| B2 | **`catalog.patch_shopping_list_source_keys(jsonb map)`** — updates `list.row_overrides.source_key` / `list.generated_rows.source_key` for active session | Pairs with B1; replaces list portion of rename full save |
| B3 | **Wire rename migration to B1+B2 only** — delete `awaitPersistShoppingStateToDataService({ plan, shoppingListDoc })` from rename path | Catalog edit no longer touches plan snapshot replace |
| B4 | **List bulk RPCs** — e.g. `list.uncheck_all_rows(session)`, `list.apply_list_doc_reset(session, mode)` implementing reset/discard without delete-all manual rows unless intended | Shopping List reset/uncheck-all/conflict-resolve |
| B5 | **Route all plan planner saves to `save_shopping_plan`** — remove client use of plan branch in `save_shopping_state` | Performance + isolation from list |
| B6 | **Server empty guard (plan)** — in `save_shopping_plan` and `save_shopping_state` plan branch: if payload has zero selections **and** existing document has rows, `raise exception` unless `allow_empty: true` header/param | Last line of defense when client guard fails |
| B7 | **Reconcile/prune** — after `reconcileShoppingPlanItemSelectionKeysWithDataService`, persist via **`save_shopping_plan` with G1**, never full state | Background maintenance was silently queueing full plans |

**Verification**

- Rename item with 500 plan rows: network shows `rewrite_plan_item_keys` + small list patch, **no** multi-KB plan JSON
- Full-catalog stress matrix passes (handoff doc § Verification)

---

### Stage Best — concurrency and observability (1–2 PRs)

**Goal:** Correctness under intentional multi-device editing, not just accident prevention.

| # | Change | Defense |
|---|--------|---------|
| T1 | **Optimistic concurrency** — client sends `expectedPlanVersion`; server rejects stale writes (`409`-style in RPC JSON) | Last-write-wins becomes explicit conflict |
| T2 | **Conflict UX** — on reject: hydrate + toast “Plan changed on another device”; never silently overwrite | User trust |
| T3 | **`save_shopping_state` demoted to admin/migration tool only** — document + grep gate in CI | Prevents regression |
| T4 | **Hung-save detection** — in-flight save timeout + user toast (does not fix silent skip, but closes hung fetch gap from handoff doc) | Operational |
| T5 | **Deploy `get_shopping_revisions` probe everywhere** before destructive saves | Cheap preflight |

**Verification**

- Two browsers edit different steppers simultaneously → both changes preserved or one conflict toast
- No successful save with `expectedPlanVersion` older than server

---

### Stage Diminishing returns — do not do unless product grows

| Idea | Why skip |
|------|----------|
| CRDT / OT for plan | 2-user hobby app; cost >> benefit |
| Event sourcing for list | Rebuild complexity; narrow RPCs suffice |
| Split `main.js` / SPA rewrite | Unrelated to save safety; high regression |
| Catalog-wide upsert refactor | Per-entity scope already limits damage |
| Raise `statement_timeout` globally | Masks perf; doesn’t fix model |
| Real-time merge of planner steppers | Best stage conflict UX is enough |

---

## 6. Recommended PR order (concrete)

1. **PR-A (Good):** G1, G2, G5, G4 + deploy `save_shopping_plan` if needed  
2. **PR-B (Good):** G3, G6, G7 — rename + list guards  
3. **PR-C (Better):** B1, B2, B3 migrations + adapter + rename wire-up  
4. **PR-D (Better):** B4, B5, B6, B7 — list bulk + server guards + reconcile  
5. **PR-E (Best):** T1, T2, T5 — versioned writes + conflict UX  

---

## 7. What we will not argue about in review

- Item rename **will not** call full `save_shopping_state` with plan after PR-B.
- Empty plan **will not** overwrite non-empty server plan after PR-A (client) and PR-D (server).
- Checkbox edits **will not** regress to full list saves (already true; covered by tests).
- Shopping List **will not** gain free-text “add a line” UX as part of this work (product rule).

---

## 8. Success criteria (definition of done)

**Good done when:** Reproduce incident recipe (reload → full catalog → rename item, two browsers) **without** plan row count dropping in Supabase.

**Better done when:** No production caller sends full plan JSON for edits affecting &lt; 5 keys; list reset uses bulk RPC.

**Best done when:** Stale write attempt returns conflict, user sees toast, data unchanged on server.

---

## 9. Open questions (none blocking Good)

1. Is `20260531120000_save_shopping_plan.sql` applied on the live Supabase project? If not, PR-A includes apply migration.
2. Do we want empty-overwrite guard to **log to console only** (dev) or **user toast** (prod)? **Choice:** toast in prod for plan block; console in dev for list block until Better bulk RPCs reduce full saves.

---

## 10. One-sentence moral

**Stop using “replace my entire document” as a proxy for “change one key.”** Guard empty snapshots first; narrow the writes second; add version conflicts third; ignore CRDT cosplay.
