-- Auto-save may pass client capture at commit ack time so each snapshot reflects
-- the triggering change, not live DB read when a queued autosave RPC runs later.

drop function if exists catalog.create_auto_plan_session();

create or replace function catalog.create_auto_plan_session(
  p_plan_state jsonb default null,
  p_list_overrides_state jsonb default null
)
returns jsonb
language plpgsql
set search_path = catalog, plan, public
as $$
declare
  v_capture jsonb;
  v_doc_id bigint;
  v_plan jsonb;
  v_list_overrides jsonb;
  v_fingerprint text;
  v_snapshot_id bigint;
  v_name text;
  v_resolved jsonb;
begin
  if p_plan_state is not null and jsonb_typeof(p_plan_state) = 'object' then
    v_resolved := catalog.internal_resolve_default_plan_session();
    v_doc_id := nullif(v_resolved->>'documentId', '')::bigint;

    if v_doc_id is null then
      insert into plan.documents (slug, title, status)
      values ('default', 'Default', 'active')
      on conflict (slug) do update
        set status = 'active'
      returning id into v_doc_id;
    end if;

    v_plan := p_plan_state;
    v_list_overrides := coalesce(
      p_list_overrides_state,
      '{"version":1,"overrides":[]}'::jsonb
    );
    v_fingerprint := catalog.internal_plan_session_fingerprint(v_plan, v_list_overrides);
  else
    v_capture := catalog.internal_capture_live_plan_session_state();
    v_doc_id := nullif(v_capture->>'documentId', '')::bigint;
    v_plan := coalesce(v_capture->'planState', '{}'::jsonb);
    v_list_overrides := coalesce(
      v_capture->'listOverridesState',
      '{"version":1,"overrides":[]}'::jsonb
    );
    v_fingerprint := coalesce(v_capture->>'contentFingerprint', '');
  end if;

  v_name := to_char(now() at time zone 'utc', 'DD Mon YYYY "at" HH12:MI:SS AM');

  insert into plan.snapshots
    (document_id, kind, name, plan_state, list_overrides_state, content_fingerprint)
  values (
    v_doc_id,
    'auto',
    v_name,
    v_plan,
    v_list_overrides,
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

grant execute on function catalog.create_auto_plan_session(jsonb, jsonb)
  to anon, authenticated;
