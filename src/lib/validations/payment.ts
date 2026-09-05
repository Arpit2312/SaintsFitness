import { z } from "zod";

export const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  paymentDate: z.coerce.date(),
  mode: z.enum(["CASH", "UPI", "ONLINE", "BANK_TRANSFER"]),
  periodsCovered: z.coerce.number().int().min(1, "Must cover at least 1 period"),
  notes: z.string().optional(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
