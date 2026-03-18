// ── Shared Configuration for API Serverless Functions ──────────────────────
// This file re-exports all configs for use by API routes.
// Vercel serverless functions can't resolve ../src/config/ paths,
// so we co-locate configs here in the api/ directory.

// ── Voice Config ───────────────────────────────────────────────────────────
export const VOICE_CONFIG = {
  greeting: {
    admin: "Welcome to TC Command admin. How can I help?",
    client: (name: string) => `Hi ${name}! Welcome to TC Command. How can I help you today?`,
    unknownCaller: "Thanks for calling TC Command. We don't have your number on file. Please reach us by text at this number or email tc@myredeal.com. Goodbye!",
    nonClientCaller: "Thanks for calling TC Command. This line is for clients only. Please reach us by text at this number or email tc@myredeal.com. Goodbye!",
    callbackBridge: "Connecting you now. One moment please.",
    callbackTcGreeting: "Connecting you to your client now.",
  },
  ivr: {
    menu: "Press 1 to ask a question about your deal. Press 2 to hear a summary of your deals. Press 3 to request a callback from your TC.",
    invalidInput: "Sorry, I didn't get that.",
    goodbye: "Thanks for calling TC Command. Goodbye!",
    callbackRequested: "Got it! Your TC will call you back shortly. Goodbye!",
  },
  donePhrases: ['done', 'that is all', "that's all", 'nothing else', 'no more questions', 'goodbye', 'bye', 'end call', 'hang up', "i'm done", 'im done', 'no thanks', 'no thank you', 'thats it', "that's it"],
  timeouts: {
    gather: 5,
    gatherMaxDigits: 1,
    speechTimeout: 'auto' as const,
  },
  recording: {
    enabled: true,
  },
};

// ── AI Config ──────────────────────────────────────────────────────────────
export const AI_CONFIG = {
  models: {
    voice: 'gpt-4o-mini',
    chat: 'gpt-4o-mini',
    classification: 'gpt-4o-mini',
    smartTask: 'gpt-4o-mini',
  },
  temperature: {
    voice: 0.3,
    classification: 0.2,
    smartTask: 0.3,
  },
  maxTokens: {
    adminVoice: 200,
    clientVoice: 150,
    classification: 200,
    smartTask: 300,
  },
  prompts: {
    adminVoice: (dbSnapshot: string) =>
      `You are the AI voice assistant for TC Command, a real estate transaction coordination app owned by Andre Vargas (AVT Capital LLC).\nAndre is calling via phone asking questions about his database. Keep answers to 2-3 sentences max — voice-friendly, direct, no filler.\nDo NOT offer to send anything — the system handles that at the end of the call.\n\nCURRENT DATABASE SNAPSHOT:\n${dbSnapshot}`,

    clientVoice: (firstName: string, dealInfo: string) =>
      `You are the AI voice assistant for TC Command, a real estate transaction coordination service. You're speaking with ${firstName}, one of the agents.\nKeep answers to 2-3 short sentences — this is a phone call. Be direct and voice-friendly. No bullet points or lists.\nDo NOT offer to send emails or texts — the system handles that at the end of the call.\nOnly answer questions about the deal shown below.\n\nDEAL INFORMATION:\n${dealInfo}`,

    smsClassification: `You are a TC (Transaction Coordinator) assistant. Analyze inbound messages from clients and determine:\n1. Does this message contain a REQUEST or ACTION needed? (yes/no)\n2. If yes, write a concise task title (under 60 chars) for the TC to act on.\n3. Suggest priority: high/normal/low\n\nRespond ONLY with JSON: {"needs_task": true/false, "task_title": "...", "priority": "high|normal|low", "auto_reply": "brief friendly acknowledgment under 100 chars"}`,

    smartTaskClassification: `You are a TC (Transaction Coordinator) assistant. Classify this request into a structured task.\nReturn ONLY valid JSON:\n{\n  "title": "concise task title under 60 chars",\n  "channel": "email|sms|whatsapp|call|in_person",\n  "priority": "high|normal|low",\n  "description": "brief description of what needs to happen",\n  "type": "document_delivery|follow_up|callback|information_request|scheduling|other"\n}`,

    callNotesStructure: `You are a TC assistant. Structure these messy call notes into organized output.\nReturn ONLY valid JSON:\n{\n  "summary": "2-3 sentence summary of the call",\n  "action_items": [{"title": "task title under 60 chars", "priority": "high|normal|low", "type": "task|follow_up|document_request"}],\n  "key_points": ["brief key point from the call"]\n}`,
  },
} as const;

// ── SMS Config ─────────────────────────────────────────────────────────────
export const SMS_CONFIG = {
  commands: {
    HELP: 'HELP',
    OPEN_FILES: 'OPEN FILES',
    STATUS: 'STATUS',
    CALL_ME: 'CALL ME',
    NEW_CONTRACT: 'NEW CONTRACT',
    STOP: 'STOP',
    CANCEL: 'CANCEL',
  },
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
  aiClassification: {
    systemPrompt: `You are a TC (Transaction Coordinator) assistant. Analyze inbound messages from clients and determine:\n1. Does this message contain a REQUEST or ACTION needed? (yes/no)\n2. If yes, write a concise task title (under 60 chars) for the TC to act on.\n3. Suggest priority: high/normal/low\n\nRespond ONLY with JSON: {"needs_task": true/false, "task_title": "...", "priority": "high|normal|low", "auto_reply": "brief friendly acknowledgment under 100 chars"}`,
    userPromptTemplate: (contactName: string, dealAddress: string | null, messageBody: string) =>
      `Contact: ${contactName}${dealAddress ? ` (Deal: ${dealAddress})` : ''}\nMessage: "${messageBody}"`,
    fallbackReply: "Got it! I'll get back to you shortly.",
  },
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
  statusText: (deal: { property_address: string; pipeline_stage: string; closing_date: string | null; city?: string; state?: string }) => {
    const closing = deal.closing_date
      ? new Date(deal.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      : 'TBD';
    const location = [deal.city, deal.state].filter(Boolean).join(', ');
    return `📋 ${deal.property_address}\nStatus: ${deal.pipeline_stage}\nClosing: ${closing}${location ? `\nCity: ${location}` : ''}\n\nText us if you have questions! 🏠`;
  },
  timezoneMap: {
    CENTRAL: 'America/Chicago',
    EASTERN: 'America/New_York',
    MOUNTAIN: 'America/Denver',
    PACIFIC: 'America/Los_Angeles',
  } as Record<string, string>,
};

// ── Email Config ───────────────────────────────────────────────────────────
export const EMAIL_CONFIG = {
  from: 'TC Command <tc@myredeal.com>',
  adminSummary: {
    subject: 'TC Command — Your Call Summary',
    buildHtml: (p: { greeting: string; snapshot: string }) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:8px;">
        <h2 style="color:#1e293b;margin:0 0 16px;">TC Command — Call Summary</h2>
        <p style="color:#475569;margin:0 0 16px;">${p.greeting}</p>
        <div style="background:#fff;padding:16px;border-radius:6px;border:1px solid #e2e8f0;">
          <pre style="white-space:pre-wrap;font-size:14px;color:#334155;margin:0;">${p.snapshot}</pre>
        </div>
        <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;">Sent by TC Command Voice AI</p>
      </div>`,
  },
  clientDealSummary: {
    subject: (address: string) => `Your Deal Summary — ${address}`,
    buildHtml: (p: {
      clientName: string;
      address: string;
      mls: string;
      stage: string;
      closingDate: string;
      price: string;
      legalDescription: string;
      teamMembers: { name: string; role: string; phone: string; email: string }[];
    }) => {
      const teamRows = p.teamMembers
        .map(
          (m) =>
            `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${m.name}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${m.role}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${m.phone}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${m.email}</td></tr>`
        )
        .join('');
      return `
        <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:8px;">
          <h2 style="color:#1e293b;margin:0 0 4px;">Deal Summary</h2>
          <p style="color:#64748b;margin:0 0 20px;">For ${p.clientName}</p>
          <div style="background:#fff;padding:20px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:16px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155;">
              <tr><td style="padding:6px 0;font-weight:600;width:140px;">Property</td><td>${p.address}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">MLS #</td><td>${p.mls}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Stage</td><td>${p.stage}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Closing Date</td><td>${p.closingDate}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Price</td><td>${p.price}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Legal Description</td><td style="font-size:12px;">${p.legalDescription}</td></tr>
            </table>
          </div>
          <h3 style="color:#1e293b;margin:0 0 8px;">Your Deal Team</h3>
          <div style="background:#fff;border-radius:6px;border:1px solid #e2e8f0;overflow:hidden;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;color:#334155;">
              <thead><tr style="background:#f1f5f9;"><th style="padding:8px 12px;text-align:left;">Name</th><th style="padding:8px 12px;text-align:left;">Role</th><th style="padding:8px 12px;text-align:left;">Phone</th><th style="padding:8px 12px;text-align:left;">Email</th></tr></thead>
              <tbody>${teamRows}</tbody>
            </table>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;">Sent by TC Command Voice AI — MyReDeal</p>
        </div>`;
    },
  },
};

// ── Feature Flags ──────────────────────────────────────────────────────────
export const FEATURE_FLAGS = {
  voiceAI: true,
  adminVoiceAI: true,
  clientVoiceAI: true,
  outboundCallbacks: true,
  callbackQueue: true,
  callbackWorkflows: true,
  smartTaskCreation: true,
  preCallBrief: true,
  postCallNotes: true,
  communicationsConsole: true,
  deliveryMethodPicker: true,
  activeCallOverlay: true,
  smsOnboarding: true,
  contractIntakeSms: true,
  callMeCommand: true,
  voiceRecording: true,
  autoTaskCreation: true,
  workflowEngine: true,
} as const;
