import React, { useState, useEffect } from 'react';
import { RotateCcw, Loader2, AlertCircle, Building2, Users, Inbox, Trash2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../../contexts/AuthContext';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey);

type ArchiveSection = 'deals' | 'contacts' | 'deleted';

interface ArchivedDeal {
  id: string;
  property_address: string;
  deal_type: string | null;
  transaction_type: string | null;
  closing_date: string | null;
  pipeline_stage: string;
  created_at: string;
}

interface ArchivedContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
  company: string | null;
  created_at: string;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

function capitalize(s: string | null | undefined) {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}

// ── Confirmation inline widget ─────────────────────────────────────────────

interface ConfirmRowProps {
  id: string;
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

const ConfirmRow: React.FC<ConfirmRowProps> = ({ label, onConfirm, onCancel, loading }) => (
  <div className="flex items-center gap-2 justify-end flex-wrap">
    <span className="text-xs text-base-content/60">Restore <strong>{label}</strong> to active?</span>
    <button
      onClick={onConfirm}
      disabled={loading}
      className="btn btn-xs btn-success gap-1"
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
      Yes, Unarchive
    </button>
    <button onClick={onCancel} className="btn btn-xs btn-ghost">Cancel</button>
  </div>
);

// ── Deals section ──────────────────────────────────────────────────────────

const DealsSection: React.FC = () => {
  const [deals, setDeals] = useState<ArchivedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      const { data, error: err } = await supabase
        .from('deals')
        .select('id, property_address, deal_type, transaction_type, closing_date, pipeline_stage, created_at')
        .eq('pipeline_stage', 'archived')
        .order('created_at', { ascending: false });
      if (err) setError(err.message);
      else setDeals(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const handleUnarchive = async (id: string) => {
    setActionLoading(id);
    const { error: err } = await supabase
      .from('deals')
      .update({ pipeline_stage: 'contract-received' })
      .eq('id', id);
    if (err) {
      setError(err.message);
    } else {
      setDeals(prev => prev.filter(d => d.id !== id));
    }
    setActionLoading(null);
    setConfirmId(null);
  };

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-base-200 animate-pulse" />)}
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-error/10 border border-error/20">
      <AlertCircle size={14} className="text-error flex-none" />
      <p className="text-xs text-error">{error}</p>
    </div>
  );

  if (deals.length === 0) return (
    <div className="rounded-xl border border-base-300 bg-base-200 p-8 text-center">
      <Inbox size={28} className="mx-auto text-base-content/20 mb-2" />
      <p className="text-sm text-base-content/50">No archived deals</p>
      <p className="text-xs text-base-content/30 mt-1">Deals you archive will appear here and can be restored any time.</p>
    </div>
  );

  return (
    <div className="rounded-xl border border-base-300 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-base-200 border-b border-base-300">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide">Address</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide hidden sm:table-cell">Type</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide hidden md:table-cell">Side</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide hidden lg:table-cell">Close Date</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-base-300">
          {deals.map(deal => (
            <React.Fragment key={deal.id}>
              <tr className="bg-base-100 hover:bg-base-200/40 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-medium text-base-content text-sm">{deal.property_address || '—'}</span>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-base-content/60 text-sm">{capitalize(deal.deal_type)}</td>
                <td className="px-4 py-3 hidden md:table-cell text-base-content/60 text-sm">{capitalize(deal.transaction_type)}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-base-content/60 text-sm">{formatDate(deal.closing_date)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setConfirmId(deal.id)}
                    className="btn btn-xs btn-outline btn-success gap-1"
                    disabled={!!actionLoading}
                  >
                    <RotateCcw size={11} /> Unarchive
                  </button>
                </td>
              </tr>
              {confirmId === deal.id && (
                <tr className="bg-success/5 border-b border-success/20">
                  <td colSpan={5} className="px-4 py-3">
                    <ConfirmRow
                      id={deal.id}
                      label={deal.property_address || 'this deal'}
                      onConfirm={() => handleUnarchive(deal.id)}
                      onCancel={() => setConfirmId(null)}
                      loading={actionLoading === deal.id}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-base-200 border-t border-base-300">
        <p className="text-xs text-base-content/40">{deals.length} archived deal{deals.length !== 1 ? 's' : ''} — restores to Contract Received stage</p>
      </div>
    </div>
  );
};

// ── Contacts section ───────────────────────────────────────────────────────

const ContactsSection: React.FC = () => {
  const [contacts, setContacts] = useState<ArchivedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      const { data, error: err } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, contact_type, company, created_at')
        .eq('is_active', false)
        .order('created_at', { ascending: false });
      if (err) setError(err.message);
      else setContacts(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const handleUnarchive = async (id: string) => {
    setActionLoading(id);
    const { error: err } = await supabase
      .from('contacts')
      .update({ is_active: true })
      .eq('id', id);
    if (err) {
      setError(err.message);
    } else {
      setContacts(prev => prev.filter(c => c.id !== id));
    }
    setActionLoading(null);
    setConfirmId(null);
  };

  const fullName = (c: ArchivedContact) => [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-base-200 animate-pulse" />)}
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-error/10 border border-error/20">
      <AlertCircle size={14} className="text-error flex-none" />
      <p className="text-xs text-error">{error}</p>
    </div>
  );

  if (contacts.length === 0) return (
    <div className="rounded-xl border border-base-300 bg-base-200 p-8 text-center">
      <Inbox size={28} className="mx-auto text-base-content/20 mb-2" />
      <p className="text-sm text-base-content/50">No inactive contacts</p>
      <p className="text-xs text-base-content/30 mt-1">Contacts you deactivate will appear here and can be restored any time.</p>
    </div>
  );

  return (
    <div className="rounded-xl border border-base-300 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-base-200 border-b border-base-300">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide">Name</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide hidden sm:table-cell">Type</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide hidden md:table-cell">Email</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide hidden lg:table-cell">Phone</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-base-300">
          {contacts.map(contact => (
            <React.Fragment key={contact.id}>
              <tr className="bg-base-100 hover:bg-base-200/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-base-content text-sm">{fullName(contact)}</div>
                  {contact.company && <div className="text-xs text-base-content/40">{contact.company}</div>}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-base-content/60 text-sm">{capitalize(contact.contact_type)}</td>
                <td className="px-4 py-3 hidden md:table-cell text-base-content/60 text-sm">{contact.email || '—'}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-base-content/60 text-sm">{contact.phone || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setConfirmId(contact.id)}
                    className="btn btn-xs btn-outline btn-success gap-1"
                    disabled={!!actionLoading}
                  >
                    <RotateCcw size={11} /> Unarchive
                  </button>
                </td>
              </tr>
              {confirmId === contact.id && (
                <tr className="bg-success/5 border-b border-success/20">
                  <td colSpan={5} className="px-4 py-3">
                    <ConfirmRow
                      id={contact.id}
                      label={fullName(contact)}
                      onConfirm={() => handleUnarchive(contact.id)}
                      onCancel={() => setConfirmId(null)}
                      loading={actionLoading === contact.id}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-base-200 border-t border-base-300">
        <p className="text-xs text-base-content/40">{contacts.length} inactive contact{contacts.length !== 1 ? 's' : ''} — restoring re-activates them in dropdowns and deal views</p>
      </div>
    </div>
  );
};

// ── Deleted Contacts section ────────────────────────────────────────────────

interface DeletedContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
  company: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

const DeletedContactsSection: React.FC = () => {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<DeletedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      const { data, error: err } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, contact_type, company, deleted_at, deleted_by')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (err) setError(err.message);
      else setContacts(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const handleRestore = async (id: string) => {
    setActionLoading(id);
    const { error: err } = await supabase
      .from('contacts')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', id);
    if (!err) {
      await supabase.from('activity_log').insert({
        action: 'contact_restored',
        entity_type: 'contact',
        entity_id: id,
        description: `Contact restored by ${profile?.name ?? 'Unknown'}`,
        performed_by: profile?.name ?? 'Unknown',
      });
      setContacts(prev => prev.filter(c => c.id !== id));
    } else {
      setError(err.message);
    }
    setActionLoading(null);
    setConfirmId(null);
  };

  const fullName = (c: DeletedContact) => [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-base-200 animate-pulse" />)}
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-error/10 border border-error/20">
      <AlertCircle size={14} className="text-error flex-none" />
      <p className="text-xs text-error">{error}</p>
    </div>
  );

  if (contacts.length === 0) return (
    <div className="rounded-xl border border-base-300 bg-base-200 p-8 text-center">
      <Trash2 size={28} className="mx-auto text-base-content/20 mb-2" />
      <p className="text-sm text-base-content/50">No deleted contacts</p>
      <p className="text-xs text-base-content/30 mt-1">Contacts you delete will appear here and can be restored any time.</p>
    </div>
  );

  return (
    <div className="rounded-xl border border-base-300 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-base-200 border-b border-base-300">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide">Name</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide hidden sm:table-cell">Type</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide hidden md:table-cell">Deleted By</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide hidden lg:table-cell">Deleted On</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-base-content/60 uppercase tracking-wide text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-base-300">
          {contacts.map(contact => (
            <React.Fragment key={contact.id}>
              <tr className="bg-base-100 hover:bg-base-200/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-base-content text-sm">{fullName(contact)}</div>
                  {contact.company && <div className="text-xs text-base-content/40">{contact.company}</div>}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-base-content/60 text-sm">{capitalize(contact.contact_type)}</td>
                <td className="px-4 py-3 hidden md:table-cell text-sm">
                  <span className="font-medium text-base-content">{contact.deleted_by || '—'}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-base-content/60 text-sm">{formatDate(contact.deleted_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setConfirmId(contact.id)}
                    className="btn btn-xs btn-outline btn-success gap-1"
                    disabled={!!actionLoading}
                  >
                    <RotateCcw size={11} /> Restore
                  </button>
                </td>
              </tr>
              {confirmId === contact.id && (
                <tr className="bg-success/5 border-b border-success/20">
                  <td colSpan={5} className="px-4 py-3">
                    <ConfirmRow
                      id={contact.id}
                      label={fullName(contact)}
                      onConfirm={() => handleRestore(contact.id)}
                      onCancel={() => setConfirmId(null)}
                      loading={actionLoading === contact.id}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-base-200 border-t border-base-300">
        <p className="text-xs text-base-content/40">{contacts.length} deleted contact{contacts.length !== 1 ? 's' : ''} — restore to bring back to active contacts</p>
      </div>
    </div>
  );
};

// ── Main ArchiveTab ────────────────────────────────────────────────────────

export const ArchiveTab: React.FC = () => {
  const [section, setSection] = useState<ArchiveSection>('deals');

  const sections: { id: ArchiveSection; label: string; icon: React.ReactNode }[] = [
    { id: 'deals',    label: 'Deals',    icon: <Building2 size={14} /> },
    { id: 'contacts', label: 'Contacts', icon: <Users size={14} /> },
    { id: 'deleted',  label: 'Deleted Contacts', icon: <Trash2 size={14} /> },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-base-content">Archive</h2>
        <p className="text-xs text-base-content/50 mt-0.5">
          View and restore archived deals and inactive contacts. Nothing is permanently deleted — everything lives here until you restore it.
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-base-300">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
              ${section === s.id
                ? 'border-primary text-primary'
                : 'border-transparent text-base-content/50 hover:text-base-content'}`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      {section === 'deals'    && <DealsSection />}
      {section === 'contacts' && <ContactsSection />}
      {section === 'deleted'  && <DeletedContactsSection />}
    </div>
  );
};
