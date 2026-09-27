// ==================== SHARED GENERATION UTILITIES ====================
import { worlds, covers, features, monsters } from './state.js';
import { LAYER_SURFACE, LAYER_UNDER, LAYER_META, getAtmosphere } from './constants.js';
import { T, isWalkable } from './terrain.js';
import { rand, choice } from './rng.js';
import { MON, getSpawnRules, spawnMonster, SPAWN_BLACKLIST } from './monsters.js';
import { isCoordInRegion } from './world-state.js';

// ==================== SPAWN FILTER REGISTRY ====================
export function validateMonsterSpawn(monsterKey, x, y, layerIndex){
  // Blacklisted creatures never spawn anywhere
  if (SPAWN_BLACKLIST.has(monsterKey)) return false;

  const rules = getSpawnRules(monsterKey);

  if (rules && rules.restrictedRegion){
    if (rules.layers && !rules.layers.includes(layerIndex)){
      return false;
    }
    if (!isCoordInRegion(x, y, rules.restrictedRegion, layerIndex)){
      return false;
    }
  }

  // Atmosphere-based restriction: high elevation surface tiles → rock_golem only
  if (layerIndex === LAYER_SURFACE){
    const atmo = getAtmosphere(x, y);
    if (atmo.elevation > 0.68 && atmo.moisture < 0.35){
      // High-elevation, dry zone — only rock golems allowed
      if (monsterKey !== 'rock_golem') return false;
    }
  }

  const meta = LAYER_META[layerIndex];
  if (meta && meta.type === 'lava'){
    const d = MON[monsterKey];
    if (d){
      const tags = d[10];
      if (!tags || !tags.includes('fire')){
        return false;
      }
    }
  }

  return true;
}

export function filterSpawnCandidates(candidates, x, y, layerIndex){
  return candidates.filter(key => validateMonsterSpawn(key, x, y, layerIndex));
}

// ==================== MONSTER POPULATION ====================
const NO_SPAWN_COVERS = new Set([
  T.STAIRS_DOWN, T.STAIRS_UP, T.GATE, T.NPC, T.SHOP, T.INN,
  T.HOUSE, T.HOUSE_LG, T.WALL, T.SHOPKEEPER, T.SIGN, T.CHEST,
  T.BOOK, T.THRONE, T.WELL, T.WELL_TL, T.WELL_TR, T.WELL_BL,
  T.WELL_BR, T.BARREL, T.CRATE, T.LAMP_POST, T.FOUNTAIN,
  T.FARM, T.CASTLE, T.BLACKSPIRE, T.TOWN,
]);

export function populateMonsters(grid, layerIndex) {
  const h = grid.length;
  const w = grid[0].length;
  const coverGrid = covers[layerIndex];

  const candidatesByTerrain = {};
  const layerConst = layerIndex === LAYER_SURFACE ? LAYER_SURFACE : LAYER_UNDER;

  for (const key of Object.keys(MON)) {
    const d = MON[key];
    const biomes = d[12];
    const monLayer = d[13];
    if (monLayer !== layerConst) continue;
    for (const biome of biomes) {
      if (!candidatesByTerrain[biome]) candidatesByTerrain[biome] = [];
      candidatesByTerrain[biome].push(key);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ground = grid[y][x];
      const cover = coverGrid ? coverGrid[y][x] : 0;

      // Skip non-walkable (composite check)
      if (!isWalkable(ground, cover)) continue;
      // Skip special cover tiles
      if (cover && NO_SPAWN_COVERS.has(cover)) continue;

      if (rand() >= 1 / 67) continue;

      // Determine the "biome" for monster pool lookup.
      // Cover types like FOREST, MUSHFOREST define the biome when present.
      // Otherwise fall back to ground type.
      const biomeKey = cover || ground;
      const pool = candidatesByTerrain[biomeKey];
      if (!pool || pool.length === 0) continue;

      const valid = filterSpawnCandidates(pool, x, y, layerIndex);
      if (valid.length === 0) continue;

      const key = choice(valid);
      const mon = spawnMonster(key);
      if (!mon) continue;

      mon.x = x;
      mon.y = y;
      mon.homeX = x;
      mon.homeY = y;

      if (!monsters[layerIndex]) monsters[layerIndex] = [];
      monsters[layerIndex].push(mon);
    }
  }
}

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
