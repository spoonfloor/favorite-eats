# What `createUnit` does

This is a written agreement about creating one new unit from the Units page. The Supabase adapter inserts into `catalog.units`.

## What you give it

You give it:

- **nameSingular** — the singular display name for the unit
- **code** — the unit code, if the user entered one

The singular name must not be blank.

If the code is blank, the function uses the singular name as the code. This matches the old Add dialog behavior.

## What gets saved

The function creates one unit row.

The new row gets:

- the cleaned code
- the cleaned singular name
- an empty plural name
- plural override off and null override text
- quantity rounding preset `nearest_eighth` with null step and mode
- an empty category
- the next sort order after the current largest unit sort order, when that can be worked out
- hidden set to no
- removed set to no

## What you get back

You get a small object with one field:

- **code** — the saved unit code

Example:

```json
{ "code": "cup" }
```

## When something goes wrong

If the singular name is missing, the database cannot be reached, or the insert fails, the function **fails loudly** — it throws.

It does not silently fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not edit an existing unit.
- It does not ask the user for confirmation. The caller does that before calling this function.

## Test scenarios

The test data lives in `js/data/fixtures/createUnit.json`. There are 3 scenarios:

1. **Create with an explicit code** — saves the provided code and appends sort order.
2. **Create with a blank code** — uses the singular name as the code.
3. **Create as the first unit** — uses sort order 1.
