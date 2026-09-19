import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

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
    <div className="flex h-screen overflow-hidden">
      <Sidebar academyName={academyName} logoUrl={logoUrl} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header name={userName} unreadCount={unreadCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
