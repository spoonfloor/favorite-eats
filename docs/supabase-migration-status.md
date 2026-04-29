# Supabase Migration Status

## Purpose

This is the living handoff document for the Supabase migration.

Use it so each agent does not need a custom handoff message. The reusable chat prompt should tell the agent to read this file and `docs/supabase-migration-plan-plain.md` before changing code.

## Ultimate Goal

The bundled/local SQLite database goes in the trash, and the app still works the way it did before.

Supabase, or an equivalent hosted Postgres database, becomes the only place the app reads and writes persisted data.

Until then, SQLite remains a temporary bridge for unmigrated reads and writes, schema compatibility, Electron defaults, and fallbacks that have not yet been safely removed.

## How To Use This File

Read this file at the start of any Supabase migration work, before editing code.

Update this file at every natural checkpoint, especially after a commit or push when the user explicitly asked for one.

Keep updates short and factual. Do not turn this into a full changelog. The goal is to help the next agent know where to continue safely.

When writing a checkpoint, include:

- What changed.
- What verification passed.
- What remains risky or untested.
- The recommended next slice.
- Commit and push details, only when a commit or push was actually requested and completed.

Do not update this file for unrelated work.

## Migration Rules

- Put every migrated UI read or write behind `window.dataService` in `js/data/index.js`.
- Do not add new direct database calls from UI code.
- Add or update a plain-English contract under `js/data/contracts/` before exposing a new data capability.
- Add or update fixtures under `js/data/fixtures/` when a contract changes.
- Register parity coverage in `js/data/parity/runParity.js` when contracts or fixtures change.
- Migrate reads before broad writes.
- Keep SQLite fallbacks only as temporary bridges.
- Avoid unrelated cleanup, UI changes, or behavior changes in migration work.

## Current Runtime Rules

- Web defaults to Supabase unless the URL has `?adapter=sqlite`.
- Electron defaults to SQLite unless the URL has `?adapter=supabase`.
- Internal navigations preserve the `adapter` URL parameter when present.
- Supabase-first prefetch failures should show a toast and log to the console.
- The lower-right `SB` badge appears when `window.dataService.useSupabase` is true.

## Current State

Migrated reads go through `window.dataService` where each surface has been cut over.

SQLite still exists for unmigrated reads, writes, schema bridges, Electron default behavior, and temporary fallback paths.

Recent migration work has focused on recipe editor and autocomplete behavior when web-default Supabase mode runs without an opened sql.js database, meaning `window.dbInstance` may be null.

## Completed Slices

- Recipe list reads.
- Recipe detail reads.
- Typeahead pools for ingredient names, units, sizes, and variants.
- Recipe title lists for recipe-link autocomplete and step `@recipe` autocomplete.
- Unit and size list reads.
- Shopping item lookup by name.
- Ingredient variant deprecation reads.
- Shopping item detail reads, including grammar fields used by the editor.
- Ingredient name lookup by lemma.
- Recipe editor display helpers that need shopping item names or unit metadata when SQLite is not open.

## Latest Checkpoint

Shopping-list Supabase prefetch failures now stay loud.

What changed:

- Shopping-list plan, assignment, and selected-recipe-summary reads no longer silently fall back to SQLite when the Supabase data door is active and one of those reads fails.
- Supabase-mode failures now bubble to the existing prefetch failure handler so the app logs the failure, shows the toast, and uses the documented rollback path.
- SQLite mode keeps the existing fallback behavior.
- No new data capability was exposed, so no new contract, fixture, or parity registration was needed.

Verification at this checkpoint:

- `node --check js/main.js` passed.
- `npm run test:web-build` passed.
- IDE diagnostics for `js/main.js` showed no linter errors.
- Browser smoke on `http://127.0.0.1:8881/shoppingList.html?adapter=supabase&fresh=1760000002` passed.
- The `SB` badge was visible and console logs showed the Supabase data adapter was active.
- The shopping list page loaded without migration-related console errors.
- Navigation to the recipes page and back preserved `?adapter=supabase`.
- No console errors mentioned Supabase read failure, `listShoppingListPlanRows`, `listShoppingListAssignments`, `listShoppingListRecipeSummaries`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access.
- Browser parity was not run because no contract, fixture, adapter, or parity code changed.

What remains risky or untested:

- Supabase writes are still not migrated. Save is intentionally unavailable when no SQLite bridge is open.
- Save behavior is still intentionally untested in no-local-DB Supabase mode because writes have not been migrated.
- The reset button was disabled on the empty shopping list during smoke, so reset/undo source-row changes while sorted by home location still need manual coverage with a populated/generated list.
- Shopping-link navigation from editor-mode ingredient rows still needs a human/manual smoke; automation reached the editor and attempted the Alt-click path but did not complete that exact navigation.
- The failure branch was verified by code review and normal-load smoke, not by intentionally breaking Supabase during browser automation.
- Unknown-tag creation/matching still depends on the SQLite-backed write path and is not available in Supabase/no-local-DB mode.
- Browser parity was not run because no contract, fixture, adapter, or parity runner changed.

No commit or push was requested or performed for this checkpoint.

## Known Risks

- Many direct `db.exec` paths still exist. Some are expected because writes and many legacy surfaces are not migrated yet.
- SQLite bytes are still loaded in many flows. Skipping local SQLite entirely is a larger cross-cutting change and should wait until the remaining reads/writes and offline/schema questions are handled.
- Manual smoke coverage is still important for editor interactions that automated tests do not exercise, especially save behavior, editor-mode shopping item links, and tag Manage → unknown-tag flows without SQLite.
- Browser parity was not run for this checkpoint because no contract, fixture, adapter, or parity runner changed.

## Recommended Next Slice

Move to the next read-surface audit, keeping one small manual editor check open.

Recommended focus:

- Use a real browser/manual session with a populated/generated shopping list to exercise home-location sorting after reset/undo or any action that changes which generated rows are present.
- Use a real browser/manual session to exercise editor-mode shopping item links and tag Manage → unknown-tag flows; the automated browser smoke did not complete those exact interactions.
- If practical, intentionally break one shopping-list Supabase read in a controlled browser/dev session and confirm the prefetch failure toast/rollback path appears as expected.
- Audit the next cluster of direct `db.exec` reads in `js/main.js` and migrate only concrete no-local-SQLite read failures behind `window.dataService`.
- Patch only the null-db read paths found during that smoke.
- Reuse existing data-door methods where possible.
- Add a new contract, fixture, and parity coverage only when a new capability is needed.

Do not start broad write migration yet.

Do not attempt to skip SQLite bytes entirely yet.

## Standard Verification

Run these when relevant:

- `node --check js/main.js`
- `node --check` for any edited standalone JavaScript file.
- Parse touched JSON fixtures.
- `http://127.0.0.1:8879/js/data/parity/runParity.html` when contracts, fixtures, adapters, or parity code changed.
- `npm run test:web-build`
- Manual browser smoke when boot order, adapter choice, navigation, network behavior, or editor interactions changed.
