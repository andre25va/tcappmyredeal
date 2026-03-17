import { DealHealthSnapshot, DealRecord } from "./types";

export function getDealHealth(deal: DealRecord): DealHealthSnapshot {
  let score = 100;
  const missingItems: string[] = [];
  const overdueTasks: string[] = [];
  const staleWarnings: string[] = [];

  // Check compliance items
  for (const item of deal.complianceItems || []) {
    if (item.status === "missing") {
      score -= 10;
      missingItems.push(item.label);
    }
    if (item.status === "failed") {
      score -= 15;
      missingItems.push(`${item.label} (failed)`);
    }
  }

  // Check due diligence items
  for (const item of deal.dueDiligenceItems || []) {
    if (item.status === "missing") {
      score -= 8;
      missingItems.push(item.label);
    }
  }

  // Check overdue tasks
  const today = new Date().toISOString().slice(0, 10);
  for (const task of deal.tasks || []) {
    if (task.status === "open" && task.dueDate && task.dueDate < today) {
      score -= 12;
      overdueTasks.push(`${task.title} (due ${task.dueDate})`);
    }
  }

  // Check staleness
  if (deal.lastActivityAt) {
    const daysSince = Math.floor(
      (Date.now() - new Date(deal.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince > 7) {
      score -= 10;
      staleWarnings.push(`No activity in ${daysSince} days`);
    }
    if (daysSince > 14) {
      score -= 10;
      staleWarnings.push("Deal may be stalling");
    }
  }

  // Check closing date proximity
  if (deal.closingDate) {
    const daysUntilClosing = Math.floor(
      (new Date(deal.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilClosing <= 7 && missingItems.length > 0) {
      score -= 15;
      staleWarnings.push(
        `Closing in ${daysUntilClosing} days with ${missingItems.length} missing items`
      );
    }
  }

  score = Math.max(0, Math.min(100, score));

  const label: DealHealthSnapshot["label"] =
    score >= 80 ? "healthy" : score >= 50 ? "watch" : "at-risk";

  const parts: string[] = [];
  if (missingItems.length) parts.push(`${missingItems.length} missing items`);
  if (overdueTasks.length) parts.push(`${overdueTasks.length} overdue tasks`);
  if (staleWarnings.length) parts.push(`${staleWarnings.length} warnings`);

  const summary = parts.length ? parts.join(", ") : "Deal is on track";

  return { score, label, missingItems, overdueTasks, staleWarnings, summary };
}
