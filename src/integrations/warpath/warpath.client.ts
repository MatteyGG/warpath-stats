type GuildDetailRow = {
  day: number;
  wid: number;
  gid: number;
  power: number | string;
  kil: number | string;
  di: number;
  c_power?: number | string;
  c_kil?: number | string;
  c_di?: number;
  owner?: string;
  created_at?: string;
};

type GuildDetailResponse = {
  Code: number;
  Message: string;
  Data: GuildDetailRow[];
};

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
    json = JSON.parse(text);
  } catch {
    throw new Error(`guild_detail: invalid JSON, status=${res.status}`);
  }

  if (!res.ok || json.Code !== 0) {
    throw new Error(`guild_detail failed: http=${res.status}, code=${json.Code}, msg=${json.Message}`);
  }

  return { httpStatus: res.status, payload: json };
}

type LatestDayResp = { Code: number; Message: string; Data: number };

export async function fetchTotalLatestDay(): Promise<number> {
  const url = "https://yx.dmzgame.com/intl_warpath/total/total_latest_day";
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const json = (await res.json()) as LatestDayResp;

  if (!res.ok || json.Code !== 0) {
    throw new Error(`total_latest_day failed http=${res.status} code=${json.Code} msg=${json.Message}`);
  }
  return Number(json.Data);
}

type RankPidRow = {
  id?: number;
  day: number;
  pid: number;
  wid: number;
  gid: number;
  gnick?: string;
  lv?: number;
  nick?: string;
  power?: number | string;
  maxpower?: number | string;
  sumkill?: number | string;
  die?: number | string;
  score?: number | string;
  caiji?: number | string;
  created_at?: string;
};

type RankPidResp = { Code: number; Message: string; Data: RankPidRow[] };

const DEBUG_HTTP = process.env.WARPATH_HTTP_DEBUG === "1";

export async function fetchRankPidDay(wid: number, dayInt: number, perPage = 3000, page = 1) {
  const url = new URL("https://yx.dmzgame.com/intl_warpath/rank_pid");
  url.searchParams.set("day", String(dayInt));
  url.searchParams.set("wid", String(wid));
  url.searchParams.set("ccid", "0");
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
    json = JSON.parse(text);
  } catch {
    throw new Error(`rank_pid: invalid JSON status=${res.status} url=${finalUrl}`);
  }

  if (!res.ok || json.Code !== 0) {
    throw new Error(`rank_pid failed http=${res.status} code=${json.Code} msg=${json.Message} url=${finalUrl}`);
  }

  return { httpStatus: res.status, payload: json };
}