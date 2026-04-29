# What `listShoppingPlanRecipeItems` does

This is a written agreement about the recipe part of the shopping plan.
Both the old local database and Supabase must give back the same recipe-derived shopping items.
This doc is the rulebook.

## Summary

**You ask:** "given these selected recipes, what ingredient items should be added to the shopping plan?"

**You get back:** a list of item quantities that came from recipes.

Each row says:

- which shopping-plan item it belongs to
- the item name
- the variant name, if any
- the display label
- the total quantity needed

This only reads data.
It never creates, edits, removes, deletes, or saves a recipe, item, or shopping plan.

## What you ask for

You give it a list of selected recipes.

Each selected recipe has:

- **recipeId** — the saved id for the recipe
- **quantity** — how many times that recipe is selected
- **title** — the title already stored in the shopping plan, if any
- **servings** — the serving count chosen for that recipe, if any

Example:

```json
[
  {
    "recipeId": 10,
    "quantity": 2,
    "title": "Pancakes",
    "servings": 4
  }
]
```

## What you get back

You get a list.
Each row has:

- **key** — the shopping-plan key for this item and variant
- **name** — the ingredient name
- **variantName** — the ingredient variant, or an empty string
- **label** — the display label
- **quantity** — the total amount needed

Example:

```json
[
  {
    "key": "flour|all-purpose",
    "name": "flour",
    "variantName": "all-purpose",
    "label": "flour (all-purpose)",
    "quantity": 4
  }
]
```

## Which Selected Recipes Count

A selected recipe counts only when:

- it has a real positive recipe id
- its selected quantity is a real positive number
- the recipe exists

Bad recipe ids are skipped.
Missing recipes are skipped.
Zero, negative, missing, or non-number selected quantities are skipped.

## Which Recipe Ingredients Count

An ingredient row from a recipe counts only when:

- it is an ingredient row, not a heading row
- it has a real name
- it has a usable quantity

Heading rows are skipped.
Ingredient rows with no name are skipped.
Ingredient rows with no usable quantity are skipped.

## Ingredient Quantities

The ingredient quantity uses the same rule the app uses today:

1. If the row has a positive maximum quantity, use that.
2. Otherwise, if the row has a positive minimum quantity, use that.
3. Otherwise, if the row's normal quantity can be read as a positive number, use that.
4. Otherwise, skip the row.

For example:

- max `3` uses `3`
- min `2` with no max uses `2`
- quantity `"1.5"` uses `1.5`
- quantity `"a pinch"` is skipped for this recipe-plan read

## Recipe Quantity

If the selected recipe quantity is `2`, every counted ingredient from that recipe is doubled.

If the selected recipe quantity is `0`, negative, missing, or not a number, that recipe is skipped.

## Serving Changes

If the selected serving count is a positive number, and the recipe has a positive default serving count, ingredient quantities are scaled.

For example:

- a recipe normally serves 4
- the selected serving count is 8
- every counted ingredient is doubled

If the selected serving count is missing or invalid, no serving scaling is applied.

If the recipe's default serving count is missing or invalid, no serving scaling is applied.

## Linked Recipes

Some recipe ingredient rows point to another recipe.
Those linked recipes are expanded too.

Linked recipe expansion follows these rules:

- linked recipes are followed up to two levels deep
- a linked recipe with a bad id is skipped
- a missing linked recipe is skipped
- a recipe already seen in the same chain is skipped, so loops do not run forever
- the linked recipe's ingredients are multiplied by the parent row's quantity

For example:

- Chili uses 2 batches of "Bean Mix"
- Bean Mix uses 3 cups beans
- Selecting 1 Chili adds 6 cups beans

## Item Keys

The `key` identifies the shopping-plan item and variant.

When the ingredient row can be matched to a saved item variant id, the key uses that saved variant id.

When no saved variant id is available, the key uses the item name and variant name.

This preserves today's behavior, where renamed variants can keep their selected shopping-plan identity.

## Item Names And Variants

The returned `name` is the ingredient name from the recipe row, trimmed.

The returned `variantName` is the variant from the recipe row, trimmed.

If there is no variant, `variantName` is an empty string.

Rows with the same key are combined.

## Labels

The label is what the shopping plan shows for this item:

- if there is no variant, the label is the item name
- if there is a variant, the label is `name (variant)`

For example:

- `"flour"` becomes `"flour"`
- `"flour"` with variant `"all-purpose"` becomes `"flour (all-purpose)"`

## Order Of The Returned List

The order is the same order produced by today's shopping-plan recipe expansion.

The caller may sort or group the rows later when drawing the final shopping list.

## When There Are No Matching Items

You get an empty list: `[]`.

## When Something Goes Wrong

If the recipe data cannot be read, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

Bad selected-recipe entries are not considered data failures.
They are skipped.

## What This Function Does NOT Do

- It doesn't read directly selected shopping items.
- It doesn't save the shopping plan.
- It doesn't save selected recipes.
- It doesn't create shopping-list checklist rows.
- It doesn't group items by store, aisle, or home location.
- It doesn't format final shopping-list text.
- It doesn't mark anything checked or unchecked.
- It doesn't edit recipe servings.
- It doesn't create, edit, or delete recipes.
- It doesn't create, edit, or delete ingredients.

## Test Scenarios

The test data will live in `js/data/fixtures/listShoppingPlanRecipeItems.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios should cover:

1. **No selected recipes** — returns an empty list.
2. **Bad selected recipe entries** — bad ids and bad quantities are skipped.
3. **Missing recipe** — missing recipes are skipped.
4. **One recipe ingredient** — a simple recipe produces one shopping-plan item.
5. **Multiple recipe quantity** — selecting a recipe twice doubles its ingredients.
6. **Quantity max wins** — maximum quantity is used before minimum or normal quantity.
7. **Quantity min is fallback** — minimum quantity is used when maximum is missing.
8. **Normal numeric quantity is fallback** — numeric quantity text is used when min and max are missing.
9. **Non-numeric quantity is skipped** — text like `"a pinch"` does not produce a row.
10. **Serving scaling** — selected servings scale quantities when default servings are known.
11. **Same item combines** — repeated item keys are added together.
12. **Variants stay separate** — different variants produce different keys.
13. **Linked recipe expands** — a recipe ingredient that links to another recipe adds the linked recipe's ingredients.
14. **Linked recipe quantity multiplies** — linked recipe rows are multiplied by the parent row quantity.
15. **Linked recipe depth limit** — links stop after two levels.
16. **Linked recipe loop is skipped** — circular links do not run forever.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether text quantities like `"a pinch"` should appear in the generated shopping plan.
- Decide whether linked recipes should expand more than two levels.
- Decide whether final shopping-list formatting should live behind the data door too.

These do NOT happen during migration.
They are separate jobs for later.