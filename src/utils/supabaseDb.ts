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
  DirectoryContact,
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
} from '../types';

// ─── DEAL PARTICIPANTS ──────────────────────────────────────────────────────

async function loadDealParticipants(dealIds: string[]): Promise<Record<string, DealParticipant[]>> {
  if (dealIds.length === 0) return {};

  const { data, error } = await supabase
    .from('deal_participants')
    .select(`
      id, deal_id, contact_id, organization_id, client_account_id,
      side, deal_role, is_primary, is_client_side, notes,
      created_at, updated_at,
      contacts:contact_id ( first_name, last_name, full_name, email, phone ),
      organizations:organization_id ( name )
    `)
    .in('deal_id', dealIds);

  if (error) throw error;

  const byDeal: Record<string, DealParticipant[]> = {};
  for (const row of data ?? []) {
    // Supabase FK joins return single object (not array) for to-one relations
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

/**
 * Build legacy Contact[] from DealParticipant[] for backward compatibility.
 * Components that still read deal.contacts will get data from participants.
 */
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
  return 'both';
}

/**
 * Build legacy AgentContact from participants
 */
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

export async function loadDeals(): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select(`
      id, property_address, city, state, zip, mls_number,
      deal_type, status, pipeline_stage,
      contract_date, closing_date, purchase_price, notes,
      primary_client_account_id, transaction_type, risk_level,
      assigned_tc_user_id, assigned_compliance_user_id,
      deal_data, created_at, updated_at
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Load participants for all deals in one query
  const dealIds = data.map((r) => r.id);
  const participantsByDeal = await loadDealParticipants(dealIds);

  return data.map((row) => {
    const dd = (row.deal_data as Record<string, unknown>) || {};
    const participants = participantsByDeal[row.id] || [];
    const clientAgent = findAgentFromParticipants(participants, 'listing');

    const deal: Deal = {
      id: row.id,

      // Property info — relational columns are source of truth
      propertyAddress: row.property_address || (dd.address as string) || '',
      city: row.city || (dd.city as string) || '',
      state: row.state || (dd.state as string) || '',
      zipCode: row.zip || (dd.zipCode as string) || '',
      mlsNumber: row.mls_number || (dd.mlsNumber as string) || '',
      listPrice: (dd.listPrice as number) ?? 0,
      contractPrice: row.purchase_price ?? (dd.contractPrice as number) ?? 0,
      propertyType: ((dd.propertyType as string) || 'single-family') as PropertyType,

      // Status
      status: (row.status || (dd.status as string) || 'contract') as DealStatus,
      milestone: (row.pipeline_stage || (dd.milestone as string) || 'contract-received') as DealMilestone,
      transactionType: (row.transaction_type || row.deal_type || (dd.transactionSide as string) || 'buyer') as TransactionType,
      riskLevel: row.risk_level || 'normal',

      // Dates
      contractDate: row.contract_date || (dd.contractDate as string) || '',
      closingDate: row.closing_date || (dd.closingDate as string) || '',

      // Phase 4 relational
      primaryClientAccountId: row.primary_client_account_id ?? undefined,
      assignedTcUserId: row.assigned_tc_user_id ?? undefined,
      assignedComplianceUserId: row.assigned_compliance_user_id ?? undefined,
      participants,

      // Legacy agent fields (populated from participants) — required strings
      agentId: (clientAgent?.isOurClient ? participants.find((p) => p.isClientSide && p.dealRole === 'lead_agent')?.contactId : (dd.agentId as string)) || '',
      agentName: clientAgent?.name || (dd.agentName as string) || '',
      agentClientId: (dd.agentClientId as string) ?? undefined,
      complianceTemplateId: (dd.complianceTemplateId as string) ?? undefined,
      buyerAgent: findAgentFromParticipants(participants, 'buyer') ?? (dd.buyerAgent as AgentContact) ?? undefined,
      sellerAgent: findAgentFromParticipants(participants, 'listing') ?? (dd.sellerAgent as AgentContact) ?? undefined,

      // Legacy contacts array (built from participants)
      contacts: participantsToLegacyContacts(participants),

      // Embedded arrays (still from deal_data JSONB during transition)
      dueDiligenceChecklist: (dd.dueDiligenceChecklist as ChecklistItem[]) ?? [],
      complianceChecklist: (dd.complianceChecklist as ChecklistItem[]) ?? [],
      documentRequests: (dd.documentRequests as DocumentRequest[]) ?? [],
      reminders: (dd.reminders as Reminder[]) ?? [],
      activityLog: (dd.activityLog as ActivityEntry[]) ?? [],
      tasks: (dd.tasks as DealTask[]) ?? [],

      notes: row.notes || (dd.notes as string) || '',
      archiveReason: (dd.archiveReason as string) ?? undefined,
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
    deal_type: deal.transactionType || 'buyer',
    status: deal.status ?? 'contract',
    pipeline_stage: deal.milestone ?? 'contract-received',
    contract_date: deal.contractDate || null,
    closing_date: deal.closingDate || null,
    purchase_price: deal.contractPrice ?? null,
    notes: deal.notes ?? null,
    primary_client_account_id: deal.primaryClientAccountId ?? null,
    transaction_type: deal.transactionType || 'buyer',
    risk_level: deal.riskLevel || 'normal',
    assigned_tc_user_id: deal.assignedTcUserId ?? null,
    assigned_compliance_user_id: deal.assignedComplianceUserId ?? null,
    deal_data: dealToJsonBackup(deal), // JSONB backup during transition
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase.from('deals').upsert(rows, {
    onConflict: 'id',
  });
  if (upsertError) throw upsertError;

  // Delete removed deals
  const newIds = deals.map((d) => d.id);
  const { data: existing } = await supabase.from('deals').select('id');
  const toDelete = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    await supabase.from('deals').delete().in('id', toDelete);
  }
}

export async function saveSingleDeal(deal: Deal): Promise<void> {
  const { error } = await supabase.from('deals').upsert(
    {
      id: deal.id,
      property_address: deal.propertyAddress || '',
      city: deal.city ?? null,
      state: deal.state ?? null,
      zip: deal.zipCode ?? null,
      mls_number: deal.mlsNumber ?? null,
      deal_type: deal.transactionType || 'buyer',
      status: deal.status ?? 'contract',
      pipeline_stage: deal.milestone ?? 'contract-received',
      contract_date: deal.contractDate || null,
      closing_date: deal.closingDate || null,
      purchase_price: deal.contractPrice ?? null,
      notes: deal.notes ?? null,
      primary_client_account_id: deal.primaryClientAccountId ?? null,
      transaction_type: deal.transactionType || 'buyer',
      risk_level: deal.riskLevel || 'normal',
      assigned_tc_user_id: deal.assignedTcUserId ?? null,
      assigned_compliance_user_id: deal.assignedComplianceUserId ?? null,
      deal_data: dealToJsonBackup(deal),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

/**
 * Build JSONB backup that preserves the old format for deal_data.
 * This keeps api/chat.ts and other server-side consumers working during migration.
 */
function dealToJsonBackup(deal: Deal): Record<string, unknown> {
  return {
    ...deal,
    // Ensure old field names are present in JSONB for backward compat
    address: deal.propertyAddress || '',
    transactionSide: deal.transactionType || 'buyer',
  };
}

export async function deleteDeal(id: string): Promise<void> {
  // Also delete participants (CASCADE handles this)
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

// ─── DIRECTORY CONTACTS ─────────────────────────────────────────────────────
// Phase 4A: Reads from contacts table + joins, but returns DirectoryContact shape
// for backward compatibility with ContactsDirectory.tsx

export async function loadDirectory(): Promise<DirectoryContact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select(`
      id, first_name, last_name, full_name, email, phone, contact_type, company,
      license_number, timezone, created_at
    `)
    .order('last_name', { ascending: true });

  if (error) throw error;

  // Also load all licenses and org memberships for directory view
  const contactIds = (data ?? []).map((r) => r.id);

  const [licenseRes, orgMemberRes] = await Promise.all([
    contactIds.length > 0
      ? supabase.from('contact_licenses').select('contact_id, state_code, license_number, status').in('contact_id', contactIds)
      : Promise.resolve({ data: [], error: null }),
    contactIds.length > 0
      ? supabase.from('organization_members').select('contact_id, organization_id, organizations:organization_id ( name )').in('contact_id', contactIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Build license lookup: contactId → state_code[]
  const licensesByContact: Record<string, string[]> = {};
  for (const lic of licenseRes.data ?? []) {
    if (!licensesByContact[lic.contact_id]) licensesByContact[lic.contact_id] = [];
    licensesByContact[lic.contact_id].push(lic.state_code);
  }

  // Build org lookup: contactId → org name
  const orgByContact: Record<string, string> = {};
  for (const om of orgMemberRes.data ?? []) {
    const o = om.organizations as unknown as Record<string, string> | null;
    if (o?.name) orgByContact[om.contact_id] = o.name;
  }

  // Also check client_accounts for clientId
  const { data: clientMembers } = await supabase
    .from('client_account_members')
    .select('contact_id, client_account_id')
    .in('contact_id', contactIds)
    .eq('is_primary', true);

  const clientByContact: Record<string, string> = {};
  for (const cm of clientMembers ?? []) {
    if (cm.contact_id) clientByContact[cm.contact_id] = cm.client_account_id;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    email: row.email || '',
    phone: row.phone || '',
    role: row.contact_type || 'other',
    company: orgByContact[row.id] || row.company || undefined,
    states: licensesByContact[row.id] || undefined,
    mlsIds: undefined, // Will be populated when MLS memberships have data
    clientId: clientByContact[row.id] || undefined,
    isTeam: false,
    notes: undefined,
    createdAt: row.created_at || new Date().toISOString(),
  }));
}

export async function saveDirectory(contacts: DirectoryContact[]): Promise<void> {
  if (contacts.length === 0) {
    // Don't delete all contacts — they're referenced by participants
    return;
  }

  // Upsert into contacts table (relational)
  const rows = contacts.map((c) => {
    const nameParts = c.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    return {
      id: c.id,
      first_name: firstName,
      last_name: lastName,
      full_name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      contact_type: c.role,
      company: c.company ?? null,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase.from('contacts').upsert(rows, { onConflict: 'id' });
  if (error) throw error;

  // Also write to directory_contacts for backward compat during migration
  const legacyRows = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    role: c.role,
    company: c.company ?? null,
    data: c,
    updated_at: new Date().toISOString(),
  }));

  await supabase.from('directory_contacts').upsert(legacyRows, { onConflict: 'id' });
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

export async function loadCompliance(): Promise<ComplianceTemplate[]> {
  const { data, error } = await supabase
    .from('app_compliance_templates')
    .select('data')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.data as ComplianceTemplate);
}

export async function saveCompliance(templates: ComplianceTemplate[]): Promise<void> {
  if (templates.length === 0) {
    await supabase.from('app_compliance_templates').delete().neq('id', '');
    return;
  }

  const rows = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    state: t.state ?? null,
    data: t,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('app_compliance_templates').upsert(rows, { onConflict: 'id' });
  if (error) throw error;

  const newIds = templates.map((t) => t.id);
  const { data: existing } = await supabase.from('app_compliance_templates').select('id');
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
    .from('app_users')
    .select('id, name, email, role, active, created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as AppUser['role'],
    active: row.active as boolean,
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

export async function loadEmailTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('id, name, subject, body, buttons, is_default, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    subject: row.subject as string,
    body: row.body as string,
    buttons: (row.buttons as EmailTemplate['buttons']) ?? [],
    isDefault: row.is_default as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function saveEmailTemplates(templates: EmailTemplate[]): Promise<void> {
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
  const { data, error } = await supabase
    .from('master_items')
    .select('id, title, required, order_index')
    .eq('type', type)
    .order('order_index', { ascending: true });

  if (error) throw error;

  if (type === 'compliance') {
    return (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      order: row.order_index as number,
    })) as ComplianceMasterItem[];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    required: row.required as boolean,
    order: row.order_index as number,
  })) as DDMasterItem[];
}

export async function saveMasterItems(
  type: 'compliance' | 'dd',
  items: ComplianceMasterItem[] | DDMasterItem[],
): Promise<void> {
  await supabase.from('master_items').delete().eq('type', type);

  if (items.length === 0) return;

  const rows = items.map((item, idx) => ({
    id: item.id,
    type,
    title: item.title,
    required: (item as DDMasterItem).required ?? false,
    order_index: item.order ?? idx,
  }));

  const { error } = await supabase.from('master_items').insert(rows);
  if (error) throw error;
}

// ─── ACTIVITY LOG (write-only for automation) ────────────────────────────────

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
    .select('*')
    .order('last_name', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const ids = data.map(r => r.id);

  // Parallel load all relations
  const [licRes, mlsRes, orgRes, clientRes] = await Promise.all([
    supabase.from('contact_licenses').select('*').in('contact_id', ids),
    supabase.from('contact_mls_memberships').select('*').in('contact_id', ids),
    supabase.from('organization_members').select('*, organizations:organization_id ( name, organization_type )').in('contact_id', ids),
    supabase.from('client_account_members').select('contact_id, client_account_id').in('contact_id', ids),
  ]);

  // Index by contact_id
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

  const orgByContact: Record<string, any[]> = {};
  for (const o of orgRes.data ?? []) {
    if (!orgByContact[o.contact_id]) orgByContact[o.contact_id] = [];
    orgByContact[o.contact_id].push(o);
  }

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
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteContactRecord(id: string): Promise<void> {
  // Delete related data first
  await supabase.from('contact_licenses').delete().eq('contact_id', id);
  await supabase.from('contact_mls_memberships').delete().eq('contact_id', id);
  await supabase.from('organization_members').delete().eq('contact_id', id);
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
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
  const row = {
    id: license.id || crypto.randomUUID(),
    contact_id: license.contactId,
    state_code: license.stateCode,
    license_type: license.licenseType,
    license_number: license.licenseNumber,
    status: license.status,
    broker_organization_id: license.brokerOrganizationId || null,
    issue_date: license.issueDate || null,
    expiration_date: license.expirationDate || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('contact_licenses').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return row.id;
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
  const row = {
    id: mls.id || crypto.randomUUID(),
    contact_id: mls.contactId,
    mls_name: mls.mlsName,
    mls_code: mls.mlsCode || null,
    mls_member_number: mls.mlsMemberNumber,
    office_mls_number: mls.officeMlsNumber || null,
    board_name: mls.boardName || null,
    state_code: mls.stateCode || null,
    status: mls.status || 'active',
    broker_organization_id: mls.brokerOrganizationId || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('contact_mls_memberships').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return row.id;
}

export async function deleteContactMlsRecord(id: string): Promise<void> {
  const { error } = await supabase.from('contact_mls_memberships').delete().eq('id', id);
  if (error) throw error;
}
