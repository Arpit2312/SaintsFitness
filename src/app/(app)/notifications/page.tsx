import { listNotifications } from "@/lib/queries/notifications";
import { NotificationsList } from "@/components/notifications/notifications-list";

export default async function NotificationsPage() {
  const notifications = await listNotifications();
  return <NotificationsList notifications={notifications} />;
}
