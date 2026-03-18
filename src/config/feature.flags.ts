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
