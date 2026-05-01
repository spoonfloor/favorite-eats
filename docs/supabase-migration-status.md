# Supabase Migration — Status

Read `docs/supabase-migration-plan-plain.md` first.

This file uses a fixed template. Do not append history. Replace each section in place. Total length should stay under ~30 lines.

## Current state
Reads are migrated for all main pages (recipes, recipe detail, tags, units, sizes, stores, shopping list, shopping items, autocomplete pools). Web and Electron default to Supabase; `?adapter=sqlite` is the escape hatch.
Small admin writes are migrated for: create/delete recipe, create/edit/remove size, create/edit/delete tag, create/edit/remove unit, create/delete/edit store metadata. A4 sweep is done for leftover tag/size/store editor create paths.
Recipe save has a written contract, B2 fixture cases, a Supabase `saveRecipe` adapter path backed by the hosted `catalog.save_recipe(jsonb)` RPC, Save button wiring through `window.dataService.saveRecipe`, and B5 hosted smoke coverage.
Aisle/store layout writes are migrated as a bundled Supabase `saveStoreLayout` RPC through `window.dataService`. C was verified with a hosted Store editor aisle save plus RPC verification for item assignment, and the throwaway store was cleaned up.
Shopping plan and checklist writes are migrated through bundled Supabase `loadShoppingState` / `saveShoppingState` RPCs. D was verified with hosted RPC round-trip plus Shopping page select/reset click-through, and temporary selection data was cleaned up.
Electron now defaults to Supabase through the data door. The welcome page only opens the DB picker for the `?adapter=sqlite` escape hatch. E was verified with adapter-selection checks, web build tests, and a Recipes click-through on the Supabase default.

## Next slice
Backlog item **F** — delete the bridge. Remove the SQLite adapter, SQLite bytes, `?adapter` query handling, SB badge, and anything else that only exists because both adapters coexisted.

## Known risks
- Two older remote Supabase migrations exist that aren't checked in locally (`20260428140000`, `20260428173751`). Predate this work.
- Hosted Supabase has broad RLS warnings from advisors. Acceptable for a single-user app, but noted.

## Last commit
E flipped Electron's default adapter to Supabase and kept `?adapter=sqlite` as the local DB escape hatch.
