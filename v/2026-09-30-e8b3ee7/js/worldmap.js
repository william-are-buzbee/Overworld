// ==================== WORLD MAP OVERLAY ====================
// Toggled by pressing M.  Shows the 16×16 biome target grid with
// fog-of-war based on which cells the player has physically visited.
// While open, all other player input is blocked (but the game is NOT paused).

import { state } from './state.js';
import {
  BIOME_TARGET, BIOME_GRID_W, BIOME_GRID_H,
  CELL_TILE_W, CELL_TILE_H, LAYER_SURFACE
} from './constants.js';

// ---- Biome → color lookup (matches the editor) ----
const BIOME_COLORS = {
  plains:   '#88aa44',
  forest:   '#2d5a1e',
  desert:   '#d4b844',
  rock:     '#888888',
  ocean:    '#225588',
  shallows: '#55aacc',
  fungal:   '#7744aa',
  wetland:  '#6b4c2a',
};
const UNEXPLORED_COLOR = '#111111';
const GRID_COLOR       = '#2a2a2a';
const MARKER_COLOR     = '#ffffff';

// ---- Sizing ----
const CELL_PX   = 28;                       // px per target-map cell
const MAP_W     = BIOME_GRID_W * CELL_PX;   // total map canvas width
const MAP_H     = BIOME_GRID_H * CELL_PX;
const TITLE_H   = 28;                       // space above the grid for "MAP"
const HINT_H    = 22;                       // space below for "Press M to close"
const PAD       = 12;                       // inner padding around grid
const CANVAS_W  = MAP_W + PAD * 2;
const CANVAS_H  = MAP_H + TITLE_H + HINT_H + PAD * 2;

// ---- DOM: create overlay canvas (once, on import) ----
const overlay = document.createElement('canvas');
overlay.id     = 'worldmap-overlay';
overlay.width  = CANVAS_W;
overlay.height = CANVAS_H;
Object.assign(overlay.style, {
  position:        'absolute',
  inset:           '0',
  margin:          'auto',
  width:           CANVAS_W + 'px',
  height:          CANVAS_H + 'px',
  zIndex:          '15',           // above sidebar (5) & modal (10), below centered-screen (20)
  display:         'none',
  pointerEvents:   'none',         // clicks pass through — we block input via state flag
  border:          '3px solid #4a4a5a',
  outline:         '2px solid #000',
  boxShadow:       'inset 0 0 0 1px #2a2a3a, 0 0 30px rgba(0,0,0,0.9)',
  borderRadius:    '3px',
});

// Inject into .screen container (same parent as canvas#viewport)
function ensureMounted() {
  if (!overlay.parentNode) {
    const screen = document.querySelector('.screen');
    if (screen) screen.appendChild(overlay);
  }
}

const octx = overlay.getContext('2d');

// ---- Open / close state ----
let mapOpen = false;

export function isMapOpen() {
  return mapOpen;
}

export function toggleMap() {
  mapOpen ? closeMap() : openMap();
}

export function openMap() {
  if (state.gameState !== 'play') return;
  ensureMounted();
  mapOpen = true;
  markCurrentCell();          // ← ensure current cell is revealed (covers spawn)
  drawMap();
  overlay.style.display = 'block';
}

export function closeMap() {
  mapOpen = false;
  overlay.style.display = 'none';
}

// ---- Exploration tracking ----
// Call this every time the player takes an action (move, rest, etc.)
// so the cell they're standing in gets revealed.
export function markCurrentCell() {
  const p = state.player;
  if (!p) return;
  // Only track on the surface layer — underground has no biome grid
  if (p.layer !== LAYER_SURFACE) return;

  const cx = Math.floor(p.x / CELL_TILE_W);
  const cy = Math.floor(p.y / CELL_TILE_H);
  if (cx < 0 || cx >= BIOME_GRID_W || cy < 0 || cy >= BIOME_GRID_H) return;

  state.exploredCells.add(`${cx},${cy}`);
}

// ---- Rendering ----
// Grid-first approach: fill the entire grid rect with the border color,
// then stamp each cell as an identically-sized inset rect.  Every cell
// ends up with exactly (CELL_PX - 1) × (CELL_PX - 1) colored pixels
// and a uniform 1px border on the right and bottom that comes from the
// background showing through.  No per-cell border math, no separate
// top/left pass, no rounding — just a flat uniform grid.

const CELL_FILL = CELL_PX - 1;              // colored area per cell

function drawMap() {
  const w = CANVAS_W, h = CANVAS_H;

  // Background
  octx.fillStyle = 'rgba(0, 0, 10, 0.96)';
  octx.fillRect(0, 0, w, h);

  // Title
  octx.fillStyle = '#e8e8e8';
  octx.font = '10px "Press Start 2P", monospace';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  octx.fillText('MAP', w / 2, PAD + TITLE_H / 2);

  const ox = PAD;                   // grid origin x
  const oy = PAD + TITLE_H;        // grid origin y

  // 1) Fill entire grid area with border color (creates all grid lines)
  octx.fillStyle = GRID_COLOR;
  octx.fillRect(ox, oy, MAP_W, MAP_H);

  // 2) Stamp each cell as an identically-sized inset rect
  for (let gy = 0; gy < BIOME_GRID_H; gy++) {
    for (let gx = 0; gx < BIOME_GRID_W; gx++) {
      const px = ox + gx * CELL_PX;
      const py = oy + gy * CELL_PX;

      if (state.exploredCells.has(`${gx},${gy}`)) {
        const biome = BIOME_TARGET[gy][gx].biome;
        octx.fillStyle = BIOME_COLORS[biome] || '#444444';
      } else {
        octx.fillStyle = UNEXPLORED_COLOR;
      }
      // Every cell gets exactly CELL_FILL × CELL_FILL pixels of color.
      // The 1px gap on the right and bottom is the GRID_COLOR background.
      octx.fillRect(px, py, CELL_FILL, CELL_FILL);
    }
  }

  // 3) Player marker — purely grid-based, no world-coordinate math
  const p = state.player;
  if (p && p.layer === LAYER_SURFACE) {
    const pcx = Math.floor(p.x / CELL_TILE_W);
    const pcy = Math.floor(p.y / CELL_TILE_H);
    if (pcx >= 0 && pcx < BIOME_GRID_W && pcy >= 0 && pcy < BIOME_GRID_H) {
      // Center of the cell in canvas pixels (integer — CELL_PX is even)
      const cx = ox + pcx * CELL_PX + (CELL_FILL >> 1);
      const cy = oy + pcy * CELL_PX + (CELL_FILL >> 1);
      // 7×7 outer ring → 5×5 inner ring → 3×3 bright core
      octx.fillStyle = MARKER_COLOR;
      octx.fillRect(cx - 3, cy - 3, 7, 7);
      octx.fillStyle = '#000';
      octx.fillRect(cx - 2, cy - 2, 5, 5);
      octx.fillStyle = MARKER_COLOR;
      octx.fillRect(cx - 1, cy - 1, 3, 3);
    }
  }

  // 4) Hint text
  octx.fillStyle = '#666666';
  octx.font = '8px "Press Start 2P", monospace';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  octx.fillText('Press M to close', w / 2, oy + MAP_H + HINT_H / 2 + 2);
}
