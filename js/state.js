// ==================== SHARED MUTABLE STATE ====================
// Every module that needs to read or write game state imports from here.
// This avoids circular dependencies and keeps mutation centralized.

export const state = {
  player: null,
  difficulty: 'normal',
  gameState: 'title',
  turnCount: 0,
  cgAttrs: { str: 1, con: 1, dex: 1, int: 1 },
  npcTurnIdx: {},
  shopTab: 'buy',

  // ---- Day/night cycle ----
  // Global tick counter — incremented every player action.
  // Persists across layer transitions. A full cycle is 200 ticks.
  worldTick: 0,

  // ---- Dynamic layer tracking ----
  // Index of the layer currently being rendered / ticked.
  // Only this layer runs enemy AI and is drawn each frame.
  activeLayer: null,
};

<<<<<<< HEAD
// ==================== SPARSE WORLD STORAGE ====================
// worlds is now an Object keyed by layerIndex (number → 2-D grid).
// Layers are created on demand by the world generator and persist here
// so revisiting a layer restores its exact state.
//
//   worlds[0]  → surface grid  (created at game start)
//   worlds[1]  → first underground grid (created when first entered)
//   worlds[n]  → any layer — town interiors, shop interiors, etc.
//
// To iterate all loaded layers:  Object.keys(worlds)
// To check existence:            worlds[layerIndex] !== undefined
// To remove / unload:            delete worlds[layerIndex]

export const worlds = {};
export const covers = [];

// Features & monsters follow the same sparse pattern.
// Key format for features: "layer,x,y"
export const features = {};

// monsters[layerIndex] → array of monster objects on that layer.
// Only state.activeLayer's array is ticked each turn.
export const monsters = {};
=======
// ==================== WORLD STORAGE ====================
// Indexed arrays — one entry per layer.
//   worlds[0]  → surface grid  (created at game start)
//   worlds[1]  → first underground grid (created when first entered)
//   worlds[n]  → any layer — town interiors, shop interiors, etc.

export const worlds = [];
export const covers = [];

// features[layerIndex] → object keyed by "x,y" holding feature data.
export const features = [];

// monsters[layerIndex] → array of monster objects on that layer.
// Only state.activeLayer's array is ticked each turn.
export const monsters = [];
>>>>>>> b0f77dc (Initial commit)

// Reverse look-up: cellKey (e.g. "millhaven") → layerIndex
export const cellKeyToLayer = {};

// ==================== LAYER HELPERS ====================

<<<<<<< HEAD
// Returns the next unused layerIndex.  Because worlds is an object we
// just pick max(existing keys) + 1, or 0 if empty.
export function nextLayerIndex() {
  const keys = Object.keys(worlds).map(Number);
  return keys.length === 0 ? 0 : Math.max(...keys) + 1;
=======
// Returns the next unused layerIndex — simply the current length of the
// worlds array, since layers are appended sequentially.
export function nextLayerIndex() {
  return worlds.length;
>>>>>>> b0f77dc (Initial commit)
}

// Convenience: does layerIndex already have generated data?
export function layerExists(layerIndex) {
  return worlds[layerIndex] !== undefined;
}

// Convenience: get the grid for a layer (or null).
export function getGrid(layerIndex) {
  return worlds[layerIndex] ?? null;
}

// Activate a layer — sets state.activeLayer so the renderer and AI
// tick loop know which grid to use.  Call this after ensuring the
// layer has been generated.
export function activateLayer(layerIndex) {
  state.activeLayer = layerIndex;
}
