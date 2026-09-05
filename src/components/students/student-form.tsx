"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { studentSchema, type StudentInput } from "@/lib/validations/student";
import { createStudent, updateStudent } from "@/actions/students";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type ExistingStudent = StudentInput & { id: string; photoUrl: string | null };

export function StudentForm({
  existing,
  batches,
}: {
  existing?: ExistingStudent;
  // Fetched by the parent Server Component (listBatchOptions from
  // src/lib/queries/batches.ts) and passed down as a prop — this form
  // cannot fetch it client-side since that function is server-only.
  batches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StudentInput>({
    resolver: zodResolver(studentSchema),
    defaultValues: existing ?? {
      name: "",
      mobile: "",
      dob: undefined,
      gender: "MALE",
      joiningDate: new Date(),
      status: "ACTIVE",
      batchId: "",
      houseStreet: "",
      area: "",
      city: "",
      state: "",
      pinCode: "",
      emergencyContactName: "",
      emergencyContactRelationship: "",
      emergencyContactMobile: "",
      fatherName: "",
      motherName: "",
      guardianName: "",
      parentMobile: "",
    },
  });

  async function onSubmit(data: StudentInput) {
    setSubmitting(true);
    try {
      if (existing) {
        await updateStudent(existing.id, data);
        toast.success("Student updated");
        router.push(`/students/${existing.id}`);
      } else {
        await createStudent(data);
        toast.success("Student added");
        router.push("/students");
      }
    } catch {
      toast.error("Something went wrong. Please check the form and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function field(name: keyof StudentInput, label: string, type = "text") {
    return (
      <div className="space-y-2">
        <Label htmlFor={name}>{label}</Label>
        <Input id={name} type={type} {...register(name)} disabled={submitting} />
        {errors[name] && <p className="text-sm text-danger">{errors[name]?.message as string}</p>}
      </div>
    );
  }

  // <input type="date"> only accepts a "yyyy-MM-dd" string. StudentInput
  // types dob/joiningDate as `Date` (zod's *output* type for
  // z.coerce.date()), so a register()-based uncontrolled input gets a raw
  // Date object assigned to its DOM .value on mount — that coerces to
  // Date's verbose toString() (e.g. "Mon May 15 2000 05:30:00 GMT+0530..."),
  // which the browser rejects, leaving the field blank even when a value
  // exists (reproduced for both the edit form's pre-filled dob and the
  // create form's `joiningDate: new Date()` default). Making the field
  // controlled and formatting the display value fixes this; the raw
  // "yyyy-MM-dd" string is written back via setValue and only gets coerced
  // to a real Date by zodResolver at validate/submit time, same as the
  // register()-based fields already relied on.
  function toDateInputValue(value: unknown): string {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value as string);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  function dateField(name: "dob" | "joiningDate", label: string) {
    return (
      <div className="space-y-2">
        <Label htmlFor={name}>{label}</Label>
        <Input
          id={name}
          type="date"
          value={toDateInputValue(watch(name))}
          onChange={(e) =>
            setValue(name, (e.target.value || undefined) as unknown as Date, {
              shouldValidate: true,
            })
          }
          disabled={submitting}
        />
        {errors[name] && <p className="text-sm text-danger">{errors[name]?.message as string}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-8">
      <section className="glass-card space-y-4 p-6">
        <h2 className="font-medium text-gold">Basic Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Student Name")}
          {field("mobile", "Mobile Number")}
          {dateField("dob", "Date of Birth")}
          {dateField("joiningDate", "Joining Date")}
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={watch("gender")}
              onValueChange={(v) => setValue("gender", v as StudentInput["gender"])}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={watch("status")}
              onValueChange={(v) => setValue("status", v as StudentInput["status"])}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="LEFT">Left</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Batch</Label>
            {/* SelectValue only auto-resolves a label when value === label; a
                batchId is never equal to its display name, so the label must
                be looked up explicitly (same pattern as batch-form-dialog.tsx). */}
            <Select
              value={watch("batchId")}
              onValueChange={(v) => setValue("batchId", v as string)}
              disabled={submitting}
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
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <h2 className="font-medium text-gold">Address</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("houseStreet", "House / Street")}
          {field("area", "Area")}
          {field("city", "City")}
          {field("state", "State")}
          {field("pinCode", "PIN Code")}
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <h2 className="font-medium text-gold">Emergency Contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("emergencyContactName", "Contact Name")}
          {field("emergencyContactRelationship", "Relationship")}
          {field("emergencyContactMobile", "Mobile Number")}
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <h2 className="font-medium text-gold">Parent Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("fatherName", "Father Name")}
          {field("motherName", "Mother Name")}
          {field("guardianName", "Guardian Name")}
          {field("parentMobile", "Parent Mobile Number")}
        </div>
      </section>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : existing ? "Save Changes" : "Add Student"}
      </Button>
    </form>
  );
}
