import { Queue } from "bullmq";
import { bullConnection } from "../../bullmq/connection.js";
import { prisma } from "../../lib/db.js";
import { schedulerQueue } from "../../bullmq/queues.js";


const prefix = process.env.BULL_PREFIX ?? "warpath";

const fetchQueue = new Queue("fetch", {
  connection: bullConnection(),
  prefix,
});

export async function enqueueFetch({
  wid,
  gid,
  page = 1,
  perPage = 50,
}: {
  wid: number;
  gid: number;
  page?: number;
  perPage?: number;
}) {
  // первое — убедиться, что запись в tracked_alliance есть
  await prisma.trackedAlliance.upsert({
    where: { wid_gid: { wid, gid } },
    create: { wid, gid },
    update: {},
  });

  // ставим джобу fetch
  const job = await fetchQueue.add(
  "FETCH_GUILD_DETAIL",
  { kind: "GUILD_DETAIL", wid, gid, page, perPage },
  {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: 1000,
  }
);
  console.log("Added job with ID:", job.id);

  return job;
}

type EnqueueServerRankDayArgs = {
  wid: number;
  dayInt: number; // YYYYMMDD
  page?: number;
  perPage?: number;
};

type EnqueueBackfillArgs = {
  wid: number;
  fromDayInt: number; // YYYYMMDD
  toDayInt: number;   // YYYYMMDD
  page?: number;
  perPage?: number;
};

function assertDayInt(dayInt: number) {
  const s = String(dayInt);
  if (!/^\d{8}$/.test(s)) throw new Error(`Invalid dayInt format: ${dayInt} (expected YYYYMMDD)`);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) throw new Error(`Invalid dayInt date parts: ${dayInt}`);
}

function dayIntToUtcDate(dayInt: number): Date {
  assertDayInt(dayInt);
  const s = String(dayInt);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  // защитимся от несуществующих дат (например, 20250230)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Invalid calendar date: ${dayInt}`);
  }
  return dt;
}

function utcDateToDayInt(dt: Date): number {
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  const s = `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
  return Number(s);
}

function* iterDayInts(fromDayInt: number, toDayInt: number) {
  const start = dayIntToUtcDate(fromDayInt);
  const end = dayIntToUtcDate(toDayInt);

  if (start > end) throw new Error("fromDayInt must be <= toDayInt");

  const cur = new Date(start);
  while (cur <= end) {
    yield utcDateToDayInt(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

// BullMQ: jobId уникален в рамках очереди; если job с таким id уже существует,
// добавление будет проигнорировано. :contentReference[oaicite:2]{index=2}
// jobId не должен содержать ":" — используем "-". :contentReference[oaicite:3]{index=3}
function serverRankJobId(wid: number, dayInt: number) {
  return `server-${wid}-day-${dayInt}`;
}

export async function enqueueServerRankDay({
  wid,
  dayInt,
  page = 1,
  perPage = 3000,
}: EnqueueServerRankDayArgs) {
  assertDayInt(dayInt);

  const job = await fetchQueue.add(
    "FETCH_SERVER_RANK_DAY",
    { kind: "SERVER_RANK_DAY", wid, dayInt, page, perPage },
    {
      jobId: serverRankJobId(wid, dayInt),
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    }
  );

  return {
    ok: true,
    requested: { wid, dayInt, page, perPage },
    jobId: job.id,
    note:
      "If the same jobId already exists and hasn't been removed yet, BullMQ will ignore the new add (dedup).",
  };
}

export async function enqueueServerRankBackfill({
  wid,
  fromDayInt,
  toDayInt,
  page = 1,
  perPage = 3000,
}: EnqueueBackfillArgs) {
  // валидируем как даты
  dayIntToUtcDate(fromDayInt);
  dayIntToUtcDate(toDayInt);

  const items = Array.from(iterDayInts(fromDayInt, toDayInt)).map((dayInt) => ({
    name: "FETCH_SERVER_RANK_DAY",
    data: { kind: "SERVER_RANK_DAY", wid, dayInt, page, perPage },
    opts: {
      jobId: serverRankJobId(wid, dayInt),
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    },
  }));

  // addBulk быстрее — меньше roundtrips в Redis :contentReference[oaicite:4]{index=4}
  await fetchQueue.addBulk(items);

  return {
    ok: true,
    requested: { wid, fromDayInt, toDayInt, page, perPage },
    requestedJobs: items.length,
    note:
      "Jobs are deduped by jobId per day; existing jobs with same jobId will be ignored by BullMQ.",
  };
}

// Ручной триггер scheduler-логики: просто ставим job в очередь "scheduler"
export async function enqueueSyncLatest() {
  const job = await schedulerQueue.add(
    "SYNC_SERVER_DAYS",
    {},
    {
      // jobId без ":" — safe
      jobId: `manual-sync-${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: 1000,
    }
  );

  return job;
}