import type { Request, Response } from "express";
import { prisma } from "../../lib/db.js";
import { detectWorldMode } from "../services/worlds.service.js";
import { resolveCityName } from "../services/city-reference.service.js";

type WindowPreset = "1d" | "7d" | "30d" | "90d";

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function toBigInt(v: bigint | null | undefined): bigint {
  return v ?? BigInt(0);
}

function bStr(v: bigint | null | undefined): string {
  return String(v ?? BigInt(0));
}

function dayIntToDate(dayInt: number) {
  const s = String(dayInt);
  return new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
}

function dateToDayInt(dt: Date) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return Number(`${y}${m}${d}`);
}

function shiftDay(dayInt: number, delta: number) {
  const dt = dayIntToDate(dayInt);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dateToDayInt(dt);
}

function pctDelta(cur: bigint, prev: bigint): number | null {
  if (prev === BigInt(0)) return null;
  return Number(((cur - prev) * BigInt(10000)) / prev) / 100;
}

function serialize(data: any) {
  return JSON.parse(
    JSON.stringify(data, (_, value) => (typeof value === "bigint" ? value.toString() : value))
  );
}

function problem(res: Response, status: number, detail: string, instance: string, pointer?: string) {
  return res.status(status).type("application/problem+json").json({
    type: "https://api.stasis-wp.local/problems/validation-error",
    title: status === 404 ? "Not found" : "Validation error",
    status,
    detail,
    instance,
    ...(pointer ? { errors: [{ detail, pointer }] } : {}),
  });
}

function parseWindow(q: unknown): number {
  const raw = typeof q === "string" ? (q as WindowPreset) : "7d";
  if (raw === "1d") return 1;
  if (raw === "30d") return 30;
  if (raw === "90d") return 90;
  return 7;
}

function parseSort(sortRaw: unknown, fallback: string) {
  const sort = typeof sortRaw === "string" && sortRaw.trim().length > 0 ? sortRaw.trim() : fallback;
  const [field, dirRaw] = sort.split(":");
  const dir = dirRaw === "asc" ? "asc" : "desc";
  return { field, dir };
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number | null {
  if (!cursor) return null;
  try {
    const n = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function withLinks(req: Request, page: number, pageSize: number, total: number, cursorUsed: string | null = null) {
  const hasNext = page * pageSize < total;
  const nextOffset = page * pageSize;
  const nextCursor = hasNext ? encodeCursor(nextOffset) : null;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") params.set(k, v);
  }
  const selfPath = `${req.baseUrl}${req.path}?${params.toString()}`;
  if (nextCursor) params.set("cursor", nextCursor);
  const nextPath = nextCursor ? `${req.baseUrl}${req.path}?${params.toString()}` : null;

  return {
    meta: { page, pageSize, total, hasNext, ...(nextCursor ? { nextCursor } : {}) },
    links: { self: selfPath, ...(nextPath ? { next: nextPath } : {}) },
    cursorUsed,
  };
}

async function latestDayForWid(wid: number): Promise<number | null> {
  const agg = await prisma.ds_player_snapshots.aggregate({ where: { wid }, _max: { dayInt: true } });
  return agg._max.dayInt ?? null;
}

async function buildPlayerCard(wid: number, pid: number, latestDay: number, windowDays = 7) {
  const [latest, prev] = await Promise.all([
    prisma.ds_player_snapshots.findUnique({ where: { wid_pid_dayInt: { wid, pid, dayInt: latestDay } } }),
    prisma.ds_player_snapshots.findUnique({
      where: { wid_pid_dayInt: { wid, pid, dayInt: shiftDay(latestDay, -windowDays) } },
    }),
  ]);
  if (!latest) return null;

  const mode = await detectWorldMode(wid);
  const city = latest.ccid ? await resolveCityName(latest.ccid, mode.mode, { cid: latest.cid }) : null;

  const curPower = toBigInt(latest.maxpower);
  const curKill = toBigInt(latest.sumkill);
  const curDie = toBigInt(latest.die);
  const curScore = toBigInt(latest.score);

  const prevPower = toBigInt(prev?.maxpower);
  const prevKill = toBigInt(prev?.sumkill);
  const prevDie = toBigInt(prev?.die);
  const prevScore = toBigInt(prev?.score);

  const p = curPower - prevPower;
  const k = curKill - prevKill;
  const d = curDie - prevDie;
  const s = curScore - prevScore;
  const kd = curDie === BigInt(0) ? null : Number((curKill * BigInt(100)) / curDie) / 100;

  return {
    wid,
    pid: String(pid),
    nick: latest.nick ?? `PID ${pid}`,
    level: latest.lv ?? null,
    city: {
      cityId: latest.ccid ?? null,
      city80Name: city?.city80Name ?? null,
      city16Name: city?.city16Name ?? null,
    },
    currentAlliance: {
      gid: latest.gid !== null ? String(latest.gid) : null,
      gnick: latest.gnick ?? null,
    },
    current: {
      power: bStr(latest.power),
      maxPower: bStr(latest.maxpower),
      sumkill: bStr(latest.sumkill),
      die: bStr(latest.die),
      score: bStr(latest.score),
      caiji: bStr(latest.caiji),
      gx: bStr(latest.allianceTechContribution),
      bz: bStr(latest.allianceHelp),
    },
    delta: {
      d7: {
        power: { abs: p.toString(), pct: pctDelta(curPower, prevPower) },
        sumkill: { abs: k.toString(), pct: pctDelta(curKill, prevKill) },
        die: { abs: d.toString(), pct: pctDelta(curDie, prevDie) },
        score: { abs: s.toString(), pct: pctDelta(curScore, prevScore) },
      },
    },
    ratios: {
      killDeath: kd,
      growthPerDay7: Number(p / BigInt(7)),
    },
    flags: {
      active: p > BigInt(0) || k > BigInt(0),
      rising: p > BigInt(0),
      volatileAllianceMember: false,
    },
    quality: { isComplete: true, coverageRatio: 1 },
    lastDayInt: latestDay,
  };
}

export async function worlds(req: Request, res: Response) {
  const widsFromTracked = await prisma.tracked_alliance.findMany({ select: { wid: true }, distinct: ["wid"] });
  const widsFromData = await prisma.ds_player_snapshots.findMany({ select: { wid: true }, distinct: ["wid"] });
  const widSet = new Set<number>();
  for (const w of widsFromTracked) widSet.add(w.wid);
  for (const w of widsFromData) widSet.add(w.wid);

  const data = await Promise.all(
    Array.from(widSet).map(async (wid) => {
      const [latestDay, trackedCount] = await Promise.all([
        latestDayForWid(wid),
        prisma.tracked_alliance.count({ where: { wid, enabled: true } }),
      ]);
      const rows = latestDay
        ? await prisma.ds_player_snapshots.count({ where: { wid, dayInt: latestDay } })
        : 0;
      return {
        wid,
        label: `World ${wid}`,
        trackedAlliances: trackedCount,
        lastDayInt: latestDay,
        health: {
          isComplete: rows > 0,
          coverageRatio: latestDay ? Math.min(1, rows / 500) : null,
        },
      };
    })
  );

  res.json({ data: data.sort((a, b) => a.wid - b.wid) });
}

export async function players(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  if (!wid) return problem(res, 400, "wid is required integer", req.originalUrl, "#/query/wid");

  const page = Math.max(1, toInt(req.query.page) ?? 1);
  const pageSize = Math.min(100, Math.max(1, toInt(req.query.pageSize) ?? 25));
  const cursorOffset = decodeCursor(typeof req.query.cursor === "string" ? req.query.cursor : undefined);
  const useOffset = cursorOffset ?? (page - 1) * pageSize;
  const gid = toInt(req.query.gid);
  const cityId = toInt(req.query.cityId);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const windowDays = parseWindow(req.query.window);
  const quality = typeof req.query.quality === "string" ? req.query.quality : "all";
  const minPower = toInt(req.query.minPower);
  const maxPower = toInt(req.query.maxPower);
  const activity = typeof req.query.activity === "string" ? req.query.activity : "all";
  const { field: sortField, dir: sortDir } = parseSort(req.query.sort, "power:desc");

  const latestDay = await latestDayForWid(wid);
  if (!latestDay) return res.json({ data: [], meta: { page, pageSize, total: 0, hasNext: false }, links: {} });

  const where: any = { wid, dayInt: latestDay };
  if (gid !== null) where.gid = gid;
  if (cityId !== null) where.ccid = cityId;
  if (q) where.nick = { contains: q, mode: "insensitive" };
  if (minPower !== null || maxPower !== null) {
    where.maxpower = {
      ...(minPower !== null ? { gte: BigInt(minPower) } : {}),
      ...(maxPower !== null ? { lte: BigInt(maxPower) } : {}),
    };
  }

  const baseRows = await prisma.ds_player_snapshots.findMany({ where });
  const prevDay = shiftDay(latestDay, -windowDays);
  const prevRows = await prisma.ds_player_snapshots.findMany({
    where: { wid, dayInt: prevDay, pid: { in: baseRows.map((r) => r.pid) } },
    select: { pid: true, maxpower: true, sumkill: true, die: true, score: true },
  });
  const prevMap = new Map(prevRows.map((r) => [r.pid, r]));

  let switchCountMap = new Map<number, number>();
  if (sortField === "alliance_switches_30d") {
    const fromDay = shiftDay(latestDay, -30);
    const membership = await prisma.player_alliance_membership.findMany({
      where: { wid, pid: { in: baseRows.map((r) => r.pid) }, dayInt: { gte: fromDay, lte: latestDay } },
      orderBy: [{ pid: "asc" }, { dayInt: "asc" }],
      select: { pid: true, gid: true },
    });
    let lastPid: number | null = null;
    let lastGid: number | null = null;
    let cnt = 0;
    for (const m of membership) {
      if (lastPid !== m.pid) {
        if (lastPid !== null) switchCountMap.set(lastPid, cnt);
        lastPid = m.pid;
        lastGid = m.gid;
        cnt = 0;
      } else if (lastGid !== m.gid) {
        cnt += 1;
        lastGid = m.gid;
      }
    }
    if (lastPid !== null) switchCountMap.set(lastPid, cnt);
  }

  const enriched = baseRows.map((r) => {
    const p = prevMap.get(r.pid);
    const dPower = toBigInt(r.maxpower) - toBigInt(p?.maxpower);
    const dKill = toBigInt(r.sumkill) - toBigInt(p?.sumkill);
    const dScore = toBigInt(r.score) - toBigInt(p?.score);
    const kd = toBigInt(r.die) === BigInt(0) ? null : Number((toBigInt(r.sumkill) * BigInt(100)) / toBigInt(r.die)) / 100;
    return {
      row: r,
      dPower,
      dKill,
      dScore,
      kd,
      active: dPower > BigInt(0) || dKill > BigInt(0),
      rising: dPower > BigInt(0),
      switches30d: switchCountMap.get(r.pid) ?? 0,
    };
  });

  const filtered = enriched.filter((x) => {
    if (quality === "complete-only" && x.row.maxpower === null) return false;
    if (activity === "active" && !x.active) return false;
    if (activity === "rising" && !x.rising) return false;
    if (activity === "dormant" && x.active) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const sign = sortDir === "asc" ? 1 : -1;
    if (sortField === "sumkill") return (toBigInt(a.row.sumkill) === toBigInt(b.row.sumkill) ? 0 : (toBigInt(a.row.sumkill) > toBigInt(b.row.sumkill) ? 1 : -1)) * sign;
    if (sortField === "die") return (toBigInt(a.row.die) === toBigInt(b.row.die) ? 0 : (toBigInt(a.row.die) > toBigInt(b.row.die) ? 1 : -1)) * sign;
    if (sortField === "score") return (toBigInt(a.row.score) === toBigInt(b.row.score) ? 0 : (toBigInt(a.row.score) > toBigInt(b.row.score) ? 1 : -1)) * sign;
    if (sortField === "d_power") return (a.dPower === b.dPower ? 0 : a.dPower > b.dPower ? 1 : -1) * sign;
    if (sortField === "d_sumkill") return (a.dKill === b.dKill ? 0 : a.dKill > b.dKill ? 1 : -1) * sign;
    if (sortField === "killDeath") return ((a.kd ?? -1) === (b.kd ?? -1) ? 0 : ((a.kd ?? -1) > (b.kd ?? -1) ? 1 : -1)) * sign;
    if (sortField === "alliance_switches_30d") return (a.switches30d - b.switches30d) * sign;
    return (toBigInt(a.row.maxpower) === toBigInt(b.row.maxpower) ? 0 : (toBigInt(a.row.maxpower) > toBigInt(b.row.maxpower) ? 1 : -1)) * sign;
  });

  const total = filtered.length;
  const rows = filtered.slice(useOffset, useOffset + pageSize);
  const data = await Promise.all(rows.map((x) => buildPlayerCard(wid, x.row.pid, latestDay, windowDays)));
  const extra = withLinks(req, page, pageSize, total, cursorOffset !== null ? String(cursorOffset) : null);

  res.json({ data: serialize(data.filter(Boolean)), meta: extra.meta, links: extra.links });
}

export async function playerProfile(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const pid = toInt(req.params.pid);
  if (!wid || !pid) return res.status(400).json({ error: "wid query and pid param are required integers" });

  const latestDay = await latestDayForWid(wid);
  if (!latestDay) return res.status(404).json({ error: "no data for wid" });

  const player = await buildPlayerCard(wid, pid, latestDay, 7);
  if (!player) return res.status(404).json({ error: "player not found" });

  const rankRows = await prisma.ds_player_snapshots.findMany({
    where: { wid, dayInt: latestDay },
    orderBy: { power: "desc" },
    select: { pid: true },
  });
  const powerRank = rankRows.findIndex((x) => x.pid === pid) + 1;

  res.json({
    data: {
      player: serialize(player),
      rankContext: { powerRank: powerRank || null, killRank: null, growthRank7d: null },
      allianceContext: player.currentAlliance.gid
        ? {
            gid: player.currentAlliance.gid,
            gnick: player.currentAlliance.gnick,
            memberRankByPower: null,
            contributionShare: null,
          }
        : null,
    },
  });
}

export async function playerSeries(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const pid = toInt(req.params.pid);
  const fromDay = toInt(req.query.fromDay);
  const toDay = toInt(req.query.toDay);
  if (!wid || !pid || !fromDay || !toDay) {
    return res.status(400).json({ error: "wid, pid, fromDay, toDay are required integers" });
  }

  const metricsRaw = typeof req.query.metrics === "string" ? req.query.metrics : "power,sumkill,die,score";
  const metrics = metricsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const rows = await prisma.ds_player_snapshots.findMany({
    where: { wid, pid, dayInt: { gte: fromDay, lte: toDay } },
    orderBy: { dayInt: "asc" },
  });

  const series: Record<string, any[]> = {};
  for (const m of metrics) series[m] = [];
  for (const r of rows) {
    const dateLabel = String(r.dayInt);
    if (metrics.includes("power")) series.power.push({ dayInt: r.dayInt, dateLabel, value: bStr(r.power), isComplete: true });
    if (metrics.includes("sumkill")) series.sumkill.push({ dayInt: r.dayInt, dateLabel, value: bStr(r.sumkill), isComplete: true });
    if (metrics.includes("die")) series.die.push({ dayInt: r.dayInt, dateLabel, value: bStr(r.die), isComplete: true });
    if (metrics.includes("score")) series.score.push({ dayInt: r.dayInt, dateLabel, value: bStr(r.score), isComplete: true });
    if (metrics.includes("caiji")) series.caiji.push({ dayInt: r.dayInt, dateLabel, value: bStr(r.caiji), isComplete: true });
    if (metrics.includes("gx")) series.gx.push({ dayInt: r.dayInt, dateLabel, value: bStr(r.allianceTechContribution), isComplete: true });
    if (metrics.includes("bz")) series.bz.push({ dayInt: r.dayInt, dateLabel, value: bStr(r.allianceHelp), isComplete: true });
  }

  res.json({ data: { pid: String(pid), series: serialize(series) } });
}

export async function playerMembership(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const pid = toInt(req.params.pid);
  if (!wid || !pid) return res.status(400).json({ error: "wid query and pid param are required integers" });

  const rows = await prisma.player_alliance_membership.findMany({
    where: { wid, pid },
    orderBy: { dayInt: "asc" },
    select: { dayInt: true, gid: true, gnick: true },
  });
  const p = await prisma.players.findUnique({ where: { wid_pid: { wid, pid } }, select: { nick: true } });

  const events: any[] = [];
  let prev: { gid: number; gnick: string | null } | null = null;
  for (const r of rows) {
    if (!prev) {
      events.push({
        pid: String(pid),
        nick: p?.nick ?? `PID ${pid}`,
        fromGid: null,
        fromGnick: null,
        toGid: String(r.gid),
        toGnick: r.gnick,
        dayInt: r.dayInt,
        type: "join",
      });
      prev = { gid: r.gid, gnick: r.gnick };
      continue;
    }
    if (prev.gid !== r.gid) {
      events.push({
        pid: String(pid),
        nick: p?.nick ?? `PID ${pid}`,
        fromGid: String(prev.gid),
        fromGnick: prev.gnick,
        toGid: String(r.gid),
        toGnick: r.gnick,
        dayInt: r.dayInt,
        type: "switch",
      });
      prev = { gid: r.gid, gnick: r.gnick };
    }
  }

  res.json({ data: { pid: String(pid), events } });
}

async function latestAllianceDay(wid: number): Promise<number | null> {
  const agg = await prisma.alliance_snapshot.aggregate({ where: { wid }, _max: { dayInt: true } });
  if (agg._max.dayInt) return agg._max.dayInt;
  return latestDayForWid(wid);
}

async function allianceShortTag(wid: number, gid: number, dayInt: number): Promise<string | null> {
  const fromDay = shiftDay(dayInt, -14);
  const [rowsFromSnap, rowsFromMembership] = await Promise.all([
    prisma.ds_player_snapshots.groupBy({
      by: ["gnick"],
      where: { wid, gid, dayInt: { gte: fromDay, lte: dayInt }, gnick: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { gnick: "desc" } },
      take: 3,
    }),
    prisma.player_alliance_membership.groupBy({
      by: ["gnick"],
      where: { wid, gid, dayInt: { gte: fromDay, lte: dayInt }, gnick: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { gnick: "desc" } },
      take: 3,
    }),
  ]);

  const candidate =
    rowsFromSnap.find((r) => typeof r.gnick === "string" && r.gnick.trim().length > 0)?.gnick ??
    rowsFromMembership.find((r) => typeof r.gnick === "string" && r.gnick.trim().length > 0)?.gnick;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

async function buildAllianceCard(wid: number, gid: number, latestDay: number) {
  const gnick = await allianceShortTag(wid, gid, latestDay);
  const [cur, prev7, membersCur, membersPrev7] = await Promise.all([
    prisma.alliance_snapshot.findUnique({ where: { wid_gid_dayInt: { wid, gid, dayInt: latestDay } } }),
    prisma.alliance_snapshot.findUnique({ where: { wid_gid_dayInt: { wid, gid, dayInt: shiftDay(latestDay, -7) } } }),
    prisma.player_alliance_membership.count({ where: { wid, gid, dayInt: latestDay } }),
    prisma.player_alliance_membership.count({ where: { wid, gid, dayInt: shiftDay(latestDay, -7) } }),
  ]);
  if (!cur) {
    const [pCur, pPrev] = await Promise.all([
      prisma.ds_player_snapshots.aggregate({
        where: { wid, dayInt: latestDay, gid },
        _sum: { power: true, sumkill: true, die: true },
        _count: { _all: true },
      }),
      prisma.ds_player_snapshots.aggregate({
        where: { wid, dayInt: shiftDay(latestDay, -7), gid },
        _sum: { power: true, sumkill: true, die: true },
        _count: { _all: true },
      }),
    ]);
    if ((pCur._count._all ?? 0) === 0) return null;

    const pCurPower = toBigInt(pCur._sum.power);
    const pPrevPower = toBigInt(pPrev._sum.power);
    const pCurKill = toBigInt(pCur._sum.sumkill);
    const pPrevKill = toBigInt(pPrev._sum.sumkill);
    const pCurDie = toBigInt(pCur._sum.die);
    const pPrevDie = toBigInt(pPrev._sum.die);

    return {
      wid,
      gid: String(gid),
      gnick,
      name: null,
      owner: null,
      current: {
        power: pCurPower.toString(),
        kil: pCurKill.toString(),
        di: pCurDie.toString(),
        memberCount: pCur._count._all ?? 0,
      },
      delta: {
        d7: {
          power: { abs: (pCurPower - pPrevPower).toString(), pct: pctDelta(pCurPower, pPrevPower) },
          kil: { abs: (pCurKill - pPrevKill).toString(), pct: pctDelta(pCurKill, pPrevKill) },
          di: { abs: (pCurDie - pPrevDie).toString(), pct: pctDelta(pCurDie, pPrevDie) },
          members: { abs: String((pCur._count._all ?? 0) - (pPrev._count._all ?? 0)), pct: pctDelta(BigInt(pCur._count._all ?? 0), BigInt(pPrev._count._all ?? 0)) },
        },
      },
      composition: {
        retainedMembers7d: null,
        inflow7d: null,
        outflow7d: null,
        retentionRate7d: null,
        top5ContributionShare: null,
      },
      quality: { isComplete: true, coverageRatio: 1 },
      lastDayInt: latestDay,
    };
  }

  const pCur = toBigInt(cur.power);
  const pPrev = toBigInt(prev7?.power);
  const kCur = toBigInt(cur.kil);
  const kPrev = toBigInt(prev7?.kil);
  const dCur = BigInt(cur.di ?? 0);
  const dPrev = BigInt(prev7?.di ?? 0);
  const mCur = BigInt(membersCur);
  const mPrev = BigInt(membersPrev7);

  return {
    wid,
    gid: String(gid),
    gnick,
    name: null,
    owner: cur.owner ?? null,
    current: {
      power: pCur.toString(),
      kil: kCur.toString(),
      di: String(cur.di ?? 0),
      memberCount: membersCur,
    },
    delta: {
      d7: {
        power: { abs: (pCur - pPrev).toString(), pct: pctDelta(pCur, pPrev) },
        kil: { abs: (kCur - kPrev).toString(), pct: pctDelta(kCur, kPrev) },
        di: { abs: (dCur - dPrev).toString(), pct: pctDelta(dCur, dPrev) },
        members: { abs: (mCur - mPrev).toString(), pct: pctDelta(mCur, mPrev) },
      },
    },
    composition: {
      retainedMembers7d: null,
      inflow7d: null,
      outflow7d: null,
      retentionRate7d: null,
      top5ContributionShare: null,
    },
    quality: { isComplete: true, coverageRatio: 1 },
    lastDayInt: latestDay,
  };
}

export async function alliances(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  if (!wid) return problem(res, 400, "wid is required integer", req.originalUrl, "#/query/wid");
  const page = Math.max(1, toInt(req.query.page) ?? 1);
  const pageSize = Math.min(100, Math.max(1, toInt(req.query.pageSize) ?? 25));
  const cursorOffset = decodeCursor(typeof req.query.cursor === "string" ? req.query.cursor : undefined);
  const useOffset = cursorOffset ?? (page - 1) * pageSize;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const trackedOnly = String(req.query.trackedOnly ?? "false") === "true";
  const { field: sortField, dir: sortDir } = parseSort(req.query.sort, "power:desc");

  const latestDay = await latestAllianceDay(wid);
  if (!latestDay) return res.json({ data: [], meta: { page, pageSize, total: 0, hasNext: false }, links: {} });

  const where: any = { wid, dayInt: latestDay };
  const isSnapshotSource = (await prisma.alliance_snapshot.count({ where: { wid, dayInt: latestDay } })) > 0;
  if (q && isSnapshotSource) where.owner = { contains: q, mode: "insensitive" };
  if (trackedOnly) {
    const tracked = await prisma.tracked_alliance.findMany({ where: { wid, enabled: true }, select: { gid: true } });
    where.gid = { in: tracked.map((t) => t.gid) };
  }

  let gids: number[] = [];
  if (isSnapshotSource) {
    const rows = await prisma.alliance_snapshot.findMany({ where, select: { gid: true, power: true } });
    const sorted = rows.sort((a, b) => (toBigInt(a.power) === toBigInt(b.power) ? 0 : (toBigInt(a.power) > toBigInt(b.power) ? 1 : -1)) * (sortDir === "asc" ? 1 : -1));
    gids = sorted.map((r) => r.gid);
  } else {
    const playerWhere: any = { wid, dayInt: latestDay, gid: { gt: 0 } };
    if (q) playerWhere.gnick = { contains: q, mode: "insensitive" };
    if (trackedOnly) playerWhere.gid = where.gid;
    const grouped = await prisma.ds_player_snapshots.groupBy({
      by: ["gid"],
      where: playerWhere,
      _sum: { power: true, sumkill: true, die: true },
      _count: { _all: true },
    });
    grouped.sort((a, b) => {
      const sign = sortDir === "asc" ? 1 : -1;
      if (sortField === "memberCount") return ((a._count._all ?? 0) - (b._count._all ?? 0)) * sign;
      if (sortField === "kil") return (toBigInt(a._sum.sumkill) === toBigInt(b._sum.sumkill) ? 0 : (toBigInt(a._sum.sumkill) > toBigInt(b._sum.sumkill) ? 1 : -1)) * sign;
      if (sortField === "di") return (toBigInt(a._sum.die) === toBigInt(b._sum.die) ? 0 : (toBigInt(a._sum.die) > toBigInt(b._sum.die) ? 1 : -1)) * sign;
      return (toBigInt(a._sum.power) === toBigInt(b._sum.power) ? 0 : (toBigInt(a._sum.power) > toBigInt(b._sum.power) ? 1 : -1)) * sign;
    });
    gids = grouped.map((g) => g.gid!).filter((x): x is number => typeof x === "number" && x > 0);
  }

  const total = gids.length;
  const pageGids = gids.slice(useOffset, useOffset + pageSize);
  const data = await Promise.all(pageGids.map((gid) => buildAllianceCard(wid, gid, latestDay)));
  const extra = withLinks(req, page, pageSize, total, cursorOffset !== null ? String(cursorOffset) : null);
  res.json({ data: serialize(data.filter(Boolean)), meta: extra.meta, links: extra.links });
}

export async function allianceProfile(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const gid = toInt(req.params.gid);
  if (!wid || !gid) return res.status(400).json({ error: "wid query and gid param are required integers" });
  const latestDay = await latestAllianceDay(wid);
  if (!latestDay) return res.status(404).json({ error: "no alliance data for wid" });

  const card = await buildAllianceCard(wid, gid, latestDay);
  if (!card) return res.status(404).json({ error: "alliance not found" });
  res.json({ data: { alliance: serialize(card), rankContext: { powerRank: null, killRank: null, growthRank7d: null, retentionRank7d: null } } });
}

export async function allianceSeries(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const gid = toInt(req.params.gid);
  const fromDay = toInt(req.query.fromDay);
  const toDay = toInt(req.query.toDay);
  if (!wid || !gid || !fromDay || !toDay) {
    return res.status(400).json({ error: "wid, gid, fromDay, toDay are required integers" });
  }
  const metricsRaw = typeof req.query.metrics === "string" ? req.query.metrics : "power,kil,di,memberCount";
  const metrics = metricsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const rows = await prisma.alliance_snapshot.findMany({
    where: { wid, gid, dayInt: { gte: fromDay, lte: toDay } },
    orderBy: { dayInt: "asc" },
  });

  const memberCounts = await prisma.player_alliance_membership.groupBy({
    by: ["dayInt"],
    where: { wid, gid, dayInt: { gte: fromDay, lte: toDay } },
    _count: { _all: true },
  });
  const mMap = new Map(memberCounts.map((x) => [x.dayInt, x._count._all]));
  const series: Record<string, any[]> = {};
  for (const m of metrics) series[m] = [];
  for (const r of rows) {
    const dateLabel = String(r.dayInt);
    if (metrics.includes("power")) series.power.push({ dayInt: r.dayInt, dateLabel, value: bStr(r.power), isComplete: true });
    if (metrics.includes("kil")) series.kil.push({ dayInt: r.dayInt, dateLabel, value: bStr(r.kil), isComplete: true });
    if (metrics.includes("di")) series.di.push({ dayInt: r.dayInt, dateLabel, value: String(r.di ?? 0), isComplete: true });
    if (metrics.includes("memberCount")) series.memberCount.push({ dayInt: r.dayInt, dateLabel, value: mMap.get(r.dayInt) ?? 0, isComplete: true });
  }
  res.json({ data: { gid: String(gid), series: serialize(series) } });
}

export async function allianceRoster(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const gid = toInt(req.params.gid);
  if (!wid || !gid) return res.status(400).json({ error: "wid query and gid param are required integers" });
  const page = Math.max(1, toInt(req.query.page) ?? 1);
  const pageSize = Math.min(100, Math.max(1, toInt(req.query.pageSize) ?? 50));
  const latestDay = await latestDayForWid(wid);
  if (!latestDay) return res.json({ data: [], meta: { page, pageSize, total: 0, hasNext: false } });

  const members = await prisma.player_alliance_membership.findMany({
    where: { wid, gid, dayInt: latestDay },
    select: { pid: true },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const total = await prisma.player_alliance_membership.count({ where: { wid, gid, dayInt: latestDay } });
  const pids = members.map((m) => m.pid);

  const [snap, prev7, memberDays] = await Promise.all([
    prisma.ds_player_snapshots.findMany({ where: { wid, dayInt: latestDay, pid: { in: pids } } }),
    prisma.ds_player_snapshots.findMany({ where: { wid, dayInt: shiftDay(latestDay, -7), pid: { in: pids } } }),
    prisma.player_alliance_membership.groupBy({
      by: ["pid"],
      where: { wid, gid, pid: { in: pids }, dayInt: { lte: latestDay } },
      _count: { _all: true },
    }),
  ]);
  const prevMap = new Map(prev7.map((r) => [r.pid, r]));
  const daysMap = new Map(memberDays.map((m) => [m.pid, m._count._all]));

  const data = snap.map((r) => {
    const p = prevMap.get(r.pid);
    const dPower7 = toBigInt(r.power) - toBigInt(p?.power);
    const dSumkill7 = toBigInt(r.sumkill) - toBigInt(p?.sumkill);
    const killDeath = toBigInt(r.die) === BigInt(0) ? null : Number((toBigInt(r.sumkill) * BigInt(100)) / toBigInt(r.die)) / 100;
    const md = daysMap.get(r.pid) ?? 0;
    return {
      pid: String(r.pid),
      nick: r.nick ?? `PID ${r.pid}`,
      level: r.lv,
      power: bStr(r.power),
      sumkill: bStr(r.sumkill),
      die: bStr(r.die),
      dPower7d: dPower7.toString(),
      dSumkill7d: dSumkill7.toString(),
      killDeath,
      memberDays: md,
      role: md >= 30 ? "core" : "new",
    };
  });

  res.json({ data: serialize(data), meta: { page, pageSize, total, hasNext: page * pageSize < total } });
}

export async function allianceTransfers(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const gid = toInt(req.params.gid);
  const fromDay = toInt(req.query.fromDay);
  const toDay = toInt(req.query.toDay);
  const type = typeof req.query.type === "string" ? req.query.type : "all";
  if (!wid || !gid || !fromDay || !toDay) return res.status(400).json({ error: "wid, gid, fromDay, toDay are required integers" });

  const rows = await prisma.player_alliance_membership.findMany({
    where: { wid, dayInt: { gte: shiftDay(fromDay, -1), lte: toDay } },
    orderBy: [{ pid: "asc" }, { dayInt: "asc" }],
    select: { pid: true, dayInt: true, gid: true, gnick: true },
  });
  const players = await prisma.players.findMany({
    where: { wid },
    select: { pid: true, nick: true },
  });
  const nickMap = new Map(players.map((p) => [p.pid, p.nick ?? `PID ${p.pid}`]));

  const events: any[] = [];
  let prevByPid = new Map<number, { gid: number; gnick: string | null; dayInt: number }>();
  for (const r of rows) {
    const prev = prevByPid.get(r.pid);
    if (prev && prev.gid !== r.gid && r.dayInt >= fromDay && r.dayInt <= toDay) {
      const involves = prev.gid === gid || r.gid === gid;
      if (involves) {
        const eventType = r.gid === gid ? "in" : "out";
        if (type === "all" || type === eventType) {
          events.push({
            pid: String(r.pid),
            nick: nickMap.get(r.pid) ?? `PID ${r.pid}`,
            fromGid: String(prev.gid),
            fromGnick: prev.gnick,
            toGid: String(r.gid),
            toGnick: r.gnick,
            dayInt: r.dayInt,
            type: eventType,
          });
        }
      }
    }
    prevByPid.set(r.pid, { gid: r.gid, gnick: r.gnick, dayInt: r.dayInt });
  }

  res.json({ data: { gid: String(gid), events: events.sort((a, b) => b.dayInt - a.dayInt) } });
}

export async function allianceActions(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const gid = toInt(req.params.gid);
  if (!wid || !gid) return problem(res, 400, "wid query and gid param are required integers", req.originalUrl);

  const latestDay = await latestAllianceDay(wid);
  if (!latestDay) return res.json({ data: { gid: String(gid), actions: [] } });

  const fromDay = toInt(req.query.fromDay) ?? shiftDay(latestDay, -30);
  const toDay = toInt(req.query.toDay) ?? latestDay;

  const rows = await prisma.alliance_snapshot.findMany({
    where: { wid, gid, dayInt: { gte: shiftDay(fromDay, -1), lte: toDay } },
    orderBy: { dayInt: "asc" },
    select: { dayInt: true, owner: true, di: true, cDi: true, power: true, cPower: true, kil: true, cKil: true },
  });

  const actions: Array<Record<string, unknown>> = [];
  if (rows.length < 2) {
    const grouped = await prisma.ds_player_snapshots.groupBy({
      by: ["dayInt"],
      where: { wid, gid, dayInt: { gte: shiftDay(fromDay, -1), lte: toDay } },
      _sum: { maxpower: true, sumkill: true },
      _count: { _all: true },
      orderBy: { dayInt: "asc" },
    });

    let prevG: (typeof grouped)[number] | null = null;
    for (const g of grouped) {
      if (!prevG) {
        prevG = g;
        continue;
      }
      if (g.dayInt < fromDay || g.dayInt > toDay) {
        prevG = g;
        continue;
      }

      if ((g._count._all ?? 0) !== (prevG._count._all ?? 0)) {
        actions.push({
          type: "member_count_changed",
          dayInt: g.dayInt,
          from: prevG._count._all ?? 0,
          to: g._count._all ?? 0,
          delta: (g._count._all ?? 0) - (prevG._count._all ?? 0),
          title: "Смена количества участников",
        });
      }

      const prevPower = toBigInt(prevG._sum.maxpower);
      const curPower = toBigInt(g._sum.maxpower);
      if (curPower !== prevPower) {
        actions.push({
          type: "power_changed",
          dayInt: g.dayInt,
          delta: (curPower - prevPower).toString(),
          title: "Изменение истинной силы альянса (maxpower)",
        });
      }

      prevG = g;
    }

    return res.json({ data: { gid: String(gid), fromDay, toDay, actions: actions.sort((a, b) => Number((b.dayInt ?? 0)) - Number((a.dayInt ?? 0))) } });
  }

  let prev: (typeof rows)[number] | null = null;
  for (const r of rows) {
    if (!prev) {
      prev = r;
      continue;
    }
    if (r.dayInt < fromDay || r.dayInt > toDay) {
      prev = r;
      continue;
    }

    if ((prev.owner ?? "").trim() !== (r.owner ?? "").trim()) {
      actions.push({
        type: "leader_changed",
        dayInt: r.dayInt,
        from: prev.owner ?? null,
        to: r.owner ?? null,
        title: "Смена лидера",
      });
    }

    const prevTerr = prev.di ?? 0;
    const curTerr = r.di ?? 0;
    if (prevTerr !== curTerr) {
      actions.push({
        type: "territory_changed",
        dayInt: r.dayInt,
        from: prevTerr,
        to: curTerr,
        delta: curTerr - prevTerr,
        title: "Смена количества территорий",
      });
    } else if ((r.cDi ?? 0) !== 0) {
      actions.push({
        type: "territory_changed",
        dayInt: r.dayInt,
        from: prevTerr,
        to: curTerr,
        delta: r.cDi ?? 0,
        title: "Смена количества территорий",
      });
    }

    if ((r.cPower ?? BigInt(0)) !== BigInt(0)) {
      actions.push({
        type: "power_changed",
        dayInt: r.dayInt,
        delta: bStr(r.cPower),
        title: "Изменение силы альянса",
      });
    }

    if ((r.cKil ?? BigInt(0)) !== BigInt(0)) {
      actions.push({
        type: "kills_changed",
        dayInt: r.dayInt,
        delta: bStr(r.cKil),
        title: "Изменение киллов альянса",
      });
    }

    prev = r;
  }

  res.json({ data: { gid: String(gid), fromDay, toDay, actions: actions.sort((a, b) => Number((b.dayInt ?? 0)) - Number((a.dayInt ?? 0))) } });
}

export async function rankingsPlayers(req: Request, res: Response) {
  const limit = String(Math.min(100, Math.max(1, toInt(req.query.limit) ?? 10)));
  const metric = typeof req.query.metric === "string" ? req.query.metric : "power";
  const sortByMetric: Record<string, string> = {
    power: "power:desc",
    sumkill: "sumkill:desc",
    score: "score:desc",
    die: "die:desc",
    d_power_7d: "d_power:desc",
    d_sumkill_7d: "d_sumkill:desc",
    killDeath_7d: "killDeath:desc",
  };
  (req.query as any).page = "1";
  (req.query as any).pageSize = limit;
  (req.query as any).window = "7d";
  (req.query as any).sort = sortByMetric[metric] ?? "power:desc";
  await players(req, res);
}

export async function rankingsAlliances(req: Request, res: Response) {
  const limit = String(Math.min(100, Math.max(1, toInt(req.query.limit) ?? 10)));
  const metric = typeof req.query.metric === "string" ? req.query.metric : "power";
  const sortByMetric: Record<string, string> = {
    power: "power:desc",
    kil: "kil:desc",
    di: "di:desc",
    d_power_7d: "d_power:desc",
    d_kil_7d: "d_kil:desc",
    retentionRate_7d: "retentionRate7d:desc",
    memberCount: "memberCount:desc",
  };
  (req.query as any).page = "1";
  (req.query as any).pageSize = limit;
  (req.query as any).window = "7d";
  (req.query as any).sort = sortByMetric[metric] ?? "power:desc";
  await alliances(req, res);
}

export async function search(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const types = typeof req.query.types === "string" ? req.query.types.split(",").map((x) => x.trim()) : ["player", "alliance"];
  if (!wid || !q) return problem(res, 400, "wid and q are required", req.originalUrl, "#/query/wid");

  const out: any[] = [];
  const latestPlayerDay = await latestDayForWid(wid);
  if (types.includes("player") && latestPlayerDay) {
    const rows = await prisma.ds_player_snapshots.findMany({
      where: { wid, dayInt: latestPlayerDay, nick: { contains: q, mode: "insensitive" } },
      orderBy: { power: "desc" },
      take: 20,
    });
    for (const r of rows) {
      out.push({
        type: "player",
        wid,
        id: String(r.pid),
        label: r.nick ?? `PID ${r.pid}`,
        subLabel: `${r.gnick ?? "NO ALLY"} • power ${bStr(r.power)}`,
        href: `/worlds/${wid}/players/${r.pid}`,
      });
    }
  }

  const latestAlliance = await latestAllianceDay(wid);
  if (types.includes("alliance") && latestAlliance) {
    const hasSnapshot = (await prisma.alliance_snapshot.count({ where: { wid, dayInt: latestAlliance } })) > 0;
    if (hasSnapshot) {
      const rows = await prisma.alliance_snapshot.findMany({
        where: { wid, dayInt: latestAlliance, owner: { contains: q, mode: "insensitive" } },
        orderBy: { power: "desc" },
        take: 20,
      });
      for (const r of rows) {
        out.push({
          type: "alliance",
          wid,
          id: String(r.gid),
          label: `Alliance ${r.gid}`,
          subLabel: `${r.owner ?? "Owner"} • power ${bStr(r.power)}`,
          href: `/worlds/${wid}/alliances/${r.gid}`,
        });
      }
    } else {
      const rows = await prisma.ds_player_snapshots.groupBy({
        by: ["gid", "gnick"],
        where: { wid, dayInt: latestAlliance, gid: { not: null }, gnick: { contains: q, mode: "insensitive" } },
        _sum: { power: true },
        _count: { _all: true },
      });
      rows.sort((a, b) => (toBigInt(a._sum.power) === toBigInt(b._sum.power) ? 0 : (toBigInt(a._sum.power) > toBigInt(b._sum.power) ? 1 : -1)) * -1);
      for (const r of rows.slice(0, 20)) {
        out.push({
          type: "alliance",
          wid,
          id: String(r.gid),
          label: r.gnick ?? `Alliance ${r.gid}`,
          subLabel: `members ${r._count._all} • power ${bStr(r._sum.power)}`,
          href: `/worlds/${wid}/alliances/${r.gid}`,
        });
      }
    }
  }

  res.json({ data: out.slice(0, 30) });
}

export async function comparePlayers(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const pidsRaw = typeof req.query.pids === "string" ? req.query.pids : "";
  if (!wid || !pidsRaw) return res.status(400).json({ error: "wid and pids are required" });
  const pids = pidsRaw.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x));
  const latestDay = await latestDayForWid(wid);
  if (!latestDay) return res.json({ data: [] });
  const data = await Promise.all(pids.map((pid) => buildPlayerCard(wid, pid, latestDay, 7)));
  res.json({ data: serialize(data.filter(Boolean)) });
}

export async function compareAlliances(req: Request, res: Response) {
  const wid = toInt(req.query.wid);
  const gidsRaw = typeof req.query.gids === "string" ? req.query.gids : "";
  if (!wid || !gidsRaw) return res.status(400).json({ error: "wid and gids are required" });
  const gids = gidsRaw.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x));
  const latestDay = await latestAllianceDay(wid);
  if (!latestDay) return res.json({ data: [] });
  const data = await Promise.all(gids.map((gid) => buildAllianceCard(wid, gid, latestDay)));
  res.json({ data: serialize(data.filter(Boolean)) });
}
