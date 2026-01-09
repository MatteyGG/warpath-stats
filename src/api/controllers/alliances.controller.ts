import type { Request, Response } from "express";
import * as alliancesService from "../services/alliances.service.js";
import * as jobsService from "../services/jobs.service.js";

function serialize(data: any) {
  return JSON.parse(JSON.stringify(data, (_, value) =>
    typeof value === "bigint" ? value.toString() : value
  ));
}

export async function listTrackedAlliances(_req: Request, res: Response) {
  const list = await alliancesService.getAll();
  res.json(serialize(list));
}
export async function getTrackedAlliance(req: Request, res: Response) {
  const { wid, gid } = req.params;
  const item = await alliancesService.get(Number(wid), Number(gid));
  if (!item) return res.status(404).json({ error: "not found" });
  res.json(serialize(item));
}

export async function deleteTrackedAlliance(req: Request, res: Response) {
  const { wid, gid } = req.params;
  await alliancesService.remove(Number(wid), Number(gid));
  res.json({ ok: true });
}

export async function createTrackedAlliance(req: Request, res: Response) {
  const { wid, gid } = req.body;

  if (typeof wid !== "number" || typeof gid !== "number") {
    return res.status(400).json({ error: "wid and gid are required numbers" });
  }

  try {
    // 1) создаём запись
    const alliance = await alliancesService.create(wid, gid);

    // 2) ставим fetch-джобу сразу
    const job = await jobsService.enqueueFetch({ wid, gid });

    return res.status(201).json({
      alliance,
      firstFetchJobId: job.id,
    });
  } catch (err) {
    console.error("[alliances.controller] failed:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}