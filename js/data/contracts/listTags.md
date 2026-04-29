# What `listTags` does

This is a written agreement about the Tags page.
Both the old local database and Supabase must give back the same tag list.
This doc is the rulebook.

## Summary

**You ask:** "give me the tags for the Tags page."

**You get back:** a list of tags.

Each tag says:

- its saved id
- its name
- its saved order number
- whether it is meant for recipes or ingredients
- whether any recipe uses it
- whether any ingredient uses it

This only reads data.
It never creates, edits, hides, or deletes a tag.

## What you ask for

Nothing.
The Tags page asks for the whole visible tag list every time.

## What you get back

You get a list.
Each tag in the list has:

- **id** — the saved id for the tag
- **name** — the tag name
- **sortOrder** — the saved order number
- **intendedUse** — either `"recipes"` or `"ingredients"`
- **hasRecipeUsage** — true if at least one recipe uses this tag
- **hasIngredientUsage** — true if at least one ingredient uses this tag

Example:

```json
[
  {
    "id": 1,
    "name": "breakfast",
    "sortOrder": 1,
    "intendedUse": "recipes",
    "hasRecipeUsage": true,
    "hasIngredientUsage": false
  }
]
```

## Which Tags Are Included

Include visible tags.

Do not include hidden tags.

A tag with an empty name is still included if it is visible.
That is what the page does today.
We are not cleaning that up during this migration.

## Tag Names

The tag name comes back as text.

If the saved name is missing, it comes back as an empty string.

Spaces in the name are preserved.
For example, `"  breakfast  "` stays `"  breakfast  "`.

## Saved Order

The saved order number comes back as a number.

If a tag has no saved order number, it uses `999999`.
That puts it at the end of the first list the page receives.

The Tags page later groups and alphabetizes the visible sections on screen.
This function only gives the page the raw tag list it already expects.

## Recipe Or Ingredient

Each tag has an intended use.

If the saved value is exactly `"ingredients"` after trimming spaces and ignoring upper/lower case, it comes back as `"ingredients"`.

Everything else comes back as `"recipes"`.

That means missing, blank, `"recipes"`, or any unexpected value all become `"recipes"`.

## Usage Flags

`hasRecipeUsage` is true when at least one recipe uses the tag.
Otherwise it is false.

`hasIngredientUsage` is true when at least one ingredient variant uses the tag.
Otherwise it is false.

These are separate.
A tag can be used by recipes, ingredients, both, or neither.

## Order Of The Returned List

The list is ordered like this:

1. Tags with smaller saved order numbers come first.
2. Tags with no saved order number come last.
3. If two tags have the same saved order number, they are ordered alphabetically by name, ignoring upper/lower case.

## When There Are No Tags

You get an empty list: `[]`.

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

The caller decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't group tags into Recipes and Ingredients sections. The page does that.
- It doesn't filter by the search box. The page does that.
- It doesn't create tags.
- It doesn't rename tags.
- It doesn't delete tags.
- It doesn't hide tags.
- It doesn't decide what happens when the user clicks a tag.

## Test Scenarios

The test data lives in `js/data/fixtures/listTags.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios are:

1. **Empty database** — returns an empty list.
2. **One visible recipe tag** — basic check.
3. **Hidden tags are skipped** — hidden tags do not appear.
4. **Order by saved order** — smaller saved order numbers come first.
5. **Missing saved order goes last** — tags without a saved order number move to the end.
6. **Alphabetical tie-breaker** — tags with the same saved order number are sorted by name.
7. **Ingredient tag** — `"ingredients"` comes back as `"ingredients"`.
8. **Unexpected use value** — missing, blank, or unknown values come back as `"recipes"`.
9. **Recipe usage flag** — tag shows when at least one recipe uses it.
10. **Ingredient usage flag** — tag shows when at least one ingredient uses it.
11. **Both usage flags** — one tag can be used by both.
12. **Empty names are preserved** — visible empty names still come back.
13. **Spaces in names are preserved** — extra spaces in names are not trimmed.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether visible tags with empty names should be cleaned up.
- Decide whether tag names should be trimmed when shown.
- Decide whether Tags page ordering should come entirely from saved order, entirely from alphabetic order, or the current mix.

These do NOT happen during migration.
They are separate jobs for later.