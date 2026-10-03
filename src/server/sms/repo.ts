import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ConsentStatus, SmsContactCard, SmsConversation, SmsDirection, SmsMessage } from '../../lib/sms/types.ts';

export interface StoredMessageRef {
  id: string;
  status: string;
  conversation_id: string;
}

export interface NewSmsMessage {
  conversation_id: string;
  direction: SmsDirection;
  body: string;
  status: string;
  twilio_sid: string | null;
  from_number: string | null;
  to_number: string | null;
}

export interface FubCacheRow {
  fetched_at: string;
  not_found: boolean;
  contact: SmsContactCard | null;
}

export interface SmsRepo {
  findMessageBySid(sid: string): Promise<StoredMessageRef | null>;
  ensureConversation(phone: string): Promise<SmsConversation>;
  insertMessage(row: NewSmsMessage): Promise<'inserted' | 'duplicate'>;
  touchConversation(input: {
    id: string;
    preview: string;
    direction: SmsDirection;
    at: string;
    incrementUnread: boolean;
  }): Promise<void>;
  setConsent(phone: string, status: Exclude<ConsentStatus, 'unknown'>, keyword: string): Promise<void>;
  getConsent(phone: string): Promise<ConsentStatus>;
  listConversations(): Promise<SmsConversation[]>;
  getConversation(id: string): Promise<SmsConversation | null>;
  listMessages(conversationId: string): Promise<SmsMessage[]>;
  markRead(conversationId: string): Promise<void>;
  updateMessageStatus(id: string, patch: {
    status: string;
    error_code: string | null;
    error_message: string | null;
    from_number?: string | null;
  }): Promise<void>;
  getFubCache(phone: string): Promise<FubCacheRow | null>;
  saveFubCache(phone: string, contact: SmsContactCard | null): Promise<void>;
  setDisplayNameIfEmpty(phone: string, name: string): Promise<void>;
}

let cachedClient: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials are not configured');
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

function throwIf(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(error.message);
}

function asConversation(row: {
  id: string;
  phone_e164: string;
  display_name: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_direction: SmsDirection | null;
}, consent: ConsentStatus): SmsConversation {
  return { ...row, consent };
}

export function createSupabaseSmsRepo(client: SupabaseClient = serviceClient()): SmsRepo {
  async function consentFor(phones: string[]): Promise<Map<string, ConsentStatus>> {
    const map = new Map<string, ConsentStatus>();
    if (phones.length === 0) return map;
    const { data, error } = await client
      .from('sms_opt_ins')
      .select('phone_e164, status')
      .in('phone_e164', phones);
    throwIf(error);
    for (const row of data || []) {
      if (row.status === 'opted_in' || row.status === 'opted_out') map.set(row.phone_e164, row.status);
    }
    return map;
  }

  return {
    async findMessageBySid(sid) {
      const { data, error } = await client
        .from('sms_messages')
        .select('id, status, conversation_id')
        .eq('twilio_sid', sid)
        .maybeSingle();
      throwIf(error);
      return data;
    },

    async ensureConversation(phone) {
      const { data: existing, error: readError } = await client
        .from('sms_conversations')
        .select('id, phone_e164, display_name, unread_count, last_message_at, last_message_preview, last_direction')
        .eq('phone_e164', phone)
        .maybeSingle();
      throwIf(readError);
      const consent = await this.getConsent(phone);
      if (existing) return asConversation(existing, consent);

      const { data, error } = await client
        .from('sms_conversations')
        .insert({ phone_e164: phone })
        .select('id, phone_e164, display_name, unread_count, last_message_at, last_message_preview, last_direction')
        .single();
      if (error?.code === '23505') {
        const { data: again, error: againError } = await client
          .from('sms_conversations')
          .select('id, phone_e164, display_name, unread_count, last_message_at, last_message_preview, last_direction')
          .eq('phone_e164', phone)
          .single();
        throwIf(againError);
        if (!again) throw new Error('Conversation was not found after a concurrent insert');
        return asConversation(again, consent);
      }
      throwIf(error);
      if (!data) throw new Error('Conversation insert did not return a row');
      return asConversation(data, consent);
    },

    async insertMessage(row) {
      const { error } = await client.from('sms_messages').insert(row);
      if (error?.code === '23505') return 'duplicate';
      throwIf(error);
      return 'inserted';
    },

    async touchConversation({ id, preview, direction, at, incrementUnread }) {
      const { data, error } = await client
        .from('sms_conversations')
        .select('unread_count')
        .eq('id', id)
        .single();
      throwIf(error);
      const unread = incrementUnread ? (data?.unread_count || 0) + 1 : data?.unread_count || 0;
      const { error: updateError } = await client.from('sms_conversations').update({
        last_message_at: at,
        last_message_preview: preview.slice(0, 140),
        last_direction: direction,
        unread_count: unread,
        updated_at: at,
      }).eq('id', id);
      throwIf(updateError);
    },

    async setConsent(phone, status, keyword) {
      const now = new Date().toISOString();
      const { data: existing, error: readError } = await client
        .from('sms_opt_ins')
        .select('opted_in_at, opted_out_at')
        .eq('phone_e164', phone)
        .maybeSingle();
      throwIf(readError);
      const { error } = await client.from('sms_opt_ins').upsert({
        phone_e164: phone,
        status,
        keyword,
        updated_at: now,
        opted_in_at: status === 'opted_in' ? now : existing?.opted_in_at ?? null,
        opted_out_at: status === 'opted_out' ? now : existing?.opted_out_at ?? null,
      }, { onConflict: 'phone_e164' });
      throwIf(error);
    },

    async getConsent(phone) {
      const { data, error } = await client
        .from('sms_opt_ins')
        .select('status')
        .eq('phone_e164', phone)
        .maybeSingle();
      throwIf(error);
      if (data?.status === 'opted_in' || data?.status === 'opted_out') return data.status;
      return 'unknown';
    },

    async listConversations() {
      const { data, error } = await client
        .from('sms_conversations')
        .select('id, phone_e164, display_name, unread_count, last_message_at, last_message_preview, last_direction')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      throwIf(error);
      const rows = data || [];
      const consent = await consentFor(rows.map(row => row.phone_e164));
      return rows.map(row => asConversation(row, consent.get(row.phone_e164) || 'unknown'));
    },

    async getConversation(id) {
      const { data, error } = await client
        .from('sms_conversations')
        .select('id, phone_e164, display_name, unread_count, last_message_at, last_message_preview, last_direction')
        .eq('id', id)
        .maybeSingle();
      throwIf(error);
      if (!data) return null;
      return asConversation(data, await this.getConsent(data.phone_e164));
    },

    async listMessages(conversationId) {
      const { data, error } = await client
        .from('sms_messages')
        .select('id, direction, body, status, created_at, error_code, error_message')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      throwIf(error);
      return (data || []) as SmsMessage[];
    },

    async markRead(conversationId) {
      const { error } = await client
        .from('sms_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      throwIf(error);
    },

    async updateMessageStatus(id, patch) {
      const { error } = await client.from('sms_messages').update({
        status: patch.status,
        error_code: patch.error_code,
        error_message: patch.error_message,
        ...(patch.from_number ? { from_number: patch.from_number } : {}),
        status_updated_at: new Date().toISOString(),
      }).eq('id', id);
      throwIf(error);
    },

    async getFubCache(phone) {
      const { data, error } = await client
        .from('sms_fub_cache')
        .select('person_id, name, stage, tags, phones, emails, fetched_at, not_found')
        .eq('phone_e164', phone)
        .maybeSingle();
      throwIf(error);
      if (!data) return null;
      if (data.not_found || !data.person_id) {
        return { fetched_at: data.fetched_at, not_found: true, contact: null };
      }
      return {
        fetched_at: data.fetched_at,
        not_found: false,
        contact: {
          id: data.person_id,
          name: data.name || 'Unknown contact',
          stage: data.stage,
          tags: Array.isArray(data.tags) ? data.tags : [],
          phones: Array.isArray(data.phones) ? data.phones : [],
          emails: Array.isArray(data.emails) ? data.emails : [],
        },
      };
    },

    async saveFubCache(phone, contact) {
      const { error } = await client.from('sms_fub_cache').upsert({
        phone_e164: phone,
        person_id: contact?.id ?? null,
        name: contact?.name ?? null,
        stage: contact?.stage ?? null,
        tags: contact?.tags ?? [],
        phones: contact?.phones ?? [],
        emails: contact?.emails ?? [],
        fetched_at: new Date().toISOString(),
        not_found: !contact,
      }, { onConflict: 'phone_e164' });
      throwIf(error);
    },

    async setDisplayNameIfEmpty(phone, name) {
      const { data, error } = await client
        .from('sms_conversations')
        .select('id, display_name')
        .eq('phone_e164', phone)
        .maybeSingle();
      throwIf(error);
      if (!data || data.display_name) return;
      const { error: updateError } = await client
        .from('sms_conversations')
        .update({ display_name: name, updated_at: new Date().toISOString() })
        .eq('id', data.id);
      throwIf(updateError);
    },
  };
}
