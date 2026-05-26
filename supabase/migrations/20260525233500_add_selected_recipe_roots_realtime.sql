-- Allow passive clients to receive canonical recipe membership/root changes.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'plan'
       and tablename = 'selected_recipe_roots'
  ) then
    alter publication supabase_realtime add table plan.selected_recipe_roots;
  end if;
end;
$$;
