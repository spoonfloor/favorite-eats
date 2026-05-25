-- Charter §F/G — surface per-row updated_at in the wholesale shopping state
-- snapshot so clients can drop stale wholesale payloads on a per-key basis
-- after a narrow RPC ack. Without this, a load_shopping_state snapshot
-- captured in flight (before our latest set_plan_recipe_servings_override
-- or set_plan_item_quantity commit) could overwrite the client cache and
-- cause "snapback" on auto-close.
--
-- Additive only: existing keys (recipeId, title, quantity, servingsOverride,
-- key, etc.) are unchanged. New optional field `updatedAt` (ISO timestamp)
-- is added to each entry in `recipeSelections`, `recipeSelectionRoots`,
-- and `itemSelections`.

CREATE OR REPLACE FUNCTION catalog.load_shopping_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'catalog', 'plan', 'list', 'public'
AS $function$
declare
  v_doc_id bigint;
  v_session_id bigint;
  v_plan jsonb;
  v_list_doc jsonb;
begin
  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    return jsonb_build_object(
      'plan', jsonb_build_object(
        'version', 1,
        'itemSelections', '{}'::jsonb,
        'recipeSelections', '{}'::jsonb,
        'recipeSelectionRoots', '{}'::jsonb,
        'storeOrder', '[]'::jsonb,
        'selectedStoreIds', '[]'::jsonb
      ),
      'shoppingListDoc', null
    );
  end if;

  select id into v_session_id
    from list.sessions
   where plan_document_id = v_doc_id
     and status = 'active'
   order by updated_at desc, id desc
   limit 1;

  select jsonb_build_object(
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
              'ingredientVariantId', si.ingredient_variant_id,
              'updatedAt', to_char(si.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
            ))
          )
          from plan.selected_items si
          where si.document_id = v_doc_id
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
              'servingsOverride', sr.servings_override,
              'updatedAt', to_char(sr.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
            ))
          )
          from plan.selected_recipes sr
          where sr.document_id = v_doc_id
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
              'servingsOverride', rr.servings_override,
              'updatedAt', to_char(rr.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
            ))
          )
          from plan.selected_recipe_roots rr
          where rr.document_id = v_doc_id
        ),
        '{}'::jsonb
      ),
    'storeOrder',
      coalesce(
        (
          select jsonb_agg(sp.store_id order by sp.order_index, sp.store_id)
          from plan.store_preferences sp
          where sp.document_id = v_doc_id
        ),
        '[]'::jsonb
      ),
    'selectedStoreIds',
      coalesce(
        (
          select jsonb_agg(sp.store_id order by sp.order_index, sp.store_id)
          from plan.store_preferences sp
          where sp.document_id = v_doc_id
            and sp.is_selected = true
        ),
        '[]'::jsonb
      )
  ) into v_plan;

  if v_session_id is null then
    v_list_doc := null;
  else
    select jsonb_build_object(
      'version', 3,
      'rows',
        coalesce(
          (
            select jsonb_agg(row_doc order by order_index, id_text)
            from (
              select
                mr.order_index,
                mr.id as id_text,
                jsonb_build_object(
                  'id', mr.id,
                  'text', mr.text,
                  'checked', mr.checked,
                  'storeLabel', mr.store_label,
                  'storeId', mr.store_id,
                  'bucketLabel', mr.bucket_label,
                  'aisleId', mr.aisle_id,
                  'aisleSortOrder', mr.aisle_sort_order,
                  'sourceKey', '',
                  'sourceText', '',
                  'sourceStoreLabel', '',
                  'sourceBucketLabel', '',
                  'userEdited', false,
                  'removed', coalesce(mr.store_label, '') = 'removed',
                  'order', mr.order_index
                ) as row_doc
              from list.manual_rows mr
              where mr.session_id = v_session_id
              union all
              select
                coalesce(ro.order_index, gr.order_index, 0) as order_index,
                ro.source_key as id_text,
                jsonb_build_object(
                  'id', ro.source_key,
                  'text', coalesce(nullif(ro.override_text, ''), gr.generated_text, ''),
                  'checked', coalesce(ro.checked, false),
                  'storeLabel', coalesce(
                    nullif(ro.store_label, 'removed'),
                    ro.store_label,
                    gr.store_label,
                    ''
                  ),
                  'storeId', coalesce(ro.store_id, gr.store_id),
                  'bucketLabel', coalesce(ro.bucket_label, gr.bucket_label, ''),
                  'aisleId', coalesce(ro.aisle_id, gr.aisle_id),
                  'aisleSortOrder', coalesce(ro.aisle_sort_order, gr.aisle_sort_order),
                  'sourceKey', ro.source_key,
                  'sourceText', coalesce(gr.generated_text, ro.override_text, ''),
                  'sourceStoreLabel', coalesce(gr.store_label, ro.store_label, ''),
                  'sourceBucketLabel', coalesce(gr.bucket_label, ro.bucket_label, ''),
                  'userEdited', coalesce(ro.user_edited, false),
                  'removed', coalesce(
                    ro.removed,
                    coalesce(ro.store_label, '') = 'removed',
                    false
                  ),
                  'order', coalesce(ro.order_index, gr.order_index, 0)
                ) as row_doc
              from list.row_overrides ro
              left join list.generated_rows gr
                on gr.session_id = ro.session_id
               and gr.source_key = ro.source_key
              where ro.session_id = v_session_id
            ) rows
          ),
          '[]'::jsonb
        )
    ) into v_list_doc;
  end if;

  return jsonb_build_object('plan', v_plan, 'shoppingListDoc', v_list_doc);
end;
$function$;
