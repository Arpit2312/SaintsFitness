// Read-only query. Deliberately NOT `import "server-only"`: src/lib/ids.ts
// calls this and is imported by unit tests, and `server-only` throws under
// vitest. It imports the Prisma client, so it can never be bundled for the
// browser anyway. Do not wrap in React's cache() (unavailable outside an RSC
// render, e.g. in verification scripts).
import { prisma } from "@/lib/db";
import { DEFAULT_SETTINGS, SETTINGS_ID, type SettingsValues } from "@/lib/settings/defaults";

export async function getSettings(): Promise<SettingsValues> {
  const row = await prisma.academySettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return { ...DEFAULT_SETTINGS };

  return {
    academyName: row.academyName,
    logoUrl: row.logoUrl,
    address: row.address,
    mobile: row.mobile,
    email: row.email,
    receiptPrefix: row.receiptPrefix,
    receiptIncludeYear: row.receiptIncludeYear,
    receiptFooter: row.receiptFooter,
    reminderTemplate: row.reminderTemplate ?? DEFAULT_SETTINGS.reminderTemplate,
    dueSoonDays: row.dueSoonDays,
    overdueReminderDays: row.overdueReminderDays,
  };
}
