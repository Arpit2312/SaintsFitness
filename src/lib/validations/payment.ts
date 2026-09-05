import { z } from "zod";

export const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  paymentDate: z.coerce.date(),
  mode: z.enum(["CASH", "UPI", "ONLINE", "BANK_TRANSFER"]),
  // Upper bound is a fat-finger guard, not a business rule: even at MONTHLY
  // frequency, 60 periods is 5 years paid in advance, comfortably past any
  // real use case, while still catching an accidental extra digit (e.g.
  // "9999" instead of "1") from silently producing a coverageEnd many
  // millennia in the future.
  periodsCovered: z.coerce
    .number()
    .int()
    .min(1, "Must cover at least 1 period")
    .max(60, "Must cover 60 periods or fewer"),
  notes: z.string().optional(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
