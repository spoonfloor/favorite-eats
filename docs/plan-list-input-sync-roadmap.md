# Plan + List Input Sync Roadmap

Last updated: 2026-05-23.

Repo/workspace: `/Users/erichenry/Desktop/favorite-eats-input-sync`.

## Decision

Use **B: unified local op pipeline** for Favorite Eats Plan + List input.

Target flow:

```text
tap/edit -> local UI updates immediately -> op queue coalesces bursts
  -> background sync persists final intent -> peer device applies row/field patch
```

This replaces the v1 interaction pattern for migrated controls:

```text
tap -> RPC/save -> wait out echo/guards -> refetch full snapshot -> rebuild screen
```

The selected path is intentionally not a big-bang rewrite. It is a staged cutover of user controls, with current baseline behavior preserved everywhere else until each control is migrated and verified.

## Non-Negotiables

Priority order:

1. **Checkbox**: spam-safe first.
2. **All planning-mode steppers**: Items, Recipes, and any other current planner stepper that mutates Plan state.
3. **Everything else**: remove/restore, text/qty edits, placement, bulk actions, undo, servings and adjacent controls.

Hard requirements:

- Unlimited human spam input on migrated controls.
- Zero silent drops.
- Zero snapback.
- No manual refresh.
- No baseline UX degradation anywhere in the app.
- Plan edits must not corrupt List state on another device.
- List edits must not mutate Plan unless the UI explicitly performs a Plan edit.
- Peer device updates should apply incrementally as row/field patches, not full snapshot reloads per tap.
- Full snapshot hydration remains allowed for boot, explicit recovery, catalog/plan regeneration, and navigation recovery, but not as the routine peer-update path for migrated controls.

Forbidden as the primary correctness mechanism:

- Input blocking such as `hasPendingRowOp`.
- Realtime -> debounce -> `load_shopping_state` -> full `innerHTML` rebuild for each peer gesture.
- Interactive `save_shopping_state` for routine Plan/List gestures.
- Checkbox-only fixes that leave planning steppers on the v1 path.
- Architecture-only progress without a working milestone.

## Why Not Keep v1

The current v1 direction is useful as a bridge but cannot honestly meet the target input bar.

Known failure modes:

- Fast repeated input can be ignored by pending-op guards.
- Realtime payloads are treated as invalidation signals, then the client refetches broad state.
- Shopping List peer updates can rebuild the whole list DOM.
- Plan controls and List controls use different save/guard paths.
- More v1 tuning creates more local exceptions instead of one shared input model.

Keep the useful parts:

- Existing `plan.*` and `list.*` schema split.
- Existing List row RPCs where they fit.
- Existing Supabase Realtime subscriptions.
- Existing boot/full-hydrate paths for cold load and recovery.
- Existing catalog/plan/list invariants.

Replace the user-input runtime for migrated controls.

## Architecture Shape

### Local op pipeline

Every migrated control emits a typed operation:

```js
{
  surface: 'plan' | 'list',
  entityKey: 'stable row/item/recipe key',
  field: 'checked' | 'quantity' | 'servingsOverride' | 'removed' | 'placement' | 'text',
  value: 'new final value',
  clientSeq: 123,
  createdAt: 1710000000000
}
```

The pipeline is responsible for:

- Applying the op immediately to the local view model.
- Updating only the affected DOM/control state where possible.
- Coalescing burst input by `(surface, entityKey, field)`.
- Flushing the latest intent in the background.
- Confirming or retrying writes.
- Reconciling peer/server updates without clobbering pending local input.

### Coalescing rule

For spam input on the same control, the latest value wins.

Examples:

- Checkbox toggled 11 times quickly: local UI reflects every tap; sync may send only the final checked state.
- Stepper incremented 15 times: local quantity reaches the visible final value immediately; sync sends the final quantity or a compact final op.

### Peer update rule

Use Supabase Realtime payloads as patches where possible.

For migrated controls:

- Do not discard the payload and immediately hydrate the whole Plan/List state.
- Apply the changed row/field into the local view model.
- Patch the visible control if it is mounted.
- If the payload is insufficient or indicates a structural change, fall back to a full refresh only for that structural case.

### Plan/List boundary

Plan ops write Plan intent:

- selected item quantity
- selected recipe quantity
- serving override
- store preferences where applicable

List ops write List tactical state:

- checked
- removed/restored
- text override
- placement
- bulk checklist state

List ops must not mutate Plan state unless the UI explicitly performs a Plan edit.

## Implementation Contract

This section is the lightweight charter. It exists to prevent another half-migration, not to create process overhead.

### Goal

Deliver enterprise-feeling input for the controls that matter most:

1. Shopping List checkbox.
2. All current planning-mode steppers.
3. Remaining Plan/List controls after tier one is proven.

For tier-one controls, users must be able to tap as fast as humanly possible with no dead input, no snapback, and no manual refresh.

### One-pipeline rule

Every migrated control must use the same mutation pipeline end to end:

```text
local apply -> coalesce -> background flush -> confirm/retry -> peer patch
```

Do not add a second sync story for steppers, checkboxes, or specific pages. If a control cannot fit the shared pipeline, stop and revise the pipeline rather than creating a one-off path.

### No half-migration rule

A control is either:

- still on the old path, or
- fully on the new path.

It is not done if old v1 guards, hydrate timing, or full-rerender behavior are still part of that control's routine input correctness.

### Done per migrated control

A migrated control is done only when all of these are true:

- Local UI updates immediately on every tap/edit.
- Burst input coalesces without dropping the visible user intent.
- Background sync can lag without blocking more input.
- Peer updates apply as row/field patches when the Realtime payload is sufficient.
- The old v1 input guard/hydrate path is disabled for that control's routine input.
- Mac + iPhone verification covers both directions where relevant.
- Baseline smoke checks show no regression outside the migrated control.

### First build slice

Start with the smallest real vertical slice:

1. Shared op queue and coalescing behavior.
2. Shopping List checkbox cutover.
3. Checkbox verification against `main`.

Do not start broad cleanup, placement, remove/restore, or offline replay before checkbox proves the pipeline. Do not start all steppers until checkbox is fully cut over.

### Forest-over-trees rule

Docs are guardrails, not the deliverable. If following this roadmap conflicts with the non-negotiables, update the roadmap or stop and reassess. The non-negotiables win over any stale phase wording.

## Milestones

### Phase 0: Charter Lock

Use the Implementation Contract above as the charter. Do not create a separate heavyweight architecture document unless the implementation reveals a real decision that the contract does not cover.

Exit gate:

- Implementation Contract approved.

### Phase 1: Pipeline Foundation

Build the shared mutation path without migrating every control yet.

Deliverables:

- Local op queue.
- Coalesce/replace behavior.
- View-model apply/reconcile helpers.
- Background flush hooks.
- Peer patch intake hook.
- Targeted tests for queue, coalescing, reconcile, and failure handling.

Exit gate:

- Unit tests prove that repeated ops on the same field collapse to the latest value while local state remains responsive.

### Phase 2: Checkbox Cutover

Move Shopping List checkbox input onto the pipeline.

Deliverables:

- Checkbox emits list ops.
- Local checked state changes immediately on every tap.
- Background flush uses the existing narrow checked write where possible.
- Peer checkbox update applies as a row/field patch.
- Checkbox no longer relies on pending-op input blocking.
- Peer checkbox updates do not rebuild the whole list.

Exit gate:

- Mac + iPhone, both directions.
- 10+ rapid toggles on the same checkbox.
- 0 dead input.
- 0 snapback.
- HAR shows no `save_shopping_state` storm.
- HAR shows no full `load_shopping_state` per peer checkbox tap when a patch is sufficient.

### Phase 3: All Planning Steppers Cutover

Move all current planning-mode steppers onto the same pipeline.

Surfaces:

- Items planning-mode quantity stepper.
- Recipes planning-mode quantity stepper.
- Any other current planner stepper that mutates Plan state.

Deliverables:

- Steppers emit plan ops.
- Local quantity changes immediately on every tap.
- Burst input coalesces to final quantity.
- Background save does not block further tapping.
- Peer device applies incremental plan row/field changes where possible.
- Existing visual behavior remains intact: active stepper state, badges, amount-tail display, planner-mode affordances, filtering, and selection state.

Exit gate:

- Mac + iPhone, both directions.
- 10+ rapid increments/decrements on every planning stepper surface.
- 0 missed taps.
- 0 snapback.
- No regression in Items or Recipes baseline UX.

### Phase 4: Navigation and Lifecycle Hardening

Make the pipeline reliable in the current multi-page app.

Deliverables:

- Realtime subscriptions survive in-app navigation or resubscribe cleanly.
- Pending ops flush before page hide when possible.
- Pending ops resume/retry after navigation or reconnect.
- Full snapshot refresh is reserved for boot, recovery, and structural invalidation.

Exit gate:

- Navigate between Items, Recipes, and Shopping List without a full browser reload.
- Sync remains live after returning to a surface.
- Pending local input is not overwritten by a delayed hydrate.

### Phase 5: Remaining Controls

Migrate the rest of Plan + List input in priority order.

Order:

1. List remove/restore.
2. Bulk uncheck/restore.
3. Placement.
4. Text and quantity edits.
5. Undo and inverse ops.
6. Servings and adjacent Plan controls not already covered by stepper work.

Deliverables:

- Each control emits typed ops through the same pipeline.
- Each control has targeted tests and two-device verification.
- No new one-off sync paths.

Exit gate:

- Every migrated gesture passes the spam/no-snapback/HAR standard appropriate to that control.

### Phase 6: Offline and Flaky Network

Make local input robust when connectivity is unreliable.

Deliverables:

- Durable pending-op storage sufficient for reload/reconnect recovery.
- Deterministic replay order.
- Retry/backoff behavior.
- Visible failure state for non-retryable errors.
- Coalesced final intent wins for repeated controls.

Exit gate:

- Simulated offline/online recovery for checkbox and planning steppers.
- Then repeat for migrated remaining controls.

### Phase 7: Retire v1 Input Paths

Delete or permanently disable old input correctness paths after their controls are migrated.

Retire:

- Input-blocking guards as primary correctness.
- Realtime peer gesture -> full hydrate -> full rebuild.
- Interactive `save_shopping_state` for routine Plan/List gestures.
- Per-page stepper edit-sequence guards replaced by the pipeline.
- Bespoke pending-op code superseded by the shared queue.

Keep:

- Cold boot hydration.
- Explicit recovery refresh.
- Catalog/Plan structural regeneration.
- Migration/compatibility bridges until named deletion gates are met.

Exit gate:

- No migrated control depends on the v1 hydrate/guard path for normal input.
- Full verification matrix passes.

## Verification Matrix

For each migrated control:

- Mac -> iPhone live update.
- iPhone -> Mac live update.
- 10+ rapid interactions on the same control.
- 0 dead input.
- 0 snapback.
- No manual refresh.
- HAR: no `save_shopping_state` storm.
- HAR: no full `load_shopping_state` per peer tap when a row/field patch is sufficient.
- In-app nav away/back keeps sync live.
- Reload preserves server state.
- Other app surfaces retain current baseline UX.

Baseline UX smoke checks:

- Shopping List load and filter behavior.
- Items planning mode.
- Recipes planning mode.
- Non-planning Items/Recipes browsing.
- Catalog item/recipe editing flows touched by shared state.
- App navigation and pagehide/pageshow behavior.

## Estimated Size

Implementation only, excluding planning and approval time:

- Tier one, checkbox plus all planning steppers: about **11-17 focused agent sessions**.
- Full Definition of Done across all controls: about **20-30 focused agent sessions**.

The wide range reflects real-device/HAR validation, multi-page lifecycle issues, and regression fixes that are hard to predict from unit tests alone.

## Current-Path Compatibility Rule

Do not break current working behavior while migrating.

For any control not yet on the new pipeline:

- Leave its current path intact.
- Do not remove support code it still needs.
- Avoid broad cleanup until the relevant control has passed its cutover gate.

For any control migrated to the new pipeline:

- Disable the old input guard/hydrate path for that control.
- Verify the old path no longer handles routine user input for that control.
- Keep boot/recovery refresh paths available.

## Summary

The roadmap is not "rewrite sync." It is:

1. Introduce one shared input pipeline.
2. Prove it on checkbox.
3. Prove it on all planning steppers.
4. Harden navigation and peer patches.
5. Migrate remaining controls.
6. Add offline/flaky replay.
7. Delete the old v1 input paths only after each surface is safe.

