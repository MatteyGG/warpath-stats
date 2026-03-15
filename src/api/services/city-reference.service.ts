import https from "node:https";

type CityRow = {
  city_id: number;
  city_80_name?: string;
  city_16_name?: string;
};

type CacheState = {
  rows: CityRow[];
  loadedAt: number;
};

const SOURCE_URL = process.env.CITY_LIST_URL ?? "https://154.93.104.103/api/db/json/en/city_list.json";
const CACHE_TTL_MS = Number(process.env.CITY_LIST_TTL_MS ?? 1000 * 60 * 60 * 12); // 12h
let cache: CacheState | null = null;

function normalize(rows: unknown): CityRow[] {
  if (!Array.isArray(rows)) return [];
  const out: CityRow[] = [];
  for (const r of rows) {
    const obj = r as Record<string, unknown>;
    const cityId = Number(obj.city_id);
    if (!Number.isInteger(cityId)) continue;
    out.push({
      city_id: cityId,
      city_80_name: typeof obj.city_80_name === "string" ? obj.city_80_name : undefined,
      city_16_name: typeof obj.city_16_name === "string" ? obj.city_16_name : undefined,
    });
  }
  return out;
}

async function fetchCityRowsRemote(): Promise<CityRow[]> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      SOURCE_URL,
      {
        method: "GET",
        // Source is HTTPS by IP with mismatched certificate CN.
        // We refresh rarely and keep it manual-friendly, so explicit opt-out here.
        rejectUnauthorized: false,
        headers: { accept: "application/json" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 400) {
            return reject(new Error(`city_list fetch failed http=${res.statusCode}`));
          }
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            resolve(normalize(parsed));
          } catch (err) {
            reject(new Error(`city_list parse failed: ${(err as Error).message}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

export async function getCityRows(options?: { forceRefresh?: boolean }) {
  const now = Date.now();
  if (!options?.forceRefresh && cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.rows;
  }

  const rows = await fetchCityRowsRemote();
  cache = { rows, loadedAt: now };
  return rows;
}

export async function getCityMeta() {
  const rows = await getCityRows();
  return {
    sourceUrl: SOURCE_URL,
    loadedAt: cache ? new Date(cache.loadedAt).toISOString() : null,
    count: rows.length,
  };
}

export async function getCityMap() {
  const rows = await getCityRows();
  const byId = new Map<number, CityRow>();
  for (const row of rows) byId.set(row.city_id, row);
  return byId;
}

export async function getCityIdsWith16Name() {
  const rows = await getCityRows();
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.city_16_name && row.city_16_name.trim().length > 0) ids.add(row.city_id);
  }
  return ids;
}

export async function getCityIdsForWorld(wid: number): Promise<number[]> {
  const rows = await getCityRows();
  const out = new Set<number>();

  for (const row of rows) {
    const id = row.city_id;
    if (!Number.isInteger(id) || id <= 0) continue;

    if (wid >= 130) {
      if (typeof row.city_16_name === "string" && row.city_16_name.trim().length > 0) out.add(id);
      continue;
    }

    if (typeof row.city_80_name === "string" && row.city_80_name.trim().length > 0) out.add(id);
  }

  return Array.from(out).sort((a, b) => a - b);
}

export type WorldMode = "16" | "80" | "unknown";

function candidateIds(rawId: number): number[] {
  const out = new Set<number>();
  if (Number.isInteger(rawId) && rawId > 0) out.add(rawId);

  const tail3 = rawId % 1000;
  if (tail3 > 0) {
    out.add(10000 + tail3);
    out.add(20000 + tail3);
    out.add(30000 + tail3);
    out.add(40000 + tail3);
  }

  const tail4 = rawId % 10000;
  if (tail4 > 0) {
    out.add(10000 + tail4);
    out.add(20000 + tail4);
    out.add(30000 + tail4);
    out.add(40000 + tail4);
  }

  return Array.from(out);
}

function pickRow(map: Map<number, CityRow>, ids: number[], mode: WorldMode): CityRow | null {
  const rows = ids.map((id) => map.get(id)).filter((r): r is CityRow => Boolean(r));
  if (rows.length === 0) return null;
  if (mode === "16") {
    const with16 = rows.find((r) => typeof r.city_16_name === "string" && r.city_16_name.trim().length > 0);
    if (with16) return with16;
  }
  return rows[0];
}

export async function resolveCityName(
  ccid: number,
  mode: WorldMode,
  hints?: { cid?: number | null }
): Promise<{ city80Name: string | null; city16Name: string | null; displayName: string | null }> {
  const map = await getCityMap();
  const ids = [...candidateIds(ccid)];
  if (typeof hints?.cid === "number" && Number.isInteger(hints.cid) && hints.cid > 0) {
    for (const id of candidateIds(hints.cid)) ids.push(id);
  }
  const row = pickRow(map, ids, mode);
  if (!row) {
    return { city80Name: null, city16Name: null, displayName: `Unknown city (${ccid})` };
  }

  const city80Name = row.city_80_name ?? null;
  const city16Name = row.city_16_name ?? null;
  const displayName = mode === "16" ? city16Name ?? city80Name : city80Name ?? city16Name;

  return { city80Name, city16Name, displayName: displayName ?? `Unknown city (${ccid})` };
}
