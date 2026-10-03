import type { ConsentStatus } from './types.ts';

/** Twilio advanced opt-out keywords. Matched as the entire message, case-insensitive. */
const OPT_OUT = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
/** Opt back in. YES is included because transaction contacts confirm by texting YES. */
const OPT_IN = new Set(['START', 'YES', 'UNSTOP']);

export type KeywordAction = 'opt_out' | 'opt_in';

export function classifyKeyword(body: string | null | undefined): { action: KeywordAction; keyword: string } | null {
  const keyword = (body || '').trim().toUpperCase();
  if (!keyword) return null;
  if (OPT_OUT.has(keyword)) return { action: 'opt_out', keyword };
  if (OPT_IN.has(keyword)) return { action: 'opt_in', keyword };
  return null;
}

export function consentWarning(status: ConsentStatus): string | null {
  if (status === 'opted_out') {
    return 'This number opted out. Sending is blocked until they text START.';
  }
  if (status === 'unknown') {
    return 'This number has never opted in by text. Send only transaction updates you already have consent for.';
  }
  return null;
}

export function isOptOutSendError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: number | string }).code;
  if (code === 21610 || code === '21610') return true;
  const message = (err as { message?: string }).message || '';
  return /21610|unsubscribed|opted out/i.test(message);
}
