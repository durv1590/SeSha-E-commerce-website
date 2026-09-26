import type { NotificationDto } from '@seshakart/types';
import { NotificationList } from '@/components/account/NotificationList';
import { serverApi } from '@/lib/api/server';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const res = (await serverApi<NotificationDto[]>('/users/me/notifications?pageSize=50')) as {
    data: NotificationDto[];
    unread?: number;
  };
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1">Notifications</h1>
        <p className="mt-1 text-text-muted">Updates about your orders and account.</p>
      </div>
      <NotificationList initial={res.data} unread={res.unread ?? 0} />
    </div>
  );
}
