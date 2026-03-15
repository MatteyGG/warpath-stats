import { Worker, Job } from "bullmq";
import { bullConnection } from "../bullmq/connection.js";
import { fetchGuildDetail, fetchRankPidDay } from "../integrations/warpath/warpath.client.js";
import { prisma } from "../lib/db.js";
import { processQueue } from "../bullmq/queues.js";
import { getLogger } from "../lib/logger.js";

const prefix = process.env.BULL_PREFIX ?? "warpath";
const concurrency = Number(process.env.FETCH_CONCURRENCY ?? 10);
const log = getLogger("fetch");
type FetchJobData =
  | { kind: "GUILD_DETAIL"; wid: number; gid: number; perPage?: number; page?: number }
  | { kind: "SERVER_RANK_DAY"; wid: number; dayInt: number; ccid?: number; perPage?: number; page?: number };

function toBigIntOrNull(v: any): bigint | null {
  if (v === null || v === undefined) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

async function handleFetch(job: Job<FetchJobData>) {
  const startedAt = new Date();

  const run = await prisma.fetch_runs.create({
    data: {
      resource: job.data.kind === "SERVER_RANK_DAY" ? "SERVER_SCAN" : "ALLIANCE_DETAIL",
      wid: job.data.wid,
      gid: job.data.kind === "GUILD_DETAIL" ? job.data.gid : null,
      dayInt: job.data.kind === "SERVER_RANK_DAY" ? job.data.dayInt : null,
      page: job.data.page ?? null,
      perPage: job.data.perPage ?? null,
      status: "PENDING",
      attempt: job.attemptsMade ?? 0,
      startedAt,
    },
  });

  try {
    if (job.data.kind === "GUILD_DETAIL") {
      const { payload, httpStatus } = await fetchGuildDetail(job.data.gid, job.data.perPage ?? 50, job.data.page ?? 1);

      const rows: any[] = Array.isArray(payload?.Data) ? payload.Data : [];
      for (const row of rows) {
        const wid = Number(row.wid);
        const gid = Number(row.gid);
        const dayInt = Number(row.day);

        await prisma.raw_guild_detail.upsert({
          where: { wid_gid_dayInt: { wid, gid, dayInt } },
          create: {
            wid,
            gid,
            dayInt,
            power: toBigIntOrNull(row.power),
            kil: toBigIntOrNull(row.kil),
            di: row.di ?? null,
            owner: row.owner ?? null,
            sname: row.sname ?? null,
            fname: row.fname ?? null,
            cPower: toBigIntOrNull(row.c_power),
            cKil: toBigIntOrNull(row.c_kil),
            cDi: row.c_di ?? null,
            createdAt: row.created_at ? new Date(row.created_at) : null,
            fetchRunId: run.id,
            fetchedAt: new Date(),
          },
          update: {
            power: toBigIntOrNull(row.power),
            kil: toBigIntOrNull(row.kil),
            di: row.di ?? null,
            owner: row.owner ?? null,
            sname: row.sname ?? null,
            fname: row.fname ?? null,
            cPower: toBigIntOrNull(row.c_power),
            cKil: toBigIntOrNull(row.c_kil),
            cDi: row.c_di ?? null,
            createdAt: row.created_at ? new Date(row.created_at) : null,
            fetchRunId: run.id,
            fetchedAt: new Date(),
          },
        });
      }

      await prisma.fetch_runs.update({ where: { id: run.id }, data: { status: "SUCCESS", httpStatus, finishedAt: new Date() } });

      await processQueue.add("PROCESS_GUILD_DETAIL", { fetchRunId: run.id }, { removeOnComplete: true, removeOnFail: 1000 });
      return { fetchRunId: run.id };
    }

    if (job.data.kind === "SERVER_RANK_DAY") {
      const { payload, httpStatus } = await fetchRankPidDay(
        job.data.wid,
        job.data.dayInt,
        job.data.perPage ?? 3000,
        job.data.page ?? 1,
        job.data.ccid ?? 0
      );

      const rows: any[] = Array.isArray(payload?.Data) ? payload.Data : [];
      for (const r of rows) {
        const wid = Number(r.wid);
        const dayInt = Number(r.day);
        const pid = Number(r.pid);
        if (!wid || !dayInt || !pid) continue;

        await prisma.raw_rank_pid.upsert({
          where: { wid_dayInt_pid: { wid, dayInt, pid } },
          create: {
            wid,
            dayInt,
            pid,
            gid: typeof r.gid === "number" ? r.gid : null,
            gnick: r.gnick ?? null,
            cid: typeof r.cid === "number" ? r.cid : null,
            ccid: typeof r.ccid === "number" ? r.ccid : null,
            lv: typeof r.lv === "number" ? r.lv : null,
            nick: r.nick ?? null,
            power: toBigIntOrNull(r.power),
            maxpower: toBigIntOrNull(r.maxpower),
            sumkill: toBigIntOrNull(r.sumkill),
            score: toBigIntOrNull(r.score),
            die: toBigIntOrNull(r.die),
            caiji: toBigIntOrNull(r.caiji),
            gx: toBigIntOrNull(r.gx),
            bz: toBigIntOrNull(r.bz),
            cPower: toBigIntOrNull(r.c_power),
            cDie: toBigIntOrNull(r.c_die),
            cScore: toBigIntOrNull(r.c_score),
            cSumkill: toBigIntOrNull(r.c_sumkill),
            cCaiji: toBigIntOrNull(r.c_caiji),
            kills: Array.isArray(r.kills) ? r.kills.map((v: any) => Number(v)) : [],
            createdAt: r.created_at ? new Date(r.created_at) : null,
            fetchRunId: run.id,
            fetchedAt: new Date(),
          },
          update: {
            gid: typeof r.gid === "number" ? r.gid : null,
            gnick: r.gnick ?? null,
            cid: typeof r.cid === "number" ? r.cid : null,
            ccid: typeof r.ccid === "number" ? r.ccid : null,
            lv: typeof r.lv === "number" ? r.lv : null,
            nick: r.nick ?? null,
            power: toBigIntOrNull(r.power),
            maxpower: toBigIntOrNull(r.maxpower),
            sumkill: toBigIntOrNull(r.sumkill),
            score: toBigIntOrNull(r.score),
            die: toBigIntOrNull(r.die),
            caiji: toBigIntOrNull(r.caiji),
            gx: toBigIntOrNull(r.gx),
            bz: toBigIntOrNull(r.bz),
            cPower: toBigIntOrNull(r.c_power),
            cDie: toBigIntOrNull(r.c_die),
            cScore: toBigIntOrNull(r.c_score),
            cSumkill: toBigIntOrNull(r.c_sumkill),
            cCaiji: toBigIntOrNull(r.c_caiji),
            kills: Array.isArray(r.kills) ? r.kills.map((v: any) => Number(v)) : [],
            createdAt: r.created_at ? new Date(r.created_at) : null,
            fetchRunId: run.id,
            fetchedAt: new Date(),
          },
        });
      }

      await prisma.fetch_runs.update({ where: { id: run.id }, data: { status: "SUCCESS", httpStatus, finishedAt: new Date() } });

      await processQueue.add("PROCESS_SERVER_RANK_DAY", { fetchRunId: run.id }, { removeOnComplete: true, removeOnFail: 1000 });
      return { fetchRunId: run.id };
    }

    throw new Error("Unknown fetch job kind");
  } catch (e: any) {
    await prisma.fetch_runs.update({
      where: { id: run.id },
      data: { status: "FAILED", error: String(e?.message ?? e), finishedAt: new Date() },
    });
    throw e;
  }
}

export function startFetchWorker() {
  const worker = new Worker("fetch", handleFetch, {
    connection: bullConnection(),
    prefix,
    concurrency,
  });

  worker.on("active", (job) => {
    log.info({ jobId: job.id, name: job.name, data: job.data }, "[fetch] active");
  });

  worker.on("completed", (job, result) => {
    log.info({ jobId: job?.id, name: job?.name, result }, "[fetch] completed");
  });

  worker.on("failed", (job, err) => {
    log.error(
      { jobId: job?.id, name: job?.name, err: { message: err.message, stack: err.stack } },
      "[fetch] failed"
    );
  });

  worker.on("stalled", (jobId) => {
    log.warn({ jobId }, "[fetch] stalled");
  });

  worker.on("error", (err) => {
    log.error({ err: { message: err.message, stack: err.stack } }, "[fetch] error");
  });

  log.info({ concurrency }, "[fetch] started");
  return worker;
}

startFetchWorker();
