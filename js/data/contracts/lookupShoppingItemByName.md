# What `lookupShoppingItemByName` does

This is a written agreement about finding one shopping item by typed text.
Both the old local database and Supabase must give back the same answer.
This doc is the rulebook.

## Summary

**You ask:** "which shopping item matches this name?"

**You get back:** either one matching item, or `null` when nothing matches.

This only reads data.
It never creates, edits, removes, deletes, renames, hides, or saves anything.

## What you ask for

You give it:

- **name** - the text the user typed or clicked

Blank names return `null`.

## What you get back

When a match is found, you get:

- **id** - the saved shopping item id
- **name** - the saved shopping item name

Example:

```json
{
  "id": 10,
  "name": "Apples"
}
```

## Matching Rules

First, look for a shopping item whose saved name matches the requested name.
Matching ignores upper/lower case and ignores spaces at the beginning or end.

If that does not find anything, look for a synonym whose saved synonym text matches the requested name.
Synonym matching also ignores upper/lower case and spaces at the beginning or end.

If a synonym matches, return the shopping item attached to that synonym.

## Order When More Than One Row Matches

If more than one shopping item name matches, return the one with the lowest saved item id.

If more than one synonym matches, return the attached shopping item with the lowest saved item id.

Direct item-name matches always win over synonym matches.

## Text Fields

The returned `name` is the saved shopping item name.
If the saved item name is missing, return the requested name.

## When There Is No Match

Return `null` when:

- the requested name is blank
- no item name matches
- no synonym matches

## Errors

If the database cannot be read or Supabase returns an error, this function fails loudly.
It does not silently pretend nothing matched.

The UI may catch that failure and decide how to recover.

## What this function does NOT do

- It does not search partial names.
- It does not create a missing shopping item.
- It does not filter hidden or removed items.
- It does not decide what page should open after a match is found.

## Test scenarios

The fixture file should cover:

1. Blank name returns `null`.
2. Unknown name returns `null`.
3. Direct item-name match returns the item.
4. Matching ignores case and outer spaces.
5. Synonym match returns the attached item.
6. Direct item-name match wins over synonym match.
7. Duplicate matches return the lowest item id.
