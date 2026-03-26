import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { roleAvatarBg, roleBadge, roleLabel, getInitials } from '../utils/helpers';

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
      const { data, error } = await supabase
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

      if (!error && data) {
        const mapped: DealContact[] = (data as any[])
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

        const filtered =
          mode === 'email'
            ? mapped.filter((c) => c.email)
            : mode === 'sms'
            ? mapped.filter((c) => c.phone)
            : mapped;

        setContacts(filtered);
      }
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
      <p className="text-sm text-gray-400 italic">No contacts found on this deal.</p>
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
          <button
            key={c.participantId}
            type="button"
            title={c.email || c.phone || ''}
            onClick={() => onToggle(c)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shadow-sm transition-all ${
              isActive
                ? 'bg-white border-primary ring-2 ring-primary/20 shadow-md'
                : 'bg-white border-gray-200 hover:border-primary/40 hover:shadow-md'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${roleAvatarBg(
                c.role as any
              )}`}
            >
              {getInitials(c.name)}
            </div>
            <span className="text-xs font-medium text-black">{c.name}</span>
            <span className={`badge badge-xs ${roleBadge(c.role as any)}`}>
              {roleLabel(c.role as any)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
