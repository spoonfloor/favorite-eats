-- Cheap revision probe for warm-client revisit gating (Slice 1).
-- Any plan/list write that affects Shopping List or Items rendering must bump
-- plan.documents.updated_at and/or the active list.sessions.updated_at.

create or replace function catalog.get_shopping_revisions()
returns jsonb
language plpgsql
stable
security invoker
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_plan_updated_at timestamptz;
  v_list_session_updated_at timestamptz;
begin
  select id, updated_at
    into v_doc_id, v_plan_updated_at
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    return jsonb_build_object(
      'planUpdatedAt', null,
      'listSessionUpdatedAt', null
    );
  end if;

  select s.updated_at
    into v_list_session_updated_at
    from list.sessions s
   where s.plan_document_id = v_doc_id
     and s.status = 'active'
   order by s.updated_at desc, s.id desc
   limit 1;

  return jsonb_build_object(
    'planUpdatedAt', v_plan_updated_at,
    'listSessionUpdatedAt', v_list_session_updated_at
  );
end;
$$;

grant execute on function catalog.get_shopping_revisions()
  to anon, authenticated;
