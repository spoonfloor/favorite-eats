# Catalog / Plan / List Supabase Model

## Purpose

This document defines the three-schema model for full multi-device support. It is a supporting reference for `docs/multi-device-roadmap.md` and the ongoing Supabase migration work.

`/Users/erichenry/Desktop/baby-eats` is the working proof-of-concept for this direction. It uses a smaller schema, but it already proves the important product behavior: remote plan state, serving overrides, Realtime change notifications, and browser/device presence.

## One-Sentence Model

**Catalog** is what could be cooked, **Plan** is what the user intends to shop/cook now, and **List** is the tactical shopping artifact built from Catalog + Plan.

## Schema Ownership

### `catalog`

Catalog owns durable reference data:

- recipes and recipe structure
- ingredients, ingredient variants, synonyms, sizes, and units
- recipe tags and shopping tags
- stores, aisles, and ingredient/store-location mappings

Catalog does not know what the user picked for this week. A recipe can exist in Catalog without being selected in Plan.

Recipe composition is Catalog data too. Grocery ingredients live in `catalog.recipe_ingredient_map`; linked subrecipes live in `catalog.recipe_subrecipe_links` so recipe titles are never added to the grocery ingredient catalog just because a recipe links to another recipe.

Current examples:

- `catalog.recipes`
- `catalog.recipe_ingredient_map`
- `catalog.recipe_subrecipe_links`
- `catalog.ingredients`
- `catalog.ingredient_variants`
- `catalog.tags`
- `catalog.units`
- `catalog.stores`
- `catalog.store_locations`

### `plan`

Plan owns current user intent:

- selected recipes
- how many times a recipe is being made
- serving overrides for this plan
- extra shopping items such as "bananas"
- selected stores
- store order for this shopping run

Plan should not store generated list display text as its source of truth. It may keep labels as snapshots for resilience, but the durable identity should point back to Catalog where possible.

Current examples:

- `plan.documents`
- `plan.selected_recipes`
- `plan.selected_items`
- `plan.store_preferences`

### `list`

List owns the active shopping artifact:

- generated rows derived from Catalog + Plan
- checked state
- row text overrides
- store/aisle/order overrides
- removed generated rows
- rows stored in `list.manual_rows` (server/session; see note below)
- conflicts between regenerated rows and user edits

**Shopping List UI:** The **Shopping List** screen does not offer composing brand-new free-text checklist rows. Extra durable intent belongs in **`plan.selected_items`** (Items / planner flows). References to “manual” rows below mean the **`list.manual_rows` table** and merge/RPC behavior—not an end-user “add line” affordance.

List must not change Plan meaning. If a user edits a list row from "1 milk" to "2 milk", that is a list override. It does not change recipe servings, recipe make-count, or selected extra item quantity unless the UI explicitly performs a Plan edit.

Current examples:

- `list.sessions`
- `list.generated_rows`
- `list.row_overrides`
- `list.manual_rows`
- `list.conflicts`

## Core Invariants

1. Catalog data can exist without Plan or List data.
2. Plan references Catalog, but Plan is not part of Catalog.
3. List references a Plan session and can reference Catalog locations.
4. Generated List rows are replaceable output.
5. List overrides and rows in `list.manual_rows` are persisted artifact state and must be preserved across regeneration when possible (when present from server/sync—not via a Shopping List “add row” UI in Favorite Eats today).
6. Editing List output does not mutate Plan intent.
7. localStorage is not the durable authority for multi-device state.

## Generation Rule

The shopping list should be understood as:

```text
Catalog + Plan -> generated List rows
generated List rows + List overrides + list.manual_rows (when present) -> visible shopping screen
```

Generated rows should be reproducible. Overrides should be narrow and explicit.

## Field Semantics To Lock Down

### `plan.selected_recipes`

The current `quantity` field is ambiguous for multi-device work. Before extending recipe planning, decide whether to replace or supplement it with:

- `make_count`: how many times the recipe is being made for this plan.
- `servings_override`: how many servings to use for ingredient scaling in this plan.

Recommended direction:

- Use `make_count` for repeated meals.
- Use `servings_override` for "actually use this many servings."
- Keep recipe default/min/max servings in Catalog.

### `plan.selected_items`

Use this for extra planned shopping items that are not coming from selected recipes.

Recommended semantics:

- `item_key`: stable key for the selected item.
- `ingredient_variant_id`: preferred durable Catalog identity when available.
- `name` and `variant_name`: display snapshots and fallback identity.
- `quantity`: planned quantity for the extra item.

### `list.generated_rows`

Use this for generated rows from the current Plan. These rows can be replaced after Plan or Catalog changes.

Recommended semantics:

- `source_key`: stable generated-row key.
- `generated_text`: source text from generation.
- store/aisle/bucket fields: generated placement.
- `order_index`: generated order before user override.

### `list.row_overrides`

Use this for user changes to generated rows.

Recommended semantics:

- `source_key`: generated row being overridden.
- `override_text`: user-facing edited text.
- `checked`: shopping completion state.
- `removed`: user removed this generated row from the visible list.
- store/aisle/bucket/order fields: user placement override.
- `user_edited`: whether text has diverged from generated text.

### `list.manual_rows`

Postgres table for **session-scoped** rows that are not tied to generated `source_key` lines. **Do not confuse with a Shopping List UI:** Favorite Eats does not expose typing brand-new free-text rows on the Shopping List screen; durable “extra” shopping intent goes through **`plan.selected_items`**. Use `list.manual_rows` for server-side tactical rows, migrations, RPCs (`append_manual_shopping_list_row`), and merge logic—not as documentation of a user compose flow.

## Data Access Boundary

UI code should go through `window.dataService` in `js/data/index.js`.

The Supabase adapter in `js/data/adapters/supabaseAdapter.js` should own PostgREST/RPC details. UI code should not call Supabase directly.

Use RPCs when a write must be bundled transactionally, such as saving a whole recipe, saving store layout, or saving combined shopping state. Use focused adapter reads/writes when a smaller operation is clearer and does not need bundled database-side behavior.

## localStorage Policy

For multi-device support, classify each storage key:

- **Remote durable**: belongs in `plan` or `list`.
- **Local UI preference**: can stay local.
- **Cache**: may mirror Supabase but must not win over remote truth after hydration.
- **Legacy bridge**: temporary migration support with a planned removal.

Current shopping plan/list localStorage should be treated as cache/bridge during migration, not the final source of truth.

## Conflict Policy

Start with pragmatic conflict handling:

- Last-write-wins is acceptable for low-value preferences.
- Preserve list text overrides when generated source text changes.
- Use `list.conflicts` when a generated row changed and the app cannot confidently merge it with a user edit.
- Prefer explicit preservation over silently overwriting checked or edited shopping rows.

Do not build a general offline sync engine until real multi-device usage shows it is needed.

## Realtime and Presence Reference

Use `baby-eats` before designing new Realtime code:

- It adds plan tables to `supabase_realtime`.
- It subscribes to table changes with Supabase `postgres_changes`.
- It hydrates remote plan rows into local cache while suppressing echo writes.
- It uses a shared presence channel with a stable local client id, nickname, `channel.track(...)`, and a heartbeat.

For this app, adapt those patterns to `plan.*` and `list.*` rather than copying the `public.menu_plan_recipe` / `public.menu_modal_override` tables.

## Security Notes

RLS should remain enabled on exposed schemas. For this single-user app, broad policies may be accepted temporarily, but any future multi-user support must add user ownership columns and policies before exposing shared data.

Do not expose service-role or secret keys in browser/Electron renderer code.
