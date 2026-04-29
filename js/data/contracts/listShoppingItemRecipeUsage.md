# What `listShoppingItemRecipeUsage` does

This is a written agreement about the Shopping Items page.
Both the old local database and Supabase must give back the same recipe usage for a shopping item.
This doc is the rulebook.

## Summary

**You ask:** "which recipes use this shopping item?"

**You give:** one shopping item name.

**You get back:** a list of recipes that use that item.

This only reads data.
It never creates, edits, hides, removes, deletes, or saves an item or recipe.

## Why The Page Needs This

When a user tries to remove a shopping item, the page needs to know whether any recipes still use it.

If recipes use the item, the page shows those recipes and hides the item instead of deleting it permanently.

If no recipes use the item, the page can offer permanent deletion.

This function only answers the usage question.
It does not decide whether to hide or delete the item.

## What You Ask For

The caller passes an item name.

Example:

```json
"Tomato"
```

The name is trimmed before use.

If the name is missing or only spaces, the answer is an empty list.

## What You Get Back

You get a list of recipes.

Each recipe has:

- **id** — the recipe id as a number
- **title** — the recipe title as text

Example:

```json
[
  { "id": 10, "title": "Tomato Soup" },
  { "id": 12, "title": "Pasta Sauce" }
]
```

The caller can count this list to know how many recipes use the item.

## What Counts As Usage

A recipe counts when it uses an ingredient whose saved name matches the requested item name.

The match ignores upper/lower case.
So `"tomato"`, `"Tomato"`, and `"TOMATO"` match each other.

The match is by the main ingredient name.
It does not match by variant name.
It does not match by synonym.

Both of these count:

- the item appears directly in the recipe ingredient list
- the item appears as a substitute for another recipe ingredient

If the same recipe uses the item more than once, it appears only once.

## Recipe Titles

The recipe title comes back as text.

If the saved title is missing, it comes back as an empty string.

Extra spaces around the title are trimmed.

## Order Of The Returned List

Recipes are sorted alphabetically by title, ignoring upper/lower case.

## When There Are No Recipes

You get an empty list: `[]`.

This includes:

- the requested item name is blank
- no ingredient has that name
- ingredients with that name exist, but no recipes use them

## When Something Goes Wrong

If the database can't be reached or returns an error, this function **fails loudly**.
It does NOT quietly return an empty list and pretend everything is fine.

The caller decides what to show the user when that happens.

## What This Function Does NOT Do

- It doesn't load the shopping item row itself.
- It doesn't include ingredient variants.
- It doesn't include synonyms.
- It doesn't decide whether the item should be hidden or deleted.
- It doesn't hide the item.
- It doesn't delete the item.
- It doesn't edit recipes.

## Test Scenarios

The test data will live in `js/data/fixtures/listShoppingItemRecipeUsage.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios should cover:

1. Blank item name.
2. Item name not found.
3. One direct recipe usage.
4. Multiple direct recipe usages sorted by title.
5. Matching ignores upper/lower case.
6. Duplicate direct usage in the same recipe appears once.
7. Substitute usage counts.
8. Direct usage and substitute usage in the same recipe still appear once.
9. Missing recipe title becomes an empty string.
10. Variant-only matches do not count.
11. Synonym-only matches do not count.

## Things We Might Want To Change Later

(Not now, but worth writing down so we don't forget.)

- Decide whether synonyms should count as usage.
- Decide whether variants should be shown in this dialog.
- Decide whether hidden or removed recipes need special handling if those fields are added later.

These do NOT happen during migration.
They are separate jobs for later.