import { Worker, Job } from "bullmq";
import { bullConnection } from "../bullmq/connection.js";
import { prisma } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";

const prefix = process.env.BULL_PREFIX ?? "warpath";
const concurrency = Number(process.env.PROCESS_CONCURRENCY ?? 5);

const log = getLogger("process");

type ProcessJobData = { fetchRunId: string };

function toBigIntOrNull(v: any): bigint | null {
  if (v === null || v === undefined) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

// ---------- existing: alliance dataset builder ----------
export async function buildAllianceHistoryDataset(wid: number, gid: number) {
  const rows = await prisma.allianceSnapshot.findMany({
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

  await prisma.datasetAllianceHistory.upsert({
    where: { wid_gid_version: { wid, gid, version: 1 } },
    create: { wid, gid, version: 1, data: data as any },
    update: { data: data as any, builtAt: new Date() },
  });

  return { count: series.length };
}

async function processGuildDetail(fetchRunId: string) {
  const run = await prisma.fetchRun.findUnique({
    where: { id: fetchRunId },
    include: { rawPayload: true },
  });
  if (!run?.rawPayload) throw new Error("FetchRun/rawPayload not found");

  const payload: any = run.rawPayload.payload;
  const data: any[] = Array.isArray(payload?.Data) ? payload.Data : [];

  for (const row of data) {
    const wid = Number(row.wid);
    const gid = Number(row.gid);
    const dayInt = Number(row.day);

    await prisma.allianceSnapshot.upsert({
      where: { wid_gid_dayInt: { wid, gid, dayInt } },
      create: {
        wid,
        gid,
        dayInt,
        power: toBigIntOrNull(row.power),
        kil: toBigIntOrNull(row.kil),
        di: row.di ?? null,
        owner: row.owner ?? null,
        cPower: toBigIntOrNull(row.c_power),
        cKil: toBigIntOrNull(row.c_kil),
        cDi: row.c_di ?? null,
        createdAt: row.created_at ? new Date(row.created_at) : null,
      },
      update: {
        power: toBigIntOrNull(row.power),
        kil: toBigIntOrNull(row.kil),
        di: row.di ?? null,
        owner: row.owner ?? null,
        cPower: toBigIntOrNull(row.c_power),
        cKil: toBigIntOrNull(row.c_kil),
        cDi: row.c_di ?? null,
        createdAt: row.created_at ? new Date(row.created_at) : null,
      },
    });
  }

  const wid = run.wid ?? Number(data?.[0]?.wid);
  const gid = run.gid ?? Number(data?.[0]?.gid);
  if (!wid || !gid) throw new Error("Cannot infer wid/gid for dataset");

  const out = await buildAllianceHistoryDataset(wid, gid);
  return { wid, gid, ...out };
}

// ---------- new: server rank day processor ----------
async function processServerRankDay(fetchRunId: string) {

  const run = await prisma.fetchRun.findUnique({
    where: { id: fetchRunId },
    include: { rawPayload: true },
  });
  if (!run?.rawPayload) throw new Error("FetchRun/rawPayload not found");

  const payload: any = run.rawPayload.payload;
  const rows: any[] = Array.isArray(payload?.Data) ? payload.Data : [];

  const wid = run.wid ?? Number(rows?.[0]?.wid);
  const dayInt = run.dayInt ?? Number(rows?.[0]?.day);
  if (!wid || !dayInt) throw new Error("Cannot infer wid/dayInt for server rank day");

  log.info({ fetchRunId, wid, dayInt, rows: rows.length }, "[process] server_rank_day start");
  let count = 0;

  for (const r of rows) {
    const pid = Number(r.pid);
    if (!pid) continue;

    const gid = Number(r.gid || 0) || null;
    const gnick = r.gnick ?? null;

    // 1) player (справочник)
    await prisma.player.upsert({
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
    await prisma.playerSnapshot.upsert({
  where: { wid_pid_dayInt: { wid, pid, dayInt } },
  create: {
    wid,
    pid,
    dayInt,
    gid,
    gnick,
    nick: r.nick ?? null,
    lv: typeof r.lv === "number" ? r.lv : null,
    power: toBigIntOrNull(r.power),
    maxpower: toBigIntOrNull(r.maxpower),
    sumkill: toBigIntOrNull(r.sumkill),
    die: toBigIntOrNull(r.die),
    score: toBigIntOrNull(r.score),
    caiji: toBigIntOrNull(r.caiji),
    createdAt: r.created_at ? new Date(r.created_at) : null,
  },
  update: {
    gid,
    gnick,
    nick: r.nick ?? undefined,
    lv: typeof r.lv === "number" ? r.lv : undefined,
    power: toBigIntOrNull(r.power),
    maxpower: toBigIntOrNull(r.maxpower),
    sumkill: toBigIntOrNull(r.sumkill),
    die: toBigIntOrNull(r.die),
    score: toBigIntOrNull(r.score),
    caiji: toBigIntOrNull(r.caiji),
    createdAt: r.created_at ? new Date(r.created_at) : null,
  },
});

    // 3) membership на день (если gid есть)
    if (gid) {
      await prisma.playerAllianceMembership.upsert({
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
