import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const OPENAI_KEY = process.env.OPENAI_API_KEY!;

async function classifyMessage(contactName: string, dealAddress: string | null, messageBody: string) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: `You are a TC (Transaction Coordinator) assistant. Analyze inbound messages from clients and determine:\n1. Does this message contain a REQUEST or ACTION needed? (yes/no)\n2. If yes, write a concise task title (under 60 chars) for the TC to act on.\n3. Suggest priority: high/normal/low\n\nRespond ONLY with JSON: {"needs_task": true/false, "task_title": "...", "priority": "high|normal|low", "auto_reply": "brief friendly acknowledgment under 100 chars"}`,
        },
        {
          role: 'user',
          content: `Contact: ${contactName}${dealAddress ? ` (Deal: ${dealAddress})` : ''}\nMessage: "${messageBody}"`,
        },
      ],
    }),
  });
  const data = await resp.json() as any;
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return { needs_task: false, auto_reply: 'Got it! I\'ll get back to you shortly.' };
  }
}

async function sendTwilioReply(to: string, body: string, isWhatsApp: boolean) {
  const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
  const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!;
  const WA_FROM = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const toFormatted = isWhatsApp ? `whatsapp:${to}` : to;
  const fromFormatted = isWhatsApp ? WA_FROM : FROM_NUMBER;

  const params = new URLSearchParams({ To: toFormatted, From: fromFormatted, Body: body });
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { From, Body, MessageSid } = req.body as { From: string; Body: string; MessageSid: string };

  try {
    const isWhatsApp = From && From.startsWith('whatsapp:');
    const fromPhone = isWhatsApp ? From.replace('whatsapp:', '') : From;
    const channel: 'sms' | 'whatsapp' = isWhatsApp ? 'whatsapp' : 'sms';
    const fromClean = fromPhone.replace(/\D/g, '');
    const fromE164 = fromClean.startsWith('1') ? `+${fromClean}` : `+1${fromClean}`;

    // 1. Match contact — try contact_phone_channels first (trusted registry)
    let matchedContact: any = null;
    const { data: phoneChannel } = await supabase
      .from('contact_phone_channels')
      .select('contact_id, contacts(id, first_name, last_name, phone)')
      .eq('phone_e164', fromE164)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (phoneChannel?.contacts) {
      matchedContact = phoneChannel.contacts;
    }

    // Fall back to fuzzy phone match on contacts table
    if (!matchedContact) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone')
        .not('phone', 'is', null);

      for (const c of contacts || []) {
        const cPhone = (c.phone || '').replace(/\D/g, '');
        if (cPhone && (fromClean.endsWith(cPhone) || cPhone.endsWith(fromClean.slice(-10)))) {
          matchedContact = c;
          break;
        }
      }
    }

    const contactName = matchedContact
      ? `${matchedContact.first_name} ${matchedContact.last_name}`
      : fromPhone;

    // 2. Find related deal via deal_participants join
    let relatedDeal: any = null;
    if (matchedContact) {
      const { data: participants } = await supabase
        .from('deal_participants')
        .select('deal_id')
        .eq('contact_id', matchedContact.id);
      const relatedDealIds = (participants || []).map((p: any) => p.deal_id);
      if (relatedDealIds.length > 0) {
        const { data: deals } = await supabase
          .from('deals')
          .select('id, property_address, pipeline_stage, closing_date, city, state')
          .in('id', relatedDealIds)
          .eq('status', 'active')
          .limit(1);
        relatedDeal = deals?.[0] || null;
      }
    }

    // ── SMS Commands ──────────────────────────────────────────────────────────
    const bodyUpper = Body.trim().toUpperCase();

    // ── Onboarding State Machine ─────────────────────────────────────────────
    {
      // Check if there's an active onboarding session for this phone
      const { data: session } = await supabase
        .from('onboarding_sessions')
        .select('*')
        .eq('phone_e164', fromE164)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (session) {
        const reply = Body.trim();
        const replyUpper = reply.toUpperCase();
        const collected = session.collected as Record<string, string>;

        // STOP at any point
        if (replyUpper === 'STOP' || replyUpper === 'NO' && session.step === 'greeting') {
          await supabase.from('onboarding_sessions').update({ status: 'abandoned' }).eq('id', session.id);
          await sendTwilioReply(fromPhone, "No problem! Text us anytime if you need help. 🏠", isWhatsApp);
          res.setHeader('Content-Type', 'text/xml');
          return res.send('<Response></Response>');
        }

        let nextStep = session.step;
        let responseMsg = '';

        // ── Contract Intake State Machine ────────────────────────────────────
        if ((collected as any).session_type === 'contract_intake') {
          const reply = Body.trim();
          const replyUpper = reply.toUpperCase();

          if (replyUpper === 'STOP' || replyUpper === 'CANCEL') {
            await supabase.from('onboarding_sessions').update({ status: 'abandoned' }).eq('id', session.id);
            await sendTwilioReply(fromPhone, "No problem! Text NEW CONTRACT anytime to start again. 🏠", isWhatsApp);
            res.setHeader('Content-Type', 'text/xml');
            return res.send('<Response></Response>');
          }

          if (session.step === 'contract_address') {
            const address = reply.trim();
            if (address.length < 5) {
              await sendTwilioReply(fromPhone, "Please send the full property address (e.g. 123 Main St, Kansas City, MO)", isWhatsApp);
              res.setHeader('Content-Type', 'text/xml');
              return res.send('<Response></Response>');
            }

            // Create draft deal in Supabase
            const { data: newDeal } = await supabase.from('deals').insert({
              property_address: address,
              status: 'draft',
              pipeline_stage: 'New',
              transaction_type: 'purchase',
              notes: `Auto-created from SMS: "${Body}" from ${contactName} (${fromPhone})`,
              created_at: new Date().toISOString(),
            }).select().single();

            // Link contact as participant if matched
            if (matchedContact && newDeal) {
              await supabase.from('deal_participants').insert({
                deal_id: newDeal.id,
                contact_id: matchedContact.id,
                role: 'agent',
                transaction_side: 'buyer',
                is_client_side: true,
              });
            }

            // Create comm task for TC
            await supabase.from('comm_tasks').insert({
              title: `New Contract: ${address}`,
              description: `Client ${contactName} (${fromPhone}) submitted a new contract via SMS. Deal created as draft. Review and complete deal setup.`,
              channel: channel,
              contact_id: matchedContact?.id || null,
              deal_id: newDeal?.id || null,
              status: 'pending',
              priority: 'high',
              source: 'auto_inbound',
              due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            });

            // Create notification for TC
            await supabase.from('notifications').insert({
              type: 'deal',
              title: `🏠 New Contract from ${contactName}`,
              body: `Address: ${address}. Draft deal created — review and complete setup.`,
              from_name: contactName,
              from_identifier: fromPhone,
              deal_id: newDeal?.id || null,
              contact_id: matchedContact?.id || null,
            });

            // Mark session complete
            await supabase.from('onboarding_sessions').update({
              status: 'completed', step: 'completed',
              collected: { ...collected, address, deal_id: newDeal?.id || null },
              updated_at: new Date().toISOString(),
            }).eq('id', session.id);

            const confirmMsg = `✅ Got it! New contract started for:\n\n🏠 ${address}\n\nYour TC will be in touch shortly to complete the file. Text HELP for commands anytime!`;
            await sendTwilioReply(fromPhone, confirmMsg, isWhatsApp);

            // Log messages
            const msgNow = new Date().toISOString();
            await supabase.from('messages').insert([
              { deal_id: newDeal?.id || null, contact_id: matchedContact?.id || null, direction: 'inbound', channel, body: Body, status: 'received', from_number: fromPhone, to_number: process.env.TWILIO_PHONE_NUMBER, external_message_id: MessageSid, sent_at: msgNow },
              { deal_id: newDeal?.id || null, contact_id: matchedContact?.id || null, direction: 'outbound', channel, body: confirmMsg, status: 'sent', from_number: isWhatsApp ? (process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886') : process.env.TWILIO_PHONE_NUMBER, to_number: fromPhone, sent_at: msgNow },
            ]);
            res.setHeader('Content-Type', 'text/xml');
            return res.send('<Response></Response>');
          }

          // Unknown contract intake step - reset
          await supabase.from('onboarding_sessions').update({ status: 'abandoned' }).eq('id', session.id);
          res.setHeader('Content-Type', 'text/xml');
          return res.send('<Response></Response>');
        }
        // ── End Contract Intake ───────────────────────────────────────────────

        switch (session.step) {
          case 'greeting':
            if (replyUpper === 'YES') {
              nextStep = 'name';
              responseMsg = "Great! Let's get started 🎉\n\n1️⃣ What's your full name?";
            } else {
              responseMsg = "Reply YES to get started or STOP to skip. 😊";
            }
            break;

          case 'name':
            if (reply.trim().length < 2) { responseMsg = "Please enter your full name."; break; }
            collected.name = reply.trim();
            nextStep = 'license_num';
            responseMsg = `Nice to meet you, ${reply.split(' ')[0]}! 😊\n\n2️⃣ What's your real estate license number?`;
            break;

          case 'license_num':
            collected.license_num = reply.trim();
            nextStep = 'license_state';
            responseMsg = "3️⃣ What state is that license in? (e.g. KS, MO, IL)";
            break;

          case 'license_state':
            collected.license_state = reply.trim().toUpperCase().substring(0, 2);
            nextStep = 'mls_name';
            responseMsg = "4️⃣ What MLS are you a member of? (e.g. Heartland MLS, KCRAR MLS)";
            break;

          case 'mls_name':
            collected.mls_name = reply.trim();
            nextStep = 'mls_id';
            responseMsg = "5️⃣ What's your MLS Agent ID?";
            break;

          case 'mls_id':
            collected.mls_id = reply.trim();
            nextStep = 'brokerage';
            responseMsg = "6️⃣ What brokerage or company are you with?";
            break;

          case 'brokerage':
            collected.brokerage = reply.trim();
            nextStep = 'comm_pref';
            responseMsg = "7️⃣ How do you prefer to communicate?\nReply: SMS, WHATSAPP, or EMAIL";
            break;

          case 'comm_pref': {
            const pref = replyUpper;
            if (!['SMS', 'WHATSAPP', 'EMAIL'].includes(pref)) {
              responseMsg = "Please reply SMS, WHATSAPP, or EMAIL.";
              break;
            }
            collected.comm_pref = pref.toLowerCase();
            nextStep = 'timezone';
            responseMsg = "8️⃣ What's your time zone?\nReply: CENTRAL, EASTERN, MOUNTAIN, or PACIFIC";
            break;
          }

          case 'timezone': {
            const tz = replyUpper;
            const tzMap: Record<string, string> = { CENTRAL: 'America/Chicago', EASTERN: 'America/New_York', MOUNTAIN: 'America/Denver', PACIFIC: 'America/Los_Angeles' };
            if (!tzMap[tz]) { responseMsg = "Please reply CENTRAL, EASTERN, MOUNTAIN, or PACIFIC."; break; }
            collected.timezone = tzMap[tz];
            nextStep = 'confirm';
            responseMsg = `Almost done! Here's your info:\n\n👤 ${collected.name}\n📋 License: ${collected.license_num} (${collected.license_state})\n🏢 MLS: ${collected.mls_name} / ${collected.mls_id}\n🏦 ${collected.brokerage}\n💬 Preferred: ${collected.comm_pref}\n⏰ Timezone: ${tz}\n\nReply YES to confirm or NO to restart.`;
            break;
          }

          case 'confirm':
            if (replyUpper === 'YES') {
              // Save collected data to contact if we have one
              if (session.contact_id) {
                // Update notes on client_account
                const noteStr = `sms_onboarding:completed,brokerage:${collected.brokerage},comm_pref:${collected.comm_pref},timezone:${collected.timezone}`;
                await supabase.from('client_accounts').update({ notes: noteStr }).eq('contact_id', session.contact_id);
              } else {
                // Try to create or match contact
                const nameParts = (collected.name || '').split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';
                const { data: existing } = await supabase.from('contacts').select('id').ilike('first_name', firstName).ilike('last_name', lastName).limit(1).single();
                if (existing) {
                  await supabase.from('onboarding_sessions').update({ contact_id: existing.id }).eq('id', session.id);
                } else {
                  const { data: newContact } = await supabase.from('contacts').insert({
                    first_name: firstName, last_name: lastName, phone: fromE164, contact_type: 'agent',
                    notes: `SMS onboarding completed. Brokerage: ${collected.brokerage}. Comm pref: ${collected.comm_pref}. Timezone: ${collected.timezone}.`,
                  }).select().single();
                  if (newContact) {
                    await supabase.from('onboarding_sessions').update({ contact_id: newContact.id }).eq('id', session.id);
                    // Add license
                    if (collected.license_num && collected.license_state) {
                      await supabase.from('contact_licenses').insert({ contact_id: newContact.id, state: collected.license_state, license_number: collected.license_num, license_type: 'real_estate' });
                    }
                    // Add MLS
                    if (collected.mls_name && collected.mls_id) {
                      await supabase.from('contact_mls_memberships').insert({ contact_id: newContact.id, mls_name: collected.mls_name, mls_agent_id: collected.mls_id });
                    }
                    // Add to allowed_phones
                    await supabase.from('allowed_phones').insert({ phone: fromE164, role: 'client', is_active: true });
                  }
                }
              }
              await supabase.from('onboarding_sessions').update({ status: 'completed', collected, step: 'completed' }).eq('id', session.id);
              responseMsg = `✅ You're all set, ${(collected.name || '').split(' ')[0]}!\n\nYour TC Command account is now active. Your TC will be in touch shortly.\n\nText HELP anytime for commands. 🏠`;
            } else if (replyUpper === 'NO') {
              nextStep = 'name';
              collected.name = '';
              responseMsg = "No problem, let's start over.\n\n1️⃣ What's your full name?";
            } else {
              responseMsg = "Reply YES to confirm or NO to restart.";
            }
            break;
        }

        // Persist updated step + collected
        if (nextStep !== session.step || Object.keys(collected).length) {
          await supabase.from('onboarding_sessions').update({ step: nextStep, collected, updated_at: new Date().toISOString() }).eq('id', session.id);
        }

        await sendTwilioReply(fromPhone, responseMsg, isWhatsApp);

        // Save message to conversations
        const now2 = new Date().toISOString();
        await supabase.from('messages').insert({
          deal_id: null, contact_id: matchedContact?.id || null, direction: 'inbound',
          channel, body: Body, status: 'received', from_number: fromPhone,
          to_number: process.env.TWILIO_PHONE_NUMBER, external_message_id: MessageSid, sent_at: now2,
        });
        await supabase.from('messages').insert({
          deal_id: null, contact_id: matchedContact?.id || null, direction: 'outbound',
          channel, body: responseMsg, status: 'sent',
          from_number: isWhatsApp ? (process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886') : process.env.TWILIO_PHONE_NUMBER,
          to_number: fromPhone, sent_at: now2,
        });

        res.setHeader('Content-Type', 'text/xml');
        return res.send('<Response></Response>');
      }
    }
    // ── End Onboarding State Machine ─────────────────────────────────────────

    // NEW CONTRACT keyword — start contract intake
    if (bodyUpper.includes('NEW CONTRACT') || bodyUpper === 'NEW CONTRACT') {
      // Cancel any existing contract intake sessions first
      await supabase.from('onboarding_sessions')
        .update({ status: 'abandoned' })
        .eq('phone_e164', fromE164)
        .eq('status', 'active');

      // Start new contract intake session
      await supabase.from('onboarding_sessions').insert({
        phone_e164: fromE164,
        step: 'contract_address',
        collected: { session_type: 'contract_intake' },
        status: 'active',
        contact_id: matchedContact?.id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const greeting = matchedContact
        ? `📋 New contract! Hi ${matchedContact.first_name} 👋\n\nWhat's the property address for this contract? (e.g. 123 Main St, Kansas City, MO)\n\nReply STOP to cancel.`
        : `📋 New contract! What's the property address? (e.g. 123 Main St, Kansas City, MO)\n\nReply STOP to cancel.`;

      await sendTwilioReply(fromPhone, greeting, isWhatsApp);

      // Log the inbound message
      const now0 = new Date().toISOString();
      await supabase.from('messages').insert({
        deal_id: null, contact_id: matchedContact?.id || null, direction: 'inbound',
        channel, body: Body, status: 'received', from_number: fromPhone,
        to_number: process.env.TWILIO_PHONE_NUMBER, external_message_id: MessageSid, sent_at: now0,
      });
      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // HELP command
    if (bodyUpper === 'HELP') {
      await sendTwilioReply(fromPhone, '📋 TC Command:\n• OPEN FILES - list your active deals\n• STATUS <address> - get deal update\n• CALL ME - request a callback\n• Or just text us anything! 🏠', isWhatsApp);
      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // OPEN FILES command
    if (bodyUpper === 'OPEN FILES') {
      if (!matchedContact) {
        await sendTwilioReply(fromPhone, "We don't recognize this number. Please text us your name and we'll get you set up! 🏠", isWhatsApp);
      } else {
        const { data: parts } = await supabase
          .from('deal_participants').select('deal_id').eq('contact_id', matchedContact.id);
        const dIds = (parts || []).map((p: any) => p.deal_id);
        if (dIds.length > 0) {
          const { data: deals } = await supabase
            .from('deals')
            .select('property_address, pipeline_stage, closing_date')
            .in('id', dIds).eq('status', 'active');
          if (deals && deals.length > 0) {
            const list = deals.map((d: any, i: number) => {
              const closing = d.closing_date ? new Date(d.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'TBD';
              return `${i + 1}. ${d.property_address} (${d.pipeline_stage}) - Closing: ${closing}`;
            }).join('\n');
            await sendTwilioReply(fromPhone, `📂 Your active files:\n${list}\n\nReply STATUS <address> for details.`, isWhatsApp);
          } else {
            await sendTwilioReply(fromPhone, 'No active files found. Text us if you need help! 🏠', isWhatsApp);
          }
        } else {
          await sendTwilioReply(fromPhone, 'No active files found. Text us if you need help! 🏠', isWhatsApp);
        }
      }
      await supabase.from('communication_events').insert({
        contact_id: matchedContact?.id || null,
        channel: channel,
        direction: 'inbound',
        event_type: 'sms_command',
        summary: 'OPEN FILES command',
        source_ref: MessageSid,
      });
      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // STATUS <address> command
    if (bodyUpper.startsWith('STATUS ')) {
      const searchQuery = Body.trim().substring(7).toLowerCase();
      if (matchedContact) {
        const { data: parts } = await supabase
          .from('deal_participants').select('deal_id').eq('contact_id', matchedContact.id);
        const dIds = (parts || []).map((p: any) => p.deal_id);
        if (dIds.length > 0) {
          const { data: deals } = await supabase
            .from('deals')
            .select('id, property_address, pipeline_stage, closing_date, city, state')
            .in('id', dIds).eq('status', 'active');
          const match = (deals || []).find((d: any) => d.property_address.toLowerCase().includes(searchQuery));
          if (match) {
            const closing = match.closing_date ? new Date(match.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'TBD';
            const summary = `📋 ${match.property_address}\nStatus: ${match.pipeline_stage}\nClosing: ${closing}\nCity: ${match.city || ''}, ${match.state || ''}\n\nText us if you have questions! 🏠`;
            await sendTwilioReply(fromPhone, summary, isWhatsApp);
          } else {
            await sendTwilioReply(fromPhone, `Couldn't find a deal matching "${Body.trim().substring(7)}". Try OPEN FILES to see your active deals.`, isWhatsApp);
          }
        }
      } else {
        await sendTwilioReply(fromPhone, "We don't recognize this number. Text us your name and we'll get you set up! 🏠", isWhatsApp);
      }
      await supabase.from('communication_events').insert({
        contact_id: matchedContact?.id || null,
        channel: channel,
        direction: 'inbound',
        event_type: 'sms_command',
        summary: `STATUS command: ${searchQuery}`,
        source_ref: MessageSid,
      });
      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // CALL ME command
    if (bodyUpper === 'CALL ME') {
      await supabase.from('callback_requests').insert({
        caller_contact_id: matchedContact?.id || null,
        deal_id: relatedDeal?.id || null,
        phone_e164: fromE164,
        requested_by_channel: 'sms',
        reason: 'Requested via SMS CALL ME command',
        priority: 'normal',
        status: 'open',
      });
      await supabase.from('communication_events').insert({
        contact_id: matchedContact?.id || null,
        channel: channel,
        direction: 'inbound',
        event_type: 'callback_request',
        summary: 'CALL ME command - callback requested',
        source_ref: MessageSid,
      });
      await sendTwilioReply(fromPhone, '✅ Callback requested! A team member will call you back shortly. 📞', isWhatsApp);

      // Create notification for TC
      await supabase.from('notifications').insert({
        type: 'sms',
        title: `📞 Callback Requested: ${contactName}`,
        body: `${contactName} (${fromPhone}) wants a callback. Deal: ${relatedDeal?.property_address || 'None'}`,
        from_name: contactName,
        from_identifier: fromPhone,
        deal_id: relatedDeal?.id || null,
        contact_id: matchedContact?.id || null,
      });

      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // ── End SMS Commands — continue to AI classification ──────────────────────

    // 3. Find or create conversation
    let conversation: any = null;
    if (matchedContact) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('channel', channel)
        .eq('type', 'direct')
        .contains('participants', JSON.stringify([{ contact_id: matchedContact.id }]))
        .order('last_message_at', { ascending: false })
        .limit(1);
      conversation = existing?.[0];
    }

    if (!conversation) {
      const { data: byPhone } = await supabase
        .from('conversations')
        .select('*')
        .eq('channel', channel)
        .eq('type', 'direct')
        .order('last_message_at', { ascending: false })
        .limit(20);

      for (const conv of byPhone || []) {
        const participants = conv.participants as any[];
        if (participants?.some((p: any) => p.phone?.replace(/\D/g, '').endsWith(fromClean.slice(-10)))) {
          conversation = conv;
          break;
        }
      }
    }

    const now = new Date().toISOString();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          name: contactName,
          deal_id: relatedDeal?.id || null,
          type: 'direct',
          channel,
          participants: matchedContact
            ? [{ contact_id: matchedContact.id, name: contactName, phone: fromPhone }]
            : [{ contact_id: null, name: contactName, phone: fromPhone }],
          last_message_at: now,
          last_message_preview: Body.substring(0, 80),
          unread_count: 1,
          waiting_for_reply: false,
          waiting_since: null,
        })
        .select()
        .single();
      conversation = newConv;
    } else {
      // ✅ KEY: Clear waiting_for_reply when they reply back
      await supabase
        .from('conversations')
        .update({
          last_message_at: now,
          last_message_preview: Body.substring(0, 80),
          unread_count: (conversation.unread_count || 0) + 1,
          waiting_for_reply: false,
          waiting_since: null,
        })
        .eq('id', conversation.id);

    }

    // 4. Save inbound message
    await supabase.from('messages').insert({
      conversation_id: conversation?.id || null,
      deal_id: relatedDeal?.id || null,
      contact_id: matchedContact?.id || null,
      direction: 'inbound',
      channel,
      body: Body,
      status: 'received',
      from_number: fromPhone,
      to_number: process.env.TWILIO_PHONE_NUMBER,
      external_message_id: MessageSid,
      sent_at: now,
    });

    // Create notification for inbound message
    await supabase.from('notifications').insert({
      type: channel,
      title: `New ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} from ${contactName}`,
      body: Body.substring(0, 200),
      from_name: contactName,
      from_identifier: fromPhone,
      conversation_id: conversation?.id || null,
      deal_id: relatedDeal?.id || null,
      contact_id: matchedContact?.id || null,
    });

    // 5. AI classify and auto-create comm task
    const ai = await classifyMessage(contactName, relatedDeal?.property_address || null, Body);

    let createdTaskId: string | null = null;
    if (ai.needs_task) {
      const { data: task } = await supabase
        .from('comm_tasks')
        .insert({
          title: ai.task_title || `Reply to ${contactName}: "${Body.substring(0, 40)}..."`,
          description: `Inbound ${channel.toUpperCase()} from ${contactName} (${fromPhone}): "${Body}"`,
          channel,
          contact_id: matchedContact?.id || null,
          deal_id: relatedDeal?.id || null,
          status: 'pending',
          priority: ai.priority || 'normal',
          source: 'auto_inbound',
          due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        })
        .select()
        .single();
      createdTaskId = task?.id || null;
    }

    // ── Workflow engine for unmatched messages ────────────────────────────────────
    // Call our internal workflow engine to classify and act on the message
    try {
      await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://tcappmyredeal.vercel.app'}/api/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggerType: 'sms_inbound',
          content: Body,
          context: {
            from: fromPhone,
            channel: 'sms',
            contactId: matchedContact?.id || null,
          },
        }),
      });
    } catch (e) {
      console.error('Workflow engine call failed:', e);
    }

    // 6. Auto-reply
    const autoReply = ai.auto_reply || 'Thanks for reaching out! We\'ll get back to you shortly. 🏠';
    await sendTwilioReply(fromPhone, autoReply, isWhatsApp);

    const WA_FROM = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
    await supabase.from('messages').insert({
      conversation_id: conversation?.id || null,
      deal_id: relatedDeal?.id || null,
      contact_id: matchedContact?.id || null,
      direction: 'outbound',
      channel,
      body: autoReply,
      status: 'sent',
      from_number: isWhatsApp ? WA_FROM : process.env.TWILIO_PHONE_NUMBER,
      to_number: fromPhone,
      auto_created_task_id: createdTaskId,
      sent_at: now,
    });

    res.setHeader('Content-Type', 'text/xml');
    return res.send('<Response></Response>');
  } catch (err: any) {
    console.error('Message receive error:', err);
    res.setHeader('Content-Type', 'text/xml');
    return res.send('<Response></Response>');
  }
}
