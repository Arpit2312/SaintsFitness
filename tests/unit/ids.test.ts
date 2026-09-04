import { describe, it, expect } from "vitest";
import { formatSequence } from "@/lib/ids";

describe("formatSequence", () => {
  it("pads a small number to the given width", () => {
    expect(formatSequence("ST", 1, 5)).toBe("ST-00001");
  });

  it("pads a larger number correctly", () => {
    expect(formatSequence("ST", 125, 5)).toBe("ST-00125");
  });

  it("does not truncate a number wider than the padding width", () => {
    expect(formatSequence("ST", 123456, 5)).toBe("ST-123456");
  });

  it("supports a year-scoped prefix for receipts", () => {
    expect(formatSequence("SNT-2026", 451, 5)).toBe("SNT-2026-00451");
  });
});
