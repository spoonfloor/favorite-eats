/**
 * Fallback storage for the sql.js database blob when localStorage is full or blocked.
 * Mirrors `favoriteEatsDb` in IndexedDB so proto pages and legacy SQLite paths keep working.
 */
(function favoriteEatsSqliteBlobCacheFactory(global) {
  const DB_NAME = 'favoriteEatsSqliteBlobCache';
  const STORE = 'blobs';
  const RECORD_KEY = 'favoriteEatsDb';

  if (typeof indexedDB === 'undefined') {
    global.favoriteEatsSqliteBlobCache = null;
    return;
  }

  let openPromise = null;

  function openDb() {
    if (!openPromise) {
      openPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return openPromise;
  }

  async function read() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(RECORD_KEY);
      req.onsuccess = () => {
        const v = req.result;
        if (!v) return resolve(null);
        resolve(new Uint8Array(v));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function write(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.length) return false;
    const db = await openDb();
    const buf = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(buf, RECORD_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function remove() {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {}
  }

  global.favoriteEatsSqliteBlobCache = {
    read,
    write,
    remove,
  };
})(typeof window !== 'undefined' ? window : globalThis);
