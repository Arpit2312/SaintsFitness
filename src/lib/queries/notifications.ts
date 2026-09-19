// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";

export type NotificationRow = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: Date;
  studentId: string | null;
};

// A notification about a since-deleted student is hidden everywhere (and not
// counted), consistent with every other list in the app.
const VISIBLE = { OR: [{ studentId: null }, { student: { deletedAt: null } }] };

export async function listNotifications(limit = 100): Promise<NotificationRow[]> {
  const rows = await prisma.notification.findMany({
    where: VISIBLE,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, message: true, read: true, createdAt: true, studentId: true },
  });
  return rows;
}

export async function countUnreadNotifications(): Promise<number> {
  return prisma.notification.count({ where: { read: false, ...VISIBLE } });
}
