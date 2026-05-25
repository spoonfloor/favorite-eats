-- Per-row servings override write for plan.selected_recipes (Recipes planner).
--
-- Charter: docs/spammable-input-charter.md §E.
-- Returns { ok, updated_at } for spammable-input echo suppression and stale-
-- payload rejection.
--
-- Semantics:
--   - Only updates the servings_override column on an EXISTING selected_recipes
--     row. p_servings_override = null is a valid value (means "fall back to the
--     recipe's default servings").
--   - Does NOT add a recipe to the plan, does NOT remove a recipe, does NOT
--     change plan.selected_recipes.quantity (use catalog.save_shopping_plan
--     for plan-membership changes).
--   - If a matching plan.selected_recipe_roots row exists, mirrors the new
--     servings_override there too so root-vs-merged accounting stays in sync
--     with the save_shopping_plan shape.
-- Every successful call bumps plan.documents.updated_at (and version) so
-- catalog.get_shopping_revisions() reflects narrow writes.

create or replace function catalog.set_plan_recipe_servings_override(
  p_recipe_id bigint,
  p_servings_override numeric
) returns jsonb
  language plpgsql
  set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id      bigint;
  v_updated_at  timestamptz;
  v_count       integer;
begin
  if p_recipe_id is null or p_recipe_id <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_recipe_id');
  end if;

  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_plan_document');
  end if;

  update plan.selected_recipes
     set servings_override = p_servings_override,
         updated_at = now()
   where document_id = v_doc_id
     and recipe_id = p_recipe_id
  returning updated_at into v_updated_at;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'recipe_not_in_plan');
  end if;

  update plan.selected_recipe_roots
     set servings_override = p_servings_override,
         updated_at = now()
   where document_id = v_doc_id
     and recipe_id = p_recipe_id;

  update plan.documents
     set updated_at = now(),
         version = version + 1
   where id = v_doc_id;

  return jsonb_build_object(
    'ok', true,
    'updated_at', v_updated_at
  );
end;
$$;

grant execute on function catalog.set_plan_recipe_servings_override(bigint, numeric)
  to anon, authenticated;
