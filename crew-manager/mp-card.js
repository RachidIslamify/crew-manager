// ===========================================================================
//  mp-card.js  —  herbruikbare karakter-kaart component voor OPM
//  Laad NA data-pirates.js (leest window.PIRATES) en NA game-core.js
//  (gebruikt colorFor / initial / escapeHtml), VOOR de schermen die 'm
//  gebruiken (mp-crew.js, mp-online.js, mp-market.js, ...).
//
//  Eén component, overal hetzelfde resultaat. Varianten:
//    CrewCard.avatar(name, size)      -> rond fotootje (initiaal als fallback)
//    CrewCard.member({name, role})    -> dek-slot EN bench-kaart (zelfde kaart)
//    CrewCard.picker({name})          -> captain-keuze: foto + naam
//    CrewCard.opponent({captain, crewName}) -> tegenstander: foto + crewnaam
//    CrewCard.market({name, role, p, d, s, price}) -> markt-rij
//
//  De foto wordt ALTIJD zelf opgezocht via imgFor(name) in window.PIRATES,
//  zodat het werkt of de data nu van de server of uit PIRATES komt.
//  De server blijft volledig ongemoeid.
// ===========================================================================

(function () {
  "use strict";

  // --- pad naar de foto's. Staat hier op ÉÉN plek; het img-veld in
  //     data-pirates.js bevat alleen de bestandsnaam (bv. "luffysmile.jpg").
  var IMG_DIR = "pictures/";

  // --- kleine helpers (vallen terug op globals uit game-core.js) ----------
  function esc(s) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function col(name) {
    return (typeof window.colorFor === "function") ? window.colorFor(name) : "#8a5a2b";
  }
  function ini(name) {
    if (typeof window.initial === "function") return window.initial(name);
    return String(name || "?").trim().charAt(0).toUpperCase() || "?";
  }

  // --- naam -> personage-index (lui opgebouwd, herbouwt als PIRATES groeit)
  var _idx = null;
  function index() {
    var list = (window.PIRATES && window.PIRATES.length) ? window.PIRATES : [];
    if (_idx && _idx.__n === list.length) return _idx;
    _idx = { __n: list.length };
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p && p.n) _idx[p.n] = p;
    }
    return _idx;
  }

  // --- foto-pad voor een naam, of null als er (nog) geen foto is ----------
  function imgFor(name) {
    if (!name) return null;
    var p = index()[name];
    if (p && p.img) return IMG_DIR + p.img;
    return null;
  }

  // --- losse <img>-overlay voor een naam (leeg als er geen foto is).
  //     Bedoeld om OVER een bestaand avatar-blokje te leggen dat al de
  //     gekleurde initiaal toont; faalt de foto, dan verdwijnt de img
  //     (onerror) en blijft de initiaal staan. Hergebruikt door de pickers,
  //     die hun eigen avatar-container met eigen maat/CSS houden.
  function photoTag(name) {
    var path = imgFor(name);
    return path
      ? '<img class="cc-img" src="' + esc(path) + '" alt="" loading="lazy" onerror="this.remove()">'
      : "";
  }

  // --- rond fotootje. Toont de foto; faalt 'ie of is er geen, dan blijft
  //     het gekleurde initiaal-blokje eronder zichtbaar (onerror = remove).
  function avatar(name, size) {
    size = size || 40;
    var fs = Math.max(11, Math.round(size * 0.42));
    return '<span class="cc-av" style="width:' + size + "px;height:" + size +
      "px;font-size:" + fs + "px;background:" + col(name) + '">' + ini(name) + photoTag(name) + "</span>";
  }

  // --- dek-slot EN bench-kaart (zelfde kaart): foto + naam + rol ----------
  function member(m) {
    m = m || {};
    return '<div class="cc-member">' +
      avatar(m.name, 44) +
      '<div class="cc-nm">' + esc(m.name) + "</div>" +
      (m.role ? '<div class="cc-role">' + esc(m.role) + "</div>" : "") +
      "</div>";
  }

  // --- captain-keuze: alleen foto + naam (iedereen is 8-8-8) --------------
  function picker(m) {
    m = m || {};
    return '<div class="cc-picker">' +
      avatar(m.name, 56) +
      '<div class="cc-nm">' + esc(m.name) + "</div>" +
      "</div>";
  }

  // --- tegenstander: foto van de captain + crewnaam ----------------------
  function opponent(m) {
    m = m || {};
    return '<div class="cc-opp">' +
      avatar(m.captain || m.name, 48) +
      '<div class="cc-nm">' + esc(m.crewName || m.name) + "</div>" +
      "</div>";
  }

  // --- markt-rij: klein fotootje + naam + rol + stats + prijs -------------
  function market(m) {
    m = m || {};
    var stats = (m.p != null)
      ? '<span class="cc-st p">P' + m.p + '</span>' +
        '<span class="cc-st d">D' + m.d + '</span>' +
        '<span class="cc-st s">S' + m.s + '</span>'
      : "";
    var price = (m.price != null)
      ? '<span class="cc-price">' + esc(String(m.price)) + "</span>"
      : "";
    return '<div class="cc-market">' +
      avatar(m.name, 40) +
      '<div class="cc-mk-main">' +
        '<div class="cc-nm">' + esc(m.name) + "</div>" +
        (m.role ? '<div class="cc-role">' + esc(m.role) + "</div>" : "") +
      "</div>" +
      '<div class="cc-mk-right">' + stats + price + "</div>" +
      "</div>";
  }

  // --- CSS één keer injecteren (styles horen bij het component) -----------
  function injectCss() {
    if (document.getElementById("cc-styles")) return;
    var css =
      ".cc-av{position:relative;display:inline-flex;align-items:center;justify-content:center;" +
        "border-radius:50%;color:#fff;font-family:var(--display,'Bangers',sans-serif);" +
        "overflow:hidden;box-shadow:inset 0 -2px 0 rgba(0,0,0,.22);flex:0 0 auto;line-height:1;}" +
      ".cc-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}" +
      // avatar-containers die hun eigen maat/CSS houden; laat ze de foto clippen
      ".cap-card__av,.ol-cap-av,.mk2-av,.gh-emblem,.gh-team-emblem,.ol-av,.cw-av{position:relative;overflow:hidden;}" +

      ".cc-member{display:flex;flex-direction:column;align-items:center;gap:2px;margin:0 auto;}" +
      ".cc-member .cc-nm{font-family:var(--display,'Bangers',sans-serif);font-size:14px;" +
        "color:var(--ink,#3a2708);line-height:1.05;word-break:break-word;}" +
      ".cc-member .cc-role{font-size:9px;color:var(--ink-2,#6b4a26);text-transform:uppercase;" +
        "letter-spacing:.4px;margin-top:1px;}" +
      ".slot.cap .cc-member .cc-role{color:var(--gold-d,#9a6b1e);font-weight:700;}" +

      // bench-kaart = exact dezelfde .slot-kaart, maar in normale flow i.p.v.
      // absoluut op het schip geplaatst.
      ".cc-benchwrap{display:flex;flex-wrap:wrap;gap:8px;}" +
      ".slot.cc-bench{position:static;transform:none;width:104px;}" +
      ".cs-fit .slot.cc-bench{transform:none;}" +
      ".slot.empty.cc-bench{display:flex;align-items:center;justify-content:center;min-height:84px;}" +

      ".cc-picker{display:flex;flex-direction:column;align-items:center;gap:6px;}" +
      ".cc-picker .cc-nm{font-family:var(--display,'Bangers',sans-serif);font-size:14px;" +
        "color:var(--ink,#3a2708);text-align:center;line-height:1.05;}" +

      ".cc-opp{display:flex;flex-direction:column;align-items:center;gap:6px;}" +
      ".cc-opp .cc-nm{font-family:var(--display,'Bangers',sans-serif);font-size:16px;" +
        "color:var(--ink,#3a2708);text-align:center;}" +

      ".cc-market{display:flex;align-items:center;gap:10px;}" +
      ".cc-mk-main{flex:1;min-width:0;}" +
      ".cc-market .cc-nm{font-family:var(--display,'Bangers',sans-serif);font-size:16px;" +
        "color:var(--ink,#3a2708);line-height:1.1;}" +
      ".cc-market .cc-role{font-size:11px;color:var(--ink-2,#6b4a26);}" +
      ".cc-mk-right{display:flex;align-items:center;gap:5px;flex:0 0 auto;}" +
      ".cc-st{font-size:10px;font-weight:600;border-radius:4px;padding:1px 5px;}" +
      ".cc-st.p{color:#791F1F;background:#F7C1C1;}" +
      ".cc-st.d{color:#0C447C;background:#B5D4F4;}" +
      ".cc-st.s{color:#27500A;background:#C0DD97;}" +
      ".cc-price{font-family:var(--display,'Bangers',sans-serif);font-size:14px;" +
        "color:var(--ink,#3a2708);margin-left:4px;}";

    var tag = document.createElement("style");
    tag.id = "cc-styles";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectCss);
  } else {
    injectCss();
  }

  // --- naar buiten ---------------------------------------------------------
  window.CrewCard = {
    imgFor: imgFor,
    avatar: avatar,
    photoTag: photoTag,
    member: member,
    picker: picker,
    opponent: opponent,
    market: market
  };
})();