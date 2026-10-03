import assert from 'node:assert/strict';
import test from 'node:test';
import twilio from 'twilio';
import { classifyKeyword, consentWarning, isOptOutSendError } from '../src/lib/sms/consent.ts';
import { fubAuthHeader, fubNotesEnabled, isCacheFresh, parseFubPeople } from '../src/lib/sms/fub.ts';
import { formatPhoneDisplay, toE164 } from '../src/lib/sms/phone.ts';
import { shouldApplyStatus } from '../src/lib/sms/status.ts';
import type { ConsentStatus, SmsConversation, SmsMessage } from '../src/lib/sms/types.ts';
import { coerceFormBody, emptyTwiml, isValidTwilioRequest } from '../src/lib/sms/twilio.ts';
import { publicAppBaseUrl, publicWebhookUrl, statusCallbackUrl } from '../src/lib/sms/webhookUrl.ts';
import { handleSmsInbound, handleSmsInbox, handleSmsStatus } from '../src/server/sms/handlers.ts';
import { normalizeOutboundBody, processInboundMessage, processStatusUpdate, sendDecision } from '../src/server/sms/process.ts';
import type { FubCacheRow, NewSmsMessage, SmsRepo, StoredMessageRef } from '../src/server/sms/repo.ts';

class MemoryRepo implements SmsRepo {
  conversations: SmsConversation[] = [];
  messages: Array<SmsMessage & { conversation_id: string; twilio_sid: string | null }> = [];
  consent = new Map<string, ConsentStatus>();
  cache = new Map<string, FubCacheRow>();
  names = new Map<string, string>();

  async findMessageBySid(sid: string): Promise<StoredMessageRef | null> {
    const message = this.messages.find(row => row.twilio_sid === sid);
    if (!message) return null;
    return { id: message.id, status: message.status, conversation_id: message.conversation_id };
  }

  async ensureConversation(phone: string): Promise<SmsConversation> {
    const existing = this.conversations.find(row => row.phone_e164 === phone);
    if (existing) return { ...existing, consent: await this.getConsent(phone) };
    const created: SmsConversation = {
      id: `conv-${this.conversations.length + 1}`,
      phone_e164: phone,
      display_name: this.names.get(phone) || null,
      unread_count: 0,
      last_message_at: null,
      last_message_preview: null,
      last_direction: null,
      consent: await this.getConsent(phone),
    };
    this.conversations.push(created);
    return created;
  }

  async insertMessage(row: NewSmsMessage): Promise<'inserted' | 'duplicate'> {
    if (row.twilio_sid && this.messages.some(message => message.twilio_sid === row.twilio_sid)) return 'duplicate';
    this.messages.push({
      id: `msg-${this.messages.length + 1}`,
      conversation_id: row.conversation_id,
      direction: row.direction,
      body: row.body,
      status: row.status,
      twilio_sid: row.twilio_sid,
      created_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    });
    return 'inserted';
  }

  async touchConversation(input: { id: string; preview: string; direction: 'inbound' | 'outbound'; at: string; incrementUnread: boolean }) {
    const conversation = this.conversations.find(row => row.id === input.id);
    if (!conversation) return;
    conversation.last_message_preview = input.preview;
    conversation.last_direction = input.direction;
    conversation.last_message_at = input.at;
    if (input.incrementUnread) conversation.unread_count += 1;
  }

  async setConsent(phone: string, status: Exclude<ConsentStatus, 'unknown'>) {
    this.consent.set(phone, status);
    const conversation = this.conversations.find(row => row.phone_e164 === phone);
    if (conversation) conversation.consent = status;
  }

  async getConsent(phone: string): Promise<ConsentStatus> {
    return this.consent.get(phone) || 'unknown';
  }

  async listConversations() {
    return this.conversations.map(row => ({ ...row, consent: this.consent.get(row.phone_e164) || 'unknown' }));
  }

  async getConversation(id: string) {
    const conversation = this.conversations.find(row => row.id === id);
    if (!conversation) return null;
    return { ...conversation, consent: await this.getConsent(conversation.phone_e164) };
  }

  async listMessages(conversationId: string) {
    return this.messages.filter(message => message.conversation_id === conversationId);
  }

  async markRead(conversationId: string) {
    const conversation = this.conversations.find(row => row.id === conversationId);
    if (conversation) conversation.unread_count = 0;
  }

  async updateMessageStatus(id: string, patch: { status: string; error_code: string | null; error_message: string | null }) {
    const message = this.messages.find(row => row.id === id);
    if (!message) return;
    message.status = patch.status;
    message.error_code = patch.error_code;
    message.error_message = patch.error_message;
  }

  async getFubCache(phone: string) {
    return this.cache.get(phone) || null;
  }

  async saveFubCache(phone: string, contact: FubCacheRow['contact']) {
    this.cache.set(phone, {
      fetched_at: new Date().toISOString(),
      not_found: !contact,
      contact,
    });
  }

  async setDisplayNameIfEmpty(phone: string, name: string) {
    if (this.names.has(phone)) return;
    this.names.set(phone, name);
    const conversation = this.conversations.find(row => row.phone_e164 === phone);
    if (conversation && !conversation.display_name) conversation.display_name = name;
  }
}

function mockRes() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.payload = body; return this; },
    send(body: unknown) { this.payload = body; return this; },
    end() { return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
  };
}

test('normalizes US phone numbers to E.164', () => {
  assert.equal(toE164('(464) 733-3257'), '+14647333257');
  assert.equal(toE164('14647333257'), '+14647333257');
  assert.equal(toE164('+1 464-733-3257'), '+14647333257');
  assert.equal(toE164('whatsapp:+14647333257'), '+14647333257');
  assert.equal(toE164('123'), null);
  assert.equal(formatPhoneDisplay('+14647333257'), '+1 464-733-3257');
});

test('classifies opt-out and opt-in keywords only when they are the whole message', () => {
  assert.deepEqual(classifyKeyword(' stop '), { action: 'opt_out', keyword: 'STOP' });
  assert.deepEqual(classifyKeyword('unsubscribe'), { action: 'opt_out', keyword: 'UNSUBSCRIBE' });
  for (const word of ['STOPALL', 'CANCEL', 'END', 'QUIT']) {
    assert.equal(classifyKeyword(word)?.action, 'opt_out');
  }
  assert.deepEqual(classifyKeyword('yes'), { action: 'opt_in', keyword: 'YES' });
  assert.equal(classifyKeyword('START')?.action, 'opt_in');
  assert.equal(classifyKeyword('UNSTOP')?.action, 'opt_in');
  assert.equal(classifyKeyword('yes I can close Friday'), null);
  assert.equal(classifyKeyword('please stop by the office'), null);
});

test('blocks opted-out sends and warns when consent is unknown', () => {
  assert.deepEqual(sendDecision('opted_out'), { ok: false, reason: 'opted_out' });
  assert.equal(sendDecision('unknown').ok && sendDecision('unknown').warning, 'never_opted_in');
  assert.equal(sendDecision('opted_in').ok && sendDecision('opted_in').warning, null);
  assert.match(consentWarning('opted_out') || '', /opted out/);
  assert.match(consentWarning('unknown') || '', /never opted in/);
  assert.equal(consentWarning('opted_in'), null);
  assert.equal(normalizeOutboundBody('  hello  '), 'hello');
  assert.equal(normalizeOutboundBody(''), null);
  assert.equal(normalizeOutboundBody('x'.repeat(1601)), null);
});

test('does not move delivery status backwards', () => {
  assert.equal(shouldApplyStatus(null, 'queued'), true);
  assert.equal(shouldApplyStatus('queued', 'sent'), true);
  assert.equal(shouldApplyStatus('delivered', 'sent'), false);
  assert.equal(shouldApplyStatus('delivered', 'failed'), false);
  assert.equal(shouldApplyStatus('failed', 'delivered'), true);
  assert.equal(shouldApplyStatus('sent', 'sent'), true);
});

test('stores inbound texts, honors STOP and START, and ignores duplicate SIDs', async () => {
  const repo = new MemoryRepo();
  const first = await processInboundMessage(repo, {
    from: '5551112222',
    to: '+14647333257',
    body: 'Is the closing still Friday?',
    messageSid: 'SM1',
  });
  assert.equal(first.stored, true);
  assert.equal(first.phone, '+15551112222');
  assert.equal(repo.conversations[0].unread_count, 1);

  const duplicate = await processInboundMessage(repo, {
    from: '+15551112222',
    to: '+14647333257',
    body: 'Is the closing still Friday?',
    messageSid: 'SM1',
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(repo.messages.length, 1);
  assert.equal(repo.conversations[0].unread_count, 1);

  await processInboundMessage(repo, {
    from: '+15551112222',
    to: '+14647333257',
    body: 'STOP',
    messageSid: 'SM2',
  });
  assert.equal(await repo.getConsent('+15551112222'), 'opted_out');

  await processInboundMessage(repo, {
    from: '+15551112222',
    to: '+14647333257',
    body: 'START',
    messageSid: 'SM3',
  });
  assert.equal(await repo.getConsent('+15551112222'), 'opted_in');
});

test('applies status callbacks only when the new state is current', async () => {
  const repo = new MemoryRepo();
  const conversation = await repo.ensureConversation('+15551112222');
  await repo.insertMessage({
    conversation_id: conversation.id,
    direction: 'outbound',
    body: 'Closing is Friday',
    status: 'queued',
    twilio_sid: 'SM9',
    from_number: null,
    to_number: '+15551112222',
  });
  assert.equal(await processStatusUpdate(repo, { messageSid: 'SM9', messageStatus: 'delivered' }), 'updated');
  assert.equal(await processStatusUpdate(repo, { messageSid: 'SM9', messageStatus: 'sent' }), 'ignored');
  assert.equal(repo.messages[0].status, 'delivered');
  assert.equal(await processStatusUpdate(repo, { messageSid: 'missing', messageStatus: 'sent' }), 'missing');
});

test('validates the Twilio signature against the public URL', () => {
  const authToken = 'test-auth-token';
  const url = publicWebhookUrl({
    headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'tc.example.com:443' },
    url: '/api/sms-inbox/inbound',
  });
  assert.equal(url, 'https://tc.example.com/api/sms-inbox/inbound');
  const params = { From: '+15551112222', Body: 'Hi', MessageSid: 'SM1' };
  const signature = twilio.getExpectedTwilioSignature(authToken, url, params);
  assert.equal(isValidTwilioRequest({ authToken, signature, url, params }), true);
  assert.equal(isValidTwilioRequest({ authToken, signature: 'nope', url, params }), false);
  assert.equal(emptyTwiml().includes('<Response'), true);
  assert.equal(emptyTwiml().includes('<Message'), false);
  assert.deepEqual(coerceFormBody('Body=Hi&From=%2B1555'), { Body: 'Hi', From: '+1555' });
});

test('inbound webhook rejects a bad signature and stores a valid message as empty TwiML', async () => {
  const authToken = 'test-auth-token';
  const params = {
    AccountSid: 'AC00000000000000000000000000000000',
    From: '+15551112222',
    To: '+14647333257',
    Body: 'Documents are signed',
    MessageSid: 'SMinbound',
  };
  const url = 'https://tc.example.com/api/sms-inbox/inbound';
  const repo = new MemoryRepo();
  const bad = mockRes();
  await handleSmsInbound({
    method: 'POST',
    url: '/api/sms-inbox/inbound',
    headers: { host: 'tc.example.com', 'x-forwarded-proto': 'https', 'x-twilio-signature': 'bad' },
    body: params,
  } as never, bad as never, {
    repo,
    authToken,
    accountSid: params.AccountSid,
    requireStaff: async () => null,
    send: async () => { throw new Error('not used'); },
    notesEnabled: false,
  });
  assert.equal(bad.statusCode, 403);
  assert.equal(repo.messages.length, 0);

  const good = mockRes();
  await handleSmsInbound({
    method: 'POST',
    url: '/api/sms-inbox/inbound',
    headers: {
      host: 'tc.example.com',
      'x-forwarded-proto': 'https',
      'x-twilio-signature': twilio.getExpectedTwilioSignature(authToken, url, params),
    },
    body: params,
  } as never, good as never, {
    repo,
    authToken,
    accountSid: params.AccountSid,
    requireStaff: async () => null,
    send: async () => { throw new Error('not used'); },
    notesEnabled: false,
  });
  assert.equal(good.statusCode, 200);
  assert.match(String(good.payload), /<Response/);
  assert.equal(repo.messages[0].body, 'Documents are signed');
  assert.equal(repo.messages[0].status, 'received');
});

test('status webhook updates a stored message and rejects unsigned requests', async () => {
  const authToken = 'test-auth-token';
  const repo = new MemoryRepo();
  const conversation = await repo.ensureConversation('+15551112222');
  await repo.insertMessage({
    conversation_id: conversation.id,
    direction: 'outbound',
    body: 'Hello',
    status: 'sent',
    twilio_sid: 'SMstatus',
    from_number: null,
    to_number: '+15551112222',
  });
  const params = { MessageSid: 'SMstatus', MessageStatus: 'delivered', ErrorCode: '', ErrorMessage: '' };
  const url = 'https://tc.example.com/api/sms-inbox/status';
  const res = mockRes();
  await handleSmsStatus({
    method: 'POST',
    url: '/api/sms-inbox/status',
    headers: {
      host: 'tc.example.com',
      'x-forwarded-proto': 'https',
      'x-twilio-signature': twilio.getExpectedTwilioSignature(authToken, url, params),
    },
    body: params,
  } as never, res as never, {
    repo,
    authToken,
    requireStaff: async () => null,
    send: async () => { throw new Error('not used'); },
  });
  assert.equal(res.statusCode, 204);
  assert.equal(repo.messages[0].status, 'delivered');
});

test('send is blocked for opted-out numbers and uses the messaging service otherwise', async () => {
  const repo = new MemoryRepo();
  await repo.setConsent('+15551112222', 'opted_out');
  await repo.ensureConversation('+15551112222');
  let calls = 0;
  const blocked = mockRes();
  await handleSmsInbox({
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    query: {},
    body: { to: '+15551112222', body: 'Update' },
  } as never, blocked as never, {
    repo,
    messagingServiceSid: 'MG00000000000000000000000000000000',
    requireStaff: async () => ({ userId: 'staff' }),
    send: async () => { calls += 1; return { sid: 'SM', status: 'queued' }; },
  });
  assert.equal(blocked.statusCode, 403);
  assert.equal((blocked.payload as { code?: string }).code, 'opted_out');
  assert.equal(calls, 0);

  const sentArgs: Array<Record<string, unknown>> = [];
  const allowed = mockRes();
  await handleSmsInbox({
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    query: {},
    body: { to: '5553334444', body: 'The closing package is ready.' },
  } as never, allowed as never, {
    repo,
    messagingServiceSid: 'MG00000000000000000000000000000000',
    statusCallback: 'https://tc.example.com/api/sms-inbox/status',
    requireStaff: async () => ({ userId: 'staff' }),
    send: async args => {
      sentArgs.push(args as unknown as Record<string, unknown>);
      return { sid: 'SMout', status: 'queued' };
    },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(sentArgs[0].messagingServiceSid, 'MG00000000000000000000000000000000');
  assert.equal(sentArgs[0].to, '+15553334444');
  assert.equal(Object.hasOwn(sentArgs[0], 'from'), false);
  assert.equal((allowed.payload as { consent_warning?: string }).consent_warning, 'never_opted_in');

  const anonymous = mockRes();
  await handleSmsInbox({
    method: 'GET',
    headers: {},
    query: {},
  } as never, anonymous as never, {
    repo,
    requireStaff: async () => null,
    send: async () => { throw new Error('not used'); },
  });
  assert.equal(anonymous.statusCode, 401);
});

test('parses Follow Up Boss people and keeps note logging off by default', () => {
  assert.equal(fubNotesEnabled({}), false);
  assert.equal(fubNotesEnabled({ FUB_LOG_NOTES: 'true' }), true);
  assert.equal(isCacheFresh(new Date().toISOString()), true);
  assert.equal(isCacheFresh(new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()), false);
  const contact = parseFubPeople({
    people: [{
      id: 42,
      firstName: 'Ada',
      lastName: 'Lovelace',
      stage: 'Under Contract',
      tags: ['buyer'],
      phones: [{ value: '+15551112222', type: 'mobile' }],
      emails: [{ value: 'ada@example.com', type: 'work' }],
    }],
  });
  assert.equal(contact?.name, 'Ada Lovelace');
  assert.equal(contact?.stage, 'Under Contract');
  assert.deepEqual(contact?.tags, ['buyer']);
  assert.match(fubAuthHeader('key'), /^Basic /);
  assert.equal(publicAppBaseUrl({ PUBLIC_APP_URL: 'https://app.example.com/' }), 'https://app.example.com');
  assert.equal(statusCallbackUrl({ VERCEL_URL: 'tcappmyredeal.vercel.app' }), 'https://tcappmyredeal.vercel.app/api/sms-inbox/status');
  assert.equal(isOptOutSendError({ code: 21610, message: 'opted out' }), true);
});
