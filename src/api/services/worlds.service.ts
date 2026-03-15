import { prisma } from "../../lib/db.js";
import { getCityIdsWith16Name, type WorldMode } from "./city-reference.service.js";

export type WorldModeInfo = {
  wid: number;
  mode: WorldMode;
  confidence: number;
  method: "rule" | "ratio" | "fallback";
  ratio16: number | null;
  sampledDistinctCcid: number;
  sampledFromDayInt: number | null;
  sampledToDayInt: number | null;
};

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export async function detectWorldMode(wid: number): Promise<WorldModeInfo> {
  if (wid >= 130) {
    return {
      wid,
      mode: "16",
      confidence: 1,
      method: "rule",
      ratio16: null,
      sampledDistinctCcid: 0,
      sampledFromDayInt: null,
      sampledToDayInt: null,
    };
  }

  const latest = await prisma.ds_player_snapshots.aggregate({
    where: { wid },
    _max: { dayInt: true },
  });
  const maxDay = latest._max.dayInt ?? null;
  if (!maxDay) {
    return {
      wid,
      mode: "unknown",
      confidence: 0,
      method: "fallback",
      ratio16: null,
      sampledDistinctCcid: 0,
      sampledFromDayInt: null,
      sampledToDayInt: null,
    };
  }

  const fromDay = maxDay - 30;
  const rows = await prisma.ds_player_snapshots.findMany({
    where: {
      wid,
      dayInt: { gte: fromDay, lte: maxDay },
      ccid: { not: null },
    },
    select: { ccid: true },
    distinct: ["ccid"],
  });

  const ccids = rows.map((r) => r.ccid).filter((v): v is number => typeof v === "number");
  if (ccids.length === 0) {
    return {
      wid,
      mode: "unknown",
      confidence: 0,
      method: "fallback",
      ratio16: null,
      sampledDistinctCcid: 0,
      sampledFromDayInt: fromDay,
      sampledToDayInt: maxDay,
    };
  }

  const set16 = await getCityIdsWith16Name();
  let matched16 = 0;
  for (const ccid of ccids) if (set16.has(ccid)) matched16 += 1;

  const ratio = matched16 / ccids.length;
  const mode: WorldMode = ratio >= 0.6 ? "16" : "80";
  const confidence = ratio >= 0.6 ? ratio : 1 - ratio;

  return {
    wid,
    mode,
    confidence: round3(confidence),
    method: "ratio",
    ratio16: round3(ratio),
    sampledDistinctCcid: ccids.length,
    sampledFromDayInt: fromDay,
    sampledToDayInt: maxDay,
  };
}
