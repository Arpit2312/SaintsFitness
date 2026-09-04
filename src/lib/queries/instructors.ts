import "server-only";

import { prisma } from "@/lib/db";

export async function listInstructors() {
  return prisma.instructor.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { batches: { where: { deletedAt: null } } },
  });
}
