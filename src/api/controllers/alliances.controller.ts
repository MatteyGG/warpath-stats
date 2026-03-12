import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import * as alliancesService from "../services/alliances.service.js";
import * as jobsService from "../services/jobs.service.js";

function serialize(data: any) {
  return JSON.parse(JSON.stringify(data, (_, value) =>
    typeof value === "bigint" ? value.toString() : value
  ));
}

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export async function listTrackedAlliances(_req: Request, res: Response) {
  const list = await alliancesService.getAll();
  res.json(serialize(list));
}
export async function getTrackedAlliance(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  const gid = toInt(req.params.gid);
  if (wid === null || gid === null) return res.status(400).json({ error: "wid/gid must be integers" });

  const item = await alliancesService.get(wid, gid);
  if (!item) return res.status(404).json({ error: "not found" });
  res.json(serialize(item));
}

export async function deleteTrackedAlliance(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  const gid = toInt(req.params.gid);
  if (wid === null || gid === null) return res.status(400).json({ error: "wid/gid must be integers" });

  const out = await alliancesService.remove(wid, gid);
  if (out.count === 0) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
}

export async function createTrackedAlliance(req: Request, res: Response) {
  const wid = toInt(req.body?.wid);
  const gid = toInt(req.body?.gid);
  if (wid === null || gid === null) {
    return res.status(400).json({ error: "wid and gid are required numbers" });
  }

  try {
    // 1) создаём запись
    const alliance = await alliancesService.create(wid, gid);

    // 2) ставим fetch-джобу сразу
    const job = await jobsService.enqueueFetch({ wid, gid });

    return res.status(201).json({
      alliance: serialize(alliance),
      firstFetchJobId: job.id,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "tracked alliance already exists" });
    }
    console.error("[alliances.controller] failed:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
