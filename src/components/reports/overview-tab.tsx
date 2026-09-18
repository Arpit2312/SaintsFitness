import { Wallet, AlertCircle, Clock, BellRing } from "lucide-react";
import {
  getRevenueOverTime,
  getOutstandingDuesSummary,
  getAttendanceRateOverTime,
  getReminderActivity,
} from "@/lib/queries/reports-overview";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { RevenueChart } from "@/components/reports/revenue-chart";
import { AttendanceTrendChart } from "@/components/reports/attendance-trend-chart";
import { ExportButton } from "@/components/reports/export-button";
import { StatCard } from "@/components/dashboard/stat-card";
import type { ResolvedRange } from "@/lib/reports/date-range";

export async function OverviewTab({ range, rangeParam }: { range: ResolvedRange; rangeParam: string }) {
  const [revenue, dues, attendanceTrend, reminderActivity] = await Promise.all([
    getRevenueOverTime(range),
    getOutstandingDuesSummary(),
    getAttendanceRateOverTime(range),
    getReminderActivity(range),
  ]);

  const totalSent = reminderActivity.reduce((sum, r) => sum + r.sent, 0);
  const totalConverted = reminderActivity.reduce((sum, r) => sum + r.converted, 0);
  const conversionRate = totalSent === 0 ? null : Math.round((totalConverted / totalSent) * 100);

  return (
    <div className="space-y-6">
      <DateRangePicker range={rangeParam} from={range.from} to={range.to} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Total Pending" value={`₹${dues.totalPending.toLocaleString("en-IN")}`} />
        <StatCard icon={AlertCircle} label="Overdue" value={String(dues.overdueCount)} />
        <StatCard icon={Clock} label="Partial" value={String(dues.partialCount)} />
        <StatCard icon={BellRing} label="Due" value={String(dues.dueCount)} />
      </div>

      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Revenue Collected</h2>
          <ExportButton
            rows={revenue}
            columns={[
              { key: "label", label: "Period" },
              { key: "total", label: "Revenue" },
            ]}
            filename="revenue.csv"
          />
        </div>
        <RevenueChart data={revenue} />
      </div>

      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Attendance Rate</h2>
          <ExportButton
            rows={attendanceTrend}
            columns={[
              { key: "label", label: "Period" },
              { key: "rate", label: "Attendance Rate (%)" },
            ]}
            filename="attendance-trend.csv"
          />
        </div>
        <AttendanceTrendChart data={attendanceTrend} />
      </div>

      <div className="glass-card space-y-2 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Reminder Activity</h2>
          <ExportButton
            rows={reminderActivity}
            columns={[
              { key: "label", label: "Period" },
              { key: "sent", label: "Reminders Sent" },
              { key: "converted", label: "Converted" },
            ]}
            filename="reminder-activity.csv"
          />
        </div>
        <p className="text-sm text-muted">
          {totalSent} sent, {totalConverted} converted
          {conversionRate !== null && ` (${conversionRate}% conversion rate)`}
        </p>
      </div>
    </div>
  );
}
