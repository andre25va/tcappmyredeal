/**
 * Telephony service URL
 * Points to Railway Express server for all voice/SMS/callback operations.
 * Falls back to Railway URL if env var not set.
 */
export const TELEPHONY_URL =
  import.meta.env.VITE_TELEPHONY_URL ||
  'https://tcappmyredeal-production.up.railway.app';
