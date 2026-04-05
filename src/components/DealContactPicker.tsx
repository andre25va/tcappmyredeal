import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { MRDChip } from './ui/MRDChip';

export interface DealContact {
  participantId: string;
  contactId: string;
  name: string;
  role: string;
  side: string;
  email: string | null;
  phone: string | null;
}

interface Props {
  dealId: string;
  /** Highlight chips whose contactId is in this array */
  selectedContactIds?: string[];
  /** Highlight chips whose email is in this array (for email compose) */
  selectedEmails?: string[];
  onToggle: (contact: DealContact) => void;
  /** 'email' = only show contacts with email, 'sms' = only phone, 'any' = all */
  mode?: 'email' | 'sms' | 'any';
  className?: string;
}

function applyModeFilter(contacts: DealContact[], mode: 'email' | 'sms' | 'any'): DealContact[] {
  if (mode === 'email') return contacts.filter((c) => c.email);
  if (mode === 'sms') return contacts.filter((c) => c.phone);
  return contacts;
}

// ── Side section ────────────────────────────────────────────────────────────
interface SideSectionProps {
  label: string;
  color: string;
  dot: string;
  contacts: DealContact[];
  isActive: (c: DealContact) => boolean;
  onToggle: (c: DealContact) => void;
}

function SideSection({ label, color, dot, contacts, isActive, onToggle }: SideSectionProps) {
  const selectedCount = contacts.filter(isActive).length;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full flex-none ${dot}`} />
        <p className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{label}</p>
        {selectedCount > 0 && (
          <span className="badge badge-xs badge-primary ml-1">{selectedCount}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {contacts.map((c) => (
          <MRDChip
            key={c.participantId}
            name={c.name}
            role={c.role}
            selected={isActive(c)}
            onClick={() => onToggle(c)}
            className={c.email || c.phone ? '' : 'opacity-60'}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main picker ──────────────────────────────────────────────────────────────
export function DealContactPicker({
  dealId,
  selectedContactIds,
  selectedEmails,
  onToggle,
  mode = 'any',
  className,
}: Props) {
  const [notifiersOpen, setNotifiersOpen] = useState(true);

  const { data: contacts = [], isLoading: loading } = useQuery<DealContact[]>({
    queryKey: ['deal-participants', dealId, mode],
    queryFn: async () => {
      // ── Pass 1: deal_participants table (canonical source) ────────────────
      const { data: dpData, error: dpError } = await supabase
        .from('deal_participants')
        .select(`
          id,
          contact_id,
          deal_role,
          side,
          contacts (
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .eq('deal_id', dealId);

      if (!dpError && dpData && dpData.length > 0) {
        const mapped: DealContact[] = (dpData as any[])
          .map((dp) => {
            const c = dp.contacts;
            if (!c) return null;
            const name =
              [c.first_name, c.last_name].filter(Boolean).join(' ') ||
              c.email ||
              'Unknown';
            return {
              participantId: dp.id,
              contactId: dp.contact_id,
              name,
              role: dp.deal_role || 'other',
              side: dp.side || 'both',
              email: c.email || null,
              phone: c.phone || null,
            } as DealContact;
          })
          .filter(Boolean) as DealContact[];

        return applyModeFilter(mapped, mode);
      }

      // ── Pass 2: fallback to deal FK columns ────────────────────────────
      const { data: dealRow } = await supabase
        .from('deals')
        .select('buyers_agent_id, listing_agent_id, title_company_id')
        .eq('id', dealId)
        .single();

      if (dealRow) {
        const fkEntries: { id: string; role: string; side: string }[] = [];
        if (dealRow.buyers_agent_id)
          fkEntries.push({ id: dealRow.buyers_agent_id, role: 'agent', side: 'buyer' });
        if (dealRow.listing_agent_id)
          fkEntries.push({ id: dealRow.listing_agent_id, role: 'agent', side: 'seller' });
        if (dealRow.title_company_id)
          fkEntries.push({ id: dealRow.title_company_id, role: 'title', side: 'both' });

        if (fkEntries.length > 0) {
          const { data: contactRows } = await supabase
            .from('contacts')
            .select('id, first_name, last_name, email, phone')
            .in('id', fkEntries.map((f) => f.id));

          if (contactRows) {
            const mapped: DealContact[] = fkEntries
              .map((fk) => {
                const c = contactRows.find((r: any) => r.id === fk.id);
                if (!c) return null;
                const name =
                  [c.first_name, c.last_name].filter(Boolean).join(' ') ||
                  c.email ||
                  'Unknown';
                return {
                  participantId: fk.id,
                  contactId: fk.id,
                  name,
                  role: fk.role,
                  side: fk.side,
                  email: c.email || null,
                  phone: c.phone || null,
                } as DealContact;
              })
              .filter(Boolean) as DealContact[];

            return applyModeFilter(mapped, mode);
          }
        }
      }

      return [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <span className="loading loading-spinner loading-xs" /> Loading contacts…
      </div>
    );
  }

  const buyers  = contacts.filter((c) => c.side === 'buyer');
  const sellers = contacts.filter((c) => c.side === 'seller');
  const both    = contacts.filter((c) => c.side !== 'buyer' && c.side !== 'seller');

  const checkActive = (c: DealContact): boolean =>
    selectedContactIds
      ? selectedContactIds.includes(c.contactId)
      : selectedEmails
      ? selectedEmails.includes(c.email || '')
      : false;

  const totalSelected = contacts.filter(checkActive).length;

  return (
    <div className={`rounded-xl overflow-hidden border border-base-300 ${className || ''}`}>
      {/* Notifiers collapsible header */}
      <button
        type="button"
        onClick={() => setNotifiersOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-4 py-2.5 bg-base-200 hover:bg-base-300/60 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-violet-500 flex-none" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-violet-500">Notifiers</span>
        {totalSelected > 0 && (
          <span className="badge badge-xs badge-primary ml-1">{totalSelected}</span>
        )}
        <span
          className={`ml-auto text-base-content/40 text-[10px] transition-transform duration-200 ${
            notifiersOpen ? 'rotate-90' : ''
          }`}
        >
          ▶
        </span>
      </button>

      {/* Side sections */}
      {notifiersOpen && (
        <div className="p-4 space-y-4 bg-base-100">
          {contacts.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No contacts found on this deal.</p>
          ) : (
            <>
              {buyers.length > 0 && (
                <SideSection
                  label="Buy Side"
                  color="text-blue-500"
                  dot="bg-blue-500"
                  contacts={buyers}
                  isActive={checkActive}
                  onToggle={onToggle}
                />
              )}
              {sellers.length > 0 && (
                <SideSection
                  label="Sell Side"
                  color="text-orange-500"
                  dot="bg-orange-500"
                  contacts={sellers}
                  isActive={checkActive}
                  onToggle={onToggle}
                />
              )}
              {both.length > 0 && (
                <SideSection
                  label="Both Sides"
                  color="text-base-content/50"
                  dot="bg-base-content/30"
                  contacts={both}
                  isActive={checkActive}
                  onToggle={onToggle}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
