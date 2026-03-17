import React, { useState, useRef, useEffect } from 'react';
import { Mail, Copy, CheckCircle2, Send, User, MessageSquare, Reply, Check } from 'lucide-react';
import { Deal, ComplianceTemplate, EmailTemplate, ConfirmationButton } from '../types';
import { roleLabel, formatDate, formatCurrency, formatPhone } from '../utils/helpers';
import { MILESTONE_LABELS } from '../utils/taskTemplates';

interface Props {
  deal: Deal;
  emailTemplates: EmailTemplate[];
  complianceTemplates?: ComplianceTemplate[];
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

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

export const WorkspaceEmailTemplate: React.FC<Props> = ({ deal, emailTemplates, complianceTemplates = [] }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    emailTemplates.length > 0 ? emailTemplates[0].id : null
  );
  const [copied, setCopied] = useState(false);
  // track which confirmation buttons have been "used" (mailto opened) - stored as set of button ids
  const [usedButtons, setUsedButtons] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update selected template when templates load
  useEffect(() => {
    if (!selectedTemplateId && emailTemplates.length > 0) {
      setSelectedTemplateId(emailTemplates[0].id);
    }
  }, [emailTemplates]);

  const template = emailTemplates.find(t => t.id === selectedTemplateId) ?? null;

  const populatedSubject = template ? populateTemplate(template.subject, deal, complianceTemplates) : '';
  const populatedBody = template ? populateTemplate(template.body, deal, complianceTemplates) : '';

  const notifEmails = deal.contacts
    .filter(c => c.inNotificationList && c.email)
    .map(c => c.email)
    .join(',');

  const copy = () => {
    const text = `Subject: ${populatedSubject}\n\n${textareaRef.current?.value ?? populatedBody}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2500);
      }).catch(() => {
        if (fallbackCopy(text)) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
      });
    } else {
      if (fallbackCopy(text)) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
    }
  };

  const openMailto = () => {
    const body = textareaRef.current?.value ?? populatedBody;
    const link = `mailto:${notifEmails}?subject=${encodeURIComponent(populatedSubject)}&body=${encodeURIComponent(body)}`;
    window.open(link, '_blank');
  };

  const openButtonMailto = (btn: ConfirmationButton) => {
    const replyText = populateTemplate(btn.replyText, deal);
    const replySubject = `RE: ${populatedSubject}`;
    const bodyText = `Hi,\n\nCould you please reply to confirm the following:\n\n"${replyText}"\n\nThank you,\n[TC Name]`;
    const link = `mailto:${notifEmails}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent(bodyText)}`;
    window.open(link, '_blank');
    setUsedButtons(prev => new Set([...prev, btn.id]));
  };

  if (emailTemplates.length === 0) {
    return (
      <div className="p-5 flex flex-col items-center justify-center h-48 gap-3 text-center">
        <Mail size={28} className="text-gray-300" />
        <p className="text-sm text-black font-medium">No email templates yet</p>
        <p className="text-xs text-gray-500">Go to Settings → Email Templates to create templates.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ minHeight: 0 }}>
      {/* Left panel: template picker */}
      <div className="w-52 shrink-0 border-r border-gray-200 flex flex-col overflow-y-auto bg-gray-50">
        <div className="px-3 py-2.5 border-b border-gray-200">
          <p className="text-xs font-bold text-black uppercase tracking-wide">Templates</p>
          <p className="text-xs text-gray-500 mt-0.5">Pick a template</p>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {emailTemplates.map(t => (
            <button
              key={t.id}
              onClick={() => { setSelectedTemplateId(t.id); setUsedButtons(new Set()); }}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-xs ${
                selectedTemplateId === t.id
                  ? 'bg-white border-blue-300 shadow-sm text-black font-semibold'
                  : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200 text-black'
              }`}
            >
              <div className="flex items-center gap-2">
                <Mail size={11} className={selectedTemplateId === t.id ? 'text-blue-500' : 'text-gray-400'} />
                <span className="truncate">{t.name}</span>
              </div>
              {t.buttons.length > 0 && (
                <div className="mt-1 flex items-center gap-1">
                  <MessageSquare size={9} className="text-gray-400" />
                  <span className="text-gray-400 text-[10px]">{t.buttons.length} confirm btn{t.buttons.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: populated email */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {template ? (
          <>
            {/* Header bar */}
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0 flex-wrap">
              <div>
                <h3 className="font-bold text-sm text-black flex items-center gap-2">
                  <Mail size={13} className="opacity-60" />
                  {template.name}
                  <span className="text-[10px] font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">MyReDeal.com</span>
                </h3>
                <p className="text-xs text-gray-500">Edit below · confirmation buttons open a pre-filled reply email</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copy}
                  className={`btn btn-sm gap-1.5 ${copied ? 'btn-success' : 'btn-outline'}`}
                >
                  {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                </button>
                {notifEmails && (
                  <button onClick={openMailto} className="btn btn-sm btn-primary gap-1.5">
                    <Send size={12} /> Open in Email
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">

              {/* To: field */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1.5">TO:</p>
                <div className="flex flex-wrap gap-1.5">
                  {deal.contacts.filter(c => c.inNotificationList).map(c => (
                    <span key={c.id} className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-black">
                      <User size={9} className="text-blue-400" />
                      {c.name}{c.email ? ` <${c.email}>` : ''}
                    </span>
                  ))}
                  {deal.contacts.filter(c => c.inNotificationList).length === 0 && (
                    <span className="text-xs text-gray-400">No contacts on notification list</span>
                  )}
                </div>
              </div>

              {/* Subject */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">SUBJECT:</p>
                <p className="text-xs text-black font-medium">{populatedSubject}</p>
              </div>

              {/* Confirmation Buttons — shown as interactive cards */}
              {template.buttons.length > 0 && (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Reply size={12} className="text-gray-500" />
                    <p className="text-xs font-semibold text-gray-600">CONFIRMATION REQUEST BUTTONS</p>
                    <span className="text-xs text-gray-400">— click to open a pre-filled reply email</span>
                  </div>
                  <div className="space-y-2">
                    {template.buttons.map(btn => {
                      const used = usedButtons.has(btn.id);
                      return (
                        <div
                          key={btn.id}
                          className={`rounded-lg border p-3 transition-all ${
                            used
                              ? 'bg-green-50 border-green-200'
                              : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-black">{btn.label}</p>
                              <p className="text-xs text-gray-500 mt-0.5 italic truncate">
                                Reply: &quot;{populateTemplate(btn.replyText, deal)}&quot;
                              </p>
                            </div>
                            <button
                              onClick={() => openButtonMailto(btn)}
                              className={`btn btn-xs gap-1 shrink-0 ${used ? 'btn-success btn-outline' : 'btn-primary btn-outline'}`}
                            >
                              {used ? <><Check size={10} /> Sent</> : <><Send size={10} /> Send Request</>}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    💡 Each button opens your email client with a pre-filled confirmation request. Mark confirmed in the Activity Log when you receive the reply.
                  </p>
                </div>
              )}

              {/* Email body textarea */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                {/* Branded email header */}
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-900 flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-sm tracking-wide">MyReDeal<span className="text-blue-400">.com</span></p>
                    <p className="text-gray-400 text-[10px] tracking-widest uppercase">Transaction Coordinator</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail size={11} className="text-gray-400" />
                    <span className="text-xs text-gray-400">Email Body (editable)</span>
                  </div>
                </div>
                <textarea
                  ref={textareaRef}
                  className="w-full p-5 bg-white text-black resize-none border-none outline-none"
                  style={{ fontFamily: 'Calibri, "Gill Sans", "Trebuchet MS", sans-serif', fontSize: '14px', lineHeight: '1.8', letterSpacing: '0.01em' }}
                  rows={28}
                  defaultValue={populatedBody}
                  key={template.id}
                  spellCheck={true}
                />
                {/* Branded footer */}
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                  <p className="text-[10px] text-gray-400">Sent via <span className="font-semibold text-gray-500">MyReDeal.com</span> Transaction Coordinator Platform</p>
                  <p className="text-[10px] text-gray-400">www.myredeal.com</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">Select a template from the left</p>
          </div>
        )}
      </div>
    </div>
  );
};
