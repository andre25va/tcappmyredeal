import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNotifications, useInvalidateNotifications } from '../hooks/useNotifications';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Bell, MessageSquare, Mail, X, Phone } from 'lucide-react';

interface Notification {
  id: string;
  type: 'sms' | 'email' | 'whatsapp' | 'system' | 'call';
  title: string;
  body: string | null;
  from_name: string | null;
  created_at: string;
  is_read: boolean;
  conversation_id: string | null;
  deal_id: string | null;
}

interface NotificationBellProps {
  onNavigate?: (view: string, id?: string) => void;
}

// ── Toast queue item ──────────────────────────────────────────────────────────
interface ToastItem {
  id: string;
  notification: Notification;
  exiting: boolean;
}

// ── Single toast card ─────────────────────────────────────────────────────────
function NotificationToast({
  item,
  onDismiss,
  onNavigate,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
  onNavigate?: (view: string, id?: string) => void;
}) {
  const { notification } = item;

  const handleClick = () => {
    onDismiss(item.id);
    if (!onNavigate) return;
    if (notification.conversation_id) {
      onNavigate('inbox', notification.conversation_id);
    } else if (notification.deal_id) {
      onNavigate('transactions', notification.deal_id);
    } else if (notification.type === 'email') {
      onNavigate('inbox-email');
    } else {
      onNavigate('inbox');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'sms':       return <MessageSquare size={16} className="text-blue-500 flex-none mt-0.5" />;
      case 'whatsapp':  return <MessageSquare size={16} className="text-green-500 flex-none mt-0.5" />;
      case 'email':     return <Mail          size={16} className="text-orange-500 flex-none mt-0.5" />;
      case 'call':      return <Phone         size={16} className="text-purple-500 flex-none mt-0.5" />;
      default:          return <Bell          size={16} className="text-red-500 flex-none mt-0.5" />;
    }
  };

  return (
    <div
      className={`
        flex items-start gap-3 bg-base-100 border border-base-300
        rounded-xl shadow-2xl px-4 py-3 w-80 cursor-pointer
        transition-all duration-300 ease-out
        ${item.exiting
          ? 'opacity-0 translate-x-8'
          : 'opacity-100 translate-x-0'}
      `}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
    >
      {getIcon(notification.type)}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight truncate">
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-base-content/60 truncate mt-0.5">
            {notification.body}
          </p>
        )}
        <p className="text-[10px] text-base-content/40 mt-1">just now</p>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onDismiss(item.id); }}
        className="text-base-content/30 hover:text-base-content/70 transition-colors flex-none"
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Main bell component ───────────────────────────────────────────────────────
export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const { data: notifications = [] } = useNotifications();
  const invalidateNotifications = useInvalidateNotifications();
  const unreadCount = notifications.filter((n: any) => !n.is_read).length;
  const [open, setOpen]                   = useState(false);
  const [toasts, setToasts]               = useState<ToastItem[]>([]);
  const panelRef    = useRef<HTMLDivElement>(null);
  const knownIds    = useRef<Set<string>>(new Set());
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── helpers ──────────────────────────────────────────────────────────────────
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // ── show toast for a new notification ────────────────────────────────────────
  const pushToast = useCallback((n: Notification) => {
    const toastId = `toast-${n.id}`;
    setToasts(prev => [...prev, { id: toastId, notification: n, exiting: false }]);

    // auto-dismiss after 5s (start exit animation at 4.7s)
    const exitTimer = setTimeout(() => {
      setToasts(prev =>
        prev.map(t => t.id === toastId ? { ...t, exiting: true } : t)
      );
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId));
      }, 300);
    }, 4700);

    toastTimers.current.set(toastId, exitTimer);
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    const timer = toastTimers.current.get(toastId);
    if (timer) { clearTimeout(timer); toastTimers.current.delete(toastId); }
    setToasts(prev =>
      prev.map(t => t.id === toastId ? { ...t, exiting: true } : t)
    );
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 300);
  }, []);

  // ── Seed known IDs from hook data (no toasts on initial load) ─────────────────
  useEffect(() => {
    if (knownIds.current.size === 0 && notifications.length > 0) {
      notifications.forEach((n: Notification) => knownIds.current.add(n.id));
    }
  }, [notifications]);

  // ── Stable refs so the realtime effect never re-runs when callbacks change ──
  const pushToastRef = useRef(pushToast);
  const invalidateRef = useRef(invalidateNotifications);
  useEffect(() => { pushToastRef.current = pushToast; }, [pushToast]);
  useEffect(() => { invalidateRef.current = invalidateNotifications; }, [invalidateNotifications]);

  // ── realtime subscription — empty deps so channel is created exactly once ───
  useEffect(() => {
    // realtime: instant toast on new notification
    const channel = supabase
      .channel(`notifications-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const n = payload.new as Notification;

          // Skip if we already know about this ID (shouldn't happen but be safe)
          if (knownIds.current.has(n.id)) return;
          knownIds.current.add(n.id);

          // Invalidate TanStack query to refetch
          invalidateRef.current();

          // Show toast
          pushToastRef.current(n);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      toastTimers.current.forEach(t => clearTimeout(t));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── close dropdown on outside click ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── actions ───────────────────────────────────────────────────────────────────
  const deleteNotification = async (id: string) => {
    try {
      await supabase.from('notifications').delete().eq('id', id);
      invalidateNotifications();
    } catch { /* silent */ }
  };

  const clearAll = async () => {
    try {
      const ids = notifications.map((n: any) => n.id);
      if (ids.length) await supabase.from('notifications').delete().in('id', ids);
      invalidateNotifications();
    } catch { /* silent */ }
  };

  const handleNotificationClick = (n: Notification) => {
    deleteNotification(n.id);
    setOpen(false);
    if (!onNavigate) return;
    if (n.conversation_id)       onNavigate('inbox', n.conversation_id);
    else if (n.deal_id)          onNavigate('transactions', n.deal_id);
    else if (n.type === 'email') onNavigate('inbox-email');
    else                         onNavigate('inbox');
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'sms':      return <MessageSquare size={14} className="text-blue-500" />;
      case 'whatsapp': return <MessageSquare size={14} className="text-green-500" />;
      case 'email':    return <Mail          size={14} className="text-orange-500" />;
      case 'call':     return <Phone         size={14} className="text-purple-500" />;
      default:         return <Bell          size={14} className="text-gray-500" />;
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Bell + dropdown */}
      <div ref={panelRef} className="relative">
        <div className="relative inline-flex">
          <button
            onClick={() => { setOpen(!open); if (!open) invalidateNotifications(); }}
            className="btn btn-ghost btn-sm btn-square"
            title="Notifications"
          >
            <Bell size={18} />
          </button>
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center px-1.5 shadow-md pointer-events-none z-10">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-base-100 border border-base-300 rounded-xl shadow-2xl z-[100] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
              <span className="font-semibold text-sm">Notifications</span>
              {notifications.length > 0 && (
                <button onClick={clearAll} className="text-xs text-base-content/50 hover:text-error">
                  Clear all
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-base-content/40 text-sm">
                  <Bell size={24} className="mx-auto mb-2 opacity-30" />
                  No notifications
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className={`flex gap-0 items-stretch border-b border-base-200 last:border-0 ${!n.is_read ? 'bg-red-50' : ''}`}
                  >
                    <button
                      onClick={() => handleNotificationClick(n)}
                      className="flex-1 text-left px-4 py-3 flex gap-3 items-start hover:bg-red-50 transition-colors"
                    >
                      <div className="mt-0.5">{getIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm truncate ${!n.is_read ? 'font-semibold' : 'font-normal text-base-content/70'}`}>
                            {n.title}
                          </span>
                          {!n.is_read && <span className="w-2 h-2 rounded-full bg-red-500 flex-none" />}
                        </div>
                        {n.body && (
                          <p className="text-xs text-base-content/50 truncate mt-0.5">{n.body}</p>
                        )}
                        <span className="text-[10px] text-base-content/40 mt-1 block">{timeAgo(n.created_at)}</span>
                      </div>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteNotification(n.id); }}
                      className="px-2 hover:bg-base-200 text-base-content/30 hover:text-base-content/70 transition-colors"
                      title="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast stack — rendered via portal so it floats above everything */}
      {createPortal(
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
          {toasts.map(item => (
            <div key={item.id} className="pointer-events-auto">
              <NotificationToast
                item={item}
                onDismiss={dismissToast}
                onNavigate={onNavigate}
              />
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
