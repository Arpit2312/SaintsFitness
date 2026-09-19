"use server";

import { prisma } from "@/lib/db";
import { computeFeeHistory } from "@/lib/fees/fee-history";
import { buildReminderMessage } from "@/lib/reminders/message";
import { getSettings } from "@/lib/queries/settings";
import { revalidatePath } from "next/cache";

// No zod schema here -- unlike Phases 2/3's mutations, this action takes a
// single bare studentId with no user-typed form fields to validate (the
// same shape as Phase 1's deleteStudent(id), which also has no schema for
// the same reason). The real validation is the existence/business-rule
// checks below, not input shape.
export async function sendFeeReminder(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!student) {
    throw new Error("Student not found.");
  }

  const plan = await prisma.feePlan.findUnique({
    where: { studentId },
    include: { payments: true },
  });
  if (!plan) {
    throw new Error("This student doesn't have a fee plan set up yet.");
  }

  const { totalPending } = computeFeeHistory(plan.dueDate, plan.frequency, plan.finalAmount, plan.payments, new Date());
  if (totalPending.lte(0)) {
    throw new Error("This student has no pending dues.");
  }

  const pendingAmount = totalPending.toNumber();
  const settings = await getSettings();
  const message = buildReminderMessage(student.name, pendingAmount, {
    template: settings.reminderTemplate,
    academyName: settings.academyName,
  });

  const reminder = await prisma.feeReminder.create({
    data: { studentId, pendingAmountAtSend: pendingAmount, message },
  });

  revalidatePath("/reminders");

  return {
    id: reminder.id,
    sentAt: reminder.sentAt,
    pendingAmountAtSend: reminder.pendingAmountAtSend.toNumber(),
    message: reminder.message,
  };
}
