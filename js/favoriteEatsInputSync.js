/**
 * Shared Plan/List input sync primitives.
 *
 * This module is intentionally small: controls apply locally first, then enqueue
 * the latest field intent for background persistence.
 */
(function favoriteEatsInputSyncModule(global) {
  if (!global) return;

  const DEFAULT_FLUSH_DELAY_MS = 120;

  function normalizeText(value) {
    return String(value == null ? '' : value).trim();
  }

  function opKey(op) {
    if (!op || typeof op !== 'object') return '';
    const surface = normalizeText(op.surface);
    const entityKey = normalizeText(op.entityKey);
    const field = normalizeText(op.field);
    if (!surface || !entityKey || !field) return '';
    return `${surface}:${entityKey}:${field}`;
  }

  function cloneOp(op) {
    if (!op || typeof op !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(op));
    } catch (_) {
      return { ...op };
    }
  }

  function createCoalescedOpQueue(options = {}) {
    const flushDelayMs = Number.isFinite(Number(options.flushDelayMs))
      ? Math.max(0, Number(options.flushDelayMs))
      : DEFAULT_FLUSH_DELAY_MS;
    const setTimer =
      typeof options.setTimeout === 'function'
        ? options.setTimeout
        : global.setTimeout?.bind(global);
    const clearTimer =
      typeof options.clearTimeout === 'function'
        ? options.clearTimeout
        : global.clearTimeout?.bind(global);
    const flushOp =
      typeof options.flushOp === 'function' ? options.flushOp : async () => {};
    const onLocalApply =
      typeof options.onLocalApply === 'function'
        ? options.onLocalApply
        : () => {};
    const onFlushStart =
      typeof options.onFlushStart === 'function' ? options.onFlushStart : () => {};
    const onFlushSuccess =
      typeof options.onFlushSuccess === 'function'
        ? options.onFlushSuccess
        : () => {};
    const onFlushFailure =
      typeof options.onFlushFailure === 'function'
        ? options.onFlushFailure
        : () => {};

    /** @type {Map<string, object>} */
    const pending = new Map();
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    const timers = new Map();
    /** @type {Set<string>} */
    const flushing = new Set();

    function clearScheduledFlush(key) {
      const timerId = timers.get(key);
      if (timerId && clearTimer) clearTimer(timerId);
      timers.delete(key);
    }

    function scheduleFlush(key) {
      if (!key || !setTimer) return;
      clearScheduledFlush(key);
      const timerId = setTimer(() => {
        timers.delete(key);
        void flushKey(key);
      }, flushDelayMs);
      timers.set(key, timerId);
    }

    async function flushKey(key) {
      if (!key || flushing.has(key)) return false;
      const op = pending.get(key);
      if (!op) return false;
      pending.delete(key);
      flushing.add(key);
      try {
        onFlushStart(cloneOp(op));
        await flushOp(cloneOp(op));
        onFlushSuccess(cloneOp(op));
      } catch (err) {
        onFlushFailure(cloneOp(op), err);
      } finally {
        flushing.delete(key);
        if (pending.has(key)) {
          scheduleFlush(key);
        }
      }
      return true;
    }

    function enqueue(op) {
      const key = opKey(op);
      if (!key) return false;
      const normalized = {
        ...cloneOp(op),
        key,
        clientSeq:
          Number.isFinite(Number(op.clientSeq)) && Number(op.clientSeq) > 0
            ? Number(op.clientSeq)
            : Date.now(),
        createdAt:
          Number.isFinite(Number(op.createdAt)) && Number(op.createdAt) > 0
            ? Number(op.createdAt)
            : Date.now(),
      };
      onLocalApply(cloneOp(normalized));
      pending.set(key, normalized);
      scheduleFlush(key);
      return true;
    }

    function getPendingOp(keyOrOp) {
      const key =
        typeof keyOrOp === 'string' ? keyOrOp : opKey(keyOrOp || {});
      return key && pending.has(key) ? cloneOp(pending.get(key)) : null;
    }

    function hasPending(keyOrOp) {
      const key =
        typeof keyOrOp === 'string' ? keyOrOp : opKey(keyOrOp || {});
      return !!key && pending.has(key);
    }

    function flushAll() {
      const keys = Array.from(pending.keys());
      keys.forEach(clearScheduledFlush);
      return Promise.all(keys.map((key) => flushKey(key)));
    }

    function size() {
      return pending.size;
    }

    return {
      enqueue,
      flushAll,
      getPendingOp,
      hasPending,
      opKey,
      size,
      _flushKeyForTests: flushKey,
    };
  }

  global.favoriteEatsInputSync = {
    createCoalescedOpQueue,
    opKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
