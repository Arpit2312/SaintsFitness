import "server-only";

import { prisma } from "@/lib/db";

export async function listCourses() {
  return prisma.course.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { batches: { where: { deletedAt: null } } },
  });
}
