import { z } from "zod";

export const feePlanSchema = z.object({
  totalAmount: z.coerce.number().positive("Total amount must be greater than zero"),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  dueDate: z.coerce.date(),
  discount: z.coerce.number().min(0, "Discount cannot be negative").default(0),
}).refine((data) => data.discount <= data.totalAmount, {
  message: "Discount cannot exceed the total amount",
  path: ["discount"],
});

export type FeePlanInput = z.infer<typeof feePlanSchema>;
