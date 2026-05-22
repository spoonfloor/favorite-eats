# Multi-Device List Sync Architecture

> **Status:** Target architecture for Shopping List multi-device UX. Describes how the checklist *should* behave at runtime. The current implementation in `js/main.js` is mid-migration: checkbox and text edits use per-row RPCs; remove/restore and some refresh paths still use whole-document hydrate/save patterns that cause snap-back. See [Current gaps](#current-gaps-vs-target) and `docs/multi-device-roadmap.md` Phase 4.

Last updated: 2026-05-21.

## Goal

Favorite Eats needs a shopping checklist that:

- Feels instant on tap (check, remove, edit text, move placement).
- Stays consistent across two open browser sessions without manual reload.
- Survives plan regeneration (Catalog + Plan changes) without silently losing user tactical edits.
- Does **not** require a full offline CRDT sync engine for a 2-user hobby app.

The architecture below is **operation-based sync over a derived view model**, with Supabase Realtime used only as a “something changed — reconcile” signal.

## Related docs

| Doc | Role |
|-----|------|
| `docs/catalog-plan-list-supabase.md` | Schema ownership: what belongs in `plan.*` vs `list.*` |
| `docs/multi-device-roadmap.md` | Phased migration order (remote-first before Realtime polish) |
| `docs/agent-handoff-shopping-state.md` | Incident narrative: silent failures, triage checklist |
| `docs/multi-device-starter-message.md` | Evergreen agent prompt for Plan/List work |
| `/Users/erichenry/Desktop/baby-eats` | Reference POC for Realtime + sparse overrides |

---

## 1. Data layers (do not collapse these)

The product already has the right *data* split. Runtime bugs come from treating the checklist as one JSON document.

| Layer | Postgres home | Role | Multi-device rule |
|-------|---------------|------|-------------------|
| **Catalog** | `catalog.*` | Durable recipes, ingredients, stores, aisles | Reference data; changes invalidate derived list views |
| **Plan** | `plan.*` | User intent: selected recipes, servings, extra items, store prefs | Source of truth for *what* to shop |
| **List (generated)** | `list.generated_rows` | Rows computed from Catalog + Plan | **Rebuildable** — never treat as durable user state |
| **List (overrides)** | `list.row_overrides` | Check, remove, text edit, placement | Source of truth for *tactical* checklist intent |
| **List (manual rows)** | `list.manual_rows` | Session rows without `source_key` | Server/schema concern; no Shopping List “add line” UX |

**Core invariant:**

```
Catalog + Plan  →  generated list rows
generated rows + row overrides (+ manual_rows when present)  →  visible checklist
```

Editing the list must not mutate Plan semantics unless the UI explicitly performs a Plan edit.

**Product fact:** The Shopping List screen does not let users type and add brand-new free-text rows. Durable “extra” shopping intent belongs in `plan.selected_items`. See `.cursor/rules/shopping-list-no-adhoc-lines.mdc`.

---

## 2. View model: what the UI reads

The checklist UI should **never** read raw `load_shopping_state` output or localStorage as authority after boot.

Instead, maintain a **view model** updated by a single reconcile path:

```
displayRows = merge(generated_rows, row_overrides, pending_local_ops)
```

| Input | Source |
|-------|--------|
| `generated_rows` | Rebuilt from current Plan + Catalog (server or client) |
| `row_overrides` | Fetched from `list.row_overrides` (+ `list.manual_rows` when applicable) |
| `pending_local_ops` | In-memory ledger of unconfirmed user gestures |

The merge function should be deterministic and testable. `mergeShoppingListDocWithGenerated` in `js/main.js` is a prototype of this idea; the target is to centralize it behind a small module API rather than scattering logic across page handlers.

**Suggested view-model API (conceptual):**

- `getChecklistRows()` — what React/DOM render reads
- `applyOp(op)` — optimistic local apply + enqueue server write
- `reconcileRemote(overrides, generated?)` — merge server truth without clobbering pending ops
- `confirmOp(rowKey, serverRow)` / `failOp(rowKey, error)` — settle pending ledger

localStorage is **read cache + UI prefs only**, not authority. Matches the migration north star in `docs/multi-device-roadmap.md`.

---

## 3. User gestures are operations, not document saves

Each checklist gesture maps to one **small, idempotent write** keyed by stable row identity:

| Gesture | Durable meaning | Target write |
|---------|-----------------|--------------|
| Check / uncheck | `checked` | `set_shopping_list_row_checked(source_key, checked)` ✓ exists |
| Edit line text | `override_text`, `user_edited` | `set_shopping_list_row_text(source_key, text)` ✓ exists |
| Remove / restore | current pseudo-removed placement; target canonical `removed` flag | `set_shopping_list_row_removed` ✓ exists (interim pseudo-store semantics) |
| Move store/aisle | placement fields on override | **`set_shopping_list_row_placement` — not yet implemented** |
| Append manual row (server/RPC only) | `list.manual_rows` insert | `append_manual_shopping_list_row` ✓ exists |

**Anti-pattern to retire for interactive edits:**

`catalog.save_shopping_state({ shoppingListDoc })` with `DELETE` all `list.row_overrides` + re-insert entire doc.

That pattern:

- Triggers Realtime on the whole table for every gesture.
- Races with optimistic UI on the same device.
- Lets two devices toggling different rows interfere via full-document rewrite.

Keep `save_shopping_state` for **transactional bootstrap**, migration bridges, and bundled plan+list writes — not per-tap checklist UX.

---

## 4. Client runtime: optimistic-first + pending op ledger

This is the minimum “sync engine” for good UX without building CRDTs.

```
┌─────────────┐     tap      ┌──────────────────┐
│ Checklist   │ ───────────► │ Pending ops      │
│ UI          │              │ ledger           │
└──────▲──────┘              └────────┬─────────┘
       │                               │ apply immediately
       │                               ▼
       │                      ┌──────────────────┐
       └──────────────────────│ View model       │
                              └────────▲─────────┘
                                       │
                              ┌────────┴─────────┐
                              │ Reconcile / merge  │
                              └────────▲─────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
             generated_rows    row_overrides      Realtime ping
             (from plan)        (from Supabase)    (debounced refetch)
```

### Rules

1. **UI always reads the view model** — never a stale server blob mid-gesture.
2. **Every mutation applies optimistically first** — instant feedback.
3. **Every mutation enters a pending ledger** keyed by `source_key` (or manual row `id`).
4. **Remote fetch / Realtime may not clobber rows with pending ops** until the op confirms or fails.
5. **Realtime triggers reconcile**, not blind `persistShoppingListDoc(remoteDoc)`.

### Pending ledger entry (conceptual)

```js
{
  rowKey: 'milk',           // source_key or manual id
  op: 'set_removed',        // set_checked | set_text | set_removed | set_placement
  payload: { removed: true },
  clientSeq: 42,
  startedAt: 1716300000000,
  status: 'pending' | 'confirmed' | 'failed',
}
```

### Per-row reconcile

For each row:

```
displayRow = serverMergedRow
for (op of pendingOps[rowKey] where status === 'pending') {
  displayRow = apply(displayRow, op)
}
if (op confirmed && server matches intent) drop pending
if (op failed) revert row + toast
```

**Snap-back happens when rule 4 is violated:** server hydrate overwrites the view model while a pending remove/check/edit is in flight. Checkbox/text partially guard this via `shoppingListRowDataRpcInFlight` in `js/main.js`; remove/restore does not.

---

## 5. Server: sparse overrides + row versions

Postgres should store **deltas**, not rendered checklist documents.

### Tables (already exist)

- **`list.generated_rows`** — rebuildable text/placement from Plan. Safe to replace on regen.
- **`list.row_overrides`** — sparse user state per `source_key`:
  - `checked`
  - `removed` (canonical removal flag — see gap below)
  - `override_text`, `user_edited`
  - store/aisle/bucket/order placement
- **`list.conflicts`** — when generated source text changes under a user edit and auto-merge is unsafe.

### Canonical removal representation

**Target:** `list.row_overrides.removed = true` is the durable removal flag (per `docs/catalog-plan-list-supabase.md`).

**Current gap:** client uses `storeLabel = 'removed'` (pseudo-store) while `save_shopping_state` always inserts `removed = false`. Round-trip works only via `store_label = 'removed'`, which is fragile and diverges from schema docs.

Restore metadata (`restoreStoreLabel`, etc.) should either:

- live in dedicated override columns server-side, or
- be reconstructable from `list.generated_rows` + override row on load (`sourceStoreLabel` fallback already exists client-side).

### Row-level versioning (lightweight)

For a 2-user app, per-row `updated_at` on `list.row_overrides` is enough:

- RPC returns `{ row, updated_at }`.
- Optional `expected_updated_at` on write detects stale overwrites.
- Client pending ops win locally until RPC confirms.

No vector clocks or CRDTs required unless offline-first becomes a product requirement.

### Plan regeneration

When Plan changes:

1. Regenerate `list.generated_rows` (server-side job or client from fresh plan fetch).
2. Merge existing overrides by `source_key`.
3. Preserve `checked`, `removed`, `user_edited` overrides.
4. Surface `list.conflicts` when generated text changes under a user edit.

---

## 6. Realtime: notification only, not transport

Correct pattern (already stated in `docs/multi-device-roadmap.md`):

> Realtime is not a substitute for remote-first Plan/List state; it only tells an already-open device to refresh from Supabase.

```
postgres_changes on list.row_overrides (or list.*)
  → debounce coalesce (~320ms is fine)
  → fetch overrides (+ generated if plan may have changed)
  → reconcileRemote() respecting pending ledger
  → render if diff
```

**Wrong pattern (causes snap-back):**

```
Realtime event
  → load_shopping_state()
  → persistShoppingListDoc(remoteDoc, { skipRemoteSave: true })  // overwrites optimistic state
  → render
```

Confirmation of a user gesture comes from the **RPC response** (or awaited narrow save echo), not from Realtime.

Infra already in repo: `list.*` Realtime publication, `dataService.subscribeListChanges`, per-row checked/text RPCs. Reuse these; do not re-stack busy-window guards on local-first document saves (rolled back per roadmap note).

---

## 7. Conflict policy by field

Use **typed rules**, not one global last-write-wins:

| Field | Policy | Rationale |
|-------|--------|-----------|
| `checked` | Last-write-wins | Idempotent toggle; low conflict cost |
| `removed` | Last-write-wins on intent | Remove vs restore: latest gesture wins |
| `override_text` | Preserve if `user_edited` | User text is high-value; use `list.conflicts` when generated source changes |
| placement (store/aisle) | Last-write-wins, or preserve when `removed` | Removed rows stay in pseudo-section regardless of regen |
| Plan selections | Server authoritative | Triggers list regen + override merge |

Do **not** build a general offline sync engine until real multi-device usage proves it is needed (`docs/catalog-plan-list-supabase.md`).

---

## 8. Shopping List page lifecycle (target)

### Boot

1. Load Plan from Supabase.
2. Load or compute generated rows.
3. Load row overrides.
4. `reconcileRemote()` → initial view model.
5. Render checklist.
6. Subscribe Realtime (`subscribeListChanges`).

### Interaction

1. `applyOp()` — optimistic update + render.
2. Narrow RPC (or awaited single-purpose save).
3. On success: `confirmOp()`, reconcile echo if needed.
4. On failure: `failOp()`, revert row, toast.

### Remote change (other device or echo)

1. Debounced refetch of overrides.
2. `reconcileRemote()` — **pending ops win** for affected rows.
3. Render diff.

### Plan change (from any device)

1. Plan RPC completes.
2. Regenerate list base.
3. Merge overrides; surface conflicts.
4. Never silently drop checked / removed / edited rows.

---

## 9. What not to build (yet)

| Approach | Why skip for now |
|----------|------------------|
| Full local-first / CRDT offline sync | Overkill until offline shopping is a requirement |
| More debounce / busy-window guards on `main.js` | Fights half-migrated document model instead of replacing it |
| Whole-doc `save_shopping_state` per gesture | Realtime storms + cross-device wipe risk |
| Realtime as write confirmation | RPC response is the ack; Realtime is invalidation |

---

## 10. Current gaps vs target

Observed in `js/main.js` as of 2026-05:

| Area | Target | Current |
|------|--------|---------|
| Check / uncheck | Per-row RPC + in-flight guard | ✓ `setShoppingListRowChecked`, `beginShoppingListRowDataRpc` |
| Text edit | Per-row RPC + in-flight guard | ✓ `setShoppingListRowText` |
| Remove / restore | Per-row RPC + pending ledger | △ `setShoppingListRowRemoved` uses current pseudo-store semantics; canonical `removed` flag still pending |
| Restore all removed | Awaited save, no pre-hydrate | ✓ `restoreAllListRemovedRows` pattern is closer to target |
| Realtime refresh | Reconcile without clobbering pending | ✗ `runFavoriteEatsRemoteShoppingPlanRefresh` → full hydrate → merge |
| Removal in DB | `row_overrides.removed = true` | ✗ Client pseudo-store; SQL saves `removed = false` |
| List-only save vs hydrate | Block hydrate during list writes | ✗ `shoppingPlanRemoteSaveInFlight` only covers plan touches |
| View model module | Single reconcile entry point | ✗ Logic spread across `loadShoppingListPage`, hydrate, merge |

**Remove snap-back sequence (simplified):**

1. User removes item → optimistic `storeLabel = 'removed'`, render OK.
2. Async path calls `hydrateShoppingStateFromDataService` **before** save completes → server still has old placement.
3. Realtime fires (from any `list.row_overrides` write) → debounced hydrate → UI refresh hook merges stale server doc → **snap-back visible**.
4. Save eventually completes; may or may not self-heal before next race.

**Shortest fix direction:** align single-row remove/restore with `restoreAllListRemovedRows` (optimistic → `awaitPersistShoppingStateToDataService` → echo). **Better fix:** add `set_shopping_list_row_removed` RPC and generalize pending-op guard beyond checkbox RPCs.

---

## 11. Rollout (architecture phases)

Aligned with `docs/multi-device-roadmap.md` Phase 4–5, reframed as structure not patches:

1. **View model contract** — document op types, reconcile pseudocode, conflict rules (this doc + optional thin `js/listViewModel.js` module).
2. **Per-row RPCs for all gestures** — removed ✗, placement ✗.
3. **Pending op ledger** — generalize `shoppingListRowDataRpcInFlight` to row-keyed pending state.
4. **Realtime handler rewrite** — reconcile, never blind authoritative overwrite.
5. **Retire interactive whole-doc list saves** — `save_shopping_state` for bootstrap/migration only.
6. **Canonical server `removed` flag** — align SQL + load + client display.
7. **Verification matrix** — two-session tests per gesture (roadmap matrix).

---

## 12. Verification matrix (per gesture)

For each migrated list operation:

- [ ] Save on device A → reload A → state persists.
- [ ] Save on device A → open/reload B → same state.
- [ ] Save on A while B is open → B updates without reload, **no snap-back**.
- [ ] Rapid taps on A (check/remove/check) → UI never reverts to stale state.
- [ ] Plan change on A → B list regen preserves valid overrides and conflicts.
- [ ] List edit on A → Plan on B unchanged.

Network evidence for debugging: confirm `load_shopping_state` does not apply over in-flight row RPCs; confirm remove does not hydrate before save ack. See `docs/agent-handoff-shopping-state.md` triage checklist.

---

## 13. Code landmarks

| Symbol / file | Role |
|---------------|------|
| `mergeShoppingListDocWithGenerated` | Merge generated + stored overrides |
| `applyShoppingListRowListRemove` / `Restore` | Client removal via pseudo-store |
| `hydrateShoppingStateFromDataService` | Full plan+list fetch; must not clobber pending ops |
| `beginShoppingListRowDataRpc` / `shoppingListRowDataRpcInFlight` | Partial in-flight guard (checkbox/text) |
| `scheduleFavoriteEatsRemoteShoppingPlanHydrate` | Realtime → debounced hydrate |
| `updateRow` in `loadShoppingListPage` | Interactive row mutations |
| `set_shopping_list_row_checked` / `_text` RPCs | Target pattern for all row ops |
| `catalog.save_shopping_state` | Full doc; bootstrap/migration only for list UX |

---

## Summary

**Guaranteed good multi-device checklist UX requires:**

> Derived generated rows + sparse durable overrides + optimistic pending ops + per-row RPCs + Realtime-triggered reconcile.

That is sync-engine *thinking* without a CRDT product. The schema and docs already describe this system; the remaining work is making the browser runtime match it — one gesture at a time, verified on two sessions, without stacking guards on the old document-save model.
