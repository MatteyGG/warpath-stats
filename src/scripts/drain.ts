import { fetchQueue, processQueue, schedulerQueue } from "../bullmq/queues.js";

await fetchQueue.drain(true);
await processQueue.drain(true);
await schedulerQueue.drain(true);

console.log("drained");
process.exit(0);