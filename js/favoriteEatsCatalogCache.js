/**
 * IndexedDB write-through cache for Items catalog aggregate (Slice 4).
 */
(function favoriteEatsCatalogCacheModule(global) {
  if (!global) return;

  const DB_NAME = 'favoriteEats-catalog-v1';
  const STORE = 'itemsAggregate';
  const CACHE_KEY = 'default';
  const RECIPES_LIST_STORAGE_KEY = 'favoriteEats:recipes-list:v1';

  function openDb() {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function readItemsCache(catalogUpdatedAt) {
    const token = String(catalogUpdatedAt || '').trim();
    if (!token) return null;
    const db = await openDb();
    if (!db) return null;
    try {
      const entry = await new Promise((resolve) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(CACHE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (!entry || typeof entry !== 'object') return null;
      if (String(entry.catalogUpdatedAt || '').trim() !== token) return null;
      if (!Array.isArray(entry.items)) return null;
      return {
        items: entry.items,
        catalogBundle: entry.catalogBundle || null,
        catalogUpdatedAt: token,
      };
    } catch (_) {
      return null;
    } finally {
      try {
        db.close();
      } catch (_) {}
    }
  }

  async function writeItemsCache(catalogUpdatedAt, items, catalogBundle) {
    const token = String(catalogUpdatedAt || '').trim();
    if (!token || !Array.isArray(items)) return false;
    const db = await openDb();
    if (!db) return false;
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put(
          {
            catalogUpdatedAt: token,
            items,
            catalogBundle: catalogBundle || null,
            savedAt: Date.now(),
          },
          CACHE_KEY,
        );
      });
      return true;
    } catch (_) {
      return false;
    } finally {
      try {
        db.close();
      } catch (_) {}
    }
  }

  async function clearItemsCache() {
    const db = await openDb();
    if (!db) return;
    try {
      await new Promise((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.objectStore(STORE).delete(CACHE_KEY);
      });
    } catch (_) {
    } finally {
      try {
        db.close();
      } catch (_) {}
    }
  }

  function readRecipesListCache(catalogUpdatedAt) {
    const token = String(catalogUpdatedAt || '').trim();
    if (!token || typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(RECIPES_LIST_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (String(parsed.catalogUpdatedAt || '').trim() !== token) return null;
      if (!Array.isArray(parsed.recipes)) return null;
      return {
        recipes: parsed.recipes,
        catalogUpdatedAt: token,
      };
    } catch (_) {
      return null;
    }
  }

  function writeRecipesListCache(catalogUpdatedAt, recipes) {
    const token = String(catalogUpdatedAt || '').trim();
    if (!token || !Array.isArray(recipes) || typeof sessionStorage === 'undefined') {
      return false;
    }
    try {
      sessionStorage.setItem(
        RECIPES_LIST_STORAGE_KEY,
        JSON.stringify({
          catalogUpdatedAt: token,
          recipes,
          savedAt: Date.now(),
        }),
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearRecipesListCache() {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.removeItem(RECIPES_LIST_STORAGE_KEY);
    } catch (_) {}
  }

  global.favoriteEatsCatalogCache = {
    readItemsCache,
    writeItemsCache,
    clearItemsCache,
    readRecipesListCache,
    writeRecipesListCache,
    clearRecipesListCache,
  };
})(typeof window !== 'undefined' ? window : globalThis);
