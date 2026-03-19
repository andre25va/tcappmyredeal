const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
app.use(express.json({ limit: '10mb' }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health check
app.get('/', (req, res) => res.json({ status: 'TC Email Processor running' }));

// Main processing endpoint — called by Tasklet after Gmail fetch + PDF extraction
app.post('/process-email', async (req, res) => {
  const {
    threadId,
    messageId,
    subject,
    from,
    snippet,
    bodyText,
    hasAttachment,
    attachmentFilenames = [],
    pdfText = null,
    isUnread,
    receivedAt
  } = req.body;

  if (!threadId || !messageId) {
    return res.status(400).json({ error: 'threadId and messageId required' });
  }

  console.log(`Processing thread ${threadId} — subject: "${subject}"`);

  try {
    // Step 1: Check if already linked
    const { data: existing } = await supabase
      .from('email_thread_links')
      .select('id, deal_id')
      .eq('gmail_thread_id', threadId)
      .single();

    if (existing) {
      console.log(`Thread ${threadId} already linked to deal ${existing.deal_id} — skipping`);
      return res.json({ status: 'already_linked', deal_id: existing.deal_id });
    }

    // Step 2: Load active deals
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, property_address, secondary_address, buyer_name, seller_name, mls_number, lender_email, title_email, participants')
      .eq('status', 'active');

    if (dealsError) throw dealsError;

    // Step 3: AI extraction from body + PDF
    let extracted = null;
    const contentForAI = [
      subject ? `Subject: ${subject}` : '',
      bodyText ? `Body:\n${bodyText.slice(0, 3000)}` : '',
      pdfText ? `PDF Content:\n${pdfText.slice(0, 4000)}` : '',
      attachmentFilenames.length ? `Attachments: ${attachmentFilenames.join(', ')}` : ''
    ].filter(Boolean).join('\n\n');

    if (contentForAI.length > 50) {
      try {
        const aiResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: `Extract real estate transaction details from this email/document. Return JSON only:
{
  "address": "street address or null",
  "city": "city or null", 
  "state": "state or null",
  "zip": "zip or null",
  "mls_number": "MLS# or null",
  "buyer_name": "buyer full name or null",
  "seller_name": "seller full name or null",
  "price": "sale price as number or null",
  "close_date": "closing date YYYY-MM-DD or null"
}
Return null for any field not found. No explanation, just JSON.`
            },
            { role: 'user', content: contentForAI }
          ]
        });

        const raw = aiResponse.choices[0].message.content.trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
        console.log('AI extracted:', extracted);
      } catch (aiErr) {
        console.error('AI extraction failed:', aiErr.message);
      }
    }

    // Step 4: Score each deal
    const fromEmail = from?.email?.toLowerCase() || '';
    const fromName = from?.name?.toLowerCase() || '';
    const subjectLower = (subject || '').toLowerCase();
    const bodyLower = (bodyText || '').toLowerCase();
    const combinedText = subjectLower + ' ' + bodyLower;

    const extractedAddress = extracted?.address
      ? `${extracted.address} ${extracted.city || ''} ${extracted.state || ''} ${extracted.zip || ''}`.toLowerCase().trim()
      : null;

    const extractedAddressMatchesAnyDeal = extractedAddress
      ? deals.some(d => {
          const dealAddr = (d.property_address || '').toLowerCase();
          const dealAddr2 = (d.secondary_address || '').toLowerCase();
          return addressSimilarity(extractedAddress, dealAddr) > 0.5 ||
                 (dealAddr2 && addressSimilarity(extractedAddress, dealAddr2) > 0.5);
        })
      : false;

    const scores = deals.map(deal => {
      let score = 0;
      const breakdown = {};

      const dealAddr = (deal.property_address || '').toLowerCase();
      const dealAddr2 = (deal.secondary_address || '').toLowerCase();
      const dealAddrs = [dealAddr, dealAddr2].filter(Boolean);

      // MLS# match (+60)
      if (extracted?.mls_number && deal.mls_number) {
        if (extracted.mls_number.replace(/\D/g, '') === deal.mls_number.replace(/\D/g, '')) {
          score += 60; breakdown.mls_match = 60;
        }
      }

      // Address in subject (+55)
      for (const addr of dealAddrs) {
        const addrWords = addr.split(/\s+/).filter(w => w.length > 2);
        const matchCount = addrWords.filter(w => subjectLower.includes(w)).length;
        if (matchCount >= 2) { score += 55; breakdown.address_subject = 55; break; }
        if (matchCount === 1 && addrWords.length === 1) { score += 30; breakdown.address_subject_partial = 30; break; }
      }

      // Address in body (+45)
      if (!breakdown.address_subject && !breakdown.address_subject_partial) {
        for (const addr of dealAddrs) {
          const addrWords = addr.split(/\s+/).filter(w => w.length > 2);
          const matchCount = addrWords.filter(w => bodyLower.includes(w)).length;
          if (matchCount >= 2) { score += 45; breakdown.address_body = 45; break; }
          if (matchCount === 1) { score += 20; breakdown.address_body_partial = 20; break; }
        }
      }

      // Attachment AI address match (+60)
      if (extractedAddress) {
        for (const addr of dealAddrs) {
          if (addressSimilarity(extractedAddress, addr) > 0.5) {
            score += 60; breakdown.attachment_address = 60; break;
          }
        }
        // Penalty: AI extracted address but doesn't match THIS deal
        if (!breakdown.attachment_address && extractedAddressMatchesAnyDeal) {
          score -= 60; breakdown.address_mismatch = -60;
        }
        // Penalty: AI extracted address doesn't match any deal
        if (!breakdown.attachment_address && !extractedAddressMatchesAnyDeal) {
          score -= 40; breakdown.address_extracted_no_match = -40;
        }
      }

      // Participant email match (+25)
      const participants = deal.participants || [];
      const allEmails = participants.map(p => (p.email || '').toLowerCase());
      if (allEmails.includes(fromEmail) || fromEmail === deal.lender_email?.toLowerCase() || fromEmail === deal.title_email?.toLowerCase()) {
        score += 25; breakdown.participant_email = 25;
      }

      // Client name match (+20)
      const buyerLower = (deal.buyer_name || '').toLowerCase();
      const sellerLower = (deal.seller_name || '').toLowerCase();
      if ((buyerLower && combinedText.includes(buyerLower)) || (sellerLower && combinedText.includes(sellerLower))) {
        score += 20; breakdown.client_name = 20;
      }

      // AI extracted buyer/seller match (+20)
      if (extracted?.buyer_name && buyerLower) {
        if (nameSimilarity(extracted.buyer_name.toLowerCase(), buyerLower) > 0.6) {
          score += 20; breakdown.ai_buyer_match = 20;
        }
      }

      // Lender email (+20)
      if (deal.lender_email && fromEmail === deal.lender_email.toLowerCase()) {
        score += 20; breakdown.lender_email = 20;
      }

      // Title email (+20)
      if (deal.title_email && fromEmail === deal.title_email.toLowerCase()) {
        score += 20; breakdown.title_email = 20;
      }

      // Attachment present (+20)
      if (hasAttachment && attachmentFilenames.length > 0) {
        score += 20; breakdown.attachment_match = 20;
      }

      return { deal, score, breakdown };
    });

    scores.sort((a, b) => b.score - a.score);
    const top = scores[0];
    const runnerUp = scores[1];

    console.log(`Top match: deal ${top?.deal?.id} score=${top?.score}`);

    // Step 5: Routing decision
    const GAP_THRESHOLD = 20;
    const AUTO_LINK_THRESHOLD = 80;
    const NEEDS_REVIEW_THRESHOLD = 35;

    const topScore = top?.score || 0;
    const runnerScore = runnerUp?.score || 0;
    const gap = topScore - runnerScore;

    // Special case: AI extracted address matches no deal → new_deal
    if (extractedAddress && !extractedAddressMatchesAnyDeal && topScore < 80) {
      console.log('New deal detected via AI address extraction');
      await supabase.from('email_review_queue').upsert({
        gmail_thread_id: threadId,
        gmail_message_id: messageId,
        thread_subject: subject,
        thread_snippet: snippet,
        thread_from_email: fromEmail,
        thread_from_name: fromName,
        has_attachment: hasAttachment,
        is_unread: isUnread,
        received_at: receivedAt || new Date().toISOString(),
        status: 'new_deal',
        top_deal_id: null,
        top_score: topScore,
        runner_up_deal_id: null,
        runner_up_score: 0,
        score_breakdown: top?.breakdown || {},
        ai_suggestion: `New deal detected: ${extracted?.address || 'unknown address'}${extracted?.buyer_name ? `, buyer: ${extracted.buyer_name}` : ''}${extracted?.price ? `, $${extracted.price.toLocaleString()}` : ''}`,
        ai_extracted_address: extracted?.address || null,
        ai_extracted_buyer: extracted?.buyer_name || null,
        ai_extracted_price: extracted?.price || null
      }, { onConflict: 'gmail_thread_id' });

      return res.json({ status: 'new_deal', extracted });
    }

    if (topScore >= AUTO_LINK_THRESHOLD && gap >= GAP_THRESHOLD) {
      // Auto-link
      await supabase.from('email_thread_links').upsert({
        gmail_thread_id: threadId,
        gmail_message_id: messageId,
        deal_id: top.deal.id,
        score: topScore,
        score_breakdown: top.breakdown,
        link_method: 'auto',
        thread_subject: subject,
        thread_snippet: snippet,
        thread_from_email: fromEmail,
        thread_from_name: fromName,
        has_attachment: hasAttachment,
        is_unread: isUnread,
        linked_at: new Date().toISOString()
      }, { onConflict: 'gmail_thread_id,deal_id' });

      console.log(`Auto-linked thread ${threadId} to deal ${top.deal.id}`);
      return res.json({ status: 'auto_linked', deal_id: top.deal.id, score: topScore });

    } else if (topScore >= NEEDS_REVIEW_THRESHOLD) {
      // Needs review
      await supabase.from('email_review_queue').upsert({
        gmail_thread_id: threadId,
        gmail_message_id: messageId,
        thread_subject: subject,
        thread_snippet: snippet,
        thread_from_email: fromEmail,
        thread_from_name: fromName,
        has_attachment: hasAttachment,
        is_unread: isUnread,
        received_at: receivedAt || new Date().toISOString(),
        status: 'pending',
        top_deal_id: top.deal.id,
        top_score: topScore,
        runner_up_deal_id: runnerUp?.deal?.id || null,
        runner_up_score: runnerScore,
        score_breakdown: top.breakdown,
        ai_suggestion: `Best match: ${top.deal.property_address} (score: ${topScore})${gap < GAP_THRESHOLD ? ` — close runner-up: ${runnerUp?.deal?.property_address} (${runnerScore})` : ''}`,
        ai_extracted_address: extracted?.address || null,
        ai_extracted_buyer: extracted?.buyer_name || null,
        ai_extracted_price: extracted?.price || null
      }, { onConflict: 'gmail_thread_id' });

      return res.json({ status: 'needs_review', top_deal_id: top.deal.id, score: topScore });

    } else {
      // Unmatched
      await supabase.from('email_review_queue').upsert({
        gmail_thread_id: threadId,
        gmail_message_id: messageId,
        thread_subject: subject,
        thread_snippet: snippet,
        thread_from_email: fromEmail,
        thread_from_name: fromName,
        has_attachment: hasAttachment,
        is_unread: isUnread,
        received_at: receivedAt || new Date().toISOString(),
        status: topScore < 10 ? 'unmatched' : 'pending',
        top_deal_id: top?.deal?.id || null,
        top_score: topScore,
        runner_up_deal_id: runnerUp?.deal?.id || null,
        runner_up_score: runnerScore,
        score_breakdown: top?.breakdown || {},
        ai_suggestion: extractedAddress ? `No matching deal found for: ${extracted?.address}` : 'No strong deal match found',
        ai_extracted_address: extracted?.address || null,
        ai_extracted_buyer: extracted?.buyer_name || null,
        ai_extracted_price: extracted?.price || null
      }, { onConflict: 'gmail_thread_id' });

      return res.json({ status: 'unmatched', score: topScore });
    }

  } catch (err) {
    console.error('Processing error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Helper: simple address similarity (word overlap)
function addressSimilarity(a, b) {
  const aWords = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const bWords = new Set(b.split(/\s+/).filter(w => w.length > 2));
  const intersection = [...aWords].filter(w => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;
  return union === 0 ? 0 : intersection / union;
}

// Helper: name similarity
function nameSimilarity(a, b) {
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  const intersection = [...aWords].filter(w => bWords.has(w)).length;
  return intersection / Math.max(aWords.size, bWords.size);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TC Email Processor listening on port ${PORT}`));
