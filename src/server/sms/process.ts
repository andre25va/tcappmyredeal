import { classifyKeyword } from '../../lib/sms/consent.ts';
import { toE164 } from '../../lib/sms/phone.ts';
import { shouldApplyStatus } from '../../lib/sms/status.ts';
import type { ConsentStatus } from '../../lib/sms/types.ts';
import type { SmsRepo } from './repo.ts';

export interface InboundSms {
  from: string;
  to: string;
  body: string;
  messageSid: string;
  numMedia?: string;
}

export async function processInboundMessage(repo: SmsRepo, input: InboundSms, now = new Date()): Promise<{
  duplicate: boolean;
  phone: string | null;
  stored: boolean;
}> {
  if (!input.messageSid) return { duplicate: false, phone: null, stored: false };
  const phone = toE164(input.from);
  if (!phone) return { duplicate: false, phone: null, stored: false };

  const existing = await repo.findMessageBySid(input.messageSid);
  if (existing) return { duplicate: true, phone, stored: false };

  const text = (input.body || '').trim();
  const numMedia = Number(input.numMedia || 0);
  const body = text || (numMedia > 0 ? '[Media attachment]' : '');
  const conversation = await repo.ensureConversation(phone);
  const inserted = await repo.insertMessage({
    conversation_id: conversation.id,
    direction: 'inbound',
    body,
    status: 'received',
    twilio_sid: input.messageSid,
    from_number: phone,
    to_number: toE164(input.to) || input.to || null,
  });
  if (inserted === 'duplicate') return { duplicate: true, phone, stored: false };

  const keyword = classifyKeyword(text);
  if (keyword?.action === 'opt_out') await repo.setConsent(phone, 'opted_out', keyword.keyword);
  if (keyword?.action === 'opt_in') await repo.setConsent(phone, 'opted_in', keyword.keyword);

  await repo.touchConversation({
    id: conversation.id,
    preview: body.slice(0, 140) || '(no text)',
    direction: 'inbound',
    at: now.toISOString(),
    incrementUnread: true,
  });
  return { duplicate: false, phone, stored: true };
}

export async function processStatusUpdate(repo: SmsRepo, input: {
  messageSid: string;
  messageStatus: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  fromNumber?: string | null;
}): Promise<'updated' | 'ignored' | 'missing'> {
  if (!input.messageSid || !input.messageStatus) return 'missing';
  const message = await repo.findMessageBySid(input.messageSid);
  if (!message) return 'missing';
  if (!shouldApplyStatus(message.status, input.messageStatus)) return 'ignored';
  await repo.updateMessageStatus(message.id, {
    status: input.messageStatus,
    error_code: input.errorCode || null,
    error_message: input.errorMessage || null,
    from_number: input.fromNumber || null,
  });
  return 'updated';
}

export function sendDecision(consent: ConsentStatus): { ok: true; warning: 'never_opted_in' | null } | { ok: false; reason: 'opted_out' } {
  if (consent === 'opted_out') return { ok: false, reason: 'opted_out' };
  if (consent === 'unknown') return { ok: true, warning: 'never_opted_in' };
  return { ok: true, warning: null };
}

const MAX_SMS_LENGTH = 1600;

export function normalizeOutboundBody(body: string | null | undefined): string | null {
  const text = (body || '').trim();
  if (!text || text.length > MAX_SMS_LENGTH) return null;
  return text;
}
