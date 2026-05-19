-- Persist store-aisle (all) intent and keep future catalog variants linked automatically.

alter table catalog.ingredient_store_location
  add column if not exists all_variants boolean not null default false;

create or replace function catalog.is_active_catalog_variant_name(variant_name text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(variant_name, ''))) not in (
    '', 'default', 'base', 'any', 'all'
  );
$$;

create or replace function catalog.sync_all_variant_store_links_for_variant(
  p_ingredient_variant_id bigint
)
returns void
language plpgsql
set search_path = catalog, public
as $$
declare
  v_ingredient_id bigint;
  v_variant_name text;
begin
  select iv.ingredient_id, iv.variant
    into v_ingredient_id, v_variant_name
    from ingredient_variants iv
   where iv.id = p_ingredient_variant_id
     and coalesce(iv.is_deprecated, false) = false;

  if v_ingredient_id is null then
    return;
  end if;

  if not catalog.is_active_catalog_variant_name(v_variant_name) then
    return;
  end if;

  insert into ingredient_variant_store_location
    (ingredient_variant_id, store_location_id)
  select p_ingredient_variant_id, isl.store_location_id
    from ingredient_store_location isl
   where isl.ingredient_id = v_ingredient_id
     and isl.all_variants = true
     and not exists (
       select 1
         from ingredient_variant_store_location ivsl
        where ivsl.ingredient_variant_id = p_ingredient_variant_id
          and ivsl.store_location_id = isl.store_location_id
     );
end;
$$;

create or replace function catalog.trg_sync_all_variant_store_links()
returns trigger
language plpgsql
set search_path = catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    perform catalog.sync_all_variant_store_links_for_variant(new.id);
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(old.is_deprecated, false) = true
     and coalesce(new.is_deprecated, false) = false then
    perform catalog.sync_all_variant_store_links_for_variant(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists ingredient_variants_sync_all_variant_store_links
  on catalog.ingredient_variants;

create trigger ingredient_variants_sync_all_variant_store_links
after insert or update of is_deprecated on catalog.ingredient_variants
for each row
execute function catalog.trg_sync_all_variant_store_links();

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
  v_aisle_idx integer := 0;
  v_all_owner_idx jsonb := '{}'::jsonb;
  v_all_owner_aisle_idx integer;
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

  v_aisle_idx := 0;
  for v_aisle in
    select * from jsonb_array_elements(coalesce(store_payload->'aisles', '[]'::jsonb))
  loop
    v_aisle_idx := v_aisle_idx + 1;
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

      if exists (
        select 1
          from jsonb_array_elements(coalesce(v_item->'selected_variants', '[]'::jsonb)) as selected_variant(value)
         where lower(btrim(selected_variant.value #>> '{}')) = 'all'
      ) then
        v_all_owner_idx := jsonb_set(
          v_all_owner_idx,
          array[v_ingredient_id::text],
          to_jsonb(v_aisle_idx),
          true
        );
      end if;
    end loop;
  end loop;

  update stores
     set chain_name = coalesce(store_payload->>'chain', ''),
         location_name = coalesce(store_payload->>'location', '')
   where id = v_store_id;

  v_aisle_idx := 0;
  for v_aisle in
    select * from jsonb_array_elements(coalesce(store_payload->'aisles', '[]'::jsonb))
  loop
    v_aisle_idx := v_aisle_idx + 1;
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

      v_all_owner_aisle_idx := nullif(v_all_owner_idx->>v_ingredient_id::text, '')::integer;
      v_item_has_all_variant :=
        v_all_owner_aisle_idx is not null
        and v_all_owner_aisle_idx = v_aisle_idx;

      select
        coalesce(jsonb_array_length(coalesce(v_item->'selected_variants', '[]'::jsonb)), 0) = 0
        or exists (
          select 1
            from jsonb_array_elements(coalesce(v_item->'selected_variants', '[]'::jsonb)) as selected_variant(value)
           where lower(btrim(selected_variant.value #>> '{}')) in ('', 'default', 'base', 'any', 'all')
        )
        into v_item_has_base_variant;

      if v_item_has_base_variant then
        insert into ingredient_store_location
          (ingredient_id, store_location_id, all_variants)
        values (v_ingredient_id, v_aisle_id, v_item_has_all_variant);
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
             and catalog.is_active_catalog_variant_name(variant)
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

with ingredient_store_links as (
  select sl.store_id, sl.id as aisle_id, isl.ingredient_id
    from catalog.ingredient_store_location isl
    join catalog.store_locations sl on sl.id = isl.store_location_id
  union
  select sl.store_id, sl.id, iv.ingredient_id
    from catalog.ingredient_variant_store_location ivsl
    join catalog.store_locations sl on sl.id = ivsl.store_location_id
    join catalog.ingredient_variants iv on iv.id = ivsl.ingredient_variant_id
),
ingredient_aisle_span as (
  select
    isl.id as base_link_id,
    (
      select count(distinct links.aisle_id)
        from ingredient_store_links links
       where links.store_id = sl.store_id
         and links.ingredient_id = isl.ingredient_id
    ) as aisle_count
  from catalog.ingredient_store_location isl
  join catalog.store_locations sl on sl.id = isl.store_location_id
),
fully_linked as (
  select isl.id as base_link_id
    from catalog.ingredient_store_location isl
    join ingredient_aisle_span span on span.base_link_id = isl.id
   where span.aisle_count = 1
     and not exists (
       select 1
         from catalog.ingredient_variants iv
        where iv.ingredient_id = isl.ingredient_id
          and coalesce(iv.is_deprecated, false) = false
          and catalog.is_active_catalog_variant_name(iv.variant)
          and not exists (
            select 1
              from catalog.ingredient_variant_store_location ivsl
             where ivsl.ingredient_variant_id = iv.id
               and ivsl.store_location_id = isl.store_location_id
          )
     )
)
update catalog.ingredient_store_location isl
   set all_variants = true
  from fully_linked fl
 where isl.id = fl.base_link_id;

grant execute on function catalog.sync_all_variant_store_links_for_variant(bigint) to anon, authenticated;
grant execute on function catalog.save_store_layout(jsonb) to anon, authenticated;
