"use strict";

/* ====================================================================
   training.ts — trainingen op de echte klok (6 uur) voor online leagues

   Plek:  server/src/training.ts
   Mount in index.ts:   app.use("/api/online", trainingRouter)
                        (zelfde auth-middleware als online.ts/market.ts/engine.ts)
   Scheduler:           completeDueTrainings() draait mee in scheduler.ts

   Model (bestaat al in je schema — GEEN migratie nodig):
     Training(id, membershipId, squadMemberId?, stat, startedAt)

   Regels (1-op-1 uit game-training.js, alleen dag -> 6 uur):
   - 6 slots totaal, max 2 per stat (P/D/S).
   - Een lid (kapitein of bemanningslid) kan maar in één slot tegelijk.
   - Na 6 uur kent de server +3 toe op die stat (cap 99) en maakt het slot vrij.
   - Werkt ook als je offline bent: het is puur tijdstempel-gebaseerd.
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";
import { bumpMissions } from "./missions";

const TRAIN_MS      = 6 * 3600 * 1000;   // 6 uur
const TRAIN_GAIN      = 3;                // +3 op de stat per sessie
const TRAIN_COND_COST = 3;                // −3 conditie per afgeronde sessieconst STAT_CAP      = 99;
const SLOTS_TOTAL   = 6;
const STAT_CAP        = 99;
const SLOTS_PER_STAT = 2;
const STATS = ["p", "d", "s"] as const;
type Stat = typeof STATS[number];

function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}
async function myMembership(worldId: string, userId: string){
  return prisma.worldMembership.findFirst({ where: { worldId, userId } });
}
function capField(stat: Stat){ return stat === "p" ? "capP" : stat === "d" ? "capD" : "capS"; }

/* ====================================================================
   Afronden: alle trainingen die 6 uur oud zijn -> +3 toekennen + slot vrij.
   Aangeroepen door de scheduler én lazy bij het ophalen van de status.
   ==================================================================== */
export async function completeDueTrainings(): Promise<number> {
  const cutoff = new Date(Date.now() - TRAIN_MS);
  const due = await prisma.training.findMany({ where: { startedAt: { lte: cutoff } } });
  for (const t of due){
    const stat = (t.stat as Stat);
  if (t.squadMemberId){
      const sm = await prisma.squadMember.findUnique({ where: { id: t.squadMemberId } });
      if (sm){
        const val  = Math.min(STAT_CAP, (sm as any)[stat] + TRAIN_GAIN);
        const cond = Math.max(0, sm.cond - TRAIN_COND_COST);
        await prisma.squadMember.update({ where: { id: sm.id }, data: { [stat]: val, cond } });
      }
    } else {
      const m = await prisma.worldMembership.findUnique({ where: { id: t.membershipId } });
      if (m){
        const f    = capField(stat);
        const val  = Math.min(STAT_CAP, (m as any)[f] + TRAIN_GAIN);
        const cond = Math.max(0, m.capCond - TRAIN_COND_COST);
        await prisma.worldMembership.update({ where: { id: m.id }, data: { [f]: val, capCond: cond } });
      }
    }
    await prisma.training.delete({ where: { id: t.id } });
  }
  return due.length;
}

/* ====================================================================
   Routes
   ==================================================================== */
const router = Router();

/* GET de trainingsstatus: kapitein + bemanning + lopende trainingen (met eindtijd) */
router.get("/leagues/:id/training", async (req: Request, res: Response) => {
  try {
    await completeDueTrainings();                       // eerst afronden wat klaar is
    const me = await myMembership(req.params.id, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    const squad   = await prisma.squadMember.findMany({ where: { membershipId: me.id }, orderBy: { createdAt: "asc" } });
    const trains  = await prisma.training.findMany({ where: { membershipId: me.id } });
    const byId    = new Map(squad.map(s => [s.id, s.name]));

    const active = trains.map(t => ({
      name:  t.squadMemberId ? (byId.get(t.squadMemberId) || "?") : me.captain,
      stat:  t.stat,
      endsAt: new Date(t.startedAt.getTime() + TRAIN_MS).toISOString(),
    }));

    res.json({
      captain: me.captain,
      captainStats: { p: me.capP, d: me.capD, s: me.capS, cond: me.capCond },
      roster: squad.map(s => ({ name: s.name, role: s.role, p: s.p, d: s.d, s: s.s, cond: s.cond })),
      active,
      trainMs: TRAIN_MS, gain: TRAIN_GAIN, slotsPerStat: SLOTS_PER_STAT, slotsTotal: SLOTS_TOTAL,
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST start een training: { name, stat }  (name = kapitein of bemanningslid) */
router.post("/leagues/:id/training/start", async (req: Request, res: Response) => {
  try {
    const me = await myMembership(req.params.id, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    const name = String(req.body?.name || "").trim();
    const stat = String(req.body?.stat || "") as Stat;
    if (!STATS.includes(stat)) return res.status(400).json({ error: "Onbekende stat." });

    const active = await prisma.training.findMany({ where: { membershipId: me.id } });
    if (active.length >= SLOTS_TOTAL)
      return res.status(400).json({ error: "Alle 6 trainingsplekken zijn bezet." });
    if (active.filter(t => t.stat === stat).length >= SLOTS_PER_STAT)
      return res.status(400).json({ error: "Deze stat heeft al 2 leden in training." });

    let squadMemberId: string | null = null;
    if (name === me.captain){
      if (active.some(t => !t.squadMemberId))
        return res.status(400).json({ error: "Je kapitein traint al." });
    } else {
      const sm = await prisma.squadMember.findFirst({ where: { membershipId: me.id, name } });
      if (!sm) return res.status(404).json({ error: "Dit lid zit niet in je crew." });
      if (active.some(t => t.squadMemberId === sm.id))
        return res.status(400).json({ error: name + " traint al." });
      squadMemberId = sm.id;
    }

    await prisma.training.create({
      data: { membershipId: me.id, squadMemberId, stat, startedAt: new Date() },
    });
    bumpMissions(uid(req), req.params.id, "train").catch(() => {});
    res.json({ ok: true, endsAt: new Date(Date.now() + TRAIN_MS).toISOString() });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST annuleer een training: { name }  (geen winst, slot komt vrij) */
router.post("/leagues/:id/training/cancel", async (req: Request, res: Response) => {
  try {
    const me = await myMembership(req.params.id, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });
    const name = String(req.body?.name || "").trim();

    let where: any = { membershipId: me.id };
    if (name === me.captain){
      where.squadMemberId = null;
    } else {
      const sm = await prisma.squadMember.findFirst({ where: { membershipId: me.id, name } });
      if (!sm) return res.status(404).json({ error: "Dit lid zit niet in je crew." });
      where.squadMemberId = sm.id;
    }
    await prisma.training.deleteMany({ where });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export const trainingRouter = router;
export default router;