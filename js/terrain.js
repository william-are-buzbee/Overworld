// ==================== TERRAIN TYPES ====================
export const T = {
  PLAINS:0, FOREST:1, DESERT:2, MOUNTAIN:3, WATER:4, DEEP:5,
  ROAD:6, BEACH:7, MUSHFOREST:8,
  STONE:10, CAVE:11, LAVA:12, UWATER:13,
  WHEAT:14, WOOD_FLOOR:15, WALL:16,
  TOWN:20, CASTLE:21, BLACKSPIRE:22,
  STAIRS_DOWN:23, STAIRS_UP:24, SIGN:25, CHEST:26, BOOK:27, GATE:28,
  NPC:29, HOUSE:30, SHOP:31, INN:32, WELL:33, FARM:34,
  THRONE:35,

  // --- New terrain types ---
  DIRT_ROAD:36,        // loose dirt paths between/around settlements
  RUIN_WALL:37,        // crumbled stone wall (non-walkable)
  RUIN_FLOOR:38,       // broken stone floor (walkable)
  WELL_TL:39,          // 2x2 well — top-left quadrant
  WELL_TR:40,          // 2x2 well — top-right quadrant
  WELL_BL:41,          // 2x2 well — bottom-left quadrant
  WELL_BR:42,          // 2x2 well — bottom-right quadrant
  BARREL:43,           // settlement decoration
  CRATE:44,            // settlement decoration
  LAMP_POST:45,        // settlement road lighting
  SHOP_INSIDE:46,      // interior floor when entering a shop building
  SHOPKEEPER:47,       // merchant NPC inside a shop
  FOUNTAIN:48,         // settlement decoration
  HOUSE_LG:49,         // large (2x2) building on overworld
  RUIN_PILLAR:50,      // decorative ruin column
  VOID:51,             // impassable black void outside cave boundaries
  ROCK:52,             // solid cave rock wall — impassable, blocks LOS
  BOULDER:53,          // large rock formation (cover, impassable)
  ROCK_OUTCROP:54,     // smaller rocky protrusion (cover, impassable)
};

// ==================== TERRAIN LAYER CLASSIFICATION ====================
// Each terrain type is classified as 'ground' or 'cover'.
//   ground — stored in worlds[layer][y][x]
//   cover  — stored in covers[layer][y][x]

export const TERRAIN_INFO = {
  // ---- GROUND types ----
  [T.PLAINS]:    {name:'plains',        sprite:'GRASS',    palette:'plains',   walk:true,  cover:0,   terrainLayer:'ground'},
  [T.DESERT]:    {name:'desert',        sprite:'DESERT',   palette:'desert',   walk:true,  cover:0,   terrainLayer:'ground'},
  [T.WATER]:     {name:'water',         sprite:'WATER',    palette:'water',    walk:false, cover:0,   terrainLayer:'ground'},
  [T.DEEP]:      {name:'deep water',    sprite:'DEEP',     palette:'deep',     walk:false, cover:0,   terrainLayer:'ground'},
  [T.ROAD]:      {name:'road',          sprite:'ROAD',     palette:'road',     walk:true,  cover:0,   terrainLayer:'ground'},
  [T.BEACH]:     {name:'beach',         sprite:'BEACH',    palette:'beach',    walk:true,  cover:0,   terrainLayer:'ground'},
  [T.STONE]:     {name:'stone',         sprite:'STONE',    palette:'stone',    walk:false, cover:0,   terrainLayer:'ground'},
  [T.CAVE]:      {name:'cave',          sprite:'CAVE',     palette:'cave',     walk:true,  cover:0,   terrainLayer:'ground'},
  [T.LAVA]:      {name:'lava',          sprite:'LAVA',     palette:'lava',     walk:false, cover:0,   terrainLayer:'ground'},
  [T.UWATER]:    {name:'dark water',    sprite:'DEEP',     palette:'uwater',   walk:false, cover:0,   terrainLayer:'ground'},
  [T.WOOD_FLOOR]:{name:'wood floor',    sprite:'WOOD_FLOOR',palette:'wood_floor',walk:true,cover:0,   terrainLayer:'ground'},
  [T.WALL]:      {name:'wall',          sprite:'STONE',    palette:'stone',    walk:false, cover:0,   terrainLayer:'ground'},
  [T.DIRT_ROAD]: {name:'dirt path',     sprite:'DIRT_ROAD',palette:'dirt_road',walk:true,  cover:0,   terrainLayer:'ground'},
  [T.RUIN_FLOOR]:{name:'ancient floor', sprite:'RUIN_FLOOR',palette:'ruin',   walk:true,  cover:10,  terrainLayer:'ground'},
  [T.SHOP_INSIDE]:{name:'shop floor',   sprite:'SHOP_FLOOR',palette:'wood_floor',walk:true,cover:0,  terrainLayer:'ground'},
  [T.VOID]:      {name:'void',          sprite:'VOID',     palette:'void',    walk:false, cover:0,   terrainLayer:'ground', transparent:false},
  [T.ROCK]:      {name:'rock',          sprite:'ROCK',     palette:'rock',    walk:false, cover:0,   terrainLayer:'ground', transparent:false},
  [T.MOUNTAIN]:  {name:'mountains',     sprite:'MOUNTAIN', palette:'mountain', walk:true,  cover:30,  terrainLayer:'ground'},

  // ---- COVER types ----
  [T.FOREST]:    {name:'forest',        sprite:'FOREST',   palette:'forest',   walk:true,  cover:45,  terrainLayer:'cover', overlay:true},
  [T.MUSHFOREST]:{name:'mushroom forest',sprite:'MUSHFOREST',palette:'mushforest',walk:true,cover:45, terrainLayer:'cover', overlay:true, noRotate:true},
  [T.WHEAT]:     {name:'wheat',         sprite:'WHEAT',    palette:'wheat',    walk:true,  cover:20,  terrainLayer:'cover', overlay:true},
  [T.TOWN]:      {name:'town',          sprite:'TOWN',     palette:'town',     walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.CASTLE]:    {name:'castle',        sprite:'CASTLE',   palette:'castle',   walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.BLACKSPIRE]:{name:'Blackspire Keep',sprite:'BLACKSPIRE',palette:'castle', walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.STAIRS_DOWN]:{name:'stairs down',  sprite:'STAIRS_DOWN',palette:'stone',  walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.STAIRS_UP]: {name:'stairs up',     sprite:'STAIRS_UP',palette:'stone',    walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.SIGN]:      {name:'signpost',      sprite:'SIGN',     palette:'plains',   walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.CHEST]:     {name:'chest',         sprite:'CHEST',    palette:'plains',   walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.BOOK]:      {name:'book',          sprite:'BOOK',     palette:'plains',   walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.GATE]:      {name:'gate',          sprite:'GATE',     palette:'town',     walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.NPC]:       {name:'person',        sprite:'NPC_TOWN', palette:'town',     walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.HOUSE]:     {name:'house',         sprite:'HOUSE',    palette:'town',     walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.SHOP]:      {name:'shop',          sprite:'SHOP',     palette:'town',     walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.INN]:       {name:'inn',           sprite:'INN',      palette:'town',     walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.WELL]:      {name:'well',          sprite:'WELL',     palette:'town',     walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.FARM]:      {name:'farm',          sprite:'FARM',     palette:'wheat',    walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.THRONE]:    {name:'throne',        sprite:'STAIRS_UP',palette:'cave',     walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.RUIN_WALL]: {name:'crumbled wall', sprite:'RUIN_WALL',palette:'ruin',    walk:false, cover:0,   terrainLayer:'cover', overlay:true},
  [T.WELL_TL]:   {name:'well',          sprite:'WELL_TL',  palette:'town',    walk:false, cover:0,   terrainLayer:'cover', overlay:true},
  [T.WELL_TR]:   {name:'well',          sprite:'WELL_TR',  palette:'town',    walk:false, cover:0,   terrainLayer:'cover', overlay:true},
  [T.WELL_BL]:   {name:'well',          sprite:'WELL_BL',  palette:'town',    walk:false, cover:0,   terrainLayer:'cover', overlay:true},
  [T.WELL_BR]:   {name:'well',          sprite:'WELL_BR',  palette:'town',    walk:false, cover:0,   terrainLayer:'cover', overlay:true},
  [T.BARREL]:    {name:'barrel',        sprite:'BARREL',   palette:'town',    walk:false, cover:15,  terrainLayer:'cover', overlay:true},
  [T.CRATE]:     {name:'crate',         sprite:'CRATE',    palette:'town',    walk:false, cover:15,  terrainLayer:'cover', overlay:true},
  [T.LAMP_POST]: {name:'lamp post',     sprite:'LAMP_POST',palette:'town',    walk:false, cover:0,   terrainLayer:'cover', overlay:true},
  [T.SHOPKEEPER]:{name:'shopkeeper',    sprite:'NPC_SHOPKEEP',palette:'town', walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.FOUNTAIN]:  {name:'fountain',      sprite:'FOUNTAIN', palette:'town',    walk:false, cover:0,   terrainLayer:'cover', overlay:true},
  [T.HOUSE_LG]:  {name:'large house',   sprite:'HOUSE_LG', palette:'town',   walk:true,  cover:0,   terrainLayer:'cover', overlay:true},
  [T.RUIN_PILLAR]:{name:'ruined pillar',sprite:'RUIN_PILLAR',palette:'ruin', walk:false, cover:20,  terrainLayer:'cover', overlay:true},
  [T.BOULDER]:   {name:'boulder',      sprite:'BOULDER',  palette:'stone',  walk:false, cover:40,  terrainLayer:'cover', overlay:true},
  [T.ROCK_OUTCROP]:{name:'rock outcrop',sprite:'ROCK_OUTCROP',palette:'stone',walk:false,cover:25, terrainLayer:'cover', overlay:true},
};

// ==================== SINGLE-TYPE QUERIES ====================
export function terrainInfo(t){ return TERRAIN_INFO[t] || TERRAIN_INFO[T.PLAINS]; }
export function isOverlay(t){ return !!terrainInfo(t).overlay; }
export function noRotate(t){ return !!terrainInfo(t).noRotate; }
export function isGround(t){ return terrainInfo(t).terrainLayer === 'ground'; }
export function isCover(t){ return terrainInfo(t).terrainLayer === 'cover'; }

// ==================== COMPOSITE QUERIES (ground + cover) ====================
// These take ground and optional cover, returning the combined result.

/** Walkability: cover can block even if ground is walkable. */
export function isWalkable(ground, coverType){
  if (coverType) {
    const ci = terrainInfo(coverType);
    if (!ci.walk) return false;
  }
  return terrainInfo(ground).walk;
}

/** Cover bonus: from cover if present and non-zero, otherwise from ground. */
export function coverBonus(ground, coverType){
  if (coverType) {
    const cc = terrainInfo(coverType).cover;
    if (cc) return cc;
  }
  return terrainInfo(ground).cover || 0;
}

/** Terrain name: cover name if present, otherwise ground name. */
export function terrainName(ground, coverType){
  if (coverType) return terrainInfo(coverType).name;
  return terrainInfo(ground).name;
}

/** Transparency/LOS: cover can block LOS even if ground is transparent. */
export function isTransparent(ground, coverType){
  if (coverType) {
    const ci = terrainInfo(coverType);
    if (ci.transparent === false) return false;
    if (ci.transparent === true) return true;
    if (!ci.walk) return false;
  }
  const gi = terrainInfo(ground);
  if (gi.transparent === false) return false;
  if (gi.transparent === true) return true;
  return gi.walk;
}

// ==================== DEFAULT GROUND FOR COVER TYPES ====================
// When legacy code placed e.g. T.FOREST as a single tile, it was
// implicitly "plains ground + forest cover". This map defines what
// ground each cover type gets by default.
const DEFAULT_GROUND_FOR_COVER = {
  [T.FOREST]:     T.PLAINS,
  [T.MUSHFOREST]:  T.CAVE,
  [T.WHEAT]:       T.PLAINS,
  [T.TOWN]:        T.PLAINS,
  [T.CASTLE]:      T.PLAINS,
  [T.BLACKSPIRE]:  T.PLAINS,
  [T.STAIRS_DOWN]: T.STONE,
  [T.STAIRS_UP]:   T.STONE,
  [T.SIGN]:        T.PLAINS,
  [T.CHEST]:       T.PLAINS,
  [T.BOOK]:        T.PLAINS,
  [T.GATE]:        T.PLAINS,
  [T.NPC]:         T.PLAINS,
  [T.HOUSE]:       T.PLAINS,
  [T.SHOP]:        T.PLAINS,
  [T.INN]:         T.PLAINS,
  [T.WELL]:        T.PLAINS,
  [T.FARM]:        T.PLAINS,
  [T.THRONE]:      T.CAVE,
  [T.RUIN_WALL]:   T.RUIN_FLOOR,
  [T.WELL_TL]:     T.PLAINS,
  [T.WELL_TR]:     T.PLAINS,
  [T.WELL_BL]:     T.PLAINS,
  [T.WELL_BR]:     T.PLAINS,
  [T.BARREL]:      T.PLAINS,
  [T.CRATE]:       T.PLAINS,
  [T.LAMP_POST]:   T.PLAINS,
  [T.SHOPKEEPER]:  T.SHOP_INSIDE,
  [T.FOUNTAIN]:    T.PLAINS,
  [T.HOUSE_LG]:    T.PLAINS,
  [T.RUIN_PILLAR]: T.PLAINS,
  [T.BOULDER]:     T.STONE,
  [T.ROCK_OUTCROP]:T.STONE,
};

export function defaultGroundFor(coverType){
  return DEFAULT_GROUND_FOR_COVER[coverType] || T.PLAINS;
}
