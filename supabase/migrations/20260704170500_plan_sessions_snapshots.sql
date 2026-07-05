-- Saved plan sessions: named (until deleted) + auto (keep 8).
-- Snapshot = full live plan + list override configuration (no checked/removed).

do $$
begin
  if not exists (
    select 1 from pg_type t
     join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'plan' and t.typname = 'snapshot_kind'
  ) then
    create type plan.snapshot_kind as enum ('named', 'auto');
  end if;
end;
$$;

create table if not exists plan.snapshots (
  id bigint generated always as identity primary key,
  document_id bigint not null references plan.documents(id) on delete cascade,
  kind plan.snapshot_kind not null,
  name text not null default '',
  saved_at timestamptz not null default now(),
  plan_state jsonb not null default '{}'::jsonb,
  list_overrides_state jsonb not null default '{"version":1,"overrides":[]}'::jsonb,
  content_fingerprint text not null default ''
);

create index if not exists plan_snapshots_document_kind_saved_at_idx
  on plan.snapshots (document_id, kind, saved_at desc);

alter table plan.documents
  add column if not exists active_named_snapshot_id bigint
    references plan.snapshots(id) on delete set null;

alter table plan.snapshots enable row level security;

drop policy if exists plan_allow_all_snapshots on plan.snapshots;
create policy plan_allow_all_snapshots
  on plan.snapshots
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant all on table plan.snapshots to anon, authenticated;
grant usage, select on sequence plan.snapshots_id_seq to anon, authenticated;

create or replace function catalog.internal_resolve_default_plan_session()
returns jsonb
language plpgsql
stable
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
begin
  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    return jsonb_build_object('documentId', null, 'sessionId', null);
  end if;

  select id into v_session_id
    from list.sessions
   where plan_document_id = v_doc_id
     and status = 'active'
   order by updated_at desc, id desc
   limit 1;

  return jsonb_build_object('documentId', v_doc_id, 'sessionId', v_session_id);
end;
$$;

create or replace function catalog.internal_build_live_plan_json(p_doc_id bigint)
returns jsonb
language plpgsql
stable
set search_path = catalog, plan, list, public
as $$
begin
  if p_doc_id is null then
    return jsonb_build_object(
      'version', 1,
      'itemSelections', '{}'::jsonb,
      'recipeSelections', '{}'::jsonb,
      'recipeSelectionRoots', '{}'::jsonb,
      'storeOrder', '[]'::jsonb,
      'selectedStoreIds', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
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
          where si.document_id = p_doc_id
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
          where sr.document_id = p_doc_id
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
          where rr.document_id = p_doc_id
        ),
        '{}'::jsonb
      ),
    'storeOrder',
      coalesce(
        (
          select jsonb_agg(sp.store_id order by sp.order_index, sp.store_id)
          from plan.store_preferences sp
          where sp.document_id = p_doc_id
        ),
        '[]'::jsonb
      ),
    'selectedStoreIds',
      coalesce(
        (
          select jsonb_agg(sp.store_id order by sp.order_index, sp.store_id)
          from plan.store_preferences sp
          where sp.document_id = p_doc_id
            and sp.is_selected = true
        ),
        '[]'::jsonb
      )
  );
end;
$$;

create or replace function catalog.internal_row_override_is_config(
  p_user_edited boolean,
  p_override_text text,
  p_generated_text text,
  p_ro_store_id bigint,
  p_gr_store_id bigint,
  p_ro_store_label text,
  p_gr_store_label text,
  p_ro_bucket_label text,
  p_gr_bucket_label text,
  p_ro_aisle_id bigint,
  p_gr_aisle_id bigint,
  p_ro_aisle_sort_order numeric,
  p_gr_aisle_sort_order numeric,
  p_ro_order_index integer,
  p_gr_order_index integer
)
returns boolean
language sql
immutable
as $$
  select
    coalesce(p_user_edited, false)
    or (
      nullif(btrim(coalesce(p_override_text, '')), '') is not null
      and btrim(coalesce(p_override_text, '')) is distinct from btrim(coalesce(p_generated_text, ''))
    )
    or p_ro_store_id is distinct from p_gr_store_id
    or btrim(coalesce(p_ro_store_label, '')) is distinct from btrim(coalesce(p_gr_store_label, ''))
    or btrim(coalesce(p_ro_bucket_label, '')) is distinct from btrim(coalesce(p_gr_bucket_label, ''))
    or p_ro_aisle_id is distinct from p_gr_aisle_id
    or p_ro_aisle_sort_order is distinct from p_gr_aisle_sort_order
    or coalesce(p_ro_order_index, 0) is distinct from coalesce(p_gr_order_index, 0);
$$;

create or replace function catalog.internal_build_live_list_overrides_json(p_session_id bigint)
returns jsonb
language plpgsql
stable
set search_path = catalog, plan, list, public
as $$
begin
  if p_session_id is null then
    return jsonb_build_object('version', 1, 'overrides', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'version', 1,
    'overrides',
    coalesce(
      (
        select jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'sourceKey', ro.source_key,
            'overrideText', nullif(btrim(ro.override_text), ''),
            'userEdited', case when coalesce(ro.user_edited, false) then true else null end,
            'storeId', ro.store_id,
            'storeLabel', nullif(btrim(ro.store_label), ''),
            'bucketLabel', nullif(btrim(ro.bucket_label), ''),
            'aisleId', ro.aisle_id,
            'aisleSortOrder', ro.aisle_sort_order,
            'orderIndex', ro.order_index
          ))
          order by ro.source_key
        )
        from list.row_overrides ro
        left join list.generated_rows gr
          on gr.session_id = ro.session_id
         and gr.source_key = ro.source_key
        where ro.session_id = p_session_id
          and coalesce(ro.removed, false) = false
          and catalog.internal_row_override_is_config(
            ro.user_edited,
            ro.override_text,
            gr.generated_text,
            ro.store_id,
            gr.store_id,
            ro.store_label,
            gr.store_label,
            ro.bucket_label,
            gr.bucket_label,
            ro.aisle_id,
            gr.aisle_id,
            ro.aisle_sort_order,
            gr.aisle_sort_order,
            ro.order_index,
            gr.order_index
          )
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function catalog.internal_plan_session_fingerprint(
  p_plan_state jsonb,
  p_list_overrides_state jsonb
)
returns text
language sql
immutable
as $$
  select md5(
    coalesce(p_plan_state, '{}'::jsonb)::text
      || '|'
      || coalesce(p_list_overrides_state, '{"version":1,"overrides":[]}'::jsonb)::text
  );
$$;

create or replace function catalog.internal_capture_live_plan_session_state()
returns jsonb
language plpgsql
stable
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_plan jsonb;
  v_list_overrides jsonb;
  v_fingerprint text;
  v_resolved jsonb;
begin
  v_resolved := catalog.internal_resolve_default_plan_session();
  v_doc_id := nullif(v_resolved->>'documentId', '')::bigint;
  v_session_id := nullif(v_resolved->>'sessionId', '')::bigint;

  if v_doc_id is null then
    insert into plan.documents (slug, title, status)
    values ('default', 'Default', 'active')
    on conflict (slug) do update
      set status = 'active'
    returning id into v_doc_id;
  end if;

  v_plan := catalog.internal_build_live_plan_json(v_doc_id);
  v_list_overrides := catalog.internal_build_live_list_overrides_json(v_session_id);
  v_fingerprint := catalog.internal_plan_session_fingerprint(v_plan, v_list_overrides);

  return jsonb_build_object(
    'documentId', v_doc_id,
    'planState', v_plan,
    'listOverridesState', v_list_overrides,
    'contentFingerprint', v_fingerprint
  );
end;
$$;

create or replace function catalog.internal_trim_auto_plan_sessions(p_doc_id bigint)
returns void
language plpgsql
set search_path = catalog, plan, public
as $$
begin
  delete from plan.snapshots s
   where s.id in (
     select id
       from plan.snapshots
      where document_id = p_doc_id
        and kind = 'auto'
      order by saved_at desc, id desc
      offset 8
   );
end;
$$;

create or replace function catalog.list_plan_sessions()
returns jsonb
language plpgsql
stable
set search_path = catalog, plan, public
as $$
declare
  v_doc_id bigint;
  v_active_named_snapshot_id bigint;
  v_has_named boolean := false;
  v_named jsonb := '[]'::jsonb;
  v_auto jsonb := '[]'::jsonb;
  v_resolved jsonb;
begin
  v_resolved := catalog.internal_resolve_default_plan_session();
  v_doc_id := nullif(v_resolved->>'documentId', '')::bigint;

  if v_doc_id is null then
    return jsonb_build_object(
      'named', '[]'::jsonb,
      'auto', '[]'::jsonb,
      'activeNamedSnapshotId', null,
      'hasNamedSnapshot', false
    );
  end if;

  select d.active_named_snapshot_id
    into v_active_named_snapshot_id
    from plan.documents d
   where d.id = v_doc_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'savedAt', s.saved_at,
        'kind', s.kind::text
      )
      order by s.saved_at desc, s.id desc
    ),
    '[]'::jsonb
  )
  into v_named
  from plan.snapshots s
  where s.document_id = v_doc_id
    and s.kind = 'named';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'savedAt', s.saved_at,
        'kind', s.kind::text
      )
      order by s.saved_at desc, s.id desc
    ),
    '[]'::jsonb
  )
  into v_auto
  from plan.snapshots s
  where s.document_id = v_doc_id
    and s.kind = 'auto';

  v_has_named := jsonb_array_length(v_named) > 0;

  return jsonb_build_object(
    'named', v_named,
    'auto', v_auto,
    'activeNamedSnapshotId', v_active_named_snapshot_id,
    'hasNamedSnapshot', v_has_named
  );
end;
$$;

create or replace function catalog.create_named_plan_session(p_name text)
returns jsonb
language plpgsql
set search_path = catalog, plan, public
as $$
declare
  v_capture jsonb;
  v_doc_id bigint;
  v_name text := btrim(coalesce(p_name, ''));
  v_snapshot_id bigint;
begin
  if v_name = '' then
    raise exception 'named plan session requires a name'
      using errcode = 'P0001';
  end if;

  v_capture := catalog.internal_capture_live_plan_session_state();
  v_doc_id := nullif(v_capture->>'documentId', '')::bigint;

  insert into plan.snapshots
    (document_id, kind, name, plan_state, list_overrides_state, content_fingerprint)
  values (
    v_doc_id,
    'named',
    v_name,
    coalesce(v_capture->'planState', '{}'::jsonb),
    coalesce(v_capture->'listOverridesState', '{"version":1,"overrides":[]}'::jsonb),
    coalesce(v_capture->>'contentFingerprint', '')
  )
  returning id into v_snapshot_id;

  update plan.documents
     set active_named_snapshot_id = v_snapshot_id,
         updated_at = now()
   where id = v_doc_id;

  return jsonb_build_object(
    'id', v_snapshot_id,
    'name', v_name,
    'kind', 'named',
    'activeNamedSnapshotId', v_snapshot_id,
    'contentFingerprint', coalesce(v_capture->>'contentFingerprint', '')
  );
end;
$$;

create or replace function catalog.update_named_plan_session(
  p_snapshot_id bigint,
  p_name text default null
)
returns jsonb
language plpgsql
set search_path = catalog, plan, public
as $$
declare
  v_capture jsonb;
  v_doc_id bigint;
  v_name text;
  v_snapshot_id bigint := nullif(p_snapshot_id, 0);
begin
  if v_snapshot_id is null then
    raise exception 'named plan session id required'
      using errcode = 'P0001';
  end if;

  select s.document_id, s.name
    into v_doc_id, v_name
    from plan.snapshots s
   where s.id = v_snapshot_id
     and s.kind = 'named';

  if v_doc_id is null then
    raise exception 'named plan session not found'
      using errcode = 'P0001';
  end if;

  v_name := coalesce(nullif(btrim(coalesce(p_name, '')), ''), v_name);
  if v_name = '' then
    raise exception 'named plan session requires a name'
      using errcode = 'P0001';
  end if;

  v_capture := catalog.internal_capture_live_plan_session_state();

  update plan.snapshots s
     set name = v_name,
         saved_at = now(),
         plan_state = coalesce(v_capture->'planState', '{}'::jsonb),
         list_overrides_state = coalesce(
           v_capture->'listOverridesState',
           '{"version":1,"overrides":[]}'::jsonb
         ),
         content_fingerprint = coalesce(v_capture->>'contentFingerprint', '')
   where s.id = v_snapshot_id;

  update plan.documents
     set active_named_snapshot_id = v_snapshot_id,
         updated_at = now()
   where id = v_doc_id;

  return jsonb_build_object(
    'id', v_snapshot_id,
    'name', v_name,
    'kind', 'named',
    'activeNamedSnapshotId', v_snapshot_id,
    'contentFingerprint', coalesce(v_capture->>'contentFingerprint', '')
  );
end;
$$;

create or replace function catalog.create_auto_plan_session()
returns jsonb
language plpgsql
set search_path = catalog, plan, public
as $$
declare
  v_capture jsonb;
  v_doc_id bigint;
  v_fingerprint text;
  v_snapshot_id bigint;
  v_name text;
begin
  v_capture := catalog.internal_capture_live_plan_session_state();
  v_doc_id := nullif(v_capture->>'documentId', '')::bigint;
  v_fingerprint := coalesce(v_capture->>'contentFingerprint', '');

  v_name := to_char(now() at time zone 'utc', 'DD Mon YYYY "at" HH12:MIAM');

  insert into plan.snapshots
    (document_id, kind, name, plan_state, list_overrides_state, content_fingerprint)
  values (
    v_doc_id,
    'auto',
    v_name,
    coalesce(v_capture->'planState', '{}'::jsonb),
    coalesce(v_capture->'listOverridesState', '{"version":1,"overrides":[]}'::jsonb),
    v_fingerprint
  )
  returning id into v_snapshot_id;

  perform catalog.internal_trim_auto_plan_sessions(v_doc_id);

  return jsonb_build_object(
    'id', v_snapshot_id,
    'name', v_name,
    'kind', 'auto',
    'skipped', false,
    'contentFingerprint', v_fingerprint
  );
end;
$$;

create or replace function catalog.apply_plan_session_list_overrides(
  p_list_overrides_state jsonb
)
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_override jsonb;
  v_source_key text;
  v_keys text[] := array[]::text[];
  v_resolved jsonb;
begin
  v_resolved := catalog.internal_resolve_default_plan_session();
  v_doc_id := nullif(v_resolved->>'documentId', '')::bigint;
  v_session_id := nullif(v_resolved->>'sessionId', '')::bigint;

  if v_session_id is null then
    if v_doc_id is not null then
      insert into list.sessions (plan_document_id, status, mode)
      values (v_doc_id, 'active', 'stores')
      returning id into v_session_id;
    else
      return jsonb_build_object('ok', true);
    end if;
  end if;

  for v_override in
    select value
      from jsonb_array_elements(coalesce(p_list_overrides_state->'overrides', '[]'::jsonb))
  loop
    v_source_key := nullif(btrim(v_override->>'sourceKey'), '');
    if v_source_key is null then
      continue;
    end if;
    v_keys := array_append(v_keys, v_source_key);

    insert into list.row_overrides as ro
      (
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
    values (
      v_session_id,
      v_source_key,
      coalesce(v_override->>'overrideText', ''),
      false,
      coalesce((v_override->>'userEdited')::boolean, false),
      false,
      nullif(v_override->>'storeId', '')::bigint,
      coalesce(v_override->>'storeLabel', ''),
      coalesce(v_override->>'bucketLabel', ''),
      nullif(v_override->>'aisleId', '')::bigint,
      nullif(v_override->>'aisleSortOrder', '')::numeric,
      coalesce(nullif(v_override->>'orderIndex', '')::integer, 0)
    )
    on conflict (session_id, source_key) do update
      set override_text = excluded.override_text,
          user_edited = excluded.user_edited,
          store_id = excluded.store_id,
          store_label = excluded.store_label,
          bucket_label = excluded.bucket_label,
          aisle_id = excluded.aisle_id,
          aisle_sort_order = excluded.aisle_sort_order,
          order_index = excluded.order_index,
          checked = ro.checked,
          removed = ro.removed;
  end loop;

  delete from list.row_overrides ro
   where ro.session_id = v_session_id
     and coalesce(ro.removed, false) = false
     and ro.source_key <> all(v_keys)
     and catalog.internal_row_override_is_config(
       ro.user_edited,
       ro.override_text,
       (
         select gr.generated_text
           from list.generated_rows gr
          where gr.session_id = ro.session_id
            and gr.source_key = ro.source_key
       ),
       ro.store_id,
       (
         select gr.store_id
           from list.generated_rows gr
          where gr.session_id = ro.session_id
            and gr.source_key = ro.source_key
       ),
       ro.store_label,
       (
         select gr.store_label
           from list.generated_rows gr
          where gr.session_id = ro.session_id
            and gr.source_key = ro.source_key
       ),
       ro.bucket_label,
       (
         select gr.bucket_label
           from list.generated_rows gr
          where gr.session_id = ro.session_id
            and gr.source_key = ro.source_key
       ),
       ro.aisle_id,
       (
         select gr.aisle_id
           from list.generated_rows gr
          where gr.session_id = ro.session_id
            and gr.source_key = ro.source_key
       ),
       ro.aisle_sort_order,
       (
         select gr.aisle_sort_order
           from list.generated_rows gr
          where gr.session_id = ro.session_id
            and gr.source_key = ro.source_key
       ),
       ro.order_index,
       (
         select gr.order_index
           from list.generated_rows gr
          where gr.session_id = ro.session_id
            and gr.source_key = ro.source_key
       )
     );

  update list.sessions set updated_at = now() where id = v_session_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function catalog.load_plan_session(p_snapshot_id bigint)
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_snapshot_id bigint := nullif(p_snapshot_id, 0);
  v_snapshot plan.snapshots%rowtype;
  v_save_result jsonb;
begin
  if v_snapshot_id is null then
    raise exception 'plan session id required'
      using errcode = 'P0001';
  end if;

  select * into v_snapshot
    from plan.snapshots s
   where s.id = v_snapshot_id;

  if v_snapshot.id is null then
    raise exception 'plan session not found'
      using errcode = 'P0001';
  end if;

  v_save_result := catalog.save_shopping_plan(
    v_snapshot.plan_state,
    true
  );

  perform catalog.apply_plan_session_list_overrides(v_snapshot.list_overrides_state);

  if v_snapshot.kind = 'named' then
    update plan.documents
       set active_named_snapshot_id = v_snapshot.id
     where id = v_snapshot.document_id;
  end if;

  return jsonb_build_object(
    'snapshotId', v_snapshot.id,
    'snapshotKind', v_snapshot.kind::text,
    'snapshotName', v_snapshot.name,
    'activeNamedSnapshotId', case
      when v_snapshot.kind = 'named' then v_snapshot.id
      else (
        select d.active_named_snapshot_id
          from plan.documents d
         where d.id = v_snapshot.document_id
      )
    end,
    'contentFingerprint', v_snapshot.content_fingerprint,
    'plan', v_save_result->'plan',
    'planUpdatedAt', v_save_result->'planUpdatedAt',
    'planVersion', v_save_result->'planVersion',
    'shoppingState', catalog.load_shopping_state()
  );
end;
$$;

create or replace function catalog.delete_plan_session(p_snapshot_id bigint)
returns jsonb
language plpgsql
set search_path = catalog, plan, public
as $$
declare
  v_snapshot_id bigint := nullif(p_snapshot_id, 0);
  v_doc_id bigint;
  v_kind plan.snapshot_kind;
begin
  if v_snapshot_id is null then
    raise exception 'plan session id required'
      using errcode = 'P0001';
  end if;

  select s.document_id, s.kind
    into v_doc_id, v_kind
    from plan.snapshots s
   where s.id = v_snapshot_id;

  if v_doc_id is null then
    raise exception 'plan session not found'
      using errcode = 'P0001';
  end if;

  delete from plan.snapshots where id = v_snapshot_id;

  update plan.documents d
     set active_named_snapshot_id = case
       when d.active_named_snapshot_id = v_snapshot_id then (
         select s2.id
           from plan.snapshots s2
          where s2.document_id = v_doc_id
            and s2.kind = 'named'
          order by s2.saved_at desc, s2.id desc
          limit 1
       )
       else d.active_named_snapshot_id
     end
   where d.id = v_doc_id;

  return jsonb_build_object('ok', true, 'deletedId', v_snapshot_id);
end;
$$;

grant execute on function catalog.list_plan_sessions() to anon, authenticated;
grant execute on function catalog.create_named_plan_session(text) to anon, authenticated;
grant execute on function catalog.update_named_plan_session(bigint, text) to anon, authenticated;
grant execute on function catalog.create_auto_plan_session() to anon, authenticated;
grant execute on function catalog.load_plan_session(bigint) to anon, authenticated;
grant execute on function catalog.delete_plan_session(bigint) to anon, authenticated;
