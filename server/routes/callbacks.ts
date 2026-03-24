import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AI_CONFIG } from '../../src/config/ai.config';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER!;
const TELEPHONY_URL = process.env.RAILWAY_PUBLIC_URL || process.env.RAILWAY_URL || 'https://tc-telephony.up.railway.app';
const VERCEL_URL = process.env.VERCEL_APP_URL || 'https://tcappmyredeal.vercel.app';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeToE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

// ── Action Handlers ───────────────────────────────────────────────────────────

async function handleQueue(req: Request, res: Response) {
  const status = (req.query.status as string) || 'open';
  const limit = parseInt((req.query.limit as string) || '20', 10);

  const { data, error } = await supabase
    .from('callback_requests')
    .select(`
      *,
      contacts:caller_contact_id (first_name, last_name, email, contact_type),
      deals:deal_id (property_address, pipeline_stage)
    `)
    .eq('status', status)
    .order('priority', { ascending: true })
    .order('requested_at', { ascending: true })
    .limit(limit);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Re-sort by priority weight (Supabase text sort isn't ideal for custom ordering)
  const priorityWeight: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const sorted = (data || []).sort((a: any, b: any) => {
    const wa = priorityWeight[a.priority] ?? 3;
    const wb = priorityWeight[b.priority] ?? 3;
    if (wa !== wb) return wa - wb;
    return new Date(a.requested_at || 0).getTime() - new Date(b.requested_at || 0).getTime();
  });

  return res.status(200).json(sorted);
}

async function handleHistory(req: Request, res: Response) {
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const contactId = req.query.contactId as string | undefined;

  let query = supabase
    .from('callback_attempts')
    .select(`
      *,
      callback_requests:callback_request_id (
        phone_e164, reason,
        contacts:caller_contact_id (first_name, last_name),
        deals:deal_id (property_address)
      )
    `)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (contactId) {
    const { data: requestIds } = await supabase
      .from('callback_requests')
      .select('id')
      .eq('caller_contact_id', contactId);

    const ids = (requestIds || []).map((r: any) => r.id);
    if (ids.length === 0) {
      return res.status(200).json([]);
    }
    query = query.in('callback_request_id', ids);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data || []);
}

async function handleInitiate(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { contactId, dealId, callbackRequestId, profileId } = req.body || {};

  if (!contactId || !profileId) {
    return res.status(400).json({ error: 'contactId and profileId are required' });
  }

  // 1. Look up contact phone from contact_phone_channels (fallback to contacts.phone)
  let clientPhone: string | null = null;
  const { data: phoneChannel } = await supabase
    .from('contact_phone_channels')
    .select('phone_e164')
    .eq('contact_id', contactId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (phoneChannel?.phone_e164) {
    clientPhone = phoneChannel.phone_e164;
  } else {
    const { data: contact } = await supabase
      .from('contacts')
      .select('phone')
      .eq('id', contactId)
      .single();
    if (contact?.phone) {
      clientPhone = normalizeToE164(contact.phone);
    }
  }

  if (!clientPhone) {
    return res.status(400).json({ error: 'No phone number found for contact' });
  }

  // 2. Look up TC's phone from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('login_phone_e164')
    .eq('id', profileId)
    .single();

  if (!profile?.login_phone_e164) {
    return res.status(400).json({ error: 'No phone number found for TC profile. Please update your profile with a phone number.' });
  }

  const tcPhone = profile.login_phone_e164;

  // 3. Create callback_attempts row
  const { data: attempt, error: attemptError } = await supabase
    .from('callback_attempts')
    .insert({
      callback_request_id: callbackRequestId || null,
      attempt_number: 1,
      initiated_by: profileId,
      staff_leg_status: 'pending',
      client_leg_status: 'pending',
      outcome: 'pending',
      started_at: new Date().toISOString(),
      metadata: { deal_id: dealId || null, contact_id: contactId, client_phone: clientPhone },
    })
    .select()
    .single();

  if (attemptError || !attempt) {
    return res.status(500).json({ error: 'Failed to create callback attempt', details: attemptError?.message });
  }

  const attemptId = attempt.id;

  // 4. If callbackRequestId provided, update status to in_progress
  if (callbackRequestId) {
    await supabase
      .from('callback_requests')
      .update({ status: 'in_progress', assigned_user_id: profileId, acknowledged_at: new Date().toISOString() })
      .eq('id', callbackRequestId);
  }

  // 5. Initiate Twilio call TO the TC's phone
  // FIX: Use ? (not &) to start query string in voice URLs
  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`;
    const voiceUrl = `${TELEPHONY_URL}/voice/outbound-connect?attemptId=${encodeURIComponent(attemptId)}&clientPhone=${encodeURIComponent(clientPhone)}`;
    const statusUrl = `${TELEPHONY_URL}/voice/outbound-parent-status?attemptId=${encodeURIComponent(attemptId)}`;

    const params = new URLSearchParams({
      To: tcPhone,
      From: TWILIO_PHONE,
      Url: voiceUrl,
      StatusCallback: statusUrl,
      StatusCallbackEvent: 'initiated ringing answered completed',
    });

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const twilioData = await twilioRes.json() as any;

    if (!twilioRes.ok) {
      await supabase.from('callback_attempts').update({
        outcome: 'failed',
        staff_leg_status: 'failed',
        ended_at: new Date().toISOString(),
        metadata: { ...attempt.metadata, twilio_error: twilioData },
      }).eq('id', attemptId);

      return res.status(500).json({ error: 'Failed to initiate Twilio call', details: twilioData });
    }

    await supabase.from('callback_attempts').update({
      staff_call_sid: twilioData.sid,
      staff_leg_status: 'initiated',
    }).eq('id', attemptId);

    return res.status(200).json({
      success: true,
      attemptId,
      staffCallSid: twilioData.sid,
    });
  } catch (err: any) {
    await supabase.from('callback_attempts').update({
      outcome: 'failed',
      staff_leg_status: 'failed',
      ended_at: new Date().toISOString(),
    }).eq('id', attemptId);

    return res.status(500).json({ error: 'Twilio call initiation failed', details: err.message });
  }
}

async function handleNotesPost(req: Request, res: Response) {
  const { attemptId, dealId, contactId, authorId, rawNotes, processWithAI } = req.body || {};

  if (!attemptId || !authorId || !rawNotes) {
    return res.status(400).json({ error: 'attemptId, authorId, and rawNotes are required' });
  }

  let structuredNotes: any = null;
  let aiSummary: string | null = null;
  let followUpTasks: any[] = [];

  if (processWithAI && rawNotes.length > 10) {
    try {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_CONFIG.models.smartTask,
          messages: [
            { role: 'system', content: AI_CONFIG.prompts.callNotesStructure },
            { role: 'user', content: rawNotes },
          ],
          max_tokens: 400,
          temperature: AI_CONFIG.temperature.smartTask,
        }),
      });

      const aiData = await aiRes.json() as any;
      const content = aiData.choices?.[0]?.message?.content || '';
      try {
        const parsed = JSON.parse(content);
        structuredNotes = parsed;
        aiSummary = parsed.summary || null;
        followUpTasks = parsed.action_items || [];
      } catch {
        aiSummary = content;
      }
    } catch (err) {
      console.error('AI notes processing error:', err);
    }
  }

  const { data: note, error: noteError } = await supabase
    .from('call_notes')
    .insert({
      callback_attempt_id: attemptId,
      deal_id: dealId || null,
      contact_id: contactId || null,
      author_id: authorId,
      raw_notes: rawNotes,
      structured_notes: structuredNotes,
      ai_summary: aiSummary,
      follow_up_tasks: followUpTasks,
    })
    .select()
    .single();

  if (noteError) {
    return res.status(500).json({ error: 'Failed to save call notes', details: noteError.message });
  }

  const createdTasks: any[] = [];
  for (const item of followUpTasks) {
    const { data: task } = await supabase
      .from('comm_tasks')
      .insert({
        title: item.title || 'Follow-up from call',
        description: `Auto-created from call notes: ${aiSummary || rawNotes.substring(0, 100)}`,
        contact_id: contactId || null,
        deal_id: dealId || null,
        channel: item.type === 'document_request' ? 'email' : 'call',
        status: 'pending',
        priority: item.priority || 'normal',
        source: 'auto_inbound',
        due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      })
      .select()
      .single();
    if (task) createdTasks.push(task);
  }

  return res.status(200).json({ success: true, note, createdTasks });
}

async function handleNotesGet(req: Request, res: Response) {
  const attemptId = req.query.attemptId as string;

  if (!attemptId) {
    return res.status(400).json({ error: 'attemptId is required' });
  }

  const { data, error } = await supabase
    .from('call_notes')
    .select('*')
    .eq('callback_attempt_id', attemptId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data || []);
}

async function handleSmartTask(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { request, dealId, contactId, profileId } = req.body || {};

  if (!request || !profileId) {
    return res.status(400).json({ error: 'request and profileId are required' });
  }

  let dealAddress = '';
  let contactName = '';

  if (dealId) {
    const { data: deal } = await supabase.from('deals').select('property_address').eq('id', dealId).single();
    dealAddress = deal?.property_address || '';
  }
  if (contactId) {
    const { data: contact } = await supabase.from('contacts').select('first_name, last_name').eq('id', contactId).single();
    contactName = contact ? `${contact.first_name} ${contact.last_name}` : '';
  }

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_CONFIG.models.smartTask,
        messages: [
          { role: 'system', content: AI_CONFIG.prompts.smartTaskClassification },
          {
            role: 'user',
            content: `Request: "${request}"${dealAddress ? `\nDeal: ${dealAddress}` : ''}${contactName ? `\nContact: ${contactName}` : ''}`,
          },
        ],
        max_tokens: AI_CONFIG.maxTokens.smartTask,
        temperature: AI_CONFIG.temperature.smartTask,
      }),
    });

    const aiData = await aiRes.json() as any;
    const content = aiData.choices?.[0]?.message?.content || '';

    let classified: any;
    try {
      classified = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: 'AI returned invalid JSON', raw: content });
    }

    const { data: task, error: taskError } = await supabase
      .from('comm_tasks')
      .insert({
        title: classified.title || request.substring(0, 60),
        description: classified.description || request,
        contact_id: contactId || null,
        contact_name: contactName || null,
        deal_id: dealId || null,
        deal_address: dealAddress || null,
        channel: classified.channel || 'email',
        status: 'pending',
        priority: classified.priority || 'normal',
        source: 'auto_inbound',
        due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      })
      .select()
      .single();

    if (taskError) {
      return res.status(500).json({ error: 'Failed to create task', details: taskError.message });
    }

    return res.status(200).json({ success: true, task, classification: classified });
  } catch (err: any) {
    return res.status(500).json({ error: 'Smart task creation failed', details: err.message });
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────

export const callbacksRouter = Router();

callbacksRouter.get('/queue', async (req: Request, res: Response) => handleQueue(req, res));
callbacksRouter.get('/history', async (req: Request, res: Response) => handleHistory(req, res));
callbacksRouter.post('/initiate', async (req: Request, res: Response) => handleInitiate(req, res));
callbacksRouter.post('/notes', async (req: Request, res: Response) => handleNotesPost(req, res));
callbacksRouter.get('/notes', async (req: Request, res: Response) => handleNotesGet(req, res));
callbacksRouter.post('/smart-task', async (req: Request, res: Response) => handleSmartTask(req, res));
