import { Worker, Job } from "bullmq";
import { bullConnection } from "../bullmq/connection.js";
import { prisma } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";

const prefix = process.env.BULL_PREFIX ?? "warpath";
const concurrency = Number(process.env.PROCESS_CONCURRENCY ?? 5);

const log = getLogger("process");

type ProcessJobData = { fetchRunId: string };

type CityDayAgg = {
  playerCount: number;
  allianceIds: Set<number>;
  totalPower: bigint;
  totalSumkill: bigint;
  totalDie: bigint;
  totalScore: bigint;
  totalCaiji: bigint;
  totalGx: bigint;
  totalBz: bigint;
};

function addBigInt(base: bigint, v: bigint | null | undefined): bigint {
  return base + (v ?? 0n);
}

// ---------- existing: alliance dataset builder ----------
export async function buildAllianceHistoryDataset(wid: number, gid: number) {
  const rows = await prisma.alliance_snapshot.findMany({
    where: { wid, gid },
    orderBy: { dayInt: "asc" },
    select: { dayInt: true, power: true, kil: true, di: true, cPower: true, cKil: true, cDi: true },
  });

  const series = rows.map((r) => ({
    day: r.dayInt,
    power: r.power?.toString() ?? null,
    kil: r.kil?.toString() ?? null,
    di: r.di ?? null,
    cPower: r.cPower?.toString() ?? null,
    cKil: r.cKil?.toString() ?? null,
    cDi: r.cDi ?? null,
  }));

  const data = { wid, gid, series };

  await prisma.ds_alliance_history.upsert({
    where: { wid_gid_version: { wid, gid, version: 1 } },
    create: { wid, gid, version: 1, data: data as any },
    update: { data: data as any, builtAt: new Date() },
  });

  return { count: series.length };
}

async function processGuildDetail(fetchRunId: string) {
  const run = await prisma.fetch_runs.findUnique({ where: { id: fetchRunId } });
  if (!run) throw new Error("FetchRun not found");

  const data = await prisma.raw_guild_detail.findMany({
    where: { fetchRunId: run.id },
  });

  for (const row of data) {
    const wid = row.wid;
    const gid = row.gid;
    const dayInt = row.dayInt;

    await prisma.alliance_snapshot.upsert({
      where: { wid_gid_dayInt: { wid, gid, dayInt } },
      create: {
        wid,
        gid,
        dayInt,
        power: row.power ?? null,
        kil: row.kil ?? null,
        di: row.di ?? null,
        owner: row.owner ?? null,
        cPower: row.cPower ?? null,
        cKil: row.cKil ?? null,
        cDi: row.cDi ?? null,
        createdAt: row.createdAt ?? null,
      },
      update: {
        power: row.power ?? null,
        kil: row.kil ?? null,
        di: row.di ?? null,
        owner: row.owner ?? null,
        cPower: row.cPower ?? null,
        cKil: row.cKil ?? null,
        cDi: row.cDi ?? null,
        createdAt: row.createdAt ?? null,
      },
    });
  }

  const wid = run.wid ?? data[0]?.wid;
  const gid = run.gid ?? data[0]?.gid;
  if (!wid || !gid) throw new Error("Cannot infer wid/gid for dataset");

  const out = await buildAllianceHistoryDataset(wid, gid);
  return { wid, gid, ...out };
}

// ---------- new: server rank day processor ----------
async function processServerRankDay(fetchRunId: string) {

  const run = await prisma.fetch_runs.findUnique({ where: { id: fetchRunId } });
  if (!run) throw new Error("FetchRun not found");

  const rows = await prisma.raw_rank_pid.findMany({
    where: { fetchRunId: run.id },
  });

  const wid = run.wid ?? rows?.[0]?.wid;
  const dayInt = run.dayInt ?? rows?.[0]?.dayInt;
  if (!wid || !dayInt) throw new Error("Cannot infer wid/dayInt for server rank day");

  log.info({ fetchRunId, wid, dayInt, rows: rows.length }, "[process] server_rank_day start");
  let count = 0;
  const cityAgg = new Map<number, CityDayAgg>();

  for (const r of rows) {
    const pid = r.pid;
    if (!pid) continue;

    const gid = r.gid ?? null;
    const gnick = r.gnick ?? null;
    const cid = typeof r.cid === "number" ? r.cid : null;
    const ccid = typeof r.ccid === "number" ? r.ccid : null;

    // 1) player (справочник)
    await prisma.players.upsert({
      where: { wid_pid: { wid, pid } },
      create: {
        wid,
        pid,
        nick: r.nick ?? null,
        lv: typeof r.lv === "number" ? r.lv : null,
        firstSeen: new Date(),
        lastSeen: new Date(),
      },
      update: {
        // ✅ если поля нет — не трогаем старое
        nick: r.nick ?? undefined,
        lv: typeof r.lv === "number" ? r.lv : undefined,
        lastSeen: new Date(),
      },
    });

    // 2) snapshot на день (ДУБЛИРУЕМ gid/gnick)
    await prisma.ds_player_snapshots.upsert({
  where: { wid_pid_dayInt: { wid, pid, dayInt } },
  create: {
    wid,
    pid,
    dayInt,
    gid,
    gnick,
    cid,
    ccid,
    nick: r.nick ?? null,
    lv: typeof r.lv === "number" ? r.lv : null,
    power: r.power ?? null,
    maxpower: r.maxpower ?? null,
    sumkill: r.sumkill ?? null,
    die: r.die ?? null,
    score: r.score ?? null,
    caiji: r.caiji ?? null,
    allianceTechContribution: r.gx ?? null,
    allianceHelp: r.bz ?? null,
    createdAt: r.createdAt ?? null,
  },
  update: {
    gid,
    gnick: r.gnick ?? undefined,
    cid,
    ccid,
    nick: r.nick ?? undefined,
    lv: typeof r.lv === "number" ? r.lv : undefined,
    power: r.power ?? null,
    maxpower: r.maxpower ?? null,
    sumkill: r.sumkill ?? null,
    die: r.die ?? null,
    score: r.score ?? null,
    caiji: r.caiji ?? null,
    allianceTechContribution: r.gx ?? null,
    allianceHelp: r.bz ?? null,
    createdAt: r.createdAt ?? null,
  },
});

    // 3) membership на день (если gid есть)
    if (gid) {
      await prisma.player_alliance_membership.upsert({
        where: { wid_pid_dayInt: { wid, pid, dayInt } },
        create: { wid, pid, dayInt, gid, gnick },
        update: { gid, gnick: r.gnick ?? undefined },
      });
    }

    if (ccid !== null) {
      let agg = cityAgg.get(ccid);
      if (!agg) {
        agg = {
          playerCount: 0,
          allianceIds: new Set<number>(),
          totalPower: 0n,
          totalSumkill: 0n,
          totalDie: 0n,
          totalScore: 0n,
          totalCaiji: 0n,
          totalGx: 0n,
          totalBz: 0n,
        };
        cityAgg.set(ccid, agg);
      }

      agg.playerCount += 1;
      if (gid !== null) agg.allianceIds.add(gid);
      agg.totalPower = addBigInt(agg.totalPower, r.power);
      agg.totalSumkill = addBigInt(agg.totalSumkill, r.sumkill);
      agg.totalDie = addBigInt(agg.totalDie, r.die);
      agg.totalScore = addBigInt(agg.totalScore, r.score);
      agg.totalCaiji = addBigInt(agg.totalCaiji, r.caiji);
      agg.totalGx = addBigInt(agg.totalGx, r.gx);
      agg.totalBz = addBigInt(agg.totalBz, r.bz);
    }

    count++;
  }

  for (const [ccid, agg] of cityAgg.entries()) {
    await prisma.ds_city_daily_stats.upsert({
      where: { wid_dayInt_ccid: { wid, dayInt, ccid } },
      create: {
        wid,
        dayInt,
        ccid,
        playerCount: agg.playerCount,
        allianceCount: agg.allianceIds.size,
        totalPower: agg.totalPower,
        totalSumkill: agg.totalSumkill,
        totalDie: agg.totalDie,
        totalScore: agg.totalScore,
        totalCaiji: agg.totalCaiji,
        totalGx: agg.totalGx,
        totalBz: agg.totalBz,
      },
      update: {
        playerCount: agg.playerCount,
        allianceCount: agg.allianceIds.size,
        totalPower: agg.totalPower,
        totalSumkill: agg.totalSumkill,
        totalDie: agg.totalDie,
        totalScore: agg.totalScore,
        totalCaiji: agg.totalCaiji,
        totalGx: agg.totalGx,
        totalBz: agg.totalBz,
        builtAt: new Date(),
      },
    });
  }

  return { wid, dayInt, count, cityCount: cityAgg.size };
}

// ---------- router ----------
async function handleProcess(job: Job<ProcessJobData>) {
  if (job.name === "PROCESS_GUILD_DETAIL") {
    return await processGuildDetail(job.data.fetchRunId);
  }

  if (job.name === "PROCESS_SERVER_RANK_DAY") {
    return await processServerRankDay(job.data.fetchRunId);
  }

  throw new Error(`Unknown process job name: ${job.name}`);
}

export function startProcessWorker() {
  const worker = new Worker<ProcessJobData>("process", handleProcess, {
    connection: bullConnection(),
    prefix,
    concurrency,
  });

  worker.on("failed", (job, err) => console.error("[process-worker] failed", job?.name, err));
  console.log(`[process-worker] started, concurrency=${concurrency}`);
  return worker;
}

startProcessWorker();
