-- Bulk shopping list writes (Better stage B4): avoid full save_shopping_state for common ops.

create or replace function catalog.uncheck_all_shopping_list_rows()
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

  update list.row_overrides
     set checked = false
   where session_id = v_session_id
     and checked = true;

  update list.manual_rows
     set checked = false
   where session_id = v_session_id
     and checked = true;

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

create or replace function catalog.apply_shopping_list_sourced_rows_sync(
  sourced_rows jsonb
)
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_row jsonb;
  v_source_key text;
  v_order integer;
  v_list_session_updated_at timestamptz;
  v_keep_keys text[] := array[]::text[];
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
    insert into list.sessions (plan_document_id, status, mode)
    values (v_doc_id, 'active', 'stores')
    returning id into v_session_id;
  end if;

  for v_row in
    select value from jsonb_array_elements(coalesce(sourced_rows, '[]'::jsonb))
  loop
    v_source_key := nullif(v_row->>'sourceKey', '');
    if v_source_key is null then
      continue;
    end if;
    v_keep_keys := array_append(v_keep_keys, v_source_key);
    v_order := coalesce(nullif(v_row->>'order', '')::integer, 0);

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
    )
    on conflict (session_id, source_key) do update
      set override_text = excluded.override_text,
          checked = excluded.checked,
          user_edited = excluded.user_edited,
          removed = false,
          store_id = excluded.store_id,
          store_label = excluded.store_label,
          bucket_label = excluded.bucket_label,
          aisle_id = excluded.aisle_id,
          aisle_sort_order = excluded.aisle_sort_order,
          order_index = excluded.order_index;
  end loop;

  delete from list.row_overrides ro
   where ro.session_id = v_session_id
     and ro.user_edited = false
     and (
       cardinality(v_keep_keys) = 0
       or not (ro.source_key = any(v_keep_keys))
     );

  delete from list.conflicts where session_id = v_session_id;

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
     set store_id = gr.store_id,
         store_label = gr.store_label,
         bucket_label = gr.bucket_label,
         aisle_id = gr.aisle_id,
         aisle_sort_order = gr.aisle_sort_order
    from list.generated_rows gr
   where ro.session_id = v_session_id
     and gr.session_id = v_session_id
     and ro.source_key = gr.source_key
     and ro.store_label = 'removed';

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

grant execute on function catalog.uncheck_all_shopping_list_rows()
  to anon, authenticated;
grant execute on function catalog.apply_shopping_list_sourced_rows_sync(jsonb)
  to anon, authenticated;
grant execute on function catalog.restore_removed_shopping_list_rows()
  to anon, authenticated;
