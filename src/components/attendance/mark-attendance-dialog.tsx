"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { markStudentAttendanceSchema, type MarkStudentAttendanceInput } from "@/lib/validations/attendance";
import { markStudentAttendance } from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { toast } from "sonner";

function defaults(batchId: string): MarkStudentAttendanceInput {
  return { batchId, date: new Date(), status: "PRESENT" };
}

// Same controlled-date-field fix as fee-plan-form-dialog.tsx / Phase 1's
// student-form.tsx: <input type="date"> rejects a raw Date assigned via
// register(), so this must be controlled via watch()/setValue().
function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function MarkAttendanceDialog({
  open,
  onOpenChange,
  studentId,
  batches,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  batches: { id: string; name: string }[];
  onSuccess?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const firstBatchId = batches[0]?.id ?? "";

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<MarkStudentAttendanceInput>({
    resolver: zodResolver(markStudentAttendanceSchema),
    defaultValues: defaults(firstBatchId),
  });

  useEffect(() => {
    if (open) reset(defaults(firstBatchId));
  }, [open, firstBatchId, reset]);

  async function onSubmit(data: MarkStudentAttendanceInput) {
    setSubmitting(true);
    try {
      await markStudentAttendance(studentId, data);
      toast.success("Attendance recorded");
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
          <DialogTitle>Mark Attendance</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Batch</Label>
            <Select
              value={watch("batchId")}
              onValueChange={(v) => setValue("batchId", v as string)}
              disabled={submitting || batches.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a batch">
                  {(value: string) => batches.find((b) => b.id === value)?.name ?? "Select a batch"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.batchId && <p className="text-sm text-danger">{errors.batchId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              max={toDateInputValue(new Date())}
              value={toDateInputValue(watch("date"))}
              onChange={(e) =>
                setValue("date", (e.target.value || undefined) as unknown as Date, { shouldValidate: true })
              }
              disabled={submitting}
            />
            {errors.date && <p className="text-sm text-danger">{String(errors.date.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={watch("status")}
              onValueChange={(v) => setValue("status", v as MarkStudentAttendanceInput["status"])}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRESENT">Present</SelectItem>
                <SelectItem value="ABSENT">Absent</SelectItem>
                <SelectItem value="LATE">Late</SelectItem>
                <SelectItem value="LEAVE">Leave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={submitting || batches.length === 0}>
            {submitting ? "Saving..." : "Mark Attendance"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
