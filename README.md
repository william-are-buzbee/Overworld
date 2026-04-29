# OverWorld Zero — Modular Architecture

## Running

ES modules require a web server (won't work via `file://`). Any of these work:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## Module Dependency Graph

```
state.js ─────────────────────────────────────────────┐
  (shared mutable state: player, worlds, difficulty)  │
                                                      │
constants.js, rng.js                                  │  ← leaf modules, no deps
    │                                                 │
    ├── sprites.js  (sprite data + tinting)           │
    ├── terrain.js  (tile types + info)               │
    ├── items.js    (weapons, armor, food, potions, books)
    │                                                 │
    ├── monsters.js (templates, personality, spawn)   │
    ├── player.js   (creation, derived stats, inventory)
    ├── npcs.js     (NPC/shop/town data)              │
    │                                                 │
    ├── world.js    (worldgen, structures, spawning)   │
    │   └── also exports: monsterAt, chebyshev, inBounds, etc.
    │                                                 │
    ├── log.js      (game message log)                │
    ├── modal.js    (open/close modal dialogs)        │
    │                                                 │
    ├── rendering.js (canvas drawing)                 │
    ├── ui.js       (sidebar refresh, items tab)      │
    │                                                 │
    ├── combat.js   (attack resolution, stealth)      │
    ├── ai.js       (enemy AI, movement, turns)       │
    ├── interactions.js (use/interact, shops, NPCs, castle, help)
    ├── chargen.js  (character creation, death/victory)
    │                                                 │
    └── main.js     (entry point, input handlers, state machine)
```

## Module Responsibilities

| Module | Lines | What it owns |
|--------|-------|-------------|
| `state.js` | 19 | Shared mutable state object (`state.player`, `worlds[]`, etc.) |
| `constants.js` | 74 | Tile sizes, biome palettes, damage types, tag resistances, difficulties |
| `rng.js` | 22 | Seeded PRNG (`srand`, `rand`, `randi`, `choice`, etc.) |
| `sprites.js` | 423 | All 16x16 string-art sprites + tinting/caching |
| `terrain.js` | 52 | Terrain enum `T`, info table, `isWalkable`/`isOverlay`/etc. |
| `items.js` | 91 | Weapons, armor, food, potions, books data tables |
| `monsters.js` | 439 | Monster templates, speed, personality system, `spawnMonster` |
| `player.js` | 313 | `freshPlayer`, all derived stat formulas, inventory management |
| `npcs.js` | 296 | NPC dialogue, shop inventories, town definitions, sign texts |
| `world.js` | 875 | World state helpers, worldgen (surface/underground/towns), structure placement, monster spawning |
| `log.js` | 13 | The `log()` function for game messages |
| `modal.js` | 15 | Modal dialog open/close helpers |
| `rendering.js` | 182 | Canvas `render()` — draws terrain, features, monsters, player |
| `ui.js` | 217 | `updateUI()` — refreshes sidebar stats, items tab, effects, region name |
| `combat.js` | 189 | `playerAttack`, `monsterMelee`, stealth toggle/detection, kill/levelup |
| `ai.js` | 667 | `attemptMove`, `restAction`, `endPlayerTurn`, enemy AI (idle/chase/search), mushroom pack AI |
| `interactions.js` | 612 | `useAction`, NPC dialogue, shop UI, castle modals, chest/book/stair interactions, help screen |
| `chargen.js` | 199 | Character creation screen, `beginGame`, death/victory screens |
| `main.js` | 187 | Entry point — wires callbacks, input handlers, game state machine |

## How Shared State Works

Instead of global `let player`, `let difficulty`, etc., all mutable state lives in a single
exported object from `state.js`:

```js
// state.js
export const state = { player: null, difficulty: 'normal', gameState: 'title', ... };
export const worlds = [];
export const features = [];
export const monsters = [];
```

Every module that needs to read or write state does:

```js
import { state, worlds, monsters } from './state.js';

// Read:  state.player.hp
// Write: state.player.hp -= dmg
// Write: state.difficulty = 'hard'
```

This avoids circular dependencies on state and keeps mutation visible.

## Breaking Circular Dependencies

Some modules naturally depend on each other (e.g., `combat.js` calls `log()` from `log.js`,
`ai.js` calls `render()` from `rendering.js` which calls `updateUI()` from `ui.js`).
Where a true circular dependency would form, we use **callback injection**:

- `modal.js` needs `updateUI` on close → `setUpdateUICallback(fn)` called by `main.js`
- `combat.js` needs `onVictory` → `setOnVictoryCallback(fn)` called by `main.js`
- `ai.js` needs `onPlayerDeath` → `setOnPlayerDeathCallback(fn)` called by `main.js`

`main.js` wires these up at startup before any game logic runs.

## Future Improvements

- **world.js is large (875 lines)** — could split into `world-state.js` (helpers),
  `worldgen.js` (terrain generation), and `structures.js` (placement + spawning)
- **interactions.js is large (612 lines)** — could split into `shops.js`, `dialogue.js`,
  `castle.js`, and `interactions.js` (core use/interact)
- **ai.js is large (667 lines)** — could split into `actions.js` (player movement/eat/rest)
  and `enemy-ai.js` (AI state machine)
