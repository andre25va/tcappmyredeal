import React from 'react';
import {
  LayoutDashboard, FileText, Users, Settings, Phone,
  Building2, ClipboardList, Bell, ChevronRight, Menu, X,
  BookOpen, LogOut,
} from 'lucide-react';

export type View =
  | 'dashboard'
  | 'transactions'
  | 'contacts'
  | 'scripts'
  | 'settings'
  | 'dialer'
  | 'compliance'
  | 'activity'
  | 'notifications'
  | 'mls'
  | 'inbox'
  | 'tasks'
  | 'voice'
  | 'reports';

// ─── Only props that Sidebar ACTUALLY uses ────────────────────────────────────
// Making onLogout + userName required so TypeScript catches missing props at
// build time instead of silently rendering nothing.
interface SidebarProps {
  view: View;
  onSetView: (v: View) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  inboxUnread?: number;
  tasksPending?: number;
  voicePending?: number;
  // Required — build will fail if App.tsx forgets these
  onLogout: () => void;
  userName: string;
  userRole?: string;
  userInitials?: string;
}

export const MobileMenuButton: React.FC<{ onClick: () => void; pendingAlerts?: number }> = ({ onClick, pendingAlerts }) => (
  <button
    onClick={onClick}
    className="fixed top-3 left-3 z-50 btn btn-ghost btn-sm btn-square lg:hidden"
    aria-label="Open menu"
  >
    <Menu size={20} />
    {pendingAlerts !== undefined && pendingAlerts > 0 && (
      <span className="absolute -top-1 -right-1 badge badge-error badge-xs text-white">{pendingAlerts}</span>
    )}
  </button>
);

const APP_VERSION = 'v2026.03.18.11';

const NAV_ITEMS: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: 'dashboard',     label: 'Dashboard',     icon: <LayoutDashboard size={18} /> },
  { view: 'transactions',  label: 'Deals',          icon: <Building2 size={18} /> },
  { view: 'contacts',      label: 'Contacts',       icon: <Users size={18} /> },
  { view: 'dialer',        label: 'Dialer',         icon: <Phone size={18} /> },
  { view: 'inbox',         label: 'Inbox',          icon: <Bell size={18} /> },
  { view: 'compliance',    label: 'Compliance',     icon: <ClipboardList size={18} /> },
  { view: 'scripts',       label: 'Scripts',        icon: <BookOpen size={18} /> },
  { view: 'activity',      label: 'Activity Log',   icon: <FileText size={18} /> },
  { view: 'mls',           label: 'MLS Directory',  icon: <Building2 size={18} /> },
  { view: 'settings',      label: 'Settings',       icon: <Settings size={18} /> },
];

export const Sidebar: React.FC<SidebarProps> = ({
  view,
  onSetView,
  onCloseMobile,
  mobileOpen = false,
  inboxUnread = 0,
  tasksPending = 0,
  voicePending = 0,
  onLogout,
  userName,
  userRole,
  userInitials,
}) => {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full w-60 bg-base-200 border-r border-base-300
          flex flex-col z-50 transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Logo / Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-base-300">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <Building2 size={14} className="text-primary-content" />
            </div>
            <span className="font-bold text-base-content text-sm">TC Command</span>
          </div>
          <button
            onClick={onCloseMobile}
            className="btn btn-ghost btn-xs btn-square lg:hidden"
          >
            <X size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV_ITEMS.map(item => {
            const isActive = view === item.view;
            const badge =
              item.view === 'inbox' ? inboxUnread
              : item.view === 'tasks' ? tasksPending
              : item.view === 'voice' ? voicePending
              : 0;
            return (
              <button
                key={item.view}
                onClick={() => { onSetView(item.view); onCloseMobile?.(); }}
                className={`
                  w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg
                  text-sm font-medium transition-colors mb-0.5
                  ${isActive
                    ? 'bg-primary text-primary-content'
                    : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
                  }
                `}
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  {badge > 0 && (
                    <span className="badge badge-error badge-xs text-white">{badge}</span>
                  )}
                  {isActive && <ChevronRight size={14} className="opacity-60" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* User info + Logout */}
        <div className="px-3 py-3 border-t border-base-300">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-none">
              {userInitials ?? userName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-base-content truncate">{userName}</p>
              {userRole && <p className="text-xs text-base-content/40 capitalize">{userRole}</p>}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-error hover:bg-error/10 transition-colors"
          >
            <LogOut size={15} />
            <span>Log Out</span>
          </button>
        </div>

        {/* Version */}
        <div className="px-4 py-2 border-t border-base-300">
          <p className="text-xs text-base-content/30">{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
};
