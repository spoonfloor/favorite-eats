# Recipe Ingredient Amount Model

`js/recipeIngredientAmountModel.js` is the canonical client-side model for
recipe ingredient amount semantics.

It is responsible for interpreting recipe amount rows as one of:

- **scalar** — one positive numeric amount, such as `1` or `1.5`
- **range** — explicit min/max endpoint data, such as `1 to 2`
- **text** — unquantified text, such as `a pinch`

## Canonical Rules

Scalar quantity wins over stale endpoint data. If a row has `quantity: "1"`
and stale `quantity_min: 1`, `quantity_max: 2`, the row is scalar `1`.

Range endpoints are meaningful only when the row is not a parseable scalar and
the amount is explicitly range-like or approximate.

Plain text amounts do not produce shopping quantities and must not carry stale
numeric endpoints forward.

## Required Consumers

These paths must delegate to `favoriteEatsRecipeIngredientAmountModel` instead
of reimplementing raw column precedence:

- recipe editor prefill/display
- recipe save payload construction
- Items recipe-derived quantities
- Shopping List plan-row quantities

Do not add new `quantity_max -> quantity_min -> quantity` precedence logic.

## Server Boundary

The database also enforces this invariant through
`catalog.canonicalize_recipe_amount_columns()` triggers on:

- `catalog.recipe_ingredient_map`
- `catalog.recipe_subrecipe_links`

Any writer that stores a scalar quantity must leave min/max equal to that scalar.
