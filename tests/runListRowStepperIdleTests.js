#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const listRowStepperPath = path.join(projectRoot, 'js', 'listRowStepper.js');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`
    );
  }
}

function assertTruthy(value, message) {
  if (!value) {
    throw new Error(`${message}: expected truthy value`);
  }
}

function run() {
  const source = fs.readFileSync(listRowStepperPath, 'utf8');
  let lastTimerFn = null;
  let timerCount = 0;
  const context = {
    window: {
      getComputedStyle: () => ({
        gap: '12px',
        display: 'inline-flex',
        visibility: 'visible',
        fontSize: '16px',
        getPropertyValue: (name) => {
          if (name === '--list-planner-row-symbol-size') return '32';
          if (name === '--list-planner-stepper-gap') return '4';
          return '';
        },
      }),
    },
    clearTimeout: () => {},
    setTimeout: (fn) => {
      lastTimerFn = fn;
      timerCount += 1;
      return timerCount;
    },
    HTMLElement: function HTMLElement() {},
    Element: function Element() {},
    Node: function Node() {},
    document: {
      documentElement: { style: {} },
      createElement: () => ({
        className: '',
        textContent: '',
        classList: { add: () => {}, remove: () => {} },
        setAttribute: () => {},
        appendChild: () => {},
        replaceChildren: () => {},
      }),
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'listRowStepper.js' });
  const api = context.window.listRowStepper;
  if (!api || typeof api.createController !== 'function') {
    throw new Error('listRowStepper.createController missing.');
  }

  let idleCalls = 0;
  const listListeners = {};
  const listEl = new context.HTMLElement();
  listEl.addEventListener = (type, handler) => {
    listListeners[type] = handler;
  };
  listEl.contains = () => false;
  const row = new context.HTMLElement();
  row.dataset = { recipeRowStepperKey: '99' };
  row.closest = (sel) => (sel === 'li' ? row : null);
  listEl.contains = (node) => node === row;

  const ctrl = api.createController({
    listEl,
    isEnabled: () => true,
    idleCollapseMs: 3500,
    onIdleCollapse: () => {
      idleCalls += 1;
    },
    idleResetActivity: (target, activeKey) => {
      if (!(target instanceof context.Element)) return false;
      const r = typeof target.closest === 'function' ? target.closest('li') : null;
      if (!r || !listEl.contains(r)) return false;
      return String(r.dataset.recipeRowStepperKey || '') === activeKey;
    },
  });

  assertEqual(ctrl.activate('99'), true, 'activate');
  assertTruthy(lastTimerFn, 'idle timer scheduled');
  lastTimerFn();
  assertEqual(ctrl.getActiveKey(), '', 'idle collapses');
  assertEqual(idleCalls, 1, 'onIdleCollapse once');

  idleCalls = 0;
  assertEqual(ctrl.activate('99'), true, 'reactivate');
  lastTimerFn();
  assertEqual(idleCalls, 1, 'onIdleCollapse again');

  const activityRow = new context.Element();
  activityRow.dataset = { recipeRowStepperKey: '42' };
  activityRow.closest = (sel) => (sel === 'li' ? activityRow : null);
  listEl.contains = (node) => node === activityRow;
  const timerCountBeforeActivity = timerCount;
  assertEqual(ctrl.activate('42'), true, 'activate activity row');
  listListeners.pointerdown({ target: activityRow });
  assertEqual(
    timerCount,
    timerCountBeforeActivity + 2,
    'active row activity reschedules idle timer',
  );

  let pauseIdle = true;
  let pausedIdleCalls = 0;
  const pausedCtrl = api.createController({
    listEl,
    isEnabled: () => true,
    idleCollapseMs: 3500,
    shouldPauseIdleCollapse: () => pauseIdle,
    onIdleCollapse: () => {
      pausedIdleCalls += 1;
    },
  });
  assertEqual(pausedCtrl.activate('pause-me'), true, 'activate paused row');
  lastTimerFn();
  assertEqual(pausedCtrl.getActiveKey(), 'pause-me', 'paused idle stays active');
  assertEqual(pausedIdleCalls, 0, 'paused idle does not notify');
  pauseIdle = false;
  lastTimerFn();
  assertEqual(pausedCtrl.getActiveKey(), '', 'unpaused idle collapses later');
  assertEqual(pausedIdleCalls, 1, 'unpaused idle notifies once');

  const makeShoppingStepperRow = () => {
    const row = new context.HTMLElement();
    row.dataset = {};
    row.classList = { toggle: () => {} };
    const stepper = new context.HTMLElement();
    stepper.className = 'shopping-list-row-stepper';
    stepper.style = { display: '' };
    const minusBtn = new context.HTMLElement();
    minusBtn.className = 'shopping-stepper-btn';
    minusBtn.disabled = false;
    minusBtn.setAttribute = () => {};
    minusBtn.appendChild = () => {};
    minusBtn.querySelector = () => ({
      textContent: '',
      setAttribute: () => {},
    });
    const qtySpan = new context.HTMLElement();
    qtySpan.className = 'shopping-stepper-qty';
    qtySpan.textContent = '';
    const plusBtn = new context.HTMLElement();
    plusBtn.className = 'shopping-stepper-btn';
    plusBtn.disabled = false;
    stepper.appendChild = (node) => {
      if (!stepper._children) stepper._children = [];
      stepper._children.push(node);
    };
    stepper.appendChild(minusBtn);
    stepper.appendChild(qtySpan);
    stepper.appendChild(plusBtn);
    stepper.querySelector = (sel) => {
      if (sel === '.shopping-stepper-qty') return qtySpan;
      return null;
    };
    stepper.querySelectorAll = (sel) => {
      if (sel === ':scope > .shopping-stepper-btn') {
        return stepper._children.filter(
          (n) => n && n.className === 'shopping-stepper-btn',
        );
      }
      return [];
    };
    row.appendChild = (node) => {
      if (!row._children) row._children = [];
      row._children.push(node);
    };
    row.appendChild(stepper);
    row.querySelector = (sel) => {
      if (sel === '.shopping-list-row-stepper') return stepper;
      if (sel === '.shopping-list-row-icon') return null;
      if (sel === '.shopping-list-row-badge') return null;
      return null;
    };
    return { row, plusBtn };
  };

  const { row: activeRow, plusBtn: activePlus } = makeShoppingStepperRow();
  api.syncRowVisuals(activeRow, {
    enabled: true,
    qty: 99,
    isActive: true,
    selectedDatasetKey: 'shoppingSelected',
  });
  assertEqual(activePlus.disabled, true, 'plus disabled at planner max');

  const { row: belowMaxRow, plusBtn: belowMaxPlus } = makeShoppingStepperRow();
  api.syncRowVisuals(belowMaxRow, {
    enabled: true,
    qty: 98,
    isActive: true,
    selectedDatasetKey: 'shoppingSelected',
  });
  assertEqual(belowMaxPlus.disabled, false, 'plus enabled below planner max');

  const makeBadgeRow = () => {
    const row = new context.HTMLElement();
    row.dataset = {};
    row.style = {};
    row.classList = { toggle: () => {} };
    row.getBoundingClientRect = () => ({ width: 32 });
    const badge = new context.HTMLElement();
    badge.className = 'shopping-list-row-badge';
    badge.style = { display: 'inline-flex', visibility: '' };
    badge.offsetWidth = 32;
    badge.getBoundingClientRect = () => ({ width: 32 });
    badge.replaceChildren = () => {};
    badge.appendChild = () => {};
    row.appendChild = (node) => {
      if (!row._children) row._children = [];
      row._children.push(node);
    };
    row.appendChild(badge);
    row.querySelector = (sel) => {
      if (sel === '.shopping-list-row-badge') return badge;
      if (sel === '.shopping-list-row-stepper') return null;
      if (sel === '.shopping-list-row-icon') return null;
      return null;
    };
    return { row, badge };
  };

  const { row: badgeRow } = makeBadgeRow();
  api.syncRowVisuals(badgeRow, {
    enabled: true,
    qty: 2,
    isActive: false,
    selectedDatasetKey: 'shoppingSelected',
  });
  assertEqual(badgeRow.dataset.trailingPhase, 'badge', 'selected row uses badge phase');

  const { row: stepperPhaseRow } = makeShoppingStepperRow();
  api.syncRowVisuals(stepperPhaseRow, {
    enabled: true,
    qty: 2,
    isActive: true,
    selectedDatasetKey: 'shoppingSelected',
  });
  assertEqual(
    stepperPhaseRow.dataset.trailingPhase,
    'stepper',
    'active row uses stepper phase',
  );

  const { row: parentRow, badge: parentBadge } = makeBadgeRow();
  parentBadge.replaceChildren = () => {};
  parentBadge.appendChild = () => {};
  api.syncVariantParentRowVisuals(parentRow, {
    expanded: true,
    hasQty: true,
    checked: true,
    badgeContent: { type: 'text', value: '2' },
  });
  assertEqual(
    parentRow.dataset.trailingPhase,
    'none',
    'expanded variant parent drops trailing chrome',
  );
  assertEqual(parentBadge.style.display, 'none', 'expanded parent hides badge');

  api.syncVariantParentRowVisuals(parentRow, {
    expanded: false,
    hasQty: true,
    checked: true,
    badgeContent: { type: 'text', value: '2' },
  });
  assertEqual(
    parentRow.dataset.trailingPhase,
    'badge',
    'collapsed variant parent shows badge phase',
  );

  assertEqual(
    api.getNextStepQty(99, 1, { min: 0, max: 99 }),
    99,
    'getNextStepQty does not exceed max',
  );

  console.log('List row stepper idle tests passed.');
}

run();
