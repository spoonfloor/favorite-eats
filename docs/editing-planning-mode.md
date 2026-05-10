# Editing mode vs Planning mode — evergreen guide

This document is the **north star** for how the app chooses between **Editing mode** and **Planning mode**, and for cleaning up legacy desktop-era paths. **Agents and humans:** read this before starting or resuming work.

**Not the same as:** `docs/migration-sweep.md` (SQLite → Supabase). That sweep is data-layer migration; **this** doc is UI/runtime mode + naming + removal of desktop-era paths.

---

## Why this work exists

The product used to contrast **desktop (Electron)** vs **browser (web)** and used ambiguous names for list-first chrome. The app is **web-only** now (production on GitHub Pages; local dev via a simple HTTP server). The real user-facing axis is:

| Mode | Hamburger “Editing” switch | What users get |
|------|------------------------------|----------------|
| **Editing mode** | **On** | Full editor-style chrome and behaviors (tags, sizes, units in nav where applicable; purple/editor theme family). |
| **Planning mode** | **Off** | Streamlined list/shopping-style chrome (planner theme family; different top-level nav order / fewer pills). |

**Implementation:** Global planner layout is exposed as `window.plannerMode`, `body.dataset.plannerMode` (`data-planner-mode`), and persisted under `localStorage` key `favoriteEatsPlannerModeOn` (legacy `favoriteEatsPlannerOn` is read once for migration). Use vocabulary that does not collide with **inline editing** (a row/field open for typing).

---

## Vocabulary (use consistently)

### Global modes (whole app)

- **Editing mode** — Editing **ON** in the bottom/hamburger nav (user can change structure and deep editor affordances).
- **Planning mode** — Editing **OFF** (shopping/list-first presentation; **planner layout** enabled).

Pick **one boolean direction** in code (e.g. `isPlanningMode()` **or** `isEditingMode()`) and derive the other so call sites do not invert logic by accident.

### Row / field (not global)

Do **not** overload “editing mode” for these:

- **Inline edit** — Changing one field in place (e.g. ingredient quantity).
- **Blur** — Focus left the control; end of that inline interaction (may apply or cancel per handler — document which).
- **Save** — Persisting the **recipe or document** to the backend (distinct from blur).

---

## Architecture goal (best practice)

1. **Single module** owns:
   - Reading/writing the persisted preference (`favoriteEatsPlannerModeOn`; legacy key migrated on read — see `js/main.js`).
   - Applying presentation: `body` attributes/classes, theme (`html` / `:root` `data-platform`), and any global listeners.
2. **Single subscription path:** UI reads **getters** on that module (or one custom event, `favoriteEatsPlannerModeChanged`) — not scattered `localStorage.getItem` or duplicate interpretations.
3. **Policy layers** (exceptions documented here, not buried):
   - **Public web “locked” build** (`isPublicPlannerExperienceLocked()` in `js/main.js`) may **force** Planning-style behavior regardless of storage.
   - **Recipe editor page** (`body[data-page="recipe-editor"]` or equivalent) may **force** full Editing presentation so empty recipes still mount the editor UI.

---

## Legacy removal scope

When this initiative includes cleanup:

- Remove **`window.electronAPI` / `isElectron`** branches and any **native-only** save/load/export assumptions — product rule: **no native-only features**; a future Electron app would be a **thin browser shell** only.
- Coordinate **HTML `data-*` attributes**, **`body` classes**, and **CSS selectors** in **one change** so styling does not half-migrate.

---

## Migration phases (recommended order)

Completed rename (2026): `dataset.plannerMode`, `[data-planner-mode]`, `.planner-mode`, `window.plannerMode`, recipe list servings storage keys (`favoriteEats:recipe-planner-servings:v1`), shopping filter chips session suffix `planner` (legacy `web` key restored on load).

Remaining optional work:

1. **Remove Electron dead code** after grep shows no callers.
2. **Final grep** for legacy strings; manual smoke pass (below).

---

## How to pick the next chunk of work

Use this loop each session:

1. **Read** this file (and skim git diff if continuing a branch).
2. **Inventory** with repo search from repo root:

   ```bash
   rg -n "plannerMode|data-planner-mode|plannerExperience|favoriteEatsPlannerModeOn|electronAPI|isElectron" --glob "*.js" --glob "*.css" --glob "*.html"
   ```

3. **Choose one vertical slice**, smallest that stays coherent.
4. **Avoid** mixing unrelated concerns in one PR (e.g. Supabase writes + unrelated UI) unless required.

**Hotspots** (re-run `rg` periodically): `js/main.js` (definitions, `getTopLevelPageOrder`, bottom nav), `css/styles.css` (`data-planner-mode`, `.planner-mode`), `js/utils.js`, `js/recipeEditor.js`, `js/ingredientRenderer.js`.

---

## Risk mitigation

| Risk | Mitigation |
|------|------------|
| Users lose mode preference | Migration from legacy `localStorage` keys on load (implemented for planner toggle and recipe servings map). |
| External listeners / bookmarks | Event name `favoriteEatsPlannerModeChanged`; old build inject keys `forceWebExperience` / `allowHiddenForceWebModeToggle` still honored when reading `__FAVORITE_EATS_BUILD__`. |
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
| 2026-05-10 | Renamed force-web / web-select identifiers to planner terminology; documented current keys and migration. |
