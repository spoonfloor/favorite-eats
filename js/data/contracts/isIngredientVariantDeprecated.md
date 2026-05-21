# What `isIngredientVariantDeprecated` does

This is a written agreement about checking whether a named ingredient variant has been soft-deprecated.
Both the old local database and Supabase must give back the same answer.
This doc is the rulebook.

## Summary

**You ask:** "for this ingredient name and variant text, is that exact variant marked deprecated?"

**You get back:** `true` or `false`.

This only reads ingredient, synonym, and variant information.
It never creates, edits, removes, deletes, renames, hides, or saves anything.

## What you ask for

You give it:

- **ingredientName** — the ingredient name shown in the UI
- **variantText** — the variant text shown in the UI

Names and variants are matched after trimming spaces and ignoring upper/lower case.

## What you get back

You get:

- `true` when the variant exists for the matching ingredient and that variant row is deprecated
- `false` in all normal non-deprecated cases

## Matching the ingredient

The ingredient can match in either of these ways:

1. The ingredient's saved name matches `ingredientName`.
2. One of the ingredient's saved synonyms matches `ingredientName`.

Matching ignores upper/lower case and extra spaces around the value.

If more than one ingredient matches, all matching ingredient ids are checked.
If any matching ingredient has the requested deprecated variant, the answer is `true`.

## Ingredient Visibility

Deprecated or hidden parent ingredients are not considered valid matches.

If the database has an ingredient-level `is_deprecated` field:

- ingredients with `is_deprecated = 1` are ignored

Otherwise, if the database has an ingredient-level `hide_from_shopping_list` field:

- ingredients with `hide_from_shopping_list = 1` are ignored

If neither field exists, parent ingredients are treated as visible.

## Matching the Variant

The variant must belong to one of the matching visible ingredients.

The variant text is matched after trimming spaces and ignoring upper/lower case.

The result is `true` only when the matching variant row has `is_deprecated = 1`.

The result is `false` when:

- the ingredient name is empty
- the variant text is empty
- the variant text is `default`
- no visible ingredient matches the name or synonym
- no variant matches the requested text
- the matching variant exists but is not deprecated

## Older Database Shapes

For old local databases that do not have the `ingredient_variants` table, the answer is `false`.

For old local databases that have `ingredient_variants` but do not have an `is_deprecated` field on that table, the answer is `false`.

Supabase is expected to have the modern table shape.

## Errors

If the database cannot be read or Supabase returns an error, this function fails loudly.
It does not silently return `false` for real read failures.

The UI may catch that failure and decide to behave as though the variant is not deprecated, but the data function itself should make the failure visible.

## What this function does NOT do

- It does not check whether the ingredient itself should be shown in typeahead.
- It does not list variants.
- It does not choose a replacement variant.
- It does not update shopping-plan or shopping-list rows.
- It does not normalize saved data.

## Test scenarios

The fixture file should cover:

1. Empty ingredient name returns `false`.
2. Empty variant text returns `false`.
3. `default` variant returns `false`.
4. No matching ingredient returns `false`.
5. Direct ingredient-name match with deprecated variant returns `true`.
6. Direct ingredient-name match with active variant returns `false`.
7. Synonym match with deprecated variant returns `true`.
8. Matching ingredient hidden by `is_deprecated` is ignored.
9. Matching ingredient hidden by `hide_from_shopping_list` is ignored when `is_deprecated` is not present.
10. Matching ignores case and surrounding spaces.
11. Multiple matching ingredients return `true` when any visible match has a deprecated variant.
12. Older catalog shape with no variant-deprecation field returns `false`.
