/**
 * supabaseDb.ts
 * Drop-in replacement for storage.ts — persists all app data in Supabase.
 * Falls back to localStorage when Supabase is unavailable (e.g. no env vars).
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function isSupabaseReady(): boolean {
  return !!(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

const LS_KEY = (k: string) => `tc-dashboard:${k}`;

function lsRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_KEY(key));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return (parsed as { data: T }).data;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

function lsWrite<T>(key: string, data: T): void {
  localStorage.setItem(LS_KEY(key), JSON.stringify({ version: 1, data }));
}

// ─── DEALS ───────────────────────────────────────────────────────────────────

export async function loadDeals(): Promise<Deal[]> {
  if (!isSupabaseReady()) return lsRead<Deal[]>('deals.json', []);

  const { data, error } = await supabase
    .from('deals')
    .select('deal_data')
    .not('deal_data', 'is', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => row.deal_data as Deal);
}

export async function saveDeals(deals: Deal[]): Promise<void> {
  if (!isSupabaseReady()) {
    lsWrite('deals.json', deals);
    return;
  }

  if (deals.length === 0) {
    // Delete everything if array is empty
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
  if (!isSupabaseReady()) {
    const existing = lsRead<Deal[]>('deals.json', []);
    const updated = existing.some((d) => d.id === deal.id)
      ? existing.map((d) => (d.id === deal.id ? deal : d))
      : [deal, ...existing];
    lsWrite('deals.json', updated);
    return;
  }

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
  if (!isSupabaseReady()) {
    const existing = lsRead<Deal[]>('deals.json', []);
    lsWrite('deals.json', existing.filter((d) => d.id !== id));
    return;
  }
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}

// ─── DIRECTORY CONTACTS ───────────────────────────────────────────────────────

export async function loadDirectory(): Promise<DirectoryContact[]> {
  if (!isSupabaseReady()) return lsRead<DirectoryContact[]>('directory.json', []);

  const { data, error } = await supabase
    .from('directory_contacts')
    .select('data')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.data as DirectoryContact);
}

export async function saveDirectory(contacts: DirectoryContact[]): Promise<void> {
  if (!isSupabaseReady()) {
    lsWrite('directory.json', contacts);
    return;
  }

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
  if (!isSupabaseReady()) return lsRead<MlsEntry[]>('mls.json', []);

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
  if (!isSupabaseReady()) {
    lsWrite('mls.json', entries);
    return;
  }

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
  if (!isSupabaseReady()) return lsRead<ComplianceTemplate[]>('compliance.json', []);

  const { data, error } = await supabase
    .from('app_compliance_templates')
    .select('data')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.data as ComplianceTemplate);
}

export async function saveCompliance(templates: ComplianceTemplate[]): Promise<void> {
  if (!isSupabaseReady()) {
    lsWrite('compliance.json', templates);
    return;
  }

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
  if (!isSupabaseReady()) return lsRead<AppUser[]>('users.json', []);

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
  if (!isSupabaseReady()) {
    lsWrite('users.json', users);
    return;
  }

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
  if (!isSupabaseReady()) return lsRead<EmailTemplate[]>('emailTemplates.json', []);

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
  if (!isSupabaseReady()) {
    lsWrite('emailTemplates.json', templates);
    return;
  }

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
  const lsKey = type === 'compliance' ? 'complianceMaster.json' : 'ddMaster.json';
  if (!isSupabaseReady()) return lsRead(lsKey, []);

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
  const lsKey = type === 'compliance' ? 'complianceMaster.json' : 'ddMaster.json';
  if (!isSupabaseReady()) {
    lsWrite(lsKey, items);
    return;
  }

  // Delete all items of this type then re-insert (simple approach for master lists)
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
  if (!isSupabaseReady()) return;

  await supabase.from('activity_log').insert({
    deal_id: params.dealId ?? null,
    action: params.action,
    description: params.description,
    entity_type: params.entityType ?? null,
    performed_by: params.performedBy ?? 'TC Command',
    metadata: params.metadata ?? {},
  });
}
