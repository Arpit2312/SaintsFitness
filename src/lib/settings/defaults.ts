// Pure module (no Prisma, no server-only): safe to import from client
// components and unit tests.

export const SETTINGS_ID = "default";

export const REMINDER_PLACEHOLDERS = ["name", "amount", "academy"] as const;
export type ReminderPlaceholder = (typeof REMINDER_PLACEHOLDERS)[number];

// The exact wording the app used before Settings existed (Phase 4), so
// upgrading changes nothing until an admin edits the template.
export const DEFAULT_REMINDER_TEMPLATE = [
  "SAINTS – Fee Reminder",
  "Hi {name}, this is a reminder that ₹{amount} is pending for your SAINTS fees. Please clear it at your earliest convenience. Thank you!",
].join("\n");

export type SettingsValues = {
  academyName: string;
  logoUrl: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  receiptPrefix: string;
  receiptIncludeYear: boolean;
  receiptFooter: string;
  reminderTemplate: string;
  dueSoonDays: number;
  overdueReminderDays: number;
};

export const DEFAULT_SETTINGS: SettingsValues = {
  academyName: "SAINTS",
  logoUrl: null,
  address: null,
  mobile: null,
  email: null,
  receiptPrefix: "SNT",
  receiptIncludeYear: true,
  receiptFooter: "Thank You",
  reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
  dueSoonDays: 3,
  overdueReminderDays: 7,
};
