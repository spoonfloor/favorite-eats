# Supabase Migration Plan

This document is the methodology contract for migrating from local SQLite to Supabase. The previous migration attempt (preserved on `migration-attempt-1`) failed because it was driven by ad hoc rewiring without contracts or parity tests. **This time, the methodology is the gate.** No migration code merges to `main` unless the rules below are satisfied.

---

## Hard Rules (non-negotiable)

1. **All data access goes through `js/data/`.**
   No direct `db.exec`, `db.run`, or `window.dbInstance` calls outside `js/data/`. UI files (`main.js`, `ingredientRenderer.js`, `recipeEditor.js`, etc.) import service methods only. Existing direct-DB code is allowed during migration but cannot grow.

2. **Every capability has a written contract before any adapter code.**
   The contract lives in `js/data/contracts/<capability>.md` (or `.ts` if/when types are introduced). It specifies: input shape, output shape, ordering rules, null/empty semantics, error behavior. The contract is what both adapters must match.

3. **Every capability has a parity test before cutover.**
   The parity harness runs the SQLite adapter and the Supabase adapter on the same fixture inputs and deep-diffs the JSON output. Mismatches block cutover unless explicitly whitelisted in the contract doc with a written reason.

4. **Migrate one capability at a time.**
   No PR migrates more than one capability. Reads before writes. Lower-risk capabilities before higher-risk ones (see order below).

5. **Each capability has a rollback flag.**
   `localStorage.favoriteEatsUseSupabase_<capability>` (or equivalent runtime check). Cutover flips the flag; rollback flips it back. No code-level changes required to roll back.

6. **No feature work in migration PRs.**
   Migration PRs only change *transport*, not behavior. Behavior changes go in separate PRs, before or after, never in the same one.

7. **Remote-only mode stays opt-in until all capabilities are green.**
   No defaulting users to Supabase-only paths during migration.

---

## Migration Order

Each step is independently shippable, with parity test passing, before the next is started.

### Phase 1: Reads (low risk)
1. `listRecipes` — recipes list page
2. `loadRecipeDetail` — recipe editor load path
3. Typeahead pools: `listIngredientNames`, `listIngredientVariants`, `listUnits`, `listSizes`
4. Recipe title lookup: `findRecipeByTitle`, `listRecipeTitles`

### Phase 2: Writes (higher risk)
5. `createRecipe`
6. `saveRecipeModel` (metadata + steps + ingredients)

### Phase 3: Cleanup
7. Delete SQLite adapter, bridge, `bridge.js`, `sql-wasm.js`, all `db.exec` callsites.
8. Delete migration flags.
9. Delete this doc (replaced by an architecture doc).

---

## Definition of Done — Per Capability

A capability is "done" when **all** of the following are true:

- [ ] Contract doc exists and has been read by a human.
- [ ] Both adapters (`sqliteAdapter`, `supabaseAdapter`) implement the contract.
- [ ] Parity harness passes for ≥10 representative fixtures, including edge cases listed in the contract.
- [ ] The gateway routes UI through the service, not directly to either adapter.
- [ ] No new direct DB calls were added in UI files for this capability.
- [ ] Cutover is gated by a feature flag, default off.
- [ ] Manual smoke test: app works end-to-end with flag off, and with flag on.
- [ ] Rollback test: flipping the flag back restores prior behavior with no console errors.

If any box is unchecked, the capability is not done.

---

## Rollback Policy

- Per-capability flags allow flipping individual features back to SQLite.
- If a flag must be flipped after release, that's not a failure — it's the system working as designed.
- Hard rollback (revert to SQLite-only main) is always possible while SQLite adapter and bridge code still exist (i.e. all of Phase 1 + 2).

---

## Out of Scope

The following are explicitly **not** part of this migration:

- Changing UX, copy, or behavior of any feature.
- Refactoring unrelated modules.
- Removing Electron support (separate decision, separate work).
- Schema changes to either SQLite or Supabase (schemas are frozen during migration).

If any of these come up mid-migration, they go in a separate PR or are deferred.

---

## Folder Layout

```
js/data/
  index.js              # gateway / service facade (only entrypoint UI uses)
  contracts/
    listRecipes.md
    loadRecipeDetail.md
    ...
  adapters/
    sqliteAdapter.js    # legacy oracle; deleted in Phase 3
    supabaseAdapter.js  # target
  fixtures/
    listRecipes.json
    loadRecipeDetail.json
    ...
  parity/
    runParity.mjs       # parity harness; CI gate
```

UI imports only from `js/data/index.js`. Contracts and adapters are not imported directly by UI.

---

## Anti-Patterns (things that caused the last failure)

The previous migration produced these symptoms; do not repeat them:

- Direct DB calls scattered across UI files, with subtly different shapes.
- Contracts implied but not written down, so each caller drifted.
- Adapter built before fixtures, so "works on my machine" was the only test.
- Remote-only enabled by default before parity was proven.
- Save path that hard-fails on missing catalog entries instead of degrading gracefully.
- Multiple concerns mixed into one PR (transport change + bug fix + behavior tweak).

If a future PR exhibits any of these, it gets bounced.

---

## Status

- **Current phase**: pre-work (this doc).
- **Next action**: write contract + fixture for `listRecipes`.
- **Migration code on `main`**: none. (Rolled back on 2026-04-28; previous attempt preserved on `origin/migration-attempt-1`.)
