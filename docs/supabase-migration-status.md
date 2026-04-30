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
- Shared editor helper pool reads for ingredients, variants, tags, sizes, and units.
- Shopping item editor detail failure path reads.
- Create new recipe write.
- Delete recipe write.
- Delete tag write.
- Edit tag write.
- Edit size write.
- Remove/delete size write.

## Latest Checkpoint

The next narrow write slice, removing or deleting a size from the Sizes page, now goes through the data door.

What changed:

- Added `createRecipe` to `window.dataService`, the SQLite adapter, and the Supabase adapter.
- The recipes page Add dialog now calls `window.dataService.createRecipe({ title })` instead of inserting directly into SQLite.
- Supabase create uses PostgREST with the `catalog` write profile and returns the database-assigned recipe id.
- SQLite mode keeps the existing local persistence step after creating a recipe.
- SQLite mode also keeps the old guard that does not open the create dialog if the local database is missing.
- Added the plain-English `createRecipe` contract, fixture coverage, and parity registration.
- Browser create smoke was intentionally non-destructive: the Supabase Add dialog was opened and canceled, but no live hosted test recipe was inserted.
- A later live create smoke attempted `zz supabase create smoke 1760000031` and found a hosted schema mismatch before insert: Supabase rejected `servings_min = 0.5` because `catalog.recipes.servings_min` is an integer column.
- MCP verification confirmed no row with that smoke title exists in `catalog.recipes`.
- Fixed the hosted schema mismatch by changing `catalog.recipes.servings_default`, `servings_min`, and `servings_max` from integer columns to decimal-capable numeric columns.
- A follow-up live create smoke created `zz supabase create smoke 1760000032`, redirected to the Supabase recipe editor, and rendered the blank recipe with the `SB` badge.
- The follow-up smoke row had id `149` and was deleted by exact id and title; MCP verification confirmed no row with that smoke title remains.
- Added `supabase/migrations/20260430143226_allow_decimal_recipe_servings.sql` to record the serving-column schema change.
- Marked migration `20260430143226` as applied in the linked Supabase project's migration history because the DDL had already been applied through MCP.
- Added `deleteRecipe` to `window.dataService`, the SQLite adapter, and the Supabase adapter.
- The recipes page delete confirmation now calls `window.dataService.deleteRecipe({ id })` instead of deleting directly from SQLite.
- Supabase delete removes the recipe row by id and relies on hosted foreign-key rules for owned recipe rows and recipe-link cleanup.
- SQLite delete mirrors the hosted behavior by deleting owned recipe rows and clearing recipe links that pointed at the deleted recipe.
- SQLite mode keeps the existing local persistence step after deleting a recipe.
- Added the plain-English `deleteRecipe` contract, fixture coverage, and parity registration.
- Shared ingredient, variant, recipe-tag, ingredient-tag, size, and unit helper pools no longer fall back to direct SQLite reads after a data-service failure while Supabase is active.
- Ingredient variant deprecation checks no longer fall back to direct SQLite reads after a data-service failure while Supabase is active.
- Shopping item recipe-usage lookups no longer fall back to direct SQLite reads after a data-service failure while Supabase is active.
- Shopping item variant-usage reads no longer fall back to direct SQLite reads after a data-service failure while Supabase is active.
- Store editor shopping-item lookup helpers no longer fall back to direct SQLite reads after a data-service failure while Supabase is active.
- Shopping item editor detail failures now report the existing Supabase prefetch failure and stop setup instead of falling through to local SQLite when Supabase is the chosen data door.
- SQLite mode keeps the existing local helper fallback behavior.
- No new data capability was exposed, so no new contract, fixture, or parity registration was needed.
- A final direct-read sweep found no remaining known Supabase-active UI read fallback that should silently read local SQLite after a data-service failure.
- Remaining direct `db.exec` reads are classified as SQLite adapter/bridge internals, schema and repair helpers, write-path setup or refresh behavior, SQLite-mode fallback code, or legacy cleanup work that should wait until writes and SQLite deletion are in scope.
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
- Added `createSize` to `window.dataService`, the SQLite adapter, and the Supabase adapter.
- The Sizes page Add dialog now calls `window.dataService.createSize({ name })` instead of inserting directly into SQLite.
- Supabase create-size uses PostgREST with the `catalog` write profile and returns the database-assigned size id.
- SQLite mode keeps the existing local persistence step after creating a size.
- Added the plain-English `createSize` contract, fixture coverage, and parity registration.
- A live Supabase create smoke created `zz supabase size smoke 1760000034`, opened the Supabase size editor, and preserved `?adapter=supabase`.
- The smoke size was deleted by exact name through the Supabase REST API; verification confirmed no row with that name remains.
- Added `createTag` to `window.dataService`, the SQLite adapter, and the Supabase adapter.
- The Tags page Add dialog now calls `window.dataService.createTag({ name, intendedUse })` instead of inserting directly into SQLite.
- The Tags page duplicate-name check now uses the already-loaded tag list, so the create dialog no longer needs a local SQLite handle while Supabase is active.
- Supabase create-tag uses PostgREST with the `catalog` write profile and returns the database-assigned tag id.
- SQLite mode keeps the existing local persistence step after creating a tag.
- Added the plain-English `createTag` contract, fixture coverage, and parity registration.
- A live Supabase create smoke created `zz supabase tag smoke 1760000035`, stayed on the Supabase Tags page, and showed the new recipe tag in the list.
- The smoke tag was deleted by exact name through the Supabase REST API; verification confirmed no row with that name remains.
- Added `deleteTag` to `window.dataService`, the SQLite adapter, and the Supabase adapter.
- The Tags page delete confirmation now calls `window.dataService.deleteTag({ id })` instead of deleting directly from SQLite.
- Supabase delete-tag removes recipe tag links, ingredient variant tag links, and then the tag row.
- SQLite delete-tag mirrors that behavior before the caller persists SQLite bytes.
- Added the plain-English `deleteTag` contract, fixture coverage, and parity registration.
- A live Supabase smoke created `zz supabase delete tag smoke 1760000040`, deleted it through the Tags page context-menu delete confirmation, and stayed in Supabase mode.
- MCP verification confirmed no hosted tag row with that smoke name remains.
- Added `editTag` to `window.dataService`, the SQLite adapter, and the Supabase adapter.
- The tag editor save path now calls `window.dataService.editTag({ id, name })` when renaming an existing tag.
- Supabase edit-tag updates the hosted tag name through PostgREST with the `catalog` write profile.
- SQLite edit-tag mirrors the old local rename behavior and keeps SQLite byte persistence in the caller.
- Added the plain-English `editTag` contract, fixture coverage, and parity registration.
- The Supabase tag editor can now rename an existing tag without opening the local SQLite bridge first.
- A live Supabase smoke created `zz supabase edit tag smoke 1760000041`, opened it in the tag editor, renamed it to `zz supabase edit tag renamed 1760000041`, verified the hosted row changed, and cleaned up the renamed row.
- Added `editSize` to `window.dataService`, the SQLite adapter, and the Supabase adapter.
- The size editor save path now calls `window.dataService.editSize({ id, name, isHidden, isRemoved, oldName })` when editing an existing size.
- Supabase edit-size updates the hosted size row and mirrors the old local rename behavior for size text in ingredient rows, ingredient size rows, and recipe ingredient substitute rows.
- SQLite edit-size mirrors the old local save behavior and keeps SQLite byte persistence in the caller.
- Added the plain-English `editSize` contract, fixture coverage, and parity registration.
- `sizeEditor.html` now loads the data-service adapter scripts and allows Supabase network calls, matching the other migrated editor pages.
- A live Supabase smoke created `zz supabase edit size smoke 1760000043`, opened it in the size editor, renamed it to `zz supabase edit size renamed 1760000043`, verified the hosted row changed, and cleaned up the renamed row.
- Added `removeSize` to `window.dataService`, the SQLite adapter, and the Supabase adapter.
- The Sizes page remove/delete confirmation now calls `window.dataService.removeSize({ id, action })` instead of updating or deleting sizes directly through SQLite.
- Supabase remove-size marks used sizes as removed and permanently deletes unused sizes through PostgREST with the `catalog` write profile.
- SQLite remove-size mirrors the old local behavior and keeps SQLite byte persistence in the caller.
- Added the plain-English `removeSize` contract, fixture coverage, and parity registration.
- A live Supabase smoke created `zz supabase remove size smoke 1760000045`, deleted it from the Sizes page delete confirmation, and verified the hosted row was gone.

Verification at this checkpoint:

- `node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js && node --check js/main.js` passed.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/createRecipe.json','utf8'))"` passed.
- `npm run test:web-build` passed.
- Browser parity on `http://127.0.0.1:8882/js/data/parity/runParity.html` passed with `239/239` fixtures for both SQLite and Supabase.
- Browser smoke on `http://127.0.0.1:8882/recipes.html?adapter=supabase&fresh=1760000030` showed the Supabase adapter active, opened the New Recipe dialog from Add, and canceled without relevant console errors.
- `node --check js/main.js && node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js` passed after the SQLite create-dialog guard.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/createRecipe.json','utf8'))"` passed after the SQLite create-dialog guard.
- `npm run test:web-build` passed after the SQLite create-dialog guard.
- Browser smoke on `http://127.0.0.1:8883/recipes.html?adapter=supabase&fresh=1760000031` reached the Supabase `createRecipe` write path and failed loudly with Postgres error `22P02` before creating a row.
- MCP `execute_sql` confirmed `catalog.recipes` has integer serving columns and no row titled `zz supabase create smoke 1760000031`.
- MCP `execute_sql` changed the three hosted recipe serving columns to `numeric` and verified their new types.
- Browser smoke on `http://127.0.0.1:8884/recipes.html?adapter=supabase&fresh=1760000032` passed: create returned a new id, navigation landed on `recipeEditor.html?adapter=supabase`, and the blank recipe rendered.
- MCP cleanup deleted smoke row id `149` titled `zz supabase create smoke 1760000032` and verified no row with that title remains.
- Supabase security and performance advisors were run after the DDL change. They still report pre-existing broad RLS and index warnings that were not introduced by the serving-column type change.
- `supabase migration list --linked` showed `20260430143226` as local-only before repair.
- `supabase migration repair 20260430143226 --status applied --linked --yes` completed.
- `supabase migration list --linked` then showed `20260430143226` present both locally and remotely.
- `node --check js/main.js && node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js` passed after adding the migration file.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/createRecipe.json','utf8'))"` passed after adding the migration file.
- `npm run test:web-build` passed after adding the migration file.
- MCP `execute_sql` verified hosted delete rules for recipe-owned tables before implementing `deleteRecipe`.
- `node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js && node --check js/main.js` passed after the delete-recipe slice.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/createRecipe.json','utf8')); JSON.parse(require('fs').readFileSync('js/data/fixtures/deleteRecipe.json','utf8'))"` passed after the delete-recipe slice.
- `npm run test:web-build` passed after the delete-recipe slice.
- Browser parity on `http://127.0.0.1:8885/js/data/parity/runParity.html` passed with `242/242` fixtures for both SQLite and Supabase.
- Browser smoke on `http://127.0.0.1:8885/recipes.html?adapter=supabase&fresh=1760000033` created `zz supabase delete smoke 1760000033`, then deleted it through the recipe-list delete confirmation.
- MCP verification showed the smoke row had id `150` after create and no row with that title remained after UI delete.
- Browser parity was rerun on `http://127.0.0.1:8886/js/data/parity/runParity.html` after a SQLite compatibility guard and passed with `242/242` fixtures for both SQLite and Supabase.
- `node --check js/main.js` passed after the shared helper pool fallback change.
- `npm run test:web-build` passed after the shared helper pool fallback change.
- IDE diagnostics for `js/main.js` showed no linter errors after the shared helper pool fallback change.
- Final sweep: `node --check js/main.js && node --check js/ingredientRenderer.js && node --check js/recipeEditor.js && node --check js/recipeEditor.stepsEdit.js` passed.
- Final sweep: `npm run test:web-build` passed.
- Final sweep: IDE diagnostics for `js/main.js`, `js/ingredientRenderer.js`, `js/recipeEditor.js`, and `js/recipeEditor.stepsEdit.js` showed no linter errors.
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
- `node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js && node --check js/main.js` passed after the create-size slice.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/createSize.json','utf8'))"` passed.
- `npm run test:web-build` passed.
- Browser parity on `http://127.0.0.1:8886/js/data/parity/runParity.html` passed with `245/245` fixtures for both SQLite and Supabase.
- Browser smoke on `http://127.0.0.1:8886/sizes.html?adapter=supabase&fresh=1760000034` passed: the Supabase adapter was active, the Sizes page loaded, Add created `zz supabase size smoke 1760000034`, and navigation landed on `sizeEditor.html?adapter=supabase`.
- No console errors mentioned Supabase read/write failure, `createSize`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the create-size smoke.
- REST cleanup verified one smoke size existed before cleanup and zero rows with that name remained after cleanup.
- `node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js && node --check js/main.js` passed after the create-tag slice.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/createSize.json','utf8')); JSON.parse(require('fs').readFileSync('js/data/fixtures/createTag.json','utf8'))"` passed.
- `npm run test:web-build` passed after the create-tag slice.
- Browser parity on `http://127.0.0.1:8886/js/data/parity/runParity.html` first found one bad `createTag` fixture expectation, then passed after the fixture was corrected: `249/249` fixtures for both SQLite and Supabase.
- Browser smoke on `http://127.0.0.1:8886/tags.html?adapter=supabase&fresh=1760000035` passed: the Supabase adapter was active, Add created `zz supabase tag smoke 1760000035`, and the new tag appeared under Recipes.
- No console errors mentioned Supabase read/write failure, `createTag`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the create-tag smoke.
- REST cleanup verified one smoke tag existed before cleanup and zero rows with that name remained after cleanup.
- `node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js && node --check js/main.js` passed after the delete-tag slice.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/deleteTag.json','utf8'))"` passed.
- `npm run test:web-build` passed after the delete-tag slice.
- Browser parity on `http://127.0.0.1:8886/js/data/parity/runParity.html?run=deleteTag-1760000040` passed with `252/252` fixtures for both SQLite and Supabase.
- Browser smoke on `http://127.0.0.1:8886/tags.html?adapter=supabase&fresh=1760000040` passed: the Supabase adapter was active, Add created `zz supabase delete tag smoke 1760000040`, context-menu delete removed it, and the `SB` badge stayed visible.
- No console errors mentioned Supabase read/write failure, `deleteTag`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the delete-tag smoke.
- MCP verification confirmed zero hosted rows with the smoke tag name remained after UI delete.
- `node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js && node --check js/main.js` passed after the edit-tag slice.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/editTag.json','utf8'))"` passed.
- `npm run test:web-build` passed after the edit-tag slice.
- Browser parity on `http://127.0.0.1:8886/js/data/parity/runParity.html?run=editTag-1760000041` passed with `255/255` fixtures for both SQLite and Supabase.
- Browser smoke on `http://127.0.0.1:8886/tags.html?adapter=supabase&fresh=1760000041` created `zz supabase edit tag smoke 1760000041`, opened it in `tagEditor.html?adapter=supabase`, and saved the rename to `zz supabase edit tag renamed 1760000041`.
- MCP verification showed hosted tag id `40` had the renamed value after save.
- MCP cleanup deleted hosted tag id `40` by exact id and renamed value, then verified no row with either smoke name remained.
- The title-edit part of the browser smoke was script-assisted because the editable heading is not exposed as a normal textbox to the automation tool.
- `node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js && node --check js/main.js` passed after the edit-size slice.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/editSize.json','utf8'))"` passed.
- `npm run test:web-build` passed after the edit-size slice and again after adding the missing `sizeEditor.html` data-service scripts.
- Browser parity on `http://127.0.0.1:8886/js/data/parity/runParity.html?run=editSize-1760000043` passed with `258/258` fixtures for both SQLite and Supabase.
- Browser smoke on `http://127.0.0.1:8886/sizes.html?adapter=supabase&fresh=1760000043` created `zz supabase edit size smoke 1760000043`, opened it in `sizeEditor.html?adapter=supabase`, and saved the rename to `zz supabase edit size renamed 1760000043`.
- MCP verification showed hosted size id `32` had the renamed value after save.
- MCP cleanup deleted hosted size id `32` by exact id and renamed value, then verified no row with either smoke name remained.
- The first edit-size smoke attempt found that `sizeEditor.html` did not load `window.dataService`; that page boot issue was fixed before the passing smoke.
- The title-edit part of the browser smoke was script-assisted because the editable heading is not exposed as a normal textbox to the automation tool.
- `node --check js/data/index.js && node --check js/data/adapters/sqliteAdapter.js && node --check js/data/adapters/supabaseAdapter.js && node --check js/data/parity/runParity.js && node --check js/main.js` passed after the remove-size slice.
- `node -e "JSON.parse(require('fs').readFileSync('js/data/fixtures/removeSize.json','utf8'))"` passed.
- `npm run test:web-build` passed after the remove-size slice.
- Browser parity on `http://127.0.0.1:8886/js/data/parity/runParity.html?run=removeSize-1760000045` passed with `261/261` fixtures for both SQLite and Supabase.
- Browser smoke on `http://127.0.0.1:8886/sizes.html?adapter=supabase&fresh=1760000045` created `zz supabase remove size smoke 1760000045`, then deleted it through the Sizes page delete confirmation.
- No console errors mentioned Supabase read/write failure, `removeSize`, SQLite adapter initialization, `dbInstance`, `db.exec`, or null/undefined database access after the remove-size smoke.
- MCP verification confirmed zero hosted rows with the smoke size name remained after UI delete.

Plain-English status summary:

```text
The app can now add, rename, and delete unused sizes through the same data door used for the cloud database.
The automated checks passed, and a real cloud test size was created, deleted from the app, and confirmed gone.
Removing a used size is covered by parity fixtures, but still needs a focused live test with real hosted recipe usage.
Overall, this is roughly 52% complete toward no local database usage.
```

What remains risky or untested:

- A real hosted Supabase create now works after changing the hosted recipe serving columns to decimal-capable numeric columns.
- A real hosted Supabase delete now works for the recipe-list delete action.
- The live create smoke only covered creating and opening the blank recipe; saving edits to that recipe is still not migrated.
- The live delete smoke used a blank throwaway recipe. Delete behavior for recipes with existing ingredients, steps, tags, and links was verified by schema review and parity fixtures, not by deleting a populated hosted recipe.
- Saving the newly created recipe is still not migrated; save remains SQLite-bridge work and is intentionally outside this slice.
- Browser smoke for shopping item editor detail failure behavior and shared helper pool failure paths still needs to be run for this latest slice.
- Browser smoke for recipe ingredient edit, recipe-link validation, and recipe-title typeahead still needs to be run for this latest helper fallback slice.
- Most Supabase writes are still not migrated. Save is intentionally unavailable when no SQLite bridge is open.
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
- Direct SQLite reads still exist for SQLite-mode fallbacks, schema compatibility, repair helpers, adapter/bridge internals, and write-path refreshes. They are not counted as remaining Supabase-active read rewiring work.
- Browser parity passed after the latest contract, fixture, adapter, and parity changes.
- Creating, renaming, and deleting an unused size through Supabase now works from the Sizes page and size editor.
- The earlier live create-size smoke only covered creating and opening the new size editor; the latest smoke now covers renaming from that editor.
- Creating and renaming a size through Supabase now works from the Sizes page and size editor.
- The live edit-size smoke used an unused throwaway size; renaming a hosted size that appears in ingredients or substitutes was verified by parity fixtures, not by changing real hosted recipe data.
- Hiding and marking a size removed are covered by parity fixtures but still need a focused live UI smoke.
- Marking a used hosted size as removed is covered by parity fixtures but was not live-smoked against real hosted recipe usage.
- Creating, renaming, and deleting a tag through Supabase now works from the Tags page and tag editor.
- Deleting a tag that is attached to recipes or ingredient variants was verified by parity fixtures, not by deleting a used hosted tag.
- The live edit-tag smoke used an unused throwaway tag; renaming a heavily used hosted tag still needs human/manual coverage if that matters.
- Unknown-tag creation from the recipe editor is still not migrated; this slice only covered the Tags page Add dialog.

Commit and push were requested for this checkpoint and will be completed after this status update is staged.

## Known Risks

- Many direct `db.exec` paths still exist. They are expected until SQLite-mode fallback code, writes, schema bridge behavior, and adapter/bridge internals are removed or replaced.
- The serving-column migration is now recorded locally and marked applied remotely.
- `supabase migration list --linked` still shows two older remote migrations, `20260428140000` and `20260428173751`, that are not present as local migration files. Those predate this slice and were not repaired.
- SQLite bytes are still loaded in many flows. Skipping local SQLite entirely is a larger cross-cutting change and should wait until the remaining reads/writes and offline/schema questions are handled.
- Manual smoke coverage is still important for editor interactions that automated tests do not exercise, especially save behavior, editor-mode shopping item links, and unknown-tag save behavior without SQLite.
- Live Supabase write smoke passed for create-recipe, and the exact smoke row was cleaned up.
- Live Supabase write smoke passed for delete-recipe, and the exact smoke row was removed through the UI.
- Live Supabase write smoke passed for create-size, and the exact smoke row was cleaned up by exact name.
- Live Supabase write smoke passed for create-tag, and the exact smoke row was cleaned up by exact name.
- Live Supabase write smoke passed for delete-tag, and MCP verification confirmed the exact smoke row was gone.
- Live Supabase write smoke passed for edit-tag, and MCP verification confirmed the renamed smoke row was cleaned up.
- Live Supabase write smoke passed for edit-size, and MCP verification confirmed the renamed smoke row was cleaned up.
- Live Supabase write smoke passed for deleting an unused size, and MCP verification confirmed the exact smoke row was gone.

## Recommended Next Slice

Several narrow write methods now exist, but broad save migration has not started.

Recommended focus:

- Choose the next smallest lookup-table write slice, such as editing or removing/deleting an existing unit, and add its plain-English contract, fixtures, and parity coverage before exposing it through `window.dataService`.
- Do not split the recipe editor Save button across Supabase and SQLite. Recipe metadata, tags, steps, and ingredients are still one bundled save path and need a careful contract before migration.
- Use a real browser/manual session with a populated/generated shopping list to exercise home-location sorting after reset/undo or any action that changes which generated rows are present.
- Use a real browser/manual session to exercise step `@recipe` autocomplete and editor-mode shopping item links; automated browser smoke still has gaps around those exact interactions.
- Use a real browser/manual session to exercise shopping item editor detail, recipe ingredient edit, recipe-link validation, recipe-title typeahead, and shared helper pool behavior in Supabase mode.
- If practical, intentionally break one representative Supabase read in a controlled browser/dev session and confirm the prefetch failure toast/rollback path appears as expected.
- If practical, run a controlled no-local-SQLite browser session for `recipes.html?adapter=supabase`, `shopping.html?adapter=supabase`, `shoppingList.html?adapter=supabase`, `units.html?adapter=supabase`, `tags.html?adapter=supabase`, `sizes.html?adapter=supabase`, and `stores.html?adapter=supabase` to confirm each page continues after the local database open fails.
- Decide whether shopping-plan key reconcile and prune repair behavior is needed before write migration; if yes, add plain-English contracts for any Supabase-native repair reads that existing data-service methods cannot provide.
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
