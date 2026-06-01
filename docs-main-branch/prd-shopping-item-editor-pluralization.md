# PRD: Shopping item editor — pluralization & substance UI

**Status:** UX spec locked (see below). Implementation partial.

**Goal:** Let users understand and control how an item’s singular/plural/substance behavior shows up in the catalog and downstream surfaces, without fighting invisible grammar state.

---

## Decisions (for the next implementer)

These are agreed elsewhere or in thread; they are **not** fully spelled out in the UX paragraphs below.

### Data & Supabase

- `**use_plural_override`** (`boolean NOT NULL`, default `false`) added on `**public.ingredients`** via migration  
`supabase/migrations/20260502143000_ingredients_use_plural_override.sql`.
- **Backfill:** `use_plural_override = true` where `plural_override` is non-null and `trim(plural_override)` is non-empty; otherwise `false`.
- **Semantics:** When `use_plural_override` is **false**, plural resolution should **not** apply `plural_override` (derive plural from lemma/name + rules). When **true**, `plural_override` is authoritative. Turning override **off** should **clear** `plural_override` (aligns with “clearing” user intent).
- **RLS:** Off for this project by design — no policy work for new columns.
- **App layer not done in this PRD’s DB step:** `supabaseAdapter` load/save, `getIngredientNounDisplay` (or equivalent), shopping editor UI — must respect `use_plural_override` when implemented.

### UX / product (locked intent)

- **No separate “Auto” on singular:** one editable **name/singular** field; no dual mode for singular beyond substance relabeling.
- **“Use override”** is the explicit **engaged/not engaged** switch for custom plural; empty override + off = fully derived plural.
- **Lemma** stays derived / aligned with **canonical name** per existing rules — user does not edit lemma as its own field in this design.
- **Substance** mode hides plural-related controls (plural field, use override, plural by default), not only visually collapsing the title.

### Out of scope for this document

- Exact strings for every edge case (whitespace-only plural, etc.) — follow blur rules below and add validation in implementation.
- Multi-language pluralization.
- Changing recipe-line ingredient UX unless explicitly scheduled.

---

## Feature specification (locked copy)

### New item

When a user creates a new item, they enter a string. They might mean it as a singular word (spatula), a plural word (tomatoes), or something that behaves like a substance (rice). The first time they open the editor, the app can interpret that string using the same rules we already rely on.

### UI

First, there’s a title, usually showing both the singular and plural forms. Under that you have the item name field. For normal countable ingredients it’s labeled “Singular”. For substances it’s the same field but labeled “Name”.

When it’s not a substance, you also see a Plural field and three toggles: Use override (whether or not the custom plural is actually in play), Plural by default (same idea as today; prefer the plural wording in places like the items list), and Is a substance.

### Title

Usually the title shows two parts: singular and plural, populated using our existing rules (melon becomes melon and melons, tomatoes becomes tomato and tomatoes, and so on). If “Is a substance” is on, the title shrinks to one word, e.g., rice.

You don’t type directly into the title. You tap it to jump to the right box: on apple/apples, tapping apple drops focus into the singular field; tapping apples drops focus into the plural field. If there’s only one word in the title, tapping it focuses the name/singular field.

### Changing the canonical name

Editing the name/singular string changes the canonical item name; we continue to use the same rules to set the relationship between the lemma and the canonical name. For example, if someone changes the singular apple to orange, the plural updates to oranges (assuming the override is off).

### Plural and Use override

When override is off and there isn’t a saved custom plural, the plural box shows whatever the app would generate automatically. It should be styled to look ‘soft’ and distinct from user content until they engage.

When they focus the plural box, we drop in the auto plural as a starting point for the edit session.

When they leave the plural field: if the text still matches the automatic plural (including if they focused the field but didn’t change anything), leave Use override off. If they changed it from that automatic plural, turn Use override on and save that text as the override. If they later turn Use override off, clear the stored override and show the automatic plural again.

### Plural by default

Same as now. When this is on, places like the items list that have no associated quantity show the plural form.

### Is a substance

When this is on, the UI reduces to just the name/singular field (labelled “Name”) and the “Is a substance” toggle, and the plural field and other toggles are hidden.

---

## Implementation checklist (for agents)

1. **DB:** Migration applied on hosted Supabase (already in repo).
2. **Adapter:** Read/write `use_plural_override` on shopping item load/save.
3. **Rendering:** Apply `plural_override` only when `use_plural_override` is true; otherwise derive.
4. **UI:** Match locked sections above; wire blur/focus and toggle clearing behavior.
5. **Contracts:** Update `loadShoppingItemDetail` / save contracts when fields are wired.

---

## Open questions (none for UX — parked for implementation)

- Exact comparison rules for “matches the automatic plural” (case-folding, unicode normalization).