// ==================== NPC DATA, SHOPS, TOWNS ====================

const NPCS = {
  mayor: {
    name:'Mayor Hadrik', town:'millhaven',
    lines:[
      "Welcome to Millhaven. Travelers are rare. Most who head south don't come back.",
      "The forest has wolves and goblins. A sword serves well against flesh.",
      "East of the desert, they say a blind woman in Dunegate speaks of the Crown.",
    ],
    simple_lines:[
      "Hello? You... traveler? Good. Quiet here. Stay safe.",
      "Forest. Wolves. Bite you. Sharp thing help.",
    ]
  },
  smith_mill: {
    name:'Smith Dalka', town:'millhaven', shop:'mill_smith',
    lines:[
      "New to this? Start with a short sword. Leather will keep you breathing.",
      "Blade cuts flesh. Blunt cracks bone and armor. Think before you swing.",
    ],
    simple_lines:[
      "You buy? I sell. Take coin.",
      "Sword good. Hammer good. Pick one.",
    ]
  },
  merchant_mill: {
    name:'Grocer Owen', town:'millhaven', shop:'mill_grocer',
    lines:[
      "You'll need to eat out there. Bread keeps longest. Jerky's tastier.",
      "Potions aren't cheap, but they'll pull you from the dark. Try to have one on hand.",
      "A wood hermit lives north, deep in the forest. He knows more than he lets on.",
    ],
    simple_lines:[
      "Food! You want? Give gold.",
      "Eat bread. Eat meat. Live.",
    ]
  },
  farmer_mill: {
    name:'Farmer Gale', town:'millhaven',
    lines:[
      "Wheat's the lifeblood of this town. Without it, Millhaven would fold in a season.",
      "Travelers come in hungry, leave with bread. That's how we stay fed.",
    ],
    simple_lines:[
      "Work. Wheat. Work more.",
      "Food come from field. Long day.",
    ]
  },
  innkeep_mill: {
    name:'Innkeeper Rose', town:'millhaven', shop:'mill_inn',
    lines:[
      "The Millward Rest — 30 gold a night, stew and a straw cot. Can't beat it nearby.",
      "Most who stop in are chasing trouble south. I don't ask.",
      "If you're going into the dark, fill your belly first. Cold steel on empty guts is a bad day.",
    ],
    simple_lines:[
      "Bed. Thirty gold. Sleep.",
      "Eat first. Then fight.",
    ]
  },

  elder_thorn: {
    name:'Elder Mirren', town:'thornwell',
    lines:[
      "The heartwood grows angry. Treants walk again — but they won't hunt you. Leave them alone.",
      "Treants are old wood. Blunt weapons break them; fire turns them to ash. Only fight if you must.",
      "There's a scholar in a ruin east of here. He catalogs the weaknesses of every creature.",
    ],
    simple_lines:[
      "Trees walk. Do not hit them. They not hurt you.",
      "Fire burn wood. Big hammer smash wood.",
    ]
  },
  hunter_thorn: {
    name:'Huntress Veyla', town:'thornwell', shop:'thorn_hunter',
    lines:[
      "I sell sharp things. My blades have gutted worse than goblins.",
      "The Flame Sword I carry — it turns treants into bonfires. Expensive, mind you.",
      "Wolves run fast. If your DEX can't match theirs, run.",
    ],
    simple_lines:[
      "Blade for you. Gold for me.",
      "Wolves fast. You slow, you die.",
    ]
  },
  innkeep_thorn: {
    name:'Innkeeper Bo', town:'thornwell', shop:'thorn_inn',
    lines:[
      "A cot and a bowl of stew. 40 gold buys you the night — full rest, full belly.",
      "Cold weapons? Save them for the caves. Out here, they're dead weight.",
    ],
    simple_lines:[
      "Bed. Forty gold. Sleep safe.",
      "Food here. Warm.",
    ]
  },

  archivist: {
    name:'Archivist Solen', town:'dunegate',
    lines:[
      "The desert was once a sea. Mummies here wrap themselves in pitch — fire catches them fast.",
      "Beneath the mountains, a door. Beneath the door, a sea that never saw the sun.",
      "In that black sea drift the Drowned. Shock weapons tear through aquatic things like they're paper.",
    ],
    simple_lines:[
      "Mummies burn. Fire good.",
      "Deep water bad. Electric kill water thing.",
    ]
  },
  smith_dune: {
    name:'Smith Karn', town:'dunegate', shop:'dune_smith',
    lines:[
      "Heat shapes steel. I forge weapons that carry heat with them.",
      "Dig deep and you'll find worse than scorpions. Cold weapons for the lava halls.",
    ],
    simple_lines:[
      "Hammer big. You buy?",
      "Go deep, take cold thing.",
    ]
  },
  oracle: {
    name:'The Blind Oracle', town:'dunegate',
    lines:[
      "The Dread King sits beneath Blackspire. His bones are the keep's foundation.",
      "He is cursed and armored. Fire unmakes him; heavy blows crack his shell.",
      "There is a blade called Kingsbane. The old knights hid it in Sunward Hold, west of here.",
    ],
    simple_lines:[
      "Dark king. Below black tower. Go there, die.",
      "Fire burn king. Big hammer crack king. Find sharp thing called Kingsbane.",
    ]
  },

  hermit_mt: {
    name:'Hermit Olgren', town:'karst',
    lines:[
      "The caves below run deep. Frost trolls hate flame; so do the ice wraiths. Same lesson, twice.",
      "There is a way down near here. A cave mouth in the black rock.",
      "The Dread King's hounds pace the lava halls. They are the least of what lives down there.",
    ],
    simple_lines:[
      "Cave. Down. Dark. Be ready.",
      "Fire hurt ice thing. Always.",
    ]
  },
  gearman: {
    name:'Tinker Maela', town:'karst', shop:'karst_tinker',
    lines:[
      "I sell what I find. A frost hammer passed through my hands once. Worth every coin.",
      "Take stew for the cold roads. Warms you twice.",
    ],
    simple_lines:[
      "Pots! Meat! Buy!",
      "Cold up there. Hot food help.",
    ]
  },

  // Landmark hermits
  forest_hermit: {
    name:'The Wood Hermit', town:null,
    lines:[
      "Leave me be — or if you must stay, know this: the treants don't hunt you. They sleep, standing. Let them.",
      "Goblins fear fire. Wolves don't. Blades still kill both.",
    ],
    simple_lines:[
      "Trees... sleep. No wake. No touch.",
      "Fire... goblin... run.",
    ]
  },
  scholar: {
    name:'Scholar Faust', town:null,
    lines:[
      "Oh! A student? Or... ah. Listen. I've catalogued the beasts of this age.",
      "FLESH cuts — blades work. BONE shatters — bring blunt. ARMORED foes: blunt again, blades slide.",
      "PLANT burns. INSECT cracks. UNDEAD are IMMUNE to cold and poison — fire is the answer there.",
      "AQUATIC things: electricity. Cold does nothing to them. Don't waste a frost blade in the deep.",
      "CURSED things — a category of their own. Fire helps. Only a Bane weapon truly undoes them.",
    ],
    simple_lines:[
      "Sharp for meat. Hard for bone. Hot for tree.",
      "No cold for bone-thing. No cold for wet-thing. Fire for tree, sharp-for-meat.",
    ]
  },
  fisherman: {
    name:'Old Tannis', town:null, shop:'fisherman_shop',
    lines:[
      "Sixty years fishing. I don't go too far out. Something lives in the deep water that shouldn't.",
      "Smoked fish? Best in the land, or my boat sinks tomorrow.",
      "I saw a castle fall into the sea once, when I was young. Only spires left.",
    ],
    simple_lines:[
      "Fish. You buy. Five gold. Twenty. Ten.",
      "Sea deep. Old thing there. Bad.",
    ]
  },
};

// ==================== SHOPS ====================
const SHOPS = {
  mill_smith: {
    name:"Dalka's Forge",
    weapons:['short_sword','club','mace'],
    armors:['leather','studded'],
    potions:[],
    food:[],
  },
  mill_grocer: {
    name:"Owen's Goods",
    weapons:[],
    armors:[],
    potions:['minor_heal','antidote'],
    food:['apple','bread','jerky','fish'],
  },
  mill_inn: {
    name:"The Millward Rest",
    weapons:[],
    armors:[],
    potions:[],
    food:['bread','stew'],
    inn:true, innCost:30,
  },
  thorn_hunter: {
    name:"Veyla's Armory",
    weapons:['long_sword','falchion','flame_sword'],
    armors:['studded','chain'],
    potions:['minor_heal'],
    food:['jerky'],
  },
  thorn_inn: {
    name:"The Quiet Bough Inn",
    weapons:[],
    armors:[],
    potions:[],
    food:['bread','stew','roast'],
    inn:true, innCost:40,
  },
  dune_smith: {
    name:"Karn's Smithy",
    weapons:['warhammer','obsidian_maul','flame_sword','storm_mace'],
    armors:['chain','scale'],
    potions:[],
    food:[],
  },
  dune_temple: {
    name:"Temple of the Sun",
    weapons:[],
    armors:[],
    potions:['heal','greater_heal','antidote'],
    food:[],
    inn:true, innCost:60,
  },
  karst_tinker: {
    name:"Maela's Odds",
    weapons:['frost_blade','frost_hammer','thunder_sword'],
    armors:['scale','plate'],
    potions:['heal'],
    food:['jerky','stew'],
  },
  karst_inn: {
    name:"Stonepeak Lodge",
    weapons:[],
    armors:[],
    potions:['minor_heal'],
    food:['stew','roast'],
    inn:true, innCost:50,
  },
  fisherman_shop: {
    name:"Tannis' Catch",
    weapons:[],
    armors:[],
    potions:[],
    food:['fish','stew'],
  },
};

// ==================== TOWNS ====================
const TOWNS = {
  millhaven:  {name:'Millhaven',   npcs:['mayor','smith_mill','merchant_mill','innkeep_mill','farmer_mill']},
  thornwell:  {name:'Thornwell',   npcs:['elder_thorn','hunter_thorn','innkeep_thorn']},
  dunegate:   {name:'Dunegate',    npcs:['archivist','smith_dune','oracle']},
  karst:      {name:'Karst Hollow',npcs:['hermit_mt','gearman']},
};

const SIGN_TEXTS = {
  millhaven_n: "◤ NORTH: THORNWELL · forest town ◢\nBeware wolves & goblins in the treeline.",
  millhaven_e: "◤ EAST: DUNEGATE · desert town ◢\nSun kills faster than scorpions.",
  millhaven_s: "◤ SOUTH: the ruined keep ◢\nTurn back.",
  thornwell_w: "◤ WEST: KARST HOLLOW · mountain road ◢\nFrost and worse.",
  oldsign1:    "The old kingdom fell to ONE THRONE.\nThat throne still sits. Beneath.",
  oldsign2:    "They say the Kingsbane sleeps\nwhere the knights still kneel.\n— Sunward Hold —",
  castle_warn: "BLACKSPIRE KEEP\nTurn away, if you can.",
  cave_warn:   "The deep remembers nothing of the sun.\nBring cold, bring light, bring courage.",
};

export { NPCS, SHOPS, TOWNS, SIGN_TEXTS };
