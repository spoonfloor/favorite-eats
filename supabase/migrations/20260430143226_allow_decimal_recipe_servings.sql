alter table catalog.recipes
  alter column servings_default type numeric using servings_default::numeric,
  alter column servings_min type numeric using servings_min::numeric,
  alter column servings_max type numeric using servings_max::numeric;
