-- Realtime postgres_changes are filtered by what the DB role may SELECT.
-- Ensure anon/authenticated can read list.* so checklist sync events reach browsers.

grant usage on schema list to anon, authenticated;

grant select on table list.sessions to anon, authenticated;
grant select on table list.generated_rows to anon, authenticated;
grant select on table list.row_overrides to anon, authenticated;
grant select on table list.manual_rows to anon, authenticated;
grant select on table list.conflicts to anon, authenticated;
