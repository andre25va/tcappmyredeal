/**
 * Telephony service base URL.
 * Callbacks are now served from Vercel API routes on the same domain.
 * VITE_TELEPHONY_URL can override for local dev pointing to a dev server.
 */
export const TELEPHONY_URL =
  import.meta.env.VITE_TELEPHONY_URL || '/api';
