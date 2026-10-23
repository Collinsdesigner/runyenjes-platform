// NOTIFICATION_BELL_V1
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

interface NotificationItem {
  id: string;
  kind: 'info' | 'action';
  title: string;
  detail?: string;
  link: string;
  at: string;
}

const POLL_MS = 90_000;

function storageKey(who: string): string {
  return `portal_notifications_seen_${who}`;
}

function readSeen(who: string): number {
  try {
    const raw = localStorage.getItem(storageKey(who));
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeSeen(who: string, when: number): void {
  try {
    localStorage.setItem(storageKey(who), String(when));
  } catch {
    /* storage unavailable: the bell still works, it just forgets what was read */
  }
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Things waiting for you always count; new information counts until you open the bell.
function isFresh(item: NotificationItem, since: number): boolean {
  return item.kind === 'action' || new Date(item.at).getTime() > since;
}

export default function NotificationBell() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const who =
    (user as unknown as { id?: string } | null)?.id || user?.name || 'user';

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [freshSince, setFreshSince] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = readSeen(who);
    setSeen(s);
    setFreshSince(s);
  }, [who]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api('/notifications', { token });
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      /* a failed refresh must never break the page header */
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = items.filter((i) => isFresh(i, seen)).length;

  const toggle = () => {
    if (!open) {
      load();
      const now = Date.now();
      setFreshSince(seen);
      setSeen(now);
      writeSeen(who, now);
    }
    setOpen(!open);
  };

  const go = (link: string) => {
    setOpen(false);
    navigate(link);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition dark:text-gray-400 dark:hover:bg-gray-700"
        aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
        aria-expanded={open}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-100">
            Notifications
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
              You are all caught up.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => go(item.link)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex gap-3"
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                        isFresh(item, freshSince) ? 'bg-green-500' : 'bg-transparent'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-800 dark:text-gray-100">
                        {item.title}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {item.kind === 'action'
                          ? 'Needs your attention'
                          : `${item.detail ? item.detail + ' · ' : ''}${timeAgo(item.at)}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
