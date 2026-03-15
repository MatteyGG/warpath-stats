import { prisma } from "../../lib/db.js";

export function getAll() {
  return prisma.tracked_player.findMany({ orderBy: [{ wid: "asc" }, { pid: "asc" }] });
}

export function get(wid: number, pid: number) {
  return prisma.tracked_player.findUnique({
    where: { wid_pid: { wid, pid } },
  });
}

export function remove(wid: number, pid: number) {
  return prisma.tracked_player.deleteMany({
    where: { wid, pid },
  });
}

export async function create(wid: number, pid: number, note?: string | null) {
  return prisma.tracked_player.create({
    data: { wid, pid, note: note ?? null },
  });
}
