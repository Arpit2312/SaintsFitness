import { describe, it, expect } from "vitest";
import { paymentSchema } from "@/lib/validations/payment";

const validInput = {
  amount: 1500,
  paymentDate: "2026-09-01",
  mode: "UPI" as const,
  periodsCovered: 1,
  notes: "",
};

describe("paymentSchema", () => {
  it("accepts a valid payment", () => {
    expect(paymentSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects periodsCovered below 1", () => {
    expect(paymentSchema.safeParse({ ...validInput, periodsCovered: 0 }).success).toBe(false);
  });

  it("accepts periodsCovered at the upper bound (60)", () => {
    expect(paymentSchema.safeParse({ ...validInput, periodsCovered: 60 }).success).toBe(true);
  });

  it("rejects periodsCovered above the upper bound (a likely fat-finger error)", () => {
    expect(paymentSchema.safeParse({ ...validInput, periodsCovered: 61 }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...validInput, periodsCovered: 9999 }).success).toBe(false);
  });
});
