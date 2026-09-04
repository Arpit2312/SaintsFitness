import { LogoutButton } from "@/components/auth/logout-button";

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

export function Header({ name }: { name: string }) {
  return (
    <header className="flex items-center justify-between border-b border-card-border px-6 py-4">
      <div>
        <p className="text-lg text-foreground">
          {greeting(currentHourInIST())}, <span className="text-gold">{name}</span>
        </p>
        <p className="text-sm text-muted">
          Know Yourself • Move Your Body • Transform Your Life
        </p>
      </div>
      <LogoutButton />
    </header>
  );
}
