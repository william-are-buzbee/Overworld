// ==================== SURFACE GENERATION ====================
import { covers } from './state.js';
import {
  W_SURF, H_SURF, LAYER_SURFACE, LAYER_UNDER,
  ATMOSPHERE, BIOME_TARGET, BIOME_PROFILES, BLEND_WIDTH,
} from './constants.js';
import { T, isWalkable, isCoverAllowedOnGround } from './terrain.js';
import { srand, rand, randi } from './rng.js';
import { setFeature } from './world-state.js';
import { ensureCoverGrid, populateMonsters } from './gen-utils.js';

// ==================== NOISE ====================
// Seeded 2D Perlin noise generator
function createNoise2D(seed) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed | 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }

  return function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const g = grad2;
    const aa = g[perm[perm[X    ] + Y    ] & 7];
    const ba = g[perm[perm[X + 1] + Y    ] & 7];
    const ab = g[perm[perm[X    ] + Y + 1] & 7];
    const bb = g[perm[perm[X + 1] + Y + 1] & 7];
    return lerp(
      lerp(aa[0]*xf     + aa[1]*yf,     ba[0]*(xf-1) + ba[1]*yf,     u),
      lerp(ab[0]*xf     + ab[1]*(yf-1), bb[0]*(xf-1) + bb[1]*(yf-1), u),
      v
    );
  };
}

// Fractal Brownian Motion — layered noise
function fbm(noiseFn, x, y, cfg) {
  let sum = 0, amp = 1, freq = cfg.frequency, maxAmp = 0;
  for (let i = 0; i < cfg.octaves; i++) {
    sum += noiseFn(x * freq, y * freq) * amp;
    maxAmp += amp;
    freq *= cfg.lacunarity;
    amp *= cfg.gain;
  }
  return sum / maxAmp;  // ≈ [-1, 1]
}

// ==================== NOISE CONFIGS (surface-gen internal) ====================
const BORDER_NOISE_CFG  = { octaves: 3, frequency: 0.10, lacunarity: 2.0, gain: 0.50 };
const VARIATION_CFG     = { octaves: 3, frequency: 0.08, lacunarity: 2.0, gain: 0.50 };
const LAKE_CFG          = { octaves: 2, frequency: 0.06, lacunarity: 2.0, gain: 0.50 };
const WATER_BODY_CFG    = { octaves: 4, frequency: 0.045, lacunarity: 2.0, gain: 0.50 };

// Minimum distance (in tiles) from any land tile for water to become deep.
// Scales with map size — ~3.6% of the smaller dimension, minimum 2.
const DEEP_WATER_THRESHOLD = Math.max(2, Math.round(Math.min(W_SURF, H_SURF) * 0.036));

// ==================== BIOME TARGET MAP SAMPLING ====================
// Returns { biomeName: weight } for the biomes influencing world-tile (x, y).
// Weights are bilinear interpolation coefficients from the 16×16 target map;
// identical biomes in adjacent cells merge their weights.
function sampleBiomeWeights(x, y, w, h) {
  const targetH = BIOME_TARGET.length;       // 16
  const targetW = BIOME_TARGET[0].length;    // 16

  // Map full-res coords to target-map space (center of each target cell)
  const tx = (x / w) * targetW - 0.5;
  const ty = (y / h) * targetH - 0.5;

  const x0 = Math.max(0, Math.min(targetW - 1, Math.floor(tx)));
  const y0 = Math.max(0, Math.min(targetH - 1, Math.floor(ty)));
  const x1 = Math.min(targetW - 1, x0 + 1);
  const y1 = Math.min(targetH - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, tx - x0));
  const fy = Math.max(0, Math.min(1, ty - y0));

  const weights = {};
  const add = (biome, wt) => { weights[biome] = (weights[biome] || 0) + wt; };

  add(BIOME_TARGET[y0][x0].biome, (1 - fx) * (1 - fy));
  add(BIOME_TARGET[y0][x1].biome, fx * (1 - fy));
  add(BIOME_TARGET[y1][x0].biome, (1 - fx) * fy);
  add(BIOME_TARGET[y1][x1].biome, fx * fy);

  return weights;
}

// Pick the biome with the highest weight from a weights map.
function dominantBiome(weights) {
  let best = null, bestW = -1;
  for (const biome in weights) {
    if (weights[biome] > bestW) { best = biome; bestW = weights[biome]; }
  }
  return best;
}

// Interpolate a numeric value across biome profiles weighted by blend.
// `accessor` is called with a profile and should return a number.
function blendValue(weights, accessor) {
  let sum = 0;
  for (const biome in weights) {
    const profile = BIOME_PROFILES[biome];
    if (profile) sum += accessor(profile) * weights[biome];
  }
  return sum;
}

// Bilinearly interpolate the density scalar from the 16×16 target map.
// Returns a value in [0, 1] representing how "intense" the local biome is.
function sampleDensity(x, y, w, h) {
  const targetH = BIOME_TARGET.length;
  const targetW = BIOME_TARGET[0].length;
  const tx = (x / w) * targetW - 0.5;
  const ty = (y / h) * targetH - 0.5;
  const x0 = Math.max(0, Math.min(targetW - 1, Math.floor(tx)));
  const y0 = Math.max(0, Math.min(targetH - 1, Math.floor(ty)));
  const x1 = Math.min(targetW - 1, x0 + 1);
  const y1 = Math.min(targetH - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, tx - x0));
  const fy = Math.max(0, Math.min(1, ty - y0));
  const d00 = BIOME_TARGET[y0][x0].density;
  const d10 = BIOME_TARGET[y0][x1].density;
  const d01 = BIOME_TARGET[y1][x0].density;
  const d11 = BIOME_TARGET[y1][x1].density;
  return d00 * (1 - fx) * (1 - fy)
       + d10 * fx * (1 - fy)
       + d01 * (1 - fx) * fy
       + d11 * fx * fy;
}

// Interpolate density only from 'water'-biome cells on the target map.
// Returns the water-specific density at (x,y), uncontaminated by adjacent
// non-water biomes' density values.  Returns 0 when no water cells are nearby.
function sampleWaterDensity(x, y, w, h) {
  const targetH = BIOME_TARGET.length;
  const targetW = BIOME_TARGET[0].length;
  const tx = (x / w) * targetW - 0.5;
  const ty = (y / h) * targetH - 0.5;
  const x0 = Math.max(0, Math.min(targetW - 1, Math.floor(tx)));
  const y0 = Math.max(0, Math.min(targetH - 1, Math.floor(ty)));
  const x1 = Math.min(targetW - 1, x0 + 1);
  const y1 = Math.min(targetH - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, tx - x0));
  const fy = Math.max(0, Math.min(1, ty - y0));

  let sum = 0, wt = 0;
  const corners = [
    [y0, x0, (1 - fx) * (1 - fy)],
    [y0, x1,       fx  * (1 - fy)],
    [y1, x0, (1 - fx) *       fy ],
    [y1, x1,       fx  *       fy ],
  ];
  for (const [r, c, bw] of corners) {
    if (BIOME_TARGET[r][c].biome === 'water') {
      sum += BIOME_TARGET[r][c].density * bw;
      wt  += bw;
    }
  }
  return wt > 0 ? sum / wt : 0;
}

// ==================== HELPERS ====================
function findWalkableNear(grid, coverGrid, tx, ty, w, h) {
  const walkable = (x, y) => {
    const g = grid[y][x];
    const c = coverGrid ? coverGrid[y][x] : 0;
    return isWalkable(g, c) && !c;
  };
  const walkableAny = (x, y) => {
    const g = grid[y][x];
    const c = coverGrid ? coverGrid[y][x] : 0;
    return isWalkable(g, c);
  };
  if (tx >= 0 && ty >= 0 && tx < w && ty < h && walkable(tx, ty)) {
    return { x: tx, y: ty };
  }
  for (let r = 1; r < Math.max(w, h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        if (walkable(x, y)) return { x, y };
      }
    }
  }
  for (let r = 1; r < Math.max(w, h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        if (walkableAny(x, y)) return { x, y };
      }
    }
  }
  return { x: tx, y: ty };
}

// ==================== SURFACE ====================
export function makeSurface(seed) {
  srand(seed);

  // ---- Allocate grids ----
  const grid = [];
  for (let y = 0; y < H_SURF; y++) {
    const row = [];
    for (let x = 0; x < W_SURF; x++) row.push(T.GRASS);
    grid.push(row);
  }
  const coverGrid = ensureCoverGrid(LAYER_SURFACE, W_SURF, H_SURF);

  // ---- Noise generators ----
  const borderNoiseX = createNoise2D(seed + 100);
  const borderNoiseY = createNoise2D(seed + 101);
  const variationNoise = createNoise2D(seed + 200);
  const lakeNoise = createNoise2D(seed + 300);
  const waterBodyNoise = createNoise2D(seed + 400);

  // ---- Derived atmosphere arrays (filled per-tile, inert) ----
  const moisture  = new Float32Array(W_SURF * H_SURF);
  const elevation = new Float32Array(W_SURF * H_SURF);
  const fungal    = new Float32Array(W_SURF * H_SURF);

  // ---- Per-tile biome resolution ----
  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {

      // --- 1. Noise-perturbed biome sampling (wavy borders) ---
      const bnx = fbm(borderNoiseX, x, y, BORDER_NOISE_CFG) * BLEND_WIDTH * 0.45;
      const bny = fbm(borderNoiseY, x, y, BORDER_NOISE_CFG) * BLEND_WIDTH * 0.45;
      const perturbedWeights = sampleBiomeWeights(x + bnx, y + bny, W_SURF, H_SURF);

      // The dominant biome after perturbation determines ground type.
      const winner = dominantBiome(perturbedWeights);
      const profile = BIOME_PROFILES[winner];

      // --- 2. Ground type ---
      let groundType = profile.ground;

      grid[y][x] = groundType;

      // --- 2b. Density-driven water placement ---
      // Any tile influenced by the water biome uses noise + density to decide
      // whether it becomes water, mud (shoreline), or stays as-is.
      const waterWeight = perturbedWeights['water'] || 0;
      if (waterWeight > 0.01) {
        const wDensity = sampleWaterDensity(x, y, W_SURF, H_SURF);
        // effectiveWater combines proximity to water biome with authored density.
        // Deep in a density-1.0 ocean cell: ≈1.0.  At a 0.3-density marsh: ≈0.3.
        // At a forest→water blend edge: waterWeight fades it further.
        const effectiveWater = waterWeight * wDensity;

        if (effectiveWater > 0.01) {
          // Noise in [0,1] — large, blobby shapes for natural shorelines
          const wn = (fbm(waterBodyNoise, x, y, WATER_BODY_CFG) + 1) * 0.5;
          // Threshold: high effectiveWater → low threshold → most tiles become water.
          //   ew 1.0 → threshold ≈ 0.03 (near-total water)
          //   ew 0.5 → threshold ≈ 0.51 (roughly half water)
          //   ew 0.1 → threshold ≈ 0.90 (only noise peaks become ponds)
          const threshold = 1.0 - effectiveWater * 0.97;

          if (wn > threshold) {
            grid[y][x] = T.WATER;
            coverGrid[y][x] = 0;
            // Write atmosphere for this water tile and skip covers
            const idx = y * W_SURF + x;
            moisture[idx]  = 0.85;
            elevation[idx] = 0.15;
            fungal[idx]    = 0;
            continue;
          }

          // Mud fringe: tiles just below the water threshold get wet ground,
          // creating a marshy transition around every water body.
          const mudMargin = 0.12;
          if (wn > threshold - mudMargin) {
            grid[y][x] = T.MUD;
          } else if (effectiveWater > 0.3 && winner === 'water') {
            // Interior of water zone but noise valley — still marshy
            grid[y][x] = T.MUD;
          }
        }
      }

      // --- 3. Lake pockets inside non-water biomes ---
      if (profile.lakeChance > 0) {
        const lv = (fbm(lakeNoise, x, y, LAKE_CFG) + 1) * 0.5;
        // Noise must exceed a high threshold to form coherent water patches
        if (lv > (1.0 - profile.lakeChance * 6)) {
          grid[y][x] = T.WATER;
          coverGrid[y][x] = 0;
          // Still write derived atmosphere, then skip cover
          const idx = y * W_SURF + x;
          moisture[idx]  = 0.85;
          elevation[idx] = 0.15;
          fungal[idx]    = 0;
          continue;
        }
      }

      // --- 4. Cover: interpolate chances from smooth (unperturbed) weights ---
      // Smooth weights give gradual density falloff across biome borders.
      const smoothWeights = sampleBiomeWeights(x, y, W_SURF, H_SURF);

      // Interpolated density from the target map (smooth coords, matching cover blend).
      const interpDensity = sampleDensity(x, y, W_SURF, H_SURF);

      // Local variation noise: modulates cover density within a biome.
      // Values near 0 create clearings; values near 1 create dense patches.
      const vn = (fbm(variationNoise, x, y, VARIATION_CFG) + 1) * 0.5;

      // Accumulate interpolated chances per cover type across all blended biomes.
      const coverChances = {};
      for (const biome in smoothWeights) {
        const bp = BIOME_PROFILES[biome];
        if (!bp || !bp.covers) continue;
        const w = smoothWeights[biome];
        for (const c of bp.covers) {
          coverChances[c.type] = (coverChances[c.type] || 0) + c.chance * w;
        }
      }

      // Apply density scaling: the dominant biome's coverScale replaces the
      // blended chance for any cover type it has an opinion about.  This lets
      // the target map's density value directly drive tree probability.
      if (profile.coverScale) {
        for (const typeStr in coverChances) {
          const scaled = profile.coverScale(Number(typeStr), interpDensity);
          if (scaled !== null && scaled !== undefined) {
            coverChances[typeStr] = scaled;
          }
        }
      }

      // Roll for each cover type; first hit wins.
      // Density-scaled covers (coverScale returned non-null) get narrow noise
      // variation (±15% around the density-derived mean) to create organic
      // texture without swamping the authored density gradient.
      // Non-scaled covers keep the wider original modulation.
      for (const typeStr in coverChances) {
        const ct = Number(typeStr);
        const wasScaled = profile.coverScale
          ? profile.coverScale(ct, interpDensity) !== null
          : false;
        const mod = wasScaled
          ? 0.85 + vn * 0.30          // range [0.85, 1.15]
          : 0.3  + vn * 1.4;          // range [0.30, 1.70]  (legacy)
        const chance = coverChances[typeStr] * mod;
        if (rand() < chance) {
          if (!isCoverAllowedOnGround(grid[y][x], ct)) continue;
          coverGrid[y][x] = ct;
          break;
        }
      }

      // --- 5. Derived atmosphere (inert — for future gameplay systems) ---
      const idx = y * W_SURF + x;
      moisture[idx]  = blendValue(smoothWeights, p => p.derived.moisture);
      elevation[idx] = blendValue(smoothWeights, p => p.derived.elevation);
      fungal[idx]    = blendValue(smoothWeights, p => p.derived.fungal);
    }
  }

  // ---- Beach adjacency pass (tiles next to water) ----
  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {
      const g = grid[y][x];
      if (g !== T.GRASS && g !== T.SAND && g !== T.MUD) continue;
      if (coverGrid[y][x]) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W_SURF || ny >= H_SURF) continue;
        if (grid[ny][nx] === T.WATER || grid[ny][nx] === T.DEEP_WATER) {
          // Mud tiles adjacent to water stay as mud (marshy shore);
          // grass/sand become beach.
          if (g !== T.MUD) {
            grid[y][x] = T.BEACH;
          }
          coverGrid[y][x] = 0;
          break;
        }
      }
    }
  }

  // ---- Deep water pass: distance-from-shore via multi-source BFS ----
  // Initialise distance grid: 0 for every non-water tile, Infinity for water.
  const dist = new Int32Array(W_SURF * H_SURF);
  const queue = [];
  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {
      if (grid[y][x] === T.WATER) {
        dist[y * W_SURF + x] = 0x7fffffff; // Infinity stand-in
      } else {
        dist[y * W_SURF + x] = 0;
        queue.push(y * W_SURF + x);
      }
    }
  }
  // BFS propagation from all land tiles simultaneously
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const cx = idx % W_SURF;
    const cy = (idx - cx) / W_SURF;
    const nd = dist[idx] + 1;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W_SURF || ny >= H_SURF) continue;
      const ni = ny * W_SURF + nx;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        queue.push(ni);
      }
    }
  }
  // Convert interior water tiles to deep water — only where authored
  // water density exceeds 0.7, so marshes and ponds stay shallow.
  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {
      if (grid[y][x] === T.WATER && dist[y * W_SURF + x] >= DEEP_WATER_THRESHOLD) {
        const wd = sampleWaterDensity(x, y, W_SURF, H_SURF);
        if (wd > 0.7) {
          grid[y][x] = T.DEEP_WATER;
        }
      }
    }
  }

  // ---- Store derived atmosphere globally ----
  ATMOSPHERE.moisture  = moisture;
  ATMOSPHERE.elevation = elevation;
  ATMOSPHERE.fungal    = fungal;
  ATMOSPHERE.w         = W_SURF;
  ATMOSPHERE.h         = H_SURF;

  // ---- SURFACE STAIRCASES ----
  // SE staircase (mushroom zone)
  {
    const seX = Math.floor(W_SURF * 0.68);
    const seY = Math.floor(H_SURF * 0.78);
    const pos = findWalkableNear(grid, coverGrid, seX, seY, W_SURF, H_SURF);
    coverGrid[pos.y][pos.x] = T.STAIRS_DOWN;
    setFeature(LAYER_SURFACE, pos.x, pos.y, {
      type: 'stairs', dir: 'down',
      targetLayer: LAYER_UNDER,
      targetX: pos.x, targetY: pos.y,
      sourceX: pos.x, sourceY: pos.y,
      label: 'A staircase descends into the mushroom-choked dark.',
    });
  }
  // NW staircase (stone zone)
  {
    const nwX = Math.floor(W_SURF * 0.18);
    const nwY = Math.floor(H_SURF * 0.15);
    const pos = findWalkableNear(grid, coverGrid, nwX, nwY, W_SURF, H_SURF);
    coverGrid[pos.y][pos.x] = T.STAIRS_DOWN;
    setFeature(LAYER_SURFACE, pos.x, pos.y, {
      type: 'stairs', dir: 'down',
      targetLayer: 2,
      targetX: pos.x, targetY: pos.y,
      sourceX: pos.x, sourceY: pos.y,
      label: 'Worn steps lead down into cold stone passages.',
    });
  }

  // ---- Spawn monsters ----
  populateMonsters(grid, LAYER_SURFACE);

  return grid;
}

// ==================== DIRT ROADS ====================
export function placeDirtRoads(grid, settlements) {
  if (!settlements || settlements.length < 2) return;
  const pts = settlements.slice().sort((a, b) => a.x - b.x);
  const connected = new Set();
  for (let i = 0; i < pts.length; i++) {
    let best = [];
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (connected.has(key)) continue;
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      best.push({ j, dist, key });
    }
    best.sort((a, b) => a.dist - b.dist);
    const links = Math.min(best.length, 1 + (rand() < 0.5 ? 1 : 0));
    for (let k = 0; k < links; k++) {
      connected.add(best[k].key);
      dirtPathBetween(grid, pts[i].x, pts[i].y, pts[best[k].j].x, pts[best[k].j].y);
    }
  }
  for (const s of settlements) {
    dirtRing(grid, s.x, s.y, 2);
  }
}

function dirtPathBetween(grid, x1, y1, x2, y2) {
  let x = x1, y = y1;
  const coverGrid = covers[LAYER_SURFACE];
  while (x !== x2 || y !== y2) {
    if (x >= 0 && y >= 0 && x < W_SURF && y < H_SURF) {
      const t = grid[y][x];
      const c = coverGrid ? coverGrid[y][x] : 0;
      if ((t === T.GRASS || t === T.SAND || t === T.BEACH) && !c) {
        if (rand() < 0.72) grid[y][x] = T.DIRT_ROAD;
      }
    }
    if (rand() < 0.25) {
      const perp = rand() < 0.5 ? 1 : -1;
      if (Math.abs(x2 - x) > Math.abs(y2 - y)) {
        y += perp;
      } else {
        x += perp;
      }
    } else {
      if (rand() < 0.5) {
        if (x < x2) x++; else if (x > x2) x--;
      } else {
        if (y < y2) y++; else if (y > y2) y--;
      }
    }
  }
}

function dirtRing(grid, cx, cy, radius) {
  const coverGrid = covers[LAYER_SURFACE];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius + 1) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W_SURF || y >= H_SURF) continue;
      const t = grid[y][x];
      const c = coverGrid ? coverGrid[y][x] : 0;
      if ((t === T.GRASS || t === T.SAND || t === T.BEACH) && !c && rand() < 0.6) {
        grid[y][x] = T.DIRT_ROAD;
      }
    }
  }
}
