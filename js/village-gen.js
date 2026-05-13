// ==================== VILLAGE LANDMARK GENERATOR ====================
// Produces a small settlement occupying a 2×2 target-map-cell region.
// Called by the landmark placement pass in surface-gen.js after biome
// ground/cover are laid down but before monster spawning.
//
// Contents: 3–5 huts with NPC placeholders, a central dirt ring with
// connecting paths, a campfire at the ring centre, a well along the
// outward road, and a single road leading to the village edge.

import { LAYER_SURFACE, W_SURF, H_SURF } from './constants.js';
import { T } from './terrain.js';
import { rand, randi } from './rng.js';
import { setFeature } from './world-state.js';

// ---- NPC roles assigned round-robin to huts ----
const NPC_ROLES = ['elder', 'hunter', 'herbalist', 'smith', 'villager'];

// ==================== HUT BUILDER ====================
// Stamps a 6×6 hut (4×4 interior) centred on (hx, hy).
// Walls are HUT_WALL cover on WOOD_FLOOR ground.  One wall tile is
// removed for the doorway on the side facing `doorDir`.
//   doorDir: 'north' | 'south' | 'east' | 'west'
//   role:    NPC role string placed on one interior tile

function placeHut(grid, coverGrid, hx, hy, doorDir, role) {
  // Hut occupies [hx-1 … hx+2] × [hy-1 … hy+2]  (4×4)
  // Interior is  [hx, hx+1]    × [hy, hy+1]       (2×2)
  const x0 = hx - 1, x1 = hx + 2;
  const y0 = hy - 1, y1 = hy + 2;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= W_SURF || y >= H_SURF) continue;
      const onWall = (x === x0 || x === x1 || y === y0 || y === y1);
      if (onWall) {
        grid[y][x] = T.WOOD_FLOOR;
        coverGrid[y][x] = T.HUT_WALL;
      } else {
        // Interior
        grid[y][x] = T.WOOD_FLOOR;
        coverGrid[y][x] = 0;
      }
    }
  }

  // Punch doorway (1-tile gap in the wall)
  let dx, dy;
  switch (doorDir) {
    case 'north': dx = hx;     dy = y0;     break;
    case 'south': dx = hx;     dy = y1;     break;
    case 'east':  dx = x1;     dy = hy;     break;
    case 'west':  dx = x0;     dy = hy;     break;
    default:      dx = hx;     dy = y1;     break;
  }
  if (dx >= 0 && dy >= 0 && dx < W_SURF && dy < H_SURF) {
    coverGrid[dy][dx] = 0;
    grid[dy][dx] = T.DIRT;
  }

  // Place NPC on an interior tile
  const npcX = hx, npcY = hy;
  if (npcX >= 0 && npcY >= 0 && npcX < W_SURF && npcY < H_SURF) {
    coverGrid[npcY][npcX] = T.NPC;
    setFeature(LAYER_SURFACE, npcX, npcY, { type: 'npc', role });
  }
}

// Returns the world coordinate of a hut's doorway tile.
function getDoorPos(hx, hy, doorDir) {
  switch (doorDir) {
    case 'north': return { x: hx,     y: hy - 1 };
    case 'south': return { x: hx,     y: hy + 2 };
    case 'east':  return { x: hx + 2, y: hy };
    case 'west':  return { x: hx - 1, y: hy };
    default:      return { x: hx,     y: hy + 2 };
  }
}

// ==================== PATH DRAWING ====================
// Lays dirt_road ground from (ax, ay) toward (bx, by), stopping when
// it reaches within `stopRadius` of the target.  Slightly wobbly to
// look organic.

function drawDirtPath(grid, coverGrid, ax, ay, bx, by, stopRadius) {
  let x = ax, y = ay;
  const maxSteps = Math.abs(bx - ax) + Math.abs(by - ay) + 20;
  for (let step = 0; step < maxSteps; step++) {
    if (x >= 0 && y >= 0 && x < W_SURF && y < H_SURF) {
      // Don't overwrite hut walls
      if (coverGrid[y][x] !== T.HUT_WALL) {
        grid[y][x] = T.DIRT;
        if (coverGrid[y][x] && coverGrid[y][x] !== T.CAMPFIRE &&
            coverGrid[y][x] !== T.WELL && coverGrid[y][x] !== T.NPC) {
          coverGrid[y][x] = 0;
        }
      }
    }
    const dx = bx - x, dy = by - y;
    if (Math.sqrt(dx * dx + dy * dy) <= stopRadius) break;

    // Slight wobble
    if (rand() < 0.2) {
      if (Math.abs(dx) > Math.abs(dy)) y += rand() < 0.5 ? 1 : -1;
      else                              x += rand() < 0.5 ? 1 : -1;
    } else {
      if (rand() < 0.5) {
        if (dx > 0) x++; else if (dx < 0) x--;
      } else {
        if (dy > 0) y++; else if (dy < 0) y--;
      }
    }
  }
}

// Straight dirt road (for the "road in" from ring to village edge).
function drawDirtPathStraight(grid, coverGrid, ax, ay, bx, by) {
  let x = ax, y = ay;
  const maxSteps = Math.abs(bx - ax) + Math.abs(by - ay) + 10;
  for (let step = 0; step < maxSteps; step++) {
    if (x >= 0 && y >= 0 && x < W_SURF && y < H_SURF) {
      if (coverGrid[y][x] !== T.HUT_WALL) {
        grid[y][x] = T.DIRT;
        if (coverGrid[y][x] && coverGrid[y][x] !== T.CAMPFIRE &&
            coverGrid[y][x] !== T.WELL && coverGrid[y][x] !== T.NPC) {
          coverGrid[y][x] = 0;
        }
      }
    }
    if (x === bx && y === by) break;
    if (rand() < 0.5) {
      if (x < bx) x++; else if (x > bx) x--;
    } else {
      if (y < by) y++; else if (y > by) y--;
    }
  }
}

// ==================== MAIN GENERATOR ====================

export function generateVillage(grid, coverGrid, worldX, worldY, width, height) {
  const cx = worldX + Math.floor(width / 2);
  const cy = worldY + Math.floor(height / 2);

  // ---- 1. Clear cover in footprint (already done by landmark pass,
  //         but we also set ground to grass as a neutral base) ----
  for (let y = worldY; y < worldY + height; y++) {
    for (let x = worldX; x < worldX + width; x++) {
      if (x < 0 || y < 0 || x >= W_SURF || y >= H_SURF) continue;
      coverGrid[y][x] = 0;
      // Convert non-walkable ground to grass so huts can be placed
      const g = grid[y][x];
      if (g === T.WATER || g === T.DEEP_WATER || g === T.LAVA) {
        grid[y][x] = T.GRASS;
      }
    }
  }

  // ---- 2. Central dirt ring ----
  const ringRadius = Math.max(5, Math.min(Math.floor(width / 4), Math.floor(height / 4)));
  for (let y = worldY; y < worldY + height; y++) {
    for (let x = worldX; x < worldX + width; x++) {
      if (x < 0 || y < 0 || x >= W_SURF || y >= H_SURF) continue;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= ringRadius - 1.5 && dist <= ringRadius + 1.5) {
        grid[y][x] = T.DIRT;
      }
    }
  }
  // Fill the inside of the ring with dirt too (village square)
  for (let y = cy - ringRadius + 2; y <= cy + ringRadius - 2; y++) {
    for (let x = cx - ringRadius + 2; x <= cx + ringRadius - 2; x++) {
      if (x < 0 || y < 0 || x >= W_SURF || y >= H_SURF) continue;
      const dx = x - cx, dy = y - cy;
      if (Math.sqrt(dx * dx + dy * dy) < ringRadius - 1) {
        grid[y][x] = T.DIRT;
      }
    }
  }

  // ---- 3. Campfire at centre ----
  if (cx >= 0 && cy >= 0 && cx < W_SURF && cy < H_SURF) {
    grid[cy][cx] = T.DIRT;
    coverGrid[cy][cx] = T.CAMPFIRE;
    setFeature(LAYER_SURFACE, cx, cy, { type: 'campfire' });
  }

  // ---- 4. Place huts around the ring ----
  const hutCount = 3 + randi(3); // 3–5
  const huts = [];
  const angleStep = (Math.PI * 2) / hutCount;
  const startAngle = rand() * Math.PI * 2;

  for (let i = 0; i < hutCount; i++) {
    const angle = startAngle + angleStep * i + (rand() - 0.5) * 0.4;
    const hutDist = ringRadius + 3 + randi(2);
    const hx = cx + Math.round(Math.cos(angle) * hutDist);
    const hy = cy + Math.round(Math.sin(angle) * hutDist);

    // Bounds: hut needs 2 tiles margin on each side within the footprint
    if (hx - 2 < worldX || hy - 2 < worldY ||
        hx + 3 >= worldX + width || hy + 3 >= worldY + height) continue;
    // World bounds
    if (hx - 1 < 0 || hy - 1 < 0 || hx + 2 >= W_SURF || hy + 2 >= H_SURF) continue;

    // Overlap check against already-placed huts (need ≥2 tile gap)
    let overlaps = false;
    for (const h of huts) {
      if (Math.abs(h.x - hx) < 6 && Math.abs(h.y - hy) < 6) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    // Determine door direction (face toward village centre)
    const ddx = cx - hx, ddy = cy - hy;
    let doorDir;
    if (Math.abs(ddx) > Math.abs(ddy)) {
      doorDir = ddx > 0 ? 'east' : 'west';
    } else {
      doorDir = ddy > 0 ? 'south' : 'north';
    }

    const role = NPC_ROLES[i % NPC_ROLES.length];
    placeHut(grid, coverGrid, hx, hy, doorDir, role);
    huts.push({ x: hx, y: hy, doorDir });

    // Draw dirt path from doorway to ring edge
    const door = getDoorPos(hx, hy, doorDir);
    drawDirtPath(grid, coverGrid, door.x, door.y, cx, cy, ringRadius - 1);
  }

  // ---- 5. Road leading out of the village ----
  // Pick a direction that doesn't collide with a hut doorway
  let roadAngle = rand() * Math.PI * 2;
  for (let attempt = 0; attempt < 8; attempt++) {
    let tooClose = false;
    for (const h of huts) {
      const ha = Math.atan2(h.y - cy, h.x - cx);
      let diff = Math.abs(roadAngle - ha);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.5) { tooClose = true; break; }
    }
    if (!tooClose) break;
    roadAngle += 0.7;
  }

  const ringEdgeX = cx + Math.round(Math.cos(roadAngle) * ringRadius);
  const ringEdgeY = cy + Math.round(Math.sin(roadAngle) * ringRadius);
  const edgeDist = Math.floor(Math.min(width, height) / 2) - 1;
  const edgeX = Math.max(worldX, Math.min(worldX + width - 1,
    cx + Math.round(Math.cos(roadAngle) * edgeDist)));
  const edgeY = Math.max(worldY, Math.min(worldY + height - 1,
    cy + Math.round(Math.sin(roadAngle) * edgeDist)));
  drawDirtPathStraight(grid, coverGrid, ringEdgeX, ringEdgeY, edgeX, edgeY);

  // ---- 6. Well along the outward road ----
  const wellDist = ringRadius + Math.floor((edgeDist - ringRadius) * 0.45);
  const wellX = Math.max(worldX + 1, Math.min(worldX + width - 2,
    cx + Math.round(Math.cos(roadAngle) * wellDist)));
  const wellY = Math.max(worldY + 1, Math.min(worldY + height - 2,
    cy + Math.round(Math.sin(roadAngle) * wellDist)));
  if (wellX >= 0 && wellY >= 0 && wellX < W_SURF && wellY < H_SURF &&
      coverGrid[wellY][wellX] !== T.HUT_WALL) {
    grid[wellY][wellX] = T.DIRT;
    coverGrid[wellY][wellX] = T.WELL;
    setFeature(LAYER_SURFACE, wellX, wellY, { type: 'well' });
  }
}

// ==================== LANDMARK GENERATOR REGISTRY ====================
// Maps landmark type strings to generator functions.
// Each generator receives (grid, coverGrid, worldX, worldY, width, height).
export const LANDMARK_GENERATORS = {
  village: generateVillage,
};
