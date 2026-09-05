import { describe, it, expect } from "vitest";
import { feePlanSchema } from "@/lib/validations/fee-plan";

const validInput = {
  totalAmount: 1500,
  frequency: "MONTHLY" as const,
  dueDate: "2026-09-01",
  discount: 0,
};

describe("feePlanSchema", () => {
  it("accepts a valid plan", () => {
    expect(feePlanSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects a zero or negative total amount", () => {
    expect(feePlanSchema.safeParse({ ...validInput, totalAmount: 0 }).success).toBe(false);
    expect(feePlanSchema.safeParse({ ...validInput, totalAmount: -100 }).success).toBe(false);
  });

  it("rejects a discount larger than the total amount", () => {
    expect(feePlanSchema.safeParse({ ...validInput, totalAmount: 1000, discount: 1500 }).success).toBe(false);
  });

  it("accepts a discount exactly equal to the total amount (free plan)", () => {
    expect(feePlanSchema.safeParse({ ...validInput, totalAmount: 1000, discount: 1000 }).success).toBe(true);
  });

  it("defaults discount to 0 when omitted", () => {
    const { discount, ...withoutDiscount } = validInput;
    const result = feePlanSchema.safeParse(withoutDiscount);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discount).toBe(0);
  });
});
