import React from 'react';
import { Home, Phone, FileText, CheckSquare } from 'lucide-react';
import type { View } from '../Sidebar';

interface MobileBottomNavProps {
  view: View;
  onSetView: (v: View) => void;
  voicePending?: number;
  tasksPending?: number;
}

const TABS: { id: View; label: string; icon: React.ElementType; badge?: (p: MobileBottomNavProps) => number }[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'voice',     label: 'Calls', icon: Phone,       badge: (p) => p.voicePending ?? 0 },
  { id: 'transactions', label: 'Deals', icon: FileText },
  { id: 'tasks',     label: 'Queue', icon: CheckSquare, badge: (p) => p.tasksPending ?? 0 },
];

export function MobileBottomNav(props: MobileBottomNavProps) {
  const { view, onSetView } = props;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-300 z-40"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        transform: 'translateY(calc(-1 * var(--keyboard-offset, 0px)))',
        transition: 'transform 0.15s ease-out',
      }}
    >
      <div className="grid grid-cols-4 h-[60px]">
        {TABS.map(({ id, label, icon: Icon, badge }) => {
          const active = view === id;
          const count = badge ? badge(props) : 0;
          return (
            <button
              key={id}
              onClick={() => onSetView(id)}
              className={`flex flex-col items-center justify-center gap-0.5 relative tap-highlight-transparent ${
                active ? 'text-primary' : 'text-base-content/50'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-primary rounded-b-full" />
              )}
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-error text-error-content text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5 leading-none">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium leading-none ${active ? 'text-primary' : ''}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
