"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserRound, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InstructorFormDialog } from "@/components/classes/instructor-form-dialog";
import { listInstructors, deleteInstructor } from "@/actions/instructors";

type InstructorWithBatches = Awaited<ReturnType<typeof listInstructors>>[number];

export function InstructorsList({ instructors }: { instructors: InstructorWithBatches[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InstructorWithBatches | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<InstructorWithBatches | undefined>();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={16} className="mr-2" />
          Add Instructor
        </Button>
      </div>

      {instructors.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No instructors added yet."
          actionLabel="+ Add Your First Instructor"
          onAction={() => setFormOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.map((instructor) => (
            <Card key={instructor.id} className="glass-card space-y-2 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{instructor.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground">{instructor.name}</p>
                    <p className="text-sm text-muted">{instructor.mobile}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(instructor);
                      setFormOpen(true);
                    }}
                    className="rounded p-1 text-muted hover:text-gold"
                    aria-label="Edit instructor"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(instructor)}
                    className="rounded p-1 text-muted hover:text-danger"
                    aria-label="Delete instructor"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {instructor.bio && <p className="text-sm text-muted">{instructor.bio}</p>}
              <p className="text-xs text-muted">{instructor.batches.length} batch(es)</p>
            </Card>
          ))}
        </div>
      )}

      <InstructorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        instructor={editing}
        onSuccess={() => router.refresh()}
      />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(undefined)}
          title={`Delete "${deleteTarget.name}"?`}
          description="This instructor will be removed from the list. Batches assigned to them will need a new instructor."
          onConfirm={async () => {
            await deleteInstructor(deleteTarget.id);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
