# Shopping state — agent handoff & personal record

Last updated: 2026-05-22.

This is a short narrative companion to `.cursor/rules/shopping-state-known-fragility.mdc`. The rule is the actionable checklist; this file is the *why*.

**For current Shopping List multi-device work, start with `docs/agent-handoff-shopping-list-path3.md`** (Path 3 finish gate, verified 2026-05-22, v1 checklist).

## The story (May 14, 2026)

Three bugs were tangled and kept hiding each other.

**Bug 1 — Servings vanish after refresh.** Real. On the Recipes page in planning mode, bumping servings for a planned recipe (e.g. burgers → 5) was lost after a hard refresh, with no error toast. Multiple agents made plausible guesses (timing, queue stripping, roots vs merged mirroring) and each one shipped a sensible-looking change. The repro kept failing. None of them watched the actual data on the wire or in the DB; they were guessing at the wrong layer.

**Bug 2 — A typo nobody noticed.** Somewhere in one of those rounds, `listShoppingPlanRecipeItems.walkRecipe` in `js/data/adapters/supabaseAdapter.js` ended up referencing a bare `recipeId` that wasn't in scope. The Shopping page crashed on boot every time. The user didn't see it as a crash because the affected pane just looked empty-ish.

**Bug 3 — An invisible cache.** `loadRecipeDetail` in the same adapter has an in-memory LRU. When the editor first opens a recipe, the empty-ingredients version is cached. After save, the post-write `loadRecipeDetail` got a **cache hit** and returned the pre-save copy. Hard refresh wiped the cache, hence "row appears after refresh."

## What broke the logjam

The bug 2 stack trace. A single concrete piece of evidence — `recipeId is not defined at walkRecipe (supabaseAdapter.js:5755:9)` — got us from "mystery" to "one-line fix" in under a minute. Fixing bug 2 unblocked the Shopping page boot, and the bug 1 repro suddenly passed: at least one of the earlier servings fixes had already worked but bug 2 was masking the result. The user reported bug 3 next, with another concrete repro, and that one fell in a minute.

**The hours of pain came from rounds where no one had evidence and everyone was guessing.**

## The fixes that shipped

- `19387c9` — `fix(recipes): await shopping hydrate and guard plan saves from stale reload`. Recipes-page hydrate is awaited before UI wiring; `shoppingPlanRemoteSaveInFlight` blocks hydrate apply while a plan RPC is outstanding; queued plan saves bump `shoppingStateRemoteApplyGeneration`.
- `b3414aa` — `fix(supabase): invalidate recipe detail cache after save; fix walkRecipe scope`. `saveRecipe` now calls `invalidateRecipeDetailCache(payload.id)` between the RPC and the read-back. Inner `walkRecipe` in `listShoppingPlanRecipeItems` uses `normalizedRecipeId` instead of bare `recipeId`.

Plus earlier non-committed iterations in `js/main.js` that landed before these commits: `normalizeShoppingPlan` keeps `servingsOverride` when ring rounding flakes; queued/awaited saves force `useSupabase = true`; recipe editor explicitly rerenders ingredients after save.

## What today's fixes do NOT cover

These are real silent paths we did not close. Listed so the next incident gets diagnosed faster:

- **Hung fetch.** A `saveShoppingState` that hangs produces no rejection and no toast. The write feels like it succeeded.
- **Succeed-with-wrong-body.** The RPC returns 200 but the response doesn't reflect the intended write. No alarm.
- **Realtime debounce during edits.** A second hydrate triggered by Realtime can re-enter the suppressed window while the user is mid-edit.
- **Cache invalidation outside `saveRecipe`.** `recipeDetailResolvedCache` is only invalidated by `saveRecipe`. Any future write that affects a cached recipe (e.g. ingredient variant rename, linked-recipe save affecting a parent's `:s` view) can return stale data.
- **The other `walkRecipe`.** A second copy exists later in `supabaseAdapter.js` with `recipeId` as a local `const`. Different naming convention; easy to confuse during refactors.

## Scope context

This is a 2-user hobby app with a single engineer. Don't propose smoke tests, observability infrastructure, type-system migrations, or refactors of `main.js` / `supabaseAdapter.js` unless explicitly asked. The right loop here is: user reports concrete symptom → agent gets evidence → agent fixes narrowly → ship.

The cursor rule next to this file is the actionable artifact. This doc exists so the next agent (or future me) understands *why* the rule says what it says.
