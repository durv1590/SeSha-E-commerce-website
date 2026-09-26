'use client';

import type { NotificationDto } from '@seshakart/types';
import { Button, Card, EmptyState, cn } from '@seshakart/ui';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function NotificationList({
  initial,
  unread,
}: {
  initial: NotificationDto[];
  unread: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Bell size={28} aria-hidden="true" />}
          title="No notifications yet"
          description="Order updates, delivery alerts and offers will appear here."
          action={
            <Link href="/" className="font-semibold">
              Continue shopping
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {unread > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-end"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/users/me/notifications/read');
              setItems((all) =>
                all.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
              );
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          Mark all as read
        </Button>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((n) => (
          <li key={n.id}>
            <Card
              padding="sm"
              className={cn('flex gap-3', !n.readAt && 'border-primary/40 bg-primary-light/40')}
            >
              {!n.readAt && (
                <span className="mt-2 size-2 shrink-0 rounded-pill bg-primary" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {!n.readAt && <span className="sr-only">Unread: </span>}
                  {n.link ? <Link href={n.link}>{n.title}</Link> : n.title}
                </p>
                <p className="text-small text-text-secondary">{n.body}</p>
                <p className="mt-1 text-caption text-text-muted">
                  {dateTime.format(new Date(n.createdAt))}
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
