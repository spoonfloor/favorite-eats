-- Allow passive clients to receive canonical recipe membership/root changes.
alter publication supabase_realtime add table plan.selected_recipe_roots;
