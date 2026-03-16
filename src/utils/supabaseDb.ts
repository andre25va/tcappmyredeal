/**
 * supabaseDb.ts
 * Single source of truth — all data lives in Supabase. No localStorage fallbacks.
 */

import { supabase } from '../lib/supabase';
import {
  Deal,
  DirectoryContact,
  MlsEntry,
  ComplianceTemplate,
  AppUser,
  EmailTemplate,
  ComplianceMasterItem,
  DDMasterItem,
} from '../types';

// ─── DEALS ───────────────────────────────────────────────────────────────────

export async function loadDeals(): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('deal_data')
    .not('deal_data', 'is', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => row.deal_data as Deal);
}

export async function saveDeals(deals: Deal[]): Promise<void> {
  if (deals.length === 0) {
    await supabase.from('deals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return;
  }

  const rows = deals.map((deal) => ({
    id: deal.id,
    property_address: deal.address,
    city: deal.city ?? null,
    state: deal.state ?? null,
    zip: deal.zipCode ?? null,
    mls_number: deal.mlsNumber ?? null,
    deal_type: deal.transactionSide ?? 'buyer',
    status: deal.status ?? 'contract',
    pipeline_stage: deal.milestone ?? 'contract-received',
    contract_date: deal.contractDate || null,
    closing_date: deal.closingDate || null,
    purchase_price: deal.contractPrice ?? null,
    notes: deal.notes ?? null,
    deal_data: deal,
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
      property_address: deal.address,
      city: deal.city ?? null,
      state: deal.state ?? null,
      zip: deal.zipCode ?? null,
      mls_number: deal.mlsNumber ?? null,
      deal_type: deal.transactionSide ?? 'buyer',
      status: deal.status ?? 'contract',
      pipeline_stage: deal.milestone ?? 'contract-received',
      contract_date: deal.contractDate || null,
      closing_date: deal.closingDate || null,
      purchase_price: deal.contractPrice ?? null,
      notes: deal.notes ?? null,
      deal_data: deal,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}

// ─── DIRECTORY CONTACTS ───────────────────────────────────────────────────────

export async function loadDirectory(): Promise<DirectoryContact[]> {
  const { data, error } = await supabase
    .from('directory_contacts')
    .select('data')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.data as DirectoryContact);
}

export async function saveDirectory(contacts: DirectoryContact[]): Promise<void> {
  if (contacts.length === 0) {
    await supabase.from('directory_contacts').delete().neq('id', '');
    return;
  }

  const rows = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    role: c.role,
    company: c.company ?? null,
    data: c,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('directory_contacts').upsert(rows, { onConflict: 'id' });
  if (error) throw error;

  // Delete removed contacts
  const newIds = contacts.map((c) => c.id);
  const { data: existing } = await supabase.from('directory_contacts').select('id');
  const toDelete = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    await supabase.from('directory_contacts').delete().in('id', toDelete);
  }
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
