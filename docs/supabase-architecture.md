# Supabase Architecture

> **Status:** Browser runtime matches this end state. SQL.js, local blob I/O, bundled
> `favorite_eats.db`, and `window.dbInstance` are gone from `js/` and HTML.
> There are **no** `db.exec` / `db.run` / `db.prepare` call sites under `js/`.
> All UI reads/writes go through `window.dataService` → Supabase Postgres.

Favorite Eats stores application data in Supabase Postgres. The web shell uses the browser runtime and defaults to Supabase through `window.dataService`.

## Data Access

UI code reads and writes through `window.dataService` in `js/data/index.js`. That data door is Supabase-only and delegates to `js/data/adapters/supabaseAdapter.js`. UI code should not call PostgREST, RPCs, or database helpers directly.

The Supabase adapter uses PostgREST for normal reads and focused catalog RPCs for bundled writes that need transactional behavior. Current bundled writes include recipe save, store layout save, and shopping state save.

## Configuration

The Supabase adapter defaults to the project URL and publishable key embedded in `js/data/adapters/supabaseAdapter.js`. Tests or local experiments can override those values with `window.__SUPABASE_URL__`, `window.__SUPABASE_ANON_KEY__`, localStorage values, or `window.dataService.configureSupabase(...)`.

Never expose service-role or secret keys in browser client code.

## Database Changes

Schema and RPC changes live in `supabase/migrations/`. Create new migrations with the Supabase CLI rather than hand-writing timestamped filenames.

When changing database behavior, keep the public runtime path through `window.dataService`, verify in whatever way fits the change (click-through when the UI changed, code reasoning or `node --check` when it didn’t), and run the relevant app check before committing.

## Known Notes

Two older remote Supabase migrations (`20260428140000`, `20260428173751`) predate the checked-in migration history. Hosted Supabase also has broad RLS advisor warnings that are accepted for this single-user app unless the access model changes.

## Related Multi-Device Docs

- `docs/catalog-plan-list-supabase.md` defines the Catalog / Plan / List schema ownership model.
- `docs/multi-device-roadmap.md` lays out the phased Plan/List remote-first migration.
- `docs/multi-device-starter-message.md` contains the evergreen starter prompt for future chats.
- `/Users/erichenry/Desktop/baby-eats` is the functional proof-of-concept for multi-device plan sync, serving overrides, Realtime subscriptions, and shared presence.
