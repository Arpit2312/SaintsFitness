// Read-only query, not a mutation — lives outside src/actions/ (which is
// "use server") so it can never be called as a Server Action from client
// code. "server-only" makes any client-side value import a build error;
// client components that need this function's return type should use
// `import type` instead (see src/components/classes/courses-list.tsx).
import "server-only";

import { prisma } from "@/lib/db";
import type { StudentStatus } from "@prisma/client";

export type StudentFilters = {
  search?: string;
  status?: StudentStatus;
  batchId?: string;
};

export async function listStudents(filters: StudentFilters = {}) {
  return prisma.student.findMany({
    where: {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { studentCode: { contains: filters.search, mode: "insensitive" } },
              { mobile: { contains: filters.search } },
            ],
          }
        : {}),
      ...(filters.batchId
        ? { enrollments: { some: { batchId: filters.batchId } } }
        : {}),
    },
    include: {
      // The schema allows a student to have more than one enrollment
      // (@@unique is on [studentId, batchId], not studentId alone) even
      // though every current write path converges to at most one — order
      // explicitly so "the first enrollment" is deterministic if that
      // ever changes, rather than depending on unspecified SQL row order.
      enrollments: { include: { batch: true }, orderBy: { joiningBatchDate: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getStudent(id: string) {
  return prisma.student.findUnique({
    where: { id, deletedAt: null },
    include: {
      address: true,
      emergencyContact: true,
      parentDetails: true,
      enrollments: {
        include: { batch: { include: { course: true, instructor: true } } },
        orderBy: { joiningBatchDate: "desc" },
      },
    },
  });
}
