Design Decisions
This doc is full of design decisions. One liners that describe how the game is supposed to run. So, if it says here that underground layers are the same size as above ground layers, that is intended and should exist in the game. If it doesn't, it belongs on the todo list.
Architecture
All layer transitions (stairs) go through teleportPlayer. No direct player.layer = X assignments.
activateLayer() must be called on every layer transition.
worldDims() returns [w, h] as an array, not {w, h}.
getFeature() returns by reference — mutations persist.
World-gen is split into world-gen.js (coordination), surface-gen.js, underground-gen.js.
town-gen.js was removed. Towns are surface-level structures, not separate layers.
World Size
Underground grids match surface dimensions. W_UNDER = W_SURF.
Everything should be resolution-independent. No hardcoded sizes anywhere outside constants.js.
Changing W_SURF/H_SURF in constants.js should scale the entire game. All positions are proportional or derived from these constants.
VIEW_W and VIEW_H in constants.js control how many tiles are visible. Canvas dimensions derive from VIEW_W * TILE and VIEW_H * TILE — no hardcoded canvas size in HTML.
TILE size is configurable in constants.js (currently 48).
Terrain System
Terrain is split into ground + cover. Every tile has a ground type and an optional cover type.
Ground: the floor (grass, dirt, sand, rock, water, deep_water, mud, fungal_grass, cave_floor, cave_wall, beach, etc). Every tile has one.
Cover: what sits on the ground (trees, mushrooms, stairs, buildings, walls, barrels, etc). Can be null.
Walkability: cover overrides ground. Non-walkable cover (barrel, wall) blocks movement regardless of ground.
Cover bonus for combat comes from cover if present, otherwise ground.
Trees are a single cover type. Forest density is controlled by the biome density parameter.
Each ground type has an allowedCover list. Cover cannot spawn on ground types that don't allow it (e.g. no trees on water, no mushrooms on sand).
Ground Type Vocabulary
Surface ground types: grass, dirt, sand, rock, water, deep_water, mud, fungal_grass, beach.
Underground ground types: cave_floor (walkable), cave_wall (impassable, renders pitch black).
Mountains do not exist as a cover type or biome. The "stone" biome uses rock ground.
The name "stone" is not used as a terrain key anywhere. Surface rocky ground = rock. Underground walls = cave_wall.
Biome Generation
Surface biomes are driven by a biome target map in constants.js. The target map is the single source of truth for biome identity. No atmosphere fields (moisture, elevation, fungal) are used for biome selection.
Each target map cell is an object with three values:

biome: what this place is (forest, desert, plains, rock, ocean, wetland, fungal, shallows, etc)
density: how much cover the biome produces (0.0 to 1.0). Controls tree probability in forest, mushroom density in fungal, etc. Only affects cover, never ground types.
blend: how far this cell's ground palette reaches into neighboring cells (0.0 = hard edge, 1.0 = maximum blending). Each cell controls its own side of the boundary. Noise coherence (feature size in blend zones) scales with the blend value — no global noise constant.

Each biome defines a ground palette — weighted ground type probabilities. Blending interpolates palettes between adjacent cells. Noise determines which ground type wins at each tile, producing organic blobs and patches rather than scattered dots.
The biome target map grid size is configurable via BIOME_GRID_W and BIOME_GRID_H constants.
Density has no meaningful effect on water biomes since water has no allowed cover types.
Landmarks and Structures
Structures are placed via a landmarks list in constants.js. Each landmark specifies a structure type and an array of target map cell coordinates it occupies:
{ type: 'village', cells: [{x:6, y:4}, {x:7, y:4}, {x:6, y:5}, {x:7, y:5}] }
During surface generation, after biome ground and cover are placed but before monster spawning, landmarks are stamped into the world. The landmark system clears existing cover in its footprint and places its own tiles.
Single-cell landmarks: shrines, ruins, wells, camps.
Multi-cell landmarks: villages, settlements, fortifications.
Starting Town (Millhaven)
Millhaven is built directly on the surface grid at the center of the map as wall cover tiles. No layer transitions for towns.
The player spawns inside the town.
Shops are rooms within the town walls. Each shop has a keeper NPC with a data-driven profile:

sellInventory, buyCategories, buyPriceMod, sellPriceMod, bonusBuyTags, keeper mercantile skill.
Adding a new shop = adding a new profile and placing it in a room.
Current shops: Inn (food, rest), Smith (weapons), Leatherworker (armor), Scholar (skill books).
Fill-up button at food shops buys enough to max hunger at consistent per-unit pricing.

Villages
Villages are multi-cell landmarks placed via the landmarks list.
Contain 3-5 huts (4x4 interior, solid wall cover, single doorway).
Connected by dirt paths to a central ring with a campfire.
A dirt road leads from the ring to a well at the village edge.
NPCs inside huts are placeholder features with roles (villager, elder, hunter, herbalist, smith) for future dialogue and trade system.
Underground
Each underground floor generates as a complete level across the full grid dimensions.
The pocket system was removed. The entire floor is valid space for generation regardless of entrance positions.
Floors contain a network of chambers (small 4-6, medium 8-12, large 14-18 tile radius) connected by winding tunnels 2-3 tiles wide.
Roughly 30-40% of each floor is walkable cave_floor. The rest is cave_wall (pitch black).
Every uncarved cell is explicitly set to cave_wall. No undefined or null ground types.
Stairs up placed inside chambers. Stairs down placed far from stairs up to force traversal.
Underground always uses night vision radius regardless of surface time.
Staircase Transitions
Every staircase tile (up and down, every layer) has a feature via setFeature with {type:'stairs', dir, targetLayer, targetX, targetY}.
Surface staircase features include sourceX/sourceY.
generateLayer back-fills targetX/targetY on the parent staircase after child layer generates.
useStairs calls teleportPlayer(f.targetLayer, f.targetX, f.targetY).
FOV must be recalculated after every layer transition.
Attributes
Five attributes: STR, CON, DEX, INT, PER. Each ranges 1-10, allocated during chargen.
Single difficulty level (former "easy" values baked in as baseline). No difficulty selector.
STR: melee damage, armor piercing (blunt weapons), carry capacity, starting HP contribution.
CON: HP scaling, HP per level, rest healing, passive regen rate, poison resistance.
DEX: dodge chance, stealth effectiveness.
INT: XP gain, crit damage multiplier, shop price discounts (tiered by item category), book reading, examine screen info depth.
PER: accuracy, crit chance, vision cone depth, detection, examine screen anatomy detail.
FOV and Vision System
Player and enemies have a field of vision system.
Vision types: cone (directional, with facing) or radius (omnidirectional, no facing).
Each creature defines: visionType, coneAngle, awarenessRadius.
Cone vision: forward-facing cone of configurable angle plus a small omnidirectional awareness bubble.
PER determines cone depth: PER 1 = 3 tiles, PER 5 = 5 tiles, PER 10 = 7 tiles.
Awareness radius scales with PER: PER 1 = 1 tile, PER 5 = 2 tiles, PER 10 = 3 tiles.
Visible set = union of awareness bubble and cone tiles, subject to LOS blocking.
Species-specific cone angles:

Player/humanoid: 150°
Wolves/predators: 90° (narrow, focused)
Hares/prey: 170° (wide peripheral)
Desert predators: 100°
Crabs: radius (no cone)
Mushrooms: radius (blindsight)
Fish/eels: 110°

Trees reduce vision depth instead of blocking LOS completely. Each tree tile a sight line passes through costs extra range, scaled inversely with PER. Low PER can barely see past one tree. High PER peers deeper into forest. Walls and cave walls still block LOS completely.
Tile visibility states:

Visible: in current FOV. Rendered normally.
Seen: was visible before, not now. Rendered dimmed. Enemies not drawn.
Unexplored: never visible. Rendered black.

FOV calculated once per player action, cached in state.
Facing and Turning
All 8 directions supported: N, NE, E, SE, S, SW, W, NW. Stored as dx/dy pairs.
Turning costs a turn. If the player inputs a direction they are not facing, they rotate to face it (consuming the turn) without moving. Next input in the same direction moves normally.
Same rule applies to enemies with cone vision. Radius vision enemies are exempt — no facing, no turn cost.
Facing updates on movement and on attacking an adjacent enemy.
Resting/waiting does not change facing.
Flanking is a real tactic — enemies facing away must spend a turn rotating before they can react.
Day/Night Cycle
Turn-based. Every player action increments state.worldTick.
Full cycle = 200 ticks. Phases: dawn, day, dusk, night.
Night reduces player and enemy vision cone depth to 1 tile. Awareness radius is NOT reduced.
Underground always uses the night (1 tile) cone depth.
Dawn/dusk have intermediate reduction.
Enemies with nightVision: true take no night penalty.
Enemies with blindsight ignore light and LOS entirely.
Stealth currently dims the screen via CSS class. Night tint implementation must not conflict with it.
Shops and Economy
INT-based price discounts are tiered by item category:

Staples (food): 1% per INT above 1. Max ~9%.
Standard goods (basic weapons, armor): 2% per INT above 1.
Luxury goods (books, potions, high-end gear): 3% per INT above 1. Max ~27%.

Each item has a price category. Tiered discounts apply to both buying and selling.
Food items within the same shop have a consistent gold-per-fed ratio.
Fill-up button at food shops calculates cost to max hunger and buys in one click.
Keeper mercantile skill affects pricing per shopkeeper.
Armor System
Each armor piece has dodgePenalty and accPenalty (acc = half of dodge penalty).
These are flat subtractions from dodge chance and accuracy, not DEX reductions.
The old dexPenalty property was removed.
Light armor: 0-3% dodge penalty. Medium: 5-10%. Heavy: 12-20%.
Frost troll leather armor exists as high-end leatherworker option (heavier, better defense, cold resist property).
Combat and Movement
Enemies can't stop the player from moving if they are being attacked. Restricted movement is not a normal part of combat unless a specific enemy inflicts it.
Disengage check removed — player always moves freely.
Starvation kills: hunger stops at 0 (no negative values), player takes damage over time while starving.
Poison kills: poison damage can reduce HP to 0 and trigger death.
Attack hunger cost reduced (~40% lower than original values).
Enemy AI
Hares: always flee, never aggro, even if player kills another hare next to them. Drift toward plains/light forest.
Aquatic (fish, eels, not crabs): water-locked, can only move on water tiles, attack adjacent from water edge, give up chase if player leaves water vicinity. Spawn ONLY on water or deep_water tiles.
Crabs: amphibious, free movement on land and water. Short leash from water (5-6 tiles onto land).
Mushrooms: passive → coalescing → surround trigger (8+ within 2 tiles, doubled from original 4) → mobbing. Zero direct damage, touch-based poison only. Hard leash: never leave fungal_grass tiles. Retreat toward fungal ground if hit. Radius vision (blindsight), no facing, no turn cost.
Wolves: pack or solo. Cone vision, 90° angle. Solo wolves leash 8-10 tiles from forest. Pack wolves leash 15-20 tiles. All wolves avoid sand and rock ground (leash 0). nightVision: true.
Desert creatures: stay on sand. Leash 2-3 tiles off sand. Don't chase onto grass.
Frost wraiths: removed from spawn tables. Definition kept in monsters.js.
Biome leashing: each creature type has a leash distance — max tiles from home biome before turning back. Getting hit does NOT extend leash. Enemy fights back from wherever it is but movement pulls it home.
Biome preference is a soft drift for idle enemies, not a hard boundary that freezes AI.
Enemies use cone or radius vision with PER-based detection. Must have LOS to detect player. Stealth check gated behind vision — enemy must see the player's tile before rolling detection.
Enemy spawns reduced by 50% from original density.
Save System
localStorage-based. Auto-saves after every player action.
Version number stored in save data.
Explored tile Sets converted to arrays for JSON serialization, back to Sets on load.
FOV recalculated on save resume before first render.
Facing direction persisted in save.
Input
Movement: WASD, arrow keys, numpad (all 8 directions including numpad diagonals 1/3/7/9).
Space: wait/rest. E: eat. F: stealth. R: use/interact. N: new game confirmation. ?: help.
Click: move toward tile or attack adjacent enemy. Right-click: examine tile.
All movement inputs go through facing check — turn costs a turn if not already facing that direction.
Examine System
Right-click shows stat cards for enemies and self-inspect for the player.
Clean layout: organized sections with visual hierarchy, not a wall of text.
PER displayed as attribute alongside STR/CON/DEX/INT.
INT gates what enemy information is visible:

Any INT: name, level, HP, base attack, base defense.
INT 3+: attributes, accuracy, dodge.
INT 5+: crit, armor piercing, stealth, special abilities.
INT 7+: personality/behavior traits, leash, biome preference, night vision.
INT 9+: exact damage ranges, loot hints.
Self-inspection always shows full detail regardless of INT.
Hidden info doesn't show blank slots — the section simply doesn't appear.

Prompt Reference
Typical file sets:

Biome/terrain work: surface-gen.js, constants.js, terrain.js
Enemy AI: enemy-ai.js, monsters.js, combat.js, terrain.js
Movement/combat: player-actions.js, combat.js, enemy-ai.js, state.js
Transitions: world-gen.js, interactions.js, state.js, world-state.js
Rendering: rendering.js, sprites.js, terrain.js, constants.js
Spawning: world-logic.js, monsters.js, surface-gen.js or underground-gen.js
FOV/vision: fov.js, player.js, rendering.js, terrain.js, time-cycle.js, state.js
Facing/turning: player-actions.js, enemy-ai.js, fov.js, main.js, state.js
Underground: underground-gen.js, world-gen.js, constants.js, terrain.js
Shops/economy: interactions.js, items.js, player.js, ui.js, modal.js, constants.js
NPCs/structures: world-logic.js, surface-gen.js, constants.js, interactions.js, terrain.js, sprites.js
Chargen/attributes: chargen.js, player.js, constants.js, main.js, index.html, state.js
UI/layout: index.html, ui.js, main.js, rendering.js, constants.js
Save/load: save-load.js, state.js, chargen.js, interactions.js
Input/controls: main.js, player-actions.js, constants.js

For new chats, include:

Only the files that touch the system being changed
The three design docs (Design.md, Todo.md, Lore.md) for project context
Known bugs and what causes them
What NOT to change
