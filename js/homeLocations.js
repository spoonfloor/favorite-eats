// Canonical home location definitions shared across shopping and recipe views.
(function initHomeLocations(global) {
  if (!global) return;

  const HOME_LOCATION_DEFS = Object.freeze([
    { id: 'fridge', label: 'fridge' },
    { id: 'freezer', label: 'freezer' },
    { id: 'above fridge', label: 'above fridge' },
    // Cereal cabinet before pantry: global checklist/dropdown order for home locations.
    { id: 'cereal cabinet', label: 'cereal cabinet' },
    { id: 'pantry', label: 'pantry' },
    { id: 'spices', label: 'spices' },
    { id: 'fruit stand', label: 'fruit stand' },
    { id: 'coffee bar', label: 'coffee bar' },
    { id: 'none', label: 'no location' },
  ]);

  const HOME_LOCATION_ID_SET = new Set(HOME_LOCATION_DEFS.map((entry) => entry.id));

  function normalizeHomeLocationId(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value || value === 'measures') return 'none';
    return HOME_LOCATION_ID_SET.has(value) ? value : 'none';
  }

  function getHomeLocationDefs() {
    return HOME_LOCATION_DEFS.map((entry) => ({ ...entry }));
  }

  global.HOME_LOCATION_DEFS = HOME_LOCATION_DEFS;
  global.getHomeLocationDefs = getHomeLocationDefs;
  global.normalizeHomeLocationId = normalizeHomeLocationId;
})(typeof window !== 'undefined' ? window : globalThis);
