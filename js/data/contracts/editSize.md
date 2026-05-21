# What `editSize` does

This is a written agreement about editing one existing size from the size editor. Both ways of saving data, the old local database and the new cloud Supabase database, must behave the same way for this small action.

## What you give it

You give it:

- **id** — the size id to edit
- **name** — the new size name
- **isHidden** — whether the size should be hidden
- **isRemoved** — whether the size should be marked removed
- **oldName** — the size name before this edit, when the caller knows it

The id must be a positive number.

The name is cleaned the same way the size editor cleans it today:

- spaces at the start and end are removed
- repeated spaces become one space
- only the first 64 characters are kept

The final name must not be empty.

## What gets saved

The function changes the size row with that id.

It saves:

- the cleaned name
- hidden as true or false
- removed as true or false

If oldName was given and the name changed, it also changes old size text to the new size text in the same places the old local save changed today:

- ingredient rows
- ingredient size rows
- recipe ingredient substitute rows

## What you get back

You get a small object with one field:

- **id** — the size id that the function was asked to edit

Example:

```json
{ "id": 42 }
```

## When the size is already gone

Editing a valid id that is not in the database is allowed.

The function still returns the id. This matches the old local save path, which did not check whether the row still existed.

## When something goes wrong

If the id is missing, invalid, the name is empty, the name already exists, the database cannot be reached, or the update fails, the function **fails loudly** — it throws.

It does not silently fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not create a new size.
- It does not delete a size.
- It does not ask the user for confirmation.
- It does not write browser-local database bytes. Persistence is through Supabase RPCs when `dataService.useSupabase` is active.

## Test scenarios

The test data lives in `js/data/fixtures/editSize.json`. There are 3 scenarios:

1. **Rename an existing size** — changes the size row and old size text references.
2. **Change hidden and removed flags** — saves those flags without renaming references.
3. **Edit a missing size** — succeeds without changing existing rows.
