// --- Inline edit state ---
window.editingStepId = null; // step id currently being edited (string)
window._activeStepInput = null; // live input element (if any)
window._suppressStepCommit = false; // guards blur->commit during cancel flows
window._hasPendingEdit = false; // enables Cancel as soon as typing starts

// --- Session baseline snapshot for Cancel ---
// Captures the original recipe state when a recipe is first rendered or reloaded from DB.
window.originalRecipeSnapshot = null;

function recipeEditorIsWebMode() {
  try {
    if (
      window.forceWebMode &&
      typeof window.forceWebMode.isEnabled === 'function'
    ) {
      return !!window.forceWebMode.isEnabled();
    }
  } catch (_) {}
  try {
    return document.body?.dataset?.forceWebMode === 'on';
  } catch (_) {
    return false;
  }
}

// --- Display / selection helpers shared across editor ---

function enableSave() {
  const btn =
    window._recipeEditorSaveBtn || document.getElementById('appBarSaveBtn');
  if (btn) btn.disabled = false;
}

function disableSave() {
  const btn =
    window._recipeEditorSaveBtn || document.getElementById('appBarSaveBtn');
  if (btn) btn.disabled = true;
}

// --- Shared helper: clear any selected instruction line ---
function clearSelectedStep() {
  document
    .querySelectorAll('.instruction-line.selected')
    .forEach((el) => el.classList.remove('selected'));
  // 🧠 Optional: reset global tracking
  window.activeStep = null;
}

function setActiveStep(lineEl) {
  if (!lineEl) return;

  // Logical selection only (no visual highlight here)
  window.activeStep = lineEl;
}

// --- Cancel / Dirty state tracking ---
let isDirty = false;

// App-bar buttons are injected asynchronously; capture them once available.
window._recipeEditorCancelBtn = null;
window._recipeEditorSaveBtn = null;

function wireRecipeEditorAppBarButtons() {
  window._recipeEditorCancelBtn = document.getElementById('appBarCancelBtn');
  window._recipeEditorSaveBtn = document.getElementById('appBarSaveBtn');

  if (window._recipeEditorCancelBtn) {
    // Match wireChildEditorPage: Cancel (and dirty) only when edited; web uses sync for servings.
    window._recipeEditorCancelBtn.disabled = recipeEditorIsWebMode()
      ? true
      : !isDirty;
  }
  if (window._recipeEditorSaveBtn) window._recipeEditorSaveBtn.disabled = true;
  if (
    recipeEditorIsWebMode() &&
    typeof window.recipeWebModeSyncAppBar === 'function'
  ) {
    window.recipeWebModeSyncAppBar();
  }
}

if (typeof waitForAppBarReady === 'function') {
  waitForAppBarReady().then(() => wireRecipeEditorAppBarButtons());
} else {
  wireRecipeEditorAppBarButtons();
}

function recipeEditorGetIsDirty() {
  if (recipeEditorIsWebMode()) return false;
  return !!isDirty;
}

function recipeEditorResetDirty() {
  isDirty = false;
  const c =
    window._recipeEditorCancelBtn || document.getElementById('appBarCancelBtn');
  const s =
    window._recipeEditorSaveBtn || document.getElementById('appBarSaveBtn');
  if (c) c.disabled = true;
  if (s) s.disabled = true;
}

/** Deterministic JSON-ish fingerprint (sorted keys) for dirty baseline checks. */
function stableStringifyForDirtyCompare(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringifyForDirtyCompare).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringifyForDirtyCompare(value[k])}`,
    )
    .join(',')}}`;
}

/**
 * If live recipe data matches the session baseline snapshot, clear dirty state.
 * Used after inline edits that may mark dirty on first keystroke even when the
 * committed recipe is unchanged.
 */
function recipeEditorReconcileDirtyIfMatchesSnapshot() {
  if (recipeEditorIsWebMode()) return;
  if (!recipeEditorGetIsDirty()) return;

  const snap = window.originalRecipeSnapshot;
  const cur = window.recipeData;
  if (!snap || !cur) return;

  const sid = snap.id != null ? String(snap.id) : '';
  const cid = cur.id != null ? String(cur.id) : '';
  if (sid && cid && sid !== cid) return;

  let snapClone;
  let curClone;
  try {
    snapClone = JSON.parse(JSON.stringify(snap));
    curClone = JSON.parse(JSON.stringify(cur));
  } catch (_) {
    return;
  }

  if (
    stableStringifyForDirtyCompare(snapClone) ===
    stableStringifyForDirtyCompare(curClone)
  ) {
    recipeEditorResetDirty();
  }
}

// Expose for main.js so back/cancel/save can share one path.
window.recipeEditorGetIsDirty = recipeEditorGetIsDirty;
window.recipeEditorResetDirty = recipeEditorResetDirty;
window.recipeEditorReconcileDirtyIfMatchesSnapshot =
  recipeEditorReconcileDirtyIfMatchesSnapshot;
let recipeEditorExitPromptInFlight = false;

function markDirty() {
  if (recipeEditorIsWebMode()) return;
  if (!isDirty) {
    isDirty = true;

    const c =
      window._recipeEditorCancelBtn ||
      document.getElementById('appBarCancelBtn');
    if (c) c.disabled = false;

    enableSave();
  }
}

function revertChanges() {
  // ✅ Prefer original snapshot for restore; fall back to current recipeData if missing
  const source = window.originalRecipeSnapshot || window.recipeData;
  if (!source) {
    console.warn('⚠️ revertChanges called with no snapshot or recipeData');
    return;
  }

  // Deep clone to avoid mutating the snapshot
  const restoreSource = source?.sections
    ? JSON.parse(JSON.stringify(source))
    : JSON.parse(JSON.stringify(source));

  renderRecipe(restoreSource);

  // Clean up selection and UI state

  // 🔧 Quill v1.1 — fully reset inline-edit globals
  window.editingStepId = null;
  window._activeStepInput = null;
  window._suppressStepCommit = false;
  window._hasPendingEdit = false;
  try {
    document.body.classList.remove('ingredient-editing', 'step-editing');
    document.body.classList.remove('subhead-insert-mode');
  } catch (_) {}

  if (window.getSelection) window.getSelection().removeAllRanges();
  clearSelectedStep();
  recipeEditorResetDirty();
}

async function recipeEditorAttemptExit({
  reason = 'exit',
  onClean = null,
  onDiscard = null,
  onSaveSuccess = null,
} = {}) {
  const run = async (fn) => {
    if (typeof fn === 'function') {
      await fn();
    }
  };

  if (
    window.ui &&
    typeof window.ui.isDialogOpen === 'function' &&
    window.ui.isDialogOpen()
  ) {
    return false;
  }

  const dirty = recipeEditorGetIsDirty();
  if (!dirty) {
    await run(onClean);
    return true;
  }

  if (recipeEditorExitPromptInFlight) return false;
  recipeEditorExitPromptInFlight = true;

  try {
    if (window.ui && typeof window.ui.dialogThreeChoice === 'function') {
      const message =
        reason === 'manage'
          ? 'Save changes before leaving?'
          : 'Save changes before exiting?';
      const choice = await window.ui.dialogThreeChoice({
        title: 'Unsaved changes',
        message,
        fixText: 'Cancel',
        discardText: 'Discard',
        createText: 'Save',
        discardDanger: true,
        dismissChoice: 'fix',
      });
      if (choice === 'fix') return false;

      if (choice === 'create') {
        try {
          if (typeof window.recipeEditorSave === 'function') {
            await window.recipeEditorSave();
          }
        } catch (_) {
          return false;
        }
        if (recipeEditorGetIsDirty()) return false;
        await run(onSaveSuccess);
        return true;
      }

      if (choice === 'discard') {
        recipeEditorResetDirty();
        await run(onDiscard);
        return true;
      }
      return false;
    }

    const ok =
      typeof uiConfirm === 'function'
        ? await uiConfirm({
            title: 'Discard Changes?',
            message: 'Discard unsaved changes?',
            confirmText: 'Discard',
            cancelText: 'Cancel',
            danger: true,
          })
        : window.confirm('Discard unsaved changes?');
    if (!ok) return false;
    recipeEditorResetDirty();
    await run(onDiscard);
    return true;
  } finally {
    recipeEditorExitPromptInFlight = false;
  }
}

window.recipeEditorAttemptExit = recipeEditorAttemptExit;

document.addEventListener(
  'keydown',
  (e) => {
    if (!e || e.key !== 'Escape') return;
    if (e.defaultPrevented) return;
    if (!recipeEditorGetIsDirty()) return;
    e.preventDefault();
    void recipeEditorAttemptExit({
      reason: 'esc',
      onDiscard: () => {
        if (typeof revertChanges === 'function') revertChanges();
      },
    });
  },
  true
);

window.addEventListener('beforeunload', (e) => {
  if (!recipeEditorGetIsDirty()) return;
  e.preventDefault();
  e.returnValue = '';
  return '';
});

