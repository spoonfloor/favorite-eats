#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const listRowStepperPath = path.join(projectRoot, 'js', 'listRowStepper.js');
const recipeEditorPath = path.join(projectRoot, 'js', 'recipeEditor.js');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function loadListRowStepper() {
  const source = fs.readFileSync(listRowStepperPath, 'utf8');
  class FakeElement {
    constructor(className = '') {
      this.className = className;
      this.children = [];
      this.dataset = {};
      this.style = {};
      this.textContent = '';
      this.attributes = {};
      this.classList = {
        toggle: (name, enabled) => {
          const classes = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
          if (enabled) classes.add(name);
          else classes.delete(name);
          this.className = Array.from(classes).join(' ');
        },
        add: (name) => {
          const classes = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
          classes.add(name);
          this.className = Array.from(classes).join(' ');
        },
        remove: (name) => {
          const classes = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
          classes.delete(name);
          this.className = Array.from(classes).join(' ');
        },
      };
    }
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }
    replaceChildren(...children) {
      this.children = [];
      children.forEach((child) => this.appendChild(child));
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
    querySelector(selector) {
      const matches = this.querySelectorAll(selector);
      return matches[0] || null;
    }
    querySelectorAll(selector) {
      if (selector === ':scope > .shopping-stepper-btn') {
        return this.children.filter((child) =>
          String(child.className || '').split(/\s+/).includes('shopping-stepper-btn')
        );
      }
      if (selector.startsWith('.')) {
        const className = selector.slice(1);
        const out = [];
        const visit = (node) => {
          if (String(node.className || '').split(/\s+/).includes(className)) {
            out.push(node);
          }
          (node.children || []).forEach(visit);
        };
        this.children.forEach(visit);
        return out;
      }
      return [];
    }
  }
  const context = {
    window: {},
    document: {
      createElement: (tagName) => new FakeElement(String(tagName || '')),
    },
    HTMLElement: FakeElement,
    Element: FakeElement,
    Node: FakeElement,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'listRowStepper.js' });
  const api = context.window.listRowStepper;
  if (!api || typeof api.getNextStepQty !== 'function') {
    throw new Error('listRowStepper.getNextStepQty was not attached to window.');
  }
  return { api, FakeElement };
}

function loadRecipeServingsStepper(listRowStepper) {
  const source = fs.readFileSync(recipeEditorPath, 'utf8');
  const snippet = extractSnippet(
    source,
    'function getRecipePlannerServingsDisplayValue(recipe) {',
    'function parseRecipePlannerServingsInputValue(rawValue) {'
  );
  const context = {
    window: {
      listRowStepper,
    },
    getRecipePlannerServingsBounds(recipe) {
      return recipe && recipe.bounds ? recipe.bounds : null;
    },
    roundRecipePlannerServingsValue(rawValue) {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric) || numeric <= 0) return null;
      return Math.round(numeric * 2) / 2;
    },
    clampRecipePlannerServingsValue(rawValue, bounds) {
      if (!bounds) return null;
      if (bounds.baseDefault == null) {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        const rounded = Math.round(numeric * 2) / 2;
        if (rounded == null || rounded <= 0) return null;
        return 1;
      }
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric) || numeric <= 0) return null;
      const rounded = Math.round(numeric * 2) / 2;
      return Math.max(bounds.min, Math.min(bounds.max, rounded));
    },
  };
  vm.createContext(context);
  vm.runInContext(snippet, context, { filename: 'recipeEditor.stepper-snippet.js' });
  if (typeof context.getNextRecipePlannerServingsValue !== 'function') {
    throw new Error('getNextRecipePlannerServingsValue was not defined by snippet.');
  }
  return context.getNextRecipePlannerServingsValue;
}

function run() {
  const { api: listRowStepper, FakeElement } = loadListRowStepper();
  const getNextRecipePlannerServingsValue = loadRecipeServingsStepper(listRowStepper);

  assertEqual(
    listRowStepper.getNextStepQty(0, 1),
    1,
    'generic stepper still increments from zero to one by default'
  );
  assertEqual(
    listRowStepper.getNextStepQty(0, 1, { min: 1, max: 8, snapPositiveTo: 4 }),
    4,
    'stepper snaps positive increments from zero to the requested default'
  );
  assertEqual(
    listRowStepper.getNextStepQty(null, 1, { min: 1, max: 8, snapPositiveTo: 4 }),
    4,
    'stepper snaps positive increments from an unset value to the requested default'
  );

  const recipeBounds = {
    baseDefault: 4,
    min: 1,
    max: 8,
  };
  assertEqual(
    getNextRecipePlannerServingsValue({ servingsDefault: null, bounds: recipeBounds }, 1),
    4,
    'recipe servings stepper initializes unset values to the recipe default'
  );
  assertEqual(
    getNextRecipePlannerServingsValue({ servingsDefault: 0, bounds: recipeBounds }, 1),
    4,
    'recipe servings stepper initializes zero values to the recipe default'
  );
  assertEqual(
    getNextRecipePlannerServingsValue({ servingsDefault: 4, bounds: recipeBounds }, 1),
    5,
    'recipe servings stepper continues normal increments after initialization'
  );

  const assumedBaselineBounds = {
    baseDefault: 1,
    min: 1,
    max: 99,
    canAdjust: true,
  };
  assertEqual(
    getNextRecipePlannerServingsValue({ servingsDefault: null, bounds: assumedBaselineBounds }, 1),
    1,
    'no-base recipe: stepper selects 1 from unset'
  );
  assertEqual(
    getNextRecipePlannerServingsValue({ servingsDefault: 1, bounds: assumedBaselineBounds }, 1),
    2,
    'no-base recipe: stepper increments above baseline'
  );
  assertEqual(
    getNextRecipePlannerServingsValue({ servingsDefault: 2, bounds: assumedBaselineBounds }, -1),
    1,
    'no-base recipe: stepper decrements back to baseline'
  );

  const row = new FakeElement('shopping-browse-planner-row');
  const icon = row.appendChild(new FakeElement('shopping-list-row-icon'));
  const stepper = row.appendChild(new FakeElement('shopping-list-row-stepper'));
  stepper.appendChild(new FakeElement('shopping-stepper-btn'));
  stepper.appendChild(new FakeElement('shopping-stepper-qty'));
  stepper.appendChild(new FakeElement('shopping-stepper-btn'));
  const badge = row.appendChild(new FakeElement('shopping-list-row-badge'));
  listRowStepper.syncRowVisuals(row, {
    enabled: true,
    qty: 0,
    isActive: true,
    showAsSelected: true,
    badgeContent: { type: 'icon', name: 'add_diamond' },
  });
  assertEqual(
    stepper.style.display,
    'none',
    'active zero-quantity shopping rows stay collapsed by default'
  );
  assertEqual(
    badge.style.display,
    'inline-flex',
    'zero recipe-tail shopping rows should remain collapsed as badges by default'
  );

  listRowStepper.syncRowVisuals(row, {
    enabled: true,
    qty: 0,
    isActive: true,
    allowZeroActive: true,
    showAsSelected: true,
    badgeContent: { type: 'icon', name: 'add_diamond' },
  });
  assertEqual(
    stepper.style.display,
    '',
    'recipe-tail shopping rows can open the stepper at zero direct quantity'
  );
  assertEqual(
    badge.style.display,
    'none',
    'open recipe-tail shopping rows should hide the collapsed diamond badge'
  );
  assertEqual(
    icon.style.display,
    'none',
    'selected zero recipe-tail rows should keep the add icon hidden'
  );

  console.log('Recipe planner mode stepper tests passed.');
}

run();
