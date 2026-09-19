"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

function revalidateNotifications() {
  revalidatePath("/notifications");
  // The unread badge lives in the shared layout header.
  revalidatePath("/", "layout");
}

export async function markNotificationRead(id: string) {
  await prisma.notification.updateMany({ where: { id, read: false }, data: { read: true } });
  revalidateNotifications();
}

export async function markAllNotificationsRead() {
  await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
  revalidateNotifications();
}
