# What `createSize` does

This is a written agreement about creating one new size from the Sizes page. Both ways of saving data, the old local database and the new cloud Supabase database, must behave the same way for this small action.

## What you give it

You give it one piece of information:

- **name** — the size name to create

The name is cleaned the same way the Sizes page cleans it today:

- spaces at the start and end are removed
- repeated spaces inside the name become one space
- only the first 64 characters are kept

The final name must not be empty.

## What gets saved

The function creates one row in the sizes table.

It saves:

- the cleaned name
- the next saved order number after the current largest saved order number
- hidden as `false`
- removed as `false`

It does not create or update any recipe, ingredient, shopping item, or other size rows.

## What you get back

You get a small object with one field:

- **id** — the positive number the database assigned to the new size

Example:

```json
{ "id": 42 }
```

The caller should use that id when opening the size editor.

## When something goes wrong

If the name is empty, already exists, the database cannot be reached, the insert fails, or the database does not return a valid id, the function **fails loudly** — it throws.

It does not silently create a fake id.
It does not fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not rename an existing size.
- It does not hide, remove, or delete a size.
- It does not update recipes or ingredients that use a size.
- It does not write browser-local database bytes. Persistence is through Supabase RPCs when `dataService.useSupabase` is active.

## Test scenarios

The test data lives in `js/data/fixtures/createSize.json`. There are 3 scenarios:

1. **Create in an empty database** — returns the id assigned to the first size.
2. **Create after existing sizes** — returns the next assigned id and uses the next saved order number.
3. **Clean the name before saving** — trims and collapses spaces before saving.
