-- Enable Supabase Realtime for list.* so shopping checklist rows sync across devices without reload.
ALTER PUBLICATION supabase_realtime ADD TABLE list.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE list.generated_rows;
ALTER PUBLICATION supabase_realtime ADD TABLE list.row_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE list.manual_rows;
ALTER PUBLICATION supabase_realtime ADD TABLE list.conflicts;
