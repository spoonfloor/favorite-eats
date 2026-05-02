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
- The sweep has reached `js/main.js`. Earlier files in the order below have
  already been migrated.
- Direct `db.exec` / `db.run` / `db.prepare` / `window.dbInstance` references
  are now confined to `js/main.js`.
- Latest migration commits include `00097fa` (`js/recipeEditor.js`) and
  `706119b` (`js/formatter.js`, plus unrelated name-deck changes).
- Working tree may include an uncommitted `js/main.js` helper-cluster cleanup.
  Assess it with `git status`, `git diff`, and recent commits before continuing.
- Do not touch `experiments/name-deck/*`.

## The sweep

File order, smallest/cleanest first to build rhythm:

1. `js/ingredientDisplay.js`
2. `js/typeahead.js`
3. `js/recipeEditor.session.js`
4. `js/recipeEditor.stepsEdit.js`
5. `js/ingredientRenderer.js` — inline lookups; some door methods exist already.
6. `js/recipeEditor.js`
7. `js/formatter.js`
8. `js/main.js` — biggest; lots of admin/shopping flows; several writes will
   need new door methods.

Within each file, do read replacements before writes. Reads are safe to swap
(callers already handle `null`). Writes often need a new method on the data
door first, in the shape of `ada12af`.

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
6. Tell the user the exact URL and clicks needed for manual verification.
   Do not use in-app browser automation unless the user explicitly asks.
7. Only after the user confirms, commit.

## Agent safety protocol

- Start every resumed chat with `git status` and recent commits.
- Do not use in-app browser automation unless the user explicitly asks.
- Do not leave long-running server/background jobs running. If a local server is
  needed, start it only when needed, give the user the plain URL, and stop it
  when done.
- Keep commits small and tied to one file or one tight cluster. This keeps the
  repo recoverable if Cursor loses the chat.
- Prefer manual user confirmation over agent-driven browser checks.

## Guardrails

- One file (or one tight cluster) per round. No multi-file sweeps.
- No commit before manual user confirmation. `node --check` and unit tests are
  not the bar.
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

`js/main.js`. First assess whether the helper-cluster cleanup around
`getVisibleTagNamePool`, `getVisibleIngredientTagNamePool`,
`getVisibleSizeNamePool`, and `getVisibleUnitCodePool` is still uncommitted.
If it is present, verify it with `node --check js/main.js`, ask the user to
manually open a recipe and confirm it loads normally, then commit only
`js/main.js`.

After that, continue `js/main.js` in tight clusters. Prefer read-only
replacement clusters before writes. Many remaining references are old SQLite
schema/maintenance helpers and shopping-plan flows; do not sweep them all at
once.

## Done-ness signal

The sweep is done when no UI file under `js/` contains `db.exec`, `db.run`,
`db.prepare`, or `window.dbInstance` references, AND each affected screen has
been manually verified by the user as it was swept. At that point update the
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
