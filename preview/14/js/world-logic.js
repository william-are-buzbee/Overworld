// ==================== WORLD LOGIC — placement, spawning, init ====================
import { state, worlds, covers, features, monsters, groundItems, activateLayer } from './state.js';
import { resetScent } from './scent.js';
import { LAYER_SURFACE, LAYER_UNDER, W_SURF, H_SURF, W_UNDER, H_UNDER, LAYER_META, BIOME_TARGET, CELL_TILE_W, CELL_TILE_H, ACTIVE_RADIUS, DORMANT_RADIUS,
         SPAWN_DENSITY_SMALL_HERB, SPAWN_DENSITY_LARGE_HERB, SPAWN_DENSITY_MESO_PRED,
         SPAWN_DENSITY_AMBUSH_PRED, SPAWN_DENSITY_APEX_PRED,
         SPAWN_CLUSTER_SIZE, SPAWN_CLUSTER_RADIUS,
         SPAWN_VIABILITY_RADIUS, SPAWN_VIABILITY_MIN } from './constants.js';
import { T, isWalkable } from './terrain.js';
import { rand, randi, choice } from './rng.js';
import { spawnMonster, MON, SPAWN_BLACKLIST, HABITAT, SPAWN_HABITAT } from './monsters.js';
import { worldDims, inBounds, chebyshev } from './world-state.js';
import { generateLayer } from './world-gen.js';

// ==================== DORMANCY INITIALIZATION (Prompt S) ====================
// Creatures spawned far from the player start dormant to avoid wasted work.
// Creatures on a different layer than the player are always dormant.
function initDormancy(creature, spawnLayer) {
  const p = state.player;
  const layer = spawnLayer != null ? spawnLayer : (creature.layer != null ? creature.layer : p.layer);
  // Different layer → always dormant (distance is effectively infinite)
  if (layer !== p.layer) {
    creature._dormant = true;
    creature._dormantTurns = 0;
    return;
  }
  const dx = creature.x - p.x;
  const dy = creature.y - p.y;
  // Use ACTIVE_RADIUS (not DORMANT_RADIUS) for initial classification.
  // The hysteresis ring (ACTIVE_RADIUS..DORMANT_RADIUS) prevents flickering
  // during gameplay movement — but at world-gen, there's no movement to flicker.
  // Creatures in the ring start dormant and wake naturally when the player
  // moves within ACTIVE_RADIUS.
  if (dx * dx + dy * dy > ACTIVE_RADIUS * ACTIVE_RADIUS) {
    creature._dormant = true;
    creature._dormantTurns = 0;
  } else {
    creature._dormant = false;
    creature._dormantTurns = 0;
  }
}

// ==================== SPAWN-POINT SEARCH ====================
// Spiral outward from (cx, cy) for a tile the predicate accepts. Used for the
// player's start. (The structure/landmark placement that used to live here
// — chests, signs, ruins, towns, water-cave spawns — is gone with structures.js.)
export function findSpotNear(layer, cx, cy, predicate, radius){
  const [w,h] = worldDims(layer);
  cx = Math.max(0, Math.min(w-1, cx));
  cy = Math.max(0, Math.min(h-1, cy));
  for (let r=0;r<=radius;r++){
    for (let dy=-r;dy<=r;dy++){
      for (let dx=-r;dx<=r;dx++){
        if (Math.max(Math.abs(dx),Math.abs(dy)) !== r) continue;
        const x=cx+dx, y=cy+dy;
        if (!inBounds(layer,x,y)) continue;
        const cover = covers[layer] ? covers[layer][y][x] : 0;
        if (cover) continue;  // skip tiles with cover (replaces isOverlay check)
        const ground = worlds[layer][y][x];
        if (predicate(ground, x, y, cover)) return [x,y];
      }
    }
  }
  return null;
}

// ==================== MONSTER SPAWNING ====================
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
//
// This entire section is temporary scaffolding. It places a static snapshot
// of creature populations using hardcoded density ratios, spacing rules, and
// clustering. The long-term system will derive population from energy budgets
// and dynamic reproduction. See Spawning-Design.md for the full roadmap.

// Cover types that block creature spawning (structures, interactables, etc.)
const NO_SPAWN_COVERS = new Set([
  T.STAIRS_DOWN, T.STAIRS_UP, T.GATE, T.NPC, T.SHOP, T.INN,
  T.HOUSE, T.HOUSE_LG, T.WALL, T.SHOPKEEPER, T.SIGN, T.CHEST,
  T.BOOK, T.WELL, T.WELL_TL, T.WELL_TR, T.WELL_BL,
  T.WELL_BR, T.BARREL, T.CRATE, T.LAMP_POST, T.FOUNTAIN,
  T.FARM, T.TOWN,
]);

// ---- Tile-level habitat matching ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
// Returns true if a tile's ground+cover combination matches a species' habitat.
function tileMatchesHabitat(ground, cover, habitatDef) {
  if (cover && habitatDef.cover.has(cover)) return true;
  if (habitatDef.ground.has(ground)) return true;
  return false;
}

// ---- Spawn viability check ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
// Verifies that the spawn point has enough habitat tiles nearby to support
// local movement. Prevents stranding a creature on a single valid tile
// surrounded by water or impassable terrain.
// This is a simple neighbor count, not pathfinding.
function isSpawnViable(x, y, habitatDef) {
  const grid = worlds[LAYER_SURFACE];
  const coverGrid = covers[LAYER_SURFACE];
  let count = 0;
  const r = SPAWN_VIABILITY_RADIUS;
  const x0 = Math.max(0, x - r);
  const x1 = Math.min(W_SURF - 1, x + r);
  const y0 = Math.max(0, y - r);
  const y1 = Math.min(H_SURF - 1, y + r);
  for (let sy = y0; sy <= y1; sy++) {
    for (let sx = x0; sx <= x1; sx++) {
      const g = grid[sy][sx];
      const c = coverGrid ? coverGrid[sy][sx] : 0;
      if (tileMatchesHabitat(g, c, habitatDef)) count++;
      if (count >= SPAWN_VIABILITY_MIN) return true; // early exit
    }
  }
  return false;
}

// ---- Check whether any water tile exists within `dist` of (cx, cy) ----
function hasNearbyWater(cx, cy, dist) {
  const grid = worlds[LAYER_SURFACE];
  const h = grid.length, w = grid[0].length;
  const x0 = Math.max(0, cx - dist);
  const x1 = Math.min(w - 1, cx + dist);
  const y0 = Math.max(0, cy - dist);
  const y1 = Math.min(h - 1, cy + dist);
  for (let sy = y0; sy <= y1; sy++) {
    for (let sx = x0; sx <= x1; sx++) {
      const t = grid[sy][sx];
      if (t === T.WATER || t === T.DEEP_WATER) return true;
    }
  }
  return false;
}

// ---- Pick a random value within an integer range [lo, hi] ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
function randRange(lo, hi) {
  return lo + randi(hi - lo + 1);
}

// ---- Fisher-Yates shuffle (in-place) ----
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randi(i + 1);
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// ---- Place a creature and initialize standard fields ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
function placeCreature(key, x, y) {
  const m = spawnMonster(key);
  if (!m) return null;
  m.x = x; m.y = y;
  m.homeX = x; m.homeY = y;
  m.hp = m.hpMax;

  // Drive system: set wander home position for territorial creatures
  if (m._needsHomePosition && m.wanderProfile) {
    m.wanderProfile.homePosition = { x: x, y: y };
    delete m._needsHomePosition;
  }

  // Prompt S: initialize dormancy state based on distance to player
  initDormancy(m);

  if (!monsters[LAYER_SURFACE]) monsters[LAYER_SURFACE] = [];
  monsters[LAYER_SURFACE].push(m);
  return m;
}

export function spawnMonstersInWorld(){
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // Reset monster arrays — the new density-based system replaces any creatures
  // placed by the legacy populateMonsters() call in surface-gen.js.
  // Without this reset, creatures are double-spawned (old + new system).
  monsters[LAYER_SURFACE] = [];
  if (!monsters[LAYER_UNDER])   monsters[LAYER_UNDER]   = [];

  const grid = worlds[LAYER_SURFACE];
  const coverGrid = covers[LAYER_SURFACE];

  // ---- Safe zone around player start ----
  const safeZone = Math.max(3, Math.round(Math.min(W_SURF, H_SURF) * 0.063));
  const startX = state.player.startX || Math.floor(W_SURF * 0.50);
  const startY = state.player.startY || Math.floor(H_SURF * 0.56);

  function inSafeZone(x, y) {
    return Math.abs(x - startX) < safeZone && Math.abs(y - startY) < safeZone;
  }

  // ==================================================================
  // PHASE 0: Count habitat tiles per species
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // One-time scan at world generation. For each species in the density
  // system, collect all valid spawn tiles (matching habitat, walkable or
  // species-allowed, not in safe zone, not blocked by structure cover).
  // ==================================================================
  const speciesKeys = ['dire_wolf', 'ambush_pred', 'wolf', 'cave_crab', 'hare'];
  const habitatTiles = {};   // key → [{x, y}, ...]
  for (const key of speciesKeys) {
    habitatTiles[key] = [];
  }

  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {
      const ground = grid[y][x];
      const cover = coverGrid ? coverGrid[y][x] : 0;

      // Skip non-walkable tiles (exception: water for cave_crab)
      const walkable = isWalkable(ground, cover);
      const isWaterTile = (ground === T.WATER);

      // Skip structure covers
      if (cover && NO_SPAWN_COVERS.has(cover)) continue;
      // Skip town interiors
      if (ground === T.WOOD_FLOOR) continue;
      // Skip safe zone
      if (inSafeZone(x, y)) continue;

      for (const key of speciesKeys) {
        const hab = SPAWN_HABITAT[key];
        if (!hab) continue;

        // Walkability gate: most species need walkable tiles.
        // cave_crab can spawn on water tiles (canEnterWater = true).
        if (!walkable && !(key === 'cave_crab' && isWaterTile)) continue;

        if (tileMatchesHabitat(ground, cover, hab)) {
          habitatTiles[key].push({ x, y });
        }
      }
    }
  }

  // ==================================================================
  // Compute target populations from density ratios
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // A random value within each density range is chosen per spawn pass
  // so populations vary between maps.
  // ==================================================================
  const densityMap = {
    hare:        SPAWN_DENSITY_SMALL_HERB,
    cave_crab:   SPAWN_DENSITY_LARGE_HERB,
    wolf:        SPAWN_DENSITY_MESO_PRED,
    ambush_pred: SPAWN_DENSITY_AMBUSH_PRED,
    dire_wolf:   SPAWN_DENSITY_APEX_PRED,
  };

  const targetPop = {};
  const habitatCount = {};
  for (const key of speciesKeys) {
    const tiles = habitatTiles[key].length;
    habitatCount[key] = tiles;
    const [lo, hi] = densityMap[key];
    const ratio = randRange(lo, hi);
    targetPop[key] = Math.max(0, Math.round(tiles / ratio));
  }

  // Shuffle habitat tile arrays so random picks are O(1) pops
  for (const key of speciesKeys) {
    shuffleArray(habitatTiles[key]);
  }

  // Track all spawned wolves/dire_wolves for pair bonding
  const spawnedWolves = [];

  // ==================================================================
  // PHASES 1–3: Predators and large herbivores
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // Iterate shuffled habitat tiles, place on viable spots until target
  // reached. No spacing enforcement — map is small enough that sparse
  // density ratios handle distribution. Predators placed first so their
  // lower targets are always met before tiles are exhausted.
  // ==================================================================
  for (const key of ['dire_wolf', 'ambush_pred', 'wolf', 'cave_crab']) {
    const target = targetPop[key];
    const tiles = habitatTiles[key];
    const hab = SPAWN_HABITAT[key];
    let spawned = 0;

    for (let i = 0; i < tiles.length && spawned < target; i++) {
      const { x, y } = tiles[i];
      if (!isSpawnViable(x, y, hab)) continue;

      const m = placeCreature(key, x, y);
      if (m) {
        if (key === 'wolf' || key === 'dire_wolf') spawnedWolves.push(m);
        spawned++;
      }
    }

    console.log(`[Spawn] ${key}: ${spawned}/${target} placed (${habitatCount[key]} habitat tiles)`);
  }

  // ==================================================================
  // PHASE 4: Small herbivores in clusters (hare / C3)
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // Most numerous, clustered. Pick cluster centers from viable habitat
  // tiles, then scatter individuals within cluster radius.
  // ==================================================================
  {
    const key = 'hare';
    const target = targetPop[key];
    const tiles = habitatTiles[key];
    const hab = SPAWN_HABITAT[key];
    const avgCluster = Math.round((SPAWN_CLUSTER_SIZE[0] + SPAWN_CLUSTER_SIZE[1]) / 2);
    const clusterCount = Math.max(1, Math.round(target / avgCluster));

    const clusterCenters = [];
    let totalSpawned = 0;

    // Pick cluster centers from viable habitat tiles
    for (let i = 0; i < tiles.length && clusterCenters.length < clusterCount; i++) {
      const { x, y } = tiles[i];
      if (!isSpawnViable(x, y, hab)) continue;
      clusterCenters.push({ x, y });
    }

    // Populate each cluster
    for (const center of clusterCenters) {
      if (totalSpawned >= target) break;

      const clusterSize = randRange(SPAWN_CLUSTER_SIZE[0], SPAWN_CLUSTER_SIZE[1]);
      let clusterSpawned = 0;

      // Try to place individuals within SPAWN_CLUSTER_RADIUS of center
      for (let attempt = 0; attempt < clusterSize * 4 && clusterSpawned < clusterSize; attempt++) {
        const ox = randi(SPAWN_CLUSTER_RADIUS * 2 + 1) - SPAWN_CLUSTER_RADIUS;
        const oy = randi(SPAWN_CLUSTER_RADIUS * 2 + 1) - SPAWN_CLUSTER_RADIUS;
        const tx = center.x + ox;
        const ty = center.y + oy;

        // Bounds check
        if (tx < 0 || ty < 0 || tx >= W_SURF || ty >= H_SURF) continue;
        if (inSafeZone(tx, ty)) continue;

        const ground = grid[ty][tx];
        const cover = coverGrid ? coverGrid[ty][tx] : 0;
        if (!isWalkable(ground, cover)) continue;
        if (cover && NO_SPAWN_COVERS.has(cover)) continue;
        if (!tileMatchesHabitat(ground, cover, hab)) continue;

        const m = placeCreature(key, tx, ty);
        if (m) {
          clusterSpawned++;
          totalSpawned++;
        }
      }
    }

    console.log(`[Spawn] Small herbivore (hare): ${totalSpawned}/${target} placed in ${clusterCenters.length} clusters (${habitatCount[key]} habitat tiles)`);
  }

  // ==================================================================
  // LEGACY: Mushroom (chemotroph) spawning
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // Mushroom (C5) is NOT part of the density-based system per design doc.
  // Retained as legacy biome-weight spawning — fungal zones only.
  // ==================================================================
  {
    const mushroomHab = HABITAT.mushroom;
    if (mushroomHab && !SPAWN_BLACKLIST.has('mushroom')) {
      const cellCounters = {};
      function getCellKey(x, y) {
        return Math.floor(x / CELL_TILE_W) + ',' + Math.floor(y / CELL_TILE_H);
      }

      for (let y = 0; y < H_SURF; y++) {
        for (let x = 0; x < W_SURF; x++) {
          const ground = grid[y][x];
          const cover = coverGrid ? coverGrid[y][x] : 0;
          if (!isWalkable(ground, cover)) continue;
          if (ground === T.WOOD_FLOOR) continue;
          if (cover && NO_SPAWN_COVERS.has(cover)) continue;
          if (inSafeZone(x, y)) continue;

          // Determine biome from target map
          const cellX = Math.floor(x / CELL_TILE_W);
          const cellY = Math.floor(y / CELL_TILE_H);
          const clampedCX = Math.min(cellX, BIOME_TARGET[0].length - 1);
          const clampedCY = Math.min(cellY, BIOME_TARGET.length - 1);
          const biome = BIOME_TARGET[clampedCY][clampedCX].biome;

          if (!mushroomHab.biomes.includes(biome)) continue;

          const cellKey = clampedCX + ',' + clampedCY;
          const count = cellCounters[cellKey] || 0;
          if (count >= mushroomHab.maxPerCell) continue;

          if (rand() >= mushroomHab.spawnWeight) continue;

          const m = placeCreature('mushroom', x, y);
          if (m) {
            cellCounters[cellKey] = count + 1;
          }
        }
      }
    }
  }

  // ==================================================================
  // Wolf pair bonding (unchanged from previous system)
  // ==================================================================
  const pairBonders = spawnedWolves.filter(w => w.personality === 'pair_bond' && !w.bondPartner);
  for (let i=0; i<pairBonders.length-1; i+=2){
    const a = pairBonders[i], b = pairBonders[i+1];
    if (chebyshev(a.x,a.y,b.x,b.y) < Math.max(5, Math.round(Math.min(W_SURF, H_SURF) * 0.134))){
      a.bondPartner = b;
      b.bondPartner = a;
    }
  }

  // ==================================================================
  // Underground spawning (unchanged — not part of first-pass redesign)
  // ==================================================================
  const underDensity = {
    [T.CAVE_FLOOR]: 0.015,
    [T.ROCK]:       0.0125,
  };
  for (let y=0;y<H_UNDER;y++){
    for (let x=0;x<W_UNDER;x++){
      const ground = worlds[LAYER_UNDER][y][x];
      const cover = covers[LAYER_UNDER] ? covers[LAYER_UNDER][y][x] : 0;
      if (!isWalkable(ground, cover)) continue;
      if (cover) continue;  // skip tiles with cover (stairs, etc)
      let density = underDensity[ground] || 0;
      let biomeHint = null;
      for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++){
        const nx=x+dx,ny=y+dy;
        if (!inBounds(LAYER_UNDER,nx,ny)) continue;
        if (worlds[LAYER_UNDER][ny][nx]===T.LAVA){ biomeHint = T.LAVA; density = 0.02; }
        else if (worlds[LAYER_UNDER][ny][nx]===T.UWATER && biomeHint==null){ biomeHint = T.UWATER; density = 0.0175; }
      }
      if (rand() >= density) continue;
      const targetT = biomeHint || ground;
      const eligible = Object.keys(MON).filter(k => {
        if (SPAWN_BLACKLIST.has(k)) return false;
        const d = MON[k];
        return d[13].includes(targetT) && d[14] === LAYER_UNDER;
      });
      if (!eligible.length) continue;
      const m = spawnMonster(choice(eligible));
      m.x = x; m.y = y;
      m.homeX = x; m.homeY = y;
      m.hp = m.hpMax;
      // Drive system: set wander home position for territorial creatures
      if (m._needsHomePosition && m.wanderProfile) {
        m.wanderProfile.homePosition = { x: x, y: y };
        delete m._needsHomePosition;
      }
      // Prompt S: initialize dormancy (underground creatures start dormant)
      initDormancy(m, LAYER_UNDER);
      monsters[LAYER_UNDER].push(m);
    }
  }
}

// ==================== INIT ====================
export function initWorld(seed){
  for (const k in worlds) delete worlds[k];
  for (const k in covers) delete covers[k];
  for (const k in features) delete features[k];
  for (const k in monsters) delete monsters[k];
  for (const k in groundItems) delete groundItems[k];   // corpses of the last run
  for (const k in LAYER_META) delete LAYER_META[k];
  resetScent();

  generateLayer(LAYER_SURFACE, seed);
  generateLayer(LAYER_UNDER, seed);

  // Spawn player on the surface: scan outward from center for a walkable,
  // non-water, non-cover tile.
  const spawnCenter = findSpotNear(
    LAYER_SURFACE,
    Math.floor(W_SURF / 2),
    Math.floor(H_SURF / 2),
    (ground, x, y, cover) => {
      if (cover) return false;
      return isWalkable(ground, cover)
        && ground !== T.WATER && ground !== T.DEEP_WATER
        && ground !== T.LAVA;
    },
    Math.max(W_SURF, H_SURF),
  );
  const spawnX = spawnCenter ? spawnCenter[0] : Math.floor(W_SURF / 2);
  const spawnY = spawnCenter ? spawnCenter[1] : Math.floor(H_SURF / 2);
  state.player.startX = spawnX;
  state.player.startY = spawnY;

  // Set player position BEFORE spawnMonstersInWorld so that initDormancy
  // distance checks use the correct coordinates.
  activateLayer(LAYER_SURFACE);
  state.player.layer = LAYER_SURFACE;
  state.player.x = spawnX;
  state.player.y = spawnY;

  spawnMonstersInWorld();

  // ── Final dormancy sweep (Prompt S) ──
  // Catch any creature from any spawning path that was never initialized.
  // After this pass, every creature on every layer has an explicit _dormant
  // value — the turn-loop's updateCreatureActivity can rely on it.
  for (const layerStr of Object.keys(monsters)) {
    const layerIdx = Number(layerStr);
    const layerMons = monsters[layerIdx];
    if (!layerMons) continue;
    for (const m of layerMons) {
      if (m.hp <= 0) continue;
      if (m._dormant == null) {   // undefined or null — never initialized
        initDormancy(m, layerIdx);
      }
    }
  }
}

// ==================== DEBUG: DORMANCY DIAGNOSTICS ====================
// Call from F12 console:  debugDormancy()
// Safe to leave in — only runs when explicitly called.
window.debugDormancy = function() {
  const p = state.player;
  const layer = p.layer;
  const mons = monsters[layer] || [];
  const alive = mons.filter(m => m.hp > 0);

  let dormant = 0, active = 0, uninit = 0;
  const speciesCounts = {};
  const buckets = { within40: 0, ring40_45: 0, beyond45: 0 };

  for (const m of alive) {
    // Dormancy status
    if (m._dormant === true) dormant++;
    else if (m._dormant === false) active++;
    else uninit++;  // undefined — never initialized, THIS IS THE BUG

    // Per-species count
    speciesCounts[m.key] = (speciesCounts[m.key] || 0) + 1;

    // Distance bucket
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 40) buckets.within40++;
    else if (dist <= 45) buckets.ring40_45++;
    else buckets.beyond45++;
  }

  console.log('%c═══ DORMANCY REPORT ═══', 'font-weight:bold; font-size:14px');
  console.log(`Layer ${layer} — ${alive.length} alive creatures`);
  console.log(`  dormant:  ${dormant}`);
  console.log(`  active:   ${active}`);
  if (uninit > 0) {
    console.log(`  %cUNINIT:   ${uninit} ← BUG — these have no _dormant field`, 'color:red; font-weight:bold');
  } else {
    console.log(`  uninit:   0 ✓`);
  }
  console.log(`Distance from player (${p.x}, ${p.y}):`);
  console.log(`  ≤40 tiles (ACTIVE_RADIUS):   ${buckets.within40}`);
  console.log(`  40–45 (hysteresis ring):      ${buckets.ring40_45}`);
  console.log(`  >45 (DORMANT_RADIUS):         ${buckets.beyond45}`);
  console.log('Species breakdown:');
  for (const [key, count] of Object.entries(speciesCounts).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }

  // Flag the problem states
  if (uninit > 0) {
    console.log('%c⚠ Creatures with undefined _dormant are treated as active by the turn loop — this is the performance bug.', 'color:red');
  }
  if (alive.length > 1000) {
    console.log('%c⚠ >1000 creatures — likely double-spawning (old populateMonsters + new spawnMonstersInWorld).', 'color:red');
  }
  if (active > 100) {
    console.log('%c⚠ >100 active creatures — too many running AI per turn.', 'color:orange');
  }
  return { total: alive.length, dormant, active, uninit, species: speciesCounts, buckets };
};
