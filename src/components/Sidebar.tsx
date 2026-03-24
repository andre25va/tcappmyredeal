import React from 'react';
import {
  LayoutDashboard, FileText, Users, Building2, ShieldCheck,
  MessageSquare, CheckSquare, Phone, BarChart2, Settings, LogOut, Menu, Bell, Inbox, ClipboardList, X,
} from 'lucide-react';

export type View =
  | 'dashboard' | 'transactions' | 'contacts' | 'mls'
  | 'compliance' | 'inbox' | 'tasks' | 'voice' | 'reports' | 'settings'
  | 'email-review' | 'requests';

const APP_VERSION = 'v2026.03.18.17';

// ─── Nav Items ────────────────────────────────────────────────────────────────
const NAV_ITEMS: { view: View; label: string; icon: React.ReactNode; badge?: string }[] = [
  { view: 'dashboard',     label: 'Dashboard',    icon: <LayoutDashboard size={18} /> },
  { view: 'transactions',  label: 'Transactions', icon: <FileText size={18} /> },
  { view: 'contacts',      label: 'Contacts',     icon: <Users size={18} /> },
  { view: 'mls',           label: 'MLS',          icon: <Building2 size={18} /> },
  { view: 'compliance',    label: 'Compliance',   icon: <ShieldCheck size={18} /> },
  { view: 'inbox',         label: 'Inbox',        icon: <MessageSquare size={18} /> },
  { view: 'email-review',  label: 'Email Queue',  icon: <Inbox size={18} /> },
  { view: 'tasks',         label: 'Comm Tasks',   icon: <CheckSquare size={18} /> },
  { view: 'voice',         label: 'Voice',        icon: <Phone size={18} /> },
  { view: 'requests',      label: 'Requests',     icon: <ClipboardList size={18} /> },
  { view: 'reports',       label: 'AI Reports',   icon: <BarChart2 size={18} /> },
  { view: 'settings',      label: 'Settings',     icon: <Settings size={18} /> },
];

// ─── Sidebar Props — all required so TypeScript catches missing props at build time ──
interface SidebarProps {
  view: View;
  onSetView: (v: View) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  inboxUnread: number;
  tasksPending: number;
  voicePending: number;
  emailQueuePending: number;
  requestsPending: number;
  onLogout: () => void;
  userName: string;
  userRole: string;
  userInitials: string;
}

// ─── Mobile Menu Button (exported for Topbar / mobile header use) ─────────────
export const MobileMenuButton: React.FC<{ onClick: () => void; pendingAlerts?: number }> = ({ onClick, pendingAlerts }) => (
  <button onClick={onClick} className="btn btn-ghost btn-sm btn-square relative border border-base-300">
    <Menu size={22} />
    {pendingAlerts != null && pendingAlerts > 0 && (
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-error text-error-content text-[10px] font-bold rounded-full flex items-center justify-center">
        {pendingAlerts > 9 ? '9+' : pendingAlerts}
      </span>
    )}
  </button>
);

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export const Sidebar: React.FC<SidebarProps> = ({
  view, onSetView, mobileOpen, onCloseMobile,
  inboxUnread, tasksPending, voicePending, emailQueuePending, requestsPending,
  onLogout, userName, userRole, userInitials,
}) => {
  const getBadge = (v: View): number => {
    if (v === 'inbox') return inboxUnread;
    if (v === 'tasks') return tasksPending;
    if (v === 'voice') return voicePending;
    if (v === 'email-review') return emailQueuePending;
    if (v === 'requests') return requestsPending;
    return 0;
  };

  const SidebarContent = () => {
    // Filter nav items for viewer role
    const visibleNavItems = userRole === 'viewer'
      ? NAV_ITEMS.filter(item => !['inbox', 'email-review', 'tasks', 'voice', 'settings'].includes(item.view))
      : NAV_ITEMS;

    return (
      <div className="flex flex-col h-full bg-base-200 border-r border-base-300">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-base-300 flex-none">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-none">
            <FileText size={16} className="text-primary-content" />
          </div>
          <div className="flex-1">
            <span className="font-bold text-sm text-base-content">TC Command</span>
            <p className="text-[10px] text-base-content/40">{APP_VERSION}</p>
          </div>
          {/* Close button - only shown on mobile overlay */}
          <button
            onClick={onCloseMobile}
            className="md:hidden btn btn-ghost btn-sm btn-square"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {visibleNavItems.map(item => {
            const badge = getBadge(item.view);
            const active = view === item.view;
            // Amber badge for email-review to stand out from error-red
            const isEmailQueue = item.view === 'email-review';
            return (
              <button
                key={item.view}
                onClick={() => { onSetView(item.view); onCloseMobile(); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5 relative ${
                  active
                    ? 'bg-primary text-primary-content'
                    : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
                }`}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    active
                      ? 'bg-primary-content/20 text-primary-content'
                      : isEmailQueue
                        ? 'bg-amber-500 text-white'
                        : 'bg-error text-error-content'
                  }`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div className="flex-none px-2 py-3 border-t border-base-300 space-y-2">
          {/* User info */}
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-none">
              <span className="text-xs font-bold text-primary">{userInitials || '?'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-base-content truncate">{userName || 'User'}</p>
              <p className="text-[10px] text-base-content/50 truncate capitalize">{userRole || 'Staff'}</p>
            </div>
          </div>
          {/* Logout */}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-error hover:bg-error/10 transition-colors"
          >
            <LogOut size={16} />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-52 flex-none h-full">
        <SidebarContent />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onCloseMobile} />
          <div className="relative w-64 h-full shadow-xl">
            <SidebarContent />
          </div>
        </div>
      )}
    </>
  );
};