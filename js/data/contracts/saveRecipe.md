# What `saveRecipe` does

This is the written agreement for the recipe editor's Save button. Supabase is the production save path via `window.dataService.saveRecipe`.

## Summary

**You give it:** one whole recipe draft: metadata, tags, steps, ingredient headings, and ingredient rows.

**It saves:** the whole draft as one bundled recipe write.

**You get back:** the freshly reloaded recipe, in the same shape as `loadRecipeDetail`.

The Save button must call one data-service method: `window.dataService.saveRecipe`. It must not split the save across separate adapter calls for metadata, tags, steps, and ingredients.

## What you give it

The request has one recipe object:

- **id** — the existing recipe id. It must be a positive number.
- **title** — recipe title text.
- **servings** — default, min, and max serving values.
- **tags** — recipe tag names.
- **sections** — the editor model containing steps, ingredient rows, and ingredient heading rows.
- **stepNodes** — optional live instruction-editor rows. When present, these are the source of truth for step text, ordering, and heading/step type.

The caller is responsible for resolving user-facing prompts before calling this method. That includes unknown ingredient names, unknown variants, unknown units, unknown sizes, and unknown tags. The adapter does not open dialogs.

## What gets saved

The write updates the existing recipe. It does not create a new recipe row. New recipe creation stays with `createRecipe`.

The bundled save writes these pieces together:

- **Recipe metadata** — title, servings default, servings min, and servings max.
- **Recipe tags** — the recipe's tag mapping rows, creating missing tag rows when needed.
- **Recipe units** — missing unit codes used by ingredient lines, matching prior editor behavior.
- **Steps** — the full step list for the recipe, including each row's heading/step type.
- **Ingredient headings** — heading rows shown between ingredients.
- **Ingredient rows** — all real ingredient rows, including quantity, unit, prep notes, optional flag, parenthetical note, sort order, variant, size, alternate-row flag, and display name behavior.
- **Subrecipe links** — linked-recipe rows are saved separately from ingredient rows so they do not create or reuse grocery catalog items.
- **Ingredient catalog side effects** — missing ingredient rows may be created when the saved recipe uses a new ingredient name, matching prior editor behavior.

The save must preserve existing behavior rather than clean it up. If a field already has odd legacy behavior, the migrated save keeps it.

## What does not get saved

This method does not save shopping-list state, store aisle layouts, app settings, or any unrelated admin data except the tag/unit/ingredient catalog side effects listed above.

It does not create the recipe itself.

## Transaction rule

The caller sees this as one save. Either all recipe-save pieces succeed, or the method fails loudly.

No successful result may leave the recipe half-saved with metadata updated but steps or ingredients stale.

## Normalization rules

### Title and servings

Title is saved as the editor model provides it after the UI's existing trim/check has accepted it.

Serving values are saved as provided by the editor model. Later reads still apply the `loadRecipeDetail` positive-number-or-null rules.

### Tags

Tags are normalized the same way today's save does:

- Accept either a list or newline-ish input from the model.
- Trim each tag.
- Collapse internal whitespace to a single space.
- Drop empty tags.
- Clip names longer than 48 characters.
- Deduplicate case-insensitively, keeping the first spelling.
- Replace all recipe tag mappings with the normalized list in order.
- Create missing tag rows before mapping them to the recipe.

### Steps

Steps are saved from the canonical editor model after the existing model/DOM reconciliation step.
If the inline instruction editor has `stepNodes`, those nodes are folded into the save payload before the adapter writes steps so TAB/SHIFT+TAB heading promotion survives a save/reload roundtrip.

Step instructions are normalized before saving:

- Remove zero-width characters.
- Collapse whitespace.
- Trim.
- Remove spaces before punctuation.
- Keep one space after punctuation.
- Drop punctuation-only instructions.

The saved step list replaces the previous step list for the recipe.

### Ingredient headings

Heading rows are part of the ingredient list. A heading saves only if its text is not empty after trimming.

Existing heading ids are updated when still present. New headings are inserted. Headings removed from the model are deleted.

### Ingredient rows

Placeholder rows are not saved.

Linked-recipe rows save as subrecipe-link rows only when they have a valid linked recipe id, and that id is not the current recipe id. They do not save through the ingredient catalog and must not create ingredient rows.

Normal ingredient rows are matched to the ingredient catalog by ingredient name, case-insensitively. If no ingredient exists, a new ingredient row is created. If the synonyms table can resolve the typed name, that ingredient id is used instead.

Existing ingredient mapping rows are updated when their `rimId` still exists. New rows are inserted. Mapping rows removed from the model are deleted.

The ingredient row fields follow today's save behavior:

- Quantity values at or below zero save as empty for the legacy `quantity` field.
- `quantityMin` and `quantityMax` save only positive numbers or null.
- `quantityIsApprox`, `isOptional`, and `isAlt` save as database booleans. The adapter accepts the UI's `isAlt` field and persisted `is_alt` field names as the same alternate-row status.
- Unit, prep notes, parenthetical note, variant, and size save as trimmed text.
- Display name is stored only when the typed name differs from the canonical catalog name.
- Linked-recipe fields save only for valid linked-recipe rows, in the subrecipe-link payload/table rather than `recipe_ingredient_map`.

## What you get back

On success, `saveRecipe` returns the freshly reloaded recipe object using the `loadRecipeDetail` contract shape.

The caller can use that returned object to refresh the dirty-state baseline and current editor model.

## When something goes wrong

The method throws if:

- The recipe id is missing or invalid.
- Required tables or columns for the active adapter are unavailable.
- Any part of the bundled save fails.
- The adapter cannot verify a successful full save.

It does not silently fall back to a browser-local database when Supabase is active.

## Test scenarios

B2 adds fixtures and parity coverage for this contract. The fixtures should cover:

1. Metadata-only edit.
2. Tags added, removed, reordered, deduped, and newly created.
3. Steps added, edited, reordered, normalized, and removed.
4. Ingredient rows added, edited, reordered, and removed.
5. Ingredient headings added, edited, reordered, and removed.
6. Quantity ranges, approximate quantities, optional rows, alternate rows, variant, size, notes, and parenthetical notes.
7. Linked-recipe ingredient rows.
8. New ingredient, new unit, and new tag side effects; size value preservation.
9. Empty step/ingredient placeholders not saved.
10. Failure leaves no partial recipe save visible to the caller.
