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
   * Keeps collapsed qty in `.shopping-list-row-badge-qty` (last 32px column, aligned with +).
   */
  function setShoppingListBadgeQtyLabel(badge, text) {
    if (!(badge instanceof HTMLElement)) return;
    if (text == null || text === '') {
      badge.replaceChildren();
      return;
    }
    let inner = badge.querySelector(':scope > .shopping-list-row-badge-qty');
    if (!inner) {
      inner = document.createElement('span');
      inner.className = 'shopping-list-row-badge-qty';
      badge.appendChild(inner);
    }
    inner.textContent = String(text);
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
    const qty = Math.max(0, Math.min(qtyMax, Number(options.qty || 0)));
    const isActive = !!options.isActive;
    const selectedDatasetKey = String(options.selectedDatasetKey || '').trim();
    const isSelected = qty > 0;

    if (selectedDatasetKey) {
      rowEl.dataset[selectedDatasetKey] = enabled && isSelected ? 'true' : 'false';
    }

    rowEl.classList.toggle('shopping-row-checked', enabled && isSelected);

    const icon = rowEl.querySelector('.shopping-list-row-icon');
    const stepper = rowEl.querySelector('.shopping-list-row-stepper');
    const badge = rowEl.querySelector('.shopping-list-row-badge');
    const qtyEl = stepper?.querySelector('.shopping-stepper-qty');

    if (qtyEl) qtyEl.textContent = formatStepperQtyLabel(qty);

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
    const atQtyMax = qty >= qtyMax - qtyEpsilon;
    if (plusBtn) plusBtn.disabled = enabled && isActive && atQtyMax;

    if (!enabled) {
      if (icon) icon.style.display = '';
      if (stepper) stepper.style.display = 'none';
      if (badge) {
        badge.style.display = 'none';
        setShoppingListBadgeQtyLabel(badge, '');
      }
      return;
    }

    if (isActive) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = '';
      if (badge) {
        badge.style.display = 'none';
        setShoppingListBadgeQtyLabel(badge, '');
      }
      return;
    }

    if (isSelected) {
      if (icon) icon.style.display = 'none';
      if (stepper) stepper.style.display = 'none';
      if (badge) {
        badge.style.display = 'inline-flex';
        setShoppingListBadgeQtyLabel(badge, formatStepperQtyLabel(qty));
      }
      return;
    }

    if (icon) icon.style.display = '';
    if (stepper) stepper.style.display = 'none';
    if (badge) {
      badge.style.display = 'none';
      setShoppingListBadgeQtyLabel(badge, '');
    }
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

    const scheduleIdleCollapse = () => {
      clearIdleTimer();
      if (!idleCollapseMs || !activeKey) return;
      idleTimerId = setTimeout(() => {
        idleTimerId = null;
        if (!isEnabled() || !activeKey) return;
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
    getNextStepQty,
    createController,
    setShoppingListBadgeQtyLabel,
    applyShoppingItemDecreaseAffordance,
  };
})();
