"use server";

import { prisma } from "@/lib/db";
import { generateReceiptNumber } from "@/lib/ids";
import { feePlanSchema, type FeePlanInput } from "@/lib/validations/fee-plan";
import { paymentSchema, type PaymentInput } from "@/lib/validations/payment";
import { getCoverageStartForNewPayment, resolveActualPeriodsCovered } from "@/lib/fees/fee-history";
import { computeCoverageRange } from "@/lib/fees/periods";
import { Decimal } from "@prisma/client/runtime/library";
import { revalidatePath } from "next/cache";

export async function saveFeePlan(studentId: string, input: FeePlanInput) {
  const data = feePlanSchema.parse(input);

  const student = await prisma.student.findUnique({
    where: { id: studentId, deletedAt: null },
    select: { id: true },
  });
  if (!student) {
    throw new Error("Student not found.");
  }

  const finalAmount = data.totalAmount - data.discount;

  await prisma.feePlan.upsert({
    where: { studentId },
    create: {
      studentId,
      totalAmount: data.totalAmount,
      frequency: data.frequency,
      dueDate: data.dueDate,
      discount: data.discount,
      finalAmount,
    },
    update: {
      totalAmount: data.totalAmount,
      frequency: data.frequency,
      dueDate: data.dueDate,
      discount: data.discount,
      finalAmount,
    },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/fees");
  revalidatePath("/dashboard");
}

export async function createPayment(studentId: string, input: PaymentInput) {
  const data = paymentSchema.parse(input);

  const student = await prisma.student.findUnique({
    where: { id: studentId, deletedAt: null },
    select: { id: true },
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

  const today = new Date();
  const coverageStartBase = getCoverageStartForNewPayment(
    plan.dueDate,
    plan.frequency,
    plan.finalAmount,
    plan.payments,
    today
  );
  // periodsCovered (as typed by the admin) is a MINIMUM, not the final word:
  // if `amount` fully settles those periods with money left over, the
  // payment's declared range must extend to cover as many additional
  // periods as that leftover actually reaches -- otherwise the extra money
  // has no period left inside the payment's own range to land on, and
  // waterfallAllocate (which only ever allocates within a payment's own
  // declared coverage range) silently drops it from totalPaid. See
  // resolveActualPeriodsCovered's doc comment for the full bug writeup.
  const actualPeriodsCovered = resolveActualPeriodsCovered(
    plan.dueDate,
    plan.frequency,
    plan.finalAmount,
    plan.payments,
    today,
    coverageStartBase,
    new Decimal(data.amount),
    data.periodsCovered
  );
  const { coverageStart, coverageEnd } = computeCoverageRange(coverageStartBase, actualPeriodsCovered, plan.frequency);
  const receiptNumber = await generateReceiptNumber();

  const payment = await prisma.payment.create({
    data: {
      studentId,
      feePlanId: plan.id,
      amount: data.amount,
      paymentDate: data.paymentDate,
      mode: data.mode,
      coverageStart,
      coverageEnd,
      notes: data.notes || null,
      receipt: { create: { receiptNumber } },
    },
    include: { receipt: true },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/fees");
  revalidatePath("/dashboard");

  return payment;
}
