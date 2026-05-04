-- Enable Supabase Realtime for plan tables so other devices see plan changes without reload.
ALTER PUBLICATION supabase_realtime ADD TABLE plan.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE plan.selected_recipes;
ALTER PUBLICATION supabase_realtime ADD TABLE plan.selected_items;
ALTER PUBLICATION supabase_realtime ADD TABLE plan.store_preferences;
