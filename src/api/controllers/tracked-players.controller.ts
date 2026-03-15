import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import * as trackedPlayersService from "../services/tracked-players.service.js";
import * as jobsService from "../services/jobs.service.js";

function serialize(data: any) {
  return JSON.parse(
    JSON.stringify(data, (_, value) => (typeof value === "bigint" ? value.toString() : value))
  );
}

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export async function listTrackedPlayers(_req: Request, res: Response) {
  const list = await trackedPlayersService.getAll();
  res.json(serialize(list));
}

export async function getTrackedPlayer(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  const pid = toInt(req.params.pid);
  if (wid === null || pid === null) return res.status(400).json({ error: "wid/pid must be integers" });

  const item = await trackedPlayersService.get(wid, pid);
  if (!item) return res.status(404).json({ error: "not found" });
  res.json(serialize(item));
}

export async function deleteTrackedPlayer(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  const pid = toInt(req.params.pid);
  if (wid === null || pid === null) return res.status(400).json({ error: "wid/pid must be integers" });

  const out = await trackedPlayersService.remove(wid, pid);
  if (out.count === 0) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
}

export async function createTrackedPlayer(req: Request, res: Response) {
  const wid = toInt(req.body?.wid);
  const pid = toInt(req.body?.pid);
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

  if (wid === null || pid === null) {
    return res.status(400).json({ error: "wid and pid are required numbers" });
  }

  try {
    const player = await trackedPlayersService.create(wid, pid, note);
    const syncJob = await jobsService.enqueueServerRankLatest({ wid });

    return res.status(201).json({
      trackedPlayer: serialize(player),
      firstSync: syncJob,
      warning:
        "Warpath rank_pid returns ranked players only. If pid is outside returned ranks, data may still be missing.",
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "tracked player already exists" });
    }
    console.error("[tracked-players.controller] failed:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
