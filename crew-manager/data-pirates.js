// ===========================================================================
//  data-pirates.js  —  roster voor het crew-manager spel
//  Gegroepeerd op rol: Captains, Swordsman, Navigator, Sniper, Chef, Doctor,
//  Archaeologist, Shipwright, Musician, Helmsman, Crewmate, Navy.
// ---------------------------------------------------------------------------
//  Veld-uitleg:
//    n   = naam
//    r   = primaire rol. Bepaalt welk vak natural-fit is.
//    alt = (optioneel) extra rollen, bv. alt:["Doctor"].
//          REGEL: het VAK waarin je iemand zet bepaalt z'n duel-tier
//            Captain-vak    -> tier Captain
//            Swordsman-vak  -> tier Swordsman
//            de andere 8    -> tier "Rest" (onderling gematcht)
//          Staat hij in een vak dat in r of alt zit -> bonus.
//          "Crewmate" = flexibele alleskunner. Past in elk Rest-vak ZONDER
//          bonus of malus. Een specialist krijgt juist een bonus op z'n
//          eigen vak en een kleine malus op een ander vak.
//    cap = (optioneel) true = ook kiesbaar als captain. Niet gekozen?
//          Dan staat hij als crewlid op de transfermarkt met eigen stats.
//    p   = base Power   (1-10)  -> schade per klap
//    d   = base Defense (1-10)  -> HP + incasseringsvermogen
//    s   = base Speed   (1-10)  -> wie eerst slaat + ontwijkkans
//    c   = start-crew (canonieke naam). "Free Agent" = vrij op de markt.
//    sp  = special attacks (commentaar-teksten)
// ===========================================================================

const PIRATES = [

// --- Captains ------------------------------------------------------------
  { n:"Luffy",         r:"Captain", img:"luffysmile.jpg", p:8, d:8, s:8, c:"Straw Hat Pirates",  sp:["Gum Gum Pistol","Gum Gum Bazooka","Red Hawk"] },
  { n:"Whitebeard",    r:"Captain", img:"whitebeard.jpg", p:8, d:8, s:8, c:"Whitebeard Pirates", sp:["Gura Gura no Mi","Quake Punch"] },
  { n:"Big Mom",       r:"Captain", img:"bigmom.jpg",     p:8, d:8, s:8, c:"Big Mom Pirates",    sp:["Soul Pocus","Maser Cannon"] },
  { n:"Kaido",         r:"Captain", img:"kaido.jpg",      p:8, d:8, s:8, c:"Beasts Pirates",     sp:["Thunder Bagua","Boro Breath"] },
  { n:"Blackbeard",    r:"Captain", img:"blackbeard.jpg", p:8, d:8, s:8, c:"Blackbeard Pirates", sp:["Black Hole","Liberation"] },
  { n:"Doflamingo",    r:"Captain", img:"doflamingo.jpg", p:8, d:8, s:8, c:"Donquixote Pirates", sp:["Overheat","Birdcage"] },
  { n:"Shanks",        r:"Captain", img:"Shanks.jpg",     p:8, d:8, s:8, c:"Red Hair Pirates",   sp:["Divine Departure","Haki Slash"] },
  { n:"Trafalgar Law", r:"Captain", img:"law.jpg",        p:8, d:8, s:8, c:"Heart Pirates",      sp:["Room: Shambles","Gamma Knife"] },
  { n:"Eustass Kid",   r:"Captain", img:"eustass.jpg",    p:8, d:8, s:8, c:"Kid Pirates",        sp:["Punk Gibson","Repel","Punk Gibson"] },
  { n:"Buggy",         r:"Captain", img:"Buggy.jpg",      p:8, d:8, s:8, c:"Buggy Pirates",      sp:["Chop-Chop Cannon","Muggy Ball"] },
  { n:"Gol D. Roger",  r:"Captain", img:"roger.jpg",     p:8, d:8, s:8, c:"Roger Pirates",       sp:["Divine Departure"] },


  // --- Swordsman -----------------------------------------------------------
  { n:"Zoro",              r:"Swordsman", p:8, d:7, s:7, c:"Straw Hat Pirates",  sp:["Santoryu Ogi","King of Hell"] },
  { n:"King",              r:"Swordsman", p:8, d:8, s:8, c:"Beasts Pirates",     sp:["Flame Dragon King"] },
  { n:"Shiryu",            r:"Swordsman", p:8, d:7, s:8, c:"Blackbeard Pirates", sp:["Invisible Slash"] },
  { n:"Vergo",             r:"Swordsman", p:8, d:7, s:7, c:"Donquixote Pirates", sp:[] },
  { n:"Benn Beckman",      r:"Sniper", p:8, d:8, s:8, c:"Red Hair Pirates",   sp:["Rifle Crack"] },
  { n:"Killer",             r:"Swordsman", p:8, d:7, s:8, c:"Kid Pirates",        sp:["Scyther Sonic"] },
  { n:"Cabaji",            r:"Swordsman", p:5, d:4, s:6, c:"Buggy Pirates",      sp:[] },
  { n:"Dracule Mihawk",    r:"Swordsman", alt:["Crewmate"], p:9, d:7, s:8, c:"Free Agent", sp:["Black Blade Slash","Kokuto Yoru"] },
  { n:"Sabo",              r:"Swordsman", p:8, d:7, s:8, c:"Free Agent", sp:["Dragon Claw Fist","Fire Fist"] },
  { n:"Cavendish",         r:"Swordsman", p:7, d:6, s:8, c:"Free Agent", sp:["Swan Lake"] },
  { n:"Hakuba",            r:"Swordsman", p:7, d:6, s:8, c:"Free Agent", sp:["Swan Lake"] },
  { n:"Loki",              r:"Swordsman", img:"loki.jpg", alt:["Crewmate"], cap:true, p:8, d:8, s:8, c:"Free Agent", sp:["Sun God Strike"] },
  { n:"Mr 1. Daz Bones",   r:"Swordsman", alt:["Crewmate"], p:7, d:6, s:7, c:"Free Agent", sp:["Spartan Slash"] },
  { n:"Kozuki Oden",       r:"Swordsman", alt:["Chef"], p:7, d:6, s:7, c:"Free Agent", sp:["Togen Totsuka","Paradise Totsuka"] },
  { n:"Kozuki Momonosuke", r:"Swordsman", alt:["Crewmate"], p:6, d:6, s:6, c:"Free Agent", sp:["Thunder Bagua"] },
  { n:"Yamato",            r:"Swordsman", alt:["Crewmate"], p:8, d:7, s:8, c:"Free Agent", sp:["Thunder Bagua"] },
  { n:"Silver Rayleigh",   r:"Swordsman", p:8, d:8, s:8, c:"Free Agent", sp:[] },
  { n:"Basil Hawkins",     r:"Swordsman", p:7, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Master Cat Viper",  r:"Swordsman", p:7, d:6, s:7, c:"Free Agent", sp:[] },
  { n:"Dogstorm",          r:"Swordsman", p:7, d:6, s:7, c:"Free Agent", sp:[] },
  { n:"Ashura",            r:"Swordsman", p:7, d:6, s:7, c:"Free Agent", sp:[] },
  { n:"Kin'emon",          r:"Swordsman", p:7, d:6, s:7, c:"Free Agent", sp:[] },

  // --- Navigator -----------------------------------------------------------
  { n:"Nami",              r:"Navigator", p:4, d:4, s:7, c:"Straw Hat Pirates",  sp:["Thunderbolt Tempo"] },
  { n:"Laffitte",          r:"Navigator", p:6, d:5, s:7, c:"Blackbeard Pirates", sp:[] },
  { n:"Bepo",              r:"Navigator", p:7, d:6, s:7, c:"Heart Pirates",      sp:["Mink Kung-Fu"] },
  { n:"Mr. 3 Galdino",     r:"Navigator", p:7, d:5, s:6, c:"Buggy Pirates",      sp:["Candle Wall"] },
  { n:"Scopper Gaban",     r:"Navigator", p:7, d:7, s:6, c:"Free Agent", sp:[] },
  { n:"Koala",             r:"Navigator", p:4, d:3, s:5, c:"Free Agent", sp:[] },

  // --- Sniper --------------------------------------------------------------
  { n:"Usopp",             r:"Sniper",    p:4, d:3, s:6, c:"Straw Hat Pirates",  sp:["Tabasco Star","Fire Bird Star"] },
  { n:"Izo",               r:"Sniper",    p:6, d:5, s:7, c:"Whitebeard Pirates", sp:["Twin Pistols"] },
  { n:"Perospero",         r:"Sniper",    p:6, d:6, s:6, c:"Big Mom Pirates",    sp:["Candy Wall"] },
  { n:"Van Augur",         r:"Sniper",    p:7, d:5, s:8, c:"Blackbeard Pirates", sp:["Eagle Shot"] },
  { n:"Gladius",           r:"Sniper",    p:6, d:5, s:6, c:"Donquixote Pirates", sp:["Burst Spike"] },
  { n:"Yasopp",            r:"Sniper",    p:7, d:7, s:8, c:"Red Hair Pirates",   sp:["Hawk-Eye Shot"] },
  { n:"Capone Bege",       r:"Sniper",    p:7, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Wyper",             r:"Sniper",    p:7, d:5, s:6, c:"Free Agent", sp:[] },

  // --- Chef ----------------------------------------------------------------
  { n:"Sanji",             r:"Chef",      p:7, d:6, s:8, c:"Straw Hat Pirates",  sp:["Diable Jambe","Concassé","Hell Memories"] },
  { n:"Thatch",            r:"Chef",      p:7, d:6, s:7, c:"Whitebeard Pirates", sp:[] },
  { n:"Streusen",          r:"Chef",      p:5, d:6, s:4, c:"Big Mom Pirates",    sp:[] },
  { n:"Pudding",           r:"Chef",      p:4, d:3, s:5, c:"Big Mom Pirates",    sp:["Memory Wipe"] },
  { n:"Lucky Roux",        r:"Chef",      p:7, d:8, s:6, c:"Red Hair Pirates",   sp:["Point-Blank Shot"] },
  { n:"Hatchan",           r:"Chef",      p:7, d:8, s:6, c:"Free Agent",         sp:[] },

  // --- Doctor --------------------------------------------------------------
  { n:"Chopper",           r:"Doctor",    p:4, d:4, s:6, c:"Straw Hat Pirates",  sp:["Kung-Fu Point","Monster Point"] },
  { n:"Marco",             r:"Doctor",    p:7, d:8, s:8, c:"Whitebeard Pirates", sp:["Phoenix Brand"] },
  { n:"Queen",             r:"Doctor",    p:8, d:8, s:7, c:"Beasts Pirates",     sp:["Plague Rounds"] },
  { n:"Doc Q",             r:"Doctor",    p:4, d:6, s:4, c:"Blackbeard Pirates", sp:[] },
  { n:"Hongo",             r:"Doctor",    p:5, d:5, s:5, c:"Red Hair Pirates",   sp:[] },
  { n:"Shachi",            r:"Doctor",    p:5, d:5, s:6, c:"Heart Pirates",      sp:[] },
  { n:"Penguin",           r:"Doctor",    p:5, d:5, s:6, c:"Heart Pirates",      sp:[] },
  { n:"Ceasar Clown",      r:"Doctor",    p:5, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Dr. Hogback",       r:"Doctor",    p:5, d:6, s:5, c:"Free Agent", sp:[] },
  { n:"Crocus",            r:"Doctor",    p:8, d:6, s:6, c:"Free Agent", sp:[] },
  { n:"Aladine",           r:"Doctor",    p:6, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Emporio Ivankov",   r:"Doctor",    p:7, d:7, s:6, c:"Free Agent", sp:[] },
  { n:"Lindbergh",         r:"Doctor",    p:7, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Vegapunk",          r:"Doctor",    p:8, d:6, s:6, c:"Free Agent", sp:[] },

  // --- Archaeologist -------------------------------------------------------
  { n:"Nico Robin",            r:"Archaeologist", p:6, d:5, s:6, c:"Straw Hat Pirates", sp:["Mil Fleurs","Clutch"] },
  { n:"Nico Olvia",            r:"Archaeologist", p:6, d:5, s:6, c:"Free Agent", sp:[""] },
  { n:"Prof. Clou D. Clover",  r:"Archaeologist", p:6, d:5, s:6, c:"Free Agent", sp:[""] },

  // --- Shipwright ----------------------------------------------------------
  { n:"Franky",            r:"Shipwright", p:6, d:7, s:5, c:"Straw Hat Pirates",  sp:["Radical Beam","Strong Right"] },
  { n:"Tom",               r:"Shipwright", p:6, d:7, s:5, c:"Free Agent",  sp:[] },
  { n:"Iceberg",           r:"Shipwright", p:4, d:5, s:6, c:"Free Agent",  sp:[] },
  { n:"Paulie",            r:"Shipwright", p:6, d:5, s:4, c:"Free Agent",  sp:[] },
  { n:"Kaku",              r:"Crewmate",   p:5, d:5, s:7, c:"Free Agent", sp:["Rankyaku Lanceo","Tempest kick"] },
  { n:"Rob Lucci",         r:"Shipwright", p:6, d:7, s:6, c:"Free Agent", sp:["Ten Finger Pistol","Tempest Kick"] },
  { n:"Senor Pink",        r:"Shipwright", p:5, d:5, s:5, c:"Donquixote Pirates", sp:["Hard Tackle","Suplex"] },

  // --- Musician ------------------------------------------------------------
  { n:"Brook",             r:"Musician",  p:6, d:5, s:8, c:"Straw Hat Pirates", sp:["Soul Solid","Chills of the Underworld"] },
  { n:"Black Maria",       r:"Musician",  p:6, d:6, s:6, c:"Beasts Pirates",    sp:["Wanyudo"] },
  { n:"Rockstar",          r:"Musician",  p:5, d:5, s:6, c:"Red Hair Pirates",  sp:[] },
  { n:"Bonk Punch",        r:"Musician",  p:6, d:6, s:6, c:"Red Hair Pirates",  sp:[] },
  { n:"Uta",               r:"Musician",  p:7, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Scratch Man Apoo",  r:"Musician",  p:6, d:6, s:6, c:"Free Agent", sp:[] },

  // --- Helmsman ------------------------------------------------------------
  { n:"Jinbe",             r:"Helmsman",  p:8, d:8, s:6, c:"Straw Hat Pirates",  sp:["Fish-Man Karate","Arabesque Brick Fist","Shark Shoulder Throw"] },
  { n:"Jesus Burgess",     r:"Helmsman",  p:9, d:6, s:6, c:"Blackbeard Pirates", sp:["Champion Press"] },
  { n:"Jean Bart",         r:"Helmsman",  p:7, d:7, s:5, c:"Heart Pirates",      sp:["Heavy Swing"] },
  { n:"Shiki",             r:"Helmsman",  p:7, d:5, s:6, c:"Free Agent", sp:[] },

  // --- Crewmate ------------------------------------------------------------
  { n:"Jozu",              r:"Crewmate",  p:8, d:8, s:5, c:"Whitebeard Pirates", sp:["Diamond Crusher"] },
  { n:"Vista",             r:"Crewmate",  p:7, d:6, s:7, c:"Whitebeard Pirates", sp:["Rose Rondo"] },
  { n:"Ace",               r:"Crewmate",  p:8, d:6, s:8, c:"Whitebeard Pirates", sp:["Fire Fist","Flame Commandment"] },
  { n:"Katakuri",          r:"Crewmate",  p:8, d:8, s:8, c:"Big Mom Pirates",    sp:["Mochi Tsuki","Buzzcut Mochi"] },
  { n:"Smoothie",          r:"Crewmate",  p:7, d:6, s:6, c:"Big Mom Pirates",    sp:["Juice Squeeze"] },
  { n:"Cracker",           r:"Crewmate",  p:7, d:8, s:6, c:"Big Mom Pirates",    sp:["Pretzel","Biscuit Soldier"] },
  { n:"Daifuku",           r:"Crewmate",  p:6, d:6, s:5, c:"Big Mom Pirates",    sp:["Genie Smash"] },
  { n:"Oven",              r:"Crewmate",  p:7, d:6, s:5, c:"Big Mom Pirates",    sp:["Heat Palm"] },
  { n:"Mont-d'Or",         r:"Crewmate",  p:5, d:5, s:5, c:"Big Mom Pirates",    sp:["Book Prison"] },
  { n:"Brulee",            r:"Crewmate",  p:4, d:4, s:5, c:"Big Mom Pirates",    sp:["Mirro-World"] },
  { n:"Galette",           r:"Crewmate",  p:6, d:5, s:6, c:"Big Mom Pirates",    sp:["Butter Shot"] },
  { n:"Amande",            r:"Crewmate",  p:6, d:5, s:6, c:"Big Mom Pirates",    sp:["Shirauo Slash"] },
  { n:"Jack",              r:"Crewmate",  p:8, d:8, s:5, c:"Beasts Pirates",     sp:["Mammoth Stomp"] },
  { n:"Who's-Who",         r:"Crewmate",  p:7, d:6, s:7, c:"Beasts Pirates",     sp:["Sword-Cat Strike"] },
  { n:"Sasaki",            r:"Crewmate",  p:7, d:6, s:6, c:"Beasts Pirates",     sp:["Armadillo Roll"] },
  { n:"Ulti",              r:"Crewmate",  p:7, d:6, s:6, c:"Beasts Pirates",     sp:["Headbutt Ram"] },
  { n:"Page One",          r:"Crewmate",  p:6, d:6, s:5, c:"Beasts Pirates",     sp:["Spino Bite"] },
  { n:"Babanuki",          r:"Crewmate",  p:5, d:6, s:4, c:"Beasts Pirates",     sp:["Tank Blast"] },
  { n:"Sheepshead",        r:"Crewmate",  p:5, d:5, s:5, c:"Beasts Pirates",     sp:["Horn Slash"] },
  { n:"Speed",             r:"Crewmate",  p:5, d:4, s:7, c:"Beasts Pirates",     sp:["Hoof Stomp"] },
  { n:"Vasco Shot",        r:"Crewmate",  p:6, d:6, s:5, c:"Blackbeard Pirates", sp:[] },
  { n:"Sanjuan Wolf",      r:"Crewmate",  p:8, d:9, s:3, c:"Blackbeard Pirates", sp:[] },
  { n:"Catarina Devon",    r:"Crewmate",  p:7, d:6, s:6, c:"Blackbeard Pirates", sp:["Nine-Tail Bite"] },
  { n:"Avalo Pizarro",     r:"Crewmate",  p:6, d:6, s:5, c:"Blackbeard Pirates", sp:["Island Crush"] },
  { n:"Diamante",          r:"Crewmate",  p:7, d:7, s:6, c:"Donquixote Pirates", sp:["Tackle Flag"] },
  { n:"Pica",              r:"Crewmate",  p:7, d:8, s:4, c:"Donquixote Pirates", sp:["Stone Fist"] },
  { n:"Trebol",            r:"Crewmate",  p:6, d:7, s:4, c:"Donquixote Pirates", sp:["Sticky Bind"] },
  { n:"Sugar",             r:"Crewmate",  p:3, d:3, s:4, c:"Donquixote Pirates", sp:[] },
  { n:"Monet",             r:"Crewmate",  p:5, d:5, s:6, c:"Donquixote Pirates", sp:[] },
  { n:"Machvise",          r:"Crewmate",  p:6, d:7, s:3, c:"Donquixote Pirates", sp:[] },
  { n:"Lao G",             r:"Crewmate",  p:6, d:5, s:5, c:"Donquixote Pirates", sp:[] },
  { n:"Baby 5",            r:"Crewmate",  p:5, d:5, s:6, c:"Donquixote Pirates", sp:[] },
  { n:"Dellinger",         r:"Crewmate",  p:6, d:5, s:7, c:"Donquixote Pirates", sp:["Fighting Fish Kick"] },
  { n:"Heat",              r:"Crewmate",  p:6, d:6, s:6, c:"Kid Pirates",        sp:["Flame Breath"] },
  { n:"Wire",              r:"Crewmate",  p:6, d:6, s:6, c:"Kid Pirates",        sp:[] },
  { n:"Mohji",             r:"Crewmate",  p:4, d:4, s:5, c:"Buggy Pirates",      sp:[] },
  { n:"Alvida",            r:"Crewmate",  p:5, d:5, s:6, c:"Buggy Pirates",      sp:["Slip-Slip Strike"] },
  { n:"Crocodile",         r:"Crewmate", img:"crocodile.jpg", cap:true, p:8, d:8, s:8, c:"Free Agent", sp:["Desert Samble","Ground Death"] },
  { n:"Boa Hancock",       r:"Crewmate", img:"BoaHancock.jpg", cap:true, p:8, d:7, s:8, c:"Free Agent", sp:["Love-Love Beam","Perfume Femur"] },
  { n:"Bartolomeo",        r:"Crewmate", p:6, d:7, s:5, c:"Free Agent", sp:["Barrier Crash"] },
  { n:"Bartholomew Kuma",  r:"Crewmate", p:8, d:8, s:6, c:"Free Agent", sp:["Ursa Shock","Pad Cannon"] },
  { n:"Gecko Moria",       r:"Crewmate", p:7, d:7, s:5, c:"Free Agent", sp:["Shadow Asgard"] },
  { n:"X. Drake",          r:"Crewmate", p:7, d:6, s:6, c:"Free Agent", sp:[] },
  { n:"Douglas Bullet",    r:"Crewmate", p:6, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Foxy",              r:"Crewmate", p:6, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Fisher Tiger",      r:"Crewmate", p:6, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Wadatsumi",         r:"Crewmate", p:6, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Arlong",            r:"Crewmate", p:7, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Karasu",            r:"Crewmate", p:7, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Inazuma",           r:"Crewmate", p:5, d:5, s:7, c:"Free Agent", sp:[] },
  { n:"Hack",              r:"Crewmate", p:4, d:4, s:6, c:"Free Agent", sp:[] },
  { n:"Monkey D. Dragon",  r:"Crewmate", img:"Dragon.jpg", cap:true, p:8, d:8, s:7, c:"Free Agent", sp:[] },
  { n:"Jewelrey Bonney",   r:"Crewmate", p:6, d:5, s:6, c:"Free Agent", sp:[] },
  { n:"Hajrudin",          r:"Crewmate", p:8, d:6, s:6, c:"Free Agent", sp:[] },
  { n:"Dorry",             r:"Crewmate", p:8, d:6, s:6, c:"Free Agent", sp:[] },
  { n:"Broggy",            r:"Crewmate", p:8, d:6, s:6, c:"Free Agent", sp:[] },
  { n:"Jaguar D. Saul",    r:"Crewmate", p:6, d:6, s:6, c:"Free Agent", sp:[] },

  // --- Navy / Marines (PvE-bazen op marinebasis-dagen) ---------------------
  //  navy:true = vijand-only; niet koopbaar, niet in de kapiteinslijst.
  { n:"Akainu",   r:"Admiral", navy:true, p:10, d:9,  s:8,  c:"Marine", sp:["Great Eruption","Hound Blaze"] },
  { n:"Kizaru",   r:"Admiral", navy:true, p:9,  d:8,  s:10, c:"Marine", sp:["Yata Mirror","Amaterasu"] },
  { n:"Fujitora", r:"Admiral", navy:true, p:9,  d:9,  s:8,  c:"Marine", sp:["Gravity Blade","Meteor"] },
  { n:"Ryokugyu", r:"Admiral", navy:true, p:9,  d:8,  s:9,  c:"Marine", sp:["Forest Drain","Wood Bind"] },
  { n:"Kuzan",    r:"Admiral", navy:true, p:9,  d:9,  s:8,  c:"Marine", sp:["Ice Age","Ice Saber"] },
  { n:"Sengoku",  r:"Admiral", navy:true, p:9,  d:9,  s:8,  c:"Marine", sp:["Shockwave","Buddha Palm"] },
  { n:"Garp",     r:"Admiral", navy:true, p:10, d:10, s:8,  c:"Marine", sp:["Fist of Love","Galaxy Impact"] },
  { n:"Smoker",   r:"Marine",  navy:true, p:8,  d:7,  s:8,  c:"Marine", sp:["White Blow","White Snake"] },
  { n:"Koby",     r:"Marine",  navy:true, p:7,  d:6,  s:7,  c:"Marine", sp:["Soru Strike","Galaxy Impact"] },
];

// Beschikbaar maken voor de browser
if (typeof window !== "undefined") { window.PIRATES = PIRATES; }

// --- Special-attack effecten (jij beheert dit) ---------------------------
//  "fire"  = vonken + warme flash      "smoke" = zachte witte rookpluimen
//  Niet in de lijst = geen extra effect. De KLEUR (goud/groen voor jouw crew,
//  rood voor de tegenstander) gaat automatisch op basis van wie aanvalt.
const SP_FX = {
  "Red Hawk":"fire", "Fire Fist":"fire", "Flame Commandment":"fire", "Fire Bird Star":"fire",
  "Flame Dragon King":"fire", "Diable Jambe":"fire", "Hell Memories":"fire", "Heat Palm":"fire",
  "Flame Breath":"fire", "Boro Breath":"fire", "Great Eruption":"fire", "Hound Blaze":"fire",
  "Overheat":"fire", "Tabasco Star":"fire",
  "White Blow":"smoke", "White Snake":"smoke", "Ice Age":"smoke", "Ice Saber":"smoke",
};
if (typeof window !== "undefined") { window.SP_FX = SP_FX; }
// Maakt de data ook bruikbaar voor het seed-script in Node (raakt de browser/game niet).
if (typeof module !== "undefined" && module.exports) { module.exports = { PIRATES, SP_FX }; }