import type { Request, Response } from "express";
import { getCityMeta, getCityRows } from "../services/city-reference.service.js";
import { detectWorldMode } from "../services/worlds.service.js";

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export async function getWorldMode(req: Request, res: Response) {
  const wid = toInt(req.params.wid);
  if (!wid) return res.status(400).json({ error: "wid must be integer" });

  const mode = await detectWorldMode(wid);
  return res.json(mode);
}

export async function getCityReference(_req: Request, res: Response) {
  const [rows, meta] = await Promise.all([getCityRows(), getCityMeta()]);
  return res.json({
    data: rows.map((r) => ({
      cityId: r.city_id,
      city80Name: r.city_80_name ?? null,
      city16Name: r.city_16_name ?? null,
    })),
    meta: {
      source: meta.sourceUrl,
      syncMode: "manual",
      updatedAt: meta.loadedAt,
      count: meta.count,
    },
  });
}

export async function refreshCityReference(_req: Request, res: Response) {
  const rows = await getCityRows({ forceRefresh: true });
  const meta = await getCityMeta();
  return res.json({
    ok: true,
    count: rows.length,
    source: meta.sourceUrl,
    updatedAt: meta.loadedAt,
  });
}
