"use server";

import { prisma } from "@/lib/db";
import { generateReceiptNumber } from "@/lib/ids";
import { feePlanSchema, type FeePlanInput } from "@/lib/validations/fee-plan";
import { paymentSchema, type PaymentInput } from "@/lib/validations/payment";
import { getCoverageStartForNewPayment } from "@/lib/fees/fee-history";
import { computeCoverageRange } from "@/lib/fees/periods";
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
  const { coverageStart, coverageEnd } = computeCoverageRange(coverageStartBase, data.periodsCovered, plan.frequency);
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
