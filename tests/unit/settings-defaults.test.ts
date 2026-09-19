import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_REMINDER_TEMPLATE, REMINDER_PLACEHOLDERS, SETTINGS_ID } from "@/lib/settings/defaults";
import { extractPlaceholders } from "@/lib/settings/reminder-template";

describe("default settings", () => {
  it("has the documented default values", () => {
    expect(SETTINGS_ID).toBe("default");
    expect(DEFAULT_SETTINGS).toMatchObject({
      academyName: "SAINTS",
      logoUrl: null,
      address: null,
      mobile: null,
      email: null,
      receiptPrefix: "SNT",
      receiptIncludeYear: true,
      receiptFooter: "Thank You",
      dueSoonDays: 3,
      overdueReminderDays: 7,
    });
    expect(DEFAULT_SETTINGS.reminderTemplate).toBe(DEFAULT_REMINDER_TEMPLATE);
  });

  it("default template only uses known placeholders and includes name and amount", () => {
    const found = extractPlaceholders(DEFAULT_REMINDER_TEMPLATE);
    for (const p of found) expect(REMINDER_PLACEHOLDERS as readonly string[]).toContain(p);
    expect(found).toContain("name");
    expect(found).toContain("amount");
  });
});
