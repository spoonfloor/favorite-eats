# Supabase Migration — Status

Read `docs/supabase-migration-plan-plain.md` first.

This file uses a fixed template. Do not append history. Replace each section in place. Total length should stay under ~30 lines.

## Current state

Reads are migrated for all main pages (recipes, recipe detail, tags, units, sizes, stores, shopping list, shopping items, autocomplete pools). Web defaults to Supabase; `?adapter=sqlite` is the escape hatch. Electron still defaults to SQLite.

Small admin writes are migrated for: create/delete recipe, create/edit/remove size, create/edit/delete tag, create/edit/remove unit, create/delete/edit store metadata. A4 sweep is done for leftover tag/size/store editor create paths.

Recipe save has a written contract and B2 fixture cases. The parity runner lists those cases as pending until adapter assertions are enabled with implementation.

## Next slice

Backlog item **B3** — Supabase adapter implementation for the bundled recipe save.

## Known risks

- Recipe save is still SQLite-only. The Save button does not work in Supabase mode without a SQLite bridge open.
- Two older remote Supabase migrations exist that aren't checked in locally (`20260428140000`, `20260428173751`). Predate this work.
- Hosted Supabase has broad RLS warnings from advisors. Acceptable for a single-user app, but noted.
- Electron still defaults to SQLite. The flip happens at backlog item E.

## Last commit

B2 recipe save fixtures added at `js/data/fixtures/saveRecipe.json`; parity runner lists the pending saveRecipe capability.
