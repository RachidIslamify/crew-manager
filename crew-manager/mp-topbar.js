"use strict";

/* ====================================================================
   Crew Manager — mp-topbar.js   (window.cmTopbar)

   Eén gedeelde topbar voor ALLE in-league schermen: crew-identiteit +
   Berries / Crew / Bounty + rugzak / bel / hamburger-menu. Eén bron voor
   de cijfers: Api.getSquad(worldId) (zelfde call als de game-home), met
   een cache + refresh(), zodat funds overal hetzelfde getal toont.

   Gebruik op een scherm:
     window.cmTopbar.mount(hostEl, worldId, { title:"Crew & line-up",
                                              onBack:function(){...} });
   Na een uitgave (upgrade / aankoop / reward):
     await window.cmTopbar.refresh(worldId);
   Saldo uitlezen (bv. in de editor-kop):
     window.cmTopbar.funds();   // number | null

   Zelfstandig: eigen cmtb-* CSS (kopie van de gh-top look), dus niet
   afhankelijk van mp-online.css. mp-online.js blijft ongemoeid.
   ==================================================================== */

(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function short(n){ return (typeof fmtShort === "function") ? fmtShort(n) : (Math.round((n || 0) / 1e6) + "M"); }
  function colOf(n){ return (typeof colorFor === "function") ? colorFor(n || "?") : "#1f6f4a"; }
  function iniOf(n){ return (typeof initial === "function") ? initial(n || "?") : "?"; }
  function berries(n){ return "\u0E3F " + short(n); }

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
  function photo(name){ return (window.CrewCard && name) ? CrewCard.photoTag(name) : ""; }

  function crewBounty(mine){
    if (!mine) return 0;
    var total = 0;
    try {
      if (typeof captainBounty === "function" && mine.captainStats){ total += captainBounty(mine.captainStats, mine.squad || []); }
      else if (typeof baseBounty === "function" && mine.captainStats){ total += baseBounty(mine.captainStats); }
      (mine.squad || []).forEach(function (m){
        if (m && (m.p != null || m.d != null || m.s != null) && typeof baseBounty === "function") total += baseBounty(m);
        else if (m && typeof m.bounty === "number") total += m.bounty;
      });
    } catch (e) {}
    return total;
  }

  /* ---- gedeelde crew-samenvatting (getSquad) ---- */
  var SUM = { worldId: null, data: null, pending: null };

  function fetchSummary(worldId, force){
    worldId = worldId || SUM.worldId;
    if (!force && SUM.worldId === worldId && SUM.data) return Promise.resolve(SUM.data);
    if (SUM.pending && SUM.worldId === worldId && !force) return SUM.pending;
    SUM.worldId = worldId;
    SUM.pending = Api.getSquad(worldId)
      .then(function (d){ SUM.data = d; SUM.pending = null; return d; })
      .catch(function (e){ SUM.pending = null; throw e; });
    return SUM.pending;
  }

  /* ---- bar HTML ---- */
  function barHtml(d, opts){
    var crewName = (d && d.crewName) || "Your crew";
    var cap      = (d && d.captain) || "";
    var fundsV   = d ? d.funds : null;
    var size     = (d && d.squad) ? d.squad.length : null;
    var capCap   = (d && d.rosterCap != null) ? d.rosterCap : 13;
    var bounty   = d ? crewBounty(d) : null;

    var back = opts.onBack
      ? '<button class="cmtb-back" type="button" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg></button>'
      : '';

    var stat = function (l, v, cls){ return '<div class="cmtb-stat"><span class="cmtb-stat-l">' + l + '</span><span class="cmtb-stat-v' + (cls ? ' ' + cls : '') + '">' + v + '</span></div>'; };

    var bar =
      '<div class="cmtb-bar">' +
        '<div class="cmtb-id">' + back +
          '<div class="cmtb-emblem" style="background:' + colOf(crewName) + '">' + iniOf(crewName) + photo(cap) + '</div>' +
          '<div class="cmtb-id-main">' +
            '<div class="cmtb-crew">' + esc(crewName) + '</div>' +
            '<div class="cmtb-stats">' +
              stat("Berries", fundsV == null ? "\u0E3F \u2014" : berries(fundsV), "berries") +
              stat("Crew", size == null ? "\u2014" : ((size + 1) + " / " + (capCap + 1))) +
              stat("Bounty", bounty == null ? "\u2014" : short(bounty)) +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cmtb-acts">' +
          '<button class="cmtb-ic cmtb-bag" type="button" aria-label="Inventory"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6V5a3 3 0 0 1 6 0v1"/><path d="M5 9.5C5 7.6 6.6 6 8.5 6h7C17.4 6 19 7.6 19 9.5V18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M5 12h14"/><path d="M12 12v3"/></svg></button>' +
          '<button class="cmtb-ic cmtb-bell" type="button" aria-label="Notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></button>' +
          '<button class="cmtb-ic cmtb-menu" type="button" aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>' +
        '</div>' +
      '</div>';

    var ctx = opts.title
      ? '<div class="cmtb-ctx"><div class="cmtb-title">' + esc(opts.title) + '</div>' +
          (opts.sub ? '<div class="cmtb-sub">' + esc(opts.sub) + '</div>' : '') + '</div>'
      : '';

    return bar + ctx;
  }

  /* ---- mount + paint + wiring ---- */
  var MOUNTS = [];

  function paint(host, d, opts, worldId){
    host.innerHTML = barHtml(d || SUM.data, opts);
    wire(host, worldId, opts);
  }
  function wire(host, worldId, opts){
    var back = host.querySelector(".cmtb-back");
    if (back && opts.onBack) back.addEventListener("click", opts.onBack);
    var bag = host.querySelector(".cmtb-bag");
    if (bag) bag.addEventListener("click", function (e){ e.stopPropagation(); openBag(bag, worldId); });
    var bell = host.querySelector(".cmtb-bell");
    if (bell) bell.addEventListener("click", function (e){ e.stopPropagation(); openBell(bell); });
    var menu = host.querySelector(".cmtb-menu");
    if (menu) menu.addEventListener("click", function (e){ e.stopPropagation(); openMenu(menu, worldId); });
  }

  function mount(host, worldId, opts){
    if (!host) return;
    opts = opts || {};
    injectCss();
    host.style.flex = "0 0 auto";
    MOUNTS = MOUNTS.filter(function (m){ return m.host !== host && document.body.contains(m.host); });
    MOUNTS.push({ host: host, worldId: worldId, opts: opts });
    paint(host, SUM.data, opts, worldId);                 // direct uit cache (of skeleton)
    fetchSummary(worldId).then(function (d){ paint(host, d, opts, worldId); }).catch(function (){});
  }

  function refresh(worldId){
    return fetchSummary(worldId, true).then(function (d){
      MOUNTS = MOUNTS.filter(function (m){ return document.body.contains(m.host); });
      MOUNTS.forEach(function (m){ paint(m.host, d, m.opts, m.worldId); });
      return d;
    }).catch(function (){ return null; });
  }

  function funds(){ return (SUM.data && SUM.data.funds != null) ? SUM.data.funds : null; }
  function summary(){ return SUM.data; }

  /* ---- navigatie-router (zelfde acts als de home) ---- */
  function go(a, worldId){
    var wid = worldId || SUM.worldId || window.cmCurrentWorldId;
    document.body.classList.remove("gh-active");
    if (a === "crew"){ if (typeof window.cmOpenCrew === "function") window.cmOpenCrew(wid); }
    else if (a === "market"){ if (typeof window.cmOpenMarket === "function") window.cmOpenMarket(wid); }
    else if (a === "training"){ if (typeof window.cmOpenTraining === "function") window.cmOpenTraining(wid); }
    else if (a === "standings"){ if (typeof window.cmOpenCompetition === "function") window.cmOpenCompetition(wid); }
    else if (a === "matchday"){
      if (typeof window.cmOpenMatchday === "function") window.cmOpenMatchday(wid);
      else if (typeof window.cmOpenCompetition === "function") window.cmOpenCompetition(wid);
    }
    else if (a === "tourney"){ if (typeof window.cmOpenTournament === "function") window.cmOpenTournament(wid); }
    else if (a === "achievements"){ if (typeof window.cmOpenAchievements === "function") window.cmOpenAchievements(); }
    else if (a === "missions"){ if (typeof window.cmOpenMissions === "function") window.cmOpenMissions(wid); }
    else if (a === "inventory"){ if (typeof window.cmOpenInventory === "function") window.cmOpenInventory(wid); }
    else if (a === "home"){ if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(wid); }
    else if (a === "exit"){ exitToMenu(); }
  }
  function exitToMenu(){
    closeMenu(); closePanel();
    document.body.classList.remove("gh-active");
    if (typeof window.cmRenderHome === "function"){ activateScreen("screen-newgame"); window.cmRenderHome(); }
    else if (typeof window.cmOpenWorlds === "function"){ window.cmOpenWorlds(); }
    else activateScreen("screen-newgame");
  }

  /* ---- hamburger-menu ---- */
  function closeMenu(){ var m = document.querySelector(".cmtb-menu-pop"); if (m && m.parentNode) m.parentNode.removeChild(m); }
  function openMenu(anchor, worldId){
    closeMenu(); closePanel();
    var items = [
      { label: "Game home",       act: "home",      c: "#16506b" },
      { label: "Matchday",        act: "matchday",  c: "#c0392b" },
      { label: "Crew",            act: "crew",      c: "#1f6f4a" },
      { label: "Training",        act: "training",  c: "#2e5e8a" },
      { label: "Transfer market", act: "market",    c: "#9a6b1e" },
      { label: "Scout",           soon: true,       c: "#2e7d72" },
      { label: "League",          act: "standings", c: "#7a3fa0" },
      { label: "Missions",        act: "missions",  c: "#c0567a" },
      { label: "Achievements",    act: "achievements", c: "#d4a017" },
      { label: "Inventory",       act: "inventory", c: "#2e7d72" },
      { label: "Newspaper",       soon: true,       c: "#c8631f" },
      { label: "Save & exit",     act: "exit", divider: true, danger: true, c: "#a3331f" }
    ];
    var m = document.createElement("div");
    m.className = "cmtb-menu-pop";
    var html = "";
    items.forEach(function (it){
      var cls = "cmtb-menu-item" + (it.divider ? " div" : "") + (it.danger ? " danger" : "") + (it.soon ? " soon" : "");
      html += '<button class="' + cls + '" type="button" style="--c:' + (it.c || "var(--gold-d)") + '" data-act="' + (it.act || "soon") + '" data-label="' + esc(it.label) + '">' +
        '<span class="cmtb-menu-bar"></span><span class="cmtb-menu-lbl">' + esc(it.label) + '</span>' +
        (it.soon ? '<span class="cmtb-menu-soon">binnenkort</span>' : '') + '</button>';
    });
    m.innerHTML = html;
    document.body.appendChild(m);

    var r = anchor.getBoundingClientRect();
    m.style.top  = (r.bottom + window.scrollY + 6) + "px";
    m.style.left = Math.max(8, r.right + window.scrollX - m.offsetWidth) + "px";

    m.querySelectorAll(".cmtb-menu-item").forEach(function (b){
      b.addEventListener("click", function (){
        var a = b.getAttribute("data-act"), label = b.getAttribute("data-label");
        closeMenu();
        if (a === "soon"){ toast(label + " is coming soon"); return; }
        go(a, worldId);
      });
    });
    setTimeout(function (){
      document.addEventListener("click", function onDoc(e){
        if (!m.contains(e.target) && e.target !== anchor){ closeMenu(); document.removeEventListener("click", onDoc); }
      });
    }, 0);
  }

  /* ---- bel / rugzak panelen ---- */
  var INV_RC = { bronze:"#b3713a", silver:"#7f97a6", gold:"#d99a1f", crew:"#9b3f8c", stamina:"#2e7d5b" };
  var ROLE_EMB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.6C7.9 18.4 5 15.2 5 11V6z"/><path d="M9.2 11.6l2 2 3.6-4"/></svg>';
  var STAM_EMB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>';

  function closePanel(){ var p = document.querySelector(".cmtb-pop"); if (p && p.parentNode) p.parentNode.removeChild(p); }
  function openPanel(anchor, html){
    closeMenu(); closePanel();
    var p = document.createElement("div");
    p.className = "cmtb-pop";
    p.innerHTML = html;
    document.body.appendChild(p);
    var r = anchor.getBoundingClientRect();
    p.style.top  = (r.bottom + window.scrollY + 6) + "px";
    p.style.left = Math.max(8, r.right + window.scrollX - p.offsetWidth) + "px";
    setTimeout(function (){
      document.addEventListener("click", function onDoc(e){
        if (!p.contains(e.target) && e.target !== anchor){ closePanel(); document.removeEventListener("click", onDoc); }
      });
    }, 0);
    return p;
  }
  function openBell(anchor){
    openPanel(anchor,
      '<div class="cmtb-pop-h"><span>Notifications</span></div>' +
      '<div class="cmtb-pop-empty">You\u2019re all caught up \u2014 no new notifications.</div>');
  }
  function groupInv(items){
    var map = {};
    (items || []).forEach(function (it){
      var k = it.kind + "|" + it.value + "|" + it.rarity;
      if (!map[k]) map[k] = { kind: it.kind, value: it.value, rarity: it.rarity, data: it.data, ids: [] };
      map[k].ids.push(it.id);
    });
    return Object.keys(map).map(function (k){ return map[k]; });
  }
  function bagRow(g){
    var emb, sub;
    if (g.kind === "crew_card"){
      var d = g.data || {};
      emb = '<span class="cmtb-pop-av" style="background:' + INV_RC.crew + '">' + iniOf(g.value) + '</span>';
      sub = (d.p != null) ? ("P" + d.p + " \u00b7 D" + d.d + " \u00b7 S" + d.s) : "Crew card";
    } else if (g.kind === "stamina"){
      emb = '<span class="cmtb-pop-ic" style="background:' + INV_RC.stamina + '">' + STAM_EMB + '</span>';
      var amt = (g.data && g.data.amount) ? g.data.amount : 25;
      sub = "Restores +" + amt + " stamina";
    } else {
      emb = '<span class="cmtb-pop-ic" style="background:' + (INV_RC[g.rarity] || INV_RC.gold) + '">' + ROLE_EMB + '</span>';
      sub = "Role card";
    }
    var cnt = g.ids.length > 1 ? '<span class="cmtb-pop-cnt">\u00d7' + g.ids.length + '</span>' : '';
    return '<div class="cmtb-pop-row">' + emb +
      '<div class="cmtb-pop-tx"><div class="cmtb-pop-nm">' + esc(g.value) + '</div><div class="cmtb-pop-sub">' + esc(sub) + '</div></div>' +
      cnt + '</div>';
  }
  async function openBag(anchor, worldId){
    var p = openPanel(anchor, '<div class="cmtb-pop-h"><span>Backpack</span></div><div class="cmtb-pop-empty">Loading\u2026</div>');
    var items = [];
    try { var inv = await Api.inventory(); items = (inv && inv.items) || []; }
    catch (e){ items = null; }
    if (!p.parentNode) return;
    if (items === null){ p.innerHTML = '<div class="cmtb-pop-h"><span>Backpack</span></div><div class="cmtb-pop-empty">Couldn\u2019t load your backpack.</div>'; return; }
    var groups = groupInv(items);
    var total = groups.reduce(function (a, g){ return a + g.ids.length; }, 0);
    var head = '<div class="cmtb-pop-h"><span>Backpack</span>' + (total ? '<span class="cmtb-pop-c">' + total + (total === 1 ? " card" : " cards") + '</span>' : '') + '</div>';
    if (!groups.length){ p.innerHTML = head + '<div class="cmtb-pop-empty">Your backpack is empty \u2014 complete missions and open chests to collect cards.</div>'; return; }
    var rows = groups.slice(0, 4).map(bagRow).join("");
    p.innerHTML = head + '<div class="cmtb-pop-list">' + rows + '</div>' +
      '<div class="cmtb-pop-foot"><button class="cmtb-pop-open" type="button">Open backpack</button></div>';
    var ob = p.querySelector(".cmtb-pop-open");
    if (ob) ob.addEventListener("click", function (){ closePanel(); go("inventory", worldId); });
  }

  /* ---- CSS (kopie van de gh-top look, eigen namespace) ---- */
  function injectCss(){
    if (el("cmtb-styles")) return;
    var css = document.createElement("style"); css.id = "cmtb-styles";
    css.textContent = [
      ".cmtb-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 4px 12px;border-bottom:1px solid rgba(241,226,190,.18);}",
      ".cmtb-id{display:flex;align-items:center;gap:12px;min-width:0;}",
      ".cmtb-back{width:42px;height:42px;flex:0 0 auto;border-radius:11px;border:2px solid var(--line);background:var(--parch-3);color:var(--ink-2);display:flex;align-items:center;justify-content:center;cursor:pointer;}",
      ".cmtb-back:hover{background:var(--parch-2);}.cmtb-back svg{width:20px;height:20px;}",
      ".cmtb-emblem{position:relative;width:48px;height:48px;flex:0 0 auto;border-radius:12px;color:#fff;font-family:var(--display);font-size:24px;display:flex;align-items:center;justify-content:center;border:2px solid var(--gold-d);box-shadow:inset 0 -4px 0 rgba(0,0,0,.22);overflow:hidden;}",
      ".cmtb-emblem img,.cmtb-emblem svg,.cmtb-emblem canvas,.cmtb-emblem picture,.cmtb-emblem image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;}",
      ".cmtb-id-main{min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 16px;}",
      ".cmtb-crew{font-family:var(--display);font-size:22px;letter-spacing:.5px;color:var(--parch);text-shadow:0 2px 0 rgba(0,0,0,.3);line-height:1;}",
      ".cmtb-stats{display:flex;gap:16px;}",
      ".cmtb-stat{display:flex;flex-direction:column;}",
      ".cmtb-stat-l{font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:rgba(241,226,190,.55);}",
      ".cmtb-stat-v{font-family:var(--display);font-size:16px;color:var(--parch);line-height:1.1;}",
      ".cmtb-stat-v.berries{color:var(--gold-hi);}",
      ".cmtb-acts{display:flex;gap:9px;flex:0 0 auto;}",
      ".cmtb-ic{position:relative;width:42px;height:42px;border-radius:11px;border:2px solid var(--line);background:var(--parch-3);color:var(--ink-2);display:flex;align-items:center;justify-content:center;cursor:pointer;}",
      ".cmtb-ic:hover{background:var(--parch-2);}.cmtb-ic svg{width:21px;height:21px;}",
      ".cmtb-ctx{display:flex;align-items:baseline;gap:12px;padding:11px 2px 0;}",
      ".cmtb-title{font-family:var(--display);font-size:21px;letter-spacing:.5px;color:var(--parch);text-shadow:0 2px 0 rgba(0,0,0,.3);line-height:1;}",
      ".cmtb-sub{font-size:12.5px;color:rgba(241,226,190,.6);font-style:italic;}",
      /* menu */
      ".cmtb-menu-pop{position:absolute;z-index:1200;min-width:226px;max-height:calc(100vh - 80px);overflow:auto;padding:6px;background:var(--parch);border:2px solid var(--line);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.45);scrollbar-width:none;}",
      ".cmtb-menu-pop::-webkit-scrollbar{display:none;}",
      ".cmtb-menu-item{display:flex;align-items:center;gap:11px;width:100%;text-align:left;font-family:var(--display);font-size:15px;letter-spacing:.4px;color:var(--ink);background:transparent;border:none;border-radius:8px;padding:10px 12px;cursor:pointer;}",
      ".cmtb-menu-bar{flex:0 0 auto;width:4px;height:18px;border-radius:3px;background:var(--c,var(--gold-d));}",
      ".cmtb-menu-lbl{flex:1;min-width:0;}",
      ".cmtb-menu-item:hover{background:rgba(138,90,43,.1);}",
      ".cmtb-menu-item.soon{color:var(--muted);}",
      ".cmtb-menu-item.div{margin-top:6px;padding-top:12px;border-top:2px solid rgba(138,90,43,.22);}",
      ".cmtb-menu-item.danger{color:var(--danger);}",
      ".cmtb-menu-soon{flex:0 0 auto;font-family:var(--display);font-size:9.5px;letter-spacing:.5px;color:#d9cdf0;background:#0d2f40;border:1.5px solid var(--gold-d);border-radius:9px;padding:2px 7px;}",
      /* bell / bag pop */
      ".cmtb-pop{position:absolute;z-index:1200;width:min(284px,88vw);max-height:calc(100vh - 90px);overflow:auto;background:var(--parch);border:2px solid var(--line);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.45);scrollbar-width:none;}",
      ".cmtb-pop::-webkit-scrollbar{display:none;}",
      ".cmtb-pop-h{display:flex;align-items:center;justify-content:space-between;font-family:var(--display);font-size:15px;letter-spacing:.5px;color:#fff;background:linear-gradient(180deg,#16506b,#0d2f40);border-bottom:2px solid var(--gold-d);border-radius:10px 10px 0 0;padding:9px 13px;position:sticky;top:0;}",
      ".cmtb-pop-c{font-family:var(--display);font-size:12px;color:var(--gold-hi);}",
      ".cmtb-pop-empty{padding:22px 14px;font-size:13px;color:var(--ink-2);font-style:italic;text-align:center;}",
      ".cmtb-pop-list{display:flex;flex-direction:column;}",
      ".cmtb-pop-row{display:flex;align-items:center;gap:10px;padding:10px 13px;border-bottom:1px solid rgba(138,90,43,.16);}",
      ".cmtb-pop-row:last-child{border-bottom:none;}",
      ".cmtb-pop-ic{width:34px;height:34px;flex:0 0 auto;border-radius:9px;color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid rgba(0,0,0,.16);box-shadow:inset 0 2px 3px rgba(255,255,255,.3),inset 0 -3px 4px rgba(0,0,0,.2);}",
      ".cmtb-pop-ic svg{width:19px;height:19px;}",
      ".cmtb-pop-av{position:relative;width:34px;height:34px;flex:0 0 auto;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:16px;box-shadow:inset 0 -2px 0 rgba(0,0,0,.22);overflow:hidden;}",
      ".cmtb-pop-av img,.cmtb-pop-av svg,.cmtb-pop-av canvas,.cmtb-pop-av picture,.cmtb-pop-av image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;}",
      ".cmtb-pop-tx{flex:1;min-width:0;}",
      ".cmtb-pop-nm{font-family:var(--display);font-size:15px;letter-spacing:.3px;color:var(--ink);line-height:1.1;}",
      ".cmtb-pop-sub{font-size:11.5px;color:var(--ink-2);margin-top:1px;}",
      ".cmtb-pop-cnt{flex:0 0 auto;font-family:var(--display);font-size:13px;color:var(--ink);background:var(--parch-3);border:1px solid var(--line-soft);border-radius:7px;padding:1px 7px;}",
      ".cmtb-pop-foot{padding:10px 13px;text-align:center;border-top:1px solid rgba(138,90,43,.18);position:sticky;bottom:0;background:var(--parch);}",
      ".cmtb-pop-open{font-family:var(--display);font-size:13px;letter-spacing:.4px;color:var(--ink);background:linear-gradient(180deg,var(--gold-hi),var(--gold));border:1.5px solid var(--gold-d);border-radius:9px;padding:6px 18px;cursor:pointer;box-shadow:0 2px 0 var(--gold-d);}",
      ".cmtb-pop-open:active{transform:translateY(2px);box-shadow:0 0 0 var(--gold-d);}"
    ].join("\n");
    document.head.appendChild(css);
  }

  window.cmTopbar = { mount: mount, refresh: refresh, funds: funds, summary: summary };
})();