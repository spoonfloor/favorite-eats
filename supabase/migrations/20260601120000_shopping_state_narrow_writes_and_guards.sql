-- Narrow plan/list key rewrite RPCs + server-side empty plan guards (Better stage).

create or replace function catalog.shopping_plan_payload_has_selections(plan_payload jsonb)
returns boolean
language sql
immutable
as $$
  select
    exists (select 1 from jsonb_object_keys(coalesce(plan_payload->'itemSelections', '{}'::jsonb)))
    or exists (select 1 from jsonb_object_keys(coalesce(plan_payload->'recipeSelections', '{}'::jsonb)))
    or exists (select 1 from jsonb_object_keys(coalesce(plan_payload->'recipeSelectionRoots', '{}'::jsonb)));
$$;

create or replace function catalog.shopping_plan_document_has_selections(p_document_id bigint)
returns boolean
language sql
stable
set search_path = catalog, plan, list, public
as $$
  select exists (
      select 1 from plan.selected_items si where si.document_id = p_document_id
    )
    or exists (
      select 1 from plan.selected_recipes sr where sr.document_id = p_document_id
    )
    or exists (
      select 1 from plan.selected_recipe_roots rr where rr.document_id = p_document_id
    );
$$;

create or replace function catalog.rewrite_plan_item_keys(rewrites jsonb)
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_rewrite jsonb;
  v_old_key text;
  v_new_key text;
  v_moved_qty numeric;
  v_existing_qty numeric;
  v_plan_updated_at timestamptz;
  v_plan_version integer;
begin
  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    insert into plan.documents (slug, title, status)
    values ('default', 'Default', 'active')
    returning id into v_doc_id;
  end if;

  for v_rewrite in
    select value from jsonb_array_elements(coalesce(rewrites, '[]'::jsonb))
  loop
    v_old_key := nullif(v_rewrite->>'oldKey', '');
    v_new_key := nullif(v_rewrite->>'newKey', '');
    if v_old_key is null or v_new_key is null or v_old_key = v_new_key then
      continue;
    end if;

    select si.quantity
      into v_moved_qty
      from plan.selected_items si
     where si.document_id = v_doc_id
       and si.item_key = v_old_key;

    if not found then
      continue;
    end if;

    select si.quantity
      into v_existing_qty
      from plan.selected_items si
     where si.document_id = v_doc_id
       and si.item_key = v_new_key;

    if found then
      update plan.selected_items
         set quantity = coalesce(v_existing_qty, 0) + coalesce(v_moved_qty, 0),
             name = coalesce(nullif(v_rewrite->>'name', ''), name),
             variant_name = coalesce(nullif(v_rewrite->>'variantName', ''), variant_name),
             ingredient_variant_id = coalesce(
               nullif(v_rewrite->>'ingredientVariantId', '')::bigint,
               ingredient_variant_id
             ),
             updated_at = now()
       where document_id = v_doc_id
         and item_key = v_new_key;

      delete from plan.selected_items
       where document_id = v_doc_id
         and item_key = v_old_key;
    else
      update plan.selected_items
         set item_key = v_new_key,
             name = coalesce(nullif(v_rewrite->>'name', ''), name),
             variant_name = coalesce(nullif(v_rewrite->>'variantName', ''), variant_name),
             ingredient_variant_id = coalesce(
               nullif(v_rewrite->>'ingredientVariantId', '')::bigint,
               ingredient_variant_id
             ),
             updated_at = now()
       where document_id = v_doc_id
         and item_key = v_old_key;
    end if;
  end loop;

  update plan.documents
     set version = version + 1,
         updated_at = now()
   where id = v_doc_id
  returning version, updated_at into v_plan_version, v_plan_updated_at;

  return jsonb_build_object(
    'planUpdatedAt', v_plan_updated_at,
    'planVersion', v_plan_version
  );
end;
$$;

create or replace function catalog.patch_shopping_list_source_keys(key_map jsonb)
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_old_key text;
  v_new_key text;
  v_list_session_updated_at timestamptz;
begin
  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    return jsonb_build_object('listSessionUpdatedAt', null);
  end if;

  select s.id, s.updated_at
    into v_session_id, v_list_session_updated_at
    from list.sessions s
   where s.plan_document_id = v_doc_id
     and s.status = 'active'
   order by s.updated_at desc, s.id desc
   limit 1;

  if v_session_id is null then
    return jsonb_build_object('listSessionUpdatedAt', null);
  end if;

  for v_old_key, v_new_key in
    select t.key, nullif(t.value, '')
      from jsonb_each_text(coalesce(key_map, '{}'::jsonb)) as t(key, value)
  loop
    if v_old_key is null or v_new_key is null or v_old_key = v_new_key then
      continue;
    end if;

    update list.row_overrides
       set source_key = v_new_key,
           updated_at = now()
     where session_id = v_session_id
       and source_key = v_old_key;

    update list.generated_rows
       set source_key = v_new_key,
           generated_at = now()
     where session_id = v_session_id
       and source_key = v_old_key;
  end loop;

  update list.sessions
     set updated_at = now()
   where id = v_session_id
  returning updated_at into v_list_session_updated_at;

  return jsonb_build_object(
    'listSessionUpdatedAt', v_list_session_updated_at
  );
end;
$$;

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
    nullif(j.value->>'ingredientVariantId', '')::bigint,
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

create or replace function catalog.save_shopping_state(state_payload jsonb)
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_plan jsonb;
  v_list_doc jsonb;
  v_item jsonb;
  v_recipe jsonb;
  v_root jsonb;
  v_store jsonb;
  v_row jsonb;
  v_recipe_id bigint;
  v_root_recipe_id bigint;
  v_store_ids bigint[] := array[]::bigint[];
  v_selected_store_ids bigint[] := array[]::bigint[];
  v_store_id bigint;
  v_order integer;
  v_source_key text;
  v_servings_override numeric;
  v_allow_empty boolean;
begin
  v_allow_empty := coalesce((state_payload->>'allowEmpty')::boolean, false);

  insert into plan.documents (slug, title, status)
  values ('default', 'Default', 'active')
  on conflict (slug) do update
    set updated_at = now(),
        status = 'active'
  returning id into v_doc_id;

  if state_payload ? 'plan' then
    v_plan := coalesce(state_payload->'plan', '{}'::jsonb);

    if not v_allow_empty
       and not catalog.shopping_plan_payload_has_selections(v_plan)
       and catalog.shopping_plan_document_has_selections(v_doc_id) then
      raise exception 'empty plan snapshot rejected'
        using errcode = 'P0001';
    end if;

    delete from plan.selected_items where document_id = v_doc_id;
    for v_item in
      select value from jsonb_each(coalesce(v_plan->'itemSelections', '{}'::jsonb))
    loop
      if nullif(v_item->>'key', '') is null then
        continue;
      end if;
      insert into plan.selected_items
        (document_id, item_key, ingredient_variant_id, name, variant_name, quantity)
      values (
        v_doc_id,
        v_item->>'key',
        nullif(v_item->>'ingredientVariantId', '')::bigint,
        coalesce(v_item->>'name', ''),
        coalesce(v_item->>'variantName', ''),
        nullif(v_item->>'quantity', '')::numeric
      )
      on conflict (document_id, item_key) do update
        set ingredient_variant_id = excluded.ingredient_variant_id,
            name = excluded.name,
            variant_name = excluded.variant_name,
            quantity = excluded.quantity,
            updated_at = now();
    end loop;

    delete from plan.selected_recipes where document_id = v_doc_id;
    for v_recipe in
      select value from jsonb_each(coalesce(v_plan->'recipeSelections', '{}'::jsonb))
    loop
      if nullif(v_recipe->>'recipeId', '') is null then
        continue;
      end if;
      v_recipe_id := nullif(v_recipe->>'recipeId', '')::bigint;
      if not exists (select 1 from catalog.recipes where id = v_recipe_id) then
        continue;
      end if;
      v_servings_override := nullif(v_recipe->>'servingsOverride', '')::numeric;
      insert into plan.selected_recipes
        (document_id, recipe_id, title, quantity, servings_override)
      values (
        v_doc_id,
        v_recipe_id,
        coalesce(v_recipe->>'title', ''),
        nullif(v_recipe->>'quantity', '')::numeric,
        v_servings_override
      )
      on conflict (document_id, recipe_id) do update
        set title = excluded.title,
            quantity = excluded.quantity,
            servings_override = excluded.servings_override,
            updated_at = now();
    end loop;

    delete from plan.selected_recipe_roots where document_id = v_doc_id;
    for v_root in
      select value from jsonb_each(coalesce(v_plan->'recipeSelectionRoots', '{}'::jsonb))
    loop
      if nullif(v_root->>'recipeId', '') is null then
        continue;
      end if;
      v_root_recipe_id := nullif(v_root->>'recipeId', '')::bigint;
      if not exists (select 1 from catalog.recipes where id = v_root_recipe_id) then
        continue;
      end if;
      v_servings_override := nullif(v_root->>'servingsOverride', '')::numeric;
      insert into plan.selected_recipe_roots
        (document_id, recipe_id, title, quantity, servings_override)
      values (
        v_doc_id,
        v_root_recipe_id,
        coalesce(v_root->>'title', ''),
        nullif(v_root->>'quantity', '')::numeric,
        v_servings_override
      )
      on conflict (document_id, recipe_id) do update
        set title = excluded.title,
            quantity = excluded.quantity,
            servings_override = excluded.servings_override,
            updated_at = now();
    end loop;

    v_order := 0;
    for v_store in
      select value from jsonb_array_elements(coalesce(v_plan->'storeOrder', '[]'::jsonb))
    loop
      v_store_id := nullif(v_store #>> '{}', '')::bigint;
      if v_store_id is not null
         and v_store_id > 0
         and exists (select 1 from catalog.stores where id = v_store_id) then
        v_store_ids := array_append(v_store_ids, v_store_id);
      end if;
    end loop;

    for v_store in
      select value from jsonb_array_elements(coalesce(v_plan->'selectedStoreIds', '[]'::jsonb))
    loop
      v_store_id := nullif(v_store #>> '{}', '')::bigint;
      if v_store_id is not null
         and v_store_id > 0
         and exists (select 1 from catalog.stores where id = v_store_id) then
        v_selected_store_ids := array_append(v_selected_store_ids, v_store_id);
        if not (v_store_id = any(v_store_ids)) then
          v_store_ids := array_append(v_store_ids, v_store_id);
        end if;
      end if;
    end loop;

    delete from plan.store_preferences where document_id = v_doc_id;
    foreach v_store_id in array v_store_ids
    loop
      v_order := v_order + 1;
      insert into plan.store_preferences
        (document_id, store_id, is_selected, order_index)
      values (
        v_doc_id,
        v_store_id,
        v_store_id = any(v_selected_store_ids),
        v_order
      )
      on conflict (document_id, store_id) do update
        set is_selected = excluded.is_selected,
            order_index = excluded.order_index,
            updated_at = now();
    end loop;

    update plan.documents
       set version = version + 1,
           updated_at = now()
     where id = v_doc_id;
  end if;

  if state_payload ? 'shoppingListDoc' then
    v_list_doc := coalesce(state_payload->'shoppingListDoc', '{}'::jsonb);

    select id into v_session_id
      from list.sessions
     where plan_document_id = v_doc_id
       and status = 'active'
     order by updated_at desc, id desc
     limit 1;

    if v_session_id is null then
      insert into list.sessions (plan_document_id, status, mode)
      values (v_doc_id, 'active', 'stores')
      returning id into v_session_id;
    else
      update list.sessions set updated_at = now() where id = v_session_id;
    end if;

    delete from list.conflicts where session_id = v_session_id;
    delete from list.manual_rows where session_id = v_session_id;
    delete from list.row_overrides where session_id = v_session_id;

    for v_row in
      select value from jsonb_array_elements(coalesce(v_list_doc->'rows', '[]'::jsonb))
    loop
      v_order := coalesce(nullif(v_row->>'order', '')::integer, 0);
      v_source_key := coalesce(v_row->>'sourceKey', '');

      if v_source_key != '' then
        insert into list.row_overrides
          (
            session_id, source_key, override_text, checked, user_edited, removed,
            store_id, store_label, bucket_label, aisle_id, aisle_sort_order, order_index
          )
        values (
          v_session_id,
          v_source_key,
          coalesce(v_row->>'text', ''),
          coalesce((v_row->>'checked')::boolean, false),
          coalesce((v_row->>'userEdited')::boolean, false),
          false,
          nullif(v_row->>'storeId', '')::bigint,
          coalesce(v_row->>'storeLabel', ''),
          coalesce(v_row->>'bucketLabel', ''),
          nullif(v_row->>'aisleId', '')::bigint,
          nullif(v_row->>'aisleSortOrder', '')::numeric,
          v_order
        );

        insert into list.generated_rows
          (
            session_id, source_key, generated_text, store_id, store_label,
            bucket_label, aisle_id, aisle_sort_order, order_index
          )
        values (
          v_session_id,
          v_source_key,
          coalesce(nullif(v_row->>'sourceText', ''), v_row->>'text', ''),
          nullif(v_row->>'storeId', '')::bigint,
          coalesce(v_row->>'sourceStoreLabel', v_row->>'storeLabel', ''),
          coalesce(v_row->>'sourceBucketLabel', v_row->>'bucketLabel', ''),
          nullif(v_row->>'aisleId', '')::bigint,
          nullif(v_row->>'aisleSortOrder', '')::numeric,
          v_order
        )
        on conflict (session_id, source_key) do update
          set generated_text = excluded.generated_text,
              store_id = excluded.store_id,
              store_label = excluded.store_label,
              bucket_label = excluded.bucket_label,
              aisle_id = excluded.aisle_id,
              aisle_sort_order = excluded.aisle_sort_order,
              order_index = excluded.order_index,
              generated_at = now();
      else
        insert into list.manual_rows
          (
            session_id, id, text, checked, store_id, store_label,
            bucket_label, aisle_id, aisle_sort_order, order_index
          )
        values (
          v_session_id,
          coalesce(nullif(v_row->>'id', ''), gen_random_uuid()::text),
          coalesce(v_row->>'text', ''),
          coalesce((v_row->>'checked')::boolean, false),
          nullif(v_row->>'storeId', '')::bigint,
          coalesce(v_row->>'storeLabel', ''),
          coalesce(v_row->>'bucketLabel', ''),
          nullif(v_row->>'aisleId', '')::bigint,
          nullif(v_row->>'aisleSortOrder', '')::numeric,
          v_order
        );
      end if;
    end loop;
  end if;

  return catalog.load_shopping_state();
end;
$$;

grant execute on function catalog.rewrite_plan_item_keys(jsonb) to anon, authenticated;
grant execute on function catalog.patch_shopping_list_source_keys(jsonb) to anon, authenticated;
grant execute on function catalog.save_shopping_plan(jsonb, boolean) to anon, authenticated;
grant execute on function catalog.save_shopping_state(jsonb) to anon, authenticated;
