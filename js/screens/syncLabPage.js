(function syncLabPage(global) {
  if (!global || typeof document === 'undefined') return;

  const STORAGE_KEY = 'favoriteEats:syncLab:pending:v1';
  const FLUSH_DELAY_MS = 140;
  const CONTROL_KEYS = {
    stepper: { surface: 'syncLab', entityKey: 'stepper', field: 'value' },
    checkbox: { surface: 'syncLab', entityKey: 'checkbox', field: 'checked' },
  };

  const els = {};
  const localState = {
    stepper: { value: 0, updated_at: null },
    checkbox: { checked: false, updated_at: null },
  };
  let serverSnapshot = null;
  let activeStepperKey = '';
  let unsubscribeRealtime = null;
  let renderQueued = false;

  function compareUpdatedAt(a, b) {
    const ta = Date.parse(String(a || ''));
    const tb = Date.parse(String(b || ''));
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return -1;
    if (!Number.isFinite(tb)) return 1;
    return ta === tb ? 0 : ta > tb ? 1 : -1;
  }

  function valuesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function sleep(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, n));
  }

  function isDefinitiveRemoteSetupError(err) {
    const message = String(err?.message || err || '');
    return (
      message.includes('Supabase RPC failed (404)') ||
      message.includes('Could not find the function') ||
      message.includes('missing Supabase URL or anon key')
    );
  }

  function readStorage() {
    try {
      const raw = global.localStorage?.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (_) {
      return {};
    }
  }

  function writeStorage(value) {
    try {
      global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value || {}));
    } catch (_) {}
  }

  function opKey(op) {
    return `${op.surface}:${op.entityKey}:${op.field}`;
  }

  function createSyncLabQueue({ applyLocal, flushOp, onChange }) {
    const states = new Map();
    const timers = new Map();

    function stateFor(key) {
      let state = states.get(key);
      if (!state) {
        state = {
          pendingOp: null,
          inFlightOp: null,
          lastAppliedServerUpdatedAt: null,
          lastLocalValue: undefined,
          hasLocalValue: false,
        };
        states.set(key, state);
      }
      return state;
    }

    function persistPending() {
      const out = {};
      states.forEach((state, key) => {
        if (state.pendingOp) out[key] = state.pendingOp;
        else if (state.inFlightOp) out[key] = state.inFlightOp;
      });
      writeStorage(out);
    }

    function schedule(key) {
      if (timers.has(key)) clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void flushKey(key);
        }, FLUSH_DELAY_MS),
      );
    }

    async function flushKey(key) {
      const state = stateFor(key);
      if (state.inFlightOp || !state.pendingOp) return false;
      const op = state.pendingOp;
      state.pendingOp = null;
      state.inFlightOp = op;
      persistPending();
      onChange?.();
      try {
        await sleep(Number(els.latencyInput?.value || 0));
        const result = await flushOp({ ...op });
        const updatedAt = result?.updated_at || result?.updatedAt || null;
        if (updatedAt) {
          if (
            !state.lastAppliedServerUpdatedAt ||
            compareUpdatedAt(updatedAt, state.lastAppliedServerUpdatedAt) > 0
          ) {
            state.lastAppliedServerUpdatedAt = String(updatedAt);
          }
        }
        logEvent('ack', { key, value: op.value, updated_at: updatedAt });
      } catch (err) {
        const definitive = isDefinitiveRemoteSetupError(err);
        if (!definitive && !state.pendingOp) state.pendingOp = op;
        logEvent(definitive ? 'flush stopped' : 'flush failed', {
          key,
          message: err?.message || String(err),
        });
      } finally {
        state.inFlightOp = null;
        persistPending();
        onChange?.();
        if (state.pendingOp) schedule(key);
      }
      return true;
    }

    function enqueue(op) {
      const key = opKey(op);
      const state = stateFor(key);
      const next = {
        ...op,
        key,
        clientSeq: Date.now(),
        createdAt: Date.now(),
      };
      applyLocal(next);
      state.pendingOp = next;
      state.lastLocalValue = next.value;
      state.hasLocalValue = true;
      persistPending();
      schedule(key);
      onChange?.();
      return true;
    }

    function hasLocalIntent(opLike) {
      const state = states.get(opKey(opLike));
      return !!(state && (state.pendingOp || state.inFlightOp));
    }

    function shouldSkipPatch(opLike, payload) {
      const key = opKey(opLike);
      const state = states.get(key);
      if (state && (state.pendingOp || state.inFlightOp)) return true;
      if (!state) return false;
      const updatedAt = payload?.updated_at || payload?.updatedAt || null;
      if (
        updatedAt &&
        state.lastAppliedServerUpdatedAt &&
        compareUpdatedAt(updatedAt, state.lastAppliedServerUpdatedAt) <= 0
      ) {
        return true;
      }
      if (
        payload &&
        Object.prototype.hasOwnProperty.call(payload, 'value') &&
        state.hasLocalValue &&
        valuesEqual(payload.value, state.lastLocalValue)
      ) {
        return true;
      }
      return false;
    }

    function recordPatch(opLike, payload) {
      const state = stateFor(opKey(opLike));
      const updatedAt = payload?.updated_at || payload?.updatedAt || null;
      if (
        updatedAt &&
        (!state.lastAppliedServerUpdatedAt ||
          compareUpdatedAt(updatedAt, state.lastAppliedServerUpdatedAt) > 0)
      ) {
        state.lastAppliedServerUpdatedAt = String(updatedAt);
      }
      if (payload && Object.prototype.hasOwnProperty.call(payload, 'value')) {
        state.lastLocalValue = payload.value;
        state.hasLocalValue = true;
      }
      onChange?.();
    }

    function drainDurable() {
      const stored = readStorage();
      Object.keys(stored).forEach((key) => {
        const op = stored[key];
        if (!op || typeof op !== 'object') return;
        const state = stateFor(key);
        state.pendingOp = { ...op };
        state.lastLocalValue = op.value;
        state.hasLocalValue = true;
        applyLocal(op);
        schedule(key);
      });
      onChange?.();
    }

    function flushAll() {
      Array.from(states.keys()).forEach((key) => {
        if (timers.has(key)) {
          clearTimeout(timers.get(key));
          timers.delete(key);
        }
        void flushKey(key);
      });
    }

    function reset() {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      states.clear();
      writeStorage({});
      onChange?.();
    }

    function snapshot() {
      const out = {};
      states.forEach((state, key) => {
        out[key] = {
          pending: state.pendingOp ? state.pendingOp.value : null,
          inFlight: state.inFlightOp ? state.inFlightOp.value : null,
          lastAppliedServerUpdatedAt: state.lastAppliedServerUpdatedAt,
          lastLocalValue: state.hasLocalValue ? state.lastLocalValue : null,
        };
      });
      return out;
    }

    return {
      enqueue,
      shouldSkipPatch,
      recordPatch,
      hasLocalIntent,
      drainDurable,
      flushAll,
      reset,
      snapshot,
    };
  }

  const queue = createSyncLabQueue({
    applyLocal: applyLocalOp,
    flushOp: sendOp,
    onChange: scheduleRender,
  });

  function logEvent(label, detail) {
    if (!els.log) return;
    const li = document.createElement('li');
    const stamp = new Date().toLocaleTimeString();
    li.textContent = `${stamp} ${label}${
      detail == null ? '' : ` ${JSON.stringify(detail)}`
    }`;
    els.log.prepend(li);
    while (els.log.children.length > 80) {
      els.log.removeChild(els.log.lastChild);
    }
  }

  function applyLocalOp(op) {
    if (op.entityKey === 'stepper') {
      localState.stepper.value = Math.max(0, Number(op.value || 0));
      localState.stepper.updated_at = localState.stepper.updated_at || null;
    } else if (op.entityKey === 'checkbox') {
      localState.checkbox.checked = !!op.value;
      localState.checkbox.updated_at = localState.checkbox.updated_at || null;
    }
    scheduleRender();
  }

  async function sendOp(op) {
    if (!global.dataService) throw new Error('dataService unavailable');
    if (op.entityKey === 'stepper') {
      return global.dataService.setSyncLabStepperValue({ value: op.value });
    }
    if (op.entityKey === 'checkbox') {
      return global.dataService.setSyncLabCheckboxChecked({ checked: !!op.value });
    }
    return null;
  }

  function normalizeSnapshot(raw) {
    const controls = raw?.controls && typeof raw.controls === 'object'
      ? raw.controls
      : {};
    const stepper = controls.stepper || {};
    const checkbox = controls.checkbox || {};
    return {
      document: raw?.document || null,
      controls: {
        stepper: {
          value: Number.isFinite(Number(stepper.value))
            ? Math.max(0, Number(stepper.value))
            : 0,
          updated_at: stepper.updated_at || stepper.updatedAt || null,
        },
        checkbox: {
          checked: !!checkbox.checked,
          updated_at: checkbox.updated_at || checkbox.updatedAt || null,
        },
      },
    };
  }

  function applyProtectedSnapshot(raw, sourceLabel) {
    const snapshot = normalizeSnapshot(raw);
    serverSnapshot = snapshot;

    const stepperPayload = {
      value: snapshot.controls.stepper.value,
      updated_at: snapshot.controls.stepper.updated_at,
    };
    if (queue.shouldSkipPatch(CONTROL_KEYS.stepper, stepperPayload)) {
      logEvent(`${sourceLabel} skipped stepper`, stepperPayload);
    } else {
      localState.stepper = { ...stepperPayload };
      queue.recordPatch(CONTROL_KEYS.stepper, stepperPayload);
      logEvent(`${sourceLabel} applied stepper`, stepperPayload);
    }

    const checkboxPayload = {
      value: snapshot.controls.checkbox.checked,
      checked: snapshot.controls.checkbox.checked,
      updated_at: snapshot.controls.checkbox.updated_at,
    };
    if (queue.shouldSkipPatch(CONTROL_KEYS.checkbox, checkboxPayload)) {
      logEvent(`${sourceLabel} skipped checkbox`, checkboxPayload);
    } else {
      localState.checkbox = {
        checked: checkboxPayload.checked,
        updated_at: checkboxPayload.updated_at,
      };
      queue.recordPatch(CONTROL_KEYS.checkbox, checkboxPayload);
      logEvent(`${sourceLabel} applied checkbox`, checkboxPayload);
    }
    scheduleRender();
  }

  async function hydrate(sourceLabel = 'hydrate') {
    if (!global.dataService?.loadSyncLabState) {
      logEvent('hydrate failed', { message: 'loadSyncLabState unavailable' });
      return;
    }
    try {
      const state = await global.dataService.loadSyncLabState();
      applyProtectedSnapshot(state, sourceLabel);
    } catch (err) {
      logEvent('hydrate failed', { message: err?.message || String(err) });
    }
  }

  function applyRealtimePayload(payload) {
    const table = String(payload?.table || '');
    const row = payload?.new && typeof payload.new === 'object'
      ? payload.new
      : null;
    if (table === 'documents') {
      logEvent('parent event', {
        updated_at: row?.updated_at || null,
        absorbed: true,
      });
      return;
    }
    if (table !== 'controls' || !row) return;
    const key = String(row.control_key || '').trim();
    if (key !== 'stepper' && key !== 'checkbox') return;
    if (!els.realtimeToggle?.checked) {
      logEvent('child event ignored', { key });
      return;
    }
    if (key === 'stepper') {
      const patch = {
        value: Math.max(0, Number(row.numeric_value || 0)),
        updated_at: row.updated_at || null,
      };
      if (queue.shouldSkipPatch(CONTROL_KEYS.stepper, patch)) {
        logEvent('child stepper skipped', patch);
        return;
      }
      localState.stepper = { ...patch };
      queue.recordPatch(CONTROL_KEYS.stepper, patch);
      logEvent('child stepper applied', patch);
      scheduleRender();
      return;
    }
    const patch = {
      value: !!row.checked,
      checked: !!row.checked,
      updated_at: row.updated_at || null,
    };
    if (queue.shouldSkipPatch(CONTROL_KEYS.checkbox, patch)) {
      logEvent('child checkbox skipped', patch);
      return;
    }
    localState.checkbox = {
      checked: patch.checked,
      updated_at: patch.updated_at,
    };
    queue.recordPatch(CONTROL_KEYS.checkbox, patch);
    logEvent('child checkbox applied', patch);
    scheduleRender();
  }

  function enqueueStepper(nextValue) {
    const value = Math.max(0, Number(nextValue || 0));
    queue.enqueue({ ...CONTROL_KEYS.stepper, value });
  }

  function enqueueCheckbox(nextChecked) {
    queue.enqueue({ ...CONTROL_KEYS.checkbox, value: !!nextChecked });
  }

  function syncStepper() {
    if (!els.stepperRow || !global.listRowStepper) return;
    global.listRowStepper.syncRowVisuals(els.stepperRow, {
      enabled: true,
      qty: localState.stepper.value,
      isActive: activeStepperKey === 'stepper',
      selectedDatasetKey: 'syncLabSelected',
      badgeLabel: String(localState.stepper.value || 0),
      shoppingDecreaseClearsSelection: localState.stepper.value <= 1,
      shoppingDecreaseLabel: 'Decrease sync lab stepper',
      shoppingRemoveLabel: 'Clear sync lab stepper',
    });
  }

  function syncCheckbox() {
    if (!els.checkboxBtn) return;
    const checked = !!localState.checkbox.checked;
    els.checkboxBtn.setAttribute('aria-pressed', checked ? 'true' : 'false');
    const icon = els.checkboxBtn.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = checked ? 'check_box' : 'check_box_outline_blank';
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function render() {
    syncStepper();
    syncCheckbox();
    if (els.localState) {
      els.localState.textContent = JSON.stringify(localState, null, 2);
    }
    if (els.queueState) {
      els.queueState.textContent = JSON.stringify(queue.snapshot(), null, 2);
    }
    if (els.serverState) {
      els.serverState.textContent = JSON.stringify(serverSnapshot, null, 2);
    }
  }

  function wireStepper() {
    if (!global.listRowStepper || !els.stepperRow) return;
    const dom = global.listRowStepper.createStepperDOM({
      decreaseLabel: 'Decrease sync lab stepper',
      increaseLabel: 'Increase sync lab stepper',
    });
    const slot = els.stepperRow.querySelector('.sync-lab-control-slot');
    const badge = els.stepperRow.querySelector('.shopping-list-row-badge');
    if (slot instanceof HTMLElement && badge) {
      slot.insertBefore(dom.stepper, badge);
    }
    dom.plusBtn.addEventListener('click', () => {
      activeStepperKey = 'stepper';
      enqueueStepper(global.listRowStepper.getNextStepQty(localState.stepper.value, 1));
    });
    dom.minusBtn.addEventListener('click', () => {
      const next = global.listRowStepper.getNextStepQty(localState.stepper.value, -1);
      if (next <= 0) activeStepperKey = '';
      enqueueStepper(next);
    });
    els.stepperRow.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.shopping-list-row-stepper')) {
        return;
      }
      if (localState.stepper.value <= 0) {
        activeStepperKey = 'stepper';
        enqueueStepper(global.listRowStepper.getNextStepQty(localState.stepper.value, 1));
        return;
      }
      activeStepperKey = 'stepper';
      scheduleRender();
    });
  }

  function wireControls() {
    els.checkboxBtn?.addEventListener('click', () => {
      enqueueCheckbox(!localState.checkbox.checked);
    });
    els.resetBtn?.addEventListener('click', async () => {
      queue.reset();
      activeStepperKey = '';
      try {
        const state = await global.dataService.resetSyncLabState();
        applyProtectedSnapshot(state, 'reset');
      } catch (err) {
        logEvent('reset failed', { message: err?.message || String(err) });
      }
    });
    els.plus30Btn?.addEventListener('click', () => {
      for (let i = 0; i < 30; i += 1) {
        enqueueStepper(localState.stepper.value + 1);
      }
    });
    els.churnBtn?.addEventListener('click', () => {
      for (let i = 0; i < 3; i += 1) enqueueStepper(localState.stepper.value + 1);
      for (let i = 0; i < 3; i += 1) {
        enqueueStepper(global.listRowStepper.getNextStepQty(localState.stepper.value, -1));
      }
      if (localState.stepper.value <= 0) activeStepperKey = '';
    });
    els.checkbox30Btn?.addEventListener('click', () => {
      for (let i = 0; i < 30; i += 1) {
        enqueueCheckbox(!localState.checkbox.checked);
      }
    });
    els.injectStaleBtn?.addEventListener('click', () => {
      const staleValue = localState.stepper.value <= 0
        ? 2
        : Math.max(0, localState.stepper.value - 1);
      const staleChecked = !localState.checkbox.checked;
      applyProtectedSnapshot(
        {
          document: { slug: 'synthetic-stale' },
          controls: {
            stepper: {
              value: staleValue,
              updated_at: '2000-01-01T00:00:00.000Z',
            },
            checkbox: {
              checked: staleChecked,
              updated_at: '2000-01-01T00:00:00.000Z',
            },
          },
        },
        'synthetic stale',
      );
    });
  }

  function cacheElements() {
    els.stepperRow = document.getElementById('syncLabStepperRow');
    els.checkboxBtn = document.getElementById('syncLabCheckboxBtn');
    els.resetBtn = document.getElementById('syncLabResetBtn');
    els.plus30Btn = document.getElementById('syncLabStepperPlus30Btn');
    els.churnBtn = document.getElementById('syncLabStepperChurnBtn');
    els.checkbox30Btn = document.getElementById('syncLabCheckbox30Btn');
    els.injectStaleBtn = document.getElementById('syncLabInjectStaleBtn');
    els.realtimeToggle = document.getElementById('syncLabRealtimeToggle');
    els.latencyInput = document.getElementById('syncLabLatencyInput');
    els.localState = document.getElementById('syncLabLocalState');
    els.queueState = document.getElementById('syncLabQueueState');
    els.serverState = document.getElementById('syncLabServerState');
    els.log = document.getElementById('syncLabLog');
  }

  async function init() {
    cacheElements();
    wireStepper();
    wireControls();
    await hydrate('boot');
    queue.drainDurable();
    if (global.dataService?.subscribeSyncLabChanges) {
      unsubscribeRealtime = global.dataService.subscribeSyncLabChanges({
        onChange: applyRealtimePayload,
      });
      logEvent('realtime subscribed');
    }
    global.addEventListener('pagehide', () => {
      queue.flushAll();
      if (typeof unsubscribeRealtime === 'function') unsubscribeRealtime();
    });
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init(), { once: true });
  } else {
    void init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
