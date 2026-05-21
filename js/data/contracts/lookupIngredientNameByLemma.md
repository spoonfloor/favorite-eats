# What `lookupIngredientNameByLemma` does

This is a written agreement about resolving a saved ingredient’s display `name` from its **lemma** (grammar / dictionary form). Both the old local database and Supabase must give back the same answer. This doc is the rulebook.

## Summary

**You ask:** "which saved ingredient `name` belongs to this lemma?"

**You get back:** either that name as text, or `null` when nothing matches.

This only reads data. It never creates, edits, removes, deletes, or saves anything.

## What you ask for

You give it:

- **lemma** — the dictionary-form text (e.g. from `ingredients.lemma` on a recipe line)

Blank lemmas return `null`.

## What you get back

- A non-empty string: the **`name`** field from the matching `ingredients` row.
- `null` when the lemma is blank, when no row matches, or when the `lemma` column does not exist in the database (older schemas).

## Matching rules

- Compare `ingredients.lemma` to the request using case-insensitive match after trimming spaces at the start and end of both sides.

## Order when more than one row matches

Return the **`name`** from the row with the **lowest** saved ingredient id.

## Errors

If the database cannot be read or Supabase returns an error, this function fails loudly.

The UI may catch that failure and decide how to recover.

## What this function does NOT do

- It does not match on ingredient `name`, only on `lemma`.
- It does not consult synonyms.
- It does not filter deprecated, hidden, or removed rows.

## Test scenarios

The fixture file should cover:

1. Blank lemma returns `null`.
2. Unknown lemma returns `null`.
3. One match returns that row’s `name`.
4. Matching ignores case and outer spaces.
5. Multiple rows match: lowest id wins.
6. Missing `lemma` column (legacy catalog shape) returns `null`.
