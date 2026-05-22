/**
 * Warm-client authoritative store for plan + shopping list (Slice 1).
 * Remote payloads apply only through applyRemote() with revision gating.
 */
(function favoriteEatsStoreModule(global) {
  if (!global) return;

  const STORAGE_KEY = 'favoriteEats:store:v1';

  /** @typedef {'seed'|'newer'|'equal'|'older'} RevisionCompareOutcome */

  let authoritative = {
    plan: null,
    listDoc: null,
    revisions: {
      planUpdatedAt: null,
      listSessionUpdatedAt: null,
    },
  };

  /** @type {Array<(snapshot: object) => void>} */
  const subscribers = [];

  /**
   * Row-keyed pending list ops (checkbox/text RPC in flight).
   * Keys match durable row ids (sourceKey or row id).
   * @type {Map<string, { kind: string, checked?: boolean, text?: string }>}
   */
  const pendingRowOps = new Map();

  function normalizePendingRowKey(rowKey) {
    const key = String(rowKey || '').trim();
    return key || null;
  }

  function rowPendingKeyFromRow(row) {
    if (!row || typeof row !== 'object') return null;
    const sourceKey = String(row.sourceKey || '').trim();
    if (sourceKey) return sourceKey;
    const id = String(row.id || '').trim();
    return id || null;
  }

  function beginPendingRowOp(rowKey, op) {
    const key = normalizePendingRowKey(rowKey);
    if (!key || !op || typeof op !== 'object') return false;
    pendingRowOps.set(key, {
      kind: String(op.kind || '').trim() || 'unknown',
      checked: Object.prototype.hasOwnProperty.call(op, 'checked')
        ? !!op.checked
        : undefined,
      text: op.text != null ? String(op.text) : undefined,
    });
    return true;
  }

  function endPendingRowOp(rowKey) {
    const key = normalizePendingRowKey(rowKey);
    if (!key) return false;
    return pendingRowOps.delete(key);
  }

  function hasPendingRowOps() {
    return pendingRowOps.size > 0;
  }

  function mergeIncomingListDocPreservingPendingOps(incomingListDoc, localListDoc) {
    if (!incomingListDoc || pendingRowOps.size === 0) {
      return incomingListDoc;
    }
    const localRows = Array.isArray(localListDoc?.rows) ? localListDoc.rows : [];
    const localByKey = new Map();
    for (let i = 0; i < localRows.length; i += 1) {
      const pendingKey = rowPendingKeyFromRow(localRows[i]);
      if (pendingKey) localByKey.set(pendingKey, localRows[i]);
    }
    const merged = cloneJson(incomingListDoc);
    const rows = Array.isArray(merged?.rows) ? merged.rows : [];
    merged.rows = rows.map((row) => {
      const pendingKey = rowPendingKeyFromRow(row);
      if (!pendingKey || !pendingRowOps.has(pendingKey)) return row;
      const op = pendingRowOps.get(pendingKey);
      const next = cloneJson(row);
      if (op.kind === 'checked') {
        next.checked = !!op.checked;
      } else if (op.kind === 'text' && op.text != null) {
        next.text = op.text;
      } else {
        const localRow = localByKey.get(pendingKey);
        if (localRow) {
          if (op.kind === 'checked') next.checked = !!localRow.checked;
          if (op.kind === 'text') next.text = String(localRow.text ?? '');
        }
      }
      return next;
    });
    return merged;
  }

  function normalizeRevisionToken(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    if (!text) return null;
    const ms = Date.parse(text);
    if (Number.isFinite(ms)) return ms;
    return text;
  }

  /**
   * Canonical revision comparison for plan/list probe pairs.
   * @returns {RevisionCompareOutcome}
   */
  function compareRevisionPair(localRevisions, remoteRevisions) {
    const local = localRevisions || {};
    const remote = remoteRevisions || {};
    const localPlan = normalizeRevisionToken(local.planUpdatedAt);
    const localList = normalizeRevisionToken(local.listSessionUpdatedAt);
    const remotePlan = normalizeRevisionToken(remote.planUpdatedAt);
    const remoteList = normalizeRevisionToken(remote.listSessionUpdatedAt);

    if (localPlan == null && localList == null) {
      return 'seed';
    }

    if (remotePlan == null && localPlan != null) return 'older';
    if (remoteList == null && localList != null) return 'older';

    const planCmp =
      localPlan == null && remotePlan != null
        ? 1
        : remotePlan == null && localPlan == null
          ? 0
          : remotePlan === localPlan
            ? 0
            : remotePlan > localPlan
              ? 1
              : -1;
    const listCmp =
      localList == null && remoteList != null
        ? 1
        : remoteList == null && localList == null
          ? 0
          : remoteList === localList
            ? 0
            : remoteList > localList
              ? 1
              : -1;

    if (planCmp < 0 || listCmp < 0) return 'older';
    if (planCmp === 0 && listCmp === 0) return 'equal';
    return 'newer';
  }

  function cloneJson(value) {
    if (value == null) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function persistSnapshot() {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          plan: authoritative.plan,
          listDoc: authoritative.listDoc,
          revisions: authoritative.revisions,
        }),
      );
    } catch (_) {}
  }

  function restoreSnapshotFromSessionStorage() {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      authoritative = {
        plan: cloneJson(parsed.plan),
        listDoc: cloneJson(parsed.listDoc),
        revisions: {
          planUpdatedAt:
            parsed.revisions && parsed.revisions.planUpdatedAt != null
              ? String(parsed.revisions.planUpdatedAt)
              : null,
          listSessionUpdatedAt:
            parsed.revisions && parsed.revisions.listSessionUpdatedAt != null
              ? String(parsed.revisions.listSessionUpdatedAt)
              : null,
        },
      };
    } catch (_) {}
  }

  function notifySubscribers() {
    const snapshot = getSnapshot();
    for (let i = 0; i < subscribers.length; i += 1) {
      try {
        subscribers[i](snapshot);
      } catch (_) {}
    }
  }

  function getSnapshot() {
    return {
      plan: cloneJson(authoritative.plan),
      listDoc: cloneJson(authoritative.listDoc),
      revisions: {
        planUpdatedAt: authoritative.revisions.planUpdatedAt,
        listSessionUpdatedAt: authoritative.revisions.listSessionUpdatedAt,
      },
    };
  }

  function hasAuthoritativeSnapshot() {
    return (
      authoritative.plan != null ||
      authoritative.listDoc != null ||
      authoritative.revisions.planUpdatedAt != null ||
      authoritative.revisions.listSessionUpdatedAt != null
    );
  }

  function revisionsMatchProbe(probeRevisions) {
    return compareRevisionPair(authoritative.revisions, probeRevisions) === 'equal';
  }

  function numGuard(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function evaluateApplyGuards(guards) {
    const g = guards && typeof guards === 'object' ? guards : {};
    if (numGuard(g.currentRowRpcInFlight) > 0) {
      return { blocked: true, reason: 'row_rpc_in_flight' };
    }
    if (numGuard(g.mutationEpochAtFetch) !== numGuard(g.currentMutationEpoch)) {
      return { blocked: true, reason: 'mutation_epoch' };
    }
    if (
      numGuard(g.applyGenerationAtFetchStart) !== numGuard(g.currentApplyGeneration)
    ) {
      return { blocked: true, reason: 'apply_generation' };
    }
    if (numGuard(g.currentPlanSaveInFlight) > 0) {
      return { blocked: true, reason: 'plan_save_in_flight' };
    }
    return { blocked: false, reason: null };
  }

  /**
   * @param {object} payload
   * @param {object} [options]
   * @returns {{ outcome: string, reason?: string, snapshot?: object }}
   */
  function applyRemote(payload, options = {}) {
    const body = payload && typeof payload === 'object' ? payload : {};
    const revisions = body.revisions || {};
    const guards = body.guards || {};
    const postWriteEcho = !!options.postWriteEcho;

    const guardResult = evaluateApplyGuards(guards);
    if (guardResult.blocked) {
      return { outcome: 'blocked', reason: guardResult.reason };
    }

    const revisionOutcome = compareRevisionPair(authoritative.revisions, revisions);
    const forceApply = !!options.force;
    if (revisionOutcome === 'older') {
      return { outcome: 'rejected_older' };
    }
    if (revisionOutcome === 'equal' && !postWriteEcho && !forceApply) {
      return { outcome: 'skipped_equal', snapshot: getSnapshot() };
    }

    if (Object.prototype.hasOwnProperty.call(body, 'plan')) {
      authoritative.plan = cloneJson(body.plan);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'listDoc')) {
      let nextListDoc = cloneJson(body.listDoc);
      if (authoritative.listDoc && pendingRowOps.size > 0) {
        nextListDoc = mergeIncomingListDocPreservingPendingOps(
          nextListDoc,
          authoritative.listDoc,
        );
      }
      authoritative.listDoc = nextListDoc;
    }
    authoritative.revisions = {
      planUpdatedAt:
        revisions.planUpdatedAt != null ? String(revisions.planUpdatedAt) : null,
      listSessionUpdatedAt:
        revisions.listSessionUpdatedAt != null
          ? String(revisions.listSessionUpdatedAt)
          : null,
    };

    persistSnapshot();
    notifySubscribers();
    return { outcome: 'applied', snapshot: getSnapshot() };
  }

  /** Keep store list doc aligned with optimistic row RPC edits (no revision bump). */
  function patchOptimisticListDoc(listDoc) {
    authoritative.listDoc = cloneJson(listDoc);
    persistSnapshot();
    notifySubscribers();
    return getSnapshot();
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.push(fn);
    return () => {
      const idx = subscribers.indexOf(fn);
      if (idx >= 0) subscribers.splice(idx, 1);
    };
  }

  restoreSnapshotFromSessionStorage();

  global.favoriteEatsStore = {
    STORAGE_KEY,
    compareRevisionPair,
    getSnapshot,
    hasAuthoritativeSnapshot,
    revisionsMatchProbe,
    applyRemote,
    patchOptimisticListDoc,
    beginPendingRowOp,
    endPendingRowOp,
    hasPendingRowOps,
    mergeIncomingListDocPreservingPendingOps,
    subscribe,
    /** Test-only reset */
    __resetForTests() {
      authoritative = {
        plan: null,
        listDoc: null,
        revisions: {
          planUpdatedAt: null,
          listSessionUpdatedAt: null,
        },
      };
      subscribers.length = 0;
      pendingRowOps.clear();
      if (typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch (_) {}
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
