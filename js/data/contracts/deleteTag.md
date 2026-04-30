# What `deleteTag` does

This is a written agreement about deleting one tag from the Tags page. Both ways of saving data, the old local database and the new cloud Supabase database, must behave the same way for this small action.

## What you give it

You give it one piece of information:

- **id** — the tag id to delete

The id must be a positive number.

## What gets deleted

The function deletes the tag row with that id.

It also removes the tag from:

- recipes that used that tag
- ingredient variants that used that tag

It does not delete any recipes, ingredients, or ingredient variants.

## What you get back

You get a small object with one field:

- **id** — the tag id that the function was asked to delete

Example:

```json
{ "id": 42 }
```

## When the tag is already gone

Deleting a valid id that is not in the database is allowed.

The function still returns the id. This keeps delete safe to retry after a page refresh or a stale list row.

## When something goes wrong

If the id is missing, invalid, the database cannot be reached, or the delete fails, the function **fails loudly** — it throws.

It does not silently fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not rename a tag.
- It does not hide a tag.
- It does not delete recipes, ingredients, or ingredient variants.
- It does not ask the user for confirmation. The caller does that before calling this function.
- It does not persist SQLite bytes itself. SQLite persistence still happens in the caller while SQLite is the active adapter.

## Test scenarios

The test data lives in `js/data/fixtures/deleteTag.json`. There are 3 scenarios:

1. **Delete an unused tag** — removes only that tag.
2. **Delete a tag with uses** — removes the tag and its recipe and ingredient-variant links.
3. **Delete a missing tag** — succeeds without changing existing rows.
