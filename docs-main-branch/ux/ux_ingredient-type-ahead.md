Typeahead / Type-along Dropdown — v1 Spec (Favorite Eats)

This spec exists to “rehydrate” the exact agreement we reached for THIS app.
It is intentionally behavior-first and implementation-light.

Guiding principle: **bias toward “I meant what I typed.”**
Users are Google-Docs-native recipe writers; rails should feel optional, not coercive.

---

## Scope (v1)

Typeahead is enabled for ingredient-row edit fields:

- **name**
- **unit**
- **variant**

Other fields are out of scope for v1.

---

## Terminology

- **Field**: a single focused input (e.g., the ingredient `var` input).
- **Dropdown**: the suggestion surface associated with the focused field.
- **Suggestion pool**: the full set of candidates for a field before filtering.
- **Query**: the current field value (trimmed) used to filter the pool.
- **Near-match normalization**: blur-time correction of typos to an existing standard value.

---

## Suggestion Pools (Source of Truth)

### Name

- Pool = all ingredient names in the DB.

### Unit

- Pool = all units in the DB (initially curated via shipped DB; can grow via user entry).

### Variant (scoped)

- Pool is scoped to the **current name field value**.
  - Example: name=`onion` → pool = all known variants for onion.
  - If name is nonsense (e.g., `ghghghghhghg`) and it “sticks,” variant pool is empty and the dropdown reflects that.

### “Immediate availability”

When a user creates a new value and saves:

- It should become available in the pool **immediately after save** (no restart required).

---

## Dropdown Opening / Closing

### Open

When a typeahead-enabled field receives focus:

- Open the dropdown automatically.
- Initial query = the field’s current value (if any).
  - If empty query, show the full pool (sorted as defined below).

### Close

The dropdown closes when:

- A suggestion is picked (click or Enter).
- Focus moves away from the field (including to another field).
- The page scrolls.
- The user clicks the dropdown empty-state row (“No matches”).

### Moving between fields

When focus moves to a different field:

- Close the previous field’s dropdown.
- If the new field supports typeahead, open its dropdown immediately.

### Re-open after scroll (while still focused)

If the dropdown closed due to scroll and the field remains focused:

- Reopen on next input (typing), or
- Reopen on ArrowDown, or
- Reopen on click in the field.

---

## Filtering + Sorting

### Matching

- Case-insensitive **substring** match.
  - Example: query=`y` matches `yellow`, `yoyo`, `soy`.

### Ordering

- With a non-empty query: **best-match first**.
  - Prefix matches should rank above substring-only matches.
  - Alphabetical tiebreakers.
- With empty query: **alphabetical** (least arbitrary).

### Rendering limits

- Dropdown shows up to **8 visible rows**, then becomes internally scrollable for additional matches.

### Empty state

If the filtered results are empty:

- Show a compact 1-row dropdown state, e.g. “No matches.”
- Clicking that empty-state row closes the dropdown.

---

## Picking Behavior

### Mouse

- Clicking a suggestion directly **picks it** and closes the dropdown.
- No hover-to-highlight in v1 (keyboard is the only way to move highlight).

### Keyboard (within dropdown context)

- ArrowUp / ArrowDown moves the highlighted row.
- **Enter** picks the highlighted row and closes the dropdown.
- When the dropdown is open, there is always a deterministic “top highlight.”
  - Even for empty query: Enter picks the first item (no special case).

### Focus after pick

After a pick:

- Keep focus in the same field.
- Remain in row edit mode.

---

## Tab Behavior (Row Navigation)

Tab is for field navigation, not for dropdown interaction:

- **Tab** moves to the next field and **selects all** text in that field.
- **Shift+Tab** moves to the previous field and **selects all**.
- Tab order follows **visual order**.
- Tab on the last field **wraps to the first field** in the same row.
- When the dropdown is open, Tab should **not pick** anything; it should close the dropdown via focus change.

---

## Escape / Cancel

Important: The ingredient editor currently uses row-level editing helpers.

- **Escape** cancels the entire row edit (existing behavior).
- There is no “dropdown-only dismiss” key in v1.

---

## Interaction with Current App Behavior (critical)

Today, ingredient row editing uses `setupInlineRowEditing`, where:

- **Enter** commits the entire row and exits edit mode.

Therefore, to satisfy this spec:

- When the dropdown is open, the dropdown must capture **Enter** so it picks a suggestion instead of committing the row.

---

## Near-match Normalization (Blur-time “nudge”)

### When it runs

- Runs on **field blur** (immediate feedback).

### Minimum length

- Only attempt normalization when the typed string length is **≥ 3**.

### Target set

- Normalize to the closest candidate in the **entire suggestion pool** (not just visible top 8).
  - For `variant`, that means within the scoped pool for the current name.

### Feedback

If normalization changes the value:

- Show a toast (or equivalent) describing the change with **Undo**.

### Undo semantics (“I meant it”)

If the user hits Undo:

- Restore the exact raw string.
- That exact raw string becomes **exempt from further auto-normalization for the remainder of the edit session**.
- Exemption is **per exact string**:
  - Undo `oniom` exempts `oniom`, but `mumion` can still be normalized.

### Non-matches

If there is no near-match:

- Leave the value as typed (it may become a new value on save).

---

## Placement + Collision Handling (Dropdown Surface)

Placement is anchored to the focused field’s bounding box.

### Default placement

- Surface is left-justified, left-aligned with the field.
- Fixed width per open (may be assigned via logic).
- Small vertical gap between field and surface.

### Horizontal collision (“scoot left”)

- If the surface would be cut off to the right, shift it left to fit within viewport margins.
- Clamp so it never goes past the left viewport margin.

### Vertical collision

Avoid forcing page scroll to view suggestions (especially since scroll closes the dropdown):

- Prefer **auto-flip above** and/or **clamp height to available space**.
- Dropdown remains internally scrollable.

---

## Deferred / Revisit Later (explicitly NOT v1)

- Exact “near-match” math (Levenshtein thresholds, fuzzy scoring, etc.).
- Curated ranking/taxonomy for units (e.g., “small measures first” groups).
- Hover-to-highlight, richer mouse affordances.
- “Dropdown-only dismiss” affordance.
- Global data cleanup tools (merge/contract), typo audit / spell-check workflows.
