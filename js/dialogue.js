// ==================== NPC DIALOGUE ====================
import { state } from './state.js';
import { NPCS } from './npcs.js';
import { openModal, closeModal } from './modal.js';
import { openShop } from './shops.js';

let npcTurnIdx = {};

function openNPC(npcKey){
  const n = NPCS[npcKey];
  if (!n) return;
  state.player.npcsMet.add(npcKey);
  const useSimple = state.player.int <= 1;
  const lines = useSimple && n.simple_lines ? n.simple_lines : n.lines;
  const idx = (npcTurnIdx[npcKey] || 0) % lines.length;
  npcTurnIdx[npcKey] = idx + 1;

  let html = `<h2>${n.name}</h2>`;
  html += `<div class="speaker">« they say »</div>`;
  if (useSimple) html += `<div class="simple">(they speak to you slowly, like a child)</div>`;
  html += `<div class="dialogue">"${lines[idx]}"</div>`;
  if (lines.length > 1) html += `<div class="tip">(${idx+1} / ${lines.length} — speak again)</div>`;
  html += `<div class="close-row">`;
  if (n.shop) html += `<button class="btn" id="btn-shop">WARES</button> `;
  html += `<button class="btn" id="btn-close">LEAVE</button></div>`;
  openModal(html);
  if (n.shop) document.getElementById('btn-shop').onclick = () => openShop(n.shop);
  document.getElementById('btn-close').onclick = closeModal;
}

export { openNPC, npcTurnIdx };
