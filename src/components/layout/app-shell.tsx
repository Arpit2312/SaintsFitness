import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNavBackdrop, MobileNavProvider } from "@/components/layout/mobile-nav";

export function AppShell({
  userName,
  academyName,
  logoUrl,
  unreadCount,
  children,
}: {
  userName: string;
  academyName: string;
  logoUrl: string | null;
  unreadCount: number;
  children: React.ReactNode;
}) {
  return (
    <MobileNavProvider>
      {/* h-dvh, not h-screen: on phones 100vh is taller than the visible area
          (the browser's address bar), which cut off the bottom of every page. */}
      <div className="flex h-dvh overflow-hidden">
        <Sidebar academyName={academyName} logoUrl={logoUrl} />
        <MobileNavBackdrop />
        {/* min-w-0 lets this column shrink below its content's width instead of overflowing. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header name={userName} unreadCount={unreadCount} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
