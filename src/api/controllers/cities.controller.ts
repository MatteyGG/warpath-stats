import type { Request, Response } from "express";
import { prisma } from "../../lib/db.js";

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export async function getCityDataset(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  const from = toInt(req.query.from);
  const to = toInt(req.query.to);
  const ccid = toInt(req.query.ccid);

  if (!wid) return res.status(400).json({ error: "wid must be integer" });
  if (!from || !to) return res.status(400).json({ error: "query from/to required (YYYYMMDD)" });

  const rows = await prisma.ds_city_daily_stats.findMany({
    where: {
      wid,
      dayInt: { gte: from, lte: to },
      ...(ccid ? { ccid } : {}),
    },
    orderBy: [{ dayInt: "asc" }, { ccid: "asc" }],
    select: {
      dayInt: true,
      ccid: true,
      playerCount: true,
      allianceCount: true,
      totalPower: true,
      totalSumkill: true,
      totalDie: true,
      totalScore: true,
      totalCaiji: true,
      totalGx: true,
      totalBz: true,
      builtAt: true,
    },
  });

  const series = rows.map((r) => ({
    day: r.dayInt,
    ccid: r.ccid,
    playerCount: r.playerCount,
    allianceCount: r.allianceCount,
    totalPower: r.totalPower.toString(),
    totalSumkill: r.totalSumkill.toString(),
    totalDie: r.totalDie.toString(),
    totalScore: r.totalScore.toString(),
    totalCaiji: r.totalCaiji.toString(),
    totalGx: r.totalGx.toString(),
    totalBz: r.totalBz.toString(),
    builtAt: r.builtAt,
  }));

  res.json({
    wid,
    fromDayInt: from,
    toDayInt: to,
    ccid: ccid ?? null,
    points: series.length,
    series,
  });
}
