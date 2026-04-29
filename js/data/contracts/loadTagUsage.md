# What `loadTagUsage` does

This is a written agreement about the usage card on the tag detail page.
Both the old local database and Supabase must give back the same answer.
This doc is the rulebook.

## Summary

**You ask:** "what uses this tag?"

**You give:** one tag id.

**You get back:** which kind of usage to show, plus the matching rows.

The tag can be used in one of two ways:

- recipe tags show a list of recipes
- ingredient tags show a list of ingredients and variants

This only reads data.
It never creates, edits, hides, or deletes anything.

## What You Ask For

The caller passes a tag id.

If the tag id is missing, zero, negative, or not a number, this function returns the default empty recipe usage card:

```json
{
  "mode": "recipes",
  "recipes": [],
  "ingredients": []
}
```

## What You Get Back

You get one object with:

- **mode** — either `"recipes"` or `"ingredients"`
- **recipes** — a list of recipes when the mode is `"recipes"`
- **ingredients** — a list of ingredients when the mode is `"ingredients"`

The unused list is always empty.

Example recipe result:

```json
{
  "mode": "recipes",
  "recipes": [
    { "id": 12, "title": "Pancakes" }
  ],
  "ingredients": []
}
```

Example ingredient result:

```json
{
  "mode": "ingredients",
  "recipes": [],
  "ingredients": [
    {
      "ingredientId": 3,
      "ingredientName": "Tomato",
      "variantName": "diced",
      "label": "Tomato, diced"
    }
  ]
}
```

## How Mode Is Chosen

The tag's saved `intended_use` decides the mode.

If the saved value is exactly `"ingredients"` after trimming spaces and ignoring upper/lower case, the mode is `"ingredients"`.

Everything else becomes `"recipes"`.
That includes missing, blank, `"recipes"`, or any unexpected value.

If the tag id does not match a saved tag, the mode is `"recipes"` and both lists are empty.

## Recipe Rows

When the mode is `"recipes"`, return every recipe linked to this tag.

Each recipe row has:

- **id** — the recipe id as a number
- **title** — the recipe title as text

If the saved title is missing, it comes back as an empty string.

The recipe list is sorted alphabetically by title, ignoring upper/lower case.

If the same recipe is linked to the tag more than once, it appears only once.

## Ingredient Rows

When the mode is `"ingredients"`, return every ingredient variant linked to this tag.

Each ingredient row has:

- **ingredientId** — the main ingredient id as a number
- **ingredientName** — the main ingredient name, trimmed
- **variantName** — the variant name, trimmed
- **label** — the display label used by the page

The display label is:

- just the ingredient name when there is no variant name
- the ingredient name plus the variant name when there is a variant

The ingredient list is sorted by ingredient name, ignoring upper/lower case.
When two rows have the same ingredient name, sort by variant name, ignoring upper/lower case.

If the same ingredient variant is linked to the tag more than once, it appears only once.

## Empty Results

If nothing uses the tag, the matching list is empty.

For recipe mode:

```json
{
  "mode": "recipes",
  "recipes": [],
  "ingredients": []
}
```

For ingredient mode:

```json
{
  "mode": "ingredients",
  "recipes": [],
  "ingredients": []
}
```

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

The page decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't render the card.
- It doesn't decide the card heading.
- It doesn't navigate to recipes or ingredients when clicked.
- It doesn't create tags.
- It doesn't rename tags.
- It doesn't delete tags.
- It doesn't hide tags.

## Test Scenarios

The test data will live in `js/data/fixtures/loadTagUsage.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios should cover:

1. Missing or invalid tag id.
2. Tag id not found.
3. Recipe mode with no recipes.
4. Recipe mode with one recipe.
5. Recipe mode with multiple recipes sorted by title.
6. Duplicate recipe links are returned once.
7. Missing recipe title becomes an empty string.
8. Ingredient mode with no ingredients.
9. Ingredient mode with one base ingredient variant.
10. Ingredient mode with ingredient and variant names.
11. Ingredient mode with multiple rows sorted by ingredient, then variant.
12. Duplicate ingredient variant links are returned once.
13. Unexpected or blank intended use becomes recipe mode.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether the card should show both recipe and ingredient usage when a tag has both.
- Decide whether ingredient labels should use a different punctuation style.
- Decide whether hidden recipes or hidden ingredients need special handling if those fields are added later.

These do NOT happen during migration.
They are separate jobs for later.