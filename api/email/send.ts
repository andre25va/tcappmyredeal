import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER || 'tc@myredeal.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'Gmail not configured' });
  }

  const { to, cc, bcc, subject, body, replyTo, inReplyTo, references } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  try {
    const mailOptions: any = {
      from: `TC Command <${GMAIL_USER}>`,
      to,
      subject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;">${body.replace(/\n/g, '<br/>')}</div>`,
    };

    if (cc && cc.trim()) mailOptions.cc = cc;
    if (bcc && bcc.trim()) mailOptions.bcc = bcc;
    if (replyTo) mailOptions.replyTo = replyTo;
    if (inReplyTo) mailOptions.inReplyTo = inReplyTo;
    if (references) mailOptions.references = references;

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    console.error('SMTP error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send email' });
  }
}
