-- Auto-save session names include seconds so rapid backups stay distinguishable.

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

  v_name := to_char(now() at time zone 'utc', 'DD Mon YYYY "at" HH12:MI:SS AM');

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
