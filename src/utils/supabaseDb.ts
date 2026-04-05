/**
 * supabaseDb.ts
 * Phase 4A: Reads from relational tables, still writes deal_data JSONB as backup.
 * Populates both old and new Deal fields for backward compatibility during migration.
 */

import { supabase } from '../lib/supabase';
import {
  Deal,
  DealParticipant,
  DealTask,
  ChecklistItem,
  DocumentRequest,
  Reminder,
  ActivityEntry,
  Contact,
  AgentContact,
  Organization,
  ClientAccount,
  ContactLicense,
  ContactMlsMembership,
  ContactRecord,
  ContactRole,
  OrgMemberInfo,
  MlsEntry,
  ComplianceTemplate,
  AppUser,
  EmailTemplate,
  ComplianceMasterItem,
  DDMasterItem,
  DealMilestone,
  DealStatus,
  PropertyType,
  TransactionType,
  TransactionSide,
  ContactPhoneChannel,
  VoiceDealUpdate,
  VoiceAnalysis,
  VoiceSuggestedAction,
  CallbackRequest,
  CommunicationEvent,
  ChangeRequest,
  ChangeStatus,
  ChangeImpact,
  AmbiguityQueueItem,
  ScheduledEmail,
  EmailSendLogEntry,
  BriefingConfig,
  EmailType,
  EmailSendStatus,
} from '../types';

// ─── DEAL PARTICIPANTS ──────────────────────────────────────────────────────

async function loadDealParticipants(dealIds: string[]): Promise<Record<string, DealParticipant[]>> {
  if (dealIds.length === 0) return {};

  const { data, error } = await supabase
    .from('deal_participants')
    .select(`
      id, deal_id, contact_id, organization_id, client_account_id,
      side, deal_role, is_primary, is_client_side, is_extracted, notes,
      created_at, updated_at,
      contacts:contact_id ( first_name, last_name, full_name, email, phone ),
      organizations:organization_id ( name )
    `)
    .in('deal_id', dealIds);

  if (error) throw error;

  const byDeal: Record<string, DealParticipant[]> = {};
  for (const row of data ?? []) {
    const c = row.contacts as unknown as Record<string, string> | null;
    const o = row.organizations as unknown as Record<string, string> | null;
    const p: DealParticipant = {
      id: row.id,
      dealId: row.deal_id,
      contactId: row.contact_id ?? undefined,
      organizationId: row.organization_id ?? undefined,
      clientAccountId: row.client_account_id ?? undefined,
      side: row.side,
      dealRole: row.deal_role,
      isPrimary: row.is_primary,
      isClientSide: row.is_client_side,
      isExtracted: row.is_extracted ?? false,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contactName: c ? (c.full_name || `${c.first_name} ${c.last_name}`.trim()) : undefined,
      contactEmail: c?.email ?? undefined,
      contactPhone: c?.phone ?? undefined,
      organizationName: o?.name ?? undefined,
    };
    if (!byDeal[row.deal_id]) byDeal[row.deal_id] = [];
    byDeal[row.deal_id].push(p);
  }
  return byDeal;
}

function participantsToLegacyContacts(participants: DealParticipant[]): Contact[] {
  return participants
    .filter((p) => p.contactId)
    .map((p) => ({
      id: p.contactId!,
      directoryId: p.contactId,
      name: p.contactName || 'Unknown',
      email: p.contactEmail || '',
      phone: p.contactPhone || '',
      role: mapDealRoleToContactRole(p.dealRole),
      company: p.organizationName,
      inNotificationList: true,
      side: mapSideToLegacy(p.side),
    }));
}

function mapDealRoleToContactRole(role: string): Contact['role'] {
  const map: Record<string, Contact['role']> = {
    lead_agent: 'agent',
    co_agent: 'agent',
    lender: 'lender',
    title_officer: 'title',
    buyer: 'buyer',
    seller: 'seller',
    inspector: 'inspector',
    tc: 'tc',
    admin: 'other',
    appraiser: 'other',
    other: 'other',
  };
  return map[role] || 'other';
}

function mapSideToLegacy(side: string): 'buy' | 'sell' | 'both' {
  if (side === 'buyer') return 'buy';
  if (side === 'listing' || side === 'seller') return 'sell';
  if (side === 'vendor') return 'buy'; // defaults to buy side; toggle overrides to 'both' when implemented
  return 'buy';
}

function findAgentFromParticipants(
  participants: DealParticipant[],
  side: 'listing' | 'buyer',
): AgentContact | undefined {
  const agent = participants.find(
    (p) => p.side === side && p.dealRole === 'lead_agent',
  );
  if (!agent) return undefined;
  return {
    name: agent.contactName || '',
    phone: agent.contactPhone || '',
    email: agent.contactEmail || '',
    isOurClient: agent.isClientSide,
  };
}

// ─── DEALS ───────────────────────────────────────────────────────────────────

export async function loadDeals(orgId?: string): Promise<Deal[]> {
  let query = supabase
    .from('deals')
    .select(`
      id, property_address, city, state, zip, mls_number,
      status, pipeline_stage,
      contract_date, closing_date, purchase_price, notes, legal_description,
      primary_client_account_id, transaction_type, risk_level,
      assigned_tc_user_id, assigned_compliance_user_id,
      deal_data, created_at, updated_at,
      buyer_name, seller_name, title_company_name, em_held_with, loan_officer_name,
      buyer_agent_name, seller_agent_name,
      property_type, list_price,
      loan_type, loan_amount, down_payment, earnest_money, earnest_money_due_date,
      seller_concessions, total_seller_credits,
      as_is_sale, inspection_waived, home_warranty, home_warranty_amount,
      home_warranty_paid_by, home_warranty_company, commission_paid_by,
      org_id, deal_ref
    `)
    .order('created_at', { ascending: false });

  if (orgId) query = query.eq('org_id', orgId);

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const dealIds = data.map((r) => r.id);
  const participantsByDeal = await loadDealParticipants(dealIds);

  return data.map((row) => {
    const dd = (row.deal_data as Record<string, unknown>) || {};
    const participants = participantsByDeal[row.id] || [];
    // Find our client agent on either side (buyer or listing)
    const clientAgent =
      findAgentFromParticipants(participants, 'listing') ??
      findAgentFromParticipants(participants, 'buyer') ??
      undefined;
    // The participant that is our client (isClientSide = true) and is lead_agent
    const ourClientParticipant = participants.find(
      (p) => p.isClientSide && p.dealRole === 'lead_agent',
    );

    const deal: Deal = {
      id: row.id,
      propertyAddress: row.property_address || (dd.address as string) || '',
      city: row.city || (dd.city as string) || '',
      state: row.state || (dd.state as string) || '',
      zipCode: row.zip || (dd.zipCode as string) || '',
      mlsNumber: row.mls_number || (dd.mlsNumber as string) || '',
      mlsId: row.mls_id || undefined,
      listPrice: row.list_price ?? (dd.listPrice as number) ?? 0,
      contractPrice: row.purchase_price ?? (dd.contractPrice as number) ?? 0,
      propertyType: (row.property_type || (dd.propertyType as string) || 'single-family') as PropertyType,
      status: (row.status || (dd.status as string) || 'contract') as DealStatus,
      milestone: (row.pipeline_stage || (dd.milestone as string) || 'contract-received') as DealMilestone,
      transactionType: (row.transaction_type || (dd.transactionType as string) || 'buyer') as TransactionType,
      riskLevel: row.risk_level || 'normal',
      contractDate: row.contract_date || (dd.contractDate as string) || '',
      closingDate: row.closing_date || (dd.closingDate as string) || '',
      primaryClientAccountId: row.primary_client_account_id ?? undefined,
      assignedTcUserId: row.assigned_tc_user_id ?? undefined,
      assignedComplianceUserId: row.assigned_compliance_user_id ?? undefined,
      participants,
      agentId: ourClientParticipant?.contactId || (dd.agentId as string) || '',
      agentName: ourClientParticipant?.contactName || clientAgent?.name || (dd.agentName as string) || '',
      agentClientId: (dd.agentClientId as string) ?? undefined,
      complianceTemplateId: (dd.complianceTemplateId as string) ?? undefined,
      buyerAgent: findAgentFromParticipants(participants, 'buyer') ?? (dd.buyerAgent as AgentContact) ?? undefined,
      sellerAgent: findAgentFromParticipants(participants, 'listing') ?? (dd.sellerAgent as AgentContact) ?? undefined,
      contacts: participants.length > 0
        ? participantsToLegacyContacts(participants)
        : ((dd.contacts as Contact[]) ?? []),
      dueDiligenceChecklist: (dd.dueDiligenceChecklist as ChecklistItem[]) ?? [],
      complianceChecklist: (dd.complianceChecklist as ChecklistItem[]) ?? [],
      documentRequests: (dd.documentRequests as DocumentRequest[]) ?? [],
      reminders: (dd.reminders as Reminder[]) ?? [],
      activityLog: (dd.activityLog as ActivityEntry[]) ?? [],
      tasks: (dd.tasks as DealTask[]) ?? [],
      notes: row.notes || (dd.notes as string) || '',
      legalDescription: row.legal_description || (dd.legalDescription as string) || '',
      // Parties
      buyerName: row.buyer_name || (dd.buyerName as string) || undefined,
      sellerName: row.seller_name || (dd.sellerName as string) || undefined,
      titleCompanyName: row.title_company_name || (dd.titleCompanyName as string) || undefined,
      emHeldWith: row.em_held_with || (dd.emHeldWith as string) || undefined,
      loanOfficerName: row.loan_officer_name || (dd.loanOfficerName as string) || undefined,
      buyerAgentName: row.buyer_agent_name || (dd.buyerAgentName as string) || undefined,
      sellerAgentName: row.seller_agent_name || (dd.sellerAgentName as string) || undefined,
      // Financing
      loanType: row.loan_type || (dd.loanType as string) || undefined,
      loanAmount: row.loan_amount ?? (dd.loanAmount as number) ?? undefined,
      downPayment: row.down_payment ?? (dd.downPayment as number) ?? undefined,
      earnestMoney: row.earnest_money ?? (dd.earnestMoney as number) ?? undefined,
      earnestMoneyDueDate: row.earnest_money_due_date || (dd.earnestMoneyDueDate as string) || undefined,
      sellerConcessions: row.seller_concessions ?? (dd.sellerConcessions as number) ?? undefined,
      totalSellerCredits: row.total_seller_credits ?? (dd.totalSellerCredits as number) ?? undefined,
      // Contract conditions
      asIsSale: row.as_is_sale ?? (dd.asIsSale as boolean) ?? false,
      inspectionWaived: row.inspection_waived ?? (dd.inspectionWaived as boolean) ?? false,
      homeWarranty: row.home_warranty ?? (dd.homeWarranty as boolean) ?? false,
      homeWarrantyAmount: row.home_warranty_amount ?? (dd.homeWarrantyAmount as number) ?? undefined,
      homeWarrantyPaidBy: row.home_warranty_paid_by || (dd.homeWarrantyPaidBy as string) || undefined,
      homeWarrantyCompany: row.home_warranty_company || (dd.homeWarrantyCompany as string) || undefined,
      commissionPaidBy: row.commission_paid_by || (dd.commissionPaidBy as string) || undefined,
      // Commission & other fields from deal_data
      clientAgentCommission: (dd.clientAgentCommission as number) ?? undefined,
      clientAgentCommissionPct: (dd.clientAgentCommissionPct as number) ?? undefined,
      tcFeeType: (dd.tcFeeType as 'percent' | 'flat') ?? undefined,
      tcFeeValue: (dd.tcFeeValue as number) ?? undefined,
      tcFeePaidBy: (dd.tcFeePaidBy as string) ?? undefined,
      possessionDate: (dd.possessionDate as string) ?? undefined,
      titleDate: (dd.titleDate as string) ?? undefined,
      hoa: (dd.hoa as boolean) ?? undefined,
      hoaMonthlyFee: (dd.hoaMonthlyFee as number) ?? undefined,
      surveyRequired: (dd.surveyRequired as boolean) ?? undefined,
      isHeartlandMls: (dd.isHeartlandMls as boolean) ?? undefined,
      hasCounterOffer: (dd.hasCounterOffer as boolean) ?? false,
      archiveReason: (dd.archiveReason as string) ?? undefined,
      orgId: row.org_id as string | undefined,
      dealRef: row.deal_ref as string | undefined,
      createdAt: row.created_at || (dd.createdAt as string) || new Date().toISOString(),
      updatedAt: row.updated_at || (dd.updatedAt as string) || new Date().toISOString(),
    };
    return deal;
  });
}

export async function saveDeals(deals: Deal[]): Promise<void> {
  if (deals.length === 0) {
    await supabase.from('deals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return;
  }

  const rows = deals.map((deal) => ({
    id: deal.id,
    property_address: deal.propertyAddress || '',
    city: deal.city ?? null,
    state: deal.state ?? null,
    zip: deal.zipCode ?? null,
    mls_number: deal.mlsNumber ?? null,
    status: deal.status ?? 'contract',
    pipeline_stage: deal.milestone ?? 'contract-received',
    contract_date: deal.contractDate || null,
    closing_date: deal.closingDate || null,
    purchase_price: deal.contractPrice ?? null,
    notes: deal.notes ?? null,
    legal_description: deal.legalDescription || null,
    primary_client_account_id: deal.primaryClientAccountId ?? null,
    transaction_type: deal.transactionType || 'buyer',
    risk_level: deal.riskLevel || 'normal',
    assigned_tc_user_id: deal.assignedTcUserId ?? null,
    assigned_compliance_user_id: deal.assignedComplianceUserId ?? null,
    buyer_name: deal.buyerName || null,
    seller_name: deal.sellerName || null,
    title_company_name: deal.titleCompanyName || null,
    em_held_with: deal.emHeldWith || null,
    loan_officer_name: deal.loanOfficerName || null,
    buyer_agent_name: deal.buyerAgentName || null,
    seller_agent_name: deal.sellerAgentName || null,
    property_type: deal.propertyType || null,
    list_price: deal.listPrice ?? null,
    loan_type: deal.loanType || null,
    loan_amount: deal.loanAmount ?? null,
    down_payment: deal.downPayment ?? null,
    earnest_money: deal.earnestMoney ?? null,
    earnest_money_due_date: deal.earnestMoneyDueDate || null,
    seller_concessions: deal.sellerConcessions ?? null,
    total_seller_credits: deal.totalSellerCredits ?? null,
    as_is_sale: deal.asIsSale ?? null,
    inspection_waived: deal.inspectionWaived ?? null,
    home_warranty: deal.homeWarranty ?? null,
    home_warranty_amount: deal.homeWarrantyAmount ?? null,
    home_warranty_paid_by: deal.homeWarrantyPaidBy || null,
    home_warranty_company: deal.homeWarrantyCompany || null,
    commission_paid_by: deal.commissionPaidBy || null,
    org_id: deal.orgId ?? null,
    deal_data: dealToJsonBackup(deal),
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase.from('deals').upsert(rows, {
    onConflict: 'id',
  });
  if (upsertError) throw upsertError;

  const newIds = deals.map((d) => d.id);
  const { data: existing } = await supabase.from('deals').select('id');
  const toDelete = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    await supabase.from('deals').delete().in('id', toDelete);
  }
}

export async function saveSingleDeal(deal: Deal, createdByUserId?: string): Promise<void> {
  // Resolve FK contact IDs for relational columns
  const agentContactId: string | null =
    deal.agentClientId || deal.agentId || null;
  const titleContact = deal.contacts?.find(
    (c: any) => c.role === 'title' || c.role === 'title_officer',
  );
  const titleContactId: string | null =
    titleContact?.directoryId || titleContact?.id || null;

  const { error } = await supabase.from('deals').upsert(
    {
      id: deal.id,
      property_address: deal.propertyAddress || '',
      city: deal.city ?? null,
      state: deal.state ?? null,
      zip: deal.zipCode ?? null,
      mls_number: deal.mlsNumber ?? null,
      mls_id: (deal as any).mlsId ?? null,
      status: deal.status ?? 'contract',
      pipeline_stage: deal.milestone ?? 'contract-received',
      contract_date: deal.contractDate || null,
      closing_date: deal.closingDate || null,
      purchase_price: deal.contractPrice ?? null,
      notes: deal.notes ?? null,
      legal_description: deal.legalDescription || null,
      primary_client_account_id: deal.primaryClientAccountId ?? null,
      transaction_type: deal.transactionType || 'buyer',
      risk_level: deal.riskLevel || 'normal',
      assigned_tc_user_id: deal.assignedTcUserId ?? null,
      assigned_compliance_user_id: deal.assignedComplianceUserId ?? null,
      buyer_name: deal.buyerName || null,
      seller_name: deal.sellerName || null,
      title_company_name: deal.titleCompanyName || null,
      title_company_side: (deal as any).titleCompanySide || null,
      em_held_with: deal.emHeldWith || null,
      loan_officer_name: deal.loanOfficerName || null,
      buyer_agent_name: deal.buyerAgentName || null,
      seller_agent_name: deal.sellerAgentName || null,
      property_type: deal.propertyType || null,
      list_price: deal.listPrice ?? null,
      loan_type: deal.loanType || null,
      loan_amount: deal.loanAmount ?? null,
      down_payment: deal.downPayment ?? null,
      earnest_money: deal.earnestMoney ?? null,
      earnest_money_due_date: deal.earnestMoneyDueDate || null,
      seller_concessions: deal.sellerConcessions ?? null,
      total_seller_credits: deal.totalSellerCredits ?? null,
      as_is_sale: deal.asIsSale ?? null,
      inspection_waived: deal.inspectionWaived ?? null,
      home_warranty: deal.homeWarranty ?? null,
      home_warranty_amount: deal.homeWarrantyAmount ?? null,
      home_warranty_paid_by: deal.homeWarrantyPaidBy || null,
      home_warranty_company: deal.homeWarrantyCompany || null,
      commission_paid_by: deal.commissionPaidBy || null,
      org_id: deal.orgId ?? null,
      deal_data: dealToJsonBackup(deal),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw error;

  // Background sync: ensure buyer/seller/lender names land in deal_participants
  // so the Contacts panel picks them up without requiring a separate Edit Deal save.
  upsertBuyerSellerParticipants({
    dealId: deal.id,
    buyerName: deal.buyerName,
    sellerName: deal.sellerName,
    loanOfficerName: deal.loanOfficerName,
    titleCompanyName: deal.titleCompanyName,
    titleCompanySide: (deal as any).titleCompanySide,
    orgId: deal.orgId,
  }).catch((e) => console.warn('[saveSingleDeal] participant sync error:', e));
}

function dealToJsonBackup(deal: Deal): Record<string, unknown> {
  return {
    ...deal,
    address: deal.propertyAddress || '',
    transactionType: deal.transactionType || 'buyer',
  };
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}

// ─── DEAL PARTICIPANTS CRUD ─────────────────────────────────────────────────

export async function saveDealParticipant(participant: Omit<DealParticipant, 'id' | 'createdAt' | 'updatedAt' | 'contactName' | 'contactEmail' | 'contactPhone' | 'organizationName'>): Promise<string> {
  const { data, error } = await supabase
    .from('deal_participants')
    .insert({
      deal_id: participant.dealId,
      contact_id: participant.contactId ?? null,
      organization_id: participant.organizationId ?? null,
      client_account_id: participant.clientAccountId ?? null,
      side: participant.side,
      deal_role: participant.dealRole,
      is_primary: participant.isPrimary,
      is_client_side: participant.isClientSide,
      is_extracted: participant.isExtracted ?? false,
      notes: participant.notes ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteDealParticipant(id: string): Promise<void> {
  const { error } = await supabase.from('deal_participants').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Fetches all participants for a single deal, including nested contact info
 * needed for display in the WorkspaceOverview panel.
 */
export async function getDealParticipants(dealId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('deal_participants')
    .select(`id, deal_role, side, is_extracted, contact_id, contacts(id, first_name, last_name, email, phone, company, contact_type)`)
    .eq('deal_id', dealId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Syncs free-text buyer/seller/lender names from the Edit Deal form into
 * deal_participants + contacts. Only creates stub records when a participant
 * with that role does not already exist for the deal.
 *
 * Called fire-and-forget from WorkspaceOverview handleSave.
 */
export async function upsertBuyerSellerParticipants(params: {
  dealId: string;
  buyerName?: string;
  sellerName?: string;
  loanOfficerName?: string;
  titleCompanyName?: string;
  titleCompanySide?: string;
  orgId?: string;
}): Promise<void> {
  const { dealId, buyerName, sellerName, loanOfficerName, titleCompanyName, titleCompanySide, orgId } = params;

  // Skip if nothing to sync
  if (!buyerName && !sellerName && !loanOfficerName && !titleCompanyName) return;

  // Find which roles already have a participant for this deal
  const { data: existing } = await supabase
    .from('deal_participants')
    .select('deal_role')
    .eq('deal_id', dealId)
    .in('deal_role', ['buyer', 'seller', 'lender', 'title_officer']);

  const existingRoles = new Set((existing ?? []).map((r: any) => r.deal_role as string));

  // Helper: create a stub person contact then link via deal_participants
  async function createStubParticipant(
    fullName: string,
    side: string,
    dealRole: string,
  ): Promise<void> {
    const trimmed = fullName.trim();
    if (!trimmed) return;

    const parts = trimmed.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    // Find-or-create: reuse existing contact with same name to prevent duplicates
    // Use .limit(1) instead of .maybeSingle() to gracefully handle pre-existing duplicates
    let contactId: string;
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('id')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName || '')
      .eq('org_id', orgId ?? '')
      .limit(1);

    if (existingContacts && existingContacts.length > 0) {
      contactId = existingContacts[0].id;
    } else {
      contactId = crypto.randomUUID();
      // Insert stub contact (name only — phone/email empty until filled via Contacts tab)
      const { error: contactErr } = await supabase.from('contacts').insert({
        id: contactId,
        first_name: firstName,
        last_name: lastName,
        full_name: trimmed,
        contact_type: 'other',
        email: null,
        phone: null,
        is_active: true,
        org_id: orgId ?? null,
        updated_at: new Date().toISOString(),
      });
      if (contactErr) {
        console.error('[upsertBuyerSellerParticipants] contact insert failed:', contactErr);
        return;
      }
    }

    // Link to deal_participants
    const { error: partErr } = await supabase.from('deal_participants').insert({
      deal_id: dealId,
      contact_id: contactId,
      side,
      deal_role: dealRole,
      is_primary: true,
      is_client_side: false,
      is_extracted: false,
      organization_id: orgId ?? null,
    });
    if (partErr) {
      console.error('[upsertBuyerSellerParticipants] participant insert failed:', partErr);
    }
  }

  // Helper: create a company-type contact (e.g. title company) then link via deal_participants
  async function createCompanyParticipant(
    companyName: string,
    side: string,
    dealRole: string,
  ): Promise<void> {
    const trimmed = companyName.trim();
    if (!trimmed) return;

    const contactId = crypto.randomUUID();

    // Insert company contact — first_name/last_name are null (allowed after migration)
    const { error: contactErr } = await supabase.from('contacts').insert({
      id: contactId,
      first_name: null,
      last_name: null,
      full_name: trimmed,
      company: trimmed,
      contact_type: 'company',
      email: null,
      phone: null,
      is_active: true,
      org_id: orgId ?? null,
      updated_at: new Date().toISOString(),
    });
    if (contactErr) {
      console.error('[upsertBuyerSellerParticipants] company contact insert failed:', contactErr);
      return;
    }

    // Link to deal_participants
    const { error: partErr } = await supabase.from('deal_participants').insert({
      deal_id: dealId,
      contact_id: contactId,
      side,
      deal_role: dealRole,
      is_primary: false,
      is_client_side: false,
      is_extracted: false,
      organization_id: orgId ?? null,
    });
    if (partErr) {
      console.error('[upsertBuyerSellerParticipants] company participant insert failed:', partErr);
    }
  }

  if (buyerName && !existingRoles.has('buyer')) {
    await createStubParticipant(buyerName, 'buyer', 'buyer');
  }
  if (sellerName && !existingRoles.has('seller')) {
    await createStubParticipant(sellerName, 'seller', 'seller');
  }
  if (loanOfficerName && !existingRoles.has('lender')) {
    // Parse "Name Company Phone" format — use everything before first digit sequence as name
    const namePart = loanOfficerName.replace(/\d[\d.\s-]*$/, '').trim() || loanOfficerName;
    await createStubParticipant(namePart, 'buyer', 'lender');
  }
  if (titleCompanyName && !existingRoles.has('title_officer')) {
    // Title company = vendor side, stored as company-type contact
    const compSide = titleCompanySide === 'sell' ? 'seller' : titleCompanySide === 'both' ? 'internal' : 'buyer';
    await createCompanyParticipant(titleCompanyName, compSide, 'title_officer');
  }
}

// ─── ORGANIZATIONS ──────────────────────────────────────────────────────────

export async function loadOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    organizationType: row.organization_type,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    propertyAddress: row.address ?? row.propertyAddress ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ─── CLIENT ACCOUNTS ────────────────────────────────────────────────────────

export async function loadClientAccounts(): Promise<ClientAccount[]> {
  const { data, error } = await supabase
    .from('client_accounts')
    .select(`
      *,
      contacts:primary_contact_id ( full_name, first_name, last_name ),
      organizations:primary_organization_id ( name )
    `)
    .order('account_name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => {
    const c = row.contacts as unknown as Record<string, string> | null;
    const o = row.organizations as unknown as Record<string, string> | null;
    return {
      id: row.id,
      accountName: row.account_name,
      accountType: row.account_type,
      primaryContactId: row.primary_contact_id ?? undefined,
      primaryOrganizationId: row.primary_organization_id ?? undefined,
      status: row.status,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      primaryContactName: c ? (c.full_name || `${c.first_name} ${c.last_name}`.trim()) : undefined,
      primaryOrganizationName: o?.name ?? undefined,
    };
  });
}

export async function createClientAccountForContact(contactId: string, fullName: string): Promise<string> {
  const accountId = crypto.randomUUID();
  const { error: accErr } = await supabase.from('client_accounts').insert({
    id: accountId,
    account_name: fullName,
    account_type: 'individual_agent',
    primary_contact_id: contactId,
    status: 'active',
  });
  if (accErr) throw accErr;

  const { error: memErr } = await supabase.from('client_account_members').insert({
    client_account_id: accountId,
    contact_id: contactId,
    relationship_role: 'primary_client',
    is_primary: true,
    is_active: true,
  });
  if (memErr) throw memErr;

  return accountId;
}

export async function removeClientAccountForContact(contactId: string, clientAccountId: string): Promise<void> {
  await supabase.from('client_account_members').delete()
    .eq('contact_id', contactId)
    .eq('client_account_id', clientAccountId);
  const { error } = await supabase.from('client_accounts').delete().eq('id', clientAccountId);
  if (error) throw error;
}

// ─── CONTACT LICENSES ───────────────────────────────────────────────────────

export async function loadContactLicenses(contactId: string): Promise<ContactLicense[]> {
  const { data, error } = await supabase
    .from('contact_licenses')
    .select(`*, organizations:broker_organization_id ( name )`)
    .eq('contact_id', contactId);

  if (error) throw error;
  return (data ?? []).map((row) => {
    const o = row.organizations as Record<string, string> | null;
    return {
      id: row.id,
      contactId: row.contact_id,
      stateCode: row.state_code,
      licenseType: row.license_type,
      licenseNumber: row.license_number,
      status: row.status,
      brokerOrganizationId: row.broker_organization_id ?? undefined,
      issueDate: row.issue_date ?? undefined,
      expirationDate: row.expiration_date ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      brokerOrganizationName: o?.name ?? undefined,
    };
  });
}

// ─── MLS ENTRIES ─────────────────────────────────────────────────────────────

export async function loadMls(): Promise<MlsEntry[]> {
  const { data, error } = await supabase
    .from('mls_entries')
    .select('id, name, url, state, notes, documents, created_at')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    state: row.state as string,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    documents: (row.documents as MlsEntry['documents']) ?? [],
  }));
}

export async function saveMls(entries: MlsEntry[]): Promise<void> {
  if (entries.length === 0) {
    await supabase.from('mls_entries').delete().neq('id', '');
    return;
  }

  const rows = entries.map((e) => ({
    id: e.id,
    name: e.name,
    url: e.url ?? null,
    state: e.state ?? null,
    notes: e.notes ?? null,
    documents: e.documents ?? [],
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('mls_entries').upsert(rows, { onConflict: 'id' });
  if (error) throw error;

  const newIds = entries.map((e) => e.id);
  const { data: existing } = await supabase.from('mls_entries').select('id');
  const toDelete = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    await supabase.from('mls_entries').delete().in('id', toDelete);
  }
}

// ─── COMPLIANCE TEMPLATES ─────────────────────────────────────────────────────

export async function loadCompliance(orgId?: string | null): Promise<ComplianceTemplate[]> {
  const query = supabase
    .from('app_compliance_templates')
    .select('data')
    .order('created_at', { ascending: true });

  const { data, error } = orgId
    ? await query.eq('org_id', orgId)
    : await query.is('org_id', null);

  if (error) throw error;
  return (data ?? []).map((row) => row.data as ComplianceTemplate);
}

export async function saveCompliance(templates: ComplianceTemplate[], orgId?: string | null): Promise<void> {
  const orgFilter = orgId ?? null;

  if (templates.length === 0) {
    const delQ = supabase.from('app_compliance_templates');
    orgId
      ? await delQ.delete().eq('org_id', orgId)
      : await delQ.delete().is('org_id', null);
    return;
  }

  const rows = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    state: t.state ?? null,
    data: t,
    org_id: orgFilter,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('app_compliance_templates').upsert(rows, { onConflict: 'id' });
  if (error) throw error;

  const newIds = templates.map((t) => t.id);
  const existQ = supabase.from('app_compliance_templates').select('id');
  const { data: existing } = orgId
    ? await existQ.eq('org_id', orgId)
    : await existQ.is('org_id', null);
  const toDelete = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    await supabase.from('app_compliance_templates').delete().in('id', toDelete);
  }
}

// ─── APP USERS ────────────────────────────────────────────────────────────────

export async function loadUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, is_active, created_at, contacts:contact_id ( email )')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) || '',
    email: (row.contacts as any)?.email || '',
    role: (row.role as AppUser['role']) || 'tc',
    active: (row.is_active as boolean) ?? true,
    createdAt: row.created_at as string,
  }));
}

export async function saveUsers(users: AppUser[]): Promise<void> {
  if (users.length === 0) {
    await supabase.from('app_users').delete().neq('id', '');
    return;
  }

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
  }));

  const { error } = await supabase.from('app_users').upsert(rows, { onConflict: 'id' });
  if (error) throw error;

  const newIds = users.map((u) => u.id);
  const { data: existing } = await supabase.from('app_users').select('id');
  const toDelete = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    await supabase.from('app_users').delete().in('id', toDelete);
  }
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────────────────────────

export async function loadEmailTemplates(scope?: 'global' | 'team', orgId?: string): Promise<EmailTemplate[]> {
  let query = supabase
    .from('email_templates')
    .select('id, name, subject, body, buttons, category, is_default, org_id, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (scope === 'global') {
    query = query.is('org_id', null);
  } else if (scope === 'team' && orgId) {
    query = query.eq('org_id', orgId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    subject: row.subject as string,
    body: row.body as string,
    buttons: (row.buttons as EmailTemplate['buttons']) ?? [],
    category: row.category as string | undefined,
    isDefault: row.is_default as boolean,
    orgId: row.org_id as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function saveEmailTemplates(templates: EmailTemplate[], orgId?: string): Promise<void> {
  if (templates.length === 0) {
    await supabase.from('email_templates').delete().neq('id', '');
    return;
  }

  const rows = templates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    buttons: t.buttons ?? [],
    is_default: t.isDefault ?? false,
    org_id: (t as any).orgId ?? orgId ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('email_templates').upsert(rows, { onConflict: 'id' });
  if (error) throw error;

  const newIds = templates.map((t) => t.id);
  const { data: existing } = await supabase.from('email_templates').select('id');
  const toDelete = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    await supabase.from('email_templates').delete().in('id', toDelete);
  }
}

// ─── MASTER ITEMS ─────────────────────────────────────────────────────────────

export async function loadMasterItems(type: 'compliance' | 'dd'): Promise<
  ComplianceMasterItem[] | DDMasterItem[]
> {
  // Query global checklist templates (org_id IS NULL = global)
  const templateRes = await supabase
    .from('checklist_templates')
    .select('id')
    .is('org_id', null)
    .eq('checklist_type', type) // 'dd' or 'compliance'
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const templateId = templateRes.data?.id;

  const { data, error } = templateId
    ? await supabase
        .from('checklist_template_items')
        .select('id, title, is_required, sort_order')
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true })
    : { data: [], error: null };

  if (error) throw error;

  if (type === 'compliance') {
    return (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      order: (row as any).sort_order as number,
    })) as ComplianceMasterItem[];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    required: (row as any).is_required as boolean,
    order: (row as any).sort_order as number,
  })) as DDMasterItem[];
}

export async function saveMasterItems(
  type: 'compliance' | 'dd',
  items: ComplianceMasterItem[] | DDMasterItem[],
  orgId?: string | null,
): Promise<void> {
  // 1. Find or create the global template for this type
  const filterQuery = supabase
    .from('checklist_templates')
    .select('id')
    .eq('checklist_type', type)
    .eq('is_active', true);

  const templateRes = orgId
    ? await filterQuery.eq('org_id', orgId).limit(1).maybeSingle()
    : await filterQuery.is('org_id', null).limit(1).maybeSingle();

  let templateId = templateRes.data?.id as string | undefined;

  if (!templateId) {
    // Create the template if it doesn't exist
    const { data: newTemplate, error: tErr } = await supabase
      .from('checklist_templates')
      .insert({
        name: type === 'dd' ? 'DD Checklist' : 'Compliance Checklist',
        checklist_type: type,
        deal_type: 'buyer',
        is_active: true,
        org_id: orgId ?? null,
      })
      .select('id')
      .single();
    if (tErr) throw tErr;
    templateId = newTemplate.id as string;
  }

  // 2. Delete existing items for this template
  await supabase.from('checklist_template_items').delete().eq('template_id', templateId);

  if (items.length === 0) return;

  // 3. Insert new items
  const rows = items.map((item, idx) => ({
    id: item.id,
    template_id: templateId,
    title: item.title,
    is_required: (item as DDMasterItem).required ?? false,
    sort_order: item.order ?? idx,
  }));

  const { error } = await supabase.from('checklist_template_items').insert(rows);
  if (error) throw error;
}

// ─── ACTIVITY LOG ────────────────────────────────────────────────────────────

export async function logActivity(params: {
  dealId?: string;
  action: string;
  description: string;
  entityType?: string;
  performedBy?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await supabase.from('activity_log').insert({
    deal_id: params.dealId ?? null,
    action: params.action,
    description: params.description,
    entity_type: params.entityType ?? null,
    performed_by: params.performedBy ?? 'TC Command',
    metadata: params.metadata ?? {},
  });
}

// ── Contact Record CRUD (relational) ─────────────────────────────────────────

export async function loadContactsFull(): Promise<ContactRecord[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*, organizations:org_id ( id, name, organization_type )')
    .is('deleted_at', null)
    .order('last_name', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const ids = data.map(r => r.id);

  const [licRes, mlsRes, orgRes, clientRes] = await Promise.all([
    supabase.from('contact_licenses').select('*').in('contact_id', ids),
    supabase.from('contact_mls_memberships').select('*').in('contact_id', ids),
    supabase.from('organizations').select('id, name, organization_type').eq('id', 'placeholder').limit(0), // unused placeholder
    supabase.from('client_account_members').select('contact_id, client_account_id').in('contact_id', ids),
  ]);

  const licByContact: Record<string, any[]> = {};
  for (const l of licRes.data ?? []) {
    if (!licByContact[l.contact_id]) licByContact[l.contact_id] = [];
    licByContact[l.contact_id].push(l);
  }

  const mlsByContact: Record<string, any[]> = {};
  for (const m of mlsRes.data ?? []) {
    if (!mlsByContact[m.contact_id]) mlsByContact[m.contact_id] = [];
    mlsByContact[m.contact_id].push(m);
  }

  const orgByContact: Record<string, any[]> = {}; // now unused — org comes from contacts.org_id directly

  const clientByContact: Record<string, string> = {};
  for (const c of clientRes.data ?? []) {
    clientByContact[c.contact_id] = c.client_account_id;
  }

  return data.map(row => ({
    id: row.id,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    fullName: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    email: row.email || '',
    phone: row.phone || '',
    contactType: (row.contact_type || 'other') as ContactRole,
    company: row.company || '',
    timezone: row.timezone || '',
    notes: row.notes || '',
    isActive: row.is_active ?? true,
    createdAt: row.created_at || new Date().toISOString(),
    licenses: (licByContact[row.id] ?? []).map((l: any): ContactLicense => ({
      id: l.id,
      contactId: l.contact_id,
      stateCode: l.state_code,
      licenseType: l.license_type,
      licenseNumber: l.license_number,
      status: l.status,
      brokerOrganizationId: l.broker_organization_id ?? undefined,
      issueDate: l.issue_date ?? undefined,
      expirationDate: l.expiration_date ?? undefined,
      notes: l.notes ?? undefined,
      createdAt: l.created_at || '',
      updatedAt: l.updated_at || '',
      brokerOrganizationName: undefined,
    })),
    mlsMemberships: (mlsByContact[row.id] ?? []).map((m: any): ContactMlsMembership => ({
      id: m.id,
      contactId: m.contact_id,
      mlsName: m.mls_name,
      mlsCode: m.mls_code ?? undefined,
      mlsMemberNumber: m.mls_member_number ?? '',
      officeMlsNumber: m.office_mls_number ?? undefined,
      boardName: m.board_name ?? undefined,
      stateCode: m.state_code ?? undefined,
      status: m.status ?? 'active',
      brokerOrganizationId: m.broker_organization_id ?? undefined,
      startDate: m.start_date ?? undefined,
      endDate: m.end_date ?? undefined,
      notes: m.notes ?? undefined,
      createdAt: m.created_at || '',
      updatedAt: m.updated_at || '',
    })),
    organizations: (orgByContact[row.id] ?? []).map((o: any): OrgMemberInfo => {
      const org = o.organizations as Record<string, string> | null;
      return {
        membershipId: o.id,
        organizationId: o.organization_id,
        organizationName: org?.name ?? '',
        organizationType: org?.organization_type ?? '',
        roleInOrganization: o.role_in_organization ?? '',
      };
    }),
    isClient: !!clientByContact[row.id],
    clientAccountId: clientByContact[row.id] ?? undefined,
    teamName: row.team_name || undefined,
    orgId: row.org_id || undefined,
    defaultInstructions: row.default_instructions || '',
    briefingEnabled: row.briefing_enabled ?? false,
    preferredLanguage: (row.preferred_language || 'en') as 'en' | 'es',
    pin: row.pin ?? undefined,
  }));
}

export async function saveContactRecord(contact: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  contactType: string;
  company: string;
  timezone?: string;
  notes?: string;
  defaultInstructions?: string;
  preferredLanguage?: 'en' | 'es';
  pin?: string;
  teamName?: string;
  orgId?: string;
}): Promise<void> {
  const fullName = `${contact.firstName} ${contact.lastName}`.trim();
  const { error } = await supabase.from('contacts').upsert({
    id: contact.id,
    first_name: contact.firstName,
    last_name: contact.lastName,
    full_name: fullName,
    email: contact.email || null,
    phone: contact.phone || null,
    contact_type: contact.contactType,
    company: contact.company || null,
    timezone: contact.timezone || null,
    notes: contact.notes || null,
    default_instructions: contact.defaultInstructions || null,
    preferred_language: contact.preferredLanguage || 'en',
    pin: contact.pin || null,
    team_name: contact.teamName || null,
    org_id: contact.orgId ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteContactRecord(id: string, staffName: string, contactSnapshot?: Record<string, any>): Promise<void> {
  // Soft-delete: stamp deleted_at + deleted_by instead of hard delete
  const { error } = await supabase
    .from('contacts')
    .update({ deleted_at: new Date().toISOString(), deleted_by: staffName })
    .eq('id', id);
  if (error) throw error;

  // Log to activity_log
  await supabase.from('activity_log').insert({
    action: 'contact_deleted',
    entity_type: 'contact',
    entity_id: id,
    description: `Contact deleted by ${staffName}`,
    performed_by: staffName,
    old_value: contactSnapshot ?? null,
  });
}

export async function loadDeletedContacts(): Promise<ContactRecord[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    email: r.email ?? '',
    phone: r.phone ?? '',
    role: r.role ?? '',
    company: r.company ?? '',
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by,
  } as any));
}

export async function restoreContact(id: string, staffName: string): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id);
  if (error) throw error;

  await supabase.from('activity_log').insert({
    action: 'contact_restored',
    entity_type: 'contact',
    entity_id: id,
    description: `Contact restored by ${staffName}`,
    performed_by: staffName,
  });
}

export async function upsertContactLicense(license: {
  id?: string;
  contactId: string;
  stateCode: string;
  licenseType: string;
  licenseNumber: string;
  status: string;
  brokerOrganizationId?: string;
  issueDate?: string;
  expirationDate?: string;
}): Promise<string> {
  const now = new Date().toISOString();

  if (license.id) {
    const { error: updateErr } = await supabase
      .from('contact_licenses')
      .update({
        state_code: license.stateCode,
        license_type: license.licenseType,
        license_number: license.licenseNumber,
        status: license.status,
        broker_organization_id: license.brokerOrganizationId || null,
        issue_date: license.issueDate || null,
        expiration_date: license.expirationDate || null,
        updated_at: now,
      })
      .eq('id', license.id);
    if (updateErr) throw updateErr;
    return license.id;
  }

  const newId = crypto.randomUUID();
  const { error: insertErr } = await supabase
    .from('contact_licenses')
    .insert({
      id: newId,
      contact_id: license.contactId,
      state_code: license.stateCode,
      license_type: license.licenseType,
      license_number: license.licenseNumber,
      status: license.status,
      broker_organization_id: license.brokerOrganizationId || null,
      issue_date: license.issueDate || null,
      expiration_date: license.expirationDate || null,
      updated_at: now,
    });
  if (insertErr) throw insertErr;
  return newId;
}

export async function deleteContactLicenseRecord(id: string): Promise<void> {
  const { error } = await supabase.from('contact_licenses').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertContactMls(mls: {
  id?: string;
  contactId: string;
  mlsName: string;
  mlsCode?: string;
  mlsMemberNumber: string;
  officeMlsNumber?: string;
  boardName?: string;
  stateCode?: string;
  status?: string;
  brokerOrganizationId?: string;
}): Promise<string> {
  const now = new Date().toISOString();

  // If we have an existing id, try UPDATE first
  if (mls.id) {
    const { error: updateErr } = await supabase
      .from('contact_mls_memberships')
      .update({
        mls_name: mls.mlsName,
        mls_code: mls.mlsCode || null,
        mls_member_number: mls.mlsMemberNumber,
        office_mls_number: mls.officeMlsNumber || null,
        board_name: mls.boardName || null,
        state_code: mls.stateCode || null,
        status: mls.status || 'active',
        broker_organization_id: mls.brokerOrganizationId || null,
        updated_at: now,
      })
      .eq('id', mls.id);
    if (updateErr) throw updateErr;
    return mls.id;
  }

  // New entry — INSERT (ignore duplicate composite key by using ON CONFLICT DO NOTHING then fetch)
  const newId = crypto.randomUUID();
  const { error: insertErr } = await supabase
    .from('contact_mls_memberships')
    .insert({
      id: newId,
      contact_id: mls.contactId,
      mls_name: mls.mlsName,
      mls_code: mls.mlsCode || null,
      mls_member_number: mls.mlsMemberNumber,
      office_mls_number: mls.officeMlsNumber || null,
      board_name: mls.boardName || null,
      state_code: mls.stateCode || null,
      status: mls.status || 'active',
      broker_organization_id: mls.brokerOrganizationId || null,
      updated_at: now,
    });
  if (insertErr) throw insertErr;
  return newId;
}

export async function deleteContactMlsRecord(id: string): Promise<void> {
  const { error } = await supabase.from('contact_mls_memberships').delete().eq('id', id);
  if (error) throw error;
}

// ── PHONE CHANNELS (Phase 5) ────────────────────────────────────────────────

export async function loadPhoneChannels(contactId?: string): Promise<ContactPhoneChannel[]> {
  let query = supabase
    .from('contact_phone_channels')
    .select(`*, contacts:contact_id ( full_name, contact_type )`)
    .order('created_at', { ascending: true });

  if (contactId) {
    query = query.eq('contact_id', contactId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const c = row.contacts as Record<string, string> | null;
    return {
      id: row.id,
      contactId: row.contact_id,
      clientAccountId: row.client_account_id ?? undefined,
      phoneE164: row.phone_e164,
      label: row.label ?? undefined,
      isVerified: row.is_verified,
      canCallIn: row.can_call_in,
      canReceiveTexts: row.can_receive_texts,
      canRequestUpdates: row.can_request_updates,
      canSubmitVoiceUpdates: row.can_submit_voice_updates,
      canRequestCallback: row.can_request_callback,
      isPrimary: row.is_primary,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contactName: c?.full_name ?? undefined,
      contactType: c?.contact_type ?? undefined,
    };
  });
}

export async function savePhoneChannel(channel: Partial<ContactPhoneChannel> & { contactId: string; phoneE164: string }): Promise<string> {
  const row = {
    id: channel.id || crypto.randomUUID(),
    contact_id: channel.contactId,
    client_account_id: channel.clientAccountId || null,
    phone_e164: channel.phoneE164,
    label: channel.label || 'mobile',
    is_verified: channel.isVerified ?? true,
    can_call_in: channel.canCallIn ?? true,
    can_receive_texts: channel.canReceiveTexts ?? true,
    can_request_updates: channel.canRequestUpdates ?? true,
    can_submit_voice_updates: channel.canSubmitVoiceUpdates ?? true,
    can_request_callback: channel.canRequestCallback ?? true,
    is_primary: channel.isPrimary ?? false,
    status: channel.status || 'active',
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('contact_phone_channels').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return row.id;
}

export async function deletePhoneChannel(id: string): Promise<void> {
  const { error } = await supabase.from('contact_phone_channels').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Sync a client contact's phone number into contact_phone_channels.
 * Upserts by contact_id — safe to call on every contact save.
 * Only call when the contact is a client (has a clientAccountId).
 */
export async function syncPhoneChannel(
  contactId: string,
  clientAccountId: string,
  phoneE164: string,
): Promise<void> {
  // Find existing row for this contact so we can upsert on the same id
  const { data: existing } = await supabase
    .from('contact_phone_channels')
    .select('id')
    .eq('contact_id', contactId)
    .maybeSingle();

  const { error } = await supabase.from('contact_phone_channels').upsert(
    {
      id: existing?.id ?? crypto.randomUUID(),
      contact_id: contactId,
      client_account_id: clientAccountId,
      phone_e164: phoneE164,
      label: 'mobile',
      is_verified: true,
      can_call_in: true,
      can_receive_texts: true,
      can_request_updates: true,
      can_submit_voice_updates: true,
      can_request_callback: true,
      is_primary: true,
      status: 'active',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

// ── VOICE DEAL UPDATES (Phase 5) ────────────────────────────────────────────

export async function loadVoiceDealUpdates(filters?: { dealId?: string; status?: string }): Promise<VoiceDealUpdate[]> {
  let query = supabase
    .from('voice_deal_updates')
    .select(`*, contacts:caller_contact_id ( full_name ), deals:deal_id ( property_address )`)
    .order('created_at', { ascending: false });

  if (filters?.dealId) query = query.eq('deal_id', filters.dealId);
  if (filters?.status) query = query.eq('review_status', filters.status);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const c = row.contacts as Record<string, string> | null;
    const d = row.deals as Record<string, string> | null;
    return {
      id: row.id,
      dealId: row.deal_id ?? undefined,
      callerContactId: row.caller_contact_id ?? undefined,
      callerClientAccountId: row.caller_client_account_id ?? undefined,
      phoneE164: row.phone_e164,
      callSid: row.call_sid ?? undefined,
      recordingSid: row.recording_sid ?? undefined,
      recordingUrl: row.recording_url ?? undefined,
      recordingDuration: row.recording_duration ?? undefined,
      transcript: row.transcript ?? undefined,
      aiSummary: row.ai_summary ?? undefined,
      aiAnalysis: row.ai_analysis ?? undefined,
      suggestedActions: row.suggested_actions ?? undefined,
      confidenceLevel: row.confidence_level,
      reviewStatus: row.review_status,
      reviewedBy: row.reviewed_by ?? undefined,
      reviewedAt: row.reviewed_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contactName: c?.full_name ?? undefined,
      dealAddress: d?.property_address ?? undefined,
    };
  });
}

export async function updateVoiceDealUpdateStatus(id: string, status: string, reviewedBy?: string): Promise<void> {
  const update: Record<string, unknown> = {
    review_status: status,
    updated_at: new Date().toISOString(),
  };
  if (reviewedBy) {
    update.reviewed_by = reviewedBy;
    update.reviewed_at = new Date().toISOString();
  }
  const { error } = await supabase.from('voice_deal_updates').update(update).eq('id', id);
  if (error) throw error;
}

// ── CALLBACK REQUESTS (Phase 5) ─────────────────────────────────────────────

export async function loadCallbackRequests(filters?: { status?: string; dealId?: string }): Promise<CallbackRequest[]> {
  let query = supabase
    .from('callback_requests')
    .select(`*, contacts:caller_contact_id ( full_name ), deals:deal_id ( property_address )`)
    .order('requested_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.dealId) query = query.eq('deal_id', filters.dealId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const c = row.contacts as Record<string, string> | null;
    const d = row.deals as Record<string, string> | null;
    return {
      id: row.id,
      dealId: row.deal_id ?? undefined,
      callerContactId: row.caller_contact_id ?? undefined,
      callerClientAccountId: row.caller_client_account_id ?? undefined,
      phoneE164: row.phone_e164,
      requestedByChannel: row.requested_by_channel,
      reason: row.reason ?? undefined,
      priority: row.priority,
      status: row.status,
      assignedUserId: row.assigned_user_id ?? undefined,
      requestedAt: row.requested_at,
      acknowledgedAt: row.acknowledged_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      notes: row.notes ?? undefined,
      contactName: c?.full_name ?? undefined,
      dealAddress: d?.property_address ?? undefined,
    };
  });
}

export async function updateCallbackRequestStatus(id: string, status: string, notes?: string): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (status === 'acknowledged') update.acknowledged_at = new Date().toISOString();
  if (status === 'completed') update.completed_at = new Date().toISOString();
  if (notes) update.notes = notes;
  const { error } = await supabase.from('callback_requests').update(update).eq('id', id);
  if (error) throw error;
}

// ── COMMUNICATION EVENTS (Phase 5) ──────────────────────────────────────────

export async function loadCommunicationEvents(filters?: { dealId?: string; contactId?: string; limit?: number }): Promise<CommunicationEvent[]> {
  let query = supabase
    .from('communication_events')
    .select(`*, contacts:contact_id ( full_name ), deals:deal_id ( property_address )`)
    .order('created_at', { ascending: false });

  if (filters?.dealId) query = query.eq('deal_id', filters.dealId);
  if (filters?.contactId) query = query.eq('contact_id', filters.contactId);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const c = row.contacts as Record<string, string> | null;
    const d = row.deals as Record<string, string> | null;
    return {
      id: row.id,
      dealId: row.deal_id ?? undefined,
      contactId: row.contact_id ?? undefined,
      clientAccountId: row.client_account_id ?? undefined,
      channel: row.channel,
      direction: row.direction,
      eventType: row.event_type,
      summary: row.summary ?? undefined,
      transcript: row.transcript ?? undefined,
      recordingUrl: row.recording_url ?? undefined,
      sourceRef: row.source_ref ?? undefined,
      metadata: row.metadata ?? undefined,
      createdAt: row.created_at,
      contactName: c?.full_name ?? undefined,
      dealAddress: d?.property_address ?? undefined,
    };
  });
}

// ── CHANGE REQUESTS (Phase 5) ───────────────────────────────────────────────

export async function loadChangeRequests(filters?: { dealId?: string; status?: string }): Promise<ChangeRequest[]> {
  let query = supabase
    .from('change_requests')
    .select(`*, contacts:requested_by_contact_id ( full_name ), deals:deal_id ( property_address )`)
    .order('created_at', { ascending: false });

  if (filters?.dealId) query = query.eq('deal_id', filters.dealId);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const c = row.contacts as Record<string, string> | null;
    const d = row.deals as Record<string, string> | null;
    return {
      id: row.id,
      dealId: row.deal_id,
      requestedByContactId: row.requested_by_contact_id ?? undefined,
      requestedByClientAccountId: row.requested_by_client_account_id ?? undefined,
      sourceEventId: row.source_event_id ?? undefined,
      sourceChannel: row.source_channel,
      changeType: row.change_type,
      requestedChangeText: row.requested_change_text,
      aiStructuredPayload: row.ai_structured_payload ?? undefined,
      impactLevel: row.impact_level,
      status: row.status,
      assignedReviewerUserId: row.assigned_reviewer_user_id ?? undefined,
      reviewedByUserId: row.reviewed_by_user_id ?? undefined,
      reviewedAt: row.reviewed_at ?? undefined,
      appliedAt: row.applied_at ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contactName: c?.full_name ?? undefined,
      dealAddress: d?.property_address ?? undefined,
    };
  });
}

export async function updateChangeRequestStatus(id: string, status: ChangeStatus, reviewedBy?: string, notes?: string): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (reviewedBy) {
    update.reviewed_by_user_id = reviewedBy;
    update.reviewed_at = new Date().toISOString();
  }
  if (status === 'applied') update.applied_at = new Date().toISOString();
  if (notes !== undefined) update.notes = notes;
  const { error } = await supabase.from('change_requests').update(update).eq('id', id);
  if (error) throw error;
}

// ── AMBIGUITY QUEUE (Phase 5) ───────────────────────────────────────────────

export async function loadAmbiguityQueue(): Promise<AmbiguityQueueItem[]> {
  const { data, error } = await supabase
    .from('ambiguity_queue')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    channel: row.channel,
    phoneE164: row.phone_e164,
    body: row.body ?? undefined,
    callSid: row.call_sid ?? undefined,
    likelyContactIds: row.likely_contact_ids ?? undefined,
    likelyDealIds: row.likely_deal_ids ?? undefined,
    confidenceLevel: row.confidence_level,
    status: row.status,
    resolvedBy: row.resolved_by ?? undefined,
    resolutionNotes: row.resolution_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function resolveAmbiguityItem(id: string, resolution: { contactId?: string; resolvedBy: string; notes: string }): Promise<void> {
  const { error } = await supabase
    .from('ambiguity_queue')
    .update({
      status: 'resolved',
      resolved_by: resolution.resolvedBy,
      resolution_notes: resolution.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// ── CLIENT DEAL SUMMARY (Phase 5) ──────────────────────────────────────────

export async function buildClientDealSummary(dealId: string): Promise<string> {
  const { data, error } = await supabase
    .from('deals')
    .select('property_address, city, state, pipeline_stage, closing_date, status')
    .eq('id', dealId)
    .single();

  if (error || !data) return 'Deal not found.';

  const milestoneLabels: Record<string, string> = {
    'contract-received': 'Contract Received',
    'emd-due': 'EMD Due',
    'inspections-due': 'Inspections Due',
    'appraisal-ordered': 'Appraisal Ordered',
    'appraisal-received': 'Appraisal Received',
    'title-opened': 'Title Opened',
    'loan-commitment': 'Loan Commitment',
    'closing-scheduled': 'Closing Scheduled',
    'clear-to-close': 'Clear to Close',
    'closed': 'Closed',
  };

  const address = data.property_address || 'Unknown';
  const cityState = [data.city, data.state].filter(Boolean).join(', ');
  const milestone = milestoneLabels[data.pipeline_stage] || data.pipeline_stage || 'Unknown';
  const closing = data.closing_date ? new Date(data.closing_date).toLocaleDateString() : 'TBD';

  return `📋 ${address}${cityState ? `, ${cityState}` : ''}\n📌 Status: ${milestone}\n📅 Closing: ${closing}`;
}

// ── SCHEDULED EMAILS ────────────────────────────────────────────────────────

export async function loadScheduledEmails(
  filters?: { dealId?: string; status?: string }
): Promise<ScheduledEmail[]> {
  let query = supabase
    .from('scheduled_emails')
    .select(`
      id,
      deal_id,
      template_id,
      to_addresses,
      cc_addresses,
      bcc_addresses,
      subject,
      body_html,
      scheduled_at,
      status,
      error_message,
      retry_count,
      email_type,
      created_by,
      created_at,
      updated_at,
      deals ( property_address ),
      email_templates ( name )
    `)
    .order('scheduled_at', { ascending: false });

  if (filters?.dealId) {
    query = query.eq('deal_id', filters.dealId);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading scheduled emails:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    dealId: row.deal_id,
    templateId: row.template_id,
    toAddresses: row.to_addresses || [],
    ccAddresses: row.cc_addresses || [],
    bccAddresses: row.bcc_addresses || [],
    subject: row.subject,
    bodyHtml: row.body_html,
    scheduledAt: row.scheduled_at,
    status: row.status,
    errorMessage: row.error_message,
    retryCount: row.retry_count ?? 0,
    emailType: row.email_type,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dealAddress: row.deals?.property_address,
    templateName: row.email_templates?.name,
  }));
}

export async function createScheduledEmail(email: {
  dealId?: string;
  templateId?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject: string;
  bodyHtml: string;
  scheduledAt: string;
  emailType: EmailType;
  createdBy?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('scheduled_emails')
    .insert({
      deal_id: email.dealId || null,
      template_id: email.templateId || null,
      to_addresses: email.toAddresses,
      cc_addresses: email.ccAddresses || [],
      bcc_addresses: email.bccAddresses || [],
      subject: email.subject,
      body_html: email.bodyHtml,
      scheduled_at: email.scheduledAt,
      status: 'pending',
      retry_count: 0,
      email_type: email.emailType,
      created_by: email.createdBy || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating scheduled email:', error);
    throw new Error('Failed to schedule email');
  }

  return data.id;
}

export async function cancelScheduledEmail(id: string): Promise<void> {
  const { error } = await supabase
    .from('scheduled_emails')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['pending', 'processing']);

  if (error) {
    console.error('Error cancelling scheduled email:', error);
    throw new Error('Failed to cancel scheduled email');
  }
}

// ── EMAIL SEND LOG ──────────────────────────────────────────────────────────

export async function loadEmailSendLog(
  filters?: { dealId?: string; limit?: number }
): Promise<EmailSendLogEntry[]> {
  const limit = filters?.limit ?? 50;

  let query = supabase
    .from('email_send_log')
    .select(`
      id,
      deal_id,
      template_id,
      template_name,
      to_addresses,
      cc_addresses,
      subject,
      body_html,
      gmail_message_id,
      gmail_thread_id,
      email_type,
      sent_by,
      sent_at
    `)
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (filters?.dealId) {
    query = query.eq('deal_id', filters.dealId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading email send log:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    dealId: row.deal_id,
    templateId: row.template_id,
    templateName: row.template_name,
    toAddresses: row.to_addresses || [],
    ccAddresses: row.cc_addresses || [],
    subject: row.subject,
    bodyHtml: row.body_html,
    gmailMessageId: row.gmail_message_id,
    gmailThreadId: row.gmail_thread_id,
    emailType: row.email_type,
    sentBy: row.sent_by,
    sentAt: row.sent_at,
  }));
}

export async function logEmailSend(entry: {
  dealId?: string;
  templateId?: string;
  templateName?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  subject: string;
  bodyHtml: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  emailType: EmailType;
  sentBy?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('email_send_log')
    .insert({
      deal_id: entry.dealId || null,
      template_id: entry.templateId || null,
      template_name: entry.templateName || null,
      to_addresses: entry.toAddresses,
      cc_addresses: entry.ccAddresses || [],
      subject: entry.subject,
      body_html: entry.bodyHtml,
      gmail_message_id: entry.gmailMessageId || null,
      gmail_thread_id: entry.gmailThreadId || null,
      email_type: entry.emailType,
      sent_by: entry.sentBy || null,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error logging email send:', error);
    throw new Error('Failed to log email send');
  }

  return data.id;
}

// ── BRIEFING CONFIG ─────────────────────────────────────────────────────────

export async function loadBriefingConfig(): Promise<BriefingConfig | null> {
  const { data, error } = await supabase
    .from('briefing_config')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    console.error('Error loading briefing config:', error);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    enabled: data.enabled ?? false,
    sendTime: data.send_time ?? '08:00',
    timezone: data.timezone ?? 'America/Chicago',
    toAddresses: data.to_addresses || [],
    templateId: data.template_id || undefined,
    includeOverdueTasks: data.include_overdue_tasks ?? true,
    includeUpcomingCloses: data.include_upcoming_closes ?? true,
    includePendingDocs: data.include_pending_docs ?? true,
    includeNewEmails: data.include_new_emails ?? true,
    lastSentAt: data.last_sent_at || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function saveBriefingConfig(config: Partial<BriefingConfig>): Promise<void> {
  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (config.enabled !== undefined) payload.enabled = config.enabled;
  if (config.sendTime !== undefined) payload.send_time = config.sendTime;
  if (config.timezone !== undefined) payload.timezone = config.timezone;
  if (config.toAddresses !== undefined) payload.to_addresses = config.toAddresses;
  if (config.templateId !== undefined) payload.template_id = config.templateId || null;
  if (config.includeOverdueTasks !== undefined) payload.include_overdue_tasks = config.includeOverdueTasks;
  if (config.includeUpcomingCloses !== undefined) payload.include_upcoming_closes = config.includeUpcomingCloses;
  if (config.includePendingDocs !== undefined) payload.include_pending_docs = config.includePendingDocs;
  if (config.includeNewEmails !== undefined) payload.include_new_emails = config.includeNewEmails;

  if (config.id) {
    const { error } = await supabase
      .from('briefing_config')
      .update(payload)
      .eq('id', config.id);

    if (error) {
      console.error('Error updating briefing config:', error);
      throw new Error('Failed to update briefing config');
    }
  } else {
    const { error } = await supabase
      .from('briefing_config')
      .insert({
        ...payload,
        enabled: payload.enabled ?? false,
        send_time: payload.send_time ?? '08:00',
        timezone: payload.timezone ?? 'America/Chicago',
        to_addresses: payload.to_addresses ?? [],
        include_overdue_tasks: payload.include_overdue_tasks ?? true,
        include_upcoming_closes: payload.include_upcoming_closes ?? true,
        include_pending_docs: payload.include_pending_docs ?? true,
        include_new_emails: payload.include_new_emails ?? true,
      });

    if (error) {
      console.error('Error creating briefing config:', error);
      throw new Error('Failed to create briefing config');
    }
  }
}


// ── Agent Team Members ──────────────────────────────────────────────────────

export async function getAgentTeamMembers(supabase: any, agentContactId: string) {
  const { data, error } = await supabase
    .from('agent_team_members')
    .select('*')
    .eq('agent_contact_id', agentContactId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    agentContactId: r.agent_contact_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    notifyEmail: r.notify_email,
    notifySms: r.notify_sms,
    createdAt: r.created_at,
  }));
}

export async function addAgentTeamMember(supabase: any, member: {
  agentContactId: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  notifyEmail?: boolean;
  notifySms?: boolean;
}) {
  const { data, error } = await supabase
    .from('agent_team_members')
    .insert({
      agent_contact_id: member.agentContactId,
      name: member.name,
      email: member.email || null,
      phone: member.phone || null,
      role: member.role || 'assistant',
      notify_email: member.notifyEmail ?? true,
      notify_sms: member.notifySms ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAgentTeamMember(supabase: any, id: string, updates: {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  notifyEmail?: boolean;
  notifySms?: boolean;
}) {
  const payload: any = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.phone !== undefined) payload.role = updates.role;
  if (updates.notifyEmail !== undefined) payload.notify_email = updates.notifyEmail;
  if (updates.notifySms !== undefined) payload.notify_sms = updates.notifySms;
  const { error } = await supabase.from('agent_team_members').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteAgentTeamMember(supabase: any, id: string) {
  const { error } = await supabase.from('agent_team_members').delete().eq('id', id);
  if (error) throw error;
}

export async function getAgentTeamEmailsForCC(supabase: any, agentContactId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('agent_team_members')
    .select('email')
    .eq('agent_contact_id', agentContactId)
    .eq('notify_email', true)
    .not('email', 'is', null);
  if (error) return [];
  return (data || []).map((r: any) => r.email).filter(Boolean);
}

export async function getAgentTeamPhonesForSMS(supabase: any, agentContactId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('agent_team_members')
    .select('phone')
    .eq('agent_contact_id', agentContactId)
    .eq('notify_sms', true)
    .not('phone', 'is', null);
  if (error) return [];
  return (data || []).map((r: any) => r.phone).filter(Boolean);
}

// ── Org Management ────────────────────────────────────────────────────────

export interface OrgMemberRecord {
  membershipId: string;
  userId: string;
  roleInOrg: 'team_admin' | 'tc' | 'agent';
  status: 'active' | 'inactive' | 'pending';
  invitedAt: string | null;
  joinedAt: string | null;
  profile: {
    id: string;
    name: string;
    phone: string;
    role: string;
    isActive: boolean;
    lastLogin: string | null;
    isMasterAdmin: boolean;
  } | null;
}

export async function listOrgMembers(token: string, orgId: string): Promise<OrgMemberRecord[]> {
  const res = await fetch(`/api/auth?action=org-management&orgId=${orgId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to list org members');
  return data.members ?? [];
}

export async function listAllOrgs(token: string): Promise<{ id: string; name: string; orgCode: string; isActive: boolean; organizationType: string }[]> {
  const res = await fetch(`/api/auth?action=org-management&listOrgs=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to list orgs');
  return (data.orgs ?? []).map((o: any) => ({
    id: o.id,
    name: o.name,
    orgCode: o.org_code,
    isActive: o.is_active,
    organizationType: o.organization_type,
  }));
}

export async function addOrgMember(token: string, orgId: string, profileId: string, roleInOrg: string): Promise<void> {
  const res = await fetch('/api/auth?action=org-management', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'add-member', orgId, profileId, roleInOrg }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to add member');
}

export async function updateOrgMemberRole(token: string, membershipId: string, roleInOrg: string): Promise<void> {
  const res = await fetch('/api/auth?action=org-management', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'update-role', membershipId, roleInOrg }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to update role');
}

export async function removeOrgMember(token: string, membershipId: string): Promise<void> {
  const res = await fetch('/api/auth?action=org-management', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'remove-member', membershipId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to remove member');
}

export async function grantDealAccess(token: string, dealId: string, profileId: string): Promise<void> {
  const res = await fetch('/api/auth?action=org-management', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'grant-deal-access', dealId, profileId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to grant deal access');
}

export async function revokeDealAccess(token: string, dealId: string, profileId: string): Promise<void> {
  const res = await fetch('/api/auth?action=org-management', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'revoke-deal-access', dealId, profileId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to revoke deal access');
}

// ─── ORG TC PICKER ─────────────────────────────────────────────────────────

export async function loadProfilesForOrg(orgId: string): Promise<{ id: string; name: string; role: string }[]> {
  const { data, error } = await supabase
    .from('user_org_memberships')
    .select('profiles!inner(id, name, role)')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .in('role_in_org', ['tc', 'team_admin']);

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.profiles.id as string,
    name: row.profiles.name as string,
    role: row.profiles.role as string,
  }));
}

// ─── DEAL ACCESS ─────────────────────────────────────────────────────────────

export async function loadDealAccessGrants(dealId: string): Promise<{ id: string; userId: string; userName: string; grantedAt: string }[]> {
  const { data, error } = await supabase
    .from('deal_access')
    .select('id, user_id, granted_at, profiles!inner(name)')
    .eq('deal_id', dealId);

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    userId: row.user_id as string,
    userName: row.profiles.name as string,
    grantedAt: row.granted_at as string,
  }));
}


/**
 * Generates a signed URL for a document stored in Supabase storage.
 * @param storagePath - The file path within the storage bucket
 * @param expiresIn - Expiry in seconds (default: 3600 = 1 hour)
 * @returns The signed URL string, or null on error
 */
export const getDocumentSignedUrl = async (
  storagePath: string,
  expiresIn: number = 3600
): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from('deal-documents')
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};
