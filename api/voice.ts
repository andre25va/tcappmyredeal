import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER!;
const APP_URL = 'https://tcappmyredeal.vercel.app';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const ADMIN_PHONE = '+13129989898';

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
  return `<Say voice="Polly.Joanna">${escapeXml(text)}</Say>`;
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

    // 4. Get active deals via deal_participants
    const { data: participants } = await supabase
      .from('deal_participants')
      .select('deal_id')
      .eq('contact_id', contact.id);

    let activeDeals: any[] = [];
    const dealIds = (participants || []).map((p: any) => p.deal_id);
    if (dealIds.length > 0) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, property_address, pipeline_stage, closing_date, city, state')
        .in('id', dealIds)
        .not('status', 'in', '("closed","terminated")');
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

function buildClientDealSummary(deal: any): string {
  const closing = deal.closing_date
    ? new Date(deal.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : 'TBD';
  const city = deal.city || '';
  const state = deal.state || '';
  const location = city && state ? `${city}, ${state}` : city || state || '';
  return `📋 ${deal.property_address}\nStatus: ${deal.pipeline_stage}\nClosing: ${closing}${location ? `\nCity: ${location}` : ''}\n\nText us if you have questions! 🏠`;
}

// ── Route Handlers ────────────────────────────────────────────────────────────

async function handleAdminInbound(req: VercelRequest, res: VercelResponse, phone: string) {
  res.setHeader('Content-Type', 'text/xml');
  const greeting = say('Hey Andre! What would you like to know? Ask me about any deals, contacts, tasks, or anything in your database. Go ahead and speak after the tone.');
  const gatherBlock = gather(
    { action: `admin-query&phone=${encodeURIComponent(phone)}`, input: 'speech', timeout: 15 },
    greeting
  );
  const fallback = say('No question received. Call back anytime. Goodbye!') + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleAdminQuery(req: VercelRequest, res: VercelResponse) {
  const { SpeechResult, From } = req.body;
  const phone = (req.query.phone as string) || normalizeToE164(From || '');
  const question = SpeechResult || '';

  res.setHeader('Content-Type', 'text/xml');

  if (!question) {
    const retry = say('I didn\'t catch that. Please call back and try again. Goodbye!');
    return res.send(twiml(retry, '<Hangup/>'));
  }

  try {
    // Pull database context for OpenAI
    const [dealsRes, contactsRes, tasksRes] = await Promise.all([
      supabase.from('deals').select('id, property_address, city, state, pipeline_stage, closing_date, contract_price, transaction_type, status').or('status.is.null,status.neq.terminated').limit(50),
      supabase.from('contacts').select('id, first_name, last_name, email, contact_type, company').limit(100),
      supabase.from('comm_tasks').select('id, title, status, priority, due_date, deal_id').eq('status', 'pending').limit(30),
    ]);

    const deals = dealsRes.data || [];
    const contacts = contactsRes.data || [];
    const tasks = tasksRes.data || [];

    const systemPrompt = `You are the AI assistant for TC Command, a real estate transaction coordination app owned by Andre Vargas (AVT Capital LLC). 
Andre is calling you via phone and asking a question about his database. 
Answer concisely and helpfully. You have access to live data from his Supabase database.

CURRENT DATABASE SNAPSHOT:
=== DEALS (${deals.length} total) ===
${deals.map((d: any) => `- ${d.property_address}${d.city ? `, ${d.city}` : ''}${d.state ? `, ${d.state}` : ''} | Stage: ${d.pipeline_stage} | Type: ${d.transaction_type} | Closing: ${d.closing_date || 'TBD'} | Price: $${d.contract_price?.toLocaleString() || 'N/A'} | Status: ${d.status}`).join('\n')}

=== CONTACTS (${contacts.length} total) ===
${contacts.map((c: any) => `- ${c.first_name} ${c.last_name} | Type: ${c.contact_type}${c.company ? ` | ${c.company}` : ''}${c.email ? ` | ${c.email}` : ''}`).join('\n')}

=== PENDING TASKS (${tasks.length} total) ===
${tasks.map((t: any) => `- ${t.title} | Priority: ${t.priority} | Due: ${t.due_date || 'No due date'}`).join('\n')}

Answer Andre's question directly and clearly. Keep voice answer under 3 sentences. You will also send him the full detailed answer via SMS.`;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    const aiData = await aiRes.json() as any;
    const answer = aiData.choices?.[0]?.message?.content || 'I wasn\'t able to find an answer. Please try again.';

    // Send full answer via SMS
    await sendSms(phone, `🤖 TC Command AI\n\nYou asked: "${question}"\n\n${answer}`);

    // Voice reads a brief summary
    const voiceSummary = answer.length > 300 ? answer.substring(0, 280) + '... Full answer sent to your phone.' : answer + ' I\'ve also sent this to your phone.';

    const responseVoice = say(voiceSummary);
    const followUp = gather(
      { action: `admin-query&phone=${encodeURIComponent(phone)}`, input: 'speech', timeout: 10 },
      say('Do you have another question? Go ahead and ask, or hang up when done.')
    );
    const fallback = '<Hangup/>';

    return res.send(twiml(responseVoice, followUp, fallback));

  } catch (err) {
    console.error('admin-query error:', err);
    const errMsg = say('Sorry, I ran into an error looking that up. Please try again in a moment. Goodbye!');
    return res.send(twiml(errMsg, '<Hangup/>'));
  }
}

async function handleInbound(req: VercelRequest, res: VercelResponse) {
  const { From, CallSid } = req.body;
  const fromE164 = normalizeToE164(From || '');

  // Admin voice AI flow — Andre Vargas gets full database query assistant
  if (fromE164 === ADMIN_PHONE) {
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

  if (caller) {
    const firstName = caller.contact.first_name;
    const dealCount = caller.activeDeals.length;

    if (dealCount > 0) {
      const greeting = say(`Hello ${firstName}! Thanks for calling My ReDeal Transaction Services. You have ${dealCount} active ${dealCount === 1 ? 'file' : 'files'}.`);
      const menu = say('Press 1 or say status for a deal update texted to you. Press 2 or say update to leave a voice message about your deal. Press 3 or say callback to request a callback. Press 0 to repeat this menu.');
      const gatherBlock = gather({ action: `intent&phone=${encodeURIComponent(fromE164)}`, input: 'dtmf speech', timeout: 8 }, greeting, menu);
      const fallback = say('We didn\'t hear anything. Goodbye!') + '<Hangup/>';
      return res.send(twiml(gatherBlock, fallback));
    } else {
      const greeting = say(`Hello ${firstName}! Thanks for calling My ReDeal Transaction Services. We don't have any active files for you right now.`);
      const prompt = say('You can press 3 or say callback to request a callback, or leave a message after the beep.');
      const gatherBlock = gather({ action: `intent&phone=${encodeURIComponent(fromE164)}`, input: 'dtmf speech', timeout: 6 }, greeting, prompt);
      const recordFallback = `<Record action="${escapeXml(`${APP_URL}/api/voice?route=record-complete&phone=${encodeURIComponent(fromE164)}`)}" method="POST" maxLength="120" transcribe="false" recordingStatusCallback="${escapeXml(`${APP_URL}/api/voice?route=recording-status&phone=${encodeURIComponent(fromE164)}`)}" recordingStatusCallbackMethod="POST"/>`;
      return res.send(twiml(gatherBlock, recordFallback));
    }
  } else {
    // Unknown caller
    const greeting = say('Thank you for calling My ReDeal Transaction Services. We don\'t recognize this number. Please leave a message with your name, phone number, and the property address you\'re calling about, and we\'ll get back to you shortly.');
    const record = `<Record action="${escapeXml(`${APP_URL}/api/voice?route=record-complete&phone=${encodeURIComponent(fromE164)}`)}" method="POST" maxLength="120" transcribe="false" recordingStatusCallback="${escapeXml(`${APP_URL}/api/voice?route=recording-status&phone=${encodeURIComponent(fromE164)}`)}" recordingStatusCallbackMethod="POST"/>`;

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
    const prompt = say('Briefly tell us what you need help with, or press any key to skip.');
    const gatherBlock = gather({ action: `callback-confirm&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: 8 }, prompt);
    const fallback = say('No worries. We\'ll call you back soon. Goodbye!') + '<Hangup/>';
    return res.send(twiml(gatherBlock, fallback));
  } else if (input === '0') {
    // Repeat menu
    const menu = say('Press 1 or say status for a deal update texted to you. Press 2 or say update to leave a voice message about your deal. Press 3 or say callback to request a callback. Press 0 to repeat this menu.');
    const gatherBlock = gather({ action: `intent&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: 8 }, menu);
    const fallback = say('Goodbye! Have a great day.') + '<Hangup/>';
    return res.send(twiml(gatherBlock, fallback));
  } else {
    const retry = say('Sorry, I didn\'t understand. Press 1 for status, 2 to leave an update, 3 for a callback.');
    const gatherBlock = gather({ action: `intent&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: 8 }, retry);
    const fallback = say('Goodbye!') + '<Hangup/>';
    return res.send(twiml(gatherBlock, fallback));
  }

  // Deal selection for status or record modes
  if (mode && caller && caller.activeDeals.length === 1) {
    const deal = caller.activeDeals[0];
    if (mode === 'status') {
      return handleStatusTextDirect(res, deal, phone);
    } else {
      // Record mode — prompt to record
      const prompt = say(`Please leave your update for ${deal.property_address} after the beep.`);
      const record = `<Record action="${escapeXml(`${APP_URL}/api/voice?route=record-complete&phone=${encodeURIComponent(phone)}&dealId=${deal.id}`)}" method="POST" maxLength="120" transcribe="false" recordingStatusCallback="${escapeXml(`${APP_URL}/api/voice?route=recording-status&phone=${encodeURIComponent(phone)}&dealId=${deal.id}`)}" recordingStatusCallbackMethod="POST"/>`;
      return res.send(twiml(prompt, record));
    }
  } else if (mode && caller && caller.activeDeals.length > 1) {
    // Multiple deals — list them
    const listing = caller.activeDeals.map((d, i) => `Press ${i + 1} for ${d.property_address}.`).join(' ');
    const prompt = say(`You have ${caller.activeDeals.length} active files. ${listing}`);
    const gatherBlock = gather({ action: `deal-select&mode=${mode}&phone=${encodeURIComponent(phone)}`, numDigits: 1, timeout: 8 }, prompt);
    const fallback = say('No selection received. Goodbye!') + '<Hangup/>';
    return res.send(twiml(gatherBlock, fallback));
  } else if (mode) {
    // No caller or no deals
    const msg = say('We couldn\'t find any active deals for you. Please leave a message after the beep.');
    const record = `<Record action="${escapeXml(`${APP_URL}/api/voice?route=record-complete&phone=${encodeURIComponent(phone)}`)}" method="POST" maxLength="120" transcribe="false" recordingStatusCallback="${escapeXml(`${APP_URL}/api/voice?route=recording-status&phone=${encodeURIComponent(phone)}`)}" recordingStatusCallbackMethod="POST"/>`;
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
    return res.send(twiml(say('Sorry, we couldn\'t find your deals. Goodbye.'), '<Hangup/>'));
  }

  const idx = parseInt(Digits || '0', 10) - 1;
  if (idx < 0 || idx >= caller.activeDeals.length) {
    return res.send(twiml(say('Invalid selection. Goodbye.'), '<Hangup/>'));
  }

  const deal = caller.activeDeals[idx];

  if (mode === 'status') {
    return handleStatusTextDirect(res, deal, phone);
  } else if (mode === 'record') {
    const prompt = say(`Please leave your update for ${deal.property_address} after the beep.`);
    const record = `<Record action="${escapeXml(`${APP_URL}/api/voice?route=record-complete&phone=${encodeURIComponent(phone)}&dealId=${deal.id}`)}" method="POST" maxLength="120" transcribe="false" recordingStatusCallback="${escapeXml(`${APP_URL}/api/voice?route=recording-status&phone=${encodeURIComponent(phone)}&dealId=${deal.id}`)}" recordingStatusCallbackMethod="POST"/>`;
    return res.send(twiml(prompt, record));
  } else {
    return res.send(twiml(say('Goodbye!'), '<Hangup/>'));
  }
}

async function handleStatusTextDirect(res: VercelResponse, deal: any, phone: string) {
  const summary = buildClientDealSummary(deal);
  await sendSms(phone, summary);

  const thanksMsg = say(`I've just texted you a status update for ${deal.property_address}. Is there anything else?`);
  const gatherBlock = gather({ action: `intent&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: 5 }, thanksMsg);
  const fallback = say('Goodbye! Have a great day.') + '<Hangup/>';

  res.setHeader('Content-Type', 'text/xml');
  return res.send(twiml(gatherBlock, fallback));
}

async function handleStatusText(req: VercelRequest, res: VercelResponse) {
  const dealId = req.query.dealId as string;
  const phone = (req.query.phone as string) || normalizeToE164(req.body.From || '');

  res.setHeader('Content-Type', 'text/xml');

  if (!dealId) {
    return res.send(twiml(say('Sorry, we couldn\'t determine which deal to look up. Goodbye.'), '<Hangup/>'));
  }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, property_address, pipeline_stage, closing_date, city, state')
    .eq('id', dealId)
    .single();

  if (!deal) {
    return res.send(twiml(say('Sorry, we couldn\'t find that deal. Goodbye.'), '<Hangup/>'));
  }

  return handleStatusTextDirect(res, deal, phone);
}

async function handleRecordComplete(req: VercelRequest, res: VercelResponse) {
  // Recording action callback — the recording is done
  res.setHeader('Content-Type', 'text/xml');
  return res.send(twiml(
    say('Thank you! We\'ve received your message and our team will review it shortly. Goodbye!'),
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
  const prompt = say('Briefly tell us what you need help with, or press any key to skip.');
  const gatherBlock = gather({ action: `callback-confirm&phone=${encodeURIComponent(phone)}`, input: 'dtmf speech', timeout: 8 }, prompt);
  const fallback = say('No worries. We\'ll call you back soon. Goodbye!') + '<Hangup/>';
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
  await sendSms(phone, '✅ Callback requested! A team member will call you back shortly.');

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
    say('We\'ve received your callback request. A team member will reach out soon. Goodbye!'),
    '<Hangup/>'
  ));
}

async function handleCallStatus(req: VercelRequest, res: VercelResponse) {
  const { CallSid, CallDuration, CallStatus } = req.body;

  try {
    await supabase
      .from('communication_events')
      .update({
        metadata: { duration: CallDuration, callStatus: CallStatus },
      })
      .eq('source_ref', CallSid);
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
      default:
        // Unknown route — hang up gracefully
        res.setHeader('Content-Type', 'text/xml');
        return res.send(twiml(say('Sorry, something went wrong. Please try calling back later. Goodbye.')));
    }
  } catch (err: any) {
    console.error(`Voice ${route} error:`, err);
    res.setHeader('Content-Type', 'text/xml');
    return res.send(twiml(say('We encountered an error. Please try calling back later. Goodbye.')));
  }
}
