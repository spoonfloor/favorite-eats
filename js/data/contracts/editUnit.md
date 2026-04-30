# What `editUnit` does

This is a written agreement about saving changes to one existing unit from the unit editor. Both ways of saving data, the old local database and the new cloud Supabase database, must behave the same way for this small action.

## What you give it

You give it:

- **oldCode** — the current unit code
- **code** — the code to save
- **nameSingular** — the singular display name to save
- **namePlural** — the plural display name to save
- **isHidden** — whether the unit should be hidden from normal lists
- **isRemoved** — whether the unit should be marked removed

The old code and new code must not be blank.

The editor cleans the codes before saving: it trims spaces and lowercases them.

## What gets saved

The function updates the unit row with the new code, singular name, plural name, hidden flag, and removed flag.

If the code changed, the function also updates existing recipe ingredient rows and substitute rows that used the old code, so recipes continue pointing at the renamed unit.

## What you get back

You get a small object with one field:

- **code** — the saved unit code

Example:

```json
{ "code": "cup" }
```

## When the unit is missing

Editing a valid code that is not in the database is allowed.

The function still returns the saved code. This matches the old local behavior, where an update that matches no rows does not throw.

## When something goes wrong

If the old code is missing, the new code is missing, the database cannot be reached, or the update fails, the function **fails loudly** — it throws.

It does not silently fall back to another database when Supabase is the chosen data door.

## What this function does NOT do

- It does not create a new unit.
- It does not decide whether the new code is a duplicate. The caller checks that before calling this function.
- It does not ask the user for confirmation. The caller does that before calling this function.
- It does not persist SQLite bytes itself. SQLite persistence still happens in the caller while SQLite is the active adapter.

## Test scenarios

The test data lives in `js/data/fixtures/editUnit.json`. There are 3 scenarios:

1. **Rename a unit code** — updates the unit row and recipe references.
2. **Change labels and flags only** — updates names and flags without touching recipe references.
3. **Edit a missing unit** — succeeds without changing existing rows.
