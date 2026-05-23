-- Allow catalog hub screens to skip plan/list payloads in Editing mode.

drop function if exists catalog.load_items_screen();
drop function if exists catalog.load_recipes_screen(text);

create or replace function catalog.load_items_screen(p_include_plan boolean default true)
returns jsonb
language plpgsql
stable
security invoker
set search_path = catalog, plan, list, public
as $$
declare
  v_state jsonb;
  v_revisions jsonb;
  v_ingredients jsonb;
  v_variants jsonb;
  v_tags jsonb;
  v_variant_tag_map jsonb;
  v_recipe_ingredient_map jsonb;
  v_recipe_ingredient_substitutes jsonb;
  v_ingredient_store_location jsonb;
  v_ingredient_variant_store_location jsonb;
begin
  v_revisions := catalog.get_shopping_revisions();
  if p_include_plan then
    v_state := catalog.load_shopping_state();
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'variant', i.variant,
        'is_deprecated', i.is_deprecated,
        'is_hidden', i.is_hidden,
        'is_food', i.is_food,
        'lemma', i.lemma,
        'singular_if_unspecified', i.singular_if_unspecified,
        'is_mass_noun', i.is_mass_noun,
        'plural_override', i.plural_override,
        'use_plural_override', i.use_plural_override,
        'use_metric', i.use_metric
      )
      order by lower(i.name), i.id
    ),
    '[]'::jsonb
  )
  into v_ingredients
  from catalog.ingredients i;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'ingredient_id', v.ingredient_id,
        'variant', v.variant,
        'sort_order', v.sort_order,
        'home_location', v.home_location,
        'is_deprecated', v.is_deprecated
      )
      order by v.ingredient_id, v.sort_order nulls last, v.id
    ),
    '[]'::jsonb
  )
  into v_variants
  from catalog.ingredient_variants v;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', t.id, 'name', t.name, 'is_hidden', t.is_hidden)
      order by t.id
    ),
    '[]'::jsonb
  )
  into v_tags
  from catalog.tags t;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'ingredient_variant_id', m.ingredient_variant_id,
        'tag_id', m.tag_id
      )
      order by m.id
    ),
    '[]'::jsonb
  )
  into v_variant_tag_map
  from catalog.ingredient_variant_tag_map m;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rim.id,
        'recipe_id', rim.recipe_id,
        'ingredient_id', rim.ingredient_id
      )
      order by rim.id
    ),
    '[]'::jsonb
  )
  into v_recipe_ingredient_map
  from catalog.recipe_ingredient_map rim;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ris.id,
        'recipe_ingredient_id', ris.recipe_ingredient_id,
        'ingredient_id', ris.ingredient_id
      )
      order by ris.id
    ),
    '[]'::jsonb
  )
  into v_recipe_ingredient_substitutes
  from catalog.recipe_ingredient_substitutes ris;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', isl.id,
        'ingredient_id', isl.ingredient_id,
        'store_location_id', isl.store_location_id
      )
      order by isl.id
    ),
    '[]'::jsonb
  )
  into v_ingredient_store_location
  from catalog.ingredient_store_location isl;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ivsl.id,
        'ingredient_variant_id', ivsl.ingredient_variant_id,
        'store_location_id', ivsl.store_location_id
      )
      order by ivsl.id
    ),
    '[]'::jsonb
  )
  into v_ingredient_variant_store_location
  from catalog.ingredient_variant_store_location ivsl;

  return jsonb_build_object(
    'revisions', v_revisions,
    'plan', case when p_include_plan then v_state->'plan' else null end,
    'shoppingListDoc', case
      when p_include_plan then v_state->'shoppingListDoc'
      else null
    end,
    'catalog', jsonb_build_object(
      'ingredients', v_ingredients,
      'ingredient_variants', v_variants,
      'tags', v_tags,
      'ingredient_variant_tag_map', v_variant_tag_map,
      'recipe_ingredient_map', v_recipe_ingredient_map,
      'recipe_ingredient_substitutes', v_recipe_ingredient_substitutes,
      'ingredient_store_location', v_ingredient_store_location,
      'ingredient_variant_store_location', v_ingredient_variant_store_location
    )
  );
end;
$$;

create or replace function catalog.load_recipes_screen(
  p_plan_updated_at text default null,
  p_include_plan boolean default true
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = catalog, plan, list, public
as $$
declare
  v_state jsonb;
  v_revisions jsonb;
  v_recipes jsonb;
  v_plan_unchanged boolean := false;
begin
  v_revisions := catalog.get_shopping_revisions();
  if p_include_plan then
    v_state := catalog.load_shopping_state();
    v_plan_unchanged :=
      p_plan_updated_at is not null
      and nullif(btrim(p_plan_updated_at), '') is not null
      and (v_revisions->>'planUpdatedAt') is not distinct from btrim(p_plan_updated_at);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'servings_default', r.servings_default,
        'servings_min', r.servings_min,
        'servings_max', r.servings_max,
        'recipe_tag_map', r.recipe_tag_map
      )
      order by lower(r.title), r.id
    ),
    '[]'::jsonb
  )
  into v_recipes
  from catalog.recipe_list_rows r;

  return jsonb_build_object(
    'revisions', v_revisions,
    'planUnchanged', v_plan_unchanged,
    'recipes', v_recipes,
    'plan', case
      when not p_include_plan or v_plan_unchanged then null
      else v_state->'plan'
    end,
    'shoppingListDoc', case
      when not p_include_plan or v_plan_unchanged then null
      else v_state->'shoppingListDoc'
    end
  );
end;
$$;

grant execute on function catalog.load_items_screen(boolean) to anon, authenticated;
grant execute on function catalog.load_recipes_screen(text, boolean) to anon, authenticated;
