import React, { useState, useEffect } from 'react';
import { Users, UserPlus, X, Shield, Loader2 } from 'lucide-react';
import { Deal } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { loadDealAccessGrants, loadProfilesForOrg, grantDealAccess, revokeDealAccess } from '../utils/supabaseDb';

interface Props {
  deal: Deal;
}

export function DealAccessPanel({ deal }: Props) {
  const { token, profile, isMasterAdmin, primaryOrgId } = useAuth();
  const [grants, setGrants] = useState<{ id: string; userId: string; userName: string; grantedAt: string }[]>([]);
  const [orgProfiles, setOrgProfiles] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canManage = isMasterAdmin() || profile?.role === 'admin' ||
    (deal.orgId ? (profile as any)?.orgMemberships?.some((m: any) => m.orgId === deal.orgId && m.roleInOrg === 'team_admin') : false);

  const orgId = deal.orgId ?? primaryOrgId();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [g, p] = await Promise.all([
          loadDealAccessGrants(deal.id),
          orgId ? loadProfilesForOrg(orgId) : Promise.resolve([]),
        ]);
        setGrants(g);
        setOrgProfiles(p);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [deal.id, orgId]);

  const grantedUserIds = new Set(grants.map(g => g.userId));
  const availableToAdd = orgProfiles.filter(p => !grantedUserIds.has(p.id) && p.id !== profile?.id);

  async function handleGrant() {
    if (!selectedUserId || !token) return;
    setAdding(true);
    try {
      await grantDealAccess(token, deal.id, selectedUserId);
      const prof = orgProfiles.find(p => p.id === selectedUserId);
      setGrants(prev => [...prev, {
        id: `temp-${Date.now()}`,
        userId: selectedUserId,
        userName: prof?.name ?? 'Unknown',
        grantedAt: new Date().toISOString(),
      }]);
      setSelectedUserId('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRevoke(userId: string) {
    if (!token) return;
    try {
      await revokeDealAccess(token, deal.id, userId);
      setGrants(prev => prev.filter(g => g.userId !== userId));
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 size={20} className="animate-spin text-black/30" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <div>
        <h2 className="text-base font-bold text-black flex items-center gap-2"><Shield size={16} /> Deal Access</h2>
        <p className="text-xs text-black/50 mt-0.5">
          Manage who has explicit access to this deal beyond their org membership.
          {deal.dealRef && <span className="ml-1 font-mono font-semibold text-black/70">{deal.dealRef}</span>}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* Org info */}
      {orgId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
          All active TCs and admins in this deal's organization already have implicit access. Use this panel to grant access to specific agents or members outside the org.
        </div>
      )}

      {/* Explicit grants */}
      <div>
        <h3 className="text-xs font-semibold text-black/60 uppercase tracking-wide mb-2">Explicit Access Grants</h3>
        {grants.length === 0 ? (
          <p className="text-xs text-black/40 italic">No explicit grants — access comes from org membership only.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {grants.map(g => (
              <div key={g.userId} className="flex items-center justify-between bg-white border border-black/10 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                    {g.userName.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-black">{g.userName}</p>
                    <p className="text-xs text-black/40">Granted {new Date(g.grantedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {canManage && (
                  <button onClick={() => handleRevoke(g.userId)} className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50">
                    <X size={13} /> Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grant access */}
      {canManage && availableToAdd.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-black/60 uppercase tracking-wide mb-2">Grant Access</h3>
          <div className="flex gap-2">
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="select select-bordered select-sm flex-1 text-sm"
            >
              <option value="">Select team member...</option>
              {availableToAdd.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
              ))}
            </select>
            <button
              onClick={handleGrant}
              disabled={!selectedUserId || adding}
              className="btn btn-sm btn-primary gap-1"
            >
              {adding ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              Grant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
