import {
  getOverdueStudents,
  getAttendanceGaps,
  getRecentJoinsAndLeaves,
} from "@/lib/queries/reports-operational";
import { ExportButton } from "@/components/reports/export-button";
import { GapDaysSelect } from "@/components/reports/gap-days-select";
import { formatDateUTC } from "@/lib/dates";
import type { ResolvedRange } from "@/lib/reports/date-range";

export async function OperationalTab({ range, gapDays }: { range: ResolvedRange; gapDays: number }) {
  const [overdue, gaps, joinsAndLeaves] = await Promise.all([
    getOverdueStudents(),
    getAttendanceGaps(gapDays),
    getRecentJoinsAndLeaves(range),
  ]);

  const rangeLabel = `${formatDateUTC(range.from)} – ${formatDateUTC(range.to)}`;

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Overdue Students</h2>
          <ExportButton
            rows={overdue.map((s) => ({
              studentCode: s.studentCode,
              name: s.name,
              mobile: s.mobile,
              totalPending: s.totalPending.toNumber(),
              pastDuePending: s.pastDuePending.toNumber(),
            }))}
            columns={[
              { key: "studentCode", label: "Student Code" },
              { key: "name", label: "Name" },
              { key: "mobile", label: "Mobile" },
              { key: "totalPending", label: "Pending Amount" },
              { key: "pastDuePending", label: "Past Due Amount" },
            ]}
            filename="overdue-students.csv"
          />
        </div>
        {overdue.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No students are overdue.</p>
        ) : (
          <div className="divide-y divide-card-border">
            {overdue.map((s) => (
              <div key={s.studentId} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-sm text-muted">{s.studentCode}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-danger">
                    ₹{s.pastDuePending.toNumber().toLocaleString("en-IN")} past due
                  </p>
                  <p className="text-xs text-muted">
                    ₹{s.totalPending.toNumber().toLocaleString("en-IN")} total pending
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Attendance Gaps</h2>
          <div className="flex items-center gap-3">
            <GapDaysSelect value={gapDays} />
            <ExportButton
              rows={gaps.map((s) => ({
                studentCode: s.studentCode,
                name: s.name,
                mobile: s.mobile,
                lastAttendedAt: s.lastAttendedAt ? formatDateUTC(s.lastAttendedAt) : "Never",
              }))}
              columns={[
                { key: "studentCode", label: "Student Code" },
                { key: "name", label: "Name" },
                { key: "mobile", label: "Mobile" },
                { key: "lastAttendedAt", label: "Last Attended" },
              ]}
              filename="attendance-gaps.csv"
            />
          </div>
        </div>
        {gaps.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {`No active students have gone more than ${gapDays} days without attending.`}
          </p>
        ) : (
          <div className="divide-y divide-card-border">
            {gaps.map((s) => (
              <div key={s.studentId} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-sm text-muted">{s.studentCode}</p>
                </div>
                <p className="text-sm text-muted">
                  {s.lastAttendedAt ? `Last attended ${formatDateUTC(s.lastAttendedAt)}` : "Never attended"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Recently Joined</h2>
              <p className="text-xs text-muted">{rangeLabel}</p>
            </div>
            <ExportButton
              rows={joinsAndLeaves.joined.map((s) => ({
                studentCode: s.studentCode,
                name: s.name,
                mobile: s.mobile,
                joiningDate: formatDateUTC(s.joiningDate),
              }))}
              columns={[
                { key: "studentCode", label: "Student Code" },
                { key: "name", label: "Name" },
                { key: "mobile", label: "Mobile" },
                { key: "joiningDate", label: "Joined On" },
              ]}
              filename="recent-joins.csv"
            />
          </div>
          {joinsAndLeaves.joined.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No new students joined in this range.</p>
          ) : (
            <div className="divide-y divide-card-border">
              {joinsAndLeaves.joined.map((s) => (
                <div key={s.studentId} className="flex items-center justify-between gap-4 py-3">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-sm text-muted">{formatDateUTC(s.joiningDate)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Recently Left</h2>
              <p className="text-xs text-muted">{rangeLabel}</p>
            </div>
            <ExportButton
              rows={joinsAndLeaves.left.map((s) => ({
                studentCode: s.studentCode,
                name: s.name,
                mobile: s.mobile,
                leftAt: formatDateUTC(s.leftAt),
              }))}
              columns={[
                { key: "studentCode", label: "Student Code" },
                { key: "name", label: "Name" },
                { key: "mobile", label: "Mobile" },
                { key: "leftAt", label: "Left On" },
              ]}
              filename="recent-leaves.csv"
            />
          </div>
          {joinsAndLeaves.left.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No students left in this range.</p>
          ) : (
            <div className="divide-y divide-card-border">
              {joinsAndLeaves.left.map((s) => (
                <div key={s.studentId} className="flex items-center justify-between gap-4 py-3">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-sm text-muted">{formatDateUTC(s.leftAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
