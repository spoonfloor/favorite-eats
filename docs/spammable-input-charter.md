# Spammable Input Charter

Status: active. Supersedes:

- `docs/plan-list-input-sync-roadmap-ARCHIVED.md`
- `docs/plan-list-input-sync-plain-english-ARCHIVED.md`

If guidance in this doc and any other doc disagree, this doc wins.

---

## Part 1: Plain English (for the human)

### Summary

When someone clicks fast, the app should trust the screen first and let the server catch up.

- Local wins while editing: Don’t let server updates snap the button/value back while the user is still interacting.
- Track each value separately: For every quantity/serving/etc., remember the latest local value, what’s still saving, and the newest server version accepted.
- Protect against big refreshes: If a full server reload comes in, it must not overwrite newer local clicks.
- Watch related updates: A small save can trigger a bigger server event. For migrated controls, that parent event is absorbed; it is not a reason to reload the whole state.
- Keep code split cleanly: One path updates the UI immediately; another path saves to the server.
  Bottom line: every click should show instantly, save reliably, and not get undone by stale server data.

### The non-negotiable

- Items and Recipes steppers, and Shopping List checkboxes, must be **truly spammable**.
- A user must be able to tap as fast as humanly possible with:
  - no missed taps,
  - no snapback to an older value,
  - no manual refresh required,
  - no full screen rebuild per peer tap.
- **Zero degradation** of current baseline UX anywhere else in the app.
- All canonical zero/empty behaviors stay intact. Only deprecated UI like the active `- 0 +` stepper is gone.

### Why the previous attempt did not deliver

The old plan said "trade tiny change notes" but in practice the code still **trades whole-state photos** with Supabase for every input.

A stale photo can land mid-spam and paste over the user's in-progress writing. Examples that happened:

- Spam plus to 8, click minus, value jumps to 1.
- Spam checkbox toggles, last tap snaps back.

Every fix so far has been an extra guard or time window around the photo. That is the rut.

### The mental model

Local UI is yours. It is the source of truth while you are touching it.

Server is a recorder of changes, not a broadcaster of snapshots.

```text
tap → local UI updates now → send one tiny change → server confirms
peer tap → other device receives one tiny change → patches that one cell
```

Never:

```text
tap → save whole-plan snapshot → server echoes whole snapshot → paste over local UI
```

### What "done" really requires

For every spammable control:

1. Local state updates synchronously on every tap.
2. The flush sends **one op** to a narrow per-row/per-field server contract. It does **not** re-run the local apply, and it does **not** trigger a whole-plan or whole-list save.
3. Narrow RPCs return per-row `updated_at`. The client records the latest `updated_at` it has accepted for each key.
4. Server echoes and peer updates apply as **field patches**, not full snapshots.
5. Echoes and refreshes **never** overwrite keys that have a pending local op, and **never** apply a payload whose `updated_at` is older than what the client has already accepted for that key.
6. Old guards, time windows, and snapshot-save fallbacks for that control are **deleted**.

### The rules we never break

- Routine input never causes a whole-plan or whole-list snapshot save.
- Echo or peer realtime never replaces a key while a local op for that key is pending or in-flight.
- Echo or peer realtime never applies a payload older than the last accepted server `updated_at` for that key.
- A successful narrow RPC that also bumps a parent/revision row (e.g. `plan.documents.updated_at`) must not, via that companion Realtime event, cause a wholesale snapshot read on the routine spammable path. Absorb/log the parent event. Wholesale belongs to boot, recovery, or explicit hostile probes.
- A wholesale snapshot is never persisted to the canonical local container without first running per-key staleness protection for every migrated entity collection in it.
- "Recent op" time windows are not allowed as primary correctness.
- Pending-op input blocking is not allowed as primary correctness.
- A control is either fully on the new pipeline or fully on the old. No mixed pipelines.

### How `clientSeq` is used (and not used)

`clientSeq` is a **local, in-memory** monotonic counter inside the op queue. It exists so the queue can coalesce and order ops on this device. It is **not** persisted server-side and **not** round-tripped through Realtime.

Cross-device ordering is handled by per-row server `updated_at`, not by `clientSeq`. Anywhere the charter says "newer local intent," the operational check is:

```text
skip echo / refresh for key K if:
  queue.hasPending(K) OR queue.hasInFlight(K)
  OR payload.updated_at <= local.lastAppliedServerUpdatedAt[K]
  OR payload.value === local.value[K]   // no-op patch
```

### Reference proof: Sync Lab

`syncLab.html` is the reference implementation for this charter. It is intentionally a clean top-level page, backed by real Supabase tables in `sync_lab.*`, and it reuses the app's real stepper / checkbox interaction shapes without product table baggage.

It proves the architecture that product controls must copy:

- Local apply is immediate and owns the visible value.
- Flush is a narrow RPC only.
- The child row Realtime event is the content path.
- The parent companion Realtime event is logged and absorbed by default. It must not trigger a wholesale read on the spammable path.
- Wholesale snapshots exist only for boot/reset/recovery or explicit hostile-probe tests.
- Per-key state tracks pending local intent, in-flight local intent, last accepted server `updated_at`, and current local value.

The two-window incognito test passed with this setup. Treat Sync Lab as the standard, not as a toy. If a product migration needs a "small guard" that Sync Lab does not need, assume the product implementation is still carrying hybrid architecture until proven otherwise.

**Prototype contract.** Sync Lab remains the active proving ground until either:

- all meaningful input-sync layers have been added there and the UX remains constant, or
- Sync Lab becomes inefficient or otherwise problematic as the development surface.

There is no other reason to leave the prototype. Product controls are port targets, not the default place to discover architecture. Keep adding real complexity to Sync Lab first when it can still represent the layer honestly.

**Instrumentation contract.** Every Sync Lab layer must keep the evidence surface current:

- Console/on-page logs must prove the intended path, not just smooth UX.
- Tests must assert the architecture shape for the slice.
- The expected good logs and red-flag logs must be clear before the layer is judged green.

**Current Sync Lab evidence.** The prototype has now proven these layers with on-page/console logs and `tests/runSyncLabArchitectureTests.js` coverage:

- Stale child row events are skipped during both pending and in-flight local intent.
- Peer conflict replay follows server `updated_at`: newer peer patches apply, older conflict replays skip.
- Hostile wholesale snapshots are routed through protected merge and skip stale rows for every Sync Lab control.
- Snapshot-pre-insert / missing-row wholesale omissions preserve known local rows instead of normalizing them to defaults.
- Explicit recovery after a simulated child Realtime gap runs only through protected hydrate.
- Stepper and checkbox concurrency remains per-key; overlapping pending/in-flight state does not create a global gate.
- Same-control multi-row isolation is proven with two steppers and two checkboxes (`stepper`, `stepper2`, `checkbox`, `checkbox2`). Passive tabs receive child-row patches for all four controls, same-device echoes skip, stale peer replays skip, and parent companion events are absorbed.
- Durable reload replay runs before boot hydrate, so a pending local op survives reload and stale boot data is skipped.
- Setup, network, and RPC failures are classified visibly, with retryable failures bounded by a max-attempt cap.
- Remote Supabase contract was retested after the keyed RPC migration: all four Sync Lab rows exist, the two-argument write RPCs accept `p_control_key`, active-tab writes ack, and passive-tab Realtime applies peer values for both control types.

**Sync Lab-only closeout.** The remaining work is no longer to discover new Sync Lab layers by default. Keep the lab green as the reference proof, but the next engineering work should be product-port preparation unless a product migration uncovers a requirement Sync Lab cannot yet represent honestly.

### Fail-fast layering

Proceed one layer at a time. Do not add the next layer until the current one passes under rapid interaction.

1. Local-only control feel.
2. Narrow RPC ack returning row `updated_at`.
3. Same-device child Realtime echo skipped as no-op.
4. Two-device peer child row patch.
5. Stale / out-of-order child events rejected by per-key `updated_at`.
6. Parent companion event absorbed without wholesale.
7. Explicit hostile wholesale snapshot probe protected by per-key merge.
8. Stale child events during pending/in-flight local intent rejected by per-key local intent state.
9. Peer conflict / last-write-wins behavior follows server `updated_at`, not local `clientSeq`.
10. Realtime-off / explicit recovery path uses protected wholesale only when intentionally invoked.
11. Multi-control concurrency stays per-key; one control's pending/in-flight state does not block or corrupt another.
12. Pagehide/reload durable replay.
13. Failure classification for RPC/setup/network failures is visible and does not degrade into silent snapback or endless retry.

When a layer fails, stop and classify it:

- **Architecture disproven:** the endorsed model cannot meet the required condition. Stop and rethink; do not patch around it.
- **Implementation defect:** the failure is local, explainable, and the fix makes the implementation more like Sync Lab.
- **Requirement discovered:** update this charter, implement the missing requirement cleanly, and retest the same layer before moving on.

Do not treat debouncing, throttling, time windows, "busy" locks, or global pending gates as correctness fixes. They may be test instrumentation or performance hygiene only after the clean path is correct.

---

## Part 2: Precise contracts (for agents)

### A. Single source of truth per surface

- Plan surface: one local container (the plan model) is canonical for input. Items/Recipes UI reads only from it.
- List surface: one local container (the list doc) is canonical for input. Shopping List UI reads only from it.
- Parallel maps that mirror the canonical model for input (e.g. `shoppingQuantities`) must either be removed or be a strict derivation refreshed only when the canonical model changes due to local apply.

### B. Op shape

```ts
{
  surface: 'plan' | 'list',
  entityKey: string,           // stable key for the row/item/recipe
  field: 'checked' | 'quantity' | 'servingsOverride' | 'removed' | 'placement' | 'text',
  value: unknown,              // final desired value
  clientSeq: number,           // LOCAL-only, monotonic per surface; not persisted, not echoed
  createdAt: number
}
```

Coalescing rule: latest op per `(surface, entityKey, field)` wins. Earlier pending ops for the same key are dropped.

`clientSeq` is intentionally local-only. It is not a server column, not a parameter on any narrow RPC, and not a field in any Realtime payload. Anything that needs to compare server vs local must compare server `updated_at`, not `clientSeq`.

### B′. Per-key local versioning

The op queue (or a thin adjunct module) maintains per-key state:

```ts
{
  pendingOp:    Op | null,
  inFlightOp:  Op | null,
  lastAppliedServerUpdatedAt: string | null,   // ISO timestamp from narrow RPC ack or accepted echo
  lastLocalValue:             unknown,         // currently rendered value
}
```

Update rules:

- On `enqueue(op)`: set `pendingOp = op`, `lastLocalValue = op.value`. Do **not** touch `lastAppliedServerUpdatedAt`.
- On flush start: move the flushed op from `pendingOp` to `inFlightOp`; it still counts as local intent for the skip rule until ack/failure resolves.
- On RPC ack (`{ ok: true, updated_at }`): clear the matching `inFlightOp` and set `lastAppliedServerUpdatedAt = updated_at`. If a newer `pendingOp` exists, leave it pending and flush it next.
- On accepted echo: set `lastAppliedServerUpdatedAt = payload.updated_at`, `lastLocalValue = payload.value`.
- On rejected echo: leave all per-key state unchanged.

### B′.1 Queue lifetime

The input queue for a migrated `(surface, field)` must live at **module scope**, not inside a per-page IIFE. Per-key state (`pendingOp`, `lastAppliedServerUpdatedAt`, `lastLocalValue`) must survive page navigation within the SPA.

The durable `pagehide` ring (section H) restores pending ops but does **not** restore `lastAppliedServerUpdatedAt` or `lastLocalValue`. A queue that is re-created on every page mount loses the version state needed by the skip rule (sections F/G), so the first echo for a freshly-mounted page has nothing to compare against and may apply a stale value.

Implementation pattern: the queue is created lazily once per session (see `getFavoriteEatsPlanRecipeServingsQueue` in `js/main.js`) and exposed on `window` for page modules to reach.

### C. Local apply contract

`onLocalApply(op)` must:

- Write the canonical local container for `op.surface`.
- Update only the affected DOM/control.
- Record `clientSeq` and `lastLocalValue` for that key.

`onLocalApply(op)` must **not**:

- Call `setShoppingPlanItemSelection`, `updateShoppingPlan`, `persistShoppingPlan`, `persistShoppingListDoc`, or any whole-document writer.
- Touch `localStorage` or `sessionStorage` mirrors of the whole plan/list (durable per-key pending-op storage in section H is a separate, narrow concern).
- Trigger any remote save.

**Structural enforcement.** The local-apply function and the flush function must be **separate named functions**, not one function with an `options.skipRemoteSave` / `options.forceRemoteSave` switch. Compliance must be visible at the call site, not dependent on remembering to pass the right flag.

For each migrated control, the codebase must end up with shapes like:

- `applyLocalPlanItemQuantity(key, value, meta)` — writes the local plan container, never saves.
- `sendPlanItemQuantityRpc(key, value)` — narrow RPC only, never writes the local container.

A control is **not** migrated if the same function still performs both jobs gated by a flag.

### D. Flush contract

`flushOp(op)` must:

- Send a **narrow op** to a per-row/per-field server contract.
- Resolve only when the server has acknowledged or definitively failed.
- On `{ ok: true, updated_at }`, update per-key `lastAppliedServerUpdatedAt` (per section B′).

`flushOp(op)` must **not**:

- Re-run `onLocalApply`.
- Write the canonical local container.
- Call `persistShoppingPlan`, `save_shopping_plan`, `save_shopping_state`, or any whole-document path.
- Use `forceRemoteSave` or any equivalent option.

### E. Server contracts

Required narrow RPCs (one per migrated field). Add or extend as needed:

- `set_shopping_list_row_checked` — checkbox. Must return `{ ok, updated_at }` for the touched row.
- `set_plan_item_quantity` — Items stepper. Must return `{ ok, updated_at }` for the touched row.
- `set_plan_recipe_servings_override` — Recipes servings. Must return `{ ok, updated_at }` for the touched row.
- `set_sync_lab_stepper_value` / `set_sync_lab_checkbox_checked` — reference proof RPCs for `syncLab.html`.
- Future field migrations follow the same shape: one RPC per `(surface, field)`.

Each narrow RPC must:

- Apply exactly the requested change.
- Be safe to call repeatedly with the same final value.
- Return `{ ok: true, updated_at: <iso timestamp for the touched row> }` on success, or `{ ok: false, reason: <string> }` on definitive failure.
- Never return a full plan or full list snapshot in the success payload.
- Touch the parent session's `updated_at` (or equivalent) so Realtime fires.

Realtime payload requirements for migrated fields:

- The payload must carry the row's new `updated_at` (Supabase `postgres_changes` already does this when the touched table is in the realtime publication).
- No other Realtime path may stand in for these narrow updates. If a narrow RPC fires, the only realtime event the client expects for that key is the row-level patch.

### E.1 Wholesale snapshot contract

The wholesale snapshot RPC (`catalog.load_shopping_state` or equivalent) is allowed to exist for boot, recovery, and fallback paths. It must:

- Return per-row `updatedAt` for every migrated entity collection (e.g. `itemSelections[*].updatedAt`, `recipeSelections[*].updatedAt`). Without this, the per-key staleness check in section G.1 cannot run against snapshot rows and the wholesale path silently degrades to last-writer-wins.
- Be additive when extending — never remove or rename existing keys consumed by the client.

If a snapshot is captured between a narrow RPC's commit at the database and the client's record of that RPC's ack, the snapshot may legitimately _omit_ the just-acked row (the SELECT happened pre-INSERT) or carry an _older_ `updatedAt` for it. The client handles both cases at the merge step (section G.1), not the server.

### F. Echo and peer update contract

For every realtime/echo payload:

1. Compute the keys touched and the payload `updated_at` for each.
2. For each key K, evaluate the **skip rule**:
   - Skip K if `queue.hasPending(K)` or `queue.hasInFlight(K)` is true.
   - Skip K if `payload.updated_at <= local.lastAppliedServerUpdatedAt[K]` (stale or already-applied echo, including your own RPC's fanout).
   - Skip K if `payload.value === local.lastLocalValue[K]` (no-op patch; no DOM work needed).
3. For keys that survive the skip rule, apply the change as a **field patch** to the canonical local container and the mounted DOM, then set `local.lastAppliedServerUpdatedAt[K] = payload.updated_at` and `local.lastLocalValue[K] = payload.value`.

Note on same-device echoes: a successful narrow RPC's own Realtime fanout will, by construction, carry `updated_at` equal to the value the client already accepted via the RPC ack. Step 2's `<=` check correctly drops it without needing a "did this echo originate here" flag.

Forbidden:

- Replacing the canonical container wholesale on echo.
- Calling `hydrateShoppingSelectionsFromPlan` (or equivalent) on echo for migrated keys.
- Rebuilding the list/items DOM on a peer field update that has a viable patch path.
- Comparing payload version to `clientSeq` (it is not a server-side concept).

### F.1 Companion-table Realtime events

A successful narrow RPC typically touches **two** rows server-side: the row-table row for the migrated field, and a parent/revision row for cache invalidation (section E requires this — "Touch the parent session's `updated_at`"). In this codebase, every `catalog.set_plan_item_quantity` / `catalog.set_plan_recipe_servings_override` call also bumps `plan.documents.updated_at`.

The plan Realtime subscription (`subscribePlanChanges`) listens to **both** tables. So every commit produces at least two `postgres_changes` events:

1. The row-table event for the migrated field (e.g. `plan.selected_items`). A per-row patch hook handles this and returns `true` to suppress the wholesale fallback.
2. The companion-table event (e.g. `plan.documents`). It carries no row-level field content for the migrated key. A naive patch hook returning `false` would fire the wholesale `load_shopping_state` fallback; that is the anti-pattern Sync Lab disproved.

Handling:

- The patch hook system must inspect the payload's table. For a companion-table event whose only purpose is revision bumping (no migrated-field row content), the hook must return `true` / mark handled. The event is logged/absorbed. The per-row child event is the content path.
- Companion-table events must **not** trigger wholesale reads on the routine spammable path. Debouncing or single-flighting those wholesale reads is not a correctness fix; it is a sign the wrong path is running.
- Wholesale triggered by companion events is allowed only in an explicit hostile-probe / recovery path, and that path must run section G.1's per-key protection.

### G. Refresh hook contract

Plan/list refresh hooks must:

- For each migrated key, apply the same skip rule as section F (pending op, stale `updated_at`, or equal value).
- Apply the surviving keys as field patches; do not replace the canonical container wholesale unless this is an explicit boot/recovery refresh (section H).
- Never block input.
- Never rebuild the whole list/items UI in response to a routine peer field change.

Forbidden:

- Time-window-based "recent op" ledgers (e.g. 3000 ms decay) as primary protection.
- Skipping refresh entirely while a control is "busy."
- Using `hasPendingRowOps()` (any-pending-anywhere) as a global gate on the refresh; the skip rule is **per-key**, not global.

### G.1 Wholesale fallback rules

When a wholesale snapshot does land (boot, recovery, or a fallback the per-row patch hooks couldn't avoid), the path must be:

1. **Merge before persist.** Run a per-key staleness merge on the snapshot **before** writing it to the canonical local container. Persisting first and "fixing it up later" is not allowed — anything that reads the cache between persist and fix-up sees the wrong value.

2. **Per-key staleness check for every migrated collection.** For each entry in each migrated collection (`itemSelections`, `recipeSelections`, …):
   - If the queue has `lastAppliedServerUpdatedAt[K] != null` and `payload.updatedAt[K] <= lastAppliedServerUpdatedAt[K]` → replace the snapshot entry with the current local cache entry.
   - If the snapshot entry has no `updatedAt` and its value differs from `lastLocalValue[K]` → replace with the local cache entry (conservative fallback).
   - Otherwise → accept the snapshot entry.

3. **Splice-back for snapshot-pre-INSERT rows.** A row present in the local cache but **absent** from the snapshot, where the queue has `lastAppliedServerUpdatedAt[K] != null` or `hasLocalValue[K] === true`, is preserved by splicing the local entry into the merged map. This handles the case where the snapshot was captured between the narrow RPC's ack and the client's record of it (server SELECT happened before INSERT committed) — a pure `updated_at` comparison cannot tell "really deleted" from "captured pre-INSERT," so the local op state breaks the tie.

4. **Seed after accept.** After persisting the merged plan, call the per-key seed helper for every collection: for each accepted snapshot entry with a valid `updatedAt`, record `(value, updated_at)` into the queue's per-key state (no-op if the queue already holds a strictly-newer `lastAppliedServerUpdatedAt`). This ensures the next echo for that key has something to compare against, especially on cold-boot hydrate where the queue starts empty.

5. **Never block input.** The merge, persist, and seed run synchronously after the snapshot fetch resolves; they do not gate user input.

Reference implementations: `mergeRemotePlanForPerKeyStaleness` and `seedShoppingPlanRecipeServingsQueueFromRemotePlan` / `seedShoppingPlanItemsQuantityQueueFromRemotePlan` in `js/main.js`. New migrated collections add a parallel branch in the same helpers.

### H. Lifecycle

- On `pagehide`: flush all pending ops; do not block navigation. Because Promise-based flushes are not reliable during page teardown (especially on mobile Safari), pending ops **must be durable**:
  - Mirror every enqueued op into a small `localStorage` ring keyed by `(surface, entityKey, field)`. Overwrite on coalesce. Delete on RPC ack.
  - On `pagehide`, in addition to the in-memory `flushAll()`, drain the ring via `navigator.sendBeacon` (or a synchronous narrow-RPC equivalent) when available.
  - On next boot, replay any leftover entries in the ring through the normal narrow-RPC path before the first `onLocalApply` is allowed to run for the affected keys.
- On resume / `pageshow`: re-establish realtime; never overwrite local pending state with a delayed hydrate. The same per-key skip rule applies to the resume hydrate.
- On boot / cold start: full hydrate is allowed and expected. After hydrate, seed `local.lastAppliedServerUpdatedAt[K]` from the hydrated rows so the next echo can be compared.
- On explicit user recovery or structural regeneration: full hydrate allowed. These are the only paths that may legitimately replace the canonical container wholesale.

---

### I. Forbidden code paths (delete or stop using during input)

These must not be on the routine input path for any migrated control:

- `save_shopping_plan` / `save_shopping_state` RPCs (allowed only for boot/recovery/structural).
- `persistShoppingPlan({ forceRemoteSave: true })`.
- `scheduleCoalescedPlanSaveToDataService` triggered from input flushes.
- `setShoppingQtyFromDirectValue` called from `flushOp` (and, more broadly, any single function that both writes the local container and triggers a save — section C requires structural separation).
- `hasPendingRowOp(rowKey)` as an input gate.
- `hasPendingRowOps()` (any-pending-anywhere) as a refresh gate.
- `recentShoppingListCheckboxOps` time-window ledger.
- `applyRecentShoppingListCheckboxOpsToDoc` and `rememberRecentShoppingListCheckboxOp` (replaced by per-key `lastAppliedServerUpdatedAt` + per-key pending check).
- Full `innerHTML = ''` rebuilds on peer field updates.
- Any "echo-applies-to-all-keys" path.
- Comparing a Realtime payload against `clientSeq` (it is not a server concept).
- Persisting a wholesale snapshot to the canonical local container without first running per-key staleness protection for every migrated collection in it (section G.1).
- Treating a companion-table Realtime event (parent/revision row bumps with no migrated-field content) as a trigger for an unprotected wholesale `load_shopping_state` (section F.1).
- Treating a companion-table Realtime event as a routine trigger for a protected/debounced wholesale `load_shopping_state`. Default behavior is absorb/log; wholesale belongs to boot, recovery, or explicit hostile probes.
- Re-creating an input queue on every page mount, dropping its per-key version state (section B′.1).
- Adding a guard, timeout, debounce, throttle, busy flag, or "ignore events for N ms" to hide snapback instead of fixing source-of-truth / echo / refresh contracts.

### J. Files in scope

Primary:

- `syncLab.html` — reference proof page; do not weaken it to match product hybrids.
- `js/screens/syncLabPage.js` — reference queue / echo / parent-event behavior.
- `js/screens/itemsPage.js`
- `js/screens/recipesPage.js`
- `js/screens/shoppingListPage.js`
- `js/main.js` (plan/list save plumbing, refresh hooks, echo handler)
- `js/favoriteEatsStore.js` (pending-op model)
- `js/favoriteEatsInputSync.js` (op queue + per-key version state)
- `js/data/adapters/supabaseAdapter.js` (narrow RPC clients; also home of caches like `recipeDetailResolvedCache` that have to stay consistent with new writes — see `.cursor/rules/shopping-state-known-fragility.mdc`)
- `supabase/migrations/*` (narrow RPCs; `set_plan_item_quantity` and `set_plan_recipe_servings_override` must be authored here before their cutovers)
- `supabase/migrations/20260525130600_sync_lab_controls.sql` (reference proof schema/RPCs)

Supporting:

- `tests/runFavoriteEatsInputSyncTests.js`
- Targeted regression tests listed below.

Out of scope for this charter (already deliverable on their own, do not conflate):

- "No visible active `- 0 +` stepper at qty 0" — landed via `js/listRowStepper.js` and the recipe-planner-mode stepper tests; invariant 6 still applies but does not require the sync rewrite.
- Shopping List "add a manual line" UX — does not exist by product fact; see `.cursor/rules/shopping-list-no-adhoc-lines.mdc`. `list.manual_rows` is a server-side concern only.

### K. Required invariants (tests must enforce)

1. **8 → echo(1) → -1 = 7.**
   Enqueue 8 plus ops, simulate an in-flight echo of value 1 (with a stale or matching `updated_at`) arriving mid-burst, then enqueue minus 1. Final visible and persisted value is 7. The mid-burst echo is dropped by the section F skip rule (pending op exists for that key).
2. **Checkbox 30x = final intent.**
   30 toggles on the same checkbox land on the user's last toggle. Zero snapback under simulated 1 s server latency.
3. **No whole-plan/state save during routine input.**
   HAR/test capture during a 30-tap stepper burst contains no `save_shopping_plan` or `save_shopping_state` request.
4. **Peer field update applies as patch.**
   Mock realtime payload for one row/field updates only that row's UI; the list/items DOM is not rebuilt.
5. **Refresh skips in-flight keys per-key.**
   A refresh during a pending op for key K leaves K untouched, but updates a peer-changed key J. The pending state for K must not gate the patch to J.
6. **No visible active stepper at qty 0.**
   `syncRowVisuals` and all Items/Recipes activation paths never produce a visible `- 0 +` stepper. (Already enforced by existing stepper tests; listed here for completeness.)
7. **Lifecycle flush is durable.**
   Pending ops on `pagehide` are flushed via the durable ring (section H); reload with the page killed mid-flush replays them on next boot before any local apply can run on those keys. No ops are lost across forced reload.
8. **Same-device echo is a no-op.**
   After a successful narrow RPC for key K, the matching Realtime fanout (same `updated_at`, same value) does not change the local container and does not trigger a DOM re-render for K.
9. **Stale echo is dropped.**
   An echo with `updated_at` older than `local.lastAppliedServerUpdatedAt[K]` is dropped without applying.
10. **Structural separation.**
    A static / unit-level check confirms no migrated control's `flushOp` calls a function that also writes the local container. (Concretely: `flushOp` for Items must not call `setShoppingQtyFromDirectValue`, regardless of options.)
11. **Companion-table event during burst is absorbed.**
    Spam N taps on a migrated control. Simulate the row-table Realtime event being handled by the per-row patch hook, AND simulate the companion-table event (parent/revision bump) firing immediately after each ack. Final visible value is N, no snapback, and no routine wholesale read is issued from the parent event.
12. **Wholesale captured pre-commit does not erase a fresh row.**
    With one taps's narrow RPC ack already recorded by the client, simulate a wholesale snapshot that was captured _before_ that RPC's commit landed (snapshot omits the row OR carries an older `updatedAt` for it). The snapshot must not erase or downgrade the freshly-acked local value. Section G.1's per-key check + splice-back covers both subcases.

### L. Definition of Done per control

A control is migrated only when **all** are true:

- Uses the shared queue with the local-apply / flush split above, implemented as two structurally distinct functions (no `forceRemoteSave`-style flag).
- The queue lives at module scope and its per-key state survives page navigation (section B′.1).
- Sends only narrow RPCs (no whole-plan/state save on input). The RPC returns `{ ok, updated_at }`.
- Echo and refresh apply the per-key skip rule from sections F/G (pending op, stale `updated_at`, or equal value).
- Per-key `lastAppliedServerUpdatedAt` is updated on RPC ack and on accepted echo, and seeded on boot hydrate.
- **Wholesale-path protection.** The control's collection has a branch in the per-key staleness merge and the per-key seed helper (section G.1). Every wholesale-hydrate call site runs both. The wholesale snapshot RPC returns per-row `updatedAt` for the control's collection (section E.1).
- **Companion-event handling.** The patch hook returns `true` / marks handled for parent/revision-bump events on the same plan/list so routine wholesale is suppressed. Do not replace this with protected/debounced wholesale on the default path.
- **Reference parity.** The control matches Sync Lab's shape: child row event is the content path; parent companion event is absorbed; wholesale is not on the routine input path.
- Pending ops for the control are mirrored into the durable `pagehide` ring (section H).
- Old guards, time windows, and forbidden code paths for that control are **removed from the codebase**, not just bypassed.
- All required invariants pass with that control involved.
- Mac + iPhone, both directions, 10+ rapid interactions, zero missed taps, zero snapback.
- No regression in baseline UX for the surrounding screen.

### M. Migration order

0. **Keep Sync Lab green.**
   `syncLab.html` is the reference. Before and after product work, verify the lab still behaves perfectly in two browser contexts. Do not change the lab to accommodate product constraints; change product code to match the lab.
1. **Start product-port preparation from the proven Sync Lab shape.**
   Sync Lab has proven the current meaningful layers, including same-control multi-row isolation. Add more lab layers only when the product port uncovers a new requirement that can still be represented honestly in the prototype.
2. **Inventory the target control against Sync Lab.**
   Identify its local container, field key, child table, parent companion table, narrow RPC, row Realtime payload, boot snapshot shape, and existing whole-save paths. If any of these are unclear, stop and map them before editing.
3. **Server contract first.**
   Confirm the narrow RPC exists, applies exactly one field/key, returns `{ ok, updated_at }`, bumps the parent row, and that child + parent tables are in Realtime. Do nothing else until this is true.
4. **Queue and local apply.**
   Create or move the queue to module/session scope. It must track `pendingOp`, `inFlightOp`, `lastAppliedServerUpdatedAt`, and `lastLocalValue`. Split local apply and flush into separate named functions.
5. **Child row Realtime patch.**
   Wire the child table event as the only content path. It applies per-key skip rules and patches only the affected DOM/control.
6. **Parent companion absorb.**
   The parent/revision event is logged/absorbed and marks the payload handled. It must not schedule wholesale on the default spammable path.
7. **Boot/recovery wholesale protection.**
   Keep wholesale only for boot, recovery, structural regeneration, and explicit hostile probes. Every wholesale path runs per-key merge before persist and seeds queue state after accept.
8. **Fail-fast tests for that layer.**
   After each layer, run a focused test/probe. If it fails, classify it as architecture disproven, implementation defect, or requirement discovered. Do not move on while it is "mostly working."
9. **Port one product control at a time.**
   Suggested order remains Items quantity, Recipes servings, Shopping List checkbox. For each, delete old guards/time windows/whole-save input paths as part of the cutover, not later.
10. **Retire forbidden paths.**
   Once the migrated controls pass, remove dead code listed in section I. Remaining controls (remove/restore, placement, text, bulk, undo) follow the same pattern, one at a time, each with a narrow RPC returning `{ ok, updated_at }`.

### N. Forest-over-trees clause

If following this charter conflicts with the non-negotiables, the non-negotiables win. Update the charter rather than violating them.

If a step looks like it requires a new "guard," "window," or "skip flag" to make the symptom go away, stop. The right answer is almost always to fix the source of truth, the echo, or the refresh contract — not to add another guard.
