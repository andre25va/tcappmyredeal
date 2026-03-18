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
  callbackQueue: false,       // Enable when V6-C is complete
  
  // Smart tasks (V6)
  smartTaskCreation: true,    // V6-B OpenAI integration complete
  preCAllBrief: false,        // Enable when V6-C is built
  postCallNotes: false,       // Enable when V6-C is built
  
  // Communications Console (V6)
  communicationsConsole: false, // Enable when V6-C UI is built

  // Existing features
  smsOnboarding: true,
  contractIntakeSms: true,
  callMeCommand: true,
  voiceRecording: true,
  autoTaskCreation: true,
  workflowEngine: true,
} as const;
