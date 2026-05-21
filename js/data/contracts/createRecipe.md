# What `createRecipe` does

This is a written agreement about creating one new recipe. Both ways of saving data (the old local database, and the new cloud Supabase) must behave the same way for this one small action.

## What you give it

You give it one piece of information:

- **title** — the name of the recipe to create

The title must not be empty after trimming spaces from the ends.

## What gets saved

The function creates one row in the recipes table.

It saves:

- the trimmed title
- a smallest serving count of `0.5`
- a largest serving count of `99`

It does not create tags, ingredients, steps, sections, notes, or any other recipe detail rows. Those are separate save work and are not part of this slice.

## What you get back

You get a small object with one field:

- **id** — the positive number the database assigned to the new recipe

Example:

```json
{ "id": 42 }
```

The caller should use that id when opening the new recipe.

## When something goes wrong

If the title is empty, the database cannot be reached, the insert fails, or the database does not return a valid id, the function **fails loudly** — it throws.

It does not silently create a fake id.
It does not fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not save a full recipe.
- It does not update an existing recipe.
- It does not create placeholder ingredients or steps.
- It does not write browser-local database bytes. Persistence is through Supabase RPCs when `dataService.useSupabase` is active.

## Test scenarios

The test data lives in `js/data/fixtures/createRecipe.json`. There are 3 scenarios:

1. **Create in an empty database** — returns the id assigned to the first recipe.
2. **Create after existing recipes** — returns the next assigned id without touching existing recipes.
3. **Trim the title before saving** — saves the trimmed title and returns the assigned id.
