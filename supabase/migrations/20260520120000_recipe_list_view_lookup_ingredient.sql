-- Aggregated recipe list for one round-trip (replaces embedded recipe_tag_map select).
create or replace view catalog.recipe_list_rows as
select
  r.id,
  r.title,
  r.servings_default,
  r.servings_min,
  r.servings_max,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'sort_order', m.sort_order,
        'tags', jsonb_build_object(
          'name', t.name,
          'is_hidden', (case when coalesce(t.is_hidden, false) then 1 else 0 end)
        )
      )
      order by m.sort_order nulls last, m.id
    ) filter (where m.id is not null),
    '[]'::jsonb
  ) as recipe_tag_map
from catalog.recipes r
left join catalog.recipe_tag_map m on m.recipe_id = r.id
left join catalog.tags t on t.id = m.tag_id
group by r.id, r.title, r.servings_default, r.servings_min, r.servings_max;

grant select on catalog.recipe_list_rows to anon, authenticated;

-- Escape %, _, \ for ILIKE literals (matches client ilikeLiteralExact intent).
create or replace function catalog.escape_ilike_literal(val text)
returns text
language sql
immutable
parallel safe
as $$
  select replace(replace(replace(coalesce(val, ''), e'\\', e'\\\\'), '%', e'\\%'), '_', e'\\_');
$$;

-- Single round-trip ingredient lookup (replaces 2-3 sequential ingredients GETs).
create or replace function catalog.lookup_ingredient_by_needle(p_needle text)
returns setof catalog.ingredients
language plpgsql
stable
as $$
declare
  nl text := lower(trim(coalesce(p_needle, '')));
  esc text;
begin
  if nl = '' then
    return;
  end if;
  esc := catalog.escape_ilike_literal(p_needle);

  return query
  select i.*
  from catalog.ingredients i
  where lower(trim(i.name)) = nl
     or (i.lemma is not null and lower(trim(i.lemma)) = nl)
  order by i.id asc
  limit 1;
  if found then
    return;
  end if;

  return query
  select i.*
  from catalog.ingredients i
  where i.name ilike esc
     or (i.lemma is not null and i.lemma ilike esc)
  order by i.id asc
  limit 1;
  if found then
    return;
  end if;

  return query
  select i.*
  from catalog.ingredients i
  where (
      lower(trim(i.name)) = nl
      or (i.lemma is not null and lower(trim(i.lemma)) = nl)
    )
    and (
      i.name ilike ('%' || esc || '%')
      or (i.lemma is not null and i.lemma ilike ('%' || esc || '%'))
    )
  order by i.id asc
  limit 1;
end;
$$;

grant execute on function catalog.lookup_ingredient_by_needle(text) to anon, authenticated;
