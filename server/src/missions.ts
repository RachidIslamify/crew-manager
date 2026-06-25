"use strict";

/* ====================================================================
   missions.ts — daily & weekly missions + reward/loot + chests

   Plek:  server/src/missions.ts
   Mount in index.ts (mét requireAuth):
       import { missionsRouter } from "./missions";
       app.use("/api/missions", requireAuth, missionsRouter);

   Schema (nieuw, zie schema-additions.prisma): PlayerMission + InventoryItem
   + User.missionStreak / User.lastMissionDay.

   Catalog (titel/target/reward) staat hieronder in code — tunen zonder migratie.
   In de DB staat alleen wat per speler verandert: welke missies deze periode,
   voortgang, en of de reward geclaimd is.

   Andere routes roepen de hooks aan (train/trade/lineup/viewCrew/matchWin);
   bounty-missies worden afgeleid uit de huidige crew-bounty (baseline).
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";

const pd: any = require("./data-pirates");
const PIRATES: any[] = pd.PIRATES || pd.default || [];

function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}

/* ---- stat/bounty helpers (zelfde math als market.ts/engine.ts) ---- */
function enlist(v: number){ return Math.max(2, Math.round((v || 0) * 0.62)); }
function bountyTerm(sum: number){ return Math.max(1, sum) * 1_000_000; }
const DECK_ROLES = ["Swordsman", "Sniper", "Chef", "Doctor", "Archaeologist", "Shipwright", "Musician", "Navigator", "Helmsman"];

async function crewBounty(worldId: string, userId: string): Promise<number> {
  const m = await prisma.worldMembership.findFirst({
    where: { worldId, userId },
    select: { capP: true, capD: true, capS: true, squad: { select: { p: true, d: true, s: true } } },
  });
  if (!m) return 0;
  let b = bountyTerm(m.capP + m.capD + m.capS);
  for (const q of m.squad) b += bountyTerm(q.p + q.d + q.s);
  return b;
}

/* ====================================================================
   Catalog
   reward: { berries?, xp?, chest? }   event: hoe progress telt
   ==================================================================== */
type Mission = {
  key: string; scope: "daily" | "weekly"; diff: "bronze" | "silver" | "gold";
  title: string; desc: string; icon: string; target: number;
  event?: string; derived?: "bounty";
  reward: { berries?: number; xp?: number; chest?: "bronze" | "silver" | "gold" };
};

const CATALOG: Mission[] = [
  // ---- daily ----
  { key:"d_train",   scope:"daily", diff:"bronze", title:"Morning Training", desc:"Train 1 crewmate",            icon:"dumbbell",  target:1,  event:"train",   reward:{ berries:50000,  xp:10 } },
  { key:"d_lineup",  scope:"daily", diff:"bronze", title:"Captain's Line-up", desc:"Adjust your starting line-up", icon:"clipboard", target:1, event:"lineup",  reward:{ berries:50000 } },
  { key:"d_crew",    scope:"daily", diff:"bronze", title:"Check the Crew",    desc:"Open your crew roster",        icon:"flag",      target:1,  event:"viewCrew",reward:{ berries:25000 } },
  { key:"d_market",  scope:"daily", diff:"silver", title:"Market Move",       desc:"Buy or sell 1 crewmate",      icon:"coins",     target:1,  event:"trade",   reward:{ berries:100000, xp:10 } },
  { key:"d_train3",  scope:"daily", diff:"silver", title:"Training Session",  desc:"Train 3 crewmates",           icon:"dumbbell",  target:3,  event:"train",   reward:{ berries:100000 } },
  { key:"d_win",     scope:"daily", diff:"gold",   title:"Win Clash of the Day", desc:"Win your league match today", icon:"swords", target:1, event:"matchWin", reward:{ berries:250000, xp:25, chest:"bronze" } },
  { key:"d_bounty",  scope:"daily", diff:"gold",   title:"Bounty Progress",   desc:"Raise crew bounty by 10M today", icon:"poster", target:10_000_000, derived:"bounty", reward:{ berries:250000, chest:"bronze" } },
  // ---- weekly ----
  { key:"w_train3",   scope:"weekly", diff:"bronze", title:"Training Discipline", desc:"Train 3 times this week",      icon:"dumbbell",  target:3,  event:"train",   reward:{ berries:75000 } },
  { key:"w_lineupset",scope:"weekly", diff:"bronze", title:"Set the Crew",        desc:"Adjust your line-up 3 times",  icon:"clipboard", target:3,  event:"lineup",  reward:{ berries:75000 } },
  { key:"w_train10",  scope:"weekly", diff:"silver", title:"Hard Work",           desc:"Train 10 times this week",     icon:"dumbbell",  target:10, event:"train",   reward:{ berries:200000, xp:25, chest:"bronze" } },
  { key:"w_win3",     scope:"weekly", diff:"silver", title:"Three Victories",     desc:"Win 3 league matches",         icon:"swords",    target:3,  event:"matchWin",reward:{ berries:250000, chest:"silver" } },
  { key:"w_market3",  scope:"weekly", diff:"silver", title:"Market Shark",        desc:"Buy or sell 3 crewmates",      icon:"coins",     target:3,  event:"trade",   reward:{ berries:200000 } },
  { key:"w_bounty100",scope:"weekly", diff:"gold",   title:"Rising Bounty",       desc:"Raise crew bounty by 100M",    icon:"poster",    target:100_000_000, derived:"bounty", reward:{ berries:400000, xp:60, chest:"gold" } },
  { key:"w_win5",     scope:"weekly", diff:"gold",   title:"Warpath",             desc:"Win 5 league matches",         icon:"swords",    target:5,  event:"matchWin",reward:{ berries:400000, chest:"gold" } },
];
const BY_KEY: Record<string, Mission> = {};
CATALOG.forEach(m => BY_KEY[m.key] = m);

// bonus per scope: alle missies af -> chest
const BONUS = { daily: { chest:"silver" as const }, weekly: { chest:"gold" as const } };

/* ====================================================================
   Periode-sleutels (Europe/Amsterdam)
   ==================================================================== */
const fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year:"numeric", month:"2-digit", day:"2-digit" });
function dailyKey(d = new Date()){ return fmtDay.format(d); }                 // "2026-06-22"
function weeklyKey(d = new Date()){
  const [Y, M, D] = dailyKey(d).split("-").map(Number);
  const dt = new Date(Date.UTC(Y, M - 1, D));
  const dow = (dt.getUTCDay() + 6) % 7;                                       // ma=0
  dt.setUTCDate(dt.getUTCDate() - dow + 3);                                   // donderdag
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt.getTime() - firstThu.getTime()) / 864e5 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return dt.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}
function amsOffsetMin(d: Date){
  const ams = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((ams.getTime() - utc.getTime()) / 60000);
}
function nextDailyResetISO(){
  const now = new Date(); const off = amsOffsetMin(now);
  const [Y, M, D] = dailyKey(now).split("-").map(Number);
  const tomorrow = new Date(Date.UTC(Y, M - 1, D) + 864e5);
  return new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 0, 0, 0) - off * 60000).toISOString();
}
function nextWeeklyResetISO(){
  const now = new Date(); const off = amsOffsetMin(now);
  const [Y, M, D] = dailyKey(now).split("-").map(Number);
  const dt = new Date(Date.UTC(Y, M - 1, D));
  const dow = (dt.getUTCDay() + 6) % 7;                                       // ma=0
  const toMonday = (7 - dow) % 7 || 7;                                        // dagen tot volgende maandag
  const mon = new Date(dt.getTime() + toMonday * 864e5);
  return new Date(Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate(), 0, 0, 0) - off * 60000).toISOString();
}

/* ====================================================================
   Toewijzen (random per difficulty-slot) + reset (lazy bij eerste GET/hook)
   ==================================================================== */
function shuffle<T>(a: T[]): T[] { const x = a.slice(); for (let i = x.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
function poolKeys(scope: "daily" | "weekly", diff: string){ return CATALOG.filter(m => m.scope === scope && m.diff === diff).map(m => m.key); }

async function pickActiveWorld(userId: string): Promise<string | null> {
  const m = await prisma.worldMembership.findFirst({
    where: { userId, world: { status: { in: ["active", "open"] } } },
    orderBy: { joinedAt: "desc" }, select: { worldId: true },
  });
  return m?.worldId ?? null;
}

async function assignSet(userId: string, worldId: string | null, scope: "daily" | "weekly", periodKey: string){
  let keys: string[];
  if (scope === "daily"){
    const b = shuffle(poolKeys("daily", "bronze")).slice(0, 2);
    const third = Math.random() < 0.25 ? shuffle(poolKeys("daily", "gold"))[0] : shuffle(poolKeys("daily", "silver"))[0];
    keys = [...b, third];
  } else {
    keys = [ shuffle(poolKeys("weekly", "bronze"))[0], ...shuffle(poolKeys("weekly", "silver")).slice(0, 2), shuffle(poolKeys("weekly", "gold"))[0] ];
  }
  const bounty = worldId ? await crewBounty(worldId, userId) : 0;
  const rows = keys.filter(Boolean).map(k => {
    const m = BY_KEY[k];
    return { userId, scope, periodKey, missionKey: k, difficulty: m.diff, target: m.target,
             baseline: m.derived === "bounty" ? bounty : null, worldId };
  });
  // verborgen bonus-rij (houdt de "geclaimd"-vlag van de set-bonus bij)
  rows.push({ userId, scope, periodKey, missionKey: "_bonus", difficulty: "bonus", target: rows.length, baseline: null, worldId } as any);
  await prisma.playerMission.createMany({ data: rows as any, skipDuplicates: true });
}

async function ensureMissions(userId: string, worldId: string | null){
  const dk = dailyKey(), wk = weeklyKey();
  const haveD = await prisma.playerMission.count({ where: { userId, scope: "daily", periodKey: dk } });
  if (!haveD) await assignSet(userId, worldId, "daily", dk);
  const haveW = await prisma.playerMission.count({ where: { userId, scope: "weekly", periodKey: wk } });
  if (!haveW) await assignSet(userId, worldId, "weekly", wk);
}

/* ====================================================================
   Voortgang: streak, afgeleide bounty-missies, en de event-hook
   ==================================================================== */
async function bumpStreak(userId: string){
  const today = dailyKey();
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { missionStreak: true, lastMissionDay: true } });
  if (!u || u.lastMissionDay === today) return;
  const yest = dailyKey(new Date(Date.now() - 864e5));
  const next = u.lastMissionDay === yest ? (u.missionStreak + 1) : 1;
  await prisma.user.update({ where: { id: userId }, data: { missionStreak: next, lastMissionDay: today } });
}

async function refreshDerived(userId: string, worldId: string | null){
  if (!worldId) return;
  const dk = dailyKey(), wk = weeklyKey();
  const rows = await prisma.playerMission.findMany({
    where: { userId, completed: false, OR: [{ scope: "daily", periodKey: dk }, { scope: "weekly", periodKey: wk }] },
  });
  const derived = rows.filter(r => BY_KEY[r.missionKey]?.derived === "bounty");
  if (!derived.length) return;
  const b = await crewBounty(worldId, userId);
  for (const r of derived){
    const prog = Math.max(0, b - (r.baseline ?? b));
    const completed = prog >= r.target;
    await prisma.playerMission.update({ where: { id: r.id }, data: { progress: prog, completed } });
    if (completed && r.scope === "daily") await bumpStreak(userId);
  }
}

/** verhoog progress op actieve missies met dit event. Faalt nooit naar de aanroeper. */
export async function bumpMissions(userId: string, worldId: string | null, event: string, amount = 1){
  try {
    await ensureMissions(userId, worldId);
    const dk = dailyKey(), wk = weeklyKey();
    const rows = await prisma.playerMission.findMany({
      where: { userId, completed: false, OR: [{ scope: "daily", periodKey: dk }, { scope: "weekly", periodKey: wk }] },
    });
    for (const r of rows){
      const m = BY_KEY[r.missionKey];
      if (!m || m.event !== event) continue;
      const prog = Math.min(r.target, r.progress + amount);
      const completed = prog >= r.target;
      await prisma.playerMission.update({ where: { id: r.id }, data: { progress: prog, completed } });
      if (completed && r.scope === "daily") await bumpStreak(userId);
    }
  } catch (e) { /* missies mogen een actie nooit blokkeren */ }
}

/* ====================================================================
   Loot-tabellen + reward uitkeren

   Chest-inhoud (server bepaalt dit; de reveal is alleen visueel):
     - elke chest geeft MINSTENS 2 items
     - bronze : 10-50k berries (afgerond 10k) + 10-25 xp [+ soms 3e: bronze role / stamina boost]
     - silver : 50-250k berries (afgerond 50k) + 25-50 xp [+ soms 3e: role/crew/stamina surge]
     - gold   : 250-500k berries (afgerond 50k) + 50-100 xp + GEGARANDEERD een gold role card of crew card
                (+ kleine kans op stamina surge als extra)
   Stamina-items komen als InventoryItem kind:"stamina" met value "Stamina Boost"|"Stamina Surge",
   data.amount = de hoeveelheid cond die ze herstellen (+25 / +50).
   ==================================================================== */
function rint(lo: number, hi: number){ return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function roundTo(n: number, step: number){ return Math.max(step, Math.round(n / step) * step); }
function realPool(){ return PIRATES.filter(p => p && p.r !== "Captain" && p.r !== "Admiral" && p.r !== "Marine" && !p.cap && !p.navy); }

/** roll een crew-pirate; bias naar zwak. `strong` true -> iets sterkere helft (gold). */
function rollCrewPirate(strong = false){
  const pool = realPool().slice().sort((a, b) => (a.p + a.d + a.s) - (b.p + b.d + b.s));   // zwak -> sterk
  if (!pool.length) return null;
  const r = Math.random();
  let idx;
  if (strong) idx = Math.min(pool.length - 1, Math.floor((0.4 + Math.pow(r, 1.4) * 0.6) * pool.length));  // midden-boven
  else        idx = Math.min(pool.length - 1, Math.floor(Math.pow(r, 1.8) * pool.length));                // zwak
  return pool[idx];
}

function roleCard(rarity: string){ return { type:"card", kind:"role_card", value: DECK_ROLES[Math.floor(Math.random() * DECK_ROLES.length)], rarity }; }
function crewCard(strong = false){
  const base = rollCrewPirate(strong);
  if (!base) return { type:"berries", amount: 100000 };   // fallback als de pool leeg is
  return { type:"card", kind:"crew_card", value: base.n, rarity:"crew",
           data: { p: enlist(base.p), d: enlist(base.d), s: enlist(base.s), role: base.r, name: base.n, altRoles: Array.isArray(base.alt) ? base.alt : [] } };
}
function staminaItem(amount: 25 | 50){
  return { type:"stamina", amount, value: amount === 50 ? "Stamina Surge" : "Stamina Boost" };
}

/** rol de inhoud van een chest -> lijst granted-items (altijd >= 2 items) */
function rollChest(tier: "bronze" | "silver" | "gold"){
  const out: any[] = [];

  if (tier === "bronze"){
    out.push({ type:"berries", amount: roundTo(rint(10_000, 50_000), 10_000) });   // 10-50k
    out.push({ type:"xp", amount: rint(10, 25) });
    // soms een 3e: bronze role card of een +25 stamina boost
    const r = Math.random();
    if (r < 0.18) out.push(roleCard("bronze"));
    else if (r < 0.34) out.push(staminaItem(25));

  } else if (tier === "silver"){
    out.push({ type:"berries", amount: roundTo(rint(50_000, 250_000), 50_000) });  // 50-250k
    out.push({ type:"xp", amount: rint(25, 50) });
    // 3e item: 80% role card / 20% (zwakkere) crew card  -- vaak, maar niet gegarandeerd
    const r = Math.random();
    if (r < 0.55){ out.push(Math.random() < 0.80 ? roleCard("silver") : crewCard(false)); }
    else if (r < 0.72){ out.push(staminaItem(50)); }   // anders soms een stamina surge

  } else { // gold
    out.push({ type:"berries", amount: roundTo(rint(250_000, 500_000), 50_000) }); // 250-500k
    out.push({ type:"xp", amount: rint(50, 100) });
    // GEGARANDEERD: 70% gold role card (+12) / 30% crew card (iets sterker)
    out.push(Math.random() < 0.70 ? roleCard("gold") : crewCard(true));
    // kleine kans op een extra stamina surge
    if (Math.random() < 0.20) out.push(staminaItem(50));
  }

  return out;
}

/** keer een reward uit; chests worden meteen geopend (berries/xp direct, kaarten/stamina -> inventory). geeft de granted-lijst terug. */
async function grantReward(userId: string, worldId: string | null, reward: { berries?: number; xp?: number; chest?: any }, source: string){
  const granted: any[] = [];
  const items: any[] = [];
  if (reward.berries) items.push({ type:"berries", amount: reward.berries });
  if (reward.xp)      items.push({ type:"xp", amount: reward.xp });
  if (reward.chest)   items.push(...rollChest(reward.chest));

  let berries = 0, xp = 0;
  const invItems: any[] = [];   // kaarten + stamina -> inventory
  for (const it of items){
    if (it.type === "berries") berries += it.amount;
    else if (it.type === "xp") xp += it.amount;
    else if (it.type === "card") invItems.push({ kind: it.kind, value: it.value, rarity: it.rarity, data: it.data });
    else if (it.type === "stamina") invItems.push({ kind: "stamina", value: it.value, rarity: "stamina", data: { amount: it.amount } });
    granted.push(it);
  }
  if (berries && worldId){
    const mem = await prisma.worldMembership.findFirst({ where: { worldId, userId }, select: { id: true } });
    if (mem) await prisma.worldMembership.update({ where: { id: mem.id }, data: { funds: { increment: berries } } });
  }
  if (xp) await prisma.user.update({ where: { id: userId }, data: { xp: { increment: xp } } });
  for (const c of invItems){
    await prisma.inventoryItem.create({ data: { userId, kind: c.kind, value: c.value, rarity: c.rarity, data: c.data ?? undefined, source } });
  }
  return granted;
}

/* ====================================================================
   Views
   ==================================================================== */
function viewMission(r: any){
  const m = BY_KEY[r.missionKey];
  return { id: r.id, key: r.missionKey, scope: r.scope, difficulty: r.difficulty,
           title: m?.title ?? r.missionKey, desc: m?.desc ?? "", icon: m?.icon ?? "flag",
           target: r.target, progress: r.progress, completed: r.completed, claimed: r.claimed,
           reward: m?.reward ?? {} };
}

const router = Router();

/* GET /api/missions?worldId=... -> { daily, weekly, streak, resets, bonus } */
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const worldId = (req.query.worldId as string) || await pickActiveWorld(userId);
    await ensureMissions(userId, worldId);
    await refreshDerived(userId, worldId);

    const dk = dailyKey(), wk = weeklyKey();
    const all = await prisma.playerMission.findMany({
      where: { userId, OR: [{ scope: "daily", periodKey: dk }, { scope: "weekly", periodKey: wk }] },
    });
    const visible = all.filter(r => r.missionKey !== "_bonus");
    const daily = visible.filter(r => r.scope === "daily").map(viewMission);
    const weekly = visible.filter(r => r.scope === "weekly").map(viewMission);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { missionStreak: true } });

    const bonus = (scope: "daily" | "weekly") => {
      const set = visible.filter(r => r.scope === scope);
      const row = all.find(r => r.scope === scope && r.missionKey === "_bonus");
      return { allDone: set.length > 0 && set.every(r => r.completed), claimed: !!row?.claimed, chest: BONUS[scope].chest };
    };

    res.json({
      worldId, streak: user?.missionStreak ?? 0,
      daily, weekly,
      bonusDaily: bonus("daily"), bonusWeekly: bonus("weekly"),
      resets: { daily: nextDailyResetISO(), weekly: nextWeeklyResetISO() },
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST /api/missions/claim  body { missionId, worldId? } -> { granted, ... } */
router.post("/claim", async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const missionId = String(req.body?.missionId || "");
    const row = await prisma.playerMission.findUnique({ where: { id: missionId } });
    if (!row || row.userId !== userId) return res.status(404).json({ error: "Missie niet gevonden." });
    if (row.missionKey === "_bonus") return res.status(400).json({ error: "Bonus wordt automatisch toegekend." });
    if (!row.completed) return res.status(400).json({ error: "Deze missie is nog niet voltooid." });
    if (row.claimed) return res.status(400).json({ error: "Al geclaimd." });

    const worldId = (req.body?.worldId as string) || row.worldId || await pickActiveWorld(userId);
    const m = BY_KEY[row.missionKey];
    const granted = await grantReward(userId, worldId, m?.reward ?? {}, "mission:" + row.missionKey);
    await prisma.playerMission.update({ where: { id: row.id }, data: { claimed: true } });

    // set-bonus? alle zichtbare in deze scope+periode geclaimd -> chest, eenmalig
    let bonusGranted: any[] | null = null;
    const set = await prisma.playerMission.findMany({ where: { userId, scope: row.scope, periodKey: row.periodKey, missionKey: { not: "_bonus" } } });
    const bonusRow = await prisma.playerMission.findFirst({ where: { userId, scope: row.scope, periodKey: row.periodKey, missionKey: "_bonus" } });
    if (bonusRow && !bonusRow.claimed && set.length > 0 && set.every(s => s.claimed)){
      bonusGranted = await grantReward(userId, worldId, { chest: BONUS[row.scope as "daily" | "weekly"].chest }, "bonus:" + row.scope);
      await prisma.playerMission.update({ where: { id: bonusRow.id }, data: { claimed: true } });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
    res.json({ ok: true, granted, bonusGranted, xp: user?.xp ?? 0 });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export const missionsRouter = router;
export default router;