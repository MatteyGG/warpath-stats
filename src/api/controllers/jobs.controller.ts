import type { Request, Response } from "express";
import * as jobsService from "../services/jobs.service.js";

export async function addFetchJob(req: Request, res: Response) {
  try {
    const { wid, gid, page, perPage } = req.body;
    const job = await jobsService.enqueueFetch({ wid, gid, page, perPage });
    res.json({ jobId: job.id });
  } catch (err) {
    console.error("[jobs.controller]", err);
    res.status(500).json({ error: (err as Error).message });
  }
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

export async function serverScan(req: Request, res: Response) {
  const { wid, dayInt, page, perPage } = req.body ?? {};

  if (!isInt(wid) || !isInt(dayInt)) {
    return res.status(400).json({ error: "wid and dayInt are required integers" });
  }

  try {
    const out = await jobsService.enqueueServerRankDay({
      wid,
      dayInt,
      page: isInt(page) ? page : 1,
      perPage: isInt(perPage) ? perPage : 3000,
    });

    return res.status(202).json(out);
  } catch (e: any) {
    console.error("[jobs.serverScan] failed:", e);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}

export async function serverBackfill(req: Request, res: Response) {
  const { wid, fromDayInt, toDayInt, page, perPage } = req.body ?? {};

  if (!isInt(wid) || !isInt(fromDayInt) || !isInt(toDayInt)) {
    return res.status(400).json({ error: "wid, fromDayInt, toDayInt are required integers" });
  }

  try {
    const out = await jobsService.enqueueServerRankBackfill({
      wid,
      fromDayInt,
      toDayInt,
      page: isInt(page) ? page : 1,
      perPage: isInt(perPage) ? perPage : 3000,
    });

    return res.status(202).json(out);
  } catch (e: any) {
    console.error("[jobs.serverBackfill] failed:", e);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
export async function syncLatest(_req: Request, res: Response) {
  try {
    const job = await jobsService.enqueueSyncLatest();
    return res.status(202).json({ ok: true, schedulerJobId: job.id });
  } catch (e: any) {
    console.error("[jobs.syncLatest] failed:", e);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}