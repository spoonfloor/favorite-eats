# Recipe Editor — Supabase Migration Sweep

> **Status:** This is the active directive for finishing the SQLite → Supabase
> migration. It replaces the bug-fix-driven plan that previously lived in this
> file. The earlier symptom list is preserved at the bottom for post-sweep
> triage; it is not a checklist for this work.

## Required reading

1. `docs/supabase-architecture.md` — intended end state. Note the status box.
2. `git show ada12af` — example of one migration round, end to end.

## Why this exists

Earlier sessions chased user-reported bugs against a half-migrated substrate.
That mixed migration debris with real logic bugs and got confusing. New plan:
finish the migration sweep first, then look at what's still broken with a
clean substrate. Don't get pulled into the symptom list below along the way.

## Current state

- SQLite engine, adapter, and bundled DB file: deleted.
- `window.dbInstance` is permanently `null`.
- **`js/main.js` is the active migration surface.** The numbered file list below
  is historical (those files are already swept). Do not re-sweep them unless
  `git grep` shows new regressions.
- Direct **`db.exec` / `db.run` / `db.prepare` calls are gone from `js/`** (re-run
  a repo search under `js/` before trusting this line). **`window.dbInstance`**
  and a few **`typeof db.exec`** guards still appear in `js/main.js` for
  legacy/test hooks and the non-Supabase recipe export path.
- **Live status beats this doc.** On resume, use `git status`, `git log`, and
  `git grep` on `js/main.js` for what is left—not an exact count or “next line”
  in markdown (those go stale).
- There is **no master checklist** of every screen and write path. The tail is
  **discovery**: cluster old SQL by user-visible flow, wire the door, verify
  that flow.
- Do not touch `experiments/name-deck/*`.

## Known issues / out of scope for agents

### Shopping item editor — variant row UI (Shift+Enter / focus)

**Do not** spend migration or agent time on: Shift+Enter insertion of new variant rows, focus jumping, empty rows disappearing on blur, or `preventAutoDeleteOnInitialBlur`-style workarounds in `loadShoppingItemEditorPage` (`js/main.js`) unless the **user explicitly** requests that work in the current task.

**Reason:** Manual QA failed on this path; behavior is tightly coupled to rerender and browser focus ordering, so fixes are high churn and low confidence. SQLite → Supabase migration work does **not** depend on resolving this.

**If this code is touched accidentally:** revert and leave behavior as on `main` unless the user directs otherwise.

See also: `.cursor/rules/shopping-variant-editor-known-issue.mdc` (applies when `js/main.js` is in scope).

## The sweep

Completed file order (smallest/cleanest first—**for context only**):

1. `js/ingredientDisplay.js`
2. `js/typeahead.js`
3. `js/recipeEditor.session.js`
4. `js/recipeEditor.stepsEdit.js`
5. `js/ingredientRenderer.js` — inline lookups; some door methods exist already.
6. `js/recipeEditor.js`
7. `js/formatter.js`
8. `js/main.js` — **remaining work**: admin/shopping flows; many **writes** need
   new or extended data-door methods.

**Priority inside `js/main.js`:** favor clusters that **mutate persisted state**
(or unblock those flows) over broad read-only or compatibility-only cleanup.
Read swaps are still fine when they unblock a write path or fix a crash; they
should not trump wiring saves/deletes/updates. Reads are often safe to swap
(callers already handle `null`). Writes need a method on the data door first, in
the shape of `ada12af`.

## The loop, per round

1. Pick one file, or one tight cluster within a file.
2. For each `db.exec` / `db.run` there, figure out what the SQL is doing.
3. If a matching `dataService` method exists, swap the call.
4. If not, add one:
   - Write the function in `js/data/adapters/supabaseAdapter.js` with a short
     header comment describing what it does. No separate markdown contract.
   - Expose it on the door in `js/data/index.js`.
   - Swap the caller.
5. `node --check` the touched files.
6. **Check it the sensible way.** If the change affects something you can tap in
   the app (save, delete, a list, etc.), say what screen to open and what to try.
   If the change is clearly safe without a browser—dead code, unreachable branch,
   or “same behavior, less SQLite”—say that in one sentence and move on. Do not
   use in-app browser automation unless the user explicitly asks.
7. **Commit when the work is actually verified**, not when a ritual is complete.
   Code-only proof (control flow, `node --check`) is enough for non-UI cleanups.
   For user-visible writes, prefer a quick real check when the user can run the
   app; if they can’t, commit anyway with a message that states what wasn’t
   UI-tested—don’t block the branch on “lgtm.”

## Agent safety protocol

- Start every resumed chat with `git status`, recent commits, and `git grep` on
  `js/main.js` if the task is the sweep. Treat this file as the source of truth
  for what remains, not a static “next chunk” paragraph.
- Do not use in-app browser automation unless the user explicitly asks.
- Do not leave long-running server/background jobs running. If a local server is
  needed, start it only when needed, give the user the plain URL, and stop it
  when done.
- Keep commits small and tied to one file or one tight cluster. This keeps the
  repo recoverable if Cursor loses the chat.
- **Log progress in git, not in chat.** Each round lands as a scoped commit
  whose message names the flow or cluster (for example:
  `fix(migration): wire shopping plan row delete to dataService`). The next
  agent should reconstruct status from `git log`, not from chat.
- Prefer a quick human click-through when the diff touches real UI behavior; skip
  that when the diff doesn’t need it. Don’t use agent browser automation unless
  the user asks.

## Guardrails

- One file (or one tight cluster) per round. No multi-file sweeps.
- Don’t commit broken code: `node --check` (and tests if you added them) are the
  minimum bar. Manual “lgtm” is **not** required for every commit—only when you
  need a human to confirm something the code can’t prove (a real save, a real
  screen).
- No "while I'm here" cleanup outside the file you're sweeping.
- New adapter methods: short comment header, that's it. Do not add new
  `js/data/contracts/*.md` files or `js/data/fixtures/*.json` files. Don't
  add new parity-test scaffolding. Existing ones are fine to leave; just
  don't grow the set.
- Don't touch: saveRecipe (already migrated and verified),
  `experiments/name-deck/*` (unrelated).
- If stuck, hand back. Don't improvise. Don't chase a hypothesis whose
  symptom doesn't reliably reproduce.

## Recommended next chunk

Stay in `js/main.js`. Use search to group remaining `db.exec` / `db.run` /
`db.prepare` (and any `window.dbInstance` guards) by **screen or action** (e.g.
shopping editor save, plan row, admin list).

Pick **one tight cluster** whose failure mode is “user clicks save and nothing
sticks” (or similar)—**write-first**—unless a small read or init-order fix is
blocking that flow. Do not try to clear the whole file in one pass.

After `node --check`, share how to verify **when verification is useful** (URL +
clicks for UI changes; one line for “safe by inspection” changes). Commit without
waiting on a formal OK when that’s overkill.

## Shopping plan reconcile / prune (Supabase) — scope

**Problem.** In production, `maintainShoppingPlanStorageWithDb` only runs the
Supabase reconcile/prune pair (`reconcileShoppingPlanItemSelectionKeysWithDataService`,
`pruneOrphanShoppingItemSelectionsWithDataService`) plus
`healShoppingListDocWithGeneratedFromPlan`. The old SQL.js reconcile/prune helpers
were removed from `js/main.js` once the data door was always on. If catalog drift
still shows up in `itemSelections` or the list doc, the gap is in the **adapter**
implementations below, not missing SQLite call sites in the UI bundle.

**In scope (behavioral parity).**

1. **Reconcile** (historical SQLite behavior to mirror in the adapter):
   - For each non-zero `itemSelections` entry:
     - **`iv:{id}` keys:** Resolve current ingredient name + variant text from
       `ingredient_variants` + `ingredients`; if the variant row is gone, drop the
       selection (same as SQLite `toRemove`). Otherwise refresh stored `name` /
       `variantName` when they drift.
     - **Aggregate keys** (`name\u0000variant`): Resolve canonical ingredient
       (direct name, then synonym),
       resolve canonical variant display, optionally **upgrade** stable keys to
       `iv:{id}` when a matching variant row exists.
     - On key rewrite: **merge quantities** into the new key, delete old keys,
       call **`patchShoppingListDocForRewrittenSelectionKeysAsync`** so persisted list
       doc `sourceKey` lines follow (it uses the same plan-row source as
       `healShoppingListDocWithGeneratedFromPlan`, i.e. `getShoppingPlanSelectionRowsViaDataService`
       when the data door is on).
     - Preserve existing hooks: `window.__favoriteEatsPruneShoppingBrowseSelectionKeys`,
       `window.__favoriteEatsApplyShoppingBrowseSelectionKeyMap` when keys change.

2. **Prune** (mirror prior SQL.js orphan prune rules in the adapter):
   - Drop `iv:{id}` when that variant id does not exist.
   - Drop aggregate keys when the base ingredient does not resolve.
   - When variant text is present and non-reserved, drop the key if no matching
     `ingredient_variants` row for that ingredient.

**Explicitly follow SQLite ordering:** reconcile → prune → heal (heal already
runs last in `maintainShoppingPlanStorageWithDb`).

**Adapter / door work** (add short header comments in `supabaseAdapter.js`, expose
on `js/data/index.js`; keep **one tight cluster per commit** per sweep rules):

- **Resolve canonical ingredient** for a normalized base string (name + synonym
  lookup with **SQLite-equivalent** matching—today SQLite uses
  `lower(trim(...))` equality; confirm whether `lookupShoppingItemByName` /
  lemma plural variants are acceptable or if reconcile needs stricter queries).
- **Variant by id** (join to ingredient name): replaces the old SQL.js
  `ingredient_variants` + `ingredients` join used for `iv:{id}` rows + orphan checks.
- **Variant id for (ingredient_id, variant text)** or existence probe: replaces
  inner `SELECT id FROM ingredient_variants WHERE ...` blocks used for key
  upgrade and prune.

Prefer **batched** PostgREST reads when many keys are processed in one maintain
pass (collect distinct `iv:` ids and distinct base names, then map in memory) to
avoid N round trips per selection.

**Risks.**

- **Semantics drift:** catalog lookup helpers tuned for “shopping UI” may not
  match reconcile’s strict identity rules; wrong parity causes surprise key
  churn or failure to merge synonyms.
- **Async:** reconcile + prune become async; `maintainShoppingPlanStorageWithDb`
  already awaits heal—extend with `await` for new steps only (callers already
  async at `loadShoppingPage` / `loadShoppingListPage`).
- **Persistence:** `itemSelections` and shopping list doc live in remote shopping
  state; ensure `saveShoppingState` runs after updates (existing save paths may
  already flush—verify).

**Verification.**

- After implementation: exercise rename/delete flows that change ingredient or
  variant rows, reload shopping **items** and **list** pages, confirm selections
  and list doc lines stay aligned (or are removed when catalog rows disappear).
- Extend or add a small VM test with mocked `window.dataService` methods if a
  stable pure helper is extracted; otherwise document manual QA in the commit.

**Out of scope for this slice.**

- New Postgres RPCs or Edge Functions unless profiling proves batch APIs are
  insufficient.
- Changing key formats (`iv:`, NUL separators) or shopping storage schema.

## Done-ness signal

The sweep is done when no UI file under `js/` contains `db.exec`, `db.run`,
`db.prepare`, or `window.dbInstance` references, AND each **meaningful** flow that
touched those patterns has been exercised in the real app (or consciously
accepted with a short note when something couldn’t be run). At that point update
the
status box of `docs/supabase-architecture.md` to reflect that UI code no
longer touches SQLite, and use the symptom list below as the starting point
for fresh post-sweep triage.

---

## Symptoms observed (revisit after sweep)

Preserved from the earlier bug-fix-driven plan as a triage starting point.
**Not a checklist for this work.** Repros may be stale or wrong (the
"delete-then-add no-op" entry below was unreproducible in a clean session).
After the sweep is done, walk through the app fresh and write accurate
repros for whatever's still broken.

### YWN section repeats entries ("Misc Apple Misc Apple Misc Apple")

**Reproduce:** Open a recipe in the editor. Add an ingredient with name
"apple". Look at the You Will Need section.
**Symptom:** The same item appears multiple times.
**Important clue:** A hard reload (Cmd+Shift+R) shows the correct
(non-repeating) state. This means a module-level state object
(`window.stepNodes`, a YWN state array, or similar) is being
mutated/appended across renders instead of replaced. Hard reload clears the
in-memory state.
**Likely fix shape:** Find the state object that's being appended to. Make
the render path build fresh state each time, or clear before refilling.

### Type "111" → blur → see "111 111"

**Reproduce:** Click the paste-content area. Type "111". Click away to blur.
**Symptom:** Field shows "111 111".
**Suspected root cause:** Probably the same family as the YWN repetition
(something accumulating instead of replacing). May be the same fix.

### Clean state → place caret in step → blur → editor shows dirty

**Reproduce:** Open a recipe in a clean state. Click into a step (no
typing). Click away.
**Symptom:** Recipe is now flagged dirty.
**Suspected root cause:** A blur handler is performing a
normalize-and-write-back that always marks dirty, even when no change
happened.

### Unknown-ingredient speedbump skipped

**Reproduce:** Add a new ingredient line with a name that doesn't exist in
the database. Save.
**Symptom:** No "you're adding a new ingredient — is that intentional?"
confirmation. The new ingredient is silently created.
**Root cause:** An inline lookup ("is this ingredient already known?") reads
`window.dbInstance` and returns `null` when it can't find it. The caller
treats `null` as "no problem, just save."
**Likely fixed by the sweep:** when `js/ingredientRenderer.js` /
`js/recipeEditor.js` are swept, the inline lookup gets replaced with
`dataService.lookupIngredientNameByLemma` /
`dataService.lookupShoppingItemByName`. The caller should then see real
"not found" answers and trigger the speedbump.

### Return after blur in a step does nothing (works after navigating back)

**Reproduce:** Add an instruction step. Blur. Click back at the end of the
step. Press Return.
**Symptom:** No new line.
**Workaround that works:** Click the back button, navigate back to the
recipe, place caret, press Return — works as expected.
**Suspected root cause:** Post-blur state setup leaves the keydown wiring
incomplete. Likely related to the clean→dirty blur bug above.

### Delete ingredient → "add an ingredient" becomes a no-op

**Reported, but unconfirmed.** Repro on 2026-05-02 could not produce it in
a clean session. May have been a transient state side-effect of a
now-fixed bug, or may need a specific sequence not captured here. Treat as
unconfirmed; do not chase.

## Bugs that no longer reproduce

- Delete shopping item throws — fixed in `ada12af`. New
  `dataService.deleteShoppingItem` method handles both soft-remove and
  hard-delete.
- Heading promotion lost on save — fixed by the prior session's saveRecipe
  work.
- OR/alt status lost on back/return — fixed by the prior session's
  saveRecipe work.
- Promoting an ingredient to a heading triggering alpha sort on blur — user
  reported this was their own error; disregard.
