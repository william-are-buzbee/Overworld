// ==================== PLAYER ACTIONS ====================
import { state, worlds, covers } from './state.js';
import { FED_MAX, facingSteps } from './constants.js';
import { isWalkable, terrainName } from './terrain.js';
import { getItems, removeItem } from './ground-items.js';
import { inBounds, monsterAt, getFeature, isImpassable, getCover } from './world-state.js';
import { log, LOG_CATEGORIES } from './log.js';
import { updateUI } from './ui.js';
import { playerAttack } from './combat.js';
import { endPlayerTurn } from './turn-loop.js';
import { applyTurningCost, getEntityTotalMass } from './physiology.js';

function dirName(dx, dy){
  if (dx === 0 && dy === -1) return 'north';
  if (dx === 1 && dy === -1) return 'northeast';
  if (dx === 1 && dy === 0)  return 'east';
  if (dx === 1 && dy === 1)  return 'southeast';
  if (dx === 0 && dy === 1)  return 'south';
  if (dx === -1 && dy === 1) return 'southwest';
  if (dx === -1 && dy === 0) return 'west';
  if (dx === -1 && dy === -1) return 'northwest';
  return '';
}

function attemptMove(dx, dy){
  const player = state.player; 
  const nx = state.player.x + dx, ny = state.player.y + dy;
  if (!inBounds(state.player.layer, nx, ny)){ log('The world ends here.', LOG_CATEGORIES.MOVEMENT); return; }
  if (isImpassable(state.player.layer, nx, ny)) return;

  // Update facing — always succeeds, no probability check.
  // Physical cost of turning handled by mass-dependent momentum loss.
  const oldDx = state.facing.dx;
  const oldDy = state.facing.dy;
  state.facing.dx = dx;
  state.facing.dy = dy;

  // Apply turning cost to momentum (mass-dependent)
  const stepsChanged = facingSteps(oldDx, oldDy, dx, dy);
  if (stepsChanged > 0) {
    applyTurningCost(state.player, stepsChanged);
  }

  // Set movement intensity based on sprint mode
  state.player._lastMovementIntensity = state.player.sprintMode ? 1.0 : 0.25;

  const mon = monsterAt(nx, ny, state.player.layer);
  if (mon){
    state.player.inCombatThisTurn = true;  // Prompt L-A
    const didHit = playerAttack(mon); endPlayerTurn(didHit ? 'attack' : 'miss'); return;
  }
  const ground = worlds[state.player.layer][ny][nx];
  const cover = getCover(state.player.layer, nx, ny);
  if (!isWalkable(ground, cover)){ log(`Blocked by ${terrainName(ground, cover)}.`, LOG_CATEGORIES.MOVEMENT); return; }
  // No surviving locomotion zone: the body cannot carry itself. Facing has
  // already turned (the head still works) and bump-attacks above still
  // resolve; only the step is refused. Set in combat resolution when the last
  // locomotion zone is destroyed; the same flag NPCs obey in ai.js.
  if (state.player.immobilized){ log('You strain, but nothing that could carry you remains.', LOG_CATEGORIES.MOVEMENT); return; }
  state.player.x = nx; state.player.y = ny;
  state.player.movedThisTurn = true;  // Prompt L-A
  const f = getFeature(state.player.layer, nx, ny);
  if (f && f.type === 'stairs') log(`Stairs ${f.dir}.`, LOG_CATEGORIES.INTERACTION);  // only feature type still generated (underground, currently unreachable)
  endPlayerTurn('move');
}

function restAction(){
  // Resting is a turn spent still. Wounds knit through the body's own
  // healing (applyHealing with the rest bonus, in the turn loop); there is
  // no pool of hit points to top up. Food is still spent (fedDrainFor).
  log('You rest.', LOG_CATEGORIES.SYSTEM);
  endPlayerTurn('rest');
}

function turnInPlace(dx, dy){
  if (state.facing.dx === dx && state.facing.dy === dy) return;
  const oldDx = state.facing.dx;
  const oldDy = state.facing.dy;
  state.facing.dx = dx;
  state.facing.dy = dy;
  // Apply turning cost to momentum
  const stepsChanged = facingSteps(oldDx, oldDy, dx, dy);
  if (stepsChanged > 0) {
    applyTurningCost(state.player, stepsChanged);
  }
  log(`You turn ${dirName(dx, dy)}.`, LOG_CATEGORIES.MOVEMENT);
  endPlayerTurn('turn');
}

// ==================== GROUND ITEM INTERACTIONS ====================

/** Look at items on the current tile. Does NOT cost a turn. */
/** Pick up an item from the ground. Costs one turn. */
let _groundModalOpen = null, _groundModalClose = null;
function setGroundModalCallbacks(openFn, closeFn){
  _groundModalOpen = openFn;
  _groundModalClose = closeFn;
}

// ==================== EAT ACTION (R key) ====================
// Eats the corpse underfoot, whole, in one turn. PLACEHOLDER until there is
// a gut: the food reserve (0-100) rises by the corpse's mass as a share of
// the eater's own mass, so a 5 kg grazer is a quarter-meal for a 22 kg
// prowler and a mouthful for a 200 kg wader. NPCs eat by bites (behaviors.js).

function eatAction(){
  const px = state.player.x, py = state.player.y;
  const layer = state.player.layer;
  const items = getItems(layer, px, py);
  const corpses = items.filter(it => it.kind === 'corpse' && (it.mass || 0) > 0);

  if (corpses.length === 1){
    eatCorpseFromGround(corpses[0], layer, px, py);
    return;
  }
  if (corpses.length > 1){
    showGroundCorpseEatPanel(corpses, layer, px, py);
    return;
  }
  log('Nothing to eat here. Stand on a corpse.', LOG_CATEGORIES.INTERACTION);
}

function eatCorpseFromGround(groundItem, layer, x, y){
  const share = (groundItem.mass || 0) / Math.max(1, getEntityTotalMass(state.player));
  state.player.fed = Math.min(FED_MAX, state.player.fed + share * FED_MAX);
  removeItem(layer, x, y, groundItem.id);
  log(`You eat the ${groundItem.name}.`, LOG_CATEGORIES.INTERACTION);
  endPlayerTurn('rest');
}

function showGroundCorpseEatPanel(corpses, layer, px, py){
  let html = `<h2>Eat</h2>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;">Corpses at your feet:</div>`;
  for (let i = 0; i < corpses.length; i++){
    const it = corpses[i];
    html += `<div class="row">`;
    html += `<div class="lbl"><b>${it.name}</b><div class="sub">${(it.mass || 0).toFixed(1)} kg</div></div>`;
    html += `<button class="btn" data-geat="${i}">EAT</button>`;
    html += `</div>`;
  }
  html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;

  if (_groundModalOpen){
    _groundModalOpen(html);
    wireGroundCorpseEatButtons(corpses, layer, px, py);
  }
}

function wireGroundCorpseEatButtons(corpses, layer, px, py){
  document.getElementById('btn-close').onclick = () => { if (_groundModalClose) _groundModalClose(); };
  document.querySelectorAll('[data-geat]').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.geat, 10);
      if (idx >= 0 && idx < corpses.length){
        if (_groundModalClose) _groundModalClose();
        // Re-verify the corpse is still on the ground
        const current = getItems(layer, px, py);
        const found = current.find(it => it.id === corpses[idx].id);
        if (found) eatCorpseFromGround(found, layer, px, py);
      }
    };
  });
}

export { attemptMove, restAction, dirName, turnInPlace, setGroundModalCallbacks, eatAction };
