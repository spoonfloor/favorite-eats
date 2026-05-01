# Supabase Migration — Status

Read `docs/supabase-migration-plan-plain.md` first.

This file uses a fixed template. Do not append history. Replace each section in place. Total length should stay under ~30 lines.

## Current state

Reads are migrated for all main pages (recipes, recipe detail, tags, units, sizes, stores, shopping list, shopping items, autocomplete pools). Web defaults to Supabase; `?adapter=sqlite` is the escape hatch. Electron still defaults to SQLite.

Small admin writes are migrated for: create/delete recipe, create/edit/remove size, create/edit/delete tag, create/edit/remove unit, create/delete/edit store metadata. A4 sweep is done for leftover tag/size/store editor create paths.

Recipe save has a written contract, B2 fixture cases, a Supabase `saveRecipe` adapter path backed by the hosted `catalog.save_recipe(jsonb)` RPC, and Save button wiring through `window.dataService.saveRecipe`.

## Next slice

Backlog item **B5** — live smoke: create a throwaway recipe, edit each section, save, verify hosted row, clean up.

## Known risks

- Recipe save has not had the full B5 hosted smoke yet.
- Two older remote Supabase migrations exist that aren't checked in locally (`20260428140000`, `20260428173751`). Predate this work.
- Hosted Supabase has broad RLS warnings from advisors. Acceptable for a single-user app, but noted.
- Electron still defaults to SQLite. The flip happens at backlog item E.

## Last commit

B4 wired the recipe editor Save button through `window.dataService.saveRecipe`.
