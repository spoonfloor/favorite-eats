function ensureWelcomeToastHost() {
  let host = document.getElementById('typeaheadToastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'typeaheadToastHost';
    document.body.appendChild(host);
  }
  if (!host.classList.contains('ui-toast-host')) host.classList.add('ui-toast-host');
  if (!host.classList.contains('typeahead-toast-host'))
    host.classList.add('typeahead-toast-host');
  return host;
}

function welcomeToast({
  message = '',
  timeoutMs = 5000,
  singleSlot = true,
} = {}) {
  try {
    const host = ensureWelcomeToastHost();
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

    host.appendChild(el);

    const t = window.setTimeout(() => {
      try {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch (_) {}
    }, Math.max(1000, Number(timeoutMs) || 5000));

    el.addEventListener('mouseenter', () => {
      try {
        window.clearTimeout(t);
      } catch (_) {}
    });

    return el;
  } catch (_) {
    return null;
  }
}

async function handleWelcomeLoad() {
  window.location.href = `recipes.html${window.location.search || ''}`;
}

function initWelcomePage() {
  try {
    document.documentElement.dataset.platform = 'editor';
  } catch (_) {}

  const loadDbBtn = document.getElementById('loadDbBtn');
  if (!(loadDbBtn instanceof HTMLButtonElement)) return;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadDbBtn.click();
    }
  });

  loadDbBtn.addEventListener('click', async () => {
    try {
      await handleWelcomeLoad();
    } catch (err) {
      console.error('Failed to open recipes:', err);
      welcomeToast({
        message: 'Failed to open recipes.',
        timeoutMs: 8000,
      });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWelcomePage, { once: true });
} else {
  initWelcomePage();
}
