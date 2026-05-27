-- Canonicalize recipe ingredient amount columns at the database boundary.
-- The web client treats recipe amounts as scalar/range/text via
-- js/recipeIngredientAmountModel.js. These triggers enforce the same invariant
-- for any writer that touches catalog recipe ingredient rows.

create or replace function catalog.canonicalize_recipe_amount_columns()
returns trigger
language plpgsql
set search_path = catalog, public
as $$
declare
  v_quantity text;
  v_quantity_num double precision;
  v_min double precision;
  v_max double precision;
  v_tmp double precision;
  v_has_range_text boolean;
begin
  v_quantity := btrim(coalesce(new.quantity, ''));
  v_quantity_num := case
    when v_quantity ~ '^\s*-?([0-9]+(\.[0-9]+)?|\.[0-9]+)\s*$'
      then v_quantity::double precision
    else null
  end;

  if v_quantity_num is not null then
    if v_quantity_num > 0 then
      new.quantity := v_quantity;
      new.quantity_min := v_quantity_num;
      new.quantity_max := v_quantity_num;
      new.quantity_is_approx := coalesce(new.quantity_is_approx, false);
      return new;
    end if;

    new.quantity := '';
    new.quantity_min := null;
    new.quantity_max := null;
    new.quantity_is_approx := false;
    return new;
  end if;

  v_min := case
    when new.quantity_min is not null and new.quantity_min > 0 then new.quantity_min
    else null
  end;
  v_max := case
    when new.quantity_max is not null and new.quantity_max > 0 then new.quantity_max
    else null
  end;

  if v_min is null and v_max is not null then
    v_min := v_max;
  elsif v_max is null and v_min is not null then
    v_max := v_min;
  end if;

  if v_min is not null and v_max is not null and v_min > v_max then
    v_tmp := v_min;
    v_min := v_max;
    v_max := v_tmp;
  end if;

  new.quantity := v_quantity;

  if v_min is null and v_max is null then
    new.quantity_min := null;
    new.quantity_max := null;
    new.quantity_is_approx := false;
    return new;
  end if;

  v_has_range_text := v_quantity = ''
    or coalesce(new.quantity_is_approx, false)
    or v_quantity ~* '(^|[[:space:]])(to|through|thru)([[:space:]]|$)'
    or v_quantity ~ '[0-9]\s*[-–—]\s*[0-9]';

  if v_has_range_text then
    new.quantity_min := v_min;
    new.quantity_max := v_max;
    new.quantity_is_approx := coalesce(new.quantity_is_approx, false);
    return new;
  end if;

  -- Plain nonnumeric text ("pinch", "as needed") is not a numeric shopping amount.
  -- Clear any stale endpoints instead of carrying old scalar/range values forward.
  new.quantity_min := null;
  new.quantity_max := null;
  new.quantity_is_approx := false;
  return new;
end;
$$;

drop trigger if exists trg_recipe_ingredient_map_amount_canonical on catalog.recipe_ingredient_map;
create trigger trg_recipe_ingredient_map_amount_canonical
before insert or update of quantity, quantity_min, quantity_max, quantity_is_approx
on catalog.recipe_ingredient_map
for each row
execute function catalog.canonicalize_recipe_amount_columns();

drop trigger if exists trg_recipe_subrecipe_links_amount_canonical on catalog.recipe_subrecipe_links;
create trigger trg_recipe_subrecipe_links_amount_canonical
before insert or update of quantity, quantity_min, quantity_max, quantity_is_approx
on catalog.recipe_subrecipe_links
for each row
execute function catalog.canonicalize_recipe_amount_columns();
