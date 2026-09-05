"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { feePlanSchema, type FeePlanInput } from "@/lib/validations/fee-plan";
import { saveFeePlan } from "@/actions/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { toast } from "sonner";

type ExistingFeePlan = {
  totalAmount: number;
  frequency: FeePlanInput["frequency"];
  dueDate: Date;
  discount: number;
};

// feePlanSchema's `discount` has a schema-level `.default(0)` (kept because
// tests/unit/fee-plan-validation.test.ts locks in that behavior for
// safeParse callers), which makes discount optional on zod's *input* type
// but required on its *output* type (FeePlanInput = z.infer, the output).
// zodResolver's Resolver is typed against the input side, so
// useForm<FeePlanInput> alone doesn't type-check (student.ts's dob/joiningDate
// comment covers the same class of bug, solved there by dropping the
// schema-level default — not an option here since a test depends on it).
// react-hook-form's 3-generic useForm<TFieldValues, TContext, TTransformedValues>
// exists for exactly this: form fields are typed against the input shape,
// while handleSubmit's callback still receives the resolved output shape.
type FeePlanFormValues = z.input<typeof feePlanSchema>;

function defaultsFor(plan?: ExistingFeePlan): FeePlanInput {
  return plan
    ? { totalAmount: plan.totalAmount, frequency: plan.frequency, dueDate: plan.dueDate, discount: plan.discount }
    : { totalAmount: 0, frequency: "MONTHLY", dueDate: new Date(), discount: 0 };
}

// <input type="date"> only accepts a "yyyy-MM-dd" string; a register()-based
// uncontrolled input assigning a raw Date to its DOM .value gets rejected by
// the browser, leaving the field blank. Same fix Phase 1's student-form.tsx
// already applies to dob/joiningDate: make the field controlled via
// watch()/setValue(), guarding against an invalid/absent Date so this never
// throws on .toISOString().
function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function FeePlanFormDialog({
  open,
  onOpenChange,
  studentId,
  plan,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  plan?: ExistingFeePlan;
  onSuccess?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FeePlanFormValues, unknown, FeePlanInput>({
    resolver: zodResolver(feePlanSchema),
    defaultValues: defaultsFor(plan),
  });

  useEffect(() => {
    if (open) reset(defaultsFor(plan));
  }, [open, plan, reset]);

  const totalAmount = watch("totalAmount") || 0;
  const discount = watch("discount") || 0;
  const finalAmount = Math.max(totalAmount - discount, 0);

  async function onSubmit(data: FeePlanInput) {
    setSubmitting(true);
    try {
      await saveFeePlan(studentId, data);
      toast.success(plan ? "Fee plan updated" : "Fee plan created");
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const handleOpenChange = useGuardedDialogOpenChange(submitting, onOpenChange);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>{plan ? "Edit Fee Plan" : "Set Up Fee Plan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="totalAmount">Total Fee Amount (₹)</Label>
            <Input id="totalAmount" type="number" step="0.01" {...register("totalAmount")} disabled={submitting} />
            {errors.totalAmount && <p className="text-sm text-danger">{errors.totalAmount.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select
              value={watch("frequency")}
              onValueChange={(v) => setValue("frequency", v as FeePlanInput["frequency"])}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                <SelectItem value="YEARLY">Yearly</SelectItem>
                <SelectItem value="CUSTOM">Custom (one-time)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueDate">Start Date</Label>
            <Input
              id="dueDate"
              type="date"
              value={toDateInputValue(watch("dueDate"))}
              onChange={(e) =>
                setValue("dueDate", (e.target.value || undefined) as unknown as Date, { shouldValidate: true })
              }
              disabled={submitting}
            />
            {errors.dueDate && <p className="text-sm text-danger">{String(errors.dueDate.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount">Discount (₹)</Label>
            <Input id="discount" type="number" step="0.01" {...register("discount")} disabled={submitting} />
            {errors.discount && <p className="text-sm text-danger">{errors.discount.message}</p>}
          </div>
          <div className="glass-card p-3 text-sm text-muted">
            Final Payable: <span className="text-gold">₹{finalAmount.toLocaleString("en-IN")}</span> per period
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save Fee Plan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
