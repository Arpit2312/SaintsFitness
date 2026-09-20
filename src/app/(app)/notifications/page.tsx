import { countUnreadNotifications, listNotifications } from "@/lib/queries/notifications";
import { NotificationsList } from "@/components/notifications/notifications-list";

export default async function NotificationsPage() {
  const [notifications, unreadTotal] = await Promise.all([listNotifications(), countUnreadNotifications()]);
  return <NotificationsList notifications={notifications} unreadTotal={unreadTotal} />;
}
