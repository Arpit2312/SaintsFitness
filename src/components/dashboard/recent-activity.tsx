import { formatDateTimeIST } from "@/lib/dates";
import type { ActivityEvent } from "@/lib/notifications/activity";

export function RecentActivity({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="glass-card space-y-3 p-6">
      <h2 className="font-semibold text-foreground">Recent Activity</h2>
      {events.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          Nothing has happened yet. Activity will appear here as you add students, take payments and mark attendance.
        </p>
      ) : (
        <ul className="divide-y divide-card-border">
          {events.map((event, index) => (
            <li key={`${event.at.getTime()}-${index}`} className="flex items-start justify-between gap-4 py-3">
              <span className="min-w-0 break-words text-sm text-foreground">{event.text}</span>
              <span className="shrink-0 text-xs text-muted">{formatDateTimeIST(event.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
