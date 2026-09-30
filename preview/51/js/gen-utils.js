// ==================== SHARED GENERATION UTILITIES ====================
import { covers } from './state.js';

// ==================== HELPERS ====================
// Helper to ensure cover grid exists for a layer
export function ensureCoverGrid(layerIndex, w, h) {
  if (!covers[layerIndex]) {
    const coverGrid = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) row.push(0);
      coverGrid.push(row);
    }
    covers[layerIndex] = coverGrid;
  }
  return covers[layerIndex];
}
