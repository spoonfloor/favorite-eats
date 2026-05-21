# What `createTag` does

This is a written agreement about creating one new tag from the Tags page. Both ways of saving data, the old local database and the new cloud Supabase database, must behave the same way for this small action.

## What you give it

You give it:

- **name** — the tag name to create
- **intendedUse** — whether the tag is meant for recipes or ingredients

The name is cleaned the same way the Tags page cleans it today:

- spaces at the start and end are removed
- only the first 48 characters are kept

The final name must not be empty.

If intended use is exactly `"ingredients"`, the tag is saved for ingredients. Anything else is saved for recipes.

## What gets saved

The function creates one row in the tags table.

It saves:

- the cleaned name
- the next saved order number after the current largest saved order number
- the intended use, either `"recipes"` or `"ingredients"`
- hidden as `false`

It does not attach the tag to any recipe or ingredient.

## What you get back

You get a small object with one field:

- **id** — the positive number the database assigned to the new tag

Example:

```json
{ "id": 42 }
```

## When something goes wrong

If the name is empty, already exists, the database cannot be reached, the insert fails, or the database does not return a valid id, the function **fails loudly** — it throws.

It does not silently create a fake id.
It does not fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not rename an existing tag.
- It does not hide or delete a tag.
- It does not attach the tag to a recipe or ingredient.
- It does not write browser-local database bytes. Persistence is through Supabase RPCs when `dataService.useSupabase` is active.

## Test scenarios

The test data lives in `js/data/fixtures/createTag.json`. There are 4 scenarios:

1. **Create a recipe tag in an empty database** — returns the id assigned to the first tag.
2. **Create an ingredient tag** — saves the tag for ingredients.
3. **Create after existing tags** — returns the next assigned id and uses the next saved order number.
4. **Clean the name before saving** — trims the name before saving.
