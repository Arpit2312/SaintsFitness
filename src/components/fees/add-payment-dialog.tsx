"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, type PaymentInput } from "@/lib/validations/payment";
import { computeCoverageRange, formatMonthYear } from "@/lib/fees/periods";
import { createPayment } from "@/actions/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { FeeFrequency } from "@prisma/client";

function defaults(): PaymentInput {
  return { amount: 0, paymentDate: new Date(), mode: "CASH", periodsCovered: 1, notes: "" };
}

// Same controlled-date-field fix as fee-plan-form-dialog.tsx / Phase 1's
// student-form.tsx: <input type="date"> rejects a raw Date assigned via
// register(), so this must be controlled via watch()/setValue() with a
// guarded ISO-string conversion.
function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function AddPaymentDialog({
  open,
  onOpenChange,
  studentId,
  frequency,
  nextCoverageStart,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  frequency: FeeFrequency;
  nextCoverageStart: Date;
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
  } = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset]);

  const periodsCovered = watch("periodsCovered") || 1;
  const coveragePreview = useMemo(() => {
    if (frequency === "CUSTOM") return "One-time fee";
    const { coverageStart, coverageEnd } = computeCoverageRange(nextCoverageStart, periodsCovered, frequency);
    const startLabel = formatMonthYear(coverageStart);
    const endLabel = formatMonthYear(coverageEnd);
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  }, [frequency, nextCoverageStart, periodsCovered]);

  async function onSubmit(data: PaymentInput) {
    setSubmitting(true);
    try {
      await createPayment(studentId, data);
      toast.success("Payment recorded");
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
          <DialogTitle>Add Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount")} disabled={submitting} />
            {errors.amount && <p className="text-sm text-danger">{errors.amount.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentDate">Payment Date</Label>
            <Input
              id="paymentDate"
              type="date"
              value={toDateInputValue(watch("paymentDate"))}
              onChange={(e) =>
                setValue("paymentDate", (e.target.value || undefined) as unknown as Date, { shouldValidate: true })
              }
              disabled={submitting}
            />
            {errors.paymentDate && <p className="text-sm text-danger">{String(errors.paymentDate.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label>Payment Mode</Label>
            <Select
              value={watch("mode")}
              onValueChange={(v) => setValue("mode", v as PaymentInput["mode"])}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="ONLINE">Online Payment</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {frequency !== "CUSTOM" && (
            <div className="space-y-2">
              <Label htmlFor="periodsCovered">Periods Covered</Label>
              <Input
                id="periodsCovered"
                type="number"
                min={1}
                max={60}
                {...register("periodsCovered")}
                disabled={submitting}
              />
              {errors.periodsCovered && <p className="text-sm text-danger">{errors.periodsCovered.message}</p>}
            </div>
          )}
          <div className="glass-card p-3 text-sm text-muted">
            This will cover: <span className="text-gold">{coveragePreview}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} disabled={submitting} />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Add Payment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
