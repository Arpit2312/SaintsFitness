"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NoteFormDialog } from "@/components/journey/note-form-dialog";
import { deleteInstructorNote } from "@/actions/journey";
import type { JourneyNote } from "@/lib/journey/types";
import { formatDateUTC } from "@/lib/dates";

export function StudentNotesTab({
  studentId,
  notes,
  instructors,
  defaultInstructorId,
}: {
  studentId: string;
  notes: JourneyNote[];
  instructors: { id: string; name: string }[];
  defaultInstructorId: string | null;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<JourneyNote | undefined>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Instructor reflections on this student&rsquo;s journey.</p>
        <Button
          onClick={() => {
            setFormKey((k) => k + 1);
            setFormOpen(true);
          }}
          disabled={instructors.length === 0}
        >
          <Plus size={16} className="mr-2" />
          Add note
        </Button>
      </div>
      {instructors.length === 0 && (
        <p className="text-xs text-muted">Add an instructor under Classes &rarr; Instructors before writing notes.</p>
      )}

      {notes.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted">
          No notes yet. A short, kind observation is a good place to start.
        </div>
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {notes.map((note) => (
            <div key={note.id} className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-1">
                <p className="whitespace-pre-wrap text-foreground">{note.note}</p>
                <p className="text-xs text-muted">
                  {note.instructorName} · {formatDateUTC(note.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(note)}
                className="rounded p-1 text-muted hover:text-danger"
                aria-label="Delete note"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <NoteFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        studentId={studentId}
        instructors={instructors}
        defaultInstructorId={defaultInstructorId}
        onSuccess={() => router.refresh()}
      />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(undefined)}
          title="Delete this note?"
          description="This note will be permanently removed from the student's journey."
          onConfirm={async () => {
            await deleteInstructorNote(deleteTarget.id);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
