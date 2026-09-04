"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, CalendarDays, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { BatchFormDialog } from "@/components/classes/batch-form-dialog";
import { deleteBatch } from "@/actions/batches";
import type { listBatches } from "@/lib/queries/batches";

type BatchWithRelations = Awaited<ReturnType<typeof listBatches>>[number];

export function BatchesList({
  batches,
  courseOptions,
  instructorOptions,
}: {
  batches: BatchWithRelations[];
  courseOptions: { id: string; name: string }[];
  instructorOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BatchWithRelations | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<BatchWithRelations | undefined>();

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
          Add Batch
        </Button>
      </div>

      {batches.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No batches created yet."
          actionLabel="+ Add Your First Batch"
          onAction={() => setFormOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {batches.map((batch) => (
            <Card key={batch.id} className="glass-card space-y-2 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{batch.name}</p>
                  <p className="text-sm text-muted">{batch.course.name}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(batch);
                      setFormOpen(true);
                    }}
                    className="rounded p-1 text-muted hover:text-gold"
                    aria-label="Edit batch"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(batch)}
                    className="rounded p-1 text-muted hover:text-danger"
                    aria-label="Delete batch"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted">{batch.timing}</p>
              <div className="flex flex-wrap gap-1">
                {batch.days.map((day) => (
                  <Badge key={day} variant="outline" className="border-gold text-gold">
                    {day}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted">
                {batch.instructor?.name ?? "No instructor assigned"} ·{" "}
                {batch.enrollments.length}/{batch.capacity} students
              </p>
            </Card>
          ))}
        </div>
      )}

      <BatchFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        batch={editing}
        courses={courseOptions}
        instructors={instructorOptions}
        onSuccess={() => router.refresh()}
      />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(undefined)}
          title={`Delete "${deleteTarget.name}"?`}
          description="This batch will be removed from the list."
          onConfirm={async () => {
            await deleteBatch(deleteTarget.id);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
