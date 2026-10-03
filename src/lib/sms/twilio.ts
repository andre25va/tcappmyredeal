import twilio from 'twilio';

export function isValidTwilioRequest(input: {
  authToken: string;
  signature: string;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!input.authToken || !input.signature || !input.url) return false;
  return twilio.validateRequest(input.authToken, input.signature, input.url, input.params);
}

export function emptyTwiml(): string {
  return new twilio.twiml.MessagingResponse().toString();
}

export interface OutboundSendArgs {
  to: string;
  body: string;
  messagingServiceSid: string;
  statusCallback?: string;
}

export async function sendViaMessagingService(
  args: OutboundSendArgs,
  env: Record<string, string | undefined> = process.env,
): Promise<{ sid: string; status: string }> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error('Twilio credentials are not configured');
  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({
    messagingServiceSid: args.messagingServiceSid,
    to: args.to,
    body: args.body,
    ...(args.statusCallback ? { statusCallback: args.statusCallback } : {}),
  });
  return { sid: message.sid, status: message.status || 'queued' };
}

export function coerceFormBody(body: unknown): Record<string, string> {
  if (typeof body === 'string') return Object.fromEntries(new URLSearchParams(body).entries());
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
  if (!body || typeof body !== 'object') return {};
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value == null) continue;
    params[key] = typeof value === 'string' ? value : String(value);
  }
  return params;
}
