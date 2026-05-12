# Avoid (reintroduce only with an explicit exception)

These patterns are **forbidden by default** because they either sat on a past prod/load regression path or this codebase makes them high-risk. An **exception** is a short written note (ticket or PR): what you need, what smaller alternative you rejected, and how you will verify (e.g. staging, static build).

## Shell, boot, and global DOM

- **Do not** add “sync UI from the DOM” for app chrome (e.g. `MutationObserver` that rewrites app-bar icons/classes from the tree). Prefer **explicit state** and one render path.
- **Do not** rework **root entry / welcome / first paint** (`document.body`, `welcome-page`, early `main.js` init) without treating it like a release. That path can brick every page load.
- **Do not** add new **always-on** `MutationObserver` / `ResizeObserver` / `window` listeners unless they are **scoped**, **cleaned up** (e.g. `destroy()`), and unavoidable. The repo already uses observers in a few places; more global sync increases ordering and load fragility.

## `js/main.js`

- **Avoid** large or cross-cutting UI changes **only** in `main.js` (~20k+ lines). Prefer smaller modules and minimal wiring in `main.js` so regressions stay bisectable.

## Styling — Material / icons

- **App-wide** Material Symbols axis defaults (`--material-symbols-wght`, `fill`, `opsz`, etc.) can be **intentional** (one icon language everywhere). What to avoid is **changing those globals casually**: the blast radius is the whole UI, so treat axis updates like a small **design-system release**—explicit values, no competing `:root` rules, and a **visual pass** on key screens (dense chrome, lists, empty states). Use **scoped overrides** only where a surface truly needs an exception, not as the default way to fix drift.

## Electron vs web

- **Product is web-only.** Do not branch on delivery/runtime (`window.electronAPI`, native shells). Use **`window.plannerMode`** (editing vs planning) and page context instead.

## Exceptions log

Add a row when you deliberately break a rule above:

| Date | Link | What | Why |
|------|------|------|-----|
| | | | |
