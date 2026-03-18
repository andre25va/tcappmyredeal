import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, FileText, Phone, Bell,
  Settings, ChevronRight, Building2, ClipboardList,
  MessageSquare, Sparkles, ListTodo, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onClose?: () => void;
  isMobile?: boolean;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: FileText },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'mls', label: 'MLS', icon: Building2 },
  { id: 'inbox', label: 'Inbox', icon: MessageSquare },
  { id: 'voice', label: 'Voice', icon: Phone },
  { id: 'tasks', label: 'Comm Tasks', icon: ListTodo },
  { id: 'ai-reports', label: 'AI Reports', icon: Sparkles },
  { id: 'compliance', label: 'Compliance', icon: ClipboardList },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ activeTab, onTabChange, onClose, isMobile }: Props) {
  const [profile, setProfile] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase
          .from('profiles')
          .select('name, role')
          .eq('id', data.user.id)
          .single()
          .then(({ data: p }) => {
            if (p) setProfile(p);
          });
      }
    });
  }, []);

  return (
    <div className="flex flex-col h-full bg-base-200 border-r border-base-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-base-300">
        <div>
          <div className="font-bold text-base text-base-content">TC Command</div>
          <div className="text-xs text-base-content/50">Transaction Coordinator</div>
        </div>
        {isMobile && onClose && (
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onTabChange(item.id); onClose?.(); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-content'
                  : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{item.label}</span>
              {isActive && <ChevronRight size={14} />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-base-300">
        {profile && (
          <div className="mb-2">
            <div className="text-xs font-semibold text-base-content truncate">{profile.name}</div>
            <div className="text-[10px] text-base-content/40 capitalize">{profile.role}</div>
          </div>
        )}
        <div className="text-[9px] font-mono text-base-content/20 select-none">v2026.03.18.5</div>
      </div>
    </div>
  );
}
