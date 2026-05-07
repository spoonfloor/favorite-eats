-- Enable Supabase Realtime for catalog reference tables used by Items, Stores, Units, Tags, Sizes,
-- and derived shopping aggregates (recipe links, tag maps, store locations).
-- catalog.recipes stays on its existing migration (recipe list only).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'ingredients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.ingredients;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'ingredient_variants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.ingredient_variants;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'ingredient_synonyms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.ingredient_synonyms;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'stores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.stores;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'units'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.units;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'tags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.tags;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'sizes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.sizes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'ingredient_variant_tag_map'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.ingredient_variant_tag_map;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'recipe_tag_map'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.recipe_tag_map;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'recipe_ingredient_map'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.recipe_ingredient_map;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'recipe_ingredient_substitutes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.recipe_ingredient_substitutes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'ingredient_store_location'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.ingredient_store_location;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'catalog'
      AND tablename = 'ingredient_variant_store_location'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog.ingredient_variant_store_location;
  END IF;
END $$;
