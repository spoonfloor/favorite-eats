# Agent handoff: full-catalog stress hardening

Use this with `docs/agent-handoff-warm-client-performance.md`. The warm-client work made hub screens faster; this follow-up hardens the app when the entire catalog is added to the meal plan, removed, added again, and manipulated across two tabs.

## Goal

The app should stay stable when the user stress-tests the planner with every recipe and every item selected:

- no Items load console error
- compound filter menus stay open when clicked
- two tabs stay in sync without tearing down active menus or steppers
- full-catalog plan saves complete without `save_shopping_state` timeout toasts
- add-all / remove-all actions produce one coalesced plan save, not hundreds of full saves

## User report

- Compound filter menus are flaky:
  - Recipes: region / meal / more
  - Items: location / tags / more
- Items console error on load:
  - `ReferenceError: Cannot access hydrateRecipeDerivedShoppingSelections before initialization`
- Save failure/toast under stress:
  - `save_shopping_state` RPC 500
  - Postgres code `57014` statement timeout
- Stress setup:
  - user added every recipe and every item to the meal plan
  - two tabs open, Recipes and Items
  - fresh login

## Diagnosis

### 1. Items load error

`js/screens/itemsPage.js` calls `hydrateRecipeDerivedShoppingSelections()` before the `const hydrateRecipeDerivedShoppingSelections = async () => { ... }` definition is initialized. This is a temporal dead zone bug.

There is already a later/deferred hydrate path that runs after the function exists, so the early call is redundant and noisy.

### 2. Compound chip menus

Several behaviors combine:

- Recipes stepper auto-dismiss checks whether the event target is inside filter UI, but the target can be a `Text` node when the user clicks label text. The current `closest()` check only works for `Element`.
- Recipes remote plan refresh blindly calls `rerenderFilteredRecipes()`, which rebuilds chips and closes open dropdowns when another tab saves or hydrates.
- Items is gentler on remote refresh (`refreshShoppingSelectionUi({ fullRerender: false })`) and should be the model for Recipes.
- The shared dropdown code in `js/utils.js` opens on click and closes on outside pointerdown capture; a small open-grace window can prevent open-then-close behavior, especially on touch.

### 3. Full-catalog save timeout

The save path does too much work too often:

- Add-all loops call per-row setters.
- Each setter can call `persistShoppingPlan()`.
- `persistShoppingPlan()` queues a full plan save immediately.
- `queueSaveShoppingStateToDataService()` has no debounce/coalescing.
- `catalog.save_shopping_state` deletes and reinserts plan/list rows, then returns `catalog.load_shopping_state()`.

Under full-catalog stress, this can enqueue many large RPCs and make each RPC expensive enough to hit Postgres statement timeout.

## Non-negotiables

- Do not reintroduce local-first shopping glue.
- Do not add or suggest Shopping List free-text “add a line” UX.
- Keep Supabase authoritative after remote apply.
- Keep per-row Shopping List RPCs for checkbox/text edits.
- Do not replace checkbox writes with bulk full-list saves.
- Do not treat raising `statement_timeout` as the real fix.
- Do not detour into a SPA rewrite or broad admin-page refactor.
- Do not touch the shopping variant editor known-issue area unless explicitly asked.

## Fix order

### Slice 1: console and menu stability

1. `js/screens/itemsPage.js`
   - Remove the early `try { await hydrateRecipeDerivedShoppingSelections(); } ...` block that runs before the function definition.
   - Keep the later/deferred hydrate path.

2. `js/screens/recipesPage.js`
   - Make `isRecipeFilterChipDropdownUiTarget` text-node safe.
   - Resolve non-Element targets to a parent element before calling `closest()`.

3. `js/screens/itemsPage.js`
   - Extend `shoppingRowStepperController.bindAutoDismiss` `shouldIgnoreTarget`.
   - It should ignore targets inside:
     - `.list-filter-chip-dock`
     - `.app-filter-chip-dropdown-panel`
     - `.app-filter-chip-dropdown-backdrop`
     - existing active `.shopping-stepper-qty-input` behavior

4. `js/screens/recipesPage.js`
   - Change `registerFavoriteEatsRemotePlanUiRefreshHook` so it does not blindly `rerenderFilteredRecipes()` while a compound dropdown is open.
   - Prefer the Items pattern: hydrate selection state, sync buttons/steppers, avoid full rerender where possible.
   - If chips must rebuild, preserve/reopen the dropdown using the existing `reopenRecipeCompoundDropdownId` / `reopenCompoundDropdown` pattern.

5. `js/utils.js` (optional but recommended)
   - In `renderFilterChipList`, ignore the first outside pointerdown for about 150ms after opening a dropdown.
   - Keep this narrow; it is only to prevent open-then-immediate-close behavior.

### Slice 2: client-side save hardening

1. Bulk plan mutations must save once.
   - Add a narrow batching mechanism around shopping plan mutations.
   - Use it for:
     - Recipes `applyRecipeAddAllZeroSteppers`
     - Items `applyShoppingSelectAllZeroSteppers`
     - any remove-all / clear-plan flow found during implementation
   - Important: debounce alone is not enough if add-all fires hundreds of save calls before debounce can help.

2. Coalesce normal rapid plan saves.
   - Update the plan-save queue so plan-only saves use a trailing debounce, around 300-500ms.
   - Use 400ms unless the surrounding code gives a strong reason not to.
   - Allow at most one plan save in flight.
   - If edits happen while a save is in flight, remember the latest plan and save it after the current save settles.
   - Flush the latest pending plan on `pagehide` using the awaited save path when practical.
   - Preserve existing guards/counters:
     - `shoppingPlanRemoteSaveInFlight`
     - `shoppingStateRemoteApplyGeneration`
     - remote apply retry behavior

3. Do not send `shoppingListDoc` for plan-only edits.
   - Planner changes should save `{ plan }` only.
   - List state should only be sent when list state actually changed.
   - Keep narrow list RPCs for checkbox/text/list row changes.

### Slice 3: server-side save hardening

1. Add a plan-only RPC.
   - Preferred name: `catalog.save_shopping_plan(plan_payload jsonb)`.
   - Save plan data only:
     - `plan.selected_items`
     - `plan.selected_recipes`
     - `plan.selected_recipe_roots`
     - `plan.store_preferences`
   - Do not rewrite list tables.
   - Do not call `catalog.load_shopping_state()` at the end.
   - Return revision/version info sufficient for the warm-client store/update path, for example `planUpdatedAt` / `planVersion`.

2. Rewrite SQL as set-based operations.
   - Avoid delete-all plus per-row loops where possible.
   - Use `jsonb_each` / `jsonb_to_recordset` style inputs.
   - Delete rows not present in the new payload.
   - Upsert rows present in the new payload.
   - Validate recipe/store existence with joins, not per-row `exists` checks in loops.
   - Preserve skip-missing-recipes behavior from the existing `save_shopping_state` migration.

3. Use a timeout bump only as a temporary safety net.
   - If needed, make it function-local for the new plan save RPC.
   - Do not ship this as the only fix.
   - Mention in PR notes that it is interim.

4. Wire through the data door.
   - Add a `dataService` method for plan-only save.
   - Route plan-only queue through the new RPC.
   - Keep existing `saveShoppingState` for legacy/full state or explicit full snapshot use.

### Slice 4: polish

- Add subtle “Saving plan...” UI while a coalesced save is pending or in flight.
- Optionally show a one-time gentle message if the plan is huge and save takes more than about 2 seconds.
- Do not block large plans with a hard cap.

## Key files

| Area | Files |
|------|-------|
| Items UI / hydrate bug | `js/screens/itemsPage.js` |
| Recipes UI / menu refresh | `js/screens/recipesPage.js` |
| Shared filter chips | `js/utils.js` |
| Stepper dismiss behavior | `js/listRowStepper.js` |
| Plan persistence | `js/main.js` |
| Data door | `js/data/index.js` |
| Supabase adapter | `js/data/adapters/supabaseAdapter.js` |
| Current save RPC | `supabase/migrations/20260527120000_save_shopping_state_skip_missing_recipes.sql` |
| Store tests | `tests/runFavoriteEatsStoreTests.js` |
| Plan tests | `tests/runShoppingPlanLinkedRecipeTests.js` |
| Migration tests | `tests/runSaveShoppingStateMigrationTests.js` |

Important `js/main.js` landmarks:

- `persistShoppingPlan`
- `updateShoppingPlan`
- `queueSaveShoppingStateToDataService`
- `awaitPersistShoppingStateToDataService`
- `runFavoriteEatsRemoteShoppingPlanRefresh`
- `setShoppingPlanItemSelection`
- `setShoppingPlanRecipeRootSelection`

## Verification

Always:

- Run `node --check` on touched JS.
- Run relevant npm tests when touching shared plan/store behavior.
- For migrations/RPC changes, verify the function against Supabase and review grants, RLS assumptions, `search_path`, and security posture.

Manual stress matrix:

1. Fresh login, two tabs: Recipes + Items.
2. Items load has no `hydrateRecipeDerivedShoppingSelections` ReferenceError.
3. Open compound menus by clicking label text; menus stay open.
4. Open a compound menu in one tab, edit the plan in the other; the menu does not close unexpectedly or reopens correctly.
5. Add all recipes to the plan.
6. Add all items to the plan.
7. Manipulate several steppers quickly.
8. Remove all / clear selections, then add again.
9. Other tab converges without manual refresh.
10. No `save_shopping_state` `57014` timeout toast.
11. Network shows coalesced plan saves, not hundreds of full saves.
12. Database row counts in `plan.selected_recipes` and `plan.selected_items` match the UI after the stress cycle.

## Recommended PR order

1. Console + menu fixes.
2. Client batching/coalescing.
3. Server plan-only RPC + adapter wiring.
4. Saving indicator / large-plan polish.

Do not commit unless the user asks.
