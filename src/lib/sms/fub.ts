import type { SmsContactCard } from './types.ts';

export const FUB_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FUB_BASE = 'https://api.followupboss.com/v1';

export function fubNotesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = (env.FUB_LOG_NOTES || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function isCacheFresh(fetchedAtIso: string, nowMs = Date.now(), ttlMs = FUB_CACHE_TTL_MS): boolean {
  const fetched = Date.parse(fetchedAtIso);
  if (Number.isNaN(fetched)) return false;
  return nowMs - fetched < ttlMs;
}

export function fubAuthHeader(apiKey: string): string {
  const bytes = new TextEncoder().encode(`${apiKey}:`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function asValueList(value: unknown): { value: string; type?: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const record = item as { value?: unknown; type?: unknown };
      const phoneOrEmail = typeof record.value === 'string' ? record.value : '';
      if (!phoneOrEmail) return null;
      const type = typeof record.type === 'string' ? record.type : undefined;
      return type ? { value: phoneOrEmail, type } : { value: phoneOrEmail };
    })
    .filter((item): item is { value: string; type?: string } => item !== null);
}

export function parseFubPeople(payload: unknown): SmsContactCard | null {
  if (!payload || typeof payload !== 'object') return null;
  const people = (payload as { people?: unknown }).people;
  if (!Array.isArray(people) || people.length === 0) return null;
  const person = people[0];
  if (!person || typeof person !== 'object') return null;
  const record = person as {
    id?: unknown;
    name?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    stage?: unknown;
    tags?: unknown;
    phones?: unknown;
    emails?: unknown;
  };
  if (record.id == null || record.id === '') return null;
  const nameFromParts = [record.firstName, record.lastName].filter(part => typeof part === 'string' && part).join(' ');
  const name = typeof record.name === 'string' && record.name.trim()
    ? record.name.trim()
    : nameFromParts || 'Unknown contact';
  return {
    id: String(record.id),
    name,
    stage: typeof record.stage === 'string' ? record.stage : null,
    tags: Array.isArray(record.tags) ? record.tags.map(tag => String(tag)) : [],
    phones: asValueList(record.phones),
    emails: asValueList(record.emails),
  };
}

export async function fetchFubPersonByPhone(
  apiKey: string,
  phone: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SmsContactCard | null> {
  const response = await fetchImpl(`${FUB_BASE}/people?phone=${encodeURIComponent(phone)}`, {
    headers: {
      Authorization: fubAuthHeader(apiKey),
      'X-System': 'MyReDeal',
      Accept: 'application/json',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Follow Up Boss lookup failed (${response.status})`);
  return parseFubPeople(await response.json());
}

export async function postFubNote(
  apiKey: string,
  personId: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${FUB_BASE}/notes`, {
    method: 'POST',
    headers: {
      Authorization: fubAuthHeader(apiKey),
      'X-System': 'MyReDeal',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personId: /^\d+$/.test(personId) ? Number(personId) : personId,
      subject: 'Inbound SMS',
      body,
      isHtml: false,
    }),
  });
  if (!response.ok) throw new Error(`Follow Up Boss note failed (${response.status})`);
}
