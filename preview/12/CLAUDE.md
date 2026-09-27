# CLAUDE.md — Overworld

Read this first. Then `Notes/Design-Principles.md` before designing or implementing any system, and the `Notes/` doc for the
system you are touching. `Notes/Todo.md` is the person's prompt queue.

## What this is

A turn-based roguelike about surviving as an alien creature on a believably simulated world (see `readme.md` and
`Notes/Lore.md`): two founder lineages radiated into every niche, and the player is one of their descendants. Inspired by
Biblaridion's *Alien Biospheres*, Nethack and Caves of Qud.

**The core rule** (`Notes/Design-Principles.md`): everything is physical, everything is observable, everything is downstream of
the body map. Behaviour comes from structures in the body map doing physical things, never from probabilities, tuning levers or
behaviour labels. If a change needs something that isn't physically present in the body map, it's wrong.

Plain ES modules, no framework, no dependencies, no build step. `index.html` loads `js/main.js` as a module; `js/state.js` is the
shared mutable state every module imports. Each file's first lines say what it owns; the main groups:

| area | files (in `js/`) |
|---|---|
| entry, state, turns | main.js, state.js, turn-loop.js, save-load.js (IndexedDB, saved every turn), rng.js (seeded) |
| the body | body-maps.js (body maps, species templates, neural architecture), physiology.js |
| senses and minds | detection.js, signals.js, scent.js, sensory-constants.js, fov.js, cognition.js, ai.js, ai-utils.js, behaviors.js, enemy-ai.js |
| combat | combat.js, combat-constants.js |
| the world | world-gen.js (coordination), surface-gen.js, underground-gen.js, terrain.js, ecology-data.js, gen-utils.js, world-logic.js, world-state.js, time-cycle.js |
| player, items | player.js, player-actions.js, chargen.js (species selection), items.js, ground-items.js, interactions.js |
| drawing and UI | rendering.js, display.js, sprites.js, sprites-32.js, texture-picker.js, overlay.js, modal.js, ui.js, log.js, worldmap.js, debug.js; sprite-select.js and palette-compute.js are standalone (CommonJS, not yet imported by the game) |

`Utils/planet-viewer.html` is a standalone planet tool (the Planet-Viewer repo is its own project); `js/test-hare-bodymap.html`
is a test page.

## Run and look

Modules don't load from `file://`, so serve the folder: `npx serve .` or `python3 -m http.server`, then open `index.html`.
Add `?seed=<n>` to the URL for a reproducible world (the seed is logged at the start of a
run). There are no automated tests; the check is playing it. From a cloud session the page can be opened in the pre-installed
Chromium (Playwright) and screenshotted; the person's own check is the pull request's preview link (below).

## Delivering a change

1. One change or one pass per pull request. Work on a `claude/…` branch, push it (`git push -u origin claude/…`), open a pull
   request into `main`. Never push to `main` (it is protected; the person's merge is the release), never force-push or rebase.
2. Identity for commits is `WB <willbuzbee@gmail.com>` (`git config user.name WB`, `user.email willbuzbee@gmail.com` in the
   repo's local config; never any other name — the person, 26 Sep 2026). GitHub shows these commits "Unverified"; accepted.
3. Pages (`.github/workflows/pages.yml`, `.github/publish.sh`, 26 Sep 2026) publishes the `gh-pages` branch: `main` is live at
   `https://william-are-buzbee.github.io/Overworld/`; a pull request is a preview at `…/preview/<number>/` (linked in a comment
   on it, removed when it closes); each merge is kept at `…/v/<date>-<commit>/`, never overwritten.
4. When a change moves a system's design, update its `Notes/` doc in the same pull request, and tick `Notes/Todo.md`.
5. Say in the pull request what changed, why, what was looked at, and what the person should check on the preview.

## The person

- Concise replies, dry wit, no praise, no constant agreement. Disagree when reasonable. Be plain about what can and cannot be
  checked from a session.
- Likes questions and is open to ideas. When a design choice is theirs, ask, don't guess.
