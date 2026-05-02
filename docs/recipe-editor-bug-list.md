# Recipe Editor — Active Bug List

This is the working bug list while finishing the SQLite → Supabase migration cleanup.

The migration deleted the SQLite engine, adapter, and bundled DB file, but left roughly 100 direct `db.exec` / `db.run` / `db.prepare` call sites in UI code (`js/main.js`, `js/recipeEditor.js`, `js/ingredientRenderer.js`, `js/recipeEditor.stepsEdit.js`, `js/recipeEditor.session.js`, `js/typeahead.js`, `js/ingredientDisplay.js`, `js/formatter.js`). Reads against the now-null `window.dbInstance` silently return `null`. Writes throw. These bugs are the visible symptoms.

`docs/supabase-architecture.md` describes the *intended* end state. This file is the *actual* state.

## Hard rules for whoever works on this

- One bug (or one tight cluster) at a time.
- After each fix, stop and tell the user what to click in the browser to confirm. Do not move on without that confirmation.
- No commit until the user has manually verified fixes in the browser. `node --check` and unit tests are not enough; we already learned that.
- No "while I'm here" cleanup. No bulk db.exec replacement sweep in the same session as a bug fix.
- If stuck, stop, write down what was tried, hand back to the user. Do not improvise.

## Uncommitted work in the tree (do NOT revert)

There is real saveRecipe-related work sitting uncommitted in the working tree from a prior session. It addressed two bugs that no longer reproduce (heading promotion lost on save, OR/alt status lost on roundtrip). Those fixes are good. Leave them. The same session also tried to fix the inline-lookup family by removing fallback guards — that part did not help and may have removed useful safety. Do not revert wholesale; if a specific guard removal looks suspect, revisit only that one line.

Files modified by the prior session:
- `js/data/adapters/supabaseAdapter.js` (saveRecipe payload — KEEP)
- `js/data/contracts/saveRecipe.md` and `js/data/fixtures/saveRecipe.json` (contract update — KEEP)
- `js/recipeEditor.js`, `js/recipeEditor.session.js`, `js/recipeEditor.stepsEdit.js`, `js/ingredientRenderer.js`, `js/typeahead.js`, `js/main.js` (mixed — keep saveRecipe-related changes; review the inline-lookup fallback removals only if a specific symptom points to them)

## Bugs to fix, in priority order

### 1. Delete shopping item throws

**Reproduce:** Try to delete a shopping item.
**Symptom:** Toast "Failed to delete item." Console:
```
TypeError: Cannot read properties of null (reading 'run')
    at removeShoppingName (main.js:8640)
```
**Root cause:** `removeShoppingName` in `js/main.js` (~line 8625–8640) calls `db.run('BEGIN;')` directly. `db = window.dbInstance` which is permanently null. This is a direct SQLite write that was never migrated.
**Fix shape:** Either route this through a new `window.dataService.deleteShoppingItem(...)` method (preferred — adds the method to `js/data/adapters/supabaseAdapter.js` and `js/data/index.js`), or — if a Supabase delete already exists somewhere — wire to that. Read the function fully before deciding shape.

### 2. After deleting an ingredient, "add an ingredient" becomes a no-op

**Reproduce:** Open a recipe in the editor. Delete an ingredient. Click "add an ingredient". Nothing happens.
**Suspected root cause:** Likely the same shape as #1 — a write or state-update path hits a null `dbInstance` mid-flow and silently bails, leaving the editor in a partially-broken state. Investigate before fixing.

### 3. YWN section repeats entries ("Misc Apple Misc Apple Misc Apple")

**Reproduce:** Open a recipe in the editor. Add an ingredient with name "apple". Look at the You Will Need section.
**Symptom:** The same item appears multiple times.
**Important clue:** A hard reload (Cmd+Shift+R) shows the correct (non-repeating) state. This means a module-level state object (`window.stepNodes`, a YWN state array, or similar) is being *mutated/appended* across renders instead of *replaced*. Hard reload clears the in-memory state.
**Fix shape:** Find the state object that's being appended to. Make the render path build fresh state each time, or clear before refilling.

### 4. Type "111" → blur → see "111 111"

**Reproduce:** Click the paste-content area. Type "111". Click away to blur.
**Symptom:** Field shows "111 111".
**Suspected root cause:** Probably the same family as #3 (something accumulating instead of replacing). May be the same fix.

### 5. Clean state → place caret in step → blur → editor shows dirty

**Reproduce:** Open a recipe in a clean state. Click into a step (no typing). Click away.
**Symptom:** Recipe is now flagged dirty.
**Suspected root cause:** A blur handler is performing a normalize-and-write-back that always marks dirty, even when no change happened. May share machinery with #3 and #4.

### 6. Unknown-ingredient speedbump skipped

**Reproduce:** Add a new ingredient line with a name that doesn't exist in the database. Save.
**Symptom:** No "you're adding a new ingredient — is that intentional?" confirmation. The new ingredient is silently created.
**Root cause:** An inline lookup ("is this ingredient already known?") reads `window.dbInstance` and returns null when it can't find it. The caller treats null as "no problem, just save." Likely in `js/recipeEditor.js` or `js/ingredientRenderer.js`.
**Fix shape:** Replace the inline `db.exec(...)` lookup with `window.dataService.lookupIngredientNameByLemma(...)` or `lookupShoppingItemByName(...)` (both already exist on the data door). Make sure the caller still treats "not found" as "trigger the speedbump."

### 7. Return after blur in a step does nothing (works after navigating back)

**Reproduce:** Add an instruction step. Blur. Click back at the end of the step. Press Return.
**Symptom:** No new line.
**Workaround that works:** Click the back button, navigate back to the recipe, place caret, press Return — works as expected.
**Suspected root cause:** Post-blur state setup leaves the keydown wiring incomplete. Likely related to whatever is causing #5. Investigate after the blur cluster (#3, #4, #5) is resolved — may be the same fix.

## Bugs that no longer reproduce (do not touch)

- Heading promotion lost on save — fixed by the prior session's saveRecipe work.
- OR/alt status lost on back/return — fixed by the prior session's saveRecipe work.
- Promoting an ingredient to a heading triggering alpha sort on blur — user reported this was their own error, disregard.

## Done-ness signal

This file is "done" (delete it, or mark all bugs resolved) when all 7 active bugs above are fixed AND the user has manually confirmed each one in the browser. At that point the architecture doc's status section can also be updated to reflect that UI code no longer touches SQLite directly.

The full systematic sweep of remaining `db.exec` call sites is a separate, later task. Do NOT do it as part of fixing these bugs. Targeted fixes only.
