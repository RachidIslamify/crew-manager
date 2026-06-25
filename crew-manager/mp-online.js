"use strict";

/* ====================================================================
   Crew Manager — mp-online.js
   The online "Grand Line" flow. Once you have a crew in a league you land
   in the GAME HOME (OSM-style): top bar (crew + berries/crew/bounty +
   bag/bell/menu), a centre block (next opponent + 19:00 countdown / preparation
   day / Grand Tournament), four action tiles (Crew, Training, Transfer
   market, League) and a bottom row (Quick match, Missions, Newspaper +
   the purple League standings). Renders into #cp-content.

   Non-members get the sign-on screen (lobby / captain pick).
   ==================================================================== */

(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function shortFunds(n){ return (typeof fmtShort === "function") ? fmtShort(n) : (Math.round((n || 0) / 1e6) + "M"); }
  function colOf(n){ return (typeof colorFor === "function") ? colorFor(n || "?") : "#1f6f4a"; }
  function iniOf(n){ return (typeof initial === "function") ? initial(n || "?") : "?"; }
  function pad(n){ return (n < 10 ? "0" : "") + n; }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }
  function content(){ return el("cp-content"); }

  // iconen voor de variant-3 bottom-row kaarten
  var ICO_SWORDS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5H19V8l-9.5 9.5-3-3z"/><path d="M5 16l3 3M3.5 20.5l2.5-2.5"/><path d="M9.5 3.5H5V8l3 3"/><path d="M19 16l-3 3M20.5 20.5L18 18"/></svg>';
  var ICO_TARGET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>';
  var ICO_NEWS   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v14H5a2 2 0 0 1-2-2V6"/><path d="M17 8h3v9a2 2 0 0 1-2 2"/><path d="M7 8h6M7 11h6M7 14h4"/></svg>';

  function avatar(name, cls){
    return '<span class="' + (cls || "ol-av") + '" style="background:' + colOf(name) + '">' + iniOf(name) +
      (window.CrewCard ? CrewCard.photoTag(name) : "") + '</span>';
  }

  // total crew bounty, computed defensively from the squad (mirrors totalCrewBounty)
  function crewBounty(mine){
    if (!mine) return 0;
    var total = 0;
    try {
      if (typeof captainBounty === "function" && mine.captainStats){
        total += captainBounty(mine.captainStats, mine.squad || []);
      } else if (typeof baseBounty === "function" && mine.captainStats){
        total += baseBounty(mine.captainStats);
      }
      (mine.squad || []).forEach(function (m){
        if (m && (m.p != null || m.d != null || m.s != null) && typeof baseBounty === "function") total += baseBounty(m);
        else if (m && typeof m.bounty === "number") total += m.bounty;
      });
    } catch (e) {}
    return total;
  }

  var L = { id: null, league: null, mine: null, pick: null, timer: null };

  function stopTimer(){ if (L.timer){ clearInterval(L.timer); L.timer = null; } }

  function head(title, sub){
    return '<div class="wl-head">' +
      '<button class="wl-back" id="ol-back" type="button" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>' +
      '</button><div><div class="cp-title">' + esc(title) + '</div>' +
      (sub ? '<div class="cp-subt">' + esc(sub) + '</div>' : '') + '</div></div>';
  }
  function wireBack(fn){
    var b = el("ol-back");
    if (b) b.addEventListener("click", fn || function (){ stopTimer(); if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds(); });
  }

  // leave the league -> back to the main menu (slots home), refreshing it
  function exitToMenu(){
    stopTimer(); closeMenu();
    document.body.classList.remove("gh-active");
    if (typeof window.cmRenderHome === "function"){ activateScreen("screen-newgame"); window.cmRenderHome(); }
    else if (typeof window.cmOpenWorlds === "function"){ window.cmOpenWorlds(); }
    else activateScreen("screen-newgame");
  }

  /* ---- entry point: open a league by world id, route by membership + status ---- */
  window.cmOpenLeague = async function (worldId){
    worldId = worldId || L.id;
    if (!worldId){ if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds(); return; }
    L.id = worldId;
    window.cmCurrentWorldId = worldId;
    activateScreen("screen-competition");
    document.body.classList.remove("gh-active");
    document.body.classList.remove("md-active");
    document.body.classList.remove("ach-active");
    document.body.classList.remove("mi-active");
    document.body.classList.remove("inv-active");
    stopTimer();
    content().innerHTML = (window.cmLoader ? window.cmLoader("Charting the course") : head("Loading\u2026", ""));

    var league = null;
    try { league = await Api.getLeague(worldId); }
    catch (e){ content().innerHTML = head("League") + '<div class="wl-err">' + esc(e.message) + '</div>'; wireBack(); return; }
    L.league = league;

    // do I already have a crew in this league?
    var mine = null;
    try { mine = await Api.getSquad(worldId); } catch (e){ mine = null; }
    L.mine = mine;

    if (mine){
      renderHome(league, mine);          // signed on -> straight into the game home (phase-aware)
      return;
    }
    if (league.status === "open"){
      renderLobby();                     // recruiting open + not signed on -> sign-on screen
    } else {
      renderClosed(league);              // recruiting closed and you're not in it
    }
  };

  /* ====================================================================
     GAME HOME (OSM-style). Phase-aware:
       open + day 0  -> preparation day (countdown to kickoff via 19:00,
                        join code + Start league early)
       active day>=1 -> next opponent + 19:00 countdown + Watch matchday
       finished      -> Grand Tournament call-to-action
     ==================================================================== */

  function teamBlock(name, cap, bounty, photoName){
    var ph = (window.CrewCard && (photoName || cap)) ? CrewCard.photoTag(photoName || cap) : "";
    return '<div class="gh-team">' +
      '<div class="gh-team-emblem" style="background:' + colOf(name) + '">' + iniOf(name) + ph + '</div>' +
      '<div class="gh-team-name">' + esc(name) + '</div>' +
      (cap ? '<div class="gh-team-sub">Captain ' + esc(cap) + '</div>' : '') +
      (bounty != null ? '<div class="gh-team-bounty">\u2620 ' + shortFunds(bounty) + '</div>' : '') +
      '</div>';
  }
  function tbdBlock(name, sub){
    return '<div class="gh-team">' +
      '<div class="gh-team-emblem tbd">?</div>' +
      '<div class="gh-team-name tbd">' + esc(name) + '</div>' +
      '<div class="gh-team-sub">' + esc(sub) + '</div>' +
      '</div>';
  }
  function tile(act, color, icon, title, sub){
    return '<button class="gh-tile" data-act="' + act + '" type="button">' +
      '<span class="strip" style="background:' + color + '"></span>' +
      '<span class="ic">' + icon + '</span>' +
      '<span class="t">' + title + '</span>' +
      '<span class="s">' + sub + '</span>' +
      '</button>';
  }
  function soonCard(icon, title, sub){
    return '<div class="gh-soon-card">' +
      '<span class="gh-soon-tag">binnenkort</span>' +
      '<div class="ic">' + icon + '</div>' +
      '<div class="t">' + title + '</div>' +
      '<div class="s">' + sub + '</div>' +
      '</div>';
  }
  function standingsTable(standings, myCrew){
    if (!standings || !standings.length) return '<div class="gh-stand-empty">No standings yet.</div>';
    var rows = "";
    standings.forEach(function (m){
      var you = m.isMe || (m.crewName === myCrew);
      rows += '<tr' + (you ? ' class="you"' : '') + '>' +
        '<td class="pos">' + m.rank + '</td>' +
        '<td class="nm">' + esc(m.crewName) + '</td>' +
        '<td class="pts">' + (m.points || 0) + '</td></tr>';
    });
    return '<table>' + rows + '</table>';
  }

  // ms timestamp of the next 19:00 Europe/Amsterdam (same-day delta -> DST-safe)
  function nextKickoffMs(){
    var KICK_H = 19;
    var now = new Date(), p = {};
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Amsterdam', hour12:false,
        hour:'2-digit', minute:'2-digit', second:'2-digit' })
        .formatToParts(now).forEach(function (x){ if (x.type !== 'literal') p[x.type] = x.value; });
    } catch (e){ p = { hour:now.getHours(), minute:now.getMinutes(), second:now.getSeconds() }; }
    var nowSec = (+p.hour) * 3600 + (+p.minute) * 60 + (+p.second);
    var delta = KICK_H * 3600 - nowSec;
    if (delta <= 0) delta += 86400;
    return now.getTime() + delta * 1000;
  }
  function startKickoff(){
    stopTimer();
    var node = el("gh-count"); if (!node) return;
    var end = nextKickoffMs();
    function tick(){
      var s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      if (s <= 0){ end = nextKickoffMs(); s = Math.max(0, Math.floor((end - Date.now()) / 1000)); }
      var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      node.textContent = (d > 0 ? (d + "d ") : "") + h + "h " + pad(m) + "m " + pad(x) + "s";
    }
    tick();
    L.timer = setInterval(tick, 1000);
  }

  async function renderHome(lg, mine){
    stopTimer();
    document.body.classList.add("gh-active");
    var status     = lg.status;
    var finished   = (status === "finished");
    var recruiting = (status === "open");
    var day        = lg.currentDay || 0;
    var total      = lg.totalDays || 30;
    var prepDay    = !finished && day <= 0;
    var active     = !finished && !prepDay;

    var cap      = mine ? mine.captain : "";
    var crewName = mine ? mine.crewName : (lg.name || "Your crew");
    var funds    = mine ? mine.funds : 0;
    var squad    = (mine && mine.squad) ? mine.squad : [];
    var size     = squad.length;
    var capCap   = (mine && mine.rosterCap) ? mine.rosterCap : 13;
    var bounty   = crewBounty(mine);

    // ---- league data: standings (always) + next opponent (active) ----
    var standings = [];
    try { if (Api.worldStandings){ var s = await Api.worldStandings(L.id); standings = (s && s.standings) || []; } } catch (e){ standings = []; }

    var capByCrew = {};
    (lg.crews || []).forEach(function (c){ if (c && c.crewName) capByCrew[c.crewName] = c.captain; });

    var opp = null;
    if (active){
      try {
        if (Api.worldFixtures){
          var f = await Api.worldFixtures(L.id, day);
          var fxs = (f && f.fixtures) || [];
          for (var i = 0; i < fxs.length; i++){
            if (fxs[i].home === crewName || fxs[i].away === crewName){
              opp = (fxs[i].home === crewName) ? fxs[i].away : fxs[i].home;
              break;
            }
          }
        }
      } catch (e){ opp = null; }
    }

    // ---- top bar ----
    var html = '<div class="gh">';
    html +=
      '<div class="gh-top">' +
        '<div class="gh-id">' +
          '<div class="gh-emblem" style="background:' + colOf(crewName) + '">' + iniOf(crewName) +
            (window.CrewCard && cap ? CrewCard.photoTag(cap) : "") + '</div>' +
          '<div class="gh-id-main">' +
            '<div class="gh-crew">' + esc(crewName) + '</div>' +
            '<div class="gh-stats">' +
              '<div class="gh-stat"><span class="gh-stat-l">Berries</span><span class="gh-stat-v">' + shortFunds(funds) + '</span></div>' +
              '<div class="gh-stat"><span class="gh-stat-l">Crew</span><span class="gh-stat-v">' + (size + 1) + ' / ' + (capCap + 1) + '</span></div>' +
              '<div class="gh-stat"><span class="gh-stat-l">Bounty</span><span class="gh-stat-v">' + shortFunds(bounty) + '</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="gh-acts">' +
          '<button class="gh-ic" id="gh-bag" type="button" aria-label="Inventory">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6V5a3 3 0 0 1 6 0v1"/><path d="M5 9.5C5 7.6 6.6 6 8.5 6h7C17.4 6 19 7.6 19 9.5V18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M5 12h14"/><path d="M12 12v3"/></svg>' +
          '</button>' +
          '<button class="gh-ic" id="gh-bell" type="button" aria-label="Notifications">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
          '</button>' +
          '<button class="gh-ic" id="gh-menu" type="button" aria-label="Menu">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';

    // ---- centre block ----
    html += '<div class="gh-battle">';
    if (finished){
      html +=
        '<div class="gh-fin">' +
          '<div class="gh-fin-h">Laugh Tale \u00b7 Grand Tournament</div>' +
          '<div class="gh-fin-s">The season is over \u2014 see who took the treasure.</div>' +
          '<button class="gh-start" data-act="tourney" type="button">View the tournament</button>' +
        '</div>';
    } else if (prepDay){
      var crewCount = (lg.crews || []).length;
      html +=
        '<div class="gh-battle-row">' +
          teamBlock(crewName, cap, bounty) +
          '<div class="gh-mid">' +
            '<div class="gh-prep">PREPARATION DAY</div>' +
            '<div class="gh-prep-sub">Season starts day 1 \u00b7 19:00</div>' +
            '<div class="gh-next-l">Starts in</div>' +
            '<div class="gh-count" id="gh-count">\u00b7\u00b7h \u00b7\u00b7m \u00b7\u00b7s</div>' +
          '</div>' +
          tbdBlock("First rival", "revealed on day 1") +
        '</div>' +
        '<div class="gh-battle-foot">' +
          '<span class="gh-prog">\u2693 ' + crewCount + ' / ' + (lg.maxPlayers || 12) + ' crews</span>' +
          (lg.code ? '<span class="gh-code">' + esc(lg.code) + '</span><button class="gh-copy" id="gh-copy" type="button">Copy</button>' : '') +
          (recruiting ? '<button class="gh-start" data-act="startnow" type="button">Start league early</button>' : '') +
        '</div>';
    } else {
      // active
      html +=
        '<div class="gh-battle-row">' +
          teamBlock(crewName, cap, bounty) +
          '<div class="gh-mid">' +
            '<div class="gh-md">MATCHDAY ' + day + '</div>' +
            '<div class="gh-vs">VS</div>' +
            '<div class="gh-next-l">Next match in</div>' +
            '<div class="gh-count" id="gh-count">\u00b7\u00b7h \u00b7\u00b7m \u00b7\u00b7s</div>' +
          '</div>' +
          (opp ? teamBlock(opp, null, null, capByCrew[opp]) : tbdBlock("Rest day", "no match scheduled")) +
        '</div>' +
        '<div class="gh-battle-foot">' +
          '<span class="gh-island">Day ' + day + ' of ' + total + ' \u00b7 kick-off 19:00</span>' +
          '<button class="gh-start" data-act="watch" type="button">Watch matchday</button>' +
        '</div>';
    }
    html += '</div>'; // .gh-battle

    // ---- action tiles ----
    html +=
      '<div class="gh-actions">' +
        tile("crew",      "#1f6f4a",       "\uD83C\uDFF4\u200D\u2620\uFE0F", "Crew",           "Line-up &amp; roster") +
        tile("training",  "#2e5e8a",       "\uD83D\uDCAA",                   "Training",       "Drill your crew") +
        tile("market",    "var(--gold-d)", "\uD83D\uDCB0",                   "Transfer market","Buy &amp; sell pirates") +
        tile("standings", "var(--gh-purple,#7a3fa0)", "\uD83C\uDFC6",        "League",         "Standings &amp; fixtures") +
      '</div>';

    // ---- bottom row ----
    html +=
      '<div class="gh-bottom">' +
        '<div class="gh-bl">' +
          '<div class="gh-soon-card gh-v3" style="--accent:#c0392b">' +
            '<span class="gh-v3-strip"></span><span class="gh-soon-tag">binnenkort</span>' +
            '<div class="gh-ch"><span class="gh-ch-ic">' + ICO_SWORDS + '</span><span class="gh-ch-t">Quick match</span></div>' +
            '<div class="gh-ch-s">Spar against a rival crew</div>' +
          '</div>' +
          '<div class="gh-soon-card gh-v3 gh-mcard" id="gh-missions-card" data-act="missions" role="button" tabindex="0" style="--accent:#d99a1f">' +
            '<span class="gh-v3-strip"></span>' +
            '<div class="gh-ch"><span class="gh-ch-ic">' + ICO_TARGET + '</span><span class="gh-ch-t">Missions</span></div>' +
            '<div class="gh-ch-s">Daily challenges</div>' +
          '</div>' +
          '<div class="gh-soon-card gh-news gh-bl-news gh-v3 gh-v3-row" style="--accent:#c8631f">' +
            '<span class="gh-v3-strip"></span>' +
            '<span class="gh-ch-ic">' + ICO_NEWS + '</span>' +
            '<div><div class="gh-ch-t">Newspaper</div><div class="gh-ch-s" style="margin-top:3px">by Big News Morgan</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="gh-stand-wrap"><div class="gh-stand">' +
          '<div class="gh-stand-h"><span>League standings</span><span class="gh-stand-all" data-act="standings">View all \u2192</span></div>' +
          '<div class="gh-stand-body">' + standingsTable(standings, crewName) + '</div>' +
        '</div></div>' +
      '</div>';

    html += '</div>'; // .gh

    content().innerHTML = html;

    // ---- wiring ----
    content().querySelectorAll("[data-act]").forEach(function (b){
      b.addEventListener("click", function (){ go(b.getAttribute("data-act")); });
    });

    var bag = el("gh-bag"); if (bag) bag.addEventListener("click", function (e){ e.stopPropagation(); openBag(bag); });
    var bell = el("gh-bell"); if (bell) bell.addEventListener("click", function (e){ e.stopPropagation(); openBell(bell); });
    var menu = el("gh-menu"); if (menu) menu.addEventListener("click", function (e){ e.stopPropagation(); openMenu(menu); });
    var copy = el("gh-copy"); if (copy) copy.addEventListener("click", function (){ doCopy(lg.code); });

    if (active) startKickoff();
    else if (prepDay) startKickoff();

    // ---- missions-kaartje bewust COMPACT houden op de home ----
    //  De widget-fill (missie-regel + balk + daily/weekly-bolletjes) maakte de
    //  kaart te lang. We laten 'm staan als "Missions / Daily challenges"; klikken
    //  op de kaart opent nog steeds de volledige missions-pagina (data-act="missions").
    // if ((active || prepDay) && typeof window.cmMissionsWidget === "function")
    //   window.cmMissionsWidget(document.getElementById("gh-missions-card"), L.id);

    runAchievementCheck(L.id);   // server checkt + unlockt; nieuwe trophies -> toast
  }

  /* laat de server de achievements herberekenen en toon toasts voor nieuwe unlocks */
  function runAchievementCheck(worldId){
    if (!worldId || typeof Api === "undefined" || typeof Api.checkAchievements !== "function") return;
    Api.checkAchievements(worldId).then(function (r){
      var list = (r && r.newlyUnlocked) || [];
      if (typeof window.cmAchievement === "function") list.forEach(function (id){ window.cmAchievement(id); });
    }).catch(function (){ /* backend nog niet klaar / geen crew -> stil negeren */ });
  }

  /* ---- shared navigation router (used by tiles, battle buttons and menu) ---- */
  function go(a){
    if (a === "startnow"){ doStartNow(); return; }      // stays on the home
    document.body.classList.remove("gh-active");          // leaving the wide home
    if (a === "crew"){ if (typeof window.cmOpenCrew === "function") window.cmOpenCrew(L.id); }
    else if (a === "market"){ if (typeof window.cmOpenMarket === "function") window.cmOpenMarket(L.id); }
    else if (a === "training"){ if (typeof window.cmOpenTraining === "function") window.cmOpenTraining(L.id); }
    else if (a === "standings"){ if (typeof window.cmOpenCompetition === "function") window.cmOpenCompetition(L.id); }
    else if (a === "matchday"){
      if (typeof window.cmOpenMatchday === "function") window.cmOpenMatchday(L.id);
      else if (typeof window.cmOpenCompetition === "function") window.cmOpenCompetition(L.id);
    }
    else if (a === "watch"){
      if (typeof window.cmPlayMatchday === "function") window.cmPlayMatchday(L.id);
      else if (typeof window.cmOpenMatchday === "function") window.cmOpenMatchday(L.id);
    }
    else if (a === "tourney"){ if (typeof window.cmOpenTournament === "function") window.cmOpenTournament(L.id); }
    else if (a === "achievements"){ if (typeof window.cmOpenAchievements === "function") window.cmOpenAchievements(); }
    else if (a === "missions"){ if (typeof window.cmOpenMissions === "function") window.cmOpenMissions(window.cmCurrentWorldId); }
    else if (a === "inventory"){ if (typeof window.cmOpenInventory === "function") window.cmOpenInventory(window.cmCurrentWorldId); }
    else if (a === "exit"){ exitToMenu(); }
  }

  /* ---- top-right hamburger menu (full navigation) ---- */
  function closeMenu(){ var m = document.querySelector(".gh-menu-pop"); if (m && m.parentNode) m.parentNode.removeChild(m); }
  function openMenu(anchor){
    closeMenu(); closePanel();
    var items = [
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
    m.className = "gh-menu-pop";
    var html = "";
    items.forEach(function (it){
      var cls = "gh-menu-item" +
        (it.divider ? " div" : "") +
        (it.danger ? " danger" : "") +
        (it.soon ? " soon" : "");
      html += '<button class="' + cls + '" type="button" style="--c:' + (it.c || "var(--gold-d)") + '" data-act="' + (it.act || "soon") + '" data-label="' + esc(it.label) + '">' +
        '<span class="gh-menu-bar"></span>' +
        '<span class="gh-menu-lbl">' + esc(it.label) + '</span>' +
        (it.soon ? '<span class="gh-menu-soon">binnenkort</span>' : '') +
        '</button>';
    });
    m.innerHTML = html;
    document.body.appendChild(m);

    var r = anchor.getBoundingClientRect();
    m.style.top  = (r.bottom + window.scrollY + 6) + "px";
    m.style.left = Math.max(8, r.right + window.scrollX - m.offsetWidth) + "px";

    m.querySelectorAll(".gh-menu-item").forEach(function (b){
      b.addEventListener("click", function (){
        var a = b.getAttribute("data-act");
        var label = b.getAttribute("data-label");
        closeMenu();
        if (a === "soon"){ toast(label + " is coming soon"); return; }
        go(a);
      });
    });

    setTimeout(function (){
      document.addEventListener("click", function onDoc(e){
        if (!m.contains(e.target) && e.target !== anchor){ closeMenu(); document.removeEventListener("click", onDoc); }
      });
    }, 0);
  }

  /* ---- kleine dropdown-panelen voor de topbar-iconen (bel / rugzak) ---- */
  function closePanel(){ var p = document.querySelector(".gh-pop"); if (p && p.parentNode) p.parentNode.removeChild(p); }
  function openPanel(anchor, html){
    closeMenu(); closePanel();
    var p = document.createElement("div");
    p.className = "gh-pop";
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
      '<div class="gh-pop-h">Notifications</div>' +
      '<div class="gh-pop-empty">You\u2019re all caught up \u2014 no new notifications.</div>');
  }

  /* ---- kleine topbar-dropdowns (bel / rugzak) ---- */
  var INV_RC = { bronze:"#b3713a", silver:"#7f97a6", gold:"#d99a1f", crew:"#9b3f8c", stamina:"#2e7d5b" };
  var ROLE_EMB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.6C7.9 18.4 5 15.2 5 11V6z"/><path d="M9.2 11.6l2 2 3.6-4"/></svg>';
  var STAM_EMB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>';

  function closePanel(){ var p = document.querySelector(".gh-pop"); if (p && p.parentNode) p.parentNode.removeChild(p); }
  function openPanel(anchor, html){
    closeMenu(); closePanel();
    var p = document.createElement("div");
    p.className = "gh-pop";
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
      '<div class="gh-pop-h"><span>Notifications</span></div>' +
      '<div class="gh-pop-empty">You\u2019re all caught up \u2014 no new notifications.</div>');
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
      emb = '<span class="gh-pop-av" style="background:' + INV_RC.crew + '">' + iniOf(g.value) + '</span>';
      sub = (d.p != null) ? ("P" + d.p + " \u00b7 D" + d.d + " \u00b7 S" + d.s) : "Crew card";
    } else if (g.kind === "stamina"){
      emb = '<span class="gh-pop-ic" style="background:' + INV_RC.stamina + '">' + STAM_EMB + '</span>';
      var amt = (g.data && g.data.amount) ? g.data.amount : 25;
      sub = "Restores +" + amt + " stamina";
    } else {
      emb = '<span class="gh-pop-ic" style="background:' + (INV_RC[g.rarity] || INV_RC.gold) + '">' + ROLE_EMB + '</span>';
      sub = "Role card";
    }
    var cnt = g.ids.length > 1 ? '<span class="gh-pop-cnt">\u00d7' + g.ids.length + '</span>' : '';
    return '<div class="gh-pop-row">' + emb +
      '<div class="gh-pop-tx"><div class="gh-pop-nm">' + esc(g.value) + '</div><div class="gh-pop-sub">' + esc(sub) + '</div></div>' +
      cnt + '</div>';
  }

  async function openBag(anchor){
    var p = openPanel(anchor, '<div class="gh-pop-h"><span>Backpack</span></div><div class="gh-pop-empty">Loading\u2026</div>');
    var items = [];
    try { var inv = await Api.inventory(); items = (inv && inv.items) || []; }
    catch (e){ items = null; }
    if (!p.parentNode) return;   // tussentijds gesloten
    if (items === null){
      p.innerHTML = '<div class="gh-pop-h"><span>Backpack</span></div><div class="gh-pop-empty">Couldn\u2019t load your backpack.</div>';
      return;
    }
    var groups = groupInv(items);
    var total = groups.reduce(function (a, g){ return a + g.ids.length; }, 0);
    var head = '<div class="gh-pop-h"><span>Backpack</span>' + (total ? '<span class="gh-pop-c">' + total + (total === 1 ? " card" : " cards") + '</span>' : '') + '</div>';
    if (!groups.length){
      p.innerHTML = head + '<div class="gh-pop-empty">Your backpack is empty \u2014 complete missions and open chests to collect cards.</div>';
      return;
    }
    var rows = groups.slice(0, 4).map(bagRow).join("");
    p.innerHTML = head + '<div class="gh-pop-list">' + rows + '</div>' +
      '<div class="gh-pop-foot"><button class="gh-pop-open" id="gh-bag-open" type="button">Open backpack</button></div>';
    var ob = p.querySelector("#gh-bag-open");
    if (ob) ob.addEventListener("click", function (){ closePanel(); go("inventory"); });
  }

  async function doStartNow(){
    var btn = content().querySelector('[data-act="startnow"]');
    if (typeof Api.startLeague !== "function"){ toast("Add Api.startLeague to api.js to enable this"); return; }
    if (btn){ btn.disabled = true; btn.textContent = "Starting\u2026"; }
    try { await Api.startLeague(L.id); await window.cmOpenLeague(L.id); }
    catch (e){ if (btn){ btn.disabled = false; btn.textContent = "Start league early"; } toast(e.message || "Could not start the season"); }
  }

  /* ---- recruiting closed and you're not a member (spectator) ---- */
  function renderClosed(lg){
    stopTimer();
    var html = head(lg.name || "The Grand Line", lg.status === "finished" ? "Season finished" : "Season in progress");
    html += '<div class="wl-soft">Recruiting for this Grand Line has closed, so you can\'t sign on here \u2014 but you can still follow the standings.</div>';
    html += '<button class="wl-gold" id="ol-standings" type="button">Standings &amp; fixtures</button>';
    content().innerHTML = html;
    wireBack(exitToMenu);
    var st = el("ol-standings"); if (st) st.addEventListener("click", function (){ if (typeof window.cmOpenCompetition === "function") window.cmOpenCompetition(L.id); });
  }

  /* ---- sign-on screen: recruiting open, not signed on yet ---- */
  function renderLobby(){
    stopTimer();
    var lg = L.league;
    var crews = lg.crews || [];
    var recruiting = !!lg.recruitsUntil && lg.status === "open";
    var sub = "Recruiting \u00b7 " + crews.length + " / " + lg.maxPlayers + " crews";

    var html = head(lg.name || "The Grand Line", sub);

    html += '<div class="ol-codebar"><span class="ol-code">' + esc(lg.code) + '</span>' +
      '<button class="wl-join ol-sm" id="ol-copy" type="button">Copy</button>' +
      '<button class="wl-gold ol-sm" id="ol-share" type="button">Share</button></div>';

    if (recruiting){
      html += '<div class="ol-timer"><div class="ol-timer-v" id="ol-cd">\u00b7\u00b7:\u00b7\u00b7:\u00b7\u00b7</div>' +
        '<div class="ol-timer-c">until recruiting closes</div></div>';
    }

    var pct = Math.max(0, Math.min(100, Math.round(crews.length / (lg.maxPlayers || 12) * 100)));
    html += '<div class="ol-meter"><i style="width:' + pct + '%"></i></div>';
    html += '<div class="wl-soft">Sign on to take a berth. Empty berths are filled with AI crews when recruiting closes, then the season begins.</div>';

    html += '<button class="wl-gold" id="ol-signon" type="button">Sign on &amp; pick your captain</button>';

    html += '<div class="wl-lbl">Crews aboard</div><div class="ol-crews">';
    if (!crews.length){
      html += '<div class="wl-soft">No crews yet \u2014 be the first to sign on.</div>';
    } else {
      crews.forEach(function (c){
        var tag = c.isBot ? '<span class="ol-tag bot">AI</span>' : '';
        html += '<div class="ol-crew">' + avatar(c.captain || c.crewName) +
          '<div style="flex:1;min-width:0"><div class="ol-crew-nm">' + esc(c.crewName) + ' ' + tag + '</div>' +
          '<div class="wl-sub">' + esc(c.captain || "\u2014") + ' \u00b7 ' + esc(c.manager || "AI") + '</div></div></div>';
      });
    }
    html += '</div>';

    content().innerHTML = html;
    wireBack(exitToMenu);
    var copy = el("ol-copy"); if (copy) copy.addEventListener("click", function (){ doCopy(lg.code); });
    var share = el("ol-share"); if (share) share.addEventListener("click", function (){ doShare(lg.code); });
    var so = el("ol-signon"); if (so) so.addEventListener("click", renderCaptainPick);

    if (recruiting) startCountdown(new Date(lg.recruitsUntil).getTime());
  }

  function startCountdown(end){
    stopTimer();
    var node = el("ol-cd"); if (!node) return;
    function tick(){
      var s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      node.textContent = pad(h) + ":" + pad(m) + ":" + pad(x);
      if (s <= 0){
        stopTimer();
        node.textContent = "The season is starting\u2026";
        setTimeout(function (){ window.cmOpenLeague(L.id); }, 1800);
      }
    }
    tick();
    L.timer = setInterval(tick, 1000);
  }

  function doCopy(code){
    try { if (navigator.clipboard) navigator.clipboard.writeText(code); } catch (e) {}
    toast("Code copied: " + code);
  }
  function doShare(code){
    var url = location.origin + location.pathname + "?join=" + encodeURIComponent(code);
    if (navigator.share){
      navigator.share({ title: "Join my Grand Line crew", text: "Set sail with me \u2014 join code " + code, url: url }).catch(function (){});
    } else {
      try { if (navigator.clipboard) navigator.clipboard.writeText(url); } catch (e) {}
      toast("Invite link copied");
    }
  }
  function toast(msg){
    var d = document.createElement("div");
    d.className = "ol-toast"; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function (){ d.classList.add("out"); }, 1300);
    setTimeout(function (){ if (d.parentNode) d.remove(); }, 1700);
  }

  /* ---- captain selection ---- */
  async function renderCaptainPick(){
    stopTimer();
    L.pick = null;
    content().innerHTML = head("Choose your captain", "Every captain leads at 8 \u00b7 8 \u00b7 8") + (window.cmLoader ? window.cmLoader() : '<div class="wl-muted">Loading\u2026</div>');

    var caps = [];
    try { caps = await Api.leagueCaptains(L.id); }
    catch (e){ content().innerHTML = head("Choose your captain", "") + '<div class="wl-err">' + esc(e.message) + '</div>'; wireBack(renderLobby); return; }

    var grid = '<div class="ol-caps">';
    caps.forEach(function (c){
      var taken = !!c.taken;
      grid += '<button class="ol-cap' + (taken ? ' taken' : '') + '" data-n="' + esc(c.name) + '"' + (taken ? ' disabled' : '') + '>' +
        '<span class="ol-cap-av" style="background:' + colOf(c.name) + '">' + iniOf(c.name) +
          (window.CrewCard ? CrewCard.photoTag(c.name) : "") + '</span>' +
        '<div class="ol-cap-nm">' + esc(c.name) + '</div>' +
        (taken ? '<div class="ol-cap-taken">taken \u00b7 ' + esc(c.by || "") + '</div>' : '<div class="ol-cap-st">8 \u00b7 8 \u00b7 8</div>') +
        '</button>';
    });
    grid += '</div>';

    content().innerHTML =
      head("Choose your captain", "Every captain leads at 8 \u00b7 8 \u00b7 8") +
      grid +
      '<label class="ol-lbl" for="ol-crewname">Crew name</label>' +
      '<input id="ol-crewname" class="ol-input" maxlength="40" placeholder="e.g. The Sunrise Pirates" />' +
      '<div id="ol-err" class="wl-err" style="display:none"></div>' +
      '<button class="wl-gold" id="ol-confirm" type="button" disabled>Pick a captain first</button>';

    wireBack(renderLobby);

    content().querySelectorAll(".ol-cap").forEach(function (b){
      if (b.disabled) return;
      b.addEventListener("click", function (){
        L.pick = b.getAttribute("data-n");
        content().querySelectorAll(".ol-cap").forEach(function (x){ x.classList.remove("sel"); });
        b.classList.add("sel");
        var conf = el("ol-confirm");
        conf.disabled = false;
        conf.textContent = "Sign on as " + L.pick;
      });
    });
    el("ol-confirm").addEventListener("click", doSignOn);
  }

  async function doSignOn(){
    if (!L.pick) return;
    var crewName = (el("ol-crewname").value || "").trim();
    var btn = el("ol-confirm");
    var errBox = el("ol-err");
    if (errBox){ errBox.style.display = "none"; errBox.textContent = ""; }
    btn.disabled = true; btn.textContent = "Signing on\u2026";
    try {
      await Api.signOn(L.id, L.pick, crewName);
      await window.cmOpenLeague(L.id);          // -> lands in the day-0 game home
    } catch (e){
      btn.disabled = false; btn.textContent = "Sign on as " + L.pick;
      if (errBox){ errBox.style.display = "block"; errBox.textContent = e.message; }
      if (/captain|kapitein|taken|bezet/i.test(e.message || "")) setTimeout(renderCaptainPick, 1300);
    }
  }
})();