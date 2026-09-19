import { describe, it, expect } from "vitest";
import { mergeActivity, summarizeAttendance } from "@/lib/notifications/activity";

const at = (iso: string) => new Date(iso);

describe("mergeActivity", () => {
  it("sorts newest first", () => {
    const merged = mergeActivity(
      [
        { at: at("2026-09-01T00:00:00Z"), text: "old" },
        { at: at("2026-09-03T00:00:00Z"), text: "new" },
        { at: at("2026-09-02T00:00:00Z"), text: "mid" },
      ],
      10
    );
    expect(merged.map((e) => e.text)).toEqual(["new", "mid", "old"]);
  });

  it("caps the result at the limit", () => {
    const events = Array.from({ length: 15 }, (_, i) => ({ at: new Date(Date.UTC(2026, 8, 1 + i)), text: `e${i}` }));
    expect(mergeActivity(events, 10)).toHaveLength(10);
    expect(mergeActivity(events, 10)[0].text).toBe("e14");
  });

  it("returns an empty array for no events and does not mutate its input", () => {
    expect(mergeActivity([], 10)).toEqual([]);
    const input = [
      { at: at("2026-09-01T00:00:00Z"), text: "a" },
      { at: at("2026-09-02T00:00:00Z"), text: "b" },
    ];
    mergeActivity(input, 10);
    expect(input.map((e) => e.text)).toEqual(["a", "b"]);
  });
});

describe("summarizeAttendance", () => {
  const row = (batchId: string, batchName: string, date: string, status: string, createdAt: string) => ({
    batchId,
    batchName,
    date: at(date),
    status,
    createdAt: at(createdAt),
  });

  it("groups rows for the same batch and date into one event", () => {
    const events = summarizeAttendance([
      row("b1", "Morning Zumba", "2026-09-13T00:00:00Z", "PRESENT", "2026-09-13T06:00:00Z"),
      row("b1", "Morning Zumba", "2026-09-13T00:00:00Z", "LATE", "2026-09-13T06:00:05Z"),
      row("b1", "Morning Zumba", "2026-09-13T00:00:00Z", "ABSENT", "2026-09-13T06:00:10Z"),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe("Morning Zumba attendance marked: 2 of 3 present.");
    expect(events[0].at.toISOString()).toBe("2026-09-13T06:00:10.000Z");
  });

  it("keeps different batches and different dates separate", () => {
    const events = summarizeAttendance([
      row("b1", "Morning Zumba", "2026-09-13T00:00:00Z", "PRESENT", "2026-09-13T06:00:00Z"),
      row("b2", "Evening Yoga", "2026-09-13T00:00:00Z", "PRESENT", "2026-09-13T18:00:00Z"),
      row("b1", "Morning Zumba", "2026-09-12T00:00:00Z", "PRESENT", "2026-09-12T06:00:00Z"),
    ]);
    expect(events).toHaveLength(3);
  });

  it("counts LEAVE and ABSENT as not present", () => {
    const [event] = summarizeAttendance([
      row("b1", "Batch", "2026-09-13T00:00:00Z", "LEAVE", "2026-09-13T06:00:00Z"),
      row("b1", "Batch", "2026-09-13T00:00:00Z", "ABSENT", "2026-09-13T06:00:00Z"),
    ]);
    expect(event.text).toBe("Batch attendance marked: 0 of 2 present.");
  });

  it("returns no events for no rows", () => {
    expect(summarizeAttendance([])).toEqual([]);
  });
});
