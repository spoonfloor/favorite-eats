# Evergreen Starter Message: Multi-Device Supabase Work

Use this message at the start of a new chat when continuing the Catalog / Plan / List multi-device migration.

```text
We are migrating Favorite Eats to full multi-device support in Supabase.

Required reading:

1. docs/supabase-architecture.md
2. docs/catalog-plan-list-supabase.md
3. docs/multi-device-roadmap.md
4. docs/migration-sweep.md, especially if touching js/main.js
5. /Users/erichenry/Desktop/baby-eats as the functional proof-of-concept

Current model:

- catalog = durable recipe/catalog/reference data: recipes, ingredients, variants, tags, units, sizes, stores, aisles.
- plan = current intent for this shop/week: selected recipes, make-counts, serving overrides, extra items, selected stores, store order.
- list = active shopping artifact: generated rows plus checked state, edits, removals, row ordering/location overrides, manual tactical rows, and conflicts.

Important invariant:

Catalog + Plan -> generated List rows.
Generated List rows + List overrides + manual rows -> shopping screen.
Editing List rows must not mutate Plan semantics unless the UI explicitly performs a Plan edit.

Repo facts:

- Supabase is accessed through window.dataService in js/data/index.js.
- The adapter is js/data/adapters/supabaseAdapter.js.
- UI code should not call PostgREST, RPCs, or database helpers directly.
- catalog.save_shopping_state(state_payload jsonb) already persists parts of Plan/List into plan.* and list.*.
- localStorage is currently a cache/bridge for shopping Plan/List state. It is not the desired durable source of truth.
- js/main.js is still the active migration surface for shopping/admin flows.
- baby-eats already proves multi-device plan sync, sparse serving overrides, Supabase Realtime table subscriptions, and shared browser/device presence.

baby-eats reference files:

- /Users/erichenry/Desktop/baby-eats/supabase/migrations/20260427232036_create_menu_plan_and_modal_override.sql
- /Users/erichenry/Desktop/baby-eats/supabase/migrations/20260427232056_menu_plan_numeric_qty.sql
- /Users/erichenry/Desktop/baby-eats/supabase/migrations/20260427232104_menu_tables_realtime_publication.sql
- /Users/erichenry/Desktop/baby-eats/js/supabaseDataApi.js
- /Users/erichenry/Desktop/baby-eats/js/main.js

Use baby-eats as an implementation reference, not as a schema to copy directly. This app already has richer catalog, plan, and list schemas.

Before choosing work:

1. Run git status and inspect recent commits.
2. If touching Plan/List sync, serving overrides, Realtime, or presence, inspect the relevant baby-eats files.
3. Search current code, not stale docs, for the flow you intend to touch.
4. Identify one user-visible flow or one storage key cluster.
5. Classify the state as catalog, plan, list, local-only UI preference, cache, or legacy bridge.
6. Pick the smallest chunk whose success can be verified.

Good next chunks:

- Clarify and migrate selected recipe make-count vs serving override.
- Move one local-only extra-item flow into plan.selected_items.
- Move one list behavior into list.row_overrides or list.manual_rows.
- Finish reconcile/prune behavior for Plan item keys after Catalog rename/delete.
- Replace one localStorage-authoritative shopping path with dataService hydration/save.
- Adapt baby-eats Realtime subscriptions to plan.* and list.* tables.
- Adapt baby-eats shared presence to this app's dataService boundary and app bar UI.

Operational imperatives:

- Keep changes scoped. Do not sweep unrelated files.
- Preserve existing dirty user changes.
- Prefer existing local patterns over new abstractions.
- Add/extend dataService methods rather than bypassing the data door.
- Use RPCs only when bundled transactional behavior is needed.
- Do not touch experiments/name-deck/*.
- Do not spend time on the known shopping item editor Shift+Enter/focus issue unless explicitly asked.
- For database changes, use Supabase CLI/MCP guidance from the Supabase skill and create migrations through the CLI when ready.
- For exposed schemas, keep RLS in mind. Never expose service-role or secret keys in browser code.

Verification expectation:

- For JS changes, run node --check on touched JS files.
- For schema/RPC changes, verify with a direct query or RPC call when possible.
- For visible shopping behavior, provide a simple click-through: save on device/session A, reload A, then load/reload B.
- Specifically verify that Plan changes regenerate List rows and List edits do not change Plan.

Do not declare the multi-device migration done until:

- Durable shopping intent lives in plan.*.
- Durable shopping artifact state lives in list.*.
- localStorage is only cache, local UI preference, or an explicitly temporary legacy bridge.
- A second device/session can observe selected recipes, serving tweaks, extra items, store preferences, checked rows, list edits, removals, and manual rows.
```
