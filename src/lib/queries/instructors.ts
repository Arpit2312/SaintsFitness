// Read-only query, not a mutation — lives outside src/actions/ (which is
// "use server") so it can never be called as a Server Action from client
// code. "server-only" makes any client-side value import a build error;
// client components that need this function's return type should use
// `import type` instead (see src/components/classes/instructors-list.tsx).
import "server-only";

import { prisma } from "@/lib/db";

export async function listInstructors() {
  return prisma.instructor.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { batches: { where: { deletedAt: null } } },
  });
}
