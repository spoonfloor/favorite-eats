-- Variant delete drops orphaned plan.selected_items; save_shopping_plan ignores stale iv ids.

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
  set search_path = catalog, plan, public
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

  delete from plan.selected_items si
   where si.ingredient_variant_id = any(v_matching_ids);

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


create or replace function catalog.save_shopping_plan(
  plan_payload jsonb,
  allow_empty boolean default false
)
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_plan jsonb;
  v_plan_json jsonb;
  v_plan_updated_at timestamptz;
  v_plan_version integer;
begin
  perform set_config('statement_timeout', '120s', true);

  v_plan := coalesce(plan_payload, '{}'::jsonb);

  insert into plan.documents (slug, title, status)
  values ('default', 'Default', 'active')
  on conflict (slug) do update
    set updated_at = now(),
        status = 'active'
  returning id into v_doc_id;

  if not coalesce(allow_empty, false)
     and not catalog.shopping_plan_payload_has_selections(v_plan)
     and catalog.shopping_plan_document_has_selections(v_doc_id) then
    raise exception 'empty plan snapshot rejected'
      using errcode = 'P0001';
  end if;

  delete from plan.selected_items si
  where si.document_id = v_doc_id
    and si.item_key not in (
      select nullif(j.value->>'key', '')
      from jsonb_each(coalesce(v_plan->'itemSelections', '{}'::jsonb)) as j(key, value)
      where nullif(j.value->>'key', '') is not null
    );

  insert into plan.selected_items
    (document_id, item_key, ingredient_variant_id, name, variant_name, quantity)
  select
    v_doc_id,
    nullif(j.value->>'key', ''),
    case
      when nullif(j.value->>'ingredientVariantId', '')::bigint is null then null
      when exists (
        select 1
          from catalog.ingredient_variants iv
         where iv.id = nullif(j.value->>'ingredientVariantId', '')::bigint
      ) then nullif(j.value->>'ingredientVariantId', '')::bigint
      else null
    end,
    coalesce(j.value->>'name', ''),
    coalesce(j.value->>'variantName', ''),
    nullif(j.value->>'quantity', '')::numeric
  from jsonb_each(coalesce(v_plan->'itemSelections', '{}'::jsonb)) as j(key, value)
  where nullif(j.value->>'key', '') is not null
  on conflict (document_id, item_key) do update
    set ingredient_variant_id = excluded.ingredient_variant_id,
        name = excluded.name,
        variant_name = excluded.variant_name,
        quantity = excluded.quantity,
        updated_at = now();

  delete from plan.selected_recipes sr
  where sr.document_id = v_doc_id
    and sr.recipe_id not in (
      select nullif(j.value->>'recipeId', '')::bigint
      from jsonb_each(coalesce(v_plan->'recipeSelections', '{}'::jsonb)) as j(key, value)
      inner join catalog.recipes r
        on r.id = nullif(j.value->>'recipeId', '')::bigint
      where nullif(j.value->>'recipeId', '') is not null
    );

  insert into plan.selected_recipes
    (document_id, recipe_id, title, quantity, servings_override)
  select
    v_doc_id,
    r.id,
    coalesce(j.value->>'title', ''),
    nullif(j.value->>'quantity', '')::numeric,
    nullif(j.value->>'servingsOverride', '')::numeric
  from jsonb_each(coalesce(v_plan->'recipeSelections', '{}'::jsonb)) as j(key, value)
  inner join catalog.recipes r
    on r.id = nullif(j.value->>'recipeId', '')::bigint
  where nullif(j.value->>'recipeId', '') is not null
  on conflict (document_id, recipe_id) do update
    set title = excluded.title,
        quantity = excluded.quantity,
        servings_override = excluded.servings_override,
        updated_at = now();

  delete from plan.selected_recipe_roots rr
  where rr.document_id = v_doc_id
    and rr.recipe_id not in (
      select nullif(j.value->>'recipeId', '')::bigint
      from jsonb_each(coalesce(v_plan->'recipeSelectionRoots', '{}'::jsonb)) as j(key, value)
      inner join catalog.recipes r
        on r.id = nullif(j.value->>'recipeId', '')::bigint
      where nullif(j.value->>'recipeId', '') is not null
    );

  insert into plan.selected_recipe_roots
    (document_id, recipe_id, title, quantity, servings_override)
  select
    v_doc_id,
    r.id,
    coalesce(j.value->>'title', ''),
    nullif(j.value->>'quantity', '')::numeric,
    nullif(j.value->>'servingsOverride', '')::numeric
  from jsonb_each(coalesce(v_plan->'recipeSelectionRoots', '{}'::jsonb)) as j(key, value)
  inner join catalog.recipes r
    on r.id = nullif(j.value->>'recipeId', '')::bigint
  where nullif(j.value->>'recipeId', '') is not null
  on conflict (document_id, recipe_id) do update
    set title = excluded.title,
        quantity = excluded.quantity,
        servings_override = excluded.servings_override,
        updated_at = now();

  with store_order_raw as (
    select
      nullif(elem #>> '{}', '')::bigint as store_id,
      ord::integer as order_index
    from jsonb_array_elements(coalesce(v_plan->'storeOrder', '[]'::jsonb))
      with ordinality as t(elem, ord)
  ),
  store_order_valid as (
    select sor.store_id, sor.order_index
    from store_order_raw sor
    where sor.store_id is not null
      and sor.store_id > 0
      and exists (select 1 from catalog.stores s where s.id = sor.store_id)
  ),
  selected_valid as (
    select distinct nullif(elem #>> '{}', '')::bigint as store_id
    from jsonb_array_elements(coalesce(v_plan->'selectedStoreIds', '[]'::jsonb)) as t(elem)
    where nullif(elem #>> '{}', '')::bigint is not null
      and nullif(elem #>> '{}', '')::bigint > 0
      and exists (
        select 1
        from catalog.stores s
        where s.id = nullif(elem #>> '{}', '')::bigint
      )
  ),
  combined as (
    select store_id, order_index
    from store_order_valid
    union all
    select sv.store_id, 1000000 + row_number() over (order by sv.store_id)::integer
    from selected_valid sv
    where not exists (
      select 1 from store_order_valid so where so.store_id = sv.store_id
    )
  ),
  ranked as (
    select
      c.store_id,
      row_number() over (order by c.order_index, c.store_id)::integer as order_index,
      exists (
        select 1 from selected_valid sv where sv.store_id = c.store_id
      ) as is_selected
    from combined c
  ),
  deleted_stale_store_prefs as (
    delete from plan.store_preferences sp
    where sp.document_id = v_doc_id
      and not exists (
        select 1 from ranked r where r.store_id = sp.store_id
      )
  )
  insert into plan.store_preferences
    (document_id, store_id, is_selected, order_index)
  select
    v_doc_id,
    r.store_id,
    r.is_selected,
    r.order_index
  from ranked r
  on conflict (document_id, store_id) do update
    set is_selected = excluded.is_selected,
        order_index = excluded.order_index,
        updated_at = now();

  update plan.documents
     set version = version + 1,
         updated_at = now()
   where id = v_doc_id
  returning version, updated_at into v_plan_version, v_plan_updated_at;

  select jsonb_build_object(
    'version', 1,
    'itemSelections',
      coalesce(
        (
          select jsonb_object_agg(
            si.item_key,
            jsonb_strip_nulls(jsonb_build_object(
              'key', si.item_key,
              'name', si.name,
              'variantName', si.variant_name,
              'quantity', si.quantity,
              'ingredientVariantId', si.ingredient_variant_id
            ))
          )
          from plan.selected_items si
          where si.document_id = v_doc_id
        ),
        '{}'::jsonb
      ),
    'recipeSelections',
      coalesce(
        (
          select jsonb_object_agg(
            sr.recipe_id::text,
            jsonb_strip_nulls(jsonb_build_object(
              'key', sr.recipe_id::text,
              'recipeId', sr.recipe_id,
              'title', sr.title,
              'quantity', sr.quantity,
              'servingsOverride', sr.servings_override
            ))
          )
          from plan.selected_recipes sr
          where sr.document_id = v_doc_id
        ),
        '{}'::jsonb
      ),
    'recipeSelectionRoots',
      coalesce(
        (
          select jsonb_object_agg(
            rr.recipe_id::text,
            jsonb_strip_nulls(jsonb_build_object(
              'key', rr.recipe_id::text,
              'recipeId', rr.recipe_id,
              'title', rr.title,
              'quantity', rr.quantity,
              'servingsOverride', rr.servings_override
            ))
          )
          from plan.selected_recipe_roots rr
          where rr.document_id = v_doc_id
        ),
        '{}'::jsonb
      ),
    'storeOrder',
      coalesce(
        (
          select jsonb_agg(sp.store_id order by sp.order_index, sp.store_id)
          from plan.store_preferences sp
          where sp.document_id = v_doc_id
        ),
        '[]'::jsonb
      ),
    'selectedStoreIds',
      coalesce(
        (
          select jsonb_agg(sp.store_id order by sp.order_index, sp.store_id)
          from plan.store_preferences sp
          where sp.document_id = v_doc_id
            and sp.is_selected = true
        ),
        '[]'::jsonb
      )
  ) into v_plan_json;

  return jsonb_build_object(
    'plan', v_plan_json,
    'planUpdatedAt', v_plan_updated_at,
    'planVersion', v_plan_version
  );
end;
$$;

grant execute on function catalog.save_shopping_plan(jsonb, boolean) to anon, authenticated;
