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

Recipe editor and autocomplete paths were audited for `window.dbInstance` assumptions.

The current working tree includes changes that:

- Add `lookupIngredientNameByLemma` as a data-door capability, with contract, fixture, SQLite adapter, Supabase adapter, `index.js` wiring, and parity coverage.
- Include `lemma` in `loadShoppingItemDetail`.
- Route typeahead pools through `window.dataService.loadTypeaheadPools`.
- Route recipe-link and step `@recipe` pools through `window.dataService.listRecipes`.
- Route unit metadata display through `window.dataService.listUnits` when SQLite is not open.
- Route ingredient grammar/name resolution through existing data-door capabilities where possible.
- Route recipe editor shopping-link navigation through `window.dataService.lookupShoppingItemByName`.

Verification at this checkpoint:

- `node --check js/main.js` passed.
- `node --check js/ingredientRenderer.js` passed.
- Touched JSON fixtures parsed successfully.
- Browser parity runner passed: `236 fixtures · sqlite 236/236 · supabase 236/236`.
- `npm run test:web-build` passed.
- Lints for `js/ingredientRenderer.js` showed no errors.
- Supabase-mode recipe editor loaded with the `SB` badge and no unexpected console errors.

No commit or push has been made for this checkpoint unless a later checkpoint says otherwise.

## Known Risks

- Many direct `db.exec` paths still exist. Some are expected because writes and many legacy surfaces are not migrated yet.
- SQLite bytes are still loaded in many flows. Skipping local SQLite entirely is a larger cross-cutting change and should wait until the remaining reads/writes and offline/schema questions are handled.
- Manual smoke coverage is still important for editor interactions that automated tests do not exercise, especially recipe editor edit rows, paste rows, linked recipe rows, shopping item links, and adapter-preserving navigation.

## Recommended Next Slice

Continue the recipe editor no-local-SQLite slice.

Recommended focus:

- Manually smoke existing recipe editing in web-default Supabase mode with no reliance on `window.dbInstance`.
- Exercise ingredient edit rows: name autocomplete, unit autocomplete, size autocomplete, variant autocomplete, linked recipe selection, paste rows, save/cancel behavior, and shopping links.
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
