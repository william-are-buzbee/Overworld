# Todo

Prompt queue and task tracker. Check things off as they're done.

## Completed — Game Systems
- [x] Fix staircase transitions (underground entrance matches surface exit)
- [x] Underground grids match surface size (112x112)
- [x] Fix playableRadius for larger grid
- [x] Pocket boundary system (multiple entrances per underground layer)
- [x] Day/night cycle (turn-based, visual tint, surface only)
- [x] Separate terrain into ground + cover
- [x] Atmosphere fields driving biome generation
- [x] Biome target map system
- [x] Structure placement system
- [x] Split world-gen.js into focused modules
- [x] Remove enemy movement blocking + remove disengage check
- [x] Hare passivity fix
- [x] Water-locked aquatic AI
- [x] Mushroom swarm ambush overhaul
- [x] Remove scattered trees tile type, use regular forest cover with probability gradient
- [x] Save system (localStorage, auto-save after every action, version number in save data)
- [x] Fix surface stone/cave terrain visual (should look like rocky ground)
- [x] Re-establish biome layout functionality
- [x] Make world size fully configurable (audit all hardcoded positions/distances)
- [x] Structure/landmark system using coordinates
- [x] Implement "blend" variable for each biome on the target map
- [x] Added minimap system (press M key)
- [x] Removed visual grain effect and grass tile added noise
- [x] Added beach biome
- [x] Update world map until it looks good
- [x] Add a corpse/item drop system
- [x] Update UI to have no icons and use key presses to bring up info screens
- [x] Create two alien clades (clade A mammalian, clade B cephalopod, both terrestrial)
- [x] 3D body map system designed (replaces stats — weight, muscularity, connective tissue, neural mass, armor, texture, hardness, sensory organs, neural pathways)
- [x] Body maps for main ancestors of both clades (small herbivore, large herbivore, ambush predator, meso carnivore, apex carnivore)
- [x] First-pass Size & Strength system
- [x] First-pass Bleeding system (open vs closed circulatory)
- [x] First-pass Footprint system (attack area and multi-zone hits)
- [x] Physics based damage (weight, musculature, musclemass)
- [x] Death conditions (lethal zones, brain death, blood loss)
- [x] Species selection at chargen & parity
- [x] UI overlays (multi limb health, bleed counter, removal of max hp)
- [x] First-pass AI drive system (wander, flee, hunt, forage, sleep, recover)
- [x] First-pass perception/transducer system
- [x] First-pass cognitive/ganglia/nervous system
- [x] First-pass player perception/transducer visibility
- [x] Second-pass cognition/ganglia system
- [x] Second-pass perception/transducer system (chemical restructure)
- [x] Species-confidence gated rendering (blobs for unidentified creatures)
- [x] Significant optimization improvements (indexDB, active simulation radius, spatial hash grid)
- [x] Remove telepathic knowledge of environment
- [x] UI minimalism overhaul (fullscreen, flexible screen size, adjustable log, HUD scaling, zoom)
- [x] Vision cone fix (per-eye cone, binocular vs monocular, multiple eye placements)
- [x] First pass muscle fiber system (fiber type, aerobic vs anaerobic, glycogen)
- [x] Third pass cognitive system (ganglia as physical motor circuits)
- [x] Chemical sensing third pass (molecule-based, wind direction, contact vs airborne, diffusion)
- [x] Creature density scaled down for testing (~30-50 total)
- [x] Speed system overhaul (fiber data, sprint/walk, mass-dependent accel/turning)
- [x] Hare freeze behavior — two-threshold ganglion architecture
- [x] Ecological palette and tile texture update
- [x] Ambient brightness dip rendering
- [x] Canvas-rendered title screen
- [x] Detection performance optimization
- [x] Palette revert to pre-overhaul working values

## Completed — Planet Viewer & Generation Pipeline
- [x] Three-layer color pipeline designed and locked (material × star × adaptation; superseded 30 Sep 2026 by the spectral pipeline, Spectral-Color-Design.md)
- [x] Pipeline palette applied to game (11 BIOME entries updated)
- [x] Chemotrophic sprite redesign (colony mound, mineral crust)
- [x] Water tile texture redesign (amber wave crests)
- [x] Sprite variant library (GRASS V2-V4, WATER V2-V5, DEEP_WATER V2-V3)
- [x] Standalone planet generator/viewer (plates, elevation, minerals, atmosphere, flora, globe/flat/Mollweide, regional detail, tuning panel)
- [x] Weather/wind system (atmospheric circulation, topographic deflection, trade winds/westerlies/ITCZ)
- [x] Ocean current system (wind-driven, Coriolis, SST advection, upwelling)
- [x] Precipitation model (moisture advection, orographic, convergence, convective, iterative solver)
- [x] Humid planet corrections (1.2 atm, SST floor 0.50, softer rain shadows, moisture diffusion)
- [x] Groundwater model (coastal proximity, precip recharge, geothermal upwelling, elevation penalty)
- [x] Drainage accumulation (flow accumulation, log-scaled drainage bonus)
- [x] Water availability metric (precip × 0.7 + gw × 0.3 + drainage)
- [x] Substrate grain size system (slope, elevation, drainage, coastal type, volcanism → 0-1)
- [x] Water table depth model (elevation, precip, geothermal, drainage, coastal pull, basin ponding)
- [x] Saturation from water table (capillary fringe, grain size interaction)
- [x] Physical terrain derivation (substrate × saturation × flora → terrain type)
- [x] Regional drainage network (Phase A — structured noise, flow accumulation, zone classification)
- [x] Tile detail view (Phase B — chunk generator prototype, drainage at tile scale)
- [x] Per-tile palette computation (computeTilePalette — material colors through three-layer pipeline)
- [x] High-resolution planetary surface (configurable 1×-8×, atmospheric sim at 512×256)
- [x] Planet viewer pipeline rewrite (unified typed arrays, one deriveTerrainAndCover, one computeTilePalette)
- [x] Flora type palette differentiation (livingCoverColor by floraType — photo=crimson, chemo=mineral, mixo=blend)
- [x] MUD palette flora blending (livingCoverColor × groundCover)
- [x] Tile body map spec designed
- [x] Drainage chunk generator designed
- [x] palette-compute.js standalone module
- [x] sprite-select.js standalone module (physical state → variant indices)

## Completed — Planet Viewer Visual Polish (Session 18)
- [x] Shallow water terrain threshold (SHALLOW_WATER_TERRAIN_THRESHOLD = 0.05m — land tiles with < 5cm water keep ground terrain type with wet film, not blue water)
- [x] Regional surface overlay fix (uses cell.terrainType instead of cell.isLand for ocean detection — fixes coastal cells inside "land" planetary cells)
- [x] Shallow ocean depth classification (tiles 0-25cm below sea level get TT_WATER with bottom visibility; >25cm get TT_DEEP_WATER — coastal gradient matches regional view)
- [x] Cross-chunk continuity via border margin (576×576 padded grid, crop to 512×512 — flow accumulation, water bodies, tree placement all respect neighbors)
- [x] Tile position marker on regional map (white box shows which cell the tile view displays, updates on Shift+arrow)
- [x] Chunk cache (Map keyed by "rx,ry", instant revisit, clears on regional regeneration)
- [x] Regional pan closes tile view cleanly
- [x] Checkerboard elimination (blend zone 2-10cm with smoothstep, terrain classification stays binary, guard excludes water/deep_water tiles)
- [x] Square contour elimination (domain warp on bilinear interpolation — noise2D displaces sampling coordinates 12%, elevation excluded from warp)
- [x] Tooltip overhaul (water depth in cm/m, ocean label for negative elevation, flora hidden when barren, substrate grouped, sprites condensed)

## Completed — Planet Viewer Ecology & Drainage (Session 19)
- [x] Conservative moisture advection fix (non-conservative scheme caused exponential moisture blowup; added explicit outgoing subtraction, doubled transfer coefficient 0.06→0.12)
- [x] Anisotropic drainage noise in regional elevation (slope-aligned noise creates organized ridge-channel topography; coast BFS + slope blending for drainage direction)
- [x] Standing water threshold re-tuning for wet planet (area 12→20, depth 0.02→0.04, channel sat 0.6→0.85)
- [x] Canopy restoration on lowland (resolved by standing water fix — flora formula now runs, produces 40-80% canopy)
- [x] Planetary-scale geography audit — archipelago shapes confirmed, coastline complexity excellent, flora distributions plausible

## Up Next — Geography Tuning & Feature Vocabulary

**This is the immediate next session.** Use Seed 5 at Very High (2048×1024) as the canonical planet. The core physics pipeline is working. The goal is to refine output quality and identify missing features.

### Priority 1: Verify Tuning Prompts Applied
- [ ] Interior drainage tuning — isotropic noise reduction for lowland (×0.4), anisotropic amplitude increase (0.014→0.018)
- [ ] Precipitation gradient widening — bgPrecipRate 0.03→0.045, moistureDiffusion 0.06→0.08
- [ ] If not applied, apply them. Verify: precip overlay shows windward/leeward contrast, interior drainage organized

### Priority 2: Volcanic Island Deep Audit
- [ ] Navigate to mid-ocean arc island, check: central ridge, radial drainage, rain shadow, mineral zones, complex coastline
- [ ] Tile view cross-section of volcanic island — does it read as a real place?

### Priority 3: Remaining Planetary Audit Items
- [ ] Climate zones — rain shadows visible on surface overlay?
- [ ] Mineral distributions — Fe volcanic, Cu hydrothermal, Mn sedimentary?
- [ ] Any obviously wrong zones?

### Priority 4: Feature Vocabulary (identify what's missing at tile level)
- [ ] Rock outcrops on ridges/cliffs
- [ ] Springs where groundwater meets surface
- [ ] Tidal pools in coastal zones
- [ ] Colony mounds (Ecology Foundations — termite mound analogue)
- [ ] Volcanic features near plate boundaries
- [ ] Beach/dune formations

### Priority 5: Further Precipitation Tuning
- [ ] If rain shadows still too subtle after bgPrecipRate bump, iterate further
- [ ] Target: windward deep crimson, leeward visibly lighter/drier

## Up Next — Direction (Oct 2026)
See `Direction.md`. Brainstorm-grade; nothing here is to be built until the person picks it up.
- [x] Write down the direction: the mutagen organ, unexplained never unpaid, the ecology as commons, muties as base + edits, communication by channel, starts with capacities
- [ ] Reconcile `Mutation-Design.md` with the organ as surplus spent on edits
- [ ] Decide `Lore.md`'s demigod against the demigod as apex of the energy flow
- [ ] Settle the open questions in `Direction.md` (inheritance, edits and their costs, sapient minds, length of a life, what ends a run)

## Up Next — Game Integration (after geography pass)
- [ ] Sprite variants and selector completion (Piece 2 from tile body map spec — ~30 sprite patterns, variant selection from physical state)
- [ ] Rendering integration (Piece 3 — wire per-tile palette and variant into game renderer, replace biome-lookup palettes)
- [ ] Retire palette-compute.js: tile palettes from `spectra.js` (visible materials × light × the player's eye); the viewer takes a copy of `spectra.js`
- [ ] Chunk loading system (Phase C — generate on demand, cache in IndexedDB, predictive loading)
- [ ] Full game integration (Phase D — replace BIOME_TARGET with planetary chunk generator, creature spawning, save migration)
- [ ] Scale mapping fix for game (tile = 2m, chunk = 1km, proper context sampling across ~7 regional cells — deferred from viewer, needed for game)

## Up Next — Perception honesty (Sep 2026)
Perception as inference from received signal, not truth with error bars. Decisions: systematic error only; the player is not exempt and the display lies (single perceived tile, perceived species); wired templates for co-occurring species first, learning later; retune after. One pull request per pass. See Sensory-Design "Perception honesty".
- [x] 1. Groundwork: persistence-needs-tissue principle, Motor doc clade fix; vision sets isMoving; visible wounds from the eyes only; hare ganglia read only their wired inputs and die with their zone; prey chosen from perception
- [x] 2. Parity: NPC sightlines charged per eye through trees (NPC smell from the scent field moved to pass 6: the field is anonymous molecules, so reading it needs percepts that point at no entity)
- [x] 3. Intensity recruits force (Motor step 4, part): a creep is physically slower than a walk (2.5× the time per step); action cap 3 → 8 so fast creatures are not clipped
- [x] 4. Motion as velocity: angular and looming components per observer, looming into the threat template; self-noise (own footfalls raise own vibration floor). Own speed blurring own eyes deferred: needs background optic flow
- [x] 5. Percept plumbing: every AI consumer reads a percept (perceived position, size, identity), not the entity; percept = truth at first; the display draws from percepts
- [x] 6. Received-signal inference: size-distance confound per channel (resolved by the signal's structure as SNR rises, own body as the yardstick below it), binocular parallax as a distance cue, bearing resolution per channel; percepts and display at the perceived tile; strikes at a misplaced percept hit air
- [x] 6b-1. NPCs read ground trails: per-step deposits, nose-down reading of the tiles around, hungry predators follow the freshest herbivore trail; the hare's threat region matches intense meat-eater volatiles underfoot to fear
- [x] 6b-2. Airborne plumes replace the per-animal smell sphere: field calibrated (cleanup floor under the best nose, dilution 0.93, dormant creatures silent); anonymous plume percepts with own-odour adaptation (Weber); wind bearing from air-flow transducers; surge upwind / cast across the wind; near-field localisation within a tile; odour bound to a seen animal only where integration and chemical processing share a zone
- [x] 7. Identification by body-map features against wired templates (mass, locomotion limbs, integument, volatile mix; margin confidence); recognised species sets the size prior and brings its diet; display and examine show the perceived species
- [x] 8. Persistence held in tissue: traces (last-known position) held for integrationCapacity × PERSISTENCE_SCALE turns, contact traces, evidence summation sqrt(1 + turns held); goal persistence and threat memory run on traces; predators go to where the prey was
- [ ] 9. Head facing separate from heading (orienting response)
- [x] Multi-seed ecology harness (`tools/ecology.mjs`): behaviour and deaths as mean ± sd across seeds, for before/after comparisons
- [x] Harness names killers and fights (who landed the last blow; who opened each fight, doing what, and how it ended)
- [x] Rule 3: "cornered" is physical (no step away from the threat), not "no refuge" (the harness showed predators near home opening fatal fights with passing crabs)
- [x] Hunt funnel in the harness (`js/hunt-funnel.js`): per predator–animal pair, episodes from detection to kill, why each ended, what the predator did instead, strikes and damage; hunger, trail bouts, body speed, the active radius. Instrumentation only
- [ ] Predators rarely finish a kill (funnel findings; the person decided, one pull request each):
  - [x] Rule 4: brace only against a source that moves or closes, not a still one, not recognised kin
  - [x] Fast-twitch fuel per kg of muscle (`SUBSTRATE_PER_KG_MUSCLE` 5 → 0.5, derived in `initBodyMap`, Muscle-Fiber-Design): a hare's sprint ~100 → ~10 actions
  - [ ] Stalking gait chosen in integration tissue (approach intensity)
  - [x] Detours round obstacles: pathfinding as a marked placeholder for route memory (`stepRoundObstacles`)
  - [x] Contact geometry replaces the `rollHit` dice (aim at the percept; getting clear needs senses, room and a faster body, and burns sprint fuel)
  - [ ] Longer harness runs for natural predation (hunger rises slowly)
- [ ] Retune behaviour once 1–8 land (against the harness and the person's preview impressions)

## Up Next — Nervous systems from structure types (Sep 2026)
The ecology is left unbalanced while the systems are built; the harness checks for regressions and for systems not doing what their doc says, not for kill counts. See Neural-Architecture-Design.
- [x] 1. Neural-Architecture-Design: the node, circuit recipes, memory as writers and stores, the hub and the player
- [x] 2. Node runner; the hare ported onto it (`nodes.js`, `wiring.js`; 22 of 8,956 actions differ, all the per-source bolt veto)
- [x] 3. Glands and hunger: `creature.hormones` {alarm, hunger, fatigue} replaces `creature.drives` and `stressLevel`; gland nodes release, receptors read
- [x] 3b. Gland stores: a gland releases what it holds and refills by synthesis (the hare no longer ratchets alarm on its own flight)
- [x] 4. Maps: bearing and distance bands, holding, prediction; the hare's threat template per distance band
- [x] 5a. The hub: the player plays it; reach, graded inhibition and the race; reflexes it cannot hold take the body, and the log says so; the body screen (B) read off the wiring
- [x] 5b. Plastic hub weights (grown by coincidence, saved with the body; a late wire never grows); the hub's mass as its limit per action (its firing split across what it engages)
- [x] 6. The wolf wired on the system; its reactive rules retired (the prowler player plays it through the hub)
- [x] 7. The whole cast rewired (ravager, lurker, shaleback, colony; the hare on acts); the reactive rules gone
- [ ] Then memory: writers and stores saved with the body, one animal, then the cast
  - [x] M1. Stores (pattern, route), writers (patterns, associations, ground), `memory:` inputs; saved with the body; damage reads off the wiring
  - [x] M2. The wolf remembers: a pattern library, danger associations (food waits for the sequence writer), a route store replacing the true-ground detour
  - [x] M3. The cast remembers (hare fore limbs: danger and habituation; lurker sensor limbs; shaleback head)
- [ ] Colony (chemotroph) and the purple biome are placeholders: remove in a later pass, keep the docs (the person, Sep 2026); spend no work on them

## Up Next — Spectral colour (Sep 2026)
Colour as spectra: reflectance × light × one eye's receptors; the screen is the only convention. See Spectral-Color-Design. One pull request per pass.
- [x] 1. Canon: `js/spectra.js` (chromophores, Kubelka–Munk materials, star and atmosphere, canopy, water, opsin template, receptor-noise contrast, the display convention calibrated against human colorimetry), `tools/spectra.mjs`, `Utils/spectra.html`; replaces the three-layer doc; texture profiles moved to Material-Textures
- [x] The person decided (30 Sep 2026): receptor sets as proposed; the screen draws the player's eye; star stays 4800 K; a realistic night; "warm-toned, dim" dropped
- [x] 2. Eyes into the body maps (cones, rods, lens, aperture, focal length, receptor width, integration time, tapetum); a moonless night sky (starlight and airglow) seen by rods
- [ ] The person decides: a moon (phase-cycled bright nights) or none
- [ ] 3. Integument as material per zone; detection contrast from `contrast()` (retire hue strings, `TERRAIN_VISUAL`, `HUE_MISMATCH_PENALTY`, the bleed bonus); harness before and after
- [ ] 4. Light from the sky: star elevation from the day cycle, canopy and shadow per tile, adaptation held in the eye with a time course
- [ ] 5. Renderer draws tiles and creatures through `screenColor` (with the tile body map); `palette-compute.js` retires
- [ ] 6. Planet viewer takes a copy of `spectra.js`

## Near-Term Plans (no particular order)
- [ ] Habituation (Sensory-Design, gain control and adaptation): a source that stays in the senses without closing stops registering as new. (The hare's familiar-and-harmless memory, memory step 3, does some of this through memory; sensory adaptation itself is still open)
- [ ] 32×32 directional sprites (8 facings per creature, mass-proportional footprints)
- [ ] Second-pass over bleed/metabolism/healing
- [ ] Fourth-pass over cognition/ganglia (actual pattern libraries/memory)
- [x] NPC scent tracking AI (plume following, trail following, search patterns) — trails (perception 6b-1), plumes with surge and cast (6b-2)
- [ ] Vibration ambient grounding (substrate-aware propagation)
- [x] NPC vision update (per-eye body map computation) — cone test derives from body-map eyes; range still max-acuity
- [ ] Creature 5 (colonial chemotroph) redesign
- [ ] Legacy creature name cleanup (wolf→prowler, dire_wolf→ravager, cave_crab→shaleBack, etc.)
- [ ] Legacy elemental damage and name cleanup
- [ ] Restore ecological creature density after detection optimization
- [ ] Chemical workspace / scent gradient system
- [x] Player movement intensity expansion (creep/stalk mode) — F key creeps, footfalls scale with gait; a creep step costs 2.5× a walk's time (perception pass 3)
- [ ] Visual rethinking (16x16 palettes as color reference for 32x32 sprites)
- [ ] Visual customization (settings menu with texture/resource pack option)

## Long-Term Plans
- [ ] Immune/infection mechanics (needs metabolism first)
- [ ] Gut/Digestion/gut microbiome
- [ ] Aquatic Ecosystems
- [ ] Sub-terranian ecosystem
- [ ] AI overhaul (complex creature behavior based on instincts, body plan and evolutionary principles)
- [ ] Energy-budget ecosystem (photosynthetic productivity → herbivore carrying capacity → predator capacity)
- [ ] Regional mineral zones on surface (trunk color variation by local soil chemistry)
- [ ] Visual detection pass 2 (per-zone integument, countershading, disruptive coloration)
- [ ] Visual detection pass 3 (atmospheric modifiers — moisture, rain, fog)
- [ ] Visual detection pass 4 (polarization for Clade B, bioluminescence; spectral sensitivity is the spectral colour work below)

## Very Long-Term Plans
- [ ] Lore overhaul (canon events, inventions, demigod interventions, factions, wars)
- [ ] "Modernity" as a concept (religion, trade, communication, complex sapience)
- [ ] World editing (base building, tree cutting, ore mining, wall destroying, village creating)
- [ ] Follower system
- [ ] Online interactivity (share worlds, spectate, leaderboards, chat, shared saves)
- [ ] 3D rendering of the 2d gameworld

## Prompt Reference

For new chats, include:
- Only the files that touch the system being changed
- Design-Principles.md (always — describes HOW systems must be built)
- Ecology-Foundations.md (always for planet/ecology work)
- The most recent session handoff document

### Key Documents by Topic

**Planet generation & viewer:** planet-viewer.html, drainage-chunk-generator-design.md, Spectral-Color-Design.md, session-handoff-precipitation-drainage.md
**Tile rendering:** tile-body-map-spec.md, Spectral-Color-Design.md, Material-Textures.md, spectra.js, sprite-select.js, sprites.js
**Creature systems:** Body-Sim-Design, Surface-Creatures, Cognition-Design, Sensory-Design, Muscle-Fiber-Design, Motor-System-Design, Endocrine-Design
**Ecology:** Ecology-Foundations, Underground-Chemotrophic-Ecology

### Known Gotchas

- **One terrain function, one palette function.** `deriveTerrainAndCover` and `computeTilePalette` are the ONLY functions that assign terrain types or compose tile palettes, and colours come only from `spectra.js`. Never write a second version.

- **Inheritance, not recomputation.** Each zoom level reads from the level above. Regional inherits from planetary. Tile inherits from regional. Local drainage only ADDS wetness. Never recompute saturation, groundCover, or waterTableDepth from scratch at a lower level.

- **livingCoverColor depends on floraType.** Photosynthetic → crimson. Chemotrophic → mineral-tinted. Mixotrophic → blend. Computed at top of computeTilePalette, used in every terrain branch.

- **MUD is the dominant terrain.** ~80% of lowland tiles. MUD palette blends livingCoverColor by groundCover × 0.7.

- **One colour pipeline: `js/spectra.js`.** A colour is a reflectance spectrum (what the material is made of) × the light on it × one eye's receptors; only the screen step is a convention. Author materials as compositions, never screen colours. Overworld is the canon; the planet viewer is to carry a verbatim copy.

- **palette-compute.js is superseded** by `spectra.js` and is still the viewer's three-layer palette; it retires with rendering integration.

- **Shallow water threshold (0.05m) applies to LAND only.** Ocean tiles (negative elevation) are classified by depth: >25cm = deep_water, ≤25cm = water with bottom visibility. The blend zone (2-10cm) only activates for ground terrain types.

- **Domain warp excludes elevation.** Context properties (flora, minerals, saturation) use warped coordinates for organic boundaries. Elevation uses raw coordinates so drainage stays locked to topography.

- **Scale mismatch (viewer only, not blocking).** Regional cells are 152m in the viewer. Design doc says 1km. Noise tuning makes it LOOK right at ~1km. Will be fixed properly for game integration.

- **Chemotrophic organisms are geological.** Mounds, brackets, crusts, spires — not trees or mushrooms.

- **Planet viewer is the data source.** The game's chunk generator reads from the planetary grid. If the viewer's physics is wrong, the game world is wrong.

- **Moisture advection is now conservative.** Session 19 fixed the non-conservative scheme. The advection transfer coefficient is 0.12 (was 0.06). Don't revert to the old scheme.

- **Anisotropic noise uses coast BFS + slope blending.** The drainage direction field in generateRegionalDetailHiRes uses BFS from ocean cells for flat terrain and wide-window slope gradient for steep terrain, blended by slope magnitude. Both sub-passes must run before noise is applied.
