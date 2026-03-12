import { Worker, Job } from "bullmq";
import { bullConnection } from "../bullmq/connection.js";
import { prisma } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";

const prefix = process.env.BULL_PREFIX ?? "warpath";
const concurrency = Number(process.env.PROCESS_CONCURRENCY ?? 5);

const log = getLogger("process");

type ProcessJobData = { fetchRunId: string };

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

  for (const r of rows) {
    const pid = r.pid;
    if (!pid) continue;

    const gid = r.gid ?? null;
    const gnick = r.gnick ?? null;

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
    gnick,
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
        update: { gid, gnick },
      });
    }

    count++;
  }

  return { wid, dayInt, count };
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
