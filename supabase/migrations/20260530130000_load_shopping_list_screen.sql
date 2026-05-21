-- Shopping List screen payload (Slice 2): revisions + plan/list state + recipe summaries.
-- Replaces separate hydrate probe, load_shopping_state, and full-table recipe scan on list load.

create or replace function catalog.load_shopping_list_screen()
returns jsonb
language plpgsql
stable
security invoker
set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id bigint;
  v_state jsonb;
  v_revisions jsonb;
  v_recipe_summaries jsonb;
begin
  v_revisions := catalog.get_shopping_revisions();
  v_state := catalog.load_shopping_state();

  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    v_recipe_summaries := '[]'::jsonb;
  else
    select coalesce(
      jsonb_agg(summary_row order by sort_title, recipe_id),
      '[]'::jsonb
    )
    into v_recipe_summaries
    from (
      select
        sr.recipe_id as recipe_id,
        lower(
          coalesce(
            nullif(btrim(sr.title), ''),
            nullif(btrim(r.title), ''),
            'recipe ' || sr.recipe_id::text
          )
        ) as sort_title,
        jsonb_build_object(
          'recipeId', sr.recipe_id,
          'title',
            coalesce(
              nullif(btrim(sr.title), ''),
              nullif(btrim(r.title), ''),
              'Recipe ' || sr.recipe_id::text
            ),
          'servingsText',
            case
              when coalesce(sr.servings_override, r.servings_default) is not null
                and coalesce(sr.servings_override, r.servings_default) > 0
              then
                trim(
                  trailing '.'
                  from trim(
                    trailing '0'
                    from to_char(
                      coalesce(sr.servings_override, r.servings_default),
                      'FM999999990.##'
                    )
                  )
                ) || ' svg'
              else ''
            end
        ) as summary_row
      from plan.selected_recipes sr
      left join catalog.recipes r on r.id = sr.recipe_id
      where sr.document_id = v_doc_id
    ) summaries;
  end if;

  return jsonb_build_object(
    'revisions', v_revisions,
    'plan', v_state->'plan',
    'shoppingListDoc', v_state->'shoppingListDoc',
    'recipeSummaries', v_recipe_summaries
  );
end;
$$;

grant execute on function catalog.load_shopping_list_screen()
  to anon, authenticated;
