-- Variant delete: promote variant-only aisle placements to base links, then remove
-- variant aisle links and the catalog variant row — all in one transaction.
--
-- Without promotion, deleting the sole variant link for foo (bar) in an aisle leaves
-- no ingredient_store_location or ingredient_variant_store_location row (empty aisle).

create or replace function catalog.delete_catalog_named_variant_with_aisle_promotion(
  p_ingredient_id bigint,
  p_variant_name text,
  p_extra_aisle_ids bigint[] default null
) returns integer
  language plpgsql
  set search_path = catalog, public
as $$
declare
  v_variant_key text := lower(btrim(coalesce(p_variant_name, '')));
  v_matching_ids bigint[];
  v_aisle_ids bigint[];
  v_aisle_id bigint;
  v_removed integer := 0;
begin
  if p_ingredient_id is null or p_ingredient_id <= 0 then
    return 0;
  end if;

  if v_variant_key = '' or v_variant_key in ('default', 'base', 'any') then
    return 0;
  end if;

  select array_agg(id order by id)
    into v_matching_ids
    from ingredient_variants
   where ingredient_id = p_ingredient_id
     and lower(btrim(variant)) = v_variant_key;

  if v_matching_ids is null or cardinality(v_matching_ids) = 0 then
    return 0;
  end if;

  select array_agg(distinct aisle_id order by aisle_id)
    into v_aisle_ids
    from (
      select ivsl.store_location_id as aisle_id
        from ingredient_variant_store_location ivsl
       where ivsl.ingredient_variant_id = any(v_matching_ids)
      union
      select unnest(coalesce(p_extra_aisle_ids, array[]::bigint[]))
    ) combined
   where aisle_id is not null
     and aisle_id > 0;

  if v_aisle_ids is not null then
    foreach v_aisle_id in array v_aisle_ids loop
      if exists (
        select 1
          from ingredient_store_location isl
         where isl.ingredient_id = p_ingredient_id
           and isl.store_location_id = v_aisle_id
      ) then
        continue;
      end if;

      if exists (
        select 1
          from ingredient_variant_store_location ivsl
          join ingredient_variants iv on iv.id = ivsl.ingredient_variant_id
         where ivsl.store_location_id = v_aisle_id
           and iv.ingredient_id = p_ingredient_id
           and not (ivsl.ingredient_variant_id = any(v_matching_ids))
      ) then
        continue;
      end if;

      insert into ingredient_store_location (ingredient_id, store_location_id, all_variants)
      values (p_ingredient_id, v_aisle_id, false);
    end loop;
  end if;

  delete from ingredient_variant_store_location
   where ingredient_variant_id = any(v_matching_ids);

  delete from ingredient_variant_tag_map
   where ingredient_variant_id = any(v_matching_ids);

  delete from ingredient_variants
   where id = any(v_matching_ids);

  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

grant execute on function catalog.delete_catalog_named_variant_with_aisle_promotion(
  bigint,
  text,
  bigint[]
) to anon, authenticated;
