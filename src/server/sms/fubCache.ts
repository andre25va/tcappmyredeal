import { fetchFubPersonByPhone, isCacheFresh, postFubNote } from '../../lib/sms/fub.ts';
import type { ContactCardState, SmsContactCard } from '../../lib/sms/types.ts';
import type { SmsRepo } from './repo.ts';

export interface ResolvedContact {
  contact: SmsContactCard | null;
  state: ContactCardState;
  fetchedAt: string | null;
}

export async function resolveFubContact(
  repo: SmsRepo,
  phone: string,
  options: { force?: boolean; apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<ResolvedContact> {
  const cached = await repo.getFubCache(phone);
  if (cached && !options.force && isCacheFresh(cached.fetched_at)) {
    return {
      contact: cached.contact,
      state: cached.not_found ? 'not_found' : 'matched',
      fetchedAt: cached.fetched_at,
    };
  }

  const apiKey = options.apiKey ?? process.env.FUB_API_KEY;
  if (!apiKey) {
    if (cached?.contact) return { contact: cached.contact, state: 'matched', fetchedAt: cached.fetched_at };
    return { contact: null, state: 'unconfigured', fetchedAt: cached?.fetched_at ?? null };
  }

  try {
    const contact = await fetchFubPersonByPhone(apiKey, phone, options.fetchImpl);
    await repo.saveFubCache(phone, contact);
    if (contact?.name) await repo.setDisplayNameIfEmpty(phone, contact.name);
    return {
      contact,
      state: contact ? 'matched' : 'not_found',
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Follow Up Boss lookup failed', err instanceof Error ? err.message : 'error');
    if (cached?.contact) return { contact: cached.contact, state: 'matched', fetchedAt: cached.fetched_at };
    return { contact: null, state: 'error', fetchedAt: cached?.fetched_at ?? null };
  }
}

export async function logInboundNote(
  repo: SmsRepo,
  phone: string,
  body: string,
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const apiKey = options.apiKey ?? process.env.FUB_API_KEY;
  if (!apiKey) return;
  const resolved = await resolveFubContact(repo, phone, { apiKey, fetchImpl: options.fetchImpl });
  if (!resolved.contact) return;
  const note = `Inbound SMS from ${phone}\n\n${body}`;
  await postFubNote(apiKey, resolved.contact.id, note, options.fetchImpl);
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
