-- Per-row store/aisle/order placement for the shopping list (avoids full save_shopping_state).

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
     and ro.removed = false
     and coalesce(ro.store_label, '') <> 'removed';

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
  where list.row_overrides.removed = false
    and coalesce(list.row_overrides.store_label, '') <> 'removed';

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

grant execute on function catalog.set_shopping_list_row_placement(
  text,
  bigint,
  text,
  text,
  bigint,
  numeric,
  integer
) to anon, authenticated;
