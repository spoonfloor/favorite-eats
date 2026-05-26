-- Narrow recipe root quantity write for Recipes planner add/remove/restore.
-- Used by spammable recipe steppers when decrement reaches zero so the client
-- does not fall back to a whole-plan save.

drop function if exists catalog.set_plan_recipe_quantity(bigint, numeric, text);

create or replace function catalog.set_plan_recipe_quantity(
  p_recipe_id bigint,
  p_quantity numeric,
  p_title text default null,
  p_servings_override numeric default null
) returns jsonb
  language plpgsql
  set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_quantity numeric;
  v_title text;
  v_servings_override numeric;
  v_updated_at timestamptz := now();
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

  v_quantity := greatest(0, least(99, coalesce(p_quantity, 0)));
  v_title := coalesce(nullif(trim(p_title), ''), 'Recipe ' || p_recipe_id::text);
  v_servings_override :=
    case
      when p_servings_override is not null and p_servings_override > 0
        then p_servings_override
      else null
    end;

  if v_quantity <= 0 then
    delete from plan.selected_recipe_roots
     where document_id = v_doc_id
       and recipe_id = p_recipe_id;

    delete from plan.selected_recipes
     where document_id = v_doc_id
       and recipe_id = p_recipe_id;
  else
    insert into plan.selected_recipe_roots
      (document_id, recipe_id, title, quantity, servings_override, updated_at)
    values
      (v_doc_id, p_recipe_id, v_title, v_quantity, v_servings_override, v_updated_at)
    on conflict (document_id, recipe_id) do update
      set title = excluded.title,
          quantity = excluded.quantity,
          servings_override = excluded.servings_override,
          updated_at = excluded.updated_at;

    insert into plan.selected_recipes
      (document_id, recipe_id, title, quantity, servings_override, updated_at)
    values
      (v_doc_id, p_recipe_id, v_title, v_quantity, v_servings_override, v_updated_at)
    on conflict (document_id, recipe_id) do update
      set title = excluded.title,
          quantity = excluded.quantity,
          servings_override = excluded.servings_override,
          updated_at = excluded.updated_at;
  end if;

  update plan.documents
     set updated_at = v_updated_at,
         version = version + 1
   where id = v_doc_id;

  return jsonb_build_object(
    'ok', true,
    'updated_at', v_updated_at,
    'quantity', v_quantity
  );
end;
$$;

grant execute on function catalog.set_plan_recipe_quantity(bigint, numeric, text, numeric)
  to anon, authenticated;
