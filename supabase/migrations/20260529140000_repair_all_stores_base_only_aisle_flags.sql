-- Idempotent repair: clear (all) intent on base-only items for every store.

create or replace function catalog.repair_all_store_aisle_base_only_flags()
returns table(store_id bigint, cleared_all_flags bigint)
language plpgsql
set search_path = catalog, public
as $$
begin
  return query
  with updated as (
    update catalog.ingredient_store_location isl
       set all_variants = false
     where isl.all_variants = true
       and not catalog.ingredient_has_active_catalog_variants(isl.ingredient_id)
    returning isl.store_location_id
  )
  select sl.store_id, count(*)::bigint as cleared_all_flags
    from updated u
    join catalog.store_locations sl on sl.id = u.store_location_id
   group by sl.store_id
   order by sl.store_id;
end;
$$;

select * from catalog.repair_all_store_aisle_base_only_flags();

grant execute on function catalog.repair_all_store_aisle_base_only_flags() to anon, authenticated;
