import React, { useState, useRef, useEffect } from 'react';
import {
  Building2, LayoutDashboard, Briefcase, Users, Globe,
  Plus, AlertTriangle, ChevronLeft, ChevronRight, Menu, X,
  ClipboardList, Settings, FileText, UserPlus, MessageSquare,
  CheckSquare, Clock, LogOut, Phone, BarChart3, Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// ── App version — update this string with each deployment ──────────────────
export const APP_VERSION = 'v2026.03.18.4';

export type View = 'dashboard' | 'transactions' | 'contacts' | 'mls' | 'compliance' | 'settings' | 'inbox' | 'tasks' | 'voice' | 'reports' | 'workflows';

interface SidebarProps {
  onAddDeal: () => void;
  onAddAgentClient: () => void;
  onAddContact: () => void;
  dealCount: number;
  pendingAlerts: number;
  onAmberClick: () => void;
  view: View;
  onSetView: (v: View) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  inboxUnread: number;
  tasksPending?: number;
  waitingCount?: number;
  voicePending?: number;
}

const NAV_ITEMS = (
  dealCount: number,
  inboxUnread: number,
  tasksPending: number,
  waitingCount: number,
  voicePendingCount: number
): { id: View; label: string; icon: React.ReactNode; badge?: number; waitingBadge?: number; adminOnly?: boolean }[] => [
  { id: 'dashboard',    label: 'Dashboard',    icon: <LayoutDashboard size={18} /> },
  { id: 'reports',      label: 'AI Reports',   icon: <BarChart3 size={18} /> },
  { id: 'inbox',        label: 'Inbox',        icon: <MessageSquare size={18} />, badge: inboxUnread > 0 ? inboxUnread : undefined, waitingBadge: waitingCount > 0 ? waitingCount : undefined },
  { id: 'tasks',        label: 'Comm Tasks',   icon: <CheckSquare size={18} />, badge: tasksPending > 0 ? tasksPending : undefined },
  { id: 'workflows',    label: 'Workflows',    icon: <Zap size={18} />, adminOnly: true },
  { id: 'voice',        label: 'Voice',        icon: <Phone size={18} />, badge: voicePendingCount > 0 ? voicePendingCount : undefined },
  { id: 'transactions', label: 'Transactions', icon: <Briefcase size={18} />, badge: dealCount },
  { id: 'contacts',     label: 'Contacts',     icon: <Users size={18} /> },
  { id: 'mls',          label: 'MLS',          icon: <Globe size={18} /> },
  { id: 'compliance',   label: 'Compliance',   icon: <ClipboardList size={18} /> },
  { id: 'settings',     label: 'Settings',     icon: <Settings size={18} /> },
];

function getInitials(name: string): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function SidebarInner({
  onAddDeal, onAddAgentClient, onAddContact, dealCount, pendingAlerts, onAmberClick,
  view, onSetView, collapsed, onToggleCollapse, onCloseMobile, isMobileOverlay,
  inboxUnread, tasksPending = 0, waitingCount = 0, voicePending = 0,
}: SidebarProps & { isMobileOverlay: boolean }) {
  const navItems = NAV_ITEMS(dealCount, inboxUnread, tasksPending, waitingCount, voicePending);
  const [createOpen, setCreateOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const { profile, logout } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const avatarColor = profile?.avatar_color || '#6366f1';
  const initials = getInitials(profile?.name || '');
  const displayName = profile?.name || profile?.phone || 'User';
  const isDemo = profile?.role === 'viewer';

  return (
    <div className={`flex flex-col h-full bg-base-200 border-r border-base-300 select-none transition-all duration-200 ${collapsed && !isMobileOverlay ? 'w-14' : 'w-52'}`}>
      {/* Logo */}
      {collapsed && !isMobileOverlay ? (
        <div className="flex flex-col items-center h-auto border-b border-base-300 flex-none py-2 gap-1">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <Building2 size={15} className="text-primary-content" />
          </div>
          <button
            onClick={onToggleCollapse}
            title="Expand sidebar"
            className="btn btn-ghost btn-xs btn-square text-base-content/50 hover:text-base-content hover:bg-base-300"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      ) : (
        <div className="flex items-center h-14 border-b border-base-300 flex-none px-2 gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-none shadow-sm">
            <Building2 size={15} className="text-primary-content" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-base-content leading-tight truncate">TC Command</div>
            <div className="text-[10px] text-base-content/45 leading-tight truncate">Transaction Coordinator</div>
          </div>
          {!isMobileOverlay && (
            <button
              onClick={onToggleCollapse}
              title="Collapse sidebar"
              className="btn btn-ghost btn-xs btn-square text-base-content/50 hover:text-base-content hover:bg-base-300 flex-none"
            >
              <ChevronLeft size={15} />
          </button>
          )}
          {isMobileOverlay && (
            <button onClick={onCloseMobile} className="btn btn-ghost btn-xs btn-square ml-auto">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {(!collapsed || isMobileOverlay) && (
        <div className="px-4 pt-4 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-base-content/35">Menu</span>
        </div>
      )}

      <nav className={`flex-1 flex flex-col gap-0.5 ${collapsed && !isMobileOverlay ? 'px-1 pt-3' : 'px-2 pt-1'}`}>
        {visibleNavItems.map((item, idx) => {
          const active = view === item.id;
          const prevItem = visibleNavItems[idx - 1];
          const showAdminDivider = item.adminOnly && !prevItem?.adminOnly && !collapsed;
          return (
            <React.Fragment key={item.id}>
              {showAdminDivider && (
                <div className="px-3 pt-2 pb-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-base-content/30">Admin</span>
                </div>
              )}
            <button
              key={item.id}
              onClick={() => { onSetView(item.id); if (isMobileOverlay) onCloseMobile(); }}
              title={collapsed && !isMobileOverlay ? item.label : undefined}
              className={`flex items-center rounded-xl font-medium transition-all w-full text-left
                ${collapsed && !isMobileOverlay ? 'justify-center p-3' : 'gap-3 px-3 py-2.5 text-sm'}
                ${active
                  ? 'bg-primary text-primary-content shadow-sm'
                  : 'text-base-content/65 hover:bg-base-300 hover:text-base-content'
                }`}
            >
              <span className="flex-none relative">
                {item.icon}
                {collapsed && !isMobileOverlay && (item.badge !== undefined || item.waitingBadge !== undefined) && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary text-primary-content rounded-full text-[8px] font-bold flex items-center justify-center leading-none">
                    {((item.badge || 0) + (item.waitingBadge || 0)) > 9 ? '9+' : (item.badge || 0) + (item.waitingBadge || 0)}
                  </span>
                )}
              </span>
              {(!collapsed || isMobileOverlay) && (
                <>
                  <span className="flex-1 leading-none">{item.label}</span>
                  <div className="flex items-center gap-1">
                    {item.waitingBadge !== undefined && item.waitingBadge > 0 && (
                      <span className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                        active ? 'bg-amber-400/30 text-amber-200' : 'bg-amber-100 text-amber-700'
                      }`} title="Waiting for reply">
                        <Clock size={9} />
                        {item.waitingBadge}
                      </span>
                    )}
                    {item.badge !== undefined && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                        active ? 'bg-white/20 text-white' : 'bg-base-content/10 text-base-content/60'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                </>
              )}
            </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* ── Bottom section ── */}
      <div className={`pb-3 pt-3 flex flex-col gap-2 border-t border-base-300 ${collapsed && !isMobileOverlay ? 'px-1 items-center' : 'px-3'}`}>
        {pendingAlerts > 0 && (
          collapsed && !isMobileOverlay ? (
            <button
              onClick={onAmberClick}
              title={`${pendingAlerts} Amber Alert${pendingAlerts > 1 ? 's' : ''} — click to filter`}
              className="relative cursor-pointer hover:scale-110 transition-transform"
            >
              <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center hover:bg-amber-600 transition-colors shadow-sm">
                <AlertTriangle size={14} className="text-white animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center leading-none">
                {pendingAlerts > 9 ? '9+' : pendingAlerts}
              </span>
            </button>
          ) : (
            <button
              onClick={onAmberClick}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500 rounded-xl hover:bg-amber-600 active:scale-95 transition-all cursor-pointer w-full text-left shadow-sm"
              title="Click to view deals with amber alerts"
            >
              <AlertTriangle size={13} className="text-white flex-none animate-pulse" />
              <span className="text-xs font-semibold text-white leading-none">
                {pendingAlerts} Amber Alert{pendingAlerts > 1 ? 's' : ''}
              </span>
            </button>
          )
        )}

        {/* Create New button */}
        <div ref={createRef} className="relative">
          {collapsed && !isMobileOverlay ? (
            <button
              onClick={() => setCreateOpen(o => !o)}
              title="Create New"
              className="btn btn-primary btn-sm btn-square rounded-xl"
            >
              <Plus size={15} />
            </button>
          ) : (
            <button
              onClick={() => setCreateOpen(o => !o)}
              className="btn btn-primary btn-sm w-full gap-2 rounded-xl"
            >
              <Plus size={13} />
              Create New
            </button>
          )}
          {createOpen && (
            <div className={`absolute z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[180px] ${collapsed && !isMobileOverlay ? 'left-14 bottom-0' : 'left-0 bottom-full mb-2'}`}>
              <button
                onClick={() => { onAddDeal(); setCreateOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-black hover:bg-gray-50"
              >
                <FileText size={15} className="text-primary flex-none" />
                New Deal
              </button>
              <button
                onClick={() => { onAddAgentClient(); setCreateOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-black hover:bg-gray-50"
              >
                <UserPlus size={15} className="text-primary flex-none" />
                New Agent Client
              </button>
              <button
                onClick={() => { onAddContact(); setCreateOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-black hover:bg-gray-50"
              >
                <Users size={15} className="text-primary flex-none" />
                Add Contact
              </button>
            </div>
          )}
        </div>

        {/* ── User footer ── */}
        <div className={`mt-1 pt-2 border-t border-base-300 ${ collapsed && !isMobileOverlay ? 'flex flex-col items-center gap-1.5 w-full' : ''}`}>
          {collapsed && !isMobileOverlay ? (
            <>
              <div
                title={displayName}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <button
                onClick={() => setLogoutConfirm(true)}
                title="Sign out"
                className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-error hover:bg-error/10"
              >
                <LogOut size={13} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex-none flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-base-content/80 truncate leading-tight">{displayName}</div>
                {isDemo && (
                  <div className="text-[10px] text-base-content/40 leading-tight">Demo view</div>
                )}
              </div>
              <button
                onClick={() => setLogoutConfirm(true)}
                title="Sign out"
                className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-error hover:bg-error/10 flex-none"
              >
                <LogOut size={13} />
              </button>
            </div>
          )}
        </div>

        {/* ── Version tag ── */}
        {(!collapsed || isMobileOverlay) && (
          <div className="text-center">
            <span className="text-[9px] text-base-content/20 font-mono">{APP_VERSION}</span>
          </div>
        )}
      </div>

      {/* ── Logout confirmation modal ── */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-base-100 rounded-2xl shadow-2xl p-6 w-72 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center flex-none">
                <LogOut size={18} className="text-error" />
              </div>
              <div>
                <div className="font-semibold text-base-content text-sm">Sign out?</div>
                <div className="text-xs text-base-content/50 mt-0.5">You'll need to log in again to access TC Command.</div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setLogoutConfirm(false)}
                className="btn btn-ghost btn-sm rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => { setLogoutConfirm(false); logout(); }}
                className="btn btn-error btn-sm rounded-xl gap-1.5"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
  return (
    <>
      <div className="hidden md:flex h-full flex-none">
        <SidebarInner {...props} isMobileOverlay={false} />
      </div>

      {props.mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={props.onCloseMobile} />
          <div className="relative z-10 h-full">
            <SidebarInner {...props} collapsed={false} isMobileOverlay={true} />
          </div>
        </div>
      )}
    </>
  );
};

export const MobileMenuButton: React.FC<{ onClick: () => void; pendingAlerts: number }> = ({ onClick, pendingAlerts }) => (
  <button
    onClick={onClick}
    className="md:hidden btn btn-ghost btn-sm btn-square relative"
  >
    <Menu size={18} />
    {pendingAlerts > 0 && (
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-warning rounded-full text-[8px] font-bold text-warning-content flex items-center justify-center">
        {pendingAlerts > 9 ? '9+' : pendingAlerts}
      </span>
    )}
  </button>
);
