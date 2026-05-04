-- Recipe deletes/updates touch catalog.recipes, not plan.* — expose for live recipes list refresh.
ALTER PUBLICATION supabase_realtime ADD TABLE catalog.recipes;
