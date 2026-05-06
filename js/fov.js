// ==================== FIELD OF VISION ====================
// Recursive shadowcasting — standard roguelike FOV algorithm.
// Computes which tiles are visible from a given origin within a radius.
// A tile with vision-blocking cover is itself visible, but tiles behind it are not.
//
// The player uses a CONE + AWARENESS BUBBLE model:
//   1. Awareness bubble: full-circle FOV within 1 tile (the 8 adjacent squares).
//      Always visible regardless of facing. Not affected by PER, night, or layer.
//   2. Forward cone: beyond the awareness radius, only tiles within the
//      player's facing-direction cone (coneAngle/2 each side) are visible.
//   3. Final visible set = union of awareness bubble ∩ LOS  +  cone ∩ LOS.
//
// Enemies have vision profiles too (cone or radius) but enemy AI doesn't
// read them yet — that's a future prompt.

import { worlds, covers, state } from './state.js';
import { inBounds, getCover } from './world-state.js';
import { tileBlocksVision } from './terrain.js';

// Import player stat functions here to avoid circular dependency issues.
// player.js has no dependency on fov.js, so this is safe.
import { playerViewRadius, awarenessRadius } from './player.js';

// Octant multipliers for the 8 cardinal+diagonal directions.
// Each row = [xx, xy, yx, yy] mapping (row, col) in octant space → (dx, dy) in world space.
const OCTANTS = [
  [ 1,  0,  0,  1],
  [ 0,  1,  1,  0],
  [ 0, -1,  1,  0],
  [-1,  0,  0,  1],
  [-1,  0,  0, -1],
  [ 0, -1, -1,  0],
  [ 0,  1, -1,  0],
  [ 1,  0,  0, -1],
];

/**
 * Compute the set of tiles visible from (ox, oy) on the given layer.
 * Full circular FOV — no directional filtering.
 * Used by enemies and as the base computation for cone FOV.
 * @param {number} layer   — layer index
 * @param {number} ox      — origin x
 * @param {number} oy      — origin y
 * @param {number} radius  — vision radius in tiles
 * @returns {Set<string>}  — set of "x,y" keys for all visible tiles
 */
export function computeFOV(layer, ox, oy, radius) {
  const visible = new Set();
  // Origin is always visible
  visible.add(`${ox},${oy}`);

  for (const oct of OCTANTS) {
    castOctant(layer, ox, oy, radius, 1, 1.0, 0.0, oct, visible);
  }
  return visible;
}

/**
 * Recursive shadowcasting for one octant.
 * @param {number} layer
 * @param {number} ox, oy   — world origin
 * @param {number} radius
 * @param {number} row       — current distance from origin (starts at 1)
 * @param {number} startSlope — top slope of the unblocked arc (1.0 initially)
 * @param {number} endSlope   — bottom slope of the unblocked arc (0.0 initially)
 * @param {number[]} oct      — octant multipliers [xx, xy, yx, yy]
 * @param {Set<string>} visible — accumulator
 */
function castOctant(layer, ox, oy, radius, row, startSlope, endSlope, oct, visible) {
  if (startSlope < endSlope) return;

  const [xx, xy, yx, yy] = oct;
  let newStart = startSlope;

  for (let r = row; r <= radius; r++) {
    let blocked = false;

    for (let col = Math.round(r * startSlope); col >= 0; col--) {
      // If the column exceeds startSlope at this row, skip forward
      const leftSlope  = (col + 0.5) / (r - 0.5);
      const rightSlope = (col - 0.5) / (r + 0.5);

      if (leftSlope < endSlope) break;
      if (rightSlope > startSlope) continue;

      // Map octant-space (r, col) → world (wx, wy)
      const wx = ox + col * xx + r * xy;
      const wy = oy + col * yx + r * yy;

      // Distance check (circular FOV)
      const dx = wx - ox, dy = wy - oy;
      if (dx * dx + dy * dy > (radius + 0.5) * (radius + 0.5)) continue;

      if (!inBounds(layer, wx, wy)) continue;

      // This tile is visible
      visible.add(`${wx},${wy}`);

      // Check if this tile blocks vision
      const ground = worlds[layer][wy][wx];
      const cover  = getCover(layer, wx, wy);
      const isBlocking = tileBlocksVision(ground, cover);

      if (blocked) {
        // Previous tile was blocking
        if (isBlocking) {
          // Still in a wall — shrink the start slope
          newStart = rightSlope;
        } else {
          // Emerged from a wall — start a new scan
          blocked = false;
          startSlope = newStart;
        }
      } else {
        if (isBlocking && r < radius) {
          // Hit a wall — recurse with the remaining open arc above this wall,
          // then mark this wall as the new shadow boundary.
          blocked = true;
          castOctant(layer, ox, oy, radius, r + 1, startSlope, (col + 0.5) / (r - 0.5), oct, visible);
          newStart = rightSlope;
        }
      }
    }

    // If the last tile in the row was blocking, the entire remaining arc is shadowed
    if (blocked) break;
  }
}

// ==================== CONE + AWARENESS FOV ====================

// Pre-computed cosine threshold for the cone half-angle.
// Cached so we don't recompute trig every frame.
let _cachedConeAngle = -1;
let _cachedCosHalf = 0;

/**
 * Compute cone+awareness FOV for a creature with directional vision.
 *
 * 1. Run full circular shadowcast at max(coneDepth, awareR).
 * 2. Filter the result: keep tiles that are either
 *    (a) within the awareness radius (omnidirectional), or
 *    (b) within the forward cone angle of the facing direction AND within coneDepth.
 *
 * @param {number} layer
 * @param {number} ox, oy  — creature position
 * @param {number} coneDepth — max forward vision range (PER-based, time-modified)
 * @param {number} awareR — awareness radius (always 1 — adjacent tiles only)
 * @param {number} fdx, fdy — facing direction (need not be normalized)
 * @param {number} coneAngle — cone width in degrees
 * @returns {Set<string>}
 */
export function computeConeFOV(layer, ox, oy, coneDepth, awareR, fdx, fdy, coneAngle) {
  // Full circular shadowcast at the maximum range (covers both bubble and cone)
  const maxR = Math.max(coneDepth, awareR);
  const fullFOV = computeFOV(layer, ox, oy, maxR);

  // If the cone is effectively 360° or more, return the full circular result
  if (coneAngle >= 360) return fullFOV;

  // Precompute cosine of the half-angle for the cone check
  if (coneAngle !== _cachedConeAngle) {
    _cachedConeAngle = coneAngle;
    _cachedCosHalf = Math.cos((coneAngle / 2) * Math.PI / 180);
  }
  const cosHalf = _cachedCosHalf;

  // Normalize facing direction (handles diagonals like {1,1})
  const fLen = Math.sqrt(fdx * fdx + fdy * fdy);
  const nfx = fLen > 0 ? fdx / fLen : 0;
  const nfy = fLen > 0 ? fdy / fLen : 1;  // default: face south

  // Squared radii with half-tile buffer (matching shadowcast distance check)
  const awareR2 = (awareR + 0.5) * (awareR + 0.5);
  const coneDepth2 = (coneDepth + 0.5) * (coneDepth + 0.5);

  const result = new Set();

  for (const key of fullFOV) {
    // Parse tile coordinates from the "x,y" key
    const comma = key.indexOf(',');
    const wx = +key.substring(0, comma);
    const wy = +key.substring(comma + 1);

    const dx = wx - ox;
    const dy = wy - oy;
    const dist2 = dx * dx + dy * dy;

    // Origin tile — always visible
    if (dist2 === 0) {
      result.add(key);
      continue;
    }

    // (a) Within awareness radius — always visible (omnidirectional)
    if (dist2 <= awareR2) {
      result.add(key);
      continue;
    }

    // (b) Beyond awareness radius — must be within cone depth AND cone angle
    if (dist2 > coneDepth2) continue;

    // Dot product between normalized facing direction and tile direction
    const tLen = Math.sqrt(dist2);
    const dot = (nfx * dx + nfy * dy) / tLen;

    if (dot >= cosHalf) {
      result.add(key);
    }
  }

  return result;
}

// ==================== LINE-OF-SIGHT RAYCAST ====================
// Cheap single-target LOS check for enemy AI.  Uses Bresenham's line
// algorithm to walk tiles from (x0,y0) to (x1,y1).  Returns true if no
// vision-blocking tile interrupts the path.  The origin tile is never
// checked (a creature can always "see out" of its own tile); the
// destination tile is always reachable if nothing blocks the way to it.

export function hasLOS(layer, x0, y0, x1, y1) {
  // Same tile — trivially visible
  if (x0 === x1 && y0 === y1) return true;

  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1,  sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;

  while (true) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 <  dx) { err += dx; cy += sy; }

    // Reached target — line is clear
    if (cx === x1 && cy === y1) return true;

    // Intermediate tile — does it block vision?
    if (!inBounds(layer, cx, cy)) return false;
    const ground = worlds[layer][cy][cx];
    const cover  = getCover(layer, cx, cy);
    if (tileBlocksVision(ground, cover)) return false;
  }
}

// ==================== FOV STATE MANAGEMENT ====================

// Player cone angle — matches the humanoid default from VISION_PROFILES.
const PLAYER_CONE_ANGLE = 120;

/**
 * Recompute the player's FOV and update state.fovSet + state.explored.
 * Uses cone + awareness bubble for the player.
 * Call this once per player action (after position is finalized, before render).
 * Also call when entering a new layer or starting a new game.
 */
export function updatePlayerFOV() {
  const p = state.player;
  if (!p) return;

  const layer = p.layer;
  const coneDepth = playerViewRadius(p);
  const awareR = awarenessRadius(p);
  const { dx: fdx, dy: fdy } = state.facing;

  const vis = computeConeFOV(
    layer, p.x, p.y,
    coneDepth, awareR,
    fdx, fdy,
    PLAYER_CONE_ANGLE
  );

  // Store current visible set
  state.fovSet = vis;

  // Merge into explored set for this layer
  if (!state.explored[layer]) {
    state.explored[layer] = new Set();
  }
  const exp = state.explored[layer];
  for (const key of vis) {
    exp.add(key);
  }
}
