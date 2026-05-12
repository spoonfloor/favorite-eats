/**
 * Centralized hint controller for the Ingredients section.
 *
 * Manages a single "active hint" slot at any time, resolving priority:
 *   1. Modifier-hover > Edit-mode focus
 *   2. Edit-mode focus > nothing
 *   3. Empty-state hint is always visible when list is empty
 *
 * The INGREDIENTS header participates as an entity only in non-empty
 * state: holding Option/Alt while hovering it shows the top CTA and can
 * steal from an entity in edit mode. In empty state, that same CTA stays
 * visible persistently.
 *
 * The "space below" a row also counts as hovering that row by mapping each
 * `.ingredient-insert-zone` back to the nearest preceding slot/header.
 *
 * Usage: call `initIngredientHintController(ingredientsSection)` after
 * every rerender.  It is safe to call repeatedly — the previous instance
 * is torn down automatically.
 */

(function () {
  'use strict';

  const ACTIVE_CLASS = 'ingredient-slot--hint-active';
  const HOVER_REVEAL_MODIFIER_KEY = 'Alt';
  const MASTER_LINK_MODE_CLASS = 'ingredient-master-link-mode';

  let _teardown = null;

  function initIngredientHintController(section) {
    if (_teardown) {
      _teardown();
      _teardown = null;
    }

    if (!section) return;

    // --- State ---
    let hoverTarget = null;   // slot or header element currently hovered
    let focusTarget = null;   // slot that currently owns an active editor
    let hoverOverCta = false; // cursor is over the CTA itself (keep it alive)
    let hoverModifierActive = false;
    let hoverClearTimer = null;
    let activationTimer = null;
    let pendingActivationTarget = null;
    let activeTarget = null;
    let requestedTarget = null; // one-shot target requested by insert flow
    let pointerTarget = null;
    let lastPointerClientX = null;
    let lastPointerClientY = null;

    const slots = () => section.querySelectorAll('.ingredient-slot');
    const headerCta = () => section.querySelector('.ingredient-header-cta');
    const headerCanHoverActivate = () => {
      const cta = headerCta();
      return !!(cta && !cta.classList.contains('ingredient-header-cta--persistent'));
    };
    const hoverRevealArmed = () => hoverModifierActive;
    const syncMasterLinkModeClass = () => {
      try {
        document.body.classList.toggle(MASTER_LINK_MODE_CLASS, hoverModifierActive);
      } catch (_) {}
    };

    function slotHasActiveEditor(slot) {
      if (!slot || !slot.isConnected || !section.contains(slot)) return false;
      return !!(
        slot.querySelector('.ingredient-edit-row.editing') ||
        slot.querySelector(
          '.ingredient-subsection-heading-text[contenteditable="true"]'
        )
      );
    }

    function escapeAttrValue(value) {
      const raw = String(value || '');
      if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(raw);
      }
      return raw.replace(/["\\]/g, '\\$&');
    }

    function getActiveHeadingEditorSlot() {
      const active = window._activeIngredientHeadingEditor;
      const clientId =
        active && active.clientId != null ? String(active.clientId) : '';
      if (!clientId) return null;

      const text = section.querySelector(
        `.ingredient-subsection-heading-text[data-heading-client-id="${escapeAttrValue(
          clientId
        )}"]`
      );
      const slot = text && text.closest ? text.closest('.ingredient-slot') : null;
      return slot && section.contains(slot) ? slot : null;
    }

    function normalizeTargets() {
      if (hoverTarget && (!hoverTarget.isConnected || !section.contains(hoverTarget))) {
        hoverTarget = null;
      }
      if (!slotHasActiveEditor(focusTarget)) {
        // Subheading edit sessions should keep owning their hint until commit/cancel,
        // even if focus bookkeeping briefly drops during rerender or hover handoff.
        focusTarget = getActiveHeadingEditorSlot();
      }
      if (requestedTarget && (!requestedTarget.isConnected || !section.contains(requestedTarget))) {
        requestedTarget = null;
      }
    }

    function rememberPointerSnapshot(e) {
      if (!e) return;
      if (e.target) pointerTarget = e.target;
      if (Number.isFinite(e.clientX)) lastPointerClientX = e.clientX;
      if (Number.isFinite(e.clientY)) lastPointerClientY = e.clientY;
    }

    function getLivePointerTarget() {
      // Prefer elementFromPoint over the stored pointer target.  The stored
      // target can be a node whose *parent* has become display:none (e.g. the
      // button inside the header CTA after the CTA loses its --persistent
      // class).  isConnected is still true in that case, but the element is
      // invisible and elementFromPoint will correctly return whatever is
      // actually visible at those coordinates instead.
      if (
        Number.isFinite(lastPointerClientX) &&
        Number.isFinite(lastPointerClientY) &&
        typeof document.elementFromPoint === 'function'
      ) {
        const live = document.elementFromPoint(lastPointerClientX, lastPointerClientY);
        if (live) return live;
      }
      if (pointerTarget && pointerTarget.isConnected) return pointerTarget;
      return null;
    }

    function syncHoverTargetFromPointer() {
      const liveTarget = getLivePointerTarget();
      if (!liveTarget || !section.contains(liveTarget)) return false;

      const cta = liveTarget.closest && liveTarget.closest('.ingredient-add-cta');
      if (cta && section.contains(cta)) {
        hoverOverCta = true;
        return false;
      }

      hoverOverCta = false;
      const entity = findEntity(liveTarget);
      if (entity === hoverTarget) return false;
      hoverTarget = entity;
      return true;
    }

    function cancelPendingHoverClear() {
      if (hoverClearTimer) {
        clearTimeout(hoverClearTimer);
        hoverClearTimer = null;
      }
    }

    function clearHoverNow() {
      cancelPendingHoverClear();
      hoverTarget = null;
      resolve();
    }

    function scheduleHoverClear() {
      clearHoverNow();
    }

    function cancelPendingActivation() {
      if (activationTimer) {
        clearTimeout(activationTimer);
        activationTimer = null;
      }
      pendingActivationTarget = null;
    }

    function applyWinnerNow(winner) {
      // Clear all
      slots().forEach((s) => s.classList.remove(ACTIVE_CLASS));
      const hCta = headerCta();
      if (hCta) hCta.classList.remove('ingredient-header-cta--active');

      activeTarget = winner || null;
      if (!winner) return;

      if (winner.classList.contains('section-header')) {
        if (hCta) hCta.classList.add('ingredient-header-cta--active');
      } else if (winner.classList.contains('ingredient-slot')) {
        winner.classList.add(ACTIVE_CLASS);
      }
      if (winner === requestedTarget) {
        requestedTarget = null;
      }
    }

    function consumePendingRequestedTarget() {
      const clientId =
        window._pendingIngredientHintClientId != null
          ? String(window._pendingIngredientHintClientId)
          : '';
      if (!clientId) return;

      window._pendingIngredientHintClientId = null;
      const card = section.querySelector(
        `.ingredient-line[data-client-id="${escapeAttrValue(clientId)}"]`
      );
      const slot = card && card.closest ? card.closest('.ingredient-slot') : null;
      if (slot && section.contains(slot)) {
        requestedTarget = slot;
      }
    }

    function getDesiredWinner() {
      // Priority: hover > requested one-shot target > nothing.
      // Hints are reveal-only on modifier-hover; edit focus alone does not
      // activate a hint.
      const hoverWinner = hoverRevealArmed() ? hoverTarget : null;

      // Empty-state fallback: if Option is held, pointer is inside the section,
      // there are no ingredient slots yet, and the header CTA is available for
      // hover-activation — show the header hint regardless of the exact element
      // under the cursor.  This covers hovering the insert card, the insert
      // zone, or any other non-entity area while the first insert tray is open.
      if (!hoverWinner && hoverRevealArmed() && headerCanHoverActivate() && slots().length === 0) {
        const liveTarget = getLivePointerTarget();
        if (liveTarget && section.contains(liveTarget)) {
          const h = section.querySelector('.section-header');
          if (h && section.contains(h)) return h;
        }
      }

      return hoverWinner || requestedTarget || null;
    }

    function scheduleActivation(winner) {
      if (!winner) return;
      if (activeTarget === winner) return;
      normalizeTargets();
      consumePendingRequestedTarget();
      const desired = getDesiredWinner();
      if (desired !== winner) {
        resolve();
        return;
      }
      applyWinnerNow(winner);
    }

    // --- Resolve: who gets the hint? ---
    function resolve() {
      normalizeTargets();
      syncHoverTargetFromPointer();
      consumePendingRequestedTarget();

      // Any direct user intent cancels a stale one-shot post-add target.
      if (hoverTarget || focusTarget) {
        requestedTarget = null;
      }
      const winner = getDesiredWinner();

      if (!winner) {
        cancelPendingActivation();
        applyWinnerNow(null);
        return;
      }
      scheduleActivation(winner);
    }

    // --- Hover tracking (per-slot + header) ---
    // We use mouseover/mouseout on the container (they bubble) and
    // resolve the slot from the event target.

    function findInsertZoneOwner(insertZone) {
      if (!insertZone || !insertZone.parentElement) return null;

      let el = insertZone.previousElementSibling;
      while (el) {
        if (el.classList.contains('ingredient-slot')) return el;
        if (el.classList.contains('section-header') && headerCanHoverActivate()) {
          return el;
        }
        if (
          el.classList.contains('recipe-editor-section-header-row') &&
          headerCanHoverActivate()
        ) {
          const h = el.querySelector('.section-header');
          if (h) return h;
        }
        el = el.previousElementSibling;
      }
      return null;
    }

    function findEntity(target) {
      if (!target || !target.closest) return null;
      const cta = target.closest('.ingredient-add-cta');
      if (cta) return null; // CTA hover handled separately
      const slot = target.closest('.ingredient-slot');
      if (slot && section.contains(slot)) return slot;
      const insertZone = target.closest('.ingredient-insert-zone');
      if (insertZone && section.contains(insertZone)) {
        return findInsertZoneOwner(insertZone);
      }
      const h = target.closest('.section-header');
      if (h && section.contains(h) && headerCanHoverActivate()) return h;
      return null;
    }

    function onMouseOver(e) {
      rememberPointerSnapshot(e);
      cancelPendingHoverClear();
      if (!!e.altKey !== hoverModifierActive) {
        hoverModifierActive = !!e.altKey;
      }

      // If cursor moved onto a CTA, flag it so we don't hide on mouseout.
      const cta = e.target.closest && e.target.closest('.ingredient-add-cta');
      if (cta && section.contains(cta)) {
        hoverOverCta = true;
        return;
      }
      hoverOverCta = false;

      const entity = findEntity(e.target);
      if (entity && entity !== hoverTarget) {
        hoverTarget = entity;
        resolve();
      }
    }

    function onMouseOut(e) {
      rememberPointerSnapshot(e);
      const cta = e.target.closest && e.target.closest('.ingredient-add-cta');
      if (cta) {
        const related = e.relatedTarget;
        const stillInCta = related && related.closest && related.closest('.ingredient-add-cta');
        if (!stillInCta) {
          hoverOverCta = false;
          // Check if we moved back onto the parent slot
          const entity = related ? findEntity(related) : null;
          if (entity) {
            cancelPendingHoverClear();
            hoverTarget = entity;
            resolve();
          } else if (related && section.contains(related)) {
            scheduleHoverClear();
          } else {
            clearHoverNow();
          }
        }
        return;
      }

      if (!hoverTarget) return;

      const related = e.relatedTarget;

      // Moving into a CTA that belongs to the current hint? Keep it.
      if (related && related.closest) {
        const relCta = related.closest('.ingredient-add-cta');
        if (relCta && section.contains(relCta)) {
          hoverOverCta = true;
          return;
        }
      }

      // Still inside the same entity?
      const nextEntity = related ? findEntity(related) : null;
      if (nextEntity === hoverTarget) return;

      if (nextEntity) {
        cancelPendingHoverClear();
        hoverTarget = nextEntity;
        resolve();
        return;
      }

      if (related && section.contains(related)) {
        scheduleHoverClear();
        return;
      }

      clearHoverNow();
    }

    function onMouseLeave() {
      cancelPendingHoverClear();
      hoverTarget = null;
      hoverOverCta = false;
      pointerTarget = null;
      lastPointerClientX = null;
      lastPointerClientY = null;
      resolve();
    }

    function syncHoverModifier(e) {
      const next = !!(e && e.altKey);
      if (next === hoverModifierActive) return;
      hoverModifierActive = next;
      syncMasterLinkModeClass();
      syncHoverTargetFromPointer();
      resolve();
    }

    function clearHoverModifier() {
      if (!hoverModifierActive) return;
      hoverModifierActive = false;
      syncMasterLinkModeClass();
      resolve();
    }

    // --- Focus tracking (edit-mode entity) ---
    function onFocusIn(e) {
      const target = e.target;
      if (!target || !target.closest) return;

      const isActiveEditorTarget =
        !!target.closest('.ingredient-edit-row.editing') ||
        !!target.closest(
          '.ingredient-subsection-heading-text[contenteditable="true"]'
        );

      if (!isActiveEditorTarget) return;

      const slot = target.closest('.ingredient-slot');
      if (!slot || !section.contains(slot)) return;

      focusTarget = slot;
      resolve();
    }

    function onFocusOut() {
      if (!focusTarget) return;

      // Defer until the edit controller finishes any commit/cancel + rerender.
      setTimeout(() => {
        resolve();
      }, 0);
    }

    // --- Bind ---
    section.addEventListener('mouseover', onMouseOver);
    section.addEventListener('mouseout', onMouseOut);
    section.addEventListener('mouseleave', onMouseLeave);
    section.addEventListener('mousemove', rememberPointerSnapshot);
    section.addEventListener('focusin', onFocusIn);
    section.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', syncHoverModifier, true);
    document.addEventListener('keyup', syncHoverModifier, true);
    window.addEventListener('blur', clearHoverModifier);

    // Listen for edit-mode changes on body so we can re-resolve.
    const observer = new MutationObserver(() => resolve());
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // Initial resolve. The shared header CTA handles both the empty-state
    // persistent hint and the non-empty hover hint via CSS classes.
    resolve();

    _teardown = () => {
      section.removeEventListener('mouseover', onMouseOver);
      section.removeEventListener('mouseout', onMouseOut);
      section.removeEventListener('mouseleave', onMouseLeave);
      section.removeEventListener('mousemove', rememberPointerSnapshot);
      section.removeEventListener('focusin', onFocusIn);
      section.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', syncHoverModifier, true);
      document.removeEventListener('keyup', syncHoverModifier, true);
      window.removeEventListener('blur', clearHoverModifier);
      observer.disconnect();
      cancelPendingHoverClear();
      cancelPendingActivation();
      hoverTarget = null;
      focusTarget = null;
      hoverOverCta = false;
      hoverModifierActive = false;
      syncMasterLinkModeClass();
      activeTarget = null;
      requestedTarget = null;
      pointerTarget = null;
      lastPointerClientX = null;
      lastPointerClientY = null;
    };
  }

  window.initIngredientHintController = initIngredientHintController;
})();
