# What `listUnits` does

This is a written agreement about the Units page.
Both the old local database and Supabase must give back the same unit list.
This doc is the rulebook.

## Summary

**You ask:** "give me the units for the Units page."

**You get back:** a list of units.

Each unit says:

- its short label, like `"tsp"` or `"cup"`
- its singular name, like `"teaspoon"`
- its plural name, like `"teaspoons"`
- its category, if it has one
- its saved order number
- whether it is hidden
- whether it is removed

This only reads data.
It never creates, edits, removes, deletes, or saves a unit.

## What you ask for

Nothing.
The Units page asks for the whole unit list every time.

## What you get back

You get a list.
Each unit in the list has:

- **code** — the short label
- **nameSingular** — the singular name
- **namePlural** — the plural name
- **category** — the category text
- **sortOrder** — the saved order number
- **isHidden** — true if the unit is hidden
- **isRemoved** — true if the unit is removed

Example:

```json
[
  {
    "code": "tsp",
    "nameSingular": "teaspoon",
    "namePlural": "teaspoons",
    "category": "volume",
    "sortOrder": 1,
    "isHidden": false,
    "isRemoved": false
  }
]
```

## Which Units Are Included

Include all units.

Hidden units are included.
Removed units are included.

The page needs those rows so it can show the hidden and removed filter chips.

## Text Fields

The text fields come back as saved:

- `code`
- `nameSingular`
- `namePlural`
- `category`

If any of those saved values are missing, they come back as empty strings.

Spaces are preserved.
For example, `" teaspoon "` stays `" teaspoon "`.

## Hidden And Removed

`isHidden` is true only when the saved hidden value is `1`.
Otherwise it is false.

`isRemoved` is true only when the saved removed value is `1`.
Otherwise it is false.

## Saved Order

The saved order number comes back as-is.

If the saved order number is missing, it comes back as `null`.

## Order Of The Returned List

The list is ordered like this:

1. Units with smaller saved order numbers come first.
2. Units with no saved order number come first, because that is what the Units page does today.
3. If two units have the same saved order number, they are ordered alphabetically by code, ignoring upper/lower case.

Yes, this is different from some other lists.
We are preserving today's Units page behavior during the migration.

## When There Are No Units

You get an empty list: `[]`.

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

The caller decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't filter by the search box. The page does that.
- It doesn't filter hidden or removed units. The page does that.
- It doesn't count how many recipes use a unit.
- It doesn't create units.
- It doesn't rename units.
- It doesn't remove units.
- It doesn't delete units.
- It doesn't decide what happens when the user clicks a unit.

## Test Scenarios

The test data lives in `js/data/fixtures/listUnits.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios are:

1. **Empty database** — returns an empty list.
2. **One simple unit** — basic check.
3. **All text fields return** — short label, singular name, plural name, and category all come back.
4. **Missing text becomes empty** — missing names and category come back as empty strings.
5. **Hidden units are included** — hidden units come back with `isHidden` true.
6. **Removed units are included** — removed units come back with `isRemoved` true.
7. **Order by saved order** — smaller saved order numbers come first.
8. **Missing saved order comes first** — units without a saved order number come before numbered units.
9. **Alphabetical tie-breaker** — units with the same saved order number are sorted by short label.
10. **Spaces are preserved** — extra spaces in saved text are not trimmed.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether units with no saved order number should go first or last.
- Decide whether unit text should be trimmed when shown.
- Decide whether hidden and removed units should be split into separate sections.

These do NOT happen during migration.
They are separate jobs for later.