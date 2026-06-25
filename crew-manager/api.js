"use strict";

// Backend draait lokaal op je eigen machine, online op Railway.
// Lokaal (Live Server) -> localhost; alles anders (github.io) -> Railway.
const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:4000"
    : "https://crew-manager-production.up.railway.app";

const Auth = {
  getToken(){ return localStorage.getItem("cm_token") || ""; },
  setToken(t){ localStorage.setItem("cm_token", t); },
  getUser(){ try { return JSON.parse(localStorage.getItem("cm_user") || "null"); } catch (e) { return null; } },
  setUser(u){ localStorage.setItem("cm_user", JSON.stringify(u)); },
  clear(){ localStorage.removeItem("cm_token"); localStorage.removeItem("cm_user"); },
};

async function apiFetch(path, options){
  options = options || {};
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  const token = Auth.getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  let res;
  try {
    res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  } catch (e) {
    throw new Error("Can't reach the server. Is the backend running?");
  }

  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (!res.ok) {
    const msg = (data && data.error) ? data.error : ("Something went wrong (" + res.status + ").");
    throw new Error(msg);
  }
  return data;
}

const Api = {
  register(username, email, password){
    return apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ username, email, password }) });
  },
  login(email, password){
    return apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  },
  me(){
    return apiFetch("/api/auth/me", { method: "GET" });
  },

  adminStats(){ return apiFetch("/api/admin/stats"); },
  adminUsers(){ return apiFetch("/api/admin/users"); },
  setUserAdmin(id, isAdmin){ return apiFetch("/api/admin/users/" + id, { method: "PATCH", body: JSON.stringify({ isAdmin: isAdmin }) }); },
  deleteUser(id){ return apiFetch("/api/admin/users/" + id, { method: "DELETE" }); },

  adminCharacters(q){ return apiFetch("/api/admin/characters" + (q ? ("?q=" + encodeURIComponent(q)) : "")); },
  createCharacter(data){ return apiFetch("/api/admin/characters", { method: "POST", body: JSON.stringify(data) }); },
  updateCharacter(id, data){ return apiFetch("/api/admin/characters/" + id, { method: "PUT", body: JSON.stringify(data) }); },
  deleteCharacter(id){ return apiFetch("/api/admin/characters/" + id, { method: "DELETE" }); },

  // ---- Multiplayer: worlds (speler) ----
  listWorlds(){ return apiFetch("/api/worlds"); },
  myWorlds(){ return apiFetch("/api/worlds/mine"); },
  joinWorld(id, crewName){ return apiFetch("/api/worlds/" + id + "/join", { method: "POST", body: JSON.stringify({ crewName: crewName || "" }) }); },
  joinWorldByCode(code, crewName){ return apiFetch("/api/worlds/join-by-code", { method: "POST", body: JSON.stringify({ code: code, crewName: crewName || "" }) }); },
  leaveWorld(id){ return apiFetch("/api/worlds/" + id + "/leave", { method: "POST" }); },
  getWorld(id){ return apiFetch("/api/worlds/" + id); },
  worldStandings(id){ return apiFetch("/api/worlds/" + id + "/standings"); },
  worldFixtures(id, day){ return apiFetch("/api/worlds/" + id + "/fixtures" + (day ? ("?day=" + encodeURIComponent(day)) : "")); },

  // ---- Multiplayer: worlds (admin) ----
  adminWorlds(){ return apiFetch("/api/worlds/admin/all"); },
  createWorld(data){ return apiFetch("/api/worlds", { method: "POST", body: JSON.stringify(data) }); },
  startWorld(id){ return apiFetch("/api/worlds/" + id + "/start", { method: "POST" }); },
  deleteWorld(id){ return apiFetch("/api/worlds/" + id, { method: "DELETE" }); },

  // ---- Multiplayer: online (Grand Line) ----
  createGrandLine(){ return apiFetch("/api/online/leagues", { method: "POST" }); },
  myLeagues(){ return apiFetch("/api/online/my-leagues"); },
  findLeague(code){ return apiFetch("/api/online/leagues/by-code/" + encodeURIComponent(String(code).trim().toUpperCase())); },
  getLeague(id){ return apiFetch("/api/online/leagues/" + id); },
  leagueCaptains(id){ return apiFetch("/api/online/leagues/" + id + "/captains"); },
  signOn(id, captain, crewName){ return apiFetch("/api/online/leagues/" + id + "/signon", { method: "POST", body: JSON.stringify({ captain: captain, crewName: crewName || "" }) }); },
  myCrew(id){ return apiFetch("/api/online/leagues/" + id + "/crew"); },
  startLeague(id){ return apiFetch("/api/online/leagues/" + id + "/start", { method: "POST" }); },

  // ---- Multiplayer: transfer market + crew ----
  getMarket(id){ return apiFetch("/api/online/leagues/" + id + "/market"); },
  buyListing(id, listingId){ return apiFetch("/api/online/leagues/" + id + "/market/buy", { method: "POST", body: JSON.stringify({ listingId: listingId }) }); },
  sellMember(id, squadMemberId){ return apiFetch("/api/online/leagues/" + id + "/market/sell", { method: "POST", body: JSON.stringify({ squadMemberId: squadMemberId }) }); },
  getSquad(id){ return apiFetch("/api/online/leagues/" + id + "/squad"); },
  devAdvanceDay(id){ return apiFetch("/api/online/leagues/" + id + "/dev-advance", { method: "POST" }); },
  advanceWorld(id){ return apiFetch("/api/online/leagues/" + id + "/advance", { method: "POST" }); },

  // ---- Multiplayer: training (6u) ----
  trainingStatus(id){ return apiFetch("/api/online/leagues/" + id + "/training"); },
  startTraining(id, name, stat){ return apiFetch("/api/online/leagues/" + id + "/training/start", { method: "POST", body: JSON.stringify({ name: name, stat: stat }) }); },
  cancelTraining(id, name){ return apiFetch("/api/online/leagues/" + id + "/training/cancel", { method: "POST", body: JSON.stringify({ name: name }) }); },

// ---- Multiplayer: opstelling (dek + bank) ----
  getLineup(id){ return apiFetch("/api/online/leagues/" + id + "/lineup"); },
  saveLineup(id, lineup){ return apiFetch("/api/online/leagues/" + id + "/lineup", { method: "POST", body: JSON.stringify({ lineup: lineup }) }); },

  // ---- Multiplayer: schip (tiers + cosmetics) ----
  getShip(worldId){ return apiFetch("/api/online/ship?worldId=" + encodeURIComponent(worldId)); },
  upgradeShip(worldId){ return apiFetch("/api/online/ship/upgrade", { method: "POST", body: JSON.stringify({ worldId: worldId }) }); },
  saveCosmetics(worldId, changes){ return apiFetch("/api/online/ship/cosmetics", { method: "POST", body: JSON.stringify({ worldId: worldId, changes: changes }) }); },

  // ---- Multiplayer: speeldag terugkijken ----
  getMatch(id, day){ return apiFetch("/api/online/leagues/" + id + "/match" + (day ? ("?day=" + encodeURIComponent(day)) : "")); },

  // ---- Achievements + account-XP ----
  achievements(){ return apiFetch("/api/achievements"); },
  checkAchievements(worldId){ return apiFetch("/api/achievements/check", { method: "POST", body: JSON.stringify({ worldId: worldId || null }) }); },

  // ---- Missions + inventory ----
  missions(worldId){ return apiFetch("/api/missions" + (worldId ? ("?worldId=" + encodeURIComponent(worldId)) : "")); },
  claimMission(missionId, worldId){ return apiFetch("/api/missions/claim", { method: "POST", body: JSON.stringify({ missionId: missionId, worldId: worldId || null }) }); },
  inventory(){ return apiFetch("/api/inventory"); },
  applyInventory(itemId, worldId, squadMemberName){ return apiFetch("/api/inventory/" + itemId + "/apply", { method: "POST", body: JSON.stringify({ worldId: worldId || null, squadMemberName: squadMemberName || null }) }); },

  // ---- Globale instellingen ----
  getSettings(){ return apiFetch("/api/settings"); },
  adminGetSettings(){ return apiFetch("/api/admin/settings"); },
  adminSaveSettings(data){ return apiFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify(data) }); },
};