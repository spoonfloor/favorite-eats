# Swift App Understanding

This is the current shared understanding of what the companion Swift/iOS app is for, based on the primary user journeys and follow-up decisions so far.

## Primary user journeys

### 1. Prepare a meal using a recipe

The user wants to:

- see a list of recipes
- browse or find a recipe using a search bar and filter chips, similar to the web app
- open a recipe
- view the recipe in a presentation very similar to the web app:
  - `You Will Need`
  - ingredients
  - steps
- change the number of servings
- see ingredient amounts and `You Will Need` amounts update accordingly

### 2. Shop for the week's groceries

The user wants to:

- build a menu plan by selecting recipes
- choose servings for each selected recipe
- select one or more stores
- treat store order as priority
- generate a shopping list organized by store, then aisle
- see items assigned to the first selected store that can fulfill them
- have any remaining items spill over to the next selected store(s)
- add other already-known shopping items outside the selected recipes
- view the shopping list as a checklist
- for `v0`, simply render a usable shopping list

## Core behavior decisions

### Recipe servings and scaling

- Recipes can define a servings range in the DB.
- Scaling should be capped to the allowed min/max serving range.
- Scaling math should use the recipe's canonical / as-written serving count.
- Example:
  - if the recipe is written for 2 servings
  - changing to 4 servings doubles the ingredient amounts
- `You Will Need` must scale too.
- Example:
  - default: `rice (1 cup)`
  - 2x: `rice (2 cups)`

### Meal plan state

- The meal plan can be ephemeral for now.
- It does not need to be persisted in shared Postgres plan tables for `v0`.
- It could later be stored locally if useful.

### Shopping items outside recipes

- Additional shopping items like diapers are assumed to already exist as shopping items.
- The app should allow adding those to the shopping flow even if they are not part of the selected menu plan.

### Store priority and fulfillment

- Store order matters.
- The app should try to fulfill everything at store 1 first.
- Whatever cannot be fulfilled there should move to store 2, then store 3, and so on.

Example:

- menu plan: `pb&j`
- needed items: `bread`, `peanut butter`, `jelly`
- store 1 has `bread` and `jelly`, but not `peanut butter`
- store 2 has `peanut butter`

Expected shopping list:

- `store 1`
  - `bakery -> bread`
  - `cereal aisle -> jelly`
- `store 2`
  - `cereal -> peanut butter`

### Missing store/aisle mapping

- If an item appears in zero aisles across the selected stores, it should be called out clearly.
- It should appear in an `Unassigned` section.
- Example wording:
  - `These items don't appear in any store aisles: foo, bar, baz`

### Store/aisle grouping

- The shopping list should be grouped by store, then aisle.
- Ordering should obey the sort order defined in the DB.

### Checklist state

- Checklist state can be ephemeral for now.
- It can be stored locally if needed, but does not need to be part of the shared DB contract for `v0`.

### Export/share

- For `v0`, the requirement is only:
  - render a shopping list cleanly
- Rich export or share behavior can come later.

## Matching and grouping rules

### Ingredient matching

- Matching must use `name + variant`.
- It should be all-or-nothing.
- Example:
  - if the recipe needs `roma tomatoes`
  - that should not be treated as interchangeable with some other tomato variant

### Multiple aisle matches

- If a store has multiple matching aisle placements for the same needed item, use the first instance.
- This is intentionally a simple rule for now.

### Merging identical normal items

- If two recipes contribute the same item with the same variant, those quantities should merge.
- Example:
  - Recipe A: `1 foo`
  - Recipe B: `2 foo`
  - Shopping list: `3 foo`

### Different variants stay separate

- If two items have the same base name but different variants, they should remain separate lines.

### Optional items

- Optional items should be included in the shopping list, but clearly marked.
- Example:
  - Recipe A: `2 foo`
  - Recipe B: `1 foo (optional)`
  - Shopping list: `3 foo (1 optional)`

### OR alternates

- Alternates should remain visible in the shopping list.
- Early idea was to merge alternate groups across recipes, but this was revised.
- The current decision is:
  - alternate groups should stay separated by recipe
  - because the eventual choice may differ per recipe

Example:

- `1 foo (OR 2 bar) [lasagna]`
- `2 foo (OR 1 bar) [scones]`

This means:

- ordinary ingredients can merge across recipes
- optional quantities can merge while remaining visibly optional
- alternate groups should not be merged across recipes
- alternate groups need to preserve their source recipe identity

## Consequences for the prototype

The early dumb HTML prototype should prove that the app can support these user journeys from DB-driven inputs without undocumented web-client behavior.

The prototype should eventually demonstrate:

- recipe list browsing with search and filter chips similar to the web app
- recipe detail rendering
- servings scaling
- scaled `You Will Need`
- ephemeral recipe selection for a meal plan
- selected stores in priority order
- shopping-list generation grouped by store and aisle
- exact matching on `name + variant`
- optional-item marking
- recipe-specific alternate-group handling
- unassigned-item handling

## Consequences for the DB contract

The DB contract must eventually support:

- recipe list and search/filter consumption
- recipe detail presentation
- recipe servings ranges and canonical scaling inputs
- scaled ingredient math from structured ingredient rows
- scaled `You Will Need`
- store and aisle ordering
- exact `name + variant` matching for shopping fulfillment
- enough ingredient structure to distinguish:
  - required
  - optional
  - alternate
  - variant-specific
- enough store mapping structure to assign items by store priority
- enough information to surface unassigned items cleanly

## Current `v0` emphasis

The immediate goal is not to solve every architectural question up front.

The immediate goal is to get to a dumb consumer prototype quickly so we can answer:

- can a consumer render the recipe experience from DB reads?
- can it scale servings correctly?
- can it build the shopping list the way the Swift app will need?
- where is the DB already sufficient?
- where is the app still relying on undocumented web-client behavior?
