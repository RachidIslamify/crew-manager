"use strict";

/* ====================================================================
   market.ts — shared transfer market + bot recruiting (online leagues)

   v2: verkopen is nu een LISTING met vraagprijs (askRatio) i.p.v. direct
       cashen. Een gelijst lid blijft in je squad staan en speelt door tot
       iemand het koopt. Echte spelers kopen via de buy-route; AI-crews
       pikken listings op tijdens tickWorldDay (lagere vraagprijs = hogere
       kans). Elke verkoop wordt gelogd in het nieuwe Transfer-model.

   Mount in index.ts:   app.use("/api/online", marketRouter)
   Hook in online.ts:   await seedWorldStart(world.id)  (al gehookt)
   Scheduler:           await tickWorldDay(worldId)      (elke speeldag)

   Routes
   - GET  /leagues/:id/market            -> zichtbaar bord + funds/crew
   - GET  /leagues/:id/squad             -> mijn roster (incl. listingId)
   - GET  /leagues/:id/transfers         -> afgeronde transfers (history)
   - POST /leagues/:id/market/buy        -> koop een listing (systeem of speler)
   - POST /leagues/:id/market/sell       -> zet een lid te koop (listing)
   - POST /leagues/:id/market/cancel     -> haal je eigen listing weg
   - POST /leagues/:id/dev-advance       -> host-only test (dag + tick)

   Prisma (nieuw): MarketListing.sellerId/sellerIsBot/squadMemberId/askRatio,
                   SquadMember.listingId, + Transfer-model.
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";
import { bumpMissions } from "./missions";

/* ---- characterpool (zelfde loader als online.ts) ---- */
const pd: any = require("./data-pirates");
const PIRATES: any[] = pd.PIRATES || pd.default || (global as any).PIRATES || [];

/* ---- ingelogde user (zelfde helper als online.ts) ---- */
function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}

/* ---- tuning ---- */
const STAT_CAP           = 99;
const STAT_FLOOR         = 2;
const MEMBER_START_SCALE = 0.62;
const ROSTER_CAP         = 13;
const MARKET_SIZE        = 12;        // zichtbare SYSTEEM-listings (player-listings komen erbovenop)

const TENURE_MIN         = 2;
const TENURE_MAX         = 3;
const COOLDOWN_MIN       = 2;
const COOLDOWN_MAX       = 3;

const DAY_RAMP           = 3.5;
const TIERS              = [0.82, 1.0, 1.18];
const SALE_CHANCE        = 0.6;
const SALE_MIN           = 0.15, SALE_MAX = 0.30;

const BOT_TARGET_MIN     = 8;
const BOT_TARGET_MAX     = 12;

/* vraagprijs-grenzen voor speler-listings (zelfde range als de slider) */
const ASK_MIN            = 0.75;
const ASK_MAX            = 1.30;

/* ---- tiny RNG (ported from game-core.js) ---- */
function hash(str: string): number { let h = 0; for (let i = 0; i < str.length; i++){ h = (h * 31 + str.charCodeAt(i)) | 0; } return Math.abs(h); }
function seededRng(seed: number){ let a = seed >>> 0; return function(){ a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rint(rnd: () => number, lo: number, hi: number){ return lo + Math.floor(rnd() * (hi - lo + 1)); }

/* ---- stat / price math (ported from game-core.js) ---- */
function clampStat(v: number){ return Math.max(STAT_FLOOR, Math.min(STAT_CAP, Math.round(v))); }
function baseBounty(sum: number){ return Math.max(1, sum) * 1_000_000; }
function enlist(v: number){ return Math.max(STAT_FLOOR, Math.round((v || 0) * MEMBER_START_SCALE)); }
function enlistSum(base: any){ return enlist(base.p) + enlist(base.d) + enlist(base.s); }

function scaleToSum(base: any, targetSum: number){
  const bp = base.p || 1, bd = base.d || 1, bs = base.s || 1;
  const bsum = bp + bd + bs || 3;
  return {
    p: clampStat(targetSum * bp / bsum),
    d: clampStat(targetSum * bd / bsum),
    s: clampStat(targetSum * bs / bsum),
  };
}

/* ---- vraagprijs -> verkoopkans per speeldag (zelfde buckets als de UI) ---- */
function sellChance(ratio: number){
  if (ratio <= 0.86) return 0.90;
  if (ratio <= 1.00) return 0.60;
  if (ratio <= 1.15) return 0.30;
  return 0.10;
}
function clampAsk(r: number){ return Math.max(ASK_MIN, Math.min(ASK_MAX, r || 1)); }

/* ---- league development level ---- */
async function leagueAvgSum(worldId: string): Promise<number> {
  const agg = await prisma.squadMember.aggregate({
    where: { membership: { worldId } },
    _avg: { p: true, d: true, s: true },
    _count: true,
  });
  if (!agg._count) return 0;
  return (agg._avg.p || 0) + (agg._avg.d || 0) + (agg._avg.s || 0);
}
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

/* ---- build one SYSTEM listing row (scaled to the world's level) ---- */
async function makeListingData(worldId: string, base: any, day: number, avgSum: number, rnd: () => number){
  const tier = TIERS[Math.floor(rnd() * TIERS.length)];
  const sum  = listingTargetSum(base, day, avgSum, tier);
  const st   = scaleToSum(base, sum);
  const tenure = rint(rnd, TENURE_MIN, TENURE_MAX);
  const hasSale = rnd() < SALE_CHANCE;
  const saleAt  = hasSale ? Math.max(1, tenure - 1) : null;
  const saleDiscount = hasSale ? (SALE_MIN + rnd() * (SALE_MAX - SALE_MIN)) : 0;
  return {
    worldId, name: base.n, role: base.r, altRoles: Array.isArray(base.alt) ? base.alt : [],
    p: st.p, d: st.d, s: st.s, price: baseBounty(st.p + st.d + st.s),
    listedDay: day, tenure, saleAt, saleDiscount,
    // sellerId/squadMemberId/askRatio blijven null -> dit is een systeem-listing
  };
}

/* ---- fill the visible board up to MARKET_SIZE (alleen systeem-listings tellen) ---- */
async function refillBoard(worldId: string, day: number, rnd: () => number){
  const visible = await prisma.marketListing.count({ where: { worldId, sellerId: null, listedDay: { lte: day } } });
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
    rnd, eager,
    target:     rint(rnd, BOT_TARGET_MIN, BOT_TARGET_MAX),
    startDelay: eager ? 0 : rint(rnd, 1, 2),
    perDay:     eager ? 2 : 1,
    initial:    eager ? rint(rnd, 2, 4) : (rnd() < 0.5 ? 1 : 0),
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
    const taken = await takenNames(worldId);
    const owned = new Set<string>();
    (await prisma.squadMember.findMany({ where: { membership: { worldId } }, select: { name: true } })).forEach(s => owned.add(s.name));
    const pool = realPool()
      .filter(p => !taken.has(p.n) && !owned.has(p.n))
      .map(p => ({ p, cost: baseBounty(enlistSum(p)) }))
      .filter(x => x.cost <= funds)
      .sort((a, b) => a.cost - b.cost);
    if (!pool.length) break;
    const pick = pool[Math.min(pool.length - 1, Math.floor(Math.pow(Math.random(), 1.3) * pool.length))];
    const base = pick.p;
    const st = { p: enlist(base.p), d: enlist(base.d), s: enlist(base.s) };
    await prisma.squadMember.create({ data: {
      membershipId: bot.id, name: base.n, role: base.r,
      altRoles: Array.isArray(base.alt) ? base.alt : [],
      p: st.p, d: st.d, s: st.s, cond: 100, boughtPrice: pick.cost, isGeneric: false,
    }});
    await prisma.marketListing.deleteMany({ where: { worldId, name: base.n, sellerId: null } });   // claim systeem-listing als die er was
    funds -= pick.cost; have++;
  }
  if (funds !== bot.funds) await prisma.worldMembership.update({ where: { id: bot.id }, data: { funds } });
}

/* ====================================================================
   AI-crews kopen speler-listings (vertraagde verkoop "leeft")
   ==================================================================== */
async function resolvePlayerListings(worldId: string, day: number, rnd: () => number){
  const listings = await prisma.marketListing.findMany({ where: { worldId, sellerId: { not: null } } });
  if (!listings.length) return;
  const bots = await prisma.worldMembership.findMany({ where: { worldId, isBot: true } });
  if (!bots.length) return;

  for (const L of listings){
    if (rnd() >= sellChance(L.askRatio ?? 1)) continue;       // vandaag (nog) niet verkocht

    // kies een AI-koper: ruimte + genoeg berries + niet de verkoper zelf
    const eligible: any[] = [];
    for (const b of bots){
      if (b.id === L.sellerId) continue;
      const have = await prisma.squadMember.count({ where: { membershipId: b.id } });
      if (have >= ROSTER_CAP) continue;
      if ((b.funds ?? 0) < L.price) continue;
      eligible.push(b);
    }
    if (!eligible.length) continue;
    const buyer = eligible[Math.floor(rnd() * eligible.length)];

    // verkoper vooraf ophalen (voor mission-bump + bot-funds-cache)
    const seller = await prisma.worldMembership.findUnique({ where: { id: L.sellerId! } });

    const sold = await prisma.$transaction(async (tx) => {
      const fresh = await tx.marketListing.findUnique({ where: { id: L.id } });
      if (!fresh || !fresh.squadMemberId) {
        if (fresh) await tx.marketListing.delete({ where: { id: fresh.id } });
        return false;
      }
      // lid verhuist naar de koper; resale-lock reset
      await tx.squadMember.update({ where: { id: fresh.squadMemberId }, data: {
        membershipId: buyer.id, listingId: null, boughtPrice: fresh.price, boughtDay: day,
      }});
      // verkoper krijgt berries, koper betaalt
      if (seller) await tx.worldMembership.update({ where: { id: seller.id }, data: { funds: seller.funds + fresh.price } });
      const bf = await tx.worldMembership.findUnique({ where: { id: buyer.id } });
      if (bf) await tx.worldMembership.update({ where: { id: buyer.id }, data: { funds: bf.funds - fresh.price } });
      // history
      await tx.transfer.create({ data: {
        worldId, day, name: fresh.name, role: fresh.role,
        buyerId: buyer.id,  buyerName: buyer.crewName,           buyerIsBot: true,
        sellerId: seller?.id ?? null, sellerName: seller?.crewName ?? null, sellerIsBot: !!seller?.isBot,
        price: fresh.price,
      }});
      await tx.marketListing.delete({ where: { id: fresh.id } });
      return true;
    });

    // bots-funds-cache bijwerken zodat dezelfde bot niet boven budget koopt deze tick
    if (sold){
      buyer.funds = (buyer.funds ?? 0) - L.price;
      if (seller && seller.userId) bumpMissions(seller.userId, worldId, "trade").catch(() => {});
    }
  }
}

/* ====================================================================
   Lifecycle: season start + daily tick
   ==================================================================== */
export async function seedMarketBoard(worldId: string){
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) return;
  const day = world.currentDay || 1;
  const rnd = seededRng(hash(worldId + ":seed"));
  await refillBoard(worldId, day, rnd);
}

export async function seedWorldStart(worldId: string){
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) return;
  const day = world.currentDay || 1;
  const rnd = seededRng(hash(worldId + ":seed"));

  const bots = await prisma.worldMembership.findMany({ where: { worldId, isBot: true } });
  for (const bot of bots){
    const plan = botPlan(worldId, bot.captain || bot.crewName);
    await botBuy(worldId, bot, plan.initial, day);
  }
  await refillBoard(worldId, day, rnd);
}

export async function tickWorldDay(worldId: string){
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) return;
  const day = world.currentDay || 1;
  const rnd = seededRng(hash(worldId + ":tick:" + day));

  // 1) afgelopen SYSTEEM-listings van het bord; geparkeerd om sterker terug te komen
  const visible = await prisma.marketListing.findMany({ where: { worldId, sellerId: null, listedDay: { lte: day } } });
  const avg = await leagueAvgSum(worldId);
  for (const L of visible){
    if (day - L.listedDay >= (L.tenure || TENURE_MIN)){
      const base = PIRATES.find(p => p.n === L.name);
      const returnDay = day + rint(rnd, COOLDOWN_MIN, COOLDOWN_MAX);
      if (base){
        const tier = TIERS[Math.floor(rnd() * TIERS.length)];
        const st = scaleToSum(base, listingTargetSum(base, returnDay, avg, tier));
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

  // 2) AI-crews kopen speler-listings (vertraagde verkoop)
  await resolvePlayerListings(worldId, day, rnd);

  // 3) bots bouwen door naar hun target via de systeem-pool
  const bots = await prisma.worldMembership.findMany({ where: { worldId, isBot: true } });
  for (const bot of bots){
    const plan    = botPlan(worldId, bot.captain || bot.crewName);
    const desired = botDesiredByDay(plan, day);
    const have    = await prisma.squadMember.count({ where: { membershipId: bot.id } });
    const buy     = Math.min(plan.perDay, desired - have);
    if (buy > 0){ const fresh = await prisma.worldMembership.findUnique({ where: { id: bot.id } }); if (fresh) await botBuy(worldId, fresh, buy, day); }
  }

  // 4) systeem-bord weer aanvullen
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
  return {
    id: L.id, name: L.name, role: L.role, p: L.p, d: L.d, s: L.s,
    value: L.price, price, onSale: !!onSale,
    sellerId: L.sellerId ?? null, sellerIsBot: !!L.sellerIsBot,
    squadMemberId: L.squadMemberId ?? null,
    askRatio: L.askRatio ?? null, listedDay: L.listedDay,
  };
}

/* GET the visible board + my funds / crew size */
router.get("/leagues/:id/market", async (req: Request, res: Response) => {
  try {
    const worldId = req.params.id;
    const me = await myMembership(worldId, uid(req));
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    const day = world?.currentDay || 1;
    const listings = await prisma.marketListing.findMany({ where: { worldId, listedDay: { lte: day } }, orderBy: { price: "desc" } });

    // verkoper-crewnamen erbij voor speler-listings
    const sellerIds = Array.from(new Set(listings.map(l => l.sellerId).filter(Boolean))) as string[];
    const sellers = sellerIds.length
      ? await prisma.worldMembership.findMany({ where: { id: { in: sellerIds } }, select: { id: true, crewName: true, isBot: true } })
      : [];
    const smap = new Map(sellers.map(s => [s.id, s]));

    res.json({
      day,
      funds: me?.funds ?? 0,
      crewSize: me ? await prisma.squadMember.count({ where: { membershipId: me.id } }) : 0,
      rosterCap: ROSTER_CAP,
      myMembershipId: me?.id ?? null,
      listings: listings.map(L => {
        const v: any = listingView(L);
        if (L.sellerId){
          const s = smap.get(L.sellerId);
          v.sellerName = s?.crewName ?? null;
          v.sellerIsBot = !!s?.isBot;
          v.mine = me ? (L.sellerId === me.id) : false;
        }
        return v;
      }),
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* GET my full roster (incl. listingId zodat de Sell-tab weet wat te koop staat) */
router.get("/leagues/:id/squad", async (req: Request, res: Response) => {
  try {
    const me = await myMembership(req.params.id, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });
    const squad = await prisma.squadMember.findMany({ where: { membershipId: me.id }, orderBy: { createdAt: "asc" } });
    res.json({
      crewName: me.crewName, captain: me.captain, funds: me.funds,
      captainStats: { p: me.capP, d: me.capD, s: me.capS, cond: me.capCond },
      rosterCap: ROSTER_CAP, squad,
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* GET transfer history (nieuwste boven, per speeldag te groeperen door de client) */
router.get("/leagues/:id/transfers", async (req: Request, res: Response) => {
  try {
    const worldId = req.params.id;
    const me = await myMembership(worldId, uid(req));
    const transfers = await prisma.transfer.findMany({
      where: { worldId },
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
      take: 60,
    });
    res.json({ myMembershipId: me?.id ?? null, transfers });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST buy a listing (systeem OF speler). Atomic claim. */
router.post("/leagues/:id/market/buy", async (req: Request, res: Response) => {
  try {
    const worldId = req.params.id;
    const listingId = String(req.body?.listingId || "");
    const me = await myMembership(worldId, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });
    if (await prisma.squadMember.count({ where: { membershipId: me.id } }) >= ROSTER_CAP)
      return res.status(400).json({ error: "Je bemanning zit vol (13/13). Verkoop eerst iemand." });

    const member = await prisma.$transaction(async (tx) => {
      const L = await tx.marketListing.findUnique({ where: { id: listingId } });
      if (!L || L.worldId !== worldId) throw Object.assign(new Error("Dit lid staat niet meer op de markt."), { status: 409 });
      if (L.sellerId && L.sellerId === me.id) throw Object.assign(new Error("Dit is je eigen listing."), { status: 400 });

      const price = (L.saleAt != null && L.saleDiscount) ? Math.round(L.price * (1 - L.saleDiscount) / 1e6) * 1e6 : L.price;
      const fresh = await tx.worldMembership.findUnique({ where: { id: me.id } });
      if (!fresh || fresh.funds < price) throw Object.assign(new Error("Niet genoeg Berries."), { status: 400 });

      const claimed = await tx.marketListing.deleteMany({ where: { id: listingId } });
      if (claimed.count === 0) throw Object.assign(new Error("Iemand was je net voor."), { status: 409 });

      await tx.worldMembership.update({ where: { id: me.id }, data: { funds: fresh.funds - price } });
      const w = await tx.world.findUnique({ where: { id: worldId } });
      const today = w?.currentDay ?? 1;

      let member;
      if (L.sellerId && L.squadMemberId){
        // speler/AI-listing: bestaand lid verhuist naar mij, verkoper krijgt berries
        member = await tx.squadMember.update({ where: { id: L.squadMemberId }, data: {
          membershipId: me.id, listingId: null, boughtPrice: price, boughtDay: today,
        }});
        const seller = await tx.worldMembership.findUnique({ where: { id: L.sellerId } });
        if (seller) await tx.worldMembership.update({ where: { id: seller.id }, data: { funds: seller.funds + price } });
        await tx.transfer.create({ data: {
          worldId, day: today, name: L.name, role: L.role,
          buyerId: me.id, buyerName: fresh.crewName, buyerIsBot: false,
          sellerId: seller?.id ?? null, sellerName: seller?.crewName ?? null, sellerIsBot: !!seller?.isBot,
          price,
        }});
        if (seller && seller.userId) bumpMissions(seller.userId, worldId, "trade").catch(() => {});
      } else {
        // systeem / free agent
        member = await tx.squadMember.create({ data: {
          membershipId: me.id, name: L.name, role: L.role, altRoles: L.altRoles,
          p: L.p, d: L.d, s: L.s, cond: 100, boughtPrice: price, isGeneric: false, boughtDay: today,
        }});
        await tx.transfer.create({ data: {
          worldId, day: today, name: L.name, role: L.role,
          buyerId: me.id, buyerName: fresh.crewName, buyerIsBot: false,
          sellerId: null, sellerName: null, sellerIsBot: false, price,
        }});
      }
      return member;
    });

    bumpMissions(uid(req), worldId, "trade").catch(() => {});
    res.json({ ok: true, member });
  } catch (e: any) {
    res.status(e.status || 409).json({ error: e.message || "Kopen mislukt." });
  }
});

/* POST sell = zet een lid te koop met een vraagprijs (listing). Het lid blijft
   in je squad en speelt door tot iemand het koopt. */
router.post("/leagues/:id/market/sell", async (req: Request, res: Response) => {
  try {
    const worldId = req.params.id;
    const squadMemberId = String(req.body?.squadMemberId || "");
    const askRatio = clampAsk(Number(req.body?.askRatio));
    const me = await myMembership(worldId, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    const m = await prisma.squadMember.findUnique({ where: { id: squadMemberId } });
    if (!m || m.membershipId !== me.id) return res.status(404).json({ error: "Dit bemanningslid is niet van jou." });
    if (m.listingId) return res.status(400).json({ error: "Dit lid staat al te koop." });

    const world = await prisma.world.findUnique({ where: { id: worldId } });
    const today = world?.currentDay ?? 1;
    if (m.boughtDay != null && today <= m.boughtDay)
      return res.status(400).json({ error: "Dit lid kun je nog niet verkopen \u2014 wacht tot na de volgende speeldag." });

    const value = baseBounty(m.p + m.d + m.s);
    const price = Math.max(1_000_000, Math.round(value * askRatio / 1e6) * 1e6);

    const listing = await prisma.$transaction(async (tx) => {
      const L = await tx.marketListing.create({ data: {
        worldId, name: m.name, role: m.role, altRoles: m.altRoles,
        p: m.p, d: m.d, s: m.s, price,
        listedDay: today, tenure: 9999, saleAt: null, saleDiscount: 0,
        sellerId: me.id, sellerIsBot: false, squadMemberId: m.id, askRatio,
      }});
      await tx.squadMember.update({ where: { id: m.id }, data: { listingId: L.id } });
      return L;
    });

    res.json({ ok: true, listingId: listing.id, price, askRatio });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST cancel = haal je eigen listing weg, lid blijft gewoon in je squad */
router.post("/leagues/:id/market/cancel", async (req: Request, res: Response) => {
  try {
    const worldId = req.params.id;
    const listingId = String(req.body?.listingId || "");
    const me = await myMembership(worldId, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    const L = await prisma.marketListing.findUnique({ where: { id: listingId } });
    if (!L || L.worldId !== worldId) return res.status(404).json({ error: "Listing niet gevonden." });
    if (L.sellerId !== me.id) return res.status(403).json({ error: "Dit is niet jouw listing." });

    await prisma.$transaction(async (tx) => {
      if (L.squadMemberId) await tx.squadMember.updateMany({ where: { id: L.squadMemberId }, data: { listingId: null } });
      await tx.marketListing.deleteMany({ where: { id: L.id } });
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST dev-advance: host-only test tool (dag + markt-tick). */
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