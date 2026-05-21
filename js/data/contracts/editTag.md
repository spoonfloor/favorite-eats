# What `editTag` does

This is a written agreement about renaming one existing tag from the tag editor. Both ways of saving data, the old local database and the new cloud Supabase database, must behave the same way for this small action.

## What you give it

You give it:

- **id** — the tag id to rename
- **name** — the new tag name

The id must be a positive number.

The name is cleaned the same way the tag editor cleans it today:

- spaces at the start and end are removed
- only the first 48 characters are kept

The final name must not be empty.

## What gets saved

The function changes the name of the tag with that id.

It does not change whether the tag is for recipes or ingredients.
It does not change which recipes or ingredient variants use the tag.

## What you get back

You get a small object with one field:

- **id** — the tag id that the function was asked to rename

Example:

```json
{ "id": 42 }
```

## When the tag is already gone

Renaming a valid id that is not in the database is allowed.

The function still returns the id. This matches the old local save path, which did not check whether the row still existed.

## When something goes wrong

If the id is missing, invalid, the name is empty, the name already exists, the database cannot be reached, or the update fails, the function **fails loudly** — it throws.

It does not silently fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not create a new tag.
- It does not delete a tag.
- It does not hide a tag.
- It does not attach or detach the tag from recipes or ingredients.
- It does not ask the user for confirmation.
- It does not write browser-local database bytes. Persistence is through Supabase RPCs when `dataService.useSupabase` is active.

## Test scenarios

The test data lives in `js/data/fixtures/editTag.json`. There are 3 scenarios:

1. **Rename an existing tag** — changes only that tag name.
2. **Clean the name before saving** — trims and clips the name before saving.
3. **Rename a missing tag** — succeeds without changing existing rows.
