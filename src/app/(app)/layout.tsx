import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { getSettings } from "@/lib/queries/settings";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
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

  // Throttled (at most once per 30 minutes across all requests) and run AFTER
  // the response is sent, so the page never waits on it: the claim check alone
  // is a database round trip, and the winning request would otherwise block on
  // the whole dues + attendance scan. Trade-off: notifications the sync creates
  // show in the bell on the next render, not this one. A failure here must
  // never break anything.
  after(async () => {
    try {
      await syncTimeBasedNotifications();
    } catch (error) {
      console.error("Notification sync failed", error);
    }
  });

  const [settings, unreadCount] = await Promise.all([
    getSettings().catch((error) => {
      console.error("Failed to load settings", error);
      return DEFAULT_SETTINGS;
    }),
    countUnreadNotifications().catch((error) => {
      console.error("Failed to count unread notifications", error);
      return 0;
    }),
  ]);

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
