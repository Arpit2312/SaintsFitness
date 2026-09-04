"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Layers, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CourseFormDialog } from "@/components/classes/course-form-dialog";
import { listCourses, deleteCourse } from "@/actions/courses";

type CourseWithBatches = Awaited<ReturnType<typeof listCourses>>[number];

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseWithBatches[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CourseWithBatches | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<CourseWithBatches | undefined>();

  const refresh = useCallback(async () => {
    setCourses(await listCourses());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, formOpen]);

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
          Add Course
        </Button>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No courses added yet."
          actionLabel="+ Add Your First Course"
          onAction={() => setFormOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="glass-card space-y-2 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{course.name}</p>
                  <Badge variant="outline" className="mt-1 border-gold text-gold">
                    {course.category}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(course);
                      setFormOpen(true);
                    }}
                    className="rounded p-1 text-muted hover:text-gold"
                    aria-label="Edit course"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(course)}
                    className="rounded p-1 text-muted hover:text-danger"
                    aria-label="Delete course"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {course.description && <p className="text-sm text-muted">{course.description}</p>}
              <p className="text-xs text-muted">{course.batches.length} batch(es)</p>
            </Card>
          ))}
        </div>
      )}

      <CourseFormDialog open={formOpen} onOpenChange={setFormOpen} course={editing} />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(undefined)}
          title={`Delete "${deleteTarget.name}"?`}
          description="This course will be removed from the list. Batches under it will need a new course."
          onConfirm={async () => {
            await deleteCourse(deleteTarget.id);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
