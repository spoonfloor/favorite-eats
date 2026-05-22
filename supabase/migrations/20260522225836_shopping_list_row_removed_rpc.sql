-- Per-row shopping list remove / restore write.
-- Keeps current client semantics (pseudo-store label "removed") while avoiding
-- full save_shopping_state rewrites for single-row gestures.

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
       set store_id = null,
           store_label = 'removed',
           bucket_label = '',
           aisle_id = null,
           aisle_sort_order = null,
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
        false,
        null,
        'removed',
        '',
        null,
        null,
        gr.order_index
      from list.generated_rows gr
      where gr.session_id = v_session_id
        and gr.source_key = v_row_id
      on conflict (session_id, source_key) do update
        set store_id = null,
            store_label = 'removed',
            bucket_label = '',
            aisle_id = null,
            aisle_sort_order = null,
            updated_at = now();

      get diagnostics v_count = row_count;
    end if;
  else
    update list.row_overrides ro
       set store_id = gr.store_id,
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
       and ro.store_label = 'removed';

    get diagnostics v_count = row_count;
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

grant execute on function catalog.set_shopping_list_row_removed(text, boolean)
  to anon, authenticated;
