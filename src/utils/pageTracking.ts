/**
 * Page tracking utility for easier debugging and troubleshooting
 * Logs page IDs to console and provides error context
 */

export const PAGE_IDS = {
  // Main Pages
  WORKSPACE_OVERVIEW: 'workspace-overview',
  DEAL_OVERVIEW: 'deal-overview',
  CONTACTS: 'contacts-page',
  CONTACTS_EDIT: 'contacts-edit-modal',
  SETTINGS: 'settings-page',
  AI_CHAT: 'ai-chat-page',
  
  // Wizard Steps
  WIZARD_STEP_1: 'wizard-step-1',
  WIZARD_STEP_2: 'wizard-step-2',
  WIZARD_STEP_3: 'wizard-step-3',
  WIZARD_STEP_4: 'wizard-step-4',
  WIZARD_STEP_5: 'wizard-step-5',
  WIZARD_STEP_6: 'wizard-step-6',
  WIZARD_STEP_7: 'wizard-step-7',
  WIZARD_STEP_8: 'wizard-step-8',
  
  // Client Portal
  CLIENT_PORTAL_DASHBOARD: 'client-portal-dashboard',
  CLIENT_PORTAL_DEALS: 'client-portal-deals',
  CLIENT_PORTAL_DOCUMENTS: 'client-portal-documents',
  CLIENT_PORTAL_MESSAGES: 'client-portal-messages',
  
  // Admin Pages
  ADMIN_SETTINGS: 'admin-settings',
  ADMIN_USERS: 'admin-users',
  ADMIN_ORGANIZATIONS: 'admin-organizations',
};

/**
 * Initialize page tracking - call this in useEffect on mount
 * @param pageId - The page ID from PAGE_IDS constant
 */
export const initPageTracking = (pageId: string) => {
  console.log(`📍 [Page] ${pageId}`);
  // Set page ID in window for error handlers to access
  (window as any).__currentPageId = pageId;
};

/**
 * Get the current page ID (useful in error handlers)
 */
export const getCurrentPageId = (): string => {
  return (window as any).__currentPageId || 'unknown';
};

/**
 * Create an error message with page context
 */
export const createErrorWithPageContext = (error: any, action: string): string => {
  const pageId = getCurrentPageId();
  return `[${pageId}] ${action}: ${error?.message || String(error)}`;
};

/**
 * Log an error with page context
 */
export const logErrorWithPage = (error: any, action: string) => {
  const message = createErrorWithPageContext(error, action);
  console.error(message);
  return message;
};
