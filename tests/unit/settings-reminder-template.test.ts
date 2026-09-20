import { describe, it, expect } from "vitest";
import { renderReminderTemplate, extractPlaceholders } from "@/lib/settings/reminder-template";
import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/settings/defaults";

const VALUES = { name: "Aarav Shah", amount: "1,500", academy: "SAINTS" };

describe("renderReminderTemplate", () => {
  it("replaces name, amount and academy", () => {
    expect(renderReminderTemplate("{academy}: {name} owes ₹{amount}", VALUES)).toBe("SAINTS: Aarav Shah owes ₹1,500");
  });

  it("replaces repeated placeholders", () => {
    expect(renderReminderTemplate("{name} / {name}", VALUES)).toBe("Aarav Shah / Aarav Shah");
  });

  it("leaves unknown braces untouched", () => {
    expect(renderReminderTemplate("Hi {name} {foo}", VALUES)).toBe("Hi Aarav Shah {foo}");
  });

  it("does not substitute upper-case or spaced placeholders", () => {
    expect(renderReminderTemplate("{NAME} { name }", VALUES)).toBe("{NAME} { name }");
  });

  it("does not re-substitute placeholder-looking text inside a value", () => {
    expect(renderReminderTemplate("Hi {name}", { ...VALUES, name: "{amount}" })).toBe("Hi {amount}");
  });

  it("does not interpret $ patterns inside a value", () => {
    expect(renderReminderTemplate("Hi {name}", { ...VALUES, name: "$&" })).toBe("Hi $&");
  });

  it("renders the default template to the exact legacy reminder message", () => {
    expect(renderReminderTemplate(DEFAULT_REMINDER_TEMPLATE, VALUES)).toBe(
      "SAINTS – Fee Reminder\nHi Aarav Shah, this is a reminder that ₹1,500 is pending for your SAINTS fees. Please clear it at your earliest convenience. Thank you!"
    );
  });
});

describe("extractPlaceholders", () => {
  it("returns unique placeholder names in order of first appearance", () => {
    expect(extractPlaceholders("{name} {amount} {name} {academy}")).toEqual(["name", "amount", "academy"]);
  });

  it("returns an empty array when there are none", () => {
    expect(extractPlaceholders("no placeholders here")).toEqual([]);
  });

  it("includes unknown and empty names so callers can reject them", () => {
    expect(extractPlaceholders("{name} {foo} {}")).toEqual(["name", "foo", ""]);
  });
});
