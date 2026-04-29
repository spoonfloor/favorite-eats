# What `listSizes` does

This is a written agreement about the Sizes page.
Both the old local database and Supabase must give back the same size list.
This doc is the rulebook.

## Summary

**You ask:** "give me the sizes for the Sizes page."

**You get back:** a list of sizes.

Each size says:

- its saved id
- its name
- its saved order number
- whether it is hidden
- whether it is removed

This only reads data.
It never creates, edits, removes, deletes, or saves a size.

## What you ask for

Nothing.
The Sizes page asks for the whole size list every time.

## What you get back

You get a list.
Each size in the list has:

- **id** — the saved id for the size
- **name** — the size name
- **sortOrder** — the saved order number
- **isHidden** — true if the size is hidden
- **isRemoved** — true if the size is removed

Example:

```json
[
  {
    "id": 1,
    "name": "large",
    "sortOrder": 3,
    "isHidden": false,
    "isRemoved": false
  }
]
```

## Which Sizes Are Included

Include all sizes.

Hidden sizes are included.
Removed sizes are included.

The page needs those rows so it can show the hidden and removed filter chips.

## Size Names

The size name comes back as text.

If the saved name is missing, it comes back as an empty string.

Spaces are preserved.
For example, `" large "` stays `" large "`.

## Hidden And Removed

`isHidden` is true only when the saved hidden value is `1`.
Otherwise it is false.

`isRemoved` is true only when the saved removed value is `1`.
Otherwise it is false.

## Saved Order

The saved order number comes back as a number.

If a size has no saved order number, it uses `999999`.

## Order Of The Returned List

The Sizes page uses the same size order the editor uses today:

1. Common size words come first, like small, medium, large, extra-large, and jumbo.
2. Measured sizes come next, like `1 oz`, `2 oz`, `100 g`, or `1 lb`.
3. Everything else comes after that.

Inside those groups:

- Common size words use the app's current common-size order.
- Measured sizes are ordered by their amount.
- Other names use the saved order number when they have one.
- If the saved order does not decide it, names are sorted alphabetically, ignoring upper/lower case.

We are preserving today's size order during the migration.
We are not redesigning it here.

## When There Are No Sizes

You get an empty list: `[]`.

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

The caller decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't filter by the search box. The page does that.
- It doesn't filter hidden or removed sizes. The page does that.
- It doesn't count how many recipes use a size.
- It doesn't create sizes.
- It doesn't rename sizes.
- It doesn't remove sizes.
- It doesn't delete sizes.
- It doesn't decide what happens when the user clicks a size.

## Test Scenarios

The test data lives in `js/data/fixtures/listSizes.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios are:

1. **Empty database** — returns an empty list.
2. **One simple size** — basic check.
3. **Hidden sizes are included** — hidden sizes come back with `isHidden` true.
4. **Removed sizes are included** — removed sizes come back with `isRemoved` true.
5. **Missing saved order becomes 999999** — sizes without a saved order number use 999999.
6. **Common size order** — common size words use the app's current order.
7. **Measured size order** — measured sizes are ordered by amount.
8. **Other names use saved order** — names outside the common/measured groups use saved order first.
9. **Alphabetical tie-breaker** — ties are sorted by name.
10. **Missing names become empty** — missing names come back as empty strings.
11. **Spaces are preserved** — extra spaces in saved names are not trimmed.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether missing saved order should use 999999 forever.
- Decide whether size names should be trimmed when shown.
- Decide whether the special size sorting should be simpler.

These do NOT happen during migration.
They are separate jobs for later.