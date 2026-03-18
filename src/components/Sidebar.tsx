// Version bump only — full file preserved
// APP_VERSION updated to v2026.03.18.8
import React from 'react';
import {
  LayoutDashboard, Users, FileText, Settings, Phone,
  Building2, CheckSquare, Bell, ChevronRight, Menu, X,
  ClipboardList, BookOpen,
} from 'lucide-react';

export type View =
  | 'dashboard'
  | 'deals'
  | 'contacts'
  | 'tasks'
  | 'documents'
  | 'compliance'
  | 'calls'
  | 'notifications'
  | 'settings'
  | 'access'
  | 'scripts';

const APP_VERSION = 'v2026.03.18.8';

interface Props {
  view: View;
  onSetView: (v: View) => void;
  dealCount?: number;
  unreadCount?: number;
  missedCallCount?: number;
  onAddAgentClient?: () => void;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
  userRole?: string;
  userName?: string;
}

export const MobileMenuButton: React.FC<{ onClick: () => void; isOpen: boolean }> = ({ onClick, isOpen }) => (
  <button
    onClick={onClick}
    className="lg:hidden fixed top-3 left-3 z-50 btn btn-ghost btn-sm btn-square bg-base-200 border border-base-300 shadow"
    aria-label="Toggle menu"
  >
    {isOpen ? <X size={18} /> : <Menu size={18} />}
  </button>
);

const NAV_ITEMS: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { view: 'deals', label: 'Deals', icon: <Building2 size={18} /> },
  { view: 'contacts', label: 'Contacts', icon: <Users size={18} /> },
  { view: 'tasks', label: 'Tasks', icon: <CheckSquare size={18} /> },
  { view: 'documents', label: 'Documents', icon: <FileText size={18} /> },
  { view: 'compliance', label: 'Compliance', icon: <ClipboardList size={18} /> },
  { view: 'calls', label: 'Calls', icon: <Phone size={18} /> },
  { view: 'scripts', label: 'Scripts', icon: <BookOpen size={18} /> },
  { view: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
  { view: 'settings', label: 'Settings', icon: <Settings size={18} /> },
];

export const Sidebar: React.FC<Props> = ({
  view,
  onSetView,
  dealCount,
  unreadCount,
  missedCallCount,
  isMobileMenuOpen,
  onToggleMobileMenu,
  userRole,
  userName,
}) => {
  const getBadge = (v: View) => {
    if (v === 'deals' && dealCount) return dealCount;
    if (v === 'notifications' && unreadCount) return unreadCount;
    if (v === 'calls' && missedCallCount) return missedCallCount;
    return null;
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-base-200 border-r border-base-300">
      {/* Logo */}
      <div className="p-4 border-b border-base-300 flex items-center gap-2">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <Building2 size={16} className="text-primary-content" />
        </div>
        <div>
          <p className="font-bold text-sm text-base-content">TC Command</p>
          <p className="text-xs text-base-content/50">Transaction Manager</p>
        </div>
      </div>

      {/* User info */}
      {userName && (
        <div className="px-4 py-2 border-b border-base-300">
          <p className="text-xs text-base-content/60 truncate">{userName}</p>
          {userRole && <p className="text-xs text-primary capitalize">{userRole}</p>}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const badge = getBadge(item.view);
          const isActive = view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => {
                onSetView(item.view);
                if (onToggleMobileMenu && isMobileMenuOpen) onToggleMobileMenu();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary text-primary-content'
                  : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
              }`}
            >
              <span className="flex-none">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {badge !== null && (
                <span className={`badge badge-sm ${
                  isActive ? 'badge-primary-content bg-white/20 text-white' : 'badge-primary'
                }`}>{badge}</span>
              )}
              {isActive && <ChevronRight size={14} className="flex-none opacity-60" />}
            </button>
          );
        })}
      </nav>

      {/* Version */}
      <div className="p-3 border-t border-base-300">
        <p className="text-xs text-base-content/30 text-center">{APP_VERSION}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-56 flex-none flex-col h-full">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-56 flex-none flex flex-col h-full shadow-2xl">
            {sidebarContent}
          </div>
          <div className="flex-1 bg-black/40" onClick={onToggleMobileMenu} />
        </div>
      )}
    </>
  );
};
