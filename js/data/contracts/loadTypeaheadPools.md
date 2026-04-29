# What `loadTypeaheadPools` does

This is a written agreement about the suggestion lists in the recipe editor.
Both the old local database and Supabase must give back the same lists.
This doc is the rulebook.

## Summary

**You ask:** "give me the suggestion lists for editing an ingredient line."

**You get back:** four lists:

- **ingredientNames** — names for the ingredient name box
- **unitCodes** — short unit labels for the unit box, like `"tsp"` or `"cup"`
- **sizeNames** — size labels for the size box, like `"small"` or `"large"`
- **variantNames** — type labels for the variant box, like `"all-purpose"` for flour

This only reads data. It never saves or changes anything.

## What you ask for

You may give it one ingredient name.
That name is only used for the variant list.

For example:

- If you ask for variants for `"flour"`, you might get `"all-purpose"` and `"whole wheat"`.
- If you do not give an ingredient name, the variant list is empty.

The ingredient name list, unit list, and size list are always the same no matter which ingredient name you ask about.

## What you get back

You get four lists.

Example:

```json
{
  "ingredientNames": ["flour", "milk"],
  "unitCodes": ["tsp", "tbsp", "cup"],
  "sizeNames": ["small", "medium", "large"],
  "variantNames": ["all-purpose", "whole wheat"]
}
```

## Rules for all four lists

All four lists follow these rules:

- Missing values are skipped.
- Empty values are skipped.
- Values with only spaces are skipped.
- Extra spaces at the beginning or end are removed.
- If there are no matches, the list is empty: `[]`.

## Ingredient Names

Ingredient names come from the ingredient list.

Do not include ingredients that are retired or hidden from suggestions.

Order the names alphabetically, ignoring upper/lower case.

## Unit Codes

Unit codes come from the unit list.

Do not include units that have been removed.

Use the same order the app uses today:

1. Units with a smaller saved order number come first.
2. Units with no saved order number come last.
3. If two units have the same saved order number, sort them alphabetically, ignoring upper/lower case.

Return the short unit label, not the full name.
So return `"tbsp"`, not `"tablespoon"`.

## Size Names

Size names come from the size list.

Do not include sizes that have been removed.

Use the same order the editor uses today:

1. Common size words first, like small, medium, large, and extra-large.
2. Numbered sizes next, smallest number first.
3. Everything else after that, alphabetically.

We are keeping today's order during the migration.
We are not redesigning size sorting here.

## Variant Names

Variant names depend on the ingredient name you asked about.

For example:

- Ask for `"flour"` and you might get `"all-purpose"`, `"bread"`, and `"whole wheat"`.
- Ask for `"oil"` and you might get `"canola"` and `"olive"`.

The ingredient match ignores upper/lower case and extra spaces at the beginning or end.

Alternate names count.
If `"garbanzo bean"` is saved as another name for `"chickpea"`, asking for `"garbanzo bean"` returns the variants for `"chickpea"`.

Do not include:

- Missing variant names
- Empty variant names
- The variant named `"default"`
- Retired variant names
- Variants for retired ingredients

Order variant names alphabetically, ignoring upper/lower case.

If the ingredient name does not match anything, the variant list is empty: `[]`.

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return empty lists and pretend everything is fine.

The caller decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't filter the list based on what the user has typed so far. The dropdown does that later.
- It doesn't create missing ingredients, units, sizes, or variants.
- It doesn't fix spelling.
- It doesn't decide which suggestion is highlighted.
- It doesn't handle login.

## Test Scenarios

The test data lives in `js/data/fixtures/loadTypeaheadPools.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios are:

1. **Empty database** — all four lists are empty.
2. **Basic lists** — ingredient names, units, sizes, and variants come back.
3. **Blank values are skipped** — empty rows do not become suggestions, and extra spaces are removed.
4. **Retired ingredients are skipped** — old ingredients do not appear.
5. **Unit order** — units come back in today's saved order.
6. **Removed units are skipped** — removed units do not appear.
7. **Size order** — sizes come back in today's editor order.
8. **Removed sizes are skipped** — removed sizes do not appear.
9. **Variants stay with their ingredient** — flour variants do not appear when asking for sugar, and sugar variants do not appear when asking for flour.
10. **Variant cleanup** — blank, default, and retired variants are skipped.
11. **Alternate ingredient names work** — asking by another saved name still returns the right variants.
12. **No ingredient name** — variants are empty, while the other three lists still return.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether ingredient suggestions should use the exact same hidden/visible rules as shopping screens.
- Decide whether duplicate suggestion names should be cleaned up in the database.
- Decide whether variant names should use a hand-picked order instead of alphabetical order.

These do NOT happen during migration.
They are separate jobs for later.