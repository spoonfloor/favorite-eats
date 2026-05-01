# Supabase Migration — Status

Read `docs/supabase-migration-plan-plain.md` first.

This file uses a fixed template. Do not append history. Replace each section in place. Total length should stay under ~30 lines.

## Current state

Reads are migrated for all main pages (recipes, recipe detail, tags, units, sizes, stores, shopping list, shopping items, autocomplete pools). Web defaults to Supabase; `?adapter=sqlite` is the escape hatch. Electron still defaults to SQLite.

Small admin writes are migrated for: create/delete recipe, create/edit/remove size, create/edit/delete tag, create/edit/remove unit, create/delete/edit store metadata. A4 sweep is done for leftover tag/size/store editor create paths.

Recipe save has a written contract, B2 fixture cases, a Supabase `saveRecipe` adapter path backed by the hosted `catalog.save_recipe(jsonb)` RPC, Save button wiring through `window.dataService.saveRecipe`, and B5 hosted smoke coverage.

Aisle/store layout writes are migrated as a bundled Supabase `saveStoreLayout` RPC through `window.dataService`. C was verified with a hosted Store editor aisle save plus RPC verification for item assignment, and the throwaway store was cleaned up.

Shopping plan and checklist writes are migrated through bundled Supabase `loadShoppingState` / `saveShoppingState` RPCs. D was verified with hosted RPC round-trip plus Shopping page select/reset click-through, and temporary selection data was cleaned up.

## Next slice

Backlog item **E** — Electron default flip. Change Electron's default adapter to Supabase; `?adapter=sqlite` becomes the Electron escape hatch too.

## Known risks

- Two older remote Supabase migrations exist that aren't checked in locally (`20260428140000`, `20260428173751`). Predate this work.
- Hosted Supabase has broad RLS warnings from advisors. Acceptable for a single-user app, but noted.
- Electron still defaults to SQLite. The flip happens at backlog item E.

## Last commit

D migrated shopping plan/checklist writes as bundled Supabase state RPCs and cleaned up temporary selections.
