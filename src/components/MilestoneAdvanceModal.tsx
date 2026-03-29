import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, MessageSquare, ChevronDown, ChevronUp, Loader2, Check, AlertTriangle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { Deal, DealMilestone, ContactRecord, MilestoneNotificationSetting } from '../types';
import { MILESTONE_LABELS, generateTasksForMilestone } from '../utils/taskTemplates';
import { generateId } from '../utils/helpers';
import { PageIdBadge } from './PageIdBadge';
import { StatusBadge } from './ui/StatusBadge';
import { PAGE_IDS } from '../utils/pageTracking';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Props {
  deal: Deal;
  targetMilestone: DealMilestone;
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

function fillMergeTags(
  template: string,
  deal: Deal,
  recipientName: string,
  tcName: string,
): string {
  return template
    .replace(/\{\{recipient_name\}\}/g, recipientName)
    .replace(/\{\{property_address\}\}/g, deal.propertyAddress || '')
    .replace(/\{\{closing_date\}\}/g, deal.closingDate || '')
    .replace(/\{\{tc_name\}\}/g, tcName);
}

export const MilestoneAdvanceModal: React.FC<Props> = ({
  deal,
  targetMilestone,
  contactRecords,
  userName,
  onConfirm,
  onCancel,
}) => {
  const [settings, setSettings] = useState<MilestoneNotificationSetting | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRecipientKey, setPreviewRecipientKey] = useState<string>('');
  const [sending, setSending] = useState(false);
  const focusedFieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const tasksToGenerate = generateTasksForMilestone(targetMilestone);

  useEffect(() => {
    const loadSettings = async () => {
      setLoadingSettings(true);
      const { data } = await supabase
        .from('milestone_notification_settings')
        .select('*')
        .eq('milestone', targetMilestone)
        .single();

      const s: MilestoneNotificationSetting | null = data
        ? {
            id: data.id,
            milestone: data.milestone,
            notifyBuyerAgent: data.notify_buyer_agent ?? true,
            notifySellerAgent: data.notify_seller_agent ?? true,
            notifyLender: data.notify_lender ?? false,
            notifyTitle: data.notify_title ?? false,
            notifyBuyer: data.notify_buyer ?? false,
            notifySeller: data.notify_seller ?? false,
            sendEmail: data.send_email ?? true,
            sendSms: data.send_sms ?? false,
            emailSubject: data.email_subject,
            emailBody: data.email_body,
            smsBody: data.sms_body,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          }
        : null;

      setSettings(s);

      // Build recipients list
      const built: Recipient[] = [];

      const defaultEmailEnabled = s?.sendEmail ?? true;
      const defaultSmsEnabled = s?.sendSms ?? false;

      // Buyer Agent
      if ((s?.notifyBuyerAgent ?? true) && deal.buyerAgent?.name) {
        const ba = deal.buyerAgent;
        built.push({
          key: 'buyer-agent',
          name: ba.name || 'Buyer Agent',
          role: 'Buyer Agent',
          email: ba.email || '',
          phone: ba.phone || '',
          emailEnabled: defaultEmailEnabled && !!ba.email,
          smsEnabled: defaultSmsEnabled && !!ba.phone,
        });
      }

      // Seller Agent
      if ((s?.notifySellerAgent ?? true) && deal.sellerAgent?.name) {
        const sa = deal.sellerAgent;
        built.push({
          key: 'seller-agent',
          name: sa.name || 'Seller Agent',
          role: 'Seller Agent',
          email: sa.email || '',
          phone: sa.phone || '',
          emailEnabled: defaultEmailEnabled && !!sa.email,
          smsEnabled: defaultSmsEnabled && !!sa.phone,
        });
      }

      // Lender
      if (s?.notifyLender ?? false) {
        const lenderRecord = contactRecords.find(
          c => c.contactType === 'lender' ||
            (deal.loanOfficerName && c.fullName === deal.loanOfficerName)
        );
        if (lenderRecord) {
          built.push({
            key: 'lender',
            name: lenderRecord.fullName,
            role: 'Lender',
            email: lenderRecord.email || '',
            phone: lenderRecord.phone || '',
            emailEnabled: defaultEmailEnabled && !!lenderRecord.email,
            smsEnabled: defaultSmsEnabled && !!lenderRecord.phone,
          });
        } else if (deal.loanOfficerName) {
          built.push({
            key: 'lender',
            name: deal.loanOfficerName,
            role: 'Lender',
            email: '',
            phone: '',
            emailEnabled: false,
            smsEnabled: false,
          });
        }
      }

      // Title
      if (s?.notifyTitle ?? false) {
        const titleRecord = contactRecords.find(
          c => c.contactType === 'title' ||
            (deal.titleCompanyName && c.company === deal.titleCompanyName)
        );
        if (titleRecord) {
          built.push({
            key: 'title',
            name: titleRecord.fullName,
            role: 'Title',
            email: titleRecord.email || '',
            phone: titleRecord.phone || '',
            emailEnabled: defaultEmailEnabled && !!titleRecord.email,
            smsEnabled: defaultSmsEnabled && !!titleRecord.phone,
          });
        } else if (deal.titleCompanyName) {
          built.push({
            key: 'title',
            name: deal.titleCompanyName,
            role: 'Title Company',
            email: '',
            phone: '',
            emailEnabled: false,
            smsEnabled: false,
          });
        }
      }

      // Buyer
      if (s?.notifyBuyer ?? false) {
        const buyerContact = deal.contacts?.find(c => c.role === 'buyer');
        if (buyerContact) {
          built.push({
            key: 'buyer',
            name: buyerContact.name || deal.buyerName || 'Buyer',
            role: 'Buyer',
            email: buyerContact.email || '',
            phone: buyerContact.phone || '',
            emailEnabled: defaultEmailEnabled && !!buyerContact.email,
            smsEnabled: defaultSmsEnabled && !!buyerContact.phone,
          });
        } else if (deal.buyerName) {
          built.push({
            key: 'buyer',
            name: deal.buyerName,
            role: 'Buyer',
            email: '',
            phone: '',
            emailEnabled: false,
            smsEnabled: false,
          });
        }
      }

      // Seller
      if (s?.notifySeller ?? false) {
        const sellerContact = deal.contacts?.find(c => c.role === 'seller');
        if (sellerContact) {
          built.push({
            key: 'seller',
            name: sellerContact.name || deal.sellerName || 'Seller',
            role: 'Seller',
            email: sellerContact.email || '',
            phone: sellerContact.phone || '',
            emailEnabled: defaultEmailEnabled && !!sellerContact.email,
            smsEnabled: defaultSmsEnabled && !!sellerContact.phone,
          });
        } else if (deal.sellerName) {
          built.push({
            key: 'seller',
            name: deal.sellerName,
            role: 'Seller',
            email: '',
            phone: '',
            emailEnabled: false,
            smsEnabled: false,
          });
        }
      }

      setRecipients(built);
      if (built.length > 0) setPreviewRecipientKey(built[0].key);
      setLoadingSettings(false);
    };

    loadSettings();
  }, [targetMilestone, deal, contactRecords]);

  const toggleEmail = (key: string) => {
    setRecipients(prev =>
      prev.map(r => r.key === key && r.email ? { ...r, emailEnabled: !r.emailEnabled } : r)
    );
  };

  const toggleSms = (key: string) => {
    setRecipients(prev =>
      prev.map(r => r.key === key && r.phone ? { ...r, smsEnabled: !r.smsEnabled } : r)
    );
  };

  const toggleAll = (key: string, checked: boolean) => {
    setRecipients(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        return {
          ...r,
          emailEnabled: checked && !!r.email,
          smsEnabled: checked && !!r.phone,
        };
      })
    );
  };

  const isRowEnabled = (r: Recipient) => r.emailEnabled || r.smsEnabled;
  const notifyCount = recipients.filter(r => r.emailEnabled || r.smsEnabled).length;

  const previewRecipient = recipients.find(r => r.key === previewRecipientKey) || recipients[0];
  const emailSubject = settings?.emailSubject
    ? fillMergeTags(settings.emailSubject, deal, previewRecipient?.name || '', userName)
    : `Milestone Update: ${MILESTONE_LABELS[targetMilestone]} — ${deal.propertyAddress}`;
  const emailBody = settings?.emailBody
    ? fillMergeTags(settings.emailBody, deal, previewRecipient?.name || '', userName)
    : `Dear ${previewRecipient?.name || 'Team Member'},\n\nThis is to notify you that the transaction at ${deal.propertyAddress} has advanced to the "${MILESTONE_LABELS[targetMilestone]}" milestone.\n\nClosing Date: ${deal.closingDate || 'TBD'}\n\nBest regards,\n${userName}`;
  const smsBody = settings?.smsBody
    ? fillMergeTags(settings.smsBody, deal, previewRecipient?.name || '', userName)
    : `TC Update: ${deal.propertyAddress} has reached "${MILESTONE_LABELS[targetMilestone]}". Closing: ${deal.closingDate || 'TBD'}. — ${userName}`;

  const handleConfirm = async () => {
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      for (const r of recipients) {
        if (r.emailEnabled && r.email) {
          const subject = settings?.emailSubject
            ? fillMergeTags(settings.emailSubject, deal, r.name, userName)
            : `Milestone Update: ${MILESTONE_LABELS[targetMilestone]} — ${deal.propertyAddress}`;
          const body = settings?.emailBody
            ? fillMergeTags(settings.emailBody, deal, r.name, userName)
            : `Dear ${r.name},\n\nThis is to notify you that the transaction at ${deal.propertyAddress} has advanced to the "${MILESTONE_LABELS[targetMilestone]}" milestone.\n\nClosing Date: ${deal.closingDate || 'TBD'}\n\nBest regards,\n${userName}`;

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
          const smsText = settings?.smsBody
            ? fillMergeTags(settings.smsBody, deal, r.name, userName)
            : `TC Update: ${deal.propertyAddress} has reached "${MILESTONE_LABELS[targetMilestone]}". Closing: ${deal.closingDate || 'TBD'}. — ${userName}`;

          await fetch('/api/sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: r.phone, body: smsText, dealId: deal.id }),
          });
        }
      }

      const notifiedNames = recipients
        .filter(r => r.emailEnabled || r.smsEnabled)
        .map(r => r.name)
        .join(', ');

      await supabase.from('audit_logs').insert({
        deal_id: deal.id,
        action: 'milestone_advanced',
        description: `Milestone advanced to "${MILESTONE_LABELS[targetMilestone]}" by ${userName}. Notified: ${notifiedNames || 'nobody'}`,
        performed_by: userName,
      });
    } catch (err) {
      console.error('Error sending notifications:', err);
    } finally {
      setSending(false);
      onConfirm(targetMilestone);
    }
  };


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-base-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 flex-none">
          <div>
            <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
              Advance Milestone
            </p>
            <h2 className="font-bold text-base text-base-content mt-0.5">
              → {MILESTONE_LABELS[targetMilestone]}
            </h2>
          </div>
          <button onClick={onCancel} className="btn btn-ghost btn-sm btn-square">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {loadingSettings ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
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
                    <p className="text-sm text-base-content/50">
                      No recipients configured for this milestone.
                    </p>
                    <p className="text-xs text-base-content/40 mt-1">
                      Configure in Settings → Milestones.
                    </p>
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
                            enabled
                              ? 'bg-base-200 border-base-300'
                              : 'bg-base-100 border-base-200 opacity-60'
                          }`}
                        >
                          {/* Master toggle */}
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm checkbox-primary flex-none"
                            checked={enabled}
                            onChange={e => toggleAll(r.key, e.target.checked)}
                          />

                          {/* Name + role */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-base-content truncate">
                              {r.name}
                            </p>
                            <p className="text-xs text-base-content/50">{r.role}</p>
                          </div>

                          {/* No contact info warning */}
                          {hasNoInfo && (
                            <div className="flex items-center gap-1 text-amber-500 flex-none">
                              <AlertTriangle size={13} />
                              <span className="text-xs">No contact info</span>
                            </div>
                          )}

                          {/* Email button */}
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

                          {/* SMS button */}
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
                      {/* Recipient selector */}
                      <div>
                        <label className="text-xs text-base-content/50 mb-1 block">
                          Preview for:
                        </label>
                        <select
                          className="select select-bordered select-sm w-full"
                          value={previewRecipientKey}
                          onChange={e => setPreviewRecipientKey(e.target.value)}
                        >
                          {recipients.map(r => (
                            <option key={r.key} value={r.key}>
                              {r.name} ({r.role})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Email preview */}
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

                      {/* SMS preview */}
                      {(settings?.sendSms || recipients.some(r => r.smsEnabled)) && (
                        <div>
                          <p className="text-xs font-semibold text-base-content/60 mb-1 flex items-center gap-1">
                            <MessageSquare size={11} /> SMS
                          </p>
                          <pre className="text-xs text-base-content/80 bg-base-100 rounded-lg px-3 py-2 border border-base-300 whitespace-pre-wrap font-sans">
                            {smsBody}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-base-300 flex-none bg-base-200/50 rounded-b-2xl">
          <button onClick={onCancel} className="btn btn-sm btn-ghost gap-1.5">
            <X size={13} /> Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={sending}
            className="btn btn-sm btn-primary gap-1.5"
          >
            {sending ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Sending...
              </>
            ) : (
              <>
                <Check size={13} />
                Confirm &amp; Advance{notifyCount > 0 ? ` · Notify ${notifyCount}` : ''}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Page ID Badge */}
      <PageIdBadge pageId={PAGE_IDS.MILESTONE_ADVANCE} context={deal.id.slice(0, 8)} />
    </div>
  );
};
