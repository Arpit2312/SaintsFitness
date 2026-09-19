// tests/unit/settings-validation.test.ts
import { describe, it, expect } from "vitest";
import {
  academySettingsSchema,
  receiptSettingsSchema,
  reminderSettingsSchema,
} from "@/lib/validations/settings";
import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/settings/defaults";

describe("academySettingsSchema", () => {
  const valid = {
    academyName: "SAINTS",
    logoUrl: "https://example.com/logo.png",
    address: "12 MG Road, Pune",
    mobile: "9876543210",
    email: "hello@saints.example",
  };

  it("accepts a fully valid payload", () => {
    expect(academySettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("normalizes empty optional fields to null", () => {
    const result = academySettingsSchema.parse({ academyName: "SAINTS", logoUrl: "", address: "  ", mobile: "", email: "" });
    expect(result).toEqual({ academyName: "SAINTS", logoUrl: null, address: null, mobile: null, email: null });
  });

  it("accepts missing optional keys", () => {
    expect(academySettingsSchema.parse({ academyName: "SAINTS" })).toEqual({
      academyName: "SAINTS",
      logoUrl: null,
      address: null,
      mobile: null,
      email: null,
    });
  });

  it("rejects an academy name shorter than 2 characters", () => {
    expect(academySettingsSchema.safeParse({ ...valid, academyName: "A" }).success).toBe(false);
  });

  it("rejects an academy name longer than 60 characters", () => {
    expect(academySettingsSchema.safeParse({ ...valid, academyName: "A".repeat(61) }).success).toBe(false);
  });

  it("trims the academy name", () => {
    expect(academySettingsSchema.parse({ ...valid, academyName: "  SAINTS  " }).academyName).toBe("SAINTS");
  });

  it("rejects a non-https logo URL", () => {
    expect(academySettingsSchema.safeParse({ ...valid, logoUrl: "http://example.com/logo.png" }).success).toBe(false);
  });

  it("rejects dangerous or non-URL logo values", () => {
    expect(academySettingsSchema.safeParse({ ...valid, logoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(academySettingsSchema.safeParse({ ...valid, logoUrl: "not a url" }).success).toBe(false);
  });

  it("rejects an invalid mobile number", () => {
    expect(academySettingsSchema.safeParse({ ...valid, mobile: "12345" }).success).toBe(false);
    expect(academySettingsSchema.safeParse({ ...valid, mobile: "5876543210" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(academySettingsSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });

  it("rejects an address over 300 characters", () => {
    expect(academySettingsSchema.safeParse({ ...valid, address: "a".repeat(301) }).success).toBe(false);
  });
});

describe("receiptSettingsSchema", () => {
  const valid = { receiptPrefix: "SNT", receiptIncludeYear: true, receiptFooter: "Thank You" };

  it("accepts a valid payload", () => {
    expect(receiptSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("uppercases and trims the prefix", () => {
    expect(receiptSettingsSchema.parse({ ...valid, receiptPrefix: " snt " }).receiptPrefix).toBe("SNT");
  });

  it("accepts digits in the prefix", () => {
    expect(receiptSettingsSchema.safeParse({ ...valid, receiptPrefix: "ST2" }).success).toBe(true);
  });

  it.each(["S", "ABCDEFGHI", "S-T", "SN T", ""])("rejects the invalid prefix %j", (bad) => {
    expect(receiptSettingsSchema.safeParse({ ...valid, receiptPrefix: bad }).success).toBe(false);
  });

  it("allows an empty footer", () => {
    expect(receiptSettingsSchema.parse({ ...valid, receiptFooter: "" }).receiptFooter).toBe("");
  });

  it("rejects a footer over 200 characters", () => {
    expect(receiptSettingsSchema.safeParse({ ...valid, receiptFooter: "a".repeat(201) }).success).toBe(false);
  });

  it("requires include-year to be a boolean", () => {
    expect(receiptSettingsSchema.safeParse({ ...valid, receiptIncludeYear: "yes" }).success).toBe(false);
  });
});

describe("reminderSettingsSchema", () => {
  const valid = { reminderTemplate: DEFAULT_REMINDER_TEMPLATE, dueSoonDays: 3, overdueReminderDays: 7 };

  it("accepts the default template and default numbers", () => {
    expect(reminderSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a custom template using all three placeholders", () => {
    expect(
      reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "{academy}: Hi {name}, please pay ₹{amount}." }).success
    ).toBe(true);
  });

  it("rejects a template missing {amount}", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "Hi {name}, please pay soon." }).success).toBe(false);
  });

  it("rejects a template missing {name}", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "Please pay ₹{amount} soon." }).success).toBe(false);
  });

  it("rejects an unknown placeholder", () => {
    expect(
      reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "Hi {name}, ₹{amount} {foo}" }).success
    ).toBe(false);
  });

  it("rejects an empty template and one longer than 500 characters", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "   " }).success).toBe(false);
    expect(
      reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: `{name} {amount} ${"a".repeat(500)}` }).success
    ).toBe(false);
  });

  it("accepts the shortest valid template", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "{name}{amount}" }).success).toBe(true);
  });

  it("coerces numeric strings for the day counts", () => {
    const result = reminderSettingsSchema.parse({ ...valid, dueSoonDays: "5", overdueReminderDays: "10" });
    expect(result.dueSoonDays).toBe(5);
    expect(result.overdueReminderDays).toBe(10);
  });

  it.each([0, 31, 5.5, "", "abc"])("rejects dueSoonDays %j", (bad) => {
    expect(reminderSettingsSchema.safeParse({ ...valid, dueSoonDays: bad }).success).toBe(false);
  });

  it.each([0, 61, 2.5, ""])("rejects overdueReminderDays %j", (bad) => {
    expect(reminderSettingsSchema.safeParse({ ...valid, overdueReminderDays: bad }).success).toBe(false);
  });

  it("accepts the boundary values 1 and 30 / 60", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, dueSoonDays: 1, overdueReminderDays: 1 }).success).toBe(true);
    expect(reminderSettingsSchema.safeParse({ ...valid, dueSoonDays: 30, overdueReminderDays: 60 }).success).toBe(true);
  });
});
