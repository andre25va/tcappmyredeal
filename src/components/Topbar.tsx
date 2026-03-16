import React, { useState, useRef, useEffect } from 'react';
import { Building2, Plus, AlertTriangle, FileText, UserPlus, Users } from 'lucide-react';

interface TopbarProps {
  onAddDeal: () => void;
  onAddAgentClient: () => void;
  onAddContact: () => void;
  dealCount: number;
  pendingAlerts: number;
}

export const Topbar: React.FC<TopbarProps> = ({
  onAddDeal,
  onAddAgentClient,
  onAddContact,
  dealCount,
  pendingAlerts,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const action = (fn: () => void) => { fn(); setOpen(false); };

  return (
    <div className="navbar bg-base-200 border-b border-base-300 px-4 min-h-12 flex-none z-50">
      {/* Brand */}
      <div className="flex-none flex items-center gap-2.5 mr-6">
        <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center flex-none">
          <Building2 size={15} className="text-primary-content" />
        </div>
        <div>
          <span className="font-bold text-sm text-base-content leading-none block">MyReDeal.com</span>
          <span className="text-xs text-base-content/50 leading-none block">Transaction Coordinator</span>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex-1 flex items-center gap-2">
        <span className="badge badge-primary badge-sm font-semibold">{dealCount} Active</span>
        {pendingAlerts > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/15 border border-orange-400/40 rounded-full animate-pulse">
            <AlertTriangle size={12} className="text-orange-500" />
            <span className="text-xs font-semibold text-orange-500">
              {pendingAlerts} Pending {pendingAlerts === 1 ? 'Alert' : 'Alerts'}
            </span>
          </div>
        )}
      </div>

      {/* + Create New dropdown */}
      <div className="flex-none relative" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          className="btn btn-primary btn-sm gap-1.5"
        >
          <Plus size={14} />
          <span>Create New</span>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-xl z-[200] overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Quick Add</span>
            </div>
            <button
              onClick={() => action(onAddDeal)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-none">
                <FileText size={14} className="text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">New Deal</div>
                <div className="text-xs text-gray-400">Start a transaction</div>
              </div>
            </button>
            <button
              onClick={() => action(onAddAgentClient)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center flex-none">
                <UserPlus size={14} className="text-green-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">New Agent Client</div>
                <div className="text-xs text-gray-400">Add to directory</div>
              </div>
            </button>
            <button
              onClick={() => action(onAddContact)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors border-t border-gray-100"
            >
              <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center flex-none">
                <Users size={14} className="text-purple-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Add Contact</div>
                <div className="text-xs text-gray-400">Lender, title, attorney…</div>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
