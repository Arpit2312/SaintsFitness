"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { courseSchema, type CourseInput } from "@/lib/validations/course";
import { createCourse, updateCourse } from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export function CourseFormDialog({
  open,
  onOpenChange,
  course,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: { id: string; name: string; category: string; description: string | null };
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
  } = useForm<CourseInput>({
    resolver: zodResolver(courseSchema),
    defaultValues: course
      ? { name: course.name, category: course.category as CourseInput["category"], description: course.description ?? "" }
      : { name: "", category: "Dance", description: "" },
  });

  // CourseFormDialog is a single persistent instance reused for both "New"
  // and "Edit" (the page toggles `course` and flips `open` rather than
  // remounting), so react-hook-form's `defaultValues` — only applied at
  // initial mount — go stale: opening "Edit" after the form has already
  // mounted once would otherwise show blank fields. Re-seed the form
  // whenever the dialog opens for a given target.
  useEffect(() => {
    if (open) {
      reset(
        course
          ? { name: course.name, category: course.category as CourseInput["category"], description: course.description ?? "" }
          : { name: "", category: "Dance", description: "" }
      );
    }
  }, [open, course, reset]);

  async function onSubmit(data: CourseInput) {
    setSubmitting(true);
    try {
      if (course) {
        await updateCourse(course.id, data);
        toast.success("Course updated");
      } else {
        await createCourse(data);
        toast.success("Course created");
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

  const handleOpenChange = useGuardedDialogOpenChange(submitting, onOpenChange);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>{course ? "Edit Course" : "New Course"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Course Name</Label>
            <Input id="name" {...register("name")} disabled={submitting} />
            {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={watch("category")}
              // base-ui types onValueChange's value as `string | null`, but no real
              // call site emits null in single-select mode — see batch-form-dialog.tsx
              // for the fuller rationale (traced against @base-ui/react's SelectRoot.js).
              onValueChange={(v) => setValue("category", v as CourseInput["category"])}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Dance">Dance</SelectItem>
                <SelectItem value="Zumba">Zumba</SelectItem>
                <SelectItem value="Fitness">Fitness</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} disabled={submitting} />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save Course"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
