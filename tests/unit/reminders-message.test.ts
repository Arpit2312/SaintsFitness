import { describe, it, expect } from "vitest";
import { buildReminderMessage } from "@/lib/reminders/message";

describe("buildReminderMessage", () => {
  it("interpolates the student's name and the pending amount", () => {
    const message = buildReminderMessage("Aarav Shah", 1500);
    expect(message).toContain("Aarav Shah");
    expect(message).toContain("₹1,500");
  });

  it("formats a large amount with Indian-style thousands separators", () => {
    const message = buildReminderMessage("Priya", 123456);
    expect(message).toContain("₹1,23,456");
  });

  it("formats a zero amount plainly", () => {
    const message = buildReminderMessage("Rahul", 0);
    expect(message).toContain("₹0");
  });

  it("starts with the fixed SAINTS reminder header", () => {
    expect(buildReminderMessage("Test", 100).startsWith("SAINTS – Fee Reminder")).toBe(true);
  });

  it("produces the exact legacy message when called without options", () => {
    expect(buildReminderMessage("Aarav Shah", 1500)).toBe(
      "SAINTS – Fee Reminder\nHi Aarav Shah, this is a reminder that ₹1,500 is pending for your SAINTS fees. Please clear it at your earliest convenience. Thank you!"
    );
  });

  it("renders a custom template with name and amount", () => {
    expect(buildReminderMessage("Priya", 123456, { template: "Dear {name}, please pay ₹{amount}." })).toBe(
      "Dear Priya, please pay ₹1,23,456."
    );
  });

  it("fills {academy} from the academy name option, defaulting to SAINTS", () => {
    expect(buildReminderMessage("Rahul", 500, { template: "{academy}: {name}", academyName: "Zen Studio" })).toBe(
      "Zen Studio: Rahul"
    );
    expect(buildReminderMessage("Rahul", 500, { template: "{academy}: {name}" })).toBe("SAINTS: Rahul");
  });
});
