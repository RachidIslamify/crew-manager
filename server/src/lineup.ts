"use strict";

/* ====================================================================
   lineup.ts — opstelling (9 dek + 4 bank) voor online leagues

   Plek:  server/src/lineup.ts
   Mount in index.ts:   app.use("/api/online", lineupRouter)
   Schema:  WorldMembership.lineup Json?   (NIEUW — één migratie)

   Slaat op als  { deck: { role: name|null }, bench: [name|null x4] }.
   GET vult automatisch aan: leden die je koopt komen vanzelf op een vrije
   dekpost (en anders op de bank), precies zoals single-player reconcileLineup.
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";
import { bumpMissions } from "./missions";
import { SHIP_TIERS, rosterCapForTier } from "./config/shipTiers";

const DECK_ROLES = ["Swordsman", "Sniper", "Chef", "Doctor", "Archaeologist",
                    "Shipwright", "Musician", "Navigator", "Helmsman"];
const BENCH_SIZE = 4;

function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}
async function myMembership(worldId: string, userId: string){
  return prisma.worldMembership.findFirst({ where: { worldId, userId }, include: { squad: true } });
}

/* lege opstelling */
function blankLineup(){
  const deck: Record<string, string | null> = {};
  DECK_ROLES.forEach(r => deck[r] = null);
  return { deck, bench: new Array(BENCH_SIZE).fill(null) as (string | null)[] };
}

/* opschonen + automatisch aanvullen op basis van wie je nu bezit */
function reconcile(raw: any, owned: string[]){
  const lu = (raw && raw.deck) ? { deck: { ...raw.deck }, bench: Array.isArray(raw.bench) ? raw.bench.slice(0, BENCH_SIZE) : [] }
                               : blankLineup();
  DECK_ROLES.forEach(r => { if (!(r in lu.deck)) lu.deck[r] = null; });
  while (lu.bench.length < BENCH_SIZE) lu.bench.push(null);

  const ownedSet = new Set(owned);
  // gooi namen eruit die je niet meer hebt
  DECK_ROLES.forEach(r => { if (lu.deck[r] && !ownedSet.has(lu.deck[r])) lu.deck[r] = null; });
  for (let i = 0; i < BENCH_SIZE; i++){ if (lu.bench[i] && !ownedSet.has(lu.bench[i])) lu.bench[i] = null; }

  // plaats niet-opgestelde leden op een vrije dekpost, anders op de bank
  const placed = new Set<string>();
  DECK_ROLES.forEach(r => { if (lu.deck[r]) placed.add(lu.deck[r]); });
  lu.bench.forEach((n: string | null) => { if (n) placed.add(n); });

  owned.forEach(name => {
    if (placed.has(name)) return;
    const freeRole = DECK_ROLES.find(r => !lu.deck[r]);
    if (freeRole){ lu.deck[freeRole] = name; placed.add(name); return; }
    const bi = lu.bench.findIndex((x: string | null) => !x);
    if (bi >= 0){ lu.bench[bi] = name; placed.add(name); }
  });
  return lu;
}

const router = Router();

/* GET de opstelling + je crew (gereconcilieerd) */
router.get("/leagues/:id/lineup", async (req: Request, res: Response) => {
  try {
    const me = await myMembership(req.params.id, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });
    bumpMissions(uid(req), req.params.id, "viewCrew").catch(() => {});

    const owned = me.squad.map(s => s.name);
    const lineup = reconcile(me.lineup, owned);
    // bewaar de aangevulde versie meteen, zodat dek/bank consistent blijven
    await prisma.worldMembership.update({ where: { id: me.id }, data: { lineup: lineup as any } });

    res.json({
      crewName: me.crewName, captain: me.captain,
      captainStats: { p: me.capP, d: me.capD, s: me.capS, cond: me.capCond },
      rosterCap: rosterCapForTier(me.shipTier),
      ship: {
        shipTier: me.shipTier,
        tierName: SHIP_TIERS[(me.shipTier as 1|2|3)]?.name ?? SHIP_TIERS[1].name,
        rosterCap: rosterCapForTier(me.shipTier),
        hullColor: me.hullColor, deckColor: me.deckColor, sailColor: me.sailColor,
        trimColor: me.trimColor, jollyRoger: me.jollyRoger, figurehead: me.figurehead,
      },
      squad: me.squad.map(s => ({ name: s.name, role: s.role, altRoles: s.altRoles, p: s.p, d: s.d, s: s.s, cond: s.cond })),
      lineup,
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST de opstelling opslaan: { lineup: { deck, bench } } */
router.post("/leagues/:id/lineup", async (req: Request, res: Response) => {
  try {
    const me = await myMembership(req.params.id, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    const owned = me.squad.map(s => s.name);
    const incoming = req.body?.lineup || {};
    // alleen eigen leden toelaten; dubbelingen verwijderen
    const seen = new Set<string>();
    const deck: Record<string, string | null> = {};
    DECK_ROLES.forEach(r => {
      const n = incoming.deck ? incoming.deck[r] : null;
      if (n && owned.includes(n) && !seen.has(n)){ deck[r] = n; seen.add(n); } else deck[r] = null;
    });
    const bench: (string | null)[] = [];
    const inB = Array.isArray(incoming.bench) ? incoming.bench : [];
    for (let i = 0; i < BENCH_SIZE; i++){
      const n = inB[i];
      if (n && owned.includes(n) && !seen.has(n)){ bench.push(n); seen.add(n); } else bench.push(null);
    }

    const lineup = reconcile({ deck, bench }, owned);
    await prisma.worldMembership.update({ where: { id: me.id }, data: { lineup: lineup as any } });
    bumpMissions(uid(req), req.params.id, "viewCrew").catch(() => {});
    res.json({ ok: true, lineup });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export const lineupRouter = router;
export default router;