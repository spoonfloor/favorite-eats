-- Make per-row checkbox writes robust for generated rows that do not yet have
-- list.row_overrides records. First toggle should create the override row
-- instead of returning row_not_found and racing a full-document fallback save.

create or replace function catalog.set_shopping_list_row_checked(
  p_row_id text,
  p_checked boolean
) returns jsonb
  language plpgsql
  set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id     bigint;
  v_session_id bigint;
  v_row_id     text := coalesce(p_row_id, '');
  v_checked    boolean := coalesce(p_checked, false);
  v_count      integer;
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

  update list.row_overrides
     set checked = v_checked
   where session_id = v_session_id
     and source_key = v_row_id;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions set updated_at = now() where id = v_session_id;
    return jsonb_build_object('ok', true, 'kind', 'override');
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
    v_checked,
    false,
    false,
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
    set checked = excluded.checked
  ;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions set updated_at = now() where id = v_session_id;
    return jsonb_build_object('ok', true, 'kind', 'override');
  end if;

  update list.manual_rows
     set checked = v_checked
   where session_id = v_session_id
     and id = v_row_id;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions set updated_at = now() where id = v_session_id;
    return jsonb_build_object('ok', true, 'kind', 'manual');
  end if;

  return jsonb_build_object('ok', false, 'reason', 'row_not_found');
end;
$$;

grant execute on function catalog.set_shopping_list_row_checked(text, boolean)
  to anon, authenticated;
