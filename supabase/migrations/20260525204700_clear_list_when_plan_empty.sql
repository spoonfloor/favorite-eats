-- Resetting the Items planner clears plan.selected_* rows. The active Shopping
-- List stores generated rows and checked overrides separately, so clear that
-- list session once the plan has no selected item or recipe content left.

create or replace function catalog.clear_active_list_if_plan_empty(p_document_id bigint)
returns void
language plpgsql
set search_path = catalog, plan, list, public
as $$
declare
  v_session_id bigint;
begin
  if p_document_id is null then
    return;
  end if;

  if exists (select 1 from plan.selected_items where document_id = p_document_id) then
    return;
  end if;
  if exists (select 1 from plan.selected_recipes where document_id = p_document_id) then
    return;
  end if;
  if exists (select 1 from plan.selected_recipe_roots where document_id = p_document_id) then
    return;
  end if;

  select id into v_session_id
    from list.sessions
   where plan_document_id = p_document_id
     and status = 'active'
   order by updated_at desc, id desc
   limit 1;

  if v_session_id is null then
    return;
  end if;

  delete from list.conflicts where session_id = v_session_id;
  delete from list.manual_rows where session_id = v_session_id;
  delete from list.row_overrides where session_id = v_session_id;
  delete from list.generated_rows where session_id = v_session_id;

  update list.sessions
     set updated_at = now()
   where id = v_session_id;
end;
$$;

create or replace function catalog.clear_active_list_if_plan_empty_trigger()
returns trigger
language plpgsql
set search_path = catalog, plan, list, public
as $$
begin
  perform catalog.clear_active_list_if_plan_empty(old.document_id);
  return null;
end;
$$;

drop trigger if exists trg_clear_list_after_selected_items_empty on plan.selected_items;
create trigger trg_clear_list_after_selected_items_empty
after delete on plan.selected_items
for each row
execute function catalog.clear_active_list_if_plan_empty_trigger();

drop trigger if exists trg_clear_list_after_selected_recipes_empty on plan.selected_recipes;
create trigger trg_clear_list_after_selected_recipes_empty
after delete on plan.selected_recipes
for each row
execute function catalog.clear_active_list_if_plan_empty_trigger();

drop trigger if exists trg_clear_list_after_selected_recipe_roots_empty on plan.selected_recipe_roots;
create trigger trg_clear_list_after_selected_recipe_roots_empty
after delete on plan.selected_recipe_roots
for each row
execute function catalog.clear_active_list_if_plan_empty_trigger();

grant execute on function catalog.clear_active_list_if_plan_empty(bigint)
  to anon, authenticated;
