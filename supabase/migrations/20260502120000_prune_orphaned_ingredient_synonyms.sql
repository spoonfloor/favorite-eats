-- One-shot catalog hygiene: remove synonym rows that point at deleted ingredients.
-- Exposed to the app via PostgREST RPC (same pattern as save_shopping_state).

create or replace function catalog.prune_orphaned_ingredient_synonyms()
returns bigint
language plpgsql
set search_path = catalog, public
as $$
declare
  deleted_count bigint;
begin
  delete from ingredient_synonyms syn
   where not exists (
     select 1 from ingredients i where i.id = syn.ingredient_id
   );
  get diagnostics deleted_count = row_count;
  return coalesce(deleted_count, 0);
end;
$$;

grant execute on function catalog.prune_orphaned_ingredient_synonyms() to anon, authenticated;
