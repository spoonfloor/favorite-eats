# What `listIngredientTagNames` does

This is a written agreement about the tag names used by the Items page.
Both the old local database and Supabase must give back the same tag-name list.
This doc is the rulebook.

## Summary

**You ask:** "give me the tag names that can be used for ingredient items."

**You get back:** a list of tag names.

Each entry is just the tag name text.

This only reads data.
It never creates, edits, removes, deletes, or saves a tag.

## What you ask for

Nothing.
The Items page asks for the whole ingredient tag-name list every time.

## What you get back

You get a list of text values.

Example:

```json
[
  "produce",
  "pantry"
]
```

## Which Tags Are Included

Include a tag when all of these are true:

- it has a saved name
- the name is not blank after spaces are trimmed away
- the tag is not hidden
- it is meant for ingredients, or it is already used by at least one ingredient variant

## Tag Names

The returned name is trimmed.

For example, `" produce "` comes back as `"produce"`.

Blank names are not returned.

## Hidden Tags

Hidden tags are not returned.

A tag is hidden only when the saved hidden value is `1`.

## Ingredient Tags

A tag counts as an ingredient tag when its saved use is `ingredients`.

The saved use ignores extra spaces and upper/lower case.
For example, `" Ingredients "` counts as `ingredients`.

If the saved use is missing or blank, it counts as `recipes`, not `ingredients`.

## Tags Already Used By Ingredient Variants

Also include any visible tag that is already attached to an ingredient variant.

This preserves today's behavior, where a tag can appear in the Items page even if its saved use does not say `ingredients`.

## Order Of The Returned List

Tag names are sorted alphabetically, ignoring upper/lower case.

## When There Are No Matching Tags

You get an empty list: `[]`.

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

The caller decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't return tag ids.
- It doesn't return hidden tags.
- It doesn't return recipe-only tags unless they are already used by ingredient variants.
- It doesn't say which items use each tag.
- It doesn't count how many items use each tag.
- It doesn't filter by the Items page search box.
- It doesn't create tags.
- It doesn't rename tags.
- It doesn't remove tags.
- It doesn't delete tags.

## Test Scenarios

The test data lives in `js/data/fixtures/listIngredientTagNames.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios are:

1. **Empty database** — returns an empty list.
2. **Ingredient tag returns** — a visible ingredient tag comes back.
3. **Recipe-only tag is skipped** — a visible recipe-only tag does not come back.
4. **Hidden tag is skipped** — hidden tags do not come back.
5. **Used recipe tag returns** — a visible recipe tag already used by an ingredient variant comes back.
6. **Missing use defaults to recipe** — missing saved use does not count as ingredient use.
7. **Use ignores case and spaces** — `" Ingredients "` counts as ingredient use.
8. **Blank names are skipped** — blank tag names do not come back.
9. **Names are trimmed** — extra spaces around names are removed.
10. **Alphabetical order** — names are sorted alphabetically.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether tag names should keep their saved spaces instead of being trimmed.
- Decide whether all tags should have one clear saved use.
- Decide whether recipe-only tags already used by ingredient variants should be cleaned up.

These do NOT happen during migration.
They are separate jobs for later.
