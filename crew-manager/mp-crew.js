"use strict";

/* ====================================================================
   Crew Manager — mp-crew.js  (STAP 4c — hersteld op de bewezen layout)

   Gebruikt opnieuw de BESTAANDE structuur/klassen die mp.css al style't
   (.cw-top, .cw-main, .ship-col, .bench-col, .slot, .b-slot) + het
   bestaande SHIP_SVG uit game-crew.js — zodat het crew-scherm er weer
   uitziet als vanouds. Twee nieuwe dingen erbovenop:
     - generieke slots (rol reist met het karakter; plek telt niet)
     - kwast-knop -> los bewerk-scherm (side/top profile, drawer, finish ->
       samenvatting -> Api.saveCosmetics)
   De UPGRADE zit nu in het bewerk-scherm (cs-editor) als upgrade-kaart.

   Rendert in #cp-content. window.cmOpenCrew(worldId).
   Single-player (game-crew.js) blijft volledig ongemoeid.
   ==================================================================== */

(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function content(){ return el("cp-content"); }
  function short(n){ return (typeof fmtShort === "function") ? fmtShort(n) : (Math.round((n || 0) / 1e6) + "M"); }
  function col(n){ return (typeof colorFor === "function") ? colorFor(n || "?") : "#8a5a2b"; }
  function ini(n){ return (typeof initial === "function") ? initial(n || "?") : "?"; }
  function mini(label, val){ return (typeof miniStat === "function") ? miniStat(label, val) :
    '<div class="mini-stat"><span class="mini-stat__label">' + label + '</span><span class="mini-stat__val">' + val + '</span></div>'; }
  function berries(n){ return "\u0E3F " + (n || 0).toLocaleString("en-US"); }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }
  function toast(msg){
    var d = document.createElement("div"); d.className = "ol-toast"; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function (){ d.classList.add("out"); }, 1300);
    setTimeout(function (){ if (d.parentNode) d.remove(); }, 1700);
  }

  var SHIP  = (typeof SHIP_SVG  !== "undefined") ? SHIP_SVG : "";
  var BAG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6V5a3 3 0 0 1 6 0v1"/><path d="M5 9.5C5 7.6 6.6 6 8.5 6h7C17.4 6 19 7.6 19 9.5V18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M5 12h14"/><path d="M12 12v3"/></svg>';

  /* generieke slot-posities op het bestaande schip (proven coords) */
  var GENPOS = {
    3: [[50,26],[31,52],[69,52]],
    7: [[28,24],[72,24],[28,44],[72,44],[28,64],[72,64],[50,82]],
    9: [[28,22],[72,22],[28,40],[72,40],[28,58],[72,58],[28,76],[72,76],[50,90]],
  };

  /* tier-info (sync met server/src/config/shipTiers.ts) */
  var NEXT_TIER = { 2:{name:"Caravel",cap:7,price:10000000}, 3:{name:"Yonko-class",cap:13,price:30000000} };
  var SHIPWRIGHT_DISCOUNT = 0.30;

  /* cosmetics: paletten + prijzen (sync met ship.ts) */
  var HULL=["#6b4a2a","#3c4a55","#7a2f2f","#2f5d4a","#4a3b6b","#1f1f24"];
  var DECKC=["#c2a06a","#d9c08a","#a8895a","#9aa6a0","#caa0a0","#6f6357"];
  var TRIM=["#8a5a2b","#e9c46a","#b34747","#3f8f73","#5a6b8a","#2c2c30"];
  var SAILC=["#e7d4a8","#c94f4f","#3f6f9e","#2f7d56","#7a4fa0","#d8d8dc"];
  var FH_LIST=["none","lion","dragon","shark","phoenix","mermaid","ram","serpent","swan"];
  var JR_LIST=["skull","cross","crown","hat","horns","patch","bandana","flame"];
  var COSMETIC_PRICE={hullColor:15000,deckColor:15000,trimColor:15000,sailColor:20000,jollyRoger:40000,figurehead:75000};
  var DEFAULTS={hullColor:"#6b4a2a",deckColor:"#c2a06a",trimColor:"#8a5a2b",sailColor:"#e7d4a8",jollyRoger:"skull",figurehead:"none"};
  var ZONES={
    figurehead:{field:"figurehead",label:"Figurehead",type:"fh"},
    jollyRoger:{field:"jollyRoger",label:"Jolly Roger",type:"jr"},
    hullColor:{field:"hullColor",label:"Hull color",type:"color",palette:HULL},
    deckColor:{field:"deckColor",label:"Deck color",type:"color",palette:DECKC},
    trimColor:{field:"trimColor",label:"Trim color",type:"color",palette:TRIM},
    sailColor:{field:"sailColor",label:"Sail color",type:"color",palette:SAILC},
  };
  var SIDE_BRUSHES=[
    {zone:"figurehead",l:10,t:73,label:"Bow"},{zone:"hullColor",l:46,t:67,label:"Hull"},
    {zone:"deckColor",l:70,t:53,label:"Deck"},{zone:"trimColor",l:26,t:55,label:"Trim"},
    {zone:"sailColor",l:42,t:24,label:"Sail"},{zone:"jollyRoger",l:50,t:37,label:"Flag"},
  ];
  var TOP_BRUSHES=[
    {zone:"hullColor",l:14,t:42,label:"Hull"},{zone:"deckColor",l:50,t:64,label:"Deck"},
    {zone:"trimColor",l:86,t:42,label:"Trim"},{zone:"jollyRoger",l:50,t:50,label:"Flag"},
  ];

  var C = { id:null, data:null, byName:{}, lineup:null, ship:null, edView:"side", edit:null, original:null };

  /* ====================================================================
     SVG-bouwers (alleen voor de EDITOR; crew-scherm gebruikt SHIP_SVG)
     ==================================================================== */
  var SKULL = '<path d="M-18,-3 C-18,-19 18,-19 18,-3 C18,7 11,11 8,12 L-8,12 C-11,11 -18,7 -18,-3 Z" fill="var(--cs-cream)"/><path d="M-8,11 L8,11 L6,21 C6,23 -6,23 -6,21 Z" fill="var(--cs-cream)"/><ellipse cx="-7.5" cy="-3" rx="5" ry="6.2" fill="#16323f"/><ellipse cx="7.5" cy="-3" rx="5" ry="6.2" fill="#16323f"/><path d="M0,3 L-3,9 L3,9 Z" fill="#16323f"/><g stroke="#16323f" stroke-width="1.5"><line x1="-3.5" y1="13" x2="-3.5" y2="20"/><line x1="0" y1="13" x2="0" y2="21"/><line x1="3.5" y1="13" x2="3.5" y2="20"/></g>';
  var BONES = '<g stroke="var(--cs-cream)" stroke-width="5.5" stroke-linecap="round"><line x1="-19" y1="-15" x2="19" y2="19"/><line x1="19" y1="-15" x2="-19" y2="19"/></g><g fill="var(--cs-cream)"><circle cx="-21" cy="-17" r="3.6"/><circle cx="-17" cy="-13" r="3.6"/><circle cx="21" cy="-17" r="3.6"/><circle cx="17" cy="-13" r="3.6"/><circle cx="-21" cy="21" r="3.6"/><circle cx="-17" cy="17" r="3.6"/><circle cx="21" cy="21" r="3.6"/><circle cx="17" cy="17" r="3.6"/></g>';
  function buildJolly(k){
    var F={ skull:SKULL, cross:BONES+SKULL,
      crown:SKULL+'<g fill="var(--cs-gold)"><rect x="-13" y="-22" width="26" height="3.5"/><path d="M-13,-22 L-8,-30 L-3,-22 L0,-31 L3,-22 L8,-30 L13,-22 Z"/></g>',
      hat:SKULL+'<path d="M-24,-13 C-12,-30 12,-30 24,-13 C16,-17 8,-19 0,-19 C-8,-19 -16,-17 -24,-13 Z" fill="#1b1b22"/><circle cx="0" cy="-18" r="2.6" fill="var(--cs-gold)"/>',
      horns:'<path d="M-14,-13 C-25,-17 -30,-27 -25,-35 C-22,-28 -17,-21 -10,-16 Z" fill="var(--cs-cream)"/><path d="M14,-13 C25,-17 30,-27 25,-35 C22,-28 17,-21 10,-16 Z" fill="var(--cs-cream)"/>'+SKULL,
      patch:SKULL+'<path d="M-16,-10 L17,-13" stroke="#16323f" stroke-width="3" stroke-linecap="round"/><ellipse cx="7.5" cy="-3" rx="6.5" ry="7" fill="#16323f"/>',
      bandana:SKULL+'<path d="M-19,-9 C-7,-15 7,-15 19,-9 L19,-4 C7,-10 -7,-10 -19,-4 Z" fill="#a23b3b"/><path d="M-19,-7 L-28,-11 L-25,-4 L-30,1 Z" fill="#a23b3b"/>',
      flame:'<g fill="var(--cs-gold)" opacity=".92"><path d="M0,-27 C9,-15 8,-6 0,3 C-8,-6 -9,-15 0,-27 Z"/><path d="M-13,-19 C-7,-11 -8,-3 -15,3 C-20,-6 -19,-14 -13,-19 Z"/><path d="M13,-19 C7,-11 8,-3 15,3 C20,-6 19,-14 13,-19 Z"/></g>'+SKULL };
    return F[k]||SKULL;
  }
  function jolliesAll(){ return JR_LIST.map(function(k){ return '<g class="cs-jr cs-jr-'+k+'">'+buildJolly(k)+'</g>'; }).join(""); }
  var FH={
    lion:'<circle r="15" fill="var(--cs-trim)"/><circle cx="-2" r="9" fill="var(--cs-gold)"/><g stroke="var(--cs-trim)" stroke-width="4" stroke-linecap="round"><line x1="13" y1="-11" x2="21" y2="-15"/><line x1="16" y1="0" x2="25" y2="0"/><line x1="13" y1="11" x2="21" y2="15"/><line x1="8" y1="-14" x2="11" y2="-23"/><line x1="8" y1="14" x2="11" y2="23"/></g><circle cx="-9" cy="-2" r="2" fill="#1b1b1b"/>',
    dragon:'<path d="M-17 0 L15 -11 L27 4 L14 9 L-12 6 Z" fill="var(--cs-trim)"/><path d="M14 9 L25 19 L6 12 Z" fill="var(--cs-gold)"/><circle cx="-9" cy="-2" r="2.4" fill="#1b1b1b"/><path d="M2 -8 L8 -21 L13 -6 Z" fill="var(--cs-gold)"/>',
    shark:'<path d="M-23 2 C-4 -15,19 -11,27 2 C17 11,-4 13,-23 6 Z" fill="var(--cs-trim)"/><path d="M2 -11 L11 -27 L15 -8 Z" fill="var(--cs-gold)"/><circle cx="-15" cy="0" r="2.2" fill="#1b1b1b"/><path d="M-23 2 L-28 9 L-22 6 Z" fill="var(--cs-gold)"/>',
    phoenix:'<path d="M-21 0 C-2 -13,17 -11,27 -2 L15 4 L27 11 C17 15,-2 13,-21 6 Z" fill="var(--cs-trim)"/><path d="M-17 -2 L-28 -5 L-19 2 Z" fill="var(--cs-gold)"/><g stroke="var(--cs-gold)" stroke-width="3" stroke-linecap="round"><line x1="6" y1="-9" x2="10" y2="-23"/><line x1="13" y1="-6" x2="19" y2="-19"/></g><circle cx="-13" cy="0" r="2" fill="#1b1b1b"/>',
    mermaid:'<circle cx="-3" cy="-13" r="7" fill="var(--cs-gold)"/><path d="M-3 -7 C4 -1,6 10,0 19 C-11 15,-13 4,-9 -3 Z" fill="var(--cs-trim)"/><path d="M0 19 C6 23,12 19,15 25 C8 27,2 25,-3 23 Z" fill="var(--cs-gold)"/>',
    ram:'<circle r="12" fill="var(--cs-trim)"/><circle cx="-3" r="7" fill="var(--cs-gold)"/><path d="M10 -9 C22 -12,24 -1,16 4 C22 -2,16 -7,9 -4 Z" fill="var(--cs-trim)"/><path d="M10 9 C22 12,24 1,16 -4 C22 2,16 7,9 4 Z" fill="var(--cs-trim)"/><circle cx="-8" cy="-2" r="2" fill="#1b1b1b"/>',
    serpent:'<path d="M-21 3 C-9 -9,9 -9,17 1 C24 8,18 17,9 14 C17 11,16 4,9 2 C1 -2,-9 1,-17 7 Z" fill="var(--cs-trim)"/><circle cx="-15" cy="1" r="2" fill="var(--cs-gold)"/><path d="M-21 3 L-28 1 L-23 7 Z" fill="var(--cs-gold)"/>',
    swan:'<path d="M-3 19 C-7 8,-4 -3,3 -9 C8 -13,12 -10,9 -5 C7 -8,2 -8,-1 -3 C-3 2,-1 9,4 17 Z" fill="var(--cs-cream)"/><circle cx="7" cy="-10" r="4.5" fill="var(--cs-cream)"/><path d="M3 -10 L-5 -8 L3 -6 Z" fill="var(--cs-gold)"/>',
  };
  function fhSideAll(){ return FH_LIST.map(function(n){ return n==="none"?'<g class="cs-fh cs-fh-none"></g>':'<g class="cs-fh cs-fh-'+n+'"><g transform="translate(54 196)">'+FH[n]+'</g></g>'; }).join(""); }

  function topdownContent(g){
    return '<path d="M150 26 C210 70,268 150,270 300 C271 430,235 520,150 572 C65 520,29 430,30 300 C32 150,90 70,150 26 Z" fill="var(--cs-hull)" stroke="var(--cs-trim)" stroke-width="9"/>'+
      '<path d="M150 56 C198 95,244 162,246 300 C247 418,216 498,150 544 C84 498,53 418,54 300 C56 162,102 95,150 56 Z" fill="var(--cs-deck)"/>'+
      '<g stroke="rgba(0,0,0,.12)" stroke-width="2"><line x1="60" y1="150" x2="240" y2="150"/><line x1="55" y1="225" x2="245" y2="225"/><line x1="54" y1="300" x2="246" y2="300"/><line x1="55" y1="375" x2="245" y2="375"/><line x1="62" y1="450" x2="238" y2="450"/><line x1="150" y1="60" x2="150" y2="540"/></g>'+
      '<g transform="translate(150 300) rotate('+g+') scale(.8)"><circle r="44" fill="rgba(10,24,32,.16)"/>'+jolliesAll()+'</g>'+
      '<g transform="translate(150 506) rotate('+g+')"><circle r="18" fill="none" stroke="var(--cs-trim)" stroke-width="5"/><circle r="6" fill="var(--cs-trim)"/><g stroke="var(--cs-trim)" stroke-width="4"><line x1="0" y1="-24" x2="0" y2="24"/><line x1="-24" y1="0" x2="24" y2="0"/><line x1="-17" y1="-17" x2="17" y2="17"/><line x1="17" y1="-17" x2="-17" y2="17"/></g></g>';
  }
  function shipSideContent(){
    return '<line x1="320" y1="50" x2="120" y2="190" stroke="rgba(0,0,0,.22)" stroke-width="2"/><line x1="320" y1="50" x2="545" y2="190" stroke="rgba(0,0,0,.22)" stroke-width="2"/><line x1="320" y1="50" x2="60" y2="194" stroke="rgba(0,0,0,.2)" stroke-width="2"/>'+
      '<line x1="320" y1="196" x2="320" y2="46" stroke="var(--cs-trim)" stroke-width="9" stroke-linecap="round"/>'+
      '<path d="M308 92 h24 v9 a6 6 0 0 1 -6 6 h-12 a6 6 0 0 1 -6 -6 Z" fill="var(--cs-trim)"/>'+
      '<line x1="230" y1="76" x2="414" y2="76" stroke="var(--cs-trim)" stroke-width="6" stroke-linecap="round"/>'+
      '<path d="M236 80 C300 92,344 92,408 80 L408 188 C344 200,300 200,236 188 Z" fill="var(--cs-sail)" stroke="rgba(0,0,0,.12)" stroke-width="2"/>'+
      '<g transform="translate(322 130) scale(1.25)">'+jolliesAll()+'</g>'+
      '<path d="M300 80 L150 188 L300 188 Z" fill="var(--cs-sail)" opacity=".9" stroke="rgba(0,0,0,.1)" stroke-width="2"/>'+
      '<path d="M320 46 L360 54 L320 62 Z" fill="var(--cs-trim)"/>'+
      '<line x1="120" y1="190" x2="40" y2="176" stroke="var(--cs-trim)" stroke-width="6" stroke-linecap="round"/>'+
      '<path d="M70 198 L120 188 L548 188 C566 188,576 196,572 210 C560 250,470 286,310 286 C190 286,118 262,80 226 C68 214,60 204,70 198 Z" fill="var(--cs-hull)"/>'+
      '<path d="M70 198 L120 188 L548 188 C566 188,576 196,572 210 L70 210 Z" fill="var(--cs-trim)"/>'+
      '<rect x="120" y="188" width="428" height="5" fill="var(--cs-deck)"/>'+
      '<g fill="rgba(0,0,0,.2)"><circle cx="200" cy="234" r="8"/><circle cx="280" cy="242" r="8"/><circle cx="360" cy="244" r="8"/><circle cx="440" cy="238" r="8"/></g>'+
      '<path d="M560 250 L575 256 L569 282 L556 271 Z" fill="var(--cs-trim)"/>'+
      fhSideAll();
  }

  function applyShip(ship){
    var s = ship || {}, d = document.documentElement.style;
    d.setProperty("--cs-hull", s.hullColor || DEFAULTS.hullColor);
    d.setProperty("--cs-deck", s.deckColor || DEFAULTS.deckColor);
    d.setProperty("--cs-trim", s.trimColor || DEFAULTS.trimColor);
    d.setProperty("--cs-sail", s.sailColor || DEFAULTS.sailColor);
    document.body.dataset.csfh = s.figurehead || DEFAULTS.figurehead;
    document.body.dataset.csjr = s.jollyRoger || DEFAULTS.jollyRoger;
  }

  /* ====================================================================
     Laden + crew-scherm (bewezen layout)
     ==================================================================== */
  window.cmOpenCrew = function (worldId){
    C.id = worldId || C.id;
    activateScreen("screen-competition");
    injectCss();
    content().innerHTML = '<div class="wl-head"><div><div class="cp-title">Crew &amp; line-up</div><div class="cp-subt">Loading\u2026</div></div></div>';
    load();
  };

  async function load(){
    try { C.data = await Api.getLineup(C.id); }
    catch (e){ content().innerHTML = '<div class="wl-err">' + esc(e.message) + '</div>'; return; }
    C.byName = {}; (C.data.squad || []).forEach(function (m){ C.byName[m.name] = m; });
    C.lineup = C.data.lineup || { deck: [], bench: [] };
    if (!Array.isArray(C.lineup.deck))  C.lineup.deck = [];
    if (!Array.isArray(C.lineup.bench)) C.lineup.bench = [];
    C.ship = C.data.ship || {};
    applyShip(C.ship);
    render();
  }

  function totalBounty(){
    var cs = C.data.captainStats || { p: 8, d: 8, s: 8 };
    var b = (cs.p + cs.d + cs.s) * 1e6;
    (C.data.squad || []).forEach(function (m){ b += (m.p + m.d + m.s) * 1e6; });
    return b;
  }

  function ccm(m){
    return window.CrewCard ? CrewCard.member(m)
      : ('<div class="cc-nm">' + esc(m && m.name || "") + '</div>');
  }

  function deckSlot(i){
    var posSet = GENPOS[C.lineup.deck.length] || GENPOS[9];
    var pos = posSet[i] || [50,50];
    var style = "left:" + pos[0] + "%; top:" + pos[1] + "%";
    var name = C.lineup.deck[i];
    if (name){
      var m = C.byName[name] || {};
      var tired = (m.cond != null && m.cond < 80) ? '<span class="cs-tired" title="Tired (< 80)">\u26A1</span>' : "";
      return '<div class="slot filled" style="' + style + '" data-drop="deck:' + i + '" data-drag="deck:' + i + '">' +
        tired + ccm({ name: name, role: m.role }) + '</div>';
    }
    return '<div class="slot empty" style="' + style + '" data-drop="deck:' + i + '">' +
      '<div class="slot-plus">+</div></div>';
  }
  function benchSlot(i){
    var name = C.lineup.bench[i];
    if (name){
      var m = C.byName[name] || {};
      return '<div class="slot filled cc-bench" data-drop="bench:' + i + '" data-drag="bench:' + i + '">' +
        ccm({ name: name, role: m.role }) + '</div>';
    }
    return '<div class="slot empty cc-bench" data-drop="bench:' + i + '"><div class="slot-plus">+</div></div>';
  }

  function canAfford(){
    var cur = (C.ship && C.ship.shipTier) || 1, info = NEXT_TIER[cur + 1];
    if (!info) return false;
    var price = crewHasShipwright() ? Math.round(info.price * (1 - SHIPWRIGHT_DISCOUNT)) : info.price;
    var funds = (C.ship && C.ship.funds != null) ? C.ship.funds
              : (C.data && C.data.funds != null ? C.data.funds : null);
    return (funds == null) ? true : (funds >= price);   // bij onbekende funds niet blokkeren
  }

  function render(){
    var d = C.data, roster = d.squad || [], cap = d.rosterCap || 13;
    var deckN = C.lineup.deck.length, benchN = C.lineup.bench.length;

    var capSlot =
      '<div class="slot cap filled" style="left:50%; top:8%">' +
        ccm({ name: d.captain, role: "Captain" }) + '</div>';

    var deckHtml = ""; for (var i = 0; i < deckN; i++) deckHtml += deckSlot(i);
    var benchHtml = ""; for (var b = 0; b < benchN; b++) benchHtml += benchSlot(b);

    var note = roster.length === 0
      ? "Your crew is empty &mdash; recruit members on the transfer market, then drag them onto the deck."
      : (deckN < 9 ? "Drag crew between deck and bench. Bench rests to full. Only your 9 on deck fight."
                   : "Drag a crew member onto a post. Drop on a filled post to swap. Only your 9 on deck fight.");

    content().innerHTML =
      '<div class="cs-fit">' +
      '<div class="cw-top">' +
        '<div class="cw-id"><div class="cw-av" style="background:' + col(d.captain) + '">' + ini(d.captain) + '</div>' +
          '<div><div class="cw-crew">' + esc(d.crewName) + '</div><div class="cw-cap">Captain ' + esc(d.captain) + '</div></div></div>' +
        '<div class="cw-bal">' + mini("Bounty", short(totalBounty())) + mini("Crew", (roster.length + 1) + " / " + (cap + 1)) + '</div>' +
        '<button class="cw-bag" id="cs-bag" type="button" aria-label="Open inventory" title="Open your backpack">' + BAG_ICON + '</button>' +
        '<button class="btn-ghost cw-back" id="cs-back" type="button">Back</button>' +
      '</div>' +
      '<div class="cw-main">' +
        '<div class="ship-wrap">' +
          '<div class="ship-tools">' +
            '<button class="ship-tool" id="cs-brush" type="button" title="Customize ship" aria-label="Customize ship">\uD83D\uDD8C</button>' +
          '</div>' +
          '<div class="ship-col">' + SHIP + capSlot + deckHtml + '</div>' +
        '</div>' +
        '<div class="bench-col"><div class="bench"><div class="bench-title">Bench</div>' +
          '<div class="cc-benchwrap">' + benchHtml + '</div>' +
          '</div><div class="bench-note">' + note + '</div></div>' +
        '</div>' +
      '</div>';

    el("cs-back").addEventListener("click", function (){ if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(C.id); });
    var bag = el("cs-bag");
    if (bag) bag.addEventListener("click", function (){
      if (typeof window.cmOpenInventory === "function") window.cmOpenInventory(C.id);
      else toast("Inventory is not available yet");
    });
    var brush = el("cs-brush"); if (brush) brush.addEventListener("click", openEditor);   // kwast -> bewerk-scherm (met upgrade-kaart)
    content().querySelectorAll("[data-drag]").forEach(function (e){ e.addEventListener("pointerdown", onDragStart); });
    setupShipFit();
  }

  /* ---- schip-fit: puur CSS (aspect-ratio + rotatie zit in mp-fit.css).
     JS doet alleen nog:
       (1) de ECHTE verhouding uit de SHIP_SVG viewBox in CSS-vars zetten
           zodat het dek-vak het schip exact omsluit en de lig-fit klopt;
       (2) de kaartjes-schaal (--cs-slot-scale) laten meelopen met de
           werkelijke dekbreedte, via een ResizeObserver op .ship-wrap.
     Geen viewport-meting, geen resize/orientation-listeners meer. ---- */
  var SLOT_FRAC = 0.22;        // doel: kaart-breedte ≈ 22% van de dek-breedte
  var shipRO    = null;
  var SHIPW = 330, SHIPH = 600;

  /* meet .ship-wrap (echte pixels) en zet daaruit de schiphoogte + kaartschaal.
     Breedte volgt via CSS aspect-ratio; draaien/centreren is CSS. */
  function fitShip(){
    var col  = content().querySelector(".ship-col");
    var wrap = content().querySelector(".ship-wrap");
    if (!col || !wrap) return;
    var W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;

    var landscape = false;
    try { landscape = window.matchMedia("(orientation: landscape)").matches; } catch (e) {}

    var rHW = SHIPH / SHIPW;                       // hoogte/breedte van het dek
    // pre-transform hoogte: staand = rechtop, liggend = de (horizontale) lange as
    var px = landscape ? Math.min(W, H * rHW) : Math.min(H, W * rHW);
    col.style.height = Math.floor(px) + "px";      // breedte volgt via aspect-ratio

    // kaartjes-schaal: kaart ≈ SLOT_FRAC van de korte dek-zijde
    var deck = px * (SHIPW / SHIPH);
    var slot = col.querySelector(".slot");
    var card = slot ? slot.offsetWidth : 0;        // pre-transform = natuurlijke breedte
    if (deck && card){
      var s = Math.max(0.45, Math.min(1.15, (SLOT_FRAC * deck) / card));
      content().style.setProperty("--cs-slot-scale", s.toFixed(3));
    }
  }

  function setupShipFit(){
    var col  = content().querySelector(".ship-col");
    var wrap = content().querySelector(".ship-wrap");
    if (!col || !wrap) return;

    // echte verhouding uit de viewBox (voor de CSS aspect-ratio + de fit-math)
    var svg = col.querySelector("svg");
    var vb  = svg && svg.getAttribute("viewBox");
    SHIPW = 330; SHIPH = 600;
    if (vb){ var p = vb.split(/[\s,]+/); if (+p[2] > 0 && +p[3] > 0){ SHIPW = +p[2]; SHIPH = +p[3]; } }
    col.style.setProperty("--ship-w", SHIPW);
    col.style.setProperty("--ship-h", SHIPH);

    // herbereken bij elke maatwijziging van de wrapper (incl. draaien)
    if (shipRO) shipRO.disconnect();
    if (typeof ResizeObserver === "function"){
      shipRO = new ResizeObserver(function (){ fitShip(); });
      shipRO.observe(wrap);
    }
    fitShip();
  }

  /* ---- drag & drop (posities; index-based) ---- */
  function getPlace(type, key){ return type === "deck" ? C.lineup.deck[key] : C.lineup.bench[key]; }
  function setPlace(type, key, name){ if (type === "deck") C.lineup.deck[key] = name || null; else C.lineup.bench[key] = name || null; }
  function saveSoon(){ Api.saveLineup(C.id, C.lineup).catch(function (e){ toast(e.message || "Couldn\u2019t save line-up"); }); }

  var drag = null;
  function dropTargetAt(x, y){ var e = document.elementFromPoint(x, y); return e ? e.closest("[data-drop]") : null; }
  function moveGhost(x, y){ if (drag && drag.ghost){ drag.ghost.style.left = x + "px"; drag.ghost.style.top = y + "px"; } }
  function onDragStart(e){
    if (e.button && e.button !== 0) return;
    var parts = e.currentTarget.dataset.drag.split(":");
    var type = parts[0], key = parseInt(parts[1], 10);
    var name = getPlace(type, key);
    if (!name) return;
    e.preventDefault();
    drag = { type:type, key:key, name:name, srcEl:e.currentTarget, ghost:null };
    e.currentTarget.classList.add("is-source");
    var g = document.createElement("div"); g.className = "drag-ghost";
    g.innerHTML = '<div class="slot filled"><div class="slot-nm"><span class="dot" style="background:' + col(name) + '"></span>' + esc(name) + '</div></div>';
    document.body.appendChild(g); drag.ghost = g; moveGhost(e.clientX, e.clientY);
    document.body.classList.add("is-dragging");
    content().querySelectorAll("[data-drop]").forEach(function (dd){ dd.classList.add("droppable"); });
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragCancel);
  }
  function onDragMove(e){
    if (!drag) return; e.preventDefault(); moveGhost(e.clientX, e.clientY);
    var t = dropTargetAt(e.clientX, e.clientY);
    content().querySelectorAll("[data-drop]").forEach(function (dd){ dd.classList.toggle("drop-hover", dd === t); });
  }
  function onDragUp(e){ endDrag(true, e.clientX, e.clientY); }
  function onDragCancel(){ endDrag(false, 0, 0); }
  function applyDrop(tType, tKey){
    var occupant = getPlace(tType, tKey);
    if (occupant === drag.name) return;
    setPlace(tType, tKey, drag.name);
    setPlace(drag.type, drag.key, occupant);
    saveSoon();
  }
  function endDrag(apply, x, y){
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
    window.removeEventListener("pointercancel", onDragCancel);
    if (apply && drag){ var t = dropTargetAt(x, y); if (t){ var parts = t.dataset.drop.split(":"); applyDrop(parts[0], parseInt(parts[1], 10)); } }
    if (drag){ if (drag.srcEl) drag.srcEl.classList.remove("is-source"); if (drag.ghost) drag.ghost.remove(); }
    document.body.classList.remove("is-dragging");
    drag = null; render();
  }

  /* ---- upgrade ---- */
  function crewHasShipwright(){
    return (C.data && Array.isArray(C.data.squad) && C.data.squad.some(function (m){
      return m.role === "Shipwright" || (Array.isArray(m.altRoles) && m.altRoles.indexOf("Shipwright") >= 0);
    }));
  }
  function shipFunds(){
    if (C.ship && C.ship.funds != null) return C.ship.funds;
    if (C.data && C.data.funds != null) return C.data.funds;
    return null;
  }
  function doUpgrade(){
    var cur = (C.ship && C.ship.shipTier) || 1, to = cur + 1, info = NEXT_TIER[to];
    if (!info) return;
    var hasSW = crewHasShipwright();
    var price = hasSW ? Math.round(info.price * (1 - SHIPWRIGHT_DISCOUNT)) : info.price;
    var msg = "Upgrade to " + info.name + " (crew up to " + (info.cap + 1) + ") for " + berries(price) + ".";
    if (hasSW) msg += "\nShipwright aboard: \u221230% (was " + berries(info.price) + ").";
    if (typeof openModal !== "function"){ confirmUpgrade(); return; }
    openModal({ title:"Upgrade ship", message:msg, confirmLabel:"Upgrade", danger:false, showCancel:true, onConfirm:confirmUpgrade });
  }
  async function confirmUpgrade(){
    var btn = el("cs-upg"); if (btn) btn.disabled = true;
    try {
      var r = await Api.upgradeShip(C.id);
      toast(r.discounted ? "Ship upgraded \u2014 Shipwright discount applied!" : "Ship upgraded!");
      await load();
      // editor staat mogelijk nog open -> kaart verversen met de nieuwe tier
      if (el("cs-editor") && el("cs-editor").classList.contains("open")) renderUpgradeCard();
    }
    catch (e){ toast(e.message || "Upgrade failed"); if (btn) btn.disabled = false; }
  }

  /* upgrade-kaart in het bewerk-scherm (variant A) */
  function renderUpgradeCard(){
    var host = el("cs-upg-card"); if (!host) return;
    var cur     = (C.ship && C.ship.shipTier) || 1;
    var curName = (C.ship && C.ship.tierName) ? C.ship.tierName : ("Tier " + cur);
    var info    = NEXT_TIER[cur + 1];

    if (!info){
      host.className = "cs-upg maxed";
      host.innerHTML =
        '<div class="cs-upg-maxed-t">\u2693 Maximum tier reached</div>' +
        '<div class="cs-upg-maxed-s">Your ship is fully upgraded.</div>';
      return;
    }

    host.className = "cs-upg";
    var hasSW  = crewHasShipwright();
    var price  = hasSW ? Math.round(info.price * (1 - SHIPWRIGHT_DISCOUNT)) : info.price;
    var afford = canAfford();
    var funds  = shipFunds();
    var curCap = (C.data && C.data.rosterCap != null) ? C.data.rosterCap
               : (NEXT_TIER[cur] ? NEXT_TIER[cur].cap : 3);
    var newCap = info.cap;

    var costHtml = hasSW
      ? '<span class="cs-upg-was">' + berries(info.price) + '</span>' + berries(price)
      : berries(price);

    var bottom = afford
      ? (hasSW
          ? '<div class="cs-upg-req"><span class="ok">\u2713</span> Shipwright aboard \u2014 30% off.</div>'
          : '<div class="cs-upg-req"><span class="hint">\u2693</span> Add a Shipwright to your crew for 30% off.</div>')
      : '<div class="cs-upg-req"><span class="no">\u2715</span> Not enough berries' +
          (funds != null ? ' (need ' + berries(price - funds) + ' more).' : '.') + '</div>';

    var btn = '<button class="cs-upg-btn" id="cs-upg" type="button"' + (afford ? '' : ' disabled') + '>Upgrade</button>';

    host.innerHTML =
      '<div class="cs-upg-top">' +
        '<div class="cs-upg-ic">\u2B06</div>' +
        '<div class="cs-upg-h"><div class="cs-upg-h-l">Ship upgrade</div>' +
          '<div class="cs-upg-h-t">' + esc(curName) + ' \u2192 ' + esc(info.name) + '</div></div>' +
        '<div class="cs-upg-tiers"><span class="cs-tier-pill">Tier ' + cur + '</span>' +
          '<span class="cs-upg-arrow">\u25B6</span>' +
          '<span class="cs-tier-pill next">Tier ' + (cur + 1) + '</span></div>' +
      '</div>' +
      '<div class="cs-upg-gains">' +
        '<div class="cs-upg-gain"><span class="g-ic">\uD83D\uDC65</span><b>Crew capacity</b>' +
          '<span class="g-val">' + (curCap + 1) + ' <span class="up">\u2192 ' + (newCap + 1) + '</span></span></div>' +
      '</div>' +
      '<div class="cs-upg-foot">' +
        '<div class="cs-upg-cost"><span class="cs-upg-cost-l">Cost</span>' +
          '<span class="cs-upg-cost-v' + (afford ? '' : ' short') + '">' + costHtml + '</span></div>' +
        btn +
      '</div>' +
      bottom;

    var b = el("cs-upg");
    if (b && afford) b.addEventListener("click", doUpgrade);
  }

  /* ====================================================================
     EDITOR (los, fixed overlay — raakt het crew-scherm niet)
     ==================================================================== */
  function ensureEditor(){
    if (el("cs-editor")) return;
    var ov = document.createElement("div"); ov.className = "cs-editor"; ov.id = "cs-editor";
    ov.innerHTML =
      '<div class="cs-ed-head"><button class="btn-ghost" id="cs-ed-cancel" type="button">\u2715 Cancel</button><h2>Customize ship</h2>' +
        '<div class="cs-ed-total"><span>Total</span><b id="cs-ed-total">\u0E3F 0</b></div><button class="cs-ed-finish" id="cs-ed-finish" type="button">Finish</button></div>' +
      '<div class="cs-upg" id="cs-upg-card"></div>' +
      '<div class="cs-ed-body">' +
        '<div class="cs-view-toggle"><button class="btn-ghost" id="cs-view" type="button">\u21C5 Top view</button></div>' +
        '<div class="cs-ed-stage side" id="cs-ed-stage"></div>' +
        '<div class="cs-ed-scrim" id="cs-ed-scrim"></div>' +
        '<div class="cs-drawer" id="cs-drawer"><h4><span id="cs-drawer-ttl">Hull color</span><span class="cs-x" id="cs-drawer-x">\u2715</span></h4><div class="cs-opts" id="cs-opts"></div><div class="cs-applied">Live preview \u2014 changes show on the ship.</div></div>' +
        '<div class="cs-summary" id="cs-summary"><div class="cs-ed-head"><button class="btn-ghost" id="cs-sum-back" type="button">\u2039 Back</button><h2>Review changes</h2></div>' +
          '<div class="cs-sum-body"><ul class="cs-sum-list" id="cs-sum-list"></ul><div class="cs-sum-total" id="cs-sum-trow"><span>Total</span><b id="cs-sum-total">\u0E3F 0</b></div></div>' +
          '<div class="cs-acts"><button class="btn-ghost" id="cs-sum-back2" type="button">Back</button><button class="cs-ed-finish" id="cs-pay" type="button">Finish &amp; pay</button></div></div>' +
      '</div>';
    document.body.appendChild(ov);
    el("cs-ed-cancel").addEventListener("click", cancelEditor);
    el("cs-view").addEventListener("click", toggleView);
    el("cs-ed-stage").addEventListener("click", function (e){ var b = e.target.closest(".cs-brush"); if (b) openDrawer(b.dataset.zone); });
    el("cs-drawer-x").addEventListener("click", closeDrawer);
    el("cs-ed-scrim").addEventListener("click", closeDrawer);
    el("cs-ed-finish").addEventListener("click", function (){ closeDrawer(); showSummary(); });
    el("cs-sum-back").addEventListener("click", function (){ el("cs-summary").classList.remove("open"); });
    el("cs-sum-back2").addEventListener("click", function (){ el("cs-summary").classList.remove("open"); });
    el("cs-pay").addEventListener("click", payAndClose);
  }
  function packShip(s){ s = s || {}; return {
    hullColor:s.hullColor||DEFAULTS.hullColor, deckColor:s.deckColor||DEFAULTS.deckColor,
    trimColor:s.trimColor||DEFAULTS.trimColor, sailColor:s.sailColor||DEFAULTS.sailColor,
    jollyRoger:s.jollyRoger||DEFAULTS.jollyRoger, figurehead:s.figurehead||DEFAULTS.figurehead }; }
  function openEditor(){
    ensureEditor();
    C.original = packShip(C.ship); C.edit = packShip(C.ship); C.edView = "side";
    el("cs-view").textContent = "\u21C5 Top view";
    el("cs-summary").classList.remove("open"); closeDrawer();
    renderEditorShip(); refreshTotal(); renderUpgradeCard();
    el("cs-editor").classList.add("open");
  }
  function toggleView(){
    C.edView = (C.edView === "side") ? "top" : "side";
    el("cs-view").textContent = (C.edView === "side") ? "\u21C5 Top view" : "\u21C5 Side view";
    closeDrawer(); renderEditorShip();
  }
  function renderEditorShip(){
    var stage = el("cs-ed-stage"), brushes, svg;
    if (C.edView === "side"){ stage.className = "cs-ed-stage side"; svg = '<svg class="cs-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid meet">' + shipSideContent() + '</svg>'; brushes = SIDE_BRUSHES; }
    else { stage.className = "cs-ed-stage top"; svg = '<svg class="cs-svg" viewBox="0 0 300 600" preserveAspectRatio="xMidYMid meet">' + topdownContent(0) + '</svg>'; brushes = TOP_BRUSHES; }
    stage.innerHTML = svg + brushes.map(function (b){ return '<button class="cs-brush" data-zone="' + b.zone + '" style="left:' + b.l + '%;top:' + b.t + '%;" aria-label="Edit ' + b.label + '">\uD83D\uDD8C<span class="cs-blbl">' + b.label + '</span></button>'; }).join("");
  }
  function fhPreview(name){ return name === "none" ? '<span class="cs-none">None</span>' : '<svg viewBox="-30 -34 60 68">' + FH[name] + '</svg>'; }
  function jrPreview(key){ return '<svg viewBox="-32 -34 64 68">' + buildJolly(key) + '</svg>'; }
  function openDrawer(zone){
    var Z = ZONES[zone]; if (!Z) return;
    el("cs-drawer-ttl").textContent = Z.label;
    var wrap = el("cs-opts"); wrap.innerHTML = "";
    if (Z.type === "color"){
      Z.palette.forEach(function (c){ var b = document.createElement("button"); b.className = "cs-opt color" + (C.edit[Z.field] === c ? " sel" : ""); b.style.background = c;
        b.onclick = function (){ C.edit[Z.field] = c; applyShip(C.edit); mark(wrap, b); refreshTotal(); }; wrap.appendChild(b); });
    } else if (Z.type === "fh"){
      FH_LIST.forEach(function (name){ var b = document.createElement("button"); b.className = "cs-opt preset" + (C.edit.figurehead === name ? " sel" : ""); b.innerHTML = fhPreview(name);
        b.onclick = function (){ C.edit.figurehead = name; applyShip(C.edit); mark(wrap, b); refreshTotal(); }; wrap.appendChild(b); });
    } else if (Z.type === "jr"){
      JR_LIST.forEach(function (key){ var b = document.createElement("button"); b.className = "cs-opt preset" + (C.edit.jollyRoger === key ? " sel" : ""); b.innerHTML = jrPreview(key);
        b.onclick = function (){ C.edit.jollyRoger = key; applyShip(C.edit); mark(wrap, b); refreshTotal(); }; wrap.appendChild(b); });
    }
    el("cs-ed-stage").querySelectorAll(".cs-brush").forEach(function (x){ x.classList.toggle("active", x.dataset.zone === zone); });
    el("cs-ed-scrim").classList.add("show"); el("cs-drawer").classList.add("show");
  }
  function mark(wrap, btn){ wrap.querySelectorAll(".cs-opt").forEach(function (o){ o.classList.toggle("sel", o === btn); }); }
  function closeDrawer(){
    var dr = el("cs-drawer"); if (dr) dr.classList.remove("show");
    var sc = el("cs-ed-scrim"); if (sc) sc.classList.remove("show");
    var st = el("cs-ed-stage"); if (st) st.querySelectorAll(".cs-brush").forEach(function (x){ x.classList.remove("active"); });
  }
  function getChanges(){
    var out = [];
    Object.keys(COSMETIC_PRICE).forEach(function (field){
      if (C.edit[field] !== C.original[field]){
        var isColor = (field.indexOf("Color") >= 0);
        out.push({ field:field, label:ZONES[field].label, price:COSMETIC_PRICE[field], swatch:isColor ? C.edit[field] : null, detail:isColor ? C.edit[field] : (C.original[field] + " \u2192 " + C.edit[field]) });
      }
    });
    return out;
  }
  function refreshTotal(){ el("cs-ed-total").textContent = berries(getChanges().reduce(function (s, c){ return s + c.price; }, 0)); }
  function showSummary(){
    var ch = getChanges(), list = el("cs-sum-list"); list.innerHTML = "";
    if (!ch.length){ list.innerHTML = '<div class="cs-sum-empty">No changes yet \u2014 tap a \uD83D\uDD8C on the ship to customize.</div>'; el("cs-sum-trow").style.display = "none"; }
    else { el("cs-sum-trow").style.display = "";
      ch.forEach(function (c){ var li = document.createElement("li"); var icon = c.swatch ? '<span class="cs-chip" style="background:' + c.swatch + '"></span>' : "\uD83D\uDD8C";
        li.innerHTML = '<div class="cs-sum-ic">' + icon + '</div><div class="cs-sum-tx"><div class="t">' + c.label + '</div><div class="d">' + esc(c.detail) + '</div></div><div class="cs-sum-pr">' + berries(c.price) + '</div>'; list.appendChild(li); }); }
    el("cs-sum-total").textContent = berries(ch.reduce(function (s, c){ return s + c.price; }, 0));
    el("cs-summary").classList.add("open");
  }
  async function payAndClose(){
    var ch = getChanges(); if (!ch.length){ closeEditorOverlay(); return; }
    var changes = {}; ch.forEach(function (c){ changes[c.field] = C.edit[c.field]; });
    var pay = el("cs-pay"); if (pay) pay.disabled = true;
    try { var r = await Api.saveCosmetics(C.id, changes); C.ship = r.ship || C.ship; applyShip(C.ship); closeEditorOverlay(); toast("Ship updated \u2713"); render(); }
    catch (e){ toast(e.message || "Couldn\u2019t save look"); if (pay) pay.disabled = false; }
  }
  function cancelEditor(){ C.edit = packShip(C.original); applyShip(C.original); closeEditorOverlay(); }
  function closeEditorOverlay(){ var ov = el("cs-editor"); if (ov) ov.classList.remove("open"); var sm = el("cs-summary"); if (sm) sm.classList.remove("open"); closeDrawer(); }

  /* ====================================================================
     CSS — ALLEEN voor de strip-knop + de editor (NIET voor ship/slots/bench;
     die gebruiken jouw bestaande mp.css)
     ==================================================================== */
  function injectCss(){
    if (el("cs-styles")) return;
    var css = document.createElement("style"); css.id = "cs-styles";
    css.textContent = [
      ":root{--cs-hull:#6b4a2a;--cs-deck:#c2a06a;--cs-trim:#8a5a2b;--cs-sail:#e7d4a8;--cs-cream:#f3e9d6;--cs-gold:#e9c46a;}",
      ".cs-fh,.cs-jr{display:none;}",
      FH_LIST.map(function (n){ return 'body[data-csfh="' + n + '"] .cs-fh-' + n; }).join(",") + "{display:block;}",
      JR_LIST.map(function (k){ return 'body[data-csjr="' + k + '"] .cs-jr-' + k; }).join(",") + "{display:block;}",
      ".cw-ship-meta b{color:#f3e9d6;}.cw-ship-meta i{color:#c9bfa6;}",
      ".cw-ship-icbtn{width:38px;height:38px;border-radius:10px;border:1.5px solid rgba(255,255,255,.22);background:rgba(255,255,255,.04);color:#f3e9d6;font-size:17px;cursor:pointer;margin-left:8px;display:grid;place-items:center;line-height:1;}",
      ".cw-ship-icbtn:hover{background:rgba(255,255,255,.1);}",
      ".cw-ship-icbtn.can-upg{background:#e9c46a;color:#2a1c05;border-color:#e9c46a;box-shadow:0 0 0 3px rgba(233,196,106,.28),0 0 14px rgba(233,196,106,.55);}",
      ".cw-ship-icbtn.can-upg:hover{background:#f0cf80;}",
      ".cs-tired{position:absolute;top:-8px;left:-8px;width:20px;height:20px;border-radius:50%;background:#b34747;color:#fff;font-size:11px;display:grid;place-items:center;border:2px solid #0e2a36;z-index:2;}",
      ".drag-ghost{position:fixed;z-index:9999;transform:translate(-50%,-50%);pointer-events:none;opacity:.92;}",
      ".ship-col{position:relative;}",
      ".ship-col>svg{display:block;width:100%;height:100%;}",
      ".cs-editor{position:fixed;inset:0;z-index:1000;display:none;flex-direction:column;background:linear-gradient(180deg,#15394a,#0a2330);}",
      ".cs-editor.open{display:flex;}",
      ".cs-ed-head{display:flex;align-items:center;gap:11px;padding:12px 15px;border-bottom:1px solid rgba(255,255,255,.12);}",
      ".cs-ed-head h2{margin:0;flex:1;font-weight:700;font-style:italic;letter-spacing:.04em;text-transform:uppercase;font-size:16px;color:#f3e9d6;}",
      ".cs-ed-total{text-align:right;line-height:1;}.cs-ed-total span{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#aa9c80;}.cs-ed-total b{display:block;font-weight:700;font-size:15px;color:#e9c46a;}",
      ".cs-ed-finish{cursor:pointer;font:inherit;font-weight:700;color:#2a1c05;background:#e9c46a;border:0;border-radius:10px;padding:8px 14px;}.cs-ed-finish:disabled{opacity:.6;}",
      /* ---- upgrade-kaart (variant A) in de editor ---- */
      ".cs-upg{margin:10px 12px 0;background:var(--parch,#f1e2be);border:2px solid var(--line,#8a5a2b);border-radius:14px;padding:12px 13px 11px;box-shadow:0 8px 22px rgba(0,0,0,.34),inset 0 0 0 2px rgba(138,90,43,.14);flex:0 0 auto;}",
      ".cs-upg-top{display:flex;align-items:center;gap:10px;margin-bottom:10px;}",
      ".cs-upg-ic{width:36px;height:36px;flex:0 0 auto;border-radius:10px;display:grid;place-items:center;font-size:18px;background:linear-gradient(180deg,var(--gold-hi,#f4cf6a),var(--gold,#e7b94a));border:2px solid var(--gold-d,#9a6b1e);}",
      ".cs-upg-h{flex:1 1 auto;min-width:0;}",
      ".cs-upg-h-l{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2,#6b4a26);}",
      ".cs-upg-h-t{font-family:var(--display,'Bangers',cursive);font-size:17px;letter-spacing:.4px;color:var(--ink,#3a2708);line-height:1.05;}",
      ".cs-upg-tiers{display:flex;align-items:center;gap:7px;flex:0 0 auto;}",
      ".cs-tier-pill{font-family:var(--display,'Bangers',cursive);font-size:12px;letter-spacing:.4px;color:var(--ink-2,#6b4a26);background:var(--parch-3,#f7ecca);border:1.5px solid var(--line-soft,#b79a63);border-radius:8px;padding:2px 9px;}",
      ".cs-tier-pill.next{color:var(--ink,#3a2708);background:#fff8e7;border-color:var(--gold-d,#9a6b1e);}",
      ".cs-upg-arrow{color:var(--gold-d,#9a6b1e);font-size:13px;}",
      ".cs-upg-gains{padding:9px 0 10px;margin:0 0 10px;border-top:1px solid rgba(138,90,43,.16);border-bottom:1px solid rgba(138,90,43,.16);}",
      ".cs-upg-gain{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink-2,#6b4a26);}",
      ".cs-upg-gain .g-ic{width:22px;height:22px;flex:0 0 auto;border-radius:6px;display:grid;place-items:center;font-size:12px;color:#fff;background:linear-gradient(140deg,#2e7d5b,#1f6f4a);}",
      ".cs-upg-gain b{color:var(--ink,#3a2708);font-family:var(--display,'Bangers',cursive);font-weight:400;letter-spacing:.3px;}",
      ".cs-upg-gain .g-val{margin-left:auto;font-family:var(--display,'Bangers',cursive);font-size:14px;color:var(--ink,#3a2708);}",
      ".cs-upg-gain .g-val .up{color:var(--gold-d,#9a6b1e);}",
      ".cs-upg-foot{display:flex;align-items:center;gap:12px;}",
      ".cs-upg-cost{display:flex;flex-direction:column;min-width:0;}",
      ".cs-upg-cost-l{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-2,#6b4a26);}",
      ".cs-upg-cost-v{font-family:var(--display,'Bangers',cursive);font-size:20px;letter-spacing:.5px;color:var(--gold-d,#9a6b1e);line-height:1;}",
      ".cs-upg-cost-v.short{color:var(--danger,#a3331f);}",
      ".cs-upg-was{font-size:12px;color:var(--muted,#9a7b4a);text-decoration:line-through;margin-right:5px;}",
      ".cs-upg-btn{margin-left:auto;flex:0 0 auto;font-family:var(--display,'Bangers',cursive);font-size:16px;letter-spacing:.5px;color:var(--ink,#3a2708);background:linear-gradient(180deg,var(--gold-hi,#f4cf6a),var(--gold,#e7b94a));border:2px solid var(--gold-d,#9a6b1e);border-radius:11px;padding:10px 24px;cursor:pointer;box-shadow:0 4px 0 var(--gold-d,#9a6b1e);}",
      ".cs-upg-btn:active{transform:translateY(2px);box-shadow:0 2px 0 var(--gold-d,#9a6b1e);}",
      ".cs-upg-btn:disabled{filter:grayscale(.5) brightness(.97);opacity:.55;cursor:not-allowed;box-shadow:0 4px 0 var(--gold-d,#9a6b1e);}",
      ".cs-upg-req{font-size:11px;font-style:italic;color:var(--ink-2,#6b4a26);margin-top:9px;display:flex;align-items:center;gap:6px;}",
      ".cs-upg-req .ok{color:#1f7a4d;font-style:normal;}.cs-upg-req .no{color:var(--danger,#a3331f);font-style:normal;}.cs-upg-req .hint{color:var(--gold-d,#9a6b1e);font-style:normal;}",
      ".cs-upg.maxed{text-align:center;}",
      ".cs-upg-maxed-t{font-family:var(--display,'Bangers',cursive);font-size:17px;letter-spacing:.4px;color:var(--ink,#3a2708);}",
      ".cs-upg-maxed-s{font-size:12px;color:var(--ink-2,#6b4a26);font-style:italic;margin-top:3px;}",
      /* ---- /upgrade-kaart ---- */
      ".cs-ed-body{flex:1 1 auto;position:relative;min-height:0;display:flex;align-items:center;justify-content:center;}",
      ".cs-view-toggle{position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:7;}",
      ".cs-view-toggle .btn-ghost{padding:6px 13px;font-size:12px;background:rgba(0,0,0,.3);border-radius:9px;color:#f3e9d6;}",
      ".cs-ed-stage{position:relative;}",
      ".cs-ed-stage.side{width:94%;max-width:560px;aspect-ratio:640/360;}",
      ".cs-ed-stage.top{height:76%;aspect-ratio:300/560;}",
      ".cs-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}",
      ".cs-brush{position:absolute;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;background:rgba(233,196,106,.16);border:2px solid #e9c46a;color:#e9c46a;cursor:pointer;display:grid;place-items:center;font-size:15px;z-index:5;}",
      ".cs-brush:hover{background:#e9c46a;color:#2a1c05;transform:translate(-50%,-50%) scale(1.08);}",
      ".cs-brush.active{background:#e9c46a;color:#2a1c05;box-shadow:0 0 0 4px rgba(233,196,106,.25);}",
      ".cs-brush .cs-blbl{position:absolute;top:36px;left:50%;transform:translateX(-50%);font-size:8.5px;letter-spacing:.07em;text-transform:uppercase;color:#f3e9d6;white-space:nowrap;font-weight:700;}",
      ".cs-ed-scrim{position:absolute;inset:0;z-index:8;display:none;}.cs-ed-scrim.show{display:block;}",
      ".cs-drawer{position:absolute;z-index:10;background:#0d2532;border:1px solid rgba(255,255,255,.22);box-shadow:0 -10px 40px rgba(0,0,0,.5);transform:translateY(110%);transition:transform .22s ease;left:0;right:0;bottom:0;border-radius:18px 18px 0 0;padding:15px 16px 18px;}",
      ".cs-drawer.show{transform:translateY(0);}",
      ".cs-drawer h4{margin:0 0 13px;font-weight:700;font-style:italic;letter-spacing:.04em;text-transform:uppercase;font-size:14px;color:#f3e9d6;display:flex;justify-content:space-between;align-items:center;}",
      ".cs-drawer h4 .cs-x{cursor:pointer;color:#aa9c80;font-style:normal;font-size:18px;padding:2px 6px;}",
      ".cs-opts{display:flex;gap:10px;flex-wrap:wrap;}",
      ".cs-opt.color{width:42px;height:42px;border-radius:10px;cursor:pointer;border:2px solid rgba(255,255,255,.18);box-shadow:inset 0 0 0 2px rgba(0,0,0,.18);position:relative;}",
      ".cs-opt.preset{width:56px;height:56px;border-radius:12px;cursor:pointer;padding:5px;background:rgba(0,0,0,.25);border:2px solid rgba(255,255,255,.12);display:grid;place-items:center;position:relative;}",
      ".cs-opt.preset svg{width:100%;height:100%;}.cs-opt .cs-none{font-size:10px;color:#aa9c80;text-transform:uppercase;letter-spacing:.07em;}",
      ".cs-opt.sel{border:3px solid #e9c46a;box-shadow:0 0 0 1px #e9c46a;}",
      '.cs-opt.sel::after{content:"\\2713";position:absolute;top:-9px;right:-9px;width:21px;height:21px;border-radius:50%;background:#34a866;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;border:2px solid #0d2532;}',
      ".cs-applied{margin-top:13px;font-size:11px;color:#aa9c80;}",
      ".cs-summary{position:absolute;inset:0;z-index:50;display:none;flex-direction:column;background:linear-gradient(180deg,#143645,#0a2330);}",
      ".cs-summary.open{display:flex;}",
      ".cs-sum-body{flex:1 1 auto;overflow:auto;padding:16px;}",
      ".cs-sum-list{list-style:none;margin:0;padding:0;}",
      ".cs-sum-list li{display:flex;align-items:center;gap:11px;padding:12px 4px;border-bottom:1px solid rgba(255,255,255,.12);}",
      ".cs-sum-ic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);}",
      ".cs-chip{width:20px;height:20px;border-radius:5px;border:1px solid rgba(255,255,255,.25);}",
      ".cs-sum-tx{flex:1;}.cs-sum-tx .t{font-weight:600;font-size:13.5px;color:#f3e9d6;}.cs-sum-tx .d{font-size:11px;color:#aa9c80;}",
      ".cs-sum-pr{font-weight:700;color:#f3e9d6;font-size:14px;}",
      ".cs-sum-empty{text-align:center;color:#aa9c80;font-style:italic;padding:40px 10px;}",
      ".cs-sum-total{display:flex;justify-content:space-between;align-items:center;padding:15px 4px 2px;font-size:14px;color:#f3e9d6;}.cs-sum-total b{font-weight:700;color:#e9c46a;font-size:22px;}",
      ".cs-acts{display:flex;gap:10px;padding:14px 16px;border-top:1px solid rgba(255,255,255,.12);}.cs-acts>button{flex:1;}",
      "@media (orientation: landscape){.cs-drawer{top:0;right:0;bottom:0;left:auto;width:300px;border-radius:18px 0 0 18px;transform:translateX(110%);}.cs-drawer.show{transform:translateX(0);}}",
    ].join("\n");
    document.head.appendChild(css);
  }

  /* (resize/orientation-listeners niet meer nodig: de ResizeObserver op
     .ship-wrap in setupShipFit doet de schaal; de rest is CSS.) */
})();