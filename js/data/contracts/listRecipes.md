# What `listRecipes` does

This is a written agreement about what the "list of recipes" function returns. Both ways of getting the data (the old local database, and the new cloud Supabase) must produce exactly the same result. This doc is the rulebook.

## What you get back

A list of recipes. Each recipe in the list has these pieces of information:

- **id** — a number that uniquely identifies the recipe
- **title** — the name of the recipe (always text, never missing)
- **tags** — a list of tag names (could be empty)
- **servingsDefault** — how many people the recipe normally serves, or null if unknown
- **servings** — a small group of three numbers:
  - **default** — same as servingsDefault (repeated here for convenience)
  - **min** — smallest number of servings, or null
  - **max** — largest number of servings, or null

## How the recipes are ordered

Alphabetically by title, ignoring upper/lower case.
So "apple pie" comes before "Banana Bread" comes before "Cereal".

A recipe with an empty title shows up at the very top.

## Rules for each field

### id

Always a positive number (1, 2, 3...).
If a recipe somehow has a weird id (zero, negative, missing, not a number), it gets skipped — it won't appear in the list at all.

### title

Always text. Never null.
If the database stores no title at all, you get an empty string `""` instead.
Extra spaces are preserved as-is. So a title stored as `"  Pancakes  "` stays exactly that.

### tags

The tags list might be empty.

**Hidden tags don't count.** Some tags are marked as hidden in the database (for internal use). Those don't appear here.

**Empty or whitespace-only tags are dropped.** A tag stored as `""` or `"   "` doesn't appear.

**Tag names are trimmed.** A tag stored as `"  Baking  "` shows up as `"Baking"`.

**Tag order rules** (in order of priority):

1. By the tag's `sort_order` value (lowest first).
2. If two tags tie on sort_order, the one created earlier (lower id) wins.
3. If still tied, alphabetical (case-insensitive).
4. Tags with no sort_order at all go to the end.

**Duplicates removed.** If a recipe has two tags that are the same word with different casing (like `"Vegan"` and `"vegan"`), only the first one in order is kept. The original casing of that first one is preserved.

Example: tags `Spicy` (sort 1), `spicy` (sort 2), `Indian` (sort 3) → result is `["Spicy", "Indian"]`.

### servingsDefault, servings.default, servings.min, servings.max

These are all "how many people" numbers.

**Valid values:** any positive number (1, 2, 3, 4.5, etc.).

**Invalid values become null:**

- `0` → `null`
- `-3` → `null`
- not set / missing → `null`
- not a number → `null`
- `4` → `4` (kept as-is)

`**servingsDefault` and `servings.default` are always the same.** They're stored in two places for convenience.

`**min`, `max`, and `default` are independent.** They don't validate against each other. If the database has weird values like min=10 and max=2, they pass through unchanged.

## When there are no recipes

You get an empty list `[]`. Not null, not an error. Just an empty list.

## When something goes wrong

If the database can't be reached or returns an error, the function **fails loudly** — it throws.
It does NOT silently pretend everything is fine and return an empty list.
Whatever code is calling this is responsible for deciding what to do when it fails (show an error, use a backup, etc.).

## What this function does NOT do

- It doesn't filter the recipes (you get all of them, every time).
- It doesn't break results into pages (you get all of them at once).
- It doesn't check permissions (any auth/login happens earlier).

## Test scenarios

The actual test data lives in `js/data/fixtures/listRecipes.json`. There are 13 scenarios that together cover every rule above. Each version of this function (old local DB, new Supabase) must produce **identical** output for every scenario before it's allowed to be turned on.

The 13 scenarios are:

1. **Empty database** — returns `[]`
2. **One simple recipe** — sanity check
3. **Multiple recipes, alphabetical order** — sort rule
4. **Tags ordered by sort_order** — tag order rule
5. **Some tags have no sort_order** — those go last
6. **Hidden tags filtered out** — visibility rule
7. **Duplicate tags (different casing)** — dedup rule
8. **Empty/whitespace tag names** — dropped
9. **Recipe with null title** — becomes empty string
10. **Recipe with 0 servings** — becomes null
11. **Recipe with negative servings** — becomes null
12. **Recipe with only servings.min set** — partial servings ok
13. **Realistic mix of 4 recipes with overlapping tags** — holistic check

## Things we might want to change later

(empty for now — if we find edge cases that should behave differently, we add them here and update the rules above)