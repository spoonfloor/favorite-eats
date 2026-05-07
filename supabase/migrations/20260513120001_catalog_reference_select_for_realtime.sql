-- Realtime postgres_changes require SELECT privilege for the subscribing role.

grant usage on schema catalog to anon, authenticated;

grant select on table catalog.ingredients to anon, authenticated;
grant select on table catalog.ingredient_variants to anon, authenticated;
grant select on table catalog.ingredient_synonyms to anon, authenticated;
grant select on table catalog.stores to anon, authenticated;
grant select on table catalog.units to anon, authenticated;
grant select on table catalog.tags to anon, authenticated;
grant select on table catalog.sizes to anon, authenticated;
grant select on table catalog.ingredient_variant_tag_map to anon, authenticated;
grant select on table catalog.recipe_tag_map to anon, authenticated;
grant select on table catalog.recipe_ingredient_map to anon, authenticated;
grant select on table catalog.recipe_ingredient_substitutes to anon, authenticated;
grant select on table catalog.ingredient_store_location to anon, authenticated;
grant select on table catalog.ingredient_variant_store_location to anon, authenticated;
