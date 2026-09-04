import "server-only";

import { prisma } from "@/lib/db";

export async function listBatches() {
  return prisma.batch.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      course: true,
      instructor: true,
      enrollments: { where: { student: { deletedAt: null } } },
    },
  });
}

export async function listBatchOptions() {
  return prisma.batch.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
