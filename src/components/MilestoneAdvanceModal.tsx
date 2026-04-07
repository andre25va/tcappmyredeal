import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Mail, MessageSquare, ChevronDown, ChevronUp, Loader2, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Deal, DealMilestone, ContactRecord } from '../types';
import { MILESTONE_LABELS, generateTasksForMilestone } from '../utils/taskTemplates';
import { PageIdBadge } from './PageIdBadge';
import { StatusBadge } from './ui/StatusBadge';
import { PAGE_IDS } from '../utils/pageTracking';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Modal } from './ui/Modal';
import { useMlsMilestoneConfigFull } from '../hooks/useMlsMilestoneConfig';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface Props {
  deal: Deal;
  targetMilestone: DealMilestone;
  targetLabel?: string;
  contactRecords: ContactRecord[];
  userName: string;
  onConfirm: (milestone: DealMilestone) => void;
  onCancel: () => void;
}

interface Recipient {
  key: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'TBD';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)} days ago`;
  if (diff === 0) return 'today';
  return `${diff}`;
}

function addDays(dateStr: string | null | undefined, days: number | null | undefined): string | null {
  if (!dateStr || days == null) return null;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function fillMergeTags(
  template: string,
  deal: Deal,
  recipientName: string,
  milestoneLabel: string,
  nextMilestoneLabel: string,
  nextDueDate: string | null,
): string {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const firstName = recipientName.split(' ')[0] || recipientName;

  return template
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{recipient_name\}\}/g, recipientName)
    .replace(/\{\{deal_address\}\}/g, deal.propertyAddress || '')
    .replace(/\{\{property_address\}\}/g, deal.propertyAddress || '')
    .replace(/\{\{current_milestone\}\}/g, milestoneLabel)
    .replace(/\{\{current_date\}\}/g, today)
    .replace(/\{\{next_milestone\}\}/g, nextMilestoneLabel || 'N/A')
    .replace(/\{\{next_due_date\}\}/g, nextDueDate ? formatDate(nextDueDate) : 'TBD')
    .replace(/\{\{closing_date\}\}/g, formatDate(deal.closingDate))
    .replace(/\{\{days_to_closing\}\}/g, daysUntil(deal.closingDate))
    .replace(/\{\{tc_name\}\}/g, 'TC Team');
}

function buildUniversalEmail(
  deal: Deal,
  recipientName: string,
  milestoneLabel: string,
  nextMilestoneLabel: string,
  nextDueDate: string | null,
): { subject: string; body: string } {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const firstName = recipientName.split(' ')[0] || recipientName;

  const subject = `${deal.propertyAddress} — ${milestoneLabel} Confirmed`;
  const body =
`Hi ${firstName},

This is a quick update on your transaction at ${deal.propertyAddress}.

✅ ${milestoneLabel} — ${today}

⏭️ Coming up next:
${nextMilestoneLabel
  ? `${nextMilestoneLabel} is due on ${nextDueDate ? formatDate(nextDueDate) : 'TBD'}.`
  : 'No further milestones scheduled.'}

🏠 ${daysUntil(deal.closingDate)} days until closing on ${formatDate(deal.closingDate)}.

If you have any questions, don't hesitate to reach out.

TC Team
tc@myredeal.com`;

  return { subject, body };
}

export const MilestoneAdvanceModal: React.FC<Props> = ({
  deal,
  targetMilestone,
  targetLabel,
  contactRecords,
  userName,
  onConfirm,
  onCancel,
}) => {
  const milestoneLabel = targetLabel || MILESTONE_LABELS[targetMilestone] || targetMilestone;

  // ── New: read from mls_milestone_config scoped to this deal's MLS board ──
  const { data: mlsConfigs = [], isLoading: loadingSettings } = useMlsMilestoneConfigFull(
    (deal as any).mlsId
  );

  // DealMilestone uses hyphens (contract-received) but milestone_types.key uses underscores (contract_received)
  const normalizedKey = targetMilestone.replace(/-/g, '_');

  // Find the config row for this specific milestone (match by milestone_types.key)
  const config = useMemo(() => {
    return (mlsConfigs as any[]).find(c => c.milestone_types?.key === normalizedKey) ?? null;
  }, [mlsConfigs, normalizedKey]);

  // Find the next milestone in sort_order
  const nextConfig = useMemo(() => {
    const sorted = [...(mlsConfigs as any[])].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(c => c.milestone_types?.key === normalizedKey);
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
  }, [mlsConfigs, normalizedKey]);

  const nextMilestoneLabel: string = nextConfig?.milestone_types?.label ?? '';
  const contractDate: string | null = (deal as any).contractDate ?? null;
  const nextDueDate = addDays(contractDate, nextConfig?.due_days_from_contract);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRecipientKey, setPreviewRecipientKey] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const focusedFieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const staffFirstName = (userName || '').split(' ')[0];
  const nameConfirmed = confirmName.trim().toLowerCase() === staffFirstName.toLowerCase();

  const tasksToGenerate = generateTasksForMilestone(targetMilestone);

  // Build recipients from mls_milestone_config notify flags
  useEffect(() => {
    if (loadingSettings) return;

    const built: Recipient[] = [];
    const emailOn = true;
    const smsOn = false;

    // notify_agent → both buyer agent and seller agent
    // Email lookup priority: deal.participants (has real contactEmail) → deal.buyerAgent → contactRecords by name
    if (config?.notify_agent ?? true) {
      const buyerAgentName = deal.buyerAgent?.name || (deal as any).buyerAgentName || '';
      const buyerParticipant = deal.participants?.find(p => p.dealRole === 'lead_agent' && p.side === 'buyer');
      const buyerAgentEmail =
        buyerParticipant?.contactEmail ||
        deal.buyerAgent?.email ||
        contactRecords.find(c => c.fullName === buyerAgentName)?.email || '';
      const buyerAgentPhone =
        buyerParticipant?.contactPhone ||
        deal.buyerAgent?.phone ||
        contactRecords.find(c => c.fullName === buyerAgentName)?.phone || '';

      if (buyerAgentName) {
        built.push({
          key: 'buyer-agent',
          name: buyerAgentName,
          role: 'Buyer Agent',
          email: buyerAgentEmail,
          phone: buyerAgentPhone,
          emailEnabled: emailOn && !!buyerAgentEmail,
          smsEnabled: smsOn,
        });
      }

      const sellerAgentName = deal.sellerAgent?.name || (deal as any).sellerAgentName || '';
      const sellerParticipant = deal.participants?.find(p => p.dealRole === 'lead_agent' && (p.side === 'listing' || p.side === 'seller'));
      const sellerAgentEmail =
        sellerParticipant?.contactEmail ||
        deal.sellerAgent?.email ||
        contactRecords.find(c => c.fullName === sellerAgentName)?.email || '';
      const sellerAgentPhone =
        sellerParticipant?.contactPhone ||
        deal.sellerAgent?.phone ||
        contactRecords.find(c => c.fullName === sellerAgentName)?.phone || '';

      if (sellerAgentName) {
        built.push({
          key: 'seller-agent',
          name: sellerAgentName,
          role: 'Seller Agent',
          email: sellerAgentEmail,
          phone: sellerAgentPhone,
          emailEnabled: emailOn && !!sellerAgentEmail,
          smsEnabled: smsOn,
        });
      }
    }

    // notify_lender
    if (config?.notify_lender ?? false) {
      const rec = contactRecords.find(
        c => c.contactType === 'lender' ||
          (deal.loanOfficerName && c.fullName === deal.loanOfficerName)
      );
      if (rec) {
        built.push({
          key: 'lender',
          name: rec.fullName,
          role: 'Lender',
          email: rec.email || '',
          phone: rec.phone || '',
          emailEnabled: emailOn && !!rec.email,
          smsEnabled: smsOn,
        });
      } else if (deal.loanOfficerName) {
        built.push({ key: 'lender', name: deal.loanOfficerName, role: 'Lender', email: '', phone: '', emailEnabled: false, smsEnabled: false });
      }
    }

    // notify_title
    if (config?.notify_title ?? false) {
      const rec = contactRecords.find(
        c => c.contactType === 'title' ||
          (deal.titleCompanyName && c.company === deal.titleCompanyName)
      );
      if (rec) {
        built.push({
          key: 'title',
          name: rec.fullName,
          role: 'Title',
          email: rec.email || '',
          phone: rec.phone || '',
          emailEnabled: emailOn && !!rec.email,
          smsEnabled: smsOn,
        });
      } else if (deal.titleCompanyName) {
        built.push({ key: 'title', name: deal.titleCompanyName, role: 'Title Company', email: '', phone: '', emailEnabled: false, smsEnabled: false });
      }
    }

    // notify_buyer
    if (config?.notify_buyer ?? false) {
      const c = deal.contacts?.find(c => c.role === 'buyer');
      if (c) {
        built.push({
          key: 'buyer',
          name: c.name || deal.buyerName || 'Buyer',
          role: 'Buyer',
          email: c.email || '',
          phone: c.phone || '',
          emailEnabled: emailOn && !!c.email,
          smsEnabled: smsOn,
        });
      } else if (deal.buyerName) {
        built.push({ key: 'buyer', name: deal.buyerName, role: 'Buyer', email: '', phone: '', emailEnabled: false, smsEnabled: false });
      }
    }

    // notify_seller
    if (config?.notify_seller ?? false) {
      const c = deal.contacts?.find(c => c.role === 'seller');
      if (c) {
        built.push({
          key: 'seller',
          name: c.name || deal.sellerName || 'Seller',
          role: 'Seller',
          email: c.email || '',
          phone: c.phone || '',
          emailEnabled: emailOn && !!c.email,
          smsEnabled: smsOn,
        });
      } else if (deal.sellerName) {
        built.push({ key: 'seller', name: deal.sellerName, role: 'Seller', email: '', phone: '', emailEnabled: false, smsEnabled: false });
      }
    }

    setRecipients(built);
    if (built.length > 0) setPreviewRecipientKey(built[0].key);
  }, [loadingSettings, config, targetMilestone, deal, contactRecords]);

  const toggleEmail = (key: string) =>
    setRecipients(prev => prev.map(r => r.key === key && r.email ? { ...r, emailEnabled: !r.emailEnabled } : r));

  const toggleSms = (key: string) =>
    setRecipients(prev => prev.map(r => r.key === key && r.phone ? { ...r, smsEnabled: !r.smsEnabled } : r));

  const toggleAll = (key: string, checked: boolean) =>
    setRecipients(prev => prev.map(r => r.key !== key ? r : { ...r, emailEnabled: checked && !!r.email, smsEnabled: checked && !!r.phone }));

  const isRowEnabled = (r: Recipient) => r.emailEnabled || r.smsEnabled;
  const notifyCount = recipients.filter(r => r.emailEnabled || r.smsEnabled).length;

  const previewRecipient = recipients.find(r => r.key === previewRecipientKey) || recipients[0];

  // Email preview: use config template if present, otherwise universal fallback
  const { subject: fallbackSubject, body: fallbackBody } = buildUniversalEmail(
    deal,
    previewRecipient?.name || 'Team Member',
    milestoneLabel,
    nextMilestoneLabel,
    nextDueDate,
  );
  const emailSubject = config?.email_subject
    ? fillMergeTags(config.email_subject, deal, previewRecipient?.name || '', milestoneLabel, nextMilestoneLabel, nextDueDate)
    : fallbackSubject;
  const emailBody = config?.email_body
    ? fillMergeTags(config.email_body, deal, previewRecipient?.name || '', milestoneLabel, nextMilestoneLabel, nextDueDate)
    : fallbackBody;

  const handleConfirm = async () => {
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      for (const r of recipients) {
        if (r.emailEnabled && r.email) {
          const { subject: rSubject, body: rBody } = buildUniversalEmail(deal, r.name, milestoneLabel, nextMilestoneLabel, nextDueDate);
          const subject = config?.email_subject
            ? fillMergeTags(config.email_subject, deal, r.name, milestoneLabel, nextMilestoneLabel, nextDueDate)
            : rSubject;
          const body = config?.email_body
            ? fillMergeTags(config.email_body, deal, r.name, milestoneLabel, nextMilestoneLabel, nextDueDate)
            : rBody;

          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
            },
            body: JSON.stringify({ to: [r.email], subject, body, dealId: deal.id }),
          });
        }

        if (r.smsEnabled && r.phone) {
          const smsText = `TC Update: ${deal.propertyAddress} has reached "${milestoneLabel}". Closing: ${formatDate(deal.closingDate)}. — TC Team`;
          await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
            },
            body: JSON.stringify({ to: r.phone, body: smsText }),
          });
        }
      }

      const notifiedNames = recipients.filter(r => r.emailEnabled || r.smsEnabled).map(r => r.name).join(', ');
      await supabase.from('audit_logs').insert({
        deal_id: deal.id,
        action: 'milestone_advanced',
        description: `Milestone advanced to "${milestoneLabel}" by ${userName}. Notified: ${notifiedNames || 'nobody'}`,
        performed_by: userName,
      });
    } catch (err) {
      console.error('Error sending notifications:', err);
      alert('Milestone advanced, but one or more notifications failed to send. Please check the contact emails/phones on file.');
    } finally {
      setSending(false);
      onConfirm(targetMilestone);
    }
  };

  return (
    <Modal isOpen={true} onClose={onCancel} size="md" noPadding className="!max-w-lg max-h-[90vh] flex flex-col border border-base-300">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 flex-none">
        <div>
          <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
            Advance Milestone
          </p>
          <h2 className="font-bold text-base text-base-content mt-0.5">
            → {milestoneLabel}
          </h2>
        </div>
        <button onClick={onCancel} className="btn btn-ghost btn-sm btn-square">
          <X size={16} />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
        {loadingSettings ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Tasks section */}
            {tasksToGenerate.length > 0 && (
              <div>
                <p className="text-xs font-bold text-base-content/60 uppercase tracking-wide mb-2">
                  Tasks to be generated ({tasksToGenerate.length})
                </p>
                <div className="space-y-1.5 rounded-xl bg-base-200 border border-base-300 p-3">
                  {tasksToGenerate.slice(0, 3).map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <StatusBadge status={t.priority} dot />
                      <span className="text-sm text-base-content truncate">{t.title}</span>
                      <span className="text-xs text-base-content/40 flex-none">{t.category}</span>
                    </div>
                  ))}
                  {tasksToGenerate.length > 3 && (
                    <p className="text-xs text-base-content/50 pt-1 pl-4">
                      + {tasksToGenerate.length - 3} more tasks
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Recipients section */}
            <div>
              <p className="text-xs font-bold text-base-content/60 uppercase tracking-wide mb-2">
                Who will be notified
              </p>
              {recipients.length === 0 ? (
                <div className="rounded-xl bg-base-200 border border-base-300 p-4 text-center">
                  <p className="text-sm text-base-content/50">No recipients configured for this milestone.</p>
                  <p className="text-xs text-base-content/40 mt-1">Configure in Settings → Milestones.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recipients.map(r => {
                    const enabled = isRowEnabled(r);
                    const hasNoInfo = !r.email && !r.phone;
                    return (
                      <div
                        key={r.key}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          enabled ? 'bg-base-200 border-base-300' : 'bg-base-100 border-base-200 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-primary flex-none"
                          checked={enabled}
                          onChange={e => toggleAll(r.key, e.target.checked)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-base-content truncate">{r.name}</p>
                          <p className="text-xs text-base-content/50">{r.role}</p>
                        </div>
                        {hasNoInfo && (
                          <div className="flex items-center gap-1 text-amber-500 flex-none">
                            <AlertTriangle size={13} />
                            <span className="text-xs">No contact info</span>
                          </div>
                        )}
                        <button
                          onClick={() => r.email && toggleEmail(r.key)}
                          title={r.email ? 'Toggle email notification' : 'No email on file'}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all flex-none ${
                            !r.email
                              ? 'opacity-50 cursor-not-allowed bg-base-200 border-base-300 text-base-content/30'
                              : r.emailEnabled
                              ? 'bg-primary text-primary-content border-primary'
                              : 'bg-base-100 border-base-300 text-base-content/50 hover:border-primary/40'
                          }`}
                        >
                          <Mail size={12} /> Email
                        </button>
                        <button
                          onClick={() => r.phone && toggleSms(r.key)}
                          title={r.phone ? 'Toggle SMS notification' : 'No phone on file'}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all flex-none ${
                            !r.phone
                              ? 'opacity-50 cursor-not-allowed bg-base-200 border-base-300 text-base-content/30'
                              : r.smsEnabled
                              ? 'bg-success text-success-content border-success'
                              : 'bg-base-100 border-base-300 text-base-content/50 hover:border-success/40'
                          }`}
                        >
                          <MessageSquare size={12} /> SMS
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Preview collapsible */}
            {recipients.length > 0 && (
              <div>
                <button
                  onClick={() => setPreviewOpen(v => !v)}
                  className="flex items-center justify-between w-full text-xs font-bold text-base-content/60 uppercase tracking-wide mb-2"
                >
                  <span>Preview message template</span>
                  {previewOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {previewOpen && (
                  <div className="rounded-xl bg-base-200 border border-base-300 p-4 space-y-3">
                    <div>
                      <label className="text-xs text-base-content/50 mb-1 block">Preview for:</label>
                      <select
                        className="select select-bordered select-sm w-full"
                        value={previewRecipientKey}
                        onChange={e => setPreviewRecipientKey(e.target.value)}
                      >
                        {recipients.map(r => (
                          <option key={r.key} value={r.key}>{r.name} ({r.role})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-base-content/60 mb-1 flex items-center gap-1">
                        <Mail size={11} /> Email
                      </p>
                      <p className="text-xs font-medium text-base-content bg-base-100 rounded-lg px-3 py-2 border border-base-300 mb-1">
                        Subject: {emailSubject}
                      </p>
                      <pre className="text-xs text-base-content/80 bg-base-100 rounded-lg px-3 py-2 border border-base-300 whitespace-pre-wrap font-sans">
                        {emailBody}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 px-6 py-4 border-t border-base-300 flex-none bg-base-200/50 rounded-b-2xl">
        <div>
          <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide block mb-1">
            Type your first name to confirm
          </label>
          <input
            type="text"
            className="input input-bordered input-sm w-full"
            placeholder={staffFirstName}
            value={confirmName}
            onChange={e => setConfirmName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && nameConfirmed && !sending && handleConfirm()}
            autoComplete="off"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <button onClick={onCancel} className="btn btn-sm btn-ghost gap-1.5">
            <X size={13} /> Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={sending || !nameConfirmed}
            className="btn btn-sm btn-primary gap-1.5"
          >
            {sending ? (
              <><Loader2 size={13} className="animate-spin" /> Sending...</>
            ) : (
              <><Check size={13} /> Confirm &amp; Advance{notifyCount > 0 ? ` · Notify ${notifyCount}` : ''}</>
            )}
          </button>
        </div>
      </div>
      <PageIdBadge pageId={PAGE_IDS.MILESTONE_ADVANCE} context={deal.id.slice(0, 8)} />
    </Modal>
  );
};
