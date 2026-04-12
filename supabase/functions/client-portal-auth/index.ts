// client-portal-auth Edge Function — v8
// Fix: exclude 'archived' deals at the DB level

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  getSupabaseClient,
  corsHeaders,
  jsonResponse,
  errorResponse,
} from './_shared/supabase.ts';

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    contract: 'Under Contract',
    under_contract: 'Under Contract',
    active: 'Under Contract',
    pending: 'Pending',
    due_diligence: 'Due Diligence',
    clear_to_close: 'Clear to Close',
    ctc: 'Clear to Close',
    closed: 'Closed',
    terminated: 'Terminated',
    cancelled: 'Cancelled',
    withdrawn: 'Withdrawn',
    archived: 'Archived',
  };
  return map[status?.toLowerCase()] ?? status ?? 'Active';
}

function formatRole(role: string): string {
  const map: Record<string, string> = {
    lead_agent: 'Lead Agent',
    buyers_agent: "Buyer's Agent",
    listing_agent: 'Listing Agent',
    buyer: 'Buyer',
    seller: 'Seller',
    title_officer: 'Title Officer',
    lender: 'Lender',
    inspector: 'Inspector',
    attorney: 'Attorney',
  };
  return map[role] ?? role ?? '';
}

function normPhone(p: string): string {
  return (p ?? '').replace(/\D/g, '').slice(-10);
}

function buildMilestones(deal: any): Array<{ label: string; done: boolean; date: string | null }> {
  const today = new Date();
  const isPast = (d: string | null) => !!d && new Date(d) < today;
  const isCTC = ['clear_to_close', 'ctc', 'closed'].includes((deal.status ?? '').toLowerCase());
  return [
    { label: 'Contract Signed', done: !!deal.contract_date, date: deal.contract_date ?? null },
    { label: 'Option Period', done: isPast(deal.option_period_end ?? null), date: deal.option_period_end ?? null },
    { label: 'Inspection', done: isPast(deal.inspection_date ?? null), date: deal.inspection_date ?? null },
    { label: 'Finance Deadline', done: isPast(deal.finance_deadline ?? null), date: deal.finance_deadline ?? null },
    { label: 'Clear to Close', done: isCTC, date: null },
    { label: 'Closing', done: (deal.status ?? '').toLowerCase() === 'closed', date: deal.closing_date ?? null },
  ];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { phone, pin } = await req.json();
    if (!phone || !pin) return jsonResponse({ error: 'Phone and PIN are required.' }, 400);

    const userPhone10 = normPhone(phone);
    if (userPhone10.length < 10) return jsonResponse({ error: 'Please enter a valid 10-digit phone number.' }, 400);
    if (!/^\d{4,6}$/.test(pin)) return jsonResponse({ error: 'Please enter your PIN.' }, 400);

    const supabase = getSupabaseClient();

    const { data: settingsRows } = await supabase.from('settings').select('key, value').in('key', [
      'portal_allowed_roles', 'portal_show_status', 'portal_show_closing_date',
      'portal_show_next_item', 'portal_request_types', 'portal_welcome_message',
    ]);

    const cfg: Record<string, unknown> = {};
    for (const row of settingsRows ?? []) cfg[row.key] = row.value;

    const allowedRoles = Array.isArray(cfg.portal_allowed_roles) ? (cfg.portal_allowed_roles as string[]) : null;
    const showNextItem = cfg.portal_show_next_item !== false;
    const requestTypes = Array.isArray(cfg.portal_request_types)
      ? (cfg.portal_request_types as string[])
      : ['Document Request', 'Milestone Status', 'General Question', 'Deal Sheet', 'Special Task Request'];
    const welcomeMessage = typeof cfg.portal_welcome_message === 'string' ? cfg.portal_welcome_message : '';

    const { data: contacts, error: contactErr } = await supabase
      .from('contacts').select('id, first_name, last_name, phone').eq('pin', pin).is('deleted_at', null);
    if (contactErr) return errorResponse('Lookup failed. Please try again.', 500);

    const contact = (contacts ?? []).find((c) => normPhone(c.phone ?? '') === userPhone10);
    if (!contact) return jsonResponse({ error: 'No account found for this phone number and PIN.' }, 404);

    const contactName = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();

    let dpQuery = supabase.from('deal_participants').select('deal_id, deal_role').eq('contact_id', contact.id);
    if (allowedRoles && allowedRoles.length > 0) dpQuery = dpQuery.in('deal_role', allowedRoles);
    const { data: participations, error: dpErr } = await dpQuery;
    if (dpErr) return errorResponse('Lookup failed. Please try again.', 500);
    if (!participations || participations.length === 0) return jsonResponse({ contactName, deals: [], welcomeMessage, requestTypes });

    const dealIds = [...new Set(participations.map((p) => p.deal_id))];

    // v8: exclude archived (and closed/terminated/cancelled/withdrawn) at DB level
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, property_address, city, state, status, closing_date, deal_ref, purchase_price, earnest_money, loan_type, loan_amount, down_payment, seller_concessions, property_type, mls_number, contract_date, possession_date, deal_data')
      .in('id', dealIds)
      .not('status', 'in', '(closed,terminated,cancelled,withdrawn,archived)');

    if (dealsErr) return errorResponse('Lookup failed. Please try again.', 500);
    if (!deals || deals.length === 0) return jsonResponse({ contactName, deals: [], welcomeMessage, requestTypes });

    const activeDealIds = deals.map((d) => d.id);
    const { data: allParticipants } = await supabase.from('deal_participants').select('deal_id, deal_role, contacts(first_name, last_name, phone, email)').in('deal_id', activeDealIds);
    const { data: allTasks } = await supabase.from('tasks').select('deal_id, status').in('deal_id', activeDealIds);

    const taskCountsMap: Record<string, { completed: number; total: number }> = {};
    for (const task of allTasks ?? []) {
      if (!taskCountsMap[task.deal_id]) taskCountsMap[task.deal_id] = { completed: 0, total: 0 };
      taskCountsMap[task.deal_id].total++;
      if (task.status === 'completed') taskCountsMap[task.deal_id].completed++;
    }

    const tasksMap: Record<string, { title: string; dueDate: string | null }> = {};
    if (showNextItem) {
      const { data: tasks } = await supabase.from('tasks').select('deal_id, title, due_date').in('deal_id', activeDealIds).not('status', 'in', '(completed,cancelled)').order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
      for (const task of tasks ?? []) {
        if (!tasksMap[task.deal_id]) tasksMap[task.deal_id] = { title: task.title, dueDate: task.due_date ?? null };
      }
    }

    const clientDeals = deals.map((d) => {
      const dd = (d.deal_data ?? {}) as Record<string, any>;
      const optionPeriodEnd = dd.optionPeriodEnd ?? dd.option_period_end ?? null;
      const inspectionDate = dd.inspectionDate ?? dd.inspection_date ?? null;
      const financeDeadline = dd.financeDeadline ?? dd.finance_deadline ?? null;
      const dealForMilestones = { ...d, option_period_end: optionPeriodEnd, inspection_date: inspectionDate, finance_deadline: financeDeadline };
      const participantsForDeal = (allParticipants ?? []).filter((p) => p.deal_id === d.id).map((p) => {
        const c = (p as any).contacts ?? {};
        return { name: [c.first_name, c.last_name].filter(Boolean).join(' '), role: formatRole(p.deal_role ?? ''), phone: c.phone ?? null, email: c.email ?? null };
      });
      const taskCounts = taskCountsMap[d.id] ?? { completed: 0, total: 0 };
      return {
        id: d.id, address: [d.property_address, d.city, d.state].filter(Boolean).join(', '),
        city: d.city ?? '', state: d.state ?? '', closingDate: d.closing_date ?? null,
        status: formatStatus(d.status), dealRef: d.deal_ref ?? null,
        nextItem: showNextItem ? (tasksMap[d.id] ?? null) : null,
        purchasePrice: d.purchase_price ?? null, earnestMoney: d.earnest_money ?? null,
        loanType: d.loan_type ?? null, loanAmount: d.loan_amount ?? null,
        downPaymentPct: d.down_payment ?? null, sellerConcessions: d.seller_concessions ?? null,
        propertyType: d.property_type ?? null, mlsNumber: d.mls_number ?? null,
        contractDate: d.contract_date ?? null, optionPeriodEnd, inspectionDate, financeDeadline,
        possessionDate: d.possession_date ?? null, participants: participantsForDeal,
        milestones: buildMilestones(dealForMilestones),
        tasksCompleted: taskCounts.completed, tasksTotal: taskCounts.total,
      };
    });

    return jsonResponse({ contactName, deals: clientDeals, welcomeMessage, requestTypes, portalSettings: { showStatus: cfg.portal_show_status !== false, showClosingDate: cfg.portal_show_closing_date !== false, showNextItem } });
  } catch (err) {
    console.error('client-portal-auth error:', err);
    return errorResponse('An error occurred. Please try again.', 500);
  }
});
