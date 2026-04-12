// followup-draft Edge Function v2 (no JWT)
// v2: pre-populates "To" email from deal_participants → contacts
// GET  ?task_id=xxx  → renders HTML draft page with GPT draft + pre-filled recipient
// POST              → sends the email via Gmail

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

async function getGmailToken(): Promise<string> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GMAIL_CLIENT_ID')!,
      client_secret: Deno.env.get('GMAIL_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GMAIL_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  });
  const d = await res.json();
  return d.access_token;
}

function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendEmail(to: string, subject: string, bodyHtml: string) {
  const token = await getGmailToken();
  const mime = [
    'From: tc@myredeal.com',
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(bodyHtml))),
  ].join('\r\n');

  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64UrlEncode(mime) }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function draftWithGPT(taskTitle: string, address: string, daysOverdue: number, dealContext: string): Promise<{ subject: string; body: string }> {
  const overdueNote = daysOverdue > 0
    ? `Days Overdue: ${daysOverdue}`
    : 'Due: Today';

  const prompt = `You are a professional Transaction Coordinator assistant. Draft a concise, professional follow-up email for a task.

Task: ${taskTitle}
Property: ${address}
${overdueNote}
Deal Context: ${dealContext}

Rules:
- Be polite but direct. This is a professional follow-up, not a complaint.
- Keep it under 120 words.
- Do not mention specific dollar amounts unless they're in the deal context.
- End with a clear action request.
- Return JSON: { "subject": "...", "body": "..." }
- The body should be plain text (no markdown), suitable for an email.
- Sign off as: Andre Vargas | Transaction Coordinator | MyReDeal`;

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    }),
  });
  const d = await res.json();
  return JSON.parse(d.choices[0].message.content);
}

function renderPage(opts: {
  taskTitle: string;
  address: string;
  daysOverdue: number;
  subject: string;
  body: string;
  taskId: string;
  suggestedEmail?: string;
  suggestedName?: string;
  allParticipants?: { name: string; email: string; role: string }[];
  error?: string;
}): string {
  const bodyEscaped = opts.body.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const subjectEscaped = opts.subject.replace(/"/g, '&quot;');
  const overdueText = opts.daysOverdue > 0
    ? `${opts.daysOverdue}d overdue`
    : 'Due today';
  const badgeColor = opts.daysOverdue > 0 ? '#dc2626' : '#059669';

  // Build participant options for the dropdown
  let participantOptions = '';
  if (opts.allParticipants && opts.allParticipants.length > 0) {
    for (const p of opts.allParticipants) {
      const selected = p.email === opts.suggestedEmail ? ' selected' : '';
      participantOptions += `<option value="${p.email}"${selected}>${p.name} (${p.role})</option>`;
    }
  }

  const hasParticipants = opts.allParticipants && opts.allParticipants.length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Draft Follow-Up — TC Command</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; min-height: 100vh; padding: 32px 16px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; max-width: 600px; margin: 0 auto; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .logo { font-size: 13px; font-weight: 700; color: #2563eb; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 20px; }
    .task-header { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; }
    .task-title { font-size: 15px; font-weight: 600; color: #1a1a1a; }
    .task-meta { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .overdue-badge { display: inline-block; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; margin-left: 8px; background: ${badgeColor}; }
    label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; margin-top: 18px; }
    select, input[type="email"], input[type="text"], textarea {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 14px; color: #1a1a1a; background: #fff; outline: none;
      transition: border-color 0.15s;
    }
    select:focus, input:focus, textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    textarea { min-height: 200px; resize: vertical; font-family: inherit; line-height: 1.6; }
    .hint { font-size: 12px; color: #9ca3af; margin-top: 4px; }
    .btn-row { display: flex; gap: 10px; margin-top: 24px; }
    button[type="submit"] {
      flex: 1; background: #2563eb; color: #fff; border: none; border-radius: 8px;
      padding: 12px 20px; font-size: 15px; font-weight: 600; cursor: pointer;
      transition: background 0.15s;
    }
    button[type="submit"]:hover { background: #1d4ed8; }
    .discard { flex: 0; background: #f3f4f6; color: #6b7280; border: none; border-radius: 8px; padding: 12px 16px; font-size: 14px; cursor: pointer; }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; padding: 12px 14px; font-size: 14px; margin-bottom: 16px; }
    #sendBtn:disabled { background: #93c5fd; cursor: not-allowed; }
    .or-divider { text-align: center; font-size: 12px; color: #9ca3af; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">TC Command · Follow-Up Draft</div>

    <div class="task-header">
      <div class="task-title">${opts.taskTitle} <span class="overdue-badge">${overdueText}</span></div>
      <div class="task-meta">📍 ${opts.address}</div>
    </div>

    ${opts.error ? `<div class="error">⚠️ ${opts.error}</div>` : ''}

    <form method="POST" id="sendForm">
      <input type="hidden" name="task_id" value="${opts.taskId}">

      <label for="to">To (recipient email)</label>
      ${hasParticipants ? `
      <select id="participantSelect" onchange="document.getElementById('to').value = this.value">
        <option value="">— Select a deal participant —</option>
        ${participantOptions}
        <option value="__other__">Other (type manually below)</option>
      </select>
      <div class="or-divider">or type manually</div>
      ` : ''}
      <input type="email" id="to" name="to" required placeholder="agent@example.com" value="${opts.suggestedEmail || ''}">
      <div class="hint">${opts.suggestedName ? `Suggested: ${opts.suggestedName}` : 'Enter the email of the person responsible for this task.'}</div>

      <label for="subject">Subject</label>
      <input type="text" id="subject" name="subject" required value="${subjectEscaped}">

      <label for="body">Message</label>
      <textarea id="body" name="body" required>${bodyEscaped}</textarea>
      <div class="hint">AI-drafted. Edit freely before sending.</div>

      <div class="btn-row">
        <button type="button" class="discard" onclick="window.close()">Discard</button>
        <button type="submit" id="sendBtn">✉️ Send Follow-Up</button>
      </div>
    </form>
  </div>
  <script>
    document.getElementById('sendForm').addEventListener('submit', function() {
      document.getElementById('sendBtn').disabled = true;
      document.getElementById('sendBtn').textContent = 'Sending…';
    });
    ${hasParticipants ? `
    // When "Other" selected, clear the email field so user can type
    document.getElementById('participantSelect').addEventListener('change', function() {
      if (this.value === '__other__') {
        document.getElementById('to').value = '';
        document.getElementById('to').focus();
      }
    });
    ` : ''}
  </script>
</body>
</html>`;
}

function successPage(to: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sent — TC Command</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; max-width: 480px; width: 100%; padding: 40px 32px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px; }
    p { font-size: 14px; color: #6b7280; line-height: 1.6; }
    .to { color: #2563eb; font-weight: 600; }
    .close-btn { margin-top: 24px; display: inline-block; background: #f3f4f6; color: #374151; border-radius: 8px; padding: 10px 20px; font-size: 14px; cursor: pointer; border: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h2>Follow-Up Sent</h2>
    <p>Your message was delivered to <span class="to">${to}</span> via Gmail.</p>
    <button class="close-btn" onclick="window.close()">Close Tab</button>
  </div>
</body>
</html>`;
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const supabase = getSupabase();

  if (req.method === 'POST') {
    const form = await req.formData();
    const to = form.get('to') as string;
    const subject = form.get('subject') as string;
    const body = form.get('body') as string;
    const taskId = form.get('task_id') as string;

    const bodyHtml = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.7;max-width:600px;margin:0 auto;padding:24px;">
      ${body.split('\n').map((l: string) => l.trim() ? `<p style="margin:0 0 12px 0;">${l}</p>` : '<br>').join('')}
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#9ca3af;">Sent via TC Command · MyReDeal</p>
    </body></html>`;

    try {
      await sendEmail(to, subject, bodyHtml);
      return new Response(successPage(to), {
        headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      });
    } catch (err) {
      const { data: task } = await supabase.from('tasks').select('*, deals(property_address)').eq('id', taskId).single();
      const daysOverdue = task?.due_date
        ? Math.floor((Date.now() - new Date(task.due_date).getTime()) / 86400000)
        : 0;
      return new Response(
        renderPage({
          taskId,
          taskTitle: task?.title || 'Task',
          address: (task?.deals as { property_address?: string })?.property_address || '',
          daysOverdue,
          subject,
          body,
          error: `Failed to send: ${(err as Error).message}`,
        }),
        { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
      );
    }
  }

  // ── GET: render draft page ──
  const taskId = url.searchParams.get('task_id');
  if (!taskId) return new Response('Missing task_id', { status: 400 });

  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('id, title, due_date, priority, deal_id, deals(property_address, buyer_name, seller_name, buyer_agent_name, seller_agent_name, loan_officer_name, title_company_name, status)')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) return new Response('Task not found', { status: 404 });

  const deal = task.deals as {
    property_address?: string; buyer_name?: string; seller_name?: string;
    buyer_agent_name?: string; seller_agent_name?: string;
    loan_officer_name?: string; title_company_name?: string; status?: string;
  } | null;

  const address = deal?.property_address || 'Unknown Property';
  const today = new Date().toISOString().split('T')[0];
  const daysOverdue = task.due_date
    ? Math.max(0, Math.floor((new Date(today).getTime() - new Date(task.due_date).getTime()) / 86400000))
    : 0;

  const dealContext = [
    deal?.buyer_name ? `Buyer: ${deal.buyer_name}` : '',
    deal?.seller_name ? `Seller: ${deal.seller_name}` : '',
    deal?.buyer_agent_name ? `Buyer's Agent: ${deal.buyer_agent_name}` : '',
    deal?.seller_agent_name ? `Seller's Agent: ${deal.seller_agent_name}` : '',
    deal?.loan_officer_name ? `Loan Officer: ${deal.loan_officer_name}` : '',
    deal?.title_company_name ? `Title Company: ${deal.title_company_name}` : '',
    deal?.status ? `Deal Status: ${deal.status}` : '',
  ].filter(Boolean).join(', ') || 'No additional context';

  // ── Look up deal participants with emails ──
  const allParticipants: { name: string; email: string; role: string }[] = [];
  let suggestedEmail = '';
  let suggestedName = '';

  if (task.deal_id) {
    const { data: participants } = await supabase
      .from('deal_participants')
      .select('deal_role, contacts(full_name, first_name, last_name, email)')
      .eq('deal_id', task.deal_id)
      .not('contact_id', 'is', null);

    if (participants) {
      // Priority order for auto-suggestion: buyer_agent, lender, title_officer, seller_agent, buyer, seller, other
      const rolePriority: Record<string, number> = {
        buyer_agent: 1, lender: 2, title_officer: 3, lead_agent: 4,
        seller_agent: 5, buyer: 6, seller: 7, co_agent: 8, other: 9,
      };

      const sorted = [...participants].sort((a, b) =>
        (rolePriority[a.deal_role] || 99) - (rolePriority[b.deal_role] || 99)
      );

      for (const p of sorted) {
        const c = p.contacts as { full_name?: string; first_name?: string; last_name?: string; email?: string } | null;
        if (!c?.email) continue;
        const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
        const roleLabel = p.deal_role.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        allParticipants.push({ name, email: c.email, role: roleLabel });
        if (!suggestedEmail) {
          suggestedEmail = c.email;
          suggestedName = `${name} (${roleLabel})`;
        }
      }
    }
  }

  // ── GPT draft ──
  let draft = { subject: `Follow-Up: ${task.title} — ${address}`, body: '' };
  try {
    draft = await draftWithGPT(task.title, address, daysOverdue, dealContext);
  } catch {
    draft.body = `Hi,\n\nI wanted to follow up on the pending task: "${task.title}" for the property at ${address}.\n\nThis item is ${daysOverdue > 0 ? `currently ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue` : 'due today'}. Please let me know the current status so we can keep the transaction on track.\n\nThank you,\nAndre Vargas | Transaction Coordinator | MyReDeal`;
  }

  return new Response(
    renderPage({
      taskId,
      taskTitle: task.title,
      address,
      daysOverdue,
      subject: draft.subject,
      body: draft.body,
      suggestedEmail,
      suggestedName,
      allParticipants,
    }),
    { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
  );
});
