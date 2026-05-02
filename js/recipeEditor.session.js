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

// Expose for main.js so back/cancel/save can share one path.
window.recipeEditorGetIsDirty = recipeEditorGetIsDirty;
window.recipeEditorResetDirty = recipeEditorResetDirty;
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

async function saveRecipeToDB() {
  const db = window.dbInstance;
  const recipe = window.recipeData;

  if (!db || !recipe) {
    throw new Error('saveRecipeToDB: missing db or recipeData');
  }

  const rid = Number(window.recipeId || recipe.id);
  if (!Number.isFinite(rid)) {
    throw new Error('saveRecipeToDB: invalid recipe id');
  }

  const normalizeRecipeTagsForStorage = (raw) => {
    const source = Array.isArray(raw)
      ? raw
      : String(raw || '')
          .split('\n')
          .map((v) => v.trim());
    const seen = new Set();
    const out = [];
    source
      .map((v) => String(v || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .forEach((tag) => {
        const next = tag.length > 48 ? tag.slice(0, 48).trim() : tag;
        if (!next) return;
        const key = next.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(next);
      });
    return out;
  };

  const persistRecipeTags = (activeDb, recipeId, tags) => {
    if (!activeDb || !Number.isFinite(Number(recipeId))) return;
    if (
      window.bridge &&
      typeof bridge.ensureRecipeTagsSchema === 'function'
    ) {
      bridge.ensureRecipeTagsSchema(activeDb);
    }

    const normalized = normalizeRecipeTagsForStorage(tags);
    activeDb.run('DELETE FROM recipe_tag_map WHERE recipe_id = ?;', [recipeId]);
    if (!normalized.length) return;

    let nextTagSort = 1;
    try {
      const maxQ = activeDb.exec(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags;'
      );
      if (maxQ.length && maxQ[0].values.length) {
        const n = Number(maxQ[0].values[0][0]);
        if (Number.isFinite(n) && n > 0) nextTagSort = n;
      }
    } catch (_) {}

    const findTagStmt = activeDb.prepare(
      `SELECT id FROM tags
       WHERE lower(trim(name)) = lower(trim(?))
       LIMIT 1;`
    );
    const insertTagStmt = activeDb.prepare(
      'INSERT INTO tags (name, sort_order) VALUES (?, ?);'
    );
    const insertMapStmt = activeDb.prepare(
      'INSERT INTO recipe_tag_map (recipe_id, tag_id, sort_order) VALUES (?, ?, ?);'
    );
    try {
      normalized.forEach((name, idx) => {
        let tagId = null;
        try {
          findTagStmt.bind([name]);
          if (findTagStmt.step()) {
            const row = findTagStmt.getAsObject();
            const v = Number(row && row.id != null ? row.id : NaN);
            if (Number.isFinite(v) && v > 0) tagId = v;
          }
        } finally {
          findTagStmt.reset();
        }
        if (tagId == null) {
          insertTagStmt.run([name, nextTagSort++]);
          const idQ = activeDb.exec('SELECT last_insert_rowid();');
          if (idQ.length && idQ[0].values.length) {
            const v = Number(idQ[0].values[0][0]);
            if (Number.isFinite(v) && v > 0) tagId = v;
          }
        }
        if (tagId != null) {
          insertMapStmt.run([recipeId, tagId, idx + 1]);
        }
      });
    } finally {
      findTagStmt.free();
      insertTagStmt.free();
      insertMapStmt.free();
    }
  };

  const normalizeRecipeUnitCodesForStorage = (raw) => {
    const source = Array.isArray(raw)
      ? raw
      : String(raw || '')
          .split('\n')
          .map((v) => v.trim());
    const seen = new Set();
    const out = [];
    source
      .map((v) => String(v || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .forEach((code) => {
        const key = code.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(code);
      });
    return out;
  };

  const collectRecipeUnitCodes = (model) => {
    const sections = Array.isArray(model?.sections) ? model.sections : [];
    const out = [];
    sections.forEach((sec) => {
      const rows = Array.isArray(sec?.ingredients) ? sec.ingredients : [];
      rows.forEach((row) => {
        if (!row || row.isPlaceholder || row.rowType === 'heading') return;
        const unit = String(row.unit || '').trim();
        if (!unit) return;
        out.push(unit);
      });
    });
    return normalizeRecipeUnitCodesForStorage(out);
  };

  const persistRecipeUnits = (activeDb, model) => {
    if (!activeDb || !model) return;
    const codes = collectRecipeUnitCodes(model);
    if (!codes.length) return;

    const unitsColsQ = activeDb.exec('PRAGMA table_info(units);');
    const unitsCols = new Set(
      Array.isArray(unitsColsQ) &&
      unitsColsQ.length &&
      Array.isArray(unitsColsQ[0].values)
        ? unitsColsQ[0].values
            .map((row) => (Array.isArray(row) ? String(row[1] || '').toLowerCase() : ''))
            .filter(Boolean)
        : []
    );
    if (!unitsCols.has('code')) return;
    const has = (col) => unitsCols.has(String(col || '').toLowerCase());

    let nextUnitSort = 1;
    if (has('sort_order')) {
      try {
        const maxQ = activeDb.exec(
          'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM units;'
        );
        if (maxQ.length && maxQ[0].values.length) {
          const n = Number(maxQ[0].values[0][0]);
          if (Number.isFinite(n) && n > 0) nextUnitSort = n;
        }
      } catch (_) {}
    }

    const findUnitStmt = activeDb.prepare(
      `SELECT code FROM units
       WHERE lower(trim(code)) = lower(trim(?))
       LIMIT 1;`
    );
    const insertCols = ['code'];
    if (has('name_singular')) insertCols.push('name_singular');
    if (has('name_plural')) insertCols.push('name_plural');
    if (has('category')) insertCols.push('category');
    if (has('sort_order')) insertCols.push('sort_order');
    if (has('is_hidden')) insertCols.push('is_hidden');
    if (has('is_removed')) insertCols.push('is_removed');
    const insertPlaceholders = insertCols.map(() => '?').join(', ');
    const insertUnitStmt = activeDb.prepare(
      `INSERT INTO units (${insertCols.join(', ')}) VALUES (${insertPlaceholders});`
    );
    try {
      codes.forEach((code) => {
        let exists = false;
        try {
          findUnitStmt.bind([code]);
          exists = findUnitStmt.step();
        } finally {
          findUnitStmt.reset();
        }
        if (exists) return;

        const vals = [code];
        if (has('name_singular')) vals.push(code);
        if (has('name_plural')) vals.push('');
        if (has('category')) vals.push('');
        if (has('sort_order')) vals.push(nextUnitSort++);
        if (has('is_hidden')) vals.push(0);
        if (has('is_removed')) vals.push(0);
        insertUnitStmt.run(vals);
      });
    } finally {
      findUnitStmt.free();
      insertUnitStmt.free();
    }
  };

  const normalizeRecipeTagsForModel = (raw) => {
    const source = Array.isArray(raw) ? raw : String(raw || '').split('\n');
    const seen = new Set();
    const out = [];
    source
      .map((v) => String(v || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .forEach((tag) => {
        const clipped = tag.length > 48 ? tag.slice(0, 48).trim() : tag;
        if (!clipped) return;
        const key = clipped.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(clipped);
      });
    return out;
  };

  // Transaction keeps steps + ingredients consistent.
  db.run('BEGIN;');
  try {
    // --- 1) Persist recipe metadata (title + servings) ---
    const title = recipe.title || '';
    recipe.tags = normalizeRecipeTagsForModel(recipe.tags);

    const servingsDefault =
      recipe.servingsDefault ??
      (recipe.servings && recipe.servings.default != null
        ? recipe.servings.default
        : null);

    const servingsMin =
      recipe.servings && recipe.servings.min != null
        ? recipe.servings.min
        : null;

    const servingsMax =
      recipe.servings && recipe.servings.max != null
        ? recipe.servings.max
        : null;

    db.run(
      'UPDATE recipes SET title = ?, servings_default = ?, servings_min = ?, servings_max = ? WHERE ID = ?;',
      [title, servingsDefault, servingsMin, servingsMax, rid]
    );
    persistRecipeTags(db, rid, recipe.tags);
    persistRecipeUnits(db, recipe);

    // --- 2) Persist steps from the canonical recipe model ---
    if (typeof window.recipeEditorPrepareRecipeForSave === 'function') {
      window.recipeEditorPrepareRecipeForSave(recipe);
    } else if (typeof window.recipeEditorReconcileRecipeStepsAndStepNodes === 'function') {
      window.recipeEditorReconcileRecipeStepsAndStepNodes(recipe);
    }

    const canonicalStepCount =
      Array.isArray(recipe.sections)
        ? recipe.sections.reduce((count, section) => {
            const sectionSteps = Array.isArray(section?.steps) ? section.steps.length : 0;
            return count + sectionSteps;
          }, 0)
        : Array.isArray(recipe.steps)
        ? recipe.steps.length
        : 0;

    if (
      canonicalStepCount > 0 &&
      (!Array.isArray(window.stepNodes) || window.stepNodes.length === 0)
    ) {
      throw new Error('saveRecipeToDB: refusing to save empty stepNodes for non-empty recipe model');
    }

    bridge.saveRecipeStepsFromStepNodes(db, rid, window.stepNodes);

    // --- 3) Persist ingredients from the live model ---
    if (
      window.bridge &&
      typeof bridge.saveRecipeIngredientsFromModel === 'function'
    ) {
      bridge.saveRecipeIngredientsFromModel(db, rid, recipe);
    }

    db.run('COMMIT;');
  } catch (err) {
    try {
      db.run('ROLLBACK;');
    } catch (_) {}
    throw err;
  }

  // Re-read from DB to return a fully refreshed object
  const refreshed = bridge.loadRecipeFromDB(db, rid);

  // Notify any UI helpers (typeahead pools, etc.) that DB-backed suggestion sources may have changed.
  try {
    window.dispatchEvent(new CustomEvent('favoriteEats:db-updated'));
  } catch (_) {}
  try {
    if (typeof window.typeaheadInvalidatePools === 'function') {
      window.typeaheadInvalidatePools();
    }
  } catch (_) {}

  return refreshed;
}
