/**
 * Page tracking utility for easier debugging and troubleshooting.
 * Logs page IDs to console, provides error context, and generates
 * unique IDs for emails and PDFs.
 */

// ── Page IDs ──────────────────────────────────────────────────────────────

export const PAGE_IDS = {
  // Main Pages
  HOME_DASHBOARD:        'home-dashboard',
  WORKSPACE_OVERVIEW:    'workspace-overview',
  DEAL_OVERVIEW:         'deal-overview',
  CONTACTS:              'contacts-page',
  CONTACTS_EDIT:         'contacts-edit-modal',
  SETTINGS:              'settings-page',
  AI_CHAT:               'ai-chat-page',
  MLS_DIRECTORY:         'mls-directory',
  WORKFLOWS:             'workflows-page',

  // Sidebar Views
  COMPLIANCE:            'compliance-page',
  INBOX:                 'inbox-page',
  EMAIL_REVIEW:          'email-review-page',
  COMM_TASKS:            'comm-tasks-page',
  VOICE:                 'voice-page',
  AI_REPORTS:            'ai-reports-page',
  REQUESTS:              'requests-page',
  TRANSACTIONS_LIST:     'transactions-list',

  // Workspace Tabs
  WS_EMAILS:             'ws-emails',
  WS_DOCUMENTS:          'ws-documents',
  WS_TASKS:              'ws-tasks',
  WS_CONTACTS:           'ws-contacts',
  WS_CHECKLISTS:         'ws-checklists',
  WS_TIMELINE:           'ws-timeline',
  WS_REQUESTS:           'ws-requests',
  WS_ACTIVITY:           'ws-activity',
  WS_EMAIL_COMPOSE:      'ws-email-compose',
  WS_AI_CHAT:            'ws-ai-chat',
  WS_COMMS:              'ws-comms',
  WS_AI_EMAILS:          'ws-ai-emails',
  WS_LINKED_EMAILS:      'ws-linked-emails',
  WS_AMENDMENTS:         'ws-amendments',
  WS_ACCESS:             'ws-access',

  // Wizard Steps
  WIZARD_STEP_1:         'wizard-step-1',
  WIZARD_STEP_2:         'wizard-step-2',
  WIZARD_STEP_3:         'wizard-step-3',
  WIZARD_STEP_4:         'wizard-step-4',
  WIZARD_STEP_5:         'wizard-step-5',
  WIZARD_STEP_6:         'wizard-step-6',
  WIZARD_STEP_7:         'wizard-step-7',
  WIZARD_STEP_8:         'wizard-step-8',

  // Client Portal
  PORTAL_LOGIN:          'portal-login',
  PORTAL_DASHBOARD:      'portal-dashboard',
  PORTAL_DEAL_KPI:       'portal-deal-kpi',
  PORTAL_DEAL_SHEET:     'portal-deal-sheet',
  PORTAL_REQUEST:        'portal-request',
  PORTAL_REQUEST_DONE:   'portal-request-submitted',

  // Modals / Overlays
  TRANSACTION_SHEET:     'transaction-sheet',
  ADMIN_USERS:           'admin-users',

  // Client Onboarding Wizard steps
  ONBOARDING_WELCOME:        'onboarding-wizard-welcome',
  ONBOARDING_COMMUNICATION:  'onboarding-wizard-comm',
  ONBOARDING_ACCESS:         'onboarding-wizard-access',
  ONBOARDING_BRIEFING:       'onboarding-wizard-briefing',
  ONBOARDING_DRIVE:          'onboarding-wizard-drive',
  ONBOARDING_INSTRUCTIONS:   'onboarding-wizard-instructions',
  ONBOARDING_DONE:           'onboarding-wizard-done',

  // Modals
  MILESTONE_ADVANCE:         'milestone-advance-modal',
  PROFILE_SETUP:             'profile-setup-modal',
} as const;

export type PageId = typeof PAGE_IDS[keyof typeof PAGE_IDS];

// ── Page init ─────────────────────────────────────────────────────────────

/**
 * Call this in useEffect on mount for each major page/screen.
 * Logs the page ID to console and stores it on window for error handlers.
 */
export const initPageTracking = (pageId: string, extra?: Record<string, unknown>) => {
  const payload = { pageId, ...extra };
  console.log(`📍 [Page] ${pageId}`, extra ?? '');
  (window as any).__currentPageId = pageId;
  (window as any).__currentPageMeta = payload;
};

/** Returns the currently active page ID. */
export const getCurrentPageId = (): string =>
  (window as any).__currentPageId || 'unknown';

/** Build an error message with page context. */
export const createErrorWithPageContext = (error: unknown, action: string): string => {
  const pageId = getCurrentPageId();
  const msg = error instanceof Error ? error.message : String(error);
  return `[${pageId}] ${action}: ${msg}`;
};

/** Log an error to console with page context and return the message string. */
export const logErrorWithPage = (error: unknown, action: string): string => {
  const message = createErrorWithPageContext(error, action);
  console.error(message, error);
  return message;
};

// ── Unique ID generators ──────────────────────────────────────────────────

/** Generates a short alphanumeric ID (8 chars, uppercase). */
const shortRandom = (): string =>
  Math.random().toString(36).slice(2, 10).toUpperCase();

/**
 * Generates a unique Email ID for tracing sent emails.
 * Format: MRD-EM-XXXXXXXX
 */
export const generateEmailId = (): string => `MRD-EM-${shortRandom()}`;

/**
 * Generates a unique PDF ID for tracing printed/downloaded sheets.
 * Format: MRD-PDF-XXXXXXXX
 */
export const generatePdfId = (): string => `MRD-PDF-${shortRandom()}`;
