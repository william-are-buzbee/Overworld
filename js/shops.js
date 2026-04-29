// ==================== SHOP ====================
import { state } from './state.js';
import { FOOD, POTIONS, BOOKS, findWeapon, findArmor } from './items.js';
import { INV_SLOTS, carryCapacity, totalWeight, addItem,
         defaultWeight, buyPriceMul, innPriceMul, sellValueMul } from './player.js';
import { SHOPS } from './npcs.js';
import { log } from './log.js';
import { openModal, closeModal } from './modal.js';

let shopTab = 'buy';

function openShop(shopKey){
  const s = SHOPS[shopKey];
  if (!s) return;
  shopTab = 'buy';
  renderShop(s);
}

function buyCost(baseCost){
  const player = state.player;
  return Math.max(1, Math.round(baseCost * buyPriceMul(player)));
}
function sellValue(baseCost){
  const player = state.player;
  return Math.max(1, Math.round(baseCost * sellValueMul(player)));
}

// Return the base "price" of an inventory item (for selling)
function itemBaseValue(it){
  if (it.kind === 'weapon'){ const w = findWeapon(it.key); return w && w.cost ? w.cost : 10; }
  if (it.kind === 'armor'){ const a = findArmor(it.key); return a && a.cost ? a.cost : 10; }
  if (it.kind === 'food')  return FOOD[it.key] ? FOOD[it.key].cost : 5;
  if (it.kind === 'potion')return POTIONS[it.key] ? POTIONS[it.key].cost : 20;
  if (it.kind === 'book')  return 50;
  return 1;
}

function renderShop(s){
  const player = state.player;
  const discPct = Math.round((1 - buyPriceMul(player)) * 100);
  const sellPct = Math.round(sellValueMul(player) * 100);

  let html = `<h2>${s.name}</h2>`;
  html += `<div class="row"><div class="lbl">Gold: <b class="cost">${state.player.gold}g</b></div><div>Bag: ${state.player.inventory.length}/${INV_SLOTS} · ${totalWeight(player)}/${carryCapacity(player)}wt</div></div>`;
  // Buy/Sell tab
  html += `<div class="row" style="gap:6px;justify-content:center;">
    <button data-tab="buy" ${shopTab==='buy'?'class="on" style="background:var(--fg);color:#000;"':''}>BUY${discPct>0?` (-${discPct}%)`:''}</button>
    <button data-tab="sell" ${shopTab==='sell'?'class="on" style="background:var(--fg);color:#000;"':''}>SELL (${sellPct}%)</button>
  </div>`;

  if (shopTab === 'buy'){
    if (s.inn){
      const cost = Math.round((s.innCost || 40) * innPriceMul(player));
      const canAfford = state.player.gold >= cost;
      const need = state.player.hp < state.player.hpMax || state.player.fed < 100;
      html += `<div class="shop-h">Lodging</div>`;
      html += `<div class="row">
        <div class="lbl"><b>Rest</b><div class="sub">Full HP, full belly</div></div>
        <div class="cost">${cost}g</div>
        <button data-rest="1" ${canAfford && need?'':'disabled'}>STAY</button>
      </div>`;
    }
    if (s.weapons && s.weapons.length){
      html += `<div class="shop-h">Weapons</div>`;
      for (const wk of s.weapons){
        const w = findWeapon(wk);
        const cost = buyCost(w.cost);
        const afford = state.player.gold >= cost;
        html += `<div class="row">
          <div class="lbl"><b>${w.name}</b><div class="sub">[${w.type}${w.elem?'+'+w.elem:''}] ATK+${w.atk}${w.ap?' ap'+w.ap:''}${w.crit?' crit+'+w.crit:''}</div></div>
          <div class="cost">${cost}g</div>
          <button data-buy-w="${w.key}" ${afford?'':'disabled'}>BUY</button>
        </div>`;
      }
    }
    if (s.armors && s.armors.length){
      html += `<div class="shop-h">Armor</div>`;
      for (const ak of s.armors){
        const a = findArmor(ak);
        const cost = buyCost(a.cost);
        const afford = state.player.gold >= cost;
        html += `<div class="row">
          <div class="lbl"><b>${a.name}</b><div class="sub">DEF+${a.def}${a.dexPenalty?` -${Math.round(a.dexPenalty*100)}% DEX`:''}</div></div>
          <div class="cost">${cost}g</div>
          <button data-buy-a="${a.key}" ${afford?'':'disabled'}>BUY</button>
        </div>`;
      }
    }
    if (s.potions && s.potions.length){
      html += `<div class="shop-h">Potions</div>`;
      for (const pk of s.potions){
        const p = POTIONS[pk];
        const cost = buyCost(p.cost);
        const afford = state.player.gold >= cost;
        html += `<div class="row">
          <div class="lbl"><b>${p.name}</b><div class="sub">${p.desc}</div></div>
          <div class="cost">${cost}g</div>
          <button data-buy-p="${pk}" ${afford?'':'disabled'}>BUY</button>
        </div>`;
      }
    }
    if (s.food && s.food.length){
      html += `<div class="shop-h">Provisions</div>`;
      for (const fk of s.food){
        const f = FOOD[fk];
        const cost = buyCost(f.cost);
        const afford = state.player.gold >= cost;
        html += `<div class="row">
          <div class="lbl"><b>${f.name}</b><div class="sub">+${f.fed} FED · ${f.desc}</div></div>
          <div class="cost">${cost}g</div>
          <button data-buy-f="${fk}" ${afford?'':'disabled'}>BUY</button>
        </div>`;
      }
    }
  } else {
    // SELL tab
    html += `<div class="shop-h">Your items</div>`;
    if (state.player.inventory.length === 0){
      html += `<div class="tip">Nothing to sell.</div>`;
    } else {
      state.player.inventory.forEach((it, idx) => {
        const val = sellValue(itemBaseValue(it));
        const name = it.kind === 'weapon' ? findWeapon(it.key).name
                   : it.kind === 'armor'  ? findArmor(it.key).name
                   : it.kind === 'food'   ? FOOD[it.key].name
                   : it.kind === 'potion' ? POTIONS[it.key].name
                   : it.kind === 'book'   ? BOOKS[it.key].name
                   : it.key;
        html += `<div class="row">
          <div class="lbl"><b>${name}</b><div class="sub">${it.kind}</div></div>
          <div class="cost">${val}g</div>
          <button data-sell="${idx}">SELL</button>
        </div>`;
      });
    }
  }

  html += `<div class="close-row"><button class="btn" id="btn-close">LEAVE</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;

  // Scope all shop button handlers to modal only (avoid overwriting sidebar tabs)
  const mi = document.getElementById('modal-inner');
  mi.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    shopTab = b.dataset.tab;
    renderShop(s);
  });
  mi.querySelectorAll('[data-rest]').forEach(b => b.onclick = () => {
    const cost = Math.round((s.innCost || 40) * innPriceMul(player));
    state.player.gold -= cost;
    state.player.hp = state.player.hpMax; state.player.fed = 100;
    state.player.fedProgress = 0;  // Reset accumulated FED drain
    state.player.starveTurns = 0;
    log('You rest well. Fully restored.', 'hit');
    renderShop(s);
  });
  mi.querySelectorAll('[data-buy-w]').forEach(b => b.onclick = () => {
    const w = findWeapon(b.dataset.buyW);
    const result = addItem(player, {kind:'weapon', key:w.key});
    if (result === 'full'){ log('Your bag is full.', 'warn'); return; }
    if (result === 'heavy'){ log("You can't carry that much weight.", 'warn'); return; }
    state.player.gold -= buyCost(w.cost);
    log(`Bought ${w.name}.`, 'hit');
    renderShop(s);
  });
  mi.querySelectorAll('[data-buy-a]').forEach(b => b.onclick = () => {
    const a = findArmor(b.dataset.buyA);
    const result = addItem(player, {kind:'armor', key:a.key});
    if (result === 'full'){ log('Your bag is full.', 'warn'); return; }
    if (result === 'heavy'){ log("You can't carry that much weight.", 'warn'); return; }
    state.player.gold -= buyCost(a.cost);
    log(`Bought ${a.name}.`, 'hit');
    renderShop(s);
  });
  mi.querySelectorAll('[data-buy-p]').forEach(b => b.onclick = () => {
    const pk = b.dataset.buyP;
    const result = addItem(player, {kind:'potion', key:pk});
    if (result === 'full'){ log('Bag full.', 'warn'); return; }
    if (result === 'heavy'){ log('Too heavy.', 'warn'); return; }
    state.player.gold -= buyCost(POTIONS[pk].cost);
    log(`Bought ${POTIONS[pk].name}.`, 'hit');
    renderShop(s);
  });
  mi.querySelectorAll('[data-buy-f]').forEach(b => b.onclick = () => {
    const fk = b.dataset.buyF;
    const result = addItem(player, {kind:'food', key:fk});
    if (result === 'full'){ log('Bag full.', 'warn'); return; }
    if (result === 'heavy'){ log('Too heavy.', 'warn'); return; }
    state.player.gold -= buyCost(FOOD[fk].cost);
    log(`Bought ${FOOD[fk].name}.`, 'hit');
    renderShop(s);
  });
  mi.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
    const idx = parseInt(b.dataset.sell);
    const it = state.player.inventory[idx];
    if (!it) return;
    const val = sellValue(itemBaseValue(it));
    const name = it.kind === 'weapon' ? findWeapon(it.key).name
               : it.kind === 'armor'  ? findArmor(it.key).name
               : it.kind === 'food'   ? FOOD[it.key].name
               : it.kind === 'potion' ? POTIONS[it.key].name
               : it.kind === 'book'   ? BOOKS[it.key].name
               : it.key;
    state.player.gold += val;
    state.player.inventory.splice(idx, 1);
    log(`Sold ${name} for ${val}g.`, 'gold');
    renderShop(s);
  });
}

export { openShop, renderShop, buyCost, sellValue, itemBaseValue };
