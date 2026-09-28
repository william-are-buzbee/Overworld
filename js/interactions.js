// ==================== INTERACTIONS ====================
// What is left of the old interaction system: the Field Manual (? key).
// Signs, chests, books, wells, shops and NPC dialogue went with the
// settlements; the inventory went with the fantasy player layer.
import { openModal, closeModal } from './modal.js';

function showHelp(){
  const player = state.player;
  let html = `<h2>Field Manual</h2>`;
  html += `<div class="shop-h">Controls</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    <b>WASD</b>/arrows · move<br>
    <b>CLICK</b> tile · walk / attack adjacent<br>
    <b>RIGHT-CLICK</b> · examine tile/monster<br>
    <b>SPACE</b> · wait/rest (converts FED to HP)<br>
    <b>E</b> · eat best food (fills FED only)<br>
    <b>F</b> · toggle stealth<br>
    <b>R</b> · use sign/chest/well<br>
    <b>G</b> · pick up item from ground<br>
    <b>L</b> · look at items on ground<br>
  </div>`;
  html += `<div class="shop-h">FED & Healing</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    <b>FED is a second HP bar.</b> Food fills FED — it does not heal HP directly.<br>
    <b>Resting</b> converts FED to HP. Larger bodies rest more efficiently.<br>
    Every action drains FED. Resting drains it slowly, moving more, attacking the most.<br>
    Passive regen does not drain FED. At FED 0 you start losing HP.<br>
    Potions are the only consumable that heals HP directly — use them sparingly.
  </div>`;
  html += `<div class="shop-h">Inventory</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    Bag is <b>10 slots, no stacking.</b> Each item has a <b>weight</b>.<br>
    Carry capacity depends on muscle mass. Overweight pickups are blocked.<br>
    Weapons and armor go into your bag — equip from the Items tab.<br>
    Dropping items (×) places them on the ground — pick them up later with <b>G</b>.
  </div>`;
  html += `<div class="shop-h">Damage Types</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    BLADE cuts flesh but resists on armored, shelled, scaled, and stone foes. BLUNT breaks bone, armor, and stone.<br>
    FIRE burns plants and ice. COLD cracks fire-things but does nothing to undead, bone, or ice.<br>
    ELECTRIC is devastating to aquatic foes. POISON is useless on undead, bone, stone, and fungal creatures. Poison stacks over time.
  </div>`;
  html += `<div class="shop-h">Creature Behavior</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    Many creatures ignore you. Some defend their territory only. Smarter creatures will search for you if they lose sight; simpler ones give up. Leaving a creature's biome usually breaks pursuit.<br>
    Mushrooms in the southeastern fungal zone will flee if approached individually. Once enough gather, they encircle and attack as a group.<br>
    Wolves roam forests and plains. Apex predators are rarer but stronger. Both may hunt in pairs or small groups.
  </div>`;
  html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
}

export { showHelp };
