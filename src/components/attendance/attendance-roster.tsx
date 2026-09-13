"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { saveBatchAttendance } from "@/actions/attendance";
import { toast } from "sonner";
import type { AttendanceStatus } from "@prisma/client";
import type { listBatchesForDate, getBatchRosterForDate } from "@/lib/queries/attendance";

type BatchOption = Awaited<ReturnType<typeof listBatchesForDate>>[number];
type Roster = Awaited<ReturnType<typeof getBatchRosterForDate>>;

const STATUS_OPTIONS: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "LEAVE"];
const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  LEAVE: "Leave",
};
// Applied only to the currently-selected status button in each row; the
// unselected buttons use the default outline variant.
const STATUS_SELECTED_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success text-white hover:bg-success/80",
  ABSENT: "bg-danger text-white hover:bg-danger/80",
  LATE: "bg-warning text-white hover:bg-warning/80",
  LEAVE: "bg-muted text-foreground hover:bg-muted/80",
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function AttendanceRoster({
  date,
  batches,
  selectedBatchId,
  roster,
}: {
  date: Date;
  batches: BatchOption[];
  selectedBatchId: string | null;
  roster: Roster;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  // Local edit buffer: studentId -> status, seeded from the roster's saved
  // statuses. A student with no saved record for this date (`status: null`
  // from getBatchRosterForDate) defaults to PRESENT here for display only --
  // nothing is written until Save Attendance is clicked. The parent page.tsx
  // keys this component by date+batch, so React remounts (not just
  // re-props) on navigation and this initializer re-runs with the fresh
  // roster -- without that key, a searchParams-only navigation wouldn't
  // remount the component and this state would go stale across date/batch
  // changes (caught in review; a remount is simpler and lint-clean compared
  // to an effect that calls setState to resync).
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries((roster?.roster ?? []).map((r) => [r.studentId, r.status ?? "PRESENT"]))
  );

  function navigate(nextDate: string, nextBatchId?: string) {
    const params = new URLSearchParams();
    params.set("date", nextDate);
    if (nextBatchId) params.set("batchId", nextBatchId);
    startTransition(() => router.push(`/attendance?${params.toString()}`));
  }

  async function handleSave() {
    if (!selectedBatchId || !roster) return;
    setSaving(true);
    try {
      await saveBatchAttendance({
        batchId: selectedBatchId,
        date,
        records: roster.roster.map((r) => ({
          studentId: r.studentId,
          status: statuses[r.studentId] ?? "PRESENT",
        })),
      });
      toast.success("Attendance saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Attendance</h1>
        <div className="flex gap-3">
          <Input
            type="date"
            max={toDateInputValue(new Date())}
            value={toDateInputValue(date)}
            onChange={(e) => navigate(e.target.value, selectedBatchId ?? undefined)}
            className="w-40"
          />
          <Select
            value={selectedBatchId ?? undefined}
            // base-ui types onValueChange's value as `string | null`, but no real
            // call site emits null in single-select mode -- see batch-form-dialog.tsx
            // for the fuller rationale.
            onValueChange={(v) => navigate(toDateInputValue(date), v as string)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select a batch">
                {(value: string) => batches.find((b) => b.id === value)?.name ?? "Select a batch"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                  {b.scheduledToday ? " (scheduled today)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!roster || roster.roster.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No students enrolled in this batch." />
      ) : (
        <div className="space-y-3">
          <div className="glass-card divide-y divide-card-border">
            {roster.roster.map((student) => (
              <div key={student.studentId} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium text-foreground">{student.name}</p>
                  <p className="text-sm text-muted">{student.studentCode}</p>
                </div>
                <div className="flex gap-2">
                  {STATUS_OPTIONS.map((status) => {
                    const selected = statuses[student.studentId] === status;
                    return (
                      <Button
                        key={status}
                        type="button"
                        size="xs"
                        variant={selected ? "default" : "outline"}
                        className={selected ? STATUS_SELECTED_CLASSES[status] : undefined}
                        aria-pressed={selected}
                        onClick={() => setStatuses((prev) => ({ ...prev, [student.studentId]: status }))}
                      >
                        {STATUS_LABELS[status]}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Attendance"}
          </Button>
        </div>
      )}
    </div>
  );
}
