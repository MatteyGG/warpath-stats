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
  | { kind: "SERVER_RANK_DAY"; wid: number; dayInt: number; perPage?: number; page?: number };

async function handleFetch(job: Job<FetchJobData>) {
  const startedAt = new Date();

  const run = await prisma.fetchRun.create({
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

      await prisma.rawPayload.create({ data: { fetchRunId: run.id, payload: payload as any } });
      await prisma.fetchRun.update({ where: { id: run.id }, data: { status: "SUCCESS", httpStatus, finishedAt: new Date() } });

      await processQueue.add("PROCESS_GUILD_DETAIL", { fetchRunId: run.id }, { removeOnComplete: true, removeOnFail: 1000 });
      return { fetchRunId: run.id };
    }

    if (job.data.kind === "SERVER_RANK_DAY") {
      const { payload, httpStatus } = await fetchRankPidDay(
        job.data.wid,
        job.data.dayInt,
        job.data.perPage ?? 3000,
        job.data.page ?? 1
      );

      await prisma.rawPayload.create({ data: { fetchRunId: run.id, payload: payload as any } });
      await prisma.fetchRun.update({ where: { id: run.id }, data: { status: "SUCCESS", httpStatus, finishedAt: new Date() } });

      await processQueue.add("PROCESS_SERVER_RANK_DAY", { fetchRunId: run.id }, { removeOnComplete: true, removeOnFail: 1000 });
      return { fetchRunId: run.id };
    }

    throw new Error("Unknown fetch job kind");
  } catch (e: any) {
    await prisma.fetchRun.update({
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
