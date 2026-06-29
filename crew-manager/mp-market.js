"use strict";

/* ====================================================================
   Crew Manager — mp-market.js  (v2: tabel-UI + listings + history)

   Transfermarkt voor een online league. Sub-scherm:
     - cmTopbar in sub-modus (back -> cmOpenLeague)
     - i-knop (cmInfo) rechts in de tab-rij
     - 3 tabs: Buy (gedeeld bord) · Sell (jouw roster + vraagprijs) · History
     - Optimistic buy/sell/cancel: lokaal updaten + renderen, server op de
       achtergrond, rollback (reload) alleen bij fout. Geen reload-na-actie.

   Rendert in #cp-content. Eigen CSS via injectCss(), gescoopt onder .mkt2
   met container-queries (liggend + staand kloppen vanzelf).

   Depends on: Api (api.js: getMarket/getSquad/getTransfers/buyListing/
     sellMember/cancelListing/devAdvanceDay), cmTopbar, cmInfo, cmLoader,
     colorFor / initial / fmtShort / escapeHtml, optioneel CrewCard.
   ==================================================================== */

(function () {
  var BSY = "\u0E3F"; // ฿
  var ROLES = ["All","Swordsman","Sniper","Navigator","Chef","Doctor","Archaeologist","Shipwright","Musician","Helmsman","Crewmate"];

  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function fmtN(n){ return (typeof fmtShort === "function") ? fmtShort(n) : (Math.round((n || 0) / 1e6) + "M"); }
  function ber(n){ return BSY + fmtN(n); }
  function content(){ return el("cp-content"); }
  function ovr(p,d,s){ return Math.round(((p||0)+(d||0)+(s||0))/3); }
  function value(m){ return ((m.p||0)+(m.d||0)+(m.s||0)) * 1e6; }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }
  function av(name){
    var c = (typeof colorFor === "function") ? colorFor(name || "?") : "#8a5a2b";
    var i = (typeof initial === "function") ? initial(name || "?") : "?";
    var ph = window.CrewCard ? CrewCard.photoTag(name) : "";
    return '<span class="av" style="background:' + c + '">' + i + ph + '</span>';
  }
  function toast(msg){
    var d = document.createElement("div");
    d.className = "ol-toast"; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function (){ d.classList.add("out"); }, 1300);
    setTimeout(function (){ if (d.parentNode) d.remove(); }, 1700);
  }
  function loader(){ return window.cmLoader ? cmLoader("Loading the market") : '<div class="empty">Loading\u2026</div>'; }

  var M = { id:null, tab:"buy", mkt:null, sq:null, tr:null, ask:{}, expand:null, role:"All", q:"", sort:"price" };

  /* ---------------- data ---------------- */
  function fetchCore(){
    return Promise.all([
      Api.getMarket(M.id),
      Api.getSquad(M.id).catch(function(){ return null; })
    ]).then(function(a){
      M.mkt = a[0]; M.sq = a[1];
      if (M.sq && M.sq.squad) M.sq.squad.forEach(function(m){ if (M.ask[m.id] == null) M.ask[m.id] = 1.0; });
    });
  }
  function reload(){
    return fetchCore().then(function(){
      mountTopbar(); paintBody();
      if (M.tab === "hist") Api.getTransfers(M.id).then(function(r){ M.tr = r; paintBody(); }).catch(function(){});
    });
  }

  /* ---------------- open ---------------- */
  window.cmOpenMarket = function (worldId, tab){
    M.id = worldId || M.id; M.tab = tab || "buy";
    M.expand = null; M.tr = null; M.ask = {}; M.role = "All"; M.q = ""; M.sort = "price";
    injectCss();
    activateScreen("screen-competition");
    content().innerHTML = '<div class="mkt2"><div id="mkt-tb"></div><div id="mkt-tabs"></div><div id="mkt-body">' + loader() + '</div></div>';
    fetchCore().then(function(){ mountTopbar(); paintBody(); })
      .catch(function(e){
        content().innerHTML = '<div class="mkt2"><div id="mkt-tb"></div><div class="wl-err" style="padding:14px">' + esc(e.message) + '</div></div>';
        mountTopbar();
      });
  };

  /* ---------------- topbar (cmTopbar sub-modus) ---------------- */
  function mountTopbar(){
    var host = el("mkt-tb"); if (!host) return;
    var day = (M.mkt && M.mkt.day) || 1;
    if (window.cmTopbar && cmTopbar.mount){
      cmTopbar.mount(host, M.id, {
        title: "Transfer market",
        sub: "Day " + day,
        onBack: function(){ if (window.cmOpenLeague) cmOpenLeague(M.id); }
      });
    } else {
      host.innerHTML = '<div class="mkt-fbhead"><button class="mkt-fbback" type="button" aria-label="Back">\u2190</button><span>Transfer market</span></div>';
      var b = host.querySelector(".mkt-fbback"); if (b) b.onclick = function(){ if (window.cmOpenLeague) cmOpenLeague(M.id); };
    }
  }

  /* ---------------- tabs + i-knop ---------------- */
  function tabBtn(id,label,count){
    return '<button class="mkt-tab' + (M.tab === id ? " on" : "") + '" data-tab="' + id + '">' + label +
      (count != null ? '<span class="c">' + count + '</span>' : '') + '</button>';
  }
  function renderTabs(){
    var t = el("mkt-tabs"); if (!t) return;
    var board = (M.mkt && M.mkt.listings) ? M.mkt.listings.filter(function(l){ return !l.mine; }).length : 0;
    var listed = (M.sq && M.sq.squad) ? M.sq.squad.filter(function(m){ return m.listingId; }).length : 0;
    t.innerHTML = '<div class="mkt-tabs">' +
      tabBtn("buy","Buy",board) + tabBtn("sell","Sell",listed || null) + tabBtn("hist","History",null) +
      '<button class="tab-info" data-info type="button" aria-label="How the market works">i</button>' +
      '</div>';
    t.querySelectorAll("[data-tab]").forEach(function(b){ b.onclick = function(){ setTab(b.getAttribute("data-tab")); }; });
    var ib = t.querySelector("[data-info]"); if (ib) ib.onclick = openInfo;
  }
  function setTab(tab){
    M.tab = tab;
    if (tab === "hist" && !M.tr){
      renderTabs();
      var b = el("mkt-body"); if (b) b.innerHTML = loader();
      Api.getTransfers(M.id).then(function(r){ M.tr = r; paintBody(); }).catch(function(){ M.tr = { transfers: [] }; paintBody(); });
      return;
    }
    paintBody();
  }

  function openInfo(){
    var html =
      '<p>One shared market for your league. <b>Free agents</b> have no crew; <b>listed</b> characters show which crew is selling them \u2014 real or AI.</p>' +
      '<p>New faces rotate on and off every day. A name that leaves the board returns a few days later, stronger.</p>' +
      '<p>Selling? Set your asking price. Lower sells fast; higher may sit unsold. Your listed crew keep playing until someone buys them.</p>';
    if (window.cmInfo && cmInfo.show) cmInfo.show({ title: "How the market works", html: html });
    else toast("One shared league market \u2014 buy, sell with an asking price, and watch the transfer history.");
  }

  /* ---------------- shared table bits ---------------- */
  function cells(m){
    return '<div class="c-stat">' + m.p + '</div><div class="c-stat">' + m.d + '</div>' +
           '<div class="c-stat">' + m.s + '</div><div class="c-ovr">' + ovr(m.p,m.d,m.s) + '</div>';
  }
  function thead(priceLabel){
    return '<div class="thead"><span class="h-name">Character</span>' +
      '<span>P</span><span>D</span><span>S</span><span>OVR</span>' +
      '<span class="h-price">' + priceLabel + '</span><span class="h-act"></span></div>';
  }
  function sellSpeed(ratio){
    if (ratio <= 0.86) return { c:"#3f7a3a",  t:"<b>Quick sale</b> <span class='est'>\u00b7 ~90% chance per matchday</span>" };
    if (ratio <= 1.00) return { c:"#7a9b2e",  t:"<b>Fair price</b> <span class='est'>\u00b7 ~60% per matchday</span>" };
    if (ratio <= 1.15) return { c:"#b5791e",  t:"<b>Patient</b> <span class='est'>\u00b7 ~30%, may take a while</span>" };
    return                     { c:"#a3331f", t:"<b>Long shot</b> <span class='est'>\u00b7 ~10%, may sit unsold</span>" };
  }

  /* ---------------- BUY ---------------- */
  function controlsHtml(){
    var search = '<label class="search"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' +
      '<input type="text" placeholder="Search a character\u2026" value="' + esc(M.q).replace(/"/g,"&quot;") + '" data-q></label>';
    var chips = ROLES.map(function(r){ return '<button class="chip' + (M.role === r ? " on" : "") + '" data-role="' + r + '">' + r + '</button>'; }).join("");
    var sort = '<select class="sort" data-sort>' +
      '<option value="price"' + (M.sort==="price"?" selected":"") + '>Price \u2193</option>' +
      '<option value="ovr"' + (M.sort==="ovr"?" selected":"") + '>Rating \u2193</option>' +
      '<option value="name"' + (M.sort==="name"?" selected":"") + '>Name A\u2013Z</option></select>';
    return '<div class="controls">' + search + '<div class="filter-sort"><div class="chips">' + chips + '</div>' + sort + '</div></div>';
  }
  function buyBody(){
    var mkt = M.mkt || { listings: [] };
    var rows = (mkt.listings || []).filter(function(p){ return !p.mine; });
    rows = rows.filter(function(p){
      if (M.role !== "All" && p.role !== M.role) return false;
      if (M.q && (p.name||"").toLowerCase().indexOf(M.q.toLowerCase()) < 0) return false;
      return true;
    });
    rows.sort(function(a,b){
      if (M.sort === "price") return b.price - a.price;
      if (M.sort === "ovr")   return ovr(b.p,b.d,b.s) - ovr(a.p,a.d,a.s);
      return (a.name||"").localeCompare(b.name||"");
    });
    var full = (mkt.crewSize||0) >= (mkt.rosterCap||13);
    var note = full ? '<div class="note warn">Your crew is full (' + (mkt.rosterCap||13) + '/' + (mkt.rosterCap||13) + ') \u2014 sell someone before you can recruit.</div>' : '';

    var list;
    if (!rows.length){
      list = '<div class="empty">No characters match your filter.<br>Try clearing the search or role.</div>';
    } else {
      list = '<div class="tbl">' + thead("Price") + rows.map(function(p){
        var afford = (mkt.funds||0) >= p.price;
        var act = !afford ? '<div class="na">Not enough</div>'
                          : '<button class="btn sm" data-buy="' + esc(p.id) + '"' + (full ? " disabled" : "") + '>Buy</button>';
        var seller = p.sellerId ? (esc(p.sellerName) || "crew") + (p.sellerIsBot ? ' <span class="ai">AI</span>' : '') : '';
        var sub = esc(p.role) + (seller ? ' \u00b7 ' + seller : '');
        var isNew = (!p.onSale && !p.sellerId && (mkt.day||1) > 1 && p.listedDay === mkt.day);
        var ribbon = p.onSale ? '<span class="ribbon sale">Sale</span>' : (isNew ? '<span class="ribbon new">New</span>' : '');
        var priceHtml = (p.onSale && p.value ? '<span class="was">' + ber(p.value) + '</span>' : '') + '<span class="b">' + BSY + '</span>' + fmtN(p.price);
        return '<div class="trow">' +
          '<div class="c-name">' + av(p.name) + '<div class="c-meta"><div class="c-nm">' + esc(p.name) + '</div><div class="c-role">' + sub + '</div></div></div>' +
          cells(p) +
          '<div class="c-price' + (!afford ? " cant" : "") + '">' + priceHtml + '</div>' +
          '<div class="c-act">' + act + '</div>' + ribbon +
        '</div>';
      }).join("") + '</div>';
    }
    return controlsHtml() + note + list + devBtn();
  }

  /* ---------------- SELL ---------------- */
  function listingFor(member){
    if (!member.listingId || !M.mkt || !M.mkt.listings) return null;
    for (var i=0;i<M.mkt.listings.length;i++){
      var L = M.mkt.listings[i];
      if (L.id === member.listingId || L.squadMemberId === member.id) return L;
    }
    return null;
  }
  function sellBody(){
    var sq = M.sq;
    if (!sq) return '<div class="empty">Couldn\'t load your crew.</div>';
    var day = (M.mkt && M.mkt.day) || 1;
    var roster = sq.squad || [];
    var listed = roster.filter(function(m){ return m.listingId; });
    var rest   = roster.filter(function(m){ return !m.listingId; });

    var html = '<div class="tbl sell">' + thead("Value");

    // jouw actieve listings bovenaan
    listed.forEach(function(m){
      var L = listingFor(m);
      var ask = L ? L.price : Math.round(value(m) * (M.ask[m.id]||1) / 1e6) * 1e6;
      var days = L ? Math.max(0, day - (L.listedDay||day)) : 0;
      html += '<div class="trow mine">' +
        '<div class="c-name">' + av(m.name) + '<div class="c-meta"><div class="c-nm">' + esc(m.name) + ' <span class="tagmini tag-mine">Listed</span></div>' +
          '<div class="c-role">' + esc(m.role) + '</div></div></div>' +
        cells(m) +
        '<div class="c-price"><span class="b">' + BSY + '</span>' + fmtN(ask) + '</div>' +
        '<div class="c-act"><button class="btn ghost sm" data-cancel="' + esc(L ? L.id : "") + '">Cancel</button></div>' +
      '</div>' +
      '<div class="listed-meta">\u23f3 Listed Day ' + (L ? (L.listedDay||day) : day) + ' \u00b7 ' + days + ' day' + (days===1?"":"s") + ' on market \u00b7 still playing</div>';
    });

    // kapitein (niet verkoopbaar)
    var cs = sq.captainStats || { p:8, d:8, s:8 };
    html += '<div class="trow locked">' +
      '<div class="c-name">' + av(sq.captain) + '<div class="c-meta"><div class="c-nm">' + esc(sq.captain) + ' <span class="tagmini tag-cap">Captain</span></div>' +
        '<div class="c-role">Captain</div></div></div>' +
      cells(cs) +
      '<div class="c-price">\u2014</div>' +
      '<div class="c-act"><div class="lk" title="Captains can\u2019t be sold">\uD83D\uDD12</div></div>' +
    '</div>';

    if (!rest.length && !listed.length){
      html += '</div><div class="empty">Your crew is empty \u2014 recruit members on the Buy tab.</div>';
      return html;
    }

    rest.forEach(function(m){
      var val = value(m);
      var lockedToday = (m.boughtDay != null && day <= m.boughtDay);
      if (lockedToday){
        html += '<div class="trow locked">' +
          '<div class="c-name">' + av(m.name) + '<div class="c-meta"><div class="c-nm">' + esc(m.name) + '</div>' +
            '<div class="c-role">' + esc(m.role) + ' \u00b7 cond ' + (typeof m.cond==="number"?m.cond:100) + ' \u00b7 bought today</div></div></div>' +
          cells(m) +
          '<div class="c-price"><span class="b">' + BSY + '</span>' + fmtN(val) + '</div>' +
          '<div class="c-act"><div class="lk" title="Bought today \u2014 sell after next matchday">\uD83D\uDD12</div></div>' +
        '</div>';
        return;
      }
      var open = M.expand === m.id;
      if (M.ask[m.id] == null) M.ask[m.id] = 1.0;
      html += '<div class="trow' + (open?" open":"") + '">' +
        '<div class="c-name">' + av(m.name) + '<div class="c-meta"><div class="c-nm">' + esc(m.name) + '</div>' +
          '<div class="c-role">' + esc(m.role) + ' \u00b7 cond ' + (typeof m.cond==="number"?m.cond:100) + '</div></div></div>' +
        cells(m) +
        '<div class="c-price"><span class="b">' + BSY + '</span>' + fmtN(val) + '</div>' +
        '<div class="c-act"><button class="btn sm" data-sellopen="' + esc(m.id) + '">' + (open?"Close":"Sell") + '</button></div>' +
      '</div>';
      if (open){
        var ratio = M.ask[m.id];
        var ask = Math.round(val * ratio / 1e6) * 1e6;
        var pct = Math.round((ratio-1)*100);
        var sp = sellSpeed(ratio);
        html += '<div class="sellpanel">' +
          '<div class="ask-top"><span class="lab">Asking price <span class="pct">(' + (pct>=0?"+":"") + pct + '% vs value ' + ber(val) + ')</span></span>' +
            '<span class="amt"><span class="b">' + BSY + '</span>' + fmtN(ask) + '</span></div>' +
          '<div class="slider-wrap"><input type="range" class="ask" min="75" max="130" value="' + Math.round(ratio*100) + '" data-ask="' + esc(m.id) + '">' +
            '<div class="scale"><span>Quick \u00b7 ' + ber(val*0.75) + '</span><span>Value</span><span>Premium \u00b7 ' + ber(val*1.30) + '</span></div></div>' +
          '<div class="speed"><span class="speed-dot" style="background:' + sp.c + '"></span><span class="speed-txt">' + sp.t + '</span></div>' +
          '<div class="sell-actions"><button class="btn sea" data-list="' + esc(m.id) + '">List for ' + BSY + fmtN(ask) + '</button>' +
            '<button class="btn ghost" data-close="' + esc(m.id) + '">Cancel</button></div>' +
        '</div>';
      }
    });

    html += '</div>';
    return html;
  }

  /* ---------------- HISTORY ---------------- */
  function histBody(){
    if (!M.tr) return loader();
    var rows = M.tr.transfers || [];
    if (!rows.length) return '<div class="empty">No transfers yet \u2014 the market is just getting started.</div>';
    var meId = M.tr.myMembershipId;
    var byDay = [], map = {};
    rows.forEach(function(it){ if (!map[it.day]){ map[it.day] = []; byDay.push(it.day); } map[it.day].push(it); });
    return byDay.map(function(day){
      var items = map[day].map(function(it){
        var youBuy = meId && it.buyerId === meId;
        var youSell = meId && it.sellerId === meId;
        var from = it.sellerId
          ? '<span class="arrow">\u2190</span> ' + (youSell ? '<b>You</b>' : esc(it.sellerName) + (it.sellerIsBot ? ' <span class="hai">AI</span>' : ''))
          : '<span class="arrow">\u00b7</span> free agent';
        return '<div class="hrow"><span class="dot" style="background:' + ((typeof colorFor==="function")?colorFor(it.name):"#8a5a2b") + '">' + ((typeof initial==="function")?initial(it.name):"?") + '</span>' +
          '<div class="htxt">' + (youBuy ? '<b>You</b>' : esc(it.buyerName) + (it.buyerIsBot && !youBuy ? ' <span class="hai">AI</span>' : '')) +
            ' signed <b>' + esc(it.name) + '</b> ' + from + '</div>' +
          '<div class="hprice">' + ber(it.price) + '</div></div>';
      }).join("");
      return '<div class="hday">Day ' + day + '</div>' + items;
    }).join("");
  }

  /* ---------------- dev test tool ---------------- */
  function devBtn(){ return '<button class="mkt-dev" data-dev type="button">\u23ed Advance day (test)</button>'; }
  function devAdvance(){
    var b = el("mkt-body") ? el("mkt-body").querySelector("[data-dev]") : null;
    if (b){ b.disabled = true; b.textContent = "Sailing\u2026"; }
    Api.devAdvanceDay(M.id).then(function(r){ toast("Day " + ((r && r.day) || "?")); M.tr = null; reload(); })
      .catch(function(e){ toast(e.message); if (b){ b.disabled = false; b.textContent = "\u23ed Advance day (test)"; } });
  }

  /* ---------------- paint + wire ---------------- */
  function paintBody(){
    renderTabs();
    var b = el("mkt-body"); if (!b) return;
    b.innerHTML = M.tab === "buy" ? buyBody() : M.tab === "sell" ? sellBody() : histBody();
    wireBody();
  }
  function wireBody(){
    var b = el("mkt-body"); if (!b) return;
    var q = b.querySelector("[data-q]");
    if (q) q.oninput = function(){
      M.q = q.value; var pos = q.selectionStart; paintBody();
      var n = el("mkt-body").querySelector("[data-q]"); if (n){ n.focus(); try { n.setSelectionRange(pos,pos); } catch(e){} }
    };
    b.querySelectorAll("[data-role]").forEach(function(x){ x.onclick = function(){ M.role = x.getAttribute("data-role"); paintBody(); }; });
    var so = b.querySelector("[data-sort]"); if (so) so.onchange = function(){ M.sort = so.value; paintBody(); };

    b.querySelectorAll("[data-buy]").forEach(function(x){ x.onclick = function(){ doBuy(x.getAttribute("data-buy")); }; });
    b.querySelectorAll("[data-sellopen]").forEach(function(x){ x.onclick = function(){ var id = x.getAttribute("data-sellopen"); M.expand = M.expand === id ? null : id; paintBody(); }; });
    b.querySelectorAll("[data-close]").forEach(function(x){ x.onclick = function(){ M.expand = null; paintBody(); }; });
    b.querySelectorAll("[data-ask]").forEach(function(r){ r.oninput = function(){ M.ask[r.getAttribute("data-ask")] = parseInt(r.value,10)/100; livePatch(r); }; });
    b.querySelectorAll("[data-list]").forEach(function(x){ x.onclick = function(){ var id = x.getAttribute("data-list"); doList(id, M.ask[id] || 1); }; });
    b.querySelectorAll("[data-cancel]").forEach(function(x){ x.onclick = function(){ doCancel(x.getAttribute("data-cancel")); }; });
    var d = b.querySelector("[data-dev]"); if (d) d.onclick = devAdvance;
  }
  function livePatch(r){
    var id = r.getAttribute("data-ask"); var ratio = M.ask[id] || 1;
    var m = (M.sq && M.sq.squad) ? M.sq.squad.filter(function(x){ return x.id === id; })[0] : null; if (!m) return;
    var val = value(m); var ask = Math.round(val*ratio/1e6)*1e6; var pct = Math.round((ratio-1)*100); var sp = sellSpeed(ratio);
    var panel = r.closest(".sellpanel"); if (!panel) return;
    var amt = panel.querySelector(".ask-top .amt"); if (amt) amt.innerHTML = '<span class="b">' + BSY + '</span>' + fmtN(ask);
    var pctEl = panel.querySelector(".ask-top .pct"); if (pctEl) pctEl.textContent = '(' + (pct>=0?"+":"") + pct + '% vs value ' + ber(val) + ')';
    var dot = panel.querySelector(".speed-dot"); if (dot) dot.style.background = sp.c;
    var txt = panel.querySelector(".speed-txt"); if (txt) txt.innerHTML = sp.t;
    var lb = panel.querySelector("[data-list]"); if (lb) lb.innerHTML = 'List for ' + BSY + fmtN(ask);
  }

  /* ---------------- optimistic actions ---------------- */
  function doBuy(listingId){
    if (!M.mkt || !M.mkt.listings) return;
    var idx = -1; for (var i=0;i<M.mkt.listings.length;i++){ if (M.mkt.listings[i].id === listingId){ idx = i; break; } }
    if (idx < 0) return;
    var L = M.mkt.listings[idx];
    if (L.mine) { toast("That's your own listing."); return; }
    if ((M.mkt.funds||0) < L.price){ toast("Not enough Berries."); return; }
    if ((M.mkt.crewSize||0) >= (M.mkt.rosterCap||13)){ toast("Your crew is full."); return; }

    // optimistic
    M.mkt.listings.splice(idx,1);
    M.mkt.funds = (M.mkt.funds||0) - L.price;
    M.mkt.crewSize = (M.mkt.crewSize||0) + 1;
    if (M.sq && M.sq.squad) M.sq.squad.push({ id:"tmp_"+Date.now(), name:L.name, role:L.role, p:L.p, d:L.d, s:L.s, cond:100, boughtDay:M.mkt.day, listingId:null });
    paintBody();

    Api.buyListing(M.id, listingId).then(function(){
      toast("Recruited " + L.name + "!");
      if (window.cmSaved) window.cmSaved();
      if (window.cmTopbar && cmTopbar.refresh) cmTopbar.refresh(M.id);
    }).catch(function(e){ toast(e.message || "Couldn't buy."); reload(); });
  }

  function doList(memberId, ratio){
    var m = (M.sq && M.sq.squad) ? M.sq.squad.filter(function(x){ return x.id === memberId; })[0] : null;
    if (!m) return;
    ratio = Math.max(0.75, Math.min(1.30, ratio || 1));
    var val = value(m);
    var price = Math.max(1e6, Math.round(val*ratio/1e6)*1e6);
    var tmpId = "tmp_" + Date.now();

    // optimistic
    m.listingId = tmpId;
    M.mkt.listings.push({ id:tmpId, name:m.name, role:m.role, p:m.p, d:m.d, s:m.s, value:val, price:price, askRatio:ratio, listedDay:M.mkt.day, mine:true, sellerId:M.mkt.myMembershipId, squadMemberId:m.id });
    M.expand = null;
    paintBody();

    Api.sellMember(M.id, memberId, ratio).then(function(r){
      var L = M.mkt.listings.filter(function(x){ return x.id === tmpId; })[0];
      if (r && r.listingId){ if (L) L.id = r.listingId; m.listingId = r.listingId; }
      if (L && r && typeof r.price === "number") L.price = r.price;
      toast(m.name + " listed for " + ber(price));
      if (window.cmSaved) window.cmSaved();
      paintBody();
    }).catch(function(e){ toast(e.message || "Couldn't list."); reload(); });
  }

  function doCancel(listingId){
    if (!listingId){ reload(); return; }
    if (M.mkt && M.mkt.listings){
      var idx = -1; for (var i=0;i<M.mkt.listings.length;i++){ if (M.mkt.listings[i].id === listingId){ idx = i; break; } }
      var L = idx >= 0 ? M.mkt.listings[idx] : null;
      if (M.sq && M.sq.squad){
        M.sq.squad.forEach(function(m){ if (m.listingId === listingId || (L && m.id === L.squadMemberId)) m.listingId = null; });
      }
      if (idx >= 0) M.mkt.listings.splice(idx,1);
    }
    paintBody();
    Api.cancelListing(M.id, listingId).then(function(){ toast("Listing cancelled."); })
      .catch(function(e){ toast(e.message || "Couldn't cancel."); reload(); });
  }

  /* ---------------- scoped CSS ---------------- */
  function injectCss(){
    if (el("mkt2-css")) return;
    var st = document.createElement("style"); st.id = "mkt2-css"; st.textContent = CSS; document.head.appendChild(st);
  }

  var CSS = ''
  + '.mkt2{ container-type:inline-size; font-family:var(--body); color:var(--ink); }'
  + '.mkt2 .mkt-fbhead{ display:flex; align-items:center; gap:10px; padding:12px; background:var(--sea); color:var(--parch-3); font-family:var(--display); font-size:18px; }'
  + '.mkt2 .mkt-fbback{ background:#ffffff14; border:0; color:inherit; width:32px; height:32px; border-radius:8px; cursor:pointer; }'
  /* tabs */
  + '.mkt2 .mkt-tabs{ display:flex; gap:0; background:var(--parch-2); border-bottom:2px solid var(--line); padding:0 8px; }'
  + '.mkt2 .mkt-tab{ appearance:none; border:0; background:transparent; cursor:pointer; font-family:var(--display); font-weight:400; letter-spacing:.6px; font-size:16px; color:var(--ink-2); padding:11px 14px 9px; position:relative; opacity:.66; flex:0 0 auto; }'
  + '.mkt2 .mkt-tab .c{ font-family:var(--body); font-weight:600; font-size:11px; opacity:.7; margin-left:5px; vertical-align:1px; }'
  + '.mkt2 .mkt-tab:hover{ opacity:.9; } .mkt2 .mkt-tab.on{ opacity:1; color:var(--ink); }'
  + '.mkt2 .mkt-tab.on::after{ content:""; position:absolute; left:8px; right:8px; bottom:-2px; height:3px; background:linear-gradient(90deg,var(--gold-d),var(--gold),var(--gold-d)); border-radius:3px 3px 0 0; }'
  + '.mkt2 .tab-info{ margin-left:auto; align-self:center; flex:0 0 auto; width:27px; height:27px; margin-right:2px; border-radius:50%; border:1.5px solid var(--line-soft); background:var(--parch-3); color:var(--ink-2); font-family:var(--display); font-weight:400; font-size:16px; cursor:pointer; display:grid; place-items:center; }'
  + '.mkt2 .tab-info:hover{ background:var(--gold); border-color:var(--gold-d); color:#2a1c05; }'
  /* body */
  + '.mkt2 #mkt-body{ padding:11px 11px 20px; }'
  + '.mkt2 .controls{ display:flex; flex-direction:column; gap:8px; margin-bottom:11px; }'
  + '.mkt2 .search{ display:flex; align-items:center; gap:8px; background:var(--parch-3); border:1.5px solid var(--line-soft); border-radius:10px; padding:8px 11px; color:var(--ink); }'
  + '.mkt2 .search svg{ flex:0 0 auto; opacity:.6; } .mkt2 .search input{ border:0; background:transparent; outline:0; width:100%; font-family:var(--body); font-size:14px; color:var(--ink); }'
  + '.mkt2 .search input::placeholder{ color:var(--muted); }'
  + '.mkt2 .filter-sort{ display:flex; gap:8px; align-items:center; }'
  + '.mkt2 .chips{ display:flex; gap:5px; flex-wrap:nowrap; overflow-x:auto; flex:1; min-width:0; padding-bottom:2px; scrollbar-width:none; }'
  + '.mkt2 .chips::-webkit-scrollbar{ display:none; }'
  + '.mkt2 .chip{ appearance:none; cursor:pointer; font-family:var(--body); font-weight:600; font-size:12px; padding:5px 11px; border-radius:999px; flex:0 0 auto; white-space:nowrap; border:1.5px solid var(--line-soft); background:var(--parch-3); color:var(--ink-2); }'
  + '.mkt2 .chip.on{ background:var(--sea); border-color:var(--sea-deep); color:var(--parch-3); }'
  + '.mkt2 .sort{ flex:0 0 auto; font-family:var(--body); font-weight:600; font-size:12px; border:1.5px solid var(--line-soft); background:var(--parch-3); color:var(--ink-2); border-radius:8px; padding:6px 8px; cursor:pointer; }'
  + '.mkt2 .note{ font-size:12.5px; color:var(--ink-2); background:#fff5d855; border:1px dashed var(--line-soft); border-radius:9px; padding:8px 11px; margin-bottom:11px; line-height:1.45; }'
  + '.mkt2 .note.warn{ background:#a3331f12; border-color:#a3331f55; color:#7e2a18; }'
  /* table */
  + '.mkt2 .tbl{ display:flex; flex-direction:column; gap:5px; --cols: minmax(0,1fr) 18px 18px 18px 24px 50px 54px; }'
  + '.mkt2 .tbl.sell{ --cols: minmax(0,1fr) 18px 18px 18px 24px 50px 54px; }'
  + '.mkt2 .thead{ display:grid; grid-template-columns:var(--cols); gap:4px; align-items:end; padding:2px 9px 5px; }'
  + '.mkt2 .thead span{ font-family:var(--body); font-weight:700; font-size:9px; letter-spacing:.5px; text-transform:uppercase; color:var(--muted); text-align:center; }'
  + '.mkt2 .thead .h-name{ text-align:left; } .mkt2 .thead .h-price{ text-align:right; }'
  + '.mkt2 .trow{ display:grid; grid-template-columns:var(--cols); gap:4px; align-items:center; position:relative; background:linear-gradient(180deg,var(--parch-3),var(--parch-2)); border:1.5px solid var(--line-soft); border-radius:10px; padding:7px 9px; box-shadow:0 1px 0 #ffffff80 inset, 0 2px 5px -3px #0006; }'
  + '.mkt2 .trow.mine{ border-color:var(--sea-light); box-shadow:0 0 0 1px var(--sea-light) inset; }'
  + '.mkt2 .trow.locked{ opacity:.62; }'
  + '.mkt2 .trow.open{ border-color:var(--sea-light); border-bottom-left-radius:0; border-bottom-right-radius:0; box-shadow:0 0 0 1px var(--sea-light) inset; }'
  + '.mkt2 .c-name{ display:flex; align-items:center; gap:8px; min-width:0; }'
  + '.mkt2 .c-name .av{ width:28px; height:28px; border-radius:50%; display:grid; place-items:center; font-family:var(--display); font-size:14px; color:#11202a; position:relative; box-shadow:0 0 0 2px #00000022,0 0 0 3px #ffffff70; overflow:hidden; }'
  + '.mkt2 .c-meta{ min-width:0; }'
  + '.mkt2 .c-nm{ font-family:var(--display); font-weight:400; letter-spacing:.3px; font-size:15px; line-height:1.05; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }'
  + '.mkt2 .c-role{ font-size:10.5px; color:var(--ink-2); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }'
  + '.mkt2 .c-role .ai{ color:var(--muted); font-weight:700; font-size:9px; }'
  + '.mkt2 .c-stat{ text-align:center; font-variant-numeric:tabular-nums; font-weight:600; font-size:13px; color:var(--ink-2); }'
  + '.mkt2 .c-ovr{ text-align:center; font-family:var(--display); font-weight:400; font-size:17px; line-height:1; color:var(--gold-d); }'
  + '.mkt2 .c-price{ text-align:right; font-weight:800; font-size:13px; font-variant-numeric:tabular-nums; color:var(--ink); white-space:nowrap; }'
  + '.mkt2 .c-price.cant{ color:var(--danger); } .mkt2 .c-price .b{ color:var(--gold-d); }'
  + '.mkt2 .c-price .was{ display:block; font-size:9px; font-weight:600; text-decoration:line-through; color:var(--muted); }'
  + '.mkt2 .c-act{ display:flex; justify-content:flex-end; }'
  + '.mkt2 .c-act .na{ font-size:9.5px; color:var(--danger); font-weight:700; line-height:1.05; text-align:center; width:100%; }'
  + '.mkt2 .c-act .lk{ font-size:14px; color:var(--muted); width:100%; text-align:center; }'
  + '.mkt2 .tagmini{ font-family:var(--body); font-weight:700; font-size:9px; letter-spacing:.5px; text-transform:uppercase; padding:2px 6px; border-radius:5px; vertical-align:1px; }'
  + '.mkt2 .tag-cap{ background:var(--gold); color:#3a2708; } .mkt2 .tag-mine{ background:var(--sea-light); color:#fff; }'
  /* buttons */
  + '.mkt2 .btn{ appearance:none; cursor:pointer; font-family:var(--display); font-weight:400; letter-spacing:.6px; font-size:15px; border-radius:9px; padding:7px 16px; border:1.5px solid var(--gold-d); color:#2a1c05; background:linear-gradient(180deg,var(--gold-hi),var(--gold)); box-shadow:0 2px 0 var(--gold-d); white-space:nowrap; }'
  + '.mkt2 .btn:hover{ filter:brightness(1.04); } .mkt2 .btn:active{ transform:translateY(1px); box-shadow:0 1px 0 var(--gold-d); }'
  + '.mkt2 .btn[disabled]{ opacity:.45; cursor:not-allowed; box-shadow:none; filter:grayscale(.3); }'
  + '.mkt2 .btn.sea{ background:linear-gradient(180deg,var(--sea-light),var(--sea)); border-color:var(--sea-deep); color:var(--parch-3); box-shadow:0 2px 0 var(--sea-deep); }'
  + '.mkt2 .btn.ghost{ background:transparent; border-color:var(--line-soft); color:var(--ink-2); box-shadow:none; }'
  + '.mkt2 .btn.sm{ width:100%; padding:6px 1px; font-size:12px; }'
  + '.mkt2 .c-act .btn.ghost.sm{ font-size:12px; }'
  /* ribbon */
  + '.mkt2 .ribbon{ position:absolute; top:-8px; right:10px; z-index:3; font-family:var(--body); font-weight:800; font-size:9px; letter-spacing:.6px; text-transform:uppercase; color:#fff; padding:2px 8px; border-radius:6px; line-height:1.35; box-shadow:0 3px 5px -2px #0008, 0 0 0 1.5px #ffffff55 inset; }'
  + '.mkt2 .ribbon.sale{ background:linear-gradient(180deg,#c1452f,var(--danger)); } .mkt2 .ribbon.new{ background:linear-gradient(180deg,#2f8fc1,var(--sea-light)); }'
  /* sell panel */
  + '.mkt2 .sellpanel{ margin-top:-5px; background:linear-gradient(180deg,var(--parch-2),var(--parch)); border:1.5px solid var(--sea-light); border-top:0; border-radius:0 0 11px 11px; padding:11px 13px 13px; }'
  + '.mkt2 .ask-top{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:9px; }'
  + '.mkt2 .ask-top .lab{ font-size:12px; color:var(--ink-2); } .mkt2 .ask-top .pct{ font-size:11px; color:var(--muted); margin-left:5px; }'
  + '.mkt2 .ask-top .amt{ font-family:var(--display); font-size:22px; color:var(--ink); } .mkt2 .ask-top .amt .b{ color:var(--gold-d); }'
  + '.mkt2 .slider-wrap{ position:relative; padding:2px 0 4px; }'
  + '.mkt2 input[type=range].ask{ -webkit-appearance:none; appearance:none; width:100%; height:8px; border-radius:6px; background:linear-gradient(90deg,#3f7a3a,var(--gold) 52%,var(--danger)); outline:0; cursor:pointer; margin:0; }'
  + '.mkt2 input[type=range].ask::-webkit-slider-thumb{ -webkit-appearance:none; width:22px; height:22px; border-radius:50%; background:radial-gradient(circle at 35% 30%,var(--gold-hi),var(--gold) 60%,var(--gold-d)); border:2px solid #2a1c05; box-shadow:0 2px 4px #0006; cursor:grab; }'
  + '.mkt2 input[type=range].ask::-moz-range-thumb{ width:20px; height:20px; border-radius:50%; background:var(--gold); border:2px solid #2a1c05; cursor:grab; }'
  + '.mkt2 .scale{ display:flex; justify-content:space-between; font-size:10.5px; color:var(--muted); margin-top:2px; }'
  + '.mkt2 .speed{ display:flex; align-items:center; gap:9px; margin-top:11px; background:var(--parch-3); border:1px solid var(--line-soft); border-radius:9px; padding:8px 10px; }'
  + '.mkt2 .speed-dot{ width:11px; height:11px; border-radius:50%; flex:0 0 auto; box-shadow:0 0 0 3px #ffffff80; }'
  + '.mkt2 .speed-txt{ font-size:12.5px; line-height:1.35; color:var(--ink); flex:1; } .mkt2 .speed-txt .est{ color:var(--ink-2); }'
  + '.mkt2 .sell-actions{ display:flex; gap:8px; margin-top:11px; } .mkt2 .sell-actions .btn{ flex:1; width:auto; padding:7px 10px; font-size:15px; }'
  + '.mkt2 .listed-meta{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:11.5px; color:var(--sea); padding:5px 12px 3px; margin-top:-3px; }'
  /* history */
  + '.mkt2 .hday{ font-family:var(--display); font-weight:400; letter-spacing:.4px; color:var(--ink); font-size:15px; margin:13px 4px 7px; }'
  + '.mkt2 .hday:first-child{ margin-top:2px; }'
  + '.mkt2 .hrow{ display:grid; grid-template-columns:auto 1fr auto; gap:9px; align-items:center; background:var(--parch-3); border:1px solid var(--line-soft); border-radius:10px; padding:7px 10px; margin-bottom:6px; }'
  + '.mkt2 .hrow .dot{ width:30px; height:30px; border-radius:50%; display:grid; place-items:center; font-family:var(--display); font-size:15px; color:#11202a; }'
  + '.mkt2 .htxt{ font-size:12.5px; line-height:1.4; color:var(--ink); } .mkt2 .htxt .arrow{ color:var(--muted); margin:0 3px; }'
  + '.mkt2 .hai{ font-size:9.5px; color:var(--muted); border:1px solid var(--line-soft); border-radius:4px; padding:1px 4px; vertical-align:1px; }'
  + '.mkt2 .hprice{ font-family:var(--body); font-weight:800; font-size:14px; color:var(--gold-d); white-space:nowrap; font-variant-numeric:tabular-nums; }'
  + '.mkt2 .empty{ text-align:center; color:var(--muted); padding:34px 16px; font-size:13.5px; }'
  + '.mkt2 .mkt-dev{ display:block; margin:16px auto 0; font-family:var(--body); font-weight:700; font-size:12px; color:var(--ink-2); background:var(--parch-3); border:1.5px solid var(--line-soft); border-radius:9px; padding:8px 14px; cursor:pointer; }'
  /* breed (liggend) */
  + '@container (min-width:560px){'
  +   '.mkt2 .controls{ flex-direction:row; align-items:center; } .mkt2 .search{ flex:1; } .mkt2 .filter-sort{ flex:0 0 auto; }'
  +   '.mkt2 .chips{ flex-wrap:wrap; overflow:visible; }'
  +   '.mkt2 .tbl{ --cols: minmax(0,1fr) 34px 34px 34px 46px 92px 96px; } .mkt2 .tbl.sell{ --cols: minmax(0,1fr) 34px 34px 34px 46px 92px 90px; }'
  +   '.mkt2 .thead{ padding:2px 14px 6px; } .mkt2 .thead span{ font-size:10px; }'
  +   '.mkt2 .trow{ padding:9px 14px; gap:10px; }'
  +   '.mkt2 .c-name .av{ width:34px; height:34px; font-size:16px; } .mkt2 .c-nm{ font-size:16px; } .mkt2 .c-role{ font-size:11.5px; }'
  +   '.mkt2 .c-stat{ font-size:14px; } .mkt2 .c-ovr{ font-size:19px; } .mkt2 .c-price{ font-size:14.5px; }'
  +   '.mkt2 .btn.sm{ font-size:13px; padding:6px 2px; }'
  + '}';

})();