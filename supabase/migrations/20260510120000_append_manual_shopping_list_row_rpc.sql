-- Append one manual row to list.manual_rows (narrow write; avoids full save_shopping_state).

create or replace function catalog.append_manual_shopping_list_row(
  p_text text,
  p_row_id text default null
) returns jsonb
  language plpgsql
  set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id      bigint;
  v_session_id  bigint;
  v_text        text := btrim(coalesce(p_text, ''));
  v_new_id      text := nullif(btrim(coalesce(p_row_id, '')), '');
  v_order       integer;
  v_max_a       integer;
  v_max_b       integer;
  v_max_c       integer;
begin
  if v_text = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty_text');
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
    insert into list.sessions (plan_document_id, status, mode)
    values (v_doc_id, 'active', 'stores')
    returning id into v_session_id;
  end if;

  if v_new_id is null then
    v_new_id := gen_random_uuid()::text;
  end if;

  select coalesce(max(order_index), -1) into v_max_a
    from list.manual_rows
   where session_id = v_session_id;

  select coalesce(max(order_index), -1) into v_max_b
    from list.row_overrides
   where session_id = v_session_id;

  select coalesce(max(order_index), -1) into v_max_c
    from list.generated_rows
   where session_id = v_session_id;

  v_order := greatest(v_max_a, v_max_b, v_max_c) + 1;

  insert into list.manual_rows (
    session_id,
    id,
    text,
    checked,
    store_id,
    store_label,
    bucket_label,
    aisle_id,
    aisle_sort_order,
    order_index
  )
  values (
    v_session_id,
    v_new_id,
    v_text,
    false,
    null,
    '',
    '',
    null,
    null,
    v_order
  );

  update list.sessions set updated_at = now() where id = v_session_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_new_id,
    'order_index', v_order
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_id');
end;
$$;

grant execute on function catalog.append_manual_shopping_list_row(text, text)
  to anon, authenticated;
