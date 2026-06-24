"use strict";

/* ====================================================================
   New Game screen
   ==================================================================== */
function renderCaptains(){
  const wrap = els.carousel;
  wrap.innerHTML = "";
  captainPool().forEach(cap => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "cap-card";
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", "false");
    card.dataset.name = cap.n;
    card.innerHTML =
      '<div class="cap-card__av" style="background:' + colorFor(cap.n) + '">' + initial(cap.n) +
        (window.CrewCard ? CrewCard.photoTag(cap.n) : "") + '</div>' +
      '<div class="cap-card__name">' + escapeHtml(cap.n) + '</div>';
    card.addEventListener("click", () => selectCaptain(cap.n, card));
    wrap.appendChild(card);
  });
}

function selectCaptain(name, card){
  state.captain = name;
  els.carousel.querySelectorAll(".cap-card").forEach(c => {
    const on = (c === card);
    c.classList.toggle("is-selected", on);
    c.setAttribute("aria-selected", on ? "true" : "false");
  });
  card.scrollIntoView({ behavior:"smooth", inline:"nearest", block:"nearest" });
  validate();
}

function validate(){
  const nameOk = els.crewName.value.trim().length > 0;
  const capOk  = !!state.captain;
  const ok = nameOk && capOk;

  els.startBtn.disabled = !ok;
  els.hint.classList.remove("is-error");

  if (ok)                    els.hint.textContent = "Ready to set sail!";
  else if (!nameOk && capOk) els.hint.textContent = "Give your crew a name.";
  else if (nameOk && !capOk) els.hint.textContent = "Choose a captain.";
  else                       els.hint.textContent = "Enter a crew name and choose a captain to start.";
}

function selectDifficulty(level, card){
  state.difficulty = level;
  (els.diffCards || []).forEach(c => {
    const on = (c === card);
    c.classList.toggle("is-selected", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function setupDifficulty(){
  els.diffCards = Array.prototype.slice.call(document.querySelectorAll("#difficulty-list .diff-card"));
  if (!els.diffCards.length){ state.difficulty = "normal"; return; }
  const pre = els.diffCards.filter(c => c.classList.contains("is-selected"))[0] || els.diffCards[0];
  state.difficulty = pre.dataset.diff || "normal";
  els.diffCards.forEach(card => {
    card.addEventListener("click", () => selectDifficulty(card.dataset.diff, card));
  });
}

function onStart(){
  const crew = els.crewName.value.trim();
  if (!crew || !state.captain){
    els.hint.textContent = "You need a crew name and a captain to start.";
    els.hint.classList.add("is-error");
    return;
  }
  const saves = Store.get(SAVES_KEY) || [];
  if (saves.length >= MAX_SAVES){
    els.hint.textContent = "You've reached the maximum of " + MAX_SAVES + " saved games. Delete one first.";
    els.hint.classList.add("is-error");
    return;
  }
  const save = {
    id: Date.now(),
    crew: crew,
    captain: state.captain,
    captainStats: { p:8, d:8, s:8 },
    captainCond: 100,
    difficulty: state.difficulty || "normal",
    berries: STARTING_BERRIES,
    day: 1,
    roster: [],
    record: { w:0, d:0, l:0, pts:0 },
    created: new Date().toISOString()
  };
  generateLeague(save);
  saves.push(save);
  Store.set(SAVES_KEY, saves);
  Store.set(CURRENT_KEY, save.id);
  goHome(save);
}

/* carousel: mouse wheel -> horizontal + edge fade */
function setupCarousel(){
  const wrap = els.carouselWrap;
  const car  = els.carousel;
  car.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)){ car.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive:false });
  function updateFades(){
    const max = car.scrollWidth - car.clientWidth;
    wrap.classList.toggle("can-left",  car.scrollLeft > 4);
    wrap.classList.toggle("can-right", car.scrollLeft < max - 4);
  }
  car.addEventListener("scroll", updateFades);
  window.addEventListener("resize", updateFades);
  updateFades();
}

/* ====================================================================
   Saved games
   ==================================================================== */
function buildSaveRow(save){
  const row = document.createElement("div");
  row.className = "save-row";
  row.innerHTML =
    '<div class="save-row__info">' +
      '<div class="save-row__crew">' + escapeHtml(save.crew) + '</div>' +
      '<div class="save-row__meta">Captain ' + escapeHtml(save.captain) + ' · day ' + (save.day || 1) + '</div>' +
    '</div>';

  const cont = document.createElement("button");
  cont.type = "button";
  cont.className = "btn-gold";
  cont.style.cssText = "width:auto;font-size:16px;padding:8px 16px";
  cont.textContent = "Continue";
  cont.addEventListener("click", () => continueGame(save.id));

  const del = document.createElement("button");
  del.type = "button";
  del.className = "save-row__del";
  del.setAttribute("aria-label", "Delete save");
  del.innerHTML = "&times;";
  del.addEventListener("click", () => deleteSave(save.id, save.crew));

  row.appendChild(cont);
  row.appendChild(del);
  return row;
}

function renderSavedGames(){
  const box = els.savedList;
  box.innerHTML = "";
  const saves = (Store.get(SAVES_KEY) || []).slice().reverse();

  if (saves.length === 0){
    const empty = document.createElement("div");
    empty.className = "saved-empty";
    empty.textContent = "No saved game yet";
    box.appendChild(empty);
    return;
  }
  saves.slice(0, PREVIEW_SAVES).forEach(s => box.appendChild(buildSaveRow(s)));
  if (saves.length > PREVIEW_SAVES){
    const more = document.createElement("button");
    more.type = "button";
    more.className = "btn-see-all";
    more.textContent = "See all saved games (" + saves.length + ")";
    more.addEventListener("click", openAllSaves);
    box.appendChild(more);
  }
}

function openAllSaves(){ renderAllSaves(); showScreen("screen-saves"); }

function renderAllSaves(){
  const box = els.savesAll;
  box.innerHTML = "";
  const saves = (Store.get(SAVES_KEY) || []).slice().reverse();
  els.savesCount.textContent = saves.length + " / " + MAX_SAVES;
  if (saves.length === 0){
    const empty = document.createElement("div");
    empty.className = "saved-empty";
    empty.textContent = "No saved game yet";
    box.appendChild(empty);
    return;
  }
  saves.forEach(s => box.appendChild(buildSaveRow(s)));
}

function continueGame(id){
  const save = (Store.get(SAVES_KEY) || []).find(s => s.id === id);
  if (!save) return;
  Store.set(CURRENT_KEY, id);
  goHome(save);
}

function deleteSave(id, crew){
  showConfirm('Delete save "' + crew + '"? This cannot be undone.', () => {
    let saves = Store.get(SAVES_KEY) || [];
    saves = saves.filter(s => s.id !== id);
    Store.set(SAVES_KEY, saves);
    if (Store.get(CURRENT_KEY) === id) Store.set(CURRENT_KEY, null);
    renderSavedGames();
    if ($("screen-saves").classList.contains("is-active")) renderAllSaves();
  });
}

function persistSave(save){
  const saves = Store.get(SAVES_KEY) || [];
  const i = saves.findIndex(s => s.id === save.id);
  if (i >= 0){ saves[i] = save; Store.set(SAVES_KEY, saves); }
}