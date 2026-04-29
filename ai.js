// ==================== MOVEMENT / ACTIONS + TURN + ENEMY AI ====================
import { state, worlds, features, monsters } from './state.js';
import { DMG, DIFFICULTIES } from './constants.js';
import { T, isWalkable, terrainName } from './terrain.js';
import { rand, randi, roll100 } from './rng.js';
import { FOOD, findWeapon, findArmor } from './items.js';
import { effectiveDex, playerAcc, playerDodge, poisonResistance, passiveRegenInterval,
         restHealAmount, foodFedMul, INV_SLOTS, defaultWeight, addItem } from './player.js';
import { NPCS, TOWNS } from './npcs.js';
import { inBounds, monsterAt, chebyshev, getFeature, isTownCell, fkey } from './world-state.js';
import { log } from './log.js';
import { updateUI, interactable, adjacentFeature } from './ui.js';
import { render } from './rendering.js';
import { playerAttack, endStealth, stealthDetectChance, inCombatProximity,
         toggleStealth, monsterMelee, rollHit } from './combat.js';

// Forward references — set by main.js
let _onPlayerDeathCallback = null;
export function setOnPlayerDeathCallback(fn){ _onPlayerDeathCallback = fn; }
let _useActionCallback = null;
export function setUseActionCallback(fn){ _useActionCallback = fn; }

function monstersHere(){ return monsters[state.player.layer]; }

function attemptMove(dx, dy){
  const nx = state.player.x + dx, ny = state.player.y + dy;
  if (!inBounds(state.player.layer, nx, ny)){ log('The world ends here.', 'muted'); return; }
  const mon = monsterAt(nx, ny, state.player.layer);
  if (mon){ const didHit = playerAttack(mon); endPlayerTurn(didHit ? 'attack' : 'miss'); return; }
  const t = worlds[state.player.layer][ny][nx];
  if (!isWalkable(t)){ log(`Blocked by ${terrainName(t)}.`, 'muted'); return; }
  // Disengage check: moving away from adjacent alert enemies requires DEX+INT check
  const adjAlerted = monstersHere().filter(m =>
    m.hp > 0 && m.alerted && m.aiState === 'chase' && chebyshev(m.x,m.y,state.player.x,state.player.y) <= 1
  );
  if (adjAlerted.length > 0){
    // 50% DEX + 50% INT vs monster's perception
    const dex = effectiveDex(player);
    const fleeSkill = (dex * 3 + state.player.int * 3) / 2;
    const hardest = Math.max(...adjAlerted.map(m => m.percept));
    const fleeChance = Math.min(90, Math.max(15, 40 + fleeSkill - hardest));
    if (roll100() > fleeChance){
      log('An enemy blocks your retreat!', 'warn');
      // Enemy gets a free swing
      const blocker = adjAlerted[0];
      monsterMelee(blocker);
      endPlayerTurn('move');
      return;
    }
  }
  state.player.x = nx; state.player.y = ny;
  // Announce any feature here
  const f = getFeature(state.player.layer, nx, ny);
  if (f){
    if (f.type === 'sign') log('A signpost — press R to read.', 'muted');
    else if (f.type === 'npc'){ const n=NPCS[f.npcKey]; log(`${n.name} stands here. Press R.`, 'muted'); }
    else if (f.type === 'town') log(`Gates of ${TOWNS[f.townKey].name}. Press R to enter.`, 'muted');
    else if (f.type === 'castle') log(`${f.name}. Press R.`, 'muted');
    else if (f.type === 'stairs') log(`Stairs ${f.dir}. Press R.`, 'muted');
    else if (f.type === 'chest') log('A chest. Press R.', 'muted');
    else if (f.type === 'book') log('A book. Press R to pick up.', 'muted');
    else if (f.type === 'gate') log('Town gate. Press R to leave.', 'muted');
    else if (f.type === 'shop_building') log(`${f.name}. Press R to enter.`, 'muted');
    else if (f.type === 'well') log('A well. Press R.', 'muted');
    else if (f.type === 'home') log('A home. Press R to knock.', 'muted');
    else if (f.type === 'throne') log('A throne of bone and crowns.', 'warn');
  }
  endPlayerTurn('move');
}

function restAction(){
  // Rest converts FED into HP. CON reduces hunger cost by 5% per rank.
  const amt = restHealAmount(player);
  if (amt > 0 && state.player.hp < state.player.hpMax && state.player.fed > 0){
    const want = Math.min(state.player.hpMax - state.player.hp, amt);
    const actual = Math.min(want, state.player.fed);  // can only convert what's in belly
    state.player.hp += actual;
    // CON reduces rest hunger cost: 5% reduction per CON point (CON 10 = 50% cost)
    const hungerReduction = 1 - (state.player.con * 0.05);
    const hungerCost = randomRound(actual * hungerReduction);
    state.player.fed -= Math.min(hungerCost, state.player.fed);
    if (actual > 0) log(`You rest. [+${actual} HP · -${hungerCost} FED]`, 'muted');
    else log('You wait.', 'muted');
  } else if (state.player.fed <= 0){
    log('You cannot rest on an empty stomach.', 'warn');
  } else if (state.player.hp >= state.player.hpMax){
    log('You wait.', 'muted');
  } else {
    log('You rest briefly.', 'muted');
  }
  endPlayerTurn('rest');
}

function eatBest(){
  // Pick the food that best fills FED without wasting too much.
  const deficit = 100 - state.player.fed;
  const foodItems = state.player.inventory
    .map((it,idx) => it.kind==='food' ? {it,idx,fed:FOOD[it.key].fed} : null)
    .filter(Boolean);
  if (!foodItems.length){ log('You have no food.', 'warn'); return; }
  if (deficit <= 0){ log('Your belly is full.', 'muted'); return; }
  foodItems.sort((a,b) => a.fed - b.fed);
  const pick = foodItems.find(f => f.fed >= deficit) || foodItems[foodItems.length-1];
  eatItem(pick.idx);
}

function eatItem(idx){
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'food') return;
  const f = FOOD[it.key];
  const before = state.player.fed;
  const gain = Math.round(f.fed * foodFedMul(player));
  state.player.fed = Math.min(100, state.player.fed + gain);
  const gained = state.player.fed - before;
  log(`You eat ${f.name}. [+${gained} FED]`, 'hit');
  state.player.inventory.splice(idx, 1);  // no stacking — remove the item
  endPlayerTurn('rest');
}

function usePotion(idx){
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'potion') return;
  const p = POTIONS[it.key];
  if (p.heal){
    const heal = Math.min(state.player.hpMax - state.player.hp, p.heal);
    state.player.hp += heal;
    log(`You drink the ${p.name}. [+${heal} HP]`, 'hit');
  }
  if (p.cure){
    const before = state.player.effects.length;
    state.player.effects = state.player.effects.filter(e => e.type !== p.cure);
    if (state.player.effects.length < before) log(`The ${p.cure} subsides.`, 'hit');
    else log(`The ${p.name} tastes bitter.`, 'muted');
  }
  state.player.inventory.splice(idx, 1);  // no stacking
  endPlayerTurn('rest');
}

// readBook lives in interactions.js (needs openBook)

function dropItem(idx){
  state.player.inventory.splice(idx, 1);
  updateUI();
}

// ==================== TURN + ENEMY AI ====================
let turnCount = 0;

// FED drain per action type
// rest = 0.25, move = 1, attack = 2  (scaled as "1/4 rate for rest" per spec)
// Applied as tenths so we can do fractional without real decimals: drain = 10 * multiplier
// We'll track fedProgress (0..99) and deduct 1 FED when it rolls over.
function fedDrainFor(action){
  if (action === 'rest') return 2;
  if (action === 'move') return 0.5625;   // was 0.75, reduced 25%
  if (action === 'attack') return 9;      // was 18, reduced 50%
  if (action === 'miss') return 9;        // was 18, reduced 50%
  return 1;
}

function endPlayerTurn(action){
  turnCount++;
  // Drain FED based on action (scaled; 1 FED per accumulated 100)
  state.player.fedProgress = (state.player.fedProgress||0) + fedDrainFor(action||'move');
  while (state.player.fedProgress >= 10 && state.player.fed > 0){
    state.player.fed = Math.max(0, state.player.fed - 1);
    state.player.fedProgress -= 10;
  }
  if (state.player.fed === 15 && !state.player._warnedHungry){
    log('You grow hungry.', 'warn'); state.player._warnedHungry = true;
  }
  if (state.player.fed > 15) state.player._warnedHungry = false;

  // Starvation: FED=0 drains HP slowly
  if (state.player.fed === 0){
    state.player.starveTurns = (state.player.starveTurns||0) + 1;
    if (state.player.starveTurns >= 3){  // 1 HP per 3 turns of starvation
      state.player.starveTurns = 0;
      if (state.player.hp > 1){
        state.player.hp -= 1;
        log('Starvation wears you down.', 'warn');
      } else {
        log('You cannot go on like this...', 'warn');
      }
    }
  } else {
    state.player.starveTurns = 0;
  }

  // Passive regen — scales linearly with CON, all values get regen
  // Passive healing does NOT drain FED
  const iv = passiveRegenInterval(player);
  if (state.player.fed > 0 && state.player.hp < state.player.hpMax){
    state.player.regenProgress = (state.player.regenProgress||0) + 1;
    if (state.player.regenProgress >= iv){
      state.player.hp = Math.min(state.player.hpMax, state.player.hp + 1);
      state.player.regenProgress = 0;
    }
  }

  // Player effects tick
  state.player.effects = state.player.effects.filter(e => {
    if (e.type === 'stealth') return true;
    if (e.type === 'poison'){
      const resist = poisonResistance(player);
      const reduction = 1 - resist.damageReduction;
      // % max HP damage
      const pctDmg = Math.max(0, Math.round((e.percentDmg || 0.03) * state.player.hpMax * reduction));
      // Flat damage
      const flatDmg = Math.max(0, Math.round((e.flatDmg || 1) * reduction));
      const totalPoisonDmg = Math.max(1, pctDmg + flatDmg);
      if (state.player.hp > 1){
        state.player.hp = Math.max(1, state.player.hp - totalPoisonDmg);
        log(`Poison bites. [-${totalPoisonDmg} HP]`, 'dmg');
      }
    }
    e.turns--;
    return e.turns > 0;
  });

  // Enemies act — only on current layer, town cells are safe
  if (!isTownCell(state.player.layer)){
    const mons = monstersHere();
    for (const m of mons){
      if (m.hp <= 0) continue;
      enemyAct(m);
      if (state.player.hp <= 0){ _onPlayerDeathCallback && _onPlayerDeathCallback(); return; }
    }
  }
  for (let layer=0; layer<monsters.length; layer++){
    monsters[layer] = monsters[layer].filter(m => m.hp > 0);
  }
  render();
}

/*
  Enemy AI state machine:
  - idle:   creature is at home, wandering occasionally. Transitions to chase when it sees/is-hit-by state.player.
  - chase:  actively pursuing. Tracks lastSeen position.
  - search: only for enemies with search > 0 (smarter ones). Pokes around last-known location.
  Territory: creatures give up chase if player leaves their biome AND creature has wandered off home.
  Stealth: reduces detection chance, especially at range.
*/
function playerInTerritory(mon){
  // Check: is player currently in a tile type considered "home" for this monster?
  if (!mon.territory || !mon.territory.length) return true;
  if (!inBounds(state.player.layer, state.player.x, state.player.y)) return false;
  const pt = worlds[state.player.layer][state.player.y][state.player.x];
  return mon.territory.includes(pt);
}

function monInOwnTerritory(mon){
  if (!mon.territory || !mon.territory.length) return true;
  const mt = worlds[state.player.layer][mon.y][mon.x];
  return mon.territory.includes(mt);
}

// True if monster currently has "line of sight" to player:
// simple check — within perception range and player is in monster's territory OR very close
function canSeePlayer(mon){
  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);
  if (d > Math.max(mon.aggroRange * 2, 8)) return false;
  // Stealth obscures distant detection even when alerted — closer = harder to hide
  if (state.player.stealth && d > 1){
    const chance = stealthDetectChance(mon);
    return roll100() <= chance;
  }
  return true;
}

function enemyAct(mon){
  // Speed system — accumulate energy, act only when >= 100
  mon.energy = (mon.energy || 0) + (mon.speed || 60);
  if (mon.energy < 100) return;
  mon.energy -= 100;

  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);

  // Eels always heal +1 HP in water per turn
  if (mon.mods && mon.mods.waterHeal && mon.hp < mon.hpMax){
    const mt = inBounds(state.player.layer, mon.x, mon.y) ? worlds[state.player.layer][mon.y][mon.x] : -1;
    if (mt === T.WATER || mt === T.UWATER || mt === T.BEACH){
      mon.hp = Math.min(mon.hpMax, mon.hp + 1);
    }
  }

  // Rock golem 'still' personality — won't move until it has taken 10% max HP damage
  if (mon.personality === 'still' && mon.key === 'rock_golem'){
    if (mon.damageTaken < mon.hpMax * 0.10){
      // Just stand there. If player adjacent, attack but don't move
      if (d <= 1 && mon.wasAttacked){ monsterMelee(mon); }
      return;
    }
    // Once threshold met, act normally (becomes 'active' effectively)
  }

  // Rock golem 'roaming' personality — peacefully wanders, doesn't attack unless hit
  if (mon.personality === 'roaming' && mon.key === 'rock_golem' && !mon.wasAttacked){
    if (rand() < 0.15) wanderInTerritory(mon);
    return;
  }

  // Wolf 'skittish' personality — flee at low HP
  if (mon.personality === 'skittish' && (mon.key === 'wolf' || mon.key === 'dire_wolf')){
    if (mon.hp < mon.hpMax * 0.3 && d <= 3){
      // Run away from player
      const fdx = Math.sign(mon.x - state.player.x);
      const fdy = Math.sign(mon.y - state.player.y);
      const nx = mon.x + (fdx || (rand()<0.5?1:-1));
      const ny = mon.y + (fdy || (rand()<0.5?1:-1));
      if (inBounds(state.player.layer, nx, ny) && isWalkable(worlds[state.player.layer][ny][nx]) && !monsterAt(nx,ny,state.player.layer)){
        mon.x = nx; mon.y = ny;
      }
      return;
    }
  }

  // Wolf pair bonding — try to stay within 3 tiles of partner
  if (mon.personality === 'pair_bond' && mon.bondPartner){
    const partner = mon.bondPartner;
    if (partner.hp > 0){
      const pd = chebyshev(mon.x, mon.y, partner.x, partner.y);
      if (pd > 3 && mon.aiState === 'idle' && rand() < 0.6){
        moveMonsterToward(mon, partner.x, partner.y);
        return;
      }
      // If partner is in combat, join
      if (partner.alerted && partner.aiState === 'chase' && !mon.alerted){
        mon.alerted = true;
        mon.aiState = 'chase';
        mon.chaseTurnsLeft = mon.chase;
        mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      }
    }
  }

  // Goblin 'wary' — won't attack alone, needs another goblin nearby
  if (mon.personality === 'wary' && mon.key === 'goblin' && mon.aiState === 'idle'){
    const nearGoblins = monstersHere().filter(m =>
      m.hp > 0 && m.key === 'goblin' && m !== mon && chebyshev(m.x,m.y,mon.x,mon.y) <= 4
    );
    if (nearGoblins.length === 0 && !mon.wasAttacked){
      if (rand() < 0.15) wanderInTerritory(mon);
      return;
    }
  }

  // Goblin/wolf 'leader' — when entering combat, alert nearby same-type
  if (mon.personality === 'leader' && mon.aiState === 'chase' && mon.alerted){
    const followerType = mon.key;
    for (const m of monstersHere()){
      if (m.hp <= 0 || m === mon || m.key !== followerType) continue;
      if (chebyshev(m.x,m.y,mon.x,mon.y) <= 6 && !m.alerted){
        m.alerted = true;
        m.aiState = 'chase';
        m.chaseTurnsLeft = m.chase;
        m.lastSeenX = state.player.x; m.lastSeenY = state.player.y;
      }
    }
  }

  // Treant 'dormant' — won't respond to nearby treant combat, only direct hits
  if (mon.personality === 'dormant' && mon.key === 'treant' && !mon.wasAttacked){
    if (rand() < 0.08) wanderInTerritory(mon);
    return;
  }

  // ====== IDLE STATE ======
  if (mon.aiState === 'idle'){
    // If attacked, ALWAYS transition to chase regardless of biome/territory
    if (mon.wasAttacked){
      mon.aiState = 'chase';
      mon.alerted = true;
      mon.chaseTurnsLeft = mon.chase;
      mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      // fall through to chase logic below
    } else {
    // Passive creatures ignore player unless attacked (handled above)
    if (mon.hostility === 0){
      // Treants regen in forest when idle and not alerted (CON-based rest healing)
      if (mon.key === 'treant' && !mon.alerted && mon.hp < mon.hpMax){
        const mt = worlds[state.player.layer][mon.y][mon.x];
        if (mt === T.FOREST){
          const heal = restHealAmount(mon);
          if (heal > 0) mon.hp = Math.min(mon.hpMax, mon.hp + heal);
        }
      }
      // Mushrooms: passive but slowly encircle player when nearby, then attack as group
      if (mon.key === 'mushroom'){
        mushroomPackAI(mon);
        return;
      }
      if (rand() < 0.15) wanderInTerritory(mon);
      return;
    }
    // Territorial: only engage if player is within aggro AND in their territory
    if (mon.hostility === 1){
      if (d > mon.aggroRange || !playerInTerritory(mon)){
        if (rand() < 0.15) wanderInTerritory(mon);
        return;
      }
    }
    // Aggressive: engage if within aggroRange (territory check relaxed — still prefer home)
    if (mon.hostility === 2){
      if (d > mon.aggroRange){
        if (rand() < 0.2) wanderInTerritory(mon);
        return;
      }
      // Won't chase into foreign biome unless player is VERY close
      if (!playerInTerritory(mon) && d > 3){
        if (rand() < 0.15) wanderInTerritory(mon);
        return;
      }
    }
    // Check stealth
    if (state.player.stealth && d > 1){
      const chance = stealthDetectChance(mon);
      if (roll100() > chance){
        if (rand() < 0.2) wanderInTerritory(mon);
        return;
      }
      log(`${mon.name} spotted you!`, 'warn');
    }
    // Transition to chase
    mon.aiState = 'chase';
    mon.alerted = true;
    mon.chaseTurnsLeft = mon.chase;
    mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
    } // end else (not wasAttacked)
  }

  // ====== CHASE STATE ======
  if (mon.aiState === 'chase'){
    // If player left monster's territory and monster is aggressive (not persistent like boss),
    // give up if monster has already moved out of home biome
    // BUT: if monster was attacked, don't give up while close to the attacker
    // Treants NEVER leave forest, even when attacked
    if (mon.key === 'treant' && !monInOwnTerritory(mon)){
      if (d <= 8) log(`${mon.name} retreats into the trees.`, 'muted');
      mon.aiState = 'idle';
      mon.alerted = false;
      mon.wasAttacked = false;
      mon.chaseTurnsLeft = 0;
      mon.searchTurnsLeft = 0;
      return;
    }
    if (!playerInTerritory(mon) && !monInOwnTerritory(mon) && mon.chase < 99){
      if (!mon.wasAttacked || d > 2){
        if (d <= 8) log(`${mon.name} turns back.`, 'muted');
        mon.aiState = 'idle';
        mon.alerted = false;
        mon.chaseTurnsLeft = 0;
        mon.searchTurnsLeft = 0;
        return;
      }
    }
    if (canSeePlayer(mon)){
      mon.chaseTurnsLeft = mon.chase;  // refresh on sight
      mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      if (d <= 1){ monsterMelee(mon); return; }
      moveMonsterToward(mon, state.player.x, state.player.y);
      return;
    }
    // Lost sight
    mon.chaseTurnsLeft--;
    if (mon.chaseTurnsLeft > 0){
      // Move toward last known position
      if (mon.lastSeenX >= 0){
        if (mon.x === mon.lastSeenX && mon.y === mon.lastSeenY){
          // Reached it — transition to search if smart
          if (mon.search > 0){
            mon.aiState = 'search';
            mon.searchTurnsLeft = mon.search;
          } else {
            mon.aiState = 'idle';
            mon.alerted = false;
          }
        } else {
          moveMonsterToward(mon, mon.lastSeenX, mon.lastSeenY);
        }
        return;
      }
    }
    // Chase expired
    if (mon.search > 0){
      mon.aiState = 'search';
      mon.searchTurnsLeft = mon.search;
    } else {
      mon.aiState = 'idle';
      mon.alerted = false;
    }
    return;
  }

  // ====== SEARCH STATE ======
  if (mon.aiState === 'search'){
    if (canSeePlayer(mon)){
      // Re-acquired — back to chase
      mon.aiState = 'chase';
      mon.chaseTurnsLeft = mon.chase;
      mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      return;
    }
    mon.searchTurnsLeft--;
    if (mon.searchTurnsLeft <= 0){
      mon.aiState = 'idle';
      mon.alerted = false;
      return;
    }
    // Wander — slightly toward last known spot but with randomness
    if (rand() < 0.5 && mon.lastSeenX >= 0){
      moveMonsterToward(mon, mon.lastSeenX, mon.lastSeenY);
    } else {
      wanderInTerritory(mon);
    }
  }
}

// Mushroom pack AI — individuals flee, groups encircle, then attack
function mushroomPackAI(mon){
  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);
  // If far from player, wander normally
  if (d > 8){ wanderInTerritory(mon); return; }
  // Count nearby mushrooms
  const nearMushrooms = monstersHere().filter(m =>
    m.hp > 0 && m.key === 'mushroom' && chebyshev(m.x,m.y,state.player.x,state.player.y) <= 6
  );
  // INDIVIDUAL BEHAVIOR: if alone or few nearby, flee from player when approached
  if (nearMushrooms.length < 3){
    if (d <= 3){
      // Flee! Run away from player
      const fdx = Math.sign(mon.x - state.player.x);
      const fdy = Math.sign(mon.y - state.player.y);
      const nx = mon.x + (fdx || (rand()<0.5?1:-1));
      const ny = mon.y + (fdy || (rand()<0.5?1:-1));
      if (inBounds(state.player.layer, nx, ny) && isWalkable(worlds[state.player.layer][ny][nx])
          && !monsterAt(nx,ny,state.player.layer) && !(nx===state.player.x && ny===state.player.y)){
        mon.x = nx; mon.y = ny;
      } else {
        wanderInTerritory(mon);
      }
      return;
    }
    // Not too close, just wander
    if (rand() < 0.2) wanderInTerritory(mon);
    return;
  }
  // GROUP BEHAVIOR: enough mushrooms — slowly move to encircle
  if (d > 2){
    // Move toward player but offset to encircle
    const angle = Math.atan2(state.player.y - mon.y, state.player.x - mon.x);
    const offset = (mon.x * 31 + mon.y * 17) % 4; // consistent offset per mushroom
    const targetAngle = angle + (offset - 1.5) * 0.8;
    const targetD = 2; // desired distance
    const tx = state.player.x - Math.round(Math.cos(targetAngle) * targetD);
    const ty = state.player.y - Math.round(Math.sin(targetAngle) * targetD);
    if (rand() < 0.4) moveMonsterToward(mon, tx, ty);
    return;
  }
  // Check if enough mushrooms are nearby and in position to attack
  const ringMushrooms = monstersHere().filter(m =>
    m.hp > 0 && m.key === 'mushroom' && chebyshev(m.x,m.y,state.player.x,state.player.y) <= 3
  );
  if (ringMushrooms.length >= 3 || (d <= 1 && ringMushrooms.length >= 2)){
    // Group attack! All nearby mushrooms become aggressive
    for (const m of ringMushrooms){
      m.alerted = true;
      m.wasAttacked = true;
      m.aiState = 'chase';
      m.chaseTurnsLeft = m.chase + 5;
      m.lastSeenX = state.player.x; m.lastSeenY = state.player.y;
    }
    if (d <= 1){
      monsterMelee(mon);
    } else {
      moveMonsterToward(mon, state.player.x, state.player.y);
    }
    if (ringMushrooms.length >= 3) log('The mushrooms close in!', 'warn');
    return;
  }
  // Not enough yet, keep circling — but don't attack individually
  if (rand() < 0.3) moveMonsterToward(mon, state.player.x, state.player.y);
}

// Wander only within territory if possible
function wanderInTerritory(mon){
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  // Shuffle
  for (let i=dirs.length-1;i>0;i--){ const j=randi(i+1); [dirs[i],dirs[j]]=[dirs[j],dirs[i]]; }
  for (const [dx,dy] of dirs){
    const nx = mon.x+dx, ny = mon.y+dy;
    if (!inBounds(state.player.layer, nx, ny)) continue;
    const nt = worlds[state.player.layer][ny][nx];
    if (!isWalkable(nt)) continue;
    if (monsterAt(nx, ny, state.player.layer)) continue;
    if (nx === state.player.x && ny === state.player.y) continue;
    // Prefer staying in home territory
    if (mon.territory.length && !mon.territory.includes(nt) && rand() < 0.7) continue;
    mon.x = nx; mon.y = ny;
    return;
  }
}

function moveMonsterToward(mon, tx, ty){
  const dx = Math.sign(tx - mon.x);
  const dy = Math.sign(ty - mon.y);
  const attempts = [];
  if (dx !== 0 && dy !== 0) attempts.push([dx,dy],[dx,0],[0,dy]);
  else if (dx !== 0) attempts.push([dx,0],[dx,1],[dx,-1]);
  else attempts.push([0,dy],[1,dy],[-1,dy]);
  for (const [ax,ay] of attempts){
    const nx = mon.x+ax, ny = mon.y+ay;
    if (!inBounds(state.player.layer, nx, ny)) continue;
    if (!isWalkable(worlds[state.player.layer][ny][nx])) continue;
    if (nx === state.player.x && ny === state.player.y){ monsterMelee(mon); return; }
    if (monsterAt(nx, ny, state.player.layer)) continue;
    mon.x = nx; mon.y = ny;
    return;
  }
}

// Old alias kept for compatibility (if anywhere else calls it)
function wanderMonster(mon){ wanderInTerritory(mon); }
function moveMonsterTowardPlayer(mon){ moveMonsterToward(mon, state.player.x, state.player.y); }

function monsterMelee(mon){
  const acc = monAcc(mon);
  const dodge = playerDodge(player);
  if (!rollHit(acc, dodge)){
    log(`${mon.name} misses.`, 'muted');
    return;
  }
  let base = monDamage(mon) + randi(3);
  const crit = roll100() <= monCritChance(mon);
  if (crit) base = Math.floor(base * monCritMult(mon));
  const effDef = Math.max(0, playerDef(player));
  let dmg = Math.max(1, base - effDef);
  state.player.hp -= dmg;
  state.player.hitFlash = 3;
  if (crit) log(`${mon.name} CRITS you for ${dmg} ${mon.dmgType}!`, 'crit');
  else log(`${mon.name} hits you for ${dmg} ${mon.dmgType}.`, 'dmg');
  // Poison application — probability reduced by 75% CON / 25% STR
  if (mon.dmgType === DMG.POISON){
    const poisonResist = poisonResistance(player);
    const baseChance = 60;  // base 60% chance to poison
    const poisonChance = Math.max(5, baseChance - poisonResist.chanceReduction);
    if (roll100() <= poisonChance){
      // Poison stacks — each stack is independent
      state.player.effects.push({
        type:'poison',
        turns: Math.max(2, 5 - Math.floor(poisonResist.durationReduction)),
        percentDmg: 0.03,   // 3% max HP per tick
        flatDmg: 1,         // +1 flat per tick
      });
      const stacks = state.player.effects.filter(e => e.type === 'poison').length;
      if (stacks === 1) log('You are poisoned!', 'warn');
      else log(`Poison stacks! (×${stacks})`, 'warn');
    }
  }
  if (state.player.stealth) endStealth('Your cover is blown!');
}


export { attemptMove, restAction, eatBest, eatItem, usePotion, dropItem,
         endPlayerTurn, enemyAct, fedDrainFor,
         wanderInTerritory, moveMonsterToward, wanderMonster, moveMonsterTowardPlayer,
         playerInTerritory, monInOwnTerritory, canSeePlayer, mushroomPackAI };
