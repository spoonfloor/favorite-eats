# Shopping plan parity brief

**Audience:** anyone implementing or reviewing shopping-state behavior during the Supabase migration.

**Scope (narrow):** Persisted **manual shopping selections** (items chosen on the shopping **items** flow) must behave like the pre–remote-sync design: after the user **changes an ingredient’s display name and/or variant label in the catalog**, opening or reloading the **shopping list** must show **current** catalog wording—not stale captions baked into old keys or cached strings—and must **not drop** the selection silently.

This doc names expected behavior and invariants; it does not prescribe every line of implementation.

---

## Why this exists

Historically, local reconcile/heal logic existed so persisted plan keys and display metadata could **drift back toward the database** after catalog edits. Remote shopping state + string-based joins introduced regressions (empty lists, stale labels). Parity means restoring that **intent** under Supabase: **stable identity** for picks, **fresh labels** from the catalog on read or reconcile.

---

## Non-negotiables (inferred)

1. **Fresh names:** If an item was on the shopping plan and the user renames the ingredient and/or variant in the catalog, a **reload** of the shopping list (or revisiting it) shows labels matching the **current** catalog—not only the text stored at add time.

2. **No silent loss:** Quantity selections must not disappear except through explicit user action (clear qty to zero, remove flow, etc.). Hydration from the server must not replace local manual picks with an empty remote manual section.

3. **Single source of truth for wording:** Display strings on the list should resolve from **catalog rows** (via stable ids), with any cached `name` / `variantName` on plan entries treated as **denormalized cache** updated when we load or reconcile—not as immutable identity.

---

## Technical direction (inferred, not optional fixes-of-the-week)

- **Identity:** Prefer **`ingredient_variant_id`** (and thus `iv:{id}` keys or explicit `ingredientVariantId` on entries) so renames don’t orphan joins.

- **Merge:** Remote vs browser state needs explicit rules; at minimum: **never persist remote `itemSelections` that are empty over non-empty local manual picks** when merging during hydrate.

- **List assembly:** Building list rows from selections must **resolve** picks by variant id when name strings no longer match the catalog after a rename.

---

## Acceptance checks (minimal manual QA)

1. Add a catalog item with at least one variant to the shopping plan (non-zero qty). Open shopping list; note labels.

2. Rename ingredient and/or variant in the catalog; save.

3. Hard-reload shopping list (or navigate away and back).

**Expected:** Same logical line item(s) remain with **updated** names/variant labels and correct qty—not blank list, not old names only.

---

## Out of scope for this brief

- Multi-device conflict resolution beyond “no silent wipe.”
- New shopping UX features not present before migration.
- Performance tuning unless correctness is met.

---

## What the author needs from maintainers

Nothing mandatory beyond **calling out exceptions**: if product intentionally diverges from parity, record it here in one sentence so implementation doesn’t chase ghosts.
