import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const label = unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative rounded-md p-2 text-muted transition-colors hover:text-gold"
    >
      <Bell size={20} />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-background">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
