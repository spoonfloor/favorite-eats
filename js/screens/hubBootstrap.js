/**
 * Shared hub bootstrap helpers (Slice 7).
 */
(function favoriteEatsHubBootstrapModule(global) {
  if (!global) return;

  function shouldUseSupabaseHub(options) {
    if (options && typeof options.shouldUseSupabase === 'boolean') {
      return options.shouldUseSupabase;
    }
    return !!global.dataService;
  }

  global.favoriteEatsHubBootstrap = {
    shouldUseSupabaseHub,
  };
})(typeof window !== 'undefined' ? window : globalThis);
