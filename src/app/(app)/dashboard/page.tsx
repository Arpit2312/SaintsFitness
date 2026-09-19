import { Users, UserCheck, Wallet, AlertCircle, CalendarClock, ClipboardCheck } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { getDashboardStats } from "@/lib/queries/dashboard";
import { getRecentActivity } from "@/lib/queries/activity";

export default async function DashboardPage() {
  const [stats, activity] = await Promise.all([getDashboardStats(), getRecentActivity()]);

  return (
    <div className="space-y-8">
      <div className="glass-card p-6 text-center">
        <p className="text-lg text-gold">SAINTS</p>
        <p className="text-sm text-muted">Know Yourself — The Divine Within</p>
        <p className="mt-3 text-sm text-muted">स्वयं को जानना ही वास्तविक शिक्षा है।</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Users} label="Total Students" value={String(stats.totalStudents)} />
        <StatCard icon={UserCheck} label="Active Students" value={String(stats.activeStudents)} />
        <StatCard icon={CalendarClock} label="Today's Classes" value={String(stats.todaysClasses)} />
        <StatCard icon={Wallet} label="This Month Collection" value={`₹${stats.monthCollection.toLocaleString("en-IN")}`} />
        <StatCard icon={AlertCircle} label="Pending Fees" value={`₹${stats.pendingFees.toLocaleString("en-IN")}`} />
        <StatCard icon={ClipboardCheck} label="Today's Attendance" value={`${stats.presentToday} / ${stats.expectedToday}`} />
      </div>

      <RecentActivity events={activity} />
    </div>
  );
}
