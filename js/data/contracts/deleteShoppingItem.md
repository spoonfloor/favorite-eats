# What `deleteShoppingItem` does

This is the written agreement for the Shopping page's "remove item" gesture
(Cmd/Ctrl-click or right-click on a shopping row). The data service handles
both the soft-remove case (the item is still used in some recipes, so we just
hide it) and the hard-delete case (the item is unused, so we remove it from
the database for real).

## What you give it

You give it:

- **name** — the shopping item name to act on
- **action** — either `"remove"` or `"delete"`

The name must not be blank. Matching against the database is case-insensitive
on the trimmed name.

The Shopping page chooses the action before calling this function:

- `"remove"` means at least one recipe still references this item, so the
  ingredient row(s) must stay in the database but be marked deprecated so the
  Shopping list hides them.
- `"delete"` means no recipe references this item, so the ingredient row(s)
  can be permanently deleted along with their dependent rows.

## What gets saved

If action is `"remove"`, the function marks every matching ingredient row as
deprecated (`is_deprecated = 1`). It does not delete anything.

If action is `"delete"`, the function deletes every matching ingredient row.
The catalog schema cascades that delete to:

- `ingredient_sizes`
- `ingredient_store_location`
- `ingredient_synonyms`
- `ingredient_variants` (and via them `ingredient_variant_store_location` and
  `ingredient_variant_tag_map`)
- `recipe_ingredient_substitutes`

`recipe_ingredient_map.ingredient_id` is set to `NULL` rather than cascading,
but the caller has already verified there are no recipe references, so no
matching rows should exist.

## What you get back

You get a small object with one field:

- **name** — the shopping item name that the function was asked to act on,
  trimmed.

Example:

```json
{ "name": "apple" }
```

## When the item is already gone

Calling either action on a name that does not match any ingredient row is
allowed. The function still returns the name. This keeps the action safe to
retry after a page refresh or a stale list row.

## When something goes wrong

If the name is missing or blank, the action is not `"remove"` or `"delete"`,
the database cannot be reached, or any update or delete fails, the function
**fails loudly** — it throws.

## What this function does NOT do

- It does not decide whether an item is used. The caller does that with
  `listShoppingItemRecipeUsage` before calling this function.
- It does not ask the user for confirmation. The caller does that before
  calling this function.
- It does not refresh the Shopping list UI. The caller reloads after a
  successful return.
