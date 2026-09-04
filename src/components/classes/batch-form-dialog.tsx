"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { batchSchema, type BatchInput, DAYS } from "@/lib/validations/batch";
import { createBatch, updateBatch } from "@/actions/batches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

type BatchWithRelations = {
  id: string;
  name: string;
  courseId: string;
  instructorId: string | null;
  timing: string;
  days: string[];
  capacity: number;
};

function defaultsFor(batch?: BatchWithRelations): BatchInput {
  return batch
    ? {
        name: batch.name,
        courseId: batch.courseId,
        instructorId: batch.instructorId ?? "",
        timing: batch.timing,
        days: batch.days as BatchInput["days"],
        capacity: batch.capacity,
      }
    : { name: "", courseId: "", instructorId: "", timing: "", days: [], capacity: 20 };
}

export function BatchFormDialog({
  open,
  onOpenChange,
  batch,
  courses,
  instructors,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch?: BatchWithRelations;
  // Fetched by the nearest Server Component ancestor (via listCourses/listInstructors
  // from src/lib/queries/) and passed down as props — this dialog cannot fetch them
  // itself since those are server-only functions, not Server Actions.
  courses: { id: string; name: string }[];
  instructors: { id: string; name: string }[];
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
  } = useForm<BatchInput>({
    resolver: zodResolver(batchSchema),
    defaultValues: defaultsFor(batch),
  });

  // BatchFormDialog is a single persistent instance reused for both "New" and
  // "Edit" (the page toggles `batch` and flips `open` rather than remounting),
  // so react-hook-form's `defaultValues` — only applied at initial mount — go
  // stale. Re-seed the form whenever the dialog opens for a given target.
  useEffect(() => {
    if (open) reset(defaultsFor(batch));
  }, [open, batch, reset]);

  const selectedDays = watch("days") ?? [];

  async function onSubmit(data: BatchInput) {
    setSubmitting(true);
    try {
      if (batch) {
        await updateBatch(batch.id, data);
        toast.success("Batch updated");
      } else {
        await createBatch(data);
        toast.success("Batch created");
      }
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleDay(day: (typeof DAYS)[number]) {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    setValue("days", next);
  }

  const handleOpenChange = useGuardedDialogOpenChange(submitting, onOpenChange);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>{batch ? "Edit Batch" : "New Batch"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Batch Name</Label>
            <Input id="name" {...register("name")} placeholder="e.g. Morning Zumba" disabled={submitting} />
            {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Course</Label>
            <Select
              value={watch("courseId")}
              onValueChange={(v) => setValue("courseId", v as string)}
              disabled={submitting}
            >
              <SelectTrigger>
                {/* SelectValue only resolves a label automatically when the selected
                    `value` matches its own display text (as with Course's hardcoded
                    category strings); here value is a courseId, so the label has to be
                    looked up explicitly via the children-function form. */}
                <SelectValue placeholder="Select a course">
                  {(value: string) => courses.find((c) => c.id === value)?.name ?? "Select a course"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.courseId && <p className="text-sm text-danger">{errors.courseId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Instructor</Label>
            <Select
              value={watch("instructorId")}
              onValueChange={(v) => setValue("instructorId", v as string)}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an instructor">
                  {(value: string) =>
                    instructors.find((i) => i.id === value)?.name ?? "Select an instructor"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {instructors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.instructorId && <p className="text-sm text-danger">{errors.instructorId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="timing">Timing</Label>
            <Input id="timing" {...register("timing")} placeholder="e.g. 7:00 AM - 8:00 AM" disabled={submitting} />
            {errors.timing && <p className="text-sm text-danger">{errors.timing.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Days</Label>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((day) => (
                <label key={day} className="flex items-center gap-1 text-sm text-muted">
                  <Checkbox
                    checked={selectedDays.includes(day)}
                    onCheckedChange={() => toggleDay(day)}
                    disabled={submitting}
                  />
                  {day}
                </label>
              ))}
            </div>
            {errors.days && <p className="text-sm text-danger">{errors.days.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input id="capacity" type="number" {...register("capacity")} disabled={submitting} />
            {errors.capacity && <p className="text-sm text-danger">{errors.capacity.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save Batch"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
