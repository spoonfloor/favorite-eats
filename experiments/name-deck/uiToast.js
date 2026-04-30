/**
 * Minimal window.ui.toast — same DOM/classes as baby-eats js/utils.js.
 * Quarantined; does not load full utils.js.
 */
(function initMinimalToast() {
  if (typeof window === 'undefined') return;
  if (window.ui && typeof window.ui.toast === 'function') return;

  const ensureToastHost = () => {
    let host = document.getElementById('typeaheadToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'typeaheadToastHost';
      document.body.appendChild(host);
    }
    if (!host.classList.contains('ui-toast-host')) host.classList.add('ui-toast-host');
    if (!host.classList.contains('typeahead-toast-host')) host.classList.add('typeahead-toast-host');
    return host;
  };

  const toast = ({
    message = '',
    actionText = '',
    onAction = null,
    timeoutMs = 5000,
    singleSlot = true,
  } = {}) => {
    try {
      const host = ensureToastHost();
      if (singleSlot) {
        try {
          while (host.firstChild) host.removeChild(host.firstChild);
        } catch (_) {}
      }

      const el = document.createElement('div');
      el.className = 'ui-toast typeahead-toast';

      const msg = document.createElement('div');
      msg.className = 'ui-toast__msg typeahead-toast__msg';
      msg.textContent = message || '';
      el.appendChild(msg);

      if (actionText) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ui-toast__action typeahead-toast__undo';
        btn.textContent = actionText;
        btn.addEventListener('click', () => {
          try {
            if (typeof onAction === 'function') onAction();
          } finally {
            try {
              if (el && el.parentNode) el.parentNode.removeChild(el);
            } catch (_) {}
          }
        });
        el.appendChild(btn);
      }

      host.appendChild(el);

      const removeToast = () => {
        try {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch (_) {}
      };
      const lifetimeMs = Math.max(1000, Number(timeoutMs) || 5000);
      let t = window.setTimeout(removeToast, lifetimeMs);

      el.addEventListener('mouseenter', () => {
        try {
          window.clearTimeout(t);
        } catch (_) {}
      });
      el.addEventListener('mouseleave', () => {
        try {
          window.clearTimeout(t);
        } catch (_) {}
        t = window.setTimeout(removeToast, lifetimeMs);
      });

      return el;
    } catch (_) {
      return null;
    }
  };

  window.ui = Object.freeze({
    toast,
  });
})();
