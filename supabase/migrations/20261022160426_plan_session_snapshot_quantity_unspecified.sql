-- Server-captured plan session snapshots (named create/update, and auto-save
-- without client capture) predate plan.selected_items.quantity_unspecified, so
-- "some" items were saved as quantity 0 with no flag. Loading those snapshots
-- violates selected_items_quantity_check.
-- 1) Include quantityUnspecified when building the live plan JSON.
-- 2) Repair existing snapshots: a stored quantity <= 0 could only exist with
--    quantity_unspecified = true, so restore the flag on those items.

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
              'quantityUnspecified', case when si.quantity_unspecified then true else null end,
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

with repaired as (
  select
    s.id,
    jsonb_object_agg(
      j.key,
      case
        when coalesce(nullif(j.value->>'quantity', '')::numeric, 0) <= 0
         and not coalesce((j.value->>'quantityUnspecified')::boolean, false)
          then j.value || '{"quantityUnspecified": true}'::jsonb
        else j.value
      end
    ) as item_selections
  from plan.snapshots s
  cross join lateral jsonb_each(s.plan_state->'itemSelections') as j(key, value)
  where jsonb_typeof(s.plan_state->'itemSelections') = 'object'
  group by s.id
  having bool_or(
    coalesce(nullif(j.value->>'quantity', '')::numeric, 0) <= 0
    and not coalesce((j.value->>'quantityUnspecified')::boolean, false)
  )
)
update plan.snapshots s
   set plan_state = jsonb_set(s.plan_state, '{itemSelections}', r.item_selections),
       content_fingerprint = catalog.internal_plan_session_fingerprint(
         jsonb_set(s.plan_state, '{itemSelections}', r.item_selections),
         s.list_overrides_state
       )
  from repaired r
 where r.id = s.id;
