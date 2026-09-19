import { describe, it, expect } from "vitest";
import { formatReceiptNumber, receiptSequenceName } from "@/lib/settings/receipt";
import { formatSequence } from "@/lib/ids";

describe("formatReceiptNumber", () => {
  it("includes the year when asked", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: true, year: 2026, sequence: 45 })).toBe("SNT-2026-00045");
  });

  it("omits the year when asked", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: false, year: 2026, sequence: 45 })).toBe("SNT-00045");
  });

  it("pads the sequence to 5 digits", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: true, year: 2026, sequence: 1 })).toBe("SNT-2026-00001");
  });

  it("does not truncate a sequence wider than 5 digits", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: true, year: 2026, sequence: 123456 })).toBe(
      "SNT-2026-123456"
    );
  });

  it("uses the given prefix", () => {
    expect(formatReceiptNumber({ prefix: "ACAD", includeYear: false, year: 2026, sequence: 7 })).toBe("ACAD-00007");
  });

  it("matches the legacy generator's output for the default configuration", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: true, year: 2026, sequence: 451 })).toBe(
      formatSequence("SNT-2026", 451, 5)
    );
  });
});

describe("receiptSequenceName", () => {
  it("is per-year when the year is part of the number", () => {
    expect(receiptSequenceName(true, 2026)).toBe("receipt-2026");
  });

  it("is a single global counter when the year is not part of the number", () => {
    expect(receiptSequenceName(false, 2026)).toBe("receipt-all");
  });

  it("ignores the year for the global counter", () => {
    expect(receiptSequenceName(false, 2031)).toBe("receipt-all");
  });
});
