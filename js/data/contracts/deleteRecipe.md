# What `deleteRecipe` does

This is a written agreement about deleting one recipe. Both ways of saving data (the old local database, and the new cloud Supabase) must behave the same way for this one action.

## What you give it

You give it one piece of information:

- **id** — the recipe id to delete

The id must be a positive number.

## What gets deleted

The function deletes the recipe row with that id.

It also removes rows that belong only to that recipe:

- recipe tags
- recipe steps
- recipe sections
- recipe ingredient rows
- ingredient substitute rows attached to those ingredient rows
- recipe ingredient headings

If another recipe has an ingredient row that links to the deleted recipe, that other recipe is kept. The link to the deleted recipe is cleared.

## What you get back

You get a small object with one field:

- **id** — the recipe id that the function was asked to delete

Example:

```json
{ "id": 42 }
```

## When the recipe is already gone

Deleting a valid id that is not in the database is allowed.

The function still returns the id. This keeps delete safe to retry after a page refresh or a stale list row.

## When something goes wrong

If the id is missing, invalid, the database cannot be reached, or the delete fails, the function **fails loudly** — it throws.

It does not silently fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not delete ingredients, tags, units, stores, or shopping-list data.
- It does not save edits to a recipe.
- It does not ask the user for confirmation. The caller does that before calling this function.
- It does not persist SQLite bytes itself. SQLite persistence still happens in the caller while SQLite is the active adapter.

## Test scenarios

The test data lives in `js/data/fixtures/deleteRecipe.json`. There are 3 scenarios:

1. **Delete a simple recipe** — removes only that recipe.
2. **Delete a recipe with dependent rows** — removes the recipe and rows owned by it.
3. **Delete a missing recipe** — succeeds without changing existing rows.
