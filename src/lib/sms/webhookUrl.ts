type HeaderValue = string | string[] | undefined;

export function headerFirst(value: HeaderValue): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function stripDefaultPort(host: string): string {
  return host.replace(/:443$/, '').replace(/:80$/, '');
}

/** URL Twilio signed: scheme + host + original path and query string. */
export function publicWebhookUrl(input: {
  headers: Record<string, HeaderValue>;
  url?: string;
}): string {
  const proto = (headerFirst(input.headers['x-forwarded-proto']) || 'https').split(',')[0].trim();
  const host = stripDefaultPort(
    (headerFirst(input.headers['x-forwarded-host']) || headerFirst(input.headers.host) || 'localhost')
      .split(',')[0]
      .trim(),
  );
  const path = input.url && input.url.startsWith('/') ? input.url : `/${input.url || ''}`;
  return `${proto}://${host}${path}`;
}

/** Base URL used when attaching a status callback to an outbound text. */
export function publicAppBaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const explicit = env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  return undefined;
}

export function statusCallbackUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const base = publicAppBaseUrl(env);
  if (!base) return undefined;
  return `${base}/api/sms-inbox/status`;
}
