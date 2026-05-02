// Ingredient editor

function ingredientRendererHrefWithCurrentAdapter(href) {
  return href;
}

function ingredientRendererDataServiceIsSupabaseActive() {
  return !!(window.dataService && window.dataService.useSupabase);
}

async function resolveCanonicalIngredientNameForCommit(rawName) {
  const typed = String(rawName || '').trim();
  if (!typed) return { canonicalName: typed, lookupRow: null };
  if (
    window.dataService &&
    typeof window.dataService.lookupShoppingItemByName === 'function'
  ) {
    try {
      const row = await window.dataService.lookupShoppingItemByName({
        name: typed,
      });
      if (row && row.name != null && String(row.name).trim()) {
        return {
          canonicalName: String(row.name).trim(),
          lookupRow: row,
        };
      }
      return { canonicalName: typed, lookupRow: null };
    } catch (err) {
      console.warn('ingredient editor: lookupShoppingItemByName failed', err);
      if (ingredientRendererDataServiceIsSupabaseActive()) {
        return { canonicalName: typed, lookupRow: null };
      }
    }
  }
  return { canonicalName: typed, lookupRow: null };
}

async function applyGrammarToIngredientModelFromDoor(
  target,
  canonicalName,
  lookupRow,
) {
  const id = lookupRow && Number(lookupRow.id);
  if (
    !target ||
    !canonicalName ||
    !Number.isFinite(id) ||
    id <= 0 ||
    !window.dataService ||
    typeof window.dataService.loadShoppingItemDetail !== 'function'
  ) {
    return false;
  }
  try {
    const detail = await window.dataService.loadShoppingItemDetail({
      ingredientId: id,
      itemName: canonicalName,
    });
    if (!detail) return false;
    target.lemma = detail.lemma != null ? String(detail.lemma).trim() : '';
    target.pluralByDefault = !!detail.pluralByDefault;
    target.isMassNoun = !!detail.isMassNoun;
    target.pluralOverride =
      detail.pluralOverride != null ? String(detail.pluralOverride) : '';
    target.isDeprecated = !!detail.isRemoved;
    return true;
  } catch (err) {
    console.warn('⚠️ Could not fetch ingredient grammar via dataService:', err);
    return false;
  }
}

function maybeToastIngredientNameCanonicalized(typed, canonical) {
  const a = String(typed || '').trim();
  const b = String(canonical || '').trim();
  if (!a || !b || a === b) return;
  const msg = `“${a}” was updated to its standard name, “${b}”.`;
  try {
    if (typeof window.uiToast === 'function') {
      window.uiToast(msg);
      return;
    }
  } catch (_) {}
  try {
    if (window.ui && typeof window.ui.toast === 'function') {
      window.ui.toast({ message: msg });
    }
  } catch (_) {}
}

function attachIngredientInputAutosize(input) {
  if (!input) return;

  // Measure actual text width using a probe element
  const measureText = (text) => {
    const probe = document.createElement('span');
    probe.textContent = text || 'M'; // Use 'M' as baseline for empty
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    const cs = window.getComputedStyle(input);
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontSize = cs.fontSize;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.letterSpacing = cs.letterSpacing;

    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    document.body.removeChild(probe);
    return width;
  };

  const updateWidth = () => {
    const text = (input.value || '').trimEnd();
    const styles = window.getComputedStyle(input);
    const maxPx = parseFloat(styles.maxWidth) || 0;

    // Empty: use CSS `--ingredient-field-empty-width` (clear inline width)
    if (!text) {
      input.style.width = '';
      return;
    }

    // Filled: shrink-wrap to content (plus padding+border), clamp only to max width.
    let targetWidth = measureText(text);

    const padding =
      parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const border =
      parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth);
    targetWidth += padding + border;

    if (maxPx && targetWidth > maxPx) targetWidth = maxPx;

    input.style.width = `${targetWidth}px`;
  };

  // Scroll to beginning on focus and blur
  const scrollToStart = () => {
    input.scrollLeft = 0;
  };
  input.addEventListener('focus', scrollToStart);
  input.addEventListener('blur', scrollToStart);

  // Size once now, and again on each change
  input.addEventListener('input', updateWidth);
  updateWidth();
}

function normalizeIngredientHeadingText(raw) {
  if (raw == null) return '';
  const t = String(raw).replace(/\s+/g, ' ').trim();
  return t;
}

function findIngredientSectionForHeadingClientId(clientId) {
  const model = window.recipeData;
  const secs = Array.isArray(model?.sections) ? model.sections : [];
  for (const sec of secs) {
    const arr = Array.isArray(sec?.ingredients) ? sec.ingredients : [];
    const idx = arr.findIndex(
      (r) => r && r.rowType === 'heading' && r.headingClientId === clientId
    );
    if (idx !== -1) return { sec, idx };
  }
  return null;
}

function placeCaretAtStart(el) {
  if (!el) return;
  try {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {}
}

function getContentEditableSelectionOffsets(el) {
  if (!el) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  if (!range) return null;
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) {
    return null;
  }

  const computeOffset = (node, nodeOffset) => {
    if (node === el) {
      return Math.max(0, Math.min(nodeOffset, (el.textContent || '').length));
    }

    let offset = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      if (current === node) return offset + nodeOffset;
      offset += current.textContent.length;
      current = walker.nextNode();
    }
    return offset;
  };

  const start = computeOffset(range.startContainer, range.startOffset);
  const end = computeOffset(range.endContainer, range.endOffset);
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function renderIngredientHeading(row) {
  const div = document.createElement('div');
  div.className = 'ingredient-subsection-heading-line';
  const webMode = isIngredientRecipeWebModeActive();
  div.tabIndex = webMode ? -1 : 0;
  if (row && row.headingId != null) {
    div.dataset.headingId = String(row.headingId);
  }
  if (row && row.headingClientId) {
    div.dataset.headingClientId = String(row.headingClientId);
  }

  const text = document.createElement('span');
  text.className = 'ingredient-subsection-heading-text';
  if (row && row.headingId != null) {
    text.dataset.headingId = String(row.headingId);
  }
  if (row && row.headingClientId) {
    text.dataset.headingClientId = String(row.headingClientId);
  }

  const originalText = row && row.text != null ? String(row.text) : '';
  const normalized = normalizeIngredientHeadingText(originalText);
  text.textContent = normalized;
  text.dataset.placeholder = 'Section title';

  // Show "Section title" hint for empty headings (like instructions).
  if (!normalized) {
    text.textContent = '';
    text.classList.add('placeholder-prompt', 'placeholder-prompt--editblue');
  } else {
    text.classList.remove('placeholder-prompt', 'placeholder-prompt--editblue');
  }

  div.appendChild(text);

  if (webMode) {
    return div;
  }

  const handleMaybeDelete = (e) => {
    if (!e) return false;
    const wantsDelete = !!(e.ctrlKey || e.metaKey || e.type === 'contextmenu');
    if (!wantsDelete) return false;

    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {}

    const clientId =
      row && row.headingClientId ? String(row.headingClientId) : '';
    if (!clientId) return true;

    // If this heading is actively being edited, exit edit mode first.
    try {
      if (
        window._activeIngredientHeadingEditor &&
        window._activeIngredientHeadingEditor.clientId === clientId &&
        typeof window._activeIngredientHeadingEditor.cancel === 'function'
      ) {
        window._activeIngredientHeadingEditor.cancel();
      }
    } catch (_) {}

    // Delete the heading row from the recipe model (with undo).
    try {
      const found = findIngredientSectionForHeadingClientId(clientId);
      if (!found || !found.sec || !Array.isArray(found.sec.ingredients)) return true;
      const rowRef = found.sec.ingredients[found.idx];
      if (!rowRef) return true;
      if (typeof window.recipeEditorDeleteIngredientHeadingRow === 'function') {
        void window.recipeEditorDeleteIngredientHeadingRow({
          sectionRef: found.sec,
          rowRef,
          headingClientId: clientId,
        });
      } else {
        // Fallback: remove without confirm/undo
        found.sec.ingredients.splice(found.idx, 1);
        if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
          window.recipeEditorRerenderIngredientsFromModel();
        }
      }
    } catch (_) {}

    return true;
  };

  // Ctrl/⌘-click (or right-click) deletes the subhead.
  div.addEventListener('pointerdown', (e) => {
    handleMaybeDelete(e);
  });
  div.addEventListener('contextmenu', (e) => {
    if (e) e.preventDefault();
    handleMaybeDelete(e);
  });

  div.addEventListener('click', () => {
    // If already editing, do not re-enter edit mode; this breaks native
    // double-click/triple-click selection and click-drag selection.
    if (text.isContentEditable || div.classList.contains('editing')) return;

    const clientId =
      row && row.headingClientId ? String(row.headingClientId) : '';
    if (!clientId) return;

    // Only one heading editor at a time.
    if (
      window._editingIngredientHeadingClientId &&
      window._editingIngredientHeadingClientId !== clientId
    ) {
      return;
    }

    const wasDirty = typeof isDirty !== 'undefined' && isDirty === true;
    const startValue = normalizeIngredientHeadingText(row.text || '');

    window._editingIngredientHeadingClientId = clientId;
    div.classList.add('editing');

    const slotEl =
      div.closest && div.closest('.ingredient-slot')
        ? div.closest('.ingredient-slot')
        : null;
    const getOwnHeadingCtaButton = () => {
      if (!slotEl || !slotEl.querySelector) return null;
      return slotEl.querySelector(
        '.ingredient-add-cta-action[data-cta-action="add-heading"]'
      );
    };
    const syncHeadingActionAffordance = (disabled) => {
      const btn = getOwnHeadingCtaButton();
      if (!(btn instanceof HTMLElement)) return;
      btn.classList.toggle('ingredient-add-cta-action--inert', !!disabled);
      if (disabled) {
        btn.setAttribute('aria-disabled', 'true');
        btn.tabIndex = -1;
      } else {
        btn.removeAttribute('aria-disabled');
        btn.removeAttribute('tabindex');
      }
    };

    // Enter edit mode. Keep placeholder class until the user types.
    text.contentEditable = 'true';
    text.textContent = startValue;
    try {
      text.focus();
      // Place caret at end.
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(text);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}

    let hasPendingEdit = false;
    let suppressCommitOnce = false;

    const cleanup = () => {
      syncHeadingActionAffordance(false);
      text.contentEditable = 'false';
      div.classList.remove('editing');
      window._editingIngredientHeadingClientId = null;
      if (
        window._activeIngredientHeadingEditor &&
        window._activeIngredientHeadingEditor.clientId === clientId
      ) {
        window._activeIngredientHeadingEditor = null;
      }
      text.removeEventListener('keydown', onKeyDown);
      text.removeEventListener('blur', onBlur);
      text.removeEventListener('input', onInput);
    };

    const cancel = () => {
      suppressCommitOnce = true;

      // If this was a newly inserted empty heading, cancel should remove it.
      const isNewEmpty =
        (!row.headingId || row.headingId == null) && startValue === '';

      if (isNewEmpty) {
        const found = findIngredientSectionForHeadingClientId(clientId);
        if (found && found.sec && Array.isArray(found.sec.ingredients)) {
          found.sec.ingredients.splice(found.idx, 1);
        }
      } else {
        row.text = startValue;
      }

      cleanup();

      // If we dirtied only via this edit, revert dirty flag by reverting changes.
      if (!wasDirty && typeof revertChanges === 'function') {
        revertChanges();
      }

      if (
        typeof window.recipeEditorRerenderIngredientsFromModel === 'function'
      ) {
        window.recipeEditorRerenderIngredientsFromModel();
      }
    };

    const commit = () => {
      if (suppressCommitOnce) return;

      const next = normalizeIngredientHeadingText(text.textContent || '');
      if (!next) {
        const found = findIngredientSectionForHeadingClientId(clientId);
        if (found && found.sec && Array.isArray(found.sec.ingredients)) {
          found.sec.ingredients.splice(found.idx, 1);
        }
      } else {
        row.text = next;
      }

      cleanup();

      if (
        typeof window.recipeEditorRerenderIngredientsFromModel === 'function'
      ) {
        window.recipeEditorRerenderIngredientsFromModel();
      }
    };

    // Expose this editor so other actions (like ctrl-click inserting another heading)
    // can commit/delete the active heading before forcing a rerender.
    window._activeIngredientHeadingEditor = {
      clientId,
      slotElement: slotEl,
      isEmpty: () => normalizeIngredientHeadingText(text.textContent || '') === '',
      commit,
      cancel,
    };
    syncHeadingActionAffordance(
      normalizeIngredientHeadingText(text.textContent || '') === ''
    );

    const onInput = (e) => {
      if (e && e.isTrusted === false) return;
      if (hasPendingEdit) return;
      hasPendingEdit = true;
      if (typeof markDirty === 'function') {
        markDirty();
      }

      // Once the user types something non-empty, hide the placeholder hint.
      try {
        const raw = text.textContent || '';
        const v = normalizeIngredientHeadingText(raw);
        if (v) {
          text.classList.remove(
            'placeholder-prompt',
            'placeholder-prompt--editblue'
          );
        }
        syncHeadingActionAffordance(!v);
      } catch (_) {}
    };

    const onBlur = () => commit();

    const onKeyDown = (e) => {
      if (!e) return;
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

        const delta = e.key === 'ArrowUp' ? -1 : 1;
        const availability =
          typeof window.recipeEditorGetIngredientMoveAvailability === 'function'
            ? window.recipeEditorGetIngredientMoveAvailability({ rowRef: row })
            : { canMoveUp: false, canMoveDown: false };
        const canMove =
          delta < 0 ? availability.canMoveUp === true : availability.canMoveDown === true;
        if (!canMove) return;

        const selection = getContentEditableSelectionOffsets(text);
        const caretIndex =
          selection && Number.isFinite(selection.start)
            ? selection.start
            : (text.textContent || '').length;
        row.text = normalizeIngredientHeadingText(text.textContent || '');

        suppressCommitOnce = true;
        cleanup();

        if (typeof window.recipeEditorMoveIngredientRowByDelta === 'function') {
          window.recipeEditorMoveIngredientRowByDelta({
            rowRef: row,
            delta,
            reopenHeadingEditor: true,
            initialCaretIndex: caretIndex,
          });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        text.blur();
      } else if (
        e.key === 'Tab' &&
        !e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }

        const found = findIngredientSectionForHeadingClientId(clientId);
        if (!found || !found.sec || !Array.isArray(found.sec.ingredients)) return;

        const nameAtStart = normalizeIngredientHeadingText(text.textContent || '');
        const demotedIngredient = {
          quantity: '',
          quantityMin: null,
          quantityMax: null,
          quantityIsApprox: false,
          unit: '',
          name: nameAtStart,
          size: '',
          variant: '',
          prepNotes: '',
          parentheticalNote: '',
          isOptional: false,
          substitutes: [],
          locationAtHome: '',
          isRecipe: false,
          linkedRecipeId: null,
          linkedRecipeTitle: '',
          recipeText: '',
          sortOrder:
            row && Number.isFinite(Number(row.sortOrder))
              ? Number(row.sortOrder)
              : null,
          clientId: `tmp-ing-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          lemma: '',
          pluralByDefault: null,
          isMassNoun: null,
          pluralOverride: '',
          isDeprecated: false,
        };
        found.sec.ingredients.splice(found.idx, 1, demotedIngredient);
        if (typeof markDirty === 'function') markDirty();

        suppressCommitOnce = true;
        cleanup();

        const parentEl = div.parentNode;
        if (parentEl && typeof window.openIngredientEditRow === 'function') {
          window.openIngredientEditRow({
            parent: parentEl,
            replaceEl: div,
            mode: 'update',
            seedLine: demotedIngredient,
            initialFocusField: 'name',
            initialCaretIndex: 0,
          });
          return;
        }

        if (
          typeof window.recipeEditorRerenderIngredientsFromModel === 'function'
        ) {
          window.recipeEditorRerenderIngredientsFromModel();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    text.addEventListener('input', onInput);
    text.addEventListener('blur', onBlur);
    text.addEventListener('keydown', onKeyDown);
  });

  return div;
}

if (typeof window !== 'undefined' && !window.renderIngredientHeading) {
  window.renderIngredientHeading = renderIngredientHeading;
}

function openLinkedRecipe(recipeId) {
  const rid = Number(recipeId);
  if (!Number.isFinite(rid) || rid <= 0) return;
  try {
    if (typeof window.openRecipe === 'function') {
      window.openRecipe(rid);
      return;
    }
  } catch (_) {}
  try {
    if (typeof window.uiToast === 'function') {
      window.uiToast('Unable to open linked recipe in this context.');
    }
  } catch (_) {
    // ignore
  }
}

function navigateToShoppingItemEditor(selection) {
  const normalizedId = Number(selection && selection.id);
  const normalizedName = String(selection && selection.name ? selection.name : '').trim();
  if (!Number.isFinite(normalizedId) || normalizedId <= 0 || !normalizedName) return;

  const navigate = () => {
    sessionStorage.setItem('selectedShoppingItemId', String(normalizedId));
    sessionStorage.setItem('selectedShoppingItemName', normalizedName);
    sessionStorage.removeItem('selectedShoppingItemIsNew');
    window.location.href =
      ingredientRendererHrefWithCurrentAdapter('shoppingEditor.html');
  };

  if (typeof window.recipeEditorAttemptExit === 'function') {
    void window.recipeEditorAttemptExit({
      reason: 'manage',
      onClean: navigate,
      onDiscard: navigate,
      onSaveSuccess: navigate,
    });
    return;
  }

  navigate();
}

async function findShoppingItemMatchByNameViaDataService(rawName) {
  const name = String(rawName || '').trim();
  if (!name) return null;
  if (
    window.dataService &&
    typeof window.dataService.lookupShoppingItemByName === 'function'
  ) {
    try {
      return (await window.dataService.lookupShoppingItemByName({ name })) || null;
    } catch (err) {
      console.warn('ingredient renderer: lookupShoppingItemByName failed', err);
      return null;
    }
  }
  return null;
}

function isIngredientRecipeWebModeActive() {
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

async function navigateToShoppingListTarget(rawName) {
  const name = String(rawName || '').trim();
  const match = await findShoppingItemMatchByNameViaDataService(name);
  try {
    if (match && Number.isFinite(Number(match.id)) && Number(match.id) > 0) {
      sessionStorage.setItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetId,
        String(Math.trunc(Number(match.id)))
      );
      sessionStorage.setItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetName,
        String(match.name || name).trim()
      );
    } else if (name) {
      sessionStorage.removeItem(window.favoriteEatsSessionKeys.shoppingNavTargetId);
      sessionStorage.setItem(window.favoriteEatsSessionKeys.shoppingNavTargetName, name);
    } else {
      sessionStorage.removeItem(window.favoriteEatsSessionKeys.shoppingNavTargetId);
      sessionStorage.removeItem(window.favoriteEatsSessionKeys.shoppingNavTargetName);
    }
  } catch (_) {}
  window.location.href =
    ingredientRendererHrefWithCurrentAdapter('shopping.html');
}

function isIngredientMasterLinkActive(linkEl, e) {
  if (!(linkEl instanceof HTMLElement)) return false;
  if (!linkEl.classList.contains('ingredient-master-link')) return false;
  if (!e || !e.altKey) return false;
  const slot = linkEl.closest('.ingredient-slot');
  return !!(slot && slot.classList.contains('ingredient-slot--hint-active'));
}

function buildIngredientMasterLink(label, line) {
  const link = document.createElement('a');
  const webMode = isIngredientRecipeWebModeActive();
  link.href = webMode
    ? ingredientRendererHrefWithCurrentAdapter('shopping.html')
    : '#';
  link.className = webMode ? 'ingredient-shopping-link' : 'ingredient-master-link';
  link.textContent = label;
  link.tabIndex = webMode ? 0 : -1;

  link.addEventListener('click', (e) => {
    if (!e) return;
    e.preventDefault();
    if (!webMode && !isIngredientMasterLinkActive(link, e)) return;
    e.stopPropagation();

    void (async () => {
      if (webMode) {
        await navigateToShoppingListTarget(line && line.name);
        return;
      }

      const match = await findShoppingItemMatchByNameViaDataService(
        line && line.name
      );
      if (match) {
        navigateToShoppingItemEditor(match);
        return;
      }

      const fallback = () => {
        window.location.href =
          ingredientRendererHrefWithCurrentAdapter('shopping.html');
      };
      if (typeof window.recipeEditorAttemptExit === 'function') {
        void window.recipeEditorAttemptExit({
          reason: 'manage',
          onClean: fallback,
          onDiscard: fallback,
          onSaveSuccess: fallback,
        });
        return;
      }
      fallback();
    })();
  });

  return link;
}

function renderIngredient(line) {
  // NOTE: edit-row scaffold added further down

  const div = document.createElement('div');
  div.className = 'ingredient-line';
  const webMode = isIngredientRecipeWebModeActive();
  div.tabIndex = webMode ? -1 : 0;
  if (line && line.rimId != null) {
    div.dataset.rimId = String(line.rimId);
  }
  if (line && line.clientId) {
    div.dataset.clientId = String(line.clientId);
  }
  div.dataset.isOptional = line && line.isOptional ? '1' : '0';
  div.dataset.quantity = line.quantity;
  div.dataset.unit = line.unit;
  div.dataset.name = line.name;
  if (line && line.isDeprecated) {
    div.classList.add('ingredient-line--deprecated');
  }
  if (line && line.variantDeprecated) {
    div.classList.add('ingredient-line--variant-deprecated');
  }
  if (line && line.isAlt) {
    div.classList.add('ingredient-line--is-alt');
  }

  const textSpan = document.createElement('span');
  textSpan.className = 'ingredient-text';
  const prettifyDisplayText =
    typeof window !== 'undefined' && typeof window.prettifyDisplayText === 'function'
      ? window.prettifyDisplayText
      : (text) => String(text == null ? '' : text);
  const fallbackName = [String(line?.variant || '').trim(), String(line?.name || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
  const displayParts =
    typeof window !== 'undefined' && typeof window.getIngredientDisplayParts === 'function'
      ? window.getIngredientDisplayParts(line)
      : {
          leadText: '',
          nameText: fallbackName,
          prepText: String(line?.prepNotes || '').trim(),
          substituteTexts: [],
          parentheticalText: '',
        };

  const linkedRecipeIdRaw = Number(line && line.linkedRecipeId);
  const linkedRecipeId =
    Number.isFinite(linkedRecipeIdRaw) && linkedRecipeIdRaw > 0
      ? linkedRecipeIdRaw
      : null;
  const hasLinkedRecipe = linkedRecipeId != null;
  const linkedRecipeLabel = displayParts.nameText || String(line?.recipeText || '').trim();
  const ingredientNameLabel = prettifyDisplayText(displayParts.nameText);

  if (hasLinkedRecipe) {
    // clickable link only for the linked recipe label
    const link = document.createElement('a');
    link.href = '#';
    link.classList.add('sub-recipe-link');
    link.textContent = linkedRecipeLabel;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openLinkedRecipe(linkedRecipeId);
    });

    if (displayParts.leadText) {
      textSpan.appendChild(
        document.createTextNode(`${prettifyDisplayText(displayParts.leadText)} `)
      );
    }

    textSpan.appendChild(link);

    if (displayParts.prepText) {
      textSpan.appendChild(
        document.createTextNode(`, ${prettifyDisplayText(displayParts.prepText)}`)
      );
    }

    if (displayParts.substituteTexts.length > 0) {
      textSpan.appendChild(
        document.createTextNode(
          ` or ${prettifyDisplayText(displayParts.substituteTexts.join(' or '))}`
        )
      );
    }

    if (displayParts.parentheticalText) {
      textSpan.appendChild(
        document.createTextNode(
          ` (${prettifyDisplayText(displayParts.parentheticalText)})`
        )
      );
    }
  } else {
    if (displayParts.leadText) {
      textSpan.appendChild(
        document.createTextNode(`${prettifyDisplayText(displayParts.leadText)} `)
      );
    }

    if (ingredientNameLabel) {
      textSpan.appendChild(buildIngredientMasterLink(ingredientNameLabel, line));
    }

    if (displayParts.prepText) {
      textSpan.appendChild(
        document.createTextNode(`, ${prettifyDisplayText(displayParts.prepText)}`)
      );
    }

    if (displayParts.substituteTexts.length > 0) {
      textSpan.appendChild(
        document.createTextNode(
          ` or ${prettifyDisplayText(displayParts.substituteTexts.join(' or '))}`
        )
      );
    }

    if (displayParts.parentheticalText) {
      textSpan.appendChild(
        document.createTextNode(
          ` (${prettifyDisplayText(displayParts.parentheticalText)})`
        )
      );
    }
  }

  // Save raw quantity separately for editing
  textSpan.dataset.rawQuantity = line.quantity || '';

  if (line && line.isAlt) {
    const orPrefix = document.createElement('span');
    orPrefix.className = 'ingredient-alt-prefix';
    orPrefix.textContent = 'OR\u00A0';
    div.appendChild(orPrefix);
  }
  div.appendChild(textSpan);

  if (webMode) {
    return div;
  }

  // Existing ingredient rows: click → open multi-field editor (update mode)
  const handleMaybeDelete = (e) => {
    if (!e) return false;
    // Delete gesture:
    // - ctrl/⌘-click (consistent with other list pages)
    // - right-click (contextmenu) should behave the same
    const wantsDelete = !!(e.ctrlKey || e.metaKey || e.type === 'contextmenu');
    if (!wantsDelete) return false;
    // Never delete via ctrl-click on sub-recipe links.
    try {
      if (e.target && e.target.closest && e.target.closest('a')) return false;
    } catch (_) {}

    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {}

    // Delete recipe-local row (never the global shopping item).
    try {
      const model = window.recipeData;
      const secs = Array.isArray(model?.sections) ? model.sections : [];
      const first = secs[0] || null;
      if (!first || !Array.isArray(first.ingredients)) return true;

      const rid = line && line.rimId != null ? String(line.rimId) : '';
      const cid = line && line.clientId ? String(line.clientId) : '';
      const hit = first.ingredients.find((ing) => {
        if (!ing || ing.rowType === 'heading') return false;
        if (rid && ing.rimId != null && String(ing.rimId) === rid) return true;
        if (cid && ing.clientId && String(ing.clientId) === cid) return true;
        return ing === line;
      });
      if (!hit) return true;

      if (typeof window.recipeEditorDeleteIngredientRow === 'function') {
        void window.recipeEditorDeleteIngredientRow({
          sectionRef: first,
          rowRef: hit,
          focusId: rid || cid,
          focusBy: rid ? 'rimId' : 'clientId',
        });
      }
    } catch (_) {}

    return true;
  };

  // Ctrl-click on mac can be interpreted as contextmenu and may not fire click.
  div.addEventListener('pointerdown', (e) => {
    handleMaybeDelete(e);
  });
  div.addEventListener('contextmenu', (e) => {
    // Only suppress native menu when we actually consume delete.
    if (handleMaybeDelete(e) && e) e.preventDefault();
  });

  div.addEventListener('click', (e) => {
    const clickedLink =
      e && e.target && e.target.closest ? e.target.closest('a') : null;
    if (clickedLink && clickedLink.classList.contains('sub-recipe-link')) return;
    if (
      clickedLink &&
      clickedLink.classList.contains('ingredient-master-link') &&
      isIngredientMasterLinkActive(clickedLink, e)
    ) {
      return;
    }

    // Ctrl/⌘-click deletes the row (recipe-local).
    if (handleMaybeDelete(e)) return;
    if (e && (e.ctrlKey || e.metaKey)) return;

    const parent = div.parentNode;
    if (!parent) return;

    openIngredientEditRow({
      parent,
      replaceEl: div,
      mode: 'update',
      seedLine: line,
    });
  });

  return div;
}

function openIngredientEditRow({
  parent,
  replaceEl,
  mode,
  seedLine,
  insertAtIndex,
  initialFocusField,
  initialCaretIndex,
}) {
  if (!parent || !replaceEl) return;
  const isInsert = mode === 'insert';
  const insertAt = insertAtIndex;
  const replaceElIsCta = replaceEl.classList.contains('ingredient-add-cta');
  const headerHintSourceEl = replaceEl._ingredientHeaderHintSourceEl || null;
  const restoreHeaderHintPersistent =
    replaceEl._ingredientHeaderHintRestorePersistent === true;

  const row = document.createElement('div');
  row.className = 'ingredient-edit-row editing';
  row.dataset.isEditing = 'true';
  if (seedLine && seedLine.isDeprecated) {
    row.classList.add('ingredient-edit-row--deprecated');
  }
  if (seedLine && seedLine.variantDeprecated) {
    row.classList.add('ingredient-edit-row--variant-deprecated');
  }

  // Edit-mode delete gesture: ctrl/⌘-click or right-click on blank tray surface.
  // Guard interactive controls so edit interactions stay safe and predictable.
  const editTargetIsInteractive = (target) => {
    if (!target || !target.closest) return false;
    return !!target.closest(
      'a, input, textarea, button, select, label, .field-pill, .ingredient-edit-cell'
    );
  };

  const attemptDeleteFromEditRow = async () => {
    if (mode === 'insert') return false;
    try {
      if (typeof commit === 'function') await commit();
    } catch (_) {}

    // After commit, the original edit row may have been replaced; resolve model row fresh.
    try {
      const model = window.recipeData;
      const secs = Array.isArray(model?.sections) ? model.sections : [];
      let targetSection = null;
      let targetRow = null;

      const rid = seedLine && seedLine.rimId != null ? String(seedLine.rimId) : '';
      const cid = seedLine && seedLine.clientId ? String(seedLine.clientId) : '';

      for (const sec of secs) {
        const arr = Array.isArray(sec?.ingredients) ? sec.ingredients : [];
        const hit = arr.find((ing) => {
          if (!ing || ing.rowType === 'heading') return false;
          if (rid && ing.rimId != null && String(ing.rimId) === rid) return true;
          if (cid && ing.clientId && String(ing.clientId) === cid) return true;
          return false;
        });
        if (hit) {
          targetSection = sec;
          targetRow = hit;
          break;
        }
      }
      if (!targetSection || !targetRow) return false;

      if (typeof window.recipeEditorDeleteIngredientRow === 'function') {
        return !!(await window.recipeEditorDeleteIngredientRow({
          sectionRef: targetSection,
          rowRef: targetRow,
          focusId:
            targetRow.rimId != null ? String(targetRow.rimId) : targetRow.clientId,
          focusBy: targetRow.rimId != null ? 'rimId' : 'clientId',
        }));
      }
    } catch (_) {}

    return false;
  };

  const maybeDeleteFromEditRowEvent = (e) => {
    if (!e) return false;
    const wantsDelete = !!(e.ctrlKey || e.metaKey || e.type === 'contextmenu');
    if (!wantsDelete) return false;
    if (editTargetIsInteractive(e.target)) return false;

    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {}

    void attemptDeleteFromEditRow();
    return true;
  };

  row.addEventListener('pointerdown', (e) => {
    maybeDeleteFromEditRowEvent(e);
  });
  row.addEventListener('contextmenu', (e) => {
    maybeDeleteFromEditRowEvent(e);
  });

  // Read-mode-only affordances: mark that an ingredient row is being edited.
  try {
    document.body.classList.add('ingredient-editing');
  } catch (_) {}

  const syncAddIngredientActionAffordance = (disabled) => {
    const shouldDisable = !!disabled;
    try {
      document.body.classList.toggle(
        'ingredient-insert-blank-active',
        shouldDisable
      );
    } catch (_) {}

    try {
      const buttons = document.querySelectorAll(
        '.ingredient-add-cta-action[data-cta-action="add-ingredient"]'
      );
      buttons.forEach((btn) => {
        if (!(btn instanceof HTMLElement)) return;
        if (shouldDisable) {
          btn.setAttribute('aria-disabled', 'true');
          btn.tabIndex = -1;
        } else {
          btn.removeAttribute('aria-disabled');
          btn.removeAttribute('tabindex');
        }
      });
    } catch (_) {}
  };

  // Hidden focus target to support a "neutral" state within edit mode:
  // clicking tray background can move focus off inputs without exiting edit mode.
  const blurTarget = document.createElement('div');
  blurTarget.className = 'inline-edit-blur-target';
  blurTarget.tabIndex = -1;
  blurTarget.setAttribute('aria-hidden', 'true');
  row.appendChild(blurTarget);

  // Dirty should flip on first keystroke (not blur/commit).
  let hasPendingEdit = false;
  const markDirtyOnce = () => {
    if (hasPendingEdit) return;
    hasPendingEdit = true;
    if (typeof markDirty === 'function') {
      markDirty();
    }
  };

  // When editing an existing ingredient, make sure we update the real in-memory model
  // (`window.recipeData`) that Save reads from. The rendered `seedLine` might be a copy.
  let modelRef = seedLine || null;
  let sectionRef = null;
  if (!isInsert && seedLine && seedLine.rimId != null) {
    const rid = String(seedLine.rimId);
    const model = window.recipeData;
    const secs = Array.isArray(model?.sections) ? model.sections : [];
    for (const sec of secs) {
      const arr = Array.isArray(sec?.ingredients) ? sec.ingredients : [];
      const hit = arr.find((ing) => ing && String(ing.rimId) === rid);
      if (hit) {
        modelRef = hit;
        sectionRef = sec;
        break;
      }
    }
  }
  // Fallback: match by clientId when rimId doesn't exist yet (new unsaved rows).
  if (!isInsert && !sectionRef && seedLine && seedLine.clientId) {
    const cid = String(seedLine.clientId);
    const model = window.recipeData;
    const secs = Array.isArray(model?.sections) ? model.sections : [];
    for (const sec of secs) {
      const arr = Array.isArray(sec?.ingredients) ? sec.ingredients : [];
      const hit = arr.find(
        (ing) => ing && ing.clientId && String(ing.clientId) === cid
      );
      if (hit) {
        modelRef = hit;
        sectionRef = sec;
        break;
      }
    }
  }

  let moveIngredientEditRowByDelta = null;
  const appendMoveControlsToEditRow = () => {
    if (isInsert || !modelRef) return;
    if (typeof window.recipeEditorMoveIngredientRowByDelta !== 'function') return;

    row.classList.add('ingredient-edit-row--reorderable');

    const moveControls = document.createElement('div');
    moveControls.className = 'ingredient-row-move-controls';
    moveControls.setAttribute('aria-label', 'Reorder ingredient');

    const moveUpBtn = document.createElement('button');
    moveUpBtn.className = 'ingredient-row-move-btn';
    moveUpBtn.type = 'button';
    moveUpBtn.dataset.moveDir = 'up';
    moveUpBtn.setAttribute('aria-label', 'Move ingredient up');
    const moveUpIcon = document.createElement('span');
    moveUpIcon.className = 'material-symbols-outlined ingredient-row-move-icon';
    moveUpIcon.setAttribute('aria-hidden', 'true');
    moveUpIcon.textContent = 'arrow_upward_alt';
    moveUpBtn.appendChild(moveUpIcon);

    const moveDownBtn = document.createElement('button');
    moveDownBtn.className = 'ingredient-row-move-btn';
    moveDownBtn.type = 'button';
    moveDownBtn.dataset.moveDir = 'down';
    moveDownBtn.setAttribute('aria-label', 'Move ingredient down');
    const moveDownIcon = document.createElement('span');
    moveDownIcon.className = 'material-symbols-outlined ingredient-row-move-icon';
    moveDownIcon.setAttribute('aria-hidden', 'true');
    moveDownIcon.textContent = 'arrow_downward_alt';
    moveDownBtn.appendChild(moveDownIcon);

    const moveAvailability =
      typeof window.recipeEditorGetIngredientMoveAvailability === 'function'
        ? window.recipeEditorGetIngredientMoveAvailability({ rowRef: modelRef })
        : { canMoveUp: false, canMoveDown: false };

    if (!moveAvailability.canMoveUp) {
      moveUpBtn.disabled = true;
      moveUpBtn.setAttribute('aria-disabled', 'true');
    }
    if (!moveAvailability.canMoveDown) {
      moveDownBtn.disabled = true;
      moveDownBtn.setAttribute('aria-disabled', 'true');
    }

    moveIngredientEditRowByDelta = async (delta) => {
      const availability =
        typeof window.recipeEditorGetIngredientMoveAvailability === 'function'
          ? window.recipeEditorGetIngredientMoveAvailability({ rowRef: modelRef })
          : { canMoveUp: false, canMoveDown: false };
      const canMove =
        delta < 0 ? availability.canMoveUp === true : availability.canMoveDown === true;
      if (!canMove) return;

      const activeInput =
        row.querySelector('.ingredient-edit-input:focus') ||
        document.activeElement;
      const initialFocusField =
        activeInput && activeInput.dataset ? activeInput.dataset.field || '' : '';
      const initialCaretIndex =
        activeInput &&
        typeof activeInput.selectionStart === 'number' &&
        Number.isFinite(activeInput.selectionStart)
          ? activeInput.selectionStart
          : 0;

      try {
        if (typeof commit === 'function') await commit();
      } catch (_) {
        return;
      }

      window.recipeEditorMoveIngredientRowByDelta({
        rowRef: modelRef,
        delta,
        reopenEditor: true,
        initialFocusField,
        initialCaretIndex,
      });
    };

    moveUpBtn.addEventListener('click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      void moveIngredientEditRowByDelta(-1);
    });
    moveDownBtn.addEventListener('click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      void moveIngredientEditRowByDelta(1);
    });

    moveControls.appendChild(moveUpBtn);
    moveControls.appendChild(moveDownBtn);
    row.appendChild(moveControls);
  };

  // Helper to make a pill-like label span
  const makePill = (text) => {
    const s = document.createElement('span');
    s.className = 'field-pill ingredient-pill';
    s.textContent = text;
    return s;
  };

  appendMoveControlsToEditRow();

  // Container for pill + input
  const makeCell = ({ key, label, isBoolean = false }) => {
    const cell = document.createElement('div');
    cell.className = 'ingredient-edit-cell';
    cell.classList.add(`ingredient-edit-cell--${key}`);

    const input = document.createElement('input');
    input.className = 'ingredient-edit-input';
    input.classList.add(`ingredient-edit-input--${key}`);
    input.dataset.field = key;

    // Boolean fields are rendered as checkbox toggles.
    // Wrap pill + checkbox in a <label> so clicking the pill toggles with trusted events.
    if (isBoolean) {
      input.type = 'checkbox';
      const wrap = document.createElement('label');
      wrap.className = 'ingredient-edit-toggle';

      const pill = makePill(label);
      wrap.appendChild(pill);
      wrap.appendChild(input);
      cell.appendChild(wrap);
      return cell;
    }

    // Default: pill + text input
    input.type = 'text';
    const pill = makePill(label);
    cell.appendChild(pill);

    if (typeof wireLabelToInput === 'function') {
      wireLabelToInput(pill, input);
    }
    if (typeof attachIngredientInputAutosize === 'function') {
      attachIngredientInputAutosize(input);
    }

    cell.appendChild(input);
    return cell;
  };

  // Location is edited elsewhere; suppress it here.
  // Field order: QtyMin, QtyMax, Unit, Name, Var, Size, Prep, Notes, QtyIsApprox, IsAlt, IsOpt, LinkedRecipe
  const fieldsConfig = [
    { key: 'qtymin', label: 'QtyMin' },
    { key: 'qtymax', label: 'QtyMax' },
    { key: 'unit', label: 'Unit' },
    { key: 'name', label: 'Name' },
    { key: 'var', label: 'Var' },
    { key: 'size', label: 'Size' },
    { key: 'prep', label: 'Prep' },
    { key: 'notes', label: 'Notes' },
    { key: 'isaprx', label: 'QtyIsApprox', isBoolean: true },
    { key: 'isalt', label: 'IsAlt', isBoolean: true },
    { key: 'isopt', label: 'IsOpt', isBoolean: true },
    { key: 'recipe', label: 'LinkedRecipe' },
  ];
  fieldsConfig.forEach((cfg) => row.appendChild(makeCell(cfg)));

  // Disable IsAlt if there is no ingredient row directly above this row.
  // "Directly above" means the nearest renderable row, skipping placeholders.
  // A heading row above also disqualifies (can't be an alt of a heading).
  (() => {
    const isAltInput = row.querySelector('.ingredient-edit-input[data-field="isalt"]');
    if (!isAltInput) return;

    const sec = sectionRef || (window.recipeData?.sections?.[0] ?? null);
    const list = Array.isArray(sec?.ingredients) ? sec.ingredients : [];

    let thisIdx = -1;
    if (isInsert) {
      const raw = Number(insertAt);
      thisIdx = Number.isFinite(raw) ? raw : list.length;
    } else if (modelRef) {
      thisIdx = list.indexOf(modelRef);
    }

    let ingredientAbove = false;
    for (let i = thisIdx - 1; i >= 0; i--) {
      const r = list[i];
      if (!r || r.isPlaceholder) continue;
      ingredientAbove = r.rowType !== 'heading';
      break;
    }

    if (!ingredientAbove) {
      isAltInput.disabled = true;
      isAltInput.checked = false;
      const cell = isAltInput.closest('.ingredient-edit-cell');
      if (cell) cell.classList.add('ingredient-edit-cell--disabled');
    }
  })();

  const qtyMinInput = row.querySelector(
    '.ingredient-edit-input[data-field="qtymin"]'
  );
  const qtyMaxInput = row.querySelector(
    '.ingredient-edit-input[data-field="qtymax"]'
  );
  const recipeInput = row.querySelector(
    '.ingredient-edit-input[data-field="recipe"]'
  );
  const qtyMirrorState = {
    minTouched: false,
    maxTouched: false,
    locked: false,
  };

  const setQtyFieldValue = (inputEl, nextValue) => {
    if (!inputEl) return;
    const next = String(nextValue == null ? '' : nextValue);
    if (inputEl.value === next) return;
    inputEl.value = next;
    // Keep autosize in sync without triggering dirty-state listeners.
    try {
      inputEl.dispatchEvent(new Event('input', { bubbles: false }));
    } catch (_) {}
  };

  const parseQtyMirrorNumber = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return null;
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const maybeMirrorQuantityFields = (source) => {
    if (qtyMirrorState.locked || !qtyMinInput || !qtyMaxInput) return;

    const minVal = String(qtyMinInput.value || '').trim();
    const maxVal = String(qtyMaxInput.value || '').trim();

    if (source === 'min') {
      // Keep syncing into untouched sibling field (don't stop on intermediate values like ".").
      if (!qtyMirrorState.maxTouched && maxVal !== minVal) {
        if (minVal === '') {
          setQtyFieldValue(qtyMaxInput, '');
          return;
        }
        const minNum = parseQtyMirrorNumber(minVal);
        // Partial min (e.g. "0", "0." while typing "0.5") must not overwrite max,
        // or a mirrored ceiling like "1" is lost before min becomes valid.
        if (minNum == null) {
          return;
        }
        const maxNum = parseQtyMirrorNumber(maxVal);
        if (maxNum != null && maxNum >= minNum) {
          return;
        }
        setQtyFieldValue(qtyMaxInput, minVal);
      }
      return;
    }

    if (source === 'max') {
      if (!qtyMirrorState.minTouched && minVal !== maxVal) {
        setQtyFieldValue(qtyMinInput, maxVal);
      }
    }
  };

  const handleQtyInput = (source, e) => {
    if (!e || e.isTrusted === false) return;
    if (source === 'min') qtyMirrorState.minTouched = true;
    if (source === 'max') qtyMirrorState.maxTouched = true;

    maybeMirrorQuantityFields(source);

    // After both fields have direct user intent, stop all auto-mirroring.
    if (qtyMirrorState.minTouched && qtyMirrorState.maxTouched) {
      qtyMirrorState.locked = true;
    }
  };

  if (qtyMinInput) {
    qtyMinInput.addEventListener('input', (e) => handleQtyInput('min', e));
  }
  if (qtyMaxInput) {
    qtyMaxInput.addEventListener('input', (e) => handleQtyInput('max', e));
  }

  const dispatchSyntheticInput = (inputEl) => {
    if (!inputEl) return;
    try {
      inputEl.dispatchEvent(new Event('input', { bubbles: false }));
    } catch (_) {}
  };

  const getCurrentRecipeIdForLinkValidation = () => {
    const raw =
      window.recipeData && window.recipeData.id != null
        ? Number(window.recipeData.id)
        : null;
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  };

  const lookupRecipeByTitle = async (rawTitle) => {
    const title = String(rawTitle || '').trim();
    if (!title) return null;
    const parentId = getCurrentRecipeIdForLinkValidation();
    const wanted = title.toLowerCase();
    if (window.dataService && typeof window.dataService.listRecipes === 'function') {
      try {
        const recipes = await window.dataService.listRecipes();
        const match = (Array.isArray(recipes) ? recipes : [])
          .map((recipe) => ({
            id: Number(recipe && recipe.id),
            title: String(recipe && recipe.title != null ? recipe.title : '').trim(),
          }))
          .filter(
            (recipe) =>
              Number.isFinite(recipe.id) &&
              recipe.id > 0 &&
              recipe.title &&
              recipe.title.toLowerCase() === wanted &&
              (parentId == null || recipe.id !== parentId)
          )
          .sort((a, b) => a.id - b.id)[0];
        if (match) return match;
      } catch (err) {
        console.warn('recipe link validation: listRecipes failed', err);
        if (ingredientRendererDataServiceIsSupabaseActive()) return null;
      }
    }

    return null;
  };

  const applyRecipeValidationToInputs = async () => {
    if (!recipeInput) {
      return {
        isRecipe: false,
        linkedRecipeId: null,
        linkedRecipeTitle: '',
        recipeText: '',
      };
    }
    if (!String(recipeInput.value || '').trim()) {
      return {
        isRecipe: false,
        linkedRecipeId: null,
        linkedRecipeTitle: '',
        recipeText: '',
      };
    }

    const match = await lookupRecipeByTitle(recipeInput.value);
    const currentRecipeId = getCurrentRecipeIdForLinkValidation();
    if (!match) {
      recipeInput.value = '';
      dispatchSyntheticInput(recipeInput);
      return {
        isRecipe: false,
        linkedRecipeId: null,
        linkedRecipeTitle: '',
        recipeText: '',
      };
    }
    if (currentRecipeId != null && Number(match.id) === currentRecipeId) {
      recipeInput.value = '';
      dispatchSyntheticInput(recipeInput);
      return {
        isRecipe: false,
        linkedRecipeId: null,
        linkedRecipeTitle: '',
        recipeText: '',
      };
    }

    recipeInput.value = match.title;
    dispatchSyntheticInput(recipeInput);
    return {
      isRecipe: true,
      linkedRecipeId: match.id,
      linkedRecipeTitle: match.title,
      recipeText: match.title,
    };
  };

  if (recipeInput) {
    const maybePopulateNameFromRecipe = (recipeTitle) => {
      if (!recipeTitle) return;
      const nameInp = row.querySelector('.ingredient-edit-input[data-field="name"]');
      if (!nameInp || nameInp.value.trim()) return;
      nameInp.value = recipeTitle;
      try {
        nameInp.dispatchEvent(new Event('input', { bubbles: false }));
      } catch (_) {}
    };

    recipeInput.addEventListener('blur', () => {
      void (async () => {
        const result = await applyRecipeValidationToInputs();
        if (result && result.isRecipe && result.recipeText) {
          maybePopulateNameFromRecipe(result.recipeText);
        }
      })();
    });
  }

  // Any keystroke in any ingredient field should immediately enable Cancel/Save.
  row.addEventListener('input', (e) => {
    // Ignore synthetic/programmatic input events (e.g. our own prefill/autosize nudges).
    if (e && e.isTrusted === false) return;
    const t = e && e.target;
    if (t && t.classList && t.classList.contains('ingredient-edit-input')) {
      markDirtyOnce();
      syncActiveIngredientEditorState();
    }
  });

  // Checkbox toggles often fire `change` (not consistently `input`), but they
  // should still enable Cancel/Save immediately.
  row.addEventListener('change', (e) => {
    if (e && e.isTrusted === false) return;
    const t = e && e.target;
    if (t && t.classList && t.classList.contains('ingredient-edit-input')) {
      markDirtyOnce();
      syncActiveIngredientEditorState();
    }
  });

  // Prefill values when editing an existing row
  if (!isInsert && modelRef) {
    const set = (field, val) => {
      const inp = row.querySelector(
        `.ingredient-edit-input[data-field="${field}"]`
      );
      if (!inp) return;
      if (inp.type === 'checkbox') {
        const s = val == null ? '' : String(val);
        inp.checked =
          s === '1' || s.toLowerCase() === 'true' || s.toLowerCase() === 'x';
        return;
      }
      inp.value = val == null ? '' : String(val);
      // Trigger autosize by dispatching input event (autosize listens for this)
      try {
        // NOTE: do not bubble; bubbling would trigger dirty-on-first-keystroke logic.
        const evt = new Event('input', { bubbles: false });
        inp.dispatchEvent(evt);
      } catch (_) {}
    };

    // Prefer structured quantity fields; fall back to parsing legacy quantity text.
    const hasPositiveQty = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0;
    };
    let prefillQtyMin = modelRef.quantityMin;
    let prefillQtyMax = modelRef.quantityMax;
    let prefillIsAprx = !!modelRef.quantityIsApprox;
    if (
      (!hasPositiveQty(prefillQtyMin) || !hasPositiveQty(prefillQtyMax)) &&
      modelRef.quantity != null &&
      String(modelRef.quantity).trim() !== '' &&
      typeof window.parseIngredientQuantityDescriptor === 'function'
    ) {
      try {
        const parsed = window.parseIngredientQuantityDescriptor(modelRef.quantity);
        if (parsed) {
          if (Number.isFinite(Number(parsed.quantityMin))) {
            prefillQtyMin = Number(parsed.quantityMin);
          }
          if (Number.isFinite(Number(parsed.quantityMax))) {
            prefillQtyMax = Number(parsed.quantityMax);
          }
          prefillIsAprx = !!parsed.quantityIsApprox;
        }
      } catch (_) {}
    }
    // Legacy fallback: plain numeric quantity values should still prefill qty fields.
    if (!hasPositiveQty(prefillQtyMin) && !hasPositiveQty(prefillQtyMax)) {
      const legacyQtyRaw = String(modelRef.quantity == null ? '' : modelRef.quantity).trim();
      if (/^\d+(\.\d+)?$/.test(legacyQtyRaw)) {
        const n = Number(legacyQtyRaw);
        if (Number.isFinite(n) && n > 0) {
          prefillQtyMin = n;
          prefillQtyMax = n;
        }
      }
    }

    const formatQtyEditorPrefill = (val) => {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) return '';
      const frac = Math.abs(n - Math.floor(n));
      if (Math.abs(frac - 1 / 3) <= 1e-6 || Math.abs(frac - 2 / 3) <= 1e-6) {
        return n.toFixed(2);
      }
      return Number(n);
    };
    const prefillQtyMinDisplay = formatQtyEditorPrefill(prefillQtyMin);
    const prefillQtyMaxDisplay = formatQtyEditorPrefill(prefillQtyMax);
    set('qtymin', prefillQtyMinDisplay);
    set('qtymax', prefillQtyMaxDisplay);
    set('isaprx', prefillIsAprx ? '1' : '');
    set('unit', modelRef.unit ?? '');
    set('name', modelRef.name ?? '');
    set(
      'recipe',
      modelRef.linkedRecipeTitle ||
        (modelRef.isRecipe ? modelRef.recipeText || modelRef.name || '' : '')
    );
    set('size', modelRef.size ?? '');
    set('var', modelRef.variant ?? '');
    set('prep', modelRef.prepNotes ?? '');
    set('notes', modelRef.parentheticalNote ?? '');
    set('isopt', modelRef.isOptional ? '1' : '');
    set('isalt', modelRef.isAlt ? '1' : '');

    // Force autosize to run after all values are set (in case events didn't fire)
    requestAnimationFrame(() => {
      const inputs = row.querySelectorAll('.ingredient-edit-input');
      inputs.forEach((inp) => {
        try {
          inp.dispatchEvent(new Event('input', { bubbles: false }));
        } catch (_) {}
      });
    });
  }

  // DOM replacement can be triggered by multiple paths (Escape + focusout, etc.).
  // Make replacement idempotent and always replace via the row's current parent.
  let _didFinalizeSwap = false;
  const activeEditorState = {
    rowElement: row,
    isInsert,
    insertAtIndex: Number.isFinite(Number(insertAt)) ? Number(insertAt) : 0,
    ctaAnchorEl:
      (replaceElIsCta ? replaceEl : null) || headerHintSourceEl || null,
    isEmpty: () => isEmpty(),
    commit: async () => {
      await commit();
    },
    cancel: () => {
      cancel();
    },
  };
  const syncActiveIngredientEditorState = () => {
    if (window._activeIngredientEditor !== activeEditorState) return;
    const disableAddIngredient = !!(
      !_didFinalizeSwap &&
      row.isConnected &&
      isInsert &&
      isEmpty()
    );
    syncAddIngredientActionAffordance(disableAddIngredient);
  };
  const clearActiveIngredientEditorState = () => {
    if (window._activeIngredientEditor === activeEditorState) {
      window._activeIngredientEditor = null;
    }
    syncAddIngredientActionAffordance(false);
  };
  const finalizeSwap = (nextEl) => {
    if (_didFinalizeSwap) return;
    _didFinalizeSwap = true;
    clearActiveIngredientEditorState();
    try {
      try {
        document.body.classList.remove('ingredient-editing');
      } catch (_) {}
      const p = row.parentNode;
      if (p && nextEl) {
        p.replaceChild(nextEl, row);
        if (nextEl === replaceEl && headerHintSourceEl && restoreHeaderHintPersistent) {
          try {
            headerHintSourceEl.classList.add('ingredient-header-cta--persistent');
          } catch (_) {}
          try {
            if (replaceEl.parentNode === p) {
              p.removeChild(replaceEl);
            }
          } catch (_) {}
        }
      }
    } catch (_) {
      // ignore double-swap / already-removed situations
    }
  };

  const restoreOriginal = () => finalizeSwap(replaceEl);

  const isEmpty = () => {
    const inputs = row.querySelectorAll('.ingredient-edit-input');
    for (const inp of inputs) {
      if (inp.type === 'checkbox') {
        if (inp.checked) return false;
        continue;
      }
      if (inp.value && inp.value.trim() !== '') return false;
    }
    return true;
  };

  const readFields = () => {
    const inputs = row.querySelectorAll('.ingredient-edit-input');
    const fields = {};
    inputs.forEach((inp) => {
      const key = inp.dataset.field || '';
      if (!key) return;
      if (inp.type === 'checkbox') {
        fields[key] = inp.checked ? '1' : '';
      } else {
        fields[key] = (inp.value || '').trim();
      }
    });
    return fields;
  };

  const promoteToHeadingFromName = () => {
    const fields = readFields();
    const promotedText = normalizeIngredientHeadingText(fields.name || '');
    const model = window.recipeData;
    const fallbackSection = model && Array.isArray(model.sections) ? model.sections[0] : null;
    const targetSection = sectionRef || fallbackSection;
    if (!targetSection || !Array.isArray(targetSection.ingredients)) return;

    let targetIndex = -1;
    if (isInsert) {
      const raw = Number(insertAt);
      targetIndex = Number.isFinite(raw)
        ? Math.max(0, Math.min(raw, targetSection.ingredients.length))
        : targetSection.ingredients.length;
    } else if (modelRef) {
      targetIndex = targetSection.ingredients.indexOf(modelRef);
      if (targetIndex === -1) {
        const rid = modelRef.rimId != null ? String(modelRef.rimId) : '';
        const cid = modelRef.clientId ? String(modelRef.clientId) : '';
        targetIndex = targetSection.ingredients.findIndex((ing) => {
          if (!ing || ing.rowType === 'heading') return false;
          if (rid && ing.rimId != null && String(ing.rimId) === rid) return true;
          if (cid && ing.clientId && String(ing.clientId) === cid) return true;
          return false;
        });
      }
    }
    if (targetIndex < 0) return;

    const headingRow = {
      rowType: 'heading',
      headingId: null,
      headingClientId: `tmp-h-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      sortOrder:
        modelRef && Number.isFinite(Number(modelRef.sortOrder))
          ? Number(modelRef.sortOrder)
          : null,
      text: promotedText,
    };

    if (isInsert) {
      targetSection.ingredients.splice(targetIndex, 0, headingRow);
    } else {
      targetSection.ingredients.splice(targetIndex, 1, headingRow);
    }

    if (typeof markDirty === 'function') markDirty();
    const headingEl = renderIngredientHeading(headingRow);
    finalizeSwap(headingEl);

    setTimeout(() => {
      try {
        if (typeof headingEl.click === 'function') headingEl.click();
        const editable = headingEl.querySelector('.ingredient-subsection-heading-text');
        if (editable && editable.isContentEditable) {
          placeCaretAtStart(editable);
        }
      } catch (_) {}
    }, 0);
  };

  row.addEventListener(
    'keydown',
    (e) => {
      if (!e) return;
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
        if (typeof moveIngredientEditRowByDelta === 'function') {
          void moveIngredientEditRowByDelta(e.key === 'ArrowUp' ? -1 : 1);
        }
        return;
      }
      if (
        e.key === 'Tab' &&
        e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        promoteToHeadingFromName();
      }
    },
    true
  );

  const commit = async () => {
    // If an overlay dropdown is open, close it before we mutate DOM.
    try {
      if (
        window.favoriteEatsTypeahead &&
        typeof window.favoriteEatsTypeahead.close === 'function'
      ) {
        window.favoriteEatsTypeahead.close();
      }
    } catch (_) {}

    const fields = readFields();
    let didMutateModel = false;
    const snapshotComparableFields = (row) => ({
      quantity: row?.quantity ?? '',
      quantityMin: row?.quantityMin ?? null,
      quantityMax: row?.quantityMax ?? null,
      quantityIsApprox: !!row?.quantityIsApprox,
      unit: row?.unit ?? '',
      name: row?.name ?? '',
      size: row?.size ?? '',
      variant: row?.variant ?? '',
      prepNotes: row?.prepNotes ?? '',
      parentheticalNote: row?.parentheticalNote ?? '',
      isOptional: !!row?.isOptional,
      isRecipe: !!row?.isRecipe,
      linkedRecipeId: row?.linkedRecipeId ?? null,
      linkedRecipeTitle: row?.linkedRecipeTitle ?? '',
      recipeText: row?.recipeText ?? '',
      isAlt: !!row?.isAlt,
      variantDeprecated: !!row?.variantDeprecated,
    });
    const recipeLinkState = await applyRecipeValidationToInputs();
    fields.recipe = recipeLinkState.linkedRecipeTitle || '';
    const hasData = Object.values(fields).some((v) => v && v.trim() !== '');

    if (!hasData) {
      restoreOriginal();
      return;
    }

    const nameTrimmed = (fields.name || '').trim();
    let canonicalName = nameTrimmed;
    let nameLookupRow = null;
    if (!recipeLinkState.isRecipe && nameTrimmed) {
      const resolved = await resolveCanonicalIngredientNameForCommit(nameTrimmed);
      canonicalName = resolved.canonicalName;
      nameLookupRow = resolved.lookupRow;
    }

    const parseQtyScalar = (raw) => {
      const t = String(raw || '').trim();
      if (!t) return null;
      const thirdMatch = t.match(/^(\d+)\.3{2,}$/);
      if (thirdMatch) {
        return Number(thirdMatch[1]) + 1 / 3;
      }
      try {
        if (typeof window.parseIngredientQuantityDescriptor === 'function') {
          const p = window.parseIngredientQuantityDescriptor(t);
          const mn = Number.isFinite(Number(p?.quantityMin))
            ? Number(p.quantityMin)
            : null;
          const mx = Number.isFinite(Number(p?.quantityMax))
            ? Number(p.quantityMax)
            : null;
          if (mn != null && mx != null && Math.abs(mn - mx) < 1e-9) return mn;
        }
      } catch (_) {}
      if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(t)) return Number(t);
      return null;
    };

    let quantityMin = parseQtyScalar(fields.qtymin);
    let quantityMax = parseQtyScalar(fields.qtymax);
    let quantityIsApprox = !!(fields.isaprx && String(fields.isaprx).trim());

    // Treat single-ended input as exact value.
    if (quantityMin != null && quantityMax == null) quantityMax = quantityMin;
    if (quantityMax != null && quantityMin == null) quantityMin = quantityMax;
    if (quantityMin != null && quantityMax != null && quantityMin > quantityMax) {
      const tmp = quantityMin;
      quantityMin = quantityMax;
      quantityMax = tmp;
    }
    // 0/negative quantities are invalid for ingredient amounts.
    if (quantityMin != null && quantityMin <= 0) quantityMin = null;
    if (quantityMax != null && quantityMax <= 0) quantityMax = null;
    if (quantityMin == null && quantityMax == null) {
      quantityIsApprox = false;
    }

    const qtyMinRaw = String(fields.qtymin || '').trim();
    const qtyMaxRaw = String(fields.qtymax || '').trim();
    const qtyInputsBlank = qtyMinRaw === '' && qtyMaxRaw === '';
    let preservedLegacyQuantityText = '';

    // If qty fields are untouched/blank, preserve the legacy quantity value on update.
    if (
      !isInsert &&
      qtyInputsBlank &&
      modelRef &&
      modelRef.quantity != null &&
      String(modelRef.quantity).trim() !== ''
    ) {
      const legacyQtyText = String(modelRef.quantity).trim();
      const parsedLegacy = (() => {
        try {
          if (typeof window.parseIngredientQuantityDescriptor === 'function') {
            return window.parseIngredientQuantityDescriptor(legacyQtyText);
          }
        } catch (_) {}
        return null;
      })();
      const parsedMin = Number.isFinite(Number(parsedLegacy?.quantityMin))
        ? Number(parsedLegacy.quantityMin)
        : null;
      const parsedMax = Number.isFinite(Number(parsedLegacy?.quantityMax))
        ? Number(parsedLegacy.quantityMax)
        : null;
      if (parsedMin != null && parsedMin > 0 && parsedMax != null && parsedMax > 0) {
        quantityMin = parsedMin;
        quantityMax = parsedMax;
        quantityIsApprox = !!parsedLegacy?.quantityIsApprox;
      } else if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(legacyQtyText)) {
        const n = Number(legacyQtyText);
        if (Number.isFinite(n) && n > 0) {
          quantityMin = n;
          quantityMax = n;
        } else {
          preservedLegacyQuantityText = '';
        }
      } else {
        preservedLegacyQuantityText = legacyQtyText;
      }
    }

    const buildQuantityText = () => {
      if (quantityMin == null && quantityMax == null) return '';
      if (
        quantityMin != null &&
        quantityMax != null &&
        Math.abs(quantityMin - quantityMax) < 1e-9
      ) {
        const base = String(Number(quantityMin));
        return quantityIsApprox ? `about ${base}` : base;
      }
      const minTxt = quantityMin != null ? String(Number(quantityMin)) : '';
      const maxTxt = quantityMax != null ? String(Number(quantityMax)) : '';
      const core = [minTxt, 'to', maxTxt].filter(Boolean).join(' ').trim();
      return quantityIsApprox ? `about ${core}` : core;
    };

    const quantity = buildQuantityText() || preservedLegacyQuantityText;
    const normalizedUnit = fields.unit || '';

    if (!recipeLinkState.isRecipe) {
      maybeToastIngredientNameCanonicalized(nameTrimmed, canonicalName);
    }

    if (isInsert) {
      // If user cleared the name, treat it as "no-op" insert.
      if (!nameTrimmed) {
        restoreOriginal();
        return;
      }

      const ingredient = {
        quantity,
        quantityMin,
        quantityMax,
        quantityIsApprox,
        unit: normalizedUnit,
        name: canonicalName,
        size: fields.size || '',
        variant: fields.var || '',
        prepNotes: fields.prep || '',
        parentheticalNote: fields.notes || '',
        isOptional: !!(fields.isopt && fields.isopt.trim()),
        isAlt: !!(fields.isalt && fields.isalt.trim()),
        isRecipe: recipeLinkState.isRecipe,
        linkedRecipeId: recipeLinkState.linkedRecipeId,
        linkedRecipeTitle: recipeLinkState.linkedRecipeTitle || '',
        recipeText: recipeLinkState.isRecipe ? nameTrimmed : canonicalName,
        substitutes: [],
        locationAtHome: '',
        clientId: `tmp-ing-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`,
        // Pluralization fields (populated from DB below)
        lemma: '',
        pluralByDefault: null,
        isMassNoun: null,
        pluralOverride: '',
        isDeprecated: false,
      };

      let grammarFromDoor = false;
      if (nameLookupRow) {
        grammarFromDoor = await applyGrammarToIngredientModelFromDoor(
          ingredient,
          canonicalName,
          nameLookupRow,
        );
      }
      // v1: assume single ingredients section in the model
      const model = window.recipeData;
      if (model && Array.isArray(model.sections) && model.sections[0]) {
        const section = model.sections[0];
        sectionRef = section;
        if (!Array.isArray(section.ingredients)) section.ingredients = [];
        // Insert at requested index (includes headings), falling back to append.
        const raw = Number(insertAt);
        const idx = Number.isFinite(raw) ? raw : section.ingredients.length;
        const safeIdx = Math.max(0, Math.min(idx, section.ingredients.length));
        section.ingredients.splice(safeIdx, 0, ingredient);
        didMutateModel = true;
      }

      const readOnlyLine = renderIngredient(ingredient);
      if (readOnlyLine) finalizeSwap(readOnlyLine);

      // If the insert flow replaced an insert-rail element, rerender to restore rails.
      // After rerender, request delayed hint activation for the inserted row.
      try {
        const insertedClientId = ingredient.clientId;
        if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
          setTimeout(() => {
            try {
              window._pendingIngredientHintClientId = insertedClientId;
              window.recipeEditorRerenderIngredientsFromModel();
            } catch (_) {}
          }, 0);
        }
      } catch (_) {}
    } else if (modelRef) {
      // Clearing name deletes the ingredient line from this recipe (with undo).
      if (!nameTrimmed) {
        try {
          if (
            sectionRef &&
            typeof window.recipeEditorDeleteIngredientRow === 'function'
          ) {
            const ok = await window.recipeEditorDeleteIngredientRow({
              sectionRef,
              rowRef: modelRef,
              focusId:
                modelRef.rimId != null
                  ? String(modelRef.rimId)
                  : modelRef.clientId,
              focusBy: modelRef.rimId != null ? 'rimId' : 'clientId',
            });
            if (!ok) {
              // User cancelled the delete confirmation: restore the original row.
              restoreOriginal();
              return;
            }
          }
        } catch (_) {}
        // Ensure the edit row is removed (rerender will replace the section anyway).
        try {
          try {
            document.body.classList.remove('ingredient-editing');
          } catch (_) {}
          clearActiveIngredientEditorState();
          _didFinalizeSwap = true;
          if (row && row.parentNode) row.parentNode.removeChild(row);
        } catch (_) {}
        return;
      }

      const beforeCommit = snapshotComparableFields(modelRef);
      const wasAltBeforeCommit = !!modelRef.isAlt;
      const prevVariantForDep = String(modelRef.variant || '');
      const prevNameForDep = String(modelRef.name || '');
      const prevVariantDep = !!modelRef.variantDeprecated;

      // Update the model reference (the thing Save will persist).
      modelRef.quantity = quantity;
      modelRef.quantityMin = quantityMin;
      modelRef.quantityMax = quantityMax;
      modelRef.quantityIsApprox = quantityIsApprox;
      modelRef.unit = normalizedUnit;
      modelRef.name = canonicalName;
      modelRef.size = fields.size || '';
      modelRef.variant = fields.var || '';
      modelRef.prepNotes = fields.prep || '';
      modelRef.parentheticalNote = fields.notes || '';
      modelRef.isOptional = !!(fields.isopt && fields.isopt.trim());
      modelRef.isAlt = !!(fields.isalt && fields.isalt.trim());
      modelRef.isRecipe = recipeLinkState.isRecipe;
      modelRef.linkedRecipeId = recipeLinkState.linkedRecipeId;
      modelRef.linkedRecipeTitle = recipeLinkState.linkedRecipeTitle || '';
      modelRef.recipeText = recipeLinkState.isRecipe ? nameTrimmed : canonicalName;
      {
        const variantTargetUnchanged =
          String(modelRef.variant || '') === prevVariantForDep &&
          String(modelRef.name || '') === prevNameForDep;
        modelRef.variantDeprecated = variantTargetUnchanged
          ? prevVariantDep
          : false;
      }
      if (!modelRef.clientId) {
        modelRef.clientId =
          modelRef.rimId != null
            ? `i-${modelRef.rimId}`
            : `tmp-ing-${Date.now()}`;
      }
      didMutateModel =
        JSON.stringify(beforeCommit) !==
        JSON.stringify(snapshotComparableFields(modelRef));

      if (
        sectionRef &&
        wasAltBeforeCommit &&
        !modelRef.isAlt &&
        typeof window.recipeEditorPromoteTrailingAltRowsAbovePrimary === 'function'
      ) {
        try {
          window.recipeEditorPromoteTrailingAltRowsAbovePrimary({
            sectionRef,
            rowRef: modelRef,
          });
        } catch (_) {}
      }

      {
        let grammarFromDoor = false;
        if (nameLookupRow) {
          grammarFromDoor = await applyGrammarToIngredientModelFromDoor(
            modelRef,
            canonicalName,
            nameLookupRow,
          );
        }
      }

      // Keep the original rendered object in sync too (best-effort), so any other
      // logic that still holds that reference won't drift.
      if (seedLine && seedLine !== modelRef) {
        seedLine.quantity = modelRef.quantity;
        seedLine.quantityMin = modelRef.quantityMin;
        seedLine.quantityMax = modelRef.quantityMax;
        seedLine.quantityIsApprox = modelRef.quantityIsApprox;
        seedLine.unit = modelRef.unit;
        seedLine.name = modelRef.name;
        seedLine.size = modelRef.size;
        seedLine.variant = modelRef.variant;
        seedLine.prepNotes = modelRef.prepNotes;
        seedLine.parentheticalNote = modelRef.parentheticalNote;
        seedLine.isOptional = modelRef.isOptional;
        seedLine.isAlt = modelRef.isAlt;
        seedLine.isRecipe = modelRef.isRecipe;
        seedLine.linkedRecipeId = modelRef.linkedRecipeId;
        seedLine.linkedRecipeTitle = modelRef.linkedRecipeTitle;
        seedLine.recipeText = modelRef.recipeText;
        seedLine.lemma = modelRef.lemma;
        seedLine.pluralByDefault = modelRef.pluralByDefault;
        seedLine.isMassNoun = modelRef.isMassNoun;
        seedLine.pluralOverride = modelRef.pluralOverride;
        seedLine.isDeprecated = modelRef.isDeprecated;
        seedLine.variantDeprecated = modelRef.variantDeprecated;
        if (!seedLine.clientId) seedLine.clientId = modelRef.clientId;
      }

      const readOnlyLine = renderIngredient(modelRef);
      if (readOnlyLine) finalizeSwap(readOnlyLine);
    }

    // After a successful commit, apply the "optional goes to bottom of section"
    // rule without being disruptive during active edit flows.
    try {
      if (
        sectionRef &&
        typeof window.recipeEditorAfterIngredientEditCommit === 'function'
      ) {
        window.recipeEditorAfterIngredientEditCommit(sectionRef);
      }
    } catch (_) {}

    // Some commit paths programmatically populate fields (for example via picker
    // selection) without a trusted input/change event. Fall back to marking dirty
    // after commit only when the underlying model actually changed.
    if (!hasPendingEdit && didMutateModel && typeof markDirty === 'function') {
      markDirty();
    }
  };

  const cancel = () => {
    try {
      if (
        window.favoriteEatsTypeahead &&
        typeof window.favoriteEatsTypeahead.close === 'function'
      ) {
        window.favoriteEatsTypeahead.close();
      }
    } catch (_) {}

    restoreOriginal();
  };

  // Replace in DOM first, then enter edit mode with the shared controller.
  // Opening an insert card should consume the visible CTA; otherwise the user
  // sees a duplicate hint directly below the active card without holding Alt.
  parent.replaceChild(row, replaceEl);

  window._activeIngredientEditor = activeEditorState;
  syncActiveIngredientEditorState();

  if (typeof setupInlineRowEditing === 'function') {
    let _isEditing = false;
    const controller = setupInlineRowEditing({
      rowElement: row,
      isEmpty,
      commit,
      cancel,
      getIsEditing: () => _isEditing,
      setIsEditing: (flag) => {
        _isEditing = !!flag;
        row.classList.toggle('editing', _isEditing);
      },
      onEnterCommit: isInsert
        ? () => {
            // After inserting, rerender; CTA only shows again if the list is empty.
            try {
              if (
                typeof window.recipeEditorRerenderIngredientsFromModel ===
                'function'
              ) {
                window.recipeEditorRerenderIngredientsFromModel();
              }
            } catch (_) {}

            // Do not auto-trigger the CTA; user can tap it when visible.
          }
        : undefined,
    });

    if (controller && typeof controller.enterEdit === 'function') {
      controller.enterEdit();
    } else {
      row.classList.add('editing');
    }
  } else {
    row.classList.add('editing');
  }

  // Wire typeahead + tab-order navigation for this row (v1: name/unit/variant)
  try {
    if (
      typeof window.setupIngredientTypeaheadRow === 'function' &&
      row &&
      row.querySelector('.ingredient-edit-input')
    ) {
      window.setupIngredientTypeaheadRow(row);
    }
  } catch (err) {
    console.warn('⚠️ setupIngredientTypeaheadRow failed:', err);
  }

  try {
    if (
      recipeInput &&
      window.favoriteEatsTypeahead &&
      typeof window.favoriteEatsTypeahead.attach === 'function'
    ) {
      window.favoriteEatsTypeahead.attach({
        inputEl: recipeInput,
        openOnFocus: true,
        maxVisible: 10,
        onPick: (pickedTitle) => {
          maybePopulateNameFromRecipe(pickedTitle);
        },
        getPool: async () => {
          const parentId =
            window.recipeData && window.recipeData.id != null
              ? Number(window.recipeData.id)
              : null;
          if (
            window.dataService &&
            typeof window.dataService.listRecipes === 'function'
          ) {
            try {
              const recipes = await window.dataService.listRecipes();
              return (Array.isArray(recipes) ? recipes : [])
                .filter((r) => {
                  const id = Number(r?.id);
                  return (
                    Number.isFinite(id) &&
                    id > 0 &&
                    (!Number.isFinite(parentId) || parentId <= 0 || id !== parentId)
                  );
                })
                .map((r) => String(r?.title != null ? r.title : '').trim())
                .filter(Boolean)
                .sort((a, b) =>
                  a.localeCompare(b, undefined, { sensitivity: 'base' }),
                );
            } catch (err) {
              console.warn('recipe typeahead: listRecipes failed', err);
              if (ingredientRendererDataServiceIsSupabaseActive()) return [];
            }
          }
          return [];
        },
      });
    }
  } catch (err) {
    console.warn('⚠️ recipe typeahead setup failed:', err);
  }

  // Focus configured field by default (QtyMin fallback), with caret at the beginning.
  // IMPORTANT: defer by one tick so the click/pointer event that opened the tray
  // finishes first; otherwise focusout can immediately cancel an empty insert row.
  const focusField =
    typeof initialFocusField === 'string' && initialFocusField.trim()
      ? initialFocusField.trim()
      : 'qtymin';
  const focusInput =
    row.querySelector(`.ingredient-edit-input[data-field="${focusField}"]`) ||
    row.querySelector('.ingredient-edit-input[data-field="qtymin"]');
  if (focusInput) {
    const caretIdx = Number.isFinite(Number(initialCaretIndex))
      ? Math.max(0, Number(initialCaretIndex))
      : 0;
    setTimeout(() => {
      try {
        focusInput.focus();
        if (typeof focusInput.setSelectionRange === 'function') {
          const valueLength = String(focusInput.value || '').length;
          const clamped = Math.min(caretIdx, valueLength);
          focusInput.setSelectionRange(clamped, clamped);
        }
        // scrollToStart is handled by attachIngredientInputAutosize, but ensure it here too
        focusInput.scrollLeft = 0;
      } catch (_) {}
    }, 0);
  }
}

function openIngredientPasteRow({ parent, replaceEl, insertAtIndex }) {
  if (!parent || !replaceEl) return;
  const insertAt = insertAtIndex;
  const replaceElIsCta = replaceEl.classList.contains('ingredient-add-cta');
  const headerHintSourceEl = replaceEl._ingredientHeaderHintSourceEl || null;
  const restoreHeaderHintPersistent =
    replaceEl._ingredientHeaderHintRestorePersistent === true;

  const row = document.createElement('div');
  row.className = 'ingredient-edit-row ingredient-paste-row editing';
  row.dataset.isEditing = 'true';

  try {
    document.body.classList.add('ingredient-editing');
  } catch (_) {}

  const syncAddIngredientActionAffordance = (disabled) => {
    const shouldDisable = !!disabled;
    try {
      document.body.classList.toggle(
        'ingredient-insert-blank-active',
        shouldDisable
      );
    } catch (_) {}

    try {
      const buttons = document.querySelectorAll(
        '.ingredient-add-cta-action[data-cta-action="add-ingredient"]'
      );
      buttons.forEach((btn) => {
        if (!(btn instanceof HTMLElement)) return;
        if (shouldDisable) {
          btn.setAttribute('aria-disabled', 'true');
          btn.tabIndex = -1;
        } else {
          btn.removeAttribute('aria-disabled');
          btn.removeAttribute('tabindex');
        }
      });
    } catch (_) {}
  };

  const blurTarget = document.createElement('div');
  blurTarget.className = 'inline-edit-blur-target';
  blurTarget.tabIndex = -1;
  blurTarget.setAttribute('aria-hidden', 'true');
  row.appendChild(blurTarget);

  const cell = document.createElement('div');
  cell.className = 'ingredient-edit-cell ingredient-edit-cell--paste';
  const textarea = document.createElement('textarea');
  textarea.className = 'ingredient-edit-input ingredient-paste-input';
  textarea.dataset.field = 'paste';
  textarea.placeholder = 'Paste content';
  textarea.setAttribute('aria-label', 'Paste content');
  textarea.wrap = 'soft';
  textarea.rows = 3;
  cell.appendChild(textarea);
  row.appendChild(cell);

  try {
    if (typeof attachEditorTextareaAutoGrow === 'function') {
      attachEditorTextareaAutoGrow(textarea, { maxLines: 12 });
    }
    if (typeof attachEditorNewlineListPaste === 'function') {
      attachEditorNewlineListPaste(textarea);
    }
  } catch (_) {}

  let hasPendingEdit = false;
  const markDirtyOnce = () => {
    if (hasPendingEdit) return;
    hasPendingEdit = true;
    if (typeof markDirty === 'function') {
      markDirty();
    }
  };
  row.addEventListener('input', (e) => {
    if (e && e.isTrusted === false) return;
    const t = e && e.target;
    if (t === textarea) {
      markDirtyOnce();
      syncActiveIngredientEditorState();
    }
  });

  const isEmpty = () => {
    const raw = String(textarea.value || '');
    const parseMany =
      typeof window.parseIngredientLines === 'function'
        ? window.parseIngredientLines
        : null;
    let parsed = [];
    try {
      parsed = parseMany
        ? parseMany(raw)
        : raw
            .split(/\r?\n/)
            .map((line) => String(line || '').trim())
            .filter(Boolean)
            .map((name) => ({ name }));
    } catch (_) {
      parsed = raw
        .split(/\r?\n/)
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .map((name) => ({ name }));
    }
    return !(
      Array.isArray(parsed) &&
      parsed.some((row) => row && String(row.name || '').trim())
    );
  };

  const getParsedIngredientRows = async () => {
    const raw = String(textarea.value || '');
    const parseMany =
      typeof window.parseIngredientLines === 'function'
        ? window.parseIngredientLines
        : null;
    let parsed = [];
    try {
      parsed = parseMany
        ? parseMany(raw)
        : raw
            .split(/\r?\n/)
            .map((line) => String(line || '').trim())
            .filter(Boolean)
            .map((name) => ({ name }));
    } catch (_) {
      parsed = raw
        .split(/\r?\n/)
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .map((name) => ({ name }));
    }

    const toFiniteNumberOrNull = (value) => {
      if (value == null) return null;
      const rawNum = String(value).trim();
      if (!rawNum) return null;
      const numeric = Number(rawNum);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const canonicalNameCache = new Map();
    const resolveCanonicalPastedName = async (typedName, isRecipe) => {
      const name = String(typedName || '').trim();
      if (!name || isRecipe) return name;
      const key = name.toLowerCase();
      if (canonicalNameCache.has(key)) return canonicalNameCache.get(key);
      const resolved = await resolveCanonicalIngredientNameForCommit(name);
      const canonical = resolved.canonicalName;
      canonicalNameCache.set(key, canonical);
      return canonical;
    };

    const baseRows = (Array.isArray(parsed) ? parsed : []).map((row, idx) => ({
      row,
      idx,
    }));

    const built = await Promise.all(
      baseRows.map(async ({ row, idx }) => {
        if (!row || !String(row.name || '').trim()) return null;
        const typedName = String(row.name || '').trim();
        const canonicalName = await resolveCanonicalPastedName(
          typedName,
          !!row.isRecipe,
        );
        return {
          quantity: row.quantity != null ? row.quantity : '',
          quantityMin: toFiniteNumberOrNull(row.quantityMin),
          quantityMax: toFiniteNumberOrNull(row.quantityMax),
          quantityIsApprox: !!row.quantityIsApprox,
          unit: row.unit || '',
          name: canonicalName,
          size: row.size || '',
          variant: row.variant || '',
          prepNotes: row.prepNotes || '',
          parentheticalNote: row.parentheticalNote || '',
          isOptional: !!row.isOptional,
          substitutes: Array.isArray(row.substitutes) ? row.substitutes : [],
          locationAtHome: row.locationAtHome || '',
          isRecipe: !!row.isRecipe,
          linkedRecipeId: row.linkedRecipeId || null,
          linkedRecipeTitle: row.linkedRecipeTitle || '',
          recipeText: row.recipeText || '',
          isAlt: !!row.isAlt,
          clientId: `tmp-ing-${Date.now()}-${idx}-${Math.random()
            .toString(16)
            .slice(2)}`,
          lemma: '',
          pluralByDefault: null,
          isMassNoun: null,
          pluralOverride: '',
          isDeprecated: false,
        };
      }),
    );
    return built.filter(Boolean);
  };

  let _didFinalizeSwap = false;
  const activeEditorState = {
    rowElement: row,
    isInsert: true,
    insertAtIndex: Number.isFinite(Number(insertAt)) ? Number(insertAt) : 0,
    ctaAnchorEl:
      (replaceElIsCta ? replaceEl : null) || headerHintSourceEl || null,
    isEmpty: () => isEmpty(),
    commit: async () => {
      await commit();
    },
    cancel: () => {
      cancel();
    },
  };
  const syncActiveIngredientEditorState = () => {
    if (window._activeIngredientEditor !== activeEditorState) return;
    const disableAddIngredient = !!(!_didFinalizeSwap && row.isConnected && isEmpty());
    syncAddIngredientActionAffordance(disableAddIngredient);
  };
  const clearActiveIngredientEditorState = () => {
    if (window._activeIngredientEditor === activeEditorState) {
      window._activeIngredientEditor = null;
    }
    syncAddIngredientActionAffordance(false);
  };
  const finalizeSwap = (nextEl) => {
    if (_didFinalizeSwap) return;
    _didFinalizeSwap = true;
    clearActiveIngredientEditorState();
    try {
      try {
        document.body.classList.remove('ingredient-editing');
      } catch (_) {}
      const p = row.parentNode;
      if (p && nextEl) {
        p.replaceChild(nextEl, row);
        if (nextEl === replaceEl && headerHintSourceEl && restoreHeaderHintPersistent) {
          try {
            headerHintSourceEl.classList.add('ingredient-header-cta--persistent');
          } catch (_) {}
          try {
            if (replaceEl.parentNode === p) {
              p.removeChild(replaceEl);
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  };

  const restoreOriginal = () => finalizeSwap(replaceEl);

  const commit = async () => {
    const nextRows = await getParsedIngredientRows();
    if (!nextRows.length) {
      restoreOriginal();
      return;
    }

    let sectionRef = null;
    try {
      const model = window.recipeData;
      if (model && Array.isArray(model.sections) && model.sections[0]) {
        sectionRef = model.sections[0];
        if (!Array.isArray(sectionRef.ingredients)) sectionRef.ingredients = [];
        const raw = Number(insertAt);
        const idx = Number.isFinite(raw) ? raw : sectionRef.ingredients.length;
        const safeIdx = Math.max(0, Math.min(idx, sectionRef.ingredients.length));
        sectionRef.ingredients.splice(safeIdx, 0, ...nextRows);
      } else {
        restoreOriginal();
        return;
      }
    } catch (_) {
      restoreOriginal();
      return;
    }

    try {
      if (!hasPendingEdit && typeof markDirty === 'function') {
        markDirty();
      }
    } catch (_) {}

    // Keep immediate in-place visual replacement; full rerender restores slot rails.
    const readOnlyLine = document.createElement('div');
    readOnlyLine.className = 'ingredient-line';
    const text = document.createElement('span');
    text.className = 'ingredient-text';
    text.textContent = `Imported ${nextRows.length} ingredient${
      nextRows.length === 1 ? '' : 's'
    }.`;
    readOnlyLine.appendChild(text);
    finalizeSwap(readOnlyLine);

    try {
      if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
        setTimeout(() => {
          try {
            window.recipeEditorRerenderIngredientsFromModel();
          } catch (_) {}
        }, 0);
      }
    } catch (_) {}
  };

  const cancel = () => {
    restoreOriginal();
  };

  parent.replaceChild(row, replaceEl);

  window._activeIngredientEditor = activeEditorState;
  syncActiveIngredientEditorState();

  if (typeof setupInlineRowEditing === 'function') {
    let _isEditing = false;
    const controller = setupInlineRowEditing({
      rowElement: row,
      isEmpty,
      commit,
      cancel,
      getIsEditing: () => _isEditing,
      setIsEditing: (flag) => {
        _isEditing = !!flag;
        row.classList.toggle('editing', _isEditing);
      },
      onEnterCommit: () => {
        try {
          if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
            window.recipeEditorRerenderIngredientsFromModel();
          }
        } catch (_) {}
      },
    });
    if (controller && typeof controller.enterEdit === 'function') {
      controller.enterEdit();
    } else {
      row.classList.add('editing');
    }
  } else {
    row.classList.add('editing');
  }

  // Keep multiline support while preserving Enter-to-commit.
  textarea.addEventListener('keydown', (e) => {
    if (!e) return;
    if (e.key === 'Enter' && e.shiftKey) {
      e.stopPropagation();
    }
  });

  setTimeout(() => {
    try {
      textarea.focus();
      textarea.setSelectionRange(0, 0);
      textarea.scrollTop = 0;
      textarea.scrollLeft = 0;
    } catch (_) {}
  }, 0);
}

// Expose for other modules (recipeEditor.js) that call into the ingredient editor.
try {
  window.openIngredientEditRow = openIngredientEditRow;
  window.openIngredientPasteRow = openIngredientPasteRow;
} catch (_) {}

function renderIngredientEditRowScaffold() {
  const row = document.createElement('div');
  row.className = 'ingredient-edit-row editing';

  // Helper to make a pill-like label span
  const makePill = (text) => {
    const s = document.createElement('span');
    s.className = 'field-pill ingredient-pill';
    s.textContent = text;
    return s;
  };

  // Container for pill + (later) input
  const makeCell = (labelText) => {
    const cell = document.createElement('div');
    cell.className = 'ingredient-edit-cell';
    cell.classList.add(`ingredient-edit-cell--${labelText}`);

    const pill = makePill(labelText);
    cell.appendChild(pill);

    const input = document.createElement('input');
    input.className = 'ingredient-edit-input';
    input.classList.add(`ingredient-edit-input--${labelText}`);
    input.type = 'text';

    // NEW: tag input with its logical field name
    input.dataset.field = labelText;

    if (typeof wireLabelToInput === 'function') {
      wireLabelToInput(pill, input);
    }

    // Auto-size based on content length
    if (typeof attachIngredientInputAutosize === 'function') {
      attachIngredientInputAutosize(input);
    }

    cell.appendChild(input);

    return cell;
  };

  // Scaffold helper (currently unused): keep in sync with openIngredientEditRow.
  // qtymin | qtymax | unit | name | recipe | var | size | prep | notes | isopt | isaprx
  const labels = [
    'qtymin',
    'qtymax',
    'unit',
    'name',
    'recipe',
    'var',
    'size',
    'prep',
    'notes',
    'isopt',
    'isaprx',
  ];

  labels.forEach((lab) => {
    row.appendChild(makeCell(lab));
  });

  return row;
}
