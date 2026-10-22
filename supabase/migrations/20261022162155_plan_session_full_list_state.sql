-- Plan session snapshots keep the whole shopping list, not just config overrides.
-- List state v2 = { version: 2, shoppingListDoc } (the same doc shape that
-- load_shopping_state returns and save_shopping_state accepts), so checked,
-- removed, and manual rows survive save → load. Loading a v2 snapshot replaces
-- the live list via save_shopping_state; v1 snapshots keep the legacy overlay.

create or replace function catalog.internal_capture_live_plan_session_state()
returns jsonb
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_plan jsonb;
  v_list_state jsonb;
  v_fingerprint text;
  v_resolved jsonb;
begin
  v_resolved := catalog.internal_resolve_default_plan_session();
  v_doc_id := nullif(v_resolved->>'documentId', '')::bigint;

  if v_doc_id is null then
    insert into plan.documents (slug, title, status)
    values ('default', 'Default', 'active')
    on conflict (slug) do update
      set status = 'active'
    returning id into v_doc_id;
  end if;

  v_plan := catalog.internal_build_live_plan_json(v_doc_id);
  v_list_state := jsonb_build_object(
    'version', 2,
    'shoppingListDoc', coalesce(
      catalog.load_shopping_state()->'shoppingListDoc',
      jsonb_build_object('version', 3, 'rows', '[]'::jsonb)
    )
  );
  v_fingerprint := catalog.internal_plan_session_fingerprint(v_plan, v_list_state);

  return jsonb_build_object(
    'documentId', v_doc_id,
    'planState', v_plan,
    'listOverridesState', v_list_state,
    'contentFingerprint', v_fingerprint
  );
end;
$$;

create or replace function catalog.internal_apply_plan_session_list_state(
  p_list_state jsonb
)
returns void
language plpgsql
set search_path = catalog, plan, list, public
as $$
begin
  if coalesce(nullif(p_list_state->>'version', '')::integer, 1) >= 2 then
    perform catalog.save_shopping_state(
      jsonb_build_object(
        'shoppingListDoc',
        coalesce(
          p_list_state->'shoppingListDoc',
          jsonb_build_object('version', 3, 'rows', '[]'::jsonb)
        )
      )
    );
  else
    perform catalog.apply_plan_session_list_overrides(p_list_state);
  end if;
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

  perform catalog.internal_apply_plan_session_list_state(v_snapshot.list_overrides_state);

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
