import "server-only";

import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/queries/settings";
import {
  buildAdmissionMessage,
  buildPaymentMessage,
  paymentModeLabel,
  type NotificationCandidate,
} from "@/lib/notifications/candidates";

/**
 * Inserts one notification, ignoring a duplicate `dedupeKey`. Errors are
 * caught and logged: a notification must never fail the admission, payment
 * or page that triggered it.
 */
export async function createNotification(candidate: NotificationCandidate): Promise<void> {
  try {
    await prisma.notification.createMany({ data: [candidate], skipDuplicates: true });
  } catch (error) {
    console.error("Failed to create notification", candidate.dedupeKey, error);
  }
}

export async function notifyNewAdmission({ studentId, name }: { studentId: string; name: string }): Promise<void> {
  try {
    const { academyName } = await getSettings();
    await createNotification({
      type: "NEW_ADMISSION",
      studentId,
      message: buildAdmissionMessage(name, academyName),
      dedupeKey: `admission:${studentId}`,
    });
  } catch (error) {
    console.error("Failed to create admission notification", studentId, error);
  }
}

export async function notifyPaymentReceived({
  paymentId,
  studentId,
  studentName,
  amount,
  mode,
}: {
  paymentId: string;
  studentId: string;
  studentName: string;
  amount: number;
  mode: string;
}): Promise<void> {
  await createNotification({
    type: "PAYMENT_RECEIVED",
    studentId,
    message: buildPaymentMessage(studentName, amount, paymentModeLabel(mode)),
    dedupeKey: `payment:${paymentId}`,
  });
}
