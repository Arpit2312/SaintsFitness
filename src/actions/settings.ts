"use server";

import { prisma } from "@/lib/db";
import { SETTINGS_ID } from "@/lib/settings/defaults";
import {
  academySettingsSchema,
  receiptSettingsSchema,
  reminderSettingsSchema,
  type AcademySettingsInput,
  type ReceiptSettingsInput,
  type ReminderSettingsInput,
} from "@/lib/validations/settings";
import { revalidatePath } from "next/cache";

// Settings feed the sidebar brand, receipts and reminders, so refresh every page.
function revalidateEverywhere() {
  revalidatePath("/", "layout");
}

export async function saveAcademySettings(input: AcademySettingsInput) {
  const data = academySettingsSchema.parse(input);
  await prisma.academySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  revalidateEverywhere();
}

export async function saveReceiptSettings(input: ReceiptSettingsInput) {
  const data = receiptSettingsSchema.parse(input);
  await prisma.academySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  revalidateEverywhere();
}

export async function saveReminderSettings(input: ReminderSettingsInput) {
  const data = reminderSettingsSchema.parse(input);
  await prisma.academySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  revalidateEverywhere();
}
