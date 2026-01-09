import { prisma } from "../../lib/db.js";

export function getAll() {
  return prisma.trackedAlliance.findMany();
}

export function get(wid: number, gid: number) {
  return prisma.trackedAlliance.findUnique({
    where: { wid_gid: { wid, gid } },
  });
}

export function remove(wid: number, gid: number) {
  return prisma.trackedAlliance.delete({
    where: { wid_gid: { wid, gid } },
  });
}

export async function create(wid: number, gid: number) {
  return prisma.trackedAlliance.create({
    data: { wid, gid },
  });
}