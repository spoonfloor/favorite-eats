-- Canonical list.row_overrides.removed flag (replaces pseudo store_label = 'removed').

-- 1) Migrate existing pseudo-removed overrides back to generated placement + removed=true.
update list.row_overrides ro
   set removed = true,
       store_id = coalesce(gr.store_id, ro.store_id),
       store_label = coalesce(
         nullif(btrim(ro.store_label), 'removed'),
         gr.store_label,
         ''
       ),
       bucket_label = coalesce(
         nullif(btrim(ro.bucket_label), ''),
         gr.bucket_label,
         ''
       ),
       aisle_id = coalesce(ro.aisle_id, gr.aisle_id),
       aisle_sort_order = coalesce(ro.aisle_sort_order, gr.aisle_sort_order)
  from list.generated_rows gr
 where ro.store_label = 'removed'
   and gr.session_id = ro.session_id
   and gr.source_key = ro.source_key;

update list.row_overrides
   set removed = true,
       store_label = coalesce(nullif(btrim(store_label), 'removed'), '')
 where store_label = 'removed';

create or replace function catalog.set_shopping_list_row_removed(
  p_row_id text,
  p_removed boolean
) returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_row_id text := coalesce(p_row_id, '');
  v_removed boolean := coalesce(p_removed, false);
  v_count integer;
  v_list_session_updated_at timestamptz;
begin
  if v_row_id = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_row_id');
  end if;

  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_plan_document');
  end if;

  select id into v_session_id
    from list.sessions
   where plan_document_id = v_doc_id
     and status = 'active'
   order by updated_at desc, id desc
   limit 1;

  if v_session_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_session');
  end if;

  if v_removed then
    update list.row_overrides
       set removed = true,
           updated_at = now()
     where session_id = v_session_id
       and source_key = v_row_id;

    get diagnostics v_count = row_count;
    if v_count = 0 then
      insert into list.row_overrides (
        session_id,
        source_key,
        override_text,
        checked,
        user_edited,
        removed,
        store_id,
        store_label,
        bucket_label,
        aisle_id,
        aisle_sort_order,
        order_index
      )
      select
        gr.session_id,
        gr.source_key,
        null,
        false,
        false,
        true,
        gr.store_id,
        gr.store_label,
        gr.bucket_label,
        gr.aisle_id,
        gr.aisle_sort_order,
        gr.order_index
      from list.generated_rows gr
      where gr.session_id = v_session_id
        and gr.source_key = v_row_id
      on conflict (session_id, source_key) do update
        set removed = true,
            updated_at = now();

      get diagnostics v_count = row_count;
    end if;
  else
    update list.row_overrides ro
       set removed = false,
           store_id = gr.store_id,
           store_label = gr.store_label,
           bucket_label = gr.bucket_label,
           aisle_id = gr.aisle_id,
           aisle_sort_order = gr.aisle_sort_order,
           updated_at = now()
      from list.generated_rows gr
     where ro.session_id = v_session_id
       and gr.session_id = v_session_id
       and ro.source_key = v_row_id
       and gr.source_key = v_row_id
       and (
         ro.removed = true
         or coalesce(ro.store_label, '') = 'removed'
       );

    get diagnostics v_count = row_count;

    if v_count = 0 then
      update list.row_overrides
         set removed = false,
             updated_at = now()
       where session_id = v_session_id
         and source_key = v_row_id
         and (
           removed = true
           or coalesce(store_label, '') = 'removed'
         );

      get diagnostics v_count = row_count;
    end if;
  end if;

  if v_count > 0 then
    update list.sessions
       set updated_at = now()
     where id = v_session_id
    returning updated_at into v_list_session_updated_at;

    return jsonb_build_object(
      'ok', true,
      'kind', 'override',
      'listSessionUpdatedAt', v_list_session_updated_at
    );
  end if;

  if v_removed then
    update list.manual_rows
       set store_id = null,
           store_label = 'removed',
           bucket_label = '',
           aisle_id = null,
           aisle_sort_order = null
     where session_id = v_session_id
       and id = v_row_id;
  else
    update list.manual_rows
       set store_id = null,
           store_label = '',
           bucket_label = '',
           aisle_id = null,
           aisle_sort_order = null
     where session_id = v_session_id
       and id = v_row_id
       and store_label = 'removed';
  end if;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions
       set updated_at = now()
     where id = v_session_id
    returning updated_at into v_list_session_updated_at;

    return jsonb_build_object(
      'ok', true,
      'kind', 'manual',
      'listSessionUpdatedAt', v_list_session_updated_at
    );
  end if;

  return jsonb_build_object('ok', false, 'reason', 'row_not_found');
end;
$$;

create or replace function catalog.restore_removed_shopping_list_rows()
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_list_session_updated_at timestamptz;
begin
  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_plan_document');
  end if;

  select id into v_session_id
    from list.sessions
   where plan_document_id = v_doc_id
     and status = 'active'
   order by updated_at desc, id desc
   limit 1;

  if v_session_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_session');
  end if;

  update list.row_overrides ro
     set removed = false,
         store_id = gr.store_id,
         store_label = gr.store_label,
         bucket_label = gr.bucket_label,
         aisle_id = gr.aisle_id,
         aisle_sort_order = gr.aisle_sort_order,
         updated_at = now()
    from list.generated_rows gr
   where ro.session_id = v_session_id
     and gr.session_id = v_session_id
     and ro.source_key = gr.source_key
     and (
       ro.removed = true
       or coalesce(ro.store_label, '') = 'removed'
     );

  update list.sessions
     set updated_at = now()
   where id = v_session_id
  returning updated_at into v_list_session_updated_at;

  return jsonb_build_object(
    'ok', true,
    'listSessionUpdatedAt', v_list_session_updated_at
  );
end;
$$;

-- load_shopping_state: include removed overrides and emit removed flag.
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
        'recipeSelectionRoots', '{}'::jsonb,
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
                  'removed', coalesce(mr.store_label, '') = 'removed',
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
                  'storeLabel', coalesce(
                    nullif(ro.store_label, 'removed'),
                    ro.store_label,
                    gr.store_label,
                    ''
                  ),
                  'storeId', coalesce(ro.store_id, gr.store_id),
                  'bucketLabel', coalesce(ro.bucket_label, gr.bucket_label, ''),
                  'aisleId', coalesce(ro.aisle_id, gr.aisle_id),
                  'aisleSortOrder', coalesce(ro.aisle_sort_order, gr.aisle_sort_order),
                  'sourceKey', ro.source_key,
                  'sourceText', coalesce(gr.generated_text, ro.override_text, ''),
                  'sourceStoreLabel', coalesce(gr.store_label, ro.store_label, ''),
                  'sourceBucketLabel', coalesce(gr.bucket_label, ro.bucket_label, ''),
                  'userEdited', coalesce(ro.user_edited, false),
                  'removed', coalesce(
                    ro.removed,
                    coalesce(ro.store_label, '') = 'removed',
                    false
                  ),
                  'order', coalesce(ro.order_index, gr.order_index, 0)
                ) as row_doc
              from list.row_overrides ro
              left join list.generated_rows gr
                on gr.session_id = ro.session_id
               and gr.source_key = ro.source_key
              where ro.session_id = v_session_id
            ) rows
          ),
          '[]'::jsonb
        )
    ) into v_list_doc;
  end if;

  return jsonb_build_object('plan', v_plan, 'shoppingListDoc', v_list_doc);
end;
$$;

-- save_shopping_state list branch: persist removed flag from payload.
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
  v_row_removed boolean;
begin
  v_allow_empty := coalesce((state_payload->>'allowEmpty')::boolean, false);

  insert into plan.documents (slug, title, status)
  values ('default', 'Default', 'active')
  on conflict (slug) do update
    set status = 'active',
        updated_at = case
          when state_payload ? 'plan' then now()
          else plan.documents.updated_at
        end
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
      v_row_removed := coalesce(
        (v_row->>'removed')::boolean,
        lower(btrim(coalesce(v_row->>'storeLabel', ''))) = 'removed'
      );

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
          v_row_removed,
          nullif(v_row->>'storeId', '')::bigint,
          case
            when v_row_removed then coalesce(
              nullif(v_row->>'sourceStoreLabel', ''),
              nullif(v_row->>'restoreStoreLabel', ''),
              ''
            )
            else coalesce(v_row->>'storeLabel', '')
          end,
          case
            when v_row_removed then coalesce(
              nullif(v_row->>'sourceBucketLabel', ''),
              nullif(v_row->>'restoreBucketLabel', ''),
              ''
            )
            else coalesce(v_row->>'bucketLabel', '')
          end,
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

create or replace function catalog.set_shopping_list_row_placement(
  p_row_id text,
  p_store_id bigint default null,
  p_store_label text default null,
  p_bucket_label text default null,
  p_aisle_id bigint default null,
  p_aisle_sort_order numeric default null,
  p_order_index integer default null
) returns jsonb
  language plpgsql
  set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_row_id text := coalesce(p_row_id, '');
  v_store_label text := coalesce(p_store_label, '');
  v_bucket_label text := coalesce(p_bucket_label, '');
  v_count integer;
  v_list_session_updated_at timestamptz;
begin
  if v_row_id = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_row_id');
  end if;

  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_plan_document');
  end if;

  select id into v_session_id
    from list.sessions
   where plan_document_id = v_doc_id
     and status = 'active'
   order by updated_at desc, id desc
   limit 1;

  if v_session_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_session');
  end if;

  update list.row_overrides ro
     set store_id = p_store_id,
         store_label = v_store_label,
         bucket_label = v_bucket_label,
         aisle_id = p_aisle_id,
         aisle_sort_order = p_aisle_sort_order,
         order_index = coalesce(p_order_index, ro.order_index),
         updated_at = now()
   where ro.session_id = v_session_id
     and ro.source_key = v_row_id
     and ro.removed = false;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions
       set updated_at = now()
     where id = v_session_id
    returning updated_at into v_list_session_updated_at;

    return jsonb_build_object(
      'ok', true,
      'kind', 'override',
      'listSessionUpdatedAt', v_list_session_updated_at
    );
  end if;

  insert into list.row_overrides (
    session_id,
    source_key,
    override_text,
    checked,
    user_edited,
    removed,
    store_id,
    store_label,
    bucket_label,
    aisle_id,
    aisle_sort_order,
    order_index
  )
  select
    gr.session_id,
    gr.source_key,
    null,
    false,
    false,
    false,
    p_store_id,
    v_store_label,
    v_bucket_label,
    p_aisle_id,
    p_aisle_sort_order,
    coalesce(p_order_index, gr.order_index)
  from list.generated_rows gr
  where gr.session_id = v_session_id
    and gr.source_key = v_row_id
  on conflict (session_id, source_key) do update
    set store_id = excluded.store_id,
        store_label = excluded.store_label,
        bucket_label = excluded.bucket_label,
        aisle_id = excluded.aisle_id,
        aisle_sort_order = excluded.aisle_sort_order,
        order_index = coalesce(excluded.order_index, list.row_overrides.order_index),
        updated_at = now()
  where list.row_overrides.removed = false;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions
       set updated_at = now()
     where id = v_session_id
    returning updated_at into v_list_session_updated_at;

    return jsonb_build_object(
      'ok', true,
      'kind', 'override',
      'listSessionUpdatedAt', v_list_session_updated_at
    );
  end if;

  update list.manual_rows
     set store_id = p_store_id,
         store_label = v_store_label,
         bucket_label = v_bucket_label,
         aisle_id = p_aisle_id,
         aisle_sort_order = p_aisle_sort_order,
         order_index = coalesce(p_order_index, order_index)
   where session_id = v_session_id
     and id = v_row_id
     and coalesce(store_label, '') <> 'removed';

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions
       set updated_at = now()
     where id = v_session_id
    returning updated_at into v_list_session_updated_at;

    return jsonb_build_object(
      'ok', true,
      'kind', 'manual',
      'listSessionUpdatedAt', v_list_session_updated_at
    );
  end if;

  return jsonb_build_object('ok', false, 'reason', 'row_not_found');
end;
$$;

grant execute on function catalog.set_shopping_list_row_removed(text, boolean)
  to anon, authenticated;
grant execute on function catalog.restore_removed_shopping_list_rows()
  to anon, authenticated;
grant execute on function catalog.load_shopping_state() to anon, authenticated;
grant execute on function catalog.save_shopping_state(jsonb) to anon, authenticated;
