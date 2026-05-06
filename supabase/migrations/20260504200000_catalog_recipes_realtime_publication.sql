-- Recipe deletes/updates touch catalog.recipes, not plan.* — expose for live recipes list refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'recipes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.recipes;
  END IF;
END $$;
