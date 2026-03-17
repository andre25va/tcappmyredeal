import type { RawEmail, SuggestedTask } from "./types";

/** Fast local keyword-based task extraction (no API call, used as fallback) */
export function extractTasksFromEmail(email: RawEmail): SuggestedTask[] {
  const tasks: SuggestedTask[] = [];
  const blob = [email.subject, email.snippet, email.bodyText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(send|provide|forward|deliver)\b/.test(blob)) {
    tasks.push({
      title: `Send requested items — ${email.subject}`,
      description: `From ${email.from}: review and send requested documents`,
      priority: "medium",
      suggestedOwnerRole: "tc",
    });
  }

  if (/\b(sign|execute|initial|signature)\b/.test(blob)) {
    tasks.push({
      title: `Get signatures — ${email.subject}`,
      description: `Signature/initials needed per email from ${email.from}`,
      priority: "high",
      suggestedOwnerRole: "agent",
    });
  }

  if (/\b(schedule|coordinate|set up)\b/.test(blob)) {
    tasks.push({
      title: `Schedule/coordinate — ${email.subject}`,
      description: `Scheduling needed per ${email.from}`,
      priority: "medium",
      suggestedOwnerRole: "tc",
    });
  }

  if (/\b(deadline|expir|by end of day|asap|urgent)\b/.test(blob)) {
    tasks.push({
      title: `Urgent deadline — ${email.subject}`,
      description: `Time-sensitive item from ${email.from}`,
      priority: "high",
      suggestedOwnerRole: "tc",
    });
  }

  if (/\b(missing|outstanding|still need|waiting on)\b/.test(blob)) {
    tasks.push({
      title: `Follow up on missing items — ${email.subject}`,
      description: `Items needed per ${email.from}`,
      priority: "medium",
      suggestedOwnerRole: "tc",
    });
  }

  if (/\b(review|check|verify|look over)\b/.test(blob)) {
    tasks.push({
      title: `Review required — ${email.subject}`,
      description: `Review requested by ${email.from}`,
      priority: "low",
      suggestedOwnerRole: "tc",
    });
  }

  return tasks;
}
