# What `loadRecipeDetail` does

This is a written agreement about what the "open one recipe" function returns. Both ways of getting the data (the old local database, and the new cloud Supabase) must produce exactly the same result. This doc is the rulebook.

## Summary (read this first)

**You ask:** "give me recipe number N."

**You get back:** either the whole recipe (title, servings, tags, all the steps, all the ingredients, any sub-headings between ingredients), or `null` if no such recipe exists.

**It's read-only.** It never changes anything.

**The shape it returns is the same shape today's code returns.** We're locking in current behavior — including a few quirky things — and not cleaning anything up while migrating. Cleanup is a separate job, later.

**The three quirks worth flagging up front:**

1. **One fake "section" wraps everything.** Even though recipes can have real sub-sections in the database, today's code collapses them into a single wrapper. We're preserving that. Future cleanup.
2. **The `quantity` field has a mixed type** — it can be a number, a string, or null depending on what's in the database. Future cleanup.
3. **A leftover placeholder string `"Add an ingredient."` gets quietly turned into an empty name.** Preserved as-is. Future cleanup.

**If the recipe doesn't exist, or you pass a bad id, you get `null`.** No error. The function only throws when the database itself fails.

**The rest of this doc** spells out the exact fields, ordering rules, and edge cases. It's long because the recipe object has a lot of fields. The rules themselves are simple — there are just a lot of them.

## What you ask for

Just a recipe ID (a number). That's it.

## What you get back (the big picture)

One of two things:

- A **recipe object** with everything the editor needs to draw the recipe on screen.
- Or `**null`** if no recipe with that ID exists.

The recipe object has these top-level pieces:

- **id** — the recipe's id (a positive number)
- **title** — the recipe's name (always text, never missing)
- **servings** — a small group of three numbers (default, min, max)
- **tags** — list of tag names
- **sections** — the place where steps, ingredients, and sub-headings live

## How sections work (heads up: this is unusual)

We're keeping today's behavior as-is for now. It's a little weird:

- **If the recipe has nothing in it yet** — zero steps, zero ingredients, zero headings — `sections` is an empty list `[]`.
- **Otherwise** — `sections` is a list with **exactly one** entry. That single entry is a wrapper that holds all the steps and ingredients for the whole recipe.

The wrapper entry has:

- **ID** — always `null`
- **name** — always the literal text `"(unnamed)"`
- **steps** — the list of step rows
- **ingredients** — the list of ingredient rows AND heading rows, mixed together

Yes, this collapses everything into a single fake section even when the recipe has multiple real sub-sections. The "real" section info lives on the individual rows below (each row carries its own `sectionId`).

We are NOT cleaning this up during migration. It goes on the future cleanup list.

## Steps

Each step row inside `sections[0].steps` has these pieces:

- **ID** — the step's database id (a number)
- **step_number** — the position it appears in the recipe (1, 2, 3...)
- **instructions** — the text of the step
- **type** — usually empty; rarely a special label

Steps are listed in order by **step_number**, lowest first.

## Ingredients (the mixed list)

The `ingredients` list inside `sections[0]` is unusual: it holds two kinds of rows, mixed together — actual ingredients and sub-section headings. The editor draws them as one interleaved column.

### How they're ordered

Same rule for both kinds:

1. By **sortOrder**, lowest first. A row with no sortOrder goes to the end (treated as if its sortOrder were 999999).
2. If two rows tie on sortOrder, **headings come before ingredients**.
3. If they're still tied, the row with the lower id comes first (rimId for ingredients, headingId for headings).

### Ingredient row pieces

An "ingredient row" is what you'd expect — a line like "1 cup flour, sifted". It has a lot of fields. They're grouped here for readability.

**The "I'm an ingredient" marker:**

- **rowType** — always the text `"ingredient"`
- **rimId** — the row's database id (in the recipe-ingredients table)
- **clientId** — the letter `i-` followed by the rimId (the editor uses this to track DOM elements)

**Where it sits in the recipe:**

- **sectionId** — which sub-section it belongs to, or null if it has none
- **sortOrder** — the ordering number, or null

**How much:**

- **quantity** — the amount. See "weird quirks" below — this can be a number, a string, or null.
- **quantityMin** — for ranges like "1 to 2 cups", or null
- **quantityMax** — same
- **quantityIsApprox** — true if marked approximate (like "about 3"), false otherwise
- **unit** — the unit name like `"cup"` or `"tbsp"`, or empty

**The food itself:**

- **name** — what the ingredient is. See "weird quirks" below.
- **variant** — a sub-type, like `"all-purpose"` for flour. Empty if none.
- **size** — sizing detail, like `"large"` for eggs. Empty if none.
- **lemma** — the dictionary form of the name, used for grammar lookups. Empty if none.
- **pluralByDefault** — grammar flag (true/false)
- **isMassNoun** — grammar flag for things like "rice" that don't take a plural (true/false)
- **pluralOverride** — a custom plural form, if the normal rules don't work. Empty if none.
- **prepNotes** — instructions for the ingredient, like `"diced"` or `"finely chopped"`. Empty if none.
- **isOptional** — true if the recipe marks this ingredient as optional
- **parentheticalNote** — extra text in parentheses on the ingredient line. Empty if none.
- **locationAtHome** — where you keep it, like `"fridge"` or `"pantry"`. **Always lowercase.** Empty if none.

**If the row links to another recipe** (a sub-recipe / "use this recipe as an ingredient"):

- **isRecipe** — true only if BOTH the "this is a sub-recipe" flag is set AND there's a real linked recipe id pointing somewhere
- **linkedRecipeId** — the other recipe's id, or null
- **linkedRecipeTitle** — the other recipe's title, or empty
- **recipeText** — free-text override for the sub-recipe's display name (sometimes used when the link is broken). Empty if none.

**State markers:**

- **isDeprecated** — true if the ingredient itself is marked as retired/deprecated in the catalog
- **variantDeprecated** — true if the specific variant of the ingredient is marked retired
- **isAlt** — true if this row is an alternative to the row above it (like "or olive oil")

### Weird quirks for ingredient rows

These are existing behaviors we're keeping unchanged during migration. Each one is on the future-cleanup list.

**The "Add an ingredient." placeholder trick.**
The editor used to seed empty rows with the literal text `"Add an ingredient."`. If the database happens to store a name that's exactly that string, we treat it as empty: the output `name` comes back as `""`. Any other name passes through verbatim.

**Quantity is a mixed type.**
The `quantity` field can be three different things depending on what's stored:

- If the database stores a real number, you get a number.
- If the database stores a string that looks like a clean number, like `"3"` or `"3.5"`, it gets converted to that number.
- If the database stores a string with words, like `"a pinch"` or `"a few"`, you get the string back as-is.
- If the database stores nothing, you get `null`.

This is awkward but the editor relies on it.

**quantityMin and quantityMax only count if positive.**
Zero, negative numbers, and non-numbers all become `null`. Only real positive numbers get through.

**isRecipe is strict.**
Even if the "this row is a sub-recipe" flag is set, if there's no valid linked recipe id, `isRecipe` comes back as false. BOTH conditions have to be true.

**linkedRecipeId is positive-only.**
Zero, negative, or non-numeric values all become `null`.

**linkedRecipeTitle is trimmed.**
Leading/trailing spaces are removed. Empty if there's no linked recipe.

**locationAtHome is lowercased.**
Whatever case the database stores, you get it lowercased in the output.

**Empty text fields are empty strings, not null.**
For unit, variant, size, lemma, pluralOverride, prepNotes, parentheticalNote, recipeText: a missing or null value in the database becomes `""` in the output, never `null`.

**Booleans follow truthiness.**
The fields isOptional, quantityIsApprox, pluralByDefault, isMassNoun, isDeprecated, variantDeprecated, and isAlt all map: a stored `1` becomes `true`, a stored `0` becomes `false`, anything missing becomes `false`.

### Heading row pieces

A "heading row" is a sub-section title that shows up between ingredients in the editor (like "For the sauce:" appearing before the sauce's ingredients). It has these pieces:

- **rowType** — always the text `"heading"`
- **headingId** — the heading's database id, or null
- **headingClientId** — the letter `h-` followed by the headingId (or null if there's no headingId)
- **sectionId** — which sub-section it belongs to, or null
- **sortOrder** — its ordering number, or null
- **text** — the heading text. Empty string if missing.

If the database is so old that the headings table doesn't even exist, there are simply no heading rows in the output. No error is raised.

## Tags

Same exact rules as the `listRecipes` tag rules. To save you flipping back to the other doc:

- Hidden tags are filtered out.
- Empty or whitespace-only tag names are dropped.
- Tag names are trimmed.
- Order: by sort_order ascending (no sort_order = goes last), then by tag-mapping id, then alphabetical (case-insensitive).
- Duplicates (case-insensitive) are removed; the first one in order wins, with its original casing preserved.

## Servings

Same rules as servings in `listRecipes`. Three values:

- **default** — how many people the recipe normally serves, or null
- **min** — smallest, or null
- **max** — largest, or null

Each one is either a positive number or null. Zero, negative, or unparseable values all become null. The three are independent — they're not validated against each other.

## When the recipe doesn't exist

You get back `null`. No error.

## When you pass a bad recipe id

If you pass `null`, `undefined`, `0`, a negative number, or anything that isn't a positive number, you get back `null`. No error.

## When the database fails

The function fails loudly — it throws. It does NOT silently pretend everything is fine. Whatever code is calling this is responsible for catching the error and deciding what to do (show a toast, fall back to a cached copy, etc.).

## What this function does NOT do

- It doesn't change anything in the database. Read-only.
- It doesn't filter rows. You get every step, every ingredient, every heading the recipe has.
- It doesn't include any field other than the ones listed above.
- It doesn't fix the "one synthetic section wrapper" weirdness. Future cleanup.
- It doesn't normalize the mixed-type quantity field. Future cleanup.
- It doesn't drop the `"Add an ingredient."` placeholder. Future cleanup.
- It doesn't promise the order of fields inside an object. Only the order of items inside arrays is part of this contract.

## Things we might want to change later

(Not now, but worth writing down so we don't forget.)

- Get rid of the synthetic single-section wrapper. Each real database sub-section should be its own entry in the sections list.
- Normalize quantity to always be one type — pick "number or null" or "string or null", but not both.
- Drop the `"Add an ingredient."` placeholder string entirely — empty should be empty in the database.

These do NOT happen during migration. They're separate jobs done later.

## How we test

The test data lives in `js/data/fixtures/loadRecipeDetail.json`.
The old local database and Supabase must give the same answer for every scenario before this feature can be turned on.

The scenarios cover missing recipes, bad ids, recipe tags, servings, steps, ingredient rows, heading rows, row ordering, linked recipes, retired ingredients, retired variants, placeholder text, and mixed quantity values.