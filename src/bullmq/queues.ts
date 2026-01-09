import { Queue } from "bullmq";
import { bullConnection } from "./connection.js";

const prefix = process.env.BULL_PREFIX ?? "warpath";

export const fetchQueue = new Queue("fetch", {
  connection: bullConnection(),
  prefix,
});

export const processQueue = new Queue("process", {
  connection: bullConnection(),
  prefix,
});

export const schedulerQueue = new Queue("scheduler", {
  connection: bullConnection(),
  prefix,
});
