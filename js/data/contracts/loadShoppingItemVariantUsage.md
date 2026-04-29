# What `loadShoppingItemVariantUsage` does

This is a written agreement about the Shopping Item editor.
Both the old local database and Supabase must give back the same usage details for an item variant.
This doc is the rulebook.

## Summary

**You ask:** "where is this item variant used?"

**You give:** one ingredient id and one variant name.

**You get back:** recipes that use the variant, and store aisles linked to the variant.

This only reads data.
It never creates, edits, hides, removes, deletes, or saves an item, variant, recipe, store, or aisle.

## Why The Page Needs This

When a user tries to remove or delete a variant in the Shopping Item editor, the page needs to know whether that variant is still used.

If recipes or store aisles still use it, the page shows a warning list.

This function only answers the usage question.
It does not decide whether the variant should be marked removed or deleted.

## What You Ask For

The caller passes:

- **ingredientId** — the saved id for the main ingredient
- **variantName** — the variant name being checked

Example:

```json
{
  "ingredientId": 10,
  "variantName": "diced"
}
```

The variant name is trimmed before use.

If the ingredient id is missing, zero, negative, or not a number, the answer is empty.

If the variant name is missing or only spaces, the answer is empty.

## What You Get Back

You get one object:

```json
{
  "recipes": [],
  "aislePlacements": []
}
```

## Recipe Rows

Each recipe row has:

- **id** — the recipe id as a number
- **title** — the recipe title as text

Example:

```json
{
  "recipes": [
    { "id": 12, "title": "Tomato Soup" }
  ],
  "aislePlacements": []
}
```

## What Counts As Recipe Usage

A recipe counts when it references the same ingredient id and the same variant name.

The variant name match ignores upper/lower case and ignores spaces around the saved value.

Both of these count:

- the variant appears directly in the recipe ingredient list
- the variant appears as a substitute for another recipe ingredient

If the same recipe references the variant more than once, it appears only once.

## Recipe Titles

The recipe title comes back as text.

If the saved title is missing, it comes back as an empty string.

Extra spaces around the title are trimmed.

## Recipe Order

Recipes are sorted alphabetically by title, ignoring upper/lower case.

## Aisle Placement Rows

Each aisle placement row has:

- **storeId** — the store id as a number
- **chainName** — the store chain name as text
- **locationName** — the store location name as text
- **aisleId** — the aisle id as a number
- **aisleName** — the aisle name as text

Example:

```json
{
  "recipes": [],
  "aislePlacements": [
    {
      "storeId": 2,
      "chainName": "Market",
      "locationName": "Downtown",
      "aisleId": 5,
      "aisleName": "Produce"
    }
  ]
}
```

## What Counts As Aisle Usage

An aisle counts when that aisle is linked to an ingredient variant row with the same ingredient id and variant name.

The variant name match ignores upper/lower case and ignores spaces around the saved value.

Only variant-to-aisle links count.
Main ingredient aisle links do not count here.

If the same aisle is linked more than once, it appears only once.

## Store And Aisle Text

Store chain name, store location name, and aisle name all come back as text.

If any of those saved values are missing, they come back as empty strings.

Extra spaces around those values are trimmed.

## Aisle Placement Order

Aisle placements are sorted like this:

1. Store chain name, alphabetically, ignoring upper/lower case.
2. Store location name, alphabetically, ignoring upper/lower case.
3. Aisle saved order number, lowest first.
4. Aisle id, lowest first.

If an aisle has no saved order number, it goes after aisles that do have one.

## Empty Results

If nothing uses the variant, both lists are empty:

```json
{
  "recipes": [],
  "aislePlacements": []
}
```

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return empty lists and pretend everything is fine.

The caller decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't load the full shopping item.
- It doesn't list all variants for the item.
- It doesn't decide whether the variant should be removed or deleted.
- It doesn't mark the variant as removed.
- It doesn't delete the variant.
- It doesn't edit recipes.
- It doesn't edit store aisles.

## Test Scenarios

The test data will live in `js/data/fixtures/loadShoppingItemVariantUsage.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios should cover:

1. Missing or invalid ingredient id.
2. Blank variant name.
3. No recipe or aisle usage.
4. One direct recipe usage.
5. One substitute recipe usage.
6. Direct and substitute usage in the same recipe appears once.
7. Multiple recipe usages sorted by title.
8. Missing recipe title becomes an empty string.
9. Variant name matching ignores upper/lower case and surrounding spaces.
10. Same ingredient id but different variant does not count.
11. Same variant name on a different ingredient id does not count.
12. One aisle placement.
13. Multiple aisle placements sorted by store, location, aisle order, then aisle id.
14. Duplicate aisle links appear once.
15. Main ingredient aisle links do not count.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether base/default variants should be checked by this same function.
- Decide whether the page should show recipe line details, not just recipe titles.
- Decide whether the page should show store labels already formatted for display.

These do NOT happen during migration.
They are separate jobs for later.