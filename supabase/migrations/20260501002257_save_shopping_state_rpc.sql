create or replace function catalog.load_shopping_state()
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_plan jsonb;
  v_list_doc jsonb;
begin
  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    return jsonb_build_object(
      'plan', jsonb_build_object(
        'version', 1,
        'itemSelections', '{}'::jsonb,
        'recipeSelections', '{}'::jsonb,
        'storeOrder', '[]'::jsonb,
        'selectedStoreIds', '[]'::jsonb
      ),
      'shoppingListDoc', null
    );
  end if;

  select id into v_session_id
    from list.sessions
   where plan_document_id = v_doc_id
     and status = 'active'
   order by updated_at desc, id desc
   limit 1;

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
            jsonb_build_object(
              'key', sr.recipe_id::text,
              'recipeId', sr.recipe_id,
              'title', sr.title,
              'quantity', sr.quantity
            )
          )
          from plan.selected_recipes sr
          where sr.document_id = v_doc_id
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
  ) into v_plan;

  if v_session_id is null then
    v_list_doc := null;
  else
    select jsonb_build_object(
      'version', 3,
      'rows',
        coalesce(
          (
            select jsonb_agg(row_doc order by order_index, id_text)
            from (
              select
                mr.order_index,
                mr.id as id_text,
                jsonb_build_object(
                  'id', mr.id,
                  'text', mr.text,
                  'checked', mr.checked,
                  'storeLabel', mr.store_label,
                  'storeId', mr.store_id,
                  'bucketLabel', mr.bucket_label,
                  'aisleId', mr.aisle_id,
                  'aisleSortOrder', mr.aisle_sort_order,
                  'sourceKey', '',
                  'sourceText', '',
                  'sourceStoreLabel', '',
                  'sourceBucketLabel', '',
                  'userEdited', false,
                  'order', mr.order_index
                ) as row_doc
              from list.manual_rows mr
              where mr.session_id = v_session_id
              union all
              select
                coalesce(ro.order_index, gr.order_index, 0) as order_index,
                ro.source_key as id_text,
                jsonb_build_object(
                  'id', ro.source_key,
                  'text', coalesce(nullif(ro.override_text, ''), gr.generated_text, ''),
                  'checked', coalesce(ro.checked, false),
                  'storeLabel', coalesce(ro.store_label, gr.store_label, ''),
                  'storeId', coalesce(ro.store_id, gr.store_id),
                  'bucketLabel', coalesce(ro.bucket_label, gr.bucket_label, ''),
                  'aisleId', coalesce(ro.aisle_id, gr.aisle_id),
                  'aisleSortOrder', coalesce(ro.aisle_sort_order, gr.aisle_sort_order),
                  'sourceKey', ro.source_key,
                  'sourceText', coalesce(gr.generated_text, ro.override_text, ''),
                  'sourceStoreLabel', coalesce(gr.store_label, ro.store_label, ''),
                  'sourceBucketLabel', coalesce(gr.bucket_label, ro.bucket_label, ''),
                  'userEdited', coalesce(ro.user_edited, false),
                  'order', coalesce(ro.order_index, gr.order_index, 0)
                ) as row_doc
              from list.row_overrides ro
              left join list.generated_rows gr
                on gr.session_id = ro.session_id
               and gr.source_key = ro.source_key
              where ro.session_id = v_session_id
                and ro.removed = false
            ) rows
          ),
          '[]'::jsonb
        )
    ) into v_list_doc;
  end if;

  return jsonb_build_object('plan', v_plan, 'shoppingListDoc', v_list_doc);
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
  v_store jsonb;
  v_row jsonb;
  v_store_ids bigint[] := array[]::bigint[];
  v_selected_store_ids bigint[] := array[]::bigint[];
  v_store_id bigint;
  v_order integer;
  v_source_key text;
begin
  insert into plan.documents (slug, title, status)
  values ('default', 'Default', 'active')
  on conflict (slug) do update
    set updated_at = now(),
        status = 'active'
  returning id into v_doc_id;

  if state_payload ? 'plan' then
    v_plan := coalesce(state_payload->'plan', '{}'::jsonb);

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
      insert into plan.selected_recipes
        (document_id, recipe_id, title, quantity)
      values (
        v_doc_id,
        nullif(v_recipe->>'recipeId', '')::bigint,
        coalesce(v_recipe->>'title', ''),
        nullif(v_recipe->>'quantity', '')::numeric
      )
      on conflict (document_id, recipe_id) do update
        set title = excluded.title,
            quantity = excluded.quantity,
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

      if v_source_key <> '' then
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

grant execute on function catalog.load_shopping_state() to anon, authenticated;
grant execute on function catalog.save_shopping_state(jsonb) to anon, authenticated;
