(function syncLabPage(global) {
  if (!global || typeof document === 'undefined') return;

  const STORAGE_KEY = 'favoriteEats:syncLab:pending:v1';
  const FLUSH_DELAY_MS = 140;
  const LIFECYCLE_RELOAD_HOLD_MS = 3000;
  const MAX_FLUSH_ATTEMPTS = 3;
  const CONTROL_KEYS = {
    stepper: { surface: 'syncLab', entityKey: 'stepper', field: 'value' },
    stepper2: { surface: 'syncLab', entityKey: 'stepper2', field: 'value' },
    checkbox: { surface: 'syncLab', entityKey: 'checkbox', field: 'checked' },
    checkbox2: { surface: 'syncLab', entityKey: 'checkbox2', field: 'checked' },
  };
  const STEPPER_KEYS = ['stepper', 'stepper2'];
  const CHECKBOX_KEYS = ['checkbox', 'checkbox2'];
  const CONTROL_ORDER = [...STEPPER_KEYS, ...CHECKBOX_KEYS];

  const els = {};
  const localState = {
    stepper: { value: 0, updated_at: null },
    stepper2: { value: 0, updated_at: null },
    checkbox: { checked: false, updated_at: null },
    checkbox2: { checked: false, updated_at: null },
  };
  let serverSnapshot = null;
  let activeStepperKey = '';
  let unsubscribeRealtime = null;
  let renderQueued = false;
  let autoStaleChildProbeArmed = createAutoStaleChildProbeArms();
  let peerConflictReplayProbeArmed = createPeerConflictReplayProbeArms();
  let hostileWholesaleProbeArmed = createHostileWholesaleProbeArms();
  let missingRowWholesaleProbeArmed = createMissingRowWholesaleProbeArms();
  let recoveryProbeArmed = createRecoveryProbeArms();
  let lifecycleReloadHoldArmed = createLifecycleReloadHoldArms();
  let lastDurableMirrorSignature = '';

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

  function classifyFlushError(err) {
    const message = String(err?.message || err || '');
    if (
      message.includes('Supabase RPC failed (404)') ||
      message.includes('Could not find the function') ||
      message.includes('missing Supabase URL or anon key')
    ) {
      return { kind: 'setup', retryable: false, message };
    }
    if (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Load failed') ||
      message.includes('timeout')
    ) {
      return { kind: 'network', retryable: true, message };
    }
    return { kind: 'rpc', retryable: true, message };
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

  function countStoredPending(value) {
    return Object.keys(value || {}).length;
  }

  function opKey(op) {
    return `${op.surface}:${op.entityKey}:${op.field}`;
  }

  function siblingControlKey(key) {
    if (key === opKey(CONTROL_KEYS.stepper)) return opKey(CONTROL_KEYS.stepper2);
    if (key === opKey(CONTROL_KEYS.stepper2)) return opKey(CONTROL_KEYS.stepper);
    if (key === opKey(CONTROL_KEYS.checkbox)) return opKey(CONTROL_KEYS.checkbox2);
    if (key === opKey(CONTROL_KEYS.checkbox2)) return opKey(CONTROL_KEYS.checkbox);
    return '';
  }

  function isStepperKey(key) {
    return STEPPER_KEYS.includes(String(key || ''));
  }

  function isCheckboxKey(key) {
    return CHECKBOX_KEYS.includes(String(key || ''));
  }

  function isControlKey(key) {
    return isStepperKey(key) || isCheckboxKey(key);
  }

  function controlKeyForOp(op) {
    return String(op?.entityKey || '');
  }

  function createAutoStaleChildProbeArms() {
    return CONTROL_ORDER.reduce((out, key) => {
      out[key] = { pending: true, inFlight: true };
      return out;
    }, {});
  }

  function createPeerConflictReplayProbeArms() {
    return CONTROL_ORDER.reduce((out, key) => {
      out[key] = true;
      return out;
    }, {});
  }

  function createHostileWholesaleProbeArms() {
    return {
      pending: true,
      inFlight: true,
    };
  }

  function createMissingRowWholesaleProbeArms() {
    return CONTROL_ORDER.reduce((out, key) => {
      out[key] = true;
      return out;
    }, {});
  }

  function createRecoveryProbeArms() {
    return CONTROL_ORDER.reduce((out, key) => {
      out[key] = true;
      return out;
    }, {});
  }

  function createLifecycleReloadHoldArms() {
    return CONTROL_ORDER.reduce((out, key) => {
      out[key] = true;
      return out;
    }, {});
  }

  function createSyncLabQueue({ applyLocal, flushOp, onChange, onLocalIntentProbe, onAckProbe }) {
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

    function intentSnapshotForKey(key) {
      const state = states.get(key);
      return {
        pending: !!state?.pendingOp,
        inFlight: !!state?.inFlightOp,
      };
    }

    function logPerKeyIsolation(phase, key) {
      const siblingKey = siblingControlKey(key);
      if (!siblingKey) return;
      const current = intentSnapshotForKey(key);
      const sibling = intentSnapshotForKey(siblingKey);
      if (!current.pending && !current.inFlight && !sibling.pending && !sibling.inFlight) {
        return;
      }
      logEvent('multi-control per-key isolation', {
        phase,
        key,
        currentPending: current.pending,
        currentInFlight: current.inFlight,
        siblingKey,
        siblingPending: sibling.pending,
        siblingInFlight: sibling.inFlight,
        globalGate: false,
      });
    }

    function persistPending() {
      const out = {};
      states.forEach((state, key) => {
        if (state.pendingOp) out[key] = state.pendingOp;
        else if (state.inFlightOp) out[key] = state.inFlightOp;
      });
      writeStorage(out);
      const signature = JSON.stringify(out);
      if (countStoredPending(out) > 0 && signature !== lastDurableMirrorSignature) {
        lastDurableMirrorSignature = signature;
        logEvent('durable pending mirrored', {
          count: countStoredPending(out),
          keys: Object.keys(out),
        });
      } else if (countStoredPending(out) === 0) {
        lastDurableMirrorSignature = '';
      }
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
      let acknowledgedUpdatedAt = null;
      persistPending();
      onChange?.();
      logPerKeyIsolation('flush start', key);
      onLocalIntentProbe?.('inFlight', op);
      try {
        await maybeHoldForLifecycleReload(op);
        await sleep(Number(els.latencyInput?.value || 0));
        const result = await flushOp({ ...op });
        const updatedAt = result?.updated_at || result?.updatedAt || null;
        acknowledgedUpdatedAt = updatedAt ? String(updatedAt) : null;
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
        const classification = classifyFlushError(err);
        const attempts = Number(op.attempts || 1);
        const exhausted = classification.retryable && attempts >= MAX_FLUSH_ATTEMPTS;
        if (classification.retryable && !exhausted && !state.pendingOp) {
          state.pendingOp = {
            ...op,
            attempts: attempts + 1,
          };
        }
        logEvent(
          !classification.retryable || exhausted ? 'flush stopped' : 'flush failed',
          {
            key,
            classification: classification.kind,
            retryable: classification.retryable,
            attempts,
            maxAttempts: MAX_FLUSH_ATTEMPTS,
            exhausted,
            message: classification.message,
          },
        );
        logEvent('failure classified', {
          key,
          classification: classification.kind,
          retryable: classification.retryable,
          willRetry: classification.retryable && !exhausted,
          stopped: !classification.retryable || exhausted,
        });
      } finally {
        state.inFlightOp = null;
        persistPending();
        onChange?.();
        if (acknowledgedUpdatedAt) onAckProbe?.(op, acknowledgedUpdatedAt);
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
        attempts: Number(op.attempts || 1),
      };
      applyLocal(next);
      state.pendingOp = next;
      state.lastLocalValue = next.value;
      state.hasLocalValue = true;
      persistPending();
      logPerKeyIsolation('enqueue', key);
      onLocalIntentProbe?.('pending', next);
      schedule(key);
      onChange?.();
      return true;
    }

    function hasLocalIntent(opLike) {
      const state = states.get(opKey(opLike));
      return !!(state && (state.pendingOp || state.inFlightOp));
    }

    function hasKnownLocalRow(opLike) {
      const state = states.get(opKey(opLike));
      return !!(
        state &&
        (state.pendingOp ||
          state.inFlightOp ||
          state.hasLocalValue ||
          state.lastAppliedServerUpdatedAt)
      );
    }

    function versionSnapshot(opLike) {
      const state = states.get(opKey(opLike));
      if (!state) {
        return {
          pending: false,
          inFlight: false,
          hasLocalValue: false,
          lastAppliedServerUpdatedAt: null,
          lastLocalValue: null,
        };
      }
      return {
        pending: !!state.pendingOp,
        inFlight: !!state.inFlightOp,
        hasLocalValue: !!state.hasLocalValue,
        lastAppliedServerUpdatedAt: state.lastAppliedServerUpdatedAt,
        lastLocalValue: state.hasLocalValue ? state.lastLocalValue : null,
      };
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
      const keys = Object.keys(stored);
      if (keys.length) {
        logEvent('durable replay before hydrate', {
          count: keys.length,
          keys,
        });
      }
      Object.keys(stored).forEach((key) => {
        const op = stored[key];
        if (!op || typeof op !== 'object') return;
        const state = stateFor(key);
        state.pendingOp = { ...op };
        state.lastLocalValue = op.value;
        state.hasLocalValue = true;
        applyLocal(op);
        schedule(key);
        logEvent('durable replay enqueued', {
          key,
          value: op.value,
        });
      });
      onChange?.();
    }

    function flushAll() {
      const stored = readStorage();
      logEvent('pagehide durable flush requested', {
        storedCount: countStoredPending(stored),
        keys: Object.keys(stored),
      });
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
      lastDurableMirrorSignature = '';
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
      hasKnownLocalRow,
      versionSnapshot,
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
    onLocalIntentProbe: runLocalIntentProbes,
    onAckProbe: runAckProbes,
  });

  function logFailureClassificationSelfCheck() {
    [
      new Error('Supabase RPC failed (404): missing function'),
      new Error('Failed to fetch'),
      new Error('RPC returned ok false'),
    ].forEach((err) => {
      const classification = classifyFlushError(err);
      logEvent('failure classification self-check', {
        classification: classification.kind,
        retryable: classification.retryable,
      });
    });
  }

  async function maybeHoldForLifecycleReload(op) {
    const key = controlKeyForOp(op);
    if (!isControlKey(key)) return;
    if (els.lifecycleReloadHoldToggle && !els.lifecycleReloadHoldToggle.checked) return;
    if (!lifecycleReloadHoldArmed[key]) return;
    lifecycleReloadHoldArmed[key] = false;
    logEvent('lifecycle reload window open', {
      key,
      holdMs: LIFECYCLE_RELOAD_HOLD_MS,
      instruction: 'reload now',
    });
    await sleep(LIFECYCLE_RELOAD_HOLD_MS);
  }

  function logEvent(label, detail) {
    try {
      if (global.favoriteEatsInputSyncDebugToConsole !== false) {
        global.favoriteEatsInputSyncDebugToConsole = true;
        console.info('[favorite-eats-sync-lab]', label, detail || {});
      }
    } catch (_) {}
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
    const key = controlKeyForOp(op);
    if (isStepperKey(key)) {
      localState[key].value = Math.max(0, Number(op.value || 0));
      localState[key].updated_at = localState[key].updated_at || null;
    } else if (isCheckboxKey(key)) {
      localState[key].checked = !!op.value;
      localState[key].updated_at = localState[key].updated_at || null;
    }
    scheduleRender();
  }

  async function sendOp(op) {
    if (!global.dataService) throw new Error('dataService unavailable');
    const key = controlKeyForOp(op);
    if (isStepperKey(key)) {
      return global.dataService.setSyncLabStepperValue({
        controlKey: key,
        value: op.value,
      });
    }
    if (isCheckboxKey(key)) {
      return global.dataService.setSyncLabCheckboxChecked({
        controlKey: key,
        checked: !!op.value,
      });
    }
    return null;
  }

  function normalizeSnapshot(raw) {
    const controls = raw?.controls && typeof raw.controls === 'object'
      ? raw.controls
      : {};
    const outControls = {};
    CONTROL_ORDER.forEach((key) => {
      const present = Object.prototype.hasOwnProperty.call(controls, key);
      const control = present ? controls[key] || {} : {};
      if (isStepperKey(key)) {
        outControls[key] = {
          present,
          value: Number.isFinite(Number(control.value))
            ? Math.max(0, Number(control.value))
            : 0,
          updated_at: control.updated_at || control.updatedAt || null,
        };
      } else {
        outControls[key] = {
          present,
          checked: !!control.checked,
          updated_at: control.updated_at || control.updatedAt || null,
        };
      }
    });
    return {
      document: raw?.document || null,
      controls: outControls,
    };
  }

  function applyProtectedSnapshot(raw, sourceLabel) {
    const snapshot = normalizeSnapshot(raw);
    serverSnapshot = snapshot;

    CONTROL_ORDER.forEach((key) => {
      const control = snapshot.controls[key];
      const payload = isStepperKey(key)
        ? {
            value: control.value,
            updated_at: control.updated_at,
          }
        : {
            value: control.checked,
            checked: control.checked,
            updated_at: control.updated_at,
          };
      if (!control.present && queue.hasKnownLocalRow(CONTROL_KEYS[key])) {
        const version = queue.versionSnapshot(CONTROL_KEYS[key]);
        logEvent(`${sourceLabel} skipped ${key}`, {
          omitted: true,
          preserved: true,
          value: isStepperKey(key) ? localState[key].value : localState[key].checked,
          checked: isCheckboxKey(key) ? localState[key].checked : undefined,
          displayUpdatedAt: localState[key].updated_at,
          lastAppliedServerUpdatedAt: version.lastAppliedServerUpdatedAt,
          lastLocalValue: version.lastLocalValue,
          pending: version.pending,
          inFlight: version.inFlight,
        });
      } else if (queue.shouldSkipPatch(CONTROL_KEYS[key], payload)) {
        logEvent(`${sourceLabel} skipped ${key}`, payload);
      } else if (isStepperKey(key)) {
        localState[key] = { ...payload };
        queue.recordPatch(CONTROL_KEYS[key], payload);
        logEvent(`${sourceLabel} applied ${key}`, payload);
      } else {
        localState[key] = {
          checked: payload.checked,
          updated_at: payload.updated_at,
        };
        queue.recordPatch(CONTROL_KEYS[key], payload);
        logEvent(`${sourceLabel} applied ${key}`, payload);
      }
    });
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
    if (!isControlKey(key)) return;
    if (els.realtimeToggle && !els.realtimeToggle.checked) {
      logEvent('child event ignored', { key });
      return;
    }
    if (isStepperKey(key)) {
      const patch = {
        value: Math.max(0, Number(row.numeric_value || 0)),
        updated_at: row.updated_at || null,
      };
      if (queue.shouldSkipPatch(CONTROL_KEYS[key], patch)) {
        logEvent(`child ${key} skipped`, patch);
        return;
      }
      localState[key] = { ...patch };
      queue.recordPatch(CONTROL_KEYS[key], patch);
      logEvent(`child ${key} applied`, patch);
      maybeAutoInjectPeerConflictReplay(key, patch);
      scheduleRender();
      return;
    }
    const patch = {
      value: !!row.checked,
      checked: !!row.checked,
      updated_at: row.updated_at || null,
    };
    if (queue.shouldSkipPatch(CONTROL_KEYS[key], patch)) {
      logEvent(`child ${key} skipped`, patch);
      return;
    }
    localState[key] = {
      checked: patch.checked,
      updated_at: patch.updated_at,
    };
    queue.recordPatch(CONTROL_KEYS[key], patch);
    logEvent(`child ${key} applied`, patch);
    maybeAutoInjectPeerConflictReplay(key, patch);
    scheduleRender();
  }

  function makeSyntheticStaleChildRow(key) {
    const staleUpdatedAt = '2000-01-01T00:00:00.000Z';
    if (isStepperKey(key)) {
      return {
        control_key: key,
        kind: 'stepper',
        numeric_value:
          localState[key].value <= 0
            ? 2
            : Math.max(0, localState[key].value - 1),
        checked: false,
        updated_at: staleUpdatedAt,
      };
    }
    return {
      control_key: key,
      kind: 'checkbox',
      numeric_value: 0,
      checked: !localState[key].checked,
      updated_at: staleUpdatedAt,
    };
  }

  function makeSyntheticStaleSnapshot() {
    const staleUpdatedAt = '2000-01-01T00:00:00.000Z';
    return {
      document: { slug: 'synthetic-stale' },
      controls: CONTROL_ORDER.reduce((out, key) => {
        out[key] = isStepperKey(key)
          ? {
              value:
                localState[key].value <= 0
                  ? 2
                  : Math.max(0, localState[key].value - 1),
              updated_at: staleUpdatedAt,
            }
          : {
              checked: !localState[key].checked,
              updated_at: staleUpdatedAt,
            };
        return out;
      }, {}),
    };
  }

  function injectSyntheticStaleChild(key, phase) {
    if (!isControlKey(key)) return;
    logEvent('auto stale child probe', {
      key,
      phase,
      localIntent: queue.hasLocalIntent(CONTROL_KEYS[key]),
    });
    applyRealtimePayload({
      schema: 'sync_lab',
      table: 'controls',
      eventType: 'UPDATE',
      new: makeSyntheticStaleChildRow(key),
    });
  }

  function maybeAutoInjectStaleChildDuringLocalIntent(phase, op) {
    const key = controlKeyForOp(op);
    if (!isControlKey(key)) return;
    if (els.autoStaleChildToggle && !els.autoStaleChildToggle.checked) return;
    if (!autoStaleChildProbeArmed[key]?.[phase]) return;
    autoStaleChildProbeArmed[key][phase] = false;
    injectSyntheticStaleChild(key, phase);
  }

  function maybeAutoInjectHostileWholesaleDuringLocalIntent(phase, op) {
    const key = controlKeyForOp(op);
    if (!isControlKey(key)) return;
    if (els.hostileWholesaleToggle && !els.hostileWholesaleToggle.checked) return;
    if (!hostileWholesaleProbeArmed[phase]) return;
    hostileWholesaleProbeArmed[phase] = false;
    logEvent('auto hostile wholesale probe', {
      key,
      phase,
      localIntent: queue.hasLocalIntent(CONTROL_KEYS[key]),
    });
    applyProtectedSnapshot(makeSyntheticStaleSnapshot(), 'auto hostile wholesale');
  }

  function runLocalIntentProbes(phase, op) {
    maybeAutoInjectStaleChildDuringLocalIntent(phase, op);
    maybeAutoInjectHostileWholesaleDuringLocalIntent(phase, op);
  }

  function makeSyntheticOlderPeerConflictRow(key, acceptedPatch) {
    const staleUpdatedAt = '2000-01-01T00:00:00.000Z';
    if (isStepperKey(key)) {
      const acceptedValue = Math.max(0, Number(acceptedPatch?.value || 0));
      return {
        control_key: key,
        kind: 'stepper',
        numeric_value: acceptedValue <= 0 ? 2 : Math.max(0, acceptedValue - 1),
        checked: false,
        updated_at: staleUpdatedAt,
      };
    }
    return {
      control_key: key,
      kind: 'checkbox',
      numeric_value: 0,
      checked: !acceptedPatch?.checked,
      updated_at: staleUpdatedAt,
    };
  }

  function maybeAutoInjectPeerConflictReplay(key, acceptedPatch) {
    if (!isControlKey(key)) return;
    if (els.peerConflictReplayToggle && !els.peerConflictReplayToggle.checked) return;
    if (!peerConflictReplayProbeArmed[key]) return;
    peerConflictReplayProbeArmed[key] = false;
    logEvent('peer conflict stale replay probe', {
      key,
      acceptedValue: acceptedPatch?.value,
      acceptedUpdatedAt: acceptedPatch?.updated_at || null,
      staleUpdatedAt: '2000-01-01T00:00:00.000Z',
    });
    applyRealtimePayload({
      schema: 'sync_lab',
      table: 'controls',
      eventType: 'UPDATE',
      new: makeSyntheticOlderPeerConflictRow(key, acceptedPatch),
    });
  }

  function makeSyntheticMissingRowSnapshot(omittedKey) {
    const controls = {};
    CONTROL_ORDER.forEach((key) => {
      if (omittedKey === key) return;
      controls[key] = isStepperKey(key)
        ? {
            value: localState[key].value,
            updated_at: localState[key].updated_at,
          }
        : {
            checked: localState[key].checked,
            updated_at: localState[key].updated_at,
          };
    });
    return {
      document: { slug: 'synthetic-missing-row' },
      controls,
    };
  }

  function maybeAutoInjectMissingRowWholesaleAfterAck(op, acknowledgedUpdatedAt) {
    const key = controlKeyForOp(op);
    if (!isControlKey(key)) return;
    if (els.missingRowWholesaleToggle && !els.missingRowWholesaleToggle.checked) return;
    if (!missingRowWholesaleProbeArmed[key]) return;
    missingRowWholesaleProbeArmed[key] = false;
    logEvent('missing-row wholesale probe', {
      key,
      omitted: key,
      acknowledgedUpdatedAt,
    });
    applyProtectedSnapshot(
      makeSyntheticMissingRowSnapshot(key),
      'missing-row wholesale',
    );
  }

  function maybeAutoRunExplicitRecoveryAfterRealtimeGap(op, acknowledgedUpdatedAt) {
    const key = controlKeyForOp(op);
    if (!isControlKey(key)) return;
    if (els.recoveryProbeToggle && !els.recoveryProbeToggle.checked) return;
    if (!recoveryProbeArmed[key]) return;
    recoveryProbeArmed[key] = false;
    logEvent('realtime gap recovery probe', {
      key,
      simulatedMissedChildRealtime: true,
      acknowledgedUpdatedAt,
      recovery: 'explicit protected hydrate',
    });
    void hydrate('explicit recovery');
  }

  function runAckProbes(op, acknowledgedUpdatedAt) {
    maybeAutoInjectMissingRowWholesaleAfterAck(op, acknowledgedUpdatedAt);
    maybeAutoRunExplicitRecoveryAfterRealtimeGap(op, acknowledgedUpdatedAt);
  }

  function enqueueStepper(key, nextValue) {
    const value = Math.max(0, Number(nextValue || 0));
    queue.enqueue({ ...CONTROL_KEYS[key], value });
  }

  function enqueueCheckbox(key, nextChecked) {
    queue.enqueue({ ...CONTROL_KEYS[key], value: !!nextChecked });
  }

  function syncStepper(key) {
    const row = els[`${key}Row`];
    if (!row || !global.listRowStepper) return;
    global.listRowStepper.syncRowVisuals(row, {
      enabled: true,
      qty: localState[key].value,
      isActive: activeStepperKey === key,
      selectedDatasetKey: 'syncLabSelected',
      badgeLabel: String(localState[key].value || 0),
      shoppingDecreaseClearsSelection: localState[key].value <= 1,
      shoppingDecreaseLabel: `Decrease sync lab ${key}`,
      shoppingRemoveLabel: `Clear sync lab ${key}`,
    });
  }

  function syncCheckbox(key) {
    const button = els[`${key}Btn`];
    if (!button) return;
    const checked = !!localState[key].checked;
    button.setAttribute('aria-pressed', checked ? 'true' : 'false');
    const icon = button.querySelector('.material-symbols-outlined');
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
    STEPPER_KEYS.forEach(syncStepper);
    CHECKBOX_KEYS.forEach(syncCheckbox);
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

  function wireStepper(key) {
    const row = els[`${key}Row`];
    if (!global.listRowStepper || !row) return;
    const dom = global.listRowStepper.createStepperDOM({
      decreaseLabel: `Decrease sync lab ${key}`,
      increaseLabel: `Increase sync lab ${key}`,
    });
    const slot = row.querySelector('.sync-lab-control-slot');
    const badge = row.querySelector('.shopping-list-row-badge');
    if (slot instanceof HTMLElement && badge) {
      slot.insertBefore(dom.stepper, badge);
    }
    dom.plusBtn.addEventListener('click', () => {
      activeStepperKey = key;
      enqueueStepper(key, global.listRowStepper.getNextStepQty(localState[key].value, 1));
    });
    dom.minusBtn.addEventListener('click', () => {
      const next = global.listRowStepper.getNextStepQty(localState[key].value, -1);
      if (next <= 0) activeStepperKey = '';
      enqueueStepper(key, next);
    });
    row.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.shopping-list-row-stepper')) {
        return;
      }
      if (localState[key].value <= 0) {
        activeStepperKey = key;
        enqueueStepper(key, global.listRowStepper.getNextStepQty(localState[key].value, 1));
        return;
      }
      activeStepperKey = key;
      scheduleRender();
    });
  }

  function wireControls() {
    CHECKBOX_KEYS.forEach((key) => {
      els[`${key}Btn`]?.addEventListener('click', () => {
        enqueueCheckbox(key, !localState[key].checked);
      });
    });
    els.resetBtn?.addEventListener('click', async () => {
      queue.reset();
      autoStaleChildProbeArmed = createAutoStaleChildProbeArms();
      peerConflictReplayProbeArmed = createPeerConflictReplayProbeArms();
      hostileWholesaleProbeArmed = createHostileWholesaleProbeArms();
      missingRowWholesaleProbeArmed = createMissingRowWholesaleProbeArms();
      recoveryProbeArmed = createRecoveryProbeArms();
      lifecycleReloadHoldArmed = createLifecycleReloadHoldArms();
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
        enqueueStepper('stepper', localState.stepper.value + 1);
      }
    });
    els.churnBtn?.addEventListener('click', () => {
      for (let i = 0; i < 3; i += 1) enqueueStepper('stepper', localState.stepper.value + 1);
      for (let i = 0; i < 3; i += 1) {
        enqueueStepper(
          'stepper',
          global.listRowStepper.getNextStepQty(localState.stepper.value, -1),
        );
      }
      if (localState.stepper.value <= 0) activeStepperKey = '';
    });
    els.checkbox30Btn?.addEventListener('click', () => {
      for (let i = 0; i < 30; i += 1) {
        enqueueCheckbox('checkbox', !localState.checkbox.checked);
      }
    });
    els.injectStaleBtn?.addEventListener('click', () => {
      applyProtectedSnapshot(makeSyntheticStaleSnapshot(), 'synthetic stale');
    });
    els.injectStaleChildBtn?.addEventListener('click', () => {
      CONTROL_ORDER.forEach((key) => {
        applyRealtimePayload({
          schema: 'sync_lab',
          table: 'controls',
          eventType: 'UPDATE',
          new: makeSyntheticStaleChildRow(key),
        });
      });
    });
  }

  function cacheElements() {
    els.stepperRow = document.getElementById('syncLabStepperRow');
    els.stepper2Row = document.getElementById('syncLabStepper2Row');
    els.checkboxBtn = document.getElementById('syncLabCheckboxBtn');
    els.checkbox2Btn = document.getElementById('syncLabCheckbox2Btn');
    els.resetBtn = document.getElementById('syncLabResetBtn');
    els.plus30Btn = document.getElementById('syncLabStepperPlus30Btn');
    els.churnBtn = document.getElementById('syncLabStepperChurnBtn');
    els.checkbox30Btn = document.getElementById('syncLabCheckbox30Btn');
    els.injectStaleBtn = document.getElementById('syncLabInjectStaleBtn');
    els.injectStaleChildBtn = document.getElementById('syncLabInjectStaleChildBtn');
    els.realtimeToggle = document.getElementById('syncLabRealtimeToggle');
    els.autoStaleChildToggle = document.getElementById('syncLabAutoStaleChildToggle');
    els.peerConflictReplayToggle = document.getElementById('syncLabPeerConflictReplayToggle');
    els.hostileWholesaleToggle = document.getElementById('syncLabHostileWholesaleToggle');
    els.missingRowWholesaleToggle = document.getElementById('syncLabMissingRowWholesaleToggle');
    els.recoveryProbeToggle = document.getElementById('syncLabRecoveryProbeToggle');
    els.lifecycleReloadHoldToggle = document.getElementById('syncLabLifecycleReloadHoldToggle');
    els.latencyInput = document.getElementById('syncLabLatencyInput');
    els.localState = document.getElementById('syncLabLocalState');
    els.queueState = document.getElementById('syncLabQueueState');
    els.serverState = document.getElementById('syncLabServerState');
    els.log = document.getElementById('syncLabLog');
  }

  async function init() {
    cacheElements();
    STEPPER_KEYS.forEach(wireStepper);
    wireControls();
    logFailureClassificationSelfCheck();
    queue.drainDurable();
    await hydrate('boot');
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
