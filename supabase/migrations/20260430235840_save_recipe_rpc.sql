create or replace function catalog.save_recipe(recipe_payload jsonb)
returns jsonb
language plpgsql
set search_path = catalog, public
as $$
declare
  v_recipe_id bigint;
  v_servings jsonb;
  v_tag jsonb;
  v_tag_name text;
  v_tag_id bigint;
  v_tag_sort integer := 1;
  v_tag_max_sort integer;
  v_step jsonb;
  v_heading jsonb;
  v_heading_id bigint;
  v_kept_heading_ids bigint[] := array[]::bigint[];
  v_ing jsonb;
  v_map_id bigint;
  v_ingredient_id bigint;
  v_ingredient_name text;
  v_canonical_name text;
  v_unit text;
  v_qty_text text;
  v_qty_num double precision;
  v_is_recipe boolean;
  v_linked_recipe_id bigint;
  v_kept_map_ids bigint[] := array[]::bigint[];
  v_next_unit_sort integer;
begin
  v_recipe_id := nullif(recipe_payload->>'id', '')::bigint;
  if v_recipe_id is null or v_recipe_id <= 0 then
    raise exception 'saveRecipe: valid recipe id is required';
  end if;

  if not exists (select 1 from recipes where id = v_recipe_id) then
    raise exception 'saveRecipe: recipe % does not exist', v_recipe_id;
  end if;

  v_servings := coalesce(recipe_payload->'servings', '{}'::jsonb);

  update recipes
     set title = coalesce(recipe_payload->>'title', ''),
         servings_default = nullif(v_servings->>'default', '')::numeric,
         servings_min = nullif(v_servings->>'min', '')::numeric,
         servings_max = nullif(v_servings->>'max', '')::numeric
   where id = v_recipe_id;

  delete from recipe_tag_map where recipe_id = v_recipe_id;

  for v_tag in select * from jsonb_array_elements(coalesce(recipe_payload->'tags', '[]'::jsonb))
  loop
    v_tag_name := btrim(v_tag #>> '{}');
    if v_tag_name = '' then
      continue;
    end if;

    select id into v_tag_id
      from tags
     where lower(btrim(name::text)) = lower(v_tag_name)
     limit 1;

    if v_tag_id is null then
      select coalesce(max(sort_order), 0) + 1 into v_tag_max_sort from tags;
      insert into tags (name, is_hidden, sort_order, intended_use)
      values (v_tag_name, false, v_tag_max_sort, 'recipes')
      returning id into v_tag_id;
    end if;

    insert into recipe_tag_map (recipe_id, tag_id, sort_order)
    values (v_recipe_id, v_tag_id, v_tag_sort)
    on conflict (recipe_id, tag_id) do update
      set sort_order = excluded.sort_order;

    v_tag_sort := v_tag_sort + 1;
    v_tag_id := null;
  end loop;

  delete from recipe_steps where recipe_id = v_recipe_id;

  for v_step in select * from jsonb_array_elements(coalesce(recipe_payload->'steps', '[]'::jsonb))
  loop
    insert into recipe_steps (recipe_id, step_number, instructions, type)
    values (
      v_recipe_id,
      nullif(v_step->>'step_number', '')::integer,
      coalesce(v_step->>'instructions', ''),
      nullif(v_step->>'type', '')
    );
  end loop;

  for v_heading in select * from jsonb_array_elements(coalesce(recipe_payload->'headings', '[]'::jsonb))
  loop
    v_heading_id := nullif(v_heading->>'id', '')::bigint;

    if v_heading_id is not null
       and exists (
         select 1 from recipe_ingredient_headings
          where id = v_heading_id and recipe_id = v_recipe_id
       ) then
      update recipe_ingredient_headings
         set section_id = nullif(v_heading->>'section_id', '')::bigint,
             sort_order = nullif(v_heading->>'sort_order', '')::integer,
             heading_text = coalesce(v_heading->>'heading_text', '')
       where id = v_heading_id
         and recipe_id = v_recipe_id;
    else
      insert into recipe_ingredient_headings
        (recipe_id, section_id, sort_order, heading_text)
      values (
        v_recipe_id,
        nullif(v_heading->>'section_id', '')::bigint,
        nullif(v_heading->>'sort_order', '')::integer,
        coalesce(v_heading->>'heading_text', '')
      )
      returning id into v_heading_id;
    end if;

    v_kept_heading_ids := array_append(v_kept_heading_ids, v_heading_id);
  end loop;

  delete from recipe_ingredient_headings
   where recipe_id = v_recipe_id
     and not (id = any(v_kept_heading_ids));

  for v_ing in select * from jsonb_array_elements(coalesce(recipe_payload->'ingredients', '[]'::jsonb))
  loop
    v_map_id := nullif(v_ing->>'id', '')::bigint;
    v_ingredient_id := null;
    v_canonical_name := '';
    v_unit := btrim(coalesce(v_ing->>'unit', ''));
    v_is_recipe := coalesce((v_ing->>'is_recipe')::boolean, false);
    v_linked_recipe_id := nullif(v_ing->>'linked_recipe_id', '')::bigint;

    if v_unit <> '' then
      select coalesce(max(sort_order), 0) + 1 into v_next_unit_sort from units;
      insert into units
        (code, name_singular, name_plural, category, sort_order, is_hidden, is_removed)
      values (v_unit, v_unit, '', '', v_next_unit_sort, false, false)
      on conflict (code) do nothing;
    end if;

    if not (v_is_recipe and v_linked_recipe_id is not null and v_linked_recipe_id <> v_recipe_id) then
      v_is_recipe := false;
      v_linked_recipe_id := null;
      v_ingredient_name := btrim(coalesce(v_ing->>'ingredient_name', ''));
      if v_ingredient_name = '' then
        continue;
      end if;

      select id, name into v_ingredient_id, v_canonical_name
        from ingredients
       where lower(btrim(name)) = lower(v_ingredient_name)
       limit 1;

      if v_ingredient_id is null then
        select i.id, i.name into v_ingredient_id, v_canonical_name
          from ingredient_synonyms s
          join ingredients i on i.id = s.ingredient_id
         where lower(btrim(s.synonym::text)) = lower(v_ingredient_name)
         limit 1;
      end if;

      if v_ingredient_id is null then
        insert into ingredients (name, lemma)
        values (v_ingredient_name, nullif(v_ing->>'ingredient_lemma', ''))
        returning id, name into v_ingredient_id, v_canonical_name;

        insert into ingredient_variants
          (ingredient_id, variant, sort_order, home_location, is_deprecated)
        values (v_ingredient_id, 'default', 0, 'none', false);
      end if;
    end if;

    v_qty_text := coalesce(v_ing->>'quantity', '');
    v_qty_num := case
      when v_qty_text ~ '^\s*-?([0-9]+(\.[0-9]+)?|\.[0-9]+)\s*$'
        then v_qty_text::double precision
      else null
    end;
    if v_qty_num is not null and v_qty_num <= 0 then
      v_qty_text := '';
    end if;

    if v_map_id is not null
       and exists (
         select 1 from recipe_ingredient_map
          where id = v_map_id and recipe_id = v_recipe_id
       ) then
      update recipe_ingredient_map
         set ingredient_id = v_ingredient_id,
             section_id = nullif(v_ing->>'section_id', '')::bigint,
             quantity = v_qty_text,
             unit = v_unit,
             prep_notes = btrim(coalesce(v_ing->>'prep_notes', '')),
             is_optional = coalesce((v_ing->>'is_optional')::boolean, false),
             subrecipe_id = null,
             sort_order = nullif(v_ing->>'sort_order', '')::integer,
             parenthetical_note = btrim(coalesce(v_ing->>'parenthetical_note', '')),
             quantity_min = nullif(v_ing->>'quantity_min', '')::double precision,
             quantity_max = nullif(v_ing->>'quantity_max', '')::double precision,
             quantity_is_approx = coalesce((v_ing->>'quantity_is_approx')::boolean, false),
             linked_recipe_id = case when v_is_recipe then v_linked_recipe_id else null end,
             recipe_text = case when v_is_recipe then btrim(coalesce(v_ing->>'recipe_text', '')) else '' end,
             is_recipe = v_is_recipe,
             is_alt = coalesce((v_ing->>'is_alt')::boolean, false),
             display_name = case
               when v_is_recipe then null
               when lower(btrim(coalesce(v_ing->>'ingredient_name', ''))) = lower(btrim(coalesce(v_canonical_name, ''))) then null
               else btrim(coalesce(v_ing->>'ingredient_name', ''))
             end,
             variant = btrim(coalesce(v_ing->>'variant', '')),
             size = btrim(coalesce(v_ing->>'size', ''))
       where id = v_map_id
         and recipe_id = v_recipe_id;
    else
      insert into recipe_ingredient_map
        (
          recipe_id, ingredient_id, section_id, quantity, unit, prep_notes,
          is_optional, subrecipe_id, sort_order, parenthetical_note,
          quantity_min, quantity_max, quantity_is_approx, linked_recipe_id,
          recipe_text, is_recipe, is_alt, display_name, variant, size
        )
      values
        (
          v_recipe_id,
          v_ingredient_id,
          nullif(v_ing->>'section_id', '')::bigint,
          v_qty_text,
          v_unit,
          btrim(coalesce(v_ing->>'prep_notes', '')),
          coalesce((v_ing->>'is_optional')::boolean, false),
          null,
          nullif(v_ing->>'sort_order', '')::integer,
          btrim(coalesce(v_ing->>'parenthetical_note', '')),
          nullif(v_ing->>'quantity_min', '')::double precision,
          nullif(v_ing->>'quantity_max', '')::double precision,
          coalesce((v_ing->>'quantity_is_approx')::boolean, false),
          case when v_is_recipe then v_linked_recipe_id else null end,
          case when v_is_recipe then btrim(coalesce(v_ing->>'recipe_text', '')) else '' end,
          v_is_recipe,
          coalesce((v_ing->>'is_alt')::boolean, false),
          case
            when v_is_recipe then null
            when lower(btrim(coalesce(v_ing->>'ingredient_name', ''))) = lower(btrim(coalesce(v_canonical_name, ''))) then null
            else btrim(coalesce(v_ing->>'ingredient_name', ''))
          end,
          btrim(coalesce(v_ing->>'variant', '')),
          btrim(coalesce(v_ing->>'size', ''))
        )
      returning id into v_map_id;
    end if;

    v_kept_map_ids := array_append(v_kept_map_ids, v_map_id);
  end loop;

  delete from recipe_ingredient_map
   where recipe_id = v_recipe_id
     and not (id = any(v_kept_map_ids));

  return jsonb_build_object('id', v_recipe_id);
end;
$$;

grant execute on function catalog.save_recipe(jsonb) to anon, authenticated;
