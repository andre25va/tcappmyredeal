import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { VOICE_CONFIG } from '../src/config/voice.config';
import { AI_CONFIG } from '../src/config/ai.config';
import { SMS_CONFIG } from '../src/config/sms.config';
import { EMAIL_CONFIG } from '../src/config/email.config';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER!;
const APP_URL = 'https://tcappmyredeal.vercel.app';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

// ── Types ─────────────────────────────────────────────────────────────────────

interface CallerContext {
  contact: { id: string; first_name: string; last_name: string; email: string | null };
  clientAccount: any | null;
  activeDeals: Array<{ id: string; property_address: string; pipeline_stage: string; closing_date: string | null; city: string | null; state: string | null }>;
  phoneChannelId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function twiml(...parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join('')}</Response>`;
}

function say(text: string): string {
  return `<Say voice="${VOICE_CONFIG.voice}">${escapeXml(text)}</Say>`;
}

function gather(opts: { action: string; numDigits?: number; timeout?: number; input?: string }, ...inner: string[]): string {
  const url = `${APP_URL}/api/voice?route=${opts.action}`;
  const nd = opts.numDigits ? ` numDigits="${opts.numDigits}"` : '';
  const to = opts.timeout || 5;
  const inp = opts.input || 'dtmf';
  return `<Gather action="${escapeXml(url)}" method="POST" input="${inp}" timeout="${to}"${nd}>${inner.join('')}</Gather>`;
}

async function sendSms(to: string, body: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: TWILIO_PHONE, Body: body });
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
}

async function identifyCallerByPhone(phoneE164: string): Promise<CallerContext | null> {
  try {
    // 1. Look up phone channel
    const { data: channel } = await supabase
      .from('contact_phone_channels')
      .select('id, contact_id, client_account_id')
      .eq('phone_e164', phoneE164)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (!channel) return null;

    // 2. Get contact
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email')
      .eq('id', channel.contact_id)
      .single();

    if (!contact) return null;

    // 3. Get client account if linked
    let clientAccount: any = null;
    if (channel.client_account_id) {
      const { data: ca } = await supabase
        .from('client_accounts')
        .select('*')
        .eq('id', channel.client_account_id)
        .single();
      clientAccount = ca;
    }

    // 4. Get deals via deal_participants — no status filter (fetch all)
    const { data: participants } = await supabase
      .from('deal_participants')
      .select('deal_id')
      .eq('contact_id', contact.id);

    let activeDeals: any[] = [];
    const dealIds = (participants || []).map((p: any) => p.deal_id);
    if (dealIds.length > 0) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, property_address, pipeline_stage, closing_date, city, state, purchase_price, transaction_type, status')
        .in('id', dealIds);
      activeDeals = deals || [];
    }

    return {
      contact: { id: contact.id, first_name: contact.first_name, last_name: contact.last_name, email: contact.email },
      clientAccount,
      activeDeals,
      phoneChannelId: channel.id,
    };
  } catch (err) {
    console.error('identifyCallerByPhone error:', err);
    return null;
  }
}

function normalizeToE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

// ── Route Handlers ────────────────────────────────────────────────────────────

async function handleAdminInbound(req: VercelRequest, res: VercelResponse, phone: string) {
  const { CallSid } = req.body;
  res.setHeader('Content-Type', 'text/xml');
  const greeting = say(VOICE_CONFIG.admin.greeting);
  const gatherBlock = gather(
    { action: `admin-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(CallSid || '')}`, input: 'speech', timeout: VOICE_CONFIG.speechTimeout },
    greeting
  );
  const fallback = say(VOICE_CONFIG.admin.noInput) + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleAdminQuery(req: VercelRequest, res: VercelResponse) {
  const { SpeechResult, From, CallSid } = req.body;
  const phone = (req.query.phone as string) || normalizeToE164(From || '');
  const callSid = (req.query.callSid as string) || CallSid || '';
  const question = SpeechResult || '';

  res.setHeader('Content-Type', 'text/xml');

  if (!question) {
    const retry = say(VOICE_CONFIG.admin.retry);
    const gatherBlock = gather(
      { action: `admin-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`, input: 'speech', timeout: VOICE_CONFIG.speechTimeout },
      retry
    );
    return res.send(twiml(gatherBlock, say(VOICE_CONFIG.admin.noInputFinal), '<Hangup/>'));
  }

  // Detect "done" — route to wrap-up
  if (VOICE_CONFIG.donePhrases.some(p => question.toLowerCase().includes(p))) {
    return handleAdminWrapup(req, res, phone, callSid);
  }

  try {
    // Pull ALL deals — no status filter (admin wants full picture)
    const [dealsRes, contactsRes, tasksRes] = await Promise.all([
      supabase.from('deals').select('id, property_address, city, state, pipeline_stage, closing_date, purchase_price, transaction_type, status').limit(50),
      supabase.from('contacts').select('id, first_name, last_name, email, contact_type, company').limit(100),
      supabase.from('comm_tasks').select('id, title, status, priority, due_date, deal_id').eq('status', 'pending').limit(30),
    ]);

    const deals = dealsRes.data || [];
    const contacts = contactsRes.data || [];
    const tasks = tasksRes.data || [];

    const dbSnapshot = `=== DEALS (${deals.length} total) ===
${deals.map((d: any) => `- ${d.property_address}${d.city ? `, ${d.city}` : ''}${d.state ? `, ${d.state}` : ''} | Stage: ${d.pipeline_stage || 'N/A'} | Type: ${d.transaction_type || 'N/A'} | Closing: ${d.closing_date || 'TBD'} | Price: $${d.purchase_price?.toLocaleString() || 'N/A'} | Status: ${d.status || 'active'}`).join('\n')}

=== CONTACTS (${contacts.length} total) ===
${contacts.map((c: any) => `- ${c.first_name} ${c.last_name} | Type: ${c.contact_type}${c.company ? ` | ${c.company}` : ''}${c.email ? ` | ${c.email}` : ''}`).join('\n')}

=== PENDING TASKS (${tasks.length} total) ===
${tasks.length > 0 ? tasks.map((t: any) => `- ${t.title} | Priority: ${t.priority} | Due: ${t.due_date || 'No due date'}`).join('\n') : 'No pending tasks'}`;

    const systemPrompt = AI_CONFIG.prompts.adminVoice(dbSnapshot);

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_CONFIG.models.voice,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: AI_CONFIG.maxTokens.adminVoice,
        temperature: AI_CONFIG.temperature.voice,
      }),
    });

    const aiData = await aiRes.json() as any;
    const answer = aiData.choices?.[0]?.message?.content || VOICE_CONFIG.general.noAnswer;

    // Store Q&A in DB for end-of-call email summary (keyed by CallSid)
    await supabase.from('communication_events').insert({
      contact_id: null,
      channel: 'voice',
      direction: 'inbound',
      event_type: 'admin_voice_qa',
      summary: `Q: ${question.substring(0, 200)}`,
      source_ref: callSid,
      metadata: { question, answer, phone, timestamp: new Date().toISOString() },
    });

    const responseVoice = say(answer);
    const followUp = gather(
      { action: `admin-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`, input: 'speech', timeout: VOICE_CONFIG.followUpTimeout },
      say(VOICE_CONFIG.admin.followUp)
    );
    // Fallback when they hang up or say nothing — skip to wrap-up
    const fallback = `<Redirect method="POST">${escapeXml(`${APP_URL}/api/voice?route=admin-wrapup&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`)}</Redirect>`;

    return res.send(twiml(responseVoice, followUp, fallback));

  } catch (err) {
    console.error('admin-query error:', err);
    return res.send(twiml(say(VOICE_CONFIG.admin.errorGeneric), '<Hangup/>'));
  }
}

async function handleAdminWrapup(req: VercelRequest, res: VercelResponse, phone?: string, callSid?: string) {
  const _phone = phone || (req.query.phone as string) || '';
  const _callSid = callSid || (req.query.callSid as string) || '';

  res.setHeader('Content-Type', 'text/xml');

  const prompt = say(VOICE_CONFIG.admin.wrapupPrompt);
  const gatherBlock = gather(
    { action: `admin-email-confirm&phone=${encodeURIComponent(_phone)}&callSid=${encodeURIComponent(_callSid)}`, input: 'speech dtmf', timeout: VOICE_CONFIG.wrapupTimeout },
    prompt
  );
  const fallback = say(VOICE_CONFIG.admin.wrapupDecline) + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleAdminEmailConfirm(req: VercelRequest, res: VercelResponse) {
  const { SpeechResult, Digits } = req.body;
  const phone = (req.query.phone as string) || '';
  const callSid = (req.query.callSid as string) || '';
  const speech = (SpeechResult || '').toLowerCase();
  const digits = Digits || '';

  res.setHeader('Content-Type', 'text/xml');

  const wantsEmail = speech.includes('yes') || digits === '1';

  if (wantsEmail && callSid) {
    try {
      const { data: events } = await supabase
        .from('communication_events')
        .select('metadata, created_at')
        .eq('source_ref', callSid)
        .eq('event_type', 'admin_voice_qa')
        .order('created_at', { ascending: true });

      console.log(`admin-email-confirm: found ${events?.length || 0} Q&A events for callSid=${callSid}`);
      if (events && events.length > 0) {
        const callDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const callTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' });

        const qaItems = events.map((e: any) => ({
          question: e.metadata?.question || '(question not recorded)',
          answer: e.metadata?.answer || '(answer not recorded)',
        }));

        const emailHtml = EMAIL_CONFIG.adminCallSummary.buildHtml({ callDate, callTime, qaItems });

        const adminEmailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: EMAIL_CONFIG.from,
            to: [VOICE_CONFIG.admin.email],
            subject: EMAIL_CONFIG.adminCallSummary.subject(new Date().toLocaleDateString('en-US')),
            html: emailHtml,
          }),
        });
        const adminEmailBody = await adminEmailRes.json() as any;
        if (!adminEmailRes.ok) {
          console.error('Resend admin voice email FAILED:', JSON.stringify(adminEmailBody));
          return res.send(twiml(
            say(VOICE_CONFIG.admin.emailFailed),
            '<Hangup/>'
          ));
        }
        console.log('Resend admin voice email sent OK, id:', adminEmailBody.id);

        return res.send(twiml(
          say(VOICE_CONFIG.admin.emailSent),
          '<Hangup/>'
        ));
      }
    } catch (err) {
      console.error('admin-email-confirm error:', err);
    }
  }

  return res.send(twiml(
    say(VOICE_CONFIG.admin.wrapupDecline),
    '<Hangup/>'
  ));
}


// ── Client AI Voice Flow (Simplified) ────────────────────────────────────────

async function getPhoneForContact(contactId: string): Promise<string> {
  const { data } = await supabase
    .from('contact_phone_channels')
    .select('phone_e164')
    .eq('contact_id', contactId)
    .eq('status', 'active')
    .limit(1)
    .single();
  return data?.phone_e164 || '';
}

async function getFullDeal(dealId: string): Promise<any | null> {
  const { data } = await supabase
    .from('deals')
    .select('id, property_address, city, state, pipeline_stage, closing_date, purchase_price, transaction_type, status, legal_description, mls_number')
    .eq('id', dealId)
    .single();
  return data || null;
}

async function getDealParticipants(dealId: string): Promise<string> {
  const { data: participants } = await supabase
    .from('deal_participants')
    .select('deal_role, contact_id, is_client_side, contacts(first_name, last_name, email, contact_type, company)')
    .eq('deal_id', dealId);

  if (!participants || participants.length === 0) return 'No participants on file.';

  return (participants as any[]).map(p => {
    const c = p.contacts;
    if (!c) return null;
    const role = p.deal_role || c.contact_type || 'Contact';
    const client = p.is_client_side ? ' (our client)' : '';
    return `${c.first_name} ${c.last_name} — ${role}${c.company ? `, ${c.company}` : ''}${client}`;
  }).filter(Boolean).join('\n');
}

async function handleClientAIInbound(req: VercelRequest, res: VercelResponse, caller: CallerContext) {
  const { CallSid } = req.body;
  const phone = await getPhoneForContact(caller.contact.id);
  const firstName = caller.contact.first_name;
  const dealCount = caller.activeDeals.length;

  res.setHeader('Content-Type', 'text/xml');

  if (dealCount === 0) {
    return res.send(twiml(
      say(VOICE_CONFIG.client.greetingNoDeals(firstName)),
      '<Hangup/>'
    ));
  }

  if (dealCount === 1) {
    const deal = caller.activeDeals[0];
    const greeting = say(VOICE_CONFIG.client.greetingSingle(firstName, deal.property_address));
    const gatherBlock = gather(
      { action: `client-ai-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(CallSid || '')}&dealId=${encodeURIComponent(deal.id)}`, input: 'speech', timeout: VOICE_CONFIG.speechTimeout },
      greeting
    );
    const fallback = say(VOICE_CONFIG.client.noInput) + '<Hangup/>';
    return res.send(twiml(gatherBlock, fallback));
  }

  // Multiple deals — pick one
  const listText = caller.activeDeals.map((d, i) => `Press ${i + 1} for ${d.property_address}.`).join(' ');
  const menu = say(VOICE_CONFIG.client.greetingMultiple(firstName, dealCount, listText));
  const gatherBlock = gather(
    { action: `client-deal-select&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(CallSid || '')}`, numDigits: 1, timeout: VOICE_CONFIG.dtmfTimeout, input: 'dtmf' },
    menu
  );
  const fallback = say(VOICE_CONFIG.client.noSelection) + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleClientDealSelect(req: VercelRequest, res: VercelResponse) {
  const { Digits, From } = req.body;
  const phone = (req.query.phone as string) || normalizeToE164(From || '');
  const callSid = (req.query.callSid as string) || '';

  res.setHeader('Content-Type', 'text/xml');

  const caller = await identifyCallerByPhone(phone);
  if (!caller || !caller.activeDeals.length) {
    return res.send(twiml(say(VOICE_CONFIG.client.dealNotFound), '<Hangup/>'));
  }

  const idx = parseInt(Digits || '0', 10) - 1;
  if (idx < 0 || idx >= caller.activeDeals.length) {
    const listText = caller.activeDeals.map((d, i) => `Press ${i + 1} for ${d.property_address}.`).join(' ');
    const retry = say(VOICE_CONFIG.client.invalidSelection(listText));
    const gatherBlock = gather(
      { action: `client-deal-select&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`, numDigits: 1, timeout: VOICE_CONFIG.dtmfTimeout, input: 'dtmf' },
      retry
    );
    return res.send(twiml(gatherBlock, say(VOICE_CONFIG.client.noSelection), '<Hangup/>'));
  }

  const deal = caller.activeDeals[idx];
  const prompt = say(VOICE_CONFIG.client.dealSelected(deal.property_address));
  const gatherBlock = gather(
    { action: `client-ai-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}&dealId=${encodeURIComponent(deal.id)}`, input: 'speech', timeout: VOICE_CONFIG.speechTimeout },
    prompt
  );
  const fallback = say(VOICE_CONFIG.client.noInputFinal) + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleClientAIQuery(req: VercelRequest, res: VercelResponse) {
  const { SpeechResult, From, CallSid } = req.body;
  const phone = (req.query.phone as string) || normalizeToE164(From || '');
  const callSid = (req.query.callSid as string) || CallSid || '';
  const dealId = (req.query.dealId as string) || '';
  const question = SpeechResult || '';

  res.setHeader('Content-Type', 'text/xml');

  if (!question) {
    const retry = say(VOICE_CONFIG.client.retry);
    const gatherBlock = gather(
      { action: `client-ai-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}&dealId=${encodeURIComponent(dealId)}`, input: 'speech', timeout: VOICE_CONFIG.speechTimeout },
      retry
    );
    return res.send(twiml(gatherBlock, say(VOICE_CONFIG.client.noInputFinal), '<Hangup/>'));
  }

  if (VOICE_CONFIG.donePhrases.some(p => question.toLowerCase().includes(p))) {
    return handleClientAIWrapup(req, res, phone, callSid, dealId);
  }

  try {
    const deal = await getFullDeal(dealId);
    if (!deal) {
      return res.send(twiml(say(VOICE_CONFIG.client.dealLoadError), '<Hangup/>'));
    }

    const caller = await identifyCallerByPhone(phone);
    const firstName = caller?.contact.first_name || 'there';
    const participantsText = await getDealParticipants(dealId);

    const closing = deal.closing_date
      ? new Date(deal.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      : 'TBD';

    const dealInfo = `Address: ${deal.property_address}${deal.city ? `, ${deal.city}` : ''}${deal.state ? `, ${deal.state}` : ''}
${deal.mls_number ? `MLS#: ${deal.mls_number}` : ''}
Type: ${deal.transaction_type || 'N/A'}
Stage: ${deal.pipeline_stage || 'N/A'}
Closing Date: ${closing}
Contract Price: ${deal.purchase_price ? `$${Number(deal.purchase_price).toLocaleString()}` : 'Not set'}

TRANSACTION TEAM:
${participantsText}`;

    const systemPrompt = AI_CONFIG.prompts.clientVoice(firstName, dealInfo);

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_CONFIG.models.voice,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: AI_CONFIG.maxTokens.clientVoice,
        temperature: AI_CONFIG.temperature.voice,
      }),
    });

    const aiData = await aiRes.json() as any;
    const answer = aiData.choices?.[0]?.message?.content || VOICE_CONFIG.general.noAnswerClient;

    // Store Q&A for end-of-call email
    await supabase.from('communication_events').insert({
      contact_id: caller?.contact.id || null,
      channel: 'voice',
      direction: 'inbound',
      event_type: 'client_voice_qa',
      summary: `Q: ${question.substring(0, 200)}`,
      source_ref: callSid,
      metadata: { question, answer, phone, dealId, timestamp: new Date().toISOString() },
    });

    const responseVoice = say(answer);
    const followUp = gather(
      { action: `client-ai-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}&dealId=${encodeURIComponent(dealId)}`, input: 'speech', timeout: VOICE_CONFIG.followUpTimeout },
      say(VOICE_CONFIG.client.followUp)
    );
    const fallback = `<Redirect method="POST">${escapeXml(`${APP_URL}/api/voice?route=client-ai-wrapup&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}&dealId=${encodeURIComponent(dealId)}`)}</Redirect>`;

    return res.send(twiml(responseVoice, followUp, fallback));

  } catch (err) {
    console.error('client-ai-query error:', err);
    return res.send(twiml(say(VOICE_CONFIG.client.errorGeneric), '<Hangup/>'));
  }
}

async function handleClientAIWrapup(req: VercelRequest, res: VercelResponse, phone?: string, callSid?: string, dealId?: string) {
  const _phone = phone || (req.query.phone as string) || '';
  const _callSid = callSid || (req.query.callSid as string) || '';
  const _dealId = dealId || (req.query.dealId as string) || '';

  res.setHeader('Content-Type', 'text/xml');

  const prompt = say(VOICE_CONFIG.client.wrapupPrompt);
  const gatherBlock = gather(
    { action: `client-deal-email-confirm&phone=${encodeURIComponent(_phone)}&callSid=${encodeURIComponent(_callSid)}&dealId=${encodeURIComponent(_dealId)}`, input: 'speech dtmf', timeout: VOICE_CONFIG.wrapupTimeout },
    prompt
  );
  const fallback = say(VOICE_CONFIG.client.wrapupDecline) + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleClientDealEmailConfirm(req: VercelRequest, res: VercelResponse) {
  const { SpeechResult, Digits } = req.body;
  const phone = (req.query.phone as string) || '';
  const callSid = (req.query.callSid as string) || '';
  const dealId = (req.query.dealId as string) || '';
  const speech = (SpeechResult || '').toLowerCase();
  const digits = Digits || '';

  res.setHeader('Content-Type', 'text/xml');

  const wantsEmail = speech.includes('yes') || digits === '1';

  if (!wantsEmail) {
    return res.send(twiml(say(VOICE_CONFIG.client.wrapupDecline), '<Hangup/>'));
  }

  try {
    const caller = await identifyCallerByPhone(phone);
    const recipientEmail = caller?.contact.email;
    const recipientName = caller ? `${caller.contact.first_name} ${caller.contact.last_name}` : 'Client';

    if (!recipientEmail) {
      return res.send(twiml(say(VOICE_CONFIG.client.noEmail), '<Hangup/>'));
    }

    if (!dealId) {
      return res.send(twiml(say(VOICE_CONFIG.client.noDealId), '<Hangup/>'));
    }

    const deal = await getFullDeal(dealId);
    if (!deal) {
      return res.send(twiml(say(VOICE_CONFIG.client.dealLoadError), '<Hangup/>'));
    }

    const participantsText = await getDealParticipants(dealId);
    const callDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const callTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' });

    const emailHtml = EMAIL_CONFIG.clientDealSummary.buildHtml({
      recipientName,
      deal,
      participantsText,
      callDate,
      callTime,
    });

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_CONFIG.from,
        to: [recipientEmail],
        subject: EMAIL_CONFIG.clientDealSummary.subject(deal.property_address),
        html: emailHtml,
      }),
    });

    const emailBody = await emailRes.json() as any;
    if (!emailRes.ok) {
      console.error('Resend client deal email FAILED:', JSON.stringify(emailBody));
      return res.send(twiml(
        say(VOICE_CONFIG.client.emailFailed),
        '<Hangup/>'
      ));
    }

    console.log('Client deal summary email sent OK, id:', emailBody.id);
    return res.send(twiml(
      say(VOICE_CONFIG.client.emailSent(deal.property_address)),
      '<Hangup/>'
    ));

  } catch (err) {
    console.error('client-deal-email-confirm error:', err);
    return res.send(twiml(say(VOICE_CONFIG.client.errorGeneric), '<Hangup/>'));
  }
}

async function handleInbound(req: VercelRequest, res: VercelResponse) {
  const { From, CallSid } = req.body;
  const fromE164 = normalizeToE164(From || '');

  // Admin voice AI flow — Andre Vargas gets full database query assistant
  if (fromE164 === VOICE_CONFIG.admin.phone) {
    return handleAdminInbound(req, res, fromE164);
  }

  const caller = await identifyCallerByPhone(fromE164);

  // Log communication event
  await supabase.from('communication_events').insert({
    contact_id: caller?.contact.id || null,
    channel: 'voice',
    direction: 'inbound',
    event_type: 'general',
    summary: `Inbound call from ${caller ? `${caller.contact.first_name} ${caller.contact.last_name}` : fromE164}`,
    source_ref: CallSid,
    metadata: { phone: fromE164, callSid: CallSid },
  });

  res.setHeader('Content-Type', 'text/xml');

  if (caller && caller.clientAccount) {
    // Only contacts with a client account get the AI voice assistant
    return handleClientAIInbound(req, res, caller);
  } else if (caller && !caller.clientAccount) {
    // Known contact but NOT a TC client — polite voicemail
    const name = caller.contact.first_name;
    const greeting = say(VOICE_CONFIG.nonClient.known(name));
    res.end(`<?xml version="1.0" encoding="UTF-8"?><Response>${greeting}<Hangup/></Response>`);
    return;
  } else {
    // Unknown caller
    const greeting = say(VOICE_CONFIG.nonClient.unknown);
    const record = `<Record action="${escapeXml(`${APP_URL}/api/voice?route=record-complete&phone=${encodeURIComponent(fromE164)}`)}" method="POST" maxLength="${VOICE_CONFIG.recording.maxLength}" transcribe="false" recordingStatusCallback="${escapeXml(`${APP_URL}/api/voice?route=recording-status&phone=${encodeURIComponent(fromE164)}`)}" recordingStatusCallbackMethod="POST"/>`;

    await supabase.from('communication_events').insert({
      contact_id: null,
      channel: 'voice',
      direction: 'inbound',
      event_type: 'unknown_caller',
      summary: `Unknown caller from ${fromE164} — sent to voicemail`,
      source_ref: CallSid,
      metadata: { phone: fromE164, callSid: CallSid },
    });

    return res.send(twiml(greeting, record));
  }
}

async function handleIntent(req: VercelRequest, res: VercelResponse) {
  const { Digits, SpeechResult, From } = req.body;
  const phone = (req.query.phone as string) || normalizeToE164(From || '');
  const caller = await identifyCallerByPhone(phone);
  const input = Digits || '';
  const speech = (SpeechResult || '').toLowerCase();

  res.setHeader('Content-Type', 'text/xml');

  let mode: string | null = null;
  if (input === '1' || speech.includes('status')) {
    mode = 'status';
  } else if (input === '2' || speech.includes('update') || speech.includes('message') || speech.includes('record')) {
    mode = 'record';
  } else if (input === '3' || speech.includes('callback') || speech.includes('call me')) {
    // Callback flow
    const prompt = say(VOICE_CONFIG.ivr.callbackReasonPrompt);
    const gatherBlock = gather({ action: `callback-confirm&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: VOICE_CONFIG.dtmfTimeout }, prompt);
    const fallback = say(VOICE_CONFIG.ivr.callbackSkip) + '<Hangup/>';
    return res.send(twiml(gatherBlock, fallback));
  } else if (input === '0') {
    // Repeat menu
    const menu = say(VOICE_CONFIG.ivr.menuRepeat);
    const gatherBlock = gather({ action: `intent&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: VOICE_CONFIG.dtmfTimeout }, menu);
    const fallback = say(VOICE_CONFIG.ivr.menuFallback) + '<Hangup/>';
    return res.send(twiml(gatherBlock, fallback));
  } else {
    const retry = say(VOICE_CONFIG.ivr.menuError);
    const gatherBlock = gather({ action: `intent&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: VOICE_CONFIG.dtmfTimeout }, retry);
    const fallback = say(VOICE_CONFIG.general.goodbye) + '<Hangup/>';
    return res.send(twiml(gatherBlock, fallback));
  }

  // Deal selection for status or record modes
  if (mode && caller && caller.activeDeals.length === 1) {
    const deal = caller.activeDeals[0];
    if (mode === 'status') {
      return handleStatusTextDirect(res, deal, phone);
    } else {
      // Record mode — prompt to record
      const prompt = say(VOICE_CONFIG.ivr.recordPrompt(deal.property_address));
      const record = `<Record action="${escapeXml(`${APP_URL}/api/voice?route=record-complete&phone=${encodeURIComponent(phone)}&dealId=${deal.id}`)}" method="POST" maxLength="${VOICE_CONFIG.recording.maxLength}" transcribe="false" recordingStatusCallback="${escapeXml(`${APP_URL}/api/voice?route=recording-status&phone=${encodeURIComponent(phone)}&dealId=${deal.id}`)}" recordingStatusCallbackMethod="POST"/>`;
      return res.send(twiml(prompt, record));
    }
  } else if (mode && caller && caller.activeDeals.length > 1) {
    // Multiple deals — list them
    const listing = caller.activeDeals.map((d, i) => `Press ${i + 1} for ${d.property_address}.`).join(' ');
    const prompt = say(`You have ${caller.activeDeals.length} active files. ${listing}`);
    const gatherBlock = gather({ action: `deal-select&mode=${mode}&phone=${encodeURIComponent(phone)}`, numDigits: 1, timeout: VOICE_CONFIG.dtmfTimeout }, prompt);
    const fallback = say(VOICE_CONFIG.client.noSelection) + '<Hangup/>';
    return res.send(twiml(gatherBlock, fallback));
  } else if (mode) {
    // No caller or no deals
    const msg = say(VOICE_CONFIG.ivr.noDeals);
    const record = `<Record action="${escapeXml(`${APP_URL}/api/voice?route=record-complete&phone=${encodeURIComponent(phone)}`)}" method="POST" maxLength="${VOICE_CONFIG.recording.maxLength}" transcribe="false" recordingStatusCallback="${escapeXml(`${APP_URL}/api/voice?route=recording-status&phone=${encodeURIComponent(phone)}`)}" recordingStatusCallbackMethod="POST"/>`;
    return res.send(twiml(msg, record));
  }
}

async function handleDealSelect(req: VercelRequest, res: VercelResponse) {
  const { Digits, From } = req.body;
  const phone = (req.query.phone as string) || normalizeToE164(From || '');
  const mode = req.query.mode as string;
  const caller = await identifyCallerByPhone(phone);

  res.setHeader('Content-Type', 'text/xml');

  if (!caller || !caller.activeDeals.length) {
    return res.send(twiml(say(VOICE_CONFIG.ivr.dealSelectError), '<Hangup/>'));
  }

  const idx = parseInt(Digits || '0', 10) - 1;
  if (idx < 0 || idx >= caller.activeDeals.length) {
    return res.send(twiml(say(VOICE_CONFIG.ivr.invalidDealSelection), '<Hangup/>'));
  }

  const deal = caller.activeDeals[idx];

  if (mode === 'status') {
    return handleStatusTextDirect(res, deal, phone);
  } else if (mode === 'record') {
    const prompt = say(VOICE_CONFIG.ivr.recordPrompt(deal.property_address));
    const record = `<Record action="${escapeXml(`${APP_URL}/api/voice?route=record-complete&phone=${encodeURIComponent(phone)}&dealId=${deal.id}`)}" method="POST" maxLength="${VOICE_CONFIG.recording.maxLength}" transcribe="false" recordingStatusCallback="${escapeXml(`${APP_URL}/api/voice?route=recording-status&phone=${encodeURIComponent(phone)}&dealId=${deal.id}`)}" recordingStatusCallbackMethod="POST"/>`;
    return res.send(twiml(prompt, record));
  } else {
    return res.send(twiml(say(VOICE_CONFIG.general.goodbye), '<Hangup/>'));
  }
}

async function handleStatusTextDirect(res: VercelResponse, deal: any, phone: string) {
  const summary = SMS_CONFIG.statusText(deal);
  await sendSms(phone, summary);

  const thanksMsg = say(VOICE_CONFIG.ivr.statusSent(deal.property_address));
  const gatherBlock = gather({ action: `intent&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: 5 }, thanksMsg);
  const fallback = say(VOICE_CONFIG.ivr.menuFallback) + '<Hangup/>';

  res.setHeader('Content-Type', 'text/xml');
  return res.send(twiml(gatherBlock, fallback));
}

async function handleStatusText(req: VercelRequest, res: VercelResponse) {
  const dealId = req.query.dealId as string;
  const phone = (req.query.phone as string) || normalizeToE164(req.body.From || '');

  res.setHeader('Content-Type', 'text/xml');

  if (!dealId) {
    return res.send(twiml(say(VOICE_CONFIG.general.unknownRoute), '<Hangup/>'));
  }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, property_address, pipeline_stage, closing_date, city, state')
    .eq('id', dealId)
    .single();

  if (!deal) {
    return res.send(twiml(say(VOICE_CONFIG.ivr.dealSelectError), '<Hangup/>'));
  }

  return handleStatusTextDirect(res, deal, phone);
}

async function handleRecordComplete(req: VercelRequest, res: VercelResponse) {
  // Recording action callback — the recording is done
  res.setHeader('Content-Type', 'text/xml');
  return res.send(twiml(
    say(VOICE_CONFIG.ivr.recordComplete),
    '<Hangup/>'
  ));
}

async function handleRecordingStatus(req: VercelRequest, res: VercelResponse) {
  const { RecordingSid, RecordingUrl, RecordingStatus, CallSid } = req.body;
  const phone = (req.query.phone as string) || '';
  const dealId = (req.query.dealId as string) || '';

  if (RecordingStatus !== 'completed') {
    return res.status(200).send('OK');
  }

  try {
    // Identify caller
    const caller = phone ? await identifyCallerByPhone(phone) : null;

    // POST to AI pipeline for async processing
    await fetch(`${APP_URL}/api/ai?action=process-recording`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordingSid: RecordingSid,
        recordingUrl: RecordingUrl,
        callerContactId: caller?.contact.id || null,
        dealId: dealId || (caller?.activeDeals[0]?.id || null),
        phoneE164: phone,
        callSid: CallSid,
      }),
    });
  } catch (err) {
    console.error('recording-status error:', err);
  }

  return res.status(200).send('OK');
}

async function handleCallbackReason(req: VercelRequest, res: VercelResponse) {
  const phone = (req.query.phone as string) || normalizeToE164(req.body.From || '');

  res.setHeader('Content-Type', 'text/xml');

  // First time — gather reason
  const prompt = say(VOICE_CONFIG.ivr.callbackReasonPrompt);
  const gatherBlock = gather({ action: `callback-confirm&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: VOICE_CONFIG.dtmfTimeout }, prompt);
  const fallback = say(VOICE_CONFIG.ivr.callbackSkip) + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleCallbackConfirm(req: VercelRequest, res: VercelResponse) {
  const { SpeechResult, Digits, CallSid } = req.body;
  const phone = (req.query.phone as string) || normalizeToE164(req.body.From || '');
  const reason = SpeechResult || (Digits ? 'No reason provided (pressed key to skip)' : 'No reason provided');

  const caller = await identifyCallerByPhone(phone);

  // Create callback request
  await supabase.from('callback_requests').insert({
    caller_contact_id: caller?.contact.id || null,
    deal_id: caller?.activeDeals[0]?.id || null,
    phone_e164: phone,
    requested_by_channel: 'voice',
    reason,
    priority: 'normal',
    status: 'open',
  });

  // Send SMS confirmation
  await sendSms(phone, SMS_CONFIG.responses.callbackSms);

  // Log communication event
  await supabase.from('communication_events').insert({
    contact_id: caller?.contact.id || null,
    channel: 'voice',
    direction: 'inbound',
    event_type: 'callback_request',
    summary: `Callback requested via IVR: ${reason}`,
    source_ref: CallSid,
    metadata: { phone, reason },
  });

  res.setHeader('Content-Type', 'text/xml');
  return res.send(twiml(
    say(VOICE_CONFIG.ivr.callbackConfirm),
    '<Hangup/>'
  ));
}

async function handleCallStatus(req: VercelRequest, res: VercelResponse) {
  const { CallSid, CallDuration, CallStatus } = req.body;

  try {
    // Only update the GENERAL inbound call event — never overwrite Q&A records
    await supabase
      .from('communication_events')
      .update({
        metadata: { duration: CallDuration, callStatus: CallStatus },
      })
      .eq('source_ref', CallSid)
      .eq('event_type', 'general');
  } catch (err) {
    console.error('call-status update error:', err);
  }

  return res.status(200).send('OK');
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only POST for Twilio webhooks
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const route = req.query.route as string;

  try {
    switch (route) {
      case 'inbound': return handleInbound(req, res);
      case 'intent': return handleIntent(req, res);
      case 'deal-select': return handleDealSelect(req, res);
      case 'status-text': return handleStatusText(req, res);
      case 'record-complete': return handleRecordComplete(req, res);
      case 'recording-status': return handleRecordingStatus(req, res);
      case 'callback-reason': return handleCallbackReason(req, res);
      case 'callback-confirm': return handleCallbackConfirm(req, res);
      case 'call-status': return handleCallStatus(req, res);
      case 'admin-query': return handleAdminQuery(req, res);
      case 'admin-wrapup': return handleAdminWrapup(req, res);
      case 'admin-email-confirm': return handleAdminEmailConfirm(req, res);
      case 'client-ai-query': return handleClientAIQuery(req, res);
      case 'client-deal-select': return handleClientDealSelect(req, res);
      case 'client-ai-wrapup': return handleClientAIWrapup(req, res);
      case 'client-deal-email-confirm': return handleClientDealEmailConfirm(req, res);
      default:
        // Unknown route — hang up gracefully
        res.setHeader('Content-Type', 'text/xml');
        return res.send(twiml(say(VOICE_CONFIG.general.unknownRoute)));
    }
  } catch (err: any) {
    console.error(`Voice ${route} error:`, err);
    res.setHeader('Content-Type', 'text/xml');
    return res.send(twiml(say(VOICE_CONFIG.general.systemError)));
  }
}
