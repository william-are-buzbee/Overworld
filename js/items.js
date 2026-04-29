// ==================== ITEMS ====================
import { DMG } from './constants.js';

// ==================== WEAPONS ====================
export const WEAPONS = [
  {key:'dagger',     name:'Rusty Dagger',     atk:2,  type:DMG.BLADE, elem:null,      elemBonus:0, crit:3, ap:0, acc:5,  cost:0},
  {key:'short_sword',name:'Short Sword',      atk:4,  type:DMG.BLADE, elem:null,      elemBonus:0, crit:0, ap:0, acc:0,  cost:55},
  {key:'long_sword', name:'Long Sword',       atk:7,  type:DMG.BLADE, elem:null,      elemBonus:0, crit:0, ap:1, acc:0,  cost:180},
  {key:'falchion',   name:'Hooked Falchion',  atk:9,  type:DMG.BLADE, elem:null,      elemBonus:0, crit:8, ap:1, acc:-5, cost:320},
  {key:'flame_sword',name:'Flame Sword',      atk:7,  type:DMG.BLADE, elem:DMG.FIRE,  elemBonus:5, crit:0, ap:1, acc:0,  cost:420},
  {key:'frost_blade',name:'Frostbitten Blade',atk:7,  type:DMG.BLADE, elem:DMG.COLD,  elemBonus:5, crit:0, ap:1, acc:0,  cost:440},
  {key:'thunder_sword',name:'Thunder Blade',  atk:8,  type:DMG.BLADE, elem:DMG.ELEC,  elemBonus:6, crit:5, ap:1, acc:0,  cost:540},
  {key:'kingsbane',  name:'Kingsbane',        atk:12, type:DMG.BLADE, elem:DMG.FIRE,  elemBonus:8, crit:10,ap:2, acc:5,  cost:0, bane:'cursed', baneMul:2.0},
  {key:'club',       name:'Oak Club',         atk:3,  type:DMG.BLUNT, elem:null,      elemBonus:0, crit:0, ap:1, acc:-10,cost:20},
  {key:'mace',       name:'Iron Mace',        atk:5,  type:DMG.BLUNT, elem:null,      elemBonus:0, crit:0, ap:2, acc:-5, cost:90},
  {key:'warhammer',  name:'Warhammer',        atk:8,  type:DMG.BLUNT, elem:null,      elemBonus:0, crit:0, ap:4, acc:-10,cost:320},
  {key:'maul',       name:'Great Maul',       atk:11, type:DMG.BLUNT, elem:null,      elemBonus:0, crit:0, ap:5, acc:-15,cost:520},
  {key:'obsidian_maul',name:'Obsidian Maul',  atk:10, type:DMG.BLUNT, elem:DMG.FIRE,  elemBonus:5, crit:0, ap:4, acc:-10,cost:460},
  {key:'frost_hammer',name:'Frost Hammer',    atk:10, type:DMG.BLUNT, elem:DMG.COLD,  elemBonus:6, crit:0, ap:4, acc:-10,cost:490},
  {key:'storm_mace', name:'Storm Mace',       atk:9,  type:DMG.BLUNT, elem:DMG.ELEC,  elemBonus:6, crit:0, ap:3, acc:-5, cost:460},
];
export function findWeapon(key){ return WEAPONS.find(w=>w.key===key); }

// ==================== ARMOR ====================
export const ARMORS = [
  {key:'rags',    name:'Threadbare Rags',  def:0,  dexPenalty:0,     cost:0},
  {key:'leather', name:'Leather Cuirass',  def:2,  dexPenalty:0,     cost:70},
  {key:'studded', name:'Studded Leather',  def:3,  dexPenalty:0.10,  cost:140},
  {key:'chain',   name:'Chain Hauberk',    def:5,  dexPenalty:0.25,  cost:260},
  {key:'scale',   name:'Scale Armor',      def:7,  dexPenalty:0.35,  cost:420},
  {key:'plate',   name:'Plate Mail',       def:10, dexPenalty:0.50,  cost:700},
  {key:'kingsgarb',name:'Kingslayer Plate',def:13, dexPenalty:0.35,  cost:0},
];
export function findArmor(key){ return ARMORS.find(a=>a.key===key); }

// ==================== FOOD ====================
export const FOOD = {
  apple:      {name:'Apple',         fed:10, cost:7,   desc:'A crisp apple.'},
  bread:      {name:'Loaf of Bread', fed:22, cost:16,  desc:'Hearty village bread.'},
  jerky:      {name:'Dried Jerky',   fed:30, cost:27,  desc:'Salted meat strips.'},
  fish:       {name:'Smoked Fish',   fed:26, cost:22,  desc:'Preserved river fish.'},
  stew:       {name:'Iron Pot Stew', fed:45, cost:54,  desc:'Warming stew in a tin.'},
  roast:      {name:'Venison Roast', fed:70, cost:108, desc:'A whole roast. Rare.'},
};

// ==================== POTIONS ====================
export const POTIONS = {
  minor_heal: {name:'Minor Healing Draught', heal:25, cost:60,  desc:'Quick bitter tonic.'},
  heal:       {name:'Healing Draught',       heal:50, cost:140, desc:'Green, sweet.'},
  greater_heal:{name:'Greater Draught',      heal:95, cost:300, desc:'Warm as summer.'},
  antidote:   {name:'Antidote',              heal:0,  cost:40,  desc:'Clears poison.', cure:'poison'},
};

// ==================== BOOKS ====================
export const BOOKS = {
  hermits_treatise: {
    name:"The Hermit's Treatise", intReq: 3,
    text: "...he who tends the body before the blade outlives both. Mark these pages and keep them close to the skin, as the old ones did.",
    perk: 'hp_bonus', summary: '+8 max HP (permanent).'
  },
  shadowplay: {
    name: "Shadowplay: A Quiet Manual", intReq: 5,
    text: "Silence is practice, not gift. In the forest's breath, in the mountain's pause, there is a pattern. Slow the foot. Narrow the eye.",
    perk: 'stealth_bonus', summary: '+20 stealth effectiveness (permanent).'
  },
  steel_and_tempering: {
    name: "Steel and Tempering", intReq: 4,
    text: "The blade favors the man who understands the grain. Cut along it, and the skin parts. Cut across, and it tears.",
    perk: 'blade_bonus', summary: 'Blade weapons deal +1 damage.'
  },
  stone_and_force: {
    name: "Stone and Force", intReq: 4,
    text: "A hammer does not cleave — it persuades. All persuasion is, in the end, about where the weight lands.",
    perk: 'blunt_bonus', summary: 'Blunt weapons deal +1 damage.'
  },
  old_physicians: {
    name: "On The Old Physicians", intReq: 5,
    text: "Food is the first and kindest medicine. Eat slowly, then eat again. The body knows the rest.",
    perk: 'food_bonus', summary: 'Food restores +50% more FED.'
  },
  pacts_of_the_crown: {
    name: "Pacts of the Crown", intReq: 7,
    text: "The Dread King was not a king. He was a pact — made in terror, kept in silence. Fire unmakes oaths. Blunt breaks bones. Blades slip from his harness like pleasantries.",
    perk: 'cursed_bane', summary: '+25% damage against cursed foes.'
  },
  scribes_margin: {
    name: "A Scribe's Margin", intReq: 3,
    text: "...to keep the mind sharp, read widely and copy nothing. You will remember only what you've rewritten in your own hand.",
    perk: 'xp_bonus', summary: 'XP gain +15%.'
  },
};
