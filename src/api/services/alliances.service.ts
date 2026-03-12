import { prisma } from "../../lib/db.js";

export function getAll() {
  return prisma.tracked_alliance.findMany();
}

export function get(wid: number, gid: number) {
  return prisma.tracked_alliance.findUnique({
    where: { wid_gid: { wid, gid } },
  });
}

export function remove(wid: number, gid: number) {
  return prisma.tracked_alliance.deleteMany({
    where: { wid, gid },
  });
}

export async function create(wid: number, gid: number) {
  return prisma.tracked_alliance.create({
    data: { wid, gid },
  });
}
