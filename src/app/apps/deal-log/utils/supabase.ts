import { Deal, EmailLogEntry } from '../types';

const PROJECT_ID = 'alxrmusieuzgssynktxg';
const TOOL = 'conn_ggvr42vq9x7f2jfmb9d1__execute_sql';

function extractRows(raw: unknown): unknown[] {
  // Already an array
  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === 'object' && 'result' in raw) {
    const result = (raw as Record<string, unknown>).result;

    // result is already an array (runTool auto-parsed JSON)
    if (Array.isArray(result)) return result;

    // result is a string — try untrusted-data tags first, then plain array
    if (typeof result === 'string') {
      const tagMatch = result.match(/<untrusted-data[^>]*>([\s\S]*?)<\/untrusted-data[^>]*>/);
      if (tagMatch) {
        try { return JSON.parse(tagMatch[1].trim()) as unknown[]; } catch { /* fall through */ }
      }
      const arrMatch = result.match(/(\[[\s\S]*\])/);
      if (arrMatch) {
        try { return JSON.parse(arrMatch[1]) as unknown[]; } catch { /* fall through */ }
      }
    }
  }

  // Last resort: stringify the whole thing and try regex
  const s = JSON.stringify(raw);
  const tagMatch = s.match(/<untrusted-data[^>]*>([\s\S]*?)<\/untrusted-data[^>]*>/);
  if (tagMatch) {
    try { return JSON.parse(tagMatch[1].trim()) as unknown[]; } catch { /* fall through */ }
  }
  const arrMatch = s.match(/(\[[\s\S]*\])/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[1]) as unknown[]; } catch { /* fall through */ }
  }

  return [];
}

export async function fetchEmailLog(): Promise<EmailLogEntry[]> {
  const query = `
    SELECT
      e.id, e.sent_at, e.subject, e.to_addresses, e.cc_addresses,
      e.template_name, e.sent_by, e.body_html, e.email_type,
      d.property_address as address
    FROM email_send_log e
    LEFT JOIN deals d ON d.id = e.deal_id
    ORDER BY e.sent_at DESC
    LIMIT 200
  `;
  const raw = await window.tasklet.runTool(TOOL, { project_id: PROJECT_ID, query });
  const rows = extractRows(raw);
  return rows as EmailLogEntry[];
}

export async function fetchDeals(): Promise<Deal[]> {
  const query = `
    SELECT
      id, property_address, city, state, zip,
      mls_number, deal_type, status, pipeline_stage,
      purchase_price, closing_date,
      buyer_name, seller_name,
      commission_percentage, commission_amount,
      created_at
    FROM deals
    ORDER BY created_at DESC
  `;
  const raw = await window.tasklet.runTool(TOOL, {
    project_id: PROJECT_ID,
    query,
  });
  const rows = extractRows(raw);
  return rows as Deal[];
}
