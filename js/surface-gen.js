// ==================== SURFACE GENERATION ====================
import { covers } from './state.js';
import {
  W_SURF, H_SURF, LAYER_SURFACE, LAYER_UNDER,
  ATMOSPHERE, BIOME_TARGET, BIOME_PROFILES, BLEND_WIDTH,
  BIOME_GRID_W, BIOME_GRID_H, LANDMARKS,
} from './constants.js';
import { T, isWalkable, isCoverAllowedOnGround } from './terrain.js';
import { srand, rand, randi } from './rng.js';
import { setFeature } from './world-state.js';
import { ensureCoverGrid, populateMonsters } from './gen-utils.js';
import { LANDMARK_GENERATORS } from './village-gen.js';

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
const GROUND_PALETTE_CFG = { octaves: 3, frequency: 0.12, lacunarity: 2.0, gain: 0.50 };

// Collect every ground-type ID that appears in any biome groundPalette.
// Each gets its own noise channel so types compete spatially.
const ALL_PALETTE_GROUND_TYPES = (() => {
  const s = new Set();
  for (const key in BIOME_PROFILES) {
    const gp = BIOME_PROFILES[key].groundPalette;
    if (gp) for (const t in gp) s.add(Number(t));
  }
  return [...s].sort((a, b) => a - b);
})();

// Minimum distance (in tiles) from any land tile for water to become deep.
// Scales with map size — ~3.6% of the smaller dimension, minimum 2.
const DEEP_WATER_THRESHOLD = Math.max(2, Math.round(Math.min(W_SURF, H_SURF) * 0.036));

// ==================== BIOME TARGET MAP SAMPLING ====================
// Returns { biomeName: weight } for the biomes influencing world-tile (x, y).
// Weights are bilinear interpolation coefficients from the target map;
// identical biomes in adjacent cells merge their weights.
function sampleBiomeWeights(x, y, w, h) {
  const targetW = BIOME_GRID_W;
  const targetH = BIOME_GRID_H;

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

// Bilinearly interpolate the density scalar from the target map.
// Returns a value in [0, 1] representing how "intense" the local biome is.
function sampleDensity(x, y, w, h) {
  const targetW = BIOME_GRID_W;
  const targetH = BIOME_GRID_H;
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

  // One noise channel per ground type that appears in any palette.
  // Each channel uses a unique seed so the patterns are uncorrelated.
  const groundNoiseChannels = {};
  let channelSeed = seed + 500;
  for (const tId of ALL_PALETTE_GROUND_TYPES) {
    groundNoiseChannels[tId] = createNoise2D(channelSeed++);
  }

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

      // The dominant biome after perturbation (for cover scaling, lake pockets).
      const winner = dominantBiome(perturbedWeights);
      const profile = BIOME_PROFILES[winner];

      // --- 2. Ground type via multi-channel palette blending ---
      // Interpolate ground palettes from all contributing biomes weighted
      // by the perturbed biome weights.  Each ground type accumulates a
      // blended probability across all biomes.
      const blendedPalette = {};
      for (const biome in perturbedWeights) {
        const bp = BIOME_PROFILES[biome];
        if (!bp || !bp.groundPalette) continue;
        const w = perturbedWeights[biome];
        for (const tType in bp.groundPalette) {
          blendedPalette[tType] = (blendedPalette[tType] || 0) + bp.groundPalette[tType] * w;
        }
      }

      // Each ground type has its own noise channel.  Score = weight + amplitude * noise.
      // Additive competition means the noise perturbs around the weight rather than
      // scaling it — a 0.3-weight type can beat a 0.4-weight type whenever its noise
      // is moderately higher, producing organic blob boundaries.
      // noiseAmp and scatter are blended per-tile from biome profiles using the same
      // perturbed weights that drive palette blending.
      const blendedNoiseAmp = blendValue(perturbedWeights, p => p.noiseAmp);
      const blendedScatter  = blendValue(perturbedWeights, p => p.scatter);

      let groundType = profile.ground; // fallback
      let bestScore = -Infinity;
      for (const tTypeStr in blendedPalette) {
        const tId = Number(tTypeStr);
        const weight = blendedPalette[tTypeStr];
        if (weight <= 0) continue;
        const noiseFn = groundNoiseChannels[tId];
        if (!noiseFn) continue;
        const n = fbm(noiseFn, x, y, GROUND_PALETTE_CFG); // ≈ [-1, 1]
        const score = weight + blendedNoiseAmp * n;
        if (score > bestScore) {
          bestScore = score;
          groundType = tId;
        }
      }

      // --- 2b. Scatter pass: seed individual minority-type tiles ---
      // The blob competition above can only produce blob-sized features.
      // Minority palette types (e.g. water at 0.3 in wetlands) may never win
      // a full blob.  The scatter pass gives a fraction of tiles a fresh roll
      // against the raw palette weights, producing individual tiles of
      // minority types dotted into the dominant blob regions.
      if (rand() < blendedScatter) {
        let r = rand();
        for (const tTypeStr in blendedPalette) {
          r -= blendedPalette[tTypeStr];
          if (r <= 0) {
            groundType = Number(tTypeStr);
            break;
          }
        }
      }

      grid[y][x] = groundType;

      // --- 3. Lake pockets inside land biomes ---
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

      // Skip cover placement on non-walkable ground (water, deep water, etc.)
      if (!isWalkable(grid[y][x], 0)) {
        const idx = y * W_SURF + x;
        moisture[idx]  = blendValue(perturbedWeights, p => p.derived.moisture);
        elevation[idx] = blendValue(perturbedWeights, p => p.derived.elevation);
        fungal[idx]    = blendValue(perturbedWeights, p => p.derived.fungal);
        continue;
      }

      // --- 4. Cover: interpolate chances from smooth (unperturbed) weights ---
      // Smooth weights give gradual density falloff across biome borders.
      const smoothWeights = sampleBiomeWeights(x, y, W_SURF, H_SURF);

      // Use the smooth dominant biome for cover scaling — NOT the perturbed
      // winner.  The perturbed winner drives ground type (wavy borders), but
      // cover scaling must match the smooth weights that drive cover chances.
      // Otherwise border noise can flip the coverScale profile deep into the
      // wrong biome, producing tree/mushroom swaps at boundaries.
      const smoothWinner = dominantBiome(smoothWeights);
      const coverProfile = BIOME_PROFILES[smoothWinner];

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

      // Apply density scaling: the smooth dominant biome's coverScale replaces
      // the blended chance for any cover type it has an opinion about.  This
      // lets the target map's density value directly drive tree probability.
      if (coverProfile.coverScale) {
        for (const typeStr in coverChances) {
          const scaled = coverProfile.coverScale(Number(typeStr), interpDensity);
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
        const wasScaled = coverProfile.coverScale
          ? coverProfile.coverScale(ct, interpDensity) !== null
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

  // ---- Beach adjacency pass (land tiles next to water → beach) ----
  // Only certain ground types convert to beach.  Mud, fungal grass, and rock
  // naturally border water in their biomes and should stay as-is.
  //
  // Beach probability scales with the amount of water within a small radius.
  // Isolated puddles (1–2 water tiles nearby) almost never produce beach;
  // real shorelines (5+ water tiles) reliably do; large bodies (10+) always do.
  const BEACH_ELIGIBLE = new Set([T.GRASS, T.SAND, T.DIRT]);
  const BEACH_SCAN_RADIUS = 4;
  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {
      const gt = grid[y][x];
      if (!BEACH_ELIGIBLE.has(gt)) continue;
      if (coverGrid[y][x]) continue;

      // Must still be directly adjacent to at least one water tile
      let adjacent = false;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W_SURF || ny >= H_SURF) continue;
        if (grid[ny][nx] === T.WATER || grid[ny][nx] === T.DEEP_WATER) {
          adjacent = true;
          break;
        }
      }
      if (!adjacent) continue;

      // Count water tiles within the scan radius
      let waterCount = 0;
      for (let dy = -BEACH_SCAN_RADIUS; dy <= BEACH_SCAN_RADIUS; dy++) {
        for (let dx = -BEACH_SCAN_RADIUS; dx <= BEACH_SCAN_RADIUS; dx++) {
          if (dx * dx + dy * dy > BEACH_SCAN_RADIUS * BEACH_SCAN_RADIUS) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W_SURF || ny >= H_SURF) continue;
          const t = grid[ny][nx];
          if (t === T.WATER || t === T.DEEP_WATER) waterCount++;
        }
      }

      // Scale beach probability with nearby water density:
      //   0–2  water tiles → 0%  (isolated puddle, no beach)
      //   3–4  water tiles → ~15–30%  (small pond, rare beach)
      //   5–9  water tiles → ~50–90%  (lake edge, likely beach)
      //   10+  water tiles → 100% (real shoreline, guaranteed beach)
      let beachProb;
      if (waterCount <= 2)       beachProb = 0;
      else if (waterCount >= 10) beachProb = 1;
      else                       beachProb = (waterCount - 2) / 8; // linear 0→1 over 3–10

      if (rand() < beachProb) {
        grid[y][x] = T.BEACH;
        coverGrid[y][x] = 0;
      }
    }
  }

  // ---- Deep water pass: distance-from-shore via multi-source BFS ----
  // Initialise distance grid: 0 for every land tile, Infinity for water/deep water.
  const dist = new Int32Array(W_SURF * H_SURF);
  const queue = [];
  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {
      if (grid[y][x] === T.WATER || grid[y][x] === T.DEEP_WATER) {
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
  // Convert interior water tiles to deep water (only at high density)
  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {
      if (grid[y][x] === T.WATER && dist[y * W_SURF + x] >= DEEP_WATER_THRESHOLD) {
        const localDensity = sampleDensity(x, y, W_SURF, H_SURF);
        if (localDensity >= 0.7) {
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

  // ---- LANDMARK PLACEMENT ----
  // Iterate the landmarks list, compute the world-tile bounding box from
  // each landmark's target-map cells, clear existing cover in that
  // footprint, and call the structure's generator to stamp its tiles.
  {
    const cellW = Math.floor(W_SURF / BIOME_GRID_W);
    const cellH = Math.floor(H_SURF / BIOME_GRID_H);
    for (const landmark of LANDMARKS) {
      const gen = LANDMARK_GENERATORS[landmark.type];
      if (!gen) continue;

      let minCX = Infinity, minCY = Infinity, maxCX = -Infinity, maxCY = -Infinity;
      for (const cell of landmark.cells) {
        if (cell.x < minCX) minCX = cell.x;
        if (cell.y < minCY) minCY = cell.y;
        if (cell.x > maxCX) maxCX = cell.x;
        if (cell.y > maxCY) maxCY = cell.y;
      }

      const worldX  = minCX * cellW;
      const worldY  = minCY * cellH;
      const width   = (maxCX - minCX + 1) * cellW;
      const height  = (maxCY - minCY + 1) * cellH;

      // Clear cover in the footprint before the generator runs
      for (let ly = worldY; ly < worldY + height && ly < H_SURF; ly++) {
        for (let lx = worldX; lx < worldX + width && lx < W_SURF; lx++) {
          if (lx >= 0 && ly >= 0) coverGrid[ly][lx] = 0;
        }
      }

      gen(grid, coverGrid, worldX, worldY, width, height);
    }
  }

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
        if (rand() < 0.72) grid[y][x] = T.DIRT;
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
        grid[y][x] = T.DIRT;
      }
    }
  }
}
