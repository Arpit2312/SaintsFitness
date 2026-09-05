import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { waterfallAllocate } from "@/lib/fees/allocation";

describe("waterfallAllocate", () => {
  it("fully covers each period in order when the payment exactly matches total due", () => {
    const result = waterfallAllocate(new Decimal(4500), [new Decimal(1500), new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["1500", "1500", "1500"]);
  });

  it("partially covers the last period it reaches when underpaying (the waterfall scenario)", () => {
    const result = waterfallAllocate(new Decimal(4000), [new Decimal(1500), new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["1500", "1500", "1000"]);
  });

  it("allocates nothing to periods beyond what the payment covers", () => {
    const result = waterfallAllocate(new Decimal(1500), [new Decimal(1500), new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["1500", "0", "0"]);
  });

  it("caps allocation at each period's remaining due, never over-allocating a single period", () => {
    // Simulates a period that's already partially paid elsewhere (remaining due < full amount).
    const result = waterfallAllocate(new Decimal(2000), [new Decimal(500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["500", "1500"]);
  });

  it("handles an overpayment gracefully -- excess is simply not allocated anywhere", () => {
    const result = waterfallAllocate(new Decimal(10000), [new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["1500", "1500"]);
  });

  it("returns an empty array for zero periods", () => {
    expect(waterfallAllocate(new Decimal(1500), [])).toEqual([]);
  });

  it("allocates zero to every period for a zero-amount payment", () => {
    const result = waterfallAllocate(new Decimal(0), [new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["0", "0"]);
  });

  it("treats a negative remaining-due (already overpaid) as zero, not negative allocation", () => {
    const result = waterfallAllocate(new Decimal(1500), [new Decimal(-500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["0", "1500"]);
  });
});
