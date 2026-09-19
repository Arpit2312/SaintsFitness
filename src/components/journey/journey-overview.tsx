import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { JourneyPath } from "@/components/journey/journey-path";
import { computeJourneyQualities, toJourneyItems } from "@/lib/journey/qualities";
import type { JourneyProgressValues } from "@/lib/journey/types";
import { formatDateUTC } from "@/lib/dates";

export type JourneyOverviewStudent = {
  studentId: string;
  studentCode: string;
  name: string;
  progress: JourneyProgressValues | null;
  attendanceRate: number | null;
  latestNote: { note: string; createdAt: Date } | null;
};

const SNIPPET_LENGTH = 120;

function snippet(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_LENGTH ? `${oneLine.slice(0, SNIPPET_LENGTH).trimEnd()}…` : oneLine;
}

export function JourneyOverview({ students }: { students: JourneyOverviewStudent[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">SAINTS Journey</h1>
        <p className="text-sm text-muted">
          Body → Movement → Discipline → Awareness → Self Knowledge. Open a student to reflect on their journey.
        </p>
      </div>

      {students.length === 0 ? (
        <EmptyState icon={Sparkles} title="No active students yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((student) => {
            const qualities = computeJourneyQualities({
              danceLevel: student.progress?.danceLevel ?? null,
              fitnessScore: student.progress?.fitnessScore ?? null,
              consistencyScore: student.progress?.consistencyScore ?? null,
              awarenessScore: student.progress?.awarenessScore ?? null,
              growthScore: student.progress?.growthScore ?? null,
              attendanceRate: student.attendanceRate,
            });
            return (
              <Link
                key={student.studentId}
                href={`/students/${student.studentId}?tab=journey`}
                className="glass-card block space-y-4 p-5 transition-colors hover:border-gold"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{student.name}</p>
                    <p className="text-sm text-muted">{student.studentCode}</p>
                  </div>
                  {student.progress?.danceLevel && <Badge variant="outline">{student.progress.danceLevel}</Badge>}
                </div>
                <JourneyPath items={toJourneyItems(qualities)} compact />
                {student.latestNote ? (
                  <div className="space-y-1">
                    <p className="text-sm text-muted">&ldquo;{snippet(student.latestNote.note)}&rdquo;</p>
                    <p className="text-xs text-muted">{formatDateUTC(student.latestNote.createdAt)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">No reflections yet.</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
