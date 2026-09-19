import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/queries/settings";
import { formatReceiptNumber, receiptSequenceName } from "@/lib/settings/receipt";
import type { SettingsValues } from "@/lib/settings/defaults";

export function formatSequence(prefix: string, n: number, width: number): string {
  const padded = String(n).padStart(width, "0");
  return `${prefix}-${padded}`;
}

async function nextSequenceValue(name: string): Promise<number> {
  const result = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = "Sequence".value + 1
    RETURNING value
  `;
  return result[0].value;
}

export async function generateStudentCode(): Promise<string> {
  const n = await nextSequenceValue("student");
  return formatSequence("ST", n, 5);
}

export async function generateReceiptNumber(
  settings?: Pick<SettingsValues, "receiptPrefix" | "receiptIncludeYear">
): Promise<string> {
  const { receiptPrefix, receiptIncludeYear } = settings ?? (await getSettings());
  const year = new Date().getFullYear();
  const n = await nextSequenceValue(receiptSequenceName(receiptIncludeYear, year));
  return formatReceiptNumber({ prefix: receiptPrefix, includeYear: receiptIncludeYear, year, sequence: n });
}
