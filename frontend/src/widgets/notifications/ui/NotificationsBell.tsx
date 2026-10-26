'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { displayTitle } from '@/entities/document';
import { api, type Notification, unwrap } from '@/shared/api';
import { routes } from '@/shared/config';
import { cn, notifyError, relativeTime } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUnreadCount } from '../model/use-unread-count';

export function NotificationsBell() {
  const router = useRouter();
  const { count, refresh } = useUnreadCount();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      setItems(unwrap(await api.GET('/api/notifications', { params: { query: { limit: 20 } } })));
    } catch (error) {
      notifyError(error);
    }
  };

  const openItem = async (item: Notification) => {
    setOpen(false);
    if (!item.readAt) {
      await api.POST('/api/notifications/{notificationId}/read', {
        params: { path: { notificationId: item.id } },
      });
      void refresh();
    }
    if (item.document && item.comment) {
      router.push(
        `${routes.document(item.document.workspaceId, item.document.id)}?thread=${item.comment.threadId}`,
      );
    }
  };

  const markAllRead = async () => {
    await api.POST('/api/notifications/read-all');
    await Promise.all([refresh(), load()]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          void load();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
          className="relative"
        >
          <Bell />
          {count > 0 && (
            <span className="bg-destructive absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-medium">Notifications</h2>
          {count > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        {items === null ? (
          <div className="grid gap-2 p-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            No notifications yet. You will see mentions here.
          </p>
        ) : (
          <ul aria-label="Notifications" className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    'hover:bg-accent grid w-full gap-0.5 px-3 py-2 text-left text-sm',
                    !item.readAt && 'bg-accent/50',
                  )}
                  onClick={() => void openItem(item)}
                >
                  <span>
                    <span className="font-medium">{item.actor?.name ?? 'Someone'}</span> mentioned
                    you in{' '}
                    <span className="font-medium">{displayTitle(item.document?.title ?? '')}</span>
                  </span>
                  {item.comment && (
                    <span className="text-muted-foreground line-clamp-2">
                      {item.comment.excerpt}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {relativeTime(item.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
