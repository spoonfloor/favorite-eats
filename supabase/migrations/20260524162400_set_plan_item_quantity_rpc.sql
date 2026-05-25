-- Per-row stepper write for plan.selected_items (Items planner).
--
-- Charter: docs/spammable-input-charter.md §E.
-- Returns { ok, updated_at } so the client can compare per-row updated_at
-- to suppress same-device echoes and drop stale realtime payloads without
-- relying on time-window guards.
--
-- Semantics:
--   p_quantity <= 0  →  delete the selected_items row (item removed from plan).
--   p_quantity >  0  →  upsert quantity. name / variant_name / ingredient_variant_id
--                       are only overwritten if a non-empty / non-null value is supplied,
--                       so coalesced stepper bursts don't clobber identity metadata.
-- Every successful call bumps plan.documents.updated_at (and version) so
-- catalog.get_shopping_revisions() reflects narrow writes.

create or replace function catalog.set_plan_item_quantity(
  p_item_key text,
  p_quantity numeric,
  p_name text default null,
  p_variant_name text default null,
  p_ingredient_variant_id bigint default null
) returns jsonb
  language plpgsql
  set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id      bigint;
  v_item_key    text := nullif(coalesce(p_item_key, ''), '');
  v_quantity    numeric := coalesce(p_quantity, 0);
  v_updated_at  timestamptz;
  v_count       integer;
begin
  if v_item_key is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_item_key');
  end if;

  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    insert into plan.documents (slug, title, status)
    values ('default', 'Default', 'active')
    returning id into v_doc_id;
  end if;

  if v_quantity <= 0 then
    delete from plan.selected_items
     where document_id = v_doc_id
       and item_key = v_item_key;
    get diagnostics v_count = row_count;

    v_updated_at := now();
    update plan.documents
       set updated_at = v_updated_at,
           version = version + 1
     where id = v_doc_id;

    return jsonb_build_object(
      'ok', true,
      'deleted', v_count > 0,
      'updated_at', v_updated_at
    );
  end if;

  insert into plan.selected_items (
    document_id,
    item_key,
    ingredient_variant_id,
    name,
    variant_name,
    quantity,
    updated_at
  )
  values (
    v_doc_id,
    v_item_key,
    p_ingredient_variant_id,
    coalesce(p_name, ''),
    coalesce(p_variant_name, ''),
    v_quantity,
    now()
  )
  on conflict (document_id, item_key) do update
    set quantity = excluded.quantity,
        ingredient_variant_id = coalesce(
          excluded.ingredient_variant_id,
          plan.selected_items.ingredient_variant_id
        ),
        name = case
                 when excluded.name <> '' then excluded.name
                 else plan.selected_items.name
               end,
        variant_name = case
                         when excluded.variant_name <> '' then excluded.variant_name
                         else plan.selected_items.variant_name
                       end,
        updated_at = now()
  returning updated_at into v_updated_at;

  update plan.documents
     set updated_at = now(),
         version = version + 1
   where id = v_doc_id;

  return jsonb_build_object(
    'ok', true,
    'deleted', false,
    'updated_at', v_updated_at
  );
end;
$$;

grant execute on function catalog.set_plan_item_quantity(
  text, numeric, text, text, bigint
) to anon, authenticated;
