# What `removeUnit` does

This is a written agreement about removing one unit from the Units page. Both ways of saving data, the old local database and the new cloud Supabase database, must behave the same way for this small action.

## What you give it

You give it:

- **code** — the unit code to remove
- **action** — either `"remove"` or `"delete"`

The code must not be blank.

The Units page chooses the action before calling this function:

- `"remove"` means the unit is still used somewhere, so it should stay in the database but be marked removed
- `"delete"` means the unit is not used, so the unit row can be permanently deleted

## What gets saved

If action is `"remove"`, the function marks the unit row as removed.

If action is `"delete"`, the function deletes the unit row.

## What you get back

You get a small object with one field:

- **code** — the unit code that the function was asked to remove

Example:

```json
{ "code": "cup" }
```

## When the unit is already gone

Removing or deleting a valid code that is not in the database is allowed.

The function still returns the code. This keeps the action safe to retry after a page refresh or a stale list row.

## When something goes wrong

If the code is missing, blank, the action is not `"remove"` or `"delete"`, the database cannot be reached, or the update/delete fails, the function **fails loudly** — it throws.

It does not silently fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not decide whether a unit is used. The caller does that before calling this function.
- It does not rename a unit.
- It does not ask the user for confirmation. The caller does that before calling this function.
- It does not write browser-local database bytes. Persistence is through Supabase RPCs when `dataService.useSupabase` is active.

## Test scenarios

The test data lives in `js/data/fixtures/removeUnit.json`. There are 3 scenarios:

1. **Remove a used unit** — marks the unit as removed.
2. **Delete an unused unit** — deletes only that unit row.
3. **Delete a missing unit** — succeeds without changing existing rows.
