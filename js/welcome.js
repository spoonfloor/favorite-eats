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

async function handleElectronWelcomeLoad() {
  const params = new URLSearchParams(window.location?.search || '');
  if ((params.get('adapter') || '').toLowerCase() !== 'sqlite') {
    window.location.href = 'recipes.html';
    return;
  }

  const lastPath = localStorage.getItem('favoriteEatsDbPath');
  const dbPath = await window.electronAPI.pickDB(lastPath);
  if (!dbPath) {
    return;
  }

  localStorage.setItem('favoriteEatsDbPath', dbPath);
  await window.electronAPI.loadDB(dbPath);
  window.location.href = `recipes.html${window.location.search || ''}`;
}

function readDbFileAsUint8Array(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error('No file selected.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error || new Error('File read failed.'));
    reader.onload = () => {
      try {
        resolve(new Uint8Array(reader.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

async function importBrowserDbFile(file) {
  const uints = await readDbFileAsUint8Array(file);
  if (!uints || uints.byteLength < 100) {
    throw new Error('File is not a valid database.');
  }
  localStorage.setItem('favoriteEatsDb', JSON.stringify(Array.from(uints)));
  window.location.href = 'recipes.html';
}

function initWelcomePage() {
  try {
    document.documentElement.dataset.platform = 'editor';
  } catch (_) {}

  const loadDbBtn = document.getElementById('loadDbBtn');
  const dbLoader = document.getElementById('dbLoader');
  if (!(loadDbBtn instanceof HTMLButtonElement)) return;

  let electronBusy = false;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadDbBtn.click();
    }
  });

  loadDbBtn.addEventListener('click', async () => {
    try {
      if (window.electronAPI && typeof window.electronAPI.pickDB === 'function') {
        if (electronBusy) return;
        electronBusy = true;
        await handleElectronWelcomeLoad();
        return;
      }

      if (!(dbLoader instanceof HTMLInputElement)) {
        welcomeToast({
          message: 'File picker is missing on this page.',
          timeoutMs: 8000,
        });
        return;
      }
      dbLoader.value = '';
      dbLoader.click();
    } catch (err) {
      console.error('Failed to load database:', err);
      welcomeToast({
        message: 'Failed to load database.',
        timeoutMs: 8000,
      });
    } finally {
      electronBusy = false;
    }
  });

  if (dbLoader instanceof HTMLInputElement) {
    dbLoader.addEventListener('change', async (e) => {
      try {
        const file = e.target && e.target.files ? e.target.files[0] : null;
        if (!file) return;
        await importBrowserDbFile(file);
      } catch (err) {
        console.error('Failed to import chosen database:', err);
        welcomeToast({
          message: 'Failed to load chosen database file.',
          timeoutMs: 8000,
        });
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWelcomePage, { once: true });
} else {
  initWelcomePage();
}
