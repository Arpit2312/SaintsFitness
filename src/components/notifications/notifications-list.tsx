"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import { formatDateUTC } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { NotificationRow } from "@/lib/queries/notifications";

const TYPE_LABELS: Record<string, string> = {
  FEE_OVERDUE: "Fee Overdue",
  FEE_DUE_SOON: "Fee Due Soon",
  LOW_ATTENDANCE: "Low Attendance",
  NEW_ADMISSION: "New Admission",
  PAYMENT_RECEIVED: "Payment Received",
};

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  async function handleMarkRead(id: string) {
    setPendingId(id);
    try {
      await markNotificationRead(id);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
          <p className="text-sm text-muted">{unreadCount === 0 ? "You're all caught up." : `${unreadCount} unread`}</p>
        </div>
        <Button variant="outline" onClick={handleMarkAll} disabled={unreadCount === 0 || markingAll}>
          {markingAll ? "Marking..." : "Mark All Read"}
        </Button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet." />
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={cn("flex items-start justify-between gap-4 p-4", !n.read && "border-l-2 border-gold bg-gold/5")}
            >
              <div className="min-w-0 space-y-1">
                <p className={cn("break-words", n.read ? "text-muted" : "text-foreground")}>{n.message}</p>
                <p className="text-xs text-muted">
                  {TYPE_LABELS[n.type] ?? n.type} · {formatDateUTC(n.createdAt)}
                  {n.studentId && (
                    <>
                      {" · "}
                      <Link href={`/students/${n.studentId}`} className="text-gold hover:underline">
                        View Student
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.read && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleMarkRead(n.id)}
                  disabled={pendingId === n.id}
                >
                  {pendingId === n.id ? "Marking..." : "Mark Read"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
