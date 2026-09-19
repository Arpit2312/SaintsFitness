"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { addInstructorNote } from "@/actions/journey";
import { instructorNoteSchema } from "@/lib/validations/journey";
import { toast } from "sonner";

const MAX_LENGTH = 1000;

export function NoteFormDialog({
  open,
  onOpenChange,
  studentId,
  instructors,
  defaultInstructorId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  instructors: { id: string; name: string }[];
  defaultInstructorId: string | null;
  onSuccess?: () => void;
}) {
  // Seeded once on mount; the parent remounts this dialog (new `key`) each
  // time it opens, so every "Add note" starts fresh.
  const [instructorId, setInstructorId] = useState(defaultInstructorId ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = instructorNoteSchema.safeParse({ studentId, instructorId, note });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await addInstructorNote(parsed.data);
      toast.success("Note added");
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
          <DialogTitle>Add Note</DialogTitle>
          <DialogDescription>A reflection on this student&rsquo;s journey, from their instructor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="noteInstructor">Instructor</Label>
            {/* Always controlled ("" = nothing chosen yet); passing undefined here would
                start uncontrolled and flip to controlled on first pick, which base-ui warns about. */}
            <Select
              value={instructorId}
              disabled={submitting}
              onValueChange={(v) => setInstructorId(v as string)}
            >
              <SelectTrigger id="noteInstructor" className="w-full">
                <SelectValue placeholder="Select an instructor">
                  {(value: string) => instructors.find((i) => i.id === value)?.name ?? "Select an instructor"}
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="noteText">Note</Label>
            <Textarea
              id="noteText"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Your movement is becoming more confident. Keep observing yourself."
              disabled={submitting}
              className="max-h-48 overflow-y-auto"
            />
            <p className={note.length > MAX_LENGTH ? "text-right text-xs text-danger" : "text-right text-xs text-muted"}>
              {note.length} / {MAX_LENGTH}
            </p>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save Note"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
