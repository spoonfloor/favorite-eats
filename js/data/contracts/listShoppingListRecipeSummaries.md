# What `listShoppingListRecipeSummaries` does

This is a written agreement about the recipe summary shown on the shopping-list page.
Both the old local database and Supabase must give back the same recipe summary information.
This doc is the rulebook.

## Summary

**You ask:** "given these selected recipes, what should the shopping list show in its recipe summary?"

**You get back:** one short summary row for each selected recipe.

This only reads recipe information.
It never creates, edits, removes, deletes, or saves recipes, shopping-list rows, selected recipes, or serving counts.

## What you ask for

You give it a list of selected recipes.

Each selected recipe may have:

- **recipeId** — the saved recipe id
- **title** — the title already saved with the shopping-plan selection, if there is one
- **servings** — the servings value selected on the recipe page, if there is one

Example:

```json
[
  {
    "recipeId": 10,
    "title": "Pancakes",
    "servings": 4
  }
]
```

Bad entries are skipped.
A bad entry is one with no positive recipe id.

## What you get back

You get a list of summary rows.

Each row has:

- **recipeId** — the saved recipe id
- **title** — the recipe title to show
- **servingsText** — the serving text to show, or an empty string

Example:

```json
[
  {
    "recipeId": 10,
    "title": "Pancakes",
    "servingsText": "4 svg"
  }
]
```

## Title Rules

The title is chosen in this order:

1. The title already saved with the selected recipe, if it is not empty.
2. The current recipe title from the data source, if it is not empty.
3. `Recipe N`, where `N` is the recipe id.

Spaces at the beginning and end are ignored when deciding whether a title is empty.

## Serving Rules

The serving value is chosen in this order:

1. The selected recipe's `servings` value, if it is positive.
2. The recipe's default servings from the data source, if it is positive.
3. Nothing.

If there is no serving value, `servingsText` is an empty string.

If there is a serving value, `servingsText` is the serving value followed by  `svg`.

Whole numbers are shown without decimals.
Non-whole numbers are shown with up to two decimal places.

Examples:

- `4` becomes `4 svg`
- `4.5` becomes `4.5 svg`
- `4.25` becomes `4.25 svg`

## Missing Recipes

If a selected recipe id does not exist anymore, it still gets a summary row.

The title falls back to the saved selected-recipe title, or `Recipe N`.
The serving text can still use the selected recipe's `servings` value.

## Sorting

Rows are sorted by title, ignoring upper/lower case.

If two titles are the same, the lower recipe id comes first.

## When There Are No Selected Recipes

If no valid selected recipes are passed in, the answer is an empty list.

## When Something Goes Wrong

If recipe information cannot be read, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

Bad input entries are not considered data failures.
They are skipped.

## What This Function Does NOT Do

- It doesn't create or edit recipe selections.
- It doesn't save serving counts.
- It doesn't read serving counts from browser storage.
- It doesn't generate shopping-list item rows.
- It doesn't calculate ingredient quantities.
- It doesn't load recipe ingredients, steps, tags, or linked recipes.
- It doesn't decide whether the recipe summary section is expanded or collapsed.

## Test Scenarios

The test data will live in `js/data/fixtures/listShoppingListRecipeSummaries.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios should cover:

1. **No selected recipes** — returns an empty list.
2. **Bad selected recipes** — bad recipe ids are skipped.
3. **Saved title wins** — the selected recipe title is used before the current recipe title.
4. **Recipe title fallback** — the current recipe title is used when the selected recipe has no title.
5. **Missing recipe fallback** — missing recipes still return `Recipe N` when no selected title exists.
6. **Selected servings win** — selected servings are used before recipe default servings.
7. **Default servings fallback** — recipe default servings are used when selected servings are missing.
8. **No servings** — serving text is empty when neither serving value is available.
9. **Serving formatting** — whole and decimal serving values display correctly.
10. **Sorting** — rows are sorted by title, then recipe id.

