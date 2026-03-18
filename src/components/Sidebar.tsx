import React from 'react';
import {
  LayoutDashboard, FileText, Users, Settings, Phone,
  Building2, ClipboardList, Bell, ChevronRight, Menu, X,
  BookOpen, ChevronDown,
} from 'lucide-react';

export type View =
  | 'dashboard'
  | 'deals'
  | 'contacts'
  | 'scripts'
  | 'settings'
  | 'dialer'
  | 'compliance'
  | 'activity'
  | 'notifications'
  | 'mls';

interface SidebarProps {
  view: View;
  onSetView: (v: View) => void;
  onAddAgentClient?: () => void;
  unreadCount?: number;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  userName?: string;
  userRole?: string;
  userInitials?: string;
}

export const MobileMenuButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="fixed top-3 left-3 z-50 btn btn-ghost btn-sm btn-square lg:hidden"
    aria-label="Open menu"
  >
    <Menu size={20} />
  </button>
);

const APP_VERSION = 'v2026.03.18.8';

const NAV_ITEMS: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: 'dashboard',     label: 'Dashboard',     icon: <LayoutDashboard size={18} /> },
  { view: 'deals',        label: 'Deals',          icon: <Building2 size={18} /> },
  { view: 'contacts',     label: 'Contacts',       icon: <Users size={18} /> },
  { view: 'dialer',       label: 'Dialer',         icon: <Phone size={18} /> },
  { view: 'compliance',   label: 'Compliance',     icon: <ClipboardList size={18} /> },
  { view: 'scripts',      label: 'Scripts',        icon: <BookOpen size={18} /> },
  { view: 'activity',     label: 'Activity Log',   icon: <FileText size={18} /> },
  { view: 'mls',          label: 'MLS Directory',  icon: <Building2 size={18} /> },
  { view: 'settings',     label: 'Settings',       icon: <Settings size={18} /> },
];

export const Sidebar: React.FC<SidebarProps> = ({
  view,
  onSetView,
  unreadCount = 0,
  mobileOpen = false,
  onMobileClose,
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
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full w-60 bg-base-200 border-r border-base-300
          flex flex-col z-50 transition-transform duration-200
          ${ mobileOpen ? 'translate-x-0' : '-translate-x-full'}
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
            onClick={onMobileClose}
            className="btn btn-ghost btn-xs btn-square lg:hidden"
          >
            <X size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV_ITEMS.map(item => {
            const isActive = view === item.view;
            return (
              <button
                key={item.view}
                onClick={() => { onSetView(item.view); onMobileClose?.(); }}
                className={`
                  w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg
                  text-sm font-medium transition-colors mb-0.5
                  ${ isActive
                    ? 'bg-primary text-primary-content'
                    : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
                  }
                `}
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.view === 'notifications' && unreadCount > 0 && (
                  <span className="badge badge-error badge-xs text-white">{unreadCount}</span>
                )}
                {isActive && <ChevronRight size={14} className="opacity-60" />}
              </button>
            );
          })}
        </nav>

        {/* User info */}
        {(userName || userInitials) && (
          <div className="px-3 py-2 border-t border-base-300">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-none">
                {userInitials ?? '?'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-base-content truncate">{userName}</p>
                {userRole && <p className="text-xs text-base-content/40 capitalize">{userRole}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Version */}
        <div className="px-4 py-2 border-t border-base-300">
          <p className="text-xs text-base-content/30">{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
};
