import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const normalized = normalizePhone(phone);

  try {
    // Check if whitelist has any entries
    const { count: whitelistCount } = await supabase
      .from('allowed_phones')
      .select('*', { count: 'exact', head: true });

    // Bootstrap: if whitelist is empty, first person in becomes admin
    if ((whitelistCount ?? 0) > 0) {
      const { data: allowed } = await supabase
        .from('allowed_phones')
        .select('id')
        .eq('phone', normalized)
        .single();

      if (!allowed) {
        return res.status(403).json({ error: 'This phone number is not authorized. Contact your admin.' });
      }
    }

    // Invalidate old codes for this phone
    await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('phone', normalized)
      .eq('used', false);

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from('otp_codes').insert({
      phone: normalized,
      code,
      expires_at: expiresAt,
    });

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `Your TC Command login code is: ${code}\n\nExpires in 10 minutes. Do not share this code.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalized,
    });

    return res.status(200).json({ success: true, message: 'Code sent!' });
  } catch (err: any) {
    console.error('request-otp error:', err);
    return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
}
