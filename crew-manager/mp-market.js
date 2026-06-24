"use strict";

/* ====================================================================
   Crew Manager — mp-market.js
   Transfer market + crew screen for an online league.
   Tabs: Buy (the shared board) and My crew (your roster + selling).
   Renders into #cp-content; back returns to the league home (cmOpenLeague).
   Depends on: Api (api.js), colorFor / initial / fmtShort / escapeHtml.
   ==================================================================== */

(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function fundsTxt(n){ return (typeof fmtShort === "function") ? fmtShort(n) : (Math.round((n || 0) / 1e6) + "M"); }
  function content(){ return el("cp-content"); }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }
  function avatar(name, cls){
    var c = (typeof colorFor === "function") ? colorFor(name || "?") : "#8a5a2b";
    var i = (typeof initial === "function") ? initial(name || "?") : "?";
    var ph = window.CrewCard ? CrewCard.photoTag(name) : "";
    return '<span class="' + (cls || "mk2-av") + '" style="background:' + c + '">' + i + ph + '</span>';
  }

  var M = { id: null, tab: "buy", mkt: null, sq: null };

  function head(title, sub){
    return '<div class="wl-head">' +
      '<button class="wl-back" id="mk2-back" type="button" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>' +
      '</button><div><div class="cp-title">' + esc(title) + '</div>' +
      (sub ? '<div class="cp-subt">' + esc(sub) + '</div>' : '') + '</div></div>';
  }
  function wireBack(){
    var b = el("mk2-back");
    if (b) b.addEventListener("click", function (){ if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(M.id); });
  }
  function toast(msg){
    var d = document.createElement("div");
    d.className = "ol-toast"; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function (){ d.classList.add("out"); }, 1300);
    setTimeout(function (){ if (d.parentNode) d.remove(); }, 1700);
  }

  window.cmOpenMarket = function (worldId, tab){
    M.id = worldId || M.id;
    M.tab = tab || "buy";
    activateScreen("screen-competition");
    content().innerHTML = head("Transfer market", "");
    render();
  };

  async function render(){
    content().innerHTML = head("Transfer market", "") + (window.cmLoader ? window.cmLoader("Loading the market") : '<div class="wl-muted">Loading\u2026</div>');
    try { M.mkt = await Api.getMarket(M.id); }
    catch (e){ content().innerHTML = head("Transfer market", "") + '<div class="wl-err">' + esc(e.message) + '</div>'; wireBack(); return; }
    try { M.sq = await Api.getSquad(M.id); } catch (e){ M.sq = null; }

    var mkt = M.mkt;
    var full = (mkt.crewSize || 0) >= (mkt.rosterCap || 13);
    var sub = "Day " + (mkt.day || 1) + " \u00b7 " + fundsTxt(mkt.funds) + " Berries \u00b7 " + (mkt.crewSize || 0) + "/" + (mkt.rosterCap || 13) + " crew";

    var html = head("Transfer market", sub);
    html += '<div class="mk2-tabs">' +
      '<button class="mk2-tab' + (M.tab === "buy" ? " on" : "") + '" data-tab="buy">Buy</button>' +
      '<button class="mk2-tab' + (M.tab === "crew" ? " on" : "") + '" data-tab="crew">My crew</button>' +
      '</div>';

    html += (M.tab === "buy") ? buyBody(mkt, full) : crewBody(M.sq);

    content().innerHTML = html;
    wireBack();
    content().querySelectorAll(".mk2-tab").forEach(function (b){
      b.addEventListener("click", function (){ M.tab = b.getAttribute("data-tab"); render(); });
    });
    wireBuy();
    wireSell();
    var dev = el("mk2-dev"); if (dev) dev.addEventListener("click", devAdvance);
  }

  /* ---- Buy tab ---- */
  function buyBody(mkt, full){
    var listings = mkt.listings || [];
    var rows = "";
    if (!listings.length){
      rows = '<div class="mk2-empty">No free agents on the board right now.</div>';
    } else {
      listings.forEach(function (p){
        var canAfford = mkt.funds >= p.price;
        var dis = full || !canAfford;
        var badge = p.onSale ? '<span class="mk2-badge sale">Sale</span>' : '';
        var price = p.onSale
          ? '<s class="mk2-was">' + fundsTxt(p.value) + '</s> ' + fundsTxt(p.price)
          : fundsTxt(p.price);
        rows += '<div class="mk2-row">' +
          '<span class="mk2-avwrap">' + avatar(p.name) + badge + '</span>' +
          '<div class="mk2-info"><div class="mk2-nm">' + esc(p.name) + '</div>' +
          '<div class="mk2-role">' + esc(p.role) + ' \u00b7 <span class="mk2-pds">' + p.p + '-' + p.d + '-' + p.s + '</span></div></div>' +
          '<div class="mk2-price">' + price + '</div>' +
          '<button class="mk2-buy" data-buy="' + esc(p.id) + '"' + (dis ? ' disabled' : '') + '>Buy</button>' +
          '</div>';
      });
    }
    var note = full
      ? '<div class="mk2-note warn">Your crew is full (' + (mkt.rosterCap || 13) + '/' + (mkt.rosterCap || 13) + ') \u2014 sell someone to recruit.</div>'
      : '<div class="mk2-note">New faces arrive and rotate off every day. Names that leave return stronger a few days later.</div>';
    return note + '<div class="mk2-list">' + rows + '</div>' + devBtn();
  }

  function wireBuy(){
    content().querySelectorAll("[data-buy]").forEach(function (b){
      b.addEventListener("click", async function (){
        b.disabled = true; b.textContent = "\u2026";
        try { await Api.buyListing(M.id, b.getAttribute("data-buy")); toast("Recruited!"); if (window.cmSaved) window.cmSaved(); await render(); }
        catch (e){ toast(e.message); b.disabled = false; b.textContent = "Buy"; }
      });
    });
  }

  /* ---- My crew tab ---- */
  function crewBody(sq){
    if (!sq) return '<div class="mk2-empty">Couldn\'t load your crew.</div>';
    var cs = sq.captainStats || { p: 8, d: 8, s: 8 };
    var html = '<div class="mk2-cap">' + avatar(sq.captain, "mk2-av lg") +
      '<div class="mk2-info"><div class="mk2-nm">' + esc(sq.captain) + ' <span class="mk2-captag">Captain</span></div>' +
      '<div class="mk2-role"><span class="mk2-pds">' + cs.p + '-' + cs.d + '-' + cs.s + '</span></div></div></div>';

    var roster = sq.squad || [];
    if (!roster.length){
      html += '<div class="mk2-empty">Your crew is empty \u2014 recruit members on the Buy tab.</div>';
    } else {
      html += '<div class="mk2-list">';
      roster.forEach(function (m){
        html += '<div class="mk2-row">' + avatar(m.name) +
          '<div class="mk2-info"><div class="mk2-nm">' + esc(m.name) + '</div>' +
          '<div class="mk2-role">' + esc(m.role) + ' \u00b7 <span class="mk2-pds">' + m.p + '-' + m.d + '-' + m.s + '</span>' +
          ' \u00b7 cond ' + (typeof m.cond === "number" ? m.cond : 100) + '</div></div>' +
          '<button class="mk2-sell" data-sell="' + esc(m.id) + '">Sell</button>' +
          '</div>';
      });
      html += '</div>';
    }
    return html;
  }

  function wireSell(){
    content().querySelectorAll("[data-sell]").forEach(function (b){
      b.addEventListener("click", async function (){
        b.disabled = true; b.textContent = "\u2026";
        try {
          var r = await Api.sellMember(M.id, b.getAttribute("data-sell"));
          toast("Sold for " + fundsTxt(r.value));
          if (window.cmSaved) window.cmSaved();
          await render();
        } catch (e){
          toast(e.message); b.disabled = false; b.textContent = "Sell";
        }
      });
    });
  }

  /* ---- temporary test tool: advance a game day to watch the market move ---- */
  function devBtn(){
    return '<button class="mk2-dev" id="mk2-dev" type="button">\u23ed Advance day (test)</button>';
  }
  async function devAdvance(){
    var b = el("mk2-dev"); if (b){ b.disabled = true; b.textContent = "Sailing\u2026"; }
    try {
      var r = await Api.advanceWorld(M.id);   // echte speeldag: wedstrijden + stand + markt
      if (r && r.status === "finished") toast("Season over \u2014 the tournament has crowned a champion");
      else toast("Day " + (r && r.day ? r.day : "?") + (r && r.type && r.type !== "normal" ? " \u00b7 " + r.type + " day" : ""));
      await render();
    }
    catch (e){ toast(e.message); if (b){ b.disabled = false; b.textContent = "\u23ed Advance day (test)"; } }
  }
})();