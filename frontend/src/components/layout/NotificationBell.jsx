import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';

import { notificationsApi } from '@/api';
import { toast } from '@/components/feedback/toastStore';
import { useSocketEvent } from '@/realtime/socket';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 12;

/**
 * The inbox for things that happened while you were not looking.
 *
 * Toasts only reach someone who is connected at that instant, so a worker who was offline when
 * a client hired them had no way to find out. These are the same events, kept.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list({ page: 1, limit: PAGE_SIZE }),
    // The badge should be right shortly after coming back to the tab, even if a socket event
    // was missed while it was in the background
    refetchOnWindowFocus: true,
  });

  // Live arrivals while the app is open
  useSocketEvent('notification:new', () => qc.invalidateQueries({ queryKey: ['notifications'] }));

  /**
   * Marking read is a cosmetic change to a list already on screen, so it is applied optimistically
   * and reconciled afterwards. Waiting for a round trip on a free-tier server made the button feel
   * dead; failing silently made it indistinguishable from one.
   */
  const markRead = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const previous = qc.getQueryData(['notifications']);
      qc.setQueryData(['notifications'], (old) => {
        if (!old) return old;
        const now = new Date().toISOString();
        const items = old.items.map((n) => (!n.readAt && (!id || n._id === id) ? { ...n, readAt: now } : n));
        return { ...old, items, unread: items.filter((n) => !n.readAt).length };
      });
      return { previous };
    },
    onError: (err, _id, ctx) => {
      // Put the badge back rather than leave it lying about what the server knows
      if (ctx?.previous) qc.setQueryData(['notifications'], ctx.previous);
      toast({ title: 'Could not mark as read', description: err.message, tone: 'danger' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;

  const openItem = (n) => {
    setOpen(false);
    if (!n.readAt) markRead.mutate(n._id);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex size-9 items-center justify-center rounded-md transition-colors hover:bg-ink-100"
      >
        <Bell className="size-[18px] text-ink-700" aria-hidden />
        {unread > 0 && (
          <span className="numeric absolute top-1 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] animate-rise overflow-hidden rounded-lg border border-ink-200 bg-white shadow-raised"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-3 py-2.5">
            <p className="text-sm font-bold text-ink-950">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate(undefined)} /* no id = all of them */
                className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-950"
              >
                <CheckCheck className="size-3.5" aria-hidden /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {query.isPending && <p className="px-3 py-8 text-center text-sm text-ink-500">Loading…</p>}

            {!query.isPending && !items.length && (
              <p className="px-6 py-10 text-center text-sm text-ink-500">
                Nothing yet. Offers, messages and booking updates land here.
              </p>
            )}

            <ul>
              {items.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openItem(n)}
                    className={cn(
                      'flex w-full gap-2.5 border-b border-ink-100 px-3 py-3 text-left transition-colors last:border-0 hover:bg-ink-50',
                      !n.readAt && 'bg-primary-500/[0.04]',
                    )}
                  >
                    <span
                      className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary-500')}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-950">{n.title}</span>
                      {n.body && <span className="mt-0.5 block line-clamp-2 text-xs text-ink-600">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-ink-400">{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="sr-only">{n.readAt ? '' : ' (unread)'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
