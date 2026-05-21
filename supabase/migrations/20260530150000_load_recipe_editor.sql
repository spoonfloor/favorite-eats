-- Recipe editor screen payload (Slice 5): one RPC for full editor recipe detail.

create or replace function catalog.load_recipe_editor(p_recipe_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = catalog, public
as $$
declare
  v_recipe jsonb;
  v_tag_map jsonb;
  v_steps jsonb;
  v_headings jsonb;
  v_rim jsonb;
  v_subrecipe_links jsonb;
begin
  if p_recipe_id is null or p_recipe_id <= 0 then
    return null;
  end if;

  select jsonb_build_object(
    'id', r.id,
    'title', r.title,
    'summary', r.summary,
    'servings_default', r.servings_default,
    'servings_min', r.servings_min,
    'servings_max', r.servings_max
  )
  into v_recipe
  from catalog.recipes r
  where r.id = p_recipe_id;

  if v_recipe is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rtm.id,
        'sort_order', rtm.sort_order,
        'tags', jsonb_build_object(
          'name', t.name,
          'is_hidden', t.is_hidden
        )
      )
      order by rtm.sort_order, rtm.id
    ),
    '[]'::jsonb
  )
  into v_tag_map
  from catalog.recipe_tag_map rtm
  join catalog.tags t on t.id = rtm.tag_id
  where rtm.recipe_id = p_recipe_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rs.id,
        'step_number', rs.step_number,
        'instructions', rs.instructions,
        'type', rs.type
      )
      order by rs.step_number, rs.id
    ),
    '[]'::jsonb
  )
  into v_steps
  from catalog.recipe_steps rs
  where rs.recipe_id = p_recipe_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'section_id', h.section_id,
        'sort_order', h.sort_order,
        'heading_text', h.heading_text
      )
      order by h.sort_order, h.id
    ),
    '[]'::jsonb
  )
  into v_headings
  from catalog.recipe_ingredient_headings h
  where h.recipe_id = p_recipe_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rim.id,
        'section_id', rim.section_id,
        'sort_order', rim.sort_order,
        'quantity', rim.quantity,
        'quantity_min', rim.quantity_min,
        'quantity_max', rim.quantity_max,
        'quantity_is_approx', rim.quantity_is_approx,
        'unit', rim.unit,
        'variant', rim.variant,
        'size', rim.size,
        'prep_notes', rim.prep_notes,
        'is_optional', rim.is_optional,
        'parenthetical_note', rim.parenthetical_note,
        'is_recipe', rim.is_recipe,
        'linked_recipe_id', rim.linked_recipe_id,
        'recipe_text', rim.recipe_text,
        'is_alt', rim.is_alt,
        'display_name', rim.display_name,
        'ingredients', case
          when i.id is null then null
          else jsonb_build_object(
            'id', i.id,
            'name', i.name,
            'variant', i.variant,
            'size', i.size,
            'parenthetical_note', i.parenthetical_note,
            'lemma', i.lemma,
            'singular_if_unspecified', i.singular_if_unspecified,
            'is_mass_noun', i.is_mass_noun,
            'plural_override', i.plural_override,
            'is_deprecated', i.is_deprecated,
            'use_metric', i.use_metric,
            'use_plural_override', i.use_plural_override,
            'ingredient_variants', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', iv.id,
                    'variant', iv.variant,
                    'home_location', iv.home_location,
                    'is_deprecated', iv.is_deprecated
                  )
                  order by iv.id
                )
                from catalog.ingredient_variants iv
                where iv.ingredient_id = i.id
              ),
              '[]'::jsonb
            )
          )
        end,
        'linked_recipe', case
          when lr.id is null then null
          else jsonb_build_object('title', lr.title)
        end
      )
      order by rim.sort_order, rim.id
    ),
    '[]'::jsonb
  )
  into v_rim
  from catalog.recipe_ingredient_map rim
  left join catalog.ingredients i on i.id = rim.ingredient_id
  left join catalog.recipes lr on lr.id = rim.linked_recipe_id
  where rim.recipe_id = p_recipe_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sl.id,
        'section_id', sl.section_id,
        'sort_order', sl.sort_order,
        'quantity', sl.quantity,
        'quantity_min', sl.quantity_min,
        'quantity_max', sl.quantity_max,
        'quantity_is_approx', sl.quantity_is_approx,
        'unit', sl.unit,
        'prep_notes', sl.prep_notes,
        'is_optional', sl.is_optional,
        'parenthetical_note', sl.parenthetical_note,
        'linked_recipe_id', sl.linked_recipe_id,
        'recipe_text', sl.recipe_text,
        'is_alt', sl.is_alt,
        'linked_recipe', case
          when lr.id is null then null
          else jsonb_build_object('title', lr.title)
        end
      )
      order by sl.sort_order, sl.id
    ),
    '[]'::jsonb
  )
  into v_subrecipe_links
  from catalog.recipe_subrecipe_links sl
  left join catalog.recipes lr on lr.id = sl.linked_recipe_id
  where sl.recipe_id = p_recipe_id;

  return jsonb_build_object(
    'recipe', v_recipe,
    'tagMap', v_tag_map,
    'steps', v_steps,
    'headings', v_headings,
    'rim', v_rim,
    'subrecipeLinks', v_subrecipe_links
  );
end;
$$;

grant execute on function catalog.load_recipe_editor(bigint) to anon, authenticated;
