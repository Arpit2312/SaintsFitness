"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { instructorSchema, type InstructorInput } from "@/lib/validations/instructor";
import { createInstructor, updateInstructor } from "@/actions/instructors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { toast } from "sonner";

export function InstructorFormDialog({
  open,
  onOpenChange,
  instructor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor?: { id: string; name: string; mobile: string; bio: string | null };
}) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InstructorInput>({
    resolver: zodResolver(instructorSchema),
    defaultValues: instructor
      ? { name: instructor.name, mobile: instructor.mobile, bio: instructor.bio ?? "" }
      : { name: "", mobile: "", bio: "" },
  });

  // InstructorFormDialog is a single persistent instance reused for both
  // "New" and "Edit" (the page toggles `instructor` and flips `open` rather
  // than remounting), so react-hook-form's `defaultValues` — only applied at
  // initial mount — go stale: opening "Edit" after the form has already
  // mounted once would otherwise show blank fields. Re-seed the form
  // whenever the dialog opens for a given target.
  useEffect(() => {
    if (open) {
      reset(
        instructor
          ? { name: instructor.name, mobile: instructor.mobile, bio: instructor.bio ?? "" }
          : { name: "", mobile: "", bio: "" }
      );
    }
  }, [open, instructor, reset]);

  async function onSubmit(data: InstructorInput) {
    setSubmitting(true);
    try {
      if (instructor) {
        await updateInstructor(instructor.id, data);
        toast.success("Instructor updated");
      } else {
        await createInstructor(data);
        toast.success("Instructor created");
      }
      reset();
      onOpenChange(false);
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
          <DialogTitle>{instructor ? "Edit Instructor" : "New Instructor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} disabled={submitting} />
            {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile</Label>
            <Input id="mobile" {...register("mobile")} disabled={submitting} />
            {errors.mobile && <p className="text-sm text-danger">{errors.mobile.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" {...register("bio")} disabled={submitting} />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save Instructor"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
