import {BOM_STORAGE_KEY, validateBom} from './bom-format.mjs';
import {PRESETS} from './presets.js';

const KEY = 'teardown-rack-row-v1';

export function createRowState(current) {
  let state;
  let loadError = '';
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) {
      state = JSON.parse(saved);
      if (!Number.isInteger(state.active) || !Array.isArray(state.racks) || state.racks.length !== PRESETS.length ||
          state.active < 0 || state.active >= state.racks.length) throw new Error('Invalid row state');
      state.racks = state.racks.map(validateBom);
    }
  } catch (error) {
    console.warn('[row] Could not restore row configurations:', error);
    loadError = `Could not restore saved rack row: ${error.message}. Showing default row; previously saved configurations may be unavailable.`;
    state = null;
  }
  if (!state) state = {active: 0, racks: PRESETS.map((preset) => validateBom(preset.bom))};
  state.racks[state.active] = validateBom(current);
  return {
    get active() { return state.active; },
    get racks() { return state.racks; },
    get loadError() { return loadError; },
    switchTo(index, activeBom) {
      if (!Number.isInteger(index) || index < 0 || index >= state.racks.length) throw new Error('Invalid rack selection');
      const racks = state.racks.slice();
      racks[state.active] = validateBom(activeBom);
      const next = {active: index, racks};
      const previousBom = sessionStorage.getItem(BOM_STORAGE_KEY);
      const previousRow = sessionStorage.getItem(KEY);
      try {
        sessionStorage.setItem(BOM_STORAGE_KEY, JSON.stringify(racks[index]));
        sessionStorage.setItem(KEY, JSON.stringify(next));
      } catch (error) {
        try {
          if (previousBom === null) sessionStorage.removeItem(BOM_STORAGE_KEY);
          else sessionStorage.setItem(BOM_STORAGE_KEY, previousBom);
          if (previousRow === null) sessionStorage.removeItem(KEY);
          else sessionStorage.setItem(KEY, previousRow);
        } catch (rollback) {
          throw new Error(`Storage update failed: ${error.message}. Restoring previous storage also failed: ${rollback.message}`);
        }
        throw error;
      }
      state = next;
    },
  };
}
