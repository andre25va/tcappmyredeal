import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
// ── Inline Configs (Vercel serverless can't resolve ../src/config/ at runtime) ──

const VOICE_CONFIG = {
  // TwiML voice settings
  voice: 'Polly.Joanna' as const,
  
  // Timeouts (seconds)
  speechTimeout: 15,
  dtmfTimeout: 8,
  wrapupTimeout: 8,
  followUpTimeout: 12,
  
  // Admin (Andre) voice AI
  admin: {
    phone: '+13129989898',
    email: 'info@andrevargasteam.com',
    greeting: "Hey Andre! What would you like to know? Ask me about any deals, contacts, tasks, or anything in your database. Say done when you're finished and I'll ask if you want a summary emailed to you.",
    noInput: 'No question received. Call back anytime. Goodbye!',
    retry: "I didn't catch that. Go ahead and ask your question.",
    noInputFinal: 'No question received. Goodbye!',
    followUp: "Any other questions? Or say done when you're finished.",
    wrapupPrompt: 'Would you like me to email you a full summary of this conversation? Say yes or no.',
    wrapupDecline: 'No problem. Have a great day! Goodbye.',
    emailSent: 'Done! I sent a full summary to info at andrevargasteam dot com. Have a great day! Goodbye.',
    emailFailed: "I ran into a problem sending the email. The mail service may need attention. Have a great day! Goodbye.",
    errorGeneric: 'Sorry, I ran into an error. Please try again. Goodbye!',
  },

  // Client voice AI
  client: {
    greetingSingle: (name: string, address: string) =>
      `Hey ${name}! Welcome to My ReDeal. I see you have a transaction at ${address}. What would you like to know about this deal? Say done when you're finished.`,
    greetingMultiple: (name: string, count: number, listText: string) =>
      `Hey ${name}! Welcome to My ReDeal. You have ${count} active deals. Which one are you calling about? ${listText}`,
    greetingNoDeals: (name: string) =>
      `Hey ${name}! Welcome to My ReDeal. I don't see any active deals on file for you right now. Please reach out to your transaction coordinator directly. Have a great day! Goodbye!`,
    dealSelected: (address: string) =>
      `Got it. What would you like to know about ${address}? Say done when you're finished.`,
    noInput: 'No question received. Call us back anytime. Goodbye!',
    retry: "I didn't catch that. Go ahead and ask your question.",
    noInputFinal: 'No question received. Goodbye!',
    followUp: "Any other questions? Or say done when you're finished.",
    wrapupPrompt: 'Would you like me to email you a full summary of your deal? Say yes or no.',
    wrapupDecline: 'No problem. Have a great day! Goodbye.',
    emailSent: (address: string) =>
      `Done! I sent a full summary for ${address} to your email on file. Have a great day! Goodbye.`,
    emailFailed: "I ran into a problem sending the email. Please try again on your next call. Have a great day! Goodbye.",
    noEmail: "I don't have an email address on file for you. Have a great day! Goodbye.",
    noDealId: "I wasn't able to identify which deal to summarize. Have a great day! Goodbye.",
    dealLoadError: "I couldn't load your deal information. Have a great day! Goodbye.",
    errorGeneric: "Sorry, I ran into an error. Please try again. Goodbye!",
    dealNotFound: "Sorry, we couldn't find your deals. Goodbye.",
    invalidSelection: (listText: string) => `I didn't catch that. ${listText}`,
    noSelection: 'No selection received. Goodbye.',
  },

  // Non-client / unknown caller
  nonClient: {
    known: (name: string) =>
      `Hi ${name}, thank you for calling My ReDeal Transaction Services. This line is reserved for TC client accounts. Please reach out to your transaction coordinator directly. Goodbye!`,
    unknown: "Thank you for calling My ReDeal Transaction Services. We don't recognize this number. Please leave a message with your name, phone number, and the property address you're calling about, and we'll get back to you shortly.",
  },

  // IVR menu (non-AI flow)
  ivr: {
    statusSent: (address: string) =>
      `I've just texted you a status update for ${address}. Is there anything else?`,
    recordPrompt: (address: string) =>
      `Please leave your update for ${address} after the beep.`,
    recordComplete: "Thank you! We've received your message and our team will review it shortly. Goodbye!",
    callbackReasonPrompt: 'Briefly tell us what you need help with, or press any key to skip.',
    callbackSkip: "No worries. We'll call you back soon. Goodbye!",
    callbackConfirm: "We've received your callback request. A team member will reach out soon. Goodbye!",
    menuRepeat: 'Press 1 or say status for a deal update texted to you. Press 2 or say update to leave a voice message about your deal. Press 3 or say callback to request a callback. Press 0 to repeat this menu.',
    menuFallback: 'Goodbye! Have a great day.',
    menuError: "Sorry, I didn't understand. Press 1 for status, 2 to leave an update, 3 for a callback.",
    noDeals: "We couldn't find any active deals for you. Please leave a message after the beep.",
    dealSelectError: "Sorry, we couldn't find your deals. Goodbye.",
    invalidDealSelection: 'Invalid selection. Goodbye.',
  },

  // General
  general: {
    unknownRoute: 'Sorry, something went wrong. Please try calling back later. Goodbye.',
    systemError: 'We encountered an error. Please try calling back later. Goodbye.',
    noAnswer: "I wasn't able to find an answer.",
    noAnswerClient: "I wasn't able to find an answer to that.",
    goodbye: 'Goodbye!',
  },

  // "Done" detection phrases
  donePhrases: [
    'done', 'goodbye', 'bye', "that's all", 'thats all', 'no more',
    'nothing else', "i'm done", 'im done', 'all set', 'no questions',
    'hang up', "i'm good", 'im good', 'stop', 'end', 'finished',
  ],

  // Recording settings
  recording: {
    maxLength: 120,
  },

  // Outbound call prompts (V6)
  outbound: {
    connecting: 'Connecting you now. One moment please.',
    callEnded: 'The call has ended. Your notes will be saved. Goodbye.',
    clientBusy: 'The line was busy. Try again later. Goodbye.',
    clientNoAnswer: 'No answer. The client may be unavailable. Goodbye.',
    clientFailed: 'The call could not be completed. Please try again. Goodbye.',
    noClientPhone: 'No client phone number found. Goodbye.',
  },
} as const;

const AI_CONFIG = {
  // Model defaults
  models: {
    voice: 'gpt-4o-mini',
    chat: 'gpt-4o-mini',
    classification: 'gpt-4o-mini',
    smartTask: 'gpt-4o-mini',
  },

  // Temperature settings
  temperature: {
    voice: 0.3,
    classification: 0.2,
    smartTask: 0.3,
  },

  // Token limits
  maxTokens: {
    adminVoice: 200,
    clientVoice: 150,
    classification: 200,
    smartTask: 300,
  },

  // System prompts
  prompts: {
    adminVoice: (dbSnapshot: string) =>
      `You are the AI voice assistant for TC Command, a real estate transaction coordination app owned by Andre Vargas (AVT Capital LLC).
Andre is calling via phone asking questions about his database. Keep answers to 2-3 sentences max — voice-friendly, direct, no filler.
Do NOT offer to send anything — the system handles that at the end of the call.

CURRENT DATABASE SNAPSHOT:
${dbSnapshot}`,

    clientVoice: (firstName: string, dealInfo: string) =>
      `You are the AI voice assistant for TC Command, a real estate transaction coordination service. You're speaking with ${firstName}, one of the agents.
Keep answers to 2-3 short sentences — this is a phone call. Be direct and voice-friendly. No bullet points or lists.
Do NOT offer to send emails or texts — the system handles that at the end of the call.
Only answer questions about the deal shown below.

DEAL INFORMATION:
${dealInfo}`,

    smsClassification: `You are a TC (Transaction Coordinator) assistant. Analyze inbound messages from clients and determine:
1. Does this message contain a REQUEST or ACTION needed? (yes/no)
2. If yes, write a concise task title (under 60 chars) for the TC to act on.
3. Suggest priority: high/normal/low

Respond ONLY with JSON: {"needs_task": true/false, "task_title": "...", "priority": "high|normal|low", "auto_reply": "brief friendly acknowledgment under 100 chars"}`,

    smartTaskClassification: `You are a TC (Transaction Coordinator) assistant. Classify this request into a structured task.
Return ONLY valid JSON:
{
  "title": "concise task title under 60 chars",
  "channel": "email|sms|whatsapp|call|in_person",
  "priority": "high|normal|low",
  "description": "brief description of what needs to happen",
  "type": "document_delivery|follow_up|callback|information_request|scheduling|other"
}`,

    callNotesStructure: `You are a TC assistant. Structure these messy call notes into organized output.
Return ONLY valid JSON:
{
  "summary": "2-3 sentence summary of the call",
  "action_items": [{"title": "task title under 60 chars", "priority": "high|normal|low", "type": "task|follow_up|document_request"}],
  "key_points": ["brief key point from the call"]
}`,
  },
} as const;

const SMS_CONFIG = {
  // SMS command keywords
  commands: {
    HELP: 'HELP',
    OPEN_FILES: 'OPEN FILES',
    STATUS: 'STATUS',
    CALL_ME: 'CALL ME',
    NEW_CONTRACT: 'NEW CONTRACT',
    STOP: 'STOP',
    CANCEL: 'CANCEL',
  },

  // Command responses
  responses: {
    help: '📋 TC Command:\n• OPEN FILES - list your active deals\n• STATUS <address> - get deal update\n• CALL ME - request a callback\n• Or just text us anything! 🏠',
    
    callMeConfirm: '✅ Callback requested! A team member will call you back shortly. 📞',
    
    unknownContact: "We don't recognize this number. Please text us your name and we'll get you set up! 🏠",
    
    noActiveFiles: 'No active files found. Text us if you need help! 🏠',
    
    defaultAutoReply: "Thanks for reaching out! We'll get back to you shortly. 🏠",
    
    callbackSms: '✅ Callback requested! A team member will call you back shortly.',

    openFilesHeader: '📂 Your active files:\n',
    openFilesFooter: '\n\nReply STATUS <address> for details.',
    statusNotFound: (query: string) => `Couldn't find a deal matching "${query}". Try OPEN FILES to see your active deals.`,
  },

  // AI classification (use from config instead of hardcoding in receive.ts)
  aiClassification: {
    systemPrompt: `You are a TC (Transaction Coordinator) assistant. Analyze inbound messages from clients and determine:
1. Does this message contain a REQUEST or ACTION needed? (yes/no)
2. If yes, write a concise task title (under 60 chars) for the TC to act on.
3. Suggest priority: high/normal/low

Respond ONLY with JSON: {"needs_task": true/false, "task_title": "...", "priority": "high|normal|low", "auto_reply": "brief friendly acknowledgment under 100 chars"}`,
    userPromptTemplate: (contactName: string, dealAddress: string | null, messageBody: string) =>
      `Contact: ${contactName}${dealAddress ? ` (Deal: ${dealAddress})` : ''}\nMessage: "${messageBody}"`,
    fallbackReply: "Got it! I'll get back to you shortly.",
  },

  // Contract intake templates
  contractIntake: {
    greeting: (name: string | null) =>
      name
        ? `📋 New contract! Hi ${name} 👋\n\nWhat's the property address for this contract? (e.g. 123 Main St, Kansas City, MO)\n\nReply STOP to cancel.`
        : `📋 New contract! What's the property address? (e.g. 123 Main St, Kansas City, MO)\n\nReply STOP to cancel.`,
    
    addressTooShort: 'Please send the full property address (e.g. 123 Main St, Kansas City, MO)',
    
    confirmed: (address: string) =>
      `✅ Got it! New contract started for:\n\n🏠 ${address}\n\nYour TC will be in touch shortly to complete the file. Text HELP for commands anytime!`,
    
    cancelledRestart: 'No problem! Text NEW CONTRACT anytime to start again. 🏠',
  },

  // Onboarding templates
  onboarding: {
    abandoned: 'No problem! Text us anytime if you need help. 🏠',
    
    steps: {
      greeting: "Reply YES to get started or STOP to skip. 😊",
      name: "Please enter your full name.",
      licenseGreeting: (firstName: string) =>
        `Nice to meet you, ${firstName}! 😊\n\n2️⃣ What's your real estate license number?`,
      licenseState: '3️⃣ What state is that license in? (e.g. KS, MO, IL)',
      mlsName: '4️⃣ What MLS are you a member of? (e.g. Heartland MLS, KCRAR MLS)',
      mlsId: "5️⃣ What's your MLS Agent ID?",
      brokerage: '6️⃣ What brokerage or company are you with?',
      commPref: '7️⃣ How do you prefer to communicate?\nReply: SMS, WHATSAPP, or EMAIL',
      commPrefInvalid: 'Please reply SMS, WHATSAPP, or EMAIL.',
      timezone: "8️⃣ What's your time zone?\nReply: CENTRAL, EASTERN, MOUNTAIN, or PACIFIC",
      timezoneInvalid: 'Please reply CENTRAL, EASTERN, MOUNTAIN, or PACIFIC.',
      confirmYesNo: 'Reply YES to confirm or NO to restart.',
    },
    
    completed: (firstName: string) =>
      `✅ You're all set, ${firstName}!\n\nYour TC Command account is now active. Your TC will be in touch shortly.\n\nText HELP anytime for commands. 🏠`,
    
    restart: "No problem, let's start over.\n\n1️⃣ What's your full name?",
  },

  // Status text template
  statusText: (deal: { property_address: string; pipeline_stage: string; closing_date: string | null; city?: string; state?: string }) => {
    const closing = deal.closing_date
      ? new Date(deal.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      : 'TBD';
    const location = [deal.city, deal.state].filter(Boolean).join(', ');
    return `📋 ${deal.property_address}\nStatus: ${deal.pipeline_stage}\nClosing: ${closing}${location ? `\nCity: ${location}` : ''}\n\nText us if you have questions! 🏠`;
  },

  // Timezone mapping
  timezoneMap: {
    CENTRAL: 'America/Chicago',
    EASTERN: 'America/New_York',
    MOUNTAIN: 'America/Denver',
    PACIFIC: 'America/Los_Angeles',
  } as Record<string, string>,
};

const EMAIL_CONFIG = {
  from: 'TC Command <tc@myredeal.com>',
  
  // Footer text
  footer: {
    admin: 'TC Command — AVT Capital LLC',
    client: 'TC Command — My ReDeal Transaction Services',
  },

  // Admin voice call summary email
  adminCallSummary: {
    subject: (date: string) => `📞 Voice Call Summary — ${date}`,
    
    buildHtml: (params: {
      callDate: string;
      callTime: string;
      qaItems: Array<{ question: string; answer: string }>;
    }) => {
      const qaHtml = params.qaItems.map((item, i) => `
        <div style="margin-bottom:20px;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #2563eb;">
          <p style="margin:0 0 8px;font-weight:600;color:#1e3a5f;font-size:15px;">Q${i + 1}: ${item.question}</p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${item.answer}</p>
        </div>`).join('');

      return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;">
          <div style="background:#1e3a5f;padding:24px;border-radius:8px 8px 0 0;">
            <h1 style="margin:0;color:#fff;font-size:22px;">📞 Voice Call Summary</h1>
            <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">${params.callDate} at ${params.callTime} CT</p>
          </div>
          <div style="padding:24px;">
            <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">${params.qaItems.length} question${params.qaItems.length === 1 ? '' : 's'} answered during this call.</p>
            ${qaHtml}
          </div>
          <div style="padding:16px 24px;background:#f1f5f9;border-radius:0 0 8px 8px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">TC Command — AVT Capital LLC</p>
          </div>
        </div>`;
    },
  },

  // Client deal summary email
  clientDealSummary: {
    subject: (address: string) => `🏠 Your Deal Summary — ${address}`,
    
    buildHtml: (params: {
      recipientName: string;
      deal: {
        property_address: string;
        city?: string;
        state?: string;
        mls_number?: string;
        transaction_type?: string;
        pipeline_stage?: string;
        closing_date?: string;
        purchase_price?: number;
        legal_description?: string;
      };
      participantsText: string;
      callDate: string;
      callTime: string;
    }) => {
      const { deal, recipientName, participantsText, callDate, callTime } = params;
      const closing = deal.closing_date
        ? new Date(deal.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : 'TBD';
      const price = deal.purchase_price
        ? `$${Number(deal.purchase_price).toLocaleString()}`
        : 'Not set';
      const location = [deal.city, deal.state].filter(Boolean).join(', ');

      const participantRows = participantsText
        .split('\n')
        .filter(Boolean)
        .map(p => `<li style="margin-bottom:6px;color:#374151;font-size:14px;">${p}</li>`)
        .join('');

      return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <div style="background:#1e3a5f;padding:24px;">
            <h1 style="margin:0;color:#fff;font-size:22px;">🏠 Deal Summary</h1>
            <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">${callDate} at ${callTime} CT</p>
          </div>
          <div style="padding:24px;">
            <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">Hi ${recipientName}, here's your full deal summary as of today's call.</p>
            <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px;">
              <h2 style="margin:0 0 12px;color:#1e3a5f;font-size:18px;">${deal.property_address}</h2>
              ${location ? `<p style="margin:0 0 6px;color:#6b7280;font-size:14px;">📍 ${location}</p>` : ''}
              ${deal.mls_number ? `<p style="margin:0 0 6px;color:#6b7280;font-size:14px;">MLS# ${deal.mls_number}</p>` : ''}
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:10px 0;color:#6b7280;font-size:13px;width:40%;">Transaction Type</td>
                <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${deal.transaction_type || 'N/A'}</td>
              </tr>
              <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:10px 0;color:#6b7280;font-size:13px;">Pipeline Stage</td>
                <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${deal.pipeline_stage || 'N/A'}</td>
              </tr>
              <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:10px 0;color:#6b7280;font-size:13px;">Closing Date</td>
                <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${closing}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#6b7280;font-size:13px;">Contract Price</td>
                <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${price}</td>
              </tr>
            </table>
            ${participantRows ? `
            <div style="margin-bottom:20px;">
              <h3 style="margin:0 0 10px;color:#1e3a5f;font-size:15px;">Transaction Team</h3>
              <ul style="margin:0;padding-left:18px;">${participantRows}</ul>
            </div>` : ''}
            ${deal.legal_description ? `
            <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:20px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Legal Description</p>
              <p style="margin:0;color:#374151;font-size:13px;">${deal.legal_description}</p>
            </div>` : ''}
          </div>
          <div style="padding:16px 24px;background:#f1f5f9;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">TC Command — My ReDeal Transaction Services</p>
          </div>
        </div>`;
    },
  },
} as const;


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

// ── Outbound Call Handlers (V6-B) ─────────────────────────────────────────────

async function handleOutboundConnect(req: VercelRequest, res: VercelResponse) {
  const attemptId = req.query.attemptId as string;
  const clientPhone = req.query.clientPhone as string;

  res.setHeader('Content-Type', 'text/xml');

  if (!clientPhone) {
    return res.send(twiml(say(VOICE_CONFIG.outbound.noClientPhone), '<Hangup/>'));
  }

  // Update staff leg status
  if (attemptId) {
    await supabase.from('callback_attempts')
      .update({ staff_leg_status: 'answered', connected_at: new Date().toISOString() })
      .eq('id', attemptId);
  }

  // Say connecting message, then dial client
  const connectMsg = say(VOICE_CONFIG.outbound.connecting);
  const statusUrl = `${APP_URL}/api/voice?route=outbound-dial-status&attemptId=${encodeURIComponent(attemptId || '')}`;
  const dial = `<Dial callerId="${TWILIO_PHONE}" action="${escapeXml(statusUrl)}" method="POST" timeout="30"><Number>${escapeXml(clientPhone)}</Number></Dial>`;

  return res.send(twiml(connectMsg, dial));
}

async function handleOutboundDialStatus(req: VercelRequest, res: VercelResponse) {
  const { DialCallSid, DialCallStatus, DialCallDuration } = req.body;
  const attemptId = req.query.attemptId as string;

  res.setHeader('Content-Type', 'text/xml');

  if (attemptId) {
    const outcome = DialCallStatus === 'completed' ? 'completed'
      : DialCallStatus === 'busy' ? 'busy'
      : DialCallStatus === 'no-answer' ? 'no_answer'
      : DialCallStatus === 'failed' ? 'failed'
      : 'unknown';

    await supabase.from('callback_attempts').update({
      client_call_sid: DialCallSid || null,
      client_leg_status: DialCallStatus || 'unknown',
      outcome,
      duration_seconds: DialCallDuration ? parseInt(DialCallDuration) : null,
      ended_at: new Date().toISOString(),
    }).eq('id', attemptId);

    // If this was from a callback_request, update that too
    const { data: attempt } = await supabase.from('callback_attempts')
      .select('callback_request_id')
      .eq('id', attemptId)
      .single();

    if (attempt?.callback_request_id && outcome === 'completed') {
      await supabase.from('callback_requests').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', attempt.callback_request_id);
    }
  }

  // After client hangs up, play post-call message to TC
  if (DialCallStatus === 'completed') {
    return res.send(twiml(say(VOICE_CONFIG.outbound.callEnded), '<Hangup/>'));
  } else if (DialCallStatus === 'busy') {
    return res.send(twiml(say(VOICE_CONFIG.outbound.clientBusy), '<Hangup/>'));
  } else if (DialCallStatus === 'no-answer') {
    return res.send(twiml(say(VOICE_CONFIG.outbound.clientNoAnswer), '<Hangup/>'));
  } else {
    return res.send(twiml(say(VOICE_CONFIG.outbound.clientFailed), '<Hangup/>'));
  }
}

async function handleOutboundParentStatus(req: VercelRequest, res: VercelResponse) {
  const { CallStatus } = req.body;
  const attemptId = req.query.attemptId as string;

  if (attemptId && CallStatus) {
    // Only update if TC didn't answer (failed/no-answer/busy)
    if (['no-answer', 'busy', 'failed', 'canceled'].includes(CallStatus)) {
      await supabase.from('callback_attempts').update({
        staff_leg_status: CallStatus,
        outcome: `staff_${CallStatus}`,
        ended_at: new Date().toISOString(),
      }).eq('id', attemptId);
    }
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
      case 'outbound-connect': return handleOutboundConnect(req, res);
      case 'outbound-dial-status': return handleOutboundDialStatus(req, res);
      case 'outbound-parent-status': return handleOutboundParentStatus(req, res);
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
