(function () {
  const STEPPER_EPSILON = 1e-9;

  function normalizeKey(rawKey) {
    return String(rawKey || '').trim();
  }

  function getNextStepQty(currentQty, delta, options = {}) {
    const numeric = Number(currentQty);
    const stepDelta = Number(delta);
    const min = Number(options.min ?? 0);
    const hasMax = Number.isFinite(Number(options.max));
    const max = hasMax ? Number(options.max) : Infinity;
    const epsilon = Number(options.epsilon);
    const threshold = Number.isFinite(epsilon) ? Math.abs(epsilon) : STEPPER_EPSILON;
    const isFractional = (value) => Math.abs(value - Math.round(value)) > threshold;
    const clamp = (value) => Math.max(min, Math.min(max, value));
    const snapRaw = Number(options.snapPositiveTo);
    const snapPositiveTo = Number.isFinite(snapRaw) && snapRaw > 0 ? snapRaw : null;

    if (!Number.isFinite(numeric)) {
      return clamp(stepDelta > 0 ? (snapPositiveTo ?? 1) : 0);
    }

    if (numeric <= 0) {
      if (stepDelta > 0) {
        return clamp(snapPositiveTo ?? 1);
      }
      return clamp(numeric + stepDelta);
    }

    if (stepDelta > 0 && isFractional(numeric)) {
      return clamp(Math.ceil(numeric));
    }
    if (stepDelta < 0 && isFractional(numeric)) {
      return clamp(Math.floor(numeric));
    }
    return clamp(numeric + stepDelta);
  }

  function createStepperDOM(options = {}) {
    const decreaseLabel = String(options.decreaseLabel || 'Decrease quantity');
    const increaseLabel = String(options.increaseLabel || 'Increase quantity');

    const stepper = document.createElement('span');
    stepper.className = 'shopping-list-row-stepper';
    stepper.style.display = 'none';

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'shopping-stepper-btn';
    minusBtn.setAttribute('aria-label', decreaseLabel);
    const minusIcon = document.createElement('span');
    minusIcon.className = 'material-symbols-outlined';
    minusIcon.textContent = 'remove';
    minusIcon.setAttribute('aria-hidden', 'true');
    minusBtn.appendChild(minusIcon);

    const qtySpan = document.createElement('span');
    qtySpan.className = 'shopping-stepper-qty';
    qtySpan.textContent = '0';

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'shopping-stepper-btn';
    plusBtn.setAttribute('aria-label', increaseLabel);
    const plusIcon = document.createElement('span');
    plusIcon.className = 'material-symbols-outlined';
    plusIcon.textContent = 'add';
    plusIcon.setAttribute('aria-hidden', 'true');
    plusBtn.appendChild(plusIcon);

    stepper.appendChild(minusBtn);
    stepper.appendChild(qtySpan);
    stepper.appendChild(plusBtn);

    return { stepper, minusBtn, qtySpan, plusBtn };
  }

  function formatStepperQtyLabel(rawQty) {
    const qty = Number(rawQty);
    if (
      typeof window !== 'undefined' &&
      typeof window.formatShoppingQtyForDisplay === 'function'
    ) {
      return window.formatShoppingQtyForDisplay(qty);
    }
    if (!Number.isFinite(qty) || qty <= 0) return '0';
    return String(Number(qty.toFixed(2)));
  }

  /**
   * Items/planner shopping rows: show trash when the next decrement clears selection (qty → 0).
   */
  function applyShoppingItemDecreaseAffordance(minusBtn, options = {}) {
    if (!(minusBtn instanceof HTMLElement)) return;
    const clears = !!options.clearsSelection;
    const decreaseLabel = String(options.decreaseLabel || 'Decrease quantity');
    const removeLabel = String(options.removeLabel || 'Remove from plan');
    const icon = minusBtn.querySelector('.material-symbols-outlined');
    minusBtn.setAttribute('aria-label', clears ? removeLabel : decreaseLabel);
    if (icon) icon.textContent = clears ? 'delete_outline' : 'remove';
  }

  /**
   * Collapsed qty lives in `.shopping-list-row-badge-qty` (content-sized column).
   * Pass a string for numeric/text badges, or `{ type: 'icon', name: 'add_diamond' }`.
   */
  function setShoppingListBadgeQtyLabel(badge, text) {
    if (text != null && typeof text === 'object') {
      setShoppingListBadgeContent(badge, text);
      return;
    }
    setShoppingListBadgeContent(
      badge,
      text == null || text === ''
        ? null
        : { type: 'text', value: String(text) },
    );
  }

  function setShoppingListBadgeContent(badge, content) {
    if (!(badge instanceof HTMLElement)) return;
    if (!content) {
      badge.replaceChildren();
      return;
    }
    badge.replaceChildren();
    const inner = document.createElement('span');
    inner.className = 'shopping-list-row-badge-qty';
    if (content.type === 'icon') {
      inner.classList.add('shopping-list-row-badge-icon');
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.textContent = String(content.name || 'add_diamond');
      icon.setAttribute('aria-hidden', 'true');
      inner.appendChild(icon);
    } else {
      inner.textContent = String(content.value ?? '');
    }
    badge.appendChild(inner);
  }

  function setStepperQtyDisplay(qtyEl, label, options = {}) {
    if (!(qtyEl instanceof HTMLElement)) return;
    if (options.showTailIcon) {
      qtyEl.replaceChildren();
      qtyEl.classList.add('shopping-stepper-qty--tail-icon');
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.textContent = SHOPPING_BROWSE_PLANNER_TAIL_ICON;
      icon.setAttribute('aria-hidden', 'true');
      qtyEl.appendChild(icon);
      return;
    }
    if (typeof qtyEl.classList?.remove === 'function') {
      qtyEl.classList.remove('shopping-stepper-qty--tail-icon');
    }
    if (typeof qtyEl.replaceChildren === 'function') {
      qtyEl.replaceChildren();
    }
    qtyEl.textContent = String(label ?? '');
  }

  const SHOPPING_BROWSE_PLANNER_TAIL_ICON = 'add_diamond';
  const TRAILING_PHASES = new Set(['icon', 'badge', 'stepper', 'none']);
  const DEFAULT_ROW_TRAILING_GAP_PX = 12;

  function setRowTrailingPhase(rowEl, phase) {
    if (!(rowEl instanceof HTMLElement)) return;
    const next = TRAILING_PHASES.has(phase) ? phase : 'none';
    rowEl.dataset.trailingPhase = next;
  }

  function isLayoutVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.style.display === 'none' || el.style.visibility === 'hidden') return false;
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    return true;
  }

  function readCssLengthPx(rawValue, fallback = 0) {
    const n = parseFloat(String(rawValue || ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function getPlannerRowSymbolSizePx(rowEl) {
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const source = rowEl instanceof HTMLElement ? rowEl : document.documentElement;
      const sym = readCssLengthPx(
        window.getComputedStyle(source).getPropertyValue('--list-planner-row-symbol-size'),
        32,
      );
      if (sym > 0) return sym;
    }
    return 32;
  }

  function getPlannerRowFlexGapPx(rowEl) {
    if (
      rowEl instanceof HTMLElement &&
      typeof window !== 'undefined' &&
      typeof window.getComputedStyle === 'function'
    ) {
      return readCssLengthPx(window.getComputedStyle(rowEl).gap, DEFAULT_ROW_TRAILING_GAP_PX);
    }
    return DEFAULT_ROW_TRAILING_GAP_PX;
  }

  function estimatePlannerRowTrailingChromePx(rowEl, options = {}) {
    if (!(rowEl instanceof HTMLElement)) return 0;
    const phase = String(rowEl.dataset.trailingPhase || 'none').trim();
    if (!TRAILING_PHASES.has(phase) || phase === 'none') return 0;

    const gapPx = Number.isFinite(Number(options.gapPx))
      ? Number(options.gapPx)
      : getPlannerRowFlexGapPx(rowEl);
    const symPx = getPlannerRowSymbolSizePx(rowEl);
    const stepperGapPx =
      typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
        ? readCssLengthPx(
            window
              .getComputedStyle(rowEl)
              .getPropertyValue('--list-planner-stepper-gap'),
            4,
          )
        : 4;

    if (phase === 'icon' || phase === 'badge') {
      return symPx + gapPx;
    }
    if (phase === 'stepper') {
      const qtyEl = rowEl.querySelector('.shopping-stepper-qty');
      const qtyPx =
        qtyEl instanceof HTMLElement && qtyEl.offsetWidth > 0
          ? qtyEl.offsetWidth
          : readCssLengthPx(
              typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
                ? window.getComputedStyle(qtyEl || rowEl).fontSize
                : '',
              16,
            ) * 2;
      return symPx * 2 + stepperGapPx * 2 + qtyPx + gapPx;
    }
    return 0;
  }

  function measurePlannerRowTrailingChromePx(rowEl, options = {}) {
    if (!(rowEl instanceof HTMLElement)) return 0;
    const gapPx = Number.isFinite(Number(options.gapPx))
      ? Number(options.gapPx)
      : getPlannerRowFlexGapPx(rowEl);
    const selectors = [
      '.shopping-list-row-stepper',
      '.shopping-list-row-badge',
      '.shopping-list-row-icon',
    ];
    for (const sel of selectors) {
      const el = rowEl.querySelector(sel);
      if (!isLayoutVisible(el)) continue;
      const width =
        el.getBoundingClientRect().width ||
        el.offsetWidth ||
        estimatePlannerRowTrailingChromePx(rowEl, { gapPx: 0 });
      if (width > 0) return width + gapPx;
    }
    return estimatePlannerRowTrailingChromePx(rowEl, { gapPx });
  }

  function applyTrailingChromeVisibility(rowEl, phase, elements = {}) {
    setRowTrailingPhase(rowEl, phase);
    const { icon, stepper, badge } = elements;
    if (icon) icon.style.display = phase === 'icon' ? '' : 'none';
    if (stepper) stepper.style.display = phase === 'stepper' ? '' : 'none';
    if (badge) {
      if (phase === 'badge') {
        badge.style.display = 'inline-flex';
        badge.style.visibility = '';
      } else {
        badge.style.display = 'none';
        badge.style.visibility = '';
        setShoppingListBadgeQtyLabel(badge, '');
      }
    }
  }

  /**
   * Variant-parent Items rows: badge-only trailing chrome (no icon/stepper on parent).
   */
  function syncVariantParentRowVisuals(rowEl, options = {}) {
    if (!(rowEl instanceof HTMLElement)) return;

    const expanded = !!options.expanded;
    const hasQty = !!options.hasQty;
    const badgeContent =
      options.badgeContent && typeof options.badgeContent === 'object'
        ? options.badgeContent
        : null;
    const badge = rowEl.querySelector('.shopping-list-row-badge');

    rowEl.classList.toggle('shopping-row-checked', !!options.checked);

    if (expanded || !hasQty || !badgeContent) {
      applyTrailingChromeVisibility(rowEl, 'none', { badge });
      return;
    }

    applyTrailingChromeVisibility(rowEl, 'badge', { badge });
    setShoppingListBadgeContent(badge, badgeContent);
  }

  function syncRowVisuals(rowEl, options = {}) {
    if (!(rowEl instanceof HTMLElement)) return;

    const enabled = !!options.enabled;
    const qtyMax = Number.isFinite(Number(options.qtyMax))
      ? Number(options.qtyMax)
      : 99;
    const qtyEpsilon = Number.isFinite(Number(options.qtyEpsilon))
      ? Math.abs(Number(options.qtyEpsilon))
      : STEPPER_EPSILON;
    const rawQty = Math.max(0, Number(options.qty || 0));
    const formatQtyLabel =
      typeof options.formatQtyLabel === 'function'
        ? options.formatQtyLabel
        : formatStepperQtyLabel;
    const allowZeroActive = options.allowZeroActive === true;
    const isActive =
      !!options.isActive && (rawQty > qtyEpsilon || allowZeroActive);
    const selectedDatasetKey = String(options.selectedDatasetKey || '').trim();
    const isSelected =
      options.showAsSelected === true || rawQty > qtyEpsilon;
    const badgeLabel =
      options.badgeLabel == null ? null : String(options.badgeLabel);
    const badgeContent =
      options.badgeContent && typeof options.badgeContent === 'object'
        ? options.badgeContent
        : badgeLabel != null && badgeLabel !== ''
          ? { type: 'text', value: badgeLabel }
          : null;
    const stepperShowTailIcon = !!options.stepperShowTailIcon;

    if (selectedDatasetKey) {
      rowEl.dataset[selectedDatasetKey] = enabled && isSelected ? 'true' : 'false';
    }

    rowEl.classList.toggle('shopping-row-checked', enabled && isSelected);

    const icon = rowEl.querySelector('.shopping-list-row-icon');
    const stepper = rowEl.querySelector('.shopping-list-row-stepper');
    const badge = rowEl.querySelector('.shopping-list-row-badge');
    const qtyEl = stepper?.querySelector('.shopping-stepper-qty');

    if (qtyEl) {
      setStepperQtyDisplay(qtyEl, formatQtyLabel(rawQty), {
        showTailIcon: stepperShowTailIcon,
      });
    }

    const stepperBtns = stepper?.querySelectorAll(':scope > .shopping-stepper-btn');
    const minusBtn = stepperBtns?.[0] || null;
    const plusBtn =
      stepperBtns && stepperBtns.length > 1
        ? stepperBtns[stepperBtns.length - 1]
        : null;
    if (
      minusBtn &&
      typeof options.shoppingDecreaseClearsSelection === 'boolean'
    ) {
      applyShoppingItemDecreaseAffordance(minusBtn, {
        clearsSelection: options.shoppingDecreaseClearsSelection,
        decreaseLabel: options.shoppingDecreaseLabel,
        removeLabel: options.shoppingRemoveLabel,
      });
    }
    const atQtyMax = rawQty >= qtyMax - qtyEpsilon;
    if (plusBtn) plusBtn.disabled = enabled && isActive && atQtyMax;

    const trailingElements = { icon, stepper, badge };

    if (!enabled) {
      applyTrailingChromeVisibility(rowEl, icon ? 'icon' : 'none', trailingElements);
      return;
    }

    if (isActive) {
      applyTrailingChromeVisibility(rowEl, 'stepper', trailingElements);
      return;
    }

    if (isSelected) {
      applyTrailingChromeVisibility(rowEl, 'badge', trailingElements);
      if (badge) {
        if (badgeContent) {
          setShoppingListBadgeContent(badge, badgeContent);
        } else {
          setShoppingListBadgeQtyLabel(badge, formatQtyLabel(rawQty));
        }
      }
      return;
    }

    applyTrailingChromeVisibility(rowEl, icon ? 'icon' : 'none', trailingElements);
  }

  function createController(options = {}) {
    const listEl = options.listEl;
    const isEnabled =
      typeof options.isEnabled === 'function' ? options.isEnabled : () => true;
    const collapseExpanded =
      typeof options.collapseExpanded === 'function' ? options.collapseExpanded : null;
    const idleCollapseMsRaw = Number(options.idleCollapseMs);
    const idleCollapseMs =
      Number.isFinite(idleCollapseMsRaw) && idleCollapseMsRaw > 0
        ? idleCollapseMsRaw
        : 0;
    const onIdleCollapse =
      typeof options.onIdleCollapse === 'function' ? options.onIdleCollapse : null;
    const idleResetActivity =
      typeof options.idleResetActivity === 'function'
        ? options.idleResetActivity
        : null;
    const shouldPauseIdleCollapse =
      typeof options.shouldPauseIdleCollapse === 'function'
        ? options.shouldPauseIdleCollapse
        : null;

    let activeKey = normalizeKey(options.activeKey);

    let idleTimerId = null;
    const clearIdleTimer = () => {
      if (idleTimerId != null) {
        clearTimeout(idleTimerId);
        idleTimerId = null;
      }
    };

    const getActiveKey = () => activeKey;
    const isActive = (key) => {
      const normalized = normalizeKey(key);
      return !!normalized && normalized === activeKey;
    };

    const collapseActive = () => {
      clearIdleTimer();
      if (!activeKey) return false;
      activeKey = '';
      return true;
    };

    const collapseAll = () => {
      const activeChanged = collapseActive();
      const expandedChanged = collapseExpanded ? !!collapseExpanded() : false;
      return activeChanged || expandedChanged;
    };

    const shouldSkipDismissForUiDialog = (target) => {
      if (typeof window === 'undefined') return false;
      try {
        if (
          window.ui &&
          typeof window.ui.isDialogOpen === 'function' &&
          window.ui.isDialogOpen()
        ) {
          return true;
        }
      } catch (_) {}
      if (target instanceof Element && typeof target.closest === 'function') {
        if (target.closest('#uiDialogHost')) return true;
      }
      return false;
    };
    const shouldPauseActiveIdleCollapse = () => {
      if (!shouldPauseIdleCollapse) return false;
      try {
        return !!shouldPauseIdleCollapse(activeKey);
      } catch (_) {
        return false;
      }
    };

    const scheduleIdleCollapse = () => {
      clearIdleTimer();
      if (!idleCollapseMs || !activeKey) return;
      idleTimerId = setTimeout(() => {
        idleTimerId = null;
        if (!isEnabled() || !activeKey) return;
        if (
          shouldSkipDismissForUiDialog(null) ||
          shouldPauseActiveIdleCollapse()
        ) {
          scheduleIdleCollapse();
          return;
        }
        if (!collapseAll()) return;
        if (onIdleCollapse) onIdleCollapse();
      }, idleCollapseMs);
    };

    const activate = (key) => {
      const normalized = normalizeKey(key);
      if (!normalized || normalized === activeKey) return false;
      activeKey = normalized;
      scheduleIdleCollapse();
      return true;
    };

    const toggle = (key) => {
      const normalized = normalizeKey(key);
      if (!normalized) return false;
      if (normalized === activeKey) return collapseActive();
      activeKey = normalized;
      scheduleIdleCollapse();
      return true;
    };

    if (idleCollapseMs && idleResetActivity && listEl instanceof HTMLElement) {
      const onIdleResetActivity = (event) => {
        if (!activeKey || !isEnabled()) return;
        const target = event?.target;
        if (!idleResetActivity(target, activeKey)) return;
        scheduleIdleCollapse();
      };
      for (const type of ['pointerdown', 'keydown', 'focusin']) {
        listEl.addEventListener(type, onIdleResetActivity, true);
      }
    }

    const bindAutoDismiss = (dismissOptions = {}) => {
      if (!(listEl instanceof HTMLElement)) return () => {};

      const shouldIgnoreTarget =
        typeof dismissOptions.shouldIgnoreTarget === 'function'
          ? dismissOptions.shouldIgnoreTarget
          : null;
      const onDismissed =
        typeof dismissOptions.onDismissed === 'function'
          ? dismissOptions.onDismissed
          : null;

      const dismissAndNotify = () => {
        if (!isEnabled()) return;
        if (!collapseAll()) return;
        if (onDismissed) onDismissed();
      };

      const onListClick = (event) => {
        const target = event?.target;
        if (!(target instanceof Element)) return;
        const row = target.closest('li');
        if (row && listEl.contains(row)) return;
        dismissAndNotify();
      };

      const onDocumentMouseDown = (event) => {
        const target = event?.target;
        if (!(target instanceof Node)) return;
        if (listEl.contains(target)) return;
        if (shouldSkipDismissForUiDialog(target)) return;
        if (shouldIgnoreTarget && shouldIgnoreTarget(target)) return;
        dismissAndNotify();
      };

      listEl.addEventListener('click', onListClick);
      document.addEventListener('mousedown', onDocumentMouseDown, true);

      return () => {
        listEl.removeEventListener('click', onListClick);
        document.removeEventListener('mousedown', onDocumentMouseDown, true);
      };
    };

    return {
      getActiveKey,
      isActive,
      collapseActive,
      activate,
      toggle,
      collapseAll,
      bindAutoDismiss,
    };
  }

  window.listRowStepper = {
    createStepperDOM,
    syncRowVisuals,
    syncVariantParentRowVisuals,
    measurePlannerRowTrailingChromePx,
    setRowTrailingPhase,
    getNextStepQty,
    createController,
    setShoppingListBadgeQtyLabel,
    setShoppingListBadgeContent,
    setStepperQtyDisplay,
    applyShoppingItemDecreaseAffordance,
  };
})();
