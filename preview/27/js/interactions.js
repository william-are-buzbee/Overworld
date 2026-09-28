// ==================== INTERACTIONS ====================
// What is left of the old interaction system: the Field Manual (? key).
// Signs, chests, books, wells, shops and NPC dialogue went with the
// settlements; the inventory went with the fantasy player layer.
import { openModal, closeModal } from './modal.js';

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
    <b>R</b> · eat the corpse you are standing on<br>
    <b>F</b> · creep (soft footfalls, felt from less far; sprinting ends it)<br>
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
    At zero your body makes no new blood and slowly consumes what it has; the blood bar shows it.<br>
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

export { showHelp };
