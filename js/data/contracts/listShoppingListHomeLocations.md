# What `listShoppingListHomeLocations` does

This is a written agreement about the Shopping List page.
Both the old local database and Supabase must give back the same home locations for shopping list rows.
This doc is the rulebook.

## Summary

**You ask:** "where at home do these shopping list items belong?"

**You give:** a list of shopping list source keys.

**You get back:** a plain object that maps each requested source key to a home location id.

This only reads data.
It never creates, edits, hides, removes, deletes, or saves an item, variant, recipe, or shopping list row.

## Why The Page Needs This

The Shopping List page can group checklist rows by home location.

The checklist rows already know their item source key, but they still need the saved home location for that item or variant.

This function only answers that lookup.
It does not group the checklist rows.
It does not render the page.

## What You Ask For

The caller passes a list of source keys.

Each source key is text.

There are two kinds of source keys:

- a base item key, like `"tomato"`
- a variant key, made from the item name plus the variant name, like `"tomato"` plus `"diced"`

The app uses its own hidden separator between the item name and variant name.
The caller is responsible for passing the same source key format the Shopping List page already uses.

Example:

```json
[
  "tomato",
  "tomato\u0000diced"
]
```

Source keys are trimmed and matched ignoring upper/lower case.

Blank source keys are ignored.

Duplicate source keys are checked only once.

## What You Get Back

You get a plain object.

Each key is one of the requested source keys.
Each value is the home location id for that source key.

Example:

```json
{
  "tomato": "pantry",
  "tomato\u0000diced": "fridge"
}
```

## Default Location

Every requested source key appears in the result.

If no saved location is found, the value is `"none"`.

## Base Item Location

For a base item source key, use the base variant's saved home location.

The base variant is a variant whose saved variant name is blank or `"default"`.

If both blank and `"default"` exist, use the first one by the saved variant order.

If the saved location is missing or blank, use `"none"`.

## Variant Location

For a variant source key, first look for that exact variant's saved home location.

The variant name match ignores upper/lower case and ignores spaces around the saved value.

If the variant has a saved location, use it.

If the variant is missing, or its saved location is `"none"`, fall back to the base item location.

## Home Location Values

Known home locations are returned as their saved id, such as:

- `"fridge"`
- `"freezer"`
- `"pantry"`
- `"spices"`
- `"fruit stand"`
- `"coffee bar"`
- `"none"`

If a saved value is missing, blank, or unknown, return `"none"`.

## Item Name Matching

The item name part of the source key is matched against the saved ingredient name.

The match ignores upper/lower case and ignores spaces around the saved ingredient name.

It does not match synonyms.

## Order

The result is an object, so it has no meaningful order.

## Empty Input

If the caller gives no source keys, the answer is an empty object:

```json
{}
```

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return `"none"` for everything and pretend everything is fine.

The caller decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't load the shopping list.
- It doesn't load recipe data.
- It doesn't group rows by home location.
- It doesn't render headings.
- It doesn't edit item home locations.
- It doesn't save the shopping list.

## Test Scenarios

The test data will live in `js/data/fixtures/listShoppingListHomeLocations.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios should cover:

1. Empty source key list.
2. Blank and duplicate source keys.
3. Unknown item returns `"none"`.
4. Base item gets base variant home location.
5. Base item with no saved location returns `"none"`.
6. Variant gets its own home location.
7. Variant with `"none"` falls back to base item location.
8. Missing variant falls back to base item location.
9. Matching ignores upper/lower case and surrounding spaces.
10. Unknown saved location becomes `"none"`.
11. Multiple requested source keys in one call.
12. Synonym-only matches do not count.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether synonyms should count for home location lookup.
- Decide whether unknown saved home locations should be shown instead of becoming `"none"`.
- Decide whether the data service should return already-grouped shopping list rows.

These do NOT happen during migration.
They are separate jobs for later.