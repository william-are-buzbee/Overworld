# Todo

Prompt queue and task tracker. Check things off as they're done.

## Completed
- [x] Fix staircase transitions (underground entrance matches surface exit)
- [x] Underground grids match surface size (112x112)
- [x] Fix playableRadius for larger grid
- [x] Pocket boundary system (multiple entrances per underground layer)
- [x] Day/night cycle (turn-based, visual tint, surface only)
- [x] Separate terrain into ground + cover
- [x] Atmosphere fields driving biome generation
- [x] Biome target map system
- [x] Structure placement system
- [x] Split world-gen.js into focused modules-
- [x] Remove enemy movement blocking + remove disengage check
- [x] Hare passivity fix
- [x] Water-locked aquatic AI
- [x] Mushroom swarm ambush overhaul
- [x] Remove scattered trees tile type, use regular forest cover with probability gradient
- [x] Save system (localStorage, auto-save after every action, version number in save data)
- [x] Fix surface stone/cave terrain visual (should look like rocky ground)
- [x] Re-establish biome layout functionality (can use target map to generate any biome combinations in a 16 x 16 grid with natural blending)
- [x] Make world size fully configurable (audit all hardcoded positions/distances)
- [x] Structure/landmark system using coordinates

## Up Next
- [ ] Implement "blend" variable for each biome on the target map to allow for more control 

## Near-Term Plans
- [ ] Create ability to generate dozens of underground levels (that are properly connected by entrances) 
- [ ] Update biomes to be more visually coherent (redrawing map over and over until I like it)

## Long-Term Plans
- [ ] Ecological overhaul (create environments, then creatures, then a dynamic ecology based on in-universe "evolution" through mutation)
- [ ] Historical record overhaul (canon events across history, inventions, demigod interventions, factions, major events, wars, etc)
- [ ] AI overhaul (INT based detection, creatures use stealth to hide or ambush, complex personality for each individual creature)
- [ ] World editing (base building, tree cutting, ore mining, wall destroying, village creating, etc)
- [ ] Follower system (unclear if pet system, follower system or more of a niche possibility) 
- [ ] Online interactivity (ability to share worlds and upload them, spectate, view/enter leaderboards, chat with other players/spectators, shared saves, etc)

## Prompt Reference
For new chats, include:
- Only the files that touch the system being changed
- Key utility signatures (worldDims returns array, getFeature returns by reference, etc.)
- Known bugs and what causes them
- What NOT to change

Typical file sets:
- **Biome/terrain work:** surface-gen.js, constants.js, terrain.js
- **Enemy AI:** enemy-ai.js, monsters.js, combat.js, terrain.js
- **Movement/combat:** player-actions.js, combat.js, enemy-ai.js, state.js
- **Transitions:** world-gen.js, interactions.js, state.js, world-state.js
- **Rendering:** rendering.js, sprites.js, terrain.js, constants.js
- **Spawning:** world-logic.js, monsters.js, surface-gen.js or underground-gen.js
- **FOV/vision:** fov.js, player.js, rendering.js, terrain.js, time-cycle.js, state.js
- **Facing/turning:** player-actions.js, enemy-ai.js, fov.js, main.js, state.js
- **Underground:** underground-gen.js, world-gen.js, constants.js, terrain.js
- **Shops/economy:** interactions.js, items.js, player.js, ui.js, modal.js, constants.js
- **NPCs/structures:** world-logic.js, surface-gen.js, constants.js, interactions.js, terrain.js, sprites.js
- **Chargen/attributes:** chargen.js, player.js, constants.js, main.js, index.html, state.js
- **UI/layout:** index.html, ui.js, main.js, rendering.js, constants.js
- **Save/load:** save-load.js, state.js, chargen.js, interactions.js
- **Input/controls:** main.js, player-actions.js, constants.js
