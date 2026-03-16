import type { Request, Response } from "express";
import { prisma } from "../../lib/db.js";
import { getCityMap, resolveCityName } from "../services/city-reference.service.js";
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

export async function worldAllianceCityHeatmap(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  if (!wid) return res.status(400).json({ error: "wid must be integer" });

  const gidsRaw = typeof req.query.gids === "string" ? req.query.gids : "";
  const gids = gidsRaw
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isInteger(x) && x > 0);
  if (gids.length === 0) return res.status(400).json({ error: "gids query is required (comma-separated integers)" });

  const latest = await prisma.ds_player_snapshots.aggregate({
    where: { wid },
    _max: { dayInt: true },
  });
  const latestDay = latest._max.dayInt ?? null;
  if (!latestDay) return res.json({ wid, empty: true, message: "No player snapshots yet" });

  const dayToRaw = toInt(req.query.toDay) ?? latestDay;
  const dayFromRaw = toInt(req.query.fromDay) ?? dayToRaw;
  const dayFrom = Math.min(dayFromRaw, dayToRaw);
  const dayTo = Math.max(dayFromRaw, dayToRaw);

  const [rowsFrom, rowsTo, modeInfo, cityMap] = await Promise.all([
    prisma.ds_player_snapshots.findMany({
      where: { wid, gid: { in: gids }, dayInt: dayFrom, ccid: { not: null } },
      select: { pid: true, gid: true, ccid: true },
    }),
    prisma.ds_player_snapshots.findMany({
      where: { wid, gid: { in: gids }, dayInt: dayTo, ccid: { not: null } },
      select: { pid: true, gid: true, ccid: true },
    }),
    detectWorldMode(wid),
    getCityMap(),
  ]);

  const fromCityCount = new Map<number, number>();
  const toCityCount = new Map<number, number>();
  for (const r of rowsFrom) {
    if (typeof r.ccid === "number") fromCityCount.set(r.ccid, (fromCityCount.get(r.ccid) ?? 0) + 1);
  }
  for (const r of rowsTo) {
    if (typeof r.ccid === "number") toCityCount.set(r.ccid, (toCityCount.get(r.ccid) ?? 0) + 1);
  }

  const fromByPid = new Map<number, number>();
  const toByPid = new Map<number, number>();
  for (const r of rowsFrom) if (typeof r.ccid === "number") fromByPid.set(r.pid, r.ccid);
  for (const r of rowsTo) if (typeof r.ccid === "number") toByPid.set(r.pid, r.ccid);

  const transitionCount = new Map<string, number>();
  if (dayFrom !== dayTo) {
    for (const [pid, fromCcid] of fromByPid.entries()) {
      const toCcid = toByPid.get(pid);
      if (typeof toCcid !== "number" || toCcid === fromCcid) continue;
      const key = `${fromCcid}->${toCcid}`;
      transitionCount.set(key, (transitionCount.get(key) ?? 0) + 1);
    }
  }

  const allCityIds = new Set<number>([
    ...Array.from(fromCityCount.keys()),
    ...Array.from(toCityCount.keys()),
  ]);

  const cities = Array.from(allCityIds.values())
    .map((ccid) => {
      const row = cityMap.get(ccid);
      const name = modeInfo.mode === "16" ? row?.city_16_name ?? row?.city_80_name ?? null : row?.city_80_name ?? row?.city_16_name ?? null;
      const fromCount = fromCityCount.get(ccid) ?? 0;
      const toCount = toCityCount.get(ccid) ?? 0;
      return {
        ccid,
        name,
        fromCount,
        toCount,
        delta: toCount - fromCount,
      };
    })
    .sort((a, b) => Math.max(b.fromCount, b.toCount) - Math.max(a.fromCount, a.toCount));

  const transitions = Array.from(transitionCount.entries())
    .map(([k, count]) => {
      const [fromStr, toStr] = k.split("->");
      const fromCcid = Number(fromStr);
      const toCcid = Number(toStr);
      const fromRow = cityMap.get(fromCcid);
      const toRow = cityMap.get(toCcid);
      const fromName = modeInfo.mode === "16" ? fromRow?.city_16_name ?? fromRow?.city_80_name ?? null : fromRow?.city_80_name ?? fromRow?.city_16_name ?? null;
      const toName = modeInfo.mode === "16" ? toRow?.city_16_name ?? toRow?.city_80_name ?? null : toRow?.city_80_name ?? toRow?.city_16_name ?? null;
      return { fromCcid, toCcid, fromName, toName, count };
    })
    .sort((a, b) => b.count - a.count);

  const gnickRows = await prisma.ds_player_snapshots.groupBy({
    by: ["gid", "gnick"],
    where: { wid, dayInt: dayTo, gid: { in: gids }, gnick: { not: null } },
    _count: { _all: true },
  });
  const alliances = gids.map((gid) => {
    const top = gnickRows
      .filter((x) => x.gid === gid && typeof x.gnick === "string")
      .sort((a, b) => (b._count._all ?? 0) - (a._count._all ?? 0))[0];
    return { gid, gnick: top?.gnick ?? null };
  });

  return res.json({
    wid,
    mode: modeInfo.mode,
    fromDayInt: dayFrom,
    toDayInt: dayTo,
    alliances,
    totals: {
      fromPlayers: rowsFrom.length,
      toPlayers: rowsTo.length,
      movedPlayers: transitions.reduce((acc, t) => acc + t.count, 0),
    },
    cities,
    transitions,
  });
}
