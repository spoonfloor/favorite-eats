# Supabase Architecture

> **Status:** This document describes the *intended* end state. The migration is functionally incomplete. The SQLite engine, adapter, and bundled database file have been deleted, but roughly 100 direct `db.exec` / `db.run` / `db.prepare` call sites remain in UI code. Reads silently return null; writes throw. See `docs/migration-sweep.md` for the active migration sweep plan.

Favorite Eats stores application data in Supabase Postgres. The web and Electron shells both use the same browser runtime and default to Supabase; there is no local SQLite runtime, bundled database file, adapter query switch, or SQLite bridge in the app.

## Data Access

UI code reads and writes through `window.dataService` in `js/data/index.js`. That data door is Supabase-only and delegates to `js/data/adapters/supabaseAdapter.js`. UI code should not call PostgREST, RPCs, or database helpers directly.

The Supabase adapter uses PostgREST for normal reads and focused catalog RPCs for bundled writes that need transactional behavior. Current bundled writes include recipe save, store layout save, and shopping state save.

## Configuration

The Supabase adapter defaults to the project URL and publishable key embedded in `js/data/adapters/supabaseAdapter.js`. Tests or local experiments can override those values with `window.__SUPABASE_URL__`, `window.__SUPABASE_ANON_KEY__`, localStorage values, or `window.dataService.configureSupabase(...)`.

Never expose service-role or secret keys in browser or Electron renderer code.

## Database Changes

Schema and RPC changes live in `supabase/migrations/`. Create new migrations with the Supabase CLI rather than hand-writing timestamped filenames.

When changing database behavior, keep the public runtime path through `window.dataService`, add the smallest focused verification for the changed surface, and run the relevant app check before committing.

## Known Notes

Two older remote Supabase migrations (`20260428140000`, `20260428173751`) predate the checked-in migration history. Hosted Supabase also has broad RLS advisor warnings that are accepted for this single-user app unless the access model changes.
