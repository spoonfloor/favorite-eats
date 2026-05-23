# Evergreen Starter Message: Multi-Device Supabase Work

Use this message at the start of a new chat when continuing the Catalog / Plan / List multi-device migration.

```text
We are migrating Favorite Eats to full multi-device support in Supabase.

The real goal: Supabase is the durable source of truth for Plan and List. After the page loads, treat the server as authoritative. localStorage is only cache, offline comfort, or a temporary legacy bridge — not the owner of shopping state.

NON-GOALS / PRODUCT FACTS (do not contradict):

- The Shopping List screen does NOT provide a UX to type and add a brand-new free-text checklist row. Do not suggest manual tests or migration “chunks” that assume that flow.
- The Postgres table list.manual_rows and merge/RPC paths are server/schema concerns—not “users add lines on Shopping List.” Durable extras belong in plan.selected_items (Items/planner), not imaginary Shopping List entry.

Required reading:

1. docs/agent-handoff-shopping-list-path3.md (Path 3 — **start here** for Shopping List sync)
2. docs/supabase-architecture.md
3. docs/catalog-plan-list-supabase.md
4. docs/multi-device-roadmap.md (especially “Migration north star” and “Path 3 finish gate”)
5. docs/multi-device-list-sync-architecture.md (target runtime)
6. docs/migration-sweep.md, especially if touching js/main.js
7. /Users/erichenry/Desktop/baby-eats as the functional proof-of-concept

Current model:

- catalog = durable recipe/catalog/reference data: recipes, ingredients, variants, tags, units, sizes, stores, aisles.
- plan = current intent for this shop/week: selected recipes, make-counts, serving overrides, extra items, selected stores, store order.
- list = active shopping artifact: generated rows plus checked state, edits, removals, row ordering/location overrides, list.manual_rows / overrides at the DB layer, and conflicts. (No Shopping List UI to compose brand-new free-text rows—see NON-GOALS above.)

Important invariant:

Catalog + Plan -> generated List rows.
Generated List rows + List overrides + server-side list rows (incl. list.manual_rows when present) -> shopping screen.
Editing List rows must not mutate Plan semantics unless the UI explicitly performs a Plan edit.

Repo facts:

- Supabase is accessed through window.dataService in js/data/index.js.
- The adapter is js/data/adapters/supabaseAdapter.js.
- UI code should not call PostgREST, RPCs, or database helpers directly.
- catalog.save_shopping_state(state_payload jsonb) already persists parts of Plan/List into plan.* and list.*.
- Infra already in the repo for the next phase: list.* Realtime publication + SELECT grants (migrations), dataService.subscribeListChanges, and per-row catalog.set_shopping_list_row_checked + dataService.setShoppingListRowChecked (use when List is server-first; do not delete without cause).
- js/main.js is still the active migration surface for shopping/admin flows. A prior stack of Realtime “guard” patches on the shopping list was rolled back — do not reintroduce busy-window / write-suppression layering until the underlying flow is remote-first.

baby-eats reference files:

- /Users/erichenry/Desktop/baby-eats/supabase/migrations/20260427232036_create_menu_plan_and_modal_override.sql
- /Users/erichenry/Desktop/baby-eats/supabase/migrations/20260427232056_menu_plan_numeric_qty.sql
- /Users/erichenry/Desktop/baby-eats/supabase/migrations/20260427232104_menu_tables_realtime_publication.sql
- /Users/erichenry/Desktop/baby-eats/js/supabaseDataApi.js
- /Users/erichenry/Desktop/baby-eats/js/main.js

Use baby-eats as an implementation reference, not as a schema to copy directly. This app already has richer catalog, plan, and list schemas.

Before choosing work:

1. Run git status and inspect recent commits.
2. Read docs/agent-handoff-shopping-list-path3.md — confirm v1 finish vs v2 charter with the user.
3. If touching Plan/List sync, inspect the relevant baby-eats files.
4. Search current code, not stale docs, for the flow you intend to touch.
5. Pick one vertical slice: a full user journey (e.g. open shopping list → change one durable thing → confirm on another session) that is small enough to verify in one pass.
6. Classify the state as catalog, plan, list, local-only UI preference, cache, or legacy bridge.
7. Prefer replacing local-first authority with remote-first behavior over patching symptoms.

Anti-patterns (do not repeat):

- Treating “scoped change” as “smallest diff” when the user asked for migration progress.
- Adding Realtime subscriptions, debounces, or busy guards to prop up localStorage-as-source-of-truth.
- Full-document list saves racing between windows (fix is server-first or per-row writes, not UI timers alone).

Rollout rule (unchanged):

For each user-visible flow, first make Supabase the durable source of truth, then add live multi-device mirroring, then verify both in two sessions. Realtime is not a replacement for remote-first Plan/List state; it only tells an already-open device to refresh from Supabase.

Good next chunks (Path 3 v1 finish — see handoff):

- Placement RPC: `set_shopping_list_row_placement` + client wiring + two-device verify
- Canonical `removed` flag end-to-end (replace pseudo-store)
- Realtime resubscribe when returning to Shopping List without full reload
- Isolate plan-refresh hook from list-only checkbox/remove sync

Do NOT start v2 (local-first op sync) without explicit user charter.

Operational imperatives:

- Preserve existing dirty user data; do not wipe local state casually.
- Prefer extending dataService over bypassing the data door.
- Use bundled save_shopping_state only when the write must be transactional; otherwise prefer focused RPCs or clear per-field paths as baby-eats does.
- Do not touch experiments/name-deck/*.
- Do not spend time on the known shopping item editor Shift+Enter/focus issue unless explicitly asked.
- For database changes, use Supabase CLI/MCP per the Supabase skill; create migrations through the CLI when ready.
- For exposed schemas, keep RLS in mind. Never expose service-role or secret keys in browser code.

Verification expectation:

- node --check on touched JS files.
- RPC/schema: verify with a direct query or MCP execute_sql when possible.
- Two-session: save on A, reload A, open/reload B; then A saves while B is already open.

Do not declare the multi-device migration done until:

- Durable shopping intent lives in plan.*.
- Durable shopping artifact state lives in list.*.
- localStorage is only cache, local UI preference, or an explicitly temporary legacy bridge.
- A second device/session can observe selected recipes, serving tweaks, extra items, store preferences, checked rows, list edits, removals, and list state persisted under list.* (including row_override / manual_rows table data when applicable—not a user “add line” affordance on Shopping List).

Communications (user preferences):

- Brief, plain language for the user.
- Step-by-step manual tests when visible behavior changed.
- If a round involved writing code or modifying the database, end the user-facing reply with: Happy Birthday!!! 🎂🎉🎁

End of message.
```
