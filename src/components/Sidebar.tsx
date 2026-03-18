import React, { useState, useEffect } from 'react';
import {
  Home, FileText, Users, MessageSquare, Settings,
  Phone, Bell, ChevronDown, ChevronUp, BarChart2,
  BookOpen, Building2, Shield, Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const APP_VERSION = 'v2026.03.18.5';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  children?: NavItem[];
}

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  unreadCount?: number;
  taskCount?: number;
  onCallStarted?: () => void;
}

export function Sidebar({ activeTab, onTabChange, unreadCount = 0, taskCount = 0, onCallStarted }: Props) {
  const [expanded, setExpanded] = useState<string[]>(['deals']);

  const toggle = (id: string) => {
    setExpanded(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={18} /> },
    {
      id: 'deals',
      label: 'Deals',
      icon: <FileText size={18} />,
      children: [
        { id: 'deals', label: 'All Deals', icon: <FileText size={16} /> },
        { id: 'pipeline', label: 'Pipeline', icon: <BarChart2 size={16} /> },
      ],
    },
    {
      id: 'contacts-group',
      label: 'Contacts',
      icon: <Users size={18} />,
      children: [
        { id: 'contacts', label: 'Directory', icon: <BookOpen size={16} /> },
        { id: 'organizations', label: 'Organizations', icon: <Building2 size={16} /> },
      ],
    },
    {
      id: 'comms-group',
      label: 'Communications',
      icon: <MessageSquare size={18} />,
      badge: unreadCount,
      children: [
        { id: 'inbox', label: 'Inbox', icon: <MessageSquare size={16} />, badge: unreadCount },
        { id: 'calls', label: 'Call Log', icon: <Phone size={16} /> },
      ],
    },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} />, badge: taskCount },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  function renderItem(item: NavItem, depth = 0) {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expanded.includes(item.id);
    const isActive = activeTab === item.id;
    const childActive = hasChildren && item.children!.some(c => c.id === activeTab);

    if (hasChildren) {
      return (
        <div key={item.id}>
          <button
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              childActive
                ? 'bg-primary/10 text-primary'
                : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
            }`}
            onClick={() => toggle(item.id)}
          >
            <div className="flex items-center gap-2">
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? (
                <span className="badge badge-primary badge-xs">{item.badge}</span>
              ) : null}
            </div>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {isExpanded && (
            <div className="ml-4 mt-1 space-y-1">
              {item.children!.map(child => renderItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={item.id}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary text-primary-content'
            : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
        }`}
        onClick={() => onTabChange(item.id)}
      >
        <div className="flex items-center gap-2">
          {item.icon}
          <span>{item.label}</span>
        </div>
        {item.badge ? (
          <span className={`badge badge-xs ${
            isActive ? 'badge-primary-content' : 'badge-primary'
          }`}>{item.badge}</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full bg-base-100 border-r border-base-300 w-56">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-base-300">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-primary-content" />
          </div>
          <div>
            <div className="font-bold text-sm text-base-content">TC Command</div>
            <div className="text-xs text-base-content/50">MyReDeal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {navItems.map(item => renderItem(item))}
      </nav>

      {/* Version footer */}
      <div className="px-4 py-2 border-t border-base-300">
        <span className="font-mono text-[10px] text-base-content/30">{APP_VERSION}</span>
      </div>
    </div>
  );
}
