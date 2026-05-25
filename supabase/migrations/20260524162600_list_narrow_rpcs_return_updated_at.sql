-- Extend all list narrow RPCs to bump per-row updated_at on UPDATE paths
-- (the column defaults only fire at INSERT) and to return the touched row's
-- updated_at in the success payload.
--
-- Charter: docs/spammable-input-charter.md §E / §F.
-- Spammable input compares per-key `lastAppliedServerUpdatedAt` to suppress
-- same-device echoes and reject stale realtime payloads. That comparison is
-- meaningless if UPDATE paths leave updated_at stuck at INSERT time, or if
-- the RPC ack doesn't tell the client which updated_at the server committed.
--
-- Back-compat:
--   - All four RPCs continue to return `{ ok, kind }` on success.
--   - `set_shopping_list_row_removed` and `set_shopping_list_row_placement`
--     continue to return `listSessionUpdatedAt`.
--   - `updated_at` is ADDED to every success payload; clients that don't read
--     it are unaffected.

------------------------------------------------------------------------------
-- set_shopping_list_row_checked
------------------------------------------------------------------------------

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
  v_updated_at timestamptz;
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
     set checked = v_checked,
         updated_at = now()
   where session_id = v_session_id
     and source_key = v_row_id
  returning updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions set updated_at = now() where id = v_session_id;
    return jsonb_build_object(
      'ok', true,
      'kind', 'override',
      'updated_at', v_updated_at
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
    set checked = excluded.checked,
        updated_at = now()
  returning updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions set updated_at = now() where id = v_session_id;
    return jsonb_build_object(
      'ok', true,
      'kind', 'override',
      'updated_at', v_updated_at
    );
  end if;

  update list.manual_rows
     set checked = v_checked,
         updated_at = now()
   where session_id = v_session_id
     and id = v_row_id
  returning updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions set updated_at = now() where id = v_session_id;
    return jsonb_build_object(
      'ok', true,
      'kind', 'manual',
      'updated_at', v_updated_at
    );
  end if;

  return jsonb_build_object('ok', false, 'reason', 'row_not_found');
end;
$$;

grant execute on function catalog.set_shopping_list_row_checked(text, boolean)
  to anon, authenticated;

------------------------------------------------------------------------------
-- set_shopping_list_row_text
------------------------------------------------------------------------------

create or replace function catalog.set_shopping_list_row_text(
  p_row_id text,
  p_text text
) returns jsonb
  language plpgsql
  set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id     bigint;
  v_session_id bigint;
  v_row_id     text := coalesce(p_row_id, '');
  v_text       text := coalesce(p_text, '');
  v_updated_at timestamptz;
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

  update list.row_overrides ro
     set override_text = v_text,
         user_edited = (
           btrim(v_text) is distinct from btrim(coalesce(
             (
               select gr.generated_text
                 from list.generated_rows gr
                where gr.session_id = ro.session_id
                  and gr.source_key = ro.source_key
                limit 1
             ),
             ''
           ))
         ),
         updated_at = now()
   where ro.session_id = v_session_id
     and ro.source_key = v_row_id
     and ro.removed = false
  returning ro.updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions set updated_at = now() where id = v_session_id;
    return jsonb_build_object(
      'ok', true,
      'kind', 'override',
      'updated_at', v_updated_at
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
    v_text,
    false,
    (btrim(v_text) is distinct from btrim(coalesce(gr.generated_text, ''))),
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
    set override_text = excluded.override_text,
        user_edited = excluded.user_edited,
        updated_at = now()
  returning updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions set updated_at = now() where id = v_session_id;
    return jsonb_build_object(
      'ok', true,
      'kind', 'override',
      'updated_at', v_updated_at
    );
  end if;

  update list.manual_rows
     set text = v_text,
         updated_at = now()
   where session_id = v_session_id
     and id = v_row_id
  returning updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions set updated_at = now() where id = v_session_id;
    return jsonb_build_object(
      'ok', true,
      'kind', 'manual',
      'updated_at', v_updated_at
    );
  end if;

  return jsonb_build_object('ok', false, 'reason', 'row_not_found');
end;
$$;

grant execute on function catalog.set_shopping_list_row_text(text, text)
  to anon, authenticated;

------------------------------------------------------------------------------
-- set_shopping_list_row_removed
------------------------------------------------------------------------------

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
  v_updated_at timestamptz;
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
       and source_key = v_row_id
    returning updated_at into v_updated_at;

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
            updated_at = now()
      returning updated_at into v_updated_at;

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
       )
    returning ro.updated_at into v_updated_at;

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
         )
      returning updated_at into v_updated_at;

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
      'updated_at', v_updated_at,
      'listSessionUpdatedAt', v_list_session_updated_at
    );
  end if;

  if v_removed then
    update list.manual_rows
       set store_id = null,
           store_label = 'removed',
           bucket_label = '',
           aisle_id = null,
           aisle_sort_order = null,
           updated_at = now()
     where session_id = v_session_id
       and id = v_row_id
    returning updated_at into v_updated_at;
  else
    update list.manual_rows
       set store_id = null,
           store_label = '',
           bucket_label = '',
           aisle_id = null,
           aisle_sort_order = null,
           updated_at = now()
     where session_id = v_session_id
       and id = v_row_id
       and store_label = 'removed'
    returning updated_at into v_updated_at;
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
      'updated_at', v_updated_at,
      'listSessionUpdatedAt', v_list_session_updated_at
    );
  end if;

  return jsonb_build_object('ok', false, 'reason', 'row_not_found');
end;
$$;

grant execute on function catalog.set_shopping_list_row_removed(text, boolean)
  to anon, authenticated;

------------------------------------------------------------------------------
-- set_shopping_list_row_placement
------------------------------------------------------------------------------

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
  v_updated_at timestamptz;
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
  returning ro.updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions
       set updated_at = now()
     where id = v_session_id
    returning updated_at into v_list_session_updated_at;

    return jsonb_build_object(
      'ok', true,
      'kind', 'override',
      'updated_at', v_updated_at,
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
  returning updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions
       set updated_at = now()
     where id = v_session_id
    returning updated_at into v_list_session_updated_at;

    return jsonb_build_object(
      'ok', true,
      'kind', 'override',
      'updated_at', v_updated_at,
      'listSessionUpdatedAt', v_list_session_updated_at
    );
  end if;

  update list.manual_rows
     set store_id = p_store_id,
         store_label = v_store_label,
         bucket_label = v_bucket_label,
         aisle_id = p_aisle_id,
         aisle_sort_order = p_aisle_sort_order,
         order_index = coalesce(p_order_index, order_index),
         updated_at = now()
   where session_id = v_session_id
     and id = v_row_id
     and coalesce(store_label, '') <> 'removed'
  returning updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    update list.sessions
       set updated_at = now()
     where id = v_session_id
    returning updated_at into v_list_session_updated_at;

    return jsonb_build_object(
      'ok', true,
      'kind', 'manual',
      'updated_at', v_updated_at,
      'listSessionUpdatedAt', v_list_session_updated_at
    );
  end if;

  return jsonb_build_object('ok', false, 'reason', 'row_not_found');
end;
$$;

grant execute on function catalog.set_shopping_list_row_placement(
  text, bigint, text, text, bigint, numeric, integer
) to anon, authenticated;
