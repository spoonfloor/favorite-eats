# Supabase Migration — Status

Read `docs/supabase-migration-plan-plain.md` first.

This file uses a fixed template. Do not append history. Replace each section in place. Total length should stay under ~30 lines.

## Current state

Reads are migrated for all main pages (recipes, recipe detail, tags, units, sizes, stores, shopping list, shopping items, autocomplete pools). Web defaults to Supabase; `?adapter=sqlite` is the escape hatch. Electron still defaults to SQLite.

Small admin writes are migrated for: create/delete recipe, create/edit/remove size, create/edit/delete tag, create/edit/remove unit.

Recipe save (the bundled metadata + tags + steps + ingredients write) is NOT migrated. That is the next big slice.

## Next slice

Backlog item **A1** — Store create from the Stores page Add dialog.

## Known risks

- Recipe save is still SQLite-only. The Save button does not work in Supabase mode without a SQLite bridge open.
- Two older remote Supabase migrations exist that aren't checked in locally (`20260428140000`, `20260428173751`). Predate this work.
- Hosted Supabase has broad RLS warnings from advisors. Acceptable for a single-user app, but noted.
- Electron still defaults to SQLite. The flip happens at backlog item E.

## Last commit

(filled in by the agent at the end of each session)
