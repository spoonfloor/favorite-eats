# What `removeSize` does

This is a written agreement about removing one size from the Sizes page. Both ways of saving data, the old local database and the new cloud Supabase database, must behave the same way for this small action.

## What you give it

You give it:

- **id** — the size id to remove
- **action** — either `"remove"` or `"delete"`

The id must be a positive number.

The Sizes page chooses the action before calling this function:

- `"remove"` means the size is still used somewhere, so it should stay in the database but be marked removed
- `"delete"` means the size is not used, so the size row can be permanently deleted

## What gets saved

If action is `"remove"`, the function marks the size row as removed.

If action is `"delete"`, the function deletes the size row.

## What you get back

You get a small object with one field:

- **id** — the size id that the function was asked to remove

Example:

```json
{ "id": 42 }
```

## When the size is already gone

Removing or deleting a valid id that is not in the database is allowed.

The function still returns the id. This keeps the action safe to retry after a page refresh or a stale list row.

## When something goes wrong

If the id is missing, invalid, the action is not `"remove"` or `"delete"`, the database cannot be reached, or the update/delete fails, the function **fails loudly** — it throws.

It does not silently fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not decide whether a size is used. The caller does that before calling this function.
- It does not rename a size.
- It does not ask the user for confirmation. The caller does that before calling this function.
- It does not write browser-local database bytes. Persistence is through Supabase RPCs when `dataService.useSupabase` is active.

## Test scenarios

The test data lives in `js/data/fixtures/removeSize.json`. There are 3 scenarios:

1. **Remove a used size** — marks the size as removed.
2. **Delete an unused size** — deletes only that size row.
3. **Delete a missing size** — succeeds without changing existing rows.
