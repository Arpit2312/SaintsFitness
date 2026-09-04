import { LogoutButton } from "@/components/auth/logout-button";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function Header({ name }: { name: string }) {
  return (
    <header className="flex items-center justify-between border-b border-card-border px-6 py-4">
      <div>
        <p className="text-lg text-foreground">
          {greeting()}, <span className="text-gold">{name}</span>
        </p>
        <p className="text-sm text-muted">
          Know Yourself • Move Your Body • Transform Your Life
        </p>
      </div>
      <LogoutButton />
    </header>
  );
}
