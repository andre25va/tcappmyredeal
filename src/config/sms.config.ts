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
