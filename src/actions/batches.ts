"use server";

import { prisma } from "@/lib/db";
import { batchSchema, type BatchInput } from "@/lib/validations/batch";
import { revalidatePath } from "next/cache";

export async function createBatch(input: BatchInput) {
  const data = batchSchema.parse(input);
  await prisma.batch.create({ data });
  revalidatePath("/classes/batches");
}

export async function updateBatch(id: string, input: BatchInput) {
  const data = batchSchema.parse(input);
  await prisma.batch.update({ where: { id }, data });
  revalidatePath("/classes/batches");
}

export async function deleteBatch(id: string) {
  await prisma.batch.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/classes/batches");
}
