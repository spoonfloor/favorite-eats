// The data service "door".
//
// This is the ONLY entry point UI code may use to read/write app data.
// UI code calls window.dataService.<method>() — the door dispatches to the
// correct adapter (SQLite today, Supabase eventually). UI does not import
// adapters directly.
//
// Currently exposes:
//   - listRecipes() — see js/data/contracts/listRecipes.md
//
// Methods are added one capability at a time per the migration plan in
// docs/supabase-migration-plan-plain.md.

(function initDataService(global) {
  if (!global) return;

  const adapters = {
    sqlite: null,
  };

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

  function getActiveAdapter() {
    if (adapters.sqlite) return adapters.sqlite;
    throw new Error(
      'dataService is not initialized. Call window.dataService.setSqliteDb(db) ' +
        'after the database is ready.',
    );
  }

  global.dataService = {
    setSqliteDb,
    listRecipes: () => getActiveAdapter().listRecipes(),
  };
})(typeof window !== 'undefined' ? window : globalThis);
