// --- Step recipe-link helpers ---
(function initStepRecipeLinks(global) {
  if (!global || global.StepRecipeLinks) return;

  const TOKEN_RE = /\[\[recipe:(\d+)\|([^\]]+)\]\]/g;
  const PROTECTED_TEXT_TOKEN_PREFIX = '__FE_STEP_PRETTIFY__';

  const replaceWithMap = (input, mapEntries) => {
    let out = String(input || '');
    mapEntries.forEach(([rx, repl]) => {
      out = out.replace(rx, repl);
    });
    return out;
  };

  const prettifyFractionForms = (input) => {
    // Keep larger denominators first to avoid partial replacement collisions.
    const fractionMap = [
      [/(^|[^\d/])7\s*\/\s*8(?=$|[^\d/])/g, '$1⅞'],
      [/(^|[^\d/])5\s*\/\s*8(?=$|[^\d/])/g, '$1⅝'],
      [/(^|[^\d/])3\s*\/\s*8(?=$|[^\d/])/g, '$1⅜'],
      [/(^|[^\d/])1\s*\/\s*8(?=$|[^\d/])/g, '$1⅛'],
      [/(^|[^\d/])3\s*\/\s*4(?=$|[^\d/])/g, '$1¾'],
      [/(^|[^\d/])1\s*\/\s*4(?=$|[^\d/])/g, '$1¼'],
      [/(^|[^\d/])2\s*\/\s*3(?=$|[^\d/])/g, '$1⅔'],
      [/(^|[^\d/])1\s*\/\s*3(?=$|[^\d/])/g, '$1⅓'],
      [/(^|[^\d/])1\s*\/\s*2(?=$|[^\d/])/g, '$1½'],
      [/\bthree\s+quarters\b/gi, '¾'],
      [/\b(one|a)\s+quarter\b/gi, '¼'],
      [/\btwo\s+thirds\b/gi, '⅔'],
      [/\bone\s+third\b/gi, '⅓'],
      [/\b(one|a)\s+half\b/gi, '½'],
      [/\bseven\s+eighths\b/gi, '⅞'],
      [/\bfive\s+eighths\b/gi, '⅝'],
      [/\bthree\s+eighths\b/gi, '⅜'],
      [/\bone\s+eighth\b/gi, '⅛'],
    ];

    let out = replaceWithMap(input, fractionMap);
    // Mixed numbers should render compactly: "1 1/2" -> "1½"
    out = out.replace(/(\d+)\s+([¼½¾⅓⅔⅛⅜⅝⅞])/g, '$1$2');
    return out;
  };

  const prettifyRangesAndEllipsis = (input) => {
    let out = String(input || '');
    // Numeric ranges: "10-12", "10 - 12" -> "10–12"
    out = out.replace(/(\d)\s*-\s*(\d)/g, '$1–$2');
    out = out.replace(/\.{3}/g, '…');
    return out;
  };

  const prettifyTemperatures = (input) =>
    typeof global.normalizeTemperatureTokensInText === 'function'
      ? global.normalizeTemperatureTokensInText(input)
      : String(input || '');

  const protectMeasurementPrimes = (input) => {
    const protectedChunks = [];
    const protect = (rx, text) =>
      text.replace(rx, (m) => {
        const token = `${PROTECTED_TEXT_TOKEN_PREFIX}${protectedChunks.length}__`;
        protectedChunks.push(m);
        return token;
      });

    let out = String(input || '');
    // Examples: 5'6", 12", 8'
    out = protect(/\b\d+\s*'\s*\d+\s*"/g, out);
    out = protect(/\b\d+\s*"/g, out);
    out = protect(/\b\d+\s*'/g, out);

    return { text: out, protectedChunks };
  };

  const restoreProtectedChunks = (input, protectedChunks) => {
    let out = String(input || '');
    protectedChunks.forEach((value, idx) => {
      const token = `${PROTECTED_TEXT_TOKEN_PREFIX}${idx}__`;
      out = out.split(token).join(value);
    });
    return out;
  };

  const prettifySmartQuotes = (input) => {
    const protectedState = protectMeasurementPrimes(input);
    let out = protectedState.text;

    // Apostrophes in contractions/possessives first.
    out = out.replace(/([A-Za-z0-9])'([A-Za-z0-9])/g, '$1’$2');

    // First pass for obviously paired quote marks.
    out = out.replace(/"([^"\n]+)"/g, '“$1”');
    out = out.replace(/'([^'\n]+)'/g, '‘$1’');

    // Heuristic fallbacks for unmatched opening/closing marks.
    out = out.replace(/(^|[\s([{\u2014-])"(?=\S)/g, '$1“');
    out = out.replace(/"(?=[$\s)\]}.,!?;:])/g, '”');
    out = out.replace(/(^|[\s([{\u2014-])'(?=\S)/g, '$1‘');
    out = out.replace(/'(?=[$\s)\]}.,!?;:])/g, '’');

    return restoreProtectedChunks(out, protectedState.protectedChunks);
  };

  const prettifyStepDisplayText = (rawText) => {
    let out = String(rawText || '');
    if (!out) return out;
    out = prettifyFractionForms(out);
    out = prettifyRangesAndEllipsis(out);
    out = prettifyTemperatures(out);
    out = prettifySmartQuotes(out);
    return out;
  };

  const isMentionBoundaryBefore = (ch) => {
    if (!ch) return true;
    return /\s|\(|\[|\{/.test(ch);
  };

  const isTitleBoundaryAfter = (ch) => {
    if (!ch) return true;
    return /\s|[.,;:!?()[\]{}]/.test(ch);
  };

  const toToken = (id, title) => `[[recipe:${Number(id)}|${String(title || '').trim()}]]`;

  const parseTokenSegments = (rawText) => {
    const text = String(rawText || '');
    const out = [];
    let cursor = 0;
    let match = null;
    TOKEN_RE.lastIndex = 0;
    while ((match = TOKEN_RE.exec(text))) {
      const start = match.index;
      const end = TOKEN_RE.lastIndex;
      if (start > cursor) {
        out.push({ kind: 'text', text: text.slice(cursor, start) });
      }
      const id = Number(match[1]);
      const title = String(match[2] || '').trim();
      if (Number.isFinite(id) && id > 0 && title) {
        out.push({ kind: 'recipe', id, title });
      } else {
        out.push({ kind: 'text', text: text.slice(start, end) });
      }
      cursor = end;
    }
    if (cursor < text.length) {
      out.push({ kind: 'text', text: text.slice(cursor) });
    }
    return out;
  };

  function renderReadOnly(textEl, rawText) {
    if (!textEl) return;
    const segments = parseTokenSegments(rawText);
    textEl.innerHTML = '';

    segments.forEach((seg) => {
      if (seg.kind === 'text') {
        textEl.appendChild(
          document.createTextNode(prettifyStepDisplayText(seg.text))
        );
        return;
      }
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'sub-recipe-link step-recipe-link';
      link.textContent = seg.title;
      link.dataset.linkedRecipeId = String(seg.id);
      link.addEventListener('click', (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (_) {}
        if (typeof global.openRecipe === 'function') {
          try {
            global.openRecipe(seg.id);
            return;
          } catch (_) {}
        }
      });
      textEl.appendChild(link);
    });
  }

  const toDisplayText = (rawText) =>
    prettifyStepDisplayText(
      parseTokenSegments(rawText)
        .map((seg) => (seg.kind === 'recipe' ? seg.title : seg.text))
        .join('')
    );

  const toEditText = (rawText) =>
    parseTokenSegments(rawText)
      .map((seg) => (seg.kind === 'recipe' ? `@${seg.title}` : seg.text))
      .join('');

  // `@recipe` autocomplete reads the recipe title list through the data door.
  let stepRecipeListServiceCache = null;
  let stepRecipeListInFlight = null;

  function resetStepRecipePoolServiceCache() {
    stepRecipeListServiceCache = null;
    stepRecipeListInFlight = null;
  }

  async function ensureStepRecipePoolFromDataService() {
    if (
      !global.dataService ||
      typeof global.dataService.listRecipes !== 'function' ||
      !global.dataService.useSupabase
    ) {
      return;
    }
    if (stepRecipeListServiceCache) return;
    if (!stepRecipeListInFlight) {
      stepRecipeListInFlight = (async () => {
        try {
          const rows = await global.dataService.listRecipes();
          stepRecipeListServiceCache = Array.isArray(rows) ? rows : [];
        } catch (err) {
          console.error('StepRecipeLinks: listRecipes failed:', err);
          stepRecipeListServiceCache = [];
        } finally {
          stepRecipeListInFlight = null;
        }
      })();
    }
    await stepRecipeListInFlight;
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('favoriteEats:db-updated', () => {
      resetStepRecipePoolServiceCache();
      if (
        global.dataService &&
        global.dataService.useSupabase &&
        typeof global.dataService.listRecipes === 'function'
      ) {
        void ensureStepRecipePoolFromDataService();
      }
    });
  }

  if (
    global.dataService &&
    global.dataService.useSupabase &&
    typeof global.dataService.listRecipes === 'function'
  ) {
    void ensureStepRecipePoolFromDataService();
  }

  function getRecipePool(currentRecipeId) {
    if (
      global.dataService &&
      global.dataService.useSupabase &&
      typeof global.dataService.listRecipes === 'function' &&
      Array.isArray(stepRecipeListServiceCache)
    ) {
      const rid = Number(currentRecipeId);
      const filtered = stepRecipeListServiceCache
        .map((r) => ({
          id: Number(r && r.id),
          title: String(r && r.title != null ? r.title : '')
            .trim(),
        }))
        .filter(
          (row) =>
            Number.isFinite(row.id) &&
            row.id > 0 &&
            row.title &&
            !(Number.isFinite(rid) && rid > 0 && row.id === Math.trunc(rid)),
        )
        .sort((a, b) => {
          const cmp = a.title
            .toLowerCase()
            .localeCompare(b.title.toLowerCase());
          if (cmp !== 0) return cmp;
          return a.id - b.id;
        });
      return filtered;
    }
    if (
      global.dataService &&
      global.dataService.useSupabase &&
      typeof global.dataService.listRecipes === 'function'
    ) {
      void ensureStepRecipePoolFromDataService();
      return [];
    }
    return [];
  }

  function searchRecipes(query, currentRecipeId) {
    const pool = getRecipePool(currentRecipeId);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return pool;
    const prefix = [];
    const contains = [];
    pool.forEach((row) => {
      const t = row.title.toLowerCase();
      if (t.startsWith(q)) {
        prefix.push(row);
      } else if (t.includes(q)) {
        contains.push(row);
      }
    });
    return prefix.concat(contains);
  }

  function resolveBestRecipeForQuery(query, currentRecipeId) {
    const ranked = searchRecipes(query, currentRecipeId);
    return ranked.length ? ranked[0] : null;
  }

  function findLongestTitlePrefix(restText, currentRecipeId) {
    const rest = String(restText || '');
    if (!rest) return null;
    const restLower = rest.toLowerCase();
    const pool = getRecipePool(currentRecipeId);
    let best = null;
    pool.forEach((row) => {
      const t = row.title.toLowerCase();
      if (!restLower.startsWith(t)) return;
      const boundaryChar = rest.charAt(t.length);
      if (!isTitleBoundaryAfter(boundaryChar)) return;
      if (!best || row.title.length > best.title.length) {
        best = row;
      }
    });
    return best;
  }

  function encodeFromDisplayText(displayText, opts = {}) {
    const currentRecipeId = Number(opts.currentRecipeId);
    const onAutoLink =
      opts && typeof opts.onAutoLink === 'function' ? opts.onAutoLink : null;

    const input = String(displayText || '');
    let out = '';
    let i = 0;

    while (i < input.length) {
      if (input.startsWith('[[recipe:', i)) {
        const tokenEnd = input.indexOf(']]', i + 9);
        if (tokenEnd !== -1) {
          out += input.slice(i, tokenEnd + 2);
          i = tokenEnd + 2;
          continue;
        }
      }

      const ch = input[i];
      if (ch !== '@' || !isMentionBoundaryBefore(input[i - 1])) {
        out += ch;
        i += 1;
        continue;
      }

      const rest = input.slice(i + 1);

      if (rest.startsWith('{')) {
        const endBrace = rest.indexOf('}');
        if (endBrace > 1) {
          const query = rest.slice(1, endBrace).trim();
          const hit = resolveBestRecipeForQuery(query, currentRecipeId);
          if (hit) {
            out += toToken(hit.id, hit.title);
            if (onAutoLink) onAutoLink(hit.title);
          } else {
            out += `@{${query}}`;
          }
          i += 1 + endBrace + 1;
          continue;
        }
      }

      const titlePrefixHit = findLongestTitlePrefix(rest, currentRecipeId);
      if (titlePrefixHit) {
        out += toToken(titlePrefixHit.id, titlePrefixHit.title);
        if (onAutoLink) onAutoLink(titlePrefixHit.title);
        i += 1 + titlePrefixHit.title.length;
        continue;
      }

      let j = i + 1;
      while (j < input.length && !/\s|[.,;:!?()[\]{}]/.test(input[j])) {
        j += 1;
      }
      const rawQuery = input.slice(i + 1, j).trim();
      if (!rawQuery) {
        out += '@';
        i += 1;
        continue;
      }

      const hit = resolveBestRecipeForQuery(rawQuery, currentRecipeId);
      if (hit) {
        out += toToken(hit.id, hit.title);
        if (onAutoLink) onAutoLink(hit.title);
      } else {
        out += `@${rawQuery}`;
      }
      i = j;
    }

    return out;
  }

  global.StepRecipeLinks = {
    toDisplayText,
    toEditText,
    renderReadOnly,
    searchRecipes,
    resolveBestRecipeForQuery,
    encodeFromDisplayText,
    ensureRecipePoolLoaded: ensureStepRecipePoolFromDataService,
  };
})(window);

// --- Step numbering helpers ---
function renumberSteps(containerEl) {
  const container = containerEl || document.getElementById('stepsSection');
  if (!container) return;

  const all = container.querySelectorAll('.instruction-line.numbered') || [];
  let displayIndex = 0;

  all.forEach((line) => {
    const num = line.querySelector('.step-num');
    if (!num) return;

    const type = line.dataset.stepType || 'step';

    if (type === 'heading') {
      // Headings: unnumbered and start a new numbering group.
      num.textContent = '';
      displayIndex = 0;
      return;
    }

    displayIndex += 1;
    num.textContent = `${displayIndex}.`;
  });
}

// --- Step model helpers ---
function findStepInModel(stepId) {
  const recipeModel = window.recipeData;
  if (!recipeModel || !Array.isArray(recipeModel.sections)) return null;

  const idStr = String(stepId);

  for (const sec of recipeModel.sections) {
    const stepsArr = sec.steps || [];
    const idx = stepsArr.findIndex((st) => String(st.ID ?? st.id) === idStr);
    if (idx !== -1) {
      return { section: sec, stepsArr, idx, step: stepsArr[idx] };
    }
  }

  return null;
}

// Keep the StepNode model in sync with inline text edits.
// Phase 1: this simply mirrors edits; legacy section/step model is still updated too.
function applyEditToStepNode(stepId, normalizedVal, { deleteIfEmpty } = {}) {
  const nodes = Array.isArray(window.stepNodes) ? window.stepNodes : null;
  if (!nodes) return;

  const idStr = String(stepId);
  const idx = nodes.findIndex((n) => String(n.id) === idStr);
  if (idx === -1) return;

  const shouldDelete = deleteIfEmpty !== false && normalizedVal === '';

  if (shouldDelete) {
    nodes.splice(idx, 1);
  } else {
    nodes[idx].text = normalizedVal;
  }
}

function syncStepOrderFromDOM(containerRef) {
  if (!containerRef) return;

  const recipeModel = window.recipeData;
  if (!recipeModel || !Array.isArray(recipeModel.sections)) return;

  // Optional StepNode model (Phase 1: keep it in sync with DOM order)
  const stepNodes = Array.isArray(window.stepNodes) ? window.stepNodes : null;
  const stepNodeModelRef =
    window.StepNodeModel && typeof window.StepNodeModel === 'object'
      ? window.StepNodeModel
      : null;

  const orderedStepTexts = Array.from(
    containerRef.querySelectorAll('.instruction-line.numbered .step-text')
  );

  const counters = new Map();

  orderedStepTexts.forEach((stepTextEl) => {
    const sectionId = stepTextEl.dataset.sectionId || '';
    const current = counters.get(sectionId) || 0;
    const newOrder = current + 1;
    counters.set(sectionId, newOrder);

    const stepId = stepTextEl.dataset.stepId;
    if (!stepId) return;

    const found = findStepInModel(stepId);
    if (found && found.step) {
      found.step.step_number = newOrder;
    }

    // Phase 1 — mirror reordering into the StepNode model (if present).
    if (stepNodes) {
      const idStr = String(stepId);
      const nodeIdx = stepNodes.findIndex((n) => String(n.id) === idStr);
      if (nodeIdx !== -1) {
        stepNodes[nodeIdx].order = newOrder;
      }
    }

    // Keep StepNode list in a stable, normalized order
    if (
      stepNodes &&
      stepNodeModelRef &&
      typeof stepNodeModelRef.normalizeStepNodeOrder === 'function'
    ) {
      window.stepNodes = stepNodeModelRef.normalizeStepNodeOrder(stepNodes);
    }
  });
}

function findAdjacentInstructionLine(lineEl, delta) {
  if (!lineEl || !delta) return null;

  let cursor = delta < 0 ? lineEl.previousElementSibling : lineEl.nextElementSibling;
  while (cursor) {
    if (
      cursor.classList &&
      cursor.classList.contains('instruction-line') &&
      cursor.classList.contains('numbered')
    ) {
      return cursor;
    }
    cursor = delta < 0 ? cursor.previousElementSibling : cursor.nextElementSibling;
  }

  return null;
}

function setSelectionOffsetsInStep(textEl, offsets) {
  if (!textEl) return;

  try {
    const sel = window.getSelection();
    if (!sel) return;

    const fullText = textEl.textContent || '';
    const startRaw =
      offsets && Number.isFinite(offsets.start) ? Number(offsets.start) : fullText.length;
    const endRaw =
      offsets && Number.isFinite(offsets.end) ? Number(offsets.end) : startRaw;
    const start = Math.max(0, Math.min(fullText.length, startRaw));
    const end = Math.max(start, Math.min(fullText.length, endRaw));

    let firstTextNode = null;
    let lastTextNode = null;
    let startNode = null;
    let endNode = null;
    let startOffset = 0;
    let endOffset = 0;
    let remainingStart = start;
    let remainingEnd = end;

    const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (!firstTextNode) firstTextNode = node;
      lastTextNode = node;

      const len = node.textContent.length;
      if (!startNode && remainingStart <= len) {
        startNode = node;
        startOffset = remainingStart;
      }
      if (!endNode && remainingEnd <= len) {
        endNode = node;
        endOffset = remainingEnd;
      }

      remainingStart -= len;
      remainingEnd -= len;
      node = walker.nextNode();
    }

    if (!firstTextNode) {
      firstTextNode = document.createTextNode('');
      textEl.appendChild(firstTextNode);
      lastTextNode = firstTextNode;
    }
    if (!startNode) {
      startNode = lastTextNode || firstTextNode;
      startOffset = (startNode.textContent || '').length;
    }
    if (!endNode) {
      endNode = lastTextNode || firstTextNode;
      endOffset = (endNode.textContent || '').length;
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {}
}

function moveStepLineByDelta({ lineEl, delta, selectionOffsets } = {}) {
  const dir = Number(delta);
  if (!(lineEl instanceof HTMLElement) || !Number.isFinite(dir) || !dir) return false;

  const targetLine = findAdjacentInstructionLine(lineEl, dir);
  if (!(targetLine instanceof HTMLElement)) return false;

  const parent = lineEl.parentElement;
  if (!(parent instanceof HTMLElement)) return false;

  if (dir < 0) {
    parent.insertBefore(lineEl, targetLine);
  } else {
    parent.insertBefore(lineEl, targetLine.nextSibling);
  }

  renumberSteps(parent);
  syncStepOrderFromDOM(parent);

  try {
    if (typeof markDirty === 'function') markDirty();
  } catch (_) {}

  const textEl = lineEl.querySelector('.step-text');
  if (textEl instanceof HTMLElement) {
    textEl.focus();
    setSelectionOffsetsInStep(textEl, selectionOffsets);
  }

  return true;
}

// --- Shared helpers for step editing (normalization + new step factory) ---

function isRecipeEditorEmptyStepPromptText(t) {
  try {
    if (typeof window.isRecipeEditorStepPromptDisplayText === 'function') {
      return window.isRecipeEditorStepPromptDisplayText(t);
    }
  } catch (_) {}
  const s = String(t == null ? '' : t).trim();
  return !s || s === 'Add a step.' || s === 'Use the Force.';
}

function isRecipeEditorStepRowPlaceholderLabel(s) {
  const v = String(s == null ? '' : s).trim();
  return v === 'Add a step.' || v === 'Use the Force.';
}

function ensureStepTextNotEmpty(el) {
  if (!el) return;

  // For placeholder prompts, keep the element truly empty so the CSS
  // ::before content can act like a real placeholder.
  if (el.classList && el.classList.contains('placeholder-prompt')) {
    return;
  }

  const text = (el.textContent || '').trim();
  const html = (el.innerHTML || '').trim();
  if (!text && html === '') {
    el.innerHTML = '<br>';
  }
}

function normalizeStepText(raw) {
  if (raw == null) return '';

  let newVal = String(raw);

  // Remove invisible zero-width characters so "visually blank" lines
  // cannot survive normalization.
  newVal = newVal.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // collapse internal whitespace
  newVal = newVal.replace(/\s+/g, ' ');

  // trim ends
  newVal = newVal.trim();

  if (typeof normalizeTemperatureTokensInText === 'function') {
    newVal = normalizeTemperatureTokensInText(newVal);
  }

  // Cleanup punctuation spacing
  newVal = newVal.replace(/\s+([.,!?:;])/g, '$1');
  newVal = newVal.replace(/([.,!?:;])\s+/g, '$1 ');
  newVal = newVal.trim();

  // Stray punctuation only → treat as empty
  if (/^[.,!?:;]+$/.test(newVal)) {
    return '';
  }

  return newVal;
}

let _tempStepCounter = 0;
function createSiblingStepFromExisting(sourceStep, instructions) {
  const base = sourceStep || {};
  const tempId = `tmp-step-${Date.now()}-${_tempStepCounter++}`;

  // Preserve all existing DB metadata (section id, recipe id, ordering fields, etc.)
  // but force a fresh ID so the bridge treats this as a new row.
  return {
    ...base,
    ID: null, // ensure bridge sees this as "new step", not an update
    id: tempId, // local temp id used only for DOM/model wiring
    instructions: instructions || '',
    step_number: (base.step_number ?? 0) + 1,
  };
}

async function confirmDeleteStep(stepLike, fallbackText, isHeadingLine) {
  const truncateForDeleteModal = (value, maxLen = 80) => {
    const text = String(value == null ? '' : value).trim();
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return `${text.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
  };

  const modelText =
    stepLike && stepLike.instructions != null
      ? String(stepLike.instructions)
      : String(fallbackText || '');
  const cleaned = normalizeStepText(modelText);
  const displayRaw = cleaned || (isHeadingLine ? 'this section title' : 'this step');
  const display = truncateForDeleteModal(displayRaw);
  const title = isHeadingLine ? 'Remove this section title?' : 'Remove this step?';
  const message = `"${display}" will be removed from this recipe only.`;

  try {
    if (window.ui && typeof window.ui.confirm === 'function') {
      return !!(await window.ui.confirm({
        title,
        message,
        confirmText: 'Remove',
        cancelText: 'Cancel',
        danger: true,
      }));
    }
    return !!window.confirm(message);
  } catch (_) {
    return true;
  }
}

function syncStepNodeDelete(stepId) {
  if (!Array.isArray(window.stepNodes)) return;
  const idStr = String(stepId);
  const idx = window.stepNodes.findIndex((n) => String(n.id) === idStr);
  if (idx === -1) return;
  window.stepNodes.splice(idx, 1);
  const stepNodeModelRef =
    window.StepNodeModel && typeof window.StepNodeModel === 'object'
      ? window.StepNodeModel
      : null;
  if (
    stepNodeModelRef &&
    typeof stepNodeModelRef.normalizeStepNodeOrder === 'function'
  ) {
    window.stepNodes = stepNodeModelRef.normalizeStepNodeOrder(window.stepNodes);
  }
}

function syncStepNodeBlank(stepId) {
  if (!Array.isArray(window.stepNodes)) return;
  const idStr = String(stepId);
  const idx = window.stepNodes.findIndex((n) => String(n.id) === idStr);
  if (idx === -1) return;
  window.stepNodes[idx].text = '';
}

// --- Inline step editing (contentEditable) ---

function attachStepInlineEditor(textEl) {
  if (!textEl) return;
  const lineEl = textEl.closest('.instruction-line');
  let consumedDeletePointerDown = false;

  const deleteStepViaGesture = async () => {
    const stepId = textEl.dataset.stepId;
    if (!stepId || !lineEl) return;

    const found = findStepInModel(stepId);
    if (!found || !found.step || !Array.isArray(found.stepsArr)) return;

    const isHeadingLine = (lineEl.dataset.stepType || 'step') === 'heading';
    const ok = await confirmDeleteStep(
      found.step,
      textEl.textContent || '',
      isHeadingLine
    );
    if (!ok) return;

    const parent = lineEl.parentElement;
    const allLines =
      parent && parent.querySelectorAll
        ? parent.querySelectorAll('.instruction-line.numbered')
        : [];

    if (allLines.length <= 1) {
      // Keep one editable row in place; deleting the last row becomes blank placeholder.
      found.step.instructions = '';
      syncStepNodeBlank(stepId);

      textEl.textContent = '';
      textEl.classList.add('placeholder-prompt');
      textEl.dataset.placeholder = isHeadingLine ? 'Section title' : 'Add a step.';
      if (isHeadingLine) {
        textEl.classList.add('placeholder-prompt--editblue');
        lineEl.classList.remove('instruction-line--placeholder');
      } else {
        textEl.classList.remove('placeholder-prompt--editblue');
        lineEl.classList.add('instruction-line--placeholder');
      }
      ensureStepTextNotEmpty(textEl);
    } else {
      found.stepsArr.splice(found.idx, 1);
      syncStepNodeDelete(stepId);
      if (parent && parent.contains(lineEl)) {
        parent.removeChild(lineEl);
      }
    }

    const stepsContainer = document.getElementById('stepsSection');
    renumberSteps(stepsContainer);
    if (stepsContainer) syncStepOrderFromDOM(stepsContainer);
    if (typeof markDirty === 'function') markDirty();
  };

  const maybeDeleteFromGestureEvent = (e) => {
    if (!e) return false;
    if (window.editingStepId) return false;
    const wantsDelete = !!(e.ctrlKey || e.metaKey || e.type === 'contextmenu');
    if (!wantsDelete) return false;
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {}
    void deleteStepViaGesture();
    return true;
  };

  // Make the full row clickable (number gutter + text area), so clicking
  // anywhere on a step line enters inline edit mode.
  if (lineEl && !lineEl.dataset.rowClickProxyBound) {
    lineEl.dataset.rowClickProxyBound = '1';
    lineEl.addEventListener('pointerdown', (e) => {
      consumedDeletePointerDown = maybeDeleteFromGestureEvent(e);
    });
    lineEl.addEventListener('contextmenu', (e) => {
      if (maybeDeleteFromGestureEvent(e) && e) e.preventDefault();
    });
    lineEl.addEventListener('click', (e) => {
      if (window.editingStepId) return;
      if (textEl.isContentEditable || lineEl.classList.contains('editing')) return;
      if (consumedDeletePointerDown) {
        consumedDeletePointerDown = false;
        return;
      }
      if (maybeDeleteFromGestureEvent(e)) return;

      // Text clicks are already handled by the text click listener below.
      if (e.target === textEl || textEl.contains(e.target)) return;

      textEl.click();
    });
  }

  textEl.addEventListener('click', (e) => {
    if (consumedDeletePointerDown) {
      consumedDeletePointerDown = false;
      return;
    }
    if (maybeDeleteFromGestureEvent(e)) return;
    // Read-only recipe links inside step text should open, not enter edit mode.
    try {
      const linkTarget =
        e && e.target && e.target.closest
          ? e.target.closest('a.step-recipe-link')
          : null;
      if (linkTarget) {
        e.preventDefault();
        e.stopPropagation();
        const rid = Number(linkTarget.dataset.linkedRecipeId);
        if (Number.isFinite(rid) && rid > 0 && typeof window.openRecipe === 'function') {
          window.openRecipe(rid);
        }
        return;
      }
    } catch (_) {}
    if (window.editingStepId) return; // one at a time
    window.editingStepId = textEl.dataset.stepId;

    window._dirtyBeforeThisEdit =
      typeof isDirty !== 'undefined' && isDirty === true;

    if (!lineEl) return;

    if (typeof setActiveStep === 'function') {
      setActiveStep(lineEl);
    }

    // Visual editing state
    lineEl.classList.add('editing');
    try {
      document.body.classList.add('step-editing');
    } catch (_) {}

    const original = textEl.textContent || '';
    const originalRawForLinks = (() => {
      const found = findStepInModel(window.editingStepId);
      if (!found || !found.step) return original;
      return String(found.step.instructions || '');
    })();
    const stepRecipeLinks =
      window.StepRecipeLinks && typeof window.StepRecipeLinks === 'object'
        ? window.StepRecipeLinks
        : null;
    const currentRecipeId =
      window.recipeData && window.recipeData.id != null
        ? Number(window.recipeData.id)
        : null;
    let mentionDropdownEl = null;
    let mentionResults = [];
    let mentionActiveRange = null;

    const closeMentionDropdown = () => {
      mentionResults = [];
      mentionActiveRange = null;
      if (mentionDropdownEl && mentionDropdownEl.parentNode) {
        mentionDropdownEl.parentNode.removeChild(mentionDropdownEl);
      }
      mentionDropdownEl = null;
    };

    const setCaretOffsetInsideStep = (offset) => {
      try {
        const fullText = textEl.textContent || '';
        const target = Math.max(0, Math.min(fullText.length, Number(offset) || 0));
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        let remaining = target;
        while (node) {
          const len = node.textContent.length;
          if (remaining <= len) {
            range.setStart(node, remaining);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
          }
          remaining -= len;
          node = walker.nextNode();
        }
        range.selectNodeContents(textEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    };

    const getActiveMentionRange = () => {
      const sel = getSelectionOffsetsInStep(textEl);
      if (!sel || sel.start !== sel.end) return null;
      const caret = sel.start;
      const fullText = textEl.textContent || '';
      if (caret < 0 || caret > fullText.length) return null;

      const before = fullText.slice(0, caret);
      const mentionStart = before.lastIndexOf('@');
      if (mentionStart === -1) return null;
      if (mentionStart > 0 && !/\s|\(|\[|\{/.test(fullText[mentionStart - 1])) {
        return null;
      }
      const query = fullText.slice(mentionStart + 1, caret);
      if (/[\n\r\t]/.test(query)) return null;
      if (/[.,;:!?()[\]{}]/.test(query)) return null;
      return {
        start: mentionStart,
        end: caret,
        query: query.trim(),
      };
    };

    const applyMentionPick = (pickedTitle) => {
      if (!mentionActiveRange) return;
      const full = textEl.textContent || '';
      const nextToken = `@${String(pickedTitle || '').trim()}`;
      const nextText = `${full.slice(0, mentionActiveRange.start)}${nextToken}${full.slice(
        mentionActiveRange.end
      )}`;
      textEl.classList.remove('placeholder-prompt');
      try {
        if (lineEl && lineEl.classList) {
          lineEl.classList.remove('instruction-line--placeholder');
        }
      } catch (_) {}
      textEl.textContent = nextText;
      setCaretOffsetInsideStep(mentionActiveRange.start + nextToken.length);
      closeMentionDropdown();
      if (!window._hasPendingEdit) {
        window._hasPendingEdit = true;
      }
      if (typeof markDirty === 'function') {
        markDirty();
      }
    };

    const updateMentionDropdown = async () => {
      if (!stepRecipeLinks || typeof stepRecipeLinks.searchRecipes !== 'function') {
        closeMentionDropdown();
        return;
      }
      const range = getActiveMentionRange();
      if (!range) {
        closeMentionDropdown();
        return;
      }

      if (typeof stepRecipeLinks.ensureRecipePoolLoaded === 'function') {
        try {
          await stepRecipeLinks.ensureRecipePoolLoaded();
        } catch (_) {}
      }

      const ranked = stepRecipeLinks
        .searchRecipes(range.query, currentRecipeId)
        .slice(0, 8);
      if (!ranked.length) {
        closeMentionDropdown();
        return;
      }

      mentionActiveRange = range;
      mentionResults = ranked.slice();

      if (!mentionDropdownEl) {
        mentionDropdownEl = document.createElement('div');
        mentionDropdownEl.className = 'typeahead-dropdown';
        mentionDropdownEl.addEventListener('mousedown', (evt) => {
          try {
            evt.preventDefault();
            evt.stopPropagation();
            textEl.focus();
          } catch (_) {}
        });
        mentionDropdownEl.addEventListener('click', (evt) => {
          const target =
            evt && evt.target && evt.target.closest
              ? evt.target.closest('.typeahead-item')
              : null;
          if (!target) return;
          const picked = String(target.dataset.value || target.textContent || '').trim();
          if (!picked) return;
          applyMentionPick(picked);
        });
        document.body.appendChild(mentionDropdownEl);
      }

      const list = ranked
        .map((row, idx) => {
          const title = String(row && row.title != null ? row.title : '').trim();
          const safe = title
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
          const id = Number(row && row.id != null ? row.id : NaN);
          const activeClass = idx === 0 ? ' is-highlighted' : '';
          return `<div class="typeahead-item${activeClass}" data-recipe-id="${id}" data-value="${safe}">${safe}</div>`;
        })
        .join('');
      mentionDropdownEl.innerHTML = `<div class="typeahead-list">${list}</div>`;

      try {
        const rect = textEl.getBoundingClientRect();
        mentionDropdownEl.style.display = 'block';
        mentionDropdownEl.style.position = 'fixed';
        mentionDropdownEl.style.left = `${Math.max(8, rect.left)}px`;
        mentionDropdownEl.style.top = `${Math.max(8, rect.bottom + 6)}px`;
        mentionDropdownEl.style.minWidth = `${Math.max(220, Math.round(rect.width))}px`;
        mentionDropdownEl.style.maxWidth = '420px';
      } catch (_) {
        closeMentionDropdown();
      }
    };

    const placeholderText =
      (textEl.dataset && textEl.dataset.placeholder) || 'Add a step.';
    const startedFromPlaceholder =
      textEl.classList.contains('placeholder-prompt') &&
      !normalizeStepText(original);
    let placeholderActive = startedFromPlaceholder;

    // If this is the default step placeholder, treat it like an empty field
    // so clicking anywhere puts the caret at position 0 for easy typing.
    const isPlaceholder =
      textEl.classList.contains('placeholder-prompt') &&
      isRecipeEditorEmptyStepPromptText(original);

    const editStartText =
      stepRecipeLinks && typeof stepRecipeLinks.toEditText === 'function'
        ? stepRecipeLinks.toEditText(originalRawForLinks)
        : original;

    if (isPlaceholder) {
      textEl.classList.remove('placeholder-prompt');
      textEl.textContent = '';
      ensureStepTextNotEmpty(textEl);
    } else {
      // Read-only mode may render recipe links as anchors; convert to editable mention text.
      textEl.textContent = editStartText;
    }

    textEl.contentEditable = 'true';
    textEl.focus();

    if (startedFromPlaceholder) {
      try {
        const sel = window.getSelection();
        const range = document.createRange();

        // Keep DOM empty; visual prompt comes from CSS ::before.
        textEl.innerHTML = '';
        const textNode = document.createTextNode('');
        textEl.appendChild(textNode);

        range.setStart(textNode, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (err) {
        // Best-effort; safe to ignore.
      }
    }

    window._activeStepInput = textEl;
    window._hasPendingEdit = false;

    const commitWithValue = (normalizedVal, { deleteIfEmpty } = {}) => {
      const shouldDelete = deleteIfEmpty !== false && normalizedVal === '';
      const isHeadingLine =
        (lineEl && lineEl.dataset && lineEl.dataset.stepType === 'heading') ||
        (textEl &&
          textEl.closest &&
          textEl.closest('.instruction-line')?.dataset?.stepType === 'heading');

      // Phase 1: mirror update into StepNode model (if present).
      if (typeof applyEditToStepNode === 'function' && window.editingStepId) {
        applyEditToStepNode(window.editingStepId, normalizedVal, {
          deleteIfEmpty,
        });
      }

      // Update the legacy recipe model
      const found = findStepInModel(window.editingStepId);

      if (found) {
        const { stepsArr, idx } = found;

        // 🛑 Never allow zero steps in the model — last step becomes blank instead.
        let effectiveDelete = shouldDelete;
        if (shouldDelete) {
          const parent = lineEl.parentElement;
          const allLines =
            parent?.querySelectorAll('.instruction-line.numbered') || [];
          if (allLines.length === 1) {
            effectiveDelete = false;
          }
        }

        if (effectiveDelete) {
          stepsArr.splice(idx, 1);
        } else {
          stepsArr[idx].instructions = normalizedVal;
        }
      }

      // Delete step from DOM
      if (shouldDelete) {
        const parent = lineEl.parentElement;
        if (parent) {
          // We may have "insert rails" (step-insert-zone) interleaved between lines.
          // If we delete a line but leave both adjacent rails, they become back-to-back
          // and create a large vertical gap. Collapse to a single rail.
          const prevSibling = lineEl.previousSibling;
          const nextSibling = lineEl.nextSibling;

          const allLines =
            parent.querySelectorAll('.instruction-line.numbered') || [];
          const isLastLine = allLines.length === 1;

          if (isLastLine) {
            // Keep last line as a real blank step / placeholder.
            textEl.textContent = '';

            textEl.classList.add('placeholder-prompt');
            if (textEl.dataset && !textEl.dataset.placeholder) {
              textEl.dataset.placeholder = 'Add a step.';
            }
            // Ensure placeholder row styling (hide number + left-align prompt).
            try {
              if (!isHeadingLine) {
                lineEl.classList.add('instruction-line--placeholder');
              }
            } catch (_) {}

            ensureStepTextNotEmpty(textEl);
          } else {
            parent.removeChild(lineEl);

            try {
              const isZone = (el) =>
                el &&
                el.classList &&
                el.classList.contains('step-insert-zone');
              if (isZone(prevSibling) && isZone(nextSibling)) {
                // Remove the "after" zone; keep the "before" zone.
                parent.removeChild(nextSibling);
              }

              // If the remaining zone was previously adjacent to a heading, it may still
              // be flagged disabled. Recompute its enabled/disabled state based on the
              // new neighbors so ctrl-click works again at the same spot.
              const keptZone = isZone(prevSibling)
                ? prevSibling
                : isZone(nextSibling)
                ? nextSibling
                : null;
              if (keptZone) {
                const prevLine =
                  keptZone.previousElementSibling &&
                  keptZone.previousElementSibling.classList &&
                  keptZone.previousElementSibling.classList.contains(
                    'instruction-line'
                  )
                    ? keptZone.previousElementSibling
                    : null;
                const nextLine =
                  keptZone.nextElementSibling &&
                  keptZone.nextElementSibling.classList &&
                  keptZone.nextElementSibling.classList.contains(
                    'instruction-line'
                  )
                    ? keptZone.nextElementSibling
                    : null;
                const prevIsHeading =
                  !!(prevLine && prevLine.dataset && prevLine.dataset.stepType === 'heading');
                const nextIsHeading =
                  !!(nextLine && nextLine.dataset && nextLine.dataset.stepType === 'heading');
                keptZone.classList.toggle(
                  'step-insert-zone--disabled',
                  prevIsHeading || nextIsHeading
                );
              }
            } catch (_) {}
          }
        }

        renumberSteps(document.getElementById('stepsSection'));
      } else {
        if (
          stepRecipeLinks &&
          typeof stepRecipeLinks.renderReadOnly === 'function' &&
          normalizedVal !== ''
        ) {
          stepRecipeLinks.renderReadOnly(textEl, normalizedVal);
        } else {
          textEl.textContent = normalizedVal;
        }

        ensureStepTextNotEmpty(textEl);
      }

      // Placeholder row bookkeeping:
      // - If the user committed real text, this is no longer the empty-state placeholder.
      // - If the field is empty AND showing the placeholder prompt, keep it marked as placeholder.
      try {
        const isStepPlaceholder =
          !isHeadingLine &&
          textEl &&
          textEl.classList &&
          textEl.classList.contains('placeholder-prompt') &&
          textEl.dataset &&
          isRecipeEditorStepRowPlaceholderLabel(textEl.dataset.placeholder);

        if (!isHeadingLine && normalizedVal !== '') {
          lineEl.classList.remove('instruction-line--placeholder');
        } else if (isStepPlaceholder && normalizedVal === '') {
          lineEl.classList.add('instruction-line--placeholder');
        } else if (!isHeadingLine && normalizedVal === '') {
          // Don't accidentally keep hiding numbers for genuinely-empty non-placeholder steps.
          lineEl.classList.remove('instruction-line--placeholder');
        }
      } catch (_) {}

      textEl.contentEditable = 'false';

      window.editingStepId = null;
      window._activeStepInput = null;
      window._hasPendingEdit = false;

      lineEl.classList.remove('editing');
      try {
        document.body.classList.remove('step-editing');
      } catch (_) {}

      textEl.removeEventListener('keydown', onKeyDown);
      textEl.removeEventListener('beforeinput', onBeforeInput);
      textEl.removeEventListener('blur', onBlur);
      textEl.removeEventListener('input', onInput);
      textEl.removeEventListener('paste', onPaste);

      if (typeof markDirty === 'function') {
        markDirty();
      }
    };

    const commit = () => {
      if (window._suppressStepCommit) {
        window._suppressStepCommit = false;
        return;
      }
      closeMentionDropdown();

      const raw = textEl.textContent || '';
      const newVal = normalizeStepText(raw);

      if (startedFromPlaceholder && !newVal) {
        placeholderActive = true;
      }

      const effectiveVal =
        startedFromPlaceholder && placeholderActive ? '' : newVal;

      // Never persist blank instruction rows.
      // The single-line placeholder case is preserved in commitWithValue().
      const isHeadingLine =
        (lineEl && lineEl.dataset && lineEl.dataset.stepType === 'heading') ||
        (textEl &&
          textEl.closest &&
          textEl.closest('.instruction-line')?.dataset?.stepType === 'heading');

      let finalVal = effectiveVal;
      const autoLinkedTitles = [];
      if (
        effectiveVal &&
        !isHeadingLine &&
        stepRecipeLinks &&
        typeof stepRecipeLinks.encodeFromDisplayText === 'function'
      ) {
        try {
          finalVal = stepRecipeLinks.encodeFromDisplayText(effectiveVal, {
            priorRawText: originalRawForLinks,
            currentRecipeId,
            onAutoLink: (title) => {
              if (!title) return;
              autoLinkedTitles.push(String(title));
            },
          });
        } catch (_) {}
      }

      commitWithValue(finalVal, { deleteIfEmpty: true });

      if (autoLinkedTitles.length && typeof window.uiToast === 'function') {
        const deduped = Array.from(new Set(autoLinkedTitles.map((v) => String(v).trim())))
          .filter(Boolean)
          .slice(0, 3);
        const label =
          deduped.length === 1
            ? deduped[0]
            : `${deduped[0]}${deduped.length > 1 ? ` +${deduped.length - 1}` : ''}`;
        try {
          window.uiToast(`Linked to ${label}.`);
        } catch (_) {}
      }
    };

    const handleEnterSplit = () => {
      closeMentionDropdown();
      const fullText = textEl.textContent || '';

      // Compute selection offsets within this step
      const selInfo = getSelectionOffsetsInStep(textEl);
      let start = fullText.length;
      let end = fullText.length;

      if (selInfo) {
        start = selInfo.start;
        end = selInfo.end;
      }

      if (start < 0) start = 0;
      if (end < 0) end = 0;
      if (start > fullText.length) start = fullText.length;
      if (end > fullText.length) end = fullText.length;

      const isCaretAtStart = start === 0 && end === 0;

      // Split into left / right halves
      const leftRaw = fullText.slice(0, start);
      const rightRaw = fullText.slice(end);

      const leftVal = normalizeStepText(leftRaw);
      const rightVal = normalizeStepText(rightRaw);

      // Do not create a second empty step when there is nothing to split (e.g. odd whitespace).
      if (!leftVal && !rightVal) {
        return;
      }

      // Lookup current step in model BEFORE committing, since commitWithValue
      // clears editingStepId.
      const found = findStepInModel(window.editingStepId);
      if (!found) {
        // Fallback: just commit as a normal edit
        commit();
        return;
      }

      const { stepsArr, idx, step } = found;

      // Enter at index 0 should insert a new blank line above while preserving
      // the current step text in place.
      if (isCaretAtStart) {
        const currentVal = normalizeStepText(fullText);

        // Keep current step content as-is and end current inline edit session.
        commitWithValue(currentVal, { deleteIfEmpty: false });

        const newStep = createSiblingStepFromExisting(step, '');
        stepsArr.splice(idx, 0, newStep);

        // Phase 1 — mirror insertion into StepNode model (if present).
        if (Array.isArray(window.stepNodes)) {
          const nodes = window.stepNodes;
          const parentIdStr = String(step.id ?? step.ID);
          const parentIdx = nodes.findIndex((n) => String(n.id) === parentIdStr);

          if (parentIdx !== -1) {
            const baseNode = nodes[parentIdx];

            const baseOrder =
              typeof baseNode.order === 'number' && !Number.isNaN(baseNode.order)
                ? baseNode.order
                : parentIdx + 1;

            const prevNode = nodes[parentIdx - 1] || null;
            let newOrder = baseOrder - 1;

            if (
              prevNode &&
              typeof prevNode.order === 'number' &&
              !Number.isNaN(prevNode.order) &&
              prevNode.order < baseOrder
            ) {
              newOrder = (prevNode.order + baseOrder) / 2;
            }

            const stepNodeModelRef =
              window.StepNodeModel && typeof window.StepNodeModel === 'object'
                ? window.StepNodeModel
                : null;
            const stepNodeTypeRef =
              window.StepNodeType && typeof window.StepNodeType === 'object'
                ? window.StepNodeType
                : null;

            const nodePayload = {
              id: newStep.id ?? newStep.ID,
              type:
                baseNode.type ||
                (stepNodeTypeRef && stepNodeTypeRef.STEP) ||
                'step',
              text: '',
              order: newOrder,
            };

            const newNode =
              stepNodeModelRef &&
              typeof stepNodeModelRef.createStepNode === 'function'
                ? stepNodeModelRef.createStepNode(nodePayload)
                : nodePayload;

            nodes.splice(parentIdx, 0, newNode);

            if (
              stepNodeModelRef &&
              typeof stepNodeModelRef.normalizeStepNodeOrder === 'function'
            ) {
              window.stepNodes = stepNodeModelRef.normalizeStepNodeOrder(nodes);
            }
          }
        }

        const parent = lineEl.parentElement;
        let newTextEl = null;

        if (parent) {
          const newLine = document.createElement('div');
          newLine.className = 'instruction-line numbered';

          const sectionId =
            lineEl.dataset.sectionId || textEl.dataset.sectionId || '';
          if (sectionId) {
            newLine.dataset.sectionId = sectionId;
          }

          const numSpan = document.createElement('span');
          numSpan.className = 'step-num';
          numSpan.textContent = '';

          const textSpan = document.createElement('span');
          textSpan.className = 'step-text placeholder-prompt';
          textSpan.dataset.stepId = String(newStep.id ?? newStep.ID);
          textSpan.textContent = '';
          textSpan.dataset.placeholder = 'Add a step.';

          ensureStepTextNotEmpty(textSpan);

          if (sectionId) {
            textSpan.dataset.sectionId = sectionId;
          }

          try {
            newLine.classList.add('instruction-line--placeholder');
          } catch (_) {}

          newLine.appendChild(numSpan);
          newLine.appendChild(textSpan);

          parent.insertBefore(newLine, lineEl);

          attachStepInlineEditor(textSpan);
          newTextEl = textSpan;
        }

        const stepsContainer = document.getElementById('stepsSection');
        renumberSteps(stepsContainer);
        if (stepsContainer) syncStepOrderFromDOM(stepsContainer);

        if (typeof markDirty === 'function') {
          markDirty();
        }

        if (newTextEl) {
          newTextEl.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
            })
          );
        }
        return;
      }

      // 1) Commit the left half to the existing step, but NEVER delete it here
      commitWithValue(leftVal, { deleteIfEmpty: false });

      // 2) Create a new step for the right half (may be empty to allow blank line)
      const newStep = createSiblingStepFromExisting(step, rightVal);
      stepsArr.splice(idx + 1, 0, newStep);

      // Phase 1 — mirror the split into the StepNode model (if present).
      if (Array.isArray(window.stepNodes)) {
        const nodes = window.stepNodes;
        const parentIdStr = String(step.id ?? step.ID);
        const parentIdx = nodes.findIndex((n) => String(n.id) === parentIdStr);

        if (parentIdx !== -1) {
          const baseNode = nodes[parentIdx];

          const baseOrder =
            typeof baseNode.order === 'number' && !Number.isNaN(baseNode.order)
              ? baseNode.order
              : parentIdx + 1;

          const nextNode = nodes[parentIdx + 1] || null;
          let newOrder = baseOrder + 1;

          if (
            nextNode &&
            typeof nextNode.order === 'number' &&
            !Number.isNaN(nextNode.order) &&
            nextNode.order > baseOrder
          ) {
            newOrder = (baseOrder + nextNode.order) / 2;
          }

          const stepNodeModelRef =
            window.StepNodeModel && typeof window.StepNodeModel === 'object'
              ? window.StepNodeModel
              : null;
          const stepNodeTypeRef =
            window.StepNodeType && typeof window.StepNodeType === 'object'
              ? window.StepNodeType
              : null;

          const nodePayload = {
            id: newStep.id ?? newStep.ID,
            type:
              baseNode.type ||
              (stepNodeTypeRef && stepNodeTypeRef.STEP) ||
              'step',
            text: newStep.instructions ?? '',
            order: newOrder,
          };

          const newNode =
            stepNodeModelRef &&
            typeof stepNodeModelRef.createStepNode === 'function'
              ? stepNodeModelRef.createStepNode(nodePayload)
              : nodePayload;

          nodes.splice(parentIdx + 1, 0, newNode);

          if (
            stepNodeModelRef &&
            typeof stepNodeModelRef.normalizeStepNodeOrder === 'function'
          ) {
            window.stepNodes = stepNodeModelRef.normalizeStepNodeOrder(nodes);
          }
        }
      }

      // 🧾 Remember enough to "heal" this split if user presses ESC
      window._lastStepSplitContext = {
        parentStepId: String(step.id ?? step.ID),
        newStepId: String(newStep.id ?? newStep.ID),
        originalText: fullText,
        dirtyBefore: !!window._dirtyBeforeThisEdit,
      };

      // 3) Insert new DOM line below current one

      const parent = lineEl.parentElement;
      let newTextEl = null;

      if (parent) {
        const newLine = document.createElement('div');
        newLine.className = 'instruction-line numbered';

        // Inherit section id from the current line/text so numbering stays within section
        const sectionId =
          lineEl.dataset.sectionId || textEl.dataset.sectionId || '';
        if (sectionId) {
          newLine.dataset.sectionId = sectionId;
        }

        const numSpan = document.createElement('span');
        numSpan.className = 'step-num';
        numSpan.textContent = ''; // will be filled by renumber

        const textSpan = document.createElement('span');
        textSpan.className = 'step-text';
        textSpan.dataset.stepId = String(newStep.id ?? newStep.ID);
        textSpan.textContent = newStep.instructions ?? '';

        ensureStepTextNotEmpty(textSpan);

        if (sectionId) {
          textSpan.dataset.sectionId = sectionId;
        }

        newLine.appendChild(numSpan);
        newLine.appendChild(textSpan);

        if (lineEl.nextSibling) {
          parent.insertBefore(newLine, lineEl.nextSibling);
        } else {
          parent.appendChild(newLine);
        }

        // Wire up inline editor on the new text span
        attachStepInlineEditor(textSpan);
        newTextEl = textSpan;
      }

      // 4) Renumber + sync order in the model
      const stepsContainer = document.getElementById('stepsSection');
      renumberSteps(stepsContainer);
      if (stepsContainer) syncStepOrderFromDOM(stepsContainer);

      if (typeof markDirty === 'function') {
        markDirty();
      }

      // 5) Move focus into the new step (Google Docs–style behavior)
      if (newTextEl) {
        newTextEl.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
          })
        );
      }
    };

    // Shift+Enter in contenteditable often maps to beforeinput "insertLineBreak"
    // without a reliable keydown split path across engines. Plain Enter uses the
    // same split; debounce so keydown + beforeinput in one gesture do not split twice.
    let lastEnterSplitInvokeMs = 0;
    const invokeEnterSplitFromInput = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      if (now - lastEnterSplitInvokeMs < 45) return;
      lastEnterSplitInvokeMs = now;
      handleEnterSplit();
    };

    const onBeforeInput = (e) => {
      if (!textEl.isContentEditable) return;
      if (!e || e.isComposing) return;
      if (e.inputType !== 'insertLineBreak') return;
      invokeEnterSplitFromInput(e);
    };

    const handleBackspaceMerge = () => {
      console.log('[BKS] entered handleBackspaceMerge');

      // Only merge if there *is* a previous instruction-line
      const prevLine = lineEl.previousElementSibling;
      if (!prevLine || !prevLine.classList.contains('instruction-line')) {
        console.log('[BKS] early return: no previous instruction-line');

        return; // nothing to merge with (top of list)
      }

      const prevTextEl = prevLine.querySelector('.step-text');
      if (!prevTextEl) {
        console.log('[BKS] early return: no prevTextEl');
        return;
      }

      const currentStepId = textEl.dataset.stepId || window.editingStepId;
      if (!currentStepId) {
        console.log('[BKS] early return: no currentStepId', {
          editingStepId: window.editingStepId,
          domStepId: textEl && textEl.dataset && textEl.dataset.stepId,
        });
        return;
      }

      const prevStepId = prevTextEl.dataset.stepId;
      if (!prevStepId) {
        console.log('[BKS] early return: no prevStepId');
        return;
      }

      const currentFound = findStepInModel(currentStepId);
      if (!currentFound) {
        console.log('[BKS] early return: findStepInModel failed', {
          currentStepId,
        });
        return;
      }

      const prevFound = findStepInModel(prevStepId);
      if (!prevFound) {
        console.log('[BKS] early return: findStepInModel failed for prev', {
          prevStepId,
        });
        return;
      }

      const thisStep = currentFound.step;
      const prevStep = prevFound.step;

      const prevStepsArr = prevFound.stepsArr;
      if (!Array.isArray(prevStepsArr) || prevFound.idx < 0) {
        console.log('[BKS] early return: invalid prev stepsArr/idx', {
          hasArray: Array.isArray(prevStepsArr),
          idx: prevFound.idx,
          length: Array.isArray(prevStepsArr) ? prevStepsArr.length : null,
          prevStepId,
        });
        return;
      }

      // Use live DOM text for the current step so we don't lose
      // newly typed content that hasn't been synced into the model yet.
      const prevText = prevStep.instructions || '';
      const thisText = textEl.textContent || '';

      // Merge with spacing + normalization
      const merged = normalizeStepText(
        prevText && thisText
          ? `${prevText} ${thisText}`
          : `${prevText}${thisText}`
      );

      // Find where second-step text begins, so caret lands intuitively
      const thisNorm = normalizeStepText(thisText);

      let caretOffsetInMerged = merged.length;
      if (thisNorm) {
        const idxNorm = merged.lastIndexOf(thisNorm);
        if (idxNorm >= 0) caretOffsetInMerged = idxNorm;
      }

      // 🔁 Model: keep *current* step, delete previous step.
      thisStep.instructions = merged;

      prevStepsArr.splice(prevFound.idx, 1);

      // Phase 1 — mirror this merge into the StepNode model (if present).
      if (Array.isArray(window.stepNodes)) {
        const nodes = window.stepNodes;
        const prevIdStr = String(prevStep.id ?? prevStep.ID);
        const thisIdStr = String(thisStep.id ?? thisStep.ID);

        const prevNodeIdx = nodes.findIndex((n) => String(n.id) === prevIdStr);
        const thisNodeIdx = nodes.findIndex((n) => String(n.id) === thisIdStr);

        // Update the surviving node's text to the merged value
        if (thisNodeIdx !== -1) {
          nodes[thisNodeIdx].text = merged;
        }

        // Drop the previous node from the StepNode list
        if (prevNodeIdx !== -1) {
          nodes.splice(prevNodeIdx, 1);
        }

        const stepNodeModelRef =
          window.StepNodeModel && typeof window.StepNodeModel === 'object'
            ? window.StepNodeModel
            : null;

        if (
          stepNodeModelRef &&
          typeof stepNodeModelRef.normalizeStepNodeOrder === 'function'
        ) {
          window.stepNodes = stepNodeModelRef.normalizeStepNodeOrder(nodes);
        }
      }

      // 🧱 DOM: move current line into previous line’s position,
      // update its text, remove the old previous line.
      const parent = lineEl.parentElement;

      if (parent && parent.contains(lineEl) && parent.contains(prevLine)) {
        parent.insertBefore(lineEl, prevLine);
        parent.removeChild(prevLine);
      }

      textEl.textContent = merged;

      // Renumber + sync
      const stepsContainer = document.getElementById('stepsSection');
      renumberSteps(stepsContainer);
      if (stepsContainer) syncStepOrderFromDOM(stepsContainer);

      if (typeof markDirty === 'function') {
        markDirty();
      }

      // 🎯 Keep caret inside the same inline editor,
      // at the exact intuitive offset inside merged text.

      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel) return;

        const fullText = textEl.textContent || '';
        let targetOffset = caretOffsetInMerged;
        if (targetOffset < 0) targetOffset = 0;
        if (targetOffset > fullText.length) targetOffset = fullText.length;

        let remaining = targetOffset;
        const range = document.createRange();
        const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);

        let node = walker.nextNode();
        while (node) {
          const len = node.textContent.length;
          if (remaining <= len) {
            range.setStart(node, remaining);
            break;
          }
          remaining -= len;
          node = walker.nextNode();
        }

        if (!node) {
          range.selectNodeContents(textEl);
          range.collapse(false);
        }

        sel.removeAllRanges();
        sel.addRange(range);
      }, 0);
    };

    const cancel = () => {
      closeMentionDropdown();
      window._suppressStepCommit = true;

      // This inline edit is the ONLY dirty thing if:
      //   - This edit actually changed text (_hasPendingEdit)
      //   - There were NO dirty edits before this edit session began
      const onlyThisEditIsDirty =
        window._hasPendingEdit === true &&
        window._dirtyBeforeThisEdit === false;

      // 🔁 Check if this step is the "child" created by an Enter split.
      const splitCtx = window._lastStepSplitContext || null;
      const isSplitChild =
        splitCtx && String(window.editingStepId || '') === splitCtx.newStepId;

      if (isSplitChild) {
        // --- Model: restore original text on parent  remove child step ---
        const parentFound = findStepInModel(splitCtx.parentStepId);
        const childFound = findStepInModel(splitCtx.newStepId);

        if (parentFound) {
          parentFound.step.instructions = splitCtx.originalText;
        }

        if (childFound) {
          childFound.stepsArr.splice(childFound.idx, 1);
        }

        // Keep StepNode model in sync with this ESC-based split undo.
        if (Array.isArray(window.stepNodes)) {
          const nodes = window.stepNodes;
          const parentIdStr = String(splitCtx.parentStepId || '');
          const childIdStr = String(splitCtx.newStepId || '');

          const parentIdx = nodes.findIndex(
            (n) => String(n.id) === parentIdStr
          );
          const childIdx = nodes.findIndex((n) => String(n.id) === childIdStr);

          if (parentIdx !== -1) {
            nodes[parentIdx].text = splitCtx.originalText || '';
          }
          if (childIdx !== -1) {
            nodes.splice(childIdx, 1);
          }
        }

        // --- DOM: restore parent text, remove this (child) line ---

        const stepsContainer = document.getElementById('stepsSection');

        if (stepsContainer) {
          const parentTextEl = stepsContainer.querySelector(
            `.instruction-line .step-text[data-step-id="${splitCtx.parentStepId}"]`
          );
          if (parentTextEl) {
            parentTextEl.textContent = splitCtx.originalText;
          }

          const parent = lineEl.parentElement;
          if (parent && parent.contains(lineEl)) {
            parent.removeChild(lineEl);
          }

          renumberSteps(stepsContainer);
          syncStepOrderFromDOM(stepsContainer);
        }

        // --- Clear editing state ---
        window.editingStepId = null;
        window._activeStepInput = null;
        window._hasPendingEdit = false;

        lineEl.classList.remove('editing');

        textEl.removeEventListener('keydown', onKeyDown);
        textEl.removeEventListener('beforeinput', onBeforeInput);
        textEl.removeEventListener('blur', onBlur);
        textEl.removeEventListener('input', onInput);
        textEl.removeEventListener('paste', onPaste);

        // If this split was the only thing making things dirty, we can revert
        if (
          splitCtx.dirtyBefore === false &&
          typeof revertChanges === 'function'
        ) {
          revertChanges();
        }

        window._dirtyBeforeThisEdit = false;
        window._lastStepSplitContext = null;

        return;
      }

      // 🧹 NEW: If this was a newly-created step AND it's empty,
      // cancel should *delete the step*, not restore ''.
      const isNewStep = String(window.editingStepId || '').startsWith(
        'tmp-step-'
      );
      const isEmptyNow = !normalizeStepText(textEl.textContent || '');
      const wasOriginallyEmpty = !normalizeStepText(original || '');

      if (isNewStep && isEmptyNow && wasOriginallyEmpty) {
        const parent = lineEl.parentElement;
        if (parent) parent.removeChild(lineEl);

        // Remove from model as well
        const found = findStepInModel(window.editingStepId);
        if (found) {
          found.stepsArr.splice(found.idx, 1);
        }

        // Renumber if needed
        renumberSteps(document.getElementById('stepsSection'));

        window.editingStepId = null;
        window._activeStepInput = null;
        window._hasPendingEdit = false;

        // If this was the only thing making the editor dirty → full revert
        if (onlyThisEditIsDirty && typeof revertChanges === 'function') {
          revertChanges();
        }
        window._dirtyBeforeThisEdit = false;
        return;
      }

      // Default cancel behavior (no split-heal, no new-empty-step case)

      if (
        stepRecipeLinks &&
        typeof stepRecipeLinks.renderReadOnly === 'function' &&
        originalRawForLinks !== original
      ) {
        stepRecipeLinks.renderReadOnly(textEl, originalRawForLinks);
      } else {
        textEl.textContent = original;
      }

      if (startedFromPlaceholder && !normalizeStepText(original)) {
        textEl.classList.add('placeholder-prompt');
        if (textEl.dataset && !textEl.dataset.placeholder) {
          textEl.dataset.placeholder = placeholderText;
        }
        placeholderActive = true;
        try {
          if (
            lineEl &&
            lineEl.classList &&
            isRecipeEditorStepRowPlaceholderLabel(placeholderText) &&
            lineEl.dataset &&
            lineEl.dataset.stepType !== 'heading'
          ) {
            lineEl.classList.add('instruction-line--placeholder');
          }
        } catch (_) {}
      }

      // Restore placeholder styling if we reverted back to the prompt text.
      if (isRecipeEditorEmptyStepPromptText(original)) {
        textEl.classList.add('placeholder-prompt');
        try {
          if (
            lineEl &&
            lineEl.classList &&
            lineEl.dataset &&
            lineEl.dataset.stepType !== 'heading'
          ) {
            lineEl.classList.add('instruction-line--placeholder');
          }
        } catch (_) {}
      }

      textEl.contentEditable = 'false';

      window.editingStepId = null;
      window._activeStepInput = null;
      window._hasPendingEdit = false;

      lineEl.classList.remove('editing');

      textEl.removeEventListener('keydown', onKeyDown);
      textEl.removeEventListener('beforeinput', onBeforeInput);
      textEl.removeEventListener('blur', onBlur);
      textEl.removeEventListener('input', onInput);
      textEl.removeEventListener('paste', onPaste);

      if (onlyThisEditIsDirty && typeof revertChanges === 'function') {
        revertChanges();
      }
      window._dirtyBeforeThisEdit = false;
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && mentionDropdownEl) {
        e.preventDefault();
        closeMentionDropdown();
        return;
      }
      if (
        mentionDropdownEl &&
        e.key === 'Enter' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        const first = mentionResults[0];
        const picked = first && first.title ? String(first.title).trim() : '';
        if (picked) {
          e.preventDefault();
          applyMentionPick(picked);
          return;
        }
      }

      const wantsReorder =
        e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown');
      if (wantsReorder) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }

        moveStepLineByDelta({
          lineEl,
          delta: e.key === 'ArrowUp' ? -1 : 1,
          selectionOffsets: getSelectionOffsetsInStep(textEl),
        });
        return;
      }

      // Safari-style placeholder behavior for the default empty step row.
      const isPlaceholderMode =
        startedFromPlaceholder ||
        (textEl.classList.contains('placeholder-prompt') &&
          !normalizeStepText(textEl.textContent || ''));

      if (isPlaceholderMode) {
        const isPrintable =
          e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;

        if (placeholderActive && isPrintable) {
          // First character: clear placeholder, insert typed char.
          e.preventDefault();

          textEl.classList.remove('placeholder-prompt');
          placeholderActive = false;

          textEl.innerHTML = '';
          const node = document.createTextNode(e.key);
          textEl.appendChild(node);

          // Make the editor dirty on the *first* real keystroke.
          if (!window._hasPendingEdit) {
            window._hasPendingEdit = true;
            if (typeof markDirty === 'function') {
              markDirty();
            }
          }

          try {
            const range = document.createRange();
            const sel = window.getSelection();
            range.setStart(node, node.textContent.length);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (err) {
            // ignore
          }

          if (e.key === '@') {
            setTimeout(() => {
              updateMentionDropdown();
            }, 0);
          }

          return;
        }

        if (!placeholderActive && e.key === 'Backspace') {
          const fullText = textEl.textContent || '';
          const selInfo = getSelectionOffsetsInStep(textEl);
          const caretAtEnd =
            selInfo &&
            selInfo.start === fullText.length &&
            selInfo.end === fullText.length;

          // Deleting the single typed char → restore placeholder.
          if (caretAtEnd && fullText.length === 1) {
            e.preventDefault();

            textEl.textContent = '';
            textEl.classList.add('placeholder-prompt');

            if (textEl.dataset) {
              textEl.dataset.placeholder = placeholderText;
            }

            placeholderActive = true;

            try {
              const range = document.createRange();
              const sel = window.getSelection();
              if (!textEl.firstChild) {
                textEl.appendChild(document.createTextNode(''));
              }
              range.setStart(textEl.firstChild, 0);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            } catch (err) {
              // ignore
            }

            return;
          }
        }

        if (placeholderActive && e.key === 'Backspace') {
          // Nothing real to delete yet; keep caret at 0.
          e.preventDefault();
          try {
            const range = document.createRange();
            const sel = window.getSelection();
            if (!textEl.firstChild) {
              textEl.appendChild(document.createTextNode(''));
            }
            range.setStart(textEl.firstChild, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (err) {
            // ignore
          }
          return;
        }
      }

      // --- TAB / SHIFT+TAB → toggle heading/step (model + DOM + renumber) ---
      if (e.key === 'Tab') {
        const stepId =
          window.editingStepId ||
          (textEl && textEl.dataset && textEl.dataset.stepId);

        const stepNodeModelRef =
          window.StepNodeModel && typeof window.StepNodeModel === 'object'
            ? window.StepNodeModel
            : null;
        const stepNodeTypeRef =
          window.StepNodeType && typeof window.StepNodeType === 'object'
            ? window.StepNodeType
            : null;
        const nodes = Array.isArray(window.stepNodes) ? window.stepNodes : null;
        const line = lineEl || textEl.closest('.instruction-line');

        // If wiring isn't present, let browser handle TAB normally.
        if (
          !stepId ||
          !stepNodeModelRef ||
          !stepNodeTypeRef ||
          !nodes ||
          !line
        ) {
          return;
        }

        // Structural-only TAB: no real tab chars, no focus change.
        e.preventDefault();

        const idStr = String(stepId);
        const idx = nodes.findIndex((n) => String(n.id) === idStr);
        if (idx === -1) return;

        const node = nodes[idx];
        let nextType = node.type;

        if (e.shiftKey) {
          // SHIFT+TAB: step → heading; heading → no-op.
          if (node.type !== stepNodeTypeRef.STEP) {
            return;
          }
          nextType = stepNodeTypeRef.HEADING;
          if (typeof stepNodeModelRef.convertNodeToHeading === 'function') {
            window.stepNodes = stepNodeModelRef.convertNodeToHeading(
              nodes,
              stepId
            );
          }
        } else {
          // TAB: heading → step; step → no-op.
          if (node.type !== stepNodeTypeRef.HEADING) {
            return;
          }
          nextType = stepNodeTypeRef.STEP;
          if (typeof stepNodeModelRef.convertNodeToStep === 'function') {
            window.stepNodes = stepNodeModelRef.convertNodeToStep(
              nodes,
              stepId
            );
          }
        }

        // Mirror new type into DOM for this line.
        line.dataset.stepType = nextType || 'step';
        const numEl = line.querySelector('.step-num');
        if (numEl && nextType === stepNodeTypeRef.HEADING) {
          // Headings are visually unnumbered.
          numEl.textContent = '';
        }

        // Re-number all lines, skipping headings.
        renumberSteps(document.getElementById('stepsSection'));

        // Structural promotion/demotion is a real edit → enable Save/Cancel.
        if (typeof markDirty === 'function') {
          markDirty();
        }

        return;
      }

      if (e.key === 'Backspace') {
        console.log('[BKS] keydown Backspace');
        // Backspace at the *very start* of the step merges with previous (Docs-style)
        const sel = getSelectionOffsetsInStep(textEl);
        const isEmptyNow = !normalizeStepText(textEl.textContent || '');
        const atStart =
          (sel && sel.start === 0 && sel.end === 0) || (!sel && isEmptyNow);

        const hasPrev =
          lineEl.previousElementSibling &&
          lineEl.previousElementSibling.classList.contains('instruction-line');

        if (atStart && hasPrev) {
          e.preventDefault();
          // Prevent blur -> commit from killing inline edit while we juggle DOM
          window._suppressStepCommit = true;
          handleBackspaceMerge();
          // If commit ran during merge, it has already reset this flag.
          // If not, clear it now so future commits work normally.
          window._suppressStepCommit = false;
          return;
        }

        // else: fall through to normal Backspace behavior
      }

      const isEnterKey =
        e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
      if (
        isEnterKey &&
        !e.isComposing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        // Split/create a sibling step at caret position, including caret 0.
        // (Shift+Enter is usually insertLineBreak → handled in onBeforeInput.)
        invokeEnterSplitFromInput(e);
      } else if (e.key === 'Escape') {
        e.preventDefault();

        if (typeof window.recipeEditorAttemptExit === 'function') {
          void window.recipeEditorAttemptExit({
            reason: 'esc-step',
            onDiscard: () => {
              if (typeof window.revertChanges === 'function') {
                window.revertChanges();
              }
            },
          });
        } else if (typeof window.revertChanges === 'function') {
          window.revertChanges();
        } else {
          // Fallback: blur without committing changes
          if (textEl && typeof textEl.blur === 'function') {
            const prevSuppress = window._suppressStepCommit === true;
            window._suppressStepCommit = true;
            textEl.blur();
            if (!prevSuppress) window._suppressStepCommit = false;
          }
        }
      }
    };

    const onBlur = () => {
      closeMentionDropdown();
      commit();
    };

    const onInput = () => {
      if (!window._hasPendingEdit) {
        window._hasPendingEdit = true;
        if (typeof markDirty === 'function') {
          markDirty();
        }
      }

      const current = textEl.textContent || '';

      // Any non-empty content (typing, paste, IME, etc.) ends placeholder-only mode
      // so blur commits real text instead of forcing ''.
      if (startedFromPlaceholder && current.length > 0) {
        placeholderActive = false;
      }

      // If there's real text, never show the pseudo placeholder.
      if (
        current.length > 0 &&
        textEl.classList &&
        textEl.classList.contains('placeholder-prompt')
      ) {
        textEl.classList.remove('placeholder-prompt');
      }
      // If we removed the placeholder prompt due to real text, this is no longer
      // the empty-state placeholder row, so numbers should show after blur.
      try {
        if (
          current.length > 0 &&
          lineEl &&
          lineEl.classList &&
          lineEl.classList.contains('instruction-line--placeholder')
        ) {
          lineEl.classList.remove('instruction-line--placeholder');
        }
      } catch (_) {}

      // Safety net for the Safari-style placeholder:
      // if we started from the placeholder, the user has typed *something*
      // (placeholderActive === false) and then erased everything so that
      // the content is now truly empty again, restore the placeholder.
      if (startedFromPlaceholder && !placeholderActive) {
        if (current.length === 0) {
          textEl.classList.add('placeholder-prompt');
          if (textEl.dataset) {
            textEl.dataset.placeholder = placeholderText;
          }
          placeholderActive = true;
          try {
            if (
              lineEl &&
              lineEl.classList &&
              isRecipeEditorStepRowPlaceholderLabel(placeholderText) &&
              lineEl.dataset &&
              lineEl.dataset.stepType !== 'heading'
            ) {
              lineEl.classList.add('instruction-line--placeholder');
            }
          } catch (_) {}
        }
      }

      // Single-step recipes: when the only step is cleared, treat it as the
      // default empty step placeholder again.
      if (!startedFromPlaceholder && current.length === 0) {
        const parent = lineEl && lineEl.parentElement;
        if (parent) {
          const allLines = parent.querySelectorAll('.instruction-line');
          if (allLines.length === 1) {
            textEl.classList.add('placeholder-prompt');
            if (textEl.dataset) {
              textEl.dataset.placeholder = placeholderText;
            }
            try {
              if (
                lineEl &&
                lineEl.classList &&
                isRecipeEditorStepRowPlaceholderLabel(placeholderText) &&
                lineEl.dataset &&
                lineEl.dataset.stepType !== 'heading'
              ) {
                lineEl.classList.add('instruction-line--placeholder');
              }
            } catch (_) {}

            // Enter placeholder mode for this newly-blank single step.
            placeholderActive = true;

            // Put caret at position 0 so Backspace behaves like a real placeholder.
            try {
              const range = document.createRange();
              const sel = window.getSelection();

              // Always replace any leftover <br> etc with a clean text node.
              while (textEl.firstChild) {
                textEl.removeChild(textEl.firstChild);
              }
              const tn = document.createTextNode('');
              textEl.appendChild(tn);
              range.setStart(tn, 0);

              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            } catch (err) {
              // ignore
            }
          }
        }
      }

      updateMentionDropdown();
    };

    const setCaretAtTextOffset = (targetEl, targetOffset) => {
      if (!targetEl) return;
      try {
        const sel = window.getSelection();
        if (!sel) return;

        const fullText = targetEl.textContent || '';
        let remaining = Math.max(0, Math.min(fullText.length, targetOffset));

        const range = document.createRange();
        const walker = document.createTreeWalker(targetEl, NodeFilter.SHOW_TEXT);

        let node = walker.nextNode();
        while (node) {
          const len = node.textContent.length;
          if (remaining <= len) {
            range.setStart(node, remaining);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
          }
          remaining -= len;
          node = walker.nextNode();
        }

        range.selectNodeContents(targetEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    };

    const applyInlinePlainTextPaste = (insertText) => {
      const fullText = textEl.textContent || '';
      const sel = getSelectionOffsetsInStep(textEl);
      const start = sel ? sel.start : fullText.length;
      const end = sel ? sel.end : fullText.length;

      const nextRaw = `${fullText.slice(0, start)}${insertText}${fullText.slice(end)}`;
      const nextText = normalizeStepText(nextRaw);
      const caretHintRaw = `${fullText.slice(0, start)}${insertText}`;
      const caretHint = normalizeStepText(caretHintRaw).length;

      textEl.textContent = nextText;
      textEl.classList.remove('placeholder-prompt');
      try {
        if (lineEl && lineEl.classList) {
          lineEl.classList.remove('instruction-line--placeholder');
        }
      } catch (_) {}

      ensureStepTextNotEmpty(textEl);
      setCaretAtTextOffset(textEl, caretHint);

      if (nextText) {
        placeholderActive = false;
      }

      if (!window._hasPendingEdit) {
        window._hasPendingEdit = true;
      }
      if (typeof markDirty === 'function') {
        markDirty();
      }
    };

    const onPaste = (e) => {
      const cd = e && (e.clipboardData || window.clipboardData);
      if (!cd || typeof cd.getData !== 'function') return;

      const raw = cd.getData('text/plain');
      if (typeof raw !== 'string') return;

      // Plain-text only; never allow rich content into step rows.
      e.preventDefault();

      const normalized = raw.replace(/\r\n?/g, '\n');
      // Drop blank lines so pasted extra newlines do not create numbered empty steps.
      const pastedLines = normalized
        .split('\n')
        .map((line) => normalizeStepText(line))
        .filter((line) => !!line);

      // Ignore blank-only paste payloads.
      if (pastedLines.length === 0) return;

      if (pastedLines.length === 1) {
        applyInlinePlainTextPaste(pastedLines[0]);
        return;
      }

      const found = findStepInModel(window.editingStepId);
      if (!found) {
        applyInlinePlainTextPaste(pastedLines.join(' '));
        return;
      }

      const fullText = textEl.textContent || '';
      const sel = getSelectionOffsetsInStep(textEl);
      const start = sel ? sel.start : fullText.length;
      const end = sel ? sel.end : fullText.length;

      const leftRaw = fullText.slice(0, start);
      const rightRaw = fullText.slice(end);

      const firstLine = pastedLines[0];
      const lastLine = pastedLines[pastedLines.length - 1];
      const middleLines = pastedLines.slice(1, -1);

      const leftMerged = normalizeStepText(`${leftRaw}${firstLine}`);
      const rightMerged = normalizeStepText(`${lastLine}${rightRaw}`);

      const { stepsArr, idx, step } = found;
      if (!Array.isArray(stepsArr) || idx < 0 || !step) {
        applyInlinePlainTextPaste(pastedLines.join(' '));
        return;
      }

      // Update current step with text-before-caret + first pasted line.
      step.instructions = leftMerged;
      textEl.textContent = leftMerged;
      textEl.classList.remove('placeholder-prompt');
      try {
        if (lineEl && lineEl.classList) {
          lineEl.classList.remove('instruction-line--placeholder');
        }
      } catch (_) {}
      ensureStepTextNotEmpty(textEl);
      placeholderActive = false;

      const sectionId = lineEl.dataset.sectionId || textEl.dataset.sectionId || '';
      const linesToInsert = middleLines.concat([rightMerged]);
      const createdSteps = [];

      // Create one new step per pasted line (excluding the first line used above).
      // Pasted rows are always normal steps (never inferred headings).
      let seed = step;
      linesToInsert.forEach((lineText) => {
        const newStep = createSiblingStepFromExisting(seed, lineText);
        newStep.type = 'step';
        createdSteps.push(newStep);
        seed = newStep;
      });

      if (createdSteps.length > 0) {
        stepsArr.splice(idx + 1, 0, ...createdSteps);
      }

      // Mirror inserted text rows into StepNode model (if present).
      if (Array.isArray(window.stepNodes) && createdSteps.length > 0) {
        const nodes = window.stepNodes;
        const stepNodeModelRef =
          window.StepNodeModel && typeof window.StepNodeModel === 'object'
            ? window.StepNodeModel
            : null;
        const stepNodeTypeRef =
          window.StepNodeType && typeof window.StepNodeType === 'object'
            ? window.StepNodeType
            : null;

        const currentId = String(step.id ?? step.ID ?? '');
        const currentNodeIdx = nodes.findIndex((n) => String(n.id) === currentId);
        if (currentNodeIdx !== -1) {
          nodes[currentNodeIdx].text = leftMerged;
        }

        let anchorId = currentId;
        createdSteps.forEach((created) => {
          const anchorIdx = nodes.findIndex((n) => String(n.id) === String(anchorId));
          if (anchorIdx === -1) return;

          const baseNode = nodes[anchorIdx];
          const nextNode = nodes[anchorIdx + 1] || null;

          const baseOrder =
            typeof baseNode.order === 'number' && !Number.isNaN(baseNode.order)
              ? baseNode.order
              : anchorIdx + 1;
          let newOrder = baseOrder + 1;
          if (
            nextNode &&
            typeof nextNode.order === 'number' &&
            !Number.isNaN(nextNode.order) &&
            nextNode.order > baseOrder
          ) {
            newOrder = (baseOrder + nextNode.order) / 2;
          }

          const nodePayload = {
            id: created.id ?? created.ID,
            type:
              (stepNodeTypeRef && stepNodeTypeRef.STEP) ||
              (baseNode && baseNode.type) ||
              'step',
            text: created.instructions ?? '',
            order: newOrder,
          };

          const newNode =
            stepNodeModelRef &&
            typeof stepNodeModelRef.createStepNode === 'function'
              ? stepNodeModelRef.createStepNode(nodePayload)
              : nodePayload;

          nodes.splice(anchorIdx + 1, 0, newNode);
          anchorId = String(created.id ?? created.ID ?? '');
        });

        if (
          stepNodeModelRef &&
          typeof stepNodeModelRef.normalizeStepNodeOrder === 'function'
        ) {
          window.stepNodes = stepNodeModelRef.normalizeStepNodeOrder(nodes);
        }
      }

      // Insert new DOM rows directly after the current line.
      const parent = lineEl.parentElement;
      if (parent && createdSteps.length > 0) {
        let anchorEl = lineEl;
        createdSteps.forEach((created) => {
          const newLine = document.createElement('div');
          newLine.className = 'instruction-line numbered';
          if (sectionId) newLine.dataset.sectionId = sectionId;
          newLine.dataset.stepId = String(created.id ?? created.ID);
          newLine.dataset.stepType = 'step';

          const numSpan = document.createElement('span');
          numSpan.className = 'step-num';
          numSpan.textContent = '';

          const textSpan = document.createElement('span');
          textSpan.className = 'step-text';
          textSpan.dataset.stepId = String(created.id ?? created.ID);
          if (sectionId) textSpan.dataset.sectionId = sectionId;
          textSpan.textContent = created.instructions ?? '';

          ensureStepTextNotEmpty(textSpan);

          newLine.appendChild(numSpan);
          newLine.appendChild(textSpan);

          if (anchorEl.nextSibling) {
            parent.insertBefore(newLine, anchorEl.nextSibling);
          } else {
            parent.appendChild(newLine);
          }
          anchorEl = newLine;

          attachStepInlineEditor(textSpan);
        });
      }

      const stepsContainer = document.getElementById('stepsSection');
      renumberSteps(stepsContainer);
      if (stepsContainer) syncStepOrderFromDOM(stepsContainer);

      if (!window._hasPendingEdit) {
        window._hasPendingEdit = true;
      }
      if (typeof markDirty === 'function') {
        markDirty();
      }

      // Keep edit mode active on the current row after structural insert.
      setCaretAtTextOffset(textEl, (textEl.textContent || '').length);
    };

    textEl.addEventListener('keydown', onKeyDown);
    textEl.addEventListener('beforeinput', onBeforeInput);
    textEl.addEventListener('blur', onBlur);
    textEl.addEventListener('input', onInput);
    textEl.addEventListener('paste', onPaste);
  });
}

// --- Map current selection → character range inside a step ---
function getSelectionOffsetsInStep(textEl) {
  if (!textEl) return null;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  if (!range || !range.startContainer) return null;

  // Ensure the selection is inside this step's text element
  if (
    !textEl.contains(range.startContainer) ||
    !textEl.contains(range.endContainer)
  ) {
    return null;
  }

  // Special-case: some browsers report the caret at the very start of the
  // contentEditable element as (element, offset 0) instead of a text node.
  // In that case we want a clean "start of step" offset (0, 0) so that
  // Enter behaves like "push all text down into the next step".
  if (
    range.collapsed &&
    range.startContainer === textEl &&
    range.startOffset === 0
  ) {
    return { start: 0, end: 0 };
  }

  function computeOffset(node, nodeOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(
      textEl,
      NodeFilter.SHOW_TEXT,
      null
    );
    let current = walker.nextNode();

    while (current) {
      if (current === node) {
        offset += nodeOffset;
        break;
      } else {
        offset += current.textContent.length;
      }
      current = walker.nextNode();
    }

    return offset;
  }

  const startOffset = computeOffset(range.startContainer, range.startOffset);
  const endOffset = computeOffset(range.endContainer, range.endOffset);

  const fullText = textEl.textContent || '';
  const start = Math.max(0, Math.min(fullText.length, startOffset));
  const end = Math.max(0, Math.min(fullText.length, endOffset));

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

// --- Map click position → character index inside a step (currently unused) ---
function getClickCharIndexInStep(textEl, event) {
  if (!textEl || !event) return null;

  const x = event.clientX;
  const y = event.clientY;
  let range = null;

  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }

  if (!range || !range.startContainer) return null;

  // Ensure the click is inside this step's text element
  if (!textEl.contains(range.startContainer)) return null;

  let offset = 0;
  const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, null);

  let node = walker.nextNode();
  while (node) {
    if (node === range.startContainer) {
      offset += range.startOffset;
      break;
    } else {
      offset += node.textContent.length;
    }
    node = walker.nextNode();
  }

  const fullText = textEl.textContent || '';
  if (offset < 0) offset = 0;
  if (offset > fullText.length) offset = fullText.length;

  return offset;
}
