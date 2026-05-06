-- Enable Supabase Realtime for plan tables so other devices see plan changes without reload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'plan'
      AND tablename = 'documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE plan.documents;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'plan'
      AND tablename = 'selected_recipes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE plan.selected_recipes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'plan'
      AND tablename = 'selected_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE plan.selected_items;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'plan'
      AND tablename = 'store_preferences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE plan.store_preferences;
  END IF;
END $$;
