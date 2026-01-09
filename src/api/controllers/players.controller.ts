import type { Request, Response } from "express";
import { prisma } from "../../lib/db.js";

function toInt(v: any): number | null {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export async function getPlayerDataset(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  const pid = toInt(req.params.pid);
  const from = toInt(req.query.from);
  const to = toInt(req.query.to);

  if (!wid || !pid) return res.status(400).json({ error: "wid/pid must be integers" });
  if (!from || !to) return res.status(400).json({ error: "query from/to required (YYYYMMDD)" });

  const rows = await prisma.playerSnapshot.findMany({
    where: { wid, pid, dayInt: { gte: from, lte: to } },
    orderBy: { dayInt: "asc" },
    select: {
      dayInt: true,
      gid: true,
      gnick: true,
      nick: true,
      lv: true,
      power: true,
      maxpower: true,
      sumkill: true,
      die: true,
      score: true,
      caiji: true,
      createdAt: true,
    },
  });

  // BigInt -> string (чтобы JSON не падал) :contentReference[oaicite:3]{index=3}
  const series = rows.map((r) => ({
    day: r.dayInt,
    gid: r.gid,
    gnick: r.gnick,
    nick: r.nick,
    lv: r.lv,
    power: r.power?.toString() ?? null,
    maxpower: r.maxpower?.toString() ?? null,
    sumkill: r.sumkill?.toString() ?? null,
    die: r.die?.toString() ?? null,
    score: r.score?.toString() ?? null,
    caiji: r.caiji?.toString() ?? null,
    createdAt: r.createdAt,
  }));

  res.json({ wid, pid, fromDayInt: from, toDayInt: to, points: series.length, series });
}
