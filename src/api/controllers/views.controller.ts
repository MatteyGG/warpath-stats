import type { Request, Response } from "express";
import { prisma } from "../../lib/db.js";
import { resolveCityName } from "../services/city-reference.service.js";
import { detectWorldMode } from "../services/worlds.service.js";

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function sumBigInt(values: Array<bigint | null | undefined>): bigint {
  let out = 0n;
  for (const v of values) out += v ?? 0n;
  return out;
}

async function resolveRange(wid: number, from?: number | null, to?: number | null) {
  const latest = await prisma.ds_city_daily_stats.aggregate({
    where: { wid },
    _max: { dayInt: true },
    _min: { dayInt: true },
  });
  const minDay = latest._min.dayInt ?? null;
  const maxDay = latest._max.dayInt ?? null;
  if (!minDay || !maxDay) return null;

  const toDay = to ?? maxDay;
  const fromDay = from ?? Math.max(minDay, toDay - 13);
  return { fromDay, toDay, minDay, maxDay };
}

export async function worldOverview(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  const from = toInt(req.query.from);
  const to = toInt(req.query.to);
  if (!wid) return res.status(400).json({ error: "wid must be integer" });

  const range = await resolveRange(wid, from, to);
  if (!range) return res.json({ wid, empty: true, message: "No city stats yet" });

  const modeInfo = await detectWorldMode(wid);

  const latestRows = await prisma.ds_city_daily_stats.findMany({
    where: { wid, dayInt: range.toDay },
    orderBy: { totalPower: "desc" },
  });
  const top = latestRows[0] ?? null;
  const topCityNames = top ? await resolveCityName(top.ccid, modeInfo.mode) : null;

  const latestPlayers = latestRows.reduce((acc, r) => acc + r.playerCount, 0);
  const latestPower = sumBigInt(latestRows.map((r) => r.totalPower));

  return res.json({
    wid,
    range: { fromDayInt: range.fromDay, toDayInt: range.toDay },
    mode: modeInfo,
    latest: {
      cities: latestRows.length,
      players: latestPlayers,
      power: latestPower.toString(),
      topCity: top
        ? {
            ccid: top.ccid,
            name: topCityNames?.displayName ?? null,
            power: top.totalPower.toString(),
            playerCount: top.playerCount,
          }
        : null,
    },
  });
}

export async function worldCitiesLeaderboard(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  const from = toInt(req.query.from);
  const to = toInt(req.query.to);
  const limit = toInt(req.query.limit) ?? 20;
  const sort = typeof req.query.sort === "string" ? req.query.sort : "latestPower";
  if (!wid) return res.status(400).json({ error: "wid must be integer" });

  const range = await resolveRange(wid, from, to);
  if (!range) return res.json({ wid, empty: true, message: "No city stats yet" });

  const rows = await prisma.ds_city_daily_stats.findMany({
    where: { wid, dayInt: { gte: range.fromDay, lte: range.toDay } },
    orderBy: [{ dayInt: "asc" }, { ccid: "asc" }],
  });
  const modeInfo = await detectWorldMode(wid);

  const byCity = new Map<
    number,
    {
      ccid: number;
      days: number;
      windowPower: bigint;
      windowSumkill: bigint;
      latestDayInt: number;
      latestPower: bigint;
      latestPlayerCount: number;
    }
  >();

  for (const r of rows) {
    const cur = byCity.get(r.ccid) ?? {
      ccid: r.ccid,
      days: 0,
      windowPower: 0n,
      windowSumkill: 0n,
      latestDayInt: r.dayInt,
      latestPower: 0n,
      latestPlayerCount: 0,
    };

    cur.days += 1;
    cur.windowPower += r.totalPower;
    cur.windowSumkill += r.totalSumkill;
    if (r.dayInt >= cur.latestDayInt) {
      cur.latestDayInt = r.dayInt;
      cur.latestPower = r.totalPower;
      cur.latestPlayerCount = r.playerCount;
    }
    byCity.set(r.ccid, cur);
  }

  const list = await Promise.all(
    Array.from(byCity.values()).map(async (v) => {
      const names = await resolveCityName(v.ccid, modeInfo.mode);
      return {
        ccid: v.ccid,
        name: names.displayName,
        city80Name: names.city80Name,
        city16Name: names.city16Name,
        days: v.days,
        latestDayInt: v.latestDayInt,
        latestPower: v.latestPower.toString(),
        latestPlayerCount: v.latestPlayerCount,
        windowPower: v.windowPower.toString(),
        windowSumkill: v.windowSumkill.toString(),
      };
    })
  );

  const sorter =
    sort === "windowPower"
      ? (a: (typeof list)[number], b: (typeof list)[number]) => BigInt(b.windowPower) > BigInt(a.windowPower) ? 1 : -1
      : sort === "latestPlayers"
      ? (a: (typeof list)[number], b: (typeof list)[number]) => b.latestPlayerCount - a.latestPlayerCount
      : (a: (typeof list)[number], b: (typeof list)[number]) => BigInt(b.latestPower) > BigInt(a.latestPower) ? 1 : -1;

  list.sort(sorter);

  return res.json({
    wid,
    range: { fromDayInt: range.fromDay, toDayInt: range.toDay },
    mode: modeInfo.mode,
    sort,
    count: list.length,
    data: list.slice(0, Math.max(1, Math.min(limit, 200))),
  });
}

export async function cityTrend(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  const ccid = toInt(req.params.ccid);
  const from = toInt(req.query.from);
  const to = toInt(req.query.to);
  if (!wid || !ccid) return res.status(400).json({ error: "wid and ccid must be integers" });

  const range = await resolveRange(wid, from, to);
  if (!range) return res.json({ wid, ccid, empty: true, message: "No city stats yet" });

  const modeInfo = await detectWorldMode(wid);
  const names = await resolveCityName(ccid, modeInfo.mode);
  const rows = await prisma.ds_city_daily_stats.findMany({
    where: { wid, ccid, dayInt: { gte: range.fromDay, lte: range.toDay } },
    orderBy: { dayInt: "asc" },
    select: {
      dayInt: true,
      playerCount: true,
      allianceCount: true,
      totalPower: true,
      totalSumkill: true,
      totalDie: true,
      totalScore: true,
      totalCaiji: true,
      totalGx: true,
      totalBz: true,
    },
  });

  return res.json({
    wid,
    ccid,
    name: names.displayName,
    city80Name: names.city80Name,
    city16Name: names.city16Name,
    mode: modeInfo.mode,
    range: { fromDayInt: range.fromDay, toDayInt: range.toDay },
    points: rows.length,
    series: rows.map((r) => ({
      day: r.dayInt,
      playerCount: r.playerCount,
      allianceCount: r.allianceCount,
      totalPower: r.totalPower.toString(),
      totalSumkill: r.totalSumkill.toString(),
      totalDie: r.totalDie.toString(),
      totalScore: r.totalScore.toString(),
      totalCaiji: r.totalCaiji.toString(),
      totalGx: r.totalGx.toString(),
      totalBz: r.totalBz.toString(),
    })),
  });
}
