// ============================================================================
//  online.ts  —  Grand Line-instanties (crews op de server)
//  Plek:  server/src/online.ts   (naast worlds.ts, admin.ts, market.ts, engine.ts)
// ----------------------------------------------------------------------------
//  Afgestemd op JOUW schema: World.status = "open" | "active" | "finished",
//  World.maxPlayers (12), World.currentDay/totalDays/recruitsUntil/hostId,
//  WorldMembership.captain/isBot/squad (en userId optioneel).
//
//  BROK 4-wijziging: bij het sluiten van de werving zet de wereld nu op
//  dag 0 (= voorbereidingsdag) met een 30-dagen eilandenkalender, in plaats
//  van een korte round-robin. De motor (engine.ts) bouwt de kalender en de
//  scheduler (scheduler.ts) draait vanaf de eerste 19:00 de speeldagen.
// ============================================================================

import { Router, Request, Response } from 'express';
import { prisma } from './prisma';
import { seedWorldStart, seedMarketBoard } from './market';   // markt + bot-squads
import { buildSeasonCalendar } from './engine';     // 30-dagen eilandenkalender

const { PIRATES } = require("./data-pirates");

const onlineRouter = Router();

const LEAGUE_NAME   = "The Grand Line";
const LEAGUE_SIZE   = 12;
const RECRUIT_HOURS = 24;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}

// 8/8/8-kapiteins: alle r:"Captain" + iedereen met cap:true (Loki, Crocodile, Hancock, Dragon)
function captainPool(): string[] {
  return PIRATES.filter((p: any) => p.r === "Captain" || p.cap === true).map((p: any) => p.n);
}
// crewnaam afgeleid uit data-pirates.js: het c-veld van de kapitein.
// "Free Agent"-kapiteins (Loki/Crocodile/Hancock/Dragon) hebben geen eigen
// crew in de data -> nette fallback op "<kapitein>'s Crew".
function crewNameFor(captain: string): string {
  const p = PIRATES.find((x: any) => x.n === captain);
  const crew = p?.c;
  return crew && crew !== "Free Agent" ? crew : `${captain}'s Crew`;
}

async function startingFunds(): Promise<number> {
  const g = await prisma.globalSettings.findUnique({ where: { id: "global" } });
  return g?.startingFunds ?? 30000000;
}

function makeCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return "GRD-" + a[Math.floor(Math.random() * a.length)] + (100 + Math.floor(Math.random() * 900));
}

// welke kapiteins zijn al bezet in een league (naam -> crewnaam)
async function takenCaptains(worldId: string): Promise<Map<string, string>> {
  const members = await prisma.worldMembership.findMany({
    where: { worldId },
    select: { captain: true, crewName: true },
  });
  const map = new Map<string, string>();
  members.forEach(m => { if (m.captain) map.set(m.captain, m.crewName); });
  return map;
}

// werving sluiten: AI-crews aanvullen tot maxPlayers + dag 0 (voorbereiding) +
// 30-dagen eilandenkalender + markt seeden + status -> active
async function closeAndFill(worldId: string) {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    include: { memberships: true },
  });
  if (!world || world.status !== "open") return world;

  const funds   = await startingFunds();
  const usedCap = new Set(world.memberships.map(m => m.captain).filter(Boolean) as string[]);
  const freeCap = captainPool().filter(c => !usedCap.has(c)); // genoeg: 14 kapiteins, max 12 crews

  const need = Math.max(0, world.maxPlayers - world.memberships.length);
  for (let i = 0; i < need; i++) {
    const cap = freeCap[i];
    await prisma.worldMembership.create({
      data: {
        worldId,
        userId:   null,                 // bot -> geen user (userId is optioneel)
        isBot:    true,
        crewName: crewNameFor(cap),     // crewnaam uit data-pirates.js (c-veld van de kapitein)
        captain:  cap,                  // distinct vrije kapitein per bot
        funds,
      },
    });
  }

  // status actief, op dag 0 = voorbereidingsdag (eerste 19:00 -> dag 1, eerste speeldag)
  const updated = await prisma.world.update({
    where: { id: worldId },
    data:  { status: "active", currentDay: 0, totalDays: 30 },
  });

  // 30-dagen eilandenkalender (normale dagen krijgen fixtures; navy/rust/finale niet)
  await buildSeasonCalendar(worldId);

  // markt vullen + bots hun openingssquad geven (precies één keer, bij de start)
  await seedWorldStart(worldId);

  return updated;
}

// werving voorbij maar nog niet gevuld? -> nu vullen (lazy; de scheduler neemt het daarna over)
async function ensureClosed(w: { id: string; status: string; recruitsUntil: Date | null }) {
  if (w.status === "open" && w.recruitsUntil && w.recruitsUntil <= new Date()) {
    await closeAndFill(w.id);
  }
}

// ---------------------------------------------------------------------------
// endpoints
// ---------------------------------------------------------------------------

// algemene kapiteinslijst (8/8/8) — zonder league-context
onlineRouter.get("/captains", (_req: Request, res: Response) => {
  res.json(captainPool().map(n => ({ name: n, p: 8, d: 8, s: 8 })));
});

// kapiteinslijst voor een specifieke league: markeer wie al bezet is
onlineRouter.get("/leagues/:id/captains", async (req: Request, res: Response) => {
  const taken = await takenCaptains(req.params.id);
  res.json(captainPool().map(n => ({
    name: n, p: 8, d: 8, s: 8,
    taken: taken.has(n),
    by: taken.get(n) ?? null,
  })));
});

// start een eigen Grand Line-instantie
onlineRouter.post("/leagues", async (req: Request, res: Response) => {
  try {
    const me = uid(req);
    let code = makeCode();
    for (let i = 0; i < 5; i++) {
      const ex = await prisma.world.findUnique({ where: { joinCode: code } });
      if (!ex) break;
      code = makeCode();
    }
    const world = await prisma.world.create({
      data: {
        name: LEAGUE_NAME,
        status: "open",
        maxPlayers: LEAGUE_SIZE,
        joinCode: code,
        recruitsUntil: new Date(Date.now() + RECRUIT_HOURS * 3600 * 1000),
        hostId: me,
      },
    });
    await seedMarketBoard(world.id);
    res.json({ id: world.id, code: world.joinCode, recruitsUntil: world.recruitsUntil });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// league opzoeken op code (om te joinen / te delen)
onlineRouter.get("/leagues/by-code/:code", async (req: Request, res: Response) => {
  const world = await prisma.world.findUnique({ where: { joinCode: req.params.code.toUpperCase() } });
  if (!world) return res.status(404).json({ error: "Geen league met die code." });
  await ensureClosed(world);
  res.json({ id: world.id, name: world.name, status: world.status });
});

// inschrijven: kapitein + crewnaam
onlineRouter.post("/leagues/:id/signon", async (req: Request, res: Response) => {
  try {
    const me = uid(req);
    const { captain, crewName } = req.body || {};
    const world = await prisma.world.findUnique({ where: { id: req.params.id }, include: { memberships: true } });
    if (!world) return res.status(404).json({ error: "League bestaat niet." });
    await ensureClosed(world);
    if (world.status !== "open")                            return res.status(400).json({ error: "De werving is gesloten." });
    if (world.memberships.some(m => m.userId === me))       return res.status(400).json({ error: "Je doet al mee in deze league." });
    if (world.memberships.length >= world.maxPlayers)       return res.status(400).json({ error: "Deze league zit vol." });
    if (!captainPool().includes(captain))                   return res.status(400).json({ error: "Onbekende kapitein." });
    if (world.memberships.some(m => m.captain === captain))  return res.status(400).json({ error: "Die kapitein is al gekozen door een andere crew." });

    const name  = String(crewName || "").trim().slice(0, 40) || "New Crew";
    const funds = await startingFunds();
    try {
      const mem = await prisma.worldMembership.create({
        data: { worldId: world.id, userId: me, isBot: false, crewName: name, captain, funds },
      });
      res.json({ membershipId: mem.id });
    } catch (err: any) {
      if (err.code === "P2002") return res.status(409).json({ error: "Die kapitein is net door een andere crew gekozen." });
      throw err;
    }
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// host kan het seizoen meteen starten (optioneel; anders automatisch na 24u)
onlineRouter.post("/leagues/:id/start", async (req: Request, res: Response) => {
  try {
    const me = uid(req);
    const world = await prisma.world.findUnique({ where: { id: req.params.id } });
    if (!world) return res.status(404).json({ error: "League bestaat niet." });
    if (world.hostId && world.hostId !== me) return res.status(403).json({ error: "Alleen de host kan starten." });
    const updated = await closeAndFill(world.id);
    res.json({ status: updated?.status });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// lobby + ranglijst
onlineRouter.get("/leagues/:id", async (req: Request, res: Response) => {
  const world = await prisma.world.findUnique({ where: { id: req.params.id } });
  if (!world) return res.status(404).json({ error: "League bestaat niet." });
  await ensureClosed(world);
  const members = await prisma.worldMembership.findMany({
    where: { worldId: world.id },
    include: { user: { select: { username: true, email: true } } },
    orderBy: [{ points: "desc" }, { won: "desc" }, { crewName: "asc" }],
  });
  res.json({
    id: world.id, name: world.name, code: world.joinCode, status: world.status,
    maxPlayers: world.maxPlayers, recruitsUntil: world.recruitsUntil, hostId: world.hostId,
    currentDay: world.currentDay, totalDays: world.totalDays,
    bracket: (world as any).bracket ?? null,
    crews: members.map(m => ({
      id: m.id, crewName: m.crewName, captain: m.captain, isBot: m.isBot,
      manager: m.isBot ? "AI" : (m.user?.username || m.user?.email || "Manager"),
      played: m.played, won: m.won, drawn: m.drawn, lost: m.lost, points: m.points,
    })),
  });
});

// mijn crew in deze league
onlineRouter.get("/leagues/:id/crew", async (req: Request, res: Response) => {
  try {
    const me  = uid(req);
    const mem = await prisma.worldMembership.findFirst({
      where: { worldId: req.params.id, userId: me },
      include: { squad: true },
    });
    if (!mem) return res.status(404).json({ error: "Je hebt nog geen crew in deze league." });
    res.json({
      crewName: mem.crewName, captain: mem.captain, funds: mem.funds,
      points: mem.points, played: mem.played, won: mem.won, drawn: mem.drawn, lost: mem.lost,
      roster: mem.squad.map(s => ({ name: s.name, role: s.role, p: s.p, d: s.d, s: s.s, cond: s.cond })),
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// alle Grand Line-leagues waar ik een crew in heb (voor de slots op het home-scherm)
onlineRouter.get("/my-leagues", async (req: Request, res: Response) => {
  try {
    const me = uid(req);
    const mems = await prisma.worldMembership.findMany({
      where: { userId: me },
      include: { world: true, _count: { select: { squad: true } } },
      orderBy: { id: "desc" },
    });
    const out = [];
    for (const m of mems){
      const w = m.world;
      if (!w) continue;
      let rank: number | null = null;
      if (w.status !== "open"){
        const ordered = await prisma.worldMembership.findMany({
          where: { worldId: w.id },
          orderBy: [{ points: "desc" }, { won: "desc" }, { crewName: "asc" }],
          select: { id: true },
        });
        rank = ordered.findIndex(x => x.id === m.id) + 1;
      }
      out.push({
        worldId: w.id, name: w.name, code: w.joinCode, status: w.status,
        currentDay: w.currentDay, totalDays: w.totalDays, recruitsUntil: w.recruitsUntil,
        maxPlayers: w.maxPlayers, crewName: m.crewName, captain: m.captain,
        crewSize: (m as any)._count?.squad ?? 0, points: m.points, played: m.played, rank,
      });
    }
    res.json({ leagues: out });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export default onlineRouter;