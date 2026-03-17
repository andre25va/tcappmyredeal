import React, { useState, useEffect, useRef } from 'react';
import { Bell, MessageSquare, Mail, X } from 'lucide-react';

interface Notification {
  id: string;
  type: 'sms' | 'email' | 'whatsapp' | 'system';
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

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const getSupabase = async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  };

  const fetchNotifications = async () => {
    try {
      const supabase = await getSupabase();
      if (!supabase) return;
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const deleteNotification = async (id: string) => {
    try {
      const supabase = await getSupabase();
      if (!supabase) return;
      await supabase.from('notifications').delete().eq('id', id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => {
        const wasUnread = notifications.find(n => n.id === id && !n.is_read);
        return wasUnread ? Math.max(0, prev - 1) : prev;
      });
    } catch { /* silent */ }
  };

  const clearAll = async () => {
    try {
      const supabase = await getSupabase();
      if (!supabase) return;
      const ids = notifications.map(n => n.id);
      if (ids.length > 0) await supabase.from('notifications').delete().in('id', ids);
      setNotifications([]);
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  const handleClick = (n: Notification) => {
    deleteNotification(n.id);
    setOpen(false);
    if (n.conversation_id && onNavigate) {
      onNavigate('inbox', n.conversation_id);
    } else if (n.deal_id && onNavigate) {
      onNavigate('transactions', n.deal_id);
    } else if (n.type === 'email' && onNavigate) {
      onNavigate('inbox-email');
    } else if (onNavigate) {
      onNavigate('inbox');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'sms': return <MessageSquare size={14} className="text-blue-500" />;
      case 'whatsapp': return <MessageSquare size={14} className="text-green-500" />;
      case 'email': return <Mail size={14} className="text-orange-500" />;
      default: return <Bell size={14} className="text-gray-500" />;
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div ref={panelRef} className="relative">
      <div className="relative inline-flex">
        <button
          onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
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
                <div key={n.id} className={`flex gap-0 items-stretch border-b border-base-200 last:border-0 ${!n.is_read ? 'bg-red-50' : ''}`}>
                  <button
                    onClick={() => handleClick(n)}
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
                    onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
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
  );
}
