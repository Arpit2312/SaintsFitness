import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { getSettings } from "@/lib/queries/settings";
import { countUnreadNotifications } from "@/lib/queries/notifications";
import { syncTimeBasedNotifications } from "@/lib/notifications/sync";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // Throttled (at most once per 30 minutes across all requests); a failure
  // here must never break page rendering.
  try {
    await syncTimeBasedNotifications();
  } catch (error) {
    console.error("Notification sync failed", error);
  }

  const [settings, unreadCount] = await Promise.all([getSettings(), countUnreadNotifications()]);

  return (
    <AppShell
      userName={session.user.name}
      academyName={settings.academyName}
      logoUrl={settings.logoUrl}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
