import React, { useState, useEffect, useRef } from 'react';
import { Bell, MessageSquare, Mail, Phone, X } from 'lucide-react';

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
  onNavigate?: (view: string, conversationId?: string) => void;
}

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) return;
      const supabase = createClient(url, key);

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

  const markAsRead = async (id: string) => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) return;
      const supabase = createClient(url, key);
      await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) return;
      const supabase = createClient(url, key);
      await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('is_read', false);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  const clearAll = async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) return;
      const supabase = createClient(url, key);
      const ids = notifications.filter(n => n.is_read).map(n => n.id);
      if (ids.length > 0) await supabase.from('notifications').delete().in('id', ids);
      setNotifications(prev => prev.filter(n => !n.is_read));
    } catch { /* silent */ }
  };

  const handleClick = (n: Notification) => {
    markAsRead(n.id);
    if (n.conversation_id && onNavigate) onNavigate('inbox', n.conversation_id);
    setOpen(false);
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
      {/* Wrapper keeps badge outside btn-square so it doesn't get clipped */}
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
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
            <span className="font-semibold text-sm">Notifications</span>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
              {notifications.some(n => n.is_read) && (
                <button onClick={clearAll} className="text-xs text-base-content/50 hover:text-error ml-2">
                  Clear read
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-base-content/40 text-sm">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-red-50 transition-colors border-b border-base-200 last:border-0 ${
                    !n.is_read ? 'bg-red-50' : ''
                  }`}
                >
                  <div className="mt-0.5">{getIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${!n.is_read ? 'font-semibold' : 'font-normal text-base-content/70'}`}>
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-none" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-base-content/50 truncate mt-0.5">{n.body}</p>
                    )}
                    <span className="text-[10px] text-base-content/40 mt-1 block">{timeAgo(n.created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
