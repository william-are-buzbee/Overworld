// ==================== TOWN & SHOP GENERATION ====================
import { worlds, covers, cellKeyToLayer } from './state.js';
import { LAYER_SURFACE, LAYER_META } from './constants.js';
import { T } from './terrain.js';
import { rand, randi, choice } from './rng.js';
import { setFeature } from './world-state.js';
import { addLayer } from './world-gen.js';

// ==================== BUILDING SIZE DATA ====================
const BLDG_INTERIOR = {
  sm:  {w: 10, h: 8},
  med: {w: 14, h: 8},
  lg:  {w: 20, h: 16},
};

// ==================== SHOP INTERIOR GENERATION ====================
export function makeShopInterior(shopKey, shopName, bldgSize, returnLayer, returnX, returnY){
  const dims = BLDG_INTERIOR[bldgSize || 'sm'];
  const w = dims.w, h = dims.h;
  const layer = addLayer(w, h);
  const grid = worlds[layer];
  const coverGrid = covers[layer];

  LAYER_META[layer] = { type: 'shop', w, h, seed: 0, shopKey };

  // Fill with shop floor ground
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      grid[y][x] = T.SHOP_INSIDE;
      coverGrid[y][x] = 0;
    }
  }
  // Walls (ground type)
  for (let x = 0; x < w; x++){ grid[0][x] = T.WALL; grid[h-1][x] = T.WALL; }
  for (let y = 0; y < h; y++){ grid[y][0] = T.WALL; grid[y][w-1] = T.WALL; }
  // Shopkeeper as cover
  const skX = Math.floor(w / 2);
  const skY = 2;
  coverGrid[skY][skX] = T.SHOPKEEPER;
  setFeature(layer, skX, skY, {type:'shop_building', shopKey, name:shopName});
  // Counter line (cover)
  for (let x = skX - 2; x <= skX + 2; x++){
    if (x > 0 && x < w - 1 && x !== skX){
      coverGrid[skY + 1][x] = rand() < 0.5 ? T.BARREL : T.CRATE;
    }
  }
  // Decorative barrels/crates (cover)
  if (w > 8){
    coverGrid[1][1] = T.BARREL;
    coverGrid[1][w - 2] = T.CRATE;
  }
  // Exit gate (cover)
  const gateX = Math.floor(w / 2);
  grid[h - 1][gateX] = T.SHOP_INSIDE;  // ground under gate
  coverGrid[h - 1][gateX] = T.GATE;
  setFeature(layer, gateX, h - 1, {type:'gate', returnLayer, returnX, returnY});
  return layer;
}

// ==================== TOWN CELL GEN ====================
export function makeTownCell(townKey){
  const w = 22, h = 15;
  const layer = addLayer(w, h);
  cellKeyToLayer[townKey] = layer;
  const grid = worlds[layer];
  const coverGrid = covers[layer];

  LAYER_META[layer] = { type: 'town', w, h, seed: 0, townKey };

  // Fill with plains ground, no cover
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    grid[y][x] = T.PLAINS;
    coverGrid[y][x] = 0;
  }
  // Border walls (ground)
  for (let x=0;x<w;x++){ grid[0][x] = T.WALL; grid[h-1][x] = T.WALL; }
  for (let y=0;y<h;y++){ grid[y][0] = T.WALL; grid[y][w-1] = T.WALL; }

  if (townKey === 'millhaven'){
    buildMillhaven(layer, grid, coverGrid, w, h);
  } else if (townKey === 'thornwell'){
    buildThornwell(layer, grid, coverGrid, w, h);
  } else if (townKey === 'dunegate'){
    buildDunegate(layer, grid, coverGrid, w, h);
  } else if (townKey === 'karst'){
    buildKarst(layer, grid, coverGrid, w, h);
  }
  return layer;
}

// ==================== TOWN UTILITIES ====================
function placeBuilding(layer, x, y, terrainType, feature){
  // Buildings are cover types
  const coverGrid = covers[layer];
  if (coverGrid) coverGrid[y][x] = terrainType;
  if (feature) setFeature(layer, x, y, feature);
}
function placeNPCinCell(layer, x, y, npcKey){
  placeBuilding(layer, x, y, T.NPC, {type:'npc', npcKey});
}
function placeGate(layer, x, y, returnLayer, returnX, returnY){
  placeBuilding(layer, x, y, T.GATE, {type:'gate', returnLayer, returnX, returnY});
}

function place2x2Well(layer, cx, cy, text){
  const coverGrid = covers[layer];
  coverGrid[cy][cx]     = T.WELL_TL;
  coverGrid[cy][cx+1]   = T.WELL_TR;
  coverGrid[cy+1][cx]   = T.WELL_BL;
  coverGrid[cy+1][cx+1] = T.WELL_BR;
  setFeature(layer, cx, cy+1, {type:'well', text: text || 'A stone well. The water is cold and clean.'});
}

function layTownRoads(grid, w, h, points){
  for (let i = 0; i < points.length - 1; i++){
    let x = points[i][0], y = points[i][1];
    const tx = points[i+1][0], ty = points[i+1][1];
    while (x !== tx || y !== ty){
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1){
        const t = grid[y][x];
        if (t === T.PLAINS || t === T.DESERT || t === T.MOUNTAIN){
          grid[y][x] = T.ROAD;
        }
        // Also check if there's forest cover, and if converting to road, clear it
        // (Forest was formerly a ground type that layTownRoads would overwrite)
      }
      if (x < tx) x++; else if (x > tx) x--;
      else if (y < ty) y++; else if (y > ty) y--;
    }
  }
}

function scatterDecorations(layer, grid, coverGrid, w, h, count){
  const decoTypes = [T.BARREL, T.CRATE, T.LAMP_POST];
  let placed = 0;
  for (let attempts = 0; attempts < count * 8 && placed < count; attempts++){
    const x = 2 + randi(w - 4);
    const y = 2 + randi(h - 4);
    if ((grid[y][x] === T.PLAINS || grid[y][x] === T.ROAD) && !coverGrid[y][x]){
      let blocked = false;
      for (const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
        const c = coverGrid[y+dy] && coverGrid[y+dy][x+dx];
        if (c === T.NPC || c === T.GATE || c === T.SHOP || c === T.INN) blocked = true;
      }
      if (!blocked){
        coverGrid[y][x] = choice(decoTypes);
        placed++;
      }
    }
  }
}

function placeEnterableShop(layer, x, y, shopKey, shopName, bldgSize){
  const shopLayer = makeShopInterior(shopKey, shopName, bldgSize || 'sm', layer, x, y + 1);
  placeBuilding(layer, x, y, T.SHOP, {
    type:'shop_building', shopKey, name: shopName,
    enterable: true, interiorLayer: shopLayer, bldgSize: bldgSize || 'sm'
  });
}

function placeLargeHouse(layer, x, y, text){
  const coverGrid = covers[layer];
  coverGrid[y][x]     = T.HOUSE_LG;
  coverGrid[y][x+1]   = T.HOUSE_LG;
  coverGrid[y+1][x]   = T.HOUSE_LG;
  coverGrid[y+1][x+1] = T.HOUSE_LG;
  setFeature(layer, x, y, {type:'home', text: text || 'A large home. Muffled voices inside.'});
}

function maybeOutsideShopkeeper(layer, x, y, npcKey){
  if (rand() < 0.5){
    placeNPCinCell(layer, x, y, npcKey);
  }
}

// ==================== TOWN LAYOUTS ====================

function buildMillhaven(layer, grid, coverGrid, w, h){
  layTownRoads(grid, w, h, [
    [11, h-2], [11, 7], [11, 2]
  ]);
  layTownRoads(grid, w, h, [
    [3, 7], [19, 7]
  ]);

  // Wheat field SW — wheat is now cover on plains ground
  for (let y=10;y<14;y++) for (let x=2;x<9;x++) coverGrid[y][x] = T.WHEAT;
  placeNPCinCell(layer, 5, 11, 'farmer_mill');

  placeEnterableShop(layer, 6, 3, 'mill_smith', "Dalka's Forge", 'sm');
  maybeOutsideShopkeeper(layer, 6, 5, 'smith_mill');
  if (coverGrid[5][6] !== T.NPC) placeNPCinCell(layer, 7, 5, 'smith_mill');

  placeEnterableShop(layer, 10, 3, 'mill_grocer', "Owen's Goods", 'med');
  maybeOutsideShopkeeper(layer, 10, 5, 'merchant_mill');

  placeBuilding(layer, 14, 3, T.INN, {type:'shop_building', shopKey:'mill_inn', name:'The Millward Rest'});
  placeNPCinCell(layer, 14, 5, 'innkeep_mill');

  placeLargeHouse(layer, 17, 3, "The mayor's residence. An oak door, polished brass knocker.");
  placeNPCinCell(layer, 18, 5, 'mayor');

  place2x2Well(layer, 10, 8, 'The old town well. Water tastes clean.');

  placeBuilding(layer, 3, 3, T.HOUSE, {type:'home', text:"A small home. Children's laughter within."});
  placeBuilding(layer, 16, 11, T.HOUSE, {type:'home', text:"A locked home. Nobody answers."});

  coverGrid[6][11] = T.FOUNTAIN;

  scatterDecorations(layer, grid, coverGrid, w, h, 5);

  placeGate(layer, 11, h-1, LAYER_SURFACE, 0, 0);
}

function buildThornwell(layer, grid, coverGrid, w, h){
  // Scatter forest cover
  for (let i=0;i<20;i++){
    const x = 1 + randi(w-2), y = 1 + randi(h-2);
    if (grid[y][x] === T.PLAINS && !coverGrid[y][x] && rand()<0.5) coverGrid[y][x] = T.FOREST;
  }

  layTownRoads(grid, w, h, [
    [11, h-2], [11, 9], [5, 9], [5, 6]
  ]);
  layTownRoads(grid, w, h, [
    [11, 9], [17, 9], [17, 6]
  ]);

  placeBuilding(layer, 5, 3, T.HOUSE, {type:'home', text:"Elder Mirren's home, scented with pine."});
  placeNPCinCell(layer, 5, 5, 'elder_thorn');

  placeEnterableShop(layer, 11, 3, 'thorn_hunter', "Veyla's Armory", 'sm');
  maybeOutsideShopkeeper(layer, 11, 5, 'hunter_thorn');

  placeBuilding(layer, 17, 3, T.INN, {type:'shop_building', shopKey:'thorn_inn', name:'The Quiet Bough Inn'});
  placeBuilding(layer, 18, 3, T.INN, {type:'shop_building', shopKey:'thorn_inn', name:'The Quiet Bough Inn'});
  placeNPCinCell(layer, 17, 5, 'innkeep_thorn');

  placeBuilding(layer, 5, 10, T.HOUSE, {type:'home', text:"A trapper's cabin. Pelts hang out to dry."});
  placeLargeHouse(layer, 14, 10, "A weaver's large workshop. Bolts of cloth visible through the window.");

  place2x2Well(layer, 10, 8, 'A mossy well. Cold, clean water.');

  scatterDecorations(layer, grid, coverGrid, w, h, 4);

  placeGate(layer, 11, h-1, LAYER_SURFACE, 0, 0);
}

function buildDunegate(layer, grid, coverGrid, w, h){
  for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++){
    if (grid[y][x] === T.PLAINS && !coverGrid[y][x] && rand()<0.4) grid[y][x] = T.DESERT;
  }

  layTownRoads(grid, w, h, [
    [11, h-2], [11, 5]
  ]);
  layTownRoads(grid, w, h, [
    [4, 7], [18, 7]
  ]);

  placeBuilding(layer, 5, 3, T.HOUSE, {type:'home', text:"Shelves of scrolls. The Archivist's study."});
  placeNPCinCell(layer, 5, 5, 'archivist');

  placeEnterableShop(layer, 10, 3, 'dune_smith', "Karn's Smithy", 'sm');
  maybeOutsideShopkeeper(layer, 10, 5, 'smith_dune');

  placeBuilding(layer, 15, 3, T.INN, {type:'shop_building', shopKey:'dune_temple', name:'Temple of the Sun'});
  placeBuilding(layer, 16, 3, T.INN, {type:'shop_building', shopKey:'dune_temple', name:'Temple of the Sun'});
  placeBuilding(layer, 15, 4, T.INN, {type:'shop_building', shopKey:'dune_temple', name:'Temple of the Sun'});
  placeBuilding(layer, 16, 4, T.INN, {type:'shop_building', shopKey:'dune_temple', name:'Temple of the Sun'});
  placeNPCinCell(layer, 16, 5, 'oracle');

  place2x2Well(layer, 9, 8, 'An old stone well. The water is sweet.');

  placeBuilding(layer, 4, 10, T.HOUSE, {type:'home', text:"A mudbrick home. Cool inside."});
  placeBuilding(layer, 17, 10, T.HOUSE, {type:'home', text:"A merchant's home. Silks hang in the doorway."});

  coverGrid[7][14] = T.FOUNTAIN;

  scatterDecorations(layer, grid, coverGrid, w, h, 4);

  placeGate(layer, 11, h-1, LAYER_SURFACE, 0, 0);
}

function buildKarst(layer, grid, coverGrid, w, h){
  for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++){
    if (grid[y][x] === T.PLAINS && !coverGrid[y][x] && rand()<0.4) grid[y][x] = T.MOUNTAIN;
  }

  layTownRoads(grid, w, h, [
    [11, h-2], [11, 6]
  ]);
  layTownRoads(grid, w, h, [
    [4, 6], [18, 6]
  ]);

  placeBuilding(layer, 5, 3, T.HOUSE, {type:'home', text:"Olgren's hut, built into the cliff."});
  placeNPCinCell(layer, 5, 5, 'hermit_mt');

  placeEnterableShop(layer, 11, 3, 'karst_tinker', "Maela's Odds", 'med');
  maybeOutsideShopkeeper(layer, 11, 5, 'gearman');

  placeBuilding(layer, 17, 3, T.INN, {type:'shop_building', shopKey:'karst_inn', name:'Stonepeak Lodge'});

  place2x2Well(layer, 10, 8, 'A cold, deep well carved into rock.');

  placeBuilding(layer, 5, 10, T.HOUSE, {type:'home', text:"A home carved into the rock."});
  placeLargeHouse(layer, 15, 10, "A miner's barracks. Picks lean against the stone wall.");

  scatterDecorations(layer, grid, coverGrid, w, h, 3);

  placeGate(layer, 11, h-1, LAYER_SURFACE, 0, 0);
}
