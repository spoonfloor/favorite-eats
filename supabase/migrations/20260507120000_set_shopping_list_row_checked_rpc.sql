-- Per-row checkbox write for the shopping list.
--
-- Today, every checkbox click sends the entire shopping list to
-- catalog.save_shopping_state, which delete-then-inserts every list row.
-- That makes any two near-simultaneous saves overwrite each other (snap-back).
--
-- This RPC updates exactly one row in list.row_overrides (or list.manual_rows
-- for manual entries) so that two devices toggling different boxes cannot wipe
-- one another. It also touches list.sessions.updated_at so existing realtime
-- session listeners stay accurate.

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
