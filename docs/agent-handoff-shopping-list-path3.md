# Agent handoff — Shopping List sync (Path 3)

Last updated: 2026-05-22.

**Start here** for Shopping List multi-device work. Companion: `docs/multi-device-list-sync-architecture.md` (target), `docs/agent-handoff-shopping-state.md` (triage narrative).

Prod: `https://spoonfloor.github.io/recipe-editor` → Supabase Favorite Eats (`ysesmbcvxmaymtsqeipc`).

Devices verified: iPhone Safari + Mac Chrome.

---

## Decision: Path 3

User chose: **finish current v1 migration → evaluate → maybe v2 later.**

| Phase | Meaning |
|-------|---------|
| **Finish** | Bounded v1 items below, then **STOP** |
| **Evaluate** | Spam-tap UX, annoyance, opportunity cost → charter v2 or ship |
| **v2** | Local-first op sync — **evaluation/charter only** until user explicitly says go |

**Do not** add v1 hydrate/guard/debounce patches unless **production-breaking**.

**Do not** treat architecture docs as the deliverable for a “reset” request — ship code on the agreed path or charter v2 first.

Before coding, ask: **“Is this v1 finish or v2 charter?”**

---

## Verified working (2026-05-22)

HAR captures: `~/Desktop/har/` (`a1`, `a2`, `b1`, `b2`).

| Test | Result |
|------|--------|
| A1 checkbox iPhone → Mac | Pass |
| A2 checkbox Mac → iPhone (5 taps, 1 no-op) | Pass w/ caveats — 4 RPCs not 5; no-op = pending-op guard or re-render during `renderChecklist` |
| B1 remove | Pass |
| B2 restore | Pass |
| C idle | Pass — no `save_shopping_state` storm |

Healthy network pattern: `set_shopping_list_row_*` → Realtime → `get_shopping_revisions` → `load_shopping_state`. Zero interactive full-doc saves on tap.

### Already shipped

- Hydrate single-flight: `shoppingStateHydrationPromise` cleared in `.finally()` (`js/main.js`)
- Per-row RPCs: `set_shopping_list_row_checked`, `_text`, `_removed`
- Save storm fix: list-only save migration (prior: `503f1ed`)
- Prod migration applied: `set_shopping_list_row_removed`

---

## v1 FINISH checklist (do these, then stop)

1. **Placement RPC** — `set_shopping_list_row_placement` (not implemented)
2. **Canonical `removed`** — replace pseudo `store_label = 'removed'` with `list.row_overrides.removed = true` end-to-end
3. **Realtime resubscribe** — `shoppingListPage.js` `pagehide` tears down subs; re-subscribe when returning to Shopping List without full reload
4. **Plan Realtime flicker** — `registerFavoriteEatsRemotePlanUiRefreshHook` regens baseline on plan events; isolate list-only refresh where possible
5. **Two-device verify** for 1–4 (same bar as A/B/C above)

Estimate: ~2–3 focused sessions.

---

## Explicitly OUT OF SCOPE for v1 finish

- Spam-tap perfection / dead-click elimination (needs coalesce or v2)
- Ingredient lookup churn on list refresh (~17 queries per hydrate in stress HAR)
- local-first / op-log rebuild (v2 evaluation)

**v1 finish will not deliver** “check/uncheck as fast as humanly possible with zero dead clicks.” That requires v2.

---

## v2 evaluation criteria (after v1 finish)

Charter v2 if **any** true:

- User still annoyed by dead clicks during normal/fast use
- Multi-device lag feels broken (> ~500ms perceived)
- More sync whack-a-mole on v1 patterns

**v2 target:** local-first store (IndexedDB) + op queue + coalesce + row-level Realtime patches. See `docs/multi-device-list-sync-architecture.md`.

**Red flags for fake rewrite:** still blocking UI, still full hydrate on tap, milestone 1 is “fix bug”, nothing deleted.

---

## Code landmarks

| File | Role |
|------|------|
| `js/main.js` | hydrate, Realtime debounce (320ms), list vs plan refresh, subs teardown |
| `js/screens/shoppingListPage.js` | gestures, RPC flush, `updateRow`, pagehide teardown |
| `js/favoriteEatsStore.js` | pending ops, `PENDING_ROW_OP_TAIL_MS = 400`, merge on hydrate |
| `js/data/adapters/supabaseAdapter.js` | row + bulk RPCs |

---

## Focused tests

```bash
node tests/runShoppingHydrateSingleFlightTests.js
node tests/runFavoriteEatsStoreTests.js
node tests/runShoppingListRowRemovedRpcMigrationTests.js
node tests/runShoppingListBulkRpcMigrationTests.js
node tests/runShoppingStateNarrowWritesMigrationTests.js
node tests/runShoppingStateSaveGuardTests.js
```

Triage before guessing: `.cursor/rules/shopping-state-known-fragility.mdc`
