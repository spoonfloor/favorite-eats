/* global window, document, localStorage */
(function initPlannerDebugBadge() {
  const EVT = 'favoriteEatsPlannerModeChanged';

  function readPlannerOn() {
    try {
      if (
        window.plannerMode &&
        typeof window.plannerMode.isEnabled === 'function'
      ) {
        return !!window.plannerMode.isEnabled();
      }
    } catch (_) {}
    try {
      const v = document.body && document.body.dataset
        ? document.body.dataset.plannerMode
        : '';
      if (v === 'on') return true;
      if (v === 'off') return false;
    } catch (_) {}
    try {
      let x = localStorage.getItem('favoriteEatsPlannerModeOn');
      if (x === '1' || x === '0') return x === '1';
      x = localStorage.getItem('favoriteEatsPlannerOn');
      if (x === '1' || x === '0') return x === '1';
    } catch (_) {}
    return false;
  }

  function sync() {
    let el = document.getElementById('plannerDebugBadge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'plannerDebugBadge';
      el.className = 'planner-debug-badge';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    const on = readPlannerOn();
    el.textContent = on ? 'planner ON' : 'planner OFF';
    el.dataset.plannerDebug = on ? 'on' : 'off';
  }

  function boot() {
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', (e) => {
      if (
        e.key === 'favoriteEatsPlannerModeOn' ||
        e.key === 'favoriteEatsPlannerOn'
      ) {
        sync();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
