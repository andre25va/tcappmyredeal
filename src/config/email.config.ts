// ── Email Configuration ────────────────────────────────────────────────────
// All email templates for Resend-powered outbound emails.

export const EMAIL_CONFIG = {
  from: 'TC Command <tc@myredeal.com>',
  
  // Footer text
  footer: {
    admin: 'TC Command — AVT Capital LLC',
    client: 'TC Command — My ReDeal Transaction Services',
  },

  // Admin voice call summary email
  adminCallSummary: {
    subject: (date: string) => `📞 Voice Call Summary — ${date}`,
    
    buildHtml: (params: {
      callDate: string;
      callTime: string;
      qaItems: Array<{ question: string; answer: string }>;
    }) => {
      const qaHtml = params.qaItems.map((item, i) => `
        <div style="margin-bottom:20px;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #2563eb;">
          <p style="margin:0 0 8px;font-weight:600;color:#1e3a5f;font-size:15px;">Q${i + 1}: ${item.question}</p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${item.answer}</p>
        </div>`).join('');

      return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;">
          <div style="background:#1e3a5f;padding:24px;border-radius:8px 8px 0 0;">
            <h1 style="margin:0;color:#fff;font-size:22px;">📞 Voice Call Summary</h1>
            <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">${params.callDate} at ${params.callTime} CT</p>
          </div>
          <div style="padding:24px;">
            <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">${params.qaItems.length} question${params.qaItems.length === 1 ? '' : 's'} answered during this call.</p>
            ${qaHtml}
          </div>
          <div style="padding:16px 24px;background:#f1f5f9;border-radius:0 0 8px 8px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">TC Command — AVT Capital LLC</p>
          </div>
        </div>`;
    },
  },

  // Client deal summary email
  clientDealSummary: {
    subject: (address: string) => `🏠 Your Deal Summary — ${address}`,
    
    buildHtml: (params: {
      recipientName: string;
      deal: {
        property_address: string;
        city?: string;
        state?: string;
        mls_number?: string;
        transaction_type?: string;
        pipeline_stage?: string;
        closing_date?: string;
        purchase_price?: number;
        legal_description?: string;
      };
      participantsText: string;
      callDate: string;
      callTime: string;
    }) => {
      const { deal, recipientName, participantsText, callDate, callTime } = params;
      const closing = deal.closing_date
        ? new Date(deal.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : 'TBD';
      const price = deal.purchase_price
        ? `$${Number(deal.purchase_price).toLocaleString()}`
        : 'Not set';
      const location = [deal.city, deal.state].filter(Boolean).join(', ');

      const participantRows = participantsText
        .split('\n')
        .filter(Boolean)
        .map(p => `<li style="margin-bottom:6px;color:#374151;font-size:14px;">${p}</li>`)
        .join('');

      return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <div style="background:#1e3a5f;padding:24px;">
            <h1 style="margin:0;color:#fff;font-size:22px;">🏠 Deal Summary</h1>
            <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">${callDate} at ${callTime} CT</p>
          </div>
          <div style="padding:24px;">
            <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">Hi ${recipientName}, here's your full deal summary as of today's call.</p>
            <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px;">
              <h2 style="margin:0 0 12px;color:#1e3a5f;font-size:18px;">${deal.property_address}</h2>
              ${location ? `<p style="margin:0 0 6px;color:#6b7280;font-size:14px;">📍 ${location}</p>` : ''}
              ${deal.mls_number ? `<p style="margin:0 0 6px;color:#6b7280;font-size:14px;">MLS# ${deal.mls_number}</p>` : ''}
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:10px 0;color:#6b7280;font-size:13px;width:40%;">Transaction Type</td>
                <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${deal.transaction_type || 'N/A'}</td>
              </tr>
              <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:10px 0;color:#6b7280;font-size:13px;">Pipeline Stage</td>
                <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${deal.pipeline_stage || 'N/A'}</td>
              </tr>
              <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:10px 0;color:#6b7280;font-size:13px;">Closing Date</td>
                <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${closing}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#6b7280;font-size:13px;">Contract Price</td>
                <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${price}</td>
              </tr>
            </table>
            ${participantRows ? `
            <div style="margin-bottom:20px;">
              <h3 style="margin:0 0 10px;color:#1e3a5f;font-size:15px;">Transaction Team</h3>
              <ul style="margin:0;padding-left:18px;">${participantRows}</ul>
            </div>` : ''}
            ${deal.legal_description ? `
            <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:20px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Legal Description</p>
              <p style="margin:0;color:#374151;font-size:13px;">${deal.legal_description}</p>
            </div>` : ''}
          </div>
          <div style="padding:16px 24px;background:#f1f5f9;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">TC Command — My ReDeal Transaction Services</p>
          </div>
        </div>`;
    },
  },
} as const;
