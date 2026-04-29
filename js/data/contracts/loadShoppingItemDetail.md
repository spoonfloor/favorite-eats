# What `loadShoppingItemDetail` does

This is a written agreement about loading one item for the Shopping Item editor.
Both the old local database and Supabase must give back the same editor baseline.
This doc is the rulebook.

## Summary

**You ask:** "give me the saved editor values for this shopping item."

**You get back:** either one detail object, or `null` when the item cannot be found.

This only reads item information.
It never creates, edits, removes, deletes, renames, hides, or saves anything.

## What you ask for

You give it:

- **ingredientId** — the saved ingredient id that opened the editor
- **itemName** — the item name shown in the UI, if the caller has it

Bad or missing ids return `null`.

The item name is used to gather grouped rows that represent the same shopping item.
This preserves today's behavior where several saved ingredient rows with the same name can be edited as one shopping item.

## What you get back

You get one object with:

- **id** — the ingredient id that was requested
- **name** — the item name from the requested ingredient row
- **variantRows** — the editor's variant rows, including the base row
- **synonymsText** — saved alternate names joined with newlines
- **sizesText** — saved sizes joined with newlines
- **homeLocation** — the base item home location
- **isFood** — whether this item is food
- **isRemoved** — whether this item is removed
- **isHidden** — whether this item is hidden
- **pluralOverride** — the saved plural override text
- **pluralByDefault** — whether this item normally uses plural wording
- **isMassNoun** — whether this item is a mass/substance noun
- **visibility** — which optional editor controls should be shown for this database shape

## Grouping Rows

The requested ingredient row is always considered part of the item.

If `itemName` is provided, all ingredient rows whose names match `itemName` are also considered part of the same item.
Matching ignores upper/lower case.

If no matching rows are found by name, only the requested ingredient id is used.

## Base Item Fields

These fields come from the requested ingredient row:

- `isFood`
- `isRemoved`
- `isHidden`
- `pluralOverride`
- `pluralByDefault`
- `isMassNoun`

If a database column does not exist yet, use today's default:

- missing food flag means `isFood` is `true`
- missing removed flag means `isRemoved` is `false`
- missing hidden flag means `isHidden` is `false`
- missing plural override is an empty string
- missing plural-by-default flag is `false`
- missing mass-noun flag is `false`

If the modern `is_deprecated` field exists, it is the removed flag.
Otherwise, the old `hide_from_shopping_list` field is used as the removed flag.

## Variant Rows

`variantRows` is the list the editor uses for the variant grid.

It always includes one base row first.
The base row has:

- **isBase** — `true`
- **value** — empty string
- **homeLocation** — the base item home location
- **tags** — any tags attached to the base variant
- **variantId** — the saved base variant id, when there is one
- **isDeprecated** — whether the base variant row is removed

Named variant rows come after the base row.
Each named row has:

- **isBase** — `false`
- **value** — the variant name
- **homeLocation** — the variant's home location
- **tags** — tag names attached to that variant
- **variantId** — the saved variant id, when there is one
- **isDeprecated** — whether that variant is removed

Variant rows are read from `ingredient_variants` when that table exists.
Rows from every grouped ingredient id are combined.

Variant order follows saved variant order:

1. base row first
2. lower `sort_order`
3. lower variant id

Duplicate named variants are de-duplicated case-insensitively.
The first one in saved order wins.

The base variant is any missing/blank/default variant row.
The displayed base row value is always empty.

## Variant Home Locations

Home locations are normalized to the Shopping List home-location ids.

Missing, blank, unknown, or old `"measures"` values become `"none"`.

The item's base home location comes from the first saved base variant home location across the grouped rows.
If none is found, it is `"none"`.

When a named variant has no saved home location, it uses `"none"` in the editor row.
The editor may display fallback behavior, but the saved row value remains `"none"`.

## Variant Tags

Variant tags come from `ingredient_variant_tag_map` and `tags`.

Only non-hidden tags with non-blank names are included.

Tag names are trimmed.
Duplicate tag names are removed case-insensitively per variant.
The first one in saved tag order wins.

Tag order follows:

1. lower tag mapping sort order
2. lower tag mapping id
3. tag name alphabetically, ignoring upper/lower case

## Sizes

Sizes come from `ingredient_sizes` when that table exists.
Rows from every grouped ingredient id are combined.

If the size table is missing, old scalar `ingredients.size` values are used.

Blank sizes are skipped.
Duplicate sizes are removed case-insensitively.
The first one in saved order wins.

The returned `sizesText` joins the final size names with newline characters.

## Synonyms

Synonyms come from `ingredient_synonyms`.
Rows from every grouped ingredient id are combined.

Blank synonyms are skipped.
Duplicate synonyms are removed case-insensitively.
The first one in saved order wins.

The returned `synonymsText` joins the final synonym names with newline characters.

## Older Database Shapes

Old databases may not have every table or column.

When `ingredient_variants` is missing, old scalar `ingredients.variant` values are used as named variants.

When `ingredient_sizes` is missing, old scalar `ingredients.size` values are used as sizes.

When optional grammar columns are missing, their default values are returned and the matching editor controls are hidden.

The `visibility` object tells the UI which optional controls should be shown:

- **showPluralOverride**
- **showPluralByDefault**
- **showIsMassNoun**
- **showAnyOverrides**
- **showHiddenToggle**

## When There Is No Matching Item

If `ingredientId` is bad, missing, or does not match a saved ingredient row, return `null`.

Do not return an empty detail object for a missing existing item.

## Errors

If the database cannot be read or Supabase returns an error, this function fails loudly.
It does not silently pretend the item has blank values.

The UI may catch that failure and decide how to recover.

## What this function does NOT do

- It does not save the shopping item.
- It does not create missing variants, sizes, synonyms, or tags.
- It does not validate whether the edited values are allowed.
- It does not migrate old rows into new tables.
- It does not decide whether the Save button is enabled.

## Test scenarios

The fixture file should cover:

1. Bad or missing id returns `null`.
2. Unknown id returns `null`.
3. Basic item with only scalar ingredient fields.
4. Modern item with base variant and named variants.
5. Multiple ingredient rows with the same name are grouped.
6. Variant rows are ordered and de-duplicated.
7. Variant tags are ordered, trimmed, hidden-filtered, and de-duplicated.
8. Base home location comes from the base variant.
9. Unknown home locations normalize to `"none"`.
10. Sizes come from `ingredient_sizes` and are de-duplicated.
11. Old scalar size fallback works.
12. Synonyms are ordered and de-duplicated.
13. Removed flag uses `is_deprecated` when available.
14. Removed flag falls back to `hide_from_shopping_list` on old schemas.
15. Optional grammar control visibility follows available columns.
