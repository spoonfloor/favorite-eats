# Editing mode vs Planning mode — evergreen guide

This document is the **north star** for refactoring how the app chooses between **Editing mode** and **Planning mode**, cleaning up legacy names (`force web`, `electron`, `web mode`), and optionally removing dead Electron branches. **Agents and humans:** read this before starting or resuming work.

**Not the same as:** `docs/migration-sweep.md` (SQLite → Supabase). That sweep is data-layer migration; **this** doc is UI/runtime mode + naming + removal of desktop-era paths.

---

## Why this work exists

The product used to contrast **desktop (Electron)** vs **browser (web)** and used names like **force web mode**. The app is **web-only** now (production on GitHub Pages; local dev via a simple HTTP server). The real user-facing axis is:

| Mode | Hamburger “Editing” switch | What users get |
|------|------------------------------|----------------|
| **Editing mode** | **On** | Full editor-style chrome and behaviors (tags, sizes, units in nav where applicable; red theme family). |
| **Planning mode** | **Off** | Streamlined list/shopping-style chrome (purple theme family; different top-level nav order / fewer pills). |

Legacy code still calls this axis **force web**, stores **planner layout**, and toggles **`dataset.forceWebMode`** — confusing next to **inline editing** (a row/field open for typing).

---

## Vocabulary (use consistently)

### Global modes (whole app)

- **Editing mode** — Editing **ON** in the bottom/hamburger nav (user can change structure and deep editor affordances).
- **Planning mode** — Editing **OFF** (shopping/list-first presentation).

Pick **one boolean direction** in code (e.g. `isPlanningMode()` **or** `isEditingMode()`) and derive the other so call sites do not invert logic by accident.

### Row / field (not global)

Do **not** overload “editing mode” for these:

- **Inline edit** — Changing one field in place (e.g. ingredient quantity).
- **Blur** — Focus left the control; end of that inline interaction (may apply or cancel per handler — document which).
- **Save** — Persisting the **recipe or document** to the backend (distinct from blur).

---

## Architecture goal (best practice)

1. **Single module** owns:
   - Reading/writing the persisted preference (today: `localStorage` key `favoriteEatsPlannerOn` — see `js/main.js`).
   - Applying presentation: `body` attributes/classes, theme (`html` / `:root` `data-platform`), and any global listeners.
2. **Single subscription path:** UI reads **getters** on that module (or one custom event) — not scattered `localStorage.getItem` or duplicate interpretations.
3. **Policy layers** (exceptions documented here, not buried):
   - **Public web “locked” build** (`isPublicWebExperienceLocked()` in `js/main.js`) may **force** Planning-style behavior regardless of storage.
   - **Recipe editor page** (`body[data-page="recipe-editor"]` or equivalent) may **force** full Editing presentation so empty recipes still mount the editor UI.

---

## Legacy removal scope

When this initiative includes cleanup:

- Remove **`window.electronAPI` / `isElectron`** branches and any **native-only** save/load/export assumptions — product rule: **no native-only features**; a future Electron app would be a **thin browser shell** only.
- Rename or replace identifiers and comments: **force web**, **force-web-mode**, **web mode** (when it means this axis), **electron** (when it meant “desktop shell” for this feature).
- Coordinate **HTML `data-*` attributes**, **`body` classes**, and **CSS selectors** in **one change** so styling does not half-migrate.

---

## Migration phases (recommended order)

1. **Introduce the global mode module** (get/set/apply + tests in browser). Optionally keep thin wrappers named like today so call sites still work.
2. **Migrate writers** (nav toggle, keyboard shortcut, anything that sets mode) to use the module only.
3. **Migrate readers** (list pages, shopping, stores, recipe list behavior) to use getters/event — remove duplicate storage reads.
4. **Rename** DOM/CSS/API strings (`forceWebMode` → neutral names) **together**; migrate `localStorage` key if renamed (read old key once, write new key).
5. **Remove Electron dead code** after grep shows no callers.
6. **Final grep** for legacy strings; manual smoke pass (below).

---

## How to pick the next chunk of work

Use this loop each session:

1. **Read** this file (and skim git diff if continuing a branch).
2. **Inventory** with repo search from repo root:

   ```bash
   rg -n "forceWeb|force-web|ForceWeb|electronAPI|isElectron|favoriteEatsForceWeb|PLANNER_LAYOUT|pageSet|force-web-mode" --glob "*.js" --glob "*.css" --glob "*.html"
   ```

3. **Choose one vertical slice**, smallest that stays coherent, for example:
   - Only `js/main.js` mode getters + bottom nav wiring; **or**
   - Only CSS rename for `[data-force-web-mode]` + matching JS; **or**
   - Only remove `electronAPI` usages in one file cluster.
4. **Avoid** mixing unrelated concerns in one PR (e.g. Supabase writes + mode rename) unless required.

**Hotspots today** (will drift — re-run `rg`): `js/main.js` (definitions, `getTopLevelPageOrder`, bottom nav), `css/styles.css` (`data-force-web-mode`, `.force-web-mode`), `js/utils.js`, `js/recipeEditor.js`, `js/ingredientRenderer.js`.

---

## Risk mitigation

| Risk | Mitigation |
|------|------------|
| Users lose mode preference | If renaming storage key: **migrate** old → new once on load. |
| External listeners / bookmarks | Temporary **alias**: old `CustomEvent` name or `window.*` API until grep is clean. |
| Broken styles half-renamed | Rename **JS + CSS + markup** in one commit/PR slice. |
| Mixing two meanings of “edit” | Comments: **Editing mode** vs **inline edit** explicitly. |

---

## Manual smoke checklist (after substantive changes)

1. Reload app; toggle **Editing** in the bottom sheet; confirm **theme** and **nav pills** match expectation.
2. Open **recipes**, **shopping**, **stores** (and **shopping list** if present); confirm list behaviors match mode (e.g. selection vs delete gestures if applicable).
3. Open **recipe editor** from a recipe; confirm editor still usable (especially if empty/new recipe).
4. Reload page; confirm **mode persists** (unless on a locked public build that forces Planning).

---

## Related documentation

- `docs/github-pages-setup.md` — deployment context.
- `docs/ux/ux_bottom-nav.md` / `docs/ux/ux_bottom-nav-detail.md` — nav UX notes (may need updating when mode behavior changes).
- `docs/migration-sweep.md` — **different project** (Supabase); do not conflate.

---

## Changelog

| Date | Note |
|------|------|
| 2026-05-06 | Initial evergreen doc for Editing vs Planning migration initiative. |
