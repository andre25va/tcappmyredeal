import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isOptOutSendError } from '../../lib/sms/consent.ts';
import { fubNotesEnabled } from '../../lib/sms/fub.ts';
import { toE164 } from '../../lib/sms/phone.ts';
import { coerceFormBody, emptyTwiml, isValidTwilioRequest, sendViaMessagingService, type OutboundSendArgs } from '../../lib/sms/twilio.ts';
import { headerFirst, publicWebhookUrl, statusCallbackUrl } from '../../lib/sms/webhookUrl.ts';
import { requireStaff } from './auth.ts';
import { logInboundNote, resolveFubContact, withTimeout } from './fubCache.ts';
import { normalizeOutboundBody, processInboundMessage, processStatusUpdate, sendDecision } from './process.ts';
import { createSupabaseSmsRepo, type SmsRepo } from './repo.ts';

export interface SmsHandlerDeps {
  repo: SmsRepo;
  requireStaff: (headers: VercelRequest['headers']) => Promise<{ userId: string } | null>;
  send: (args: OutboundSendArgs) => Promise<{ sid: string; status: string }>;
  messagingServiceSid?: string;
  authToken?: string;
  accountSid?: string;
  statusCallback?: string;
  logNote?: (phone: string, body: string) => Promise<void>;
  notesEnabled?: boolean;
}

function defaultDeps(): SmsHandlerDeps {
  const repo = createSupabaseSmsRepo();
  return {
    repo,
    requireStaff: headers => requireStaff(headers),
    send: args => sendViaMessagingService(args),
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    statusCallback: statusCallbackUrl(),
    notesEnabled: fubNotesEnabled(),
    logNote: (phone, body) => logInboundNote(repo, phone, body),
  };
}

function webhookUrl(req: VercelRequest): string {
  return publicWebhookUrl({ headers: req.headers, url: req.url });
}

function signatureOk(req: VercelRequest, deps: SmsHandlerDeps, params: Record<string, string>): boolean {
  if (!deps.authToken) return false;
  const signature = headerFirst(req.headers['x-twilio-signature']);
  return isValidTwilioRequest({
    authToken: deps.authToken,
    signature,
    url: webhookUrl(req),
    params,
  });
}

export async function handleSmsInbound(req: VercelRequest, res: VercelResponse, deps: SmsHandlerDeps = defaultDeps()) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  if (!deps.authToken) {
    res.status(500).send('Twilio is not configured');
    return;
  }
  const params = coerceFormBody(req.body);
  if (!signatureOk(req, deps, params)) {
    res.status(403).send('Forbidden');
    return;
  }
  if (deps.accountSid && params.AccountSid && params.AccountSid !== deps.accountSid) {
    res.status(403).send('Forbidden');
    return;
  }

  try {
    const result = await processInboundMessage(deps.repo, {
      from: params.From || '',
      to: params.To || '',
      body: params.Body || '',
      messageSid: params.MessageSid || '',
      numMedia: params.NumMedia,
    });
    if (result.stored && result.phone && deps.notesEnabled && deps.logNote) {
      try {
        await withTimeout(deps.logNote(result.phone, params.Body || ''), 4000);
      } catch (err) {
        console.error('Follow Up Boss note skipped', err instanceof Error ? err.message : 'error');
      }
    }
  } catch (err) {
    console.error('SMS inbound failed', err instanceof Error ? err.message : 'error');
    res.status(500).send('Failed to store message');
    return;
  }

  res.status(200).setHeader('Content-Type', 'text/xml');
  res.send(emptyTwiml());
}

export async function handleSmsStatus(req: VercelRequest, res: VercelResponse, deps: SmsHandlerDeps = defaultDeps()) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  if (!deps.authToken) {
    res.status(500).end();
    return;
  }
  const params = coerceFormBody(req.body);
  if (!signatureOk(req, deps, params)) {
    res.status(403).send('Forbidden');
    return;
  }
  try {
    await processStatusUpdate(deps.repo, {
      messageSid: params.MessageSid || '',
      messageStatus: params.MessageStatus || '',
      errorCode: params.ErrorCode || null,
      errorMessage: params.ErrorMessage || null,
      fromNumber: params.From || null,
    });
  } catch (err) {
    console.error('SMS status failed', err instanceof Error ? err.message : 'error');
    res.status(500).end();
    return;
  }
  res.status(204).end();
}

export async function handleSmsInbox(req: VercelRequest, res: VercelResponse, deps: SmsHandlerDeps = defaultDeps()) {
  const staff = await deps.requireStaff(req.headers);
  if (!staff) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const conversationId = typeof req.query.conversation_id === 'string' ? req.query.conversation_id : '';
      if (!conversationId) {
        const conversations = await deps.repo.listConversations();
        res.status(200).json({ conversations });
        return;
      }
      const conversation = await deps.repo.getConversation(conversationId);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      const messages = await deps.repo.listMessages(conversationId);
      await deps.repo.markRead(conversationId);
      const refresh = req.query.refresh_contact === '1';
      const contact = await resolveFubContact(deps.repo, conversation.phone_e164, { force: refresh });
      const fresh = await deps.repo.getConversation(conversationId);
      res.status(200).json({
        conversation: { ...(fresh || conversation), unread_count: 0 },
        messages,
        contact: contact.contact,
        contact_state: contact.state,
        contact_fetched_at: contact.fetchedAt,
      });
      return;
    }

    if (req.method === 'POST') {
      const payload = (req.body || {}) as { body?: string; conversation_id?: string; to?: string };
      const text = normalizeOutboundBody(payload.body);
      if (!text) {
        res.status(400).json({ error: 'A message up to 1600 characters is required.' });
        return;
      }
      const conversation = payload.conversation_id
        ? await deps.repo.getConversation(payload.conversation_id)
        : null;
      if (payload.conversation_id && !conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      const phone = conversation?.phone_e164 || toE164(payload.to);
      if (!phone) {
        res.status(400).json({ error: 'A valid phone number is required.' });
        return;
      }
      const decision = sendDecision(await deps.repo.getConsent(phone));
      if (!decision.ok) {
        res.status(403).json({ error: 'This number has opted out of texts.', code: 'opted_out' });
        return;
      }
      const thread = conversation || await deps.repo.ensureConversation(phone);
      if (!deps.messagingServiceSid) {
        res.status(500).json({ error: 'Twilio messaging service is not configured.' });
        return;
      }

      let sent: { sid: string; status: string };
      try {
        sent = await deps.send({
          to: phone,
          body: text,
          messagingServiceSid: deps.messagingServiceSid,
          ...(deps.statusCallback ? { statusCallback: deps.statusCallback } : {}),
        });
      } catch (err) {
        if (isOptOutSendError(err)) {
          await deps.repo.setConsent(phone, 'opted_out', 'twilio_21610');
          res.status(403).json({ error: 'This number has opted out of texts.', code: 'opted_out' });
          return;
        }
        console.error('SMS send failed', err instanceof Error ? err.message : 'error');
        res.status(502).json({ error: 'The text could not be sent.' });
        return;
      }

      const now = new Date().toISOString();
      await deps.repo.insertMessage({
        conversation_id: thread.id,
        direction: 'outbound',
        body: text,
        status: sent.status || 'queued',
        twilio_sid: sent.sid,
        from_number: null,
        to_number: phone,
      });
      await deps.repo.touchConversation({
        id: thread.id,
        preview: text,
        direction: 'outbound',
        at: now,
        incrementUnread: false,
      });
      const messages = await deps.repo.listMessages(thread.id);
      const saved = [...messages].reverse().find(message => message.body === text && message.direction === 'outbound');
      res.status(200).json({
        conversation_id: thread.id,
        message: saved || null,
        consent: decision.warning ? 'unknown' : 'opted_in',
        consent_warning: decision.warning,
      });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('SMS inbox failed', err instanceof Error ? err.message : 'error');
    res.status(500).json({ error: 'SMS inbox request failed.' });
  }
}
