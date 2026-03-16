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

function dayIntToDate(dayInt: number): Date {
  const s = String(dayInt);
  return new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
}

function dateToDayInt(dt: Date): number {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return Number(`${y}${m}${d}`);
}

function shiftDay(dayInt: number, delta: number): number {
  const dt = dayIntToDate(dayInt);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dateToDayInt(dt);
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
  const fromDayInt = toInt(req.body?.fromDayInt);
  const toDayInt = toInt(req.body?.toDayInt);
  const backfillDays = toInt(req.body?.backfillDays) ?? 90;
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

  if (wid === null || pid === null) {
    return res.status(400).json({ error: "wid and pid are required numbers" });
  }

  try {
    const player = await trackedPlayersService.create(wid, pid, note);
    const latest = await jobsService.enqueueServerRankLatest({ wid });
    const latestDay =
      typeof (latest as any)?.requested?.dayInt === "number"
        ? Number((latest as any).requested.dayInt)
        : null;

    const finalTo = toDayInt ?? latestDay;
    const finalFrom =
      fromDayInt ??
      (finalTo !== null ? shiftDay(finalTo, -Math.max(1, Math.min(365, backfillDays))) : null);

    const backfill =
      finalFrom !== null && finalTo !== null && finalFrom <= finalTo
        ? await jobsService.enqueueServerRankBackfill({
            wid,
            fromDayInt: finalFrom,
            toDayInt: finalTo,
            page: 1,
            perPage: 3000,
          })
        : null;

    return res.status(201).json({
      trackedPlayer: serialize(player),
      firstSync: latest,
      backfill,
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
