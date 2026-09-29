// ==================== WORLD GENERATION — COORDINATION LAYER ====================
import {
  worlds, covers, features, monsters,
  state, nextLayerIndex, layerExists,
} from './state.js';
import {
  W_SURF, H_SURF, W_UNDER, H_UNDER,
  LAYER_SURFACE, LAYER_UNDER, LAYER_META,
  ATMOSPHERE,
} from './constants.js';
import { T } from './terrain.js';
import { makeSurface } from './surface-gen.js';
import { makeUnderground, makeLavaLayer, playableRadius } from './underground-gen.js';

// Re-export from gen-utils so existing consumers that import from world-gen still work

// Re-export from sub-modules so existing consumers can keep importing from world-gen
export { makeSurface, placeDirtRoads } from './surface-gen.js';
export { makeUnderground, makeLavaLayer, playableRadius, carveCorridors, carveBetween } from './underground-gen.js';


export function generateLayer(layerIndex, seed) {
  if (layerExists(layerIndex)) return;

  if (!features[layerIndex]) features[layerIndex] = {};
  if (!monsters[layerIndex]) monsters[layerIndex] = [];

  const sourceStairs = [];
  if (layerIndex !== LAYER_SURFACE) {
    for (const lk of Object.keys(features)) {
      const layerFeats = features[lk];
      if (!layerFeats) continue;
      for (const fk of Object.keys(layerFeats)) {
        const f = layerFeats[fk];
        if (f && f.type === 'stairs' && f.dir === 'down' && f.targetLayer === layerIndex) {
          sourceStairs.push({ stair: f, sourceLayerIdx: Number(lk) });
        }
      }
    }
  }

  const defaultRadius = playableRadius(layerIndex, W_UNDER, H_UNDER);
  const pockets = sourceStairs.map(({ stair }) => ({
    x: stair.targetX ?? stair.sourceX ?? Math.floor(W_UNDER / 2),
    y: stair.targetY ?? stair.sourceY ?? Math.floor(H_UNDER / 2),
    radius: defaultRadius,
  }));

  if (pockets.length === 0 && layerIndex !== LAYER_SURFACE) {
    pockets.push({
      x: Math.floor(W_UNDER / 2),
      y: Math.floor(H_UNDER / 2),
      radius: defaultRadius,
    });
  }

  if (layerIndex === LAYER_SURFACE) {
    const grid = makeSurface(seed);
    worlds[layerIndex] = grid;
    LAYER_META[layerIndex] = {
      type: 'surface', w: W_SURF, h: H_SURF, seed,
      atmosphere: ATMOSPHERE,
    };

  } else if (layerIndex === LAYER_UNDER) {
    const grid = makeUnderground(seed, layerIndex, pockets, sourceStairs);
    worlds[layerIndex] = grid;
    LAYER_META[layerIndex] = {
      type: 'underground', w: W_UNDER, h: H_UNDER, seed, pockets,
    };

  } else {
    const isLava = layerIndex % 2 === 0;
    const layerSeed = seed + layerIndex * 3571;
    const grid = isLava
      ? makeLavaLayer(layerSeed, layerIndex, pockets, sourceStairs)
      : makeUnderground(layerSeed, layerIndex, pockets, sourceStairs);

    worlds[layerIndex] = grid;
    LAYER_META[layerIndex] = {
      type: isLava ? 'lava' : 'underground',
      w: W_UNDER,
      h: H_UNDER,
      seed: layerSeed,
      pockets,
    };
  }

  // Back-fill targetX/targetY on source stairs
  for (const { stair, sourceLayerIdx } of sourceStairs) {
    if (stair.targetX != null && stair.targetY != null) continue;
    const grid = worlds[layerIndex];
    const coverGrid = covers[layerIndex];
    if (!grid) continue;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (coverGrid && coverGrid[y][x] === T.STAIRS_UP) {
          const sf = features[layerIndex] && features[layerIndex][x + ',' + y];
          if (sf && sf.type === 'stairs' && sf.targetLayer === sourceLayerIdx) {
            stair.targetX = x;
            stair.targetY = y;
          }
        }
      }
    }
  }
}
