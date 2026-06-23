"use strict";

/* ====================================================================
   market.ts — shared transfer market + bot recruiting (online leagues)

   Mount in index.ts:   app.use("/api/online", marketRouter)
                        (zet dezelfde auth-middleware ervoor als bij online.ts,
                         als die op mount-niveau wordt toegepast)
   Hook in online.ts:   await seedWorldStart(world.id)  aan het eind van
                        closeAndFill  (al toegevoegd).
   Scheduler (brok 4):  await tickWorldDay(worldId)  elke speeldag.

   Notes
   - Leest de characterpool uit data-pirates.js, net als online.ts.
   - Markt = MarketListing-rijen (1 rij per listing) zodat twee spelers nooit
     hetzelfde lid kunnen kopen (de koop claimt de rij atomair).
   - "listedDay" is tevens "beschikbaar-vanaf-dag": een afgekoeld lid wordt
     geparkeerd met listedDay in de toekomst en komt sterker terug.
   - Roster-cap voor SPELERS volgt de schip-tier (rosterCapForTier). Bots
     houden hun eigen vaste bovengrens (ROSTER_CAP) — zij kennen geen schepen.
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";
import { bumpMissions } from "./missions";
import { rosterCapForTier } from "./config/shipTiers";

/* ---- characterpool (zelfde loader als online.ts) ---- */
const pd: any = require("../../crew-manager/data-pirates.js");
const PIRATES: any[] = pd.PIRATES || pd.default || (global as any).PIRATES || [];

/* ---- ingelogde user (zelfde helper als online.ts) ---- */
function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}

/* ---- tuning ---- */
const STAT_CAP          = 99;
const STAT_FLOOR        = 2;
const MEMBER_START_SCALE = 0.62;     // recruits enter below their data potential
const ROSTER_CAP        = 13;        // BOT-bovengrens (spelers volgen de schip-tier)
const MARKET_SIZE       = 12;        // visible listings on the board at once

const TENURE_MIN        = 2;         // days a listing stays before it cycles off
const TENURE_MAX        = 3;
const COOLDOWN_MIN      = 2;         // days off the board before it returns (stronger)
const COOLDOWN_MAX      = 3;

const DAY_RAMP          = 3.5;       // market stat-sum keeps pace with crew growth (~+3.5/day)
const TIERS             = [0.82, 1.0, 1.18];   // bargain / average / premium spread
const SALE_CHANCE       = 0.6;       // share of listings that get a discount on their last day
const SALE_MIN          = 0.15, SALE_MAX = 0.30;

const BOT_TARGET_MIN    = 8;         // bots build toward a near-full crew
const BOT_TARGET_MAX    = 12;

/* ---- tiny RNG (ported from game-core.js) ---- */
function hash(str: string): number { let h = 0; for (let i = 0; i < str.length; i++){ h = (h * 31 + str.charCodeAt(i)) | 0; } return Math.abs(h); }
function seededRng(seed: number){ let a = seed >>> 0; return function(){ a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rint(rnd: () => number, lo: number, hi: number){ return lo + Math.floor(rnd() * (hi - lo + 1)); }

/* ---- stat / price math (ported from game-core.js) ---- */
function clampStat(v: number){ return Math.max(STAT_FLOOR, Math.min(STAT_CAP, Math.round(v))); }
function baseBounty(sum: number){ return Math.max(1, sum) * 1_000_000; }
function enlist(v: number){ return Math.max(STAT_FLOOR, Math.round((v || 0) * MEMBER_START_SCALE)); }
function enlistSum(base: any){ return enlist(base.p) + enlist(base.d) + enlist(base.s); }

/* distribute a target stat-sum across p/d/s, keeping the character's profile */
function scaleToSum(base: any, targetSum: number){
  const bp = base.p || 1, bd = base.d || 1, bs = base.s || 1;
  const bsum = bp + bd + bs || 3;
  return {
    p: clampStat(targetSum * bp / bsum),
    d: clampStat(targetSum * bd / bsum),
    s: clampStat(targetSum * bs / bsum),
  };
}

/* ---- "most recent 19:00 Europe/Amsterdam", used for the resale lock ---- */
function amsOffsetMinutes(d: Date): number {
  const ams = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((ams.getTime() - utc.getTime()) / 60000);
}
function lastMatchdayMoment(): Date {
  const now = new Date();
  const off = amsOffsetMinutes(now);
  const ams = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
  let boundary = Date.UTC(ams.getFullYear(), ams.getMonth(), ams.getDate(), 19, 0, 0) - off * 60000;
  if (boundary > now.getTime()) boundary -= 24 * 3600 * 1000;   // before today's 19:00 -> use yesterday's
  return new Date(boundary);
}

/* ---- league development level (so listings keep pace with the crews) ---- */
async function leagueAvgSum(worldId: string): Promise<number> {
  const agg = await prisma.squadMember.aggregate({
    where: { membership: { worldId } },
    _avg: { p: true, d: true, s: true },
    _count: true,
  });
  if (!agg._count) return 0;
  return (agg._avg.p || 0) + (agg._avg.d || 0) + (agg._avg.s || 0);
}
/* the stat-sum a fresh listing should land on for a given day + tier */
function listingTargetSum(base: any, day: number, avgSum: number, tier: number){
  const dayEstimate = enlistSum(base) + Math.max(0, day - 1) * DAY_RAMP;
  const level = Math.max(avgSum, dayEstimate);
  return Math.round(level * tier);
}

/* ---- who can still be listed / bought in this world ---- */
async function takenNames(worldId: string): Promise<Set<string>> {
  const taken = new Set<string>();
  const ms = await prisma.worldMembership.findMany({ where: { worldId }, select: { captain: true, squad: { select: { name: true } } } });
  ms.forEach(m => { if (m.captain) taken.add(m.captain); m.squad.forEach(s => taken.add(s.name)); });
  const listed = await prisma.marketListing.findMany({ where: { worldId }, select: { name: true } });
  listed.forEach(l => taken.add(l.name));
  return taken;
}
function realPool(){
  return PIRATES.filter(p => p && p.r !== "Captain" && !p.cap && !p.navy);
}

/* ---- build one listing row (scaled to the world's level) ---- */
async function makeListingData(worldId: string, base: any, day: number, avgSum: number, rnd: () => number){
  const tier = TIERS[Math.floor(rnd() * TIERS.length)];
  const sum  = listingTargetSum(base, day, avgSum, tier);
  const st   = scaleToSum(base, sum);
  const tenure = rint(rnd, TENURE_MIN, TENURE_MAX);
  const hasSale = rnd() < SALE_CHANCE;
  const saleAt  = hasSale ? Math.max(1, tenure - 1) : null;   // discount on the last day
  const saleDiscount = hasSale ? (SALE_MIN + rnd() * (SALE_MAX - SALE_MIN)) : 0;
  return {
    worldId, name: base.n, role: base.r, altRoles: Array.isArray(base.alt) ? base.alt : [],
    p: st.p, d: st.d, s: st.s, price: baseBounty(st.p + st.d + st.s),
    listedDay: day, tenure, saleAt, saleDiscount,
  };
}

/* ---- fill the visible board up to MARKET_SIZE ---- */
async function refillBoard(worldId: string, day: number, rnd: () => number){
  const visible = await prisma.marketListing.count({ where: { worldId, listedDay: { lte: day } } });
  let need = MARKET_SIZE - visible;
  if (need <= 0) return;
  const taken = await takenNames(worldId);
  const pool  = realPool().filter(p => !taken.has(p.n));
  for (let i = pool.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  const avg = await leagueAvgSum(worldId);
  const rows: any[] = [];
  for (const base of pool){ if (need <= 0) break; rows.push(await makeListingData(worldId, base, day, avg, rnd)); need--; }
  if (rows.length) await prisma.marketListing.createMany({ data: rows });
}

/* ====================================================================
   Bots: eager vs steady recruiting (real characters from the pool)
   ==================================================================== */
function botPlan(worldId: string, captain: string){
  const rnd = seededRng(hash(worldId + ":bot:" + captain));
  const eager = rnd() < 0.5;
  return {
    rnd,
    eager,
    target:    rint(rnd, BOT_TARGET_MIN, BOT_TARGET_MAX),
    startDelay: eager ? 0 : rint(rnd, 1, 2),     // steady crews start a day or two later
    perDay:    eager ? 2 : 1,                     // eager crews build faster
    initial:   eager ? rint(rnd, 2, 4) : (rnd() < 0.5 ? 1 : 0),
  };
}
function botDesiredByDay(plan: any, day: number){
  return Math.min(plan.target, plan.initial + Math.max(0, day - plan.startDelay) * plan.perDay);
}
/* a bot signs `count` cheap-but-affordable real characters from the pool */
async function botBuy(worldId: string, bot: any, count: number, _day: number){
  if (count <= 0) return;
  let funds = bot.funds;
  let have  = await prisma.squadMember.count({ where: { membershipId: bot.id } });
  for (let i = 0; i < count; i++){
    if (have >= ROSTER_CAP) break;
    const taken = await takenNames(worldId);                       // refreshed each pick (avoids clashes)
    const owned = new Set<string>();
    (await prisma.squadMember.findMany({ where: { membership: { worldId } }, select: { name: true } })).forEach(s => owned.add(s.name));
    const pool = realPool()
      .filter(p => !taken.has(p.n) && !owned.has(p.n))
      .map(p => ({ p, cost: baseBounty(enlistSum(p)) }))
      .filter(x => x.cost <= funds)
      .sort((a, b) => a.cost - b.cost);                            // cheapest first: fill the crew, don't blow it on a star
    if (!pool.length) break;
    const pick = pool[Math.min(pool.length - 1, Math.floor(Math.pow(Math.random(), 1.3) * pool.length))];
    const base = pick.p;
    const st = { p: enlist(base.p), d: enlist(base.d), s: enlist(base.s) };
    await prisma.squadMember.create({ data: {
      membershipId: bot.id, name: base.n, role: base.r,
      altRoles: Array.isArray(base.alt) ? base.alt : [],
      p: st.p, d: st.d, s: st.s, cond: 100, boughtPrice: pick.cost, isGeneric: false,
    }});
    await prisma.marketListing.deleteMany({ where: { worldId, name: base.n } });   // claim off the board if listed
    funds -= pick.cost; have++;
  }
  if (funds !== bot.funds) await prisma.worldMembership.update({ where: { id: bot.id }, data: { funds } });
}

/* ====================================================================
   Lifecycle: season start + daily tick
   ==================================================================== */

   /* Vul de markt zodra een league is aangemaakt (dag 0 = voorbereiding),
   zodat spelers meteen crew kunnen kopen. Nog geen bots — die komen pas
   bij het sluiten van de werving. */
export async function seedMarketBoard(worldId: string){
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) return;
  const day = world.currentDay || 1;
  const rnd = seededRng(hash(worldId + ":seed"));
  await refillBoard(worldId, day, rnd);
}

/* Called ONCE when recruiting closes (gehookt in online.ts closeAndFill). */
export async function seedWorldStart(worldId: string){
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) return;
  const day = world.currentDay || 1;
  const rnd = seededRng(hash(worldId + ":seed"));

  // 1) eager / steady bots draften hun openingssquad
  const bots = await prisma.worldMembership.findMany({ where: { worldId, isBot: true } });
  for (const bot of bots){
    const plan = botPlan(worldId, bot.captain || bot.crewName);
    await botBuy(worldId, bot, plan.initial, day);
  }

  // 2) vul de openingsmarkt
  await refillBoard(worldId, day, rnd);
}

/* Called each game day (door de scheduler in brok 4, of dev-advance hieronder). */
export async function tickWorldDay(worldId: string){
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) return;
  const day = world.currentDay || 1;
  const rnd = seededRng(hash(worldId + ":tick:" + day));

  // 1) afgelopen listings van het bord halen; geparkeerd om sterker terug te komen
  const visible = await prisma.marketListing.findMany({ where: { worldId, listedDay: { lte: day } } });
  const avg = await leagueAvgSum(worldId);
  for (const L of visible){
    if (day - L.listedDay >= (L.tenure || TENURE_MIN)){
      const base = PIRATES.find(p => p.n === L.name);
      const returnDay = day + rint(rnd, COOLDOWN_MIN, COOLDOWN_MAX);
      if (base){
        const tier = TIERS[Math.floor(rnd() * TIERS.length)];
        const st = scaleToSum(base, listingTargetSum(base, returnDay, avg, tier));   // comes back trained-up
        await prisma.marketListing.update({ where: { id: L.id }, data: {
          listedDay: returnDay, p: st.p, d: st.d, s: st.s,
          price: baseBounty(st.p + st.d + st.s),
          tenure: rint(rnd, TENURE_MIN, TENURE_MAX), saleAt: null, saleDiscount: 0,
        }});
      } else {
        await prisma.marketListing.delete({ where: { id: L.id } });
      }
    }
  }

  // 2) bots bouwen door naar hun target, gespreid over de dagen
  const bots = await prisma.worldMembership.findMany({ where: { worldId, isBot: true } });
  for (const bot of bots){
    const plan    = botPlan(worldId, bot.captain || bot.crewName);
    const desired = botDesiredByDay(plan, day);
    const have    = await prisma.squadMember.count({ where: { membershipId: bot.id } });
    const buy     = Math.min(plan.perDay, desired - have);
    if (buy > 0){ const fresh = await prisma.worldMembership.findUnique({ where: { id: bot.id } }); if (fresh) await botBuy(worldId, fresh, buy, day); }
  }

  // 3) bord weer aanvullen
  await refillBoard(worldId, day, rnd);
}

/* ====================================================================
   Routes
   ==================================================================== */
const router = Router();

async function myMembership(worldId: string, userId: string){
  return prisma.worldMembership.findFirst({ where: { worldId, userId } });
}
function listingView(L: any){
  const onSale = L.saleAt != null && L.saleDiscount;
  const price = onSale ? Math.round(L.price * (1 - L.saleDiscount) / 1e6) * 1e6 : L.price;
  return { id: L.id, name: L.name, role: L.role, p: L.p, d: L.d, s: L.s, value: L.price, price, onSale: !!onSale };
}

/* GET the visible board + my funds / crew size */
router.get("/leagues/:id/market", async (req: Request, res: Response) => {
  try {
    const me = await myMembership(req.params.id, uid(req));
    const world = await prisma.world.findUnique({ where: { id: req.params.id } });
    const day = world?.currentDay || 1;
    const listings = await prisma.marketListing.findMany({ where: { worldId: req.params.id, listedDay: { lte: day } }, orderBy: { price: "desc" } });
    res.json({
      day,
      funds: me?.funds ?? 0,
      crewSize: me ? await prisma.squadMember.count({ where: { membershipId: me.id } }) : 0,
      rosterCap: me ? rosterCapForTier(me.shipTier) : rosterCapForTier(1),
      listings: listings.map(listingView),
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST buy a listing (atomic claim so two players can't grab the same name) */
router.post("/leagues/:id/market/buy", async (req: Request, res: Response) => {
  try {
    const worldId = req.params.id;
    const listingId = String(req.body?.listingId || "");
    const me = await myMembership(worldId, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });
    const cap = rosterCapForTier(me.shipTier);
    if (await prisma.squadMember.count({ where: { membershipId: me.id } }) >= cap)
      return res.status(400).json({ error: `Je bemanning zit vol (${cap}/${cap}). Upgrade je schip of verkoop eerst iemand.` });

    const member = await prisma.$transaction(async (tx) => {
      const L = await tx.marketListing.findUnique({ where: { id: listingId } });
      if (!L || L.worldId !== worldId) throw Object.assign(new Error("Dit lid staat niet meer op de markt."), { status: 409 });
      const price = L.saleAt != null && L.saleDiscount ? Math.round(L.price * (1 - L.saleDiscount) / 1e6) * 1e6 : L.price;
      const fresh = await tx.worldMembership.findUnique({ where: { id: me.id } });
      if (!fresh || fresh.funds < price) throw Object.assign(new Error("Niet genoeg Berries."), { status: 400 });
      const claimed = await tx.marketListing.deleteMany({ where: { id: listingId } });
      if (claimed.count === 0) throw Object.assign(new Error("Iemand was je net voor."), { status: 409 });
      await tx.worldMembership.update({ where: { id: me.id }, data: { funds: fresh.funds - price } });
      return tx.squadMember.create({ data: {
        membershipId: me.id, name: L.name, role: L.role, altRoles: L.altRoles,
        p: L.p, d: L.d, s: L.s, cond: 100, boughtPrice: price, isGeneric: false,
      }});
    });
    bumpMissions(uid(req), worldId, "trade").catch(() => {});
    res.json({ ok: true, member });
  } catch (e: any) {
    res.status(e.status || 409).json({ error: e.message || "Kopen mislukt." });
  }
});

/* POST sell one of my members (blocked until they've played a matchday) */
router.post("/leagues/:id/market/sell", async (req: Request, res: Response) => {
  try {
    const worldId = req.params.id;
    const squadMemberId = String(req.body?.squadMemberId || "");
    const me = await myMembership(worldId, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    const m = await prisma.squadMember.findUnique({ where: { id: squadMemberId } });
    if (!m || m.membershipId !== me.id) return res.status(404).json({ error: "Dit bemanningslid is niet van jou." });
    if (m.createdAt > lastMatchdayMoment())
      return res.status(400).json({ error: "Dit lid kun je nog niet verkopen \u2014 het heeft nog geen speeldag voor je gespeeld." });

    const value = baseBounty(m.p + m.d + m.s);   // sell at current value
    await prisma.$transaction([
      prisma.squadMember.delete({ where: { id: m.id } }),
      prisma.worldMembership.update({ where: { id: me.id }, data: { funds: me.funds + value } }),
    ]);
    bumpMissions(uid(req), worldId, "trade").catch(() => {});
    res.json({ ok: true, value });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* GET my full roster (for the crew screen) */
router.get("/leagues/:id/squad", async (req: Request, res: Response) => {
  try {
    const me = await myMembership(req.params.id, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });
    const squad = await prisma.squadMember.findMany({ where: { membershipId: me.id }, orderBy: { createdAt: "asc" } });
    res.json({
      crewName: me.crewName, captain: me.captain, funds: me.funds,
      captainStats: { p: me.capP, d: me.capD, s: me.capS, cond: me.capCond },
      rosterCap: rosterCapForTier(me.shipTier), squad,
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST dev-advance: host-only test tool. Bumps the game day + runs the market
   tick so you can watch listings rotate + grow before the real scheduler lands.
   (Brok 4 vervangt dit met de 19:00-scheduler die OOK de wedstrijd uitrekent.) */
router.post("/leagues/:id/dev-advance", async (req: Request, res: Response) => {
  try {
    const me = uid(req);
    const world = await prisma.world.findUnique({ where: { id: req.params.id } });
    if (!world) return res.status(404).json({ error: "Wereld niet gevonden." });
    if (world.hostId && world.hostId !== me) return res.status(403).json({ error: "Alleen de host kan dit." });
    const nextDay = (world.currentDay || 1) + 1;
    await prisma.world.update({ where: { id: req.params.id }, data: { currentDay: nextDay } });
    await tickWorldDay(req.params.id);
    res.json({ ok: true, day: nextDay });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export const marketRouter = router;