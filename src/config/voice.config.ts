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
