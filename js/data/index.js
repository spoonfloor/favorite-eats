// The data service "door".
//
// This is the ONLY entry point UI code may use to read/write app data.
// UI code calls window.dataService.<method>() — the door dispatches to the
// correct adapter (SQLite today, Supabase eventually). UI does not import
// adapters directly.
//
// Methods are added one capability at a time per the migration plan in
// docs/supabase-migration-plan-plain.md.
//
// Adapter selection:
//   - window.dataService.useSupabase === false (default) → calls go to SQLite
//   - window.dataService.useSupabase === true            → calls go to Supabase
// The flag can be flipped at runtime (e.g. in DevTools) for ad-hoc testing.
// Persistence/UI for the flag will be added closer to cutover.

(function initDataService(global) {
  if (!global) return;

  const adapters = {
    sqlite: null,
    supabase: null,
  };

  let supabaseConfig = {};

  function setSqliteDb(db) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('setSqliteDb requires a sql.js Database instance.');
    }
    if (typeof global.createSqliteAdapter !== 'function') {
      throw new Error(
        'setSqliteDb: createSqliteAdapter is not loaded. Make sure ' +
          'js/data/adapters/sqliteAdapter.js loads before js/data/index.js.',
      );
    }
    adapters.sqlite = global.createSqliteAdapter(db);
  }

  function configureSupabase(opts = {}) {
    supabaseConfig = { ...supabaseConfig, ...opts };
    adapters.supabase = null;
  }

  function getSupabaseAdapter() {
    if (adapters.supabase) return adapters.supabase;
    if (typeof global.createSupabaseAdapter !== 'function') {
      throw new Error(
        'Supabase adapter is not loaded. Make sure ' +
          'js/data/adapters/supabaseAdapter.js loads before js/data/index.js.',
      );
    }
    adapters.supabase = global.createSupabaseAdapter(supabaseConfig);
    return adapters.supabase;
  }

  function getSqliteAdapter() {
    if (adapters.sqlite) return adapters.sqlite;
    throw new Error(
      'SQLite adapter is not initialized. Call window.dataService.setSqliteDb(db) ' +
        'after the database is ready.',
    );
  }

  function getActiveAdapter() {
    return global.dataService && global.dataService.useSupabase
      ? getSupabaseAdapter()
      : getSqliteAdapter();
  }

  global.dataService = {
    useSupabase: false,
    setSqliteDb,
    configureSupabase,
    get activeAdapter() {
      return this.useSupabase ? 'supabase' : 'sqlite';
    },
    listRecipes: () => getActiveAdapter().listRecipes(),
  };
})(typeof window !== 'undefined' ? window : globalThis);
