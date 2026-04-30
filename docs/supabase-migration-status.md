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
- Store list reads.
- Shopping item lookup by name.
- Ingredient variant deprecation reads.
- Shopping item detail reads, including grammar fields used by the editor.
- Ingredient name lookup by lemma.
- Recipe editor display helpers that need shopping item names or unit metadata when SQLite is not open.
- Recipe editor tag Manage unknown-tag reads.
- Recipe editor You Will Need shopping item lookup reads.
- Tag editor usage-card reads.
- Store editor detail reads.
- Recipe ingredient editor helper reads for shopping-item lookup, grammar fields, and recipe title lookup.

## Latest Checkpoint

Recipe ingredient editor helper read failures now stay loud in Supabase mode.

What changed:

- Recipe ingredient editor shopping-item lookup failures no longer fall back to direct SQLite reads while the Supabase data door is active.
- Recipe ingredient editor grammar-field reads no longer fall back to direct SQLite reads while the Supabase data door is active.
- Recipe ingredient editor recipe-link validation and recipe-title typeahead failures no longer fall back to direct SQLite reads while the Supabase data door is active.
- Recipe tag Manage unknown-tag reads now prefer the existing data-service tag list whenever Supabase is active, even if a local SQLite database is also open.
- SQLite mode keeps the existing local helper fallback behavior.
- No new data capability was exposed, so no new contract, fixture, or parity registration was needed.
- Shopping-list plan, assignment, and selected-recipe-summary reads no longer silently fall back to SQLite when the Supabase data door is active and one of those reads fails.
- Supabase-mode failures now bubble to the existing prefetch failure handler so the app logs the failure, shows the toast, and uses the documented rollback path.
- The shopping-list home-location grouping fallback no longer reads local SQLite when Supabase is the active data door.
- The shopping-list document heal that runs during shopping page setup now rebuilds from the existing Supabase shopping-list plan data door when Supabase is active, instead of rebuilding from SQLite-only plan rows.
- Shopping-plan key reconcile and orphan-prune repair helpers no longer run their SQLite reads while Supabase is the active data door.
- Step `@recipe` autocomplete now prefers the existing Supabase `listRecipes` data-service cache whenever Supabase is active, even if a local SQLite database is also open.
- Recipe tag suggestions no longer fall back to local SQLite after a Supabase `listTags` failure.
- The shopping items page can continue rendering Supabase-loaded item rows if the browser SQLite database cannot be opened after the Supabase read succeeds.
- Recipe-derived shopping quantities on the shopping items page no longer fall back to SQLite after a Supabase `listShoppingPlanRecipeItems` failure.
- The shopping list page can continue rendering Supabase-loaded plan and selected-recipe-summary rows if the browser SQLite database cannot be opened after the Supabase reads succeed.
- The units page can continue rendering Supabase-loaded unit rows if the browser SQLite database cannot be opened after the Supabase read succeeds.
- The tags page can continue rendering Supabase-loaded tag rows if the browser SQLite database cannot be opened after the Supabase read succeeds.
- The sizes page can continue rendering Supabase-loaded size rows if the browser SQLite database cannot be opened after the Supabase read succeeds.
- The recipes page can continue rendering Supabase-loaded recipe rows if the browser SQLite database cannot be prepared or opened after the Supabase read succeeds.
- The stores page can continue rendering Supabase-loaded store rows if the browser SQLite database cannot be opened after the Supabase read succeeds.
- The recipe editor Tags → Manage handler now checks the open tag-editor draft, not only the saved recipe tag array.
- When SQLite is not open, that handler uses the existing `listTags` data door to decide which draft recipe tags are already known.
- The unknown-tag dialog helper no longer requires a SQLite database object before it can show suggestions from the existing data-service-backed tag pool.
- You Will Need shopping-item and ingredient-lemma lookups in the recipe editor no longer fall back to direct SQLite reads after a Supabase data-service lookup failure while the Supabase data door is active.
- Tag editor usage-card reads now stop after the existing Supabase failure report when `loadTagUsage` fails while Supabase is the chosen data door, instead of falling back to direct SQLite reads.
- Store editor detail reads now use the existing Supabase failure report and stop setup when `loadStoreDetail` fails while Supabase is the chosen data door, instead of continuing toward local fallback behavior.
- SQLite mode keeps the existing local lookup fallback behavior.
- SQLite mode keeps the existing local home-location fallback behavior.
- No new data capability was exposed, so no new contract, fixture, or parity registration was needed.

Verification at this checkpoint:

- `node --check js/ingredientRenderer.js && node --check js/recipeEditor.js` passed after the recipe ingredient editor helper fallback change.
- `npm run test:web-build` passed after the recipe ingredient editor helper fallback change.
- IDE diagnostics for `js/ingredientRenderer.js` and `js/recipeEditor.js` showed no linter errors after the recipe ingredient editor helper fallback change.
- `node --check js/main.js` passed.
- `npm run test:web-build` passed.
- IDE diagnostics for `js/main.js` showed no linter errors.
- Browser smoke on `http://127.0.0.1:8881/shoppingList.html?adapter=supabase&fresh=1760000002` passed.
- The `SB` badge was visible and console logs showed the Supabase data adapter was active.
- The shopping list page loaded without migration-related console errors.
- Navigation to the recipes page and back preserved `?adapter=supabase`.
- No console errors mentioned Supabase read failure, `listShoppingListPlanRows`, `listShoppingListAssignments`, `listShoppingListRecipeSummaries`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access.
- Browser smoke on `http://127.0.0.1:8881/shoppingList.html?adapter=supabase&fresh=1760000003` passed page load and opened the sort-by control.
- No console errors mentioned Supabase read failure, `listShoppingListHomeLocations`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the home-location fallback change.
- Browser smoke on `http://127.0.0.1:8881/shopping.html?adapter=supabase&fresh=1760000004` passed page load with the `SB` badge visible.
- Browser smoke on `http://127.0.0.1:8881/shoppingList.html?adapter=supabase&fresh=1760000004` passed page load with the `SB` badge visible.
- No console errors mentioned Supabase read failure, shopping-list plan/assignment/summary methods, SQLite adapter initialization, `dbInstance`, `db.exec`, null/undefined database access, shopping-list doc heal failure, or shopping-plan maintenance failure after the maintenance heal change.
- Browser smoke on `http://127.0.0.1:8881/shopping.html?adapter=supabase&fresh=1760000005` passed page load with the `SB` badge visible.
- Browser smoke on `http://127.0.0.1:8881/shoppingList.html?adapter=supabase&fresh=1760000005` passed page load with the `SB` badge visible.
- No console errors mentioned Supabase read failure, shopping-plan reconcile/prune failure, shopping-list doc heal failure, shopping-plan maintenance failure, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the reconcile/prune skip change.
- `node --check js/recipeEditor.stepsEdit.js`, `node --check js/recipeEditor.js`, and `node --check js/main.js` passed.
- Browser smoke on `http://127.0.0.1:8881/recipes.html?adapter=supabase&fresh=1760000006` opened Breakfast Soft Tacos in the editor with the `SB` badge visible.
- Recipe list, recipe detail, ingredients, instructions, and tags rendered in Supabase mode without relevant console errors.
- A step field accepted typed `@recipe` text without console errors; the automated browser did not capture a visible autocomplete dropdown.
- No console errors mentioned `dataService.listRecipes`, `dataService.listTags`, SQLite adapter initialization, `dbInstance`, `db.exec`, null/undefined database access, or Supabase read failure after the recipe-editor fallback change.
- `node --check js/main.js` passed after the shopping items page change.
- `npm run test:web-build` passed after the shopping items page change.
- IDE diagnostics for `js/main.js` showed no linter errors after the shopping items page change.
- Browser smoke on `http://127.0.0.1:8881/shopping.html?adapter=supabase&fresh=1760000007` passed with item rows rendered and the Supabase adapter active.
- No console errors mentioned Supabase read failure, `listShoppingItems`, `listShoppingPlanRecipeItems`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the shopping items page change.
- `node --check js/main.js` passed after the shopping list no-local-SQLite continuation change.
- `npm run test:web-build` passed after the shopping list no-local-SQLite continuation change.
- IDE diagnostics for `js/main.js` showed no linter errors after the shopping list no-local-SQLite continuation change.
- Browser smoke on `http://127.0.0.1:8881/shoppingList.html?adapter=supabase&fresh=1760000008` passed with the empty shopping list rendered and the Supabase adapter active.
- No console errors mentioned Supabase read failure, shopping-list data-service methods, SQLite adapter initialization, `dbInstance`, `db.exec`, null/undefined database access, shopping-list doc heal failure, or shopping-plan maintenance failure after the shopping list no-local-SQLite continuation change.
- `node --check js/main.js` passed after the units page no-local-SQLite continuation change.
- `npm run test:web-build` passed after the units page no-local-SQLite continuation change.
- IDE diagnostics for `js/main.js` showed no linter errors after the units page no-local-SQLite continuation change.
- Browser smoke on `http://127.0.0.1:8881/units.html?adapter=supabase&fresh=1760000009` passed with unit rows rendered and the Supabase adapter active.
- No console errors mentioned Supabase read failure, `listUnits`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the units page no-local-SQLite continuation change.
- `node --check js/main.js` passed after the tags page no-local-SQLite continuation change.
- `npm run test:web-build` passed after the tags page no-local-SQLite continuation change.
- IDE diagnostics for `js/main.js` showed no linter errors after the tags page no-local-SQLite continuation change.
- Browser smoke on `http://127.0.0.1:8881/tags.html?adapter=supabase&fresh=1760000010` passed with tag rows rendered and the Supabase adapter active.
- No console errors mentioned Supabase read failure, `listTags`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the tags page no-local-SQLite continuation change.
- `node --check js/main.js` passed after the sizes page no-local-SQLite continuation change.
- `npm run test:web-build` passed after the sizes page no-local-SQLite continuation change.
- IDE diagnostics for `js/main.js` showed no linter errors after the sizes page no-local-SQLite continuation change.
- Browser smoke on `http://127.0.0.1:8881/sizes.html?adapter=supabase&fresh=1760000011` passed with size rows rendered and the Supabase adapter active.
- No console errors mentioned Supabase read failure, `listSizes`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the sizes page no-local-SQLite continuation change.
- `node --check js/main.js` passed after the recipes page no-local-SQLite continuation change.
- `npm run test:web-build` passed after the recipes page no-local-SQLite continuation change.
- IDE diagnostics for `js/main.js` showed no linter errors after the recipes page no-local-SQLite continuation change.
- Browser smoke on `http://127.0.0.1:8881/recipes.html?adapter=supabase&fresh=1760000012` passed with recipe rows rendered, tag filters visible, and the Supabase adapter active.
- No console errors mentioned Supabase read failure, `listRecipes`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the recipes page no-local-SQLite continuation change.
- `node --check js/main.js` passed after the stores page no-local-SQLite continuation change.
- `npm run test:web-build` passed after the stores page no-local-SQLite continuation change.
- IDE diagnostics for `js/main.js` showed no linter errors after the stores page no-local-SQLite continuation change.
- Browser smoke on `http://127.0.0.1:8881/stores.html?adapter=supabase&fresh=1760000013` passed with store rows rendered and the Supabase adapter active.
- No console errors mentioned Supabase read failure, `listStores`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the stores page no-local-SQLite continuation change.
- `node --check js/main.js && node --check js/recipeEditor.js` passed after the recipe tag Manage unknown-tag read change.
- `npm run test:web-build` passed after the recipe tag Manage unknown-tag read change.
- IDE diagnostics for `js/main.js` and `js/recipeEditor.js` showed no linter errors after the recipe tag Manage unknown-tag read change.
- Browser smoke on `http://127.0.0.1:8881/recipeEditor.html?adapter=supabase&fresh=1760000017` passed after selecting Breakfast Soft Tacos and adding `zzz-supabase-smoke-tag-1760000017` to the open Tags draft.
- The Tags section Manage button opened the `New tags (1)` unknown-tag dialog, stayed on `recipeEditor.html?adapter=supabase`, and was canceled without saving.
- No console errors mentioned `dataService.listTags`, `resolveUnknownTagNames`, Supabase read failure, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the recipe tag Manage unknown-tag read change.
- `node --check js/recipeEditor.js` passed after the You Will Need lookup fallback change.
- `npm run test:web-build` passed after the You Will Need lookup fallback change.
- IDE diagnostics for `js/recipeEditor.js` showed no linter errors after the You Will Need lookup fallback change.
- Browser smoke on `http://127.0.0.1:8881/recipeEditor.html?adapter=supabase&fresh=1760000019` loaded Breakfast Soft Tacos with the Supabase adapter active and no relevant console errors after the You Will Need lookup fallback change.
- Automated Option-click on a You Will Need link did not complete navigation, so the exact editor-mode shopping-link navigation remains manually unverified.
- `node --check js/main.js` passed after the tag editor usage-card fallback change.
- `npm run test:web-build` passed after the tag editor usage-card fallback change.
- IDE diagnostics for `js/main.js` showed no linter errors after the tag editor usage-card fallback change.
- Browser smoke on `http://127.0.0.1:8881/tags.html?adapter=supabase&fresh=1760000021` opened the Indian tag editor, rendered the RECIPES usage card with recipe links, and showed the Supabase adapter active.
- No console errors mentioned Supabase read failure, `loadTagUsage`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the tag editor usage-card fallback change.
- `node --check js/main.js` passed after the store editor detail failure-path change.
- `npm run test:web-build` passed after the store editor detail failure-path change.
- IDE diagnostics for `js/main.js` showed no linter errors after the store editor detail failure-path change.
- Browser smoke on `http://127.0.0.1:8881/stores.html?adapter=supabase&fresh=1760000022` opened the Whole Foods store editor and rendered aisle rows from the store detail path.
- No console errors mentioned Supabase read failure, `loadStoreDetail`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the store editor detail failure-path change.
- Browser parity was not run because no contract, fixture, adapter, or parity code changed.

What remains risky or untested:

- Browser smoke for recipe ingredient edit, recipe-link validation, and recipe-title typeahead still needs to be run for this latest helper fallback slice.
- Supabase writes are still not migrated. Save is intentionally unavailable when no SQLite bridge is open.
- Save behavior is still intentionally untested in no-local-DB Supabase mode because writes have not been migrated.
- The reset button was disabled on the empty shopping list during smoke, so reset/undo source-row changes while sorted by home location still need manual coverage with a populated/generated list.
- Automated browser smoke could open the sort-by control but could not select `home location` because the dropdown option was outside the viewport/scroll container.
- Shopping-link navigation from editor-mode ingredient rows still needs a human/manual smoke; automation reached the editor and attempted the Option-click path but did not complete that exact navigation.
- Step `@recipe` autocomplete still needs a focused manual smoke because automation typed the trigger text but did not observe the dropdown.
- The failure branch was verified by code review and normal-load smoke, not by intentionally breaking Supabase during browser automation.
- The no-local-SQLite shopping items page continuation path was verified by code review and normal Supabase smoke, not by deleting browser database storage during automation.
- The no-local-SQLite shopping list page continuation path was verified by code review and normal Supabase smoke, not by deleting browser database storage during automation.
- The no-local-SQLite units page continuation path was verified by code review and normal Supabase smoke, not by deleting browser database storage during automation.
- The no-local-SQLite tags page continuation path was verified by code review and normal Supabase smoke, not by deleting browser database storage during automation.
- The no-local-SQLite sizes page continuation path was verified by code review and normal Supabase smoke, not by deleting browser database storage during automation.
- The no-local-SQLite recipes page continuation path was verified by code review and normal Supabase smoke, not by deleting browser database storage during automation.
- The no-local-SQLite stores page continuation path was verified by code review and normal Supabase smoke, not by deleting browser database storage during automation.
- Shopping-plan key reconcile and prune helpers still only know how to use SQLite. They are skipped while Supabase is active, so Supabase-native storage repair remains unimplemented.
- Unknown-tag creation/saving still depends on the SQLite-backed write path and is not available in Supabase/no-local-DB mode.
- Browser parity was not run because no contract, fixture, adapter, or parity runner changed.

Commit and push for this checkpoint are pending.

## Known Risks

- Many direct `db.exec` paths still exist. Some are expected because writes and many legacy surfaces are not migrated yet.
- SQLite bytes are still loaded in many flows. Skipping local SQLite entirely is a larger cross-cutting change and should wait until the remaining reads/writes and offline/schema questions are handled.
- Manual smoke coverage is still important for editor interactions that automated tests do not exercise, especially save behavior, editor-mode shopping item links, and unknown-tag save behavior without SQLite.
- Browser parity was not run for this checkpoint because no contract, fixture, adapter, or parity runner changed.

## Recommended Next Slice

Move to the next read-surface audit, keeping one small manual editor check open.

Recommended focus:

- Use a real browser/manual session with a populated/generated shopping list to exercise home-location sorting after reset/undo or any action that changes which generated rows are present.
- Use a real browser/manual session to exercise step `@recipe` autocomplete and editor-mode shopping item links; automated browser smoke still has gaps around those exact interactions.
- If practical, intentionally break one shopping-list Supabase read in a controlled browser/dev session and confirm the prefetch failure toast/rollback path appears as expected.
- If practical, run a controlled no-local-SQLite browser session for `recipes.html?adapter=supabase`, `shopping.html?adapter=supabase`, `shoppingList.html?adapter=supabase`, `units.html?adapter=supabase`, `tags.html?adapter=supabase`, `sizes.html?adapter=supabase`, and `stores.html?adapter=supabase` to confirm each page continues after the local database open fails.
- Decide whether shopping-plan key reconcile and prune repair behavior is needed before write migration; if yes, add plain-English contracts for any Supabase-native repair reads that existing data-service methods cannot provide.
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
