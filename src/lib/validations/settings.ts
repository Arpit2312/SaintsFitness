import { z } from "zod";
import { REMINDER_PLACEHOLDERS } from "@/lib/settings/defaults";
import { extractPlaceholders } from "@/lib/settings/reminder-template";

// Optional text fields arrive as "" / whitespace when the admin clears them.
const emptyToNull = (value: unknown): unknown =>
  value === undefined || (typeof value === "string" && value.trim() === "") ? null : value;

// Day counts arrive as numbers or as text-input strings.
const wholeNumber = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? (value.trim() === "" ? NaN : Number(value)) : value),
    z
      .number({ invalid_type_error: `${label} must be a whole number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be between ${min} and ${max}`)
      .max(max, `${label} must be between ${min} and ${max}`)
  );

export const academySettingsSchema = z.object({
  academyName: z
    .string()
    .trim()
    .min(2, "Academy name is required")
    .max(60, "Academy name can be at most 60 characters"),
  logoUrl: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .url("Enter a valid URL")
      .refine((value) => value.startsWith("https://"), "Logo URL must start with https://")
      .nullable()
  ),
  address: z.preprocess(emptyToNull, z.string().trim().max(300, "Address can be at most 300 characters").nullable()),
  mobile: z.preprocess(
    emptyToNull,
    z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number").nullable()
  ),
  email: z.preprocess(
    emptyToNull,
    z.string().trim().email("Enter a valid email address").max(120, "Email can be at most 120 characters").nullable()
  ),
});

export const receiptSettingsSchema = z.object({
  receiptPrefix: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.string().regex(/^[A-Z0-9]{2,8}$/, "Use 2-8 letters or digits (no spaces or hyphens)")
  ),
  receiptIncludeYear: z.boolean(),
  receiptFooter: z.string().trim().max(200, "Footer can be at most 200 characters"),
});

export const reminderSettingsSchema = z.object({
  reminderTemplate: z
    .string()
    .trim()
    // No meaningful minimum: requiring both {name} and {amount} already forces
    // at least 14 characters.
    .min(1, "Template is required")
    .max(500, "Template can be at most 500 characters")
    .superRefine((template, ctx) => {
      const found = extractPlaceholders(template);
      const unknown = found.filter((p) => !(REMINDER_PLACEHOLDERS as readonly string[]).includes(p));
      if (unknown.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown placeholder: ${unknown.map((u) => `{${u}}`).join(", ")}`,
        });
      }
      for (const required of ["name", "amount"]) {
        if (!found.includes(required)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Template must include {${required}}` });
        }
      }
    }),
  dueSoonDays: wholeNumber(1, 30, "Due soon days"),
  overdueReminderDays: wholeNumber(1, 60, "Overdue reminder frequency"),
});

// Explicit input shapes for the Server Action boundary (z.preprocess makes
// z.input `unknown`, which would accept anything at compile time).
export type AcademySettingsInput = {
  academyName: string;
  logoUrl: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
};
export type ReceiptSettingsInput = {
  receiptPrefix: string;
  receiptIncludeYear: boolean;
  receiptFooter: string;
};
export type ReminderSettingsInput = {
  reminderTemplate: string;
  dueSoonDays: number | string;
  overdueReminderDays: number | string;
};
