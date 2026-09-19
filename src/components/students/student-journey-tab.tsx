"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JourneyPath } from "@/components/journey/journey-path";
import { ProgressFormDialog } from "@/components/journey/progress-form-dialog";
import { computeJourneyQualities, toJourneyItems } from "@/lib/journey/qualities";
import type { JourneyNote, JourneyProgressValues } from "@/lib/journey/types";
import { formatDateUTC } from "@/lib/dates";

export function StudentJourneyTab({
  studentId,
  progress,
  attendanceRate,
  recentNotes,
}: {
  studentId: string;
  progress: JourneyProgressValues | null;
  attendanceRate: number | null;
  recentNotes: JourneyNote[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  // The dialog seeds its form once on mount, so a new key per open gives it
  // fresh initial values without an effect that calls setState.
  const [dialogKey, setDialogKey] = useState(0);

  const qualities = computeJourneyQualities({
    danceLevel: progress?.danceLevel ?? null,
    fitnessScore: progress?.fitnessScore ?? null,
    consistencyScore: progress?.consistencyScore ?? null,
    awarenessScore: progress?.awarenessScore ?? null,
    growthScore: progress?.growthScore ?? null,
    attendanceRate,
  });
  const items = toJourneyItems(qualities);
  // Discipline is derived from attendance, so it doesn't count as a reflection:
  // a student who has attended classes but has no progress reflections yet
  // should still get the "begin this journey" prompt.
  const hasAnyReflection = items.some((item) => item.key !== "discipline" && item.value !== null);

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">My SAINTS Journey</h2>
            <p className="text-sm text-muted">
              {progress?.danceLevel ? (
                <>
                  Dance level <Badge variant="outline">{progress.danceLevel}</Badge>
                </>
              ) : (
                "Dance level not yet reflected"
              )}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setDialogKey((k) => k + 1);
              setDialogOpen(true);
            }}
          >
            <Pencil size={16} className="mr-2" />
            Update Progress
          </Button>
        </div>

        <JourneyPath items={items} />
        <p className="text-center text-xs text-muted">Discipline reflects attendance over the last 90 days.</p>

        {!hasAnyReflection && (
          <p className="text-center text-sm text-muted">
            Begin this journey &mdash; add a first reflection with &ldquo;Update Progress&rdquo;.
          </p>
        )}
      </div>

      <div className="glass-card space-y-3 p-6">
        <h3 className="font-semibold text-foreground">Recent Reflections</h3>
        {recentNotes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            No reflections yet. Instructors can add notes from the Notes tab.
          </p>
        ) : (
          <div className="divide-y divide-card-border">
            {recentNotes.map((note) => (
              <div key={note.id} className="space-y-1 py-3">
                <p className="whitespace-pre-wrap break-words text-foreground">{note.note}</p>
                <p className="text-xs text-muted">
                  {note.instructorName} · {formatDateUTC(note.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProgressFormDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={studentId}
        initial={progress}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
