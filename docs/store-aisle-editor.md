# Continuity: Store editor — Aisle cards

Handoff for a new agent. Build in **small chunks**, verify after each, then continue.

---

## Canonical data model (actual DB)

Do **not** trust the checked-in `favorite_eats.db.sql` as schema truth; the user’s DB lives elsewhere.

| Concept                  | Table                       | Notes                                                                   |
| ------------------------ | --------------------------- | ----------------------------------------------------------------------- |
| Store (chain + location) | `stores`                    | `chain_name`, `location_name`                                           |
| Aisle                    | `store_locations`           | `store_id` → `stores.ID`, `name`, optional `aisle_number`, `sort_order` |
| Item on an aisle         | `ingredient_store_location` | `ingredient_id`, `store_location_id` → `store_locations.ID`             |

There is **no** `store_aisles` table. `docs/store-db-info.md` describes a different shape; **the user asked not to refresh that doc**—treat it as non-authoritative for implementation.

---

## Feature behavior (agreed)

**Page anatomy**

- Editable **store name** (title) and **location** (subtitle) — same pattern as **unit editor**.
- **Card layout** — same system as **shopping item editor** cards.
- Section header **“Aisles”** — same visual/format as **“Pluralization overrides (optional)”** on shopping item editor.
- Column of **one card per aisle**; each card: **aisle name** + **item list**.

**Empty aisles**

- If no aisles: hint **“Add an aisle”** — same idea as **“Add an ingredient”** (recipe editor).
- Click → **“New Aisle”** dialog — same flow as **Stores → Add → New Store**.
- On **Create**: new card; aisle name is title styled like **purple in-card headings** (e.g. **“Variants”**) on shopping item editor; name is **editable** (established pattern).

**Item list (per aisle)**

- Same **pattern/behavior** as lists on shopping item editor.
- Empty list: hint **“Add an item.”**
- Focusing the list: **shopping item suggestions** like **Home location** on shopping item editor.
- List is a **paste target** (same as shopping item editor).
- On **commit**: strings that don’t match existing DB shopping items → **new ingredient confirmation**; **Confirm** creates ingredients in DB; **Cancel** returns to editing the list; **Discard** closes dialog, drops changes, exits edit mode.
- **Dedupe** on commit: same shopping item must not appear twice on one aisle.

**Multiple aisles / “add below active”**

- When **≥1** card and user is in **edit mode** on a card, show **“Add an aisle”** **below that active card**.
- Clicking that hint **blurs** the active card.
- If the active card has **no** pending new ingredients → open **New Aisle** dialog; on commit, new card at hint position.
- If there **are** pending new ingredients → run **new ingredient confirmation first**, **then** open **New Aisle** dialog.

**Delete aisle**

- **Ctrl/⌘+click** or **right-click** on **blank / non-interactive** card surface only (same as Stores list) → confirm → remove from **draft**; **Save** applies permanent delete in DB.

**Later (not this pass)**

- Drag-to-reorder aisles and/or items within an aisle.

---

## User preferences / negatives

- **Do not** update `docs/store-db-info.md` to match schema (explicit request).
- **Do not** assume checked-in SQL dump is canonical.
- Prefer **incremental** delivery: ship a slice, **test**, then next slice.

---

## Codebase pointers (verify paths when implementing)

- Store editor: `loadStoreEditorPage` and related in `js/main.js`.
- Patterns to mirror: unit editor (title/subtitle), shopping item editor (cards, lists, Home location, paste, new ingredient confirm), recipe editor (“Add an ingredient”), Stores page (New Store dialog).
- Existing deletes may reference `ingredient_store_location` / `store_location_id` — align with real schema.

---

## Open implementation detail

- **`ingredient_store_location`** per aisle is wired on **Save** from `loadStoreEditorPage` (batched with aisle create/rename/delete).
- **Not done:** shopping-style **suggestions** on list focus, **paste** affordances, and **“add below active”** flow tied to pending unknown items (spec above; current UX is simpler).

## Completed work

- **Store title + description subtitle:** Editable store title and subtitle bound to `stores.location_name`. Subtitle uses `wireChildEditorPage` with `subtitleEmptyMeansHidden: true` (hidden when empty; appears while title is in edit mode); placeholder **“Add a description.”** Draft subtitle text **stays visible after blur** (including when a description was already saved) until **Save** or **Cancel** — fixed via `lastCommittedSubtitle` in `wireChildEditorPage` (also benefits **unit editor** abbreviation row).
- **Aisles section** (only when the store row exists — valid `selectedStoreId`): header **Aisles** (pluralization-overrides-style label).
- **Draft-until-Save (aisles):** Aisle names, item lists, **new aisles**, and **deleted aisles** (see below) are held in memory until **app-bar Save**; one DB persist writes store row + all aisle changes. **Cancel** / **back** (with confirm) restores aisle draft from a load-time snapshot.
- **Dirty state:** `wireChildEditorPage` supports optional **`extraDirtyState`** (`isDirty`, `onCancel`, `onAfterSaveSuccess`) plus **`refreshDirty`** so aisle edits enable Save/Cancel alongside title/subtitle. App bar is wired **before** aisle cards render so buttons update immediately. **`onSave`** may throw **`{ silent: true }`** to abort without a generic failure toast (e.g. user cancels unknown-items dialog on Save).
- **Empty state:** **Add an aisle** (`placeholder-prompt`; click + Enter/Space). **New Aisle** dialog → new card in **draft** until **Save** (`INSERT` on Save). With **1+** aisles, hint **hidden** until focus enters an aisle card; **below the focused card**; hides on blur when focus leaves cards + CTA.
- **Cards:** One card per aisle; purple in-card **name**; **click to edit**, **Enter** / blur update **draft**; **Esc** cancels name edit; **app-bar Save** persists names.
- **First save without row ID:** After `INSERT stores`, page **reloads** so **Aisles** appears once `selectedStoreId` exists.
- **Aisle item lists:** Newline textarea (**“Add an item.”**); **input** updates draft; **Esc** reverts to value at focus; **Save** resolves ingredients, **one batched** unknown-items dialog (Create / Fix / cancel save), dedupe, then rewrites **`ingredient_store_location`** per aisle. Deprecated/hidden ingredients skipped with toast.
- **Delete aisle:** **Ctrl/⌘+click** or **right-click** on blank card surface (not name, not textarea), same as Stores → confirm → removed from **draft**; **Undo** toast (~8s, same slot as recipe ingredient remove); DB delete on **Save**. Aisle title shows **ellipsis** when not editing so more card area is “empty” for delete.
- **CSS parity:** `.shopping-item-field` / `.shopping-item-textarea` on aisle lists match shopping-item editor.
- **Hint text size (store editor):** **“Add an aisle”** (`.store-add-aisle-cta .placeholder-prompt`) and aisle list placeholder **“Add an item.”** (`body.store-editor-page .shopping-item-textarea::placeholder`) use the same font size and family as typed list text (`var(--ingredient-editor-control-font-size)` / `var(--content-font-default)` in `css/styles.css`).
