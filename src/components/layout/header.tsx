import { LogoutButton } from "@/components/auth/logout-button";
import { MobileNavButton } from "@/components/layout/mobile-nav";
import { NotificationBell } from "@/components/layout/notification-bell";

export function greeting(hour: number): string {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function currentHourInIST(): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(new Date())
  );
  // Some ICU implementations report midnight as "24" instead of "0" when
  // hour12 is false - normalize so the < 12 boundary check stays correct.
  return hour === 24 ? 0 : hour;
}

export function Header({ name, unreadCount }: { name: string; unreadCount: number }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-card-border px-4 py-3 md:px-6 md:py-4">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavButton />
        <div className="min-w-0">
          <p className="truncate text-base text-foreground md:text-lg">
            {greeting(currentHourInIST())}, <span className="text-gold">{name}</span>
          </p>
          {/* The tagline needs room; on phones the greeting alone is enough. */}
          <p className="hidden text-sm text-muted md:block">
            Know Yourself • Move Your Body • Transform Your Life
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <NotificationBell unreadCount={unreadCount} />
        <LogoutButton />
      </div>
    </header>
  );
}
