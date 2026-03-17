import { EmailThreadGroup, EmailSummary, RawEmail } from "./types";

export function groupEmailsByThread(emails: RawEmail[]): EmailThreadGroup[] {
  const map = new Map<string, RawEmail[]>();

  for (const email of emails) {
    const existing = map.get(email.threadId) || [];
    existing.push(email);
    map.set(email.threadId, existing);
  }

  return Array.from(map.entries()).map(([threadId, threadEmails]) => {
    const sorted = threadEmails.sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
    return { threadId, emails: sorted, latest: sorted[0] };
  });
}

export function summarizeThread(group: EmailThreadGroup): EmailSummary {
  const keyUpdates: string[] = [];
  const actionItems: string[] = [];
  const riskFlags: string[] = [];

  const updateKeywords = [
    "update", "scheduled", "confirmed", "approved", "received",
    "completed", "submitted", "cleared", "accepted",
  ];
  const actionKeywords = [
    "send", "sign", "provide", "submit", "schedule", "forward",
    "review", "confirm", "return", "upload", "complete",
  ];
  const riskKeywords = [
    "delay", "denied", "missing", "overdue", "expired", "issue",
    "problem", "rejected", "failed", "deadline", "urgent", "asap",
  ];

  for (const email of group.emails) {
    const text = [email.subject, email.snippet, email.bodyText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const kw of updateKeywords) {
      if (text.includes(kw)) {
        keyUpdates.push(`${email.subject} — ${kw} mentioned`);
        break;
      }
    }

    for (const kw of actionKeywords) {
      if (text.includes(kw)) {
        actionItems.push(`${email.subject} — "${kw}" action needed`);
        break;
      }
    }

    for (const kw of riskKeywords) {
      if (text.includes(kw)) {
        riskFlags.push(`${email.subject} — ⚠ ${kw}`);
        break;
      }
    }
  }

  const parts: string[] = [];
  if (group.emails.length > 1) parts.push(`${group.emails.length} emails in thread`);
  if (keyUpdates.length) parts.push(`${keyUpdates.length} update(s)`);
  if (actionItems.length) parts.push(`${actionItems.length} action(s)`);
  if (riskFlags.length) parts.push(`${riskFlags.length} risk flag(s)`);

  const summary = parts.length
    ? `Thread: "${group.latest.subject}" — ${parts.join(", ")}.`
    : `Thread: "${group.latest.subject}" — no notable signals detected.`;

  return { summary, keyUpdates, actionItems, riskFlags };
}
