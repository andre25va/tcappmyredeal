import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from 'module';
import OpenAI from 'openai';

// pdf-parse is CommonJS — use createRequire so it works in the Vercel ESM/CJS hybrid
const require = createRequire(import.meta.url);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Vercel function config — give it 60s for PDF download + parse + OpenAI
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Accept both field names — WorkspaceDocuments sends file_url, Inbox sends pdf_url
  const { file_url, pdf_url, file_name, deal_id, deal_address } = req.body || {};
  const pdfUrl: string = file_url || pdf_url;

  if (!pdfUrl) return res.status(400).json({ error: 'file_url or pdf_url is required' });

  try {
    // 1. Download the PDF from the signed Supabase URL
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) throw new Error(`Failed to download PDF: ${pdfRes.status} ${pdfRes.statusText}`);
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // 2. Extract text using pdf-parse (pure JS, no system dependencies needed)
    let extractedText = '';
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(pdfBuffer);
      extractedText = data.text || '';
    } catch (parseErr: any) {
      console.warn('pdf-parse failed:', parseErr.message);
      // Return empty fields rather than crashing
      return res.json({ fields: [], raw_text_preview: '', error: 'PDF text extraction failed' });
    }

    const textForGPT = extractedText.slice(0, 6000);
    if (!textForGPT.trim()) {
      return res.json({ fields: [], raw_text_preview: '' });
    }

    // 3. Call GPT-4o-mini to extract structured contract fields
    const prompt = `You are a real estate transaction coordinator AI. Extract key contract fields from this purchase agreement text.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "fields": [
    { "key": "contractPrice", "label": "Contract Price", "value": "540000", "confidence": "high" },
    { "key": "listPrice", "label": "List Price", "value": "550000", "confidence": "high" },
    { "key": "contractDate", "label": "Contract Date", "value": "2024-03-15", "confidence": "high" },
    { "key": "closingDate", "label": "Closing Date", "value": "2024-04-30", "confidence": "high" },
    { "key": "earnestMoney", "label": "Earnest Money", "value": "5000", "confidence": "medium" },
    { "key": "earnestMoneyDueDate", "label": "Earnest Money Due", "value": "2024-03-20", "confidence": "medium" },
    { "key": "loanType", "label": "Loan Type", "value": "conventional", "confidence": "high" },
    { "key": "loanAmount", "label": "Loan Amount", "value": "432000", "confidence": "medium" },
    { "key": "downPaymentAmount", "label": "Down Payment", "value": "108000", "confidence": "medium" },
    { "key": "sellerConcessions", "label": "Seller Concessions", "value": "5000", "confidence": "medium" },
    { "key": "inspectionDeadline", "label": "Inspection Deadline", "value": "2024-03-22", "confidence": "high" },
    { "key": "loanCommitmentDate", "label": "Loan Commitment Date", "value": "2024-04-10", "confidence": "medium" },
    { "key": "possessionDate", "label": "Possession Date", "value": "2024-04-30", "confidence": "medium" },
    { "key": "buyerNames", "label": "Buyer Names", "value": "John & Jane Doe", "confidence": "high" },
    { "key": "sellerNames", "label": "Seller Names", "value": "Bob Smith", "confidence": "high" },
    { "key": "titleCompany", "label": "Title Company", "value": "ABC Title Co", "confidence": "medium" },
    { "key": "loanOfficer", "label": "Loan Officer", "value": "Jane Smith - First Bank", "confidence": "low" },
    { "key": "asIsSale", "label": "As-Is Sale", "value": "false", "confidence": "high" },
    { "key": "inspectionWaived", "label": "Inspection Waived", "value": "false", "confidence": "high" },
    { "key": "homeWarranty", "label": "Home Warranty", "value": "true", "confidence": "medium" }
  ]
}

Rules:
- Only include fields you can find with reasonable confidence
- Dates MUST be in YYYY-MM-DD format
- Money values are numbers only (no $ or commas): "540000" not "$540,000"
- Loan type must be one of: conventional, fha, va, usda, cash, other
- Boolean fields (asIsSale, inspectionWaived, homeWarranty): use "true" or "false"
- confidence levels: "high" (clearly stated), "medium" (inferred), "low" (uncertain)
- Skip fields you cannot find — do not guess
${deal_address ? `- The property address is: ${deal_address}` : ''}

Contract text:
${textForGPT}`;

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const raw = aiResponse.choices[0].message.content?.trim() || '';
    let parsed: { fields: any[] };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (e) {
      console.error('GPT JSON parse failed:', raw.slice(0, 200));
      return res.json({ fields: [], raw_text_preview: textForGPT.slice(0, 500) });
    }

    return res.json({
      fields: parsed.fields || [],
      raw_text_preview: extractedText.slice(0, 500),
    });

  } catch (err: any) {
    console.error('extract-contract error:', err);
    return res.status(500).json({ error: err.message });
  }
}
