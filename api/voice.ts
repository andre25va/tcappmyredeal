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
        .select('id, property_address, pipeline_stage, closing_date, city, state, contract_price, transaction_type, status')
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
  const { CallSid } = req.body;
  res.setHeader('Content-Type', 'text/xml');
  const greeting = say('Hey Andre! What would you like to know? Ask me about any deals, contacts, tasks, or anything in your database. Say done when you\'re finished and I\'ll ask if you want a summary emailed to you.');
  const gatherBlock = gather(
    { action: `admin-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(CallSid || '')}`, input: 'speech', timeout: 15 },
    greeting
  );
  const fallback = say('No question received. Call back anytime. Goodbye!') + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleAdminQuery(req: VercelRequest, res: VercelResponse) {
  const { SpeechResult, From, CallSid } = req.body;
  const phone = (req.query.phone as string) || normalizeToE164(From || '');
  const callSid = (req.query.callSid as string) || CallSid || '';
  const question = SpeechResult || '';

  res.setHeader('Content-Type', 'text/xml');

  if (!question) {
    const retry = say('I didn\'t catch that. Go ahead and ask your question.');
    const gatherBlock = gather(
      { action: `admin-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`, input: 'speech', timeout: 15 },
      retry
    );
    return res.send(twiml(gatherBlock, say('No question received. Goodbye!'), '<Hangup/>'));
  }

  // Detect "done" — route to wrap-up
  const donePhrases = ['done', 'goodbye', 'bye', "that's all", 'thats all', 'no more', 'nothing else', 'i\'m done', 'im done', 'all set', 'no questions', 'hang up', 'i\'m good', 'im good', 'stop', 'end'];
  if (donePhrases.some(p => question.toLowerCase().includes(p))) {
    return handleAdminWrapup(req, res, phone, callSid);
  }

  try {
    // Pull ALL deals — no status filter (admin wants full picture)
    const [dealsRes, contactsRes, tasksRes] = await Promise.all([
      supabase.from('deals').select('id, property_address, city, state, pipeline_stage, closing_date, contract_price, transaction_type, status').limit(50),
      supabase.from('contacts').select('id, first_name, last_name, email, contact_type, company').limit(100),
      supabase.from('comm_tasks').select('id, title, status, priority, due_date, deal_id').eq('status', 'pending').limit(30),
    ]);

    const deals = dealsRes.data || [];
    const contacts = contactsRes.data || [];
    const tasks = tasksRes.data || [];

    const systemPrompt = `You are the AI voice assistant for TC Command, a real estate transaction coordination app owned by Andre Vargas (AVT Capital LLC).
Andre is calling via phone asking questions about his database. Keep answers to 2-3 sentences max — voice-friendly, direct, no filler.
Do NOT offer to send anything — the system handles that at the end of the call.

CURRENT DATABASE SNAPSHOT:
=== DEALS (${deals.length} total) ===
${deals.map((d: any) => `- ${d.property_address}${d.city ? `, ${d.city}` : ''}${d.state ? `, ${d.state}` : ''} | Stage: ${d.pipeline_stage || 'N/A'} | Type: ${d.transaction_type || 'N/A'} | Closing: ${d.closing_date || 'TBD'} | Price: $${d.contract_price?.toLocaleString() || 'N/A'} | Status: ${d.status || 'active'}`).join('\n')}

=== CONTACTS (${contacts.length} total) ===
${contacts.map((c: any) => `- ${c.first_name} ${c.last_name} | Type: ${c.contact_type}${c.company ? ` | ${c.company}` : ''}${c.email ? ` | ${c.email}` : ''}`).join('\n')}

=== PENDING TASKS (${tasks.length} total) ===
${tasks.length > 0 ? tasks.map((t: any) => `- ${t.title} | Priority: ${t.priority} | Due: ${t.due_date || 'No due date'}`).join('\n') : 'No pending tasks'}`;

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
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    const aiData = await aiRes.json() as any;
    const answer = aiData.choices?.[0]?.message?.content || 'I wasn\'t able to find an answer.';

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
      { action: `admin-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`, input: 'speech', timeout: 12 },
      say('Any other questions? Or say done when you\'re finished.')
    );
    // Fallback when they hang up or say nothing — skip to wrap-up
    const fallback = `<Redirect method="POST">${escapeXml(`${APP_URL}/api/voice?route=admin-wrapup&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`)}</Redirect>`;

    return res.send(twiml(responseVoice, followUp, fallback));

  } catch (err) {
    console.error('admin-query error:', err);
    return res.send(twiml(say('Sorry, I ran into an error. Please try again. Goodbye!'), '<Hangup/>'));
  }
}

async function handleAdminWrapup(req: VercelRequest, res: VercelResponse, phone?: string, callSid?: string) {
  const _phone = phone || (req.query.phone as string) || '';
  const _callSid = callSid || (req.query.callSid as string) || '';

  res.setHeader('Content-Type', 'text/xml');

  const prompt = say('Would you like me to email you a full summary of this conversation? Say yes or no.');
  const gatherBlock = gather(
    { action: `admin-email-confirm&phone=${encodeURIComponent(_phone)}&callSid=${encodeURIComponent(_callSid)}`, input: 'speech dtmf', timeout: 8 },
    prompt
  );
  const fallback = say('No problem. Have a great day! Goodbye.') + '<Hangup/>';
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

      if (events && events.length > 0) {
        const callDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const callTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' });

        const qaHtml = events.map((e: any, i: number) => `
          <div style="margin-bottom:20px;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #2563eb;">
            <p style="margin:0 0 8px;font-weight:600;color:#1e3a5f;font-size:15px;">Q${i + 1}: ${e.metadata?.question || ''}</p>
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${e.metadata?.answer || ''}</p>
          </div>`).join('');

        const emailHtml = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;">
            <div style="background:#1e3a5f;padding:24px;border-radius:8px 8px 0 0;">
              <h1 style="margin:0;color:#fff;font-size:22px;">📞 Voice Call Summary</h1>
              <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">${callDate} at ${callTime} CT</p>
            </div>
            <div style="padding:24px;">
              <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">${events.length} question${events.length === 1 ? '' : 's'} answered during this call.</p>
              ${qaHtml}
            </div>
            <div style="padding:16px 24px;background:#f1f5f9;border-radius:0 0 8px 8px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">TC Command — AVT Capital LLC</p>
            </div>
          </div>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'TC Command <tc@myredeal.com>',
            to: ['info@andrevargasteam.com'],
            subject: `📞 Voice Call Summary — ${new Date().toLocaleDateString('en-US')}`,
            html: emailHtml,
          }),
        });

        return res.send(twiml(
          say('Done! I emailed a full summary to your inbox. Have a great day! Goodbye.'),
          '<Hangup/>'
        ));
      }
    } catch (err) {
      console.error('admin-email-confirm error:', err);
    }
  }

  return res.send(twiml(
    say('No problem. Have a great day! Goodbye.'),
    '<Hangup/>'
  ));
}

// ── Client AI Voice Flow ──────────────────────────────────────────────────────

async function handleClientAIInbound(req: VercelRequest, res: VercelResponse, caller: CallerContext) {
  const { CallSid } = req.body;
  const phone = caller.contact ? (await supabase.from('contact_phone_channels').select('phone_e164').eq('contact_id', caller.contact.id).limit(1).single()).data?.phone_e164 || '' : '';
  const firstName = caller.contact.first_name;
  const dealCount = caller.activeDeals.length;
  const dealWord = dealCount === 1 ? 'deal' : 'deals';
  const dealSummary = dealCount > 0
    ? `You currently have ${dealCount} active ${dealWord}: ${caller.activeDeals.map(d => d.property_address).join(', ')}.`
    : `I don't see any active deals on file for you right now.`;

  res.setHeader('Content-Type', 'text/xml');
  const greeting = say(`Hey ${firstName}! Welcome to My ReDeal. ${dealSummary} What would you like to know? You can ask me about your deals, closing dates, contacts, or anything about your transactions. Say done when you're finished.`);
  const gatherBlock = gather(
    { action: `client-ai-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(CallSid || '')}`, input: 'speech', timeout: 15 },
    greeting
  );
  const fallback = say('No question received. Call us back anytime. Goodbye!') + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleClientAIQuery(req: VercelRequest, res: VercelResponse) {
  const { SpeechResult, From, CallSid } = req.body;
  const phone = (req.query.phone as string) || normalizeToE164(From || '');
  const callSid = (req.query.callSid as string) || CallSid || '';
  const question = SpeechResult || '';

  res.setHeader('Content-Type', 'text/xml');

  if (!question) {
    const retry = say('I didn\'t catch that. Go ahead and ask your question.');
    const gatherBlock = gather(
      { action: `client-ai-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`, input: 'speech', timeout: 15 },
      retry
    );
    return res.send(twiml(gatherBlock, say('No question received. Goodbye!'), '<Hangup/>'));
  }

  // Detect "done"
  const donePhrases = ['done', 'goodbye', 'bye', "that's all", 'thats all', 'no more', 'nothing else', 'i\'m done', 'im done', 'all set', 'no questions', 'hang up', 'i\'m good', 'im good', 'stop', 'end'];
  if (donePhrases.some(p => question.toLowerCase().includes(p))) {
    return handleClientAIWrapup(req, res, phone, callSid);
  }

  try {
    const caller = await identifyCallerByPhone(phone);
    if (!caller) {
      return res.send(twiml(say('Sorry, I couldn\'t identify your account. Please call back later. Goodbye.'), '<Hangup/>'));
    }

    const firstName = caller.contact.first_name;
    const lastName = caller.contact.last_name;

    // Get full deal details including participants for their deals
    let dealDetails = caller.activeDeals;
    let dealContactsText = '';
    if (caller.activeDeals.length > 0) {
      const dealIds = caller.activeDeals.map((d: any) => d.id);
      const { data: participants } = await supabase
        .from('deal_participants')
        .select('deal_id, role, contact_id, contacts(first_name, last_name, email, contact_type, company)')
        .in('deal_id', dealIds);

      if (participants && participants.length > 0) {
        const byDeal: Record<string, string[]> = {};
        for (const p of participants as any[]) {
          if (!byDeal[p.deal_id]) byDeal[p.deal_id] = [];
          const c = p.contacts;
          if (c) byDeal[p.deal_id].push(`  ${c.first_name} ${c.last_name} (${p.role || c.contact_type}${c.company ? `, ${c.company}` : ''})`);
        }
        dealContactsText = `\n=== DEAL CONTACTS ===\n` + Object.entries(byDeal).map(([dealId, contacts]) => {
          const deal = caller.activeDeals.find((d: any) => d.id === dealId);
          return `${deal?.property_address || dealId}:\n${contacts.join('\n')}`;
        }).join('\n\n');
      }
    }

    const systemPrompt = `You are the AI voice assistant for TC Command, a real estate transaction coordination service. You're speaking with ${firstName} ${lastName}, one of the agents.
Keep answers to 2-3 short sentences — this is a phone call, be direct and voice-friendly. No bullet points or lists.
Do NOT offer to send anything — the system handles that at the end of the call.
Only answer questions about their data shown below. If asked about something outside their deals, politely say you only have info about their active transactions.

${firstName}'s CURRENT DATA:
=== DEALS (${caller.activeDeals.length} total) ===
${caller.activeDeals.length > 0
  ? caller.activeDeals.map((d: any) => `- ${d.property_address}${d.city ? `, ${d.city}` : ''}${d.state ? `, ${d.state}` : ''} | Stage: ${d.pipeline_stage || 'N/A'} | Type: ${d.transaction_type || 'N/A'} | Closing: ${d.closing_date || 'TBD'} | Price: $${d.contract_price?.toLocaleString() || 'N/A'} | Status: ${d.status || 'active'}`).join('\n')
  : 'No active deals found'}
${dealContactsText}`;

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
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    const aiData = await aiRes.json() as any;
    const answer = aiData.choices?.[0]?.message?.content || 'I wasn\'t able to find an answer to that.';

    // Store Q&A for end-of-call email
    await supabase.from('communication_events').insert({
      contact_id: caller.contact.id,
      channel: 'voice',
      direction: 'inbound',
      event_type: 'client_voice_qa',
      summary: `Q: ${question.substring(0, 200)}`,
      source_ref: callSid,
      metadata: { question, answer, phone, timestamp: new Date().toISOString(), contactName: `${firstName} ${lastName}` },
    });

    const responseVoice = say(answer);
    const followUp = gather(
      { action: `client-ai-query&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`, input: 'speech', timeout: 12 },
      say('Any other questions? Or say done when you\'re finished.')
    );
    const fallback = `<Redirect method="POST">${escapeXml(`${APP_URL}/api/voice?route=client-ai-wrapup&phone=${encodeURIComponent(phone)}&callSid=${encodeURIComponent(callSid)}`)}</Redirect>`;

    return res.send(twiml(responseVoice, followUp, fallback));

  } catch (err) {
    console.error('client-ai-query error:', err);
    return res.send(twiml(say('Sorry, I ran into an error. Please try again. Goodbye!'), '<Hangup/>'));
  }
}

async function handleClientAIWrapup(req: VercelRequest, res: VercelResponse, phone?: string, callSid?: string) {
  const _phone = phone || (req.query.phone as string) || '';
  const _callSid = callSid || (req.query.callSid as string) || '';

  res.setHeader('Content-Type', 'text/xml');

  const prompt = say('Would you like me to email you a summary of this conversation? Say yes or no.');
  const gatherBlock = gather(
    { action: `client-ai-email-confirm&phone=${encodeURIComponent(_phone)}&callSid=${encodeURIComponent(_callSid)}`, input: 'speech dtmf', timeout: 8 },
    prompt
  );
  const fallback = say('No problem. Have a great day! Goodbye.') + '<Hangup/>';
  return res.send(twiml(gatherBlock, fallback));
}

async function handleClientAIEmailConfirm(req: VercelRequest, res: VercelResponse) {
  const { SpeechResult, Digits } = req.body;
  const phone = (req.query.phone as string) || '';
  const callSid = (req.query.callSid as string) || '';
  const speech = (SpeechResult || '').toLowerCase();
  const digits = Digits || '';

  res.setHeader('Content-Type', 'text/xml');

  const wantsEmail = speech.includes('yes') || digits === '1';

  if (wantsEmail && callSid) {
    try {
      const caller = await identifyCallerByPhone(phone);
      const recipientEmail = caller?.contact.email;
      const recipientName = caller ? `${caller.contact.first_name} ${caller.contact.last_name}` : 'Client';

      if (!recipientEmail) {
        return res.send(twiml(say('I don\'t have an email address on file for you. Have a great day! Goodbye.'), '<Hangup/>'));
      }

      const { data: events } = await supabase
        .from('communication_events')
        .select('metadata, created_at')
        .eq('source_ref', callSid)
        .eq('event_type', 'client_voice_qa')
        .order('created_at', { ascending: true });

      if (events && events.length > 0) {
        const callDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const callTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' });

        const qaHtml = events.map((e: any, i: number) => `
          <div style="margin-bottom:20px;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #2563eb;">
            <p style="margin:0 0 8px;font-weight:600;color:#1e3a5f;font-size:15px;">Q${i + 1}: ${e.metadata?.question || ''}</p>
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${e.metadata?.answer || ''}</p>
          </div>`).join('');

        const emailHtml = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;">
            <div style="background:#1e3a5f;padding:24px;border-radius:8px 8px 0 0;">
              <h1 style="margin:0;color:#fff;font-size:22px;">📞 Your Call Summary</h1>
              <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">${callDate} at ${callTime} CT</p>
            </div>
            <div style="padding:24px;">
              <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">Hi ${recipientName}, here's a summary of your ${events.length} question${events.length === 1 ? '' : 's'} from today's call.</p>
              ${qaHtml}
            </div>
            <div style="padding:16px 24px;background:#f1f5f9;border-radius:0 0 8px 8px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">TC Command — My ReDeal Transaction Services</p>
            </div>
          </div>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'TC Command <tc@myredeal.com>',
            to: [recipientEmail],
            subject: `📞 Your Call Summary — ${new Date().toLocaleDateString('en-US')}`,
            html: emailHtml,
          }),
        });

        return res.send(twiml(
          say(`Done! I emailed a summary to ${recipientEmail}. Have a great day! Goodbye.`),
          '<Hangup/>'
        ));
      }
    } catch (err) {
      console.error('client-ai-email-confirm error:', err);
    }
  }

  return res.send(twiml(
    say('No problem. Have a great day! Goodbye.'),
    '<Hangup/>'
  ));
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
    // All known clients get the AI voice assistant scoped to their data
    return handleClientAIInbound(req, res, caller);
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
      case 'admin-wrapup': return handleAdminWrapup(req, res);
      case 'admin-email-confirm': return handleAdminEmailConfirm(req, res);
      case 'client-ai-query': return handleClientAIQuery(req, res);
      case 'client-ai-wrapup': return handleClientAIWrapup(req, res);
      case 'client-ai-email-confirm': return handleClientAIEmailConfirm(req, res);
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
