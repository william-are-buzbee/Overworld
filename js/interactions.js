// ==================== USE / INTERACT — core hub ====================
import { state, worlds, covers, features, monsters } from './state.js';
import { DMG, resistMult, LAYER_SURFACE, LAYER_UNDER, W_SURF, H_SURF } from './constants.js';
import { T, terrainName, coverBonus } from './terrain.js';
import { rand, randi, choice } from './rng.js';
import { FOOD, POTIONS, BOOKS, findWeapon, findArmor } from './items.js';
import { INV_SLOTS, carryCapacity, totalWeight, overWeight, bagFull, addItem,
         defaultWeight, deriveHP,
         playerMelee, effectiveAP, playerDef, playerAcc, playerDodge,
         stealthBonus, poisonResistance } from './player.js';
import { monDodge, monAcc, monDamage, spawnMonster } from './monsters.js';
import { inBounds, monsterAt, chebyshev, getFeature, setFeature, fkey,
         getCover, setCover } from './world-state.js';
import { log, LOG_CATEGORIES } from './log.js';
import { openModal, closeModal, showModal, modalEl } from './modal.js';
import { updateUI, interactable, adjacentFeature, effectLabel } from './ui.js';
import { render } from './rendering.js';
import { endPlayerTurn } from './enemy-ai.js';
import { updatePlayerFOV } from './fov.js';

import { teleportPlayer } from './world-gen.js';

function monstersHere(){ return monsters[state.player.layer]; }

// ==================== USE / INTERACT ====================
function useAction(){
  const player = state.player;
  const here = getFeature(state.player.layer, state.player.x, state.player.y);
  if (here && interactable(here)){ interact(here, state.player.x, state.player.y); return; }
  const adj = adjacentFeature();
  if (adj){ interact(adj.f, adj.x, adj.y); return; }
  log('Nothing to use here.', LOG_CATEGORIES.INTERACTION);
}


function interact(f, x, y){
  switch(f.type){
    case 'sign':
      openModal(`<h2>Signpost</h2><div class="dialogue" style="white-space:pre-line;">${f.text}</div><div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`);
      document.getElementById('btn-close').onclick = closeModal; break;
    // DORMANT: Underground layer transitions — reactivate when underground is reimplemented
    // case 'stairs': useStairs(f); break;
    case 'chest': openChest(f, x, y); break;
    case 'book': pickUpBook(f, x, y); break;
    case 'well':
      openModal(`<h2>Well</h2><div class="dialogue">${f.text||'A town well. The water is cool. It does not mend you.'}</div><div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`);
      document.getElementById('btn-close').onclick = closeModal;
      break;
    case 'home':
      openModal(`<h2>Home</h2><div class="dialogue">${f.text||'A quiet home. No one answers.'}</div><div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`);
      document.getElementById('btn-close').onclick = closeModal; break;
  }
}


// DORMANT: Underground layer transitions — reactivate when underground is reimplemented
// function useStairs(f){
//   // Safety: skip if target layer or coordinates are missing (e.g. removed structures)
//   if (f.targetLayer == null || f.targetX == null || f.targetY == null) {
//     log('These stairs lead nowhere.', 'muted');
//     return;
//   }
//   teleportPlayer(f.targetLayer, f.targetX, f.targetY);
//   log(f.dir === 'down' ? 'You descend into the dark.' : 'You climb up to the world.', 'warn');
//   updatePlayerFOV();  // compute FOV for new layer before render
//   render();
//   endPlayerTurn('move');
// }
// 
// setUseStairs(useStairs);

function pickUpBook(f, x, y){
  const player = state.player;
  const result = addItem(player, {kind:'book', key:f.bookKey});
  if (result === 'full'){ log('Your bag is full.', LOG_CATEGORIES.INTERACTION); return; }
  if (result === 'heavy'){ log("It's too heavy to carry.", LOG_CATEGORIES.INTERACTION); return; }
  log(`You pick up "${BOOKS[f.bookKey].name}".`, LOG_CATEGORIES.INTERACTION);
  delete features[state.player.layer][fkey(x,y)];
  // Clear cover, keep ground
  setCover(state.player.layer, x, y, 0);
  updateUI();
}

function openBook(bookKey, fromInventory, invIdx){
  const player = state.player;
  const b = BOOKS[bookKey];
  let html = `<h2>${b.name}</h2>`;
  html += `<div class="book-text">${b.text}</div>`;
  if (fromInventory && state.player.central >= b.intReq && !state.player.booksRead.has(bookKey)){
    html += `<div class="shop-h">Knowledge</div>`;
    html += `<div class="dialogue" style="font-style:normal;font-size:10px;color:#a8c8e0;">${b.summary}</div>`;
  }
  html += `<div class="close-row">`;
  if (fromInventory && state.player.central >= b.intReq && !state.player.booksRead.has(bookKey)){
    html += `<button class="btn primary" id="btn-read">ABSORB</button> `;
  }
  html += `<button class="btn" id="btn-close">CLOSE</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
  const readBtn = document.getElementById('btn-read');
  if (readBtn){
    readBtn.onclick = () => {
      state.player.perks[b.perk] = true;
      state.player.booksRead.add(bookKey);
      if (b.perk === 'hp_bonus'){
        const old = state.player.hpMax;
        state.player.hpMax = deriveHP(player);
        state.player.hp += (state.player.hpMax - old);
      }
      log(`You read "${b.name}". ${b.summary}`, LOG_CATEGORIES.INTERACTION);
      if (invIdx != null) state.player.inventory.splice(invIdx, 1);
      closeModal();
    };
  }
}

function openChest(f, x, y){
  const player = state.player;
  const c = f.contents;
  const mi = document.getElementById('modal-inner');
  let html = `<h2>Chest</h2>`;
  if (c.type === 'weapon'){
    const w = findWeapon(c.key);
    html += `<div class="row">
      <div class="lbl">A <b>${w.name}</b><div class="sub">[${w.type}${w.elem?'+'+w.elem:''}] ATK+${w.atk} · wt ${defaultWeight({kind:'weapon',key:c.key})}</div></div>
      <button data-act="take">TAKE</button><button data-act="leave">LEAVE</button>
    </div>`;
  } else if (c.type === 'armor'){
    const a = findArmor(c.key);
    html += `<div class="row">
      <div class="lbl"><b>${a.name}</b><div class="sub">DEF+${a.def}${a.dodgePenalty?` -${a.dodgePenalty}% dodge`:''} · wt ${defaultWeight({kind:'armor',key:c.key})}</div></div>
      <button data-act="take">TAKE</button><button data-act="leave">LEAVE</button>
    </div>`;
  } else if (c.type === 'food'){
    const fd = FOOD[c.key];
    html += `<div class="row">
      <div class="lbl"><b>${fd.name}</b><div class="sub">+${fd.fed} FED</div></div>
      <button data-act="take">TAKE</button><button data-act="leave">LEAVE</button>
    </div>`;
  } else if (c.type === 'potion'){
    const p = POTIONS[c.key];
    html += `<div class="row">
      <div class="lbl"><b>${p.name}</b><div class="sub">${p.desc}</div></div>
      <button data-act="take">TAKE</button><button data-act="leave">LEAVE</button>
    </div>`;
  } else if (c.type === 'gold'){
    state.player.gold += c.amount;
    log(`${c.amount} gold.`, LOG_CATEGORIES.INTERACTION);
    consumeFeature(x,y);
    return;
  }
  html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;
  mi.innerHTML = html;
  showModal();
  mi.querySelectorAll('button[data-act]').forEach(b => b.onclick = () => {
    if (b.dataset.act === 'take'){
      let item = null;
      if (c.type === 'weapon') item = {kind:'weapon', key:c.key};
      else if (c.type === 'armor') item = {kind:'armor', key:c.key};
      else if (c.type === 'food')  item = {kind:'food', key:c.key};
      else if (c.type === 'potion')item = {kind:'potion', key:c.key};
      if (item){
        const result = addItem(player, item);
        if (result === 'full'){ log('Your bag is full.', LOG_CATEGORIES.INTERACTION); return; }
        if (result === 'heavy'){ log("It's too heavy to carry.", LOG_CATEGORIES.INTERACTION); return; }
        const name = c.type === 'weapon' ? findWeapon(c.key).name
                   : c.type === 'armor'  ? findArmor(c.key).name
                   : c.type === 'food'   ? FOOD[c.key].name
                   : POTIONS[c.key].name;
        log(`Took ${name}.`, LOG_CATEGORIES.INTERACTION);
      }
      consumeFeature(x,y);
    } else consumeFeature(x,y);
    closeModal();
  });
  document.getElementById('btn-close').onclick = closeModal;
}

function consumeFeature(x,y){
  delete features[state.player.layer][fkey(x,y)];
  // Clear cover, keep ground
  setCover(state.player.layer, x, y, 0);
  updateUI();
}

// ==================== HELP / EXAMINE ====================
function showHelp(){
  const sec = (title, body) =>
    `<div class="shop-h">${title}</div><div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">${body}</div>`;
  let html = `<h2>Field Manual</h2>`;
  html += sec('Controls', `
    <b>QWE/ASD/ZXC</b>, arrows or numpad · move (8 directions)<br>
    <b>SHIFT</b>+direction · sprint &nbsp;·&nbsp; <b>ALT</b>+direction · turn in place<br>
    <b>SPACE</b> or <b>S</b> · wait / rest<br>
    <b>CLICK</b> a tile · step or attack toward it &nbsp;·&nbsp; <b>RIGHT-CLICK</b> · examine<br>
    <b>L</b> then a direction · look at a tile<br>
    <b>V</b> · sniff the ground &nbsp;·&nbsp; <b>SHIFT+V</b> · sniff the air<br>
    <b>R</b> · eat the corpse you are standing on &nbsp;·&nbsp; <b>G</b> · pick up<br>
    <b>F</b> · toggle sneaking<br>
    <b>M</b> · world map &nbsp;·&nbsp; <b>T</b> · full / minimal status &nbsp;·&nbsp; <b>TAB</b> · hide the log<br>
    <b>+ / −</b> · zoom &nbsp;·&nbsp; <b>[ / ]</b> · UI scale &nbsp;·&nbsp; <b>P</b> · sprite pack &nbsp;·&nbsp; <b>ALT+T</b> · textures<br>
    <b>?</b> · this manual &nbsp;·&nbsp; <b>ESC</b> · close
  `);
  html += sec('Your body', `
    You are a body map: a head, a torso and limbs, each with its own muscle, bone, nerve and sensory tissue.
    There is no hit-point total. A strike lands on whichever zone faces the attacker and damages that zone.<br>
    Wounded zones <b>bleed</b> until they clot; the blood bar appears when you are losing blood. Lose enough and you black out.
    A destroyed head or torso kills; losing every leg leaves you unable to walk but still able to bite.<br>
    Speed is force over weight: what your legs can push divided by what you carry.
    Sprinting burns the stores in your leg muscles and they take time to refill; walking does not.
    Turning sharply costs momentum, more so for heavy bodies.
  `);
  html += sec('Senses', `
    Each zone senses on its own: eyes see, nostrils and antennae smell, feet feel ground vibration.
    Lose the zone and you lose the sense.<br>
    What you can see is your eyes' field of view; the dimmer band is what only one eye covers.
    Things you have not identified are drawn as blobs until you get a clearer signal.<br>
    Scent lies on the ground and drifts on the wind. Sniff the ground (<b>V</b>) for trails and the air (<b>SHIFT+V</b>) for what is upwind.
    Strong smells reach you unbidden.
  `);
  html += sec('Food', `
    The bar top-right is your reserve; the number is how full you are. Every action spends a little, sprinting and fighting the most.
    At zero you start to fail.<br>
    Kill something and stand on it, then <b>R</b> to eat. Resting (<b>SPACE</b>) lets wounds knit and costs food.
  `);
  html += sec('Creatures', `
    Everything out here runs on the same rules you do. Grazers freeze when they notice you and bolt when you get close;
    predators hunt what they can sense and are more careful around things their own size.
    Most creatures keep to a territory and settle back into it once you are out of their senses.<br>
    A creature that cannot see you may still smell or feel you. Standing still, downwind, behind cover helps.
  `);
  html += sec('Replaying a world', `
    Every run prints its seed in the log at the start. Add <b>?seed=&lt;that number&gt;</b> to the page address to get the same world again.
  `);
  html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
}

function examineTile(x, y){
  const player = state.player;
  if (!inBounds(state.player.layer, x, y)) return;

  // Self-inspect: right-click your own tile
  if (x === player.x && y === player.y && player.layer === state.player.layer){
    openModal(buildPlayerCard(player));
    document.getElementById('btn-close').onclick = closeModal;
    return;
  }

  const ground = worlds[state.player.layer][y][x];
  const cover = getCover(state.player.layer, x, y);
  const mon = monsterAt(x, y, state.player.layer);

  if (mon){
    openModal(buildMonsterCard(mon, player, ground, cover));
    document.getElementById('btn-close').onclick = closeModal;
    return;
  }

  // Plain terrain examine (no monster)
  const tName = terrainName(ground, cover);
  const cb = coverBonus(ground, cover);
  let html = cardCSS();
  html += `<div class="ex-card">`;
  html += `<div class="ex-header"><span class="ex-name">${tName}</span></div>`;
  if (cb){
    html += `<div class="ex-sep"></div>`;
    html += `<div class="ex-row"><span class="ex-dim">Cover</span> <span class="ex-val">+${cb} defense</span></div>`;
  }
  const f = getFeature(state.player.layer, x, y);
  if (f){
    html += `<div class="ex-sep"></div>`;
    html += `<div class="ex-row"><span class="ex-dim">${f.type}</span> <span>${f.name||''}</span></div>`;
  }
  html += `</div>`;
  html += `<div class="close-row"><button class="btn" id="btn-close">OK</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
}

// ==================== STAT CARD: EMBEDDED STYLES ====================
function cardCSS(){
  return `<style>
    .ex-card { font-size:11px; line-height:1.5; padding:4px 0; }
    .ex-card * { box-sizing:border-box; }
    .ex-header { display:flex; align-items:baseline; gap:8px; padding:2px 4px 6px; }
    .ex-name { font-size:14px; font-weight:bold; color:#e0d0b0; letter-spacing:.5px; }
    .ex-sep { height:1px; background:#555; margin:8px 0; opacity:0.6; }
    .ex-dim { color:#777; }
    .ex-val { color:#ddd; }
    .ex-row { display:flex; justify-content:space-between; align-items:baseline; padding:4px 4px; }
    .ex-pair { display:flex; justify-content:space-between; padding:4px 4px; }
    .ex-pair > span { flex:1; display:flex; gap:5px; align-items:baseline; }
    .ex-attrs { display:flex; justify-content:space-between; padding:5px 4px; font-size:11px; }
    .ex-attrs > span { display:flex; gap:4px; align-items:baseline; color:#ddd; }
    .ex-specials { padding:2px 4px; }
    .ex-special-line { color:#c8a050; font-size:10px; line-height:1.8; padding:1px 0; }
    .ex-special-line:before { content:'· '; color:#666; }
    .ex-terrain { font-size:10px; }
    .ex-terrain .ex-dim { color:#666; }
  </style>`;
}

// ==================== STAT CARD: HP BAR HELPER ====================
function hpBar(hp, hpMax, width){
  const pct = Math.max(0, Math.min(1, hp / hpMax));
  const filled = Math.round(pct * width);
  const empty  = width - filled;
  const color = pct > 0.5 ? '#6a4' : pct > 0.25 ? '#ca4' : '#c44';
  return `<span style="color:${color}">${'█'.repeat(filled)}</span><span style="color:#444">${'░'.repeat(empty)}</span>`;
}

// ==================== STAT CARD: MONSTER (INT-GATED) ====================
function buildMonsterCard(mon, player, ground, cover){
  const pCentral = player.central;
  let h = cardCSS();
  h += `<div class="ex-card">`;

  // --- Always visible: name, level, HP ---
  h += `<div class="ex-header">`;
  h += `<span class="ex-name">${mon.name}</span>`;
  h += `<span class="ex-dim">(Level ${mon.tier})</span>`;
  h += `</div>`;
  h += `<div class="ex-sep"></div>`;
  h += `<div class="ex-row"><span class="ex-dim">HP</span> ${hpBar(mon.hp, mon.hpMax, 10)} <span class="ex-val">${mon.hp}/${mon.hpMax}</span></div>`;
  h += `<div class="ex-pair">`;
  h += `<span><span class="ex-dim">ATK</span> <span class="ex-val">${monDamage(mon)}</span></span>`;
  h += `<span><span class="ex-dim">DEF</span> <span class="ex-val">${mon.def}</span></span>`;
  h += `</div>`;

  // --- Central 30+: accuracy, dodge ---
  if (pCentral >= 30){
    h += `<div class="ex-sep"></div>`;
    h += `<div class="ex-pair">`;
    h += `<span><span class="ex-dim">Accuracy</span> <span class="ex-val">${monAcc(mon)}%</span></span>`;
    h += `<span><span class="ex-dim">Dodge</span> <span class="ex-val">${Math.round(monDodge(mon))}%</span></span>`;
    h += `</div>`;
  }

  // --- Central 50+: percept, specials ---
  if (pCentral >= 50){
    h += `<div class="ex-sep"></div>`;
    h += `<div class="ex-row"><span class="ex-dim">Percept</span> <span class="ex-val">${mon.percept}</span></div>`;

    // Special abilities
    const specials = [];
    if (mon.dmgType === DMG.POISON) specials.push('Poison touch');
    if (mon.dmgType === DMG.FIRE) specials.push('Fire attack');
    if (mon.dmgType === DMG.COLD) specials.push('Cold attack');
    if (mon.dmgType === DMG.ELEC) specials.push('Electric attack');
    if (mon.mods && mon.mods.waterHeal) specials.push('Water healing');
    if (mon.mods && mon.mods.blindsight) specials.push(`Blindsight (${mon.mods.blindsight})`);
    const dtypes = [DMG.BLADE, DMG.BLUNT, DMG.FIRE, DMG.COLD, DMG.ELEC, DMG.POISON];
    const weaks  = dtypes.map(d => ({d, m:resistMult(mon.tags, d)}));
    const weakTo  = weaks.filter(w => w.m >= 1.3 && w.m !== 0).map(w => w.d);
    const resists = weaks.filter(w => w.m < 1 && w.m > 0 && w.m <= 0.7).map(w => w.d);
    const immune  = weaks.filter(w => w.m === 0).map(w => w.d);
    if (weakTo.length)  specials.push(`<span style="color:#e0a060">Weak: ${weakTo.join(', ')}</span>`);
    if (resists.length) specials.push(`<span style="color:#888">Resist: ${resists.join(', ')}</span>`);
    if (immune.length)  specials.push(`<span style="color:#555">Immune: ${immune.join(', ')}</span>`);

    if (specials.length){
      h += `<div class="ex-sep"></div>`;
      h += `<div class="ex-specials">`;
      for (const s of specials) h += `<div class="ex-special-line">${s}</div>`;
      h += `</div>`;
    }
  }

  // --- Central 70+: behavior, leash, biome, night vision ---
  if (pCentral >= 70){
    h += `<div class="ex-sep"></div>`;
    const hostNames = ['Passive','Territorial','Aggressive'];
    const traits = [];
    traits.push(hostNames[mon.hostility] || 'Unknown');
    if (mon.personality && mon.personality !== 'normal'){
      traits.push(mon.personality.replace(/_/g, ' '));
    }
    h += `<div class="ex-row"><span class="ex-dim">Behavior</span> <span class="ex-val">${traits.join(' · ')}</span></div>`;
    h += `<div class="ex-pair">`;
    h += `<span><span class="ex-dim">Leash</span> <span class="ex-val">${mon.chase} tiles</span></span>`;
    h += `<span><span class="ex-dim">Search</span> <span class="ex-val">${mon.search > 0 ? mon.search + ' turns' : 'none'}</span></span>`;
    h += `</div>`;
    const visionTraits = [];
    if (mon.mods && mon.mods.nightVision) visionTraits.push('Night vision');
    if (mon.mods && mon.mods.blindsight) visionTraits.push('Blindsight');
    if (visionTraits.length){
      h += `<div class="ex-row"><span class="ex-dim">Senses</span> <span class="ex-val">${visionTraits.join(', ')}</span></div>`;
    }
    h += `<div class="ex-row"><span class="ex-dim">Speed</span> <span class="ex-val">${mon.speed || 60}</span></div>`;
  }

  // --- Central 90+: exact damage range, loot hints ---
  if (pCentral >= 90){
    h += `<div class="ex-sep"></div>`;
    const baseDmg = monDamage(mon);
    const low = Math.max(1, baseDmg - Math.floor(mon.strength * 0.025));
    const high = baseDmg + Math.floor(mon.strength * 0.025);
    h += `<div class="ex-row"><span class="ex-dim">Dmg Range</span> <span class="ex-val">${low}–${high} ${mon.dmgType}</span></div>`;
    if (mon.goldRange){
      h += `<div class="ex-row"><span class="ex-dim">Loot</span> <span class="ex-val">${mon.goldRange[0]}–${mon.goldRange[1]} gold</span></div>`;
    }
    h += `<div class="ex-row"><span class="ex-dim">XP Value</span> <span class="ex-val">${mon.xp}</span></div>`;
  }

  // Terrain footer
  h += `<div class="ex-sep"></div>`;
  const cb = coverBonus(ground, cover);
  h += `<div class="ex-row ex-terrain"><span class="ex-dim">${terrainName(ground, cover)}</span>${cb ? `<span>cover +${cb}</span>` : ''}</div>`;

  h += `</div>`;
  h += `<div class="close-row"><button class="btn" id="btn-close">OK</button></div>`;
  return h;
}

// ==================== STAT CARD: PLAYER (SELF-INSPECT) ====================
function buildPlayerCard(p){
  let h = cardCSS();
  h += `<div class="ex-card">`;

  // Header
  h += `<div class="ex-header">`;
  h += `<span class="ex-name">Adventurer</span>`;
  h += `<span class="ex-dim">(Level ${p.level})</span>`;
  h += `</div>`;
  h += `<div class="ex-sep"></div>`;

  // HP bar
  h += `<div class="ex-row"><span class="ex-dim">HP</span> ${hpBar(p.hp, p.hpMax, 10)} <span class="ex-val">${p.hp}/${p.hpMax}</span></div>`;

  // FED bar
  const fedFilled = Math.round(Math.max(0, p.fed) / 10);
  const fedEmpty = 10 - fedFilled;
  const fedColor = p.fed > 40 ? '#6a4' : p.fed > 15 ? '#ca4' : '#c44';
  h += `<div class="ex-row"><span class="ex-dim">FED</span> <span style="color:${fedColor}">${'█'.repeat(fedFilled)}</span><span style="color:#444">${'░'.repeat(fedEmpty)}</span> <span class="ex-val">${Math.round(p.fed)}/100</span></div>`;

  // Equipment
  h += `<div class="ex-sep"></div>`;
  const elemTag = p.weapon.elem ? '+' + p.weapon.elem : '';
  h += `<div class="ex-row"><span class="ex-dim">Weapon</span> <span class="ex-val">${p.weapon.name} <span class="ex-dim">[${p.weapon.type}${elemTag}]</span></span></div>`;
  h += `<div class="ex-row"><span class="ex-dim">Armor</span> <span class="ex-val">${p.armor.name} <span class="ex-dim">DEF ${playerDef(p)}</span></span></div>`;

  // Derived combat stats
  h += `<div class="ex-sep"></div>`;
  h += `<div class="ex-pair">`;
  h += `<span><span class="ex-dim">ATK</span> <span class="ex-val">~${playerMelee(p)}</span></span>`;
  h += `<span><span class="ex-dim">DEF</span> <span class="ex-val">${playerDef(p)}</span></span>`;
  h += `</div>`;
  h += `<div class="ex-pair">`;
  h += `<span><span class="ex-dim">Accuracy</span> <span class="ex-val">${playerAcc(p)}%</span></span>`;
  h += `<span><span class="ex-dim">Dodge</span> <span class="ex-val">${Math.round(playerDodge(p))}%</span></span>`;
  h += `</div>`;

  // Armor piercing (only if weapon has any)
  const ap = p.weapon.ap || 0;
  let displayAP = ap;
  if (p.weapon.type === DMG.BLUNT) displayAP += (p.strength / 10 - 1) * (3 / 9);
  if (displayAP > 0){
    h += `<div class="ex-row"><span class="ex-dim">Armor Pierce</span> <span class="ex-val">~${displayAP.toFixed(1)}</span></div>`;
  }

  // Stealth
  const sb = stealthBonus(p);
  if (sb > 0){
    h += `<div class="ex-row"><span class="ex-dim">Stealth</span> <span class="ex-val">${sb}${p.stealth ? ' (active)' : ''}</span></div>`;
  }

  // Active effects
  if (p.effects.length > 0){
    h += `<div class="ex-sep"></div>`;
    const poisonStacks = p.effects.filter(e => e.type === 'poison');
    const others = p.effects.filter(e => e.type !== 'poison');
    for (const e of others){
      const dur = e.turns === 999 ? '∞' : e.turns + 't';
      h += `<div class="ex-row"><span class="ex-dim">${effectLabel(e)}</span> <span class="ex-val">${dur}</span></div>`;
    }
    if (poisonStacks.length > 0){
      const maxT = Math.max(...poisonStacks.map(s => s.turns));
      const pr = poisonResistance(p);
      h += `<div class="ex-row"><span class="ex-dim">Poisoned ×${poisonStacks.length}</span> <span class="ex-val">${maxT}t <span class="ex-dim">(-${Math.round(pr.damageReduction*100)}% resist)</span></span></div>`;
    }
  }

  // XP
  h += `<div class="ex-sep"></div>`;
  h += `<div class="ex-row"><span class="ex-dim">XP</span> <span class="ex-val">${p.xp} / ${p.xpNext}</span></div>`;
  h += `<div class="ex-row"><span class="ex-dim">Gold</span> <span class="ex-val">${p.gold}</span></div>`;

  h += `</div>`;
  h += `<div class="close-row"><button class="btn" id="btn-close">OK</button></div>`;
  return h;
}

function readBook(idx){
  const player = state.player;
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'book') return;
  const b = BOOKS[it.key];
  if (state.player.central < b.intReq){
    log(`You can't make sense of it. (Central ${b.intReq}+ required)`, LOG_CATEGORIES.INTERACTION);
    return;
  }
  openBook(it.key, true, idx);
}

export { useAction, interact, pickUpBook,
         openBook, readBook, openChest, consumeFeature,
         showHelp, examineTile };
