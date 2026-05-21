# Multi-Device Supabase Roadmap

## Goal

Favorite Eats should work across devices without losing the current split between:

- **Catalog**: durable recipe, ingredient, tag, unit, size, store, and aisle data.
- **Plan**: the user's current shopping/cooking intent for this shop or week.
- **List**: the active shopping artifact generated from Catalog + Plan, with tactical overrides.

The database already has `catalog`, `plan`, and `list` schemas. The remaining work is to harden their contracts, fill semantic gaps, and migrate the local-only shopping behavior flow by flow.

## Rollout Rule

For each user-visible flow, make Supabase the durable source of truth first, then add live multi-device mirroring for that same flow, then verify both behaviors in two sessions. Realtime is not a substitute for remote-first Plan/List state; it is the layer that lets another open device refresh from the server without a manual browser reload.

Catalog changes that affect Plan/List output are part of this rule. If a recipe, ingredient, variant, store, aisle, unit, size, or tag changes on one device, any open Plan/List surface that depends on it must rehydrate, reconcile/prune, and redraw as if the user had refreshed.

## Current Position

- Catalog data is Supabase-first through `window.dataService`.
- `catalog.save_shopping_state(state_payload jsonb)` already persists parts of Plan and List state into `plan.*` and `list.*`.
- The browser runtime still uses localStorage as the first-class state container for shopping plan/list behavior in several flows.
- `js/main.js` holds shopping Plan/List remote-first behavior and admin flows. See `docs/multi-device-roadmap.md` for remaining multi-device work (not browser SQLite removal).
- `/Users/erichenry/Desktop/baby-eats` is a functional proof-of-concept for this model. It is stripped down, but it demonstrates multi-device plan sync, sparse serving overrides, Supabase Realtime table subscriptions, and shared presence.

## Migration north star (read this before choosing work)

The product goal is **not** “make symptoms go away” or “get Realtime updating first.” It is: **durable Plan/List live in Supabase; the browser treats the server as source of truth after load; localStorage is only cache or a short-lived bridge.**

**baby-eats feels easier** because it never built “local storage owns the shopping list, then we sync.” Favorite Eats still has that shape in `js/main.js` for shopping. Patching that layer (busy windows, suppressing writes during refresh, split channels, debounced hydrates) **fights the old model** instead of replacing it. Those changes are high churn and low lasting value.

**“Scoped” means one end-to-end slice** (one user-visible flow: load → edit → save → second session sees it), not “the smallest possible diff.” **“Smallest chunk you can verify”** refers to slice size, not line count.

**Right order for List/Plan:** (1) remote-first read path and honest writes per flow, (2) then Realtime/live refresh as a notification to re-fetch, (3) then presence and polish. Doing (2) before (1) recreated pain.

**Infra that already exists and should be reused, not re-litigated:** `list.*` in the Realtime publication + `SELECT` grants (see migrations), `window.dataService.subscribeListChanges`, and the `set_shopping_list_row_checked` RPC plus `dataService.setShoppingListRowChecked` for per-row checkbox writes when the List UI is actually server-first.

**Rollback note (2026-05):** The stack of Realtime/UI guard patches in `js/main.js` for the shopping list was rolled back so the next agent is not stuck maintaining local-first glue. Database and `dataService` primitives above remain available for a proper remote-first shopping list pass.

## Proof-of-Concept Reference

Before implementing Plan/List sync or presence, inspect `baby-eats` for working patterns:

- `supabase/migrations/20260427232036_create_menu_plan_and_modal_override.sql`: base menu plan rows plus sparse modal/serving overrides.
- `supabase/migrations/20260427232056_menu_plan_numeric_qty.sql`: numeric quantity support for fractional servings.
- `supabase/migrations/20260427232104_menu_tables_realtime_publication.sql`: adding plan tables to `supabase_realtime`.
- `js/supabaseDataApi.js`: remote plan fetch/upsert, Realtime subscriptions, and presence channel setup.
- `js/main.js`: hydration into local cache, push-suppression during hydration, and presence UI behavior.

Use `baby-eats` as an implementation reference, not as a schema to copy directly. This app already has richer `catalog`, `plan`, and `list` schemas.

## Phase 1: Freeze the Data Contracts

Clarify exactly what belongs in each schema before adding more write paths.

- Confirm whether `plan.selected_recipes.quantity` means "times making this recipe", "servings to use", or both.
- Add separate fields if needed, likely `make_count` and `servings_override`.
- Confirm that extra typed shopping items belong in `plan.selected_items`.
- Confirm how tactical rows map to `list.manual_rows` at the DB (Favorite Eats does **not** expose a Shopping List UI to compose brand-new free-text rows; durable extras use `plan.selected_items`).
- Confirm that generated list rows can always be rebuilt from Catalog + Plan.
- Decide whether there is only one active `plan.documents` row for now or whether named/week-based plans are in near-term scope.

Exit criteria:

- A documented field-level contract for `plan.selected_recipes`, `plan.selected_items`, `plan.store_preferences`, `list.generated_rows`, `list.row_overrides`, and `list.manual_rows`.
- No ambiguous "quantity" semantics left in new work.

## Phase 2: Inventory Local State

Audit localStorage/sessionStorage keys and classify them as durable remote state, local UI preference, or legacy migration bridge.

Durable remote state:

- selected recipe rows
- recipe make-counts
- recipe serving overrides
- extra typed shopping items
- selected store ids and store order
- list checked state
- list row text/location/order overrides
- removed generated rows
- list session rows persisted under `list.*` (including `list.manual_rows` when used server-side—not “user adds lines” on Shopping List)

Local-only UI state:

- scroll restoration
- temporary filter/search state
- collapsed/expanded panels
- one-shot focus helpers
- planner layout preference unless product direction says otherwise

Exit criteria:

- Every shopping-related storage key has an owner: `plan`, `list`, local-only, or delete.
- Future agents can pick a key/flow without rediscovering the whole app.

## Phase 3: Make Plan Remote-First

Move user intent to Supabase while keeping localStorage only as a cache/offline bridge.

Recommended flow order:

1. Store selection and store order.
2. Recipe selection and make-count.
3. Recipe serving override.
4. Extra item selection and quantity.
5. Reconcile/prune behavior when Catalog rows are renamed or deleted.

Implementation shape:

- Keep UI calls behind `window.dataService`.
- Prefer extending the existing shopping state RPC only when the write needs to stay bundled/transactional.
- Otherwise use focused adapter methods with clear names and short comments.
- Preserve the existing localStorage cache until hydration and conflict behavior are reliable.

Exit criteria:

- A second device can load the same Plan without relying on localStorage from the first device.
- Local changes flush to Supabase consistently.
- Reloading no longer loses selected recipes, extra items, serving tweaks, or store preferences.
- For each migrated Plan flow, a second already-open device observes the change without a browser refresh.
- Catalog rename/delete flows that affect the Plan trigger reconcile/prune and refresh dependent shopping screens.

## Phase 4: Make List Remote-First

Persist the active shopping artifact without letting it mutate Plan intent.

Recommended flow order:

1. Generated rows from the current Plan.
2. Checked/unchecked state.
3. User-edited row text.
4. Row order/location overrides.
5. Removed generated rows.
6. `list.manual_rows` / tactical persistence at the DB layer (no Shopping List “add line” UX).
7. Conflicts when regenerated source rows diverge from user edits.

Core invariant:

`Catalog + Plan -> generated List`, then `list.row_overrides` and `list.manual_rows` (tables) layer on top—see `docs/catalog-plan-list-supabase.md` for schema vs Shopping List UI.

Exit criteria:

- A second device can open the shopping list and see checked state, edits, removals, and list state mirrored from `list.*` (including table-backed rows); there is no user flow to type brand-new free-text rows on Shopping List.
- Changing Plan regenerates generated rows while preserving valid List overrides.
- Editing List rows does not alter Plan selections or serving overrides.
- For each migrated List flow, a second already-open device observes the change without a browser refresh.
- Catalog rename/delete flows that affect generated rows refresh the visible list and preserve valid overrides.

## Phase 5: Multi-Device Conflict Rules

Start simple, but make conflict behavior explicit.

Initial recommendation:

- Treat Supabase as the source of truth after hydration.
- Use `updated_at` and plan/list document versions to avoid silent stale overwrites where practical.
- Last-write-wins is acceptable for low-risk preferences.
- Preserve user-edited list rows when generated source text changes; use `list.conflicts` when the app cannot safely merge.
- Do not introduce a complex offline sync engine until real usage proves it is needed.

Exit criteria:

- Two-device behavior is predictable and documented.
- Stale writes do not silently erase high-value list edits without either preservation or a visible conflict.

## Phase 6: Retire Legacy LocalStorage Authority

Once Plan/List hydration and saves are stable, demote localStorage to cache or remove it where possible.

- Remove legacy migration fallbacks only after the remote path has covered existing user data.
- Keep local-only UI preferences local.
- Keep a small, explicit cache if startup latency needs it.
- Update docs when localStorage is no longer authoritative for shopping state.

Exit criteria:

- Durable app state lives in Supabase.
- localStorage contains only cache, UI preferences, or consciously temporary compatibility data.

## Verification Matrix

For each migrated flow, verify at least:

- Save on device A, reload device A.
- Save on device A, open/reload device B.
- Save on device A while device B is already open; device B updates without a browser refresh.
- Change Catalog data that Plan/List references, then reload shopping items and shopping list.
- Change Catalog data that Plan/List references while another device is already open; the other device refreshes/reconciles without a browser refresh.
- Change Plan and confirm List regeneration.
- Change List and confirm Plan is unchanged.

Manual verification is valuable for visible shopping flows. For pure helper changes, `node --check` and focused tests/mocks are enough when the behavior is clear by inspection.
