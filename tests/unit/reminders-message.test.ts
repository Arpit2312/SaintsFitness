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
});
