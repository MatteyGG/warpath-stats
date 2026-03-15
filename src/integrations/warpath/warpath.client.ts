import { z } from "zod";

const zIntLike = z.union([z.number(), z.string().regex(/^-?\d+$/)]).transform((v) => Number(v));

const guildDetailRowSchema = z
  .object({
    id: zIntLike.optional(),
    day: zIntLike,
    wid: zIntLike,
    gid: zIntLike,
    ccid: zIntLike.optional(),
    power: zIntLike,
    kil: zIntLike,
    di: zIntLike,
    c_power: zIntLike.optional(),
    c_kil: zIntLike.optional(),
    c_di: zIntLike.optional(),
    owner: z.string().optional(),
    created_at: z.string().optional(),
    sname: z.string().optional(),
    fname: z.string().optional(),
  })
  .passthrough();

const guildDetailResponseSchema = z.object({
  Code: z.number(),
  Message: z.string(),
  Data: z.array(guildDetailRowSchema),
});

type GuildDetailResponse = z.infer<typeof guildDetailResponseSchema>;

export async function fetchGuildDetail(gid: number, perPage = 50, page = 1) {
  const url = new URL("https://yx.dmzgame.com/intl_warpath/guild_detail");
  url.searchParams.set("gid", String(gid));
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(perPage));
  console.log(`[warpath] guild_detail: ${url}`);

  const res = await fetch(url.toString(), {
    headers: {
      "user-agent": "warpath-tracker/1.0",
      "accept": "application/json",
    },
  });

  const text = await res.text();
  let json: GuildDetailResponse;
  try {
    const raw = JSON.parse(text);
    json = guildDetailResponseSchema.parse(raw);
  } catch (err) {
    throw new Error(`guild_detail: invalid JSON, status=${res.status}`);
  }

  if (!res.ok || json.Code !== 0) {
    throw new Error(`guild_detail failed: http=${res.status}, code=${json.Code}, msg=${json.Message}`);
  }

  return { httpStatus: res.status, payload: json };
}

const latestDaySchema = z.object({
  Code: zIntLike,
  Message: z.string(),
  Data: zIntLike,
});

type LatestDayResp = z.infer<typeof latestDaySchema>;

export async function fetchTotalLatestDay(): Promise<number> {
  const url = "https://yx.dmzgame.com/intl_warpath/total/total_latest_day";
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const raw = await res.json();
  const json = latestDaySchema.parse(raw) as LatestDayResp;

  if (!res.ok || json.Code !== 0) {
    throw new Error(`total_latest_day failed http=${res.status} code=${json.Code} msg=${json.Message}`);
  }
  return Number(json.Data);
}

const rankPidRowSchema = z
  .object({
    id: zIntLike.optional(),
    day: zIntLike,
    pid: zIntLike,
    wid: zIntLike,
    gid: zIntLike,
    cid: zIntLike.optional(),
    ccid: zIntLike.optional(),
    gnick: z.string().optional(),
    lv: zIntLike.optional(),
    nick: z.string().optional(),
    power: zIntLike.optional(),
    maxpower: zIntLike.optional(),
    sumkill: zIntLike.optional(),
    die: zIntLike.optional(),
    score: zIntLike.optional(),
    caiji: zIntLike.optional(),
    gx: zIntLike.optional(),
    bz: zIntLike.optional(),
    c_power: zIntLike.optional(),
    c_die: zIntLike.optional(),
    c_score: zIntLike.optional(),
    c_sumkill: zIntLike.optional(),
    c_caiji: zIntLike.optional(),
    kills: z.array(zIntLike).optional(),
    created_at: z.string().optional(),
  })
  .passthrough();

const rankPidRespSchema = z.object({
  Code: zIntLike,
  Message: z.string(),
  Data: z.array(rankPidRowSchema),
});

type RankPidResp = z.infer<typeof rankPidRespSchema>;

const DEBUG_HTTP = process.env.WARPATH_HTTP_DEBUG === "1";

export async function fetchRankPidDay(
  wid: number,
  dayInt: number,
  perPage = 3000,
  page = 1,
  ccid = 0
) {
  const url = new URL("https://yx.dmzgame.com/intl_warpath/rank_pid");
  url.searchParams.set("day", String(dayInt));
  url.searchParams.set("wid", String(wid));
  url.searchParams.set("ccid", String(ccid));
  url.searchParams.set("rank", "power");
  url.searchParams.set("is_benfu", "1");
  url.searchParams.set("is_quanfu", "0");
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(perPage));

  const finalUrl = url.toString();
  if (DEBUG_HTTP) console.log(`[warpath] GET ${finalUrl}`);

  const res = await fetch(finalUrl, {
    headers: {
      "user-agent": "warpath-tracker/1.0",
      accept: "application/json",
    },
  });

  const text = await res.text();
  let json: RankPidResp;
  try {
    const raw = JSON.parse(text);
    json = rankPidRespSchema.parse(raw);
  } catch {
    throw new Error(`rank_pid: invalid JSON status=${res.status} url=${finalUrl}`);
  }

  if (!res.ok || json.Code !== 0) {
    throw new Error(`rank_pid failed http=${res.status} code=${json.Code} msg=${json.Message} url=${finalUrl}`);
  }

  return { httpStatus: res.status, payload: json };
}
