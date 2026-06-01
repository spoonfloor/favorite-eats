# Plan + List Input Sync, Plain English

Last updated: 2026-05-23.

## The Goal

Favorite Eats should feel instant when using the important Plan and List controls.

Most important:

1. Shopping List checkboxes.
2. Planning steppers on Items and Recipes.
3. Everything else after those are solid.

You should be able to tap as fast as a human can tap without the app missing input, snapping back, or needing a refresh.

## The Basic Idea

When you tap something, the app should trust your tap immediately.

Instead of:

```text
tap -> wait for server -> reload lots of data -> redraw screen
```

Use:

```text
tap -> screen changes now -> app saves quietly -> other device updates that one thing
```

The screen should not wait for the server before showing your change.

## What "Spam-Safe" Means

If you tap a checkbox or stepper many times quickly:

- every tap should feel like it counted;
- the screen should keep up;
- the app may save only the final answer in the background;
- the other device should catch up;
- nothing should bounce back to an old value.

Example:

If you tap a stepper from `1` to `8` very fast, the app should show `8` immediately. It does not need to send seven separate saves if the final intended value is `8`.

## The Main Rule

Do not fix each button with its own special trick.

Checkboxes and steppers should use the same basic path:

```text
update local screen -> remember the change -> combine fast changes -> save in background -> update peers
```

If a control does not fit that path, stop and improve the path. Do not create a separate one-off system.

## The No Half-Migration Rule

A control is either:

- still using the old system, or
- fully using the new system.

It is not acceptable for a control to partly use the new system while still depending on old input blocking, old timing guards, or full reloads to be correct.

This matters because half-migrations are how snapback bugs and dead taps come back.

## What Stays Old For Now

Do not rewrite the whole app at once.

Controls that are not being migrated yet can stay on the old path until their turn.

That is okay as long as:

- the migrated control is truly done;
- unmigrated controls do not regress;
- the old path is not secretly still required for the migrated control.

## First Thing To Build

Start small, but complete:

1. Build the shared change queue.
2. Move Shopping List checkbox onto it.
3. Prove checkbox works under fast tapping.
4. Compare against `main`.
5. Only then move to planning steppers.

Do not start with broad cleanup. Do not start with every control. Do not chase unrelated sync issues unless they block checkbox correctness.

## Done For Checkbox

Checkbox is done when:

- tapping updates the checkbox immediately;
- fast repeated taps do not get ignored;
- the checkbox does not snap back;
- the other device updates without a manual refresh;
- the old checkbox input-blocking path is not needed anymore;
- the rest of the app still behaves like it did before.

## Done For Steppers

Planning steppers are done when:

- every current planning stepper uses the new path;
- fast repeated increments/decrements do not get dropped;
- the visible number always matches what the user just did;
- saving happens in the background;
- the other device catches up;
- Items and Recipes screens do not lose existing behavior.

## What Not To Do

Do not:

- make another big architecture document instead of working code;
- follow the roadmap blindly if it stops serving the goal;
- fix checkbox only and call the project done;
- add more input blocking as the main correctness tool;
- reload the whole Plan/List state for every peer tap;
- clean up old code before the replacement is proven.

## The Forest

The forest is:

```text
fast human input, no missed taps, no snapback, no regressions
```

Everything else is details.

Docs, phases, and code structure only matter if they protect that goal.

