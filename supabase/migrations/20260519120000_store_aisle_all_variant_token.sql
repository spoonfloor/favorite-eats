-- Store aisle editor: "all" token creates base + every catalog variant link.
create or replace function catalog.save_store_layout(store_payload jsonb)
returns jsonb
language plpgsql
set search_path = catalog, public
as $$
declare
  v_store_id bigint;
  v_aisle jsonb;
  v_aisle_id bigint;
  v_aisle_ids bigint[] := array[]::bigint[];
  v_item jsonb;
  v_ingredient_id bigint;
  v_item_has_base_variant boolean;
  v_item_has_all_variant boolean;
  v_variant jsonb;
  v_variant_name text;
  v_variant_id bigint;
  v_next_variant_sort integer;
begin
  v_store_id := nullif(store_payload->>'id', '')::bigint;
  if v_store_id is null or v_store_id <= 0 then
    raise exception 'saveStoreLayout: valid store id is required';
  end if;

  if not exists (select 1 from stores where id = v_store_id) then
    raise exception 'saveStoreLayout: store % does not exist', v_store_id;
  end if;

  update stores
     set chain_name = coalesce(store_payload->>'chain', ''),
         location_name = coalesce(store_payload->>'location', '')
   where id = v_store_id;

  for v_aisle in
    select * from jsonb_array_elements(coalesce(store_payload->'aisles', '[]'::jsonb))
  loop
    v_aisle_id := nullif(v_aisle->>'id', '')::bigint;

    if v_aisle_id is not null
       and exists (
         select 1 from store_locations
          where id = v_aisle_id and store_id = v_store_id
       ) then
      update store_locations
         set name = coalesce(nullif(v_aisle->>'name', ''), 'Aisle'),
             sort_order = nullif(v_aisle->>'sort_order', '')::integer
       where id = v_aisle_id
         and store_id = v_store_id;
    else
      insert into store_locations (store_id, name, sort_order)
      values (
        v_store_id,
        coalesce(nullif(v_aisle->>'name', ''), 'Aisle'),
        nullif(v_aisle->>'sort_order', '')::integer
      )
      returning id into v_aisle_id;
    end if;

    v_aisle_ids := array_append(v_aisle_ids, v_aisle_id);

    delete from ingredient_store_location where store_location_id = v_aisle_id;
    delete from ingredient_variant_store_location where store_location_id = v_aisle_id;

    for v_item in
      select * from jsonb_array_elements(coalesce(v_aisle->'item_specs', '[]'::jsonb))
    loop
      v_ingredient_id := nullif(v_item->>'ingredient_id', '')::bigint;
      if v_ingredient_id is null or v_ingredient_id <= 0 then
        select id into v_ingredient_id
          from ingredients
         where lower(btrim(name)) = lower(btrim(coalesce(v_item->>'base_name', '')))
           and coalesce(is_deprecated, false) = false
           and coalesce(is_hidden, false) = false
         order by name, id
         limit 1;
      end if;
      if v_ingredient_id is null or v_ingredient_id <= 0 then
        continue;
      end if;

      select exists (
        select 1
          from jsonb_array_elements(coalesce(v_item->'selected_variants', '[]'::jsonb)) as selected_variant(value)
         where lower(btrim(selected_variant.value #>> '{}')) = 'all'
      )
      into v_item_has_all_variant;

      select
        coalesce(jsonb_array_length(coalesce(v_item->'selected_variants', '[]'::jsonb)), 0) = 0
        or exists (
          select 1
            from jsonb_array_elements(coalesce(v_item->'selected_variants', '[]'::jsonb)) as selected_variant(value)
           where lower(btrim(selected_variant.value #>> '{}')) in ('', 'default', 'base', 'any', 'all')
        )
        into v_item_has_base_variant;

      if v_item_has_base_variant then
        if not exists (
          select 1
            from ingredient_store_location
           where ingredient_id = v_ingredient_id
             and store_location_id = v_aisle_id
        ) then
          insert into ingredient_store_location (ingredient_id, store_location_id)
          values (v_ingredient_id, v_aisle_id);
        end if;
      end if;

      for v_variant in
        select * from jsonb_array_elements(coalesce(v_item->'selected_variants', '[]'::jsonb))
      loop
        v_variant_name := btrim(v_variant #>> '{}');
        if lower(v_variant_name) in ('', 'default', 'base', 'any', 'all') then
          continue;
        end if;

        select id into v_variant_id
          from ingredient_variants
         where ingredient_id = v_ingredient_id
           and lower(btrim(variant)) = lower(v_variant_name)
         order by coalesce(sort_order, 999999), id
         limit 1;

        if v_variant_id is null then
          select coalesce(max(sort_order), 0) + 1
            into v_next_variant_sort
            from ingredient_variants
           where ingredient_id = v_ingredient_id;

          insert into ingredient_variants
            (ingredient_id, variant, sort_order, home_location, is_deprecated)
          values (v_ingredient_id, v_variant_name, v_next_variant_sort, 'none', false)
          returning id into v_variant_id;
        end if;

        if not exists (
          select 1
            from ingredient_variant_store_location
           where ingredient_variant_id = v_variant_id
             and store_location_id = v_aisle_id
        ) then
          insert into ingredient_variant_store_location
            (ingredient_variant_id, store_location_id)
          values (v_variant_id, v_aisle_id);
        end if;

        v_variant_id := null;
      end loop;

      if v_item_has_all_variant then
        for v_variant_id in
          select id
            from ingredient_variants
           where ingredient_id = v_ingredient_id
             and coalesce(is_deprecated, false) = false
             and lower(btrim(coalesce(variant, ''))) not in ('', 'default', 'base', 'any', 'all')
           order by coalesce(sort_order, 999999), id
        loop
          if not exists (
            select 1
              from ingredient_variant_store_location
             where ingredient_variant_id = v_variant_id
               and store_location_id = v_aisle_id
          ) then
            insert into ingredient_variant_store_location
              (ingredient_variant_id, store_location_id)
            values (v_variant_id, v_aisle_id);
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  delete from ingredient_variant_store_location
   where store_location_id in (
     select id from store_locations
      where store_id = v_store_id
        and not (id = any(v_aisle_ids))
   );

  delete from ingredient_store_location
   where store_location_id in (
     select id from store_locations
      where store_id = v_store_id
        and not (id = any(v_aisle_ids))
   );

  delete from store_locations
   where store_id = v_store_id
     and not (id = any(v_aisle_ids));

  return jsonb_build_object('id', v_store_id);
end;
$$;

grant execute on function catalog.save_store_layout(jsonb) to anon, authenticated;
