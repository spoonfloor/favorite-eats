-- Enable Supabase Realtime for list.* so shopping checklist rows sync across devices without reload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'list'
      AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE list.sessions;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'list'
      AND tablename = 'generated_rows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE list.generated_rows;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'list'
      AND tablename = 'row_overrides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE list.row_overrides;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'list'
      AND tablename = 'manual_rows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE list.manual_rows;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'list'
      AND tablename = 'conflicts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE list.conflicts;
  END IF;
END $$;
