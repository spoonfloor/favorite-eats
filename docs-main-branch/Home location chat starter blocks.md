Home location chat starter blocks

Use one block per chat.

Each block repeats the same intro on purpose, so you can copy/paste any section by itself without needing to edit it first.

The prompts below are intentionally opinionated. They do not just ask for ideas; they push toward the model and scope we already chose.

## 1. Remove old single field

```text
We're changing ingredient home locations to be per variant instead of one value on the top-level item.

The old single home location field is going away. Every item will have a special always-present "Base item" row, and existing home location values will migrate there. Named variants can each have their own home location. Search and home-location filtering should show the plain item name when the match comes from Base item, and show item + variant when a specific variant is the reason for the match. For v1, paste only needs to work in the Variant column. In the shopping list context, using the label "any" for the base case is intentional and good.

I want to focus this chat on one rule only:

The old single home location field goes away.

Please take that as a decision, not an open question. I want practical guidance on how to fully remove it without leaving behind confusing partial behavior, shadow logic, or dual sources of truth. Please focus on what has to change, what should be deleted, what should be migrated, and what risks usually show up when teams try to keep the old and new model alive at the same time.
```

## 2. Base item row exists for every item

```text
We're changing ingredient home locations to be per variant instead of one value on the top-level item.

The old single home location field is going away. Every item will have a special always-present "Base item" row, and existing home location values will migrate there. Named variants can each have their own home location. Search and home-location filtering should show the plain item name when the match comes from Base item, and show item + variant when a specific variant is the reason for the match. For v1, paste only needs to work in the Variant column. In the shopping list context, using the label "any" for the base case is intentional and good.

I want to focus this chat on one rule only:

Every item gets a "Base item" row.

Please treat that as settled and help me pressure-test the implications. I want recommendations on how this row should behave, whether it should always exist even when there are no named variants, how visible and editable it should be, and how to avoid letting it drift into feeling like just another normal variant.
```

## 3. Home lives on rows

```text
We're changing ingredient home locations to be per variant instead of one value on the top-level item.

The old single home location field is going away. Every item will have a special always-present "Base item" row, and existing home location values will migrate there. Named variants can each have their own home location. Search and home-location filtering should show the plain item name when the match comes from Base item, and show item + variant when a specific variant is the reason for the match. For v1, paste only needs to work in the Variant column. In the shopping list context, using the label "any" for the base case is intentional and good.

I want to focus this chat on one rule only:

Home location now lives on rows:
- Base item can have a home location
- Each named variant can have its own home location

Please assume this model is the right direction and help me make it robust. I want clear thinking on how simple the storage model can stay, what awkward edge cases this row-based setup creates, and what choices will keep the behavior understandable for users instead of technically clever but confusing.
```

## 4. Base item is special in the editor

We're changing ingredient home locations to be per variant instead of one value on the top-level item.

The old single home location field is going away. Every item has a special always-present "Base item" row, and home location now lives on rows. Base item can have a home location, and each named variant can have its own home location. Search and home-location filtering should show the plain item name when the match comes from Base item, and show item + variant when a specific variant is the reason for the match. For v1, paste only needs to work in the Variant column. In the shopping list context, using the label "any" for the base case is intentional and good.

Implementation note: step 3 is already landed enough that the editor now shows Base item as a distinct row, includes a Home location column on rows, removes the old standalone Base home field, and persists home locations per row. So for this chat, please treat step 4 as a refinement / hardening pass on the editor UX, not as a from-scratch design.

I want to focus this chat on one rule only:

"Base item" is always present.
It is not a normal user variant.
It should be shown as "Base item" in the editor.

Please give me strongly opinionated UX guidance. I want recommendations on:

- whether the current Base row treatment is visually strong enough
- what should change so Base item feels like the anchor row rather than just row 1
- where it should sit
- what users can and cannot do to it
- what copy or affordances should change now that home lives on rows
- how to make it obvious that it is the default item-level row with optional variant overrides, not just another variant somebody typed in

Please optimize for "obvious and boring" over "technically elegant." I want Base item to read as the anchor/default row for the item, with named variants as overrides.

## 5. Migrate existing values into Base item

```text
We're changing ingredient home locations to be per variant instead of one value on the top-level item.

The old single home location field is going away. Every item will have a special always-present "Base item" row, and existing home location values will migrate there. Named variants can each have their own home location. Search and home-location filtering should show the plain item name when the match comes from Base item, and show item + variant when a specific variant is the reason for the match. For v1, paste only needs to work in the Variant column. In the shopping list context, using the label "any" for the base case is intentional and good.

I want to focus this chat on one rule only:

Existing home locations migrate to the "Base item" row.

Please sketch a robust migration plan that assumes real-world messy data. I want concrete advice on sequencing, validation, safety checks, rollback thinking, and how to avoid ending up with half-migrated records or ambiguous results after the move.
```

## 6. Search and filter labeling

```text
We're changing ingredient home locations to be per variant instead of one value on the top-level item.

The old single home location field is going away. Every item will have a special always-present "Base item" row, and existing home location values will migrate there. Named variants can each have their own home location. Search and home-location filtering should show the plain item name when the match comes from Base item, and show item + variant when a specific variant is the reason for the match. For v1, paste only needs to work in the Variant column. In the shopping list context, using the label "any" for the base case is intentional and good.

I want to focus this chat on one rule only:

Search / home-location filtering:
- If the match comes from Base item, show just the item name
- If the match comes from one named variant, show the item with that variant

Please refine this into a clean labeling policy, but stay aligned with the spirit above: plain names when the base case matches, variant labels only when they add real value. I especially want recommendations for multi-match cases so the UI stays readable instead of turning into noisy parenthetical soup.
```

## 7. Keep paste/import narrow in v1

```text
We're changing ingredient home locations to be per variant instead of one value on the top-level item.

The old single home location field is going away. Every item will have a special always-present "Base item" row, and existing home location values will migrate there. Named variants can each have their own home location. Search and home-location filtering should show the plain item name when the match comes from Base item, and show item + variant when a specific variant is the reason for the match. For v1, paste only needs to work in the Variant column. In the shopping list context, using the label "any" for the base case is intentional and good.

I want to focus this chat on one rule only:

First version of paste/import:
- Paste is supported for the Variant column only
- Users can paste a list of variant names, one per line
- Home location is filled in separately in the Home location column

Please keep the answer opinionated and biased toward shipping a simple v1. I do not want an over-engineered import system yet. I want recommendations on keyboard flow, table behavior, and the smallest useful paste behavior that will still feel good in practice.
```

## 8. Clean up messy variant names during migration

```text
We're changing ingredient home locations to be per variant instead of one value on the top-level item.

The old single home location field is going away. Every item will have a special always-present "Base item" row, and existing home location values will migrate there. Named variants can each have their own home location. Search and home-location filtering should show the plain item name when the match comes from Base item, and show item + variant when a specific variant is the reason for the match. For v1, paste only needs to work in the Variant column. In the shopping list context, using the label "any" for the base case is intentional and good.

I want to focus this chat on one rule only:

Migration cleanup:
- Trim messy whitespace from variant names
- Treat obvious case-only duplicates as the same variant
- Prevent collisions with the reserved internal Base item key

Please help me define cleanup rules that are conservative, boring, and safe. I want the migration to reduce mess without inventing surprising changes, silently rewriting too much user intent, or turning edge cases into support headaches later.
```
