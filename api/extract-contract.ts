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

    // 12000 chars to capture dates buried in longer contracts
    const textForGPT = extractedText.slice(0, 12000);
    if (!textForGPT.trim()) {
      return res.json({ fields: [], raw_text_preview: '' });
    }

    // 3. Call GPT-4o to extract structured contract fields
    // NOTE: All keys here must exactly match FIELD_DEAL_MAP keys in contractExtraction.ts
    const prompt = `You are a real estate transaction coordinator AI. Extract key contract fields from this purchase agreement text.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "fields": [
    { "key": "contractPrice", "label": "Contract Price", "value": "540000", "confidence": "high" },
    { "key": "listPrice", "label": "List Price", "value": "550000", "confidence": "high" },
    { "key": "contractDate", "label": "Contract Date / Effective Date", "value": "2024-03-15", "confidence": "high" },
    { "key": "closingDate", "label": "Closing Date", "value": "2024-04-30", "confidence": "high" },
    { "key": "possessionDate", "label": "Possession Date", "value": "2024-04-30", "confidence": "medium" },
    { "key": "surveyDeadline", "label": "Survey Deadline", "value": "10 calendar days before Closing Date", "confidence": "medium" },
    { "key": "earnestMoney", "label": "Earnest Money", "value": "5000", "confidence": "medium" },
    { "key": "earnestMoneyDueDate", "label": "Earnest Money Due", "value": "3 calendar days after Effective Date", "confidence": "medium" },
    { "key": "earnestMoneyHolder", "label": "Earnest Money Holder", "value": "First American Title", "confidence": "high" },
    { "key": "additionalEarnestMoney", "label": "Additional Earnest Money", "value": "1000", "confidence": "medium" },
    { "key": "additionalEarnestMoneyDue", "label": "Additional Earnest Money Due", "value": "3 calendar days after Inspection Period Ends", "confidence": "medium" },
    { "key": "loanType", "label": "Loan Type", "value": "conventional", "confidence": "high" },
    { "key": "loanAmount", "label": "Loan Amount", "value": "432000", "confidence": "medium" },
    { "key": "downPaymentAmount", "label": "Down Payment", "value": "108000", "confidence": "medium" },
    { "key": "downPaymentPercent", "label": "Down Payment %", "value": "20", "confidence": "medium" },
    { "key": "loanApplicationDue", "label": "Loan Application Due", "value": "5 calendar days after Inspection Period Ends", "confidence": "medium" },
    { "key": "finalLoanApprovalDue", "label": "Final Loan Approval Due", "value": "5 calendar days before Closing Date", "confidence": "medium" },
    { "key": "financeDeadline", "label": "Loan Commitment / Finance Deadline", "value": "2024-04-10", "confidence": "medium" },
    { "key": "inspectionDate", "label": "Inspection Period Ends", "value": "11 calendar days after Effective Date", "confidence": "high" },
    { "key": "buyerInspectionNoticeDue", "label": "Buyer Inspection Notice Due", "value": "0 calendar days after Inspection Period Ends", "confidence": "medium" },
    { "key": "renegotiationPeriod", "label": "Renegotiation Period", "value": "5 calendar days after Buyer Inspection Notice Due", "confidence": "medium" },
    { "key": "appraisalDeliveryDate", "label": "Appraisal Report Delivery Date", "value": "2024-04-01", "confidence": "medium" },
    { "key": "appraisalDueToSeller", "label": "Appraisal Report Due to Seller", "value": "5 calendar days after Appraisal Report Delivery Date", "confidence": "medium" },
    { "key": "appraisalNegotiationPeriod", "label": "Appraisal Negotiation Period", "value": "5 calendar days after Appraisal Report Due to Seller", "confidence": "medium" },
    { "key": "titleCommitmentDeliveryDate", "label": "Title Commitment Delivery Date", "value": "10 calendar days after Effective Date", "confidence": "medium" },
    { "key": "titleObjectionPeriod", "label": "Title Objection Period", "value": "5 calendar days after Title Commitment Delivery Date", "confidence": "medium" },
    { "key": "hoaDocumentDeliveryDeadline", "label": "HOA Document Delivery Deadline", "value": "5 calendar days after Effective Date", "confidence": "medium" },
    { "key": "buyerHoaReviewDeadline", "label": "Buyer HOA Review Deadline", "value": "5 calendar days after HOA Document Delivery Deadline", "confidence": "medium" },
    { "key": "sellerCredit", "label": "Seller Concessions / Credit", "value": "5000", "confidence": "medium" },
    { "key": "sellerPaidClosingCosts", "label": "Seller Paid Closing Costs", "value": "3000", "confidence": "medium" },
    { "key": "repairsNotToExceed", "label": "Repairs Not to Exceed", "value": "2000", "confidence": "medium" },
    { "key": "additionalSellerCosts", "label": "Additional Seller Paid Costs", "value": "1000", "confidence": "medium" },
    { "key": "commissionReceived", "label": "Commission Received", "value": "4950", "confidence": "medium" },
    { "key": "buyerAgentCommission", "label": "Buyer Agent / Broker Commission", "value": "3%", "confidence": "medium" },
    { "key": "listingAgentCommission", "label": "Listing Agent Commission", "value": "3%", "confidence": "medium" },
    { "key": "buyerNames", "label": "Buyer Names", "value": "John & Jane Doe", "confidence": "high" },
    { "key": "sellerNames", "label": "Seller Names", "value": "Bob Smith", "confidence": "high" },
    { "key": "buyerAgentName", "label": "Buyer Agent Name", "value": "Sarah Johnson", "confidence": "medium" },
    { "key": "sellerAgentName", "label": "Seller/Listing Agent Name", "value": "Mike Williams", "confidence": "medium" },
    { "key": "titleCompany", "label": "Title Company", "value": "ABC Title Co", "confidence": "medium" },
    { "key": "loanOfficer", "label": "Loan Officer", "value": "Jane Smith - First Bank", "confidence": "low" },
    { "key": "homeWarrantyPaidBy", "label": "Home Warranty Paid By", "value": "BUYER", "confidence": "medium" },
    { "key": "homeWarrantyAmount", "label": "Home Warranty Amount", "value": "500", "confidence": "medium" },
    { "key": "homeWarrantyCompany", "label": "Home Warranty Company", "value": "American Home Shield", "confidence": "medium" },
    { "key": "legalDescription", "label": "Legal Description", "value": "LOT 14, BLOCK 2, SUNRISE ESTATES", "confidence": "medium" },
    { "key": "asIsSale", "label": "As-Is Sale", "value": "false", "confidence": "high" },
    { "key": "inspectionWaived", "label": "Inspection Waived", "value": "false", "confidence": "high" },
    { "key": "homeWarranty", "label": "Home Warranty Included", "value": "true", "confidence": "medium" }
  ]
}

Rules:
- Only include fields you can find with reasonable confidence
- Hard dates MUST be in YYYY-MM-DD format
- Relative deadlines: when a deadline is defined as "X days after/before [event]", extract it verbatim as a text formula (e.g., "5 calendar days after Inspection Period Ends", "10 calendar days before Closing Date"). Use the anchor date name exactly as stated in the contract.
- If a relative deadline field also has an explicit date stated, prefer the explicit date in YYYY-MM-DD format
- Money values are numbers only (no $ or commas): "540000" not "$540,000"
- Applies to: earnestMoney, additionalEarnestMoney, loanAmount, downPaymentAmount, sellerCredit, sellerPaidClosingCosts, repairsNotToExceed, additionalSellerCosts, commissionReceived, homeWarrantyAmount
- Loan type must be one of: conventional, fha, va, usda, cash, other
- Boolean fields (asIsSale, inspectionWaived, homeWarranty): use "true" or "false"
- Commission fields (buyerAgentCommission, listingAgentCommission): use percentage if stated as % (e.g. "3%"), otherwise dollar amount as number only
- commissionReceived: dollar amount only (no $ or commas)
- homeWarrantyPaidBy: extract exact text from contract (e.g., "BUYER", "SELLER", "BUYER waives", "N/A")
- Down payment percent: number only, no % symbol (e.g. "20" for 20%)
- confidence levels: "high" (clearly stated), "medium" (inferred), "low" (uncertain)
- Skip fields you cannot find — do not guess
- Do NOT duplicate any key in the fields array
${deal_address ? `- The property address is: ${deal_address}` : ''}

Contract text:
${textForGPT}`;

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
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

    // Deduplicate fields by key — keep first occurrence
    const seen = new Set<string>();
    const deduped = (parsed.fields || []).filter((f: any) => {
      if (seen.has(f.key)) return false;
      seen.add(f.key);
      return true;
    });

    return res.json({
      fields: deduped,
      raw_text_preview: extractedText.slice(0, 500),
    });

  } catch (err: any) {
    console.error('extract-contract error:', err);
    return res.status(500).json({ error: err.message });
  }
}
