import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail,
  Send,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  History,
  Eye,
  Calendar,
  Globe,
} from 'lucide-react';
import type {
  Deal,
  EmailTemplate,
  ComplianceTemplate,
  ConfirmationButton,
  EmailSendLogEntry,
} from '../types';
import { roleLabel, formatDate, formatCurrency, formatPhone } from '../utils/helpers';
import { MILESTONE_LABELS } from '../utils/taskTemplates';
import {
  loadEmailSendLog,
  logEmailSend,
  createScheduledEmail,
} from '../utils/supabaseDb';

// ── Merge-tag helpers (from WorkspaceEmailTemplate) ─────────────────────────

// Add N business days to a date string (skips Sat/Sun)
function addBusinessDays(dateStr: string, days: number): string {
  if (!dateStr || !days) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// Replace {{merge}} tags in a string with deal data
function populateTemplate(text: string, deal: Deal, complianceTemplates?: ComplianceTemplate[]): string {
  const milestone = MILESTONE_LABELS[deal.milestone] ?? 'In Progress';

  const agentLines: string[] = [];
  if (deal.buyerAgent?.name) agentLines.push(`  Buyer Agent:  ${deal.buyerAgent.name}${deal.buyerAgent.phone ? ` | ${formatPhone(deal.buyerAgent.phone)}` : ''}${deal.buyerAgent.email ? ` | ${deal.buyerAgent.email}` : ''}${deal.buyerAgent.isOurClient ? ' ★ Our Client' : ''}`);
  if (deal.sellerAgent?.name) agentLines.push(`  Seller Agent: ${deal.sellerAgent.name}${deal.sellerAgent.phone ? ` | ${formatPhone(deal.sellerAgent.phone)}` : ''}${deal.sellerAgent.email ? ` | ${deal.sellerAgent.email}` : ''}${deal.sellerAgent.isOurClient ? ' ★ Our Client' : ''}`);
  const agentsText = agentLines.join('\n') || '  (No agents added yet)';

  const contactLines = deal.contacts
    .map(c => `  • ${c.name}${c.company ? ` (${c.company})` : ''} — ${roleLabel(c.role)}${c.email ? `: ${c.email}` : ''}${c.phone ? ` | ${formatPhone(c.phone)}` : ''}`)
    .join('\n') || '  (No contacts added yet)';

  const pendingDocs = deal.documentRequests.filter(d => d.status !== 'confirmed');
  const pendingText = pendingDocs.length > 0
    ? pendingDocs.map(d => `  • ${d.label} — ${d.status.toUpperCase()}`).join('\n')
    : '  • No pending documents at this time.';

  const reminderLines = deal.reminders.filter(r => !r.completed)
    .map(r => `  • ${r.title} — ${formatDate(r.dueDate)}`)
    .join('\n') || '  • No upcoming reminders at this time.';

  // Build Sellers Side block
  const sellers = deal.contacts.filter(c => c.role === 'seller');
  const sellerAttorneys = deal.contacts.filter(c => c.role === 'attorney' && deal.transactionType === 'seller');
  const allAttorneys = deal.contacts.filter(c => c.role === 'attorney');
  const sellerLines: string[] = ['Sellers Side', ''];
  if (sellers.length > 0) sellers.forEach(c => sellerLines.push(`  •   Sellers - ${c.name}${c.email ? `  ${c.email}` : ''}`));
  else sellerLines.push('  •   Sellers - [Seller Name]');
  if (deal.sellerAgent?.name) sellerLines.push(`  •   Sellers Agent - ${deal.sellerAgent.name}${deal.sellerAgent.phone ? `  ${formatPhone(deal.sellerAgent.phone)}` : ''}${deal.sellerAgent.email ? `  ${deal.sellerAgent.email}` : ''}`);
  else sellerLines.push('  •   Sellers Agent - [Seller Agent Name]');
  const sAtty = sellerAttorneys.length > 0 ? sellerAttorneys : (deal.transactionType !== 'buyer' ? allAttorneys.slice(0, 1) : []);
  if (sAtty.length > 0) sAtty.forEach(a => sellerLines.push(`  •   Sellers Attorney - ${a.name}${a.email ? `  ${a.email}` : ''}${a.phone ? `  ${formatPhone(a.phone)}` : ''}`));
  else sellerLines.push('  •   Sellers Attorney - [Attorney Name]');
  const sellersSide = sellerLines.join('\n');

  // Build Buyers Side block
  const buyers = deal.contacts.filter(c => c.role === 'buyer');
  const buyerLines: string[] = ['Buyers Side', ''];
  if (buyers.length > 0) buyers.forEach(c => buyerLines.push(`  •   Buyers - ${c.name}${c.email ? `  ${c.email}` : ''}`));
  else buyerLines.push('  •   Buyers - [Buyer Name]');
  if (deal.buyerAgent?.name) buyerLines.push(`  •   Buyers Agent - ${deal.buyerAgent.name}${deal.buyerAgent.phone ? `  ${formatPhone(deal.buyerAgent.phone)}` : ''}${deal.buyerAgent.email ? `  ${deal.buyerAgent.email}` : ''}`);
  else buyerLines.push('  •   Buyers Agent - [Buyer Agent Name]');
  const bAtty = deal.transactionType === 'buyer' ? allAttorneys.slice(0, 1) : allAttorneys.slice(1, 2);
  const fallbackAtty = bAtty.length > 0 ? bAtty : (allAttorneys.length > 0 && sAtty.length === 0 ? allAttorneys.slice(0, 1) : []);
  if (fallbackAtty.length > 0) fallbackAtty.forEach(a => buyerLines.push(`  •   Buyers Attorney - ${a.name}${a.email ? `  ${a.email}` : ''}${a.phone ? `  ${formatPhone(a.phone)}` : ''}`));
  else buyerLines.push('  •   Buyers Attorney - [Attorney Name]');
  const buyersSide = buyerLines.join('\n');

  // Inspection deadline: contractDate + inspectionPeriodDays from compliance template
  const complianceTpl = (complianceTemplates ?? []).find((t) =>
    (t.agentClientIds ?? (t.agentClientId ? [t.agentClientId] : [])).includes(deal.agentClientId ?? '')
  );
  const inspDays: number = complianceTpl?.inspectionPeriodDays ?? 0;
  const inspDeadline = inspDays && deal.contractDate
    ? addBusinessDays(deal.contractDate, inspDays)
    : '';
  const inspDeadlineText = inspDeadline
    ? `${inspDeadline} (${inspDays} business day${inspDays !== 1 ? 's' : ''} from contract)`
    : inspDays
      ? `[Add contract date to calculate — ${inspDays} business days]`
      : '[Set inspection period in Compliance template]';

  return text
    .replace(/\{\{address\}\}/g, deal.propertyAddress)
    .replace(/\{\{city\}\}/g, deal.city)
    .replace(/\{\{state\}\}/g, deal.state)
    .replace(/\{\{zipCode\}\}/g, deal.zipCode)
    .replace(/\{\{mlsNumber\}\}/g, deal.mlsNumber || '—')
    .replace(/\{\{contractPrice\}\}/g, formatCurrency(deal.contractPrice))
    .replace(/\{\{listPrice\}\}/g, formatCurrency(deal.listPrice))
    .replace(/\{\{contractDate\}\}/g, formatDate(deal.contractDate))
    .replace(/\{\{closingDate\}\}/g, formatDate(deal.closingDate))
    .replace(/\{\{inspectionDeadline\}\}/g, inspDeadlineText)
    .replace(/\{\{inspectionPeriodDays\}\}/g, inspDays ? `${inspDays} business days` : '[Not set]')
    .replace(/\{\{milestone\}\}/g, milestone)
    .replace(/\{\{agents\}\}/g, agentsText)
    .replace(/\{\{contacts\}\}/g, contactLines)
    .replace(/\{\{pendingDocs\}\}/g, pendingText)
    .replace(/\{\{reminders\}\}/g, reminderLines)
    .replace(/\{\{sellersSide\}\}/g, sellersSide)
    .replace(/\{\{buyersSide\}\}/g, buyersSide);
}

// ── Email chip input ────────────────────────────────────────────────────────

function EmailChipInput({
  label,
  emails,
  onChange,
  placeholder,
}: {
  label: string;
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState('');

  const addEmail = (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (email && email.includes('@') && !emails.includes(email)) {
      onChange([...emails, email]);
    }
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && emails.length) {
      onChange(emails.slice(0, -1));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const pasted = text.split(/[,;\s]+/).filter(Boolean);
    const unique = [...new Set([...emails, ...pasted.map((s) => s.trim().toLowerCase())])].filter(
      (s) => s.includes('@')
    );
    onChange(unique);
    setInputValue('');
  };

  return (
    <div className="flex items-start gap-2">
      <span className="text-xs font-medium text-gray-500 mt-2.5 w-8 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1 flex-1 border border-gray-200 rounded-lg px-2 py-1.5 min-h-[38px] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 bg-white">
        {emails.map((email) => (
          <span
            key={email}
            className="badge badge-sm gap-1 bg-gray-100 text-gray-700 border-gray-200"
          >
            {email}
            <button
              type="button"
              onClick={() => onChange(emails.filter((e) => e !== email))}
              className="hover:text-red-500"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => inputValue && addEmail(inputValue)}
          placeholder={emails.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
        />
      </div>
    </div>
  );
}

// ── Schedule Modal ──────────────────────────────────────────────────────────

function ScheduleModal({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (scheduledAt: string) => void;
  loading: boolean;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const [date, setDate] = useState(tomorrow.toISOString().slice(0, 10));
  const [time, setTime] = useState('09:00');

  const scheduledDate = new Date(`${date}T${time}:00`);
  const isPast = scheduledDate <= new Date();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-lg font-semibold text-black mb-4 flex items-center gap-2">
          <Calendar size={20} />
          Schedule Email
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Date</label>
            <input
              type="date"
              className="input input-bordered w-full text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Time</label>
            <input
              type="time"
              className="input input-bordered w-full text-sm"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-600">
              Will send on{' '}
              <span className="font-medium text-black">
                {scheduledDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                at{' '}
                {scheduledDate.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </p>
            {isPast && (
              <p className="text-xs text-red-500 mt-1">
                Selected time is in the past — please choose a future time.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            className="btn btn-sm btn-ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onConfirm(scheduledDate.toISOString())}
            disabled={isPast || loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
            Schedule Email
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sent History ────────────────────────────────────────────────────────────

function SentHistory({ dealId }: { dealId: string }) {
  const [entries, setEntries] = useState<EmailSendLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    loadEmailSendLog({ dealId, limit: 20 })
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [dealId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading sent history…
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 mt-4 pt-3">
      <button
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-black w-full"
        onClick={() => setExpanded(!expanded)}
      >
        <History size={15} />
        Sent History ({entries.length})
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {entries.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">
              No emails sent for this deal yet.
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="border border-gray-100 rounded-lg p-2.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.templateName && (
                        <span className="badge badge-xs bg-primary/10 text-primary border-0">
                          {entry.templateName}
                        </span>
                      )}
                      <span className="text-sm font-medium text-black truncate">
                        {entry.subject}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      To: {entry.toAddresses.join(', ')}
                      {entry.sentBy && <> · Sent by {entry.sentBy}</>}
                      {' · '}
                      {new Date(entry.sentAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <button
                    className="btn btn-xs btn-ghost text-gray-400"
                    onClick={() => setPreviewId(previewId === entry.id ? null : entry.id)}
                    title="Preview body"
                  >
                    <Eye size={13} />
                  </button>
                </div>

                {previewId === entry.id && (
                  <div className="mt-2 border border-gray-100 rounded bg-white">
                    <iframe
                      srcDoc={entry.bodyHtml}
                      sandbox=""
                      title="Email preview"
                      className="w-full h-48 rounded"
                      style={{ border: 'none' }}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface Props {
  deal: Deal;
  emailTemplates: EmailTemplate[];
  complianceTemplates?: ComplianceTemplate[];
  currentUser?: string;
}

export default function WorkspaceEmailCompose({
  deal,
  emailTemplates,
  complianceTemplates,
  currentUser,
}: Props) {
  // Template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showComplianceTemplates, setShowComplianceTemplates] = useState(false);

  // Compose fields
  const [toAddresses, setToAddresses] = useState<string[]>([]);
  const [ccAddresses, setCcAddresses] = useState<string[]>([]);
  const [bccAddresses, setBccAddresses] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});

  // Sending state
  const [sending, setSending] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [showSpanishPreview, setShowSpanishPreview] = useState(false);
  const [spanishSubject, setSpanishSubject] = useState('');
  const [spanishBody, setSpanishBody] = useState('');
  const [sendingSpanish, setSendingSpanish] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Track refreshes for sent history
  const [historyKey, setHistoryKey] = useState(0);

  const selectedTemplate = emailTemplates.find((t) => t.id === selectedTemplateId);

  // Pre-fill recipients from deal contacts on notification list
  useEffect(() => {
    const notifyContacts = (deal.contacts || []).filter((c) => c.inNotificationList);
    const emails = notifyContacts.map((c) => c.email).filter(Boolean) as string[];
    setToAddresses(emails);
  }, [deal.id]);

  // Populate template when selected
  const handleSelectTemplate = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      const tpl = emailTemplates.find((t) => t.id === templateId);
      if (tpl) {
        setSubject(populateTemplate(tpl.subject, deal, complianceTemplates));
        setBodyText(populateTemplate(tpl.body, deal, complianceTemplates));
        // Handle confirmation buttons
        if (tpl.buttons && tpl.buttons.length > 0) {
          const c: Record<string, boolean> = {};
          tpl.buttons.forEach((btn: ConfirmationButton) => {
            c[btn.label] = false;
          });
          setConfirmations(c);
        } else {
          setConfirmations({});
        }
      }
    },
    [emailTemplates, deal]
  );

  const handleSelectComplianceTemplate = useCallback(
    (tpl: ComplianceTemplate) => {
      setSelectedTemplateId('');
      setSubject(populateTemplate(tpl.name || '', deal, complianceTemplates));
      setBodyText(populateTemplate(tpl.description || '', deal, complianceTemplates));
      setConfirmations({});
    },
    [deal]
  );

  // Build final HTML body with branding
  const buildBodyHtml = (overrideBody?: string): string => {
    const escapedBody = (overrideBody ?? bodyText)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <div style="max-width:600px;margin:20px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#2563eb;padding:16px 24px;">
      <img src="https://myredeal.com/logo-white.png" alt="MyReDeal.com" style="height:28px;" />
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.6;color:#333;">
      ${escapedBody}
    </div>
    <div style="border-top:1px solid #eee;padding:16px 24px;text-align:center;font-size:11px;color:#999;">
      Sent via <a href="https://myredeal.com" style="color:#2563eb;text-decoration:none;">MyReDeal.com</a> — Transaction Coordination Platform
    </div>
  </div>
</body>
</html>`.trim();
  };

  // Show toast
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Validate before send
  const validate = (): string | null => {
    if (toAddresses.length === 0) return 'Please add at least one recipient.';
    if (!subject.trim()) return 'Subject is required.';
    if (!bodyText.trim()) return 'Email body is empty.';
    // Check confirmations
    const unconfirmed = Object.entries(confirmations).filter(([, v]) => !v);
    if (unconfirmed.length > 0) return 'Please check all confirmation items before sending.';
    return null;
  };

  // Preview in Spanish
  const handlePreviewSpanish = async () => {
    const err = validate();
    if (err) { showToast('error', err); return; }
    setTranslating(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/translate-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ texts: [subject, bodyText], targetLang: 'es' }),
      });
      if (!res.ok) throw new Error('Translation failed');
      const data = await res.json();
      setSpanishSubject(data.translations?.[0] || subject);
      setSpanishBody(data.translations?.[1] || bodyText);
      setShowSpanishPreview(true);
    } catch (error: any) {
      showToast('error', 'Translation failed. Please try again.');
    } finally {
      setTranslating(false);
    }
  };

  // Send Spanish Version
  const handleSendSpanish = async () => {
    setSendingSpanish(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const bodyHtml = buildBodyHtml(spanishBody);
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({
          to: toAddresses, cc: ccAddresses, bcc: bccAddresses,
          subject: spanishSubject, bodyHtml,
          dealId: deal.id,
          templateId: selectedTemplate?.id,
          templateName: selectedTemplate?.name,
          sentBy: currentUser,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Send failed (${res.status})`); }
      await res.json();
      showToast('success', 'Spanish email sent successfully!');
      setShowSpanishPreview(false);
      setHistoryKey(k => k + 1);
      setSubject(''); setBodyText(''); setSelectedTemplateId(''); setConfirmations({});
    } catch (error: any) {
      showToast('error', error.message || 'Failed to send Spanish email.');
    } finally {
      setSendingSpanish(false);
    }
  };

  // Send Now
  const handleSendNow = async () => {
    const err = validate();
    if (err) {
      showToast('error', err);
      return;
    }

    setSending(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const bodyHtml = buildBodyHtml();

      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          to: toAddresses,
          cc: ccAddresses,
          bcc: bccAddresses,
          subject,
          bodyHtml,
          dealId: deal.id,
          templateId: selectedTemplate?.id,
          templateName: selectedTemplate?.name,
          sentBy: currentUser,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Send failed (${res.status})`);
      }

      const data = await res.json();

      // Log locally
      await logEmailSend({
        dealId: deal.id,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name,
        toAddresses,
        ccAddresses,
        subject,
        bodyHtml,
        gmailMessageId: data.messageId,
        gmailThreadId: data.threadId,
        emailType: 'deal',
        sentBy: currentUser,
      });

      showToast('success', 'Email sent successfully!');
      setHistoryKey((k) => k + 1);

      // Reset compose
      setSubject('');
      setBodyText('');
      setSelectedTemplateId('');
      setConfirmations({});
    } catch (error: any) {
      console.error('Send email error:', error);
      showToast('error', error.message || 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  // Schedule
  const handleSchedule = async (scheduledAt: string) => {
    const err = validate();
    if (err) {
      showToast('error', err);
      return;
    }

    setScheduling(true);
    try {
      const bodyHtml = buildBodyHtml();
      await createScheduledEmail({
        dealId: deal.id,
        templateId: selectedTemplate?.id,
        toAddresses,
        ccAddresses,
        bccAddresses,
        subject,
        bodyHtml,
        scheduledAt,
        emailType: 'deal',
        createdBy: currentUser,
      });

      showToast('success', `Email scheduled for ${new Date(scheduledAt).toLocaleString()}`);
      setShowScheduleModal(false);

      // Reset compose
      setSubject('');
      setBodyText('');
      setSelectedTemplateId('');
      setConfirmations({});
    } catch (error: any) {
      console.error('Schedule email error:', error);
      showToast('error', error.message || 'Failed to schedule email.');
    } finally {
      setScheduling(false);
    }
  };

  // All templates grouped
  const templateCategories = emailTemplates.reduce<Record<string, EmailTemplate[]>>((acc, t) => {
    const cat = t.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <div className="flex gap-4 h-full">
      {/* ── Left Panel: Template Picker ─────────────────────────────── */}
      <div className="w-64 shrink-0 border-r border-gray-100 pr-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
          <FileText size={15} />
          Templates
        </h3>

        {Object.entries(templateCategories).map(([category, templates]) => (
          <div key={category} className="mb-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              {category}
            </p>
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => handleSelectTemplate(tpl.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedTemplateId === tpl.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tpl.name}
              </button>
            ))}
          </div>
        ))}

        {complianceTemplates && complianceTemplates.length > 0 && (
          <div className="mt-2">
            <button
              className="flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 hover:text-gray-600"
              onClick={() => setShowComplianceTemplates(!showComplianceTemplates)}
            >
              Compliance
              {showComplianceTemplates ? (
                <ChevronUp size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
            </button>
            {showComplianceTemplates &&
              complianceTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleSelectComplianceTemplate(tpl)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {tpl.name}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* ── Right Panel: Compose + History ──────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Recipients */}
        <div className="space-y-2 mb-4">
          <EmailChipInput
            label="To"
            emails={toAddresses}
            onChange={setToAddresses}
            placeholder="Add recipient email…"
          />

          {!showCcBcc ? (
            <button
              className="text-xs text-primary hover:underline ml-10"
              onClick={() => setShowCcBcc(true)}
            >
              + CC / BCC
            </button>
          ) : (
            <>
              <EmailChipInput
                label="CC"
                emails={ccAddresses}
                onChange={setCcAddresses}
                placeholder="CC…"
              />
              <EmailChipInput
                label="BCC"
                emails={bccAddresses}
                onChange={setBccAddresses}
                placeholder="BCC…"
              />
            </>
          )}
        </div>

        {/* Subject */}
        <div className="mb-3">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="input input-bordered w-full text-sm font-medium"
          />
        </div>

        {/* Body */}
        <div className="mb-3">
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder="Compose your email…"
            rows={12}
            className="textarea textarea-bordered w-full text-sm leading-relaxed resize-y"
          />
        </div>

        {/* Confirmations */}
        {Object.keys(confirmations).length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <p className="text-xs font-semibold text-amber-700 mb-2">
              Confirm before sending:
            </p>
            {Object.entries(confirmations).map(([item, checked]) => (
              <label
                key={item}
                className="flex items-center gap-2 text-sm text-amber-800 cursor-pointer mb-1"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-warning"
                  checked={checked}
                  onChange={(e) =>
                    setConfirmations((prev) => ({
                      ...prev,
                      [item]: e.target.checked,
                    }))
                  }
                />
                {item}
              </label>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mb-2">
          <button
            className="btn btn-primary btn-sm gap-1.5"
            onClick={handleSendNow}
            disabled={sending || scheduling}
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Send Now
          </button>

          <button
            className="btn btn-outline btn-sm gap-1.5"
            onClick={() => setShowScheduleModal(true)}
            disabled={sending || scheduling}
          >
            <Clock size={14} />
            Schedule
          </button>

          <button
            className="btn btn-ghost btn-sm gap-1.5 text-info"
            onClick={handlePreviewSpanish}
            disabled={sending || scheduling || translating}
            title="Preview translation in Spanish"
          >
            {translating ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
            {translating ? 'Translating...' : 'Preview in Español'}
          </button>

          <div className="flex-1" />

          <span className="text-xs text-gray-400">
            {toAddresses.length} recipient{toAddresses.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Spanish Preview Panel */}
        {showSpanishPreview && (
          <div className="mt-3 rounded-xl border-2 border-info/40 bg-info/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-info" />
                <span className="text-sm font-semibold text-info">Spanish Translation Preview</span>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowSpanishPreview(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="mb-2">
              <p className="text-xs text-base-content/50 mb-1 uppercase tracking-wide font-medium">Subject</p>
              <p className="text-sm font-medium bg-base-100 rounded px-3 py-2 border border-base-300">{spanishSubject}</p>
            </div>
            <div className="mb-3">
              <p className="text-xs text-base-content/50 mb-1 uppercase tracking-wide font-medium">Body</p>
              <pre className="text-sm bg-base-100 rounded px-3 py-2 border border-base-300 whitespace-pre-wrap font-sans">{spanishBody}</pre>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-info btn-sm gap-1.5"
                onClick={handleSendSpanish}
                disabled={sendingSpanish}
              >
                {sendingSpanish ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send Spanish Version
              </button>
              <span className="text-xs text-base-content/50">Sends the translated version to {toAddresses.length} recipient{toAddresses.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {/* Sent History */}
        <SentHistory key={historyKey} dealId={deal.id} />
      </div>

      {/* ── Schedule Modal ──────────────────────────────────────────── */}
      <ScheduleModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onConfirm={handleSchedule}
        loading={scheduling}
      />

      {/* ── Toast ───────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
