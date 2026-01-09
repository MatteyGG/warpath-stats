import { Worker } from "bullmq";
import { schedulerQueue, fetchQueue } from "../bullmq/queues.js";
import { bullConnection } from "../bullmq/connection.js";
import { prisma } from "../lib/db.js";
import { fetchTotalLatestDay } from "../integrations/warpath/warpath.client.js";

const prefix = process.env.BULL_PREFIX ?? "warpath";
const pattern = process.env.DAILY_PATTERN ?? "0 15 3 * * *";

async function register() {
  await schedulerQueue.upsertJobScheduler(
    "daily-scan-tracked-alliances",
    { pattern },
    {
      name: "SCAN_TRACKED_ALLIANCES",
      data: {},
      opts: { removeOnComplete: true, removeOnFail: 1000 },
    }
  );

  await schedulerQueue.upsertJobScheduler(
    "daily-sync-server-days",
    { pattern },
    {
      name: "SYNC_SERVER_DAYS",
      data: {},
      opts: { removeOnComplete: true, removeOnFail: 1000 },
    }
  );

  console.log(`[scheduler] registered job schedulers pattern=${pattern}`);
}

async function startWorker() {
  const worker = new Worker(
    "scheduler",
    async (job) => {
      if (job.name === "SCAN_TRACKED_ALLIANCES") {
        const alliances = await prisma.trackedAlliance.findMany({
          where: { enabled: true },
          select: { wid: true, gid: true },
        });

        await fetchQueue.addBulk(
          alliances.map((a) => ({
            name: "FETCH_GUILD_DETAIL",
            data: { kind: "GUILD_DETAIL", wid: a.wid, gid: a.gid, perPage: 50, page: 1 },
            opts: {
              attempts: 5,
              backoff: { type: "exponential", delay: 1000 },
              removeOnComplete: true,
              removeOnFail: 1000,
              jobId: `alliance-${a.wid}-${a.gid}-day-latest`,
            },
          }))
        );

        return { queued: alliances.length };
      }

      if (job.name === "SYNC_SERVER_DAYS") {
        const remoteLatest = await fetchTotalLatestDay();

        const wids = await prisma.trackedAlliance.findMany({
          where: { enabled: true },
          select: { wid: true },
          distinct: ["wid"],
        });

        const bulk: any[] = [];

        for (const { wid } of wids) {
          const agg = await prisma.fetchRun.aggregate({
            where: { resource: "SERVER_SCAN", status: "SUCCESS", wid },
            _max: { dayInt: true },
          });

          const localLatest = agg._max.dayInt ?? null;

          // MVP-решение: если ничего не собирали — тянем только remoteLatest
          const start = localLatest ? localLatest + 1 : remoteLatest;

          if (start > remoteLatest) continue;

          for (let day = start; day <= remoteLatest; day++) {
            bulk.push({
              name: "FETCH_SERVER_RANK_DAY",
              data: { kind: "SERVER_RANK_DAY", wid, dayInt: day, page: 1, perPage: 3000 },
              opts: {
                jobId: `server-${wid}-day-${day}`, // дедуп по jobId :contentReference[oaicite:5]{index=5}
                attempts: 5,
                backoff: { type: "exponential", delay: 1000 },
                removeOnComplete: true,
                removeOnFail: 1000,
              },
            });
          }
        }

        if (bulk.length) {
          await fetchQueue.addBulk(bulk);
        }

        return { remoteLatest, queued: bulk.length };
      }
    },
    { connection: bullConnection(), prefix, concurrency: 1 }
  );

  worker.on("failed", (job, err) => console.error("[scheduler-worker] failed", job?.name, err));
  console.log("[scheduler] worker started");
}

await register();
await startWorker();
