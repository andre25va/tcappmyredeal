// client-portal-auth Edge Function — v2
// Fixes: phone normalization, any-role deal lookup, portal settings support

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  getSupabaseClient,
  corsHeaders,
  jsonResponse,
  errorResponse,
} from '../_shared/supabase.ts';

// ── Status label map ─────────────────────────────────────────────────────────
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
  };
  return map[status?.toLowerCase()] ?? status ?? 'Active';
}

// ── Phone normalizer: extract last 10 digits ─────────────────────────────────
function normPhone(p: string): string {
  return (p ?? '').replace(/\D/g, '').slice(-10);
}

// ────────────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { phone, pin } = await req.json();

    if (!phone || !pin) {
      return jsonResponse({ error: 'Phone and PIN are required.' }, 400);
    }

    const userPhone10 = normPhone(phone);
    if (userPhone10.length < 10) {
      return jsonResponse({ error: 'Please enter a valid 10-digit phone number.' }, 400);
    }
    // Accept 4–6 digit PIN (TC app allows up to 6 digits)
    if (!/^\d{4,6}$/.test(pin)) {
      return jsonResponse({ error: 'Please enter your PIN.' }, 400);
    }

    const supabase = getSupabaseClient();

    // ── Load portal settings ──────────────────────────────────────────────────
    const { data: settingsRows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'portal_allowed_roles',
        'portal_show_status',
        'portal_show_closing_date',
        'portal_show_next_item',
        'portal_request_types',
        'portal_welcome_message',
      ]);

    const cfg: Record<string, unknown> = {};
    for (const row of settingsRows ?? []) cfg[row.key] = row.value;

    const allowedRoles = Array.isArray(cfg.portal_allowed_roles)
      ? (cfg.portal_allowed_roles as string[])
      : null; // null = allow all roles

    const showNextItem = cfg.portal_show_next_item !== false;
    const requestTypes = Array.isArray(cfg.portal_request_types)
      ? (cfg.portal_request_types as string[])
      : [
          'Document Request',
          'Milestone Status',
          'General Question',
          'Deal Sheet',
          'Special Task Request',
        ];
    const welcomeMessage =
      typeof cfg.portal_welcome_message === 'string' ? cfg.portal_welcome_message : '';

    // ── Lookup contact by PIN, then filter by normalized phone ────────────────
    // We fetch all contacts with matching PIN (typically very few) then check phone.
    // This avoids DB-side function calls for normalization.
    const { data: contacts, error: contactErr } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, phone')
      .eq('pin', pin)
      .is('deleted_at', null);

    if (contactErr) {
      console.error('Contact lookup error:', contactErr);
      return errorResponse('Lookup failed. Please try again.', 500);
    }

    const contact = (contacts ?? []).find(
      (c) => normPhone(c.phone ?? '') === userPhone10,
    );

    if (!contact) {
      return jsonResponse(
        { error: 'No account found for this phone number and PIN.' },
        404,
      );
    }

    const contactName =
      `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();

    // ── Find deal_participants for this contact ────────────────────────────────
    let dpQuery = supabase
      .from('deal_participants')
      .select('deal_id, deal_role')
      .eq('contact_id', contact.id);

    if (allowedRoles && allowedRoles.length > 0) {
      dpQuery = dpQuery.in('deal_role', allowedRoles);
    }

    const { data: participations, error: dpErr } = await dpQuery;
    if (dpErr) {
      console.error('Participants lookup error:', dpErr);
      return errorResponse('Lookup failed. Please try again.', 500);
    }

    if (!participations || participations.length === 0) {
      return jsonResponse({
        contactName,
        deals: [],
        welcomeMessage,
        requestTypes,
      });
    }

    const dealIds = [...new Set(participations.map((p) => p.deal_id))];

    // ── Fetch active deals ────────────────────────────────────────────────────
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, property_address, city, state, status, closing_date, deal_ref')
      .in('id', dealIds)
      .not('status', 'in', '("closed","terminated","cancelled","withdrawn")');

    if (dealsErr) {
      console.error('Deals lookup error:', dealsErr);
      return errorResponse('Lookup failed. Please try again.', 500);
    }

    if (!deals || deals.length === 0) {
      return jsonResponse({
        contactName,
        deals: [],
        welcomeMessage,
        requestTypes,
      });
    }

    // ── Fetch next pending task per deal (batch) ──────────────────────────────
    const tasksMap: Record<string, { title: string; dueDate: string | null }> = {};

    if (showNextItem) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('deal_id, title, due_date')
        .in('deal_id', deals.map((d) => d.id))
        .not('status', 'in', '("completed","cancelled")')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      for (const task of tasks ?? []) {
        if (!tasksMap[task.deal_id]) {
          tasksMap[task.deal_id] = {
            title: task.title,
            dueDate: task.due_date ?? null,
          };
        }
      }
    }

    // ── Build response ────────────────────────────────────────────────────────
    const clientDeals = deals.map((d) => ({
      id: d.id,
      address: [d.property_address, d.city, d.state].filter(Boolean).join(', '),
      closingDate: d.closing_date ?? null,
      status: formatStatus(d.status),
      dealRef: d.deal_ref ?? null,
      nextItem: showNextItem ? (tasksMap[d.id] ?? null) : null,
    }));

    return jsonResponse({
      contactName,
      deals: clientDeals,
      welcomeMessage,
      requestTypes,
      portalSettings: {
        showStatus: cfg.portal_show_status !== false,
        showClosingDate: cfg.portal_show_closing_date !== false,
        showNextItem,
      },
    });
  } catch (err) {
    console.error('client-portal-auth error:', err);
    return errorResponse('An error occurred. Please try again.', 500);
  }
});
