const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// v2 - forced rebuild
const ALLOWED_ORIGINS = [
  'https://tcappmyredeal.vercel.app',
  'https://tcappmyredeal-git-feat-duplex-dual-address-andre25vas-projects.vercel.app',
  'https://tcappmyredeal-git-main-andre25vas-projects.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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

    // Step 2: Load active deals with participant data via joins
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select(`
        id, property_address, secondary_address, mls_number,
        deal_participants(
          deal_role,
          contacts(full_name, email, contact_type)
        )
      `)
      .neq('pipeline_stage', 'archived');

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
              content: `Extract real estate transaction details from this email/document. Return JSON only:\n{\n  "address": "street address or null",\n  "city": "city or null", \n  "state": "state or null",\n  "zip": "zip or null",\n  "mls_number": "MLS# or null",\n  "buyer_name": "buyer full name or null",\n  "seller_name": "seller full name or null",\n  "price": "sale price as number or null",\n  "close_date": "closing date YYYY-MM-DD or null"\n}\nReturn null for any field not found. No explanation, just JSON.`
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

      // Extract participant data from joined deal_participants
      const dealParticipants = deal.deal_participants || [];
      const allParticipantEmails = dealParticipants.map(p => (p.contacts?.email || '').toLowerCase()).filter(Boolean);
      const allParticipantNames = dealParticipants.map(p => (p.contacts?.full_name || '').toLowerCase()).filter(Boolean);
      const buyerNames = dealParticipants.filter(p => (p.deal_role || '').toLowerCase().includes('buyer')).map(p => (p.contacts?.full_name || '').toLowerCase()).filter(Boolean);
      const sellerNames = dealParticipants.filter(p => (p.deal_role || '').toLowerCase().includes('seller')).map(p => (p.contacts?.full_name || '').toLowerCase()).filter(Boolean);
      const lenderEmails = dealParticipants.filter(p => (p.deal_role || '').toLowerCase().includes('lender')).map(p => (p.contacts?.email || '').toLowerCase()).filter(Boolean);
      const titleEmails = dealParticipants.filter(p => (p.deal_role || '').toLowerCase().includes('title')).map(p => (p.contacts?.email || '').toLowerCase()).filter(Boolean);

      // Participant email match (+25)
      if (allParticipantEmails.includes(fromEmail) || lenderEmails.includes(fromEmail) || titleEmails.includes(fromEmail)) {
        score += 25; breakdown.participant_email = 25;
      }

      // Client name match (+20) — any participant name appears in email text
      const clientMatch = allParticipantNames.some(name => name.length > 3 && combinedText.includes(name));
      if (clientMatch) { score += 20; breakdown.client_name = 20; }

      // AI extracted buyer/seller match (+20)
      if (extracted?.buyer_name) {
        const extractedBuyer = extracted.buyer_name.toLowerCase();
        const buyerMatch = buyerNames.some(b => nameSimilarity(extractedBuyer, b) > 0.6);
        if (buyerMatch) { score += 20; breakdown.ai_buyer_match = 20; }
      }

      // Lender email (+20)
      if (lenderEmails.includes(fromEmail)) {
        score += 20; breakdown.lender_email = 20;
      }

      // Title email (+20)
      if (titleEmails.includes(fromEmail)) {
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
        thread_subject: subject,
        thread_snippet: snippet,
        thread_from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        thread_date: receivedAt || new Date().toISOString(),
        has_attachment: hasAttachment,
        received_at: receivedAt || new Date().toISOString(),
        status: 'new_deal',
        top_deal_id: null,
        top_deal_score: topScore,
        runner_up_deal_id: null,
        runner_up_score: 0,
        score_breakdown: top?.breakdown || {},
        ai_suggestion: `New deal detected: ${extracted?.address || 'unknown address'}${extracted?.buyer_name ? `. Buyer: ${extracted.buyer_name}` : ''}${extracted?.price ? `. Price: $${Number(extracted.price).toLocaleString()}` : ''}.`
      }, { onConflict: 'gmail_thread_id' });

      return res.json({ status: 'new_deal', extracted });
    }

    if (topScore >= AUTO_LINK_THRESHOLD && gap >= GAP_THRESHOLD) {
      // Auto-link
      await supabase.from('email_thread_links').upsert({
        gmail_thread_id: threadId,
        deal_id: top.deal.id,
        score: topScore,
        score_breakdown: top.breakdown,
        link_method: 'auto',
        thread_subject: subject,
        thread_snippet: snippet,
        thread_from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        thread_date: receivedAt || new Date().toISOString(),
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
        thread_subject: subject,
        thread_snippet: snippet,
        thread_from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        thread_date: receivedAt || new Date().toISOString(),
        has_attachment: hasAttachment,
        received_at: receivedAt || new Date().toISOString(),
        status: 'pending',
        top_deal_id: top.deal.id,
        top_deal_score: topScore,
        runner_up_deal_id: runnerUp?.deal?.id || null,
        runner_up_score: runnerScore,
        score_breakdown: top.breakdown,
        ai_suggestion: `Best match: ${top.deal.property_address} (score: ${topScore})${gap < GAP_THRESHOLD ? ` — close runner-up: ${runnerUp?.deal?.property_address} (${runnerScore})` : ''}`
      }, { onConflict: 'gmail_thread_id' });

      return res.json({ status: 'needs_review', top_deal_id: top.deal.id, score: topScore });

    } else {
      // Unmatched
      await supabase.from('email_review_queue').upsert({
        gmail_thread_id: threadId,
        thread_subject: subject,
        thread_snippet: snippet,
        thread_from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        thread_date: receivedAt || new Date().toISOString(),
        has_attachment: hasAttachment,
        received_at: receivedAt || new Date().toISOString(),
        status: 'pending',
        top_deal_id: top?.deal?.id || null,
        top_deal_score: topScore,
        runner_up_deal_id: runnerUp?.deal?.id || null,
        runner_up_score: runnerScore,
        score_breakdown: top?.breakdown || {},
        ai_suggestion: extractedAddress ? `No matching deal found for: ${extracted?.address}` : 'No strong deal match found'
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


// ─── Contract Data Extraction Endpoint ───────────────────────────────────────
app.post('/extract-contract', async (req, res) => {
  const { file_url, file_name, deal_id, deal_address } = req.body;

  if (!file_url) {
    return res.status(400).json({ error: 'file_url is required' });
  }

  const https = require('https');
  const http = require('http');
  const { execSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const tmpDir = os.tmpdir();
  const tmpPdf = path.join(tmpDir, `contract_${Date.now()}.pdf`);
  const tmpTxt = path.join(tmpDir, `contract_${Date.now()}.txt`);

  try {
    // 1. Download the PDF from the signed URL
    await new Promise((resolve, reject) => {
      const urlObj = new URL(file_url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      const file = fs.createWriteStream(tmpPdf);
      protocol.get(file_url, response => {
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', err => {
        fs.unlink(tmpPdf, () => {});
        reject(err);
      });
    });

    // 2. Extract text with pdftotext
    let extractedText = '';
    try {
      execSync(`pdftotext "${tmpPdf}" "${tmpTxt}" -layout`, { timeout: 30000 });
      extractedText = fs.readFileSync(tmpTxt, 'utf8');
    } catch (e) {
      console.warn('pdftotext failed, trying fallback:', e.message);
      try {
        execSync(`pdftotext "${tmpPdf}" "${tmpTxt}"`, { timeout: 30000 });
        extractedText = fs.readFileSync(tmpTxt, 'utf8');
      } catch (e2) {
        console.error('pdftotext completely failed:', e2.message);
        extractedText = '';
      }
    }

    const textForGPT = extractedText.slice(0, 6000);

    if (!textForGPT.trim()) {
      return res.json({ fields: [], raw_text_preview: '' });
    }

    // 3. Call GPT-4o-mini to extract structured fields
    const prompt = `You are a real estate transaction coordinator AI. Extract key contract fields from this purchase agreement text.\n\nReturn ONLY valid JSON with this exact structure (no markdown, no explanation):\n{\n  "fields": [\n    { "key": "contractPrice", "label": "Contract Price", "value": "540000", "confidence": "high" },\n    { "key": "listPrice", "label": "List Price", "value": "550000", "confidence": "high" },\n    { "key": "contractDate", "label": "Contract Date", "value": "2024-03-15", "confidence": "high" },\n    { "key": "closingDate", "label": "Closing Date", "value": "2024-04-30", "confidence": "high" },\n    { "key": "earnestMoney", "label": "Earnest Money", "value": "5000", "confidence": "medium" },\n    { "key": "earnestMoneyDueDate", "label": "Earnest Money Due", "value": "2024-03-20", "confidence": "medium" },\n    { "key": "loanType", "label": "Loan Type", "value": "conventional", "confidence": "high" },\n    { "key": "loanAmount", "label": "Loan Amount", "value": "432000", "confidence": "medium" },\n    { "key": "downPaymentAmount", "label": "Down Payment", "value": "108000", "confidence": "medium" },\n    { "key": "sellerConcessions", "label": "Seller Concessions", "value": "5000", "confidence": "medium" },\n    { "key": "inspectionDeadline", "label": "Inspection Deadline", "value": "2024-03-22", "confidence": "high" },\n    { "key": "loanCommitmentDate", "label": "Loan Commitment Date", "value": "2024-04-10", "confidence": "medium" },\n    { "key": "possessionDate", "label": "Possession Date", "value": "2024-04-30", "confidence": "medium" },\n    { "key": "buyerNames", "label": "Buyer Names", "value": "John & Jane Doe", "confidence": "high" },\n    { "key": "sellerNames", "label": "Seller Names", "value": "Bob Smith", "confidence": "high" },\n    { "key": "titleCompany", "label": "Title Company", "value": "ABC Title Co", "confidence": "medium" },\n    { "key": "loanOfficer", "label": "Loan Officer", "value": "Jane Smith - First Bank", "confidence": "low" },\n    { "key": "asIsSale", "label": "As-Is Sale", "value": "false", "confidence": "high" },\n    { "key": "inspectionWaived", "label": "Inspection Waived", "value": "false", "confidence": "high" },\n    { "key": "homeWarranty", "label": "Home Warranty", "value": "true", "confidence": "medium" }\n  ]\n}\n\nRules:\n- Only include fields you can find with reasonable confidence\n- Dates MUST be in YYYY-MM-DD format\n- Money values are numbers only (no $ or commas): "540000" not "$540,000"\n- Loan type must be one of: conventional, fha, va, usda, cash, other\n- Boolean fields (asIsSale, inspectionWaived, homeWarranty): use "true" or "false"\n- confidence levels: "high" (clearly stated), "medium" (inferred), "low" (uncertain)\n- Skip fields you cannot find — do not guess\n${deal_address ? `- The property address is: ${deal_address}` : ''}\n\nContract text:\n${textForGPT}`;

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const raw = aiResponse.choices[0].message.content.trim();
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (e) {
      console.error('GPT JSON parse failed:', e.message, '\nRaw:', raw.slice(0, 200));
      return res.json({ fields: [], raw_text_preview: textForGPT.slice(0, 500) });
    }

    return res.json({
      fields: parsed.fields || [],
      raw_text_preview: extractedText.slice(0, 500),
    });

  } catch (err) {
    console.error('extract-contract error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(tmpPdf); } catch (_) {}
    try { fs.unlinkSync(tmpTxt); } catch (_) {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TC Email Processor listening on port ${PORT}`));
