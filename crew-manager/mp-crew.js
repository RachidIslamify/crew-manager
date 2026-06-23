"use strict";

/* ====================================================================
   Crew Manager — mp-crew.js
   Online crew & line-up. Reuses the single-player ship + 9 deck posts +
   4 bench + drag & drop and the exact .cw-* / .slot / .b-slot styling
   (so it inherits the portrait + landscape layout), but is fed from and
   saved to the server. Renders into #cp-content.
   window.cmOpenCrew(worldId) — back returns to the league home.
   Reuses globals from game-crew.js: DECK_ROLES, BENCH_SIZE, SLOT_POS,
   SHIP_SVG, fitBadge — plus colorFor / initial / escapeHtml / fmtShort / miniStat.

   Een zichtbare rugzak-knop opent de inventory-flow (cmOpenInventory):
   daar kies je een item en daarna het crewlid voor wie het is. Terug uit
   de inventory land je weer in de league-home; van daaruit open je het
   crewscherm opnieuw met de toegepaste wijziging zichtbaar.
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

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }
  function toast(msg){
    var d = document.createElement("div");
    d.className = "ol-toast"; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function (){ d.classList.add("out"); }, 1300);
    setTimeout(function (){ if (d.parentNode) d.remove(); }, 1700);
  }

  var ROLES = (typeof DECK_ROLES !== "undefined") ? DECK_ROLES :
    ["Swordsman","Sniper","Chef","Doctor","Archaeologist","Shipwright","Musician","Navigator","Helmsman"];
  var BENCH = (typeof BENCH_SIZE !== "undefined") ? BENCH_SIZE : 4;
  var POS = (typeof SLOT_POS !== "undefined") ? SLOT_POS : {};
  var SHIP = (typeof SHIP_SVG !== "undefined") ? SHIP_SVG : "";

  var BAG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6V5a3 3 0 0 1 6 0v1"/><path d="M5 9.5C5 7.6 6.6 6 8.5 6h7C17.4 6 19 7.6 19 9.5V18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M5 12h14"/><path d="M12 12v3"/></svg>';

  var C = { id: null, data: null, byName: {}, lineup: null };

  window.cmOpenCrew = function (worldId){
    C.id = worldId || C.id;
    activateScreen("screen-competition");
    content().innerHTML = '<div class="wl-head"><div><div class="cp-title">Crew &amp; line-up</div><div class="cp-subt">Loading\u2026</div></div></div>';
    load();
  };

  async function load(){
    try { C.data = await Api.getLineup(C.id); }
    catch (e){ content().innerHTML = '<div class="wl-err">' + esc(e.message) + '</div>'; return; }
    C.byName = {}; (C.data.squad || []).forEach(function (m){ C.byName[m.name] = m; });
    C.lineup = C.data.lineup || { deck: {}, bench: [] };
    render();
  }

  function totalBounty(){
    var cs = C.data.captainStats || { p: 8, d: 8, s: 8 };
    var b = (cs.p + cs.d + cs.s) * 1e6;
    (C.data.squad || []).forEach(function (m){ b += (m.p + m.d + m.s) * 1e6; });
    return b;
  }
  function fitFor(member, role){
    if (!member) return null;
    if (member.role === role || (Array.isArray(member.altRoles) && member.altRoles.indexOf(role) >= 0)) return "bonus";
    if (member.role === "Crewmate") return "neutral";
    return "off";
  }
  function badge(fit){
    if (typeof fitBadge === "function") return fitBadge(fit);
    if (fit === "bonus") return '<span class="fit fit-bonus" title="In their role">\u2713</span>';
    if (fit === "off")   return '<span class="fit fit-off" title="Off-role">\u2013</span>';
    return "";
  }

  /* ---- slot markup (same classes as single-player) ---- */
  function deckSlot(role){
    var pos = POS[role] || [50, 50];
    var style = "left:" + pos[0] + "%; top:" + pos[1] + "%";
    var name = C.lineup.deck[role];
    if (name){
      var m = C.byName[name];
      return '<div class="slot filled" style="' + style + '" data-drop="deck:' + role + '" data-drag="deck:' + role + '">' +
        badge(fitFor(m, role)) +
        '<div class="slot-nm"><span class="dot" style="background:' + col(name) + '"></span>' + esc(name) + '</div>' +
        '<div class="slot-role">' + role + '</div></div>';
    }
    return '<div class="slot empty" style="' + style + '" data-drop="deck:' + role + '">' +
      '<div class="slot-plus">+</div><div class="slot-role">' + role + '</div></div>';
  }
  function benchSlot(i){
    var name = C.lineup.bench[i];
    if (name){
      var m = C.byName[name];
      return '<div class="b-slot" data-drop="bench:' + i + '" data-drag="bench:' + i + '">' +
        '<div class="b-av" style="background:' + col(name) + '">' + ini(name) + '</div>' +
        '<div><div class="b-nm">' + esc(name) + '</div><div class="b-role">' + esc(m ? m.role : "") + '</div></div></div>';
    }
    return '<div class="b-slot empty" data-drop="bench:' + i + '">Empty bench slot</div>';
  }

  function shipStripHtml(d){
    var ship = d.ship || { shipTier: 1, tierName: "Dinghy" };
    var atMax = (ship.shipTier >= 3);
    var upgBtn = atMax
      ? '<span class="cw-ship-max">Max tier</span>'
      : '<button class="cw-ship-upg" id="cw-ship-upg" type="button">\u2B06 Upgrade</button>';
    return '<div class="cw-ship">' +
        '<span class="cw-ship-pip">\u26F5</span>' +
        '<span class="cw-ship-meta"><b>Ship &middot; Tier ' + ship.shipTier + '</b><i>' + esc(ship.tierName) + '</i></span>' +
        '<span class="cw-ship-sp"></span>' +
        upgBtn +
      '</div>';
  }

// tier-info voor de bevestiging (moet matchen met server/src/config/shipTiers.ts)
  var NEXT_TIER = {
    2: { name: "Caravel",     cap: 7,  price: 10000000 },
    3: { name: "Yonko-class", cap: 13, price: 30000000 },
  };
  var SHIPWRIGHT_DISCOUNT = 0.30;

  function crewHasShipwright(){
    return (C.data && Array.isArray(C.data.squad) && C.data.squad.some(function (m){
      return m.role === "Shipwright" || (Array.isArray(m.altRoles) && m.altRoles.indexOf("Shipwright") >= 0);
    }));
  }
  function berries(n){ return "\u0E3F " + n.toLocaleString("en-US"); }

  function doUpgrade(){
    var cur = (C.data && C.data.ship && C.data.ship.shipTier) || 1;
    var to  = cur + 1;
    var info = NEXT_TIER[to];
    if (!info) return;

    var hasSW = crewHasShipwright();
    var price = hasSW ? Math.round(info.price * (1 - SHIPWRIGHT_DISCOUNT)) : info.price;

    var msg = "Upgrade to " + info.name + " (crew up to " + (info.cap + 1) + ") for " + berries(price) + ".";
    if (hasSW) msg += "\nShipwright aboard: \u221230% (was " + berries(info.price) + ").";

    if (typeof openModal !== "function"){ confirmUpgrade(); return; }   // fallback
    openModal({
      title: "Upgrade ship",
      message: msg,
      confirmLabel: "Upgrade",
      danger: false,
      showCancel: true,
      onConfirm: confirmUpgrade,
    });
  }

  async function confirmUpgrade(){
    var btn = el("cw-ship-upg");
    if (btn) btn.disabled = true;
    try {
      var r = await Api.upgradeShip(C.id);
      toast(r.discounted ? "Ship upgraded \u2014 Shipwright discount applied!" : "Ship upgraded!");
      await load();   // herlaadt crew + schip + nieuwe cap
    } catch (e){
      toast(e.message || "Upgrade failed");
      if (btn) btn.disabled = false;
    }
  }

  function render(){
    var d = C.data;
    var roster = d.squad || [];
    var capSlot =
      '<div class="slot cap filled" style="left:50%; top:8%">' +
        '<div class="slot-av" style="background:' + col(d.captain) + '">' + ini(d.captain) + '</div>' +
        '<div class="slot-nm">' + esc(d.captain) + '</div><div class="slot-role">Captain</div></div>';
    var note = roster.length === 0
      ? "Your crew is empty &mdash; recruit members on the transfer market, then drag them onto a post."
      : "Drag a crew member onto a post. Drop on a filled post to swap. Only your 9 on deck fight.";

    content().innerHTML =
      '<div class="cw-top">' +
        '<div class="cw-id"><div class="cw-av" style="background:' + col(d.captain) + '">' + ini(d.captain) + '</div>' +
          '<div><div class="cw-crew">' + esc(d.crewName) + '</div><div class="cw-cap">Captain ' + esc(d.captain) + '</div></div></div>' +
            '<div class="cw-bal">' + mini("Bounty", short(totalBounty())) + mini("Crew", (roster.length + 1) + " / " + ((d.rosterCap || 13) + 1)) + '</div>' +
        '<button class="cw-bag" id="cw-bag" type="button" aria-label="Open inventory" title="Open your backpack">' + BAG_ICON + '</button>' +
        '<button class="btn-ghost cw-back" id="cw-back" type="button">Back</button>' +
      '</div>' +
      shipStripHtml(d) +
      '<div class="cw-main">' +
        '<div class="ship-col">' + SHIP +
          '<span class="dir" style="top:-2px">&#9650; Bow</span><span class="dir" style="bottom:-4px">Stern / Wheel</span>' +
          capSlot + ROLES.map(deckSlot).join("") + '</div>' +
        '<div class="bench-col"><div class="bench"><div class="bench-title">Bench</div>' +
          Array.apply(null, { length: BENCH }).map(function (_, i){ return benchSlot(i); }).join("") +
          '</div><div class="bench-note">' + note + '</div></div>' +
      '</div>';

    var back = el("cw-back");
    if (back) back.addEventListener("click", function (){ if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(C.id); });
    var bag = el("cw-bag");
    if (bag) bag.addEventListener("click", function (){
      if (typeof window.cmOpenInventory === "function") window.cmOpenInventory(C.id);
      else toast("Inventory is not available yet");
    });
    var upg = el("cw-ship-upg");
    if (upg) upg.addEventListener("click", doUpgrade);
    content().querySelectorAll("[data-drag]").forEach(function (e){ e.addEventListener("pointerdown", onDragStart); });
  }

  /* ---- lineup helpers ---- */
  function getPlace(type, key){ return type === "deck" ? C.lineup.deck[key] : C.lineup.bench[key]; }
  function setPlace(type, key, name){ if (type === "deck") C.lineup.deck[key] = name; else C.lineup.bench[key] = name; }
  function saveSoon(){
    Api.saveLineup(C.id, C.lineup).catch(function (e){ toast(e.message || "Couldn\u2019t save line-up"); });
  }

  /* ---- drag & drop (Pointer Events — same behaviour as single-player) ---- */
  var drag = null;
  function dropTargetAt(x, y){ var e = document.elementFromPoint(x, y); return e ? e.closest("[data-drop]") : null; }
  function moveGhost(x, y){ if (drag && drag.ghost){ drag.ghost.style.left = x + "px"; drag.ghost.style.top = y + "px"; } }

  function onDragStart(e){
    if (e.button && e.button !== 0) return;
    var parts = e.currentTarget.dataset.drag.split(":");
    var type = parts[0];
    var key = (type === "deck") ? parts[1] : parseInt(parts[1], 10);
    var name = getPlace(type, key);
    if (!name) return;
    e.preventDefault();

    drag = { type: type, key: key, name: name, srcEl: e.currentTarget, ghost: null };
    e.currentTarget.classList.add("is-source");

    var g = document.createElement("div");
    g.className = "drag-ghost";
    g.innerHTML = '<div class="slot-nm"><span class="dot" style="background:' + col(name) + '"></span>' + esc(name) + '</div>';
    document.body.appendChild(g);
    drag.ghost = g;
    moveGhost(e.clientX, e.clientY);

    document.body.classList.add("is-dragging");
    content().querySelectorAll("[data-drop]").forEach(function (dd){ dd.classList.add("droppable"); });

    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragCancel);
  }
  function onDragMove(e){
    if (!drag) return;
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
    var t = dropTargetAt(e.clientX, e.clientY);
    content().querySelectorAll("[data-drop]").forEach(function (dd){ dd.classList.toggle("drop-hover", dd === t); });
  }
  function onDragUp(e){ endDrag(true, e.clientX, e.clientY); }
  function onDragCancel(){ endDrag(false, 0, 0); }

  function applyDrop(tType, tKey){
    var occupant = getPlace(tType, tKey);
    if (occupant === drag.name) return;
    setPlace(tType, tKey, drag.name);
    setPlace(drag.type, drag.key, occupant);     // occupant (or null) takes the old spot = move/swap
    saveSoon();
  }
  function endDrag(apply, x, y){
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
    window.removeEventListener("pointercancel", onDragCancel);
    if (apply && drag){
      var t = dropTargetAt(x, y);
      if (t){
        var parts = t.dataset.drop.split(":");
        applyDrop(parts[0], parts[0] === "deck" ? parts[1] : parseInt(parts[1], 10));
      }
    }
    if (drag){
      if (drag.srcEl) drag.srcEl.classList.remove("is-source");
      if (drag.ghost) drag.ghost.remove();
    }
    document.body.classList.remove("is-dragging");
    drag = null;
    render();
  }
})();