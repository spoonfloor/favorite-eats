# What `loadStoreDetail` does

This is a written agreement about loading one store for the Store editor.
Both the old local database and Supabase must give back the same editor baseline.
This doc is the rulebook.

## Summary

**You ask:** "give me the saved editor values for this store."

**You get back:** either one detail object, or `null` when the store cannot be found.

This only reads store information.
It never creates, edits, removes, deletes, renames, or saves anything.

## What you ask for

You give it:

- **storeId** - the saved store id that opened the editor

Bad or missing ids return `null`.

## What you get back

You get one object with:

- **id** - the store id that was requested
- **chain** - the saved chain name
- **location** - the saved location name
- **aisles** - the saved aisles for this store
- **ingredientCatalog** - the shopping items and variants the editor needs while editing aisle rows
- **hasVariantAisleTable** - whether variant-to-aisle links can be saved

Each aisle has:

- **id** - the saved aisle id
- **name** - the saved aisle name
- **itemSpecs** - the saved shopping items assigned to that aisle

Each item spec has:

- **baseName** - the shopping item name
- **baseKey** - the lower-case matching key for the shopping item
- **ingredientId** - the saved shopping item id, when known
- **selectedVariants** - the variant names assigned to this aisle for that item
- **knownVariants** - all known variants for that shopping item

Each known variant has:

- **id** - the saved variant id
- **name** - the variant name
- **isDeprecated** - whether the variant is removed

## Store Fields

The store chain and location come from the requested store row.

If either saved value is missing, it comes back as an empty string.
Spaces are preserved.

## Aisles

Aisles come from `store_locations`.

Only aisles for the requested store are returned.

Aisle order follows:

1. lower saved sort order
2. lower aisle id

Missing sort order behaves like a very large number, so those rows come last.

## Aisle Items

Base item aisle links come from `ingredient_store_location`.

Variant aisle links come from `ingredient_variant_store_location`.
If that table does not exist, variant aisle links are not returned and `hasVariantAisleTable` is `false`.

Hidden or removed shopping items are not returned as aisle items.

Base item links are read before variant links.
If the same base item appears more than once in the same aisle, the first one wins.

Variant names are added to the item's `selectedVariants` list.
Duplicate selected variants are removed case-insensitively.

When a shopping item has one or more **active named catalog variants**, and a base item link and one or more named variant links exist for that item on the same aisle, `selectedVariants` includes the reserved token `any` before the named variants (for example `any`, `white`). That token is aisle-editor-only; it is not a catalog variant name. Saving `(any)` creates a base item aisle link via `save_store_layout`.

When a shopping item has active named catalog variants, and the base link row has persistent **`all_variants`** intent (`true`), `selectedVariants` is the single reserved token `all`, even if a newly added catalog variant has not been materialized to a variant link yet. Saving `(all)` creates a base item aisle link plus a variant aisle link for every non-deprecated catalog variant and records `all_variants = true` on the base link.

Linking every active catalog variant without `all_variants = true` is **not** `(all)`; it round-trips as `(any)` plus the explicit named variants (a snapshot, not set-and-forget intent).

Shopping items with **no** active named catalog variants are never marked `any` or `all` in `selectedVariants`, and `save_store_layout` never sets `all_variants = true` for them. They may still appear on an aisle via a plain base item link with an empty `selectedVariants` list.

Variant order follows the saved variant-aisle links:

1. lower variant-aisle link id
2. lower variant sort order
3. lower variant id

Aisle item order (the `itemSpecs` list within each aisle) follows:

1. lower base item name, case-insensitive ASCII
2. lower ingredient id
3. lower base key

Link insert order and reserved tokens such as `(all)` do not affect aisle item order.

The store editor also re-sorts aisle items A–Z when an aisle item list loses focus (blur) and before save.

## Ingredient Catalog

The Store editor needs a catalog so it can keep typed aisle rows connected to known shopping items and variants.

The catalog includes shopping items from `ingredients` where:

- the name is not blank
- the item is not removed
- the item is not hidden from the shopping list

If two saved rows have the same item name ignoring upper/lower case, the first one in name/id order wins.

Known variants come from `ingredient_variants`.
Blank variants and the reserved `"default"` variant are skipped.

Known variant order follows:

1. lower ingredient id
2. lower variant sort order
3. lower variant id

## Text Fields

Store chain, store location, aisle names, item names, and variant names come back as saved, except where this contract says blank values are skipped.

The matching keys are lower-case and trimmed.

## When There Is No Matching Store

If `storeId` is bad, missing, or does not match a saved store row, return `null`.

Do not return an empty detail object for a missing existing store.

## Errors

If the database cannot be read or Supabase returns an error, this function fails loudly.
It does not silently pretend the store has blank values.

The UI may catch that failure and decide how to recover.

## What this function does NOT do

- It does not save the store.
- It does not create missing aisles.
- It does not validate edited aisle names.
- It does not validate edited item or variant names.
- It does not decide whether the Save button is enabled.

## Test scenarios

The fixture file should cover:

1. Bad or missing id returns `null`.
2. Unknown id returns `null`.
3. Basic store with no aisles.
4. Store with aisles ordered by sort order and id.
5. Store with base item aisle links.
6. Store with variant aisle links.
7. Hidden and removed shopping items are skipped.
8. Duplicate base items in one aisle are de-duplicated.
9. Missing text fields become empty strings.
10. Aisle items are ordered by base name even when link ids are not.
