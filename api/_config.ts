// ── Shared Configuration for API Serverless Functions ──────────────────────
// Vercel serverless functions can't resolve ../src/config/ paths at runtime.
// This file contains all configs co-located in api/ for proper bundling.
// Source of truth: update here AND in src/config/ to keep in sync.


// ── Voice AI Configuration ─────────────────────────────────────────────────
// All voice prompts, greetings, and TwiML settings live here.
// Code handles orchestration; config handles content.

export const VOICE_CONFIG = {
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


// ── AI Configuration ───────────────────────────────────────────────────────
// OpenAI model settings and system prompts for all AI features.

export const AI_CONFIG = {
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


// ── SMS/WhatsApp Configuration ─────────────────────────────────────────────
// All SMS templates, commands, and auto-reply messages.

export const SMS_CONFIG = {
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


// ── Email Configuration ────────────────────────────────────────────────────
// All email templates for Resend-powered outbound emails.

export const EMAIL_CONFIG = {
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


// ── Feature Flags ──────────────────────────────────────────────────────────
// Toggle features on/off without code changes.
// Future: these will be stored in Supabase and configurable via admin UI.

export const FEATURE_FLAGS = {
  // Voice AI
  voiceAI: true,
  adminVoiceAI: true,
  clientVoiceAI: true,

  // Outbound callbacks (V6)
  outboundCallbacks: true,   // V6-B complete
  callbackQueue: true,        // V6-C complete
  callbackWorkflows: true,    // V6-D callback workflow rules
  
  // Smart tasks (V6)
  smartTaskCreation: true,    // V6-B OpenAI integration complete
  preCallBrief: true,         // V6-C complete
  postCallNotes: true,        // V6-C complete
  
  // Communications Console (V6)
  communicationsConsole: true, // V6-C UI complete

  // Call UI (V6-C)
  deliveryMethodPicker: true, // V6-C mid-call delivery selection
  activeCallOverlay: true,    // V6-C call overlay UI

  // Existing features
  smsOnboarding: true,
  contractIntakeSms: true,
  callMeCommand: true,
  voiceRecording: true,
  autoTaskCreation: true,
  workflowEngine: true,
} as const;

