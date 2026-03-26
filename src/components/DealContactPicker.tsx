import React, { useState, useEffect } from 'react';
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

export function DealContactPicker({
  dealId,
  selectedContactIds,
  selectedEmails,
  onToggle,
  mode = 'any',
  className,
}: Props) {
  const [contacts, setContacts] = useState<DealContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // ── Pass 1: deal_participants table (the canonical source) ────────────────
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

        setContacts(applyModeFilter(mapped, mode));
        setLoading(false);
        return;
      }

      // ── Pass 2: fallback to deal FK columns ────────────────────────────────────
      // Covers deals created before deal_participants was populated
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

            setContacts(applyModeFilter(mapped, mode));
            setLoading(false);
            return;
          }
        }
      }

      // No contacts found from either source
      setContacts([]);
      setLoading(false);
    }

    load();
  }, [dealId, mode]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="loading loading-spinner loading-xs" /> Loading contacts…
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        No contacts found on this deal.
      </p>
    );
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className || ''}`}>
      {contacts.map((c) => {
        const isActive = selectedContactIds
          ? selectedContactIds.includes(c.contactId)
          : selectedEmails
          ? selectedEmails.includes(c.email || '')
          : false;

        return (
          <MRDChip
            key={c.participantId}
            name={c.name}
            role={c.role}
            selected={isActive}
            onClick={() => onToggle(c)}
            className={c.email || c.phone ? '' : 'opacity-60'}
          />
        );
      })}
    </div>
  );
}
