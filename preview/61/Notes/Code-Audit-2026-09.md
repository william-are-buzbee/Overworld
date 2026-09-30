# Overworld Code Audit — September 2026

First full read of the codebase. Scope: every file under `js/`, `index.html`, `style.css`, `Utils/planet-viewer.html`, and all of `Notes/`. Method: static import-graph analysis, ESM syntax check of all 62 modules, a headless-browser smoke test (boot, new game, 60 inputs, save, reload, resume), and seven parallel read-through audits by subsystem. Every finding below has a `file:line` and was spot-verified.

This is a diagnosis, not a fix. Nothing in the repo was changed except adding this file and one correction to `CLAUDE.md` (see §7).

**Relation to `CLAUDE.md`.** The audit was written before `CLAUDE.md` landed and was revised against it. The two agree on the core rule and on what the game is. Three places where `CLAUDE.md` changes the audit's advice: the implementation path is restated as one pull request per pass (§5); Phase 0 no longer proposes a `package.json` or any dependency (§5); and the planet-viewer findings are flagged as applying to the `Utils/` copy, which `CLAUDE.md` says is a snapshot of a separate project (§2 F58, §5 Phase 5). One place where the audit corrects `CLAUDE.md`: its module table lists `castle.js` and `dialogue.js` as if live; nothing imports them (§7).

---

## 1. What the game is, as built

### Shape

A single-page browser roguelike. No build step, no package.json, no tests. 62 ES modules (~22k lines) loaded from `index.html` → `js/main.js`. World is a 224×224 tile grid per layer, two layers generated at start (surface + one underground). Turn-based: every player action runs `endPlayerTurn` (`js/turn-loop.js:249`), which advances world ticks, runs physiology, runs every active creature's AI on an action-point budget, then recomputes FOV, scent, player perception, renders, and autosaves to IndexedDB.

### The three generations of code living together

The codebase is a fantasy roguelike that was converted, prompt by prompt, into an alien ecology sim. All three generations are present and entangled:

| Generation | What it is | Status |
|---|---|---|
| **Fantasy RPG** (towns, shops, gold, XP/levels, potions, books, castles, knights, goblins, NPC dialogue, weapons/armor, elemental damage types) | The original game | Mostly dead code (~1,100 lines never called), but a **numerically load-bearing residue** survives in combat and player vitals |
| **Seven-stat creature model** (`siz, strength, chem, vib, vis, central, distributed` hardcoded per species in the `MON` table, `monsters.js:11-242`) | First ecology pass | Still feeds dodge, accuracy, crit, stealth, carry capacity, the player HP pool, and bleed messages |
| **Body-map physics** (`BODY_MAPS`, zones with tissue masses, muscle fiber/substrate, blood volume, transducers, ganglia) | The actual design | Live and the best code in the repo, but sits on top of the other two rather than having replaced them |

### How the body-map system works (the good part)

Each species is an array of zones (`body-maps.js:184-773`). A zone has tissue masses in kg (`muscle, structural, neural, sensory, connective`, verified to sum to zone mass for all five living species), transducers, exposure arcs, locomotion/vital flags, attacks, and on locomotion zones a `fiberRatio` plus a glycogen-like `substrate` pool. `initBodyMap` deep-copies the template, sets `maxHp = mass × 5`, and derives `totalMass`, `bloodMax = 7% of mass`, per-zone blood share.

- **Damage** is physics: `muscle × hpFrac × 4 × (1 + mass × hpFrac × 0.15) × (0.6 + structFrac × 1.5) × (1 − bleedPenalty)` (`combat-constants.js:18-35`), resolved through attack direction → exposed zones → footprint contact → mass-share split → structural armor → zone HP.
- **Speed** is force-to-weight: `Σ(slowMass × circEff + fastMass × substrateFrac) / totalMass` (`physiology.js:36-88`). Sprinting drains substrate; substrate regenerates by circulation type.
- **Death** is vital zone destroyed, or remaining neural mass < 35% of original, or blood ≤ 10% of max. Wounded zones seep blood proportional to connective tissue until clotting builds.
- **Perception** is per-zone for chemical and vibration: range = `∛(emission) × quality × coeff`, SNR = range/distance, then size/species/diet/condition confidence ramps from SNR (`detection.js:103-130, 566`). Visual is *not* per-zone (max acuity over zones).
- **Scent** is a real field: per-layer maps of 8 molecular classes, ground deposit + decay by terrain, airborne advected by a global wind vector and diffused (`scent.js`).
- **Cognition**: only the hare has a physical neural architecture (`CREATURE_NEURAL.hare`, `body-maps.js:910-1038`). Its ganglia have stress-scaled thresholds, a bolt reflex, and threat/food templates that resolve into an output `{intensity, direction, type}`. **Every other creature runs `evaluateReactiveRules`** (`cognition.js:146-389`), the nine-priority-rule placeholder that Design-Principles.md names as the largest placeholder. Ganglion output is then mapped *back* into behavior labels (`ai.js:104-166`) and executed by the same label-driven `executeAction` switch the reactive creatures use. There is no motor layer.
- **Endocrine**: absent. One scalar `stressLevel` per creature, uniform threshold depression.

### World generation

Hand-authored 16×16 `BIOME_TARGET` (`ecology-data.js:104-121`) is bilinearly blown up to 224×224 with noise, producing ground + cover layers and three `ATMOSPHERE` float arrays. Underground is chambers + MST tunnels + cellular automata. All generation uses the seeded RNG; the seed itself is `Math.random()`. **Nothing reads planet-viewer output.** The viewer is a separate 8,425-line single-script file with its own copies of the RNG, noise, palette and sprite-variant code, and no export.

### Smoke test result

Boots clean, no runtime errors, no console errors beyond a font CDN cert issue specific to my sandbox. Species select → play works. 60 inputs at ~6–10 ms per turn with spikes to ~45 ms. Save → reload → CONTINUE round-trips position and body map. Spawned population: 166 creatures on the surface, of which **103 are chemotrophs** (Todo says density was scaled to ~30–50). Underground: **zero creatures** (see F1).

---

## 2. Findings, ranked by reward ÷ cost

Severity key: **broken** = system silently does nothing or the wrong thing; **wrong** = behaves, but not as designed; **latent** = fine today, will bite on the next change; **smell** = cost without behavioral effect. Cost: S < 1 hour, M ≈ half a day, L = multi-day.

### Tier 1 — cheap fixes to things that are silently broken (do first)

| # | Finding | Sev | Cost | Where |
|---|---|---|---|---|
| F1 | **Underground never gets creatures.** `MON` column layout is `[…, 12 goldRange, 13 tags, 14 dmgType, 15 biomes, 16 layer]`. `populateMonsters` reads biomes/layer from `d[12]/d[13]` (`gen-utils.js:71-73`) and the underground spawn loop reads `d[13]/d[14]` (`world-logic.js:670`). Both comparisons always fail. `populateMonsters` is called three times and never spawns anything (but burns a `rand()` per tile, so fixing it changes every seed). | broken | S | gen-utils.js:71, world-logic.js:670 |
| F2 | **NPCs never see the player as moving.** `player.movedThisTurn = false` at `turn-loop.js:463` runs *before* the monster loop at `:511`. Every NPC visual check gets `MOTION_SIGNAL_STILL`. `prevX/prevY` are never assigned anywhere so the fallback never fires either. Sprinting past a predator is as visible as standing still. | broken | S | turn-loop.js:463 |
| F3 | **Detection is truncated by the spatial grid.** `SPATIAL_QUERY_RADIUS = 1` on 16-tile cells guarantees only 16 tiles of reach (16–32 depending on alignment); `MAX_DETECTION_DISTANCE = 40` and real chemical ranges hit ~25. Detection is anisotropic and position-dependent. | broken | S | constants.js:181-182, ai-utils.js:300 |
| F4 | **Territory leash is permanently off after first contact.** `threatSource` is set at `detection.js:870,906` and never cleared. `ai-utils.js:166` skips the territory check when it's truthy. Every territorial creature that ever sensed a threat wanders unbounded and "flees" a long-gone entity. | broken | S | detection.js:870, ai-utils.js:166 |
| F5 | **Structure placement is a 100% no-op.** The registry uses `T.STONE`, `T.CAVE`, `T.PLAINS`, `T.THRONE`, none of which exist in `T`. 250 placement attempts per world all fail. | broken | S | structures.js:442-693 |
| F6 | **Spawned water-cave creatures are wiped.** `placeStructures` spawns into `monsters[0]`, then `spawnMonstersInWorld` does `monsters[0] = []`. | broken | S | world-logic.js:407 |
| F7 | **New Game without a page reload leaks the previous run.** `initWorld` clears worlds/monsters but not `groundItems`, `state.explored`, `worldTick`, `facing`, the four scent maps (no reset function exists), or turn-loop's `_prevLayer/_layerLeftTurn`. Old corpses and remembered tiles appear on the new map. | broken | S | world-logic.js:690-696, chargen.js:117, scent.js:60-69 |
| F8 | **Any load exception permanently deletes the save.** Also unknown versions are silently deleted. One deserialization bug = wiped run. | data-loss | S | save-load.js:797-800, 951-955 |
| F9 | **Torn autosave.** Save object is built by shallow spread, then `await openDB()` happens before the IDB clone. A keystroke in that gap mutates nested state mid-snapshot. | wrong | S | save-load.js:496, 677, 756 |
| F10 | **NPCs are ~1.5× faster than the same body under player control.** `getBodyPTW(m)` is called with no intensity (`turn-loop.js:539`), which always counts fast-twitch force (`physiology.js:66-71`). Player walking passes 0.25 → slow-twitch only. Docstring at `physiology.js:19` claims parity. | wrong | S | turn-loop.js:539 |
| F11 | **Hare bolt reflex fires on visual.** `cognition.js:504` accepts `bestSNR` on any channel with `strongestMagnitude = 0`; a stationary adjacent rock-sized object triggers a max-intensity bolt. Body map says fore-limb ganglia are vibration-only (`body-maps.js:922-925`). | wrong | S | cognition.js:504 |
| F12 | **Hare alert faces away from the threat.** Bearing is reversed at `cognition.js:696` and again at `ai.js:117`; direction 0 (north) is treated as null. Facing away drops the visual channel → alert clears → oscillation. | wrong | S | cognition.js:696, ai.js:117 |
| F13 | **Visual dominance is NaN.** `detection.js:193-194` and `:446-447` compare the visual transducer *object* to a number. Visual is never the dominant channel; also drives reactive Rule 9. | wrong | S | detection.js:193, 446 |
| F14 | **`sizeRelative` can never be `'similar'`** (`detection.js:540-555` returns `'ambiguous'`), so reactive Rule 3 orient and all of Rule 4B competitor spacing are unreachable. Predators never space from rivals. | broken | S | detection.js:540 |
| F15 | **NPC vision cone is always 120°.** `detection.js:286` reads `visionConeWidth` (never assigned); spawn sets `coneAngle` (`monsters.js:743`). Hare's 170° lateral eyes get 120°. | wrong | S | detection.js:286 |
| F16 | **In-FOV-but-unseen creatures are also unfelt.** `detection.js:1145` `continue`s past the vibration path for any creature on an FOV tile that fails the visual check. One tile outside the cone it would be felt. | wrong | S | detection.js:1145 |
| F17 | **monsterMelee computes damage from one attack zone and logs/footprints another.** `monDamage(mon)` uses `attacks[0]`; `usedAttack` is picked randomly afterwards. A shaleback kick resolves with shove damage. | wrong | S | behaviors.js:889, 902 |
| F18 | **Player immobilization is never enforced.** Set at `behaviors.js:1054`; only `ai.js:182` (NPCs) reads it. A player with all legs destroyed walks normally. | wrong | S | player-actions.js |
| F19 | **Two turn counters.** `turn-loop.js:45` has a private `turnCount`; `state.turnCount` is never incremented. Consequences: log entries all say turn 0, and the involuntary scent alert (`scent.js:807`) fires **once per session** because `0 − 0 < 3` forever. | broken | S | turn-loop.js:45, scent.js:807 |
| F20 | **Dormant creatures don't bleed and are healed on wake.** Only active creatures run `processBleed`; `catchUpCreature` regens and never kills. A mortally wounded creature that gets >45 tiles away wakes healthy. Dormant creatures are also invisible to detection but solid to `monsterAt`. | wrong | S | turn-loop.js:96, 515 |
| F21 | **Turning cost floors momentum to zero.** `Math.floor(consecutive × retained)` at `physiology.js:440`: any turn at 1 consecutive move → 0. Intended 3% cost is a full acceleration reset. | wrong | S | physiology.js:440 |
| F22 | **Player substrate isn't saved** (`serializePlayer` hand-rolls `_zoneState` without substrate; monsters use `extractZoneState`). Reload = free sprint recovery. | wrong | S | save-load.js:373-379 |
| F23 | **Stress ratchet.** `'mild'` release fires every *action* (up to 3/input) while clearance runs once per input at 0.026. Constant sub-freeze stimulus drives `stressLevel` to max, thresholds ×0.4, freeze→flee with no signal change. Endocrine-Design.md:160 says release only on threat ganglion fire. This is the "decay timer" pitfall, inverted. | wrong | S–M | cognition.js:680, 693; ai.js:242 |
| F24 | **Prowler/wolf head is lethal by 0.9 percentage points.** Head neural 0.85/1.29 → 34.1% remaining < 35% threshold, contradicting `body-maps.js:181-182` "Clade A heads are NOT vital". | tuning cliff | S | body-maps.js:13 |

### Tier 2 — cheap cleanups and latent breakage

| # | Finding | Sev | Cost |
|---|---|---|---|
| F25 | `isTownCell(layer) = layer >= 2` (`world-state.js:64`) still gates AI (`turn-loop.js:491`), combat, rendering. Layer 2 is now lava; no creature would ever act there. | latent | S |
| F26 | Three disagreeing light models: `detection.js:41` (no layer gate → NPCs underground see at full daylight), `fov.js:728`, `player.js creatureViewRadius`. | wrong | M |
| F27 | Undefined terrain refs scattered: `T.DIRT_ROAD` (`rendering.js:409`, `monsters.js:18,30,338`), `T.DESERT/T.MOUNTAIN/T.DEEP` (`ui.js:825-834` — region label mostly broken), `T.THRONE`, `T.STONE`, `T.PLAINS`, `T.CAVE`. | dead/wrong | S |
| F28 | `style.css` is **not linked** from `index.html` and describes a `#sidebar` that no longer exists. ~1,060 lines of CSS live inline in `index.html`. | smell | S |
| F29 | `window._pendingLogCatQueue` is read (`main.js:35`, `save-load.js:17`) and defined nowhere; `log.js:64` already sets the category. The wrapper and the index.html `MutationObserver` are both vestigial. | smell | S |
| F30 | Texture-picker palette keys wrong (`'swamp'→'mud'`, `'deep_water'→'deep'`, `'fungal'→'fungal_grass'`); previews silently fall back to plains. | wrong | S |
| F31 | Render side effects: `hitFlash--` inside `render()` (`rendering.js:816,839`) so zoom/resize eat flash frames; forced sync layout via `scrollTop` (`:641`). Up to 4 linear `monsterAt` scans per visible tile per frame (`:145,332,474,791`). | perf | S |
| F32 | Overlay backdrop close (`index.html:1190`) removes `.show` without calling `closeOverlay()` → `_activePanel` stuck → all input blocked. Dormant only because the `I` key is commented out. Also duplicate click listeners per inventory render (`overlay.js:270`). | latent | S |
| F33 | Player-facing text is wrong: `attemptMove` says "Press R to read/enter/pick up" but R is eat; `showHelp` describes FED/HP, potions, BLADE/FIRE/COLD/ELECTRIC/POISON, chests, wells, and "mushrooms in the southeastern fungal zone". | wrong | S |
| F34 | Silent save failure (all IDB errors console-only), title double-Enter (no busy flag), ground-item id counter resets on reload, `state.inputLocked` never set, victory unreachable (`mon.isBoss` never set), restart-confirm never shown. | smell | S |
| F35 | Scent runs over *all* creatures map-wide including dormant ones, with string-keyed Maps and a fresh object per tile per turn. This is the per-turn hot spot. | perf | S |
| F36 | `getBodyMap` falls back to the shared `BODY_MAPS` template (`body-maps.js:1061-1077`); `performNPCAttack` writes `hp/destroyed` unguarded. Currently unreachable; one missed `initBodyMap` corrupts every creature of that species. | latent | S |
| F37 | Unseeded `Math.random` in runtime paths: wind (`scent.js:135`), deliberative override (`cognition.js:734`), `turn-loop.js:193`, world seed itself. Reproducibility is impossible. | smell | S |
| F38 | `teleportPlayer` default seed 42 (`world-gen.js:143`) so every world's layers ≥ 2 are identical. | latent | S |
| F39 | Two broken `addLayer` functions (`world-state.js:34` does `worlds.push` on an object; `world-gen.js:26` fills `T.STONE`). Both unused, both crash if called. | latent | S |
| F40 | 32×32 sprite pack ignores the texture picker, disagrees with the 16 pack on corpse color, and scales 1.5× at zoom 3 (non-integer, pixel-art breaks). It's a pure Scale2x derivation of the 16 pack stored as 279 lines of code. | wrong | S–M |

### Tier 3 — medium structural work

| # | Finding | Cost | Reward |
|---|---|---|---|
| F41 | **Zone-damage resolution is triplicated**: `combat.js:36-147` (player→NPC), `behaviors.js:992-1070` (NPC→player), `behaviors.js:554-620` (NPC→NPC, which has no footprint, no sense loss, no destruction log). Every death-logic fix must be made three times. → one `applyZoneDamage(entity, zone, dmg)` in physiology.js. | M | high |
| F42 | **Legacy HP is a hidden second death pool for the player.** `hpMax = siz × HP_PER_SIZE` (grazer 6 HP, prowler 22). Poison and starvation drain it and kill with an intact body map; rest and passive regen only heal it; the HUD displays it. Monsters' `hp` is just an alive flag. | M | high |
| F43 | **Player attack pipeline is legacy soup**: uses `availAtks[0]` (head bite, comment says front limb), damage type from weapon not attack, armor applied twice (`mon.def` and zone structural), `TAG_RESIST` + level bonus + elemental + bane stacked on physics damage (`combat.js:175-303`). Dodge uses MON `siz` for NPCs, mass for player; NPCs crit, player never does. | M | med |
| F44 | **Ganglion hare never wanders.** Food template ignores hunger, fires for any food ≤ 6 tiles → `hold` → `currentBehavior = 'rest'` → 3× healing. Hares on grass are healing statues. `WANDER_PROFILES.hare` is effectively dead. | M | med |
| F45 | **Hares fear hares.** No species/diet gate in `_matchThreatTemplates`; an adjacent hare contributes 1.4 ≥ freeze threshold 0.5. | M | med |
| F46 | **Deliberative override is probabilistic and always succeeds** (`Math.random() < ratio`; `deliberativeEvaluation` never returns null, defaults to `wander`). A wolf has a 75% chance to turn "adjacent much-larger predator → flee" into wander. Cognition-Design.md:94 says deterministic. | M | med |
| F47 | **Visual SNR fed to ganglia ignores concealment**: `buildAllDetectionInfo` (`detection.js:760-766`) recomputes `getVisualRange` without the reduction `canDetect` applies. Duplicate work plus inflated threat confidence. | S | med |
| F48 | **Mass estimate always uses the chemical channel** (`detection.js:519`) even for visual/vibration-only detections; chemical carries ×1.6 diet and ×1.4 activity, so a moving predator reads 2.24× heavier. | M | med |
| F49 | `enemy-ai.js` is a pure barrel (`export * from physiology/ai/turn-loop/debug`) and is what creates the import cycle `ai → behaviors → combat → enemy-ai → turn-loop → player-actions`. 18 cycles total; `combatCapability` is copy-pasted into `detection.js:718` to dodge one. Migrate the four importers (`combat.js`, `interactions.js`, `player-actions.js`, `main.js`) to direct imports and delete the barrel. | S–M | med |
| F50 | `index.html` at 1,383 lines: ~1,060 lines inline CSS, 200-line inline log-widget script with a `MutationObserver` hack, and hidden dead DOM screens (`#title/#death/#victory/#chargen-screen/#bodytype-screen`, `index.html:1132-1178`). → CSS to `style.css`, script to `js/log-ui.js`, delete dead DOM. | M | med |
| F51 | Dead fantasy tier removal, ~1,100 lines with no callers: `castle.js`, `dialogue.js`, `shops.js` render/buy/sell, `interactions.js` interact/openChest/pickUpBook/openBook/consumeFeature/examineTile/useAction/readBook, `overlay.js` panels, chargen body-type/stat allocation, victory path, restart confirm, `town-gen.js`, `village-gen.js` (only via empty `LANDMARKS`), `structures.js` (F5 makes it a no-op anyway), `goblin`/`dread_king` entries. Entanglement is light: shared `T.*` ids, `SIGN_TEXTS` import from `npcs.js`, `DEFAULT_GROUND_FOR_COVER` town rows, `LAYER_META` 'town'/'shop' types, `cellKeyToLayer` in save. Removal order: castle → structures + registry → town/village → terrain rows → sets. | M | med (unblocks everything else by making the live surface legible) |
| F52 | Underground layer is generated every new game and serialized every turn while stairs are commented out (`surface-gen.js:622-651`, `interactions.js:73, 88-101`). Latent stair mismatch when they return: `makeUnderground` clamps entrances to `[4, w−5]`, surface keeps raw `pos.x`. | S | low now, M later |
| F53 | Sync `palette-compute.js` with the viewer (missing `livingCoverColor` selector, MUD groundCover blend, water submerged mat, wet film, chemo guards) and convert both it and `sprite-select.js` from CommonJS `module.exports` to ES exports. Neither can currently be imported by the game. `deriveTerrainAndCover` has no game counterpart at all. | S–M | high (this is the first step of planet integration) |

### Tier 4 — large, strategic

| # | Finding | Cost |
|---|---|---|
| F54 | **Retire the seven-stat system** (Body-Sim "Phase 3"). Consumers: dodge, accuracy, crit, stealth, poison resist, carry capacity, prices, XP, HP pool, bleed-message gating (`central ≥ 60` branch is unreachable for every species). This is the long pole; F41–F43 are its prerequisites. | L |
| F55 | **Damage formula vs zone HP scale.** Code is multiplicative and superlinear in mass; docs are additive `muscle×C1 + mass×C2 × damageModifier`. Result: shaleback kick ≈ 167, dire_wolf bite ≈ 16, wolf bite ≈ 4, while a prowler torso has 37 HP. A player prowler dies to any shaleback kick. Rescale after F41 lands. | M |
| F56 | **Motor layer.** Motor-System-Design steps 3–5, 7, 8 don't exist. Ganglion output is translated back into behavior strings and executed by the label switch. Locomotion ignores zone HP; transducers ignore zone HP; pathway severance only feeds blood burst. This is the seam where the physical system stops and the placeholder begins. | L |
| F57 | **Endocrine system.** Absent. `stressLevel` scalar only. | L |
| F58 | **Planet integration** (Todo "Game Integration" Phase C/D). Zero code paths read viewer output; the viewer has no export; the viewer's own determinism contract is broken below planetary scale (tile chunks use window-relative coordinates, `planet-viewer.html:7359, 7935`; stream thresholds normalize by window max, `:5000-5015`). Fix the viewer's coordinate scheme before building the bridge or the game will inherit it. Also: cumulative re-evaporation term (`:2317`), pole rows never precipitate (`:2258, 2305`), ~700 lines of dead paths, 131k-object `cells` array that should be typed arrays. Todo "Priority 1" tuning values are **already applied** (`:742, 743, 4542, 4554`); tick the boxes. **Caveat:** `CLAUDE.md` says the Planet-Viewer repo is its own project and `Utils/planet-viewer.html` is a standalone copy. Every line number here is against that copy. Before acting on any of it, check whether the canonical repo already differs; the bridge (Phase 5) should consume the canonical project, not `Utils/`. | L |
| F59 | **Mutation-Design.md is 0% implemented.** Corpses carry `source` and `mass` (`combat.js:407-409`); that is the only prerequisite present. | L |

---

## 3. Design-principle scorecard

Measured against `Notes/Design-Principles.md`.

**Passing:** body-map tissue masses and derived HP/blood; physics damage pipeline; force-to-weight speed; substrate depletion; per-zone chemical/vibration detection with SNR-derived confidence; scent as a physical field; hare ganglion thresholds as physical properties; species-confidence-gated rendering.

**Failing, and the doc names the pattern:**

- *"Creature-level aggregated stats"* — `getEffectiveVisual` (max over zones, comment admits it), `checkSenseLoss` (max, the doc's literal forbidden example), `getDominantSenseChannel`, `getBestChemicalAirborne`, player FOV uses one best eye not the union, `player.js:98-118` re-derives `vis/chem/vib` by max, `drives.{hunger,safety,rest}`, `stressLevel`, the whole seven-stat table.
- *"Probability that scales with X"* — deliberative override (`Math.random() < ratio`), `pauseChance/turnChance` wander, `rollHit`, stealth toggle (`percept − cover − sizeBonus − 5d` roll, `combat.js:446-473`, `detection.js:505-511`), rest as a random Size-weighted heal, `PERSONALITY_POOL` "probability-weighted" traits adding +10 to stats.
- *"Named programs selected from a vocabulary"* — `type: 'bolt'|'freeze'|'alert'|'forage'|'hold'`; behavior strings drive substrate depletion (`physiology.js:141-148`) and healing (`'rest'` → ×3, `:336`); scent activity keyed on `'flee'|'hunt'|'rest'|'idle'`; `fleeMode` per species; `patterns: ['simultaneous_max']` written and never read.
- *"Activation decays over N turns"* — the stress ratchet (F23), `_goalLostTurns`, `_cachedWaterAge`.
- *"Clade X has trait Y"* — `CIRCULATION_MAP`, `DIET_MAP`, `FLEE_MODE_MAP`, `CLADE_DATA` are species lookup tables, not body-map derivations; the species screen shows "Clade" as a trait.
- *"Placeholders must be marked"* — spawning density is marked; `populateMonsters`, the structure registry, castle residue, aggregate stats "so old systems don't crash" (`player.js:85-123`), hold⇒rest healing, `maxFoodRange = 6`, diet threshold `0.3` literal are not.

**Two things the code does better than the docs:** the blood-volume bleed model (Body-Sim's `totalBleed/bleedRate` fields are stale and unread), and the 8-class molecular scent field (Chemical-Scent doc still describes 3 channels).

---

## 4. Doc vs. code drift worth fixing in the docs

- Todo.md "Priority 1: Verify Tuning Prompts Applied" — all four are applied. Tick them.
- Todo.md Known Gotchas "One terrain function, one palette function" — violated: two divergent `computeTilePalette` copies exist.
- Spawning-Design densities (1/8–12) vs `constants.js:258-262` (300–450, marked temporary).
- Flora-Fauna-Taxonomy "Pela is NOT grass / Tosk is NOT a mushroom" vs `TERRAIN_INFO` names `'grass'`, `'mushroom forest'`, `'wheat'`.
- Per-Eye doc "union of all eyes" vs single best eye; "NPC vision from body map — ready" vs F15.
- Sensory-Design "player detection follows the exact same per-zone model" — it doesn't (player skips airborne chemical; NPCs skip the scent field entirely and smell via a wind-less point-source formula).
- Ambient-Terrain-Sensing lists visual + chemical + vibration; code is vibration-only.
- Cognition-Design "override is deterministic" vs `Math.random`.
- `state.js:18` says 200-tick cycle; it's 1,200. `ecology-data.js:73-77` says no atmosphere fields needed; `ATMOSPHERE` is written and consumed. `world-gen.js:21-23` says `placeStartingTown` is called from `initWorld`; it's disabled.
- Stale code comments: `body-maps.js:176` "vital not enforced yet" (it is), `:782` "nothing reads pathways" (combat does), `:908` "nothing reads CREATURE_NEURAL" (hare does).
- `CLAUDE.md` module table: `castle.js`, `dialogue.js` listed as live (corrected, see §7); `town-gen.js`, `village-gen.js`, `structures.js`, `shops.js`, `overlay.js` are imported but reachable-dead (F5, F51). Left as-is in the table since they are still in the load graph; Phase 2 removes them.

---

## 5. Recommended implementation path

The ordering principle: **make the live surface legible before touching the design.** Right now a reader can't tell which of three generations a given number comes from, and the physics work keeps landing on top of an unstable base.

`CLAUDE.md` sets the delivery unit: one change or one pass per pull request, on a `claude/…` branch, with the `Notes/` doc for the touched system updated in the same PR, `Todo.md` ticked, and the PR saying what to check on its preview link. The phases below are therefore lists of pull requests, not commits. Each PR is independently shippable and checkable on its preview.

### Phase 0 — Guardrails (two small PRs)

`CLAUDE.md` says "no framework, no dependencies, no build step" and "there are no automated tests; the check is playing it." This phase keeps the first rule and adds the minimum to make large deletions safe without changing it:

- **PR 0a — reproducibility.** A `?seed=` URL parameter so a world can be regenerated, and the five runtime `Math.random` sites (F37) replaced with `rand()`. No dependency. Preview check: two loads with the same seed give the same map.
- **PR 0b — checks in the Pages workflow.** `node --check` over every module (a shell loop; no package needed), the import-graph script from this audit (missing exports, cycles, unused exports), and the headless smoke test (boot → new game → N inputs → save → reload → resume; assert no console errors, underground has creatures, player moved). In a cloud session the smoke test runs on the pre-installed Chromium that `CLAUDE.md` mentions; in the workflow it runs via `npx playwright` inside the job, so nothing is added to the repo's dependencies. This PR should also update the "no automated tests" line in `CLAUDE.md`, since it would no longer be true.

The workflow check is what makes Phase 2's ~1,100-line deletion safe. The person's own check remains the preview.

### Phase 1 — Tier 1 fixes (five or six PRs)

F1–F24 are all one-site fixes with a known correct value. One PR per system, each updating that system's `Notes/` doc where the fix reveals doc drift (§4):

| PR | Findings | Notes doc | Preview check |
|---|---|---|---|
| perception | F2, F3, F13, F15, F16, F19 | Sensory-Design, Per-Eye | walk past a prowler at a run; it should react at range |
| cognition | F4, F11, F12, F14, F23 | Cognition-Design, Endocrine-Design | a hare should not bolt from a rock or face away when alerted |
| physiology/combat | F10, F17, F18, F21, F24 | Body-Sim, Muscle-Fiber | prowler head hit no longer instant death; legless player can't walk |
| spawning | F1, F5, F6 | Spawning-Design | underground has creatures (changes every seed; say so) |
| save | F7, F8, F9, F22 | — | die → NEW GAME shows no old corpses; a corrupt save is backed up, not deleted |
| dormancy | F20 | Cognition-Design (dormancy is undocumented; document it) | a wounded creature that wanders off does not return healed |

F2 + F3 + F4 alone will make predators feel like predators for the first time.

### Phase 2 — Dead tier removal (one PR per removal step)

F51 plus F25, F27, F28, F29, F39, F50, F52. Delete, don't refactor. Remove in dependency order, one PR each so the preview isolates any breakage: castle → structures + registry → town/village → terrain rows + sets → dead DOM screens + inline CSS to `style.css` → inline log script to `js/log-ui.js`. Rewrite the help screen (F33) in the DOM PR. Each PR removes the deleted files from the `CLAUDE.md` module table.

Do **not** touch weapon/armor/level/FED/HP in this phase; they're numerically load-bearing (F42, F43). Just delete the things with zero callers.

### Phase 3 — Unify the three copies (three or four PRs)

F41 (one zone-damage resolver), then F42 (route poison/starvation into blood or zones; player `hp` becomes an alive flag), then F43 (player attack mirrors `monsterMelee`: random available attack, attack's damage type, zone armor only, one mass-based dodge for both). F26 (one light model in `time-cycle.js`). F47/F48 (visual SNR from `canDetect`, channel-appropriate mass estimate). F49 (kill the `enemy-ai.js` barrel, break the big cycle). Each moves a system's design, so each updates Body-Sim / Stat-System / Sensory-Design accordingly.

After this phase there is one damage path, one dodge, one light model, one healing path. Then F55 (rescale the damage formula) becomes a one-place change instead of three.

### Phase 4 — Ganglion path fixes (one PR)

F44, F45, F46. Make the hare behave: hunger-gated food template, species gate on threat templates, deterministic override that can return null. This is also when to decide whether `_ganglionOutputToAction` is a temporary shim (mark it) or the seam where the motor layer (F56) will plug in. That decision is the person's (§6 Q4).

### Phase 5 — Planet bridge (strategic, ordered)

`CLAUDE.md` says the Planet-Viewer repo is its own project. So step 1 belongs there, not here, and the audit's viewer findings should be re-checked against that repo first.

1. Fix the viewer's coordinate determinism (F58) in the Planet-Viewer project — global tile/regional coordinates, absolute stream thresholds. Without this the game world changes based on which region was viewed.
2. F53: ES-ify `palette-compute.js` and `sprite-select.js`, port `deriveTerrainAndCover` into `js/`, and have the viewer import them as modules. This deletes the drifted copies and satisfies Todo's "one terrain function, one palette function" rule. Where these modules live (this repo, the viewer repo, or shared) is a question for the person (§6 Q5).
3. Viewer JSON/IndexedDB export of the planetary grid keyed by seed + params.
4. `generateLayer(LAYER_SURFACE)` reads from a chunk generator instead of `makeSurface`, still writing `worlds/covers/ATMOSPHERE` so downstream is untouched.
5. Per-tile palette array in the renderer, replacing `BIOME[palette]` lookups and the ~130 lines of hardcoded hex decorations in `rendering.js:339-500`.

### What not to do

- Don't build the motor layer, endocrine system, or mutation mechanic on the current base. F56/F57/F59 are the right next systems, but each would be the fourth generation of code on top of three. Phases 1–3 first.
- Don't remove `populateMonsters` without noting that it consumes RNG; all existing seeds will change. That's fine, but say so in the PR.
- Don't fix the 32×32 pack (F40); regenerate it from the 16 pack at bake time or drop it until art direction is decided.
- Don't tick Todo's "Priority 1" boxes in a code PR; it's a doc-only change (they're already applied) and can ride whichever PR first touches the viewer.

---

## 6. Open questions for the author

1. **Underground and stairs:** are they coming back soon, or should the layer stop generating until they do? (Affects F1, F52, and save size.)
2. **Seven-stat retirement (F54):** is this the intended direction, i.e. dodge/accuracy/carry capacity/stealth all become body-map derivations? If yes, Phase 3 should aim there from the start rather than just unifying the current copies.
3. **Weapons, armor, inventory, gold, XP:** delete entirely, or keep a dormant hook for a future tool-use mechanic? The mutation design suggests the body *is* the inventory.
4. **`_ganglionOutputToAction`:** should the hare's output keep being translated into behavior labels (cheap, keeps one executor) or is now the time to start the motor layer with the hare as the only client?
5. **Planet integration timing and location:** Todo puts geography tuning before game integration. The viewer's determinism bug (F58 item 1) should be fixed regardless, since it affects the tuning work too. And since `CLAUDE.md` says Planet-Viewer is its own repo: is `Utils/planet-viewer.html` still the reference copy, or stale? Where should the shared modules (`palette-compute.js`, `sprite-select.js`, a future `terrain-derive.js`) live?
6. **Chemotroph density:** 103 of 166 spawned creatures. Intended for testing, or a spawn-table accident?
7. **Phase 0b:** `CLAUDE.md` says the check is playing it. Is a workflow-level smoke test welcome, or would you rather keep the repo dependency-free at the workflow level too and rely on the preview alone? Phase 2's deletions are riskier without it, but not impossible.

---

## 7. Correction made to `CLAUDE.md`

One edit, in the module table: `castle.js` and `dialogue.js` are annotated as not imported by anything, and `palette-compute.js` / `sprite-select.js` as standalone modules not yet imported by the game. Everything else in `CLAUDE.md` matches what the audit found. Two lines will need updating by later PRs, not this one: "there are no automated tests" (if Phase 0b lands) and the module table rows for whatever Phase 2 deletes.

Two things `CLAUDE.md` says that the audit confirms and would stress: the seed is the only thing that makes a bug reproducible, and it is currently `Math.random()` (F37); and "the check is playing it" is the reason F1, F5 and F14 survived so long, since none of them are visible from playing.
