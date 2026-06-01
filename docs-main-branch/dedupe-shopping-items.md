Implement a minimal viable "Merge Duplicates" feature for a shopping list app.

**Goal:** Detect near-duplicate item names (e.g., "bun", "buns", "byn") and guide the user through merging them.

**Flow:**

1. User clicks **"Merge Duplicates"** button.
2. Open a modal dialog.
3. Show **one suggested group at a time**.
4. Actions in modal:
   - **Back** (previous suggestion)
   - **Next** (skip to next suggestion)
   - **Merge** (merge current group)
   - **Ignore** (skip + don’t show again this session)
   - **Cancel** (confirm discard all pending merges, close modal)
5. After last suggestion → modal closes and show a toast notification.

**MVP Behavior:**

- **Canonical Name:** First item in the group (fixed, no editing).
- **Quantity:** Assume always 1, so no merging needed.
- **Ignore Rules:** Session-only memory; ignored groups are not suggested again.
- **Matching:** Aggressive fuzzy match:
  - Normalize item names: lowercase, trim, remove trailing "s".
  - Compute Levenshtein distance; include items with distance ≤ 2.
  - Group similar items into one suggestion (2–4 items per group).
- **Merge:** Rename all items in group to canonical.
- **Navigation:** Sequential suggestion flow (Back/Next).
- **Cancel:** Confirms discard of all pending merges.

**Frontend-only MVP:**

- Matching, suggestion generation, and merge logic happen entirely in the frontend.
- Minimal, sequential, user-confirmed merges.
- Ignore memory lasts only for the current session.

**Suggested Matching Implementation (JS example):**

function normalize(name) {
return name.toLowerCase().trim().replace(/s$/, '');
}

function generateSuggestions(items) {
const normalized = items.map((i, idx) => ({ ...i, norm: normalize(i.name), idx }));
const groups = [];
const seen = new Set();

normalized.forEach((item) => {
if (seen.has(item.idx)) return;
const group = [item];
normalized.forEach((other) => {
if (item.idx === other.idx || seen.has(other.idx)) return;
if (levenshtein.get(item.norm, other.norm) <= 2) {
group.push(other);
seen.add(other.idx);
}
});
if (group.length > 1) groups.push(group);
seen.add(item.idx);
});

return groups;
}

UI Notes:
• Modal shows the suggested group and highlights canonical item.
• User can click Merge to apply, Ignore to skip, or navigate with Back/Next.
• After completing all suggestions → close modal + show toast.
